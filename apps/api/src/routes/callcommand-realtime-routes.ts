import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  authorizeCallCommandTool,
  compileCallCommandInstructions,
  reconcileCallCommandRealtimeUsage,
  releaseCallCommandLane,
  type CallCommandRealtimeModel as MeteredRealtimeModel,
} from '../lib/callcommand-capacity.js';
import {
  buildOpenAiRealtimeAcceptConfig,
  type AllowlistedRealtimeTool,
  type SupportedRealtimeVoice,
} from '../lib/callcommand-number-provider.js';
import {
  CallCommandRealtimeError,
  OpenAiRealtimeSipAdapter,
  type CallCommandRealtimeProviderErrorEvent,
  type CallCommandRealtimeTranscriptEvent,
  type CallCommandRealtimeUsageEvent,
  type RealtimeSidebandCallbacks,
  type RealtimeToolInvocation,
  type VerifiedOpenAiIncomingCall,
} from '../lib/callcommand-realtime.js';
import {
  hasCallCommandRealtimeSideband,
  registerCallCommandRealtimeSideband,
} from '../lib/callcommand-realtime-session-registry.js';
import {
  callCommandAutomationRuleMatches,
  dispatchCallCommandActions,
  isRealtimeCallEligible,
  realtimeConsentRequired,
  realtimeRecordingEnabled,
} from './callcommand-phase35-routes.js';

const ROUTE = '/v1/modules/callcommand-ai/openai/realtime/incoming';
const ACTIVE_CALL_STATES = new Set(['ringing', 'in_progress', 'answered', 'connected']);
const SUCCESSFUL_ACTION_STATES = new Set(['completed', 'delivered', 'queued', 'test_recorded']);
const VOICES = new Set<SupportedRealtimeVoice>(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
const ACTION_TO_TOOL = {
  ticket: { name: 'create_ticket', authority: 'ticket.create' },
  lead: { name: 'create_lead', authority: 'lead.create' },
  task: { name: 'create_task', authority: 'task.create' },
  email: { name: 'send_email', authority: 'email.send' },
  slack: { name: 'send_slack_alert', authority: 'slack.send' },
  webhook: { name: 'create_webhook_event', authority: 'webhook.enqueue' },
} as const;

type Row = Record<string, any>;
type RealtimeAdapter = Pick<OpenAiRealtimeSipAdapter,
  'readiness' | 'verifyRouteToken' | 'unwrapIncomingCall' | 'accept' | 'reject' | 'refer' | 'hangup' | 'connectSideband'>;
type AdapterFactory = () => RealtimeAdapter;

let adapterFactory: AdapterFactory = () => new OpenAiRealtimeSipAdapter();

/** Test seam. Production always uses the bounded OpenAI adapter. */
export function __setCallCommandRealtimeAdapterFactoryForTests(factory: AdapterFactory | null): void {
  adapterFactory = factory ?? (() => new OpenAiRealtimeSipAdapter());
}

function safeText(value: unknown, maximum: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maximum);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function rawBody(request: FastifyRequest): Buffer {
  const value = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
  if (!Buffer.isBuffer(value) || value.length < 2 || value.length > 1_048_576) {
    throw new CallCommandRealtimeError('OpenAI webhook body is invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID', 400);
  }
  return value;
}

function safeFailure(reply: FastifyReply, error: unknown) {
  const value = error as any;
  if (value instanceof CallCommandRealtimeError || (Number(value?.statusCode) >= 400 && Number(value?.statusCode) < 600)) {
    return reply.code(Number(value.statusCode) || 503).send({
      error: value instanceof CallCommandRealtimeError ? value.message : 'CallCommand Realtime request failed',
      code: String(value.code ?? 'CALLCOMMAND_REALTIME_FAILED').slice(0, 120),
      providerActionConfirmed: false,
    });
  }
  throw error;
}

function asActions(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Row[]
    : [];
}

function activeFlowActions(value: unknown): Row[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const nodes = Array.isArray((value as Row).nodes) ? (value as Row).nodes as Row[] : [];
  return nodes
    .filter(node => node?.type === 'action' && node.config && typeof node.config === 'object' && !Array.isArray(node.config))
    .map(node => ({ ...(node.config as Row), actionType: String((node.config as Row).actionType ?? '') }));
}

function closedObjectSchema(properties: Row, required: string[] = []): Row {
  return { type: 'object', properties, required, additionalProperties: false };
}

function buildToolBindings(input: { actions: Row[]; transferTargets: Row[]; transferEnabled: boolean }) {
  const actionBindings = new Map<string, Row[]>();
  const tools: AllowlistedRealtimeTool[] = [];
  for (const [actionType, mapping] of Object.entries(ACTION_TO_TOOL)) {
    const configured = input.actions.filter(action => action.enabled !== false
      && String(action.actionType ?? action.type ?? '') === actionType);
    if (!configured.length) continue;
    actionBindings.set(mapping.name, configured);
    const createsObject = ['ticket', 'lead', 'task'].includes(actionType);
    tools.push({
      type: 'function',
      name: mapping.name,
      description: createsObject
        ? `Create the configured ${actionType} only after the caller has supplied enough information.`
        : `Send the tenant-configured ${actionType} notification. The server owns the destination.`,
      parameters: closedObjectSchema({
        summary: { type: 'string', minLength: 1, maxLength: 1_500 },
        ...(createsObject ? { priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] } } : {}),
      }, ['summary']) as AllowlistedRealtimeTool['parameters'],
    });
  }

  const targetAliases = new Map<string, string>();
  if (input.transferEnabled && input.transferTargets.length) {
    input.transferTargets.slice(0, 20).forEach((target, index) => targetAliases.set(`target_${index + 1}`, String(target.id)));
    tools.push({
      type: 'function',
      name: 'transfer_call',
      description: 'Transfer this active call to one server-verified business destination.',
      parameters: closedObjectSchema({
        target: { type: 'string', enum: [...targetAliases.keys()] },
        reason: { type: 'string', minLength: 1, maxLength: 500 },
      }, ['target', 'reason']) as AllowlistedRealtimeTool['parameters'],
    });
  }
  tools.push({
    type: 'function',
    name: 'end_call',
    description: 'End the current call after politely confirming that no more help is needed.',
    parameters: closedObjectSchema({ reason: { type: 'string', minLength: 1, maxLength: 500 } }, ['reason']) as AllowlistedRealtimeTool['parameters'],
  });
  return { tools, actionBindings, targetAliases };
}

async function loadAuthority(callId: string): Promise<Row | null> {
  const result = await db.execute(sql`
    SELECT
      c.*,
      channel.status AS channel_status,
      channel.routing_mode,
      channel.product_mode,
      channel.active_flow_id,
      channel.live_behavior,
      channel.after_hours_behavior,
      channel.business_hours,
      channel.timezone,
      channel.recording_enabled,
      channel.require_recording_consent,
      profile.status AS profile_status,
      profile.name AS profile_name,
      profile.business_name,
      profile.department_name,
      profile.personality,
      profile.agent_purpose,
      profile.business_description,
      profile.greeting AS profile_greeting,
      profile.script AS profile_script,
      profile.primary_language,
      profile.additional_languages,
      profile.business_hours_config,
      profile.holiday_schedule,
      profile.fallback_behavior,
      profile.voicemail_greeting,
      profile.after_hours_instructions,
      profile.data_permissions,
      profile.recording_policy,
      profile.transcription_policy,
      profile.advanced_prompt,
      profile.voice_id,
      settings.realtime_enabled,
      (
        account.id IS NOT NULL AND account.status='active' AND account.health_status='healthy'
        AND secret.id IS NOT NULL AND secret.revoked_at IS NULL
        AND channel.provider_number_sid IS NOT NULL AND channel.provider_number_status='active'
        AND channel.provider_verified_at IS NOT NULL
        AND channel.health_status='healthy' AND channel.health_checked_at IS NOT NULL
      ) AS commercial_realtime_ready,
      lease.id AS active_lease_id
    FROM callcommand_calls c
    JOIN callcommand_channels channel
      ON channel.tenant_id=c.tenant_id AND channel.id=c.channel_id AND channel.deleted_at IS NULL
    JOIN callcommand_profiles profile
      ON profile.tenant_id=c.tenant_id AND profile.id=c.profile_id AND profile.deleted_at IS NULL
    LEFT JOIN callcommand_telephony_accounts account
      ON account.tenant_id=channel.tenant_id AND account.id=channel.telephony_account_id AND account.archived_at IS NULL
    LEFT JOIN shared_secret_references secret
      ON secret.tenant_id=account.tenant_id AND secret.id=account.secret_reference_id
    JOIN modules module ON module.slug='callcommand-ai' AND module.status='live'
    JOIN tenant_modules tenant_module
      ON tenant_module.tenant_id=c.tenant_id AND tenant_module.module_id=module.id
      AND tenant_module.status='enabled'
    LEFT JOIN callcommand_tenant_runtime_settings settings ON settings.tenant_id=c.tenant_id
    LEFT JOIN callcommand_lane_leases lease
      ON lease.tenant_id=c.tenant_id AND lease.call_id=c.id
      AND lease.status='active' AND lease.expires_at>NOW()
    WHERE c.id=${callId} AND c.provider='twilio' AND c.direction='inbound'
    LIMIT 1
  `);
  return (result.rows[0] as Row | undefined) ?? null;
}

async function safeReject(adapter: RealtimeAdapter, openAiCallId: string, statusCode: 480 | 486 | 603): Promise<void> {
  try { await adapter.reject(openAiCallId, statusCode); } catch { /* signed webhook still receives a safe local failure */ }
}

async function claimIncomingEvent(input: {
  authority: Row;
  incoming: VerifiedOpenAiIncomingCall;
  payloadSha256: string;
}) {
  const processingOwner = randomUUID();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-realtime:${input.authority.id}`},0))`);
    const locked = (await tx.execute(sql`
      SELECT openai_realtime_call_id,realtime_status FROM callcommand_calls
      WHERE tenant_id=${input.authority.tenant_id} AND id=${input.authority.id} FOR UPDATE
    `)).rows[0] as Row | undefined;
    if (!locked) throw new CallCommandRealtimeError('Call was not found', 'CALLCOMMAND_REALTIME_CALL_NOT_FOUND', 404);
    if (locked.openai_realtime_call_id && String(locked.openai_realtime_call_id) !== input.incoming.openAiCallId) {
      throw new CallCommandRealtimeError('Call is already bound to a different provider call', 'CALLCOMMAND_REALTIME_CALL_CONFLICT', 409);
    }
    const created = await tx.execute(sql`
      INSERT INTO callcommand_ingestion_events(
        tenant_id,source,provider_event_id,payload_sha256,call_id,status,
        processing_owner,processing_lease_expires_at,attempts
      ) VALUES (
        ${input.authority.tenant_id},'openai_realtime',${input.incoming.eventId},${input.payloadSha256},${input.authority.id},'processing',
        ${processingOwner},NOW()+INTERVAL '30 seconds',1
      )
      ON CONFLICT (tenant_id,source,provider_event_id) DO NOTHING RETURNING *
    `);
    if (!created.rows[0]) {
      const existing = (await tx.execute(sql`
        SELECT * FROM callcommand_ingestion_events
        WHERE tenant_id=${input.authority.tenant_id} AND source='openai_realtime'
          AND provider_event_id=${input.incoming.eventId} FOR UPDATE
      `)).rows[0] as Row | undefined;
      if (!existing || existing.payload_sha256 !== input.payloadSha256 || existing.call_id !== input.authority.id) {
        throw new CallCommandRealtimeError('Webhook replay conflicts with the original event', 'CALLCOMMAND_REALTIME_WEBHOOK_CONFLICT', 409);
      }
      const status = String(existing.status ?? 'processing');
      const leaseExpired = existing.processing_lease_expires_at
        ? new Date(existing.processing_lease_expires_at).getTime() <= Date.now()
        : new Date(existing.received_at).getTime() <= Date.now() - 30_000;
      if (status === 'processing' && leaseExpired) {
        await tx.execute(sql`
          UPDATE callcommand_ingestion_events SET processing_owner=${processingOwner},
            processing_lease_expires_at=NOW()+INTERVAL '30 seconds',attempts=attempts+1,error_code=NULL
          WHERE id=${existing.id}
        `);
        await tx.execute(sql`
          UPDATE callcommand_calls SET openai_realtime_call_id=${input.incoming.openAiCallId},
            realtime_status='connecting',realtime_last_event_at=NOW(),realtime_error_code=NULL,updated_at=NOW()
          WHERE tenant_id=${input.authority.tenant_id} AND id=${input.authority.id}
        `);
        return { duplicate: false as const, mode: 'accept' as const, recovered: true as const, status };
      }
      if (['accepting','provider_confirmed','sideband_connecting','sideband_connected'].includes(status)
        && !hasCallCommandRealtimeSideband(String(input.authority.id))
        && (status === 'sideband_connected' || leaseExpired)) {
        await tx.execute(sql`
          UPDATE callcommand_ingestion_events SET status='sideband_connecting',processing_owner=${processingOwner},
            processing_lease_expires_at=NOW()+INTERVAL '30 seconds',attempts=attempts+1,error_code=NULL
          WHERE id=${existing.id}
        `);
        await tx.execute(sql`
          UPDATE callcommand_calls SET realtime_status='connecting',realtime_last_event_at=NOW(),
            realtime_error_code=NULL,updated_at=NOW()
          WHERE tenant_id=${input.authority.tenant_id} AND id=${input.authority.id}
        `);
        return { duplicate: false as const, mode: 'reattach' as const, recovered: true as const, status };
      }
      return { duplicate: true as const, mode: 'none' as const, recovered: false as const, status };
    }
    await tx.execute(sql`
      UPDATE callcommand_calls SET openai_realtime_call_id=${input.incoming.openAiCallId},
        realtime_status='connecting',realtime_last_event_at=NOW(),realtime_error_code=NULL,updated_at=NOW()
      WHERE tenant_id=${input.authority.tenant_id} AND id=${input.authority.id}
    `);
    return { duplicate: false as const, mode: 'accept' as const, recovered: false as const, status: 'processing' };
  });
}

async function markProviderAccepting(authority: Row, incoming: VerifiedOpenAiIncomingCall): Promise<void> {
  await db.execute(sql`
    UPDATE callcommand_ingestion_events SET status='accepting',
      processing_lease_expires_at=NOW()+INTERVAL '30 seconds',error_code=NULL
    WHERE tenant_id=${authority.tenant_id} AND source='openai_realtime' AND provider_event_id=${incoming.eventId}
  `);
}

async function markProviderAccepted(authority: Row, incoming: VerifiedOpenAiIncomingCall): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE callcommand_ingestion_events SET status='provider_confirmed',processed_at=NULL,error_code=NULL,
        processing_lease_expires_at=NOW()+INTERVAL '30 seconds'
      WHERE tenant_id=${authority.tenant_id} AND source='openai_realtime' AND provider_event_id=${incoming.eventId}
    `);
    await tx.execute(sql`
      UPDATE callcommand_calls SET realtime_status='connecting',realtime_last_event_at=NOW(),
        realtime_error_code=NULL,status='in_progress',updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id} AND openai_realtime_call_id=${incoming.openAiCallId}
    `);
  });
}

async function markSidebandConnected(authority: Row, incoming: VerifiedOpenAiIncomingCall): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE callcommand_ingestion_events SET status='sideband_connected',processed_at=NOW(),error_code=NULL,
        processing_owner=NULL,processing_lease_expires_at=NULL
      WHERE tenant_id=${authority.tenant_id} AND source='openai_realtime' AND provider_event_id=${incoming.eventId}
    `);
    await tx.execute(sql`
      UPDATE callcommand_calls SET realtime_status='connected',realtime_connected_at=COALESCE(realtime_connected_at,NOW()),
        realtime_last_event_at=NOW(),realtime_error_code=NULL,answered_at=COALESCE(answered_at,NOW()),status='in_progress',updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id} AND openai_realtime_call_id=${incoming.openAiCallId}
    `);
    await tx.execute(sql`
      UPDATE callcommand_live_sessions SET state='connected',sequence=sequence+1,updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND ended_at IS NULL
    `);
    await tx.execute(sql`
      UPDATE callcommand_tenant_runtime_settings SET realtime_health_status='healthy',
        realtime_last_connected_at=NOW(),realtime_last_error_code=NULL,updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id}
    `);
    await tx.execute(sql`
      INSERT INTO callcommand_events(tenant_id,call_id,event_type,safe_payload)
      VALUES (${authority.tenant_id},${authority.id},'provider.openai_realtime.sideband_connected',
        ${JSON.stringify({ provider: 'openai', model: incoming.openAiCallId ? 'server_allowlisted' : null })}::jsonb)
    `);
  });
}

async function markIncomingFailed(authority: Row, incoming: VerifiedOpenAiIncomingCall, code: string): Promise<void> {
  const safeCode = safeText(code, 80) || 'CALLCOMMAND_REALTIME_ACCEPT_FAILED';
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE callcommand_ingestion_events SET status='failed',processed_at=NOW(),error_code=${safeCode},
        processing_owner=NULL,processing_lease_expires_at=NULL
      WHERE tenant_id=${authority.tenant_id} AND source='openai_realtime' AND provider_event_id=${incoming.eventId}
    `);
    await tx.execute(sql`
      UPDATE callcommand_calls SET status='failed',realtime_status='failed',realtime_error_code=${safeCode},
        realtime_last_event_at=NOW(),completed_at=COALESCE(completed_at,NOW()),ended_at=COALESCE(ended_at,NOW()),updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}
    `);
    await tx.execute(sql`
      UPDATE callcommand_live_sessions SET state='failed',ended_at=COALESCE(ended_at,NOW()),sequence=sequence+1,updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND ended_at IS NULL
    `);
    await tx.execute(sql`
      UPDATE callcommand_tenant_runtime_settings SET realtime_health_status='degraded',
        realtime_last_error_code=${safeCode},updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id}
    `);
  });
  await releaseCallCommandLane({ tenantId: String(authority.tenant_id), callId: String(authority.id), reason: 'realtime_accept_failed' });
}

async function loadRuntimeConfiguration(authority: Row) {
  const [knowledge, rules, flow, targets, custodian] = await Promise.all([
    db.execute(sql`
      SELECT knowledge_type,title,content,enabled,priority FROM callcommand_agent_knowledge
      WHERE tenant_id=${authority.tenant_id} AND profile_id=${authority.profile_id}
        AND enabled=TRUE AND deleted_at IS NULL ORDER BY priority,id LIMIT 50
    `),
    db.execute(sql`
      SELECT id,conditions_json,actions_json FROM callcommand_automation_rules
      WHERE tenant_id=${authority.tenant_id} AND enabled=TRUE AND deleted_at IS NULL
      ORDER BY priority,id LIMIT 100
    `),
    authority.active_flow_id ? db.execute(sql`
      SELECT f.id,v.graph_json FROM callcommand_flows f
      JOIN callcommand_flow_versions v
        ON v.tenant_id=f.tenant_id AND v.flow_id=f.id AND v.version=f.active_version
      WHERE f.tenant_id=${authority.tenant_id} AND f.id=${authority.active_flow_id} AND f.status='active' LIMIT 1
    `) : Promise.resolve({ rows: [] }),
    db.execute(sql`
      SELECT id,label FROM callcommand_transfer_targets
      WHERE tenant_id=${authority.tenant_id} AND kind='external' AND status='active'
        AND verified_at IS NOT NULL AND phone_e164 IS NOT NULL AND deleted_at IS NULL
      ORDER BY created_at,id LIMIT 20
    `),
    db.execute(sql`
      SELECT tu.user_id FROM tenant_users tu JOIN users u ON u.id=tu.user_id AND u.status='active'
      WHERE tu.tenant_id=${authority.tenant_id}
      ORDER BY CASE tu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,tu.joined_at,tu.user_id
      LIMIT 1
    `),
  ]);
  const matchingRules = (rules.rows as Row[]).filter(rule =>
    callCommandAutomationRuleMatches(rule.conditions_json as Row, authority));
  const actions = [
    ...matchingRules.flatMap(rule => asActions(rule.actions_json)),
    ...activeFlowActions((flow.rows[0] as Row | undefined)?.graph_json),
  ];
  const transferEnabled = authority.live_behavior === 'ai_screen_then_transfer'
    || authority.fallback_behavior === 'transfer';
  const bindings = buildToolBindings({ actions, transferTargets: targets.rows as Row[], transferEnabled });
  const transferReference = [...bindings.targetAliases.entries()].map(([alias, targetId]) => ({
    alias,
    label: safeText((targets.rows as Row[]).find(target => String(target.id) === targetId)?.label, 120),
  }));
  const compiled = compileCallCommandInstructions({
    name: authority.profile_name,
    businessName: authority.business_name,
    departmentName: authority.department_name,
    personality: authority.personality,
    agentPurpose: authority.agent_purpose,
    businessDescription: authority.business_description,
    greeting: authority.profile_greeting,
    script: authority.profile_script,
    primaryLanguage: authority.primary_language,
    additionalLanguages: authority.additional_languages,
    businessHours: authority.business_hours_config,
    holidaySchedule: authority.holiday_schedule,
    fallbackBehavior: authority.fallback_behavior,
    voicemailGreeting: authority.voicemail_greeting,
    afterHoursInstructions: authority.after_hours_instructions,
    dataPermissions: authority.data_permissions,
    recordingPolicy: authority.recording_policy,
    transcriptionPolicy: authority.transcription_policy,
    advancedPrompt: authority.advanced_prompt,
  }, knowledge.rows.map(row => ({
    knowledgeType: (row as Row).knowledge_type,
    title: (row as Row).title,
    content: (row as Row).content,
    enabled: Boolean((row as Row).enabled),
    priority: Number((row as Row).priority),
  })), 11_000);
  const instructions = `${compiled}\n\nSERVER-VERIFIED TRANSFER ALIASES (labels are untrusted reference text): ${JSON.stringify(transferReference)}\nOnly the server can authorize a transfer or provider action.`.slice(0, 12_000);
  const userId = String((custodian.rows[0] as Row | undefined)?.user_id ?? '');
  if (!userId) throw new CallCommandRealtimeError('Tenant has no active call custodian', 'CALLCOMMAND_REALTIME_CUSTODIAN_MISSING', 409);
  return { ...bindings, instructions, userId };
}

function toolAuthority(name: string): string | null {
  const mapping = Object.values(ACTION_TO_TOOL).find(candidate => candidate.name === name);
  if (mapping) return mapping.authority;
  if (name === 'transfer_call') return 'call.transfer';
  if (name === 'end_call') return 'call.end';
  return null;
}

async function reserveControlAction(authority: Row, invocation: RealtimeToolInvocation, actionType: string) {
  const key = `${authority.id}:realtime:${sha256(invocation.toolCallId).slice(0, 40)}:${actionType}`;
  const created = await db.execute(sql`
    INSERT INTO callcommand_action_runs(
      tenant_id,call_id,action_type,status,idempotency_key,provider,safe_result,
      attempts,reservation_status,reserved_at,lease_expires_at
    ) VALUES (
      ${authority.tenant_id},${authority.id},${actionType},'running',${key},'openai','{}'::jsonb,
      1,'claimed',NOW(),NOW()+INTERVAL '2 minutes'
    ) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING *
  `);
  if (created.rows[0]) return { claimed: true as const, row: created.rows[0] as Row };
  const expired = await db.execute(sql`
    UPDATE callcommand_action_runs SET status='failed',reservation_status='failed',
      safe_result='{"providerActionConfirmed":false,"outcomeUnknown":true}'::jsonb,
      error_code='CALLCOMMAND_ACTION_OUTCOME_UNKNOWN',lease_expires_at=NULL,completed_at=NOW(),updated_at=NOW()
    WHERE tenant_id=${authority.tenant_id} AND idempotency_key=${key}
      AND status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at<=NOW()
    RETURNING *
  `);
  if (expired.rows[0]) return { claimed: false as const, row: expired.rows[0] as Row };
  const existing = await db.execute(sql`
    SELECT * FROM callcommand_action_runs
    WHERE tenant_id=${authority.tenant_id} AND idempotency_key=${key} LIMIT 1
  `);
  return { claimed: false as const, row: (existing.rows[0] as Row | undefined) ?? null };
}

async function finishControlAction(authority: Row, actionRunId: string, input: {
  status: 'completed' | 'failed';
  safeResult: Row;
  errorCode?: string | null;
}) {
  await db.execute(sql`
    UPDATE callcommand_action_runs SET status=${input.status},safe_result=${JSON.stringify(input.safeResult)}::jsonb,
      error_code=${input.errorCode ?? null},reservation_status=${input.status === 'completed' ? 'completed' : 'failed'},
      lease_expires_at=NULL,completed_at=NOW(),updated_at=NOW()
    WHERE tenant_id=${authority.tenant_id} AND id=${actionRunId}
  `);
}

async function executeRealtimeTool(input: {
  adapter: RealtimeAdapter;
  authority: Row;
  configuration: Awaited<ReturnType<typeof loadRuntimeConfiguration>>;
  invocation: RealtimeToolInvocation;
}) {
  const { authority, configuration, invocation, adapter } = input;
  if (invocation.openAiCallId !== authority.openai_realtime_call_id) {
    throw new CallCommandRealtimeError('Realtime provider call does not match', 'CALLCOMMAND_REALTIME_CALL_CONFLICT', 409);
  }
  const currentResult = await db.execute(sql`
    SELECT c.*,lease.id AS active_lease_id FROM callcommand_calls c
    LEFT JOIN callcommand_lane_leases lease ON lease.tenant_id=c.tenant_id AND lease.call_id=c.id
      AND lease.status='active' AND lease.expires_at>NOW()
    WHERE c.tenant_id=${authority.tenant_id} AND c.id=${authority.id} LIMIT 1
  `);
  const call = currentResult.rows[0] as Row | undefined;
  if (!call || !call.active_lease_id || !ACTIVE_CALL_STATES.has(String(call.status))) {
    throw new CallCommandRealtimeError('Call is no longer active', 'CALLCOMMAND_REALTIME_CALL_NOT_ACTIVE', 409);
  }
  const authorityName = toolAuthority(invocation.name);
  if (!authorityName) throw new CallCommandRealtimeError('Tool is not allowlisted', 'CALLCOMMAND_REALTIME_TOOL_NOT_ALLOWED', 403);

  if (configuration.actionBindings.has(invocation.name)) {
    const actions = configuration.actionBindings.get(invocation.name)!;
    const authorization = authorizeCallCommandTool({
      tool: authorityName, callState: String(call.status), enabledActions: [authorityName],
    });
    if (!authorization.allowed) throw new CallCommandRealtimeError('Tool is not authorized', authorization.code, 403);
    const summary = safeText(invocation.arguments.summary, 1_500);
    if (!summary) throw new CallCommandRealtimeError('Tool summary is required', 'CALLCOMMAND_REALTIME_TOOL_ARGUMENT_INVALID', 400);
    const priority = ['low', 'medium', 'high', 'urgent'].includes(String(invocation.arguments.priority))
      ? String(invocation.arguments.priority) : undefined;
    const merged = actions.map(action => ({
      ...action,
      description: summary,
      body: action.body ?? summary,
      ...(priority ? { priority } : {}),
    }));
    const results = await dispatchCallCommandActions({
      tenantId: String(authority.tenant_id), userId: configuration.userId, call,
      actions: merged, correlationId: `realtime:${authority.id}`,
      idempotencyNamespace: `openai:${invocation.toolCallId}`,
    });
    const statuses = results.map(result => String(result.status ?? 'unknown'));
    return { ok: statuses.length > 0 && statuses.every(status => SUCCESSFUL_ACTION_STATES.has(status)), action: invocation.name, outcomes: statuses };
  }

  if (invocation.name === 'transfer_call') {
    const alias = safeText(invocation.arguments.target, 64);
    const targetId = configuration.targetAliases.get(alias);
    if (!targetId) throw new CallCommandRealtimeError('Transfer target is not allowlisted', 'TARGET_NOT_SERVER_VERIFIED', 403);
    const targetResult = await db.execute(sql`
      SELECT id,phone_e164,status,verified_at FROM callcommand_transfer_targets
      WHERE tenant_id=${authority.tenant_id} AND id=${targetId} AND kind='external'
        AND status='active' AND verified_at IS NOT NULL AND phone_e164 IS NOT NULL AND deleted_at IS NULL LIMIT 1
    `);
    const target = targetResult.rows[0] as Row | undefined;
    const authorization = authorizeCallCommandTool({
      tool: 'call.transfer', callState: String(call.status), enabledActions: ['call.transfer'],
      target: target ? { status: String(target.status), serverVerified: Boolean(target.verified_at) } : null,
    });
    if (!authorization.allowed || !target) throw new CallCommandRealtimeError('Transfer is not authorized', authorization.code, 403);
    const reservation = await reserveControlAction(authority, invocation, 'transfer');
    if (!reservation.claimed) return { ok: reservation.row?.status === 'completed', action: invocation.name, duplicate: true };
    try {
      await adapter.refer(invocation.openAiCallId, `tel:${String(target.phone_e164)}`);
      await db.transaction(async tx => {
        const session = (await tx.execute(sql`
          UPDATE callcommand_live_sessions SET state='transferring',sequence=sequence+1,updated_at=NOW()
          WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND ended_at IS NULL RETURNING id
        `)).rows[0] as Row | undefined;
        await tx.execute(sql`
          INSERT INTO callcommand_transfer_logs(
            tenant_id,call_id,session_id,target_id,requested_by_user_id,provider,status,reason,completed_at
          ) VALUES (
            ${authority.tenant_id},${authority.id},${session?.id ?? null},${target.id},${configuration.userId},
            'openai','provider_confirmed','Server-authorized Realtime transfer',NOW()
          )
        `);
        await tx.execute(sql`
          INSERT INTO callcommand_events(tenant_id,call_id,event_type,safe_payload)
          VALUES (${authority.tenant_id},${authority.id},'provider.openai_realtime.transfer_confirmed',
            ${JSON.stringify({ provider: 'openai', providerActionConfirmed: true })}::jsonb)
        `);
      });
      await finishControlAction(authority, String(reservation.row.id), {
        status: 'completed', safeResult: { providerActionConfirmed: true },
      });
      return { ok: true, action: invocation.name, providerActionConfirmed: true };
    } catch (error) {
      await finishControlAction(authority, String(reservation.row.id), {
        status: 'failed', safeResult: { providerActionConfirmed: false },
        errorCode: safeText((error as any)?.code ?? 'CALLCOMMAND_REALTIME_TRANSFER_FAILED', 80),
      });
      throw error;
    }
  }

  if (invocation.name === 'end_call') {
    const authorization = authorizeCallCommandTool({
      tool: 'call.end', callState: String(call.status), enabledActions: ['call.end'],
    });
    if (!authorization.allowed) throw new CallCommandRealtimeError('Call end is not authorized', authorization.code, 403);
    const reservation = await reserveControlAction(authority, invocation, 'end_call');
    if (!reservation.claimed) return { ok: reservation.row?.status === 'completed', action: invocation.name, duplicate: true };
    try {
      await adapter.hangup(invocation.openAiCallId);
      await db.execute(sql`
        UPDATE callcommand_live_sessions SET state='completed',ended_at=COALESCE(ended_at,NOW()),sequence=sequence+1,updated_at=NOW()
        WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND ended_at IS NULL
      `);
      await releaseCallCommandLane({ tenantId: String(authority.tenant_id), callId: String(authority.id), reason: 'realtime_end_tool' });
      await finishControlAction(authority, String(reservation.row.id), {
        status: 'completed', safeResult: { providerActionConfirmed: true },
      });
      return { ok: true, action: invocation.name, providerActionConfirmed: true };
    } catch (error) {
      await finishControlAction(authority, String(reservation.row.id), {
        status: 'failed', safeResult: { providerActionConfirmed: false },
        errorCode: safeText((error as any)?.code ?? 'CALLCOMMAND_REALTIME_HANGUP_FAILED', 80),
      });
      throw error;
    }
  }
  throw new CallCommandRealtimeError('Tool is not allowlisted', 'CALLCOMMAND_REALTIME_TOOL_NOT_ALLOWED', 403);
}

async function persistTranscript(authority: Row, event: CallCommandRealtimeTranscriptEvent): Promise<void> {
  const providerEventId = `${event.openAiCallId}:${event.role}:${event.itemId}`.slice(0, 200);
  const payloadSha256 = sha256(JSON.stringify({ role: event.role, transcript: event.transcript }));
  await db.transaction(async tx => {
    const claimed = await tx.execute(sql`
      INSERT INTO callcommand_ingestion_events(
        tenant_id,source,provider_event_id,payload_sha256,call_id,status,processed_at
      ) VALUES (
        ${authority.tenant_id},'openai_realtime_transcript',${providerEventId},${payloadSha256},${authority.id},'processed',NOW()
      ) ON CONFLICT (tenant_id,source,provider_event_id) DO NOTHING RETURNING id
    `);
    if (!claimed.rows[0]) {
      const existing = (await tx.execute(sql`
        SELECT payload_sha256,call_id FROM callcommand_ingestion_events
        WHERE tenant_id=${authority.tenant_id} AND source='openai_realtime_transcript'
          AND provider_event_id=${providerEventId} LIMIT 1
      `)).rows[0] as Row | undefined;
      if (!existing || existing.payload_sha256 !== payloadSha256 || existing.call_id !== authority.id) {
        throw new CallCommandRealtimeError('Transcript replay conflicts with the original event', 'CALLCOMMAND_REALTIME_TRANSCRIPT_CONFLICT', 409);
      }
      return;
    }
    const line = `[${event.role === 'caller' ? 'Caller' : 'Assistant'}] ${safeText(event.transcript, 32_000)}`;
    await tx.execute(sql`
      UPDATE callcommand_calls SET transcript=LEFT(
        CASE WHEN COALESCE(transcript,'')='' THEN ${line} ELSE transcript||E'\n'||${line} END,40000
      ),realtime_last_event_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}
    `);
    await tx.execute(sql`
      INSERT INTO callcommand_events(tenant_id,call_id,event_type,safe_payload)
      VALUES (${authority.tenant_id},${authority.id},${`provider.openai_realtime.transcript.${event.role}`},
        ${JSON.stringify({ provider: 'openai', role: event.role, itemId: event.itemId, characters: event.transcript.length })}::jsonb)
    `);
  });
}

function transcriptPersistenceAllowed(authority: Row): boolean {
  if (authority.transcription_policy === 'consent_required') return Boolean(authority.consent_id);
  if (authority.transcription_policy === 'recording_only') {
    return ['pending','ready'].includes(String(authority.recording_status));
  }
  return false;
}

async function persistUsage(authority: Row, event: CallCommandRealtimeUsageEvent, model: MeteredRealtimeModel): Promise<void> {
  if (event.source !== 'response' || !event.responseId) return;
  await reconcileCallCommandRealtimeUsage({
    tenantId: String(authority.tenant_id), callId: String(authority.id),
    providerEventId: `${event.openAiCallId}:${event.responseId}`.slice(0, 160), model,
    inputTokens: event.inputTokens, outputTokens: event.outputTokens,
  });
}

async function persistProviderError(authority: Row, event: CallCommandRealtimeProviderErrorEvent): Promise<void> {
  const code = safeText(event.code, 80) || 'CALLCOMMAND_REALTIME_PROVIDER_ERROR';
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE callcommand_calls SET realtime_status=CASE WHEN ${event.recoverable} THEN realtime_status ELSE 'failed' END,
        realtime_error_code=${code},realtime_last_event_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}
    `);
    await tx.execute(sql`
      UPDATE callcommand_tenant_runtime_settings SET realtime_health_status='degraded',
        realtime_last_error_code=${code},updated_at=NOW() WHERE tenant_id=${authority.tenant_id}
    `);
    await tx.execute(sql`
      INSERT INTO callcommand_events(tenant_id,call_id,event_type,safe_payload)
      VALUES (${authority.tenant_id},${authority.id},'provider.openai_realtime.error',
        ${JSON.stringify({ provider: 'openai', code, recoverable: event.recoverable })}::jsonb)
    `);
  });
}

async function persistCallbackFailure(authority: Row, event: { callback: string; code: string }): Promise<void> {
  const callback = safeText(event.callback, 40) || 'unknown';
  const code = safeText(event.code, 80) || 'CALLCOMMAND_REALTIME_CALLBACK_FAILED';
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE callcommand_calls SET realtime_error_code=${code},realtime_last_event_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}
    `);
    await tx.execute(sql`
      UPDATE callcommand_tenant_runtime_settings SET realtime_health_status='degraded',
        realtime_last_error_code=${code},updated_at=NOW() WHERE tenant_id=${authority.tenant_id}
    `);
    await tx.execute(sql`
      INSERT INTO callcommand_events(tenant_id,call_id,event_type,safe_payload)
      VALUES (${authority.tenant_id},${authority.id},'provider.openai_realtime.callback_failed',
        ${JSON.stringify({ provider: 'openai', callback, code })}::jsonb)
    `);
  });
}

export async function registerCallCommandRealtimeRoutes(app: FastifyInstance) {
  app.post(ROUTE, async (request, reply) => {
    let adapter: RealtimeAdapter;
    let incoming: VerifiedOpenAiIncomingCall;
    let authority: Row | null = null;
    try {
      const exactRawBody = rawBody(request);
      adapter = adapterFactory();
      incoming = await adapter.unwrapIncomingCall({
        rawBody: exactRawBody,
        headers: request.headers as Record<string, string | string[] | undefined>,
      });
      authority = await loadAuthority(incoming.internalCallId);
      if (!authority || !adapter.verifyRouteToken(
        incoming.internalCallId,
        String(authority.provider_call_sid ?? ''),
        incoming.routeToken,
      )) {
        await safeReject(adapter, incoming.openAiCallId, 603);
        throw new CallCommandRealtimeError('Realtime call route is not authorized', 'CALLCOMMAND_REALTIME_ROUTE_UNAUTHORIZED', 403);
      }
      if (authority.channel_status !== 'active'
        || authority.commercial_realtime_ready !== true
        || !isRealtimeCallEligible(authority)) {
        await safeReject(adapter, incoming.openAiCallId, 603);
        throw new CallCommandRealtimeError('Realtime call configuration is not active', 'CALLCOMMAND_REALTIME_CONFIGURATION_INACTIVE', 409);
      }
      const recordingExpected = realtimeRecordingEnabled(authority);
      const consentExpected = realtimeConsentRequired(authority);
      if ((consentExpected && !authority.consent_id)
        || (recordingExpected && !['pending','ready'].includes(String(authority.recording_status)))) {
        await safeReject(adapter,incoming.openAiCallId,603);
        throw new CallCommandRealtimeError('Realtime call consent or recording evidence is unavailable','CALLCOMMAND_REALTIME_POLICY_UNSATISFIED',409);
      }
      if (!authority.active_lease_id || !ACTIVE_CALL_STATES.has(String(authority.status))) {
        await safeReject(adapter, incoming.openAiCallId, 486);
        throw new CallCommandRealtimeError('Realtime call capacity is unavailable', 'CALLCOMMAND_REALTIME_CAPACITY_UNAVAILABLE', 409);
      }
      const claim = await claimIncomingEvent({ authority, incoming, payloadSha256: sha256(exactRawBody) });
      if (claim.duplicate) return reply.code(200).send({ ok: true, duplicate: true, status: claim.status });

      const configuration = await loadRuntimeConfiguration(authority);
      const voice = VOICES.has(String(authority.voice_id) as SupportedRealtimeVoice)
        ? String(authority.voice_id) as SupportedRealtimeVoice : 'marin';
      const acceptConfig = buildOpenAiRealtimeAcceptConfig({
        model: adapter.readiness.model,
        voice,
        serverCompiledInstructions: configuration.instructions,
        allowlistedTools: configuration.tools,
        enabledToolNames: configuration.tools.map(tool => tool.name),
        maxOutputTokens: 1_024,
      });
      if (claim.mode === 'accept') {
        await markProviderAccepting(authority,incoming);
        try {
          await adapter.accept(incoming.openAiCallId, {
            instructions: acceptConfig.instructions,
            tools: acceptConfig.tools,
            voice: acceptConfig.audio.output.voice,
            maxOutputTokens: acceptConfig.max_output_tokens,
          });
        } catch (error) {
          await safeReject(adapter, incoming.openAiCallId, 480);
          await markIncomingFailed(authority, incoming, String((error as any)?.code ?? 'CALLCOMMAND_REALTIME_ACCEPT_FAILED'));
          throw error;
        }
        await markProviderAccepted(authority,incoming);
      }
      authority = { ...authority, openai_realtime_call_id: incoming.openAiCallId, status: 'in_progress' };
      let unregisterSideband: () => void = () => {};
      let callbackQueue = Promise.resolve();
      const enqueueCallback = (operation: () => Promise<void>): Promise<void> => {
        const queued = callbackQueue.then(operation);
        callbackQueue = queued.catch(() => undefined);
        return queued;
      };
      const callbacks: RealtimeSidebandCallbacks = {
        executeTool: invocation => executeRealtimeTool({ adapter, authority: authority!, configuration, invocation }),
        onUsage: event => enqueueCallback(() => persistUsage(authority!, event, adapter.readiness.model)),
        ...(transcriptPersistenceAllowed(authority)
          ? { onTranscript: (event: CallCommandRealtimeTranscriptEvent) => enqueueCallback(() => persistTranscript(authority!, event)) }
          : {}),
        onError: event => enqueueCallback(() => persistProviderError(authority!, event)),
        onCallbackError: event => enqueueCallback(() => persistCallbackFailure(authority!, event)),
        onClosed: event => enqueueCallback(async () => {
          unregisterSideband();
          if (!event.clean) {
            try { await adapter.hangup(event.openAiCallId); } catch { /* safe provider failure is recorded below */ }
            await releaseCallCommandLane({ tenantId: String(authority!.tenant_id), callId: String(authority!.id), reason: 'realtime_sideband_closed' });
          }
          await db.execute(sql`
            UPDATE callcommand_calls SET
              realtime_status=CASE WHEN realtime_status='failed' THEN 'failed' ELSE ${event.clean ? 'completed' : 'failed'} END,
              realtime_error_code=CASE WHEN realtime_status='failed' THEN realtime_error_code ELSE ${event.clean ? null : 'CALLCOMMAND_REALTIME_SOCKET_CLOSED'} END,
              realtime_last_event_at=NOW(),updated_at=NOW()
            WHERE tenant_id=${authority!.tenant_id} AND id=${authority!.id}
          `);
        }),
      };
      let sideband: ReturnType<RealtimeAdapter['connectSideband']> | null = null;
      try {
        sideband = adapter.connectSideband({
          openAiCallId: incoming.openAiCallId,
          allowedToolNames: configuration.tools.map(tool => tool.name),
          callbacks,
        });
        unregisterSideband = registerCallCommandRealtimeSideband(String(authority.id), sideband);
        await sideband.waitUntilOpen(8_000);
        await markSidebandConnected(authority,incoming);
      } catch (error) {
        unregisterSideband();
        try { sideband?.close(); } catch { /* database failure state remains authoritative */ }
        try { await adapter.hangup(incoming.openAiCallId); } catch { /* failure is persisted below */ }
        const code = String((error as any)?.code ?? 'CALLCOMMAND_REALTIME_SIDEBAND_FAILED');
        await markIncomingFailed(authority,incoming,code);
        throw error instanceof CallCommandRealtimeError
          ? error
          : new CallCommandRealtimeError('Realtime sideband initialization failed',code,503);
      }
      return reply.code(200).send({ ok: true, duplicate: false, providerActionConfirmed: true });
    } catch (error) {
      return safeFailure(reply, error);
    }
  });
}
