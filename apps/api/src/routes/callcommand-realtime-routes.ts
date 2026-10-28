import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  CallCommandRealtimeOwnershipError,
  lockCallCommandRealtimeOwnership,
  withCallCommandRealtimeOwnership,
  type CallCommandRealtimeOwnership,
  type CallCommandRealtimeTransaction,
} from '../lib/callcommand-realtime-ownership.js';
import { buildIncomingTwiml, executeFlowGraph, isWithinBusinessHours } from '../lib/callcommand-phase35.js';
import {
  authorizeCallCommandTool,
  acquireCallCommandLane,
  compileCallCommandInstructions,
  releaseCallCommandLane,
  reconcileCallCommandRealtimeUsage,
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
  inspectCallCommandRealtimeReadiness,
} from '../lib/callcommand-realtime.js';
import {
  hasCallCommandRealtimeSideband,
  registerCallCommandRealtimeSideband,
  drainCallCommandRealtimeSidebands,
  retireCallCommandRealtimeSideband,
  type CallCommandRealtimeSidebandSession,
} from '../lib/callcommand-realtime-session-registry.js';
import {
  callCommandAutomationRuleMatches,
  dispatchCallCommandActions,
  isRealtimeCallEligible,
  realtimeConsentRequired,
  realtimeRecordingEnabled,
  buildRealtimeSipForCall,
  markRealtimeSipPending,
} from './callcommand-phase35-routes.js';
import { classifyMspIntake } from '../lib/callcommand-msp.js';
import { appendMspCallEvent, consumeMspRateLimit, createLocalCase, transitionMspCall } from '../lib/callcommand-msp-service.js';
import { FIRST_CONTACT_LIMITS, firstContactChannelEnabled, unverifiedContextAllowed, firstContactEmailActions, firstContactTools, firstContactVoiceInstructions, unverifiedSupportSummary, firstContactHumanTransferAllowed, firstContactAvailableTargets } from '../lib/callcommand-first-contact.js';
import {
  callCommandVoicePolicy,
  associatedMspVoiceStage,
  formatSupportIntake,
  readSupportIntakeSnapshot,
  saveSupportIntakeSnapshot,
  supportDeliveryEvidence,
  supportIntakeTool,
  realtimeActionAllowedForProduct,
  usesMspSupportIntake,
  mspSupportNotificationReady,
} from '../lib/callcommand-support-intake.js';

import {loadIntakeIdentity,resolveIntakeIdentity} from '../lib/callcommand-intake-identity-service.js';
import {formatBmsIntakeEmail,publicFirstContactReadback,readFirstContactSnapshot,saveFirstContactSnapshot} from '../lib/callcommand-intake-identity.js';

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

function activeFlowActions(value: unknown, context: Row): Row[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return executeFlowGraph(value, context).actions;
}

function closedObjectSchema(properties: Row, required: string[] = []): Row {
  return { type: 'object', properties, required, additionalProperties: false };
}

function buildToolBindings(input: { actions: Row[]; transferTargets: Row[]; transferEnabled: boolean; productMode: string }) {
  const actionBindings = new Map<string, Row[]>();
  const tools: AllowlistedRealtimeTool[] = [];
  for (const [actionType, mapping] of Object.entries(ACTION_TO_TOOL)) {
    // MSP voice intake cannot acquire generic CRM/task/automation authority.
    if (!realtimeActionAllowedForProduct(input.productMode,actionType)) continue;
    const configured = input.actions.filter(action => action.enabled !== false
      && String(action.actionType ?? action.type ?? '') === actionType);
    if (!configured.length) continue;
    actionBindings.set(mapping.name, configured);
    const createsObject = ['ticket', 'lead', 'task'].includes(actionType);
    tools.push({
      type: 'function',
      name: input.productMode === 'msp' ? 'submit_support_request' : mapping.name,
      description: createsObject
        ? `Create the configured ${actionType} only after the caller has supplied enough information.`
        : `Send the tenant-configured ${actionType} notification. The server owns the destination.`,
      parameters: closedObjectSchema({
        summary: { type: 'string', minLength: 1, maxLength: 1_500 },
        ...(createsObject ? { priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] } } : {}),
      }, ['summary']) as AllowlistedRealtimeTool['parameters'],
    });
  }

  const supportIntakeEnabled = usesMspSupportIntake(input.productMode,[...actionBindings.keys()]);
  if (supportIntakeEnabled) tools.push(supportIntakeTool());
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
        summary: { type: 'string', minLength: 1, maxLength: 1_500 },
      }, ['target', 'reason', 'summary']) as AllowlistedRealtimeTool['parameters'],
    });
  }
  tools.push({
    type: 'function',
    name: 'end_call',
    description: 'End the current call after politely confirming that no more help is needed.',
    parameters: closedObjectSchema({
      reason: { type: 'string', minLength: 1, maxLength: 500 },
      summary: { type: 'string', minLength: 1, maxLength: 1_500 },
    }, ['reason', 'summary']) as AllowlistedRealtimeTool['parameters'],
  });
  return { tools, actionBindings, targetAliases, supportIntakeEnabled };
}

async function loadAuthority(callId: string, executor: Pick<typeof db,'execute'> = db, tenantId?: string): Promise<Row | null> {
  const result = await executor.execute(sql`
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
      channel.acquisition_mode,channel.lifecycle_state,channel.billing_status,channel.billing_grace_expires_at,
      (channel.billing_status IN ('active','included') OR
        (channel.billing_status='grace_period' AND channel.billing_grace_expires_at>NOW())) AS realtime_billing_eligible,
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
      lease.id AS active_lease_id,EXTRACT(EPOCH FROM lease.acquired_at)::text AS active_lease_generation
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
      AND lease.id=c.capacity_lease_id AND lease.provider_call_sid=c.provider_call_sid
      AND lease.status='active' AND lease.expires_at>NOW()
    WHERE c.id=${callId} AND c.provider='twilio' AND c.direction='inbound'
      AND (${tenantId === undefined} OR c.tenant_id=${tenantId ?? ''})
    LIMIT 1
  `);
  const authority = (result.rows[0] as Row | undefined) ?? null;
  if (authority?.product_mode === 'msp') {
    const association = await executor.execute(sql`
      SELECT context.id FROM callcommand_msp_call_contexts context
      JOIN tenants tenant ON tenant.id=context.tenant_id AND tenant.status='active'
      JOIN callcommand_organization_profiles organization
        ON organization.tenant_id=context.tenant_id AND organization.organization_id=context.organization_id
      JOIN directory_organizations directory_organization
        ON directory_organization.tenant_id=context.tenant_id AND directory_organization.id=context.organization_id
      JOIN callcommand_contact_profiles contact_profile
        ON contact_profile.tenant_id=context.tenant_id AND contact_profile.organization_id=context.organization_id AND contact_profile.contact_id=context.contact_id
      JOIN directory_contacts contact ON contact.tenant_id=context.tenant_id AND contact.id=context.contact_id
      JOIN callcommand_trusted_originating_lines line
        ON line.tenant_id=context.tenant_id AND line.id=context.originating_line_id AND line.organization_id=context.organization_id
      WHERE context.tenant_id=${authority.tenant_id} AND context.call_id=${authority.id}
        AND context.provider_call_id=${authority.provider_call_sid} AND context.assurance_level='A1'
        AND context.state IN ('CONTACT_ASSOCIATED','INTENT_CAPTURED','LOCAL_CASE_CREATED','COMPLETED')
        AND organization.status IN ('ACTIVE','PILOT') AND organization.support_contract_status='ACTIVE'
        AND directory_organization.status='active' AND directory_organization.archived_at IS NULL
        AND contact_profile.status='ACTIVE' AND contact_profile.support_eligible=TRUE
        AND contact.status='active' AND contact.archived_at IS NULL
        AND line.status='ACTIVE' AND line.verified_at IS NOT NULL
        AND (line.cooldown_until IS NULL OR line.cooldown_until<=NOW())
      LIMIT 1
    `);
    authority.msp_realtime_association_verified = Boolean(association.rows[0]);
    {
      const unverified = await executor.execute(sql`
        SELECT context.*,tenant.status AS tenant_status,
          EXISTS(SELECT 1 FROM callcommand_flows flow JOIN callcommand_flow_versions version
            ON version.tenant_id=flow.tenant_id AND version.flow_id=flow.id AND version.version=flow.active_version
            WHERE flow.tenant_id=context.tenant_id AND flow.id=${authority.active_flow_id} AND flow.status='active') AS published_flow_active,
          EXISTS(SELECT 1 FROM callcommand_msp_call_events event WHERE event.tenant_id=context.tenant_id
            AND event.call_context_id=context.id AND event.event_type='unverified.voice.admitted') AS first_contact_call,
          EXISTS(SELECT 1 FROM callcommand_msp_call_events event WHERE event.tenant_id=context.tenant_id
            AND event.call_context_id=context.id AND event.event_type='unverified.voice.admitted'
            AND event.created_at>NOW()-INTERVAL '5 minutes') AS voice_admitted,
          (SELECT GREATEST(0,FLOOR(EXTRACT(EPOCH FROM event.created_at+INTERVAL '5 minutes'-NOW())))::integer
            FROM callcommand_msp_call_events event WHERE event.tenant_id=context.tenant_id
            AND event.call_context_id=context.id AND event.event_type='unverified.voice.admitted' LIMIT 1) AS remaining_seconds
        FROM callcommand_msp_call_contexts context JOIN tenants tenant ON tenant.id=context.tenant_id
        WHERE context.tenant_id=${authority.tenant_id} AND context.call_id=${authority.id}
          AND context.provider_call_id=${authority.provider_call_sid}
          AND EXISTS(SELECT 1 FROM callcommand_msp_call_events event WHERE event.tenant_id=context.tenant_id
            AND event.call_context_id=context.id AND event.event_type='provider.signature.verified')
          AND EXISTS(SELECT 1 FROM callcommand_msp_call_events event WHERE event.tenant_id=context.tenant_id
            AND event.call_context_id=context.id AND event.event_type='tenant.resolved.by.exact.to') LIMIT 1
      `);
      const context=unverified.rows[0] as Row | undefined;
      authority.msp_unverified_call=context?.first_contact_call===true;
      if(authority.msp_unverified_call)authority.msp_realtime_association_verified=false;
      authority.msp_unverified_context_allowed=unverifiedContextAllowed(context) && context?.tenant_status==='active'
        && context?.published_flow_active===true && firstContactChannelEnabled(authority.channel_id);
      authority.msp_unverified_context_id=context?.id;
      authority.msp_unverified_time_limit_seconds=context?.remaining_seconds;
      authority.msp_unverified_intake_verified=authority.msp_unverified_context_allowed && context?.voice_admitted===true
        && Number(context?.remaining_seconds)>=1 && !realtimeRecordingEnabled(authority);
    }
  }
  return authority;
}

type MspVoiceInput={tenantId:string;callId:string;providerCallSid:string};
/** The A1 path is preserved; it cannot silently accept an unassociated caller. */
export async function prepareAssociatedMspRealtimeIntake(input:MspVoiceInput):Promise<string|null> {
  return prepareMspRealtimeIntake(input,false);
}
/** Called only after the signed carrier route establishes exact tenant/line and A0 unknown context. */
export async function prepareUnverifiedMspRealtimeIntake(input:MspVoiceInput):Promise<string|null> {
  return prepareMspRealtimeIntake(input,true);
}

async function reserveUnverifiedVoice(authority:Row):Promise<boolean> {
  return db.transaction(async tx=>{
    const result=await tx.execute(sql`SELECT * FROM callcommand_msp_call_contexts
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.msp_unverified_context_id}
        AND call_id=${authority.id} AND provider_call_id=${authority.provider_call_sid} FOR UPDATE`);
    const context=result.rows[0] as Row|undefined;
    if(!unverifiedContextAllowed(context))return false;
    const admitted=await tx.execute(sql`SELECT id,(created_at>NOW()-INTERVAL '5 minutes') AS active FROM callcommand_msp_call_events WHERE tenant_id=${authority.tenant_id}
      AND call_context_id=${context!.id} AND event_type='unverified.voice.admitted' LIMIT 1`);
    // Retry never extends the five-minute window or consumes another allowance.
    if(admitted.rows[0])return (admitted.rows[0] as Row).active===true;
    if(!['UNRECOGNIZED_LINE','ORIGINATING_LINE_EVALUATED'].includes(String(context!.state)))return false;
    const tenantLimit=await consumeMspRateLimit({tenantId:String(authority.tenant_id),scope:'voice-a0-tenant',
      subjectHmac:sha256(`voice-a0:${authority.tenant_id}`),limit:FIRST_CONTACT_LIMITS.tenant,
      windowSeconds:FIRST_CONTACT_LIMITS.windowSeconds,blockSeconds:FIRST_CONTACT_LIMITS.windowSeconds},tx);
    if(!tenantLimit.allowed)return false;
    const callerLimit=await consumeMspRateLimit({tenantId:String(authority.tenant_id),scope:'voice-a0-caller',
      subjectHmac:sha256(`voice-a0:${authority.tenant_id}:${authority.phone_fingerprint}`),limit:FIRST_CONTACT_LIMITS.caller,
      windowSeconds:FIRST_CONTACT_LIMITS.windowSeconds,blockSeconds:FIRST_CONTACT_LIMITS.windowSeconds},tx);
    if(!callerLimit.allowed)return false;
    await appendMspCallEvent({tenantId:String(authority.tenant_id),callContextId:String(context!.id),
      eventType:'unverified.voice.admitted',actorType:'SYSTEM',outcome:'A0_INTAKE_ONLY',
      evidence:{assurance:'A0',manualAssociationRequired:true,maxSeconds:FIRST_CONTACT_LIMITS.maxSeconds}},tx);
    return true;
  });
}

async function prepareMspRealtimeIntake(input:MspVoiceInput,unverified:boolean):Promise<string|null> {
  const authority = await loadAuthority(input.callId,db,input.tenantId);
  if (!authority || authority.product_mode !== 'msp' || authority.provider_call_sid !== input.providerCallSid
    ) return null;
  if(unverified){
    if(authority.msp_unverified_call===true && authority.msp_unverified_intake_verified!==true)return null;
    if(!authority.msp_unverified_context_allowed || !firstContactChannelEnabled(authority.channel_id))return null;
    // Local prospective proof is used only for readiness; persist admission before any SIP response.
    authority.msp_unverified_intake_verified=true;
  }else if(authority.msp_realtime_association_verified!==true)return null;
  const configuration = await loadRuntimeConfiguration(authority);
  const stage = associatedMspVoiceStage({associated:unverified || authority.msp_realtime_association_verified===true,
    channelActive:authority.channel_status==='active',callActive:ACTIVE_CALL_STATES.has(String(authority.status)),
    providerReady:authority.commercial_realtime_ready===true,eligibleFlow:isRealtimeCallEligible(authority),
    managedLine:['platform_provisioned','byon'].includes(String(authority.acquisition_mode)),
    billingEligible:authority.realtime_billing_eligible===true,lifecycleActive:authority.lifecycle_state==='ACTIVE',
    consentRequired:realtimeConsentRequired(authority) && !authority.consent_id,recordingEnabled:realtimeRecordingEnabled(authority),
    realtimeConfigured:inspectCallCommandRealtimeReadiness().ready,notificationConfigured:configuration.supportIntakeEnabled});
  if (stage === 'unavailable') return null;
  // Construct/validate the fixed SIP target before reserving durable capacity.
  const sip = await buildRealtimeSipForCall(authority,authority,input.providerCallSid);
  const admission = await acquireCallCommandLane({tenantId:input.tenantId,callId:input.callId,
    idempotencyKey:`msp-realtime:${input.providerCallSid}`,providerCallSid:input.providerCallSid});
  if (!admission.admitted) return null;
  if(unverified && !await reserveUnverifiedVoice(authority)){
    await releaseCallCommandLane({tenantId:input.tenantId,callId:input.callId,reason:'unverified_intake_rate_denied'});return null;
  }
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM callcommand_calls WHERE tenant_id=${input.tenantId} AND id=${input.callId} FOR UPDATE`);
      const existing = await tx.execute(sql`SELECT id FROM callcommand_live_sessions WHERE tenant_id=${input.tenantId} AND call_id=${input.callId} AND ended_at IS NULL LIMIT 1`);
      if (!existing.rows[0]) await tx.execute(sql`
        INSERT INTO callcommand_live_sessions(tenant_id,call_id,channel_id,provider_call_sid,state,caller_phone_masked)
        VALUES(${input.tenantId},${input.callId},${authority.channel_id},${input.providerCallSid},${stage==='consent'?'consent':'intake'},${authority.phone_masked})
      `);
    });
    if (stage === 'consent') return buildIncomingTwiml({
      greeting:'I am an AI support assistant. Before we continue, please choose whether you consent to automated intake.',
      consentRequired:true,consentAction:`/v1/modules/callcommand-ai/twilio/voice/consent?call_id=${encodeURIComponent(input.callId)}`,
      gatherAction:`/v1/modules/callcommand-ai/webhooks/twilio/voice/intent?call_id=${encodeURIComponent(input.callId)}`,
      behavior:'ai_receptionist',
    });
    await markRealtimeSipPending(authority,authority);
    return sip;
  } catch (error) {
    await releaseCallCommandLane({tenantId:input.tenantId,callId:input.callId,reason:'msp_realtime_setup_failed'});
    throw error;
  }
}

async function safeReject(adapter: RealtimeAdapter, openAiCallId: string, statusCode: 480 | 486 | 603): Promise<void> {
  try { await adapter.reject(openAiCallId, statusCode); } catch { /* signed webhook still receives a safe local failure */ }
}

function sidebandOwner(authority: Row): CallCommandRealtimeOwnership {
  const owner = authority.sidebandOwnership as CallCommandRealtimeOwnership | undefined;
  if (!owner) throw new CallCommandRealtimeOwnershipError();
  return owner;
}

async function currentSidebandAuthority(tx: CallCommandRealtimeTransaction, owner: CallCommandRealtimeOwnership): Promise<Row> {
  const current = await loadAuthority(owner.callId,tx,owner.tenantId);
  if (!current || current.openai_realtime_call_id !== owner.openAiCallId
    || current.active_lease_id !== owner.capacityLeaseId
    || current.active_lease_generation !== owner.capacityGeneration || current.channel_status !== 'active'
    || current.commercial_realtime_ready !== true || !isRealtimeCallEligible(current)
    || !ACTIVE_CALL_STATES.has(String(current.status))
    || (realtimeConsentRequired(current) && !current.consent_id)
    || (realtimeRecordingEnabled(current) && !['pending','ready'].includes(String(current.recording_status)))) {
    throw new CallCommandRealtimeOwnershipError();
  }
  // Same active-custodian policy used by the existing runtime compiler.
  const custodian = await tx.execute(sql`SELECT tu.user_id FROM tenant_users tu
    JOIN users u ON u.id=tu.user_id AND u.status='active' WHERE tu.tenant_id=${owner.tenantId} LIMIT 1`);
  if (!custodian.rows[0]) throw new CallCommandRealtimeOwnershipError();
  return {...current,sidebandOwnership:owner};
}

async function withOwnedAuthority<T>(authority: Row, operation: (tx: CallCommandRealtimeTransaction, current: Row)=>Promise<T>) {
  const owner = sidebandOwner(authority);
  return withCallCommandRealtimeOwnership(owner,async tx => operation(tx,await currentSidebandAuthority(tx,owner)));
}

function reservationGuard(authority: Row) {
  const owner = sidebandOwner(authority);
  return async (tx: CallCommandRealtimeTransaction) => {
    await lockCallCommandRealtimeOwnership(tx,owner);
    await currentSidebandAuthority(tx,owner);
  };
}

async function claimIncomingEvent(input: {
  authority: Row;
  incoming: VerifiedOpenAiIncomingCall;
  payloadSha256: string;
}) {
  const processingOwner = randomUUID();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-capacity:${input.authority.tenant_id}`},0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-realtime:${input.authority.id}`},0))`);
    const locked = (await tx.execute(sql`
      SELECT * FROM callcommand_calls
      WHERE tenant_id=${input.authority.tenant_id} AND id=${input.authority.id} FOR UPDATE
    `)).rows[0] as Row | undefined;
    if (!locked) throw new CallCommandRealtimeError('Call was not found', 'CALLCOMMAND_REALTIME_CALL_NOT_FOUND', 404);
    const current=await loadAuthority(String(input.authority.id),tx,String(input.authority.tenant_id));
    if (!current || !current.active_lease_id || !ACTIVE_CALL_STATES.has(String(current.status)) || current.ended_at
      || current.terminal_reconciled_at || current.channel_status!=='active' || current.commercial_realtime_ready!==true
      || !isRealtimeCallEligible(current) || (realtimeConsentRequired(current) && !current.consent_id)
      || (realtimeRecordingEnabled(current) && !['pending','ready'].includes(String(current.recording_status)))) {
      throw new CallCommandRealtimeOwnershipError();
    }
    input.authority.active_lease_id=current.active_lease_id;
    input.authority.active_lease_generation=current.active_lease_generation;
    if (locked.openai_realtime_call_id && String(locked.openai_realtime_call_id) !== input.incoming.openAiCallId) {
      throw new CallCommandRealtimeError('Call is already bound to a different provider call', 'CALLCOMMAND_REALTIME_CALL_CONFLICT', 409);
    }
    const boundReceipt=(await tx.execute(sql`SELECT provider_event_id,status FROM callcommand_ingestion_events
      WHERE tenant_id=${input.authority.tenant_id} AND source='openai_realtime' AND call_id=${input.authority.id}
      ORDER BY received_at,id LIMIT 1 FOR UPDATE`)).rows[0];
    if(boundReceipt && boundReceipt.provider_event_id!==input.incoming.eventId) {
      return {duplicate:true as const,mode:'none' as const,recovered:false as const,status:String(boundReceipt.status)};
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
        SELECT *,CASE WHEN processing_lease_expires_at IS NOT NULL THEN processing_lease_expires_at<=clock_timestamp()
          ELSE received_at::timestamptz<=clock_timestamp()-INTERVAL '30 seconds' END AS lease_expired FROM callcommand_ingestion_events
        WHERE tenant_id=${input.authority.tenant_id} AND source='openai_realtime'
          AND provider_event_id=${input.incoming.eventId} FOR UPDATE
      `)).rows[0] as Row | undefined;
      if (!existing || existing.payload_sha256 !== input.payloadSha256 || existing.call_id !== input.authority.id) {
        throw new CallCommandRealtimeError('Webhook replay conflicts with the original event', 'CALLCOMMAND_REALTIME_WEBHOOK_CONFLICT', 409);
      }
      const status = String(existing.status ?? 'processing');
      const leaseExpired = existing.lease_expired===true;
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
        return { duplicate: false as const, mode: 'accept' as const, recovered: true as const, status, processingOwner };
      }
      if (['accepting','provider_confirmed','sideband_connecting','sideband_connected'].includes(status)
        && !hasCallCommandRealtimeSideband(String(input.authority.id))
        && leaseExpired) {
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
        return { duplicate: false as const, mode: 'reattach' as const, recovered: true as const, status, processingOwner };
      }
      return { duplicate: true as const, mode: 'none' as const, recovered: false as const, status };
    }
    await tx.execute(sql`
      UPDATE callcommand_calls SET openai_realtime_call_id=${input.incoming.openAiCallId},
        realtime_status='connecting',realtime_last_event_at=NOW(),realtime_error_code=NULL,updated_at=NOW()
      WHERE tenant_id=${input.authority.tenant_id} AND id=${input.authority.id}
    `);
    return { duplicate: false as const, mode: 'accept' as const, recovered: false as const, status: 'processing', processingOwner };
  });
}

async function markProviderAccepting(authority: Row, incoming: VerifiedOpenAiIncomingCall): Promise<void> {
  await withOwnedAuthority(authority,async tx => { await tx.execute(sql`
    UPDATE callcommand_ingestion_events SET status='accepting',
      processing_lease_expires_at=NOW()+INTERVAL '30 seconds',error_code=NULL
    WHERE tenant_id=${authority.tenant_id} AND source='openai_realtime' AND provider_event_id=${incoming.eventId}
  `); });
}

async function markProviderAccepted(authority: Row, incoming: VerifiedOpenAiIncomingCall): Promise<void> {
  await withOwnedAuthority(authority,async tx => {
    await recordConfirmedReceipt(tx,sidebandOwner(authority));
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

async function markSidebandConnected(authority: Row, incoming: Pick<VerifiedOpenAiIncomingCall,'eventId'|'openAiCallId'>): Promise<void> {
  await withOwnedAuthority(authority,async tx => {
    await recordConfirmedReceipt(tx,sidebandOwner(authority));
    await tx.execute(sql`
      UPDATE callcommand_ingestion_events SET status='sideband_connected',processed_at=NOW(),error_code=NULL,
        processing_lease_expires_at=NOW()+INTERVAL '30 seconds'
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

async function releaseOwnedLane(tx: CallCommandRealtimeTransaction, owner: CallCommandRealtimeOwnership, reason: string) {
  await tx.execute(sql`UPDATE callcommand_lane_leases SET status='released',released_at=NOW(),release_reason=${reason},updated_at=NOW()
    WHERE tenant_id=${owner.tenantId} AND id=${owner.capacityLeaseId} AND call_id=${owner.callId} AND status='active'`);
}

async function markIncomingFailed(authority: Row, incoming: Pick<VerifiedOpenAiIncomingCall,'eventId'>, code: string, definitelyUnaccepted = false): Promise<void> {
  await withOwnedAuthority(authority,async tx => {
    await tx.execute(sql`UPDATE callcommand_ingestion_events SET error_code=${safeText(code,80)},
      status=CASE WHEN ${definitelyUnaccepted} THEN 'accept_declined' ELSE status END,
      processing_lease_expires_at=NOW()+INTERVAL '30 seconds'
      WHERE tenant_id=${authority.tenant_id} AND source='openai_realtime' AND provider_event_id=${incoming.eventId}`);
    await tx.execute(sql`UPDATE callcommand_calls SET realtime_status=${definitelyUnaccepted ? 'failed':'connecting'},realtime_error_code=${safeText(code,80)},updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}`);
    await tx.execute(sql`UPDATE callcommand_tenant_runtime_settings SET realtime_health_status='degraded',realtime_last_error_code=${safeText(code,80)},updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id}`);
  });
}

async function loadRuntimeConfiguration(authority: Row) {
  if(authority.msp_unverified_call===true || authority.msp_unverified_intake_verified===true)return loadUnverifiedRuntimeConfiguration(authority);
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
    ...activeFlowActions((flow.rows[0] as Row | undefined)?.graph_json, authority),
  ];
  const transferEnabled = authority.live_behavior === 'ai_screen_then_transfer'
    || authority.fallback_behavior === 'transfer';
  const bindings = buildToolBindings({ actions, transferTargets: targets.rows as Row[], transferEnabled, productMode: String(authority.product_mode) });
  const transferReference = [...bindings.targetAliases.entries()].map(([alias, targetId]) => ({
    alias,
    label: safeText((targets.rows as Row[]).find(target => String(target.id) === targetId)?.label, 120),
  }));
  const voicePolicy = callCommandVoicePolicy({supportIntakeEnabled:bindings.supportIntakeEnabled,transferReference});
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
  })), Math.min(11_000,12_000-voicePolicy.length-2));
  const instructions = `${compiled}\n\n${voicePolicy}`;
  const userId = String((custodian.rows[0] as Row | undefined)?.user_id ?? '');
  if (!userId) throw new CallCommandRealtimeError('Tenant has no active call custodian', 'CALLCOMMAND_REALTIME_CUSTODIAN_MISSING', 409);
  return { ...bindings, instructions, userId };
}

/** A0 never compiles tenant scripts, private knowledge, condition-matched rules or customer fields. */
async function loadUnverifiedRuntimeConfiguration(authority:Row) {
  const identity=await db.transaction(tx=>loadIntakeIdentity(tx,authority));
  const [rules,targets,custodian]=await Promise.all([
    db.execute(sql`SELECT conditions_json,actions_json FROM callcommand_automation_rules
      WHERE tenant_id=${authority.tenant_id} AND enabled=TRUE AND deleted_at IS NULL
        AND conditions_json='{}'::jsonb ORDER BY priority,id LIMIT 100`),
    db.execute(sql`SELECT id,business_hours FROM callcommand_transfer_targets WHERE tenant_id=${authority.tenant_id}
      AND kind='external' AND status='active' AND verified_at IS NOT NULL AND phone_e164 IS NOT NULL
      AND deleted_at IS NULL ORDER BY created_at,id LIMIT 20`),
    db.execute(sql`SELECT tu.user_id FROM tenant_users tu JOIN users u ON u.id=tu.user_id AND u.status='active'
      WHERE tu.tenant_id=${authority.tenant_id} ORDER BY CASE tu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,tu.joined_at,tu.user_id LIMIT 1`),
  ]);
  const now=new Date();
  const availableTargets=firstContactAvailableTargets(targets.rows as Array<Row & {business_hours?:unknown}>,now,String(authority.timezone));
  const transferEnabled=firstContactHumanTransferAllowed({businessHoursOpen:isWithinBusinessHours(authority.business_hours,now,String(authority.timezone)),
    targetCount:availableTargets.length,liveBehavior:String(authority.live_behavior),fallbackBehavior:String(authority.fallback_behavior)});
  const controls=buildToolBindings({actions:[],transferTargets:availableTargets.length===1 ? availableTargets : [],transferEnabled,productMode:'msp'});
  const actionBindings=new Map<string,Row[]>();
  const emails=firstContactEmailActions(rules.rows as Row[]);
  if(emails.length)actionBindings.set('send_email',emails);
  const userId=String((custodian.rows[0] as Row|undefined)?.user_id??'');
  if(!userId)throw new CallCommandRealtimeError('Tenant has no active call custodian','CALLCOMMAND_REALTIME_CUSTODIAN_MISSING',409);
  return {...controls,tools:firstContactTools(controls.tools),actionBindings,supportIntakeEnabled:true,userId,
    instructions:firstContactVoiceInstructions()+`\nCURRENT SERVER INTAKE MODE: ${identity.state.mode}; failed code attempts ${identity.state.failures} of 2. If manual, do not request another code; if code_resolved, never disclose stored details.`};
}

function toolAuthority(name: string): string | null {
  const mapping = Object.values(ACTION_TO_TOOL).find(candidate => candidate.name === name);
  if (mapping) return mapping.authority;
  if (name === 'transfer_call') return 'call.transfer';
  if (name === 'end_call') return 'call.end';
  return null;
}

async function reserveControlAction(authority: Row, invocation: RealtimeToolInvocation, actionType: string) {
  const key = `${authority.id}:realtime:control:${actionType}`;
  const created = await withOwnedAuthority(authority,tx => tx.execute(sql`
    INSERT INTO callcommand_action_runs(
      tenant_id,call_id,action_type,status,idempotency_key,provider,safe_result,
      attempts,reservation_status,reserved_at,lease_expires_at
    ) VALUES (
      ${authority.tenant_id},${authority.id},${actionType},'running',${key},'openai','{}'::jsonb,
      1,'claimed',NOW(),NOW()+INTERVAL '2 minutes'
    ) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING *
  `));
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

async function dispatchRealtimeNotifications(input: {
  authority: Row;
  configuration: Awaited<ReturnType<typeof loadRuntimeConfiguration>>;
  call: Row;
  summary: string;
  toolName?: string;
}) {
  const results: Row[] = [];
  if(input.authority.msp_unverified_call===true && input.authority.msp_unverified_intake_verified!==true)return {
    configured:false,outcomes:[] as string[],externalDelivery:false,receiptConfirmed:false,deferred:true,
    deliveryState:'unverified_intake_disabled_or_expired',ticketCreationConfirmed:false,mailboxReceiptConfirmed:false,
  };
  const intake = input.configuration.supportIntakeEnabled ? await loadSupportIntake(input.authority) : null;
  let summary = intake ? formatSupportIntake(intake) : input.summary;
  if (input.authority.product_mode === 'msp') {
    const local = await db.execute(sql`
      SELECT local_case.reference FROM callcommand_local_cases local_case
      JOIN callcommand_msp_call_contexts context ON context.tenant_id=local_case.tenant_id AND context.id=local_case.call_context_id
      WHERE context.tenant_id=${input.authority.tenant_id} AND context.call_id=${input.authority.id} LIMIT 1
    `);
    const reference = safeText((local.rows[0] as Row | undefined)?.reference,80);
    // A human-first attempt must not consume the one-per-call ticket email
    // with incomplete details before the caller can finish intake afterward.
    if (!mspSupportNotificationReady(intake,Boolean(reference))) return {
      configured:input.configuration.actionBindings.has('send_email'),outcomes:[] as string[],
      externalDelivery:false,receiptConfirmed:false,deferred:true,deliveryState:'awaiting_confirmed_msp_case',
      ticketCreationConfirmed:false,mailboxReceiptConfirmed:false,
    };
    summary += reference ? `\nLocal MSP intake reference: ${reference}` : '\nLocal MSP case not yet confirmed; follow-up required.';
    if(input.authority.msp_unverified_intake_verified===true)summary=unverifiedSupportSummary(intake!,summary);
  }
  let firstContactEmail:ReturnType<typeof formatBmsIntakeEmail>|null=null;
  if(input.authority.msp_unverified_call===true || input.authority.msp_unverified_intake_verified===true){
    firstContactEmail=await db.transaction(async tx=>{
      const current=await loadIntakeIdentity(tx,input.authority);
      const saved=await tx.execute(sql`SELECT collected_data FROM callcommand_live_sessions WHERE tenant_id=${input.authority.tenant_id}
        AND call_id=${input.authority.id} ORDER BY started_at DESC,id DESC LIMIT 1`);
      const snapshot=readFirstContactSnapshot((saved.rows[0] as Row|undefined)?.collected_data);
      if(!snapshot || snapshot.status!=='confirmed' || snapshot.identitySource!==(current.match?'code_resolved':'manual')
        || snapshot.identityRevision!==(current.match?.revision??'manual'))return null;
      return formatBmsIntakeEmail({tenantId:String(input.authority.tenant_id),callId:String(input.authority.id),
        createdAt:new Date(input.authority.created_at).toISOString(),snapshot,match:current.match});
    });
    if(!firstContactEmail)return {configured:false,outcomes:[] as string[],externalDelivery:false,receiptConfirmed:false,deferred:true,
      deliveryState:'first_contact_readback_required',ticketCreationConfirmed:false,mailboxReceiptConfirmed:false};
  }
  for (const name of ['send_email', 'send_slack_alert', 'create_webhook_event']) {
    if (input.toolName && input.toolName !== name) continue;
    const actions = input.configuration.actionBindings.get(name);
    if (!actions?.length) continue;
    results.push(...await dispatchCallCommandActions({
      tenantId: String(input.authority.tenant_id), userId: input.configuration.userId,
      call: { ...input.call, summary },
      actions: actions.map(action => firstContactEmail ? {...action,destination:firstContactEmail.destination,subject:firstContactEmail.subject,body:firstContactEmail.body} : ({ ...action, body: [
        safeText(action.body, 4_000),
        `CallCommand call: ${input.authority.id}`,
        `Caller: ${safeText(input.call.phone_masked, 80) || 'unavailable'}`,
        summary,
      ].filter(Boolean).join('\n\n') })),
      correlationId: `realtime:${input.authority.id}`,
      // One configured notification per call, shared by explicit tools and
      // finalization. New model tool IDs must not resend the same destination.
      idempotencyNamespace: `realtime-notification:${name}`,
      durableNotifications: true,
      ...(input.authority.sidebandOwnership ? {authorizeReservation:reservationGuard(input.authority)} : {}),
    }));
  }
  const outcomes = results.map(result => String(result.status ?? 'unknown'));
  return {
    configured: outcomes.length > 0,
    outcomes,
    externalDelivery: outcomes.length > 0 && outcomes.every(status => status === 'delivered'),
    receiptConfirmed: false,
    deferred:false,
    ...supportDeliveryEvidence(outcomes),
  };
}

async function loadSupportIntake(authority: Row) {
  const result = await db.execute(sql`
    SELECT collected_data FROM callcommand_live_sessions
    WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id}
    ORDER BY started_at DESC,id DESC LIMIT 1
  `);
  return readSupportIntakeSnapshot((result.rows[0] as Row | undefined)?.collected_data);
}

async function saveSupportIntake(authority: Row, argumentsValue: unknown) {
  return withOwnedAuthority(authority,async tx => {
    const result = await tx.execute(sql`
      SELECT id,collected_data FROM callcommand_live_sessions
      WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND ended_at IS NULL
      ORDER BY started_at DESC,id DESC LIMIT 2 FOR UPDATE
    `);
    if (result.rows.length !== 1) throw new CallCommandRealtimeError('Support intake has no unique active session','SUPPORT_INTAKE_SESSION_UNAVAILABLE',409);
    const session = result.rows[0] as Row;
    const previous = readSupportIntakeSnapshot(session.collected_data);
    const snapshot = saveSupportIntakeSnapshot(argumentsValue,previous);
    await tx.execute(sql`
      UPDATE callcommand_live_sessions
      SET collected_data=collected_data || ${JSON.stringify({_operatorosSupportIntakeV1:snapshot})}::jsonb,
        sequence=sequence+1,updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND id=${session.id} AND ended_at IS NULL
    `);
    if (snapshot.status === 'confirmed') await tx.execute(sql`
      UPDATE callcommand_calls SET customer_name=${snapshot.fields.callerName || null},company_name=${snapshot.fields.company || null},
        summary=${formatSupportIntake(snapshot)},updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}
    `);
    return {ok:true,providerActionConfirmed:false,intakeSaved:true,status:snapshot.status,confirmationRevision:snapshot.revision,
      readback:snapshot.fields,declinedFields:snapshot.declinedFields,
      callerConfirmationRequired:snapshot.status !== 'confirmed',associationAssurance:snapshot.associationAssurance,
      previousNotificationUpdateConfirmed:false,ticketCreationConfirmed:false};
  });
}

export async function finalizeCallCommandRealtimeNotifications(callId: string) {
  const authority = await loadAuthority(callId);
  if (!authority?.openai_realtime_call_id) return null;
  const configuration = await loadRuntimeConfiguration(authority);
  const summary = safeText(authority.summary, 1_500)
    || 'The caller disconnected before a summary was captured. Review the saved call and arrange follow-up.';
  await db.execute(sql`UPDATE callcommand_calls SET summary=${summary},updated_at=NOW() WHERE tenant_id=${authority.tenant_id} AND id=${authority.id} AND (summary IS NULL OR summary='')`);
  return dispatchRealtimeNotifications({authority,configuration,call:authority,summary});
}

async function executeRealtimeTool(input: {
  adapter: RealtimeAdapter;
  authority: Row;
  configuration: Awaited<ReturnType<typeof loadRuntimeConfiguration>>;
  invocation: RealtimeToolInvocation;
}) {
  const { invocation, adapter } = input;
  const owner = sidebandOwner(input.authority);
  const authority = await loadAuthority(owner.callId,db,owner.tenantId);
  if (authority) authority.sidebandOwnership=owner;
  if (!authority || authority.channel_status !== 'active' || authority.commercial_realtime_ready !== true || !isRealtimeCallEligible(authority)) {
    throw new CallCommandRealtimeError('Call authority is no longer active','CALLCOMMAND_REALTIME_CONFIGURATION_INACTIVE',409);
  }
  const configuration = await loadRuntimeConfiguration(authority);
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
  if(invocation.name==='resolve_support_link'){
    if(authority.msp_unverified_intake_verified!==true)throw new CallCommandRealtimeError('Intake identity is unavailable','FIRST_CONTACT_ONLY',403);
    return withOwnedAuthority(authority,tx=>resolveIntakeIdentity(tx,authority,invocation.toolCallId,invocation.arguments));
  }
  if(invocation.name==='save_first_contact_intake'){
    if(authority.msp_unverified_intake_verified!==true)throw new CallCommandRealtimeError('Intake is unavailable','FIRST_CONTACT_ONLY',403);
    return withOwnedAuthority(authority,async tx=>{
      const current=await loadIntakeIdentity(tx,authority);
      const saved=await tx.execute(sql`SELECT id,collected_data FROM callcommand_live_sessions WHERE tenant_id=${authority.tenant_id}
        AND call_id=${authority.id} AND ended_at IS NULL ORDER BY started_at DESC,id DESC LIMIT 2 FOR UPDATE`);
      if(saved.rows.length!==1)throw new CallCommandRealtimeError('Active intake unavailable','SUPPORT_INTAKE_SESSION_UNAVAILABLE',409);
      const row=saved.rows[0] as Row;
      const snapshot=saveFirstContactSnapshot(invocation.arguments,readFirstContactSnapshot(row.collected_data),
        {source:current.match?'code_resolved':'manual',revision:current.match?.revision??'manual'});
      if(!current.match&&current.state.mode==='offer')await resolveIntakeIdentity(tx,authority,`manual:${invocation.toolCallId}`,{skip:true});
      const fields=snapshot.fields;
      const declinedFields:string[]=[];
      const callerName=[fields.firstName,fields.lastName].filter(Boolean).join(' ').slice(0,120);
      for(const [key,value] of Object.entries({callerName,company:fields.company,callbackPhone:fields.callbackPhone,issue:fields.issue,impact:fields.impact}))if(!value)declinedFields.push(key);
      const projected=saveSupportIntakeSnapshot({fields:{callerName,company:fields.company,callbackPhone:fields.callbackPhone,issue:fields.issue,impact:fields.impact},declinedFields,callerConfirmed:false},null);
      projected.status=snapshot.status;
      await tx.execute(sql`UPDATE callcommand_live_sessions SET collected_data=collected_data||${JSON.stringify({_operatorosFirstContactV1:snapshot,_operatorosSupportIntakeV1:projected})}::jsonb,
        sequence=sequence+1,updated_at=NOW() WHERE tenant_id=${authority.tenant_id} AND id=${row.id}`);
      return {ok:true,providerActionConfirmed:false,status:snapshot.status,confirmationRevision:snapshot.revision,
        readback:publicFirstContactReadback(snapshot),identitySource:snapshot.identitySource,authenticated:false,
        ticketCreationConfirmed:false,mailboxReceiptConfirmed:false,previousNotificationUpdateConfirmed:false};
    });
  }
  if(authority.msp_unverified_intake_verified===true && invocation.name==='save_support_intake')throw new CallCommandRealtimeError('Use bounded first-contact intake','FIRST_CONTACT_TOOL_REQUIRED',403);
  if (invocation.name === 'save_support_intake') {
    if (!configuration.supportIntakeEnabled) throw new CallCommandRealtimeError('Support intake is no longer offered','SUPPORT_INTAKE_NOT_CONFIGURED',403);
    return saveSupportIntake(authority,invocation.arguments);
  }
  if(invocation.name==='submit_unverified_support_request'){
    if(authority.msp_unverified_intake_verified!==true)throw new CallCommandRealtimeError('Unverified intake is unavailable','UNVERIFIED_INTAKE_NOT_AUTHORIZED',403);
    const snapshot=await loadSupportIntake(authority);
    if(snapshot?.status!=='confirmed')return {ok:false,providerActionConfirmed:false,code:'SUPPORT_INTAKE_CONFIRMATION_REQUIRED',ticketCreationConfirmed:false};
    const identityReady=await withOwnedAuthority(authority,async tx=>{
      const current=await loadIntakeIdentity(tx,authority);
      const result=await tx.execute(sql`SELECT collected_data FROM callcommand_live_sessions WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND ended_at IS NULL ORDER BY started_at DESC,id DESC LIMIT 1`);
      const saved=readFirstContactSnapshot((result.rows[0] as Row|undefined)?.collected_data);
      return saved?.status==='confirmed' && saved.identitySource===(current.match?'code_resolved':'manual') && saved.identityRevision===(current.match?.revision??'manual');
    });
    if(!identityReady)return {ok:false,providerActionConfirmed:false,code:'FIRST_CONTACT_READBACK_REQUIRED',manualAssociationRequired:true,ticketCreationConfirmed:false};
    const localCase=await withOwnedAuthority(authority,async tx=>{
      const result=await tx.execute(sql`SELECT * FROM callcommand_msp_call_contexts WHERE tenant_id=${authority.tenant_id}
        AND call_id=${authority.id} AND provider_call_id=${authority.provider_call_sid} FOR UPDATE`);
      const context=result.rows[0] as Row|undefined;
      if(!unverifiedContextAllowed(context))throw new CallCommandRealtimeError('Unverified context changed','UNVERIFIED_INTAKE_CONTEXT_CHANGED',409);
      const existing=await tx.execute(sql`SELECT * FROM callcommand_local_cases WHERE tenant_id=${authority.tenant_id} AND call_context_id=${context!.id} LIMIT 1`);
      if(existing.rows[0])return existing.rows[0] as Row;
      if(context!.state==='ORIGINATING_LINE_EVALUATED')await transitionMspCall({tenantId:String(authority.tenant_id),callContextId:String(context!.id),to:'UNRECOGNIZED_LINE',eventType:'first_contact.unverified_intake',evidence:{assurance:'A0'}},tx);
      await transitionMspCall({tenantId:String(authority.tenant_id),callContextId:String(context!.id),to:'CALLBACK_REQUESTED',eventType:'unverified.request.confirmed',actorType:'CALLER',evidence:{manualAssociationRequired:true,confirmationRevision:snapshot.revision}},tx);
      const suggestion={...classifyMspIntake(unverifiedSupportSummary(snapshot,formatSupportIntake(snapshot))),requestedActionHint:null,requiresHumanReview:true};
      const saved=await createLocalCase({tenantId:String(authority.tenant_id),callContextId:String(context!.id),suggestion},tx);
      await tx.execute(sql`UPDATE callcommand_local_cases SET status='OPEN',bms_sync_status='BLOCKED',updated_at=NOW() WHERE tenant_id=${authority.tenant_id} AND id=${saved.id}`);
      await transitionMspCall({tenantId:String(authority.tenant_id),callContextId:String(context!.id),to:'LOCAL_CASE_CREATED',eventType:'unverified.local_request.created',evidence:{manualAssociationRequired:true,assurance:'A0',caseId:String(saved.id)}},tx);
      await transitionMspCall({tenantId:String(authority.tenant_id),callContextId:String(context!.id),to:'COMPLETED',eventType:'unverified.intake.recorded',evidence:{manualAssociationRequired:true,externalTicketConfirmed:false,bmsQueued:false,automationExecuted:false}},tx);
      return saved;
    });
    const notification=await dispatchRealtimeNotifications({authority,configuration,call,summary:formatSupportIntake(snapshot),toolName:'send_email'});
    return {ok:true,providerActionConfirmed:false,localRequestRecorded:true,localReference:String(localCase.reference),manualAssociationRequired:true,assurance:'A0',previousNotificationUpdateConfirmed:false,...notification};
  }
  if(authority.msp_unverified_intake_verified===true && !['resolve_support_link','save_first_contact_intake','transfer_call','end_call'].includes(invocation.name)){
    throw new CallCommandRealtimeError('Unverified caller has no such capability','UNVERIFIED_TOOL_NOT_ALLOWED',403);
  }
  if (invocation.name === 'submit_support_request') {
    if (authority.product_mode !== 'msp' || !configuration.supportIntakeEnabled) throw new CallCommandRealtimeError('MSP intake is not currently authorized','SUPPORT_INTAKE_NOT_CONFIGURED',403);
    const snapshot = await loadSupportIntake(authority);
    if (snapshot?.status !== 'confirmed') return {ok:false,providerActionConfirmed:false,code:'SUPPORT_INTAKE_CONFIRMATION_REQUIRED',ticketCreationConfirmed:false};
    const localCase = await withOwnedAuthority(authority,async tx => {
      const contexts = await tx.execute(sql`SELECT * FROM callcommand_msp_call_contexts WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND provider_call_id=${authority.provider_call_sid} AND assurance_level='A1' FOR UPDATE`);
      const context = contexts.rows[0] as Row | undefined;
      if (!context) throw new CallCommandRealtimeError('Associated MSP case context is unavailable','SUPPORT_INTAKE_CONTEXT_UNAVAILABLE',409);
      const existing = await tx.execute(sql`SELECT * FROM callcommand_local_cases WHERE tenant_id=${authority.tenant_id} AND call_context_id=${context.id} LIMIT 1`);
      if (existing.rows[0]) return existing.rows[0] as Row;
      const suggestion = classifyMspIntake(formatSupportIntake(snapshot));
      await transitionMspCall({tenantId:String(authority.tenant_id),callContextId:String(context.id),to:'INTENT_CAPTURED',eventType:'realtime.intake.confirmed',actorType:'CALLER',intent:suggestion.intent,
        evidence:{confirmationRevision:snapshot.revision,associationAssurance:'A1',automationExecuted:false}},tx);
      const saved = await createLocalCase({tenantId:String(authority.tenant_id),callContextId:String(context.id),organizationId:String(context.organization_id),contactId:String(context.contact_id),suggestion},tx);
      await tx.execute(sql`UPDATE callcommand_local_cases SET bms_sync_status='BLOCKED',updated_at=NOW() WHERE tenant_id=${authority.tenant_id} AND id=${saved.id}`);
      await transitionMspCall({tenantId:String(authority.tenant_id),callContextId:String(context.id),to:'LOCAL_CASE_CREATED',eventType:'realtime.local_case.created',evidence:{caseId:String(saved.id)}},tx);
      await transitionMspCall({tenantId:String(authority.tenant_id),callContextId:String(context.id),to:'COMPLETED',eventType:'realtime.intake.recorded',evidence:{localCaseRecorded:true,externalTicketConfirmed:false,automationExecuted:false,fulfillment:'configured_support_email',bmsQueued:false}},tx);
      return saved;
    });
    const notification = await dispatchRealtimeNotifications({authority,configuration,call,summary:formatSupportIntake(snapshot),toolName:'send_email'});
    return {ok:notification.configured && !notification.deferred && notification.outcomes.length>0 && notification.outcomes.every(status=>SUCCESSFUL_ACTION_STATES.has(status)),providerActionConfirmed:false,
      action:invocation.name,localCaseRecorded:true,localReference:String(localCase.reference),...notification};
  }
  const authorityName = toolAuthority(invocation.name);
  if (!authorityName) throw new CallCommandRealtimeError('Tool is not allowlisted', 'CALLCOMMAND_REALTIME_TOOL_NOT_ALLOWED', 403);

  if (configuration.actionBindings.has(invocation.name)) {
    const actions = configuration.actionBindings.get(invocation.name)!;
    const authorization = authorizeCallCommandTool({
      tool: authorityName, callState: String(call.status), enabledActions: [authorityName],
    });
    if (!authorization.allowed) throw new CallCommandRealtimeError('Tool is not authorized', authorization.code, 403);
    const supportIntake = configuration.supportIntakeEnabled && ['send_email','create_ticket'].includes(invocation.name)
      ? await loadSupportIntake(authority) : null;
    if (configuration.supportIntakeEnabled && ['send_email','create_ticket'].includes(invocation.name) && supportIntake?.status !== 'confirmed') {
      return {ok:false,providerActionConfirmed:false,code:'SUPPORT_INTAKE_CONFIRMATION_REQUIRED',ticketCreationConfirmed:false,
        instruction:'Save support details, read them back and confirm the exact revision before submitting. Human transfer remains available without completing intake.'};
    }
    const summary = supportIntake ? formatSupportIntake(supportIntake) : safeText(invocation.arguments.summary, 1_500);
    if (!summary) throw new CallCommandRealtimeError('Tool summary is required', 'CALLCOMMAND_REALTIME_TOOL_ARGUMENT_INVALID', 400);
    await withOwnedAuthority(authority,tx => tx.execute(sql`
      UPDATE callcommand_calls SET summary=${summary},updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}
    `));
    if (['send_email', 'send_slack_alert', 'create_webhook_event'].includes(invocation.name)) {
      const notification = await dispatchRealtimeNotifications({ authority, configuration, call, summary, toolName: invocation.name });
      return {
        ok: notification.configured && notification.outcomes.every(status => SUCCESSFUL_ACTION_STATES.has(status)),
        action: invocation.name, ...notification,
      };
    }
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
      authorizeReservation:reservationGuard(authority),
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
    const summary = authority.msp_unverified_call===true ? 'CallCommandAI unverified intake; review the saved structured request.' : safeText(invocation.arguments.summary, 1_500);
    if (!summary) throw new CallCommandRealtimeError('Tool summary is required', 'CALLCOMMAND_REALTIME_TOOL_ARGUMENT_INVALID', 400);
    const reservation = await reserveControlAction(authority, invocation, 'transfer');
    if (!reservation.claimed) return { ok: reservation.row?.status === 'completed', action: invocation.name, duplicate: true };
    let providerActionConfirmed = false;
    let transferLogId: string | null = null;
    try {
      await withOwnedAuthority(authority,tx => tx.execute(sql`UPDATE callcommand_calls SET summary=${summary},updated_at=NOW() WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}`));
      const notification = await dispatchRealtimeNotifications({ authority, configuration, call, summary });
      transferLogId = await withOwnedAuthority(authority,async tx => {
        const session = (await tx.execute(sql`
          UPDATE callcommand_live_sessions SET state='transferring',sequence=sequence+1,updated_at=NOW()
          WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND ended_at IS NULL RETURNING id
        `)).rows[0] as Row | undefined;
        const log = await tx.execute(sql`
          INSERT INTO callcommand_transfer_logs(
            tenant_id,call_id,session_id,target_id,requested_by_user_id,provider,status,reason,completed_at
          ) VALUES (
            ${authority.tenant_id},${authority.id},${session?.id ?? null},${target.id},${configuration.userId},
            'openai','requested','Server-authorized Realtime transfer request',NULL
          ) RETURNING id
        `);
        return String(log.rows[0].id);
      });
      await withOwnedAuthority(authority,async () => undefined);
      await adapter.refer(invocation.openAiCallId, `tel:${String(target.phone_e164)}`);
      providerActionConfirmed = true;
      await withOwnedAuthority(authority,async tx => {
        await tx.execute(sql`
          UPDATE callcommand_transfer_logs SET status='provider_accepted'
          WHERE tenant_id=${authority.tenant_id} AND id=${transferLogId} AND status='requested'
        `);
        await tx.execute(sql`
          INSERT INTO callcommand_events(tenant_id,call_id,event_type,safe_payload)
          VALUES (${authority.tenant_id},${authority.id},'provider.openai_realtime.transfer_accepted',
            ${JSON.stringify({ provider: 'openai', providerActionConfirmed: true, humanConnectionConfirmed: false })}::jsonb)
        `);
      });
      await finishControlAction(authority, String(reservation.row.id), {
        status: 'completed', safeResult: { providerActionConfirmed: true, humanConnectionConfirmed: false, notification },
      });
      return { ok: true, action: invocation.name, providerActionConfirmed: true, humanConnectionConfirmed: false, notification };
    } catch (error) {
      const outcomeUnknown = providerActionConfirmed || (error as any)?.code === 'CALLCOMMAND_REALTIME_TIMEOUT'
        || (Number((error as any)?.statusCode)>=500 && (error as any)?.providerStatus === undefined);
      await finishControlAction(authority, String(reservation.row.id), {
        status: 'failed', safeResult: { providerActionConfirmed, outcomeUnknown },
        errorCode: safeText((error as any)?.code ?? 'CALLCOMMAND_REALTIME_TRANSFER_FAILED', 80),
      });
      if (!outcomeUnknown) {
        await withOwnedAuthority(authority,tx => tx.execute(sql`UPDATE callcommand_transfer_logs SET status='failed',completed_at=NOW() WHERE tenant_id=${authority.tenant_id} AND id=${transferLogId} AND status='requested'`));
        await withOwnedAuthority(authority,tx => tx.execute(sql`UPDATE callcommand_live_sessions SET state='connected',sequence=sequence+1,updated_at=NOW() WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND state='transferring' AND ended_at IS NULL`));
      }
      return { ok: false, action: invocation.name, providerActionConfirmed, outcomeUnknown,
        callerStillActive: !outcomeUnknown, fallback: outcomeUnknown
          ? 'Do not repeat the transfer; its downstream outcome requires reconciliation.'
          : 'Offer a callback and end politely when the caller agrees.' };
    }
  }

  if (invocation.name === 'end_call') {
    const authorization = authorizeCallCommandTool({
      tool: 'call.end', callState: String(call.status), enabledActions: ['call.end'],
    });
    if (!authorization.allowed) throw new CallCommandRealtimeError('Call end is not authorized', authorization.code, 403);
    const summary = authority.msp_unverified_call===true ? 'CallCommandAI unverified intake; review the saved structured request.' : safeText(invocation.arguments.summary, 1_500);
    if (!summary) throw new CallCommandRealtimeError('Tool summary is required', 'CALLCOMMAND_REALTIME_TOOL_ARGUMENT_INVALID', 400);
    const reservation = await reserveControlAction(authority, invocation, 'end_call');
    if (!reservation.claimed) return { ok: reservation.row?.status === 'completed', action: invocation.name, duplicate: true };
    let providerActionConfirmed = false;
    try {
      await withOwnedAuthority(authority,tx => tx.execute(sql`UPDATE callcommand_calls SET summary=${summary},updated_at=NOW() WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}`));
      const notification = await dispatchRealtimeNotifications({ authority, configuration, call, summary });
      await withOwnedAuthority(authority,async () => undefined);
      await adapter.hangup(invocation.openAiCallId);
      providerActionConfirmed = true;
      await withOwnedAuthority(authority,async tx => {
        await tx.execute(sql`
          UPDATE callcommand_calls SET status='completed',realtime_status='completed',
            completed_at=COALESCE(completed_at,NOW()),ended_at=COALESCE(ended_at,NOW()),updated_at=NOW()
          WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}
        `);
        await tx.execute(sql`
          UPDATE callcommand_live_sessions SET state='completed',ended_at=COALESCE(ended_at,NOW()),sequence=sequence+1,updated_at=NOW()
          WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} AND ended_at IS NULL
        `);
        await releaseOwnedLane(tx,sidebandOwner(authority),'realtime_end_tool');
      });
      await finishControlAction(authority, String(reservation.row.id), {
        status: 'completed', safeResult: { providerActionConfirmed: true, notification },
      });
      return { ok: true, action: invocation.name, providerActionConfirmed: true, notification };
    } catch (error) {
      const outcomeUnknown = providerActionConfirmed || (error as any)?.code === 'CALLCOMMAND_REALTIME_TIMEOUT'
        || (Number((error as any)?.statusCode)>=500 && (error as any)?.providerStatus === undefined);
      await finishControlAction(authority, String(reservation.row.id), {
        status: 'failed', safeResult: { providerActionConfirmed, outcomeUnknown },
        errorCode: safeText((error as any)?.code ?? 'CALLCOMMAND_REALTIME_HANGUP_FAILED', 80),
      });
      return {ok:false,action:invocation.name,providerActionConfirmed,outcomeUnknown,
        callerStillActive:!outcomeUnknown,fallback:outcomeUnknown ? 'Do not repeat hangup; reconcile the provider outcome.' : 'The hangup request failed; stay with the caller.'};
    }
  }
  throw new CallCommandRealtimeError('Tool is not allowlisted', 'CALLCOMMAND_REALTIME_TOOL_NOT_ALLOWED', 403);
}

async function persistTranscript(authority: Row, event: CallCommandRealtimeTranscriptEvent): Promise<void> {
  const providerEventId = `${event.openAiCallId}:${event.role}:${event.itemId}`.slice(0, 200);
  const payloadSha256 = sha256(JSON.stringify({ role: event.role, transcript: event.transcript }));
  await withOwnedAuthority(authority,async (tx,current) => {
    if (!transcriptPersistenceAllowed(current)) throw new CallCommandRealtimeOwnershipError();
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
  // Spoken intake codes must not enter application transcripts. Provider media retention is a separate gate.
  if(authority.msp_unverified_call===true || authority.msp_unverified_intake_verified===true)return false;
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
    sidebandOwnership:sidebandOwner(authority),
  });
}

async function persistProviderError(authority: Row, event: CallCommandRealtimeProviderErrorEvent): Promise<void> {
  const code = safeText(event.code, 80) || 'CALLCOMMAND_REALTIME_PROVIDER_ERROR';
  await withOwnedAuthority(authority,async tx => {
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
  await withOwnedAuthority(authority,async tx => {
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

export const CALLCOMMAND_RECOVERY_ATTEMPTS = 3;
export const CALLCOMMAND_RECOVERY_BATCH = 2;
export const CALLCOMMAND_RECOVERY_BACKOFF_SECONDS = 30;
const RECOVERY_SOURCE = 'openai_realtime_recovery';
const CONFIRMATION_SOURCE = 'openai_realtime_proof';

async function confirmationDigest(tx:CallCommandRealtimeTransaction,owner:CallCommandRealtimeOwnership) {
  const receipt=(await tx.execute(sql`SELECT payload_sha256 FROM callcommand_ingestion_events
    WHERE tenant_id=${owner.tenantId} AND source='openai_realtime' AND provider_event_id=${owner.eventId} AND call_id=${owner.callId}`)).rows[0];
  if(!receipt) throw new CallCommandRealtimeOwnershipError();
  return sha256(JSON.stringify({tenantId:owner.tenantId,callId:owner.callId,eventId:owner.eventId,openAiCallId:owner.openAiCallId,
    payloadSha256:receipt.payload_sha256,capacityLeaseId:owner.capacityLeaseId,capacityGeneration:owner.capacityGeneration}));
}

async function hasConfirmedReceipt(tx:CallCommandRealtimeTransaction,owner:CallCommandRealtimeOwnership) {
  const digest=await confirmationDigest(tx,owner);
  return Boolean((await tx.execute(sql`SELECT id FROM callcommand_ingestion_events
    WHERE tenant_id=${owner.tenantId} AND source=${CONFIRMATION_SOURCE} AND provider_event_id=${`confirmed:${owner.callId}`}
      AND call_id=${owner.callId} AND payload_sha256=${digest} AND status='provider_confirmed'`)).rows[0]);
}

async function recordConfirmedReceipt(tx:CallCommandRealtimeTransaction,owner:CallCommandRealtimeOwnership) {
  const digest=await confirmationDigest(tx,owner);
  await tx.execute(sql`INSERT INTO callcommand_ingestion_events(tenant_id,source,provider_event_id,payload_sha256,call_id,status,processed_at)
    VALUES(${owner.tenantId},${CONFIRMATION_SOURCE},${`confirmed:${owner.callId}`},${digest},${owner.callId},'provider_confirmed',NOW())
    ON CONFLICT (tenant_id,source,provider_event_id) DO NOTHING`);
  if(!await hasConfirmedReceipt(tx,owner)) throw new CallCommandRealtimeOwnershipError();
}

async function deferOwnedRecovery(authority: Row, code: string, immediate = false) {
  await withOwnedAuthority(authority,async tx => {
    const positivelyConfirmed=await hasConfirmedReceipt(tx,sidebandOwner(authority));
    const session = (await tx.execute(sql`SELECT state FROM callcommand_live_sessions
      WHERE tenant_id=${authority.tenant_id} AND call_id=${authority.id} LIMIT 1`)).rows[0];
    if (session?.state === 'transferring') return;
    const budget = (await tx.execute(sql`SELECT attempts FROM callcommand_ingestion_events
      WHERE tenant_id=${authority.tenant_id} AND source=${RECOVERY_SOURCE} AND call_id=${authority.id} LIMIT 1`)).rows[0];
    const attempts = Number(budget?.attempts ?? 0);
    const safeCode = attempts >= CALLCOMMAND_RECOVERY_ATTEMPTS ? 'CALLCOMMAND_REALTIME_RECOVERY_EXHAUSTED' : safeText(code,80);
    const delay = immediate ? 0 : CALLCOMMAND_RECOVERY_BACKOFF_SECONDS * Math.max(1,attempts);
    await tx.execute(sql`UPDATE callcommand_ingestion_events SET status=${positivelyConfirmed ? 'provider_confirmed':'accepting'},error_code=${safeCode},
      processing_lease_expires_at=clock_timestamp()+make_interval(secs=>${delay})
      WHERE tenant_id=${authority.tenant_id} AND source='openai_realtime' AND provider_event_id=${sidebandOwner(authority).eventId}`);
    await tx.execute(sql`UPDATE callcommand_calls SET realtime_status='connecting',realtime_error_code=${safeCode},updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${authority.id}`);
    await tx.execute(sql`UPDATE callcommand_tenant_runtime_settings SET realtime_health_status='degraded',realtime_last_error_code=${safeCode},updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id}`);
  });
}

async function connectOwnedSideband(
  adapter: RealtimeAdapter, authority: Row,
  incoming: Pick<VerifiedOpenAiIncomingCall,'eventId'|'openAiCallId'>, greetOnOpen: boolean,
) {
  const owner = sidebandOwner(authority);
  const configuration = await loadRuntimeConfiguration(authority);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let heartbeatRunning = false, silentClose = false;
  let heartbeatOperation: Promise<unknown> | undefined;
  let registration:CallCommandRealtimeSidebandSession|undefined;
  let unregister = () => {};
  let queue = Promise.resolve();
  const enqueue = <T>(operation:()=>Promise<T>):Promise<T> => {
    const next = queue.then(operation); queue=next.then(()=>undefined,()=>undefined); return next;
  };
  const settleOwnedWork=async()=>{
    for(;;){
      const current=queue,beat=heartbeatOperation;
      await beat?.catch(()=>undefined);await current;
      await new Promise<void>(resolve=>setImmediate(resolve));
      if(current===queue && beat===heartbeatOperation) return;
    }
  };
  const assertEvent = (callId: string) => { if(callId!==owner.openAiCallId) throw new CallCommandRealtimeOwnershipError(); };
  const ignoreLostOwnership = (error:unknown) => { if(!(error instanceof CallCommandRealtimeOwnershipError)) throw error; };
  const callbacks: RealtimeSidebandCallbacks = {
    executeTool:invocation=>enqueue(async()=>{
      assertEvent(invocation.openAiCallId);
      await withOwnedAuthority(authority,async()=>undefined);
      const result=await executeRealtimeTool({adapter,authority,configuration,invocation});
      // A successful end intentionally made the call terminal and released its
      // lane. Still require the same receipt owner and exact lane generation.
      if(invocation.name==='end_call' && result.ok===true && result.providerActionConfirmed===true){
        await db.transaction(tx=>lockCallCommandRealtimeOwnership(tx,owner,{allowTerminalUsage:true}));
      }else await withOwnedAuthority(authority,async()=>undefined);
      return result;
    }),
    onUsage:event=>enqueue(async()=>{assertEvent(event.openAiCallId);await persistUsage(authority,event,adapter.readiness.model);}),
    ...(transcriptPersistenceAllowed(authority) ? {onTranscript:(event:CallCommandRealtimeTranscriptEvent)=>enqueue(async()=>{
      assertEvent(event.openAiCallId);await persistTranscript(authority,event);
    })} : {}),
    onError:event=>enqueue(async()=>{assertEvent(event.openAiCallId);await persistProviderError(authority,event);}),
    onCallbackError:event=>enqueue(()=>persistCallbackFailure(authority,event)),
    onClosed:event=>enqueue(async()=>{
      if(heartbeat) clearInterval(heartbeat); unregister();
      if(silentClose) return;
      assertEvent(event.openAiCallId);
      // A local socket close is not authoritative carrier termination. Keep
      // the unknown call/capacity and let the bounded recovery cycle try again.
      await deferOwnedRecovery(authority,'CALLCOMMAND_REALTIME_SOCKET_CLOSED').catch(ignoreLostOwnership);
    }).finally(()=>{
      // Do not self-await the closed callback. Keep the retired controller
      // discoverable by shutdown until its own queued work has actually settled.
      setImmediate(()=>{void (async()=>{await settleOwnedWork();
        if(registration)retireCallCommandRealtimeSideband(registration);
      })();});
    }),
  };
  let sideband: ReturnType<RealtimeAdapter['connectSideband']> | undefined;
  try {
    await withOwnedAuthority(authority,async()=>undefined);
    sideband=adapter.connectSideband({openAiCallId:incoming.openAiCallId,
      allowedToolNames:configuration.tools.map(tool=>tool.name),callbacks,greetOnOpen:false});
    registration={
      close:()=>sideband?.close(),
      drain:async()=>{
        silentClose=true;if(heartbeat) clearInterval(heartbeat);unregister();sideband?.close();
        await settleOwnedWork();
        await deferOwnedRecovery(authority,'CALLCOMMAND_REALTIME_PROCESS_STOPPED',true).catch(ignoreLostOwnership);
      },
    };
    unregister=registerCallCommandRealtimeSideband(owner.callId,registration);
    await sideband.waitUntilOpen(8_000);
    // This rechecks owner, call, current authority and exact capacity in the
    // same transaction as connected state, including after awaited provider I/O.
    await markSidebandConnected(authority,incoming);
    if(greetOnOpen) {
      const greeting=await withOwnedAuthority(authority,tx=>tx.execute(sql`INSERT INTO callcommand_action_runs(
        tenant_id,call_id,action_type,status,idempotency_key,provider,safe_result,attempts,reservation_status,reserved_at,lease_expires_at)
        VALUES(${owner.tenantId},${owner.callId},'greeting','running',${`${owner.callId}:realtime:greeting`},'openai','{}'::jsonb,1,'claimed',NOW(),NOW()+INTERVAL '2 minutes')
        ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id`));
      if(greeting.rows[0]) {
        await withOwnedAuthority(authority,async()=>undefined);
        sideband.greet();
        await finishControlAction(authority,String(greeting.rows[0].id),{status:'completed',safeResult:{greetingAttempted:true,deliveryConfirmed:false}});
      }
    }
    heartbeat=setInterval(()=>{
      if(heartbeatRunning) return; heartbeatRunning=true;
      heartbeatOperation=withOwnedAuthority(authority,async(tx,current)=>{
        const settings=(await tx.execute(sql`SELECT default_lease_seconds,maximum_lease_seconds FROM callcommand_tenant_runtime_settings
          WHERE tenant_id=${owner.tenantId}`)).rows[0];
        const duration=Math.max(30,Math.min(Number(settings?.default_lease_seconds??900),Number(settings?.maximum_lease_seconds??14400)));
        const maximum=Math.max(30,Number(settings?.maximum_lease_seconds??14400));
        const renewed=await tx.execute(sql`UPDATE callcommand_lane_leases SET renewed_at=clock_timestamp(),
          expires_at=LEAST(GREATEST(expires_at,clock_timestamp()+make_interval(secs=>${duration})),acquired_at+make_interval(secs=>${maximum})),updated_at=NOW()
          WHERE tenant_id=${owner.tenantId} AND id=${owner.capacityLeaseId} AND call_id=${owner.callId}
            AND provider_call_sid=${current.provider_call_sid} AND status='active' AND expires_at>clock_timestamp()
            AND acquired_at+make_interval(secs=>${maximum})>clock_timestamp() RETURNING id`);
        if(!renewed.rows[0]) throw new CallCommandRealtimeOwnershipError();
        await tx.execute(sql`UPDATE callcommand_ingestion_events SET processing_lease_expires_at=clock_timestamp()+INTERVAL '30 seconds'
          WHERE tenant_id=${owner.tenantId} AND source='openai_realtime' AND provider_event_id=${owner.eventId}`);
      }).catch(()=>{
        silentClose=true;if(heartbeat) clearInterval(heartbeat);unregister();sideband?.close();
      }).finally(()=>{heartbeatRunning=false;});
    },10_000);heartbeat.unref();
  } catch(error) {
    silentClose=true;if(heartbeat) clearInterval(heartbeat);unregister();
    try{sideband?.close();}catch{/* Preserve unknown provider state. */}
    await queue;
    await deferOwnedRecovery(authority,'CALLCOMMAND_REALTIME_RECOVERY_OPEN_FAILED').catch(ignoreLostOwnership);
    throw error;
  }
}

/** Claims only a durable positively-confirmed signed incoming receipt. */
async function claimConfirmedRecovery(candidate: Row) {
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-capacity:${candidate.tenant_id}`},0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-realtime:${candidate.call_id}`},0))`);
    const call=(await tx.execute(sql`SELECT * FROM callcommand_calls WHERE tenant_id=${candidate.tenant_id} AND id=${candidate.call_id} FOR UPDATE`)).rows[0] as Row|undefined;
    const receipt=(await tx.execute(sql`SELECT * FROM callcommand_ingestion_events
      WHERE tenant_id=${candidate.tenant_id} AND id=${candidate.id} AND source='openai_realtime' AND call_id=${candidate.call_id}
        AND status IN ('provider_confirmed','sideband_connecting','sideband_connected')
        AND processing_lease_expires_at<=clock_timestamp() AND payload_sha256 ~ '^[a-f0-9]{64}$' FOR UPDATE`)).rows[0] as Row|undefined;
    if(!call || !receipt || hasCallCommandRealtimeSideband(String(call.id))
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(String(call.openai_realtime_call_id??''))
      || !ACTIVE_CALL_STATES.has(String(call.status)) || call.ended_at || call.terminal_reconciled_at) return null;
    const backoffIneligible=async()=>{await tx.execute(sql`UPDATE callcommand_ingestion_events
      SET processing_lease_expires_at=clock_timestamp()+INTERVAL '30 seconds',error_code='CALLCOMMAND_REALTIME_RECOVERY_INELIGIBLE'
      WHERE id=${receipt.id} AND tenant_id=${call.tenant_id} AND processing_lease_expires_at<=clock_timestamp()`);return null;};
    const snapshot=await loadAuthority(String(call.id),tx,String(call.tenant_id));
    if(!snapshot?.active_lease_id) return backoffIneligible();
    const owner:CallCommandRealtimeOwnership={tenantId:String(call.tenant_id),callId:String(call.id),eventId:String(receipt.provider_event_id),
      openAiCallId:String(call.openai_realtime_call_id),processingOwner:randomUUID(),capacityLeaseId:String(call.capacity_lease_id),
      capacityGeneration:String(snapshot.active_lease_generation)};
    let current:Row;
    try{current=await currentSidebandAuthority(tx,owner);}catch(error){
      if(error instanceof CallCommandRealtimeOwnershipError) return backoffIneligible();throw error;
    }
    if(!await hasConfirmedReceipt(tx,owner)) return backoffIneligible();
    const originalLease=(await tx.execute(sql`SELECT l.id FROM callcommand_lane_leases l
      JOIN callcommand_ingestion_events e ON e.tenant_id=l.tenant_id AND e.id=${receipt.id} AND e.call_id=l.call_id
      WHERE l.tenant_id=${owner.tenantId} AND l.id=${owner.capacityLeaseId} AND l.acquired_at<=e.received_at::timestamptz FOR UPDATE OF l`)).rows[0];
    if(!originalLease) return null;
    const session=(await tx.execute(sql`SELECT state FROM callcommand_live_sessions WHERE tenant_id=${owner.tenantId} AND call_id=${owner.callId} LIMIT 1`)).rows[0];
    if(session?.state==='transferring') return null;
    const budgetDigest=sha256(JSON.stringify({callId:owner.callId,eventId:owner.eventId,openAiCallId:owner.openAiCallId,payloadSha256:receipt.payload_sha256}));
    await tx.execute(sql`INSERT INTO callcommand_ingestion_events(tenant_id,source,provider_event_id,payload_sha256,call_id,status,attempts)
      VALUES(${owner.tenantId},${RECOVERY_SOURCE},${`recovery:${owner.callId}`},${budgetDigest},${owner.callId},'budget',0)
      ON CONFLICT (tenant_id,source,provider_event_id) DO NOTHING`);
    const budget=(await tx.execute(sql`SELECT id,attempts,payload_sha256 FROM callcommand_ingestion_events
      WHERE tenant_id=${owner.tenantId} AND source=${RECOVERY_SOURCE} AND provider_event_id=${`recovery:${owner.callId}`} AND call_id=${owner.callId} FOR UPDATE`)).rows[0];
    if(!budget || budget.payload_sha256!==budgetDigest || Number(budget.attempts)>=CALLCOMMAND_RECOVERY_ATTEMPTS) return null;
    await tx.execute(sql`UPDATE callcommand_ingestion_events SET attempts=attempts+1,status='attempting',processed_at=NOW() WHERE id=${budget.id} AND tenant_id=${owner.tenantId}`);
    await tx.execute(sql`UPDATE callcommand_ingestion_events SET status='sideband_connecting',processing_owner=${owner.processingOwner},
      processing_lease_expires_at=clock_timestamp()+INTERVAL '30 seconds',attempts=attempts+1,error_code=NULL WHERE id=${receipt.id} AND tenant_id=${owner.tenantId}`);
    await tx.execute(sql`UPDATE callcommand_calls SET realtime_status='connecting',realtime_error_code=NULL,updated_at=NOW()
      WHERE tenant_id=${owner.tenantId} AND id=${owner.callId}`);
    return {...current,sidebandOwnership:owner};
  });
}

export async function runCallCommandRealtimeRecoveryBatch():Promise<{examined:number;attached:number;failed:number}> {
  const adapter=adapterFactory();
  const candidates=await db.execute(sql`SELECT e.id,e.tenant_id,e.call_id FROM callcommand_ingestion_events e
    JOIN callcommand_calls c ON c.tenant_id=e.tenant_id AND c.id=e.call_id AND c.provider='twilio' AND c.direction='inbound'
    JOIN callcommand_lane_leases l ON l.tenant_id=c.tenant_id AND l.id=c.capacity_lease_id AND l.call_id=c.id AND l.provider_call_sid=c.provider_call_sid
      AND l.status='active' AND l.expires_at>clock_timestamp() AND l.acquired_at<=e.received_at::timestamptz
    WHERE e.source='openai_realtime' AND e.status IN ('provider_confirmed','sideband_connecting','sideband_connected')
      AND e.processing_lease_expires_at<=clock_timestamp() AND e.payload_sha256 ~ '^[a-f0-9]{64}$'
      AND EXISTS(SELECT 1 FROM callcommand_ingestion_events p WHERE p.tenant_id=e.tenant_id AND p.call_id=e.call_id
        AND p.source=${CONFIRMATION_SOURCE} AND p.provider_event_id='confirmed:'||c.id AND p.status='provider_confirmed')
      AND c.status IN ('ringing','in_progress','answered','connected') AND c.ended_at IS NULL AND c.terminal_reconciled_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM callcommand_ingestion_events b WHERE b.tenant_id=c.tenant_id AND b.call_id=c.id AND b.source=${RECOVERY_SOURCE} AND b.attempts>=${CALLCOMMAND_RECOVERY_ATTEMPTS})
    ORDER BY e.processing_lease_expires_at,e.id LIMIT ${CALLCOMMAND_RECOVERY_BATCH}`);
  let attached=0,failed=0;
  for(const candidate of candidates.rows as Row[]) {
    try {
      const authority=await claimConfirmedRecovery(candidate);if(!authority) continue;
      const owner=sidebandOwner(authority);
      await connectOwnedSideband(adapter,authority,{eventId:owner.eventId,openAiCallId:owner.openAiCallId},false);attached++;
    } catch(error) { if(!(error instanceof CallCommandRealtimeOwnershipError)) failed++; }
  }
  return {examined:candidates.rows.length,attached,failed};
}

export {drainCallCommandRealtimeSidebands};

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

      authority.sidebandOwnership={tenantId:String(authority.tenant_id),callId:String(authority.id),eventId:incoming.eventId,
        openAiCallId:incoming.openAiCallId,processingOwner:claim.processingOwner,capacityLeaseId:String(authority.active_lease_id),
        capacityGeneration:String(authority.active_lease_generation)} satisfies CallCommandRealtimeOwnership;
      if (claim.mode === 'accept') {
        let acceptSubmitted=false;
        try {
          const configuration = await loadRuntimeConfiguration(authority);
          const config = buildOpenAiRealtimeAcceptConfig({model:adapter.readiness.model,
            voice:VOICES.has(String(authority.voice_id) as SupportedRealtimeVoice) ? authority.voice_id : 'marin',
            serverCompiledInstructions:configuration.instructions,allowlistedTools:configuration.tools,
            enabledToolNames:configuration.tools.map(tool=>tool.name),maxOutputTokens:1024});
          await markProviderAccepting(authority,incoming);
          acceptSubmitted=true;
          await adapter.accept(incoming.openAiCallId,{instructions:config.instructions,tools:config.tools,
            voice:config.audio.output.voice,maxOutputTokens:config.max_output_tokens,transcribeInput:transcriptPersistenceAllowed(authority)});
          await markProviderAccepted(authority,incoming);
        } catch(error) {
          const status=Number((error as {providerStatus?:unknown})?.providerStatus);
          const definitive=!acceptSubmitted || (status>=400 && status<500)
            || (error instanceof CallCommandRealtimeError && error.code==='CALLCOMMAND_REALTIME_INPUT_INVALID');
          await markIncomingFailed(authority,incoming,definitive ? 'CALLCOMMAND_REALTIME_ACCEPT_DECLINED':'CALLCOMMAND_REALTIME_ACCEPT_OUTCOME_UNKNOWN',definitive);
          throw error;
        }
      }
      await connectOwnedSideband(adapter,authority,incoming,claim.mode==='accept');
      return reply.code(200).send({ ok: true, duplicate: false, providerActionConfirmed: true });
    } catch (error) {
      return safeFailure(reply, error);
    }
  });
}
