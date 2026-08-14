import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantMember, requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import { storeEncryptedSecretReference, resolveEncryptedSecretReference } from '../lib/shared-secret-vault.js';
import { enqueueSharedJob, registerSharedJobHandler } from '../lib/shared-background-jobs.js';
import { saveProviderConfiguration } from '../lib/shared-platform-control-plane.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('pulsedesk')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const PROVIDERS = new Set(['sendgrid', 'imap', 'google', 'microsoft']);
const PHI = /\b(?:patient|diagnosis|medical record|mrn|date of birth|dob|ssn|prescription)\b/i;
const POLL_HANDLER = 'pulsedesk.connector.poll.v1';

type Context = { tenantId: string; role: 'owner' | 'admin' | 'member'; viaPlatformRole: boolean };
const tenant = (request: FastifyRequest) => ((request as any).tenantContext as Context).tenantId;
const actor = (request: FastifyRequest) => String((request as any).user.id);
async function manager(request: FastifyRequest, reply: FastifyReply) {
  const ctx = (request as any).tenantContext as Context;
  const access = String((request as any).tenantModuleAccessLevel ?? '');
  if (ctx.viaPlatformRole || ctx.role === 'owner' || ctx.role === 'admin' || access === 'manager') return;
  return reply.code(403).send({ error: 'PulseDesk manager access is required', code: 'PULSEDESK_MANAGER_REQUIRED' });
}
const bounded = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const hash = (value: string) => createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
const publicId = () => randomBytes(18).toString('hex');
function safeSummary(value: unknown) {
  const summary = bounded(value, 160);
  if (summary.length < 5 || PHI.test(summary)) throw Object.assign(new Error('Use a PHI-minimized operational summary'), { code: 'PULSEDESK_SENSITIVE_CONTENT_REJECTED' });
  return summary;
}
async function connectorById(tenantId: string, id: string) {
  const result = await db.execute(sql`SELECT * FROM pulsedesk_mail_connectors WHERE tenant_id=${tenantId} AND id=${id} AND revoked_at IS NULL LIMIT 1`);
  return result.rows[0] as any;
}
async function connectorByAlias(provider: string, alias: string) {
  const result = await db.execute(sql`SELECT * FROM pulsedesk_mail_connectors WHERE provider=${provider} AND inbound_alias=${alias} AND revoked_at IS NULL LIMIT 1`);
  return result.rows[0] as any;
}
async function event(tenantId: string, connectorId: string, type: string, userId: string | null, metadata: Record<string, unknown> = {}, errorCode: string | null = null) {
  await db.execute(sql`INSERT INTO pulsedesk_connector_events (tenant_id,connector_id,event_type,actor_user_id,safe_metadata,error_code) VALUES (${tenantId},${connectorId},${type},${userId},${metadata},${errorCode})`);
}
async function createTicket(input: { tenantId: string; userId: string; summary: string; category?: string; priority?: string; location?: string | null }) {
  const category = !input.category || input.category === 'general' ? 'other' : input.category;
  return db.transaction(async tx => {
    const allocation = await tx.execute(sql`
      INSERT INTO pulsedesk_request_sequences (tenant_id,last_number,updated_at) VALUES (${input.tenantId},1,NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET last_number=pulsedesk_request_sequences.last_number+1,updated_at=NOW()
      RETURNING last_number
    `);
    const number = Number((allocation.rows[0] as any).last_number);
    const result = await tx.execute(sql`
      INSERT INTO pulsedesk_requests (tenant_id,number,created_by_user_id,summary,location_label,category,priority,status,is_patient_impacting,version)
      VALUES (${input.tenantId},${number},${input.userId},${input.summary},${input.location ?? null},${category},${input.priority ?? 'normal'},'new',FALSE,1)
      RETURNING id,number,status,summary,priority,created_at
    `);
    return result.rows[0] as any;
  });
}

function canonicalInbound(body: any) {
  return [
    bounded(body.messageId, 512),
    bounded(body.from, 254).toLowerCase(),
    bounded(body.subject, 160),
    String(Math.min(20, Math.max(0, Number(body.attachmentCount) || 0))),
    body.attachmentsClean === true ? 'clean' : 'unverified',
  ].join('\n');
}

function validSignature(secret: string, body: any, supplied: unknown) {
  const expected = createHmac('sha256', secret).update(canonicalInbound(body)).digest();
  const normalized = bounded(supplied, 256).replace(/^sha256=/i, '');
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
  const actual = Buffer.from(normalized, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function ingestMessage(input: { connector: any; body: any; eventUserId: string | null }) {
  const { connector, body, eventUserId } = input;
  const tenantId = String(connector.tenant_id);
  const messageId = bounded(body.messageId, 512);
  const summary = safeSummary(body.subject);
  if (messageId.length < 3) return { statusCode: 400, payload: { error: 'messageId is required', code: 'PULSEDESK_MESSAGE_INVALID' } };
  const attachmentCount = Math.min(20, Math.max(0, Number(body.attachmentCount) || 0));
  const scanClean = attachmentCount === 0 || body.attachmentsClean === true;
  const claimed = await db.execute(sql`
    INSERT INTO pulsedesk_inbound_messages
      (tenant_id,connector_id,provider,message_id,sender_hash,subject_summary,attachment_count,scan_status,status,safe_metadata)
    VALUES
      (${tenantId},${connector.id},${connector.provider},${messageId},${hash(bounded(body.from,254)||'unknown')},${summary},${attachmentCount},${scanClean ? 'clean' : 'rejected'},${scanClean ? 'accepted' : 'rejected'},${{ adapter: connector.mode === 'test' ? 'deterministic' : 'authenticated-provider' }})
    ON CONFLICT (tenant_id,provider,message_id) DO NOTHING
    RETURNING id
  `);
  if (!claimed.rows[0]) {
    const existing = await db.execute(sql`SELECT ticket_id,status FROM pulsedesk_inbound_messages WHERE tenant_id=${tenantId} AND provider=${connector.provider} AND message_id=${messageId} LIMIT 1`);
    await event(tenantId, connector.id, 'duplicate', eventUserId, { provider: connector.provider });
    return { statusCode: 200, payload: { duplicate: true, ticketId: (existing.rows[0] as any)?.ticket_id ?? null, status: (existing.rows[0] as any)?.status ?? 'duplicate' } };
  }
  if (!scanClean) {
    await event(tenantId, connector.id, 'failed', eventUserId, { provider: connector.provider, attachmentCount }, 'ATTACHMENT_SCAN_REJECTED');
    return { statusCode: 422, payload: { error: 'Attachments must pass scanning before ticket creation', code: 'PULSEDESK_ATTACHMENT_SCAN_REJECTED', quarantined: true } };
  }
  const ticket = await createTicket({ tenantId, userId: String(connector.created_by_user_id), summary, category: 'general', priority: bounded(body.priority,20)||'normal' });
  await db.execute(sql`UPDATE pulsedesk_inbound_messages SET status='processed',ticket_id=${ticket.id},processed_at=NOW() WHERE id=${(claimed.rows[0] as any).id}`);
  await event(tenantId, connector.id, 'ingested', eventUserId, { provider: connector.provider, ticketId: ticket.id });
  return { statusCode: 201, payload: { duplicate: false, ticket } };
}

registerSharedJobHandler(POLL_HANDLER, async context => {
  const connector = await connectorById(context.tenantId, String(context.payload.connectorId ?? ''));
  if (!connector) return;
  if (connector.mode !== 'test') {
    await db.execute(sql`UPDATE pulsedesk_mail_connectors SET status='degraded',last_error_code='LIVE_PROVIDER_POLL_UNAVAILABLE',consecutive_failures=consecutive_failures+1,last_polled_at=NOW(),updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${connector.id}`);
    await event(context.tenantId, connector.id, 'failed', context.requestedByUserId, { provider: connector.provider }, 'LIVE_PROVIDER_POLL_UNAVAILABLE');
    return;
  }
  await db.execute(sql`UPDATE pulsedesk_mail_connectors SET status='active',last_error_code=NULL,consecutive_failures=0,last_polled_at=NOW(),last_success_at=NOW(),updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${connector.id}`);
  await event(context.tenantId, connector.id, 'tested', context.requestedByUserId, { adapter: 'deterministic', provider: connector.provider });
});

export async function registerPulseDeskLiteralRoutes(app: FastifyInstance) {
  app.get('/v1/modules/pulsedesk/connectors', { preHandler: readGuards }, async request => {
    const result = await db.execute(sql`SELECT id,provider,label,inbound_alias,mailbox_address,mode,status,public_config,last_polled_at,last_success_at,last_error_code,consecutive_failures,version,created_at,updated_at FROM pulsedesk_mail_connectors WHERE tenant_id=${tenant(request)} AND revoked_at IS NULL ORDER BY created_at DESC`);
    return { connectors: result.rows };
  });
  app.post('/v1/modules/pulsedesk/connectors', { preHandler: [...writeGuards, manager] }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const provider = bounded(body.provider, 20);
    const mode = (bounded(body.mode, 20) || 'disabled') as 'disabled' | 'test' | 'live';
    if (!PROVIDERS.has(provider) || !['disabled','test','live'].includes(mode)) return reply.code(400).send({ error: 'Invalid connector provider or mode', code: 'PULSEDESK_CONNECTOR_INVALID' });
    const label = bounded(body.label, 120);
    if (label.length < 2) return reply.code(400).send({ error: 'Connector label is required', code: 'PULSEDESK_CONNECTOR_INVALID' });
    let secretId: string | null = null;
    if (bounded(body.secretReference, 2000)) {
      const secret = await storeEncryptedSecretReference({ tenantId: tenant(request), purpose: `pulsedesk:${provider}:connector`, reference: bounded(body.secretReference, 2000), actorUserId: actor(request) });
      secretId = String((secret as any).id);
    }
    const status = mode === 'disabled' ? 'disabled' : mode === 'test' ? 'active' : secretId ? 'pending' : 'degraded';
    const config = await saveProviderConfiguration({ tenantId: tenant(request), actorUserId: actor(request), providerKey: `pulsedesk.${provider}`, kind: provider === 'sendgrid' ? 'webhook' : provider === 'imap' ? 'email' : 'oauth', mode, publicConfig: body.publicConfig ?? {}, secretReference: bounded(body.secretReference, 2000) || null, callbackReady: body.callbackReady === true });
    const result = await db.execute(sql`INSERT INTO pulsedesk_mail_connectors (tenant_id,provider,label,inbound_alias,mailbox_address,mode,status,public_config,secret_reference_id,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${provider},${label},${publicId()},${bounded(body.mailboxAddress,254) || null},${mode},${status},${{ ...(body.publicConfig ?? {}), sharedProviderConfigId: (config as any).id }},${secretId},${actor(request)},${actor(request)}) RETURNING id,provider,label,inbound_alias,mailbox_address,mode,status,version`);
    const row = result.rows[0] as any; await event(tenant(request), row.id, 'configured', actor(request), { provider, mode, hasSecretReference: Boolean(secretId) });
    return reply.code(201).send(row);
  });
  app.get('/v1/modules/pulsedesk/connectors/:id/events', { preHandler: readGuards }, async request => {
    const result = await db.execute(sql`SELECT id,event_type,safe_metadata,error_code,created_at FROM pulsedesk_connector_events WHERE tenant_id=${tenant(request)} AND connector_id=${(request.params as any).id} ORDER BY created_at DESC LIMIT 100`); return { events: result.rows };
  });
  app.post('/v1/modules/pulsedesk/connectors/:id/oauth/start', { preHandler: [...writeGuards, manager] }, async (request, reply) => {
    const connector = await connectorById(tenant(request), (request.params as any).id); if (!connector) return reply.code(404).send({ error: 'Connector not found', code: 'PULSEDESK_CONNECTOR_NOT_FOUND' });
    if (!['google','microsoft'].includes(connector.provider)) return reply.code(409).send({ error: 'OAuth is not supported for this connector', code: 'PULSEDESK_OAUTH_UNSUPPORTED' });
    const state = randomBytes(32).toString('base64url'); await db.execute(sql`UPDATE pulsedesk_mail_connectors SET oauth_state_hash=${hash(state)},oauth_state_expires_at=NOW()+INTERVAL '10 minutes',updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${connector.id}`); await event(tenant(request), connector.id, 'oauth_started', actor(request), { provider: connector.provider });
    if (connector.mode !== 'test') return reply.code(503).send({ error: 'Live OAuth authorization is unavailable until the provider application and callback are verified', code: 'PULSEDESK_LIVE_OAUTH_UNAVAILABLE', stateIssued: true });
    return { state, callbackPath: `/v1/modules/pulsedesk/connectors/${connector.id}/oauth/callback` };
  });
  app.post('/v1/modules/pulsedesk/connectors/:id/oauth/callback', { preHandler: [...writeGuards, manager] }, async (request, reply) => {
    const connector = await connectorById(tenant(request), (request.params as any).id); const body = (request.body ?? {}) as any; if (!connector) return reply.code(404).send({ error: 'Connector not found', code: 'PULSEDESK_CONNECTOR_NOT_FOUND' });
    const stateHash = hash(bounded(body.state, 512)); if (!connector.oauth_state_hash || connector.oauth_state_hash !== stateHash || new Date(connector.oauth_state_expires_at).getTime() < Date.now()) return reply.code(400).send({ error: 'OAuth state is invalid or expired', code: 'PULSEDESK_OAUTH_STATE_INVALID' });
    if (connector.mode !== 'test') return reply.code(503).send({ error: 'Live token exchange is unavailable until provider verification succeeds', code: 'PULSEDESK_LIVE_OAUTH_UNAVAILABLE' });
    await db.execute(sql`UPDATE pulsedesk_mail_connectors SET status='active',oauth_state_hash=NULL,oauth_state_expires_at=NULL,last_success_at=NOW(),updated_at=NOW(),version=version+1 WHERE tenant_id=${tenant(request)} AND id=${connector.id}`); await event(tenant(request), connector.id, 'oauth_completed', actor(request), { provider: connector.provider, adapter: 'deterministic' }); return { connected: true, provider: connector.provider };
  });
  app.post('/v1/modules/pulsedesk/connectors/:id/poll', { preHandler: [...writeGuards, manager] }, async (request, reply) => {
    const connector = await connectorById(tenant(request), (request.params as any).id); if (!connector) return reply.code(404).send({ error: 'Connector not found', code: 'PULSEDESK_CONNECTOR_NOT_FOUND' });
    const queued = await enqueueSharedJob({ tenantId: tenant(request), moduleId: 'pulsedesk', requestedByUserId: actor(request), handlerKey: POLL_HANDLER, payload: { connectorId: connector.id }, idempotencyKey: `${connector.id}:${new Date().toISOString().slice(0,16)}` }); await event(tenant(request), connector.id, 'poll_queued', actor(request), { duplicate: queued.duplicate }); return reply.code(202).send(queued);
  });
  app.delete('/v1/modules/pulsedesk/connectors/:id', { preHandler: [...writeGuards, manager] }, async (request, reply) => {
    const result = await db.execute(sql`UPDATE pulsedesk_mail_connectors SET status='revoked',revoked_at=NOW(),oauth_state_hash=NULL,updated_at=NOW(),version=version+1 WHERE tenant_id=${tenant(request)} AND id=${(request.params as any).id} AND revoked_at IS NULL RETURNING id`); if (!result.rows[0]) return reply.code(404).send({ error: 'Connector not found', code: 'PULSEDESK_CONNECTOR_NOT_FOUND' }); await event(tenant(request), String((result.rows[0] as any).id), 'revoked', actor(request)); return reply.code(204).send();
  });
  app.post('/v1/modules/pulsedesk/connectors/:id/test-ingest', { preHandler: [...writeGuards, manager] }, async (request, reply) => {
    const connector = await connectorById(tenant(request), (request.params as any).id); const body=(request.body??{}) as any; if (!connector) return reply.code(404).send({error:'Connector not found',code:'PULSEDESK_CONNECTOR_NOT_FOUND'}); if (connector.mode !== 'test') return reply.code(403).send({error:'Deterministic ingestion is test-mode only',code:'PULSEDESK_TEST_ADAPTER_REQUIRED'});
    try { const result = await ingestMessage({ connector, body, eventUserId: actor(request) }); return reply.code(result.statusCode).send(result.payload); }
    catch(error:any) { return reply.code(error.code === 'PULSEDESK_SENSITIVE_CONTENT_REJECTED' ? 422 : 400).send({ error: error.message, code: error.code ?? 'PULSEDESK_MESSAGE_INVALID' }); }
  });
  app.post('/v1/public/pulsedesk/inbound/:provider/:alias', async (request, reply) => {
    const provider = bounded((request.params as any).provider, 20);
    const alias = bounded((request.params as any).alias, 64);
    if (!PROVIDERS.has(provider)) return reply.code(404).send({ error: 'Inbound connector not found', code: 'PULSEDESK_CONNECTOR_NOT_FOUND' });
    const connector = await connectorByAlias(provider, alias);
    if (!connector || connector.status !== 'active') return reply.code(404).send({ error: 'Inbound connector not found', code: 'PULSEDESK_CONNECTOR_NOT_FOUND' });
    const body = (request.body ?? {}) as any;
    let authenticated = request.headers['x-pulsedesk-test-adapter'] === 'deterministic' && connector.mode === 'test' && process.env.APP_ENV !== 'production';
    if (connector.mode === 'live' && connector.secret_reference_id) {
      const secret = await resolveEncryptedSecretReference({ tenantId: String(connector.tenant_id), id: String(connector.secret_reference_id) });
      authenticated = Boolean(secret && validSignature(secret, body, request.headers['x-pulsedesk-signature']));
    }
    if (!authenticated) {
      await event(String(connector.tenant_id), connector.id, 'failed', null, { provider }, 'INBOUND_AUTHENTICITY_FAILED');
      return reply.code(401).send({ error: 'Inbound authenticity verification failed', code: 'PULSEDESK_INBOUND_AUTH_FAILED' });
    }
    try { const result = await ingestMessage({ connector, body, eventUserId: null }); return reply.code(result.statusCode).send(result.payload); }
    catch(error:any) { return reply.code(error.code === 'PULSEDESK_SENSITIVE_CONTENT_REJECTED' ? 422 : 400).send({ error: error.message, code: error.code ?? 'PULSEDESK_MESSAGE_INVALID' }); }
  });
  app.post('/v1/modules/pulsedesk/public-intake-policies', { preHandler: [...writeGuards, manager] }, async (request, reply) => { const body=(request.body??{}) as any; const result=await db.execute(sql`INSERT INTO pulsedesk_public_intake_policies (tenant_id,public_slug,directory_site_id,asset_id,max_requests_per_hour,created_by_user_id) VALUES (${tenant(request)},${publicId()},${bounded(body.directorySiteId,36)||null},${bounded(body.assetId,36)||null},${Math.max(1,Math.min(100,Number(body.maxRequestsPerHour)||10))},${actor(request)}) RETURNING id,public_slug,directory_site_id,asset_id,enabled,max_requests_per_hour`); return reply.code(201).send(result.rows[0]); });
  app.get('/v1/public/pulsedesk/intake/:slug', async (request, reply) => { const result=await db.execute(sql`SELECT public_slug,asset_id,directory_site_id FROM pulsedesk_public_intake_policies WHERE public_slug=${(request.params as any).slug} AND enabled=TRUE LIMIT 1`); if(!result.rows[0]) return reply.code(404).send({error:'Intake form not found',code:'PULSEDESK_INTAKE_NOT_FOUND'}); return {intake:result.rows[0],notice:'Operational issues only. Do not include patient names, records, diagnoses, or other sensitive health information.'}; });
  app.post('/v1/public/pulsedesk/intake/:slug', async (request, reply) => { const policyResult=await db.execute(sql`SELECT * FROM pulsedesk_public_intake_policies WHERE public_slug=${(request.params as any).slug} AND enabled=TRUE LIMIT 1`); const policy=policyResult.rows[0] as any; if(!policy) return reply.code(404).send({error:'Intake form not found',code:'PULSEDESK_INTAKE_NOT_FOUND'}); const clientHash=hash(request.ip); const window=new Date(Math.floor(Date.now()/3600000)*3600000); const rate=await db.execute(sql`INSERT INTO pulsedesk_public_intake_windows(policy_id,client_hash,window_start,request_count) VALUES(${policy.id},${clientHash},${window},1) ON CONFLICT(policy_id,client_hash,window_start) DO UPDATE SET request_count=pulsedesk_public_intake_windows.request_count+1 RETURNING request_count`); if(Number((rate.rows[0] as any).request_count)>Number(policy.max_requests_per_hour)) return reply.code(429).send({error:'Too many intake requests',code:'PULSEDESK_INTAKE_RATE_LIMITED'}); const body=(request.body??{}) as any; let summary; try{summary=safeSummary(body.summary);}catch(error:any){return reply.code(422).send({error:error.message,code:error.code});} const ticket=await createTicket({tenantId:String(policy.tenant_id),userId:String(policy.created_by_user_id),summary,category:'general',priority:bounded(body.priority,20)||'normal',location:bounded(body.location,120)||null}); return reply.code(201).send({accepted:true,reference:`PD-${ticket.number}`}); });
}
