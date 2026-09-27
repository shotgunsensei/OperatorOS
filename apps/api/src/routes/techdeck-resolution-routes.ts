import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantMember, requireTenantModuleAccess, requireTenantModuleWriteAccess, type TenantContext } from '../lib/tenant-auth.js';
import { authenticateSharedApiToken } from '../lib/shared-platform-control-plane.js';
import { resolveTenantModuleAccess, tenantHasModuleEntitlement } from '../lib/tenant-entitlements.js';
import { checkPersistentAuthRateLimit } from '../lib/auth-request-limits.js';
import { importResolutionExport, parseResolutionInput, prepareResolutionImport, validateResolutionLinks, type ResolutionContext } from '../lib/techdeck-resolution-ingestion.js';
import { parseResolutionJson, ResolutionInputError } from '../lib/techdeck-resolution-validation.js';

const nativeBase = '/v1/modules/techdeck/resolution-intelligence';
const headlessBase = '/v1/headless/techdeck/resolution-intelligence';
const contexts = new WeakMap<FastifyRequest, ResolutionContext>();
const nativeGuards = [requireTenantMember, requireTenantModuleAccess('techdeck'), requireTenantModuleWriteAccess];

async function internalTechnician(context: ResolutionContext): Promise<void> {
  const tenant = await db.execute(sql`SELECT id FROM tenants WHERE id=${context.tenantId} AND status='active'`);
  if (!tenant.rows[0]) throw new ResolutionInputError('RESOLUTION_ACCESS_DENIED', 403);
  const portal = await db.execute(sql`SELECT id FROM techdeck_portal_assignments WHERE tenant_id=${context.tenantId} AND user_id=${context.actorUserId} AND revoked_at IS NULL LIMIT 1`);
  if (portal.rows[0]) throw new ResolutionInputError('RESOLUTION_INTERNAL_ACCESS_REQUIRED', 403);
}
async function nativeContext(request: FastifyRequest) {
  const tenant = (request as any).tenantContext as TenantContext;
  if (!tenant || !['member', 'admin', 'owner'].includes(tenant.role)) throw new ResolutionInputError('RESOLUTION_ACCESS_DENIED', 403);
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
      return reply.code(500).send({ error: 'Resolution evidence could not be saved', code: 'RESOLUTION_IMPORT_FAILED' });
    });
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
