import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantAdmin, requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import { maskPhone, normalizeE164, parseTwilioCallSid, phoneFingerprint } from '../lib/callcommand.js';
import {
  CALLCOMMAND_ACTION_TYPES,
  CALLCOMMAND_AFTER_HOURS,
  CALLCOMMAND_LIVE_BEHAVIORS,
  CALLCOMMAND_PRODUCT_MODES,
  CallCommandPhase35Error,
  analyzeTranscript,
  buildAfterHoursTwiml,
  buildCallPdf,
  buildIncomingTwiml,
  cleanText,
  createIngestionToken,
  decideReceptionistTurn,
  executeFlowGraph,
  hashValue,
  isWithinBusinessHours,
  nextIntakeQuestion,
  normalizeIntakeSchema,
  parseIntakeAnswer,
  safeJsonObject,
  transcribeCallAudio,
  validateFlowGraph,
  xml,
} from '../lib/callcommand-phase35.js';
import {
  fetchTwilioRecording,
  fetchTwilioTranscription,
  getTelephonyInfo,
  redirectTwilioCall,
  startTwilioCallRecording,
  verifyTwilioSignature,
} from '../lib/telephony.js';
import { createAttachment } from '../lib/shared-attachments.js';
import { getOutboundProviderAdapter, getSharedProviderStatuses } from '../lib/shared-provider-adapters.js';
import { enqueueOutboundWebhook, listOutboundWebhookEndpoints } from '../lib/shared-outbound-webhooks.js';
import { appendActivityEvent, recordUsageEvent, summarizeUsage } from '../lib/shared-usage-activity.js';
import { publishConfiguredCallWorkflows } from '../lib/cross-module-data-fabric.js';
import { safeFailureCode } from '../lib/shared-service-safety.js';

const MODULE_SLUG = 'callcommand-ai';
const base = '/v1/modules/callcommand-ai/product';
const reads = [requireTenantModuleAccess(MODULE_SLUG)];
const writes = [...reads, requireTenantModuleWriteAccess];
const admins = [...writes, requireTenantAdmin];
type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;

const tenant = (request: FastifyRequest) => String((request as any).tenantContext.tenantId);
const actor = (request: FastifyRequest) => String((request as any).user.id);
const params = (request: FastifyRequest) => request.params as Row;

function body(request: FastifyRequest): Row {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new CallCommandPhase35Error('A JSON object is required');
  const value = request.body as Row;
  for (const key of ['tenantId', 'tenant_id', 'userId', 'user_id', 'role', 'entitlement', 'plan']) {
    if (key in value) throw new CallCommandPhase35Error(`${key} is resolved from the trusted OperatorOS session`);
  }
  return value;
}

function id(request: FastifyRequest, key = 'id'): string {
  const value = String(params(request)[key] ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new CallCommandPhase35Error(`${key} is invalid`);
  return value;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const result = String(value);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(result)) throw new CallCommandPhase35Error(`${field} is invalid`);
  return result;
}

function camel(row: Row): Row {
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => !['tenant_id', 'phone_e164', 'phone_fingerprint', 'content', 'token_hash'].includes(key))
    .map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
}

function fail(reply: FastifyReply, error: unknown) {
  const value = error as any;
  if (value instanceof CallCommandPhase35Error || (Number(value?.statusCode) >= 400 && Number(value?.statusCode) < 500)) {
    return reply.code(value.statusCode ?? 400).send({ error: value.message, code: value.code ?? 'CALLCOMMAND_REQUEST_FAILED' });
  }
  throw error;
}

async function moduleId(executor: Executor = db): Promise<string> {
  const result = await executor.execute(sql`SELECT id FROM modules WHERE slug=${MODULE_SLUG} LIMIT 1`);
  if (!result.rows[0]) throw Object.assign(new Error('CallCommand module registry is unavailable'), { code: 'CALLCOMMAND_MODULE_UNAVAILABLE' });
  return String((result.rows[0] as Row).id);
}

async function activity(request: FastifyRequest, eventType: string, objectType: string, objectId: string, summary: string, metadata: Row = {}) {
  return appendActivityEvent({ tenantId: tenant(request), moduleId: await moduleId(), actorUserId: actor(request), eventType, objectType, objectId, summary, metadata });
}

function canonicalWebhookUrl(request: FastifyRequest): string {
  const configured = process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL;
  return configured ? new URL(request.url, configured).toString() : `${request.protocol}://${request.headers.host}${request.url}`;
}

function formBody(request: FastifyRequest): Record<string, string> {
  const raw = (request.body ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'string').map(([key, value]) => [key, String(value)]));
}

async function signedTwilio(request: FastifyRequest): Promise<Record<string, string>> {
  const value = formBody(request);
  const signature = request.headers['x-twilio-signature'] as string | undefined;
  if (!(await verifyTwilioSignature(canonicalWebhookUrl(request), value, signature))) {
    throw new CallCommandPhase35Error('Twilio signature verification failed', 'CALLCOMMAND_SIGNATURE_INVALID', 403);
  }
  return value;
}

function sendTwiml(reply: FastifyReply, content: string) {
  return reply.header('content-type', 'text/xml; charset=utf-8').send(content);
}

async function loadCall(tenantId: string, callId: string, executor: Executor = db): Promise<Row> {
  const result = await executor.execute(sql`SELECT * FROM callcommand_calls WHERE tenant_id=${tenantId} AND id=${callId} LIMIT 1`);
  if (!result.rows[0]) throw new CallCommandPhase35Error('Call was not found', 'CALLCOMMAND_CALL_NOT_FOUND', 404);
  return result.rows[0] as Row;
}

async function loadProviderCall(sid: string, callId?: string | null): Promise<Row | null> {
  const result = await db.execute(sql`SELECT * FROM callcommand_calls WHERE provider='twilio' AND provider_call_sid=${sid} AND (${callId ?? null}::text IS NULL OR id=${callId ?? null}) LIMIT 1`);
  return (result.rows[0] as Row | undefined) ?? null;
}

async function recordIngestion(input: { tenantId: string; source: string; eventId: string; payloadHash: string; callId?: string | null; status?: string }, executor: Executor = db) {
  const created = await executor.execute(sql`
    INSERT INTO callcommand_ingestion_events(tenant_id,source,provider_event_id,payload_sha256,call_id,status,processed_at)
    VALUES (${input.tenantId},${input.source},${input.eventId.slice(0, 200)},${input.payloadHash},${input.callId ?? null},${input.status ?? 'processed'},NOW())
    ON CONFLICT (tenant_id,source,provider_event_id) DO NOTHING RETURNING *
  `);
  return { duplicate: !created.rows[0], event: created.rows[0] as Row | undefined };
}

async function insertGeneratedObject(executor: Executor, table: 'ticket' | 'lead' | 'task', input: { tenantId: string; call: Row; title?: string; description?: string | null; assignedUserId?: string | null; priority?: string }) {
  if (table === 'ticket') return executor.execute(sql`
    INSERT INTO callcommand_tickets(tenant_id,call_id,title,description,priority,assigned_user_id)
    VALUES (${input.tenantId},${input.call.id},${input.title ?? input.call.summary ?? 'Call follow-up'},${input.description ?? input.call.intent ?? null},${input.priority ?? input.call.priority ?? 'medium'},${input.assignedUserId ?? null}) RETURNING *
  `);
  if (table === 'lead') return executor.execute(sql`
    INSERT INTO callcommand_leads(tenant_id,call_id,name,company,phone_masked,notes,assigned_user_id)
    VALUES (${input.tenantId},${input.call.id},${input.call.customer_name ?? null},${input.call.company_name ?? null},${input.call.phone_masked ?? null},${input.description ?? input.call.summary ?? null},${input.assignedUserId ?? null}) RETURNING *
  `);
  return executor.execute(sql`
    INSERT INTO callcommand_tasks(tenant_id,call_id,title,description,priority,assigned_user_id)
    VALUES (${input.tenantId},${input.call.id},${input.title ?? input.call.action_items?.[0]?.title ?? 'Call follow-up'},${input.description ?? input.call.intent ?? null},${input.priority ?? input.call.priority ?? 'medium'},${input.assignedUserId ?? null}) RETURNING *
  `);
}

function ruleMatches(conditions: Row, call: Row): boolean {
  return Object.entries(conditions).every(([key, expected]) => {
    const actual = call[key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] ?? call[key];
    return Array.isArray(expected) ? expected.map(String).includes(String(actual)) : String(actual ?? '') === String(expected ?? '');
  });
}

async function dispatchActions(input: { tenantId: string; userId: string; call: Row; actions: Row[]; ruleId?: string | null; correlationId?: string | null }) {
  const modId = await moduleId();
  const results: Row[] = [];
  for (let index = 0; index < input.actions.length; index += 1) {
    const action = input.actions[index] ?? {};
    const actionType = String(action.actionType ?? action.type ?? '');
    if (!CALLCOMMAND_ACTION_TYPES.includes(actionType as any)) continue;
    const key = `${input.call.id}:${input.ruleId ?? 'flow'}:${index}:${actionType}`;
    const existing = await db.execute(sql`SELECT * FROM callcommand_action_runs WHERE tenant_id=${input.tenantId} AND idempotency_key=${key} LIMIT 1`);
    if (existing.rows[0]) { results.push(camel(existing.rows[0] as Row)); continue; }
    let status = 'completed'; let provider: string | null = 'operatoros'; let reference: string | null = null; let safeResult: Row = {}; let errorCode: string | null = null;
    try {
      if (actionType === 'ticket' || actionType === 'lead' || actionType === 'task') {
        const created = await insertGeneratedObject(db, actionType, { tenantId: input.tenantId, call: input.call, title: action.title, description: action.description, assignedUserId: optionalId(action.assignedUserId, 'assignedUserId'), priority: action.priority });
        reference = String((created.rows[0] as Row).id); safeResult = { objectType: actionType, objectId: reference };
      } else if (actionType === 'assignment') {
        const assigned = optionalId(action.userId, 'userId');
        await db.execute(sql`UPDATE callcommand_calls SET created_by_user_id=${assigned},updated_at=NOW() WHERE tenant_id=${input.tenantId} AND id=${input.call.id}`);
        safeResult = { assignedUserId: assigned };
      } else if (actionType === 'priority') {
        const priority = ['low', 'medium', 'high', 'urgent'].includes(String(action.priority)) ? String(action.priority) : 'medium';
        await db.execute(sql`UPDATE callcommand_calls SET priority=${priority},updated_at=NOW() WHERE tenant_id=${input.tenantId} AND id=${input.call.id}`);
        safeResult = { priority };
      } else if (actionType === 'email') {
        const adapter = await getOutboundProviderAdapter('email');
        const result = await adapter.send({ destination: cleanText(action.destination, 'email destination', 320)!, subject: String(action.subject ?? 'CallCommand follow-up').slice(0, 200), body: String(action.body ?? input.call.summary ?? '').slice(0, 8_000), idempotencyKey: key });
        provider = adapter.status.name; reference = result.providerMessageId; status = result.externalDelivery ? 'delivered' : 'test_recorded'; safeResult = { externalDelivery: result.externalDelivery };
      } else if (actionType === 'webhook' || actionType === 'slack') {
        const endpointId = optionalId(action.endpointId, 'endpointId');
        if (!endpointId) throw new CallCommandPhase35Error(`${actionType} action requires endpointId`);
        const queued = await enqueueOutboundWebhook({ tenantId: input.tenantId, moduleId: modId, endpointId, eventType: actionType === 'slack' ? 'callcommand.slack' : 'callcommand.call.processed', payload: { callId: input.call.id, priority: input.call.priority, intent: input.call.intent }, idempotencyKey: key, correlationId: input.correlationId });
        provider = 'shared-webhook'; reference = String((queued.delivery as Row).id); status = 'queued'; safeResult = { duplicate: queued.duplicate };
      }
    } catch (error) {
      status = 'failed'; errorCode = String((error as any)?.code ?? 'CALLCOMMAND_ACTION_FAILED').slice(0, 80); safeResult = { providerActionConfirmed: false };
    }
    const saved = await db.execute(sql`
      INSERT INTO callcommand_action_runs(tenant_id,call_id,rule_id,action_type,status,idempotency_key,provider,provider_reference,safe_result,error_code,completed_at)
      VALUES (${input.tenantId},${input.call.id},${input.ruleId ?? null},${actionType},${status},${key},${provider},${reference},${JSON.stringify(safeResult)}::jsonb,${errorCode},NOW()) RETURNING *
    `);
    results.push(camel(saved.rows[0] as Row));
  }
  return results;
}

async function processCall(input: { tenantId: string; userId: string; callId: string; transcript: string; mode: 'auto' | 'ai' | 'deterministic'; correlationId?: string | null }) {
  const original = await loadCall(input.tenantId, input.callId);
  const resolved = await analyzeTranscript(input.transcript, input.mode);
  const analysis = resolved.analysis;
  const updated = await db.transaction(async tx => {
    const result = await tx.execute(sql`
      UPDATE callcommand_calls SET transcript=${input.transcript},summary=${analysis.summary},customer_name=${analysis.customerName},company_name=${analysis.companyName},
        call_type=${analysis.callType},intent=${analysis.intent},priority=${analysis.priority},sentiment=${analysis.sentiment},key_points=${JSON.stringify(analysis.keyPoints)}::jsonb,
        entities=${JSON.stringify(analysis.entities)}::jsonb,suggested_tags=${JSON.stringify(analysis.suggestedTags)}::jsonb,action_items=${JSON.stringify(analysis.actionItems)}::jsonb,
        analysis_provider=${resolved.provider},analysis_model=${resolved.model},analysis_provenance=${JSON.stringify({ mode: resolved.provenance, fallbackReason: (resolved as any).fallbackReason ?? null })}::jsonb,
        analyzed_at=NOW(),status=CASE WHEN direction='inbound' THEN 'completed' ELSE status END,updated_at=NOW(),completed_at=COALESCE(completed_at,NOW())
      WHERE tenant_id=${input.tenantId} AND id=${input.callId} RETURNING *
    `);
    return result.rows[0] as Row;
  });
  const rules = await db.execute(sql`SELECT * FROM callcommand_automation_rules WHERE tenant_id=${input.tenantId} AND enabled=TRUE AND deleted_at IS NULL ORDER BY priority,id`);
  const actionResults: Row[] = [];
  for (const rule of rules.rows as Row[]) if (ruleMatches(rule.conditions_json as Row, updated)) actionResults.push(...await dispatchActions({ tenantId: input.tenantId, userId: input.userId, call: updated, actions: rule.actions_json as Row[], ruleId: String(rule.id), correlationId: input.correlationId }));
  if (!rules.rows.length) {
    const fallbackAction = analysis.callType === 'sales' ? 'lead' : analysis.actionItems.length ? 'task' : 'ticket';
    actionResults.push(...await dispatchActions({ tenantId: input.tenantId, userId: input.userId, call: updated, actions: [{ actionType: fallbackAction }], correlationId: input.correlationId }));
  }
  let flowResult: ReturnType<typeof executeFlowGraph> | null = null;
  const channel = await db.execute(sql`SELECT active_flow_id FROM callcommand_channels WHERE tenant_id=${input.tenantId} AND id=${original.channel_id} LIMIT 1`);
  if ((channel.rows[0] as Row | undefined)?.active_flow_id) {
    const flow = await db.execute(sql`SELECT f.*,v.graph_json FROM callcommand_flows f JOIN callcommand_flow_versions v ON v.tenant_id=f.tenant_id AND v.flow_id=f.id AND v.version=f.active_version WHERE f.tenant_id=${input.tenantId} AND f.id=${String((channel.rows[0] as Row).active_flow_id)} LIMIT 1`);
    if (flow.rows[0]) {
      const row = flow.rows[0] as Row;
      flowResult = executeFlowGraph(row.graph_json, updated);
      for (const trace of flowResult.traces) await db.execute(sql`
        INSERT INTO callcommand_flow_traces(tenant_id,call_id,flow_id,flow_version,sequence,node_key,node_type,outcome,safe_input,safe_output)
        VALUES (${input.tenantId},${input.callId},${row.id},${row.active_version},${trace.sequence},${trace.nodeKey},${trace.nodeType},${trace.outcome},${JSON.stringify(trace.safeInput)}::jsonb,${JSON.stringify(trace.safeOutput)}::jsonb)
        ON CONFLICT (tenant_id,call_id,flow_id,flow_version,sequence) DO NOTHING
      `);
      actionResults.push(...await dispatchActions({ tenantId: input.tenantId, userId: input.userId, call: updated, actions: flowResult.actions, correlationId: input.correlationId }));
      await db.execute(sql`UPDATE callcommand_calls SET flow_id=${row.id},flow_version=${row.active_version} WHERE tenant_id=${input.tenantId} AND id=${input.callId}`);
    }
  }
  const modId = await moduleId();
  await recordUsageEvent({ tenantId: input.tenantId, moduleId: modId, userId: input.userId, operation: 'call_analysis', units: 1, unitKind: 'call', idempotencyKey: `call-analysis:${input.callId}`, externalReference: input.callId, metadata: { provider: resolved.provider, provenance: resolved.provenance } });
  // Cross-module routing is outbox-backed and intentionally cannot roll back
  // the analyzed call. Disabled/revoked destinations become observable fabric
  // failures while CallCommand remains authoritative for its call record.
  let fabric: Array<Record<string, unknown>>;
  try {
    fabric = await publishConfiguredCallWorkflows({
      tenantId: input.tenantId,
      actorUserId: input.userId,
      callId: input.callId,
      correlationId: input.correlationId ?? `call-analysis:${input.callId}`,
    });
  } catch (error) {
    fabric = [{ queued: false, errorCode: safeFailureCode(error, 'FABRIC_RULE_QUEUE_FAILED') }];
  }
  return { call: camel(updated), actions: actionResults, flow: flowResult, fabric, provenance: { provider: resolved.provider, model: resolved.model, mode: resolved.provenance } };
}

export async function registerCallCommandPhase35Routes(app: FastifyInstance) {
  app.get(`${base}/workspace`, { preHandler: reads }, async request => {
    const tenantId = tenant(request); const modId = await moduleId();
    const [channels, profiles, targets, flows, rules, calls, tickets, leads, tasks, sessions, actionRuns, activityRows, usage, telephony, providers, endpoints] = await Promise.all([
      db.execute(sql`SELECT * FROM callcommand_channels WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC`),
      db.execute(sql`SELECT * FROM callcommand_profiles WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC`),
      db.execute(sql`SELECT * FROM callcommand_transfer_targets WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY priority,label`),
      db.execute(sql`SELECT * FROM callcommand_flows WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC`),
      db.execute(sql`SELECT * FROM callcommand_automation_rules WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY priority,id`),
      db.execute(sql`SELECT * FROM callcommand_calls WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 100`),
      db.execute(sql`SELECT * FROM callcommand_tickets WHERE tenant_id=${tenantId} ORDER BY updated_at DESC LIMIT 100`),
      db.execute(sql`SELECT * FROM callcommand_leads WHERE tenant_id=${tenantId} ORDER BY updated_at DESC LIMIT 100`),
      db.execute(sql`SELECT * FROM callcommand_tasks WHERE tenant_id=${tenantId} ORDER BY updated_at DESC LIMIT 100`),
      db.execute(sql`SELECT * FROM callcommand_live_sessions WHERE tenant_id=${tenantId} ORDER BY updated_at DESC LIMIT 100`),
      db.execute(sql`SELECT * FROM callcommand_action_runs WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 100`),
      db.execute(sql`SELECT event_type,object_type,object_id,summary,metadata_json,created_at FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${modId} ORDER BY created_at DESC LIMIT 100`),
      summarizeUsage({ tenantId, moduleId: modId, since: new Date(Date.now() - 31 * 86_400_000) }),
      getTelephonyInfo(), getSharedProviderStatuses(), listOutboundWebhookEndpoints({ tenantId, moduleId: modId }),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const analytics = await db.execute(sql`
      SELECT count(*)::int total_calls,count(*) FILTER (WHERE created_at::date=${today}::date)::int calls_today,
        count(*) FILTER (WHERE status='completed')::int completed_calls,count(*) FILTER (WHERE priority IN ('high','urgent'))::int high_priority_calls,
        COALESCE(avg(duration_seconds),0)::int average_duration_seconds FROM callcommand_calls WHERE tenant_id=${tenantId}
    `);
    return {
      source: { commit: 'd49434e1d641d62cc141591c7208539a7afbf11e', contract: 'phase-35-complete-telephony-v1' },
      channels: channels.rows.map(row => camel(row as Row)), profiles: profiles.rows.map(row => camel(row as Row)), targets: targets.rows.map(row => camel(row as Row)),
      flows: flows.rows.map(row => camel(row as Row)), rules: rules.rows.map(row => camel(row as Row)), calls: calls.rows.map(row => camel(row as Row)),
      tickets: tickets.rows.map(row => camel(row as Row)), leads: leads.rows.map(row => camel(row as Row)), tasks: tasks.rows.map(row => camel(row as Row)),
      sessions: sessions.rows.map(row => camel(row as Row)), actionRuns: actionRuns.rows.map(row => camel(row as Row)), activity: activityRows.rows.map(row => camel(row as Row)),
      analytics: camel(analytics.rows[0] as Row), usage, providers: { telephony, shared: providers, webhookEndpoints: endpoints.map(row => camel(row as Row)) },
      routeContract: ['/dashboard','/calls','/calls/new','/integrations','/automation-rules','/switchboard','/setup/telephony','/channels','/flows','/simulate','/simulate/live-call','/receptionist-profiles','/transfer-targets','/tickets','/leads','/tasks','/billing','/settings'],
    };
  });

  app.post(`${base}/channels`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request); const behavior = String(value.liveBehavior ?? 'ai_receptionist'); const after = String(value.afterHoursBehavior ?? 'voicemail'); const mode = String(value.productMode ?? 'general');
      if (!CALLCOMMAND_LIVE_BEHAVIORS.includes(behavior as any)) throw new CallCommandPhase35Error('liveBehavior is invalid');
      if (!CALLCOMMAND_AFTER_HOURS.includes(after as any)) throw new CallCommandPhase35Error('afterHoursBehavior is invalid');
      if (!CALLCOMMAND_PRODUCT_MODES.includes(mode as any)) throw new CallCommandPhase35Error('productMode is invalid');
      const timezone = cleanText(value.timezone ?? 'UTC', 'timezone', 80)!; try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new CallCommandPhase35Error('timezone must be an IANA time zone'); }
      const businessHours = safeJsonObject(value.businessHours ?? { always: true }, 'businessHours'); isWithinBusinessHours(businessHours, new Date(), timezone);
      const phone = normalizeE164(value.phone ?? value.phoneE164); const forward = value.forwardPhone ? normalizeE164(value.forwardPhone, 'forwardPhone') : null;
      if ((behavior === 'forward_only' || after === 'forward') && !forward) throw new CallCommandPhase35Error('forwardPhone is required for forwarding behavior');
      const created = await db.execute(sql`
        INSERT INTO callcommand_channels(tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,status,business_hours,live_behavior,after_hours_behavior,forward_phone_e164,require_recording_consent,provider_status,profile_id,product_mode)
        VALUES (${tenant(request)},${actor(request)},${cleanText(value.name,'name',120)},${phone},${timezone},${cleanText(value.consentScript ?? 'This call may be recorded and processed for service.','consentScript',1000)},${value.recordingEnabled === true},'active',${JSON.stringify(businessHours)}::jsonb,${behavior},${after},${forward},${value.requireRecordingConsent !== false},'unavailable',${optionalId(value.profileId,'profileId')},${mode}) RETURNING *
      `);
      await activity(request, 'callcommand.channel.created', 'channel', String((created.rows[0] as Row).id), 'Created a live call channel');
      return reply.code(201).send({ channel: camel(created.rows[0] as Row) });
    } catch (error) { return fail(reply, error); }
  });

  app.patch(`${base}/channels/:id`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request); const existing = await db.execute(sql`SELECT * FROM callcommand_channels WHERE tenant_id=${tenant(request)} AND id=${id(request)} AND deleted_at IS NULL LIMIT 1`);
      if (!existing.rows[0]) throw new CallCommandPhase35Error('Channel was not found', 'CALLCOMMAND_CHANNEL_NOT_FOUND', 404);
      const row = existing.rows[0] as Row; const behavior = String(value.liveBehavior ?? row.live_behavior); const after = String(value.afterHoursBehavior ?? row.after_hours_behavior);
      if (!CALLCOMMAND_LIVE_BEHAVIORS.includes(behavior as any) || !CALLCOMMAND_AFTER_HOURS.includes(after as any)) throw new CallCommandPhase35Error('Channel behavior is invalid');
      const updated = await db.execute(sql`
        UPDATE callcommand_channels SET name=${value.name ? cleanText(value.name,'name',120) : row.name},business_hours=${JSON.stringify(value.businessHours ?? row.business_hours)}::jsonb,
          live_behavior=${behavior},after_hours_behavior=${after},forward_phone_e164=${value.forwardPhone ? normalizeE164(value.forwardPhone,'forwardPhone') : row.forward_phone_e164},
          require_recording_consent=${value.requireRecordingConsent ?? row.require_recording_consent},recording_enabled=${value.recordingEnabled ?? row.recording_enabled},
          profile_id=${value.profileId === null ? null : optionalId(value.profileId,'profileId') ?? row.profile_id},active_flow_id=${value.activeFlowId === null ? null : optionalId(value.activeFlowId,'activeFlowId') ?? row.active_flow_id},
          status=${['active','paused','archived'].includes(String(value.status)) ? String(value.status) : row.status},version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id(request)} RETURNING *
      `);
      await activity(request, 'callcommand.channel.updated', 'channel', id(request), 'Updated channel behavior and routing');
      return { channel: camel(updated.rows[0] as Row) };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/profiles`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const fields = normalizeIntakeSchema(value.intakeSchema ?? value.intakeFields ?? []); const mode = String(value.productMode ?? 'general');
      if (!CALLCOMMAND_PRODUCT_MODES.includes(mode as any)) throw new CallCommandPhase35Error('productMode is invalid');
      const created = await db.execute(sql`
        INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,script,tone,escalation_rules,product_mode,is_default)
        VALUES (${tenant(request)},${actor(request)},${cleanText(value.name,'name',120)},${String(value.mode ?? 'receptionist')},${cleanText(value.greeting ?? value.greetingScript,'greeting',1000)},${JSON.stringify(fields)}::jsonb,'active',${cleanText(value.script,'script',8000,true) ?? ''},${cleanText(value.tone ?? 'professional','tone',32)},${JSON.stringify(Array.isArray(value.escalationRules) ? value.escalationRules.slice(0,20) : [])}::jsonb,${mode},${value.isDefault === true}) RETURNING *
      `);
      await activity(request, 'callcommand.profile.created', 'receptionist_profile', String((created.rows[0] as Row).id), 'Created a receptionist profile');
      return reply.code(201).send({ profile: camel(created.rows[0] as Row) });
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/transfer-targets`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const kind = String(value.kind ?? 'external');
      if (!['user','queue','external','voicemail'].includes(kind)) throw new CallCommandPhase35Error('Transfer target kind is invalid');
      const created = await db.execute(sql`
        INSERT INTO callcommand_transfer_targets(tenant_id,created_by_user_id,label,kind,phone_e164,target_user_id,queue_name,business_hours,priority,verified_at,status)
        VALUES (${tenant(request)},${actor(request)},${cleanText(value.label,'label',120)},${kind},${kind === 'external' ? normalizeE164(value.phone,'phone') : null},${kind === 'user' ? optionalId(value.userId,'userId') : null},${kind === 'queue' ? cleanText(value.queueName,'queueName',120) : null},${JSON.stringify(value.businessHours ?? { always: true })}::jsonb,${Math.max(1,Math.min(1000,Number(value.priority ?? 100)))},${kind === 'external' && value.verified === true ? new Date() : null},'active') RETURNING *
      `);
      await activity(request, 'callcommand.transfer_target.created', 'transfer_target', String((created.rows[0] as Row).id), 'Created a transfer target');
      return reply.code(201).send({ target: camel(created.rows[0] as Row) });
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/flows`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const validated = validateFlowGraph(value.graph);
      const created = await db.transaction(async tx => {
        const flow = await tx.execute(sql`INSERT INTO callcommand_flows(tenant_id,created_by_user_id,name,description,product_mode,status,start_node_key) VALUES (${tenant(request)},${actor(request)},${cleanText(value.name,'name',160)},${cleanText(value.description,'description',2000,true)},${CALLCOMMAND_PRODUCT_MODES.includes(String(value.productMode) as any) ? String(value.productMode) : 'general'},'draft',${validated.graph.start}) RETURNING *`);
        const row = flow.rows[0] as Row;
        await tx.execute(sql`INSERT INTO callcommand_flow_versions(tenant_id,flow_id,version,graph_json,validation_json,published_by_user_id) VALUES (${tenant(request)},${row.id},1,${JSON.stringify(validated.graph)}::jsonb,${JSON.stringify({ valid: true, reachable: validated.reachable })}::jsonb,${actor(request)})`);
        return row;
      });
      await activity(request, 'callcommand.flow.created', 'call_flow', String(created.id), 'Created a versioned call flow');
      return reply.code(201).send({ flow: camel(created), validation: { valid: true, reachable: validated.reachable } });
    } catch (error) { return fail(reply, error); }
  });

  app.put(`${base}/flows/:id`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const validated = validateFlowGraph(value.graph); const flowId = id(request);
      const updated = await db.transaction(async tx => {
        const locked = await tx.execute(sql`SELECT * FROM callcommand_flows WHERE tenant_id=${tenant(request)} AND id=${flowId} AND deleted_at IS NULL FOR UPDATE`);
        if (!locked.rows[0]) throw new CallCommandPhase35Error('Flow was not found', 'CALLCOMMAND_FLOW_NOT_FOUND', 404);
        const nextVersion = Number((locked.rows[0] as Row).version) + 1;
        await tx.execute(sql`INSERT INTO callcommand_flow_versions(tenant_id,flow_id,version,graph_json,validation_json,published_by_user_id) VALUES (${tenant(request)},${flowId},${nextVersion},${JSON.stringify(validated.graph)}::jsonb,${JSON.stringify({ valid: true, reachable: validated.reachable })}::jsonb,${actor(request)})`);
        const result = await tx.execute(sql`UPDATE callcommand_flows SET name=COALESCE(${cleanText(value.name,'name',160,true)},name),description=COALESCE(${cleanText(value.description,'description',2000,true)},description),start_node_key=${validated.graph.start},version=${nextVersion},updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${flowId} RETURNING *`);
        return result.rows[0] as Row;
      });
      await activity(request, 'callcommand.flow.versioned', 'call_flow', flowId, `Saved call flow version ${updated.version}`);
      return { flow: camel(updated), validation: { valid: true, reachable: validated.reachable } };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/flows/:id/publish`, { preHandler: admins }, async (request, reply) => {
    try {
      const flowId = id(request); const result = await db.execute(sql`UPDATE callcommand_flows SET status='active',active_version=version,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${flowId} AND deleted_at IS NULL RETURNING *`);
      if (!result.rows[0]) throw new CallCommandPhase35Error('Flow was not found', 'CALLCOMMAND_FLOW_NOT_FOUND', 404);
      await activity(request, 'callcommand.flow.published', 'call_flow', flowId, `Published call flow version ${(result.rows[0] as Row).active_version}`);
      return { flow: camel(result.rows[0] as Row) };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/automation-rules`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const conditions = safeJsonObject(value.conditions ?? {}, 'conditions'); const actions = Array.isArray(value.actions) ? value.actions.slice(0,20) : [];
      if (!actions.length || actions.some((action: Row) => !CALLCOMMAND_ACTION_TYPES.includes(String(action.actionType ?? action.type) as any))) throw new CallCommandPhase35Error('At least one supported action is required');
      const created = await db.execute(sql`INSERT INTO callcommand_automation_rules(tenant_id,created_by_user_id,name,priority,enabled,conditions_json,actions_json) VALUES (${tenant(request)},${actor(request)},${cleanText(value.name,'name',160)},${Math.max(1,Math.min(1000,Number(value.priority ?? 100)))},${value.enabled !== false},${JSON.stringify(conditions)}::jsonb,${JSON.stringify(actions)}::jsonb) RETURNING *`);
      await activity(request, 'callcommand.rule.created', 'automation_rule', String((created.rows[0] as Row).id), 'Created an automation rule');
      return reply.code(201).send({ rule: camel(created.rows[0] as Row) });
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/calls/:id/process`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const transcript = cleanText(value.transcript,'transcript',40000)!; const mode = ['auto','ai','deterministic'].includes(String(value.mode)) ? value.mode : 'auto';
      return await processCall({ tenantId: tenant(request), userId: actor(request), callId: id(request), transcript, mode, correlationId: request.id });
    } catch (error) { return fail(reply, error); }
  });

  app.get(`${base}/calls/:id`, { preHandler: reads }, async (request, reply) => {
    try {
      const call = await loadCall(tenant(request), id(request));
      const [events,traces,actions,reports] = await Promise.all([
        db.execute(sql`SELECT * FROM callcommand_events WHERE tenant_id=${tenant(request)} AND call_id=${call.id} ORDER BY created_at,id`),
        db.execute(sql`SELECT * FROM callcommand_flow_traces WHERE tenant_id=${tenant(request)} AND call_id=${call.id} ORDER BY sequence`),
        db.execute(sql`SELECT * FROM callcommand_action_runs WHERE tenant_id=${tenant(request)} AND call_id=${call.id} ORDER BY created_at`),
        db.execute(sql`SELECT id,format,content_sha256,size_bytes,created_at FROM callcommand_reports WHERE tenant_id=${tenant(request)} AND call_id=${call.id} ORDER BY created_at DESC`),
      ]);
      return { call: camel(call), events: events.rows.map(row=>camel(row as Row)), traces: traces.rows.map(row=>camel(row as Row)), actions: actions.rows.map(row=>camel(row as Row)), reports: reports.rows.map(row=>camel(row as Row)) };
    } catch (error) { return fail(reply,error); }
  });

  app.post(`${base}/calls/:id/report`, { preHandler: reads }, async (request, reply) => {
    try {
      const call = await loadCall(tenant(request), id(request));
      const [traces,actions] = await Promise.all([
        db.execute(sql`SELECT * FROM callcommand_flow_traces WHERE tenant_id=${tenant(request)} AND call_id=${call.id} ORDER BY sequence`),
        db.execute(sql`SELECT * FROM callcommand_action_runs WHERE tenant_id=${tenant(request)} AND call_id=${call.id} ORDER BY created_at`),
      ]);
      const content = buildCallPdf(call, traces.rows as Row[], actions.rows as Row[]); const sha = hashValue(content);
      const saved = await db.execute(sql`INSERT INTO callcommand_reports(tenant_id,call_id,requested_by_user_id,content,content_sha256,size_bytes) VALUES (${tenant(request)},${call.id},${actor(request)},${content},${sha},${content.length}) RETURNING id`);
      await activity(request,'callcommand.report.generated','call_report',String((saved.rows[0] as Row).id),'Generated a validated call intelligence PDF',{ sha256: sha, sizeBytes: content.length });
      return reply.header('content-type','application/pdf').header('content-disposition',`attachment; filename="callcommand-${call.id}.pdf"`).header('x-content-sha256',sha).send(content);
    } catch (error) { return fail(reply,error); }
  });

  app.post(`${base}/upload-intents`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const mime = String(value.mimeType ?? ''); const size = Number(value.sizeBytes);
      if (!['audio/mpeg','audio/wav','audio/mp4','audio/x-m4a'].includes(mime) || !Number.isSafeInteger(size) || size < 1 || size > 52_428_800) throw new CallCommandPhase35Error('Only supported audio files up to 50 MiB may be uploaded');
      const created = await db.execute(sql`INSERT INTO callcommand_upload_intents(tenant_id,user_id,call_id,file_name,mime_type,size_bytes,content_sha256,expires_at) VALUES (${tenant(request)},${actor(request)},${optionalId(value.callId,'callId')},${cleanText(value.fileName,'fileName',240)},${mime},${size},${value.sha256 && /^[0-9a-f]{64}$/i.test(String(value.sha256)) ? String(value.sha256).toLowerCase() : null},NOW()+INTERVAL '15 minutes') RETURNING *`);
      return reply.code(201).send({ intent: camel(created.rows[0] as Row), uploadRoute: `${base}/upload-intents/${String((created.rows[0] as Row).id)}/content` });
    } catch (error) { return fail(reply,error); }
  });

  app.post(`${base}/upload-intents/:id/content`, { preHandler: writes, bodyLimit: 70_000_000 }, async (request, reply) => {
    try {
      const value = body(request); const intentId = id(request); const loaded = await db.execute(sql`SELECT * FROM callcommand_upload_intents WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${intentId} AND status='created' AND expires_at>NOW() LIMIT 1`);
      if (!loaded.rows[0]) throw new CallCommandPhase35Error('Upload intent is missing or expired','CALLCOMMAND_UPLOAD_INTENT_INVALID',404);
      const intent = loaded.rows[0] as Row; const content = Buffer.from(cleanText(value.contentBase64,'contentBase64',70_000_000)!,'base64');
      if (content.length !== Number(intent.size_bytes) || (intent.content_sha256 && hashValue(content) !== intent.content_sha256)) throw new CallCommandPhase35Error('Uploaded audio integrity check failed','CALLCOMMAND_UPLOAD_INTEGRITY_FAILED');
      const attachment = await createAttachment({ tenantId: tenant(request), moduleId: await moduleId(), objectType: 'call_recording', objectId: String(intent.call_id ?? intent.id), originalName: String(intent.file_name), declaredMimeType: String(intent.mime_type), content, createdByUserId: actor(request), correlationId: request.id });
      await db.execute(sql`UPDATE callcommand_upload_intents SET status='scanning',attachment_id=${String((attachment as Row).id)},consumed_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${intentId}`);
      if (intent.call_id) await db.execute(sql`UPDATE callcommand_calls SET recording_attachment_id=${String((attachment as Row).id)},recording_status='pending',updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${intent.call_id}`);
      await activity(request,'callcommand.recording.uploaded','call_recording',String((attachment as Row).id),'Uploaded protected call audio for scanning');
      return reply.code(202).send({ attachmentId: String((attachment as Row).id), scanStatus: (attachment as Row).scan_status ?? 'pending' });
    } catch (error) { return fail(reply,error); }
  });

  app.post(`${base}/ingestion-tokens`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request); const source = String(value.source ?? 'generic'); if (!['generic','email','twilio'].includes(source)) throw new CallCommandPhase35Error('source is invalid');
      const token = createIngestionToken(); const created = await db.execute(sql`INSERT INTO callcommand_ingestion_tokens(tenant_id,created_by_user_id,label,token_prefix,token_hash,source,expires_at) VALUES (${tenant(request)},${actor(request)},${cleanText(value.label,'label',120)},${token.prefix},${token.hash},${source},${value.expiresAt ? new Date(String(value.expiresAt)) : null}) RETURNING id,label,token_prefix,source,expires_at,created_at`);
      await activity(request,'callcommand.ingestion_token.created','ingestion_token',String((created.rows[0] as Row).id),'Created a one-time-visible recording ingestion token');
      return reply.code(201).send({ token: token.token, configuration: camel(created.rows[0] as Row), warning: 'Store this token now. OperatorOS will not display it again.' });
    } catch (error) { return fail(reply,error); }
  });

  app.post(`${base}/ingest/:source`, { bodyLimit: 70_000_000 }, async (request, reply) => {
    try {
      const source = String(params(request).source ?? ''); if (!['generic','email','twilio'].includes(source)) throw new CallCommandPhase35Error('source is invalid');
      const bearer = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i,''); if (!bearer.startsWith('cci_')) throw new CallCommandPhase35Error('Ingestion token is required','CALLCOMMAND_INGESTION_UNAUTHORIZED',401);
      const tokenHash = hashValue(bearer); const tokenRow = await db.execute(sql`SELECT * FROM callcommand_ingestion_tokens WHERE token_hash=${tokenHash} AND source=${source} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1`);
      if (!tokenRow.rows[0]) throw new CallCommandPhase35Error('Ingestion token is invalid or expired','CALLCOMMAND_INGESTION_UNAUTHORIZED',401);
      const configuration = tokenRow.rows[0] as Row; const value = body(request); const eventId = cleanText(value.eventId ?? request.headers['x-idempotency-key'],'eventId',200)!;
      const payloadHash = hashValue(JSON.stringify(value)); const replay = await recordIngestion({ tenantId: String(configuration.tenant_id), source, eventId, payloadHash });
      if (replay.duplicate) return reply.code(200).send({ duplicate: true });
      const phone = value.callerPhone ? normalizeE164(value.callerPhone,'callerPhone') : '+10000000000';
      const channel = await db.execute(sql`SELECT c.*,p.id profile_resolved FROM callcommand_channels c LEFT JOIN callcommand_profiles p ON p.tenant_id=c.tenant_id AND p.id=c.profile_id WHERE c.tenant_id=${String(configuration.tenant_id)} AND c.status='active' AND c.deleted_at IS NULL ORDER BY c.created_at LIMIT 1`);
      if (!channel.rows[0] || !(channel.rows[0] as Row).profile_resolved) throw new CallCommandPhase35Error('Tenant has no active ingestion channel and receptionist profile','CALLCOMMAND_INGESTION_CHANNEL_UNAVAILABLE',409);
      const c = channel.rows[0] as Row; const call = await db.execute(sql`INSERT INTO callcommand_calls(tenant_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,subject_name,direction,purpose,provider,status,idempotency_key,transcript) VALUES (${configuration.tenant_id},${c.id},${c.profile_resolved},${phoneFingerprint(phone)},${maskPhone(phone)},${phone},${cleanText(value.customerName,'customerName',160,true)},'inbound','support',${source},'in_progress',${`ingest:${source}:${eventId}`},${cleanText(value.transcript,'transcript',40000,true)}) RETURNING *`);
      const callId = String((call.rows[0] as Row).id); await db.execute(sql`UPDATE callcommand_ingestion_events SET call_id=${callId},processed_at=NOW() WHERE tenant_id=${configuration.tenant_id} AND source=${source} AND provider_event_id=${eventId}`);
      await db.execute(sql`UPDATE callcommand_ingestion_tokens SET last_used_at=NOW() WHERE id=${configuration.id}`);
      let result: unknown = { call: camel(call.rows[0] as Row), processing: 'awaiting_transcript_or_audio' };
      let transcript = value.transcript ? cleanText(value.transcript,'transcript',40000) : null;
      if (!transcript && value.contentBase64) {
        const mime = String(value.mimeType ?? 'audio/mpeg');
        if (!['audio/mpeg','audio/wav','audio/mp4','audio/x-m4a'].includes(mime)) throw new CallCommandPhase35Error('Ingested audio MIME type is unsupported');
        const content = Buffer.from(cleanText(value.contentBase64,'contentBase64',70_000_000)!,'base64');
        if (!content.length || content.length > 52_428_800) throw new CallCommandPhase35Error('Ingested audio is outside the supported size limit');
        const attachment = await createAttachment({ tenantId:String(configuration.tenant_id),moduleId:await moduleId(),objectType:'call_recording',objectId:callId,originalName:cleanText(value.fileName,'fileName',240,true) ?? `${source}-${eventId}.mp3`,declaredMimeType:mime,content,createdByUserId:String(configuration.created_by_user_id),correlationId:request.id });
        const transcribed = await transcribeCallAudio(content,String((attachment as Row).original_name ?? `${source}-${eventId}.mp3`));
        transcript = transcribed.transcript;
        await db.execute(sql`UPDATE callcommand_calls SET recording_attachment_id=${String((attachment as Row).id)},recording_status='pending',updated_at=NOW() WHERE tenant_id=${configuration.tenant_id} AND id=${callId}`);
      }
      if (transcript) result = await processCall({ tenantId: String(configuration.tenant_id), userId: String(configuration.created_by_user_id), callId, transcript, mode: 'auto', correlationId: request.id });
      return reply.code(202).send({ duplicate: false, ...result as Row });
    } catch (error) { return fail(reply,error); }
  });

  for (const entity of ['tickets','leads','tasks'] as const) {
    app.patch(`${base}/${entity}/:id`, { preHandler: writes }, async (request, reply) => {
      try {
        const value = body(request);
        const status = cleanText(value.status,'status',24,true); const allowed = entity === 'leads' ? ['new','contacted','qualified','won','lost','archived'] : ['open','in_progress','completed','canceled'];
        if (status && !allowed.includes(status)) throw new CallCommandPhase35Error('status is invalid');
        const assigned = optionalId(value.assignedUserId,'assignedUserId');
        const result = entity === 'tickets'
          ? await db.execute(sql`UPDATE callcommand_tickets SET status=COALESCE(${status},status),assigned_user_id=COALESCE(${assigned},assigned_user_id),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id(request)} RETURNING *`)
          : entity === 'leads'
            ? await db.execute(sql`UPDATE callcommand_leads SET status=COALESCE(${status},status),assigned_user_id=COALESCE(${assigned},assigned_user_id),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id(request)} RETURNING *`)
            : await db.execute(sql`UPDATE callcommand_tasks SET status=COALESCE(${status},status),assigned_user_id=COALESCE(${assigned},assigned_user_id),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id(request)} RETURNING *`);
        if (!result.rows[0]) throw new CallCommandPhase35Error(`${entity.slice(0,-1)} was not found`,'CALLCOMMAND_OBJECT_NOT_FOUND',404);
        await activity(request,`callcommand.${entity.slice(0,-1)}.updated`,entity.slice(0,-1),id(request),`Updated generated ${entity.slice(0,-1)}`);
        return { [entity.slice(0,-1)]: camel(result.rows[0] as Row) };
      } catch (error) { return fail(reply,error); }
    });
  }

  app.patch(`${base}/switchboard/sessions/:id`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const result = await db.execute(sql`UPDATE callcommand_live_sessions SET operator_note=COALESCE(${cleanText(value.note,'note',2000,true)},operator_note),urgent=COALESCE(${typeof value.urgent === 'boolean' ? value.urgent : null},urgent),sequence=sequence+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id(request)} AND ended_at IS NULL RETURNING *`);
      if (!result.rows[0]) throw new CallCommandPhase35Error('Live session was not found','CALLCOMMAND_SESSION_NOT_FOUND',404);
      await activity(request,'callcommand.switchboard.updated','live_session',id(request),'Updated live switchboard state');
      return { session: camel(result.rows[0] as Row) };
    } catch (error) { return fail(reply,error); }
  });

  app.post(`${base}/simulate`, { preHandler: writes }, async (request, reply) => {
    try {
      const value=body(request); const channelId=optionalId(value.channelId,'channelId'); const profileId=optionalId(value.profileId,'profileId');
      if(!channelId||!profileId) throw new CallCommandPhase35Error('channelId and profileId are required');
      const configured=await db.execute(sql`SELECT c.*,p.id profile_resolved FROM callcommand_channels c JOIN callcommand_profiles p ON p.tenant_id=c.tenant_id AND p.id=${profileId} WHERE c.tenant_id=${tenant(request)} AND c.id=${channelId} AND c.deleted_at IS NULL LIMIT 1`);
      if(!configured.rows[0]) throw new CallCommandPhase35Error('Channel or profile was not found','CALLCOMMAND_CONFIGURATION_NOT_FOUND',404);
      const phone=normalizeE164(value.callerPhone ?? '+15555550100','callerPhone'); const simulationKey=cleanText(value.idempotencyKey,'idempotencyKey',160)!;
      const created=await db.execute(sql`INSERT INTO callcommand_calls(tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,subject_name,direction,purpose,provider,status,idempotency_key,recording_status) VALUES (${tenant(request)},${actor(request)},${channelId},${profileId},${phoneFingerprint(phone)},${maskPhone(phone)},${phone},${cleanText(value.callerName,'callerName',160,true)},'inbound','support','simulator','in_progress',${simulationKey},'disabled') ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET updated_at=NOW() RETURNING *`);
      const call=created.rows[0] as Row; const session=await db.execute(sql`INSERT INTO callcommand_live_sessions(tenant_id,call_id,channel_id,state,caller_phone_masked) VALUES (${tenant(request)},${call.id},${channelId},'intake',${maskPhone(phone)}) ON CONFLICT DO NOTHING RETURNING *`);
      let processed: unknown=null; if(value.transcript) processed=await processCall({tenantId:tenant(request),userId:actor(request),callId:String(call.id),transcript:cleanText(value.transcript,'transcript',40000)!,mode:'deterministic',correlationId:request.id});
      await activity(request,'callcommand.simulation.created','call',String(call.id),'Created an explicitly labeled deterministic live-call simulation');
      return reply.code(201).send({call:camel(call),session:session.rows[0]?camel(session.rows[0] as Row):null,processed,simulation:true,providerActionConfirmed:false});
    } catch(error){return fail(reply,error);}
  });

  app.post(`${base}/switchboard/sessions/:id/end`, { preHandler: writes }, async (request, reply) => {
    try {
      const result = await db.execute(sql`UPDATE callcommand_live_sessions SET state='completed',ended_at=NOW(),updated_at=NOW(),sequence=sequence+1 WHERE tenant_id=${tenant(request)} AND id=${id(request)} AND ended_at IS NULL RETURNING *`);
      if (!result.rows[0]) throw new CallCommandPhase35Error('Live session was not found','CALLCOMMAND_SESSION_NOT_FOUND',404);
      await activity(request,'callcommand.switchboard.ended','live_session',id(request),'Ended a live switchboard session');
      return { session: camel(result.rows[0] as Row) };
    } catch (error) { return fail(reply,error); }
  });

  app.post(`${base}/switchboard/sessions/:id/transfer`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request); const sessionId = id(request); const targetId = optionalId(value.targetId,'targetId'); if (!targetId) throw new CallCommandPhase35Error('targetId is required');
      const loaded = await db.execute(sql`SELECT s.*,t.kind,t.phone_e164,t.verified_at,t.status target_status FROM callcommand_live_sessions s JOIN callcommand_transfer_targets t ON t.tenant_id=s.tenant_id AND t.id=${targetId} WHERE s.tenant_id=${tenant(request)} AND s.id=${sessionId} AND s.ended_at IS NULL LIMIT 1`);
      if (!loaded.rows[0]) throw new CallCommandPhase35Error('Live session or transfer target was not found','CALLCOMMAND_TRANSFER_TARGET_NOT_FOUND',404);
      const row = loaded.rows[0] as Row;
      if (row.kind !== 'external' || !row.phone_e164 || !row.verified_at || row.target_status !== 'active') throw new CallCommandPhase35Error('Only verified active external targets can receive a provider transfer','CALLCOMMAND_TRANSFER_TARGET_UNAVAILABLE',409);
      const statusUrl = process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL ? new URL(`/v1/modules/callcommand-ai/twilio/voice/status?call_id=${row.call_id}`, process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL).toString() : null;
      const result = await redirectTwilioCall({ callSid: String(row.provider_call_sid ?? ''), targetPhoneE164: String(row.phone_e164), announce: 'Please hold while I connect your call.', statusCallbackUrl: statusUrl });
      await db.execute(sql`INSERT INTO callcommand_transfer_logs(tenant_id,call_id,session_id,target_id,requested_by_user_id,status,reason,provider_status,completed_at) VALUES (${tenant(request)},${row.call_id},${sessionId},${targetId},${actor(request)},${result.status},${result.reason},${result.providerStatus ?? null},NOW())`);
      await db.execute(sql`UPDATE callcommand_live_sessions SET state=${result.ok ? 'transferring' : 'failed'},sequence=sequence+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${sessionId}`);
      await activity(request,'callcommand.transfer.requested','live_session',sessionId,result.ok ? 'Twilio accepted a live call redirect' : 'Live transfer failed without reporting provider success',{ outcome: result.status });
      return reply.code(result.ok ? 200 : result.status === 'provider_unavailable' ? 503 : 502).send({ transfer: result, providerActionConfirmed: result.ok });
    } catch (error) { return fail(reply,error); }
  });

  app.post('/v1/modules/callcommand-ai/twilio/voice/incoming', async (request, reply) => {
    try {
      const value = await signedTwilio(request); const sid = parseTwilioCallSid(value.CallSid); const to = normalizeE164(value.To,'To'); const from = normalizeE164(value.From,'From');
      const configured = await db.execute(sql`SELECT c.*,p.greeting,p.intake_fields,p.id resolved_profile_id FROM callcommand_channels c JOIN callcommand_profiles p ON p.tenant_id=c.tenant_id AND p.id=c.profile_id WHERE c.phone_e164=${to} AND c.status='active' AND c.deleted_at IS NULL LIMIT 1`);
      if (!configured.rows[0]) return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>This line is unavailable.</Say><Hangup/></Response>');
      const channel = configured.rows[0] as Row; const fingerprint = phoneFingerprint(from); const key = `twilio:${sid}`;
      const inserted = await db.execute(sql`INSERT INTO callcommand_calls(tenant_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,direction,purpose,provider,provider_call_sid,status,idempotency_key,recording_status) VALUES (${channel.tenant_id},${channel.id},${channel.resolved_profile_id},${fingerprint},${maskPhone(from)},${from},'inbound','support','twilio',${sid},'in_progress',${key},${channel.recording_enabled ? 'pending' : 'disabled'}) ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET updated_at=NOW() RETURNING *`);
      const call = inserted.rows[0] as Row; await recordIngestion({ tenantId: String(channel.tenant_id), source:'twilio', eventId:`${sid}:incoming`, payloadHash:hashValue(JSON.stringify(value)), callId:String(call.id) });
      await db.execute(sql`INSERT INTO callcommand_live_sessions(tenant_id,call_id,channel_id,provider_call_sid,state,caller_phone_masked) VALUES (${channel.tenant_id},${call.id},${channel.id},${sid},${channel.require_recording_consent && channel.recording_enabled ? 'consent' : 'intake'},${maskPhone(from)}) ON CONFLICT DO NOTHING`);
      const consent = `/v1/modules/callcommand-ai/twilio/voice/consent?call_id=${encodeURIComponent(String(call.id))}`; const gather = `/v1/modules/callcommand-ai/twilio/voice/gather?call_id=${encodeURIComponent(String(call.id))}`; const recording = `/v1/modules/callcommand-ai/twilio/voice/recording?call_id=${encodeURIComponent(String(call.id))}`;
      let recordingUnavailable = false;
      if (channel.recording_enabled && !channel.require_recording_consent) {
        const started = await startTwilioCallRecording({ callSid: sid, recordingStatusCallbackUrl: recording });
        await db.execute(sql`UPDATE callcommand_calls SET recording_status=${started.ok ? 'pending' : 'failed'},recording_sid=${started.recordingSid ?? null},error_code=${started.ok ? null : 'RECORDING_PROVIDER_UNAVAILABLE'},updated_at=NOW() WHERE tenant_id=${channel.tenant_id} AND id=${call.id}`);
        recordingUnavailable = !started.ok;
      }
      const open = isWithinBusinessHours(channel.business_hours,new Date(),String(channel.timezone));
      const twiml = open
        ? buildIncomingTwiml({ greeting:`${channel.greeting}${recordingUnavailable ? ' Recording is currently unavailable; this call will continue without recording.' : ''}`,consentRequired:Boolean(channel.recording_enabled&&channel.require_recording_consent),consentAction:consent,gatherAction:gather,behavior:String(channel.live_behavior),forwardPhone:channel.forward_phone_e164,recordingCallback:recording })
        : buildAfterHoursTwiml({ behavior:String(channel.after_hours_behavior),greeting:`${channel.greeting} We are currently closed.`,forwardPhone:channel.forward_phone_e164,gatherAction:gather,recordingCallback:recording });
      return sendTwiml(reply,twiml);
    } catch (error) { if ((error as any)?.statusCode === 403) return reply.code(403).send({ error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID' }); return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>This line is temporarily unavailable.</Say><Hangup/></Response>'); }
  });

  app.post('/v1/modules/callcommand-ai/twilio/voice/consent', async (request, reply) => {
    try {
      const value = await signedTwilio(request); const sid = parseTwilioCallSid(value.CallSid); const call = await loadProviderCall(sid,String((request.query as Row)?.call_id ?? '')); if (!call) throw new CallCommandPhase35Error('Call not found','CALLCOMMAND_CALL_NOT_FOUND',404);
      const eventId = `${sid}:consent:${value.Digits || (String((request.query as Row)?.timeout)==='1' ? 'timeout' : 'none')}`; const replay = await recordIngestion({ tenantId:String(call.tenant_id),source:'twilio',eventId,payloadHash:hashValue(JSON.stringify(value)),callId:String(call.id) });
      const gather = `/v1/modules/callcommand-ai/twilio/voice/gather?call_id=${encodeURIComponent(String(call.id))}`; const recording = `/v1/modules/callcommand-ai/twilio/voice/recording?call_id=${encodeURIComponent(String(call.id))}`;
      if (value.Digits === '1') {
        if (replay.duplicate) return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" timeout="6" action="${xml(gather)}" method="POST"><Say>Thank you. How may I help you today?</Say></Gather><Hangup/></Response>`);
        const started = await startTwilioCallRecording({ callSid: sid, recordingStatusCallbackUrl: recording });
        await db.execute(sql`UPDATE callcommand_calls SET recording_status=${started.ok ? 'pending' : 'failed'},recording_sid=${started.recordingSid ?? null},error_code=${started.ok ? null : 'RECORDING_PROVIDER_UNAVAILABLE'},updated_at=NOW() WHERE tenant_id=${call.tenant_id} AND id=${call.id}`);
        await db.execute(sql`UPDATE callcommand_ingestion_events SET status=${started.ok ? 'provider_confirmed' : started.status},processed_at=NOW() WHERE tenant_id=${call.tenant_id} AND source='twilio' AND provider_event_id=${eventId}`);
        await db.execute(sql`UPDATE callcommand_live_sessions SET state='intake',sequence=sequence+1,updated_at=NOW() WHERE tenant_id=${call.tenant_id} AND call_id=${call.id} AND ended_at IS NULL`);
        return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" timeout="6" action="${xml(gather)}" method="POST"><Say>${started.ok ? 'Thank you. How may I help you today?' : 'Recording could not be started. This call will continue without recording. How may I help you today?'}</Say></Gather><Hangup/></Response>`);
      }
      if (value.Digits === '2') {
        await db.execute(sql`UPDATE callcommand_calls SET recording_status='disabled',updated_at=NOW() WHERE tenant_id=${call.tenant_id} AND id=${call.id}`);
        return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" timeout="6" action="${xml(gather)}" method="POST"><Say>Recording is off. How may I help you today?</Say></Gather><Hangup/></Response>`);
      }
      await db.execute(sql`UPDATE callcommand_calls SET status='blocked',error_code='CONSENT_NO_RESPONSE',completed_at=NOW(),updated_at=NOW() WHERE tenant_id=${call.tenant_id} AND id=${call.id}`);
      return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>Consent was not received. This call will end now.</Say><Hangup/></Response>');
    } catch (error) { return (error as any)?.statusCode === 403 ? reply.code(403).send({error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID'}) : sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>This request is unavailable.</Say><Hangup/></Response>'); }
  });

  app.post('/v1/modules/callcommand-ai/twilio/voice/gather', async (request, reply) => {
    try {
      const value = await signedTwilio(request); const sid = parseTwilioCallSid(value.CallSid); const call = await loadProviderCall(sid,String((request.query as Row)?.call_id ?? '')); if (!call) throw new CallCommandPhase35Error('Call not found','CALLCOMMAND_CALL_NOT_FOUND',404);
      const loaded = await db.execute(sql`SELECT s.*,p.intake_fields,p.product_mode FROM callcommand_live_sessions s JOIN callcommand_profiles p ON p.tenant_id=s.tenant_id AND p.id=${call.profile_id} WHERE s.tenant_id=${call.tenant_id} AND s.call_id=${call.id} AND s.ended_at IS NULL LIMIT 1`);
      if (!loaded.rows[0]) throw new CallCommandPhase35Error('Live session not found','CALLCOMMAND_SESSION_NOT_FOUND',404);
      const session = loaded.rows[0] as Row; const speech = cleanText(value.SpeechResult,'SpeechResult',500,true); if (!speech) { await db.execute(sql`UPDATE callcommand_live_sessions SET state='failed',ended_at=NOW(),updated_at=NOW() WHERE tenant_id=${call.tenant_id} AND id=${session.id}`); return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>We did not receive a response. Goodbye.</Say><Hangup/></Response>'); }
      const schema = normalizeIntakeSchema(session.intake_fields ?? []); const collected = { ...(session.collected_data ?? {}) }; const current = collected._lastQuestionKey ? schema.find(field=>field.key===collected._lastQuestionKey) : nextIntakeQuestion(schema,collected);
      const transcript = `${session.transcript_tail || ''}\nCaller: ${speech}`.trim().slice(-12000);
      delete collected._lastQuestionKey;
      const decision=await decideReceptionistTurn({productMode:String(session.product_mode ?? 'general'),schema,collected,currentField:current ?? null,speech,transcript});
      Object.assign(collected,decision.collected); const next=decision.next;
      if (next) {
        collected._lastQuestionKey=next.key; await db.execute(sql`UPDATE callcommand_live_sessions SET collected_data=${JSON.stringify(collected)}::jsonb,transcript_tail=${transcript},state='intake',sequence=sequence+1,updated_at=NOW() WHERE tenant_id=${call.tenant_id} AND id=${session.id}`);
        const action = `/v1/modules/callcommand-ai/twilio/voice/gather?call_id=${encodeURIComponent(String(call.id))}`; return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" timeout="6" action="${xml(action)}" method="POST"><Say>${xml(decision.publicResponse)}</Say></Gather><Hangup/></Response>`);
      }
      await db.execute(sql`UPDATE callcommand_live_sessions SET collected_data=${JSON.stringify(collected)}::jsonb,transcript_tail=${transcript},state='completed',ended_at=NOW(),sequence=sequence+1,updated_at=NOW() WHERE tenant_id=${call.tenant_id} AND id=${session.id}`);
      await processCall({ tenantId:String(call.tenant_id),userId:String(call.created_by_user_id ?? (await db.execute(sql`SELECT user_id FROM tenant_memberships WHERE tenant_id=${call.tenant_id} AND status='active' ORDER BY created_at LIMIT 1`)).rows[0]?.user_id),callId:String(call.id),transcript,mode:'auto',correlationId:request.id });
      return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you. Your request has been recorded and routed. Goodbye.</Say><Hangup/></Response>');
    } catch (error) { return (error as any)?.statusCode === 403 ? reply.code(403).send({error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID'}) : sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>This request is temporarily unavailable.</Say><Hangup/></Response>'); }
  });

  app.post('/v1/modules/callcommand-ai/twilio/voice/recording', async (request, reply) => {
    try {
      const value = await signedTwilio(request); const sid = parseTwilioCallSid(value.CallSid); const call = await loadProviderCall(sid,String((request.query as Row)?.call_id ?? '')); if (!call) throw new CallCommandPhase35Error('Call not found','CALLCOMMAND_CALL_NOT_FOUND',404);
      if (call.recording_status === 'disabled') throw new CallCommandPhase35Error('Recording was not consented','CALLCOMMAND_RECORDING_NOT_CONSENTED',409);
      const recordingSid = String(value.RecordingSid ?? ''); if (!/^RE[A-Za-z0-9]{20,62}$/.test(recordingSid)) throw new CallCommandPhase35Error('Recording identifier is invalid');
      const replay = await recordIngestion({ tenantId:String(call.tenant_id),source:'twilio',eventId:`${sid}:recording:${recordingSid}`,payloadHash:hashValue(JSON.stringify(value)),callId:String(call.id) }); if (replay.duplicate) return { ok:true,duplicate:true };
      const content = await fetchTwilioRecording(recordingSid); if (!content) throw Object.assign(new Error('Twilio recording download was unavailable'),{code:'CALLCOMMAND_RECORDING_PROVIDER_UNAVAILABLE'});
      const creator = String(call.created_by_user_id ?? (await db.execute(sql`SELECT user_id FROM tenant_memberships WHERE tenant_id=${call.tenant_id} AND status='active' ORDER BY created_at LIMIT 1`)).rows[0]?.user_id ?? '');
      if (!creator) throw new CallCommandPhase35Error('Tenant has no active recording custodian','CALLCOMMAND_RECORDING_CUSTODIAN_MISSING',409);
      const attachment = await createAttachment({ tenantId:String(call.tenant_id),moduleId:await moduleId(),objectType:'call_recording',objectId:String(call.id),originalName:`twilio-${recordingSid}.mp3`,declaredMimeType:'audio/mpeg',content,createdByUserId:creator,correlationId:request.id });
      let transcript = await fetchTwilioTranscription(recordingSid); let transcriptionProvider = 'twilio';
      if (!transcript) { const result = await transcribeCallAudio(content,`twilio-${recordingSid}.mp3`); transcript=result.transcript; transcriptionProvider=result.provider; }
      await db.execute(sql`UPDATE callcommand_calls SET recording_sid=${recordingSid},recording_attachment_id=${String((attachment as Row).id)},recording_status='pending',transcript=${transcript},updated_at=NOW() WHERE tenant_id=${call.tenant_id} AND id=${call.id}`);
      await processCall({ tenantId:String(call.tenant_id),userId:creator,callId:String(call.id),transcript,mode:'auto',correlationId:request.id });
      return reply.code(202).send({ ok:true,duplicate:false,recording:{ attachmentId:String((attachment as Row).id),scanStatus:(attachment as Row).scan_status ?? 'pending' },transcription:{ provider:transcriptionProvider,status:'completed' } });
    } catch (error) { if ((error as any)?.statusCode === 403) return reply.code(403).send({error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID'}); const code=String((error as any)?.code ?? 'CALLCOMMAND_RECORDING_FAILED'); return reply.code(code.includes('UNAVAILABLE') ? 503 : 400).send({error:(error as Error).message,code,providerActionConfirmed:false}); }
  });

  app.post('/v1/modules/callcommand-ai/twilio/voice/status', async (request, reply) => {
    try {
      const value = await signedTwilio(request); const sid=parseTwilioCallSid(value.CallSid); const call=await loadProviderCall(sid,String((request.query as Row)?.call_id ?? '')); if(!call) throw new CallCommandPhase35Error('Call not found','CALLCOMMAND_CALL_NOT_FOUND',404);
      const terminal=['completed','failed','busy','no-answer','canceled'].includes(String(value.CallStatus)); const state=terminal ? (value.CallStatus==='completed'?'completed':'failed') : value.CallStatus==='in-progress'?'connected':'ringing';
      await recordIngestion({tenantId:String(call.tenant_id),source:'twilio',eventId:`${sid}:status:${value.SequenceNumber || hashValue(JSON.stringify(value)).slice(0,16)}`,payloadHash:hashValue(JSON.stringify(value)),callId:String(call.id)});
      await db.execute(sql`UPDATE callcommand_live_sessions SET state=${state},sequence=sequence+1,updated_at=NOW(),ended_at=${terminal?new Date():null} WHERE tenant_id=${call.tenant_id} AND call_id=${call.id} AND ended_at IS NULL`);
      return {ok:true};
    } catch(error){ return (error as any)?.statusCode===403?reply.code(403).send({error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID'}):reply.code(400).send({error:(error as Error).message,code:(error as any)?.code??'CALLCOMMAND_STATUS_FAILED'}); }
  });
}
