import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  assertCallStateTransition,
  canonicalJson,
  hashAuditEvent,
  safeCorrelationToken,
  type AssuranceLevel,
  type CallState,
  type IntakeSuggestion,
} from './callcommand-msp.js';

export type MspRow = Record<string, any>;
export type MspExecutor = Pick<typeof db, 'execute'>;

export async function callCommandModuleId(executor: MspExecutor = db): Promise<string> {
  const result = await executor.execute(sql`SELECT id FROM modules WHERE slug='callcommand-ai' LIMIT 1`);
  if (!result.rows[0]) throw Object.assign(new Error('CallCommand module registry is unavailable'), { code: 'CALLCOMMAND_MODULE_UNAVAILABLE' });
  return String((result.rows[0] as MspRow).id);
}

export function camelMsp(row: MspRow): MspRow {
  const omitted = new Set([
    'tenant_id', 'lookup_hmac', 'phone_secret_reference_id', 'secret_reference_id',
    'destination_secret_reference_id', 'hostname_secret_reference_id', 'upn_secret_reference_id',
    'token_hash', 'safe_payload',
  ]);
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => !omitted.has(key))
    .map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
}

export async function appendMspCallEvent(input: {
  tenantId: string;
  callContextId: string;
  eventType: string;
  actorType: 'PROVIDER' | 'CALLER' | 'SYSTEM' | 'TECHNICIAN' | 'MSP_ADMIN';
  actorId?: string | null;
  outcome: string;
  policyVersion?: string | null;
  evidence?: MspRow;
  correlationIds?: MspRow;
}, executor: MspExecutor = db): Promise<MspRow> {
  await executor.execute(sql`SELECT id FROM callcommand_msp_call_contexts WHERE tenant_id=${input.tenantId} AND id=${input.callContextId} FOR UPDATE`);
  const previous = await executor.execute(sql`
    SELECT sequence,event_hash FROM callcommand_msp_call_events
    WHERE tenant_id=${input.tenantId} AND call_context_id=${input.callContextId}
    ORDER BY sequence DESC LIMIT 1
  `);
  const previousRow = previous.rows[0] as MspRow | undefined;
  const sequence = Number(previousRow?.sequence ?? 0) + 1;
  const occurredAt = new Date().toISOString();
  const evidence = input.evidence ?? {};
  const correlationIds = input.correlationIds ?? {};
  const event = {
    tenantId: input.tenantId,
    callContextId: input.callContextId,
    sequence,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    outcome: input.outcome,
    policyVersion: input.policyVersion ?? null,
    evidence,
    correlationIds,
    occurredAt,
  };
  const eventHash = hashAuditEvent(previousRow?.event_hash ? String(previousRow.event_hash) : null, event);
  const inserted = await executor.execute(sql`
    INSERT INTO callcommand_msp_call_events(
      tenant_id,call_context_id,sequence,event_type,actor_type,actor_id,outcome,
      policy_version,evidence,correlation_ids,previous_event_hash,event_hash,created_at
    ) VALUES (
      ${input.tenantId},${input.callContextId},${sequence},${input.eventType},${input.actorType},${input.actorId ?? null},${input.outcome},
      ${input.policyVersion ?? null},${JSON.stringify(evidence)}::jsonb,${JSON.stringify(correlationIds)}::jsonb,
      ${previousRow?.event_hash ?? null},${eventHash},${occurredAt}
    ) RETURNING *
  `);
  return inserted.rows[0] as MspRow;
}

const TERMINAL_STATES = new Set<CallState>(['COMPLETED', 'ABANDONED', 'TRANSFERRED', 'DENIED', 'LOCKED', 'FAILED']);

export async function transitionMspCall(input: {
  tenantId: string;
  callContextId: string;
  to: CallState;
  eventType: string;
  actorType?: 'PROVIDER' | 'CALLER' | 'SYSTEM' | 'TECHNICIAN' | 'MSP_ADMIN';
  actorId?: string | null;
  outcome?: string;
  organizationId?: string | null;
  contactId?: string | null;
  originatingLineId?: string | null;
  assuranceLevel?: AssuranceLevel;
  riskFlags?: string[];
  intent?: string | null;
  intentConfidence?: number | null;
  requestedActionHint?: string | null;
  evidence?: MspRow;
  correlationIds?: MspRow;
  policyVersion?: string | null;
}, executor: MspExecutor = db): Promise<MspRow> {
  const loaded = await executor.execute(sql`
    SELECT * FROM callcommand_msp_call_contexts
    WHERE tenant_id=${input.tenantId} AND id=${input.callContextId} FOR UPDATE
  `);
  const current = loaded.rows[0] as MspRow | undefined;
  if (!current) throw Object.assign(new Error('Call context was not found'), { code: 'CALLCOMMAND_CONTEXT_NOT_FOUND', statusCode: 404 });
  if (current.state === input.to) return current;
  assertCallStateTransition(String(current.state), input.to);
  const result = await executor.execute(sql`
    UPDATE callcommand_msp_call_contexts SET
      state=${input.to},
      organization_id=COALESCE(${input.organizationId ?? null},organization_id),
      contact_id=COALESCE(${input.contactId ?? null},contact_id),
      originating_line_id=COALESCE(${input.originatingLineId ?? null},originating_line_id),
      assurance_level=COALESCE(${input.assuranceLevel ?? null},assurance_level),
      risk_flags=CASE WHEN ${input.riskFlags ? JSON.stringify(input.riskFlags) : null}::jsonb IS NULL THEN risk_flags ELSE ${input.riskFlags ? JSON.stringify(input.riskFlags) : null}::jsonb END,
      intent=COALESCE(${input.intent ?? null},intent),
      intent_confidence=COALESCE(${input.intentConfidence ?? null},intent_confidence),
      requested_action_hint=COALESCE(${input.requestedActionHint ?? null},requested_action_hint),
      ended_at=CASE WHEN ${TERMINAL_STATES.has(input.to)} THEN NOW() ELSE ended_at END,
      updated_at=NOW()
    WHERE tenant_id=${input.tenantId} AND id=${input.callContextId}
    RETURNING *
  `);
  await appendMspCallEvent({
    tenantId: input.tenantId,
    callContextId: input.callContextId,
    eventType: input.eventType,
    actorType: input.actorType ?? 'SYSTEM',
    actorId: input.actorId,
    outcome: input.outcome ?? input.to,
    policyVersion: input.policyVersion,
    evidence: { from: current.state, to: input.to, ...(input.evidence ?? {}) },
    correlationIds: input.correlationIds,
  }, executor);
  return result.rows[0] as MspRow;
}

export async function recordMspWebhookReceipt(input: {
  tenantId: string;
  providerCallId: string;
  stage: string;
  payload: MspRow;
  callId?: string | null;
}, executor: MspExecutor = db): Promise<{ duplicate: boolean }> {
  const payloadHash = createHash('sha256').update(canonicalJson(input.payload)).digest('hex');
  const eventId = `${input.providerCallId}:${input.stage}`.slice(0, 200);
  const result = await executor.execute(sql`
    INSERT INTO callcommand_ingestion_events(tenant_id,source,provider_event_id,payload_sha256,call_id,status,processed_at)
    VALUES (${input.tenantId},'twilio',${eventId},${payloadHash},${input.callId ?? null},'processed',NOW())
    ON CONFLICT (tenant_id,source,provider_event_id) DO NOTHING RETURNING id
  `);
  return { duplicate: !result.rows[0] };
}

export async function consumeMspRateLimit(input: {
  tenantId: string;
  scope: string;
  subjectHmac: string;
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
}, executor: MspExecutor = db): Promise<{ allowed: boolean; count: number; blockedUntil: Date | null }> {
  const result = await executor.execute(sql`
    INSERT INTO callcommand_msp_rate_limits(tenant_id,scope,subject_hmac,window_started_at,window_seconds,attempt_count)
    VALUES (${input.tenantId},${input.scope},${input.subjectHmac},NOW(),${input.windowSeconds},1)
    ON CONFLICT (tenant_id,scope,subject_hmac) DO UPDATE SET
      attempt_count=CASE
        WHEN callcommand_msp_rate_limits.window_started_at + make_interval(secs => callcommand_msp_rate_limits.window_seconds) <= NOW() THEN 1
        ELSE callcommand_msp_rate_limits.attempt_count + 1
      END,
      window_started_at=CASE
        WHEN callcommand_msp_rate_limits.window_started_at + make_interval(secs => callcommand_msp_rate_limits.window_seconds) <= NOW() THEN NOW()
        ELSE callcommand_msp_rate_limits.window_started_at
      END,
      window_seconds=${input.windowSeconds},
      blocked_until=CASE
        WHEN (CASE WHEN callcommand_msp_rate_limits.window_started_at + make_interval(secs => callcommand_msp_rate_limits.window_seconds) <= NOW() THEN 1 ELSE callcommand_msp_rate_limits.attempt_count + 1 END) > ${input.limit}
          THEN NOW() + make_interval(secs => ${input.blockSeconds})
        ELSE callcommand_msp_rate_limits.blocked_until
      END,
      updated_at=NOW()
    RETURNING attempt_count,blocked_until
  `);
  const row = result.rows[0] as MspRow;
  const blockedUntil = row.blocked_until ? new Date(row.blocked_until) : null;
  return { allowed: !blockedUntil || blockedUntil <= new Date(), count: Number(row.attempt_count), blockedUntil };
}

export async function createLocalCase(input: {
  tenantId: string;
  callContextId: string;
  organizationId?: string | null;
  contactId?: string | null;
  suggestion: IntakeSuggestion;
}, executor: MspExecutor = db): Promise<MspRow> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = safeCorrelationToken();
    try {
      const result = await executor.execute(sql`
        INSERT INTO callcommand_local_cases(
          tenant_id,call_context_id,reference,organization_id,contact_id,status,intent,summary,priority,bms_sync_status
        ) VALUES (
          ${input.tenantId},${input.callContextId},${reference},${input.organizationId ?? null},${input.contactId ?? null},'OPEN',
          ${input.suggestion.intent},${input.suggestion.summary},${input.suggestion.urgencyHint === 'urgent' ? 'URGENT' : input.suggestion.urgencyHint === 'high' ? 'HIGH' : 'NORMAL'},'PENDING'
        ) ON CONFLICT (tenant_id,call_context_id) DO UPDATE SET updated_at=NOW()
        RETURNING *
      `);
      return result.rows[0] as MspRow;
    } catch (error) {
      if ((error as any)?.code !== '23505' || attempt === 4) throw error;
    }
  }
  throw new Error('Local case reference could not be allocated');
}

export async function queueBmsTicket(input: {
  tenantId: string;
  callContextId: string;
  localCaseId: string;
  organizationId?: string | null;
  contactId?: string | null;
}, executor: MspExecutor = db): Promise<{ status: string; integration?: MspRow | null }> {
  const integration = await executor.execute(sql`
    SELECT * FROM automation_fabric_integrations
    WHERE tenant_id=${input.tenantId} AND provider_type='BMS'
      AND (organization_id=${input.organizationId ?? null} OR organization_id IS NULL)
    ORDER BY organization_id NULLS LAST LIMIT 1
  `);
  const provider = integration.rows[0] as MspRow | undefined;
  const idempotencyKey = `bms-ticket:${input.callContextId}`;
  await executor.execute(sql`
    INSERT INTO callcommand_integration_outbox(tenant_id,call_context_id,local_case_id,kind,idempotency_key,safe_payload,status,last_error_code)
    VALUES (
      ${input.tenantId},${input.callContextId},${input.localCaseId},'BMS_TICKET_SYNC',${idempotencyKey},
      ${JSON.stringify({ localCaseId: input.localCaseId, organizationId: input.organizationId ?? null, contactId: input.contactId ?? null })}::jsonb,
      ${provider?.status === 'READY' && !provider?.kill_switch ? 'PENDING' : 'BLOCKED'},
      ${provider ? provider.kill_switch ? 'BMS_KILL_SWITCH_ACTIVE' : provider.status === 'READY' ? null : String(provider.health_reason_code ?? 'BMS_NOT_READY') : 'BMS_NOT_CONFIGURED'}
    ) ON CONFLICT (tenant_id,kind,idempotency_key) DO NOTHING
  `);
  const testMode = provider?.mode === 'TEST' && process.env.APP_ENV === 'test';
  if (testMode) {
    const externalId = `test-bms-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 12)}`;
    await executor.execute(sql`
      INSERT INTO callcommand_bms_ticket_links(tenant_id,local_case_id,integration_id,external_ticket_id,external_ticket_number,correlation_id,sync_status,last_sync_at)
      VALUES (${input.tenantId},${input.localCaseId},${provider.id},${externalId},${`TEST-${externalId.slice(-6).toUpperCase()}`},${idempotencyKey},'TEST_RECORDED',NOW())
      ON CONFLICT (tenant_id,local_case_id) DO NOTHING
    `);
    await executor.execute(sql`UPDATE callcommand_local_cases SET bms_sync_status='TEST_RECORDED',updated_at=NOW() WHERE tenant_id=${input.tenantId} AND id=${input.localCaseId}`);
    await executor.execute(sql`UPDATE callcommand_integration_outbox SET status='COMPLETED',completed_at=NOW(),updated_at=NOW(),last_error_code=NULL WHERE tenant_id=${input.tenantId} AND kind='BMS_TICKET_SYNC' AND idempotency_key=${idempotencyKey}`);
    return { status: 'TEST_RECORDED', integration: provider };
  }
  // Live BMS remains queued until tenant Swagger fingerprint, mappings and
  // credentials have passed onboarding. A worker adapter may consume this row;
  // no request path invents a provider ticket number.
  await executor.execute(sql`UPDATE callcommand_local_cases SET bms_sync_status=${provider?.status === 'READY' && !provider?.kill_switch ? 'QUEUED' : 'BLOCKED'},updated_at=NOW() WHERE tenant_id=${input.tenantId} AND id=${input.localCaseId}`);
  return { status: provider?.status === 'READY' && !provider?.kill_switch ? 'QUEUED' : 'BLOCKED', integration: provider ?? null };
}
