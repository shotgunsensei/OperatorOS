import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantMember, requireTenantModuleAccess, requireTenantModuleWriteAccess, type TenantContext } from '../lib/tenant-auth.js';
import { authenticateSharedApiToken } from '../lib/shared-platform-control-plane.js';
import { resolveTenantModuleAccess, tenantHasModuleEntitlement } from '../lib/tenant-entitlements.js';
import { checkPersistentAuthRateLimit } from '../lib/auth-request-limits.js';
import { importResolutionExport, parseResolutionInput, prepareResolutionImport, validateResolutionLinks, type ResolutionContext } from '../lib/techdeck-resolution-ingestion.js';
import { parseResolutionJson, ResolutionInputError } from '../lib/techdeck-resolution-validation.js';
import { machineEvidenceExportSchema } from '../../../../packages/sdk/src/techdeck-resolution.js';
import { ticketCompletionPrompt, ticketCompletionShortcut, ticketCompletionPromptSha256, machineEvidenceTemplate } from '../generated/techdeck-resolution-contract.js';
import { listResolutionIncidents, resolutionSummary, resolutionDetail, resolutionSection, resolutionHistory, downloadResolutionRaw, updateResolutionIncident, searchResolutionIncidents, relatedResolutionIncidents, resolutionLinkOptions, resolutionFilters } from '../lib/techdeck-resolution-workspace.js';
import { previewResolutionDraft, createResolutionDraft, listResolutionDocuments, linkResolutionDocument } from '../lib/techdeck-resolution-documents.js';
import { semanticStatus, saveSemanticSettings, previewSemanticIndex, queueSemanticIndex, semanticIndexStatus } from '../lib/techdeck-resolution-embeddings.js';
import { researchStatus, saveResearchSettings, previewResearch, synthesizeResearch } from '../lib/techdeck-resolution-research.js';
import { authenticate } from '../lib/auth.js';

const nativeBase = '/v1/modules/techdeck/resolution-intelligence';
const headlessBase = '/v1/headless/techdeck/resolution-intelligence';
const contexts = new WeakMap<FastifyRequest, ResolutionContext>();
const nativeGuards = [requireTenantMember, requireTenantModuleAccess('techdeck'), requireTenantModuleWriteAccess];
const readGuards = [requireTenantMember, requireTenantModuleAccess('techdeck')];

async function internalTechnician(context: ResolutionContext): Promise<void> {
  const tenant = await db.execute(sql`SELECT id FROM tenants WHERE id=${context.tenantId} AND status='active'`);
  if (!tenant.rows[0]) throw new ResolutionInputError('RESOLUTION_ACCESS_DENIED', 403);
  const portal = await db.execute(sql`SELECT id FROM techdeck_portal_assignments WHERE tenant_id=${context.tenantId} AND user_id=${context.actorUserId} AND revoked_at IS NULL LIMIT 1`);
  if (portal.rows[0]) throw new ResolutionInputError('RESOLUTION_INTERNAL_ACCESS_REQUIRED', 403);
}
async function nativeContext(request: FastifyRequest) {
  const tenant = (request as any).tenantContext as TenantContext;
  if (!tenant || !['viewer', 'member', 'admin', 'owner'].includes(tenant.role)) throw new ResolutionInputError('RESOLUTION_ACCESS_DENIED', 403);
  const module = await db.execute(sql`SELECT id FROM modules WHERE slug='techdeck'`);
  if (!module.rows[0]) throw new ResolutionInputError('RESOLUTION_ACCESS_DENIED', 403);
  const context: ResolutionContext = { tenantId: tenant.tenantId, moduleId: String(module.rows[0].id), actorUserId: String((request as any).user.id), role: tenant.role as ResolutionContext['role'], correlationId: request.id };
  await internalTechnician(context); contexts.set(request, context);
}
async function headlessContext(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? await authenticateSharedApiToken({ rawToken: authorization.slice(7), requiredScope: 'techdeck:resolution:import' }) : null;
  if (!token) throw new ResolutionInputError('RESOLUTION_API_TOKEN_INVALID', 401);
  const rows = await db.execute(sql`SELECT token.created_by_user_id,member.role,module.id AS module_id FROM shared_api_tokens token
    JOIN shared_service_identities identity ON identity.tenant_id=token.tenant_id AND identity.id=token.service_identity_id
    JOIN modules module ON module.id=identity.module_id AND module.slug='techdeck'
    JOIN tenant_users member ON member.tenant_id=token.tenant_id AND member.user_id=token.created_by_user_id
    WHERE token.id=${token.tokenId} AND token.tenant_id=${token.tenantId}`);
  const row = rows.rows[0];
  if (!row || token.moduleId !== row.module_id || !['member', 'admin', 'owner'].includes(String(row.role)) || (request.headers['x-tenant-id'] && request.headers['x-tenant-id'] !== token.tenantId)) throw new ResolutionInputError('RESOLUTION_API_TOKEN_INVALID', 401);
  // Narrow service permission never bypasses current creator, tenant, entitlement or module controls.
  const decision = await resolveTenantModuleAccess(String(row.created_by_user_id), token.tenantId, String(row.module_id));
  if (!decision.hasAccess || !['user', 'manager'].includes(decision.accessLevel) || !(await tenantHasModuleEntitlement(token.tenantId, String(row.module_id)))) throw new ResolutionInputError('RESOLUTION_ACCESS_DENIED', 403);
  const context: ResolutionContext = { tenantId: token.tenantId, moduleId: String(row.module_id), actorUserId: String(row.created_by_user_id), role: 'member', tokenId: token.tokenId, correlationId: request.id };
  await internalTechnician(context); contexts.set(request, context);
}
async function limit(request: FastifyRequest, reply: FastifyReply) {
  const context = contexts.get(request)!;
  const actor = context.tokenId ?? context.actorUserId;
  if (!(await checkPersistentAuthRateLimit(`techdeck-resolution:tenant:${context.tenantId}`, 120, 60_000)) || !(await checkPersistentAuthRateLimit(`techdeck-resolution:actor:${context.tenantId}:${actor}`, 30, 60_000))) {
    reply.header('Retry-After', '60'); throw new ResolutionInputError('RESOLUTION_RATE_LIMIT', 429);
  }
}

export async function registerTechDeckResolutionRoutes(parent: FastifyInstance) {
  await parent.register(async app => {
    app.addHook('onSend', async (_request, reply, payload) => { reply.header('Cache-Control', 'no-store'); reply.header('X-Content-Type-Options', 'nosniff'); return payload; });
    // Scope the strict buffer parser and safe errors to these intake endpoints only.
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 4 * 1_048_576 }, (_request, body, done) => {
      try { done(null, parseResolutionJson(new TextDecoder('utf-8', { fatal: true }).decode(body as Buffer), true)); }
      catch (error) { done(error instanceof ResolutionInputError ? error : new ResolutionInputError('RESOLUTION_JSON_INVALID', 400)); }
    });
    app.setErrorHandler((error, request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (error instanceof ResolutionInputError) return reply.code(error.statusCode).send({ error: 'Resolution evidence request rejected', code: error.code, issues: error.issues });
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 413) return reply.code(413).send({ error: 'Resolution request too large', code: 'RESOLUTION_TOO_LARGE' });
      if (statusCode === 415) return reply.code(415).send({ error: 'JSON content type required', code: 'RESOLUTION_CONTENT_TYPE_REQUIRED' });
      // SQL errors may contain source values; never pass the error object to the logger or caller.
      request.log.error({ code: 'RESOLUTION_IMPORT_FAILED', requestId: request.id }, 'Resolution evidence request failed');
      return reply.code(500).send({ error: 'Resolution request could not be completed', code: 'RESOLUTION_REQUEST_FAILED' });
    });
    const reads = { onRequest: [...readGuards, nativeContext] };
    const writes = { onRequest: [...nativeGuards, nativeContext, limit] };
    app.get(`${nativeBase}/research`, reads, request => researchStatus(contexts.get(request)!));
    app.put(`${nativeBase}/research`, writes, request => saveResearchSettings(contexts.get(request)!, request.body));
    app.post(`${nativeBase}/research/preview`, writes, request => previewResearch(contexts.get(request)!, request.body));
    app.post(`${nativeBase}/research/synthesize`, writes, async (request, reply) => {
      const result = await synthesizeResearch(contexts.get(request)!, request.body);
      // Account-version checks in the service also protect background callers;
      // the HTTP boundary revalidates this exact session's expiry/logout too.
      await authenticate(request, reply);
      return reply.sent ? reply : result;
    });
    app.get(`${nativeBase}/semantic`, reads, request => semanticStatus(contexts.get(request)!));
    app.put(`${nativeBase}/semantic`, writes, request => saveSemanticSettings(contexts.get(request)!, request.body));
    app.get(`${nativeBase}/incidents/:id/semantic`, reads, request => semanticIndexStatus(contexts.get(request)!, (request.params as { id: string }).id));
    app.post(`${nativeBase}/incidents/:id/semantic/preview`, writes, request => previewSemanticIndex(contexts.get(request)!, (request.params as { id: string }).id, request.body));
    app.post(`${nativeBase}/incidents/:id/semantic/index`, writes, request => queueSemanticIndex(contexts.get(request)!, (request.params as { id: string }).id, request.body));
    app.get(`${nativeBase}/documents`, reads, request => listResolutionDocuments(contexts.get(request)!, request.query as Record<string, unknown>));
    app.post(`${nativeBase}/incidents/:id/document-links`, writes, request => linkResolutionDocument(contexts.get(request)!, (request.params as { id: string }).id, request.body));
    app.post(`${nativeBase}/incidents/:id/document-drafts/preview`, writes, request => previewResolutionDraft(contexts.get(request)!, (request.params as { id: string }).id, request.body));
    app.post(`${nativeBase}/incidents/:id/document-drafts`, writes, async (request, reply) => {
      const result = await createResolutionDraft(contexts.get(request)!, (request.params as { id: string }).id, request.body, String(request.headers['idempotency-key'] ?? ''));
      return reply.code('replayed' in result || 'existing' in result && result.existing ? 200 : 201).send(result);
    });
    app.get(`${nativeBase}/capabilities`, reads, async request => ({
      canWrite: contexts.get(request)!.role !== 'viewer' && ['user', 'manager'].includes((request as any).tenantModuleAccessLevel),
      canManage: ['admin', 'owner'].includes(contexts.get(request)!.role) && ['user', 'manager'].includes((request as any).tenantModuleAccessLevel),
      canDownloadRaw: ['admin', 'owner'].includes(contexts.get(request)!.role),
      canSetOwnerVisibility: contexts.get(request)!.role === 'owner',
    }));
    for (const asset of ['prompt', 'shortcut', 'template', 'schema'] as const) app.get(`${nativeBase}/${asset}`, reads, async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      if (Object.keys(query).some(key => !['version', 'download'].includes(key)) || query.version !== undefined && query.version !== '1.0' || query.download !== undefined && query.download !== '1') throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
      const content = asset === 'prompt' ? ticketCompletionPrompt : asset === 'shortcut' ? ticketCompletionShortcut : JSON.stringify(asset === 'template' ? machineEvidenceTemplate : machineEvidenceExportSchema, null, 2) + '\n';
      reply.header('X-Resolution-Schema-Version', '1.0').header('X-Resolution-Prompt-Sha256', ticketCompletionPromptSha256);
      if (query.download === '1') reply.header('Content-Disposition', `attachment; filename="techdeck-resolution-${asset}.${asset === 'prompt' || asset === 'shortcut' ? 'txt' : 'json'}"`);
      return reply.type(asset === 'prompt' || asset === 'shortcut' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8').send(content);
    });
    app.get(`${nativeBase}/incidents`, reads, request => listResolutionIncidents(contexts.get(request)!, resolutionFilters(request.query)));
    app.get(`${nativeBase}/summary`, reads, request => resolutionSummary(contexts.get(request)!, resolutionFilters(request.query)));
    app.get(`${nativeBase}/link-options`, reads, request => resolutionLinkOptions(contexts.get(request)!, request.query as Record<string, unknown>));
    app.get(`${nativeBase}/search`, { onRequest: [...readGuards, nativeContext, limit] }, request => searchResolutionIncidents(contexts.get(request)!, request.query as Record<string, unknown>));
    app.post(`${nativeBase}/search`, writes, request => {
      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
      return searchResolutionIncidents(contexts.get(request)!, request.body as Record<string, unknown>, true);
    });
    app.get(`${nativeBase}/incidents/:id`, reads, request => resolutionDetail(contexts.get(request)!, (request.params as { id: string }).id));
    app.get(`${nativeBase}/incidents/:id/sections/:section`, reads, request => {
      const { id, section } = request.params as { id: string; section: string };
      return resolutionSection(contexts.get(request)!, id, section, resolutionFilters(request.query));
    });
    app.get(`${nativeBase}/incidents/:id/history`, reads, request => resolutionHistory(contexts.get(request)!, (request.params as { id: string }).id, resolutionFilters(request.query)));
    app.get(`${nativeBase}/incidents/:id/related`, reads, request => relatedResolutionIncidents(contexts.get(request)!, (request.params as { id: string }).id));
    app.get(`${nativeBase}/incidents/:id/raw/:revision`, reads, async (request, reply) => {
      const { id, revision } = request.params as { id: string; revision: string };
      const source = await downloadResolutionRaw(contexts.get(request)!, id, /^\d+$/.test(revision) ? Number(revision) : NaN);
      return reply.header('Content-Disposition', `attachment; filename="resolution-${id}-revision-${revision}.json"`).type('application/json; charset=utf-8').send(source);
    });
    app.patch(`${nativeBase}/incidents/:id`, writes, request => updateResolutionIncident(contexts.get(request)!, (request.params as { id: string }).id, request.body));
    app.post(`${nativeBase}/incidents/:id/archive`, writes, request => updateResolutionIncident(contexts.get(request)!, (request.params as { id: string }).id, request.body, true));
    for (const [base, guards] of [[nativeBase, [...nativeGuards, nativeContext, limit]], [headlessBase, [headlessContext, limit]]] as const) {
      // Authorize before parsing potentially sensitive/expensive source text.
      app.post(`${base}/exports/validate`, { onRequest: [...guards], bodyLimit: 4 * 1_048_576 }, async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const input = parseResolutionInput(request.body), prepared = prepareResolutionImport(input);
        await validateResolutionLinks(contexts.get(request)!, input.links);
        return { valid: true, warnings: prepared.warnings, counts: prepared.counts, relationshipCount: prepared.counts.relationships ?? 0, embeddingState: 'not_enabled' };
      });
      app.post(`${base}/exports`, { onRequest: [...guards], bodyLimit: 4 * 1_048_576 }, async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const result = await importResolutionExport(contexts.get(request)!, parseResolutionInput(request.body), String(request.headers['idempotency-key'] ?? ''));
        return reply.code('replayed' in result || result.status === 'duplicate' ? 200 : 201).send(result);
      });
    }
    app.post(`${nativeBase}/incidents/:id/reprocess`, { onRequest: [...nativeGuards, nativeContext, limit], bodyLimit: 4 * 1_048_576 }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const { id } = request.params as { id: string };
      if (!/^[a-zA-Z0-9_-]{1,36}$/.test(id)) throw new ResolutionInputError('RESOLUTION_NOT_FOUND', 404);
      const input = parseResolutionInput(request.body, true);
      const result = await importResolutionExport(contexts.get(request)!, input, String(request.headers['idempotency-key'] ?? ''), { incidentId: id, expectedVersion: input.expectedVersion! });
      return reply.code('replayed' in result || result.status === 'duplicate' ? 200 : 201).send(result);
    });
  });
}
