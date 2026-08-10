import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantAdmin, requireTenantRole } from '../lib/tenant-auth.js';
import { writeAudit } from '../lib/audit.js';
import {
  consumeAttachmentDownloadGrant,
  createAttachmentDownloadGrant,
  createServiceIdentityAndToken,
  getSharedPlatformOverview,
  listSharedPlatformOperations,
  retryDeadLetter,
  revokeApiToken,
  saveProviderConfiguration,
  searchSharedDocuments,
  listSharedFeatureFlags,
  setSharedFeatureFlag,
} from '../lib/shared-platform-control-plane.js';
import { createOutboundWebhookEndpoint, listOutboundWebhookEndpoints } from '../lib/shared-outbound-webhooks.js';
import { requestSharedExport } from '../lib/shared-schedules-exports.js';
import { resolveLegacyReference } from '../lib/shared-compatibility-adapters.js';

function actor(request: any): { tenantId: string; actorUserId: string } {
  return { tenantId: String(request.params.tenantId), actorUserId: String(request.user.id) };
}

function sendError(reply: any, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as any).code) : 'SHARED_PLATFORM_ERROR';
  const status = code.endsWith('_NOT_FOUND') ? 404
    : code.includes('CONFLICT') ? 409
      : code.includes('UNAVAILABLE') ? 503
        : code.includes('INVALID') || code.includes('UNSAFE') || code.includes('SSRF') ? 422
          : 400;
  return reply.code(status).send({ error: error instanceof Error ? error.message : 'Shared platform operation failed', code });
}

async function moduleId(tenantId: string, slug: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT module.id FROM modules module
    JOIN tenant_modules access ON access.module_id = module.id AND access.tenant_id = ${tenantId}
    WHERE module.slug = ${slug} AND access.status = 'enabled' LIMIT 1
  `);
  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

export async function registerSharedPlatformRoutes(app: FastifyInstance): Promise<void> {
  const tenantMember = requireTenantRole('member');

  app.get('/v1/tenants/:tenantId/shared-platform/overview', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    try { return reply.send(await getSharedPlatformOverview(String((request.params as any).tenantId))); }
    catch (error) { return sendError(reply, error); }
  });

  app.get('/v1/tenants/:tenantId/shared-platform/operations', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const query = request.query as { limit?: string };
    try {
      return reply.send(await listSharedPlatformOperations({
        tenantId: String((request.params as any).tenantId), limit: Number(query.limit || 50),
      }));
    } catch (error) { return sendError(reply, error); }
  });

  app.put('/v1/tenants/:tenantId/shared-platform/providers/:providerKey', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const { tenantId, actorUserId } = actor(request);
    try {
      const provider = await saveProviderConfiguration({
        tenantId,
        moduleId: body.moduleId || null,
        actorUserId,
        providerKey: String((request.params as any).providerKey),
        kind: body.kind,
        mode: body.mode,
        publicConfig: body.publicConfig,
        secretReference: body.secretReference,
        callbackReady: body.callbackReady,
        expectedVersion: Number.isInteger(body.expectedVersion) ? body.expectedVersion : null,
      });
      await writeAudit({
        actorUserId, tenantId, targetType: 'shared_provider_config', targetId: provider.id,
        action: 'shared_provider_config_saved',
        after: { providerKey: provider.providerKey, kind: provider.kind, mode: provider.mode, state: provider.state, version: provider.version, hasSecretReference: provider.hasSecretReference },
      }, request);
      return reply.send({ provider });
    } catch (error) { return sendError(reply, error); }
  });

  app.get('/v1/tenants/:tenantId/shared-platform/feature-flags', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    try { return reply.send({ flags: await listSharedFeatureFlags({ tenantId: String((request.params as any).tenantId) }) }); }
    catch (error) { return sendError(reply, error); }
  });

  app.put('/v1/tenants/:tenantId/shared-platform/feature-flags/:flagKey', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const { tenantId, actorUserId } = actor(request);
    try {
      const resolvedModuleId = body.moduleSlug ? await moduleId(tenantId, String(body.moduleSlug)) : null;
      if (body.moduleSlug && !resolvedModuleId) return reply.code(404).send({ error: 'Enabled module not found', code: 'MODULE_NOT_FOUND' });
      const flag = await setSharedFeatureFlag({
        tenantId, moduleId: resolvedModuleId, flagKey: String((request.params as any).flagKey),
        enabled: body.enabled === true, value: body.value, actorUserId,
        expectedVersion: Number.isInteger(body.expectedVersion) ? body.expectedVersion : null,
      });
      await writeAudit({
        actorUserId, tenantId, targetType: 'shared_feature_flag', targetId: String((flag as any).id),
        action: 'shared_feature_flag_saved', after: { flagKey: (flag as any).flag_key, enabled: (flag as any).enabled, version: (flag as any).version, moduleId: (flag as any).module_id },
      }, request);
      return reply.send({ flag });
    } catch (error) { return sendError(reply, error); }
  });

  app.get('/v1/tenants/:tenantId/shared-platform/webhook-endpoints', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    try { return reply.send({ endpoints: await listOutboundWebhookEndpoints({ tenantId: String((request.params as any).tenantId) }) }); }
    catch (error) { return sendError(reply, error); }
  });

  app.post('/v1/tenants/:tenantId/shared-platform/webhook-endpoints', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const { tenantId, actorUserId } = actor(request);
    try {
      const id = await moduleId(tenantId, String(body.moduleSlug || ''));
      if (!id) return reply.code(404).send({ error: 'Enabled module not found', code: 'MODULE_NOT_FOUND' });
      const endpoint = await createOutboundWebhookEndpoint({
        tenantId, moduleId: id, actorUserId, name: String(body.name || ''),
        endpointUrl: String(body.endpointUrl || ''), signingSecret: String(body.signingSecret || ''),
        eventTypes: Array.isArray(body.eventTypes) ? body.eventTypes.map(String) : [],
      });
      await writeAudit({
        actorUserId, tenantId, targetType: 'shared_webhook_endpoint', targetId: String((endpoint as any).id),
        action: 'shared_webhook_endpoint_created',
        after: { moduleId: id, name: (endpoint as any).name, endpointUrl: (endpoint as any).endpoint_url, eventTypes: (endpoint as any).event_types_json },
      }, request);
      return reply.code(201).send({ endpoint });
    } catch (error) { return sendError(reply, error); }
  });

  app.post('/v1/tenants/:tenantId/shared-platform/dead-letters/:kind/:id/retry', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const params = request.params as any;
    const { tenantId, actorUserId } = actor(request);
    if (!['job', 'webhook', 'outbox'].includes(params.kind)) return reply.code(400).send({ error: 'Unknown queue kind', code: 'QUEUE_KIND_INVALID' });
    try {
      const retried = await retryDeadLetter({ tenantId, kind: params.kind, id: String(params.id) });
      if (!retried) return reply.code(404).send({ error: 'Dead-letter item not found', code: 'DEAD_LETTER_NOT_FOUND' });
      await writeAudit({ actorUserId, tenantId, targetType: `shared_${params.kind}`, targetId: String(params.id), action: 'shared_dead_letter_retried' }, request);
      return reply.send({ item: retried });
    } catch (error) { return sendError(reply, error); }
  });

  app.post('/v1/tenants/:tenantId/shared-platform/service-identities', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const { tenantId, actorUserId } = actor(request);
    try {
      const created = await createServiceIdentityAndToken({
        tenantId, actorUserId, moduleId: body.moduleId || null,
        identityName: String(body.identityName || ''), tokenName: String(body.tokenName || ''),
        description: body.description ? String(body.description) : null,
        scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
        expiresAt: body.expiresAt && !Number.isNaN(Date.parse(body.expiresAt)) ? new Date(body.expiresAt) : null,
      });
      await writeAudit({
        actorUserId, tenantId, targetType: 'shared_service_identity', targetId: String((created.identity as any).id),
        action: 'shared_api_token_created',
        after: { tokenId: (created.token as any).id, prefix: (created.token as any).token_prefix, scopes: (created.token as any).scopes_json },
      }, request);
      return reply.code(201).send(created);
    } catch (error) { return sendError(reply, error); }
  });

  app.delete('/v1/tenants/:tenantId/shared-platform/api-tokens/:tokenId', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const { tenantId, actorUserId } = actor(request);
    const tokenId = String((request.params as any).tokenId);
    try {
      const revoked = await revokeApiToken({ tenantId, tokenId });
      if (!revoked) return reply.code(404).send({ error: 'API token not found', code: 'API_TOKEN_NOT_FOUND' });
      await writeAudit({ actorUserId, tenantId, targetType: 'shared_api_token', targetId: tokenId, action: 'shared_api_token_revoked' }, request);
      return reply.send({ token: revoked });
    } catch (error) { return sendError(reply, error); }
  });

  app.post('/v1/tenants/:tenantId/shared-platform/exports', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const { tenantId, actorUserId } = actor(request);
    const key = String(request.headers['idempotency-key'] || '');
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    try {
      const id = await moduleId(tenantId, String(body.moduleSlug || ''));
      if (!id) return reply.code(404).send({ error: 'Enabled module not found', code: 'MODULE_NOT_FOUND' });
      const result = await requestSharedExport({
        tenantId, moduleId: id, requestedByUserId: actorUserId,
        exportType: String(body.exportType || ''), format: body.format === 'csv' ? 'csv' : 'json',
        filters: body.filters, idempotencyKey: key, correlationId: request.id,
      });
      await writeAudit({
        actorUserId, tenantId, targetType: 'shared_export', targetId: String((result.export as any).id),
        action: 'shared_export_requested', after: { exportType: (result.export as any).export_type, format: (result.export as any).format, duplicate: result.duplicate },
      }, request);
      return reply.code(result.duplicate ? 200 : 202).send(result);
    } catch (error) { return sendError(reply, error); }
  });

  app.post('/v1/tenants/:tenantId/shared-platform/attachments/:attachmentId/download-grant', { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const { tenantId, actorUserId } = actor(request);
    try {
      const id = await moduleId(tenantId, String(body.moduleSlug || ''));
      if (!id) return reply.code(404).send({ error: 'Enabled module not found', code: 'MODULE_NOT_FOUND' });
      const grant = await createAttachmentDownloadGrant({
        tenantId, moduleId: id, attachmentId: String((request.params as any).attachmentId),
        actorUserId, ttlSeconds: Number(body.ttlSeconds || 300), maxUses: Number(body.maxUses || 1),
      });
      await writeAudit({ actorUserId, tenantId, targetType: 'shared_download_grant', targetId: String((grant as any).id), action: 'shared_download_grant_created', after: { attachmentId: (request.params as any).attachmentId, expiresAt: (grant as any).expires_at, maxUses: (grant as any).max_uses } }, request);
      return reply.code(201).send({ grant: { token: grant.token, expiresAt: (grant as any).expires_at, maxUses: (grant as any).max_uses } });
    } catch (error) { return sendError(reply, error); }
  });

  app.get('/v1/shared-downloads/:token', async (request, reply) => {
    try {
      const result = await consumeAttachmentDownloadGrant(String((request.params as any).token));
      if (!result) return reply.code(404).send({ error: 'Download grant not found or expired', code: 'DOWNLOAD_GRANT_NOT_FOUND' });
      const name = encodeURIComponent(String(result.metadata.original_name));
      return reply.header('content-type', String(result.metadata.detected_mime_type))
        .header('content-length', String(result.content.length))
        .header('content-disposition', `attachment; filename*=UTF-8''${name}`)
        .header('cache-control', 'private, no-store').send(result.content);
    } catch (error) { return sendError(reply, error); }
  });

  app.get('/v1/tenants/:tenantId/shared-platform/search', { preHandler: [tenantMember] }, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    try { return reply.send({ results: await searchSharedDocuments({ tenantId: String((request.params as any).tenantId), query: String(query.q || ''), limit: Number(query.limit || 20) }) }); }
    catch (error) { return sendError(reply, error); }
  });

  app.get('/v1/tenants/:tenantId/shared-platform/legacy-reference', { preHandler: [tenantMember] }, async (request, reply) => {
    const query = request.query as any;
    try {
      const id = await moduleId(String((request.params as any).tenantId), String(query.moduleSlug || ''));
      if (!id) return reply.code(404).send({ error: 'Enabled module not found', code: 'MODULE_NOT_FOUND' });
      const reference = await resolveLegacyReference({
        tenantId: String((request.params as any).tenantId), moduleId: id,
        sourceSystem: String(query.sourceSystem || ''), sourceType: String(query.sourceType || ''), sourceId: String(query.sourceId || ''),
      });
      if (!reference) return reply.code(404).send({ error: 'Reference not found', code: 'LEGACY_REFERENCE_NOT_FOUND' });
      return reply.send({ reference });
    } catch (error) { return sendError(reply, error); }
  });
}
