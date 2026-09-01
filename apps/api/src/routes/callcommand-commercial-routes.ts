import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantAdmin, requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import { maskPhone, normalizeE164, phoneFingerprint } from '../lib/callcommand.js';
import {
  CallCommandPhase35Error,
  CALLCOMMAND_PRODUCT_MODES,
  cleanText,
  normalizeIntakeSchema,
  safeJsonObject,
  validateFlowGraph,
} from '../lib/callcommand-phase35.js';
import {
  type CallCommandNumberProvider,
  type TwilioCreatedSubaccountCredential,
  type TwilioProviderCredentials,
  TwilioCallCommandNumberProvider,
} from '../lib/callcommand-number-provider.js';
import {
  createOrUpdateCallCommandLaneCheckout,
  getCallCommandLaneCatalog,
} from '../lib/callcommand-lane-billing.js';
import {
  expireCallCommandNumberBillingGrace,
  getCallCommandNumberCatalog,
  requestCallCommandNumberBilling,
} from '../lib/callcommand-number-billing.js';
import {
  calculateManagedNumberBillingQuantities,
  classifyManagedNumberType,
  managedNumberReleaseAt,
  managedNumberRequestHash,
  managedNumberReadiness,
} from '../lib/callcommand-managed-number.js';
import { inspectCallCommandRealtimeReadiness } from '../lib/callcommand-realtime.js';
import {
  checkTwilioVerification,
  getTelephonyInfo,
  resolveTelephonyConfig,
  startTwilioVerification,
} from '../lib/telephony.js';
import {
  getSharedSecretVaultReadiness,
  resolveEncryptedSecretReference,
  storeEncryptedSecretReference,
} from '../lib/shared-secret-vault.js';
import { appendActivityEvent } from '../lib/shared-usage-activity.js';
import { safeFailureCode } from '../lib/shared-service-safety.js';
import { validateCallCommandAutomationActions } from '../lib/callcommand-automation-policy.js';

const MODULE_SLUG = 'callcommand-ai';
const base = '/v1/modules/callcommand-ai/product';
const reads = [requireTenantModuleAccess(MODULE_SLUG)];
const writes = [...reads, requireTenantModuleWriteAccess];
const admins = [...writes, requireTenantAdmin];
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const NUMBER_SID = /^PN[0-9a-fA-F]{32}$/;
const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
const FALLBACKS = new Set(['voicemail', 'transfer', 'callback', 'end_call']);
const RECORDING_POLICIES = new Set(['disabled', 'consent_required', 'jurisdiction_policy']);
const TRANSCRIPTION_POLICIES = new Set(['disabled', 'consent_required', 'recording_only']);
const PROFILE_MODES = new Set(['receptionist', 'intake', 'dispatcher']);
const CONNECTION_INSTRUCTIONS: Record<string, string[]> = {
  forwarding: ['Forward the existing carrier number to the CallCommand destination supplied after provider activation.', 'Run the automatic inbound routing health check.', 'Go Live remains locked until the forwarded call reaches the verified route.'],
  twilio_transfer: ['Authorize the existing Twilio subaccount and number through the tenant provider connection.', 'OperatorOS will validate ownership and replace the voice/status callbacks.', 'Run health validation before enabling the line.'],
  sip: ['Configure a TLS SIP trunk through an approved tenant provider connection.', 'Allow only the exact OperatorOS/OpenAI SIP destinations documented for this tenant.', 'Complete a signed inbound-call acceptance test.'],
  port: ['Start a provider port request with the required ownership and regulatory documents.', 'Keep the current carrier active until the provider confirms completion.', 'Run number and routing validation after the port completes.'],
};

type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;
type CommercialNumberProvider = CallCommandNumberProvider<TwilioProviderCredentials, TwilioCreatedSubaccountCredential>;

let numberProviderTestOverride: CommercialNumberProvider | null = null;

/** Pure test seam. Production always uses the bounded Twilio adapter. */
export function __setCallCommandNumberProviderForTests(provider: CommercialNumberProvider | null): void {
  numberProviderTestOverride = provider;
}

class CallCommandCommercialError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode = 400) {
    super(message);
  }
}

const tenant = (request: FastifyRequest) => String((request as any).tenantContext.tenantId);
const actor = (request: FastifyRequest) => String((request as any).user.id);
const params = (request: FastifyRequest) => request.params as Row;

function body(request: FastifyRequest): Row {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new CallCommandCommercialError('A JSON object is required', 'CALLCOMMAND_COMMERCIAL_BODY_INVALID');
  }
  const value = request.body as Row;
  for (const key of ['tenantId', 'tenant_id', 'userId', 'user_id', 'role', 'entitlement', 'plan', 'effectiveLanes']) {
    if (key in value) {
      throw new CallCommandCommercialError(`${key} is resolved from trusted OperatorOS authority`, 'CALLCOMMAND_COMMERCIAL_AUTHORITY_FIELD_REJECTED');
    }
  }
  return value;
}

function id(request: FastifyRequest, key = 'id'): string {
  const value = String(params(request)[key] ?? '');
  if (!UUID.test(value)) throw new CallCommandCommercialError(`${key} is invalid`, 'CALLCOMMAND_COMMERCIAL_ID_INVALID');
  return value;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const result = String(value);
  if (!UUID.test(result)) throw new CallCommandCommercialError(`${field} is invalid`, 'CALLCOMMAND_COMMERCIAL_ID_INVALID');
  return result;
}

function camel(row: Row): Row {
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => ![
      'tenant_id',
      'phone_e164',
      'secret_reference_id',
      'destination_fingerprint',
      'provider_account_sid',
    ].includes(key))
    .map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
}

function fail(reply: FastifyReply, error: unknown) {
  const value = error as any;
  if (value instanceof CallCommandCommercialError
    || value instanceof CallCommandPhase35Error
    || (Number(value?.statusCode) >= 400 && Number(value?.statusCode) < 500)) {
    return reply.code(value.statusCode ?? 400).send({
      error: value.message,
      code: value.code ?? 'CALLCOMMAND_COMMERCIAL_REQUEST_FAILED',
      providerActionConfirmed: false,
    });
  }
  throw error;
}

async function moduleId(executor: Executor = db): Promise<string> {
  const result = await executor.execute(sql`SELECT id FROM modules WHERE slug=${MODULE_SLUG} LIMIT 1`);
  if (!result.rows[0]) {
    throw new CallCommandCommercialError('CallCommand module registry is unavailable', 'CALLCOMMAND_MODULE_UNAVAILABLE', 503);
  }
  return String((result.rows[0] as Row).id);
}

async function activity(request: FastifyRequest, eventType: string, objectType: string, objectId: string, summary: string, metadata: Row = {}) {
  return appendActivityEvent({
    tenantId: tenant(request),
    moduleId: await moduleId(),
    actorUserId: actor(request),
    eventType,
    objectType,
    objectId,
    summary,
    metadata,
  });
}

function webhookConfiguration() {
  const configured = String(process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL || '').trim();
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new CallCommandCommercialError(
      'A public HTTPS CallCommand webhook origin is required',
      'CALLCOMMAND_PUBLIC_WEBHOOK_ORIGIN_MISSING',
      409,
    );
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new CallCommandCommercialError(
      'CallCommand provider onboarding requires a credential-free HTTPS origin',
      'CALLCOMMAND_PUBLIC_WEBHOOK_ORIGIN_UNSAFE',
      409,
    );
  }
  const origin = url.origin;
  return {
    origin,
    voiceUrl: new URL('/v1/modules/callcommand-ai/twilio/voice/incoming', origin).toString(),
    statusCallbackUrl: new URL('/v1/modules/callcommand-ai/twilio/voice/status', origin).toString(),
  };
}

function numberProvider(): CommercialNumberProvider {
  if (numberProviderTestOverride) return numberProviderTestOverride;
  const webhook = webhookConfiguration();
  return new TwilioCallCommandNumberProvider({ allowedWebhookOrigins: [webhook.origin] });
}

async function parentTwilioCredentials(): Promise<TwilioProviderCredentials> {
  const config = await resolveTelephonyConfig();
  if (!config) {
    throw new CallCommandCommercialError(
      'The OperatorOS Twilio parent connection is not configured',
      'CALLCOMMAND_TWILIO_PARENT_UNAVAILABLE',
      409,
    );
  }
  return {
    accountSid: config.accountSid,
    authToken: config.authToken,
    ...(config.apiKeySid ? { apiKeySid: config.apiKeySid } : {}),
  } as TwilioProviderCredentials;
}

function parseStoredTwilioCredential(value: string, expectedAccountSid: string): TwilioProviderCredentials {
  try {
    const parsed = JSON.parse(value) as Row;
    if (parsed.provider !== 'twilio'
      || parsed.providerAccountId !== expectedAccountSid
      || !ACCOUNT_SID.test(String(parsed.providerAccountId ?? ''))
      || !/^[A-Za-z0-9]{20,256}$/.test(String(parsed.authToken ?? ''))) throw new Error('invalid');
    return { accountSid: String(parsed.providerAccountId), authToken: String(parsed.authToken) };
  } catch {
    throw new CallCommandCommercialError(
      'The tenant telephony credential is unavailable or invalid',
      'CALLCOMMAND_TENANT_TELEPHONY_CREDENTIAL_INVALID',
      503,
    );
  }
}

async function storedAccountCredentials(account: Row): Promise<TwilioProviderCredentials> {
  const accountSid = String(account.provider_account_sid ?? '');
  const secretId = String(account.secret_reference_id ?? '');
  if (!ACCOUNT_SID.test(accountSid) || !UUID.test(secretId)) {
    throw new CallCommandCommercialError(
      'The tenant telephony connection is incomplete',
      'CALLCOMMAND_TENANT_TELEPHONY_CREDENTIAL_MISSING',
      409,
    );
  }
  const stored = await resolveEncryptedSecretReference({ tenantId: String(account.tenant_id), id: secretId });
  if (!stored) {
    throw new CallCommandCommercialError(
      'The tenant telephony credential could not be resolved',
      'CALLCOMMAND_TENANT_TELEPHONY_CREDENTIAL_MISSING',
      503,
    );
  }
  return parseStoredTwilioCredential(stored, accountSid);
}

async function activeTelephonyAccount(tenantId: string, executor: Executor = db): Promise<Row | null> {
  const result = await executor.execute(sql`
    SELECT * FROM callcommand_telephony_accounts
    WHERE tenant_id=${tenantId} AND provider='twilio' AND archived_at IS NULL
      AND status NOT IN ('disabled','revoked')
    ORDER BY created_at,id LIMIT 1
  `);
  return (result.rows[0] as Row | undefined) ?? null;
}

async function ensureTelephonyAccount(request: FastifyRequest): Promise<Row> {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-telephony:${tenant(request)}`},0))`);
    const existing = await activeTelephonyAccount(tenant(request), tx);
    if (existing) return existing;

    const credentials = await parentTwilioCredentials();
    const provider = numberProvider();
    const modId = await moduleId(tx);
    let persistedSecretId: string | null = null;
    const safe = await provider.ensureTenantAccount({
      credentials,
      friendlyName: `OperatorOS CallCommand ${tenant(request).slice(0, 8)}`,
      persistCreatedCredential: async credential => {
        const stored = await storeEncryptedSecretReference({
          tenantId: tenant(request),
          moduleId: modId,
          purpose: 'callcommand.twilio-subaccount-auth-token',
          reference: JSON.stringify(credential),
          actorUserId: actor(request),
        }, tx);
        persistedSecretId = String((stored as Row).id);
      },
    });
    if (!persistedSecretId) {
      throw new CallCommandCommercialError(
        'Tenant telephony credential persistence was not confirmed',
        'CALLCOMMAND_TENANT_TELEPHONY_CREDENTIAL_MISSING',
        503,
      );
    }
    const created = await tx.execute(sql`
      INSERT INTO callcommand_telephony_accounts(
        tenant_id,created_by_user_id,provider,account_mode,provider_account_sid,
        secret_reference_id,status,health_status,last_health_at,verified_at,
        provisioning_status,compliance_status
      ) VALUES (
        ${tenant(request)},${actor(request)},'twilio','platform',${safe.providerAccountId},
        ${persistedSecretId},${safe.status === 'active' ? 'active' : 'degraded'},
        ${safe.status === 'active' ? 'healthy' : 'degraded'},NOW(),
        ${safe.status === 'active' ? new Date() : null},
        ${safe.status === 'active' ? 'active' : 'action_required'},'clear'
      ) RETURNING *
    `);
    return created.rows[0] as Row;
  });
}

function providerFailure(error: unknown, fallbackCode: string): CallCommandCommercialError {
  const retryable = (error as any)?.retryable === true;
  return new CallCommandCommercialError(
    retryable ? 'The telephony provider is temporarily unavailable' : 'The telephony provider rejected this operation',
    String((error as any)?.code ?? fallbackCode).slice(0, 120),
    retryable ? 503 : 409,
  );
}

function normalizeFallback(value: unknown): string {
  const normalized = String(value ?? 'voicemail').trim().toLowerCase().replace(/[ -]+/g, '_');
  if (FALLBACKS.has(normalized)) return normalized;
  if (normalized.includes('transfer')) return 'transfer';
  if (normalized.includes('callback') || normalized.includes('call_back')) return 'callback';
  if (normalized.includes('end') || normalized.includes('hang')) return 'end_call';
  return 'voicemail';
}

function boundedStringArray(value: unknown, maximum: number, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maximum) {
    throw new CallCommandCommercialError(`${field} is invalid`, 'CALLCOMMAND_PROFILE_CONFIGURATION_INVALID');
  }
  return value.map(item => cleanText(item, field, 80)!).filter(Boolean);
}

function maskedAccountSid(value: unknown): string | null {
  const sid = String(value ?? '');
  return ACCOUNT_SID.test(sid) ? `AC••••${sid.slice(-4)}` : null;
}

async function resolveProvisioningAgentAndFlow(request: FastifyRequest, value: Row): Promise<{
  profileId: string;
  flowId: string;
  createdProfile: boolean;
  createdFlow: boolean;
}> {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-onboarding:${tenant(request)}`},0))`);
    let profileId = optionalId(value.profileId, 'profileId');
    let createdProfile = false;
    if (profileId) {
      const profile = await tx.execute(sql`
        SELECT id FROM callcommand_profiles
        WHERE tenant_id=${tenant(request)} AND id=${profileId} AND product_mode='general'
          AND status='active' AND deleted_at IS NULL LIMIT 1
      `);
      if (!profile.rows[0]) throw new CallCommandCommercialError('The selected receptionist was not found', 'CALLCOMMAND_PROFILE_NOT_FOUND', 404);
    } else {
      const profiles = await tx.execute(sql`
        SELECT id FROM callcommand_profiles
        WHERE tenant_id=${tenant(request)} AND product_mode='general' AND status='active' AND deleted_at IS NULL
        ORDER BY is_default DESC,created_at,id LIMIT 2
      `);
      if (profiles.rows.length > 1) {
        throw new CallCommandCommercialError(
          'Select the receptionist this number should use',
          'CALLCOMMAND_PROFILE_SELECTION_REQUIRED',
          409,
        );
      }
      if (profiles.rows[0]) {
        profileId = String((profiles.rows[0] as Row).id);
      } else {
        const profile = await tx.execute(sql`
          INSERT INTO callcommand_profiles(
            tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,script,tone,
            escalation_rules,product_mode,is_default,business_name,voice_id,personality,
            agent_purpose,business_description,business_hours_config,primary_language,
            fallback_behavior,recording_policy,transcription_policy,retention_days
          ) VALUES (
            ${tenant(request)},${actor(request)},'AI Receptionist','receptionist',
            'Thank you for calling. How may I help you today?','[]'::jsonb,'active','',
            'professional','[]'::jsonb,'general',TRUE,'','alloy','professional',
            'Answer calls, collect caller details, and route requests safely.','',
            '{"always":true}'::jsonb,'en-US','voicemail','consent_required','consent_required',30
          ) RETURNING id
        `);
        profileId = String((profile.rows[0] as Row).id);
        createdProfile = true;
      }
    }

    let flowId = optionalId(value.flowId ?? value.workflowId, 'flowId');
    let createdFlow = false;
    if (flowId) {
      const flow = await tx.execute(sql`
        SELECT id FROM callcommand_flows
        WHERE tenant_id=${tenant(request)} AND id=${flowId} AND product_mode='general'
          AND status='active' AND deleted_at IS NULL LIMIT 1
      `);
      if (!flow.rows[0]) throw new CallCommandCommercialError('The selected published workflow was not found', 'CALLCOMMAND_FLOW_NOT_FOUND', 404);
    } else {
      const flows = await tx.execute(sql`
        SELECT id FROM callcommand_flows
        WHERE tenant_id=${tenant(request)} AND product_mode='general' AND status='active' AND deleted_at IS NULL
        ORDER BY created_at,id LIMIT 2
      `);
      if (flows.rows.length > 1) {
        throw new CallCommandCommercialError(
          'Select the published workflow this number should use',
          'CALLCOMMAND_FLOW_SELECTION_REQUIRED',
          409,
        );
      }
      if (flows.rows[0]) {
        flowId = String((flows.rows[0] as Row).id);
      } else {
        const graph = validateFlowGraph({
          start: 'general-reception',
          nodes: [{
            key: 'general-reception',
            type: 'route',
            config: {
              purpose: 'general_reception',
              collect: ['name', 'phone', 'reason'],
              completion: 'Confirm the request and end or transfer according to tenant policy.',
            },
          }],
        }).graph;
        const flow = await tx.execute(sql`
          INSERT INTO callcommand_flows(
            tenant_id,created_by_user_id,name,description,product_mode,status,
            active_version,start_node_key,version
          ) VALUES (
            ${tenant(request)},${actor(request)},'General Reception',
            'Default published workflow for new CallCommand business numbers.',
            'general','active',1,'general-reception',1
          ) RETURNING id
        `);
        flowId = String((flow.rows[0] as Row).id);
        await tx.execute(sql`
          INSERT INTO callcommand_flow_versions(
            tenant_id,flow_id,version,graph_json,validation_json,published_by_user_id
          ) VALUES (
            ${tenant(request)},${flowId},1,${JSON.stringify(graph)}::jsonb,
            '{"valid":true,"source":"managed_number_onboarding"}'::jsonb,${actor(request)}
          )
        `);
        createdFlow = true;
      }
    }
    return { profileId: profileId!, flowId: flowId!, createdProfile, createdFlow };
  });
}

export async function registerCallCommandCommercialRoutes(app: FastifyInstance) {
  app.get(`${base}/commercial/workspace`, { preHandler: reads }, async (request, reply) => {
    try {
      const tenantId = tenant(request);
      const [accountRows, numberRows, orderRows, capacityRows, numberBillingRows, issueRows, leaseRows, usageRows, settingsRows, telephony] = await Promise.all([
        db.execute(sql`
          SELECT a.id,a.provider,a.account_mode,a.provider_account_sid,a.status,a.health_status,
            a.health_reason_code,a.last_health_at,a.verified_at,a.provisioning_status,a.compliance_status,
            a.last_reconciled_at,a.version,a.created_at,a.updated_at,
            (a.secret_reference_id IS NOT NULL AND secret.id IS NOT NULL AND secret.revoked_at IS NULL) AS credential_ready
          FROM callcommand_telephony_accounts a
          LEFT JOIN shared_secret_references secret
            ON secret.tenant_id=a.tenant_id AND secret.id=a.secret_reference_id
          WHERE a.tenant_id=${tenantId} AND a.archived_at IS NULL
          ORDER BY a.created_at,a.id
        `),
        db.execute(sql`
          SELECT c.id,c.name,c.phone_e164,c.status,c.profile_id,c.active_flow_id,c.acquisition_mode,c.connection_type,
            c.provider_number_status,c.routing_mode,c.provisioning_status,c.health_status,
            c.health_reason_code,c.health_checked_at,c.provider_verified_at,c.provider_config_version,
            c.number_type,c.country_code,c.provider_region,c.provider_locality,c.provider_capabilities,
            c.lifecycle_state,c.billing_status,c.billing_grace_expires_at,c.provisioned_at,c.activated_at,
            c.release_scheduled_at,c.released_at,c.last_reconciled_at,
            c.created_at,c.updated_at,p.name AS assigned_agent_name,f.name AS workflow_name,
            (a.id IS NOT NULL AND a.status='active' AND a.health_status='healthy'
              AND secret.id IS NOT NULL AND secret.revoked_at IS NULL) AS provider_ready
          FROM callcommand_channels c
          LEFT JOIN callcommand_profiles p ON p.tenant_id=c.tenant_id AND p.id=c.profile_id
          LEFT JOIN callcommand_flows f ON f.tenant_id=c.tenant_id AND f.id=c.active_flow_id
          LEFT JOIN callcommand_telephony_accounts a
            ON a.tenant_id=c.tenant_id AND a.id=c.telephony_account_id AND a.archived_at IS NULL
          LEFT JOIN shared_secret_references secret
            ON secret.tenant_id=a.tenant_id AND secret.id=a.secret_reference_id
          WHERE c.tenant_id=${tenantId} AND c.product_mode='general' AND c.deleted_at IS NULL
          ORDER BY c.updated_at DESC,c.id
        `),
        db.execute(sql`
          SELECT id,channel_id,operation_type,acquisition_mode,number_type,country_code,area_code,
            requested_capabilities,requested_phone_e164,requested_profile_id,requested_flow_id,
            provisioning_state,status,error_code,error_message_safe,retry_count,compensation_status,
            reconciliation_status,created_at,updated_at,completed_at,failed_at
          FROM callcommand_number_orders WHERE tenant_id=${tenantId}
          ORDER BY created_at DESC,id LIMIT 50
        `),
        db.execute(sql`SELECT * FROM callcommand_capacity_entitlements WHERE tenant_id=${tenantId} LIMIT 1`),
        db.execute(sql`SELECT * FROM callcommand_number_billing_entitlements WHERE tenant_id=${tenantId} LIMIT 1`),
        db.execute(sql`
          SELECT id,channel_id,order_id,issue_type,resource_key,safe_auto_repair,status,
            retry_count,last_error_code,detected_at,last_attempt_at,resolved_at
          FROM callcommand_number_reconciliation_issues
          WHERE tenant_id=${tenantId} AND status<>'resolved'
          ORDER BY detected_at DESC,id LIMIT 100
        `),
        db.execute(sql`
          SELECT count(*)::int AS active FROM callcommand_lane_leases
          WHERE tenant_id=${tenantId} AND status='active' AND expires_at>NOW()
        `),
        db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN unit IN ('seconds','billable_second') THEN quantity ELSE 0 END),0)::bigint AS seconds,
            COALESCE(SUM(CASE WHEN unit IN ('minutes','billable_minute') THEN quantity ELSE 0 END),0)::bigint AS minutes,
            COALESCE(SUM(provider_cost_minor),0)::bigint AS provider_cost_minor,
            COALESCE(SUM(ai_cost_minor),0)::bigint AS ai_cost_minor,
            COALESCE(SUM(total_cost_minor),0)::bigint AS total_cost_minor,
            MIN(occurred_at) AS period_start,MAX(occurred_at) AS period_end
          FROM callcommand_usage_events
          WHERE tenant_id=${tenantId} AND occurred_at>=date_trunc('month',NOW())
        `),
        db.execute(sql`SELECT * FROM callcommand_tenant_runtime_settings WHERE tenant_id=${tenantId} LIMIT 1`),
        getTelephonyInfo(),
      ]);

      const accounts = accountRows.rows as Row[];
      const rawNumbers = numberRows.rows as Row[];
      const capacity = (capacityRows.rows[0] as Row | undefined) ?? {
        base_lanes: 1,
        additional_lanes: 0,
        pending_additional_lanes: 0,
        effective_lanes: 1,
        billing_status: 'inactive',
      };
      const active = Number((leaseRows.rows[0] as Row | undefined)?.active ?? 0);
      const effective = Number(capacity.effective_lanes ?? 1);
      const usage = (usageRows.rows[0] as Row | undefined) ?? {};
      const numberBilling = (numberBillingRows.rows[0] as Row | undefined) ?? {
        included_local_numbers: 1,
        active_local_numbers: 0,
        active_toll_free_numbers: 0,
        licensed_billable_local_quantity: 0,
        licensed_billable_toll_free_quantity: 0,
        pending_billable_local_quantity: 0,
        pending_billable_toll_free_quantity: 0,
        billing_status: 'inactive',
      };
      const runtimeSettings = (settingsRows.rows[0] as Row | undefined) ?? {};
      const catalog = getCallCommandLaneCatalog();
      const numberCatalog = getCallCommandNumberCatalog();
      const realtimeReadiness = inspectCallCommandRealtimeReadiness();
      const providerReady = accounts.some(row => row.status === 'active' && row.health_status === 'healthy' && row.credential_ready === true);
      const numberVerified = rawNumbers.some(row => row.provider_number_status === 'active' && Boolean(row.provider_verified_at));
      const routingVerified = rawNumbers.some(row => row.health_status === 'healthy' && Boolean(row.health_checked_at));
      const profileAssigned = rawNumbers.some(row => Boolean(row.profile_id));
      const workflowAssigned = rawNumbers.some(row => Boolean(row.active_flow_id));
      const numberBillingReady = rawNumbers.every(row => {
        if (row.acquisition_mode !== 'platform_provisioned' || row.lifecycle_state === 'RELEASED') return true;
        return managedNumberReadiness({
          providerAccountReady: true,
          providerNumberPresent: true,
          routingHealthy: true,
          profileAssigned: true,
          workflowAssigned: true,
          billingStatus: String(row.billing_status ?? 'inactive'),
          paymentGraceExpiresAt: row.billing_grace_expires_at ? new Date(row.billing_grace_expires_at) : null,
        }).reasons.every(reason => reason !== 'billing_not_entitled');
      });
      const checks = [
        {
          id: 'tenant-provider', label: 'Tenant telephony provider', status: providerReady ? 'healthy' : 'action_required',
          reason: providerReady ? 'The tenant-specific provider account and signing credential are healthy.' : 'Create or repair the tenant telephony connection.',
        },
        {
          id: 'provider-number', label: 'Provider-owned phone number', status: numberVerified ? 'healthy' : 'action_required',
          reason: numberVerified ? 'The provider confirms an active voice number.' : 'Provision a number or finish the existing-number connection plan.',
        },
        {
          id: 'incoming-routing', label: 'Incoming call route', status: routingVerified ? 'healthy' : 'action_required',
          reason: routingVerified ? 'Provider routing uses the approved POST callbacks.' : 'Run a number health check after provider configuration.',
        },
        {
          id: 'receptionist', label: 'AI receptionist assignment', status: profileAssigned ? 'healthy' : 'action_required',
          reason: profileAssigned ? 'A receptionist is assigned to a phone number.' : 'Create and assign an AI receptionist.',
        },
        {
          id: 'workflow', label: 'Published workflow assignment', status: workflowAssigned ? 'healthy' : 'action_required',
          reason: workflowAssigned ? 'A workflow is assigned to a phone number.' : 'Publish and assign a call workflow.',
        },
        {
          id: 'number-billing', label: 'Managed-number billing', status: numberBillingReady ? 'healthy' : 'action_required',
          reason: numberBillingReady ? 'Every managed number is included, paid, or within its payment grace period.' : 'Complete or repair managed-number billing before enabling live calls.',
        },
        {
          id: 'openai-realtime', label: 'OpenAI Realtime SIP authority', status: realtimeReadiness.ready ? 'healthy' : 'action_required',
          reason: realtimeReadiness.ready
            ? `The server is configured for the allowlisted ${realtimeReadiness.model} model.`
            : 'A deployment administrator must configure the OpenAI project, signed webhook, SIP route secret, and allowlisted model.',
        },
      ];
      const configurationReady = providerReady && numberVerified && routingVerified && profileAssigned
        && workflowAssigned && numberBillingReady && realtimeReadiness.ready;
      const tenantContext = (request as any).tenantContext as Row;
      const moduleAccessLevel = String((request as any).tenantModuleAccessLevel ?? 'none');
      const canWrite = (tenantContext?.viaPlatformRole === true
        || tenantContext?.membershipRole !== 'viewer')
        && (moduleAccessLevel === 'user' || moduleAccessLevel === 'manager');
      const canAdmin = canWrite && (tenantContext?.viaPlatformRole === true
        || tenantContext?.role === 'owner' || tenantContext?.role === 'admin');

      return {
        contract: 'callcommand-commercial-runtime-v1',
        capabilities: { canWrite, canAdmin, moduleAccessLevel },
        providerAccounts: accounts.map(row => ({ ...camel(row), providerAccountMasked: maskedAccountSid(row.provider_account_sid) })),
        numbers: rawNumbers.map(row => {
          const connectionType = String(row.connection_type ?? '');
          return {
            ...camel(row),
            phoneMasked: maskPhone(String(row.phone_e164)),
            connectionPlan: row.acquisition_mode === 'byon' && CONNECTION_INSTRUCTIONS[connectionType]
              ? { type: connectionType, status: 'provider_action_required', instructions: CONNECTION_INSTRUCTIONS[connectionType] }
              : null,
          };
        }),
        numberOrders: orderRows.rows.map(row => camel(row as Row)),
        numberReconciliationIssues: issueRows.rows.map(row => camel(row as Row)),
        runtime: settingsRows.rows[0] ? camel(settingsRows.rows[0] as Row) : {
          overflowPolicy: 'refuse', defaultLeaseSeconds: 900, maximumLeaseSeconds: 14400, realtimeEnabled: false,
        },
        readiness: {
          providerReady, numberVerified, routingVerified, profileAssigned, workflowAssigned, numberBillingReady,
          realtimeConfigured: realtimeReadiness.ready,
          realtimeModel: realtimeReadiness.model,
          canEnableLiveCalls: configurationReady,
          readyForLiveCalls: configurationReady && runtimeSettings.realtime_enabled === true,
          checks,
        },
        realtime: {
          configured: realtimeReadiness.ready,
          model: realtimeReadiness.model,
          enabled: runtimeSettings.realtime_enabled === true,
          healthStatus: String(runtimeSettings.realtime_health_status ?? 'unknown'),
          lastConnectedAt: runtimeSettings.realtime_last_connected_at ?? null,
          lastErrorCode: runtimeSettings.realtime_last_error_code ?? null,
          requiredConfiguration: realtimeReadiness.ready ? [] : [...realtimeReadiness.missing, ...realtimeReadiness.invalid],
        },
        health: { status: checks.every(check => check.status === 'healthy') ? 'healthy' : 'action_required', checks },
        capacity: {
          base: Number(capacity.base_lanes ?? 1),
          included: Number(capacity.base_lanes ?? 1),
          additional: Number(capacity.additional_lanes ?? 0),
          pendingAdditional: Number(capacity.pending_additional_lanes ?? 0),
          effective,
          total: effective,
          active,
          available: Math.max(0, effective - active),
          billingStatus: String(capacity.billing_status ?? 'inactive'),
          version: Number(capacity.version ?? 0),
          currentPeriodStart: capacity.current_period_start ?? null,
          currentPeriodEnd: capacity.current_period_end ?? null,
        },
        numberBilling: {
          includedLocalNumbers: Number(numberBilling.included_local_numbers ?? 1),
          activeLocalNumbers: Number(numberBilling.active_local_numbers ?? 0),
          activeTollFreeNumbers: Number(numberBilling.active_toll_free_numbers ?? 0),
          licensedBillableLocalQuantity: Number(numberBilling.licensed_billable_local_quantity ?? 0),
          licensedBillableTollFreeQuantity: Number(numberBilling.licensed_billable_toll_free_quantity ?? 0),
          pendingBillableLocalQuantity: Number(numberBilling.pending_billable_local_quantity ?? 0),
          pendingBillableTollFreeQuantity: Number(numberBilling.pending_billable_toll_free_quantity ?? 0),
          billingStatus: String(numberBilling.billing_status ?? 'inactive'),
          graceExpiresAt: numberBilling.grace_expires_at ?? null,
          currentPeriodStart: numberBilling.current_period_start ?? null,
          currentPeriodEnd: numberBilling.current_period_end ?? null,
        },
        usage: {
          minutes: Number(usage.minutes ?? 0) + Number(usage.seconds ?? 0) / 60,
          seconds: Number(usage.seconds ?? 0) + Number(usage.minutes ?? 0) * 60,
          providerCostMinor: Number(usage.provider_cost_minor ?? 0),
          aiCostMinor: Number(usage.ai_cost_minor ?? 0),
          totalCostMinor: Number(usage.total_cost_minor ?? 0),
          currency: 'USD',
          periodStart: usage.period_start ?? null,
          periodEnd: usage.period_end ?? null,
        },
        pricing: {
          additionalLaneMonthly: catalog.unitAmountCents / 100,
          additionalLaneMonthlyCents: catalog.unitAmountCents,
          currency: catalog.currency,
          interval: catalog.interval,
          lookupKey: catalog.lookupKey,
          priceConfigured: catalog.priceConfigured,
          stripeConfigured: catalog.stripeConfigured,
          managedNumbers: {
            includedLocalNumbers: numberCatalog.includedLocalNumbers,
            additionalLocalMonthlyCents: numberCatalog.local.unitAmountCents,
            tollFreeMonthlyCents: numberCatalog.tollFree.unitAmountCents,
            localPriceConfigured: numberCatalog.local.priceConfigured,
            tollFreePriceConfigured: numberCatalog.tollFree.priceConfigured,
          },
        },
        provider: {
          tenantReady: providerReady,
          runtimeCredentialAvailable: Boolean((telephony as Row).configured),
          runtimeCredentialSource: (telephony as Row).source ?? null,
          secretVault: getSharedSecretVaultReadiness(),
        },
      };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/search`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      const account = await ensureTelephonyAccount(request);
      const credentials = await storedAccountCredentials(account);
      const provider = numberProvider();
      let numbers;
      try {
        numbers = await provider.searchVoiceNumbers({
          credentials,
          providerAccountId: String(account.provider_account_sid),
          country: String(value.country ?? 'US'),
          numberType: value.numberType === 'toll_free' ? 'toll_free' : 'local',
          areaCode: value.areaCode ? String(value.areaCode) : undefined,
          locality: value.locality ? String(value.locality) : undefined,
          region: value.region ? String(value.region) : undefined,
          postalCode: value.postalCode ? String(value.postalCode) : undefined,
          contains: value.contains ? String(value.contains) : undefined,
          limit: value.limit === undefined ? 20 : Number(value.limit),
        });
      } catch (error) { throw providerFailure(error, 'CALLCOMMAND_NUMBER_SEARCH_FAILED'); }
      await activity(request, 'callcommand.number.search.completed', 'telephony_account', String(account.id), 'Completed a bounded voice-number search', {
        country: String(value.country ?? 'US').toUpperCase(), numberType: value.numberType === 'toll_free' ? 'toll_free' : 'local', resultCount: numbers.length,
      });
      return { numbers: numbers.map(number => ({ ...number, phone: number.phoneNumber, phoneE164: number.phoneNumber })) };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/billing`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      const result = await requestCallCommandNumberBilling({
        tenantId: tenant(request),
        userId: actor(request),
        billableLocalQuantity: Number(value.billableLocalQuantity ?? 0),
        billableTollFreeQuantity: Number(value.billableTollFreeQuantity ?? 0),
        idempotencyKey: String(value.idempotencyKey ?? request.headers['idempotency-key'] ?? ''),
      });
      await activity(
        request,
        'callcommand.number.billing.requested',
        'tenant',
        tenant(request),
        result.action === 'included_only'
          ? 'Confirmed included managed-number capacity'
          : 'Requested managed-number licensed quantities through OperatorOS billing',
        {
          action: result.action,
          billableLocalQuantity: result.billableLocalQuantity,
          billableTollFreeQuantity: result.billableTollFreeQuantity,
        },
      );
      return reply.code(result.action === 'included_only' ? 200 : result.action === 'checkout_created' ? 201 : 202).send(result);
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/provision`, { preHandler: admins }, async (request, reply) => {
    let orderId: string | null = null;
    let providerNumberId: string | null = null;
    try {
      const value = body(request);
      if (value.confirmRecurringProviderCharge !== true) {
        throw new CallCommandCommercialError(
          'Explicit confirmation of the recurring telephony provider charge is required',
          'CALLCOMMAND_NUMBER_RECURRING_CHARGE_NOT_CONFIRMED',
          409,
        );
      }
      const phone = normalizeE164(value.phone ?? value.phoneE164, 'phone');
      const inferredNumberType = classifyManagedNumberType(phone);
      const numberType = value.numberType === undefined ? inferredNumberType : String(value.numberType);
      if ((numberType !== 'local' && numberType !== 'toll_free') || numberType !== inferredNumberType) {
        throw new CallCommandCommercialError(
          'The selected number does not match the requested local or toll-free type',
          'CALLCOMMAND_NUMBER_TYPE_MISMATCH',
          422,
        );
      }
      const onboarding = await resolveProvisioningAgentAndFlow(request, value);
      const profileId = onboarding.profileId;
      const flowId = onboarding.flowId;
      const rawIdempotencyKey = value.idempotencyKey ?? request.headers['idempotency-key'];
      const idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey.trim() : '';
      if (!/^[A-Za-z0-9._:+-]{8,200}$/.test(idempotencyKey)) {
        throw new CallCommandCommercialError(
          'idempotencyKey must contain 8 to 200 safe characters',
          'CALLCOMMAND_NUMBER_IDEMPOTENCY_KEY_INVALID',
          422,
        );
      }

      // Resolve a replay before projecting billing or touching the provider.
      // Otherwise a successful first-local request becomes an apparent second
      // local number on retry and is incorrectly blocked by the paid-quantity
      // gate instead of returning its original result.
      const previous = await db.execute(sql`
        SELECT * FROM callcommand_number_orders
        WHERE tenant_id=${tenant(request)} AND idempotency_key=${idempotencyKey} LIMIT 1
      `);
      const previousOrder = previous.rows[0] as Row | undefined;
      if (previousOrder) {
        const replayHash = managedNumberRequestHash({
          accountId: previousOrder.telephony_account_id,
          phone,
          numberType,
          profileId,
          flowId,
          friendlyName: String(value.friendlyName ?? value.name ?? 'CallCommand business line'),
        });
        if (String(previousOrder.phone_e164 ?? '') !== phone
          || String(previousOrder.acquisition_mode ?? '') !== 'platform_provisioned'
          || String(previousOrder.request_hash ?? '') !== replayHash) {
          throw new CallCommandCommercialError(
            'The idempotency key was already used for a different number-provisioning request',
            'CALLCOMMAND_NUMBER_IDEMPOTENCY_CONFLICT',
            409,
          );
        }
        if (previousOrder.status === 'completed' && previousOrder.channel_id) {
          const channel = await db.execute(sql`
            SELECT id,name,phone_e164,status,profile_id,active_flow_id,provider_number_status,
              provisioning_status,health_status,provider_verified_at,lifecycle_state,billing_status
            FROM callcommand_channels
            WHERE tenant_id=${tenant(request)} AND id=${String(previousOrder.channel_id)} LIMIT 1
          `);
          const saved = channel.rows[0] as Row | undefined;
          return reply.code(200).send({
            duplicate: true,
            providerActionConfirmed: true,
            readyForLiveCalls: saved?.lifecycle_state === 'ACTIVE',
            lifecycleState: saved?.lifecycle_state ?? previousOrder.provisioning_state,
            channel: saved ? { ...camel(saved), phoneMasked: maskPhone(String(saved.phone_e164)) } : null,
            order: camel(previousOrder),
          });
        }
        if (['pending', 'searching', 'purchasing', 'configuring'].includes(String(previousOrder.status))
          || ['REQUESTED','PROVISIONING','PROVIDER_PROVISIONED','CONFIGURING_ROUTING','CONFIGURING_BILLING','TESTING','RECONCILIATION_REQUIRED'].includes(String(previousOrder.provisioning_state))) {
          return reply.code(202).send({ duplicate: true, providerActionConfirmed: false, order: camel(previousOrder) });
        }
        throw new CallCommandCommercialError(
          'This provisioning key already ended without a confirmed number; retry with a new idempotency key',
          'CALLCOMMAND_NUMBER_ORDER_TERMINAL',
          409,
        );
      }

      const inventoryCounts = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE number_type='local')::int AS local,
          COUNT(*) FILTER (WHERE number_type='toll_free')::int AS toll_free
        FROM callcommand_channels
        WHERE tenant_id=${tenant(request)} AND acquisition_mode='platform_provisioned'
          AND lifecycle_state<>'RELEASED' AND deleted_at IS NULL
      `);
      const counts = inventoryCounts.rows[0] as Row;
      const projected = calculateManagedNumberBillingQuantities({
        local: Number(counts?.local ?? 0) + (numberType === 'local' ? 1 : 0),
        tollFree: Number(counts?.toll_free ?? 0) + (numberType === 'toll_free' ? 1 : 0),
      });
      const billingRows = await db.execute(sql`
        SELECT * FROM callcommand_number_billing_entitlements
        WHERE tenant_id=${tenant(request)} LIMIT 1
      `);
      const numberBilling = billingRows.rows[0] as Row | undefined;
      const licensedLocal = Number(numberBilling?.licensed_billable_local_quantity ?? 0);
      const licensedTollFree = Number(numberBilling?.licensed_billable_toll_free_quantity ?? 0);
      const graceValid = numberBilling?.billing_status === 'grace_period'
        && numberBilling?.grace_expires_at
        && new Date(numberBilling.grace_expires_at).getTime() > Date.now();
      const billingUsable = numberBilling?.billing_status === 'active' || graceValid;
      if ((projected.billableLocal > 0 || projected.billableTollFree > 0)
        && (!billingUsable || projected.billableLocal > licensedLocal || projected.billableTollFree > licensedTollFree)) {
        return reply.code(409).send({
          error: 'Managed-number billing must be completed before this provider purchase',
          code: 'CALLCOMMAND_NUMBER_BILLING_REQUIRED',
          providerActionConfirmed: false,
          billingActionRequired: true,
          required: {
            billableLocalQuantity: projected.billableLocal,
            billableTollFreeQuantity: projected.billableTollFree,
          },
          licensed: {
            billableLocalQuantity: licensedLocal,
            billableTollFreeQuantity: licensedTollFree,
          },
        });
      }
      const account = await ensureTelephonyAccount(request);
      const credentials = await storedAccountCredentials(account);
      const requestHash = managedNumberRequestHash({
        accountId: account.id,
        phone,
        numberType,
        profileId,
        flowId,
        friendlyName: String(value.friendlyName ?? value.name ?? 'CallCommand business line'),
      });
      const inserted = await db.execute(sql`
        INSERT INTO callcommand_number_orders(
          tenant_id,telephony_account_id,requested_by_user_id,idempotency_key,
          acquisition_mode,country_code,area_code,requested_capabilities,
          phone_e164,phone_masked,status,operation_type,number_type,requested_phone_e164,
          requested_profile_id,requested_flow_id,request_hash,provisioning_state,
          expected_billable_local_quantity,expected_billable_toll_free_quantity,started_at,last_attempt_at
        ) VALUES (
          ${tenant(request)},${String(account.id)},${actor(request)},${idempotencyKey},
          'platform_provisioned',${String(value.country ?? 'US').toUpperCase().slice(0, 2)},
          ${value.areaCode ? String(value.areaCode).slice(0, 8) : null},'["voice"]'::jsonb,
          ${phone},${maskPhone(phone)},'pending','provision',${numberType},${phone},
          ${profileId},${flowId},${requestHash},'REQUESTED',
          ${projected.billableLocal},${projected.billableTollFree},NOW(),NOW()
        ) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING *
      `);
      if (!inserted.rows[0]) {
        const existing = await db.execute(sql`
          SELECT * FROM callcommand_number_orders WHERE tenant_id=${tenant(request)} AND idempotency_key=${idempotencyKey} LIMIT 1
        `);
        const row = existing.rows[0] as Row | undefined;
        if (!row) throw new CallCommandCommercialError('Number provisioning state was not found', 'CALLCOMMAND_NUMBER_ORDER_NOT_FOUND', 404);
        if (String(row.phone_e164 ?? '') !== phone
          || String(row.telephony_account_id ?? '') !== String(account.id)
          || String(row.acquisition_mode ?? '') !== 'platform_provisioned'
          || String(row.request_hash ?? '') !== requestHash) {
          throw new CallCommandCommercialError(
            'The idempotency key was already used for a different number-provisioning request',
            'CALLCOMMAND_NUMBER_IDEMPOTENCY_CONFLICT',
            409,
          );
        }
        if (row.status === 'completed' && row.channel_id) {
          const channel = await db.execute(sql`
            SELECT id,name,phone_e164,status,profile_id,active_flow_id,provider_number_status,
              provisioning_status,health_status,provider_verified_at
            FROM callcommand_channels WHERE tenant_id=${tenant(request)} AND id=${String(row.channel_id)} LIMIT 1
          `);
          const saved = channel.rows[0] as Row | undefined;
          return reply.code(200).send({
            duplicate: true,
            providerActionConfirmed: true,
            channel: saved ? { ...camel(saved), phoneMasked: maskPhone(String(saved.phone_e164)) } : null,
            order: camel(row),
          });
        }
        if (['pending', 'searching', 'purchasing', 'configuring'].includes(String(row.status))
          || ['REQUESTED','PROVISIONING','PROVIDER_PROVISIONED','CONFIGURING_ROUTING','CONFIGURING_BILLING','TESTING','RECONCILIATION_REQUIRED'].includes(String(row.provisioning_state))) {
          return reply.code(202).send({ duplicate: true, providerActionConfirmed: false, order: camel(row) });
        }
        throw new CallCommandCommercialError(
          'This provisioning key already ended without a confirmed number; retry with a new idempotency key',
          'CALLCOMMAND_NUMBER_ORDER_TERMINAL',
          409,
        );
      }
      orderId = String((inserted.rows[0] as Row).id);
      await db.execute(sql`
        UPDATE callcommand_number_orders SET status='purchasing',provisioning_state='PROVISIONING',
          last_attempt_at=NOW(),lease_owner=${`api:${process.pid}`},lease_expires_at=NOW()+INTERVAL '5 minutes',updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${orderId}
      `);

      const webhook = webhookConfiguration();
      let provisioned;
      try {
        provisioned = await numberProvider().provisionNumber({
          credentials,
          providerAccountId: String(account.provider_account_sid),
          selectedPhoneNumber: phone,
          friendlyName: cleanText(value.friendlyName ?? value.name ?? 'CallCommand business line', 'friendlyName', 64)!,
          routing: { voiceUrl: webhook.voiceUrl, statusCallbackUrl: webhook.statusCallbackUrl },
        });
      } catch (error) {
        // A timeout after Twilio accepted the purchase is ambiguous.  Inspect
        // the exact tenant subaccount before retrying so a lost response never
        // creates a second billable number.
        if ((error as any)?.retryable === true) {
          const inventory = await numberProvider().listNumbers({
            credentials,
            providerAccountId: String(account.provider_account_sid),
            limit: 1_000,
          }).catch(() => []);
          provisioned = inventory.find(number => number.phoneNumber === phone);
        }
        if (!provisioned) {
          const failureCode = safeFailureCode(error, 'CALLCOMMAND_NUMBER_PROVISION_FAILED');
          await db.execute(sql`
            UPDATE callcommand_number_orders SET status='failed',provisioning_state=${(error as any)?.code === 'PROVIDER_NUMBER_UNAVAILABLE' ? 'ACTION_REQUIRED' : 'PROVISION_FAILED'},
              error_code=${failureCode},error_message_safe=${(error as any)?.code === 'PROVIDER_NUMBER_UNAVAILABLE'
                ? 'The selected number was just claimed. Search again for fresh inventory.'
                : 'The provider did not confirm number acquisition.'},
              retry_count=retry_count+1,failed_at=NOW(),lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${orderId}
          `);
          if ((error as any)?.code === 'PROVIDER_NUMBER_UNAVAILABLE') {
            return reply.code(409).send({
              error: 'That number was just claimed. Fresh inventory is required.',
              code: 'CALLCOMMAND_NUMBER_INVENTORY_CHANGED',
              providerActionConfirmed: false,
              refreshSearch: true,
              search: {
                country: String(value.country ?? 'US').toUpperCase(),
                numberType,
                areaCode: value.areaCode ?? null,
                locality: value.locality ?? null,
                region: value.region ?? null,
                postalCode: value.postalCode ?? null,
                contains: value.contains ?? null,
              },
              orderId,
            });
          }
          throw providerFailure(error, 'CALLCOMMAND_NUMBER_PROVISION_FAILED');
        }
        await db.execute(sql`
          UPDATE callcommand_number_orders SET provisioning_state='PROVIDER_PROVISIONED',
            provider_number_sid=${provisioned.providerNumberId},provider_operation_reference='recovered_by_inventory',
            phone_e164=${provisioned.phoneNumber},phone_masked=${maskPhone(provisioned.phoneNumber)},
            reconciliation_status='reconciled',error_code=NULL,error_message_safe=NULL,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${orderId}
        `);
      }
      providerNumberId = provisioned.providerNumberId;

      await db.execute(sql`
        UPDATE callcommand_number_orders SET provisioning_state='PROVIDER_PROVISIONED',
          provider_number_sid=${provisioned.providerNumberId},provider_operation_reference=COALESCE(provider_operation_reference,${provisioned.providerNumberId}),
          phone_e164=${provisioned.phoneNumber},phone_masked=${maskPhone(provisioned.phoneNumber)},updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${orderId}
      `);

      let channel: Row;
      try {
        channel = await db.transaction(async tx => {
          const created = await tx.execute(sql`
            INSERT INTO callcommand_channels(
              tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,
              recording_enabled,status,business_hours,live_behavior,after_hours_behavior,
              require_recording_consent,provider_status,profile_id,product_mode,
              telephony_account_id,acquisition_mode,provider_number_sid,
              provider_number_status,routing_mode,provisioning_status,health_status,
              provider_verified_at,provider_config_version,active_flow_id,number_type,country_code,
              provider_region,provider_locality,provider_capabilities,lifecycle_state,billing_status,
              provider_config_hash,provisioned_at
            ) VALUES (
              ${tenant(request)},${actor(request)},${cleanText(value.friendlyName ?? value.name ?? 'CallCommand business line','friendlyName',120)},
              ${provisioned.phoneNumber},${cleanText(value.timezone ?? 'UTC','timezone',80)},
              'This call may be recorded and processed for service.',FALSE,'paused','{"always":true}'::jsonb,
              'ai_receptionist','voicemail',TRUE,'active',${profileId},'general',
              ${String(account.id)},'platform_provisioned',${provisioned.providerNumberId},'active','general',
              'configured','unknown',NOW(),1,${flowId},${numberType},
              ${String(value.country ?? 'US').toUpperCase().slice(0, 2)},
              ${value.region ? String(value.region).slice(0, 80) : null},
              ${value.locality ? String(value.locality).slice(0, 120) : null},
              ${JSON.stringify(provisioned.capabilities)}::jsonb,'TESTING',
              ${projected.billableLocal === 0 && projected.billableTollFree === 0 ? 'included' : 'active'},
              ${managedNumberRequestHash({ voiceUrl: webhook.voiceUrl, statusCallbackUrl: webhook.statusCallbackUrl, voiceMethod: 'POST', statusCallbackMethod: 'POST' })},NOW()
            ) RETURNING *
          `);
          const saved = created.rows[0] as Row;
          await tx.execute(sql`
            UPDATE callcommand_number_orders SET channel_id=${String(saved.id)},provider_number_sid=${provisioned.providerNumberId},
              phone_e164=${provisioned.phoneNumber},phone_masked=${maskPhone(provisioned.phoneNumber)},status='configuring',
              provisioning_state='TESTING',lease_expires_at=NOW()+INTERVAL '5 minutes',updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${orderId}
          `);
          return saved;
        });
      } catch (error) {
        await db.execute(sql`
          UPDATE callcommand_number_orders SET provider_number_sid=${providerNumberId},phone_e164=${phone},phone_masked=${maskPhone(phone)},
            status='failed',provisioning_state='RECONCILIATION_REQUIRED',
            reconciliation_status='manual_review',compensation_status='manual_review',
            error_code='NUMBER_PERSISTENCE_RECONCILIATION_REQUIRED',
            error_message_safe='Provider ownership was confirmed but local persistence requires reconciliation.',
            failed_at=NOW(),lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${orderId}
        `);
        await db.execute(sql`
          INSERT INTO callcommand_number_reconciliation_issues(
            tenant_id,telephony_account_id,order_id,issue_type,resource_key,
            expected_json,actual_json,safe_auto_repair,status
          ) VALUES (
            ${tenant(request)},${String(account.id)},${orderId},'provider_number_missing_local_channel',
            ${String(providerNumberId)},${JSON.stringify({ phone, providerNumberId })}::jsonb,
            '{"localChannel":null}'::jsonb,FALSE,'manual_review'
          ) ON CONFLICT (tenant_id,issue_type,resource_key) WHERE status IN ('open','repairing','manual_review','failed')
          DO UPDATE SET actual_json=EXCLUDED.actual_json,status='manual_review',updated_at=NOW()
        `).catch(() => undefined);
        request.log.error({ err: error, orderId, providerNumberId }, 'Provider number requires CallCommand persistence reconciliation');
        return reply.code(500).send({
          error: 'The provider acquired the number, but local activation requires administrator reconciliation',
          code: 'CALLCOMMAND_NUMBER_RECONCILIATION_REQUIRED',
          providerActionConfirmed: true,
          orderId,
        });
      }

      let health;
      try {
        health = await numberProvider().inspectNumber({
          credentials,
          providerAccountId: String(account.provider_account_sid),
          providerNumberId: String(providerNumberId),
        });
      } catch (error) {
        const reason = safeFailureCode(error, 'CALLCOMMAND_NUMBER_HEALTH_FAILED');
        await db.transaction(async tx => {
          await tx.execute(sql`
            UPDATE callcommand_channels SET lifecycle_state='RECONCILIATION_REQUIRED',
              health_status='unavailable',health_reason_code=${reason},health_checked_at=NOW(),updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${String(channel.id)}
          `);
          await tx.execute(sql`
            UPDATE callcommand_number_orders SET provisioning_state='RECONCILIATION_REQUIRED',
              reconciliation_status='pending',error_code=${reason},error_message_safe='Provider health could not be confirmed after acquisition.',
              retry_count=retry_count+1,lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${orderId}
          `);
          await tx.execute(sql`
            INSERT INTO callcommand_number_reconciliation_issues(
              tenant_id,telephony_account_id,channel_id,order_id,issue_type,resource_key,
              expected_json,actual_json,safe_auto_repair,status,last_error_code
            ) VALUES (
              ${tenant(request)},${String(account.id)},${String(channel.id)},${orderId},'provider_health_unconfirmed',
              ${String(providerNumberId)},'{"providerPresent":true,"routingHealthy":true}'::jsonb,
              '{"providerHealth":"unconfirmed"}'::jsonb,TRUE,'open',${reason}
            ) ON CONFLICT (tenant_id,issue_type,resource_key) WHERE status IN ('open','repairing','manual_review','failed')
            DO UPDATE SET last_error_code=EXCLUDED.last_error_code,status='open',updated_at=NOW()
          `);
        });
        await activity(request, 'callcommand.number.reconciliation_required', 'channel', String(channel.id), 'Provider acquired the number but post-acquisition health is unconfirmed', { providerNumberId, reason });
        return reply.code(202).send({
          duplicate: false,
          providerActionConfirmed: true,
          readyForLiveCalls: false,
          lifecycleState: 'RECONCILIATION_REQUIRED',
          channel: { ...camel(channel), lifecycleState: 'RECONCILIATION_REQUIRED', phoneMasked: maskPhone(String(channel.phone_e164)) },
          orderId,
          code: 'CALLCOMMAND_NUMBER_RECONCILIATION_REQUIRED',
        });
      }

      const activated = health.health === 'healthy';
      const finalState = activated ? 'ACTIVE' : 'ROUTING_FAILED';
      const finalReason = activated ? null : health.healthReasons[0] ?? 'PROVIDER_HEALTH_DEGRADED';
      await db.transaction(async tx => {
        await tx.execute(sql`
          UPDATE callcommand_channels SET status=${activated ? 'active' : 'paused'},
            lifecycle_state=${finalState},health_status=${activated ? 'healthy' : 'degraded'},
            health_reason_code=${finalReason},health_checked_at=NOW(),
            provider_number_status=${activated ? 'active' : 'failed'},
            activated_at=${activated ? new Date() : null},last_reconciled_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${String(channel.id)}
        `);
        await tx.execute(sql`
          UPDATE callcommand_number_orders SET status=${activated ? 'completed' : 'failed'},
            provisioning_state=${finalState},reconciliation_status=${activated ? 'reconciled' : 'pending'},
            error_code=${finalReason},error_message_safe=${activated ? null : 'Provider routing health must be repaired before live calls.'},
            completed_at=${activated ? new Date() : null},failed_at=${activated ? null : new Date()},
            lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${orderId}
        `);
        await tx.execute(sql`
          INSERT INTO callcommand_number_billing_entitlements(
            tenant_id,active_local_numbers,active_toll_free_numbers,billing_status
          ) VALUES (
            ${tenant(request)},${projected.activeLocal},${projected.activeTollFree},
            ${projected.billableLocal === 0 && projected.billableTollFree === 0 ? 'included' : String(numberBilling?.billing_status ?? 'active')}
          ) ON CONFLICT (tenant_id) DO UPDATE SET
            active_local_numbers=EXCLUDED.active_local_numbers,
            active_toll_free_numbers=EXCLUDED.active_toll_free_numbers,
            billing_status=CASE
              WHEN callcommand_number_billing_entitlements.billing_status IN ('active','grace_period')
                THEN callcommand_number_billing_entitlements.billing_status
              ELSE EXCLUDED.billing_status END,
            version=callcommand_number_billing_entitlements.version+1,updated_at=NOW()
        `);
        if (!activated) {
          await tx.execute(sql`
            INSERT INTO callcommand_number_reconciliation_issues(
              tenant_id,telephony_account_id,channel_id,order_id,issue_type,resource_key,
              expected_json,actual_json,safe_auto_repair,status,last_error_code
            ) VALUES (
              ${tenant(request)},${String(account.id)},${String(channel.id)},${orderId},'routing_drift',
              ${String(providerNumberId)},${JSON.stringify({ voiceUrl: webhook.voiceUrl, statusCallbackUrl: webhook.statusCallbackUrl, methods: 'POST' })}::jsonb,
              ${JSON.stringify({ routing: health.routing, reasons: health.healthReasons })}::jsonb,TRUE,'open',${finalReason}
            ) ON CONFLICT (tenant_id,issue_type,resource_key) WHERE status IN ('open','repairing','manual_review','failed')
            DO UPDATE SET actual_json=EXCLUDED.actual_json,last_error_code=EXCLUDED.last_error_code,status='open',updated_at=NOW()
          `);
        }
      });
      const finalChannel = await db.execute(sql`
        SELECT * FROM callcommand_channels WHERE tenant_id=${tenant(request)} AND id=${String(channel.id)} LIMIT 1
      `);
      channel = finalChannel.rows[0] as Row;
      await activity(request, activated ? 'callcommand.number.activated' : 'callcommand.number.routing_failed', 'channel', String(channel.id), activated
        ? 'Provisioned, routed, billed, and health-validated a tenant-isolated business number'
        : 'Provider acquired the number but routing health requires repair', {
        provider: 'twilio', acquisitionMode: 'platform_provisioned', providerNumberId,
        numberType, createdProfile: onboarding.createdProfile, createdFlow: onboarding.createdFlow,
      });
      return reply.code(activated ? 201 : 202).send({
        duplicate: false,
        providerActionConfirmed: true,
        readyForLiveCalls: activated,
        lifecycleState: finalState,
        channel: { ...camel(channel), phoneMasked: maskPhone(String(channel.phone_e164)) },
        orderId,
        onboarding: {
          profileId,
          flowId,
          createdProfile: onboarding.createdProfile,
          createdFlow: onboarding.createdFlow,
        },
        provider: { status: provisioned.status, routing: provisioned.routing, capabilities: provisioned.capabilities, cost: provisioned.cost },
      });
    } catch (error) {
      if (orderId && providerNumberId === null && !(error instanceof CallCommandCommercialError && error.code === 'CALLCOMMAND_NUMBER_ORDER_TERMINAL')) {
        await db.execute(sql`
          UPDATE callcommand_number_orders SET status='failed',provisioning_state='PROVISION_FAILED',
            error_code=${safeFailureCode(error, 'CALLCOMMAND_NUMBER_PROVISION_FAILED')},
            failed_at=COALESCE(failed_at,NOW()),updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${orderId} AND status NOT IN ('completed','failed','released')
        `).catch(() => undefined);
      }
      return fail(reply, error);
    }
  });

  app.post(`${base}/commercial/numbers/connect`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      const phone = normalizeE164(value.phone ?? value.phoneE164, 'phone');
      const connectionType = String(value.connectionType ?? 'forwarding');
      if (!['forwarding', 'twilio_transfer', 'sip', 'port'].includes(connectionType)) {
        throw new CallCommandCommercialError('connectionType is invalid', 'CALLCOMMAND_NUMBER_CONNECTION_TYPE_INVALID');
      }
      const profileId = optionalId(value.profileId, 'profileId');
      if (profileId) {
        const profile = await db.execute(sql`
          SELECT id FROM callcommand_profiles
          WHERE tenant_id=${tenant(request)} AND id=${profileId} AND product_mode='general'
            AND status='active' AND deleted_at IS NULL LIMIT 1
        `);
        if (!profile.rows[0]) throw new CallCommandCommercialError('The selected receptionist was not found', 'CALLCOMMAND_PROFILE_NOT_FOUND', 404);
      }
      const created = await db.execute(sql`
        INSERT INTO callcommand_channels(
          tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,
          recording_enabled,status,business_hours,live_behavior,after_hours_behavior,
          require_recording_consent,provider_status,profile_id,product_mode,
          acquisition_mode,connection_type,provider_number_status,routing_mode,provisioning_status,
          health_status,health_reason_code
        ) VALUES (
          ${tenant(request)},${actor(request)},${cleanText(value.friendlyName ?? 'Existing business line','friendlyName',120)},
          ${phone},${cleanText(value.timezone ?? 'UTC','timezone',80)},
          'This call may be recorded and processed for service.',FALSE,'paused','{"always":true}'::jsonb,
          'ai_receptionist','voicemail',TRUE,'unavailable',${profileId},'general',
          'byon',${connectionType},'pending','general','pending','unknown',${`BYON_${connectionType.toUpperCase()}_SETUP_REQUIRED`}
        ) RETURNING *
      `);
      const channel = created.rows[0] as Row;
      await activity(request, 'callcommand.number.connection_plan.created', 'channel', String(channel.id), 'Created an existing-number connection plan without claiming provider activation', { connectionType });
      return reply.code(201).send({
        channel: { ...camel(channel), phoneMasked: maskPhone(phone) },
        connectionPlan: { type: connectionType, status: 'provider_action_required', instructions: CONNECTION_INSTRUCTIONS[connectionType] },
        providerActionConfirmed: false,
        readyForLiveCalls: false,
      });
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/:id/health`, { preHandler: admins }, async (request, reply) => {
    try {
      const channelId = id(request);
      const loaded = await db.execute(sql`
        SELECT c.*,a.provider_account_sid,a.secret_reference_id,a.status AS account_status
        FROM callcommand_channels c
        LEFT JOIN callcommand_telephony_accounts a
          ON a.tenant_id=c.tenant_id AND a.id=c.telephony_account_id AND a.archived_at IS NULL
        WHERE c.tenant_id=${tenant(request)} AND c.id=${channelId}
          AND c.product_mode='general' AND c.routing_mode<>'msp' AND c.deleted_at IS NULL LIMIT 1
      `);
      const channel = loaded.rows[0] as Row | undefined;
      if (!channel) throw new CallCommandCommercialError('Phone number was not found', 'CALLCOMMAND_NUMBER_NOT_FOUND', 404);
      if (!channel.telephony_account_id || !channel.provider_number_sid) {
        await db.execute(sql`
          UPDATE callcommand_channels SET health_status='unknown',health_reason_code='PROVIDER_CONNECTION_REQUIRED',
            health_checked_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${channelId}
        `);
        return {
          health: 'action_required',
          healthReasons: ['provider_connection_required'],
          remediation: 'Complete the existing-number provider connection before running provider health validation.',
          providerActionConfirmed: false,
          readyForLiveCalls: false,
        };
      }
      const credentials = await storedAccountCredentials(channel);
      let health;
      try {
        health = await numberProvider().inspectNumber({
          credentials,
          providerAccountId: String(channel.provider_account_sid),
          providerNumberId: String(channel.provider_number_sid),
        });
      } catch (error) {
        const reason = safeFailureCode(error, 'CALLCOMMAND_NUMBER_HEALTH_FAILED');
        await db.transaction(async tx => {
          await tx.execute(sql`
            UPDATE callcommand_channels SET health_status='unavailable',health_reason_code=${reason},
              health_checked_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${channelId}
          `);
          await tx.execute(sql`
            UPDATE callcommand_telephony_accounts SET health_status='unavailable',health_reason_code=${reason},
              last_health_at=NOW(),version=version+1,updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${String(channel.telephony_account_id)}
          `);
        });
        throw providerFailure(error, 'CALLCOMMAND_NUMBER_HEALTH_FAILED');
      }
      const healthy = health.health === 'healthy';
      await db.transaction(async tx => {
        await tx.execute(sql`
          UPDATE callcommand_channels SET health_status=${healthy ? 'healthy' : 'degraded'},
            health_reason_code=${healthy ? null : health.healthReasons[0] ?? 'PROVIDER_HEALTH_DEGRADED'},
            health_checked_at=NOW(),provider_number_status=${healthy ? 'active' : 'failed'},
            provider_verified_at=${healthy ? new Date() : channel.provider_verified_at ?? null},
            provider_config_version=provider_config_version+1,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${channelId}
        `);
        await tx.execute(sql`
          UPDATE callcommand_telephony_accounts SET status=${health.accountStatus === 'active' ? 'active' : 'degraded'},
            health_status=${healthy ? 'healthy' : 'degraded'},
            health_reason_code=${healthy ? null : health.healthReasons[0] ?? 'PROVIDER_HEALTH_DEGRADED'},
            last_health_at=NOW(),verified_at=${healthy ? new Date() : channel.verified_at ?? null},
            version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${String(channel.telephony_account_id)}
        `);
      });
      await activity(request, 'callcommand.number.health_checked', 'channel', channelId, healthy ? 'Provider confirmed number and routing health' : 'Provider reported degraded number health', { healthReasons: health.healthReasons });
      return { health: health.health, healthReasons: health.healthReasons, provider: health, providerActionConfirmed: true, readyForLiveCalls: healthy };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/:id/repair`, { preHandler: admins }, async (request, reply) => {
    try {
      const channelId = id(request);
      const loaded = await db.execute(sql`
        SELECT c.*,a.provider_account_sid,a.secret_reference_id,a.status AS account_status
        FROM callcommand_channels c
        JOIN callcommand_telephony_accounts a
          ON a.tenant_id=c.tenant_id AND a.id=c.telephony_account_id AND a.archived_at IS NULL
        WHERE c.tenant_id=${tenant(request)} AND c.id=${channelId}
          AND c.acquisition_mode='platform_provisioned' AND c.lifecycle_state<>'RELEASED'
          AND c.deleted_at IS NULL LIMIT 1
      `);
      const channel = loaded.rows[0] as Row | undefined;
      if (!channel || !NUMBER_SID.test(String(channel.provider_number_sid ?? ''))) {
        throw new CallCommandCommercialError('A repairable provider-managed number was not found', 'CALLCOMMAND_PROVIDER_NUMBER_NOT_FOUND', 404);
      }
      const credentials = await storedAccountCredentials(channel);
      const webhook = webhookConfiguration();
      let updated;
      let health;
      try {
        updated = await numberProvider().updateRouting({
          credentials,
          providerAccountId: String(channel.provider_account_sid),
          providerNumberId: String(channel.provider_number_sid),
          routing: { voiceUrl: webhook.voiceUrl, statusCallbackUrl: webhook.statusCallbackUrl },
        });
        health = await numberProvider().inspectNumber({
          credentials,
          providerAccountId: String(channel.provider_account_sid),
          providerNumberId: String(channel.provider_number_sid),
        });
      } catch (error) { throw providerFailure(error, 'CALLCOMMAND_NUMBER_REPAIR_FAILED'); }
      const billingAllowed = ['included','active'].includes(String(channel.billing_status))
        || (channel.billing_status === 'grace_period' && channel.billing_grace_expires_at
          && new Date(channel.billing_grace_expires_at).getTime() > Date.now());
      const readiness = managedNumberReadiness({
        providerAccountReady: channel.account_status === 'active',
        providerNumberPresent: true,
        routingHealthy: health.health === 'healthy',
        profileAssigned: Boolean(channel.profile_id),
        workflowAssigned: Boolean(channel.active_flow_id),
        billingStatus: billingAllowed ? String(channel.billing_status) : 'suspended',
        paymentGraceExpiresAt: channel.billing_grace_expires_at ? new Date(channel.billing_grace_expires_at) : null,
      });
      await db.transaction(async tx => {
        await tx.execute(sql`
          UPDATE callcommand_channels SET
            status=${readiness.ready ? 'active' : 'paused'},
            lifecycle_state=${readiness.ready ? 'ACTIVE' : readiness.state === 'suspended' ? 'SUSPENDED' : 'ACTION_REQUIRED'},
            provider_number_status=${health.health === 'healthy' ? 'active' : 'failed'},
            provisioning_status=${readiness.ready ? 'configured' : 'failed'},
            health_status=${readiness.ready ? 'healthy' : 'degraded'},
            health_reason_code=${readiness.ready ? null : readiness.reasons[0] ?? health.healthReasons[0] ?? 'NUMBER_REPAIR_INCOMPLETE'},
            health_checked_at=NOW(),provider_verified_at=CASE WHEN ${health.health === 'healthy'} THEN NOW() ELSE provider_verified_at END,
            provider_config_hash=${managedNumberRequestHash({ voiceUrl: webhook.voiceUrl, statusCallbackUrl: webhook.statusCallbackUrl, voiceMethod: 'POST', statusCallbackMethod: 'POST' })},
            provider_config_version=provider_config_version+1,last_reconciled_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${channelId}
        `);
        await tx.execute(sql`
          UPDATE callcommand_number_reconciliation_issues SET status=${readiness.ready ? 'resolved' : 'manual_review'},
            last_attempt_at=NOW(),resolved_at=${readiness.ready ? new Date() : null},
            last_error_code=${readiness.ready ? null : readiness.reasons[0] ?? 'NUMBER_REPAIR_INCOMPLETE'},updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND channel_id=${channelId}
            AND status IN ('open','repairing','failed')
        `);
      });
      await activity(request, 'callcommand.number.repair.completed', 'channel', channelId, readiness.ready
        ? 'Repaired provider routing and restored managed-number readiness'
        : 'Repaired provider routing but additional action remains required', {
        readiness: readiness.state,
        reasons: readiness.reasons,
      });
      return {
        repaired: true,
        providerActionConfirmed: true,
        readyForLiveCalls: readiness.ready,
        lifecycleState: readiness.ready ? 'ACTIVE' : readiness.state === 'suspended' ? 'SUSPENDED' : 'ACTION_REQUIRED',
        reasons: readiness.reasons,
        provider: { routing: updated.routing, health: health.health, healthReasons: health.healthReasons },
      };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/reconcile`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      const autoRepair = value.autoRepair === true;
      const expiredBillingGrace = await expireCallCommandNumberBillingGrace({ tenantId: tenant(request) });
      const account = await activeTelephonyAccount(tenant(request));
      if (!account) {
        throw new CallCommandCommercialError('The tenant telephony account was not found', 'CALLCOMMAND_TENANT_TELEPHONY_ACCOUNT_NOT_FOUND', 404);
      }
      const credentials = await storedAccountCredentials(account);
      const webhook = webhookConfiguration();
      let providerNumbers;
      try {
        providerNumbers = await numberProvider().listNumbers({
          credentials,
          providerAccountId: String(account.provider_account_sid),
          limit: 1_000,
        });
      } catch (error) { throw providerFailure(error, 'CALLCOMMAND_NUMBER_RECONCILIATION_FAILED'); }
      const channelRows = await db.execute(sql`
        SELECT * FROM callcommand_channels
        WHERE tenant_id=${tenant(request)} AND telephony_account_id=${String(account.id)}
          AND acquisition_mode='platform_provisioned' AND lifecycle_state<>'RELEASED' AND deleted_at IS NULL
      `);
      const channels = channelRows.rows as Row[];
      const providerBySid = new Map(providerNumbers.map(number => [number.providerNumberId, number]));
      const channelBySid = new Map(channels.filter(row => row.provider_number_sid).map(row => [String(row.provider_number_sid), row]));
      const findings: Array<{ type: string; resourceKey: string; channelId: string | null; safeAutoRepair: boolean; repaired: boolean }> = [];

      const record = async (finding: {
        type: string;
        resourceKey: string;
        channelId: string | null;
        expected: Row;
        actual: Row;
        safeAutoRepair: boolean;
        repaired?: boolean;
      }) => {
        findings.push({
          type: finding.type,
          resourceKey: finding.resourceKey,
          channelId: finding.channelId,
          safeAutoRepair: finding.safeAutoRepair,
          repaired: finding.repaired === true,
        });
        await db.execute(sql`
          INSERT INTO callcommand_number_reconciliation_issues(
            tenant_id,telephony_account_id,channel_id,issue_type,resource_key,
            expected_json,actual_json,safe_auto_repair,status,last_attempt_at,resolved_at
          ) VALUES (
            ${tenant(request)},${String(account.id)},${finding.channelId},${finding.type},${finding.resourceKey},
            ${JSON.stringify(finding.expected)}::jsonb,${JSON.stringify(finding.actual)}::jsonb,
            ${finding.safeAutoRepair},${finding.repaired ? 'resolved' : finding.safeAutoRepair ? 'open' : 'manual_review'},
            ${finding.repaired ? new Date() : null},${finding.repaired ? new Date() : null}
          ) ON CONFLICT (tenant_id,issue_type,resource_key) WHERE status IN ('open','repairing','manual_review','failed')
          DO UPDATE SET expected_json=EXCLUDED.expected_json,actual_json=EXCLUDED.actual_json,
            safe_auto_repair=EXCLUDED.safe_auto_repair,status=EXCLUDED.status,
            last_attempt_at=EXCLUDED.last_attempt_at,resolved_at=EXCLUDED.resolved_at,updated_at=NOW()
        `);
      };

      for (const providerNumber of providerNumbers) {
        if (!channelBySid.has(providerNumber.providerNumberId)) {
          await record({
            type: 'provider_orphan_number',
            resourceKey: providerNumber.providerNumberId,
            channelId: null,
            expected: { localChannel: true, phone: providerNumber.phoneNumber },
            actual: { localChannel: false, providerNumberId: providerNumber.providerNumberId },
            safeAutoRepair: false,
          });
        }
      }
      for (const channel of channels) {
        const sid = String(channel.provider_number_sid ?? '');
        const providerNumber = providerBySid.get(sid);
        if (!providerNumber) {
          await record({
            type: 'database_number_missing_at_provider',
            resourceKey: sid || String(channel.id),
            channelId: String(channel.id),
            expected: { providerNumberId: sid, phone: channel.phone_e164 },
            actual: { providerPresent: false },
            safeAutoRepair: false,
          });
          await db.execute(sql`
            UPDATE callcommand_channels SET lifecycle_state='RECONCILIATION_REQUIRED',status='paused',
              health_status='unavailable',health_reason_code='PROVIDER_NUMBER_MISSING',last_reconciled_at=NOW(),updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${String(channel.id)}
          `);
          continue;
        }
        const routingDrift = providerNumber.routing.voiceUrl !== webhook.voiceUrl
          || providerNumber.routing.statusCallbackUrl !== webhook.statusCallbackUrl
          || providerNumber.routing.voiceMethod !== 'POST'
          || providerNumber.routing.statusCallbackMethod !== 'POST';
        if (routingDrift) {
          let repaired = false;
          if (autoRepair) {
            await numberProvider().updateRouting({
              credentials,
              providerAccountId: String(account.provider_account_sid),
              providerNumberId: sid,
              routing: { voiceUrl: webhook.voiceUrl, statusCallbackUrl: webhook.statusCallbackUrl },
            });
            repaired = true;
          }
          await record({
            type: 'routing_drift',
            resourceKey: sid,
            channelId: String(channel.id),
            expected: { voiceUrl: webhook.voiceUrl, statusCallbackUrl: webhook.statusCallbackUrl, method: 'POST' },
            actual: providerNumber.routing,
            safeAutoRepair: true,
            repaired,
          });
          if (repaired) {
            await db.execute(sql`
              UPDATE callcommand_channels SET provider_config_hash=${managedNumberRequestHash({ voiceUrl: webhook.voiceUrl, statusCallbackUrl: webhook.statusCallbackUrl, voiceMethod: 'POST', statusCallbackMethod: 'POST' })},
                provider_config_version=provider_config_version+1,last_reconciled_at=NOW(),updated_at=NOW()
              WHERE tenant_id=${tenant(request)} AND id=${String(channel.id)}
            `);
          }
        }
      }

      const staleRows = await db.execute(sql`
        SELECT id,provider_number_sid,provisioning_state FROM callcommand_number_orders
        WHERE tenant_id=${tenant(request)}
          AND provisioning_state NOT IN ('ACTIVE','RELEASED','PROVISION_FAILED','ACTION_REQUIRED')
          AND updated_at<NOW()-INTERVAL '15 minutes'
          AND (lease_expires_at IS NULL OR lease_expires_at<NOW())
      `);
      for (const stale of staleRows.rows as Row[]) {
        await record({
          type: 'stale_number_operation',
          resourceKey: String(stale.id),
          channelId: null,
          expected: { terminalOrLeased: true },
          actual: { state: stale.provisioning_state, providerNumberId: stale.provider_number_sid ?? null },
          safeAutoRepair: false,
        });
      }

      const actualCounts = calculateManagedNumberBillingQuantities({
        local: channels.filter(row => row.number_type === 'local').length,
        tollFree: channels.filter(row => row.number_type === 'toll_free').length,
      });
      const billed = await db.execute(sql`
        SELECT * FROM callcommand_number_billing_entitlements WHERE tenant_id=${tenant(request)} LIMIT 1
      `);
      const billing = billed.rows[0] as Row | undefined;
      if (actualCounts.billableLocal !== Number(billing?.licensed_billable_local_quantity ?? 0)
        || actualCounts.billableTollFree !== Number(billing?.licensed_billable_toll_free_quantity ?? 0)) {
        await record({
          type: 'billing_quantity_drift',
          resourceKey: tenant(request),
          channelId: null,
          expected: { local: actualCounts.billableLocal, tollFree: actualCounts.billableTollFree },
          actual: {
            local: Number(billing?.licensed_billable_local_quantity ?? 0),
            tollFree: Number(billing?.licensed_billable_toll_free_quantity ?? 0),
          },
          safeAutoRepair: true,
        });
      }
      await db.execute(sql`
        UPDATE callcommand_telephony_accounts SET last_reconciled_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${String(account.id)}
      `);
      await db.execute(sql`
        UPDATE callcommand_channels SET last_reconciled_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND telephony_account_id=${String(account.id)} AND deleted_at IS NULL
      `);
      await activity(request, 'callcommand.number.reconciliation.completed', 'telephony_account', String(account.id), 'Compared provider inventory, routing, operations, and billing with tenant-scoped OperatorOS state', {
        autoRepair,
        providerNumberCount: providerNumbers.length,
        databaseNumberCount: channels.length,
        findingCount: findings.length,
        repairedCount: findings.filter(finding => finding.repaired).length,
      });
      return {
        providerActionConfirmed: true,
        autoRepair,
        summary: {
          providerNumbers: providerNumbers.length,
          databaseNumbers: channels.length,
          findings: findings.length,
          repaired: findings.filter(finding => finding.repaired).length,
          manualReview: findings.filter(finding => !finding.safeAutoRepair).length,
          billingEntitlementsSuspended: expiredBillingGrace.entitlementsSuspended,
          billingNumbersSuspended: expiredBillingGrace.numbersSuspended,
        },
        findings,
      };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/:id/release`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      const channelId = id(request);
      const loaded = await db.execute(sql`
        SELECT c.*,a.provider_account_sid,a.secret_reference_id
        FROM callcommand_channels c
        JOIN callcommand_telephony_accounts a
          ON a.tenant_id=c.tenant_id AND a.id=c.telephony_account_id AND a.archived_at IS NULL
        WHERE c.tenant_id=${tenant(request)} AND c.id=${channelId}
          AND c.product_mode='general' AND c.routing_mode<>'msp' AND c.deleted_at IS NULL LIMIT 1
      `);
      const channel = loaded.rows[0] as Row | undefined;
      if (!channel || !NUMBER_SID.test(String(channel.provider_number_sid ?? ''))) {
        throw new CallCommandCommercialError('A provider-managed number was not found', 'CALLCOMMAND_PROVIDER_NUMBER_NOT_FOUND', 404);
      }
      const exactPhoneConfirmed = value.expectedPhone
        ? normalizeE164(value.expectedPhone, 'expectedPhone') === channel.phone_e164
        : false;
      const explicitPhraseConfirmed = String(value.confirmationText ?? '').trim() === 'RELEASE NUMBER';
      if (value.confirmRelease !== true || (!exactPhoneConfirmed && !explicitPhraseConfirmed)) {
        throw new CallCommandCommercialError('Exact number release confirmation is required', 'CALLCOMMAND_NUMBER_RELEASE_NOT_CONFIRMED', 409);
      }
      if (channel.lifecycle_state === 'RELEASED' || channel.provider_number_status === 'released') {
        return reply.code(200).send({ released: true, duplicate: true, providerActionConfirmed: true, phoneMasked: maskPhone(String(channel.phone_e164)) });
      }
      if (channel.lifecycle_state === 'RELEASE_PENDING' && channel.release_scheduled_at) {
        return reply.code(202).send({
          released: false,
          duplicate: true,
          providerActionConfirmed: false,
          releaseScheduledAt: channel.release_scheduled_at,
          phoneMasked: maskPhone(String(channel.phone_e164)),
        });
      }
      const releaseAt = managedNumberReleaseAt();
      const releaseKey = `release:${channelId}:${releaseAt.toISOString()}`;
      await db.transaction(async tx => {
        await tx.execute(sql`
          UPDATE callcommand_channels SET status='paused',lifecycle_state='RELEASE_PENDING',
            provisioning_status='releasing',health_status='degraded',health_reason_code='PROVIDER_NUMBER_RELEASE_SCHEDULED',
            release_scheduled_at=${releaseAt},release_requested_by_user_id=${actor(request)},
            provider_config_version=provider_config_version+1,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${channelId}
        `);
        await tx.execute(sql`
          INSERT INTO callcommand_number_orders(
            tenant_id,telephony_account_id,requested_by_user_id,channel_id,idempotency_key,
            acquisition_mode,country_code,requested_capabilities,provider_number_sid,
            phone_e164,phone_masked,status,operation_type,number_type,requested_phone_e164,
            request_hash,provisioning_state,started_at
          ) VALUES (
            ${tenant(request)},${String(channel.telephony_account_id)},${actor(request)},${channelId},${releaseKey},
            'platform_provisioned',${String(channel.country_code ?? 'US')},'["voice"]'::jsonb,
            ${String(channel.provider_number_sid)},${String(channel.phone_e164)},${maskPhone(String(channel.phone_e164))},
            'pending','release',${String(channel.number_type ?? classifyManagedNumberType(String(channel.phone_e164)))},
            ${String(channel.phone_e164)},${managedNumberRequestHash({ channelId, providerNumberId: channel.provider_number_sid, releaseAt: releaseAt.toISOString() })},
            'RELEASE_PENDING',NOW()
          ) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING
        `);
      });
      await activity(request, 'callcommand.number.release_scheduled', 'channel', channelId, 'Scheduled a confirmed managed-number release after the recovery hold', {
        providerNumberId: channel.provider_number_sid,
        releaseScheduledAt: releaseAt.toISOString(),
      });
      return reply.code(202).send({
        released: false,
        providerActionConfirmed: false,
        lifecycleState: 'RELEASE_PENDING',
        releaseScheduledAt: releaseAt.toISOString(),
        phoneMasked: maskPhone(String(channel.phone_e164)),
        cancellationAvailableUntil: releaseAt.toISOString(),
      });
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/:id/release/cancel`, { preHandler: admins }, async (request, reply) => {
    try {
      const channelId = id(request);
      const value = body(request);
      if (value.confirmCancel !== true) {
        throw new CallCommandCommercialError('Release cancellation confirmation is required', 'CALLCOMMAND_NUMBER_RELEASE_CANCEL_NOT_CONFIRMED', 409);
      }
      const canceled = await db.transaction(async tx => {
        const loaded = await tx.execute(sql`
          SELECT * FROM callcommand_channels
          WHERE tenant_id=${tenant(request)} AND id=${channelId} AND deleted_at IS NULL FOR UPDATE
        `);
        const channel = loaded.rows[0] as Row | undefined;
        if (!channel) throw new CallCommandCommercialError('Phone number was not found', 'CALLCOMMAND_NUMBER_NOT_FOUND', 404);
        if (channel.lifecycle_state !== 'RELEASE_PENDING' || !channel.release_scheduled_at) {
          throw new CallCommandCommercialError('The phone number does not have a pending release', 'CALLCOMMAND_NUMBER_RELEASE_NOT_PENDING', 409);
        }
        if (new Date(channel.release_scheduled_at).getTime() <= Date.now()) {
          throw new CallCommandCommercialError('The provider release window has started and can no longer be canceled here', 'CALLCOMMAND_NUMBER_RELEASE_CANCEL_WINDOW_CLOSED', 409);
        }
        await tx.execute(sql`
          UPDATE callcommand_channels SET status='paused',lifecycle_state='ACTION_REQUIRED',
            provisioning_status='configured',health_status='degraded',
            health_reason_code='RELEASE_CANCELED_REVALIDATION_REQUIRED',release_scheduled_at=NULL,
            release_requested_by_user_id=NULL,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${channelId}
        `);
        await tx.execute(sql`
          UPDATE callcommand_number_orders SET status='canceled',provisioning_state='ACTION_REQUIRED',updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND channel_id=${channelId}
            AND operation_type='release' AND provisioning_state='RELEASE_PENDING'
        `);
        return channel;
      });
      await activity(request, 'callcommand.number.release_canceled', 'channel', channelId, 'Canceled a managed-number release during the recovery hold');
      return {
        canceled: true,
        lifecycleState: 'ACTION_REQUIRED',
        phoneMasked: maskPhone(String(canceled.phone_e164)),
        remediation: 'Run health check or automatic repair before returning this line to service.',
      };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/numbers/:id/release/execute`, { preHandler: admins }, async (request, reply) => {
    try {
      const channelId = id(request);
      const value = body(request);
      if (value.confirmExecute !== true) {
        throw new CallCommandCommercialError('Final provider release confirmation is required', 'CALLCOMMAND_NUMBER_RELEASE_EXECUTION_NOT_CONFIRMED', 409);
      }
      const loaded = await db.execute(sql`
        SELECT c.*,a.provider_account_sid,a.secret_reference_id
        FROM callcommand_channels c
        JOIN callcommand_telephony_accounts a
          ON a.tenant_id=c.tenant_id AND a.id=c.telephony_account_id AND a.archived_at IS NULL
        WHERE c.tenant_id=${tenant(request)} AND c.id=${channelId} AND c.deleted_at IS NULL LIMIT 1
      `);
      const channel = loaded.rows[0] as Row | undefined;
      if (!channel || channel.lifecycle_state !== 'RELEASE_PENDING' || !channel.release_scheduled_at) {
        throw new CallCommandCommercialError('A scheduled provider-managed number release was not found', 'CALLCOMMAND_NUMBER_RELEASE_NOT_PENDING', 404);
      }
      if (new Date(channel.release_scheduled_at).getTime() > Date.now()) {
        throw new CallCommandCommercialError('The recovery hold has not elapsed', 'CALLCOMMAND_NUMBER_RELEASE_HOLD_ACTIVE', 409);
      }
      const credentials = await storedAccountCredentials(channel);
      let released;
      try {
        released = await numberProvider().releaseNumber({
          credentials,
          providerAccountId: String(channel.provider_account_sid),
          providerNumberId: String(channel.provider_number_sid),
          confirmation: {
            confirmed: true,
            expectedProviderNumberId: String(channel.provider_number_sid),
            expectedPhoneNumber: String(channel.phone_e164),
          },
        });
      } catch (error) {
        await db.execute(sql`
          UPDATE callcommand_number_orders SET provisioning_state='RECONCILIATION_REQUIRED',
            reconciliation_status='pending',retry_count=retry_count+1,
            error_code=${safeFailureCode(error, 'CALLCOMMAND_NUMBER_RELEASE_FAILED')},
            error_message_safe='The provider did not confirm release; ownership must be reconciled before retry.',updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND channel_id=${channelId}
            AND operation_type='release' AND provisioning_state='RELEASE_PENDING'
        `);
        throw providerFailure(error, 'CALLCOMMAND_NUMBER_RELEASE_FAILED');
      }
      const inventory = await db.transaction(async tx => {
        await tx.execute(sql`
          UPDATE callcommand_channels SET status='archived',provider_number_status='released',
            provisioning_status='released',lifecycle_state='RELEASED',billing_status='released',
            health_status='unavailable',health_reason_code='PROVIDER_NUMBER_RELEASED',
            released_at=NOW(),release_scheduled_at=NULL,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${channelId}
        `);
        await tx.execute(sql`
          UPDATE callcommand_number_orders SET status='released',provisioning_state='RELEASED',
            reconciliation_status='reconciled',completed_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND channel_id=${channelId}
            AND operation_type='release' AND provisioning_state IN ('RELEASE_PENDING','RECONCILIATION_REQUIRED')
        `);
        const counts = await tx.execute(sql`
          SELECT COUNT(*) FILTER (WHERE number_type='local')::int AS local,
            COUNT(*) FILTER (WHERE number_type='toll_free')::int AS toll_free
          FROM callcommand_channels
          WHERE tenant_id=${tenant(request)} AND acquisition_mode='platform_provisioned'
            AND lifecycle_state<>'RELEASED' AND deleted_at IS NULL
        `);
        const row = counts.rows[0] as Row;
        await tx.execute(sql`
          UPDATE callcommand_number_billing_entitlements SET
            active_local_numbers=${Number(row.local ?? 0)},active_toll_free_numbers=${Number(row.toll_free ?? 0)},
            version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenant(request)}
        `);
        return calculateManagedNumberBillingQuantities({ local: Number(row.local ?? 0), tollFree: Number(row.toll_free ?? 0) });
      });
      let billingResult: Row | null = null;
      try {
        billingResult = await requestCallCommandNumberBilling({
          tenantId: tenant(request),
          userId: actor(request),
          billableLocalQuantity: inventory.billableLocal,
          billableTollFreeQuantity: inventory.billableTollFree,
          idempotencyKey: `release-billing:${channelId}:${String(released.providerNumberId).slice(-12)}`,
        });
      } catch (error) {
        await db.execute(sql`
          INSERT INTO callcommand_number_reconciliation_issues(
            tenant_id,telephony_account_id,channel_id,issue_type,resource_key,
            expected_json,actual_json,safe_auto_repair,status,last_error_code
          ) VALUES (
            ${tenant(request)},${String(channel.telephony_account_id)},${channelId},'billing_quantity_drift',
            ${channelId},${JSON.stringify({ local: inventory.billableLocal, tollFree: inventory.billableTollFree })}::jsonb,
            '{"billingUpdate":"failed"}'::jsonb,TRUE,'open',${safeFailureCode(error, 'CALLCOMMAND_NUMBER_BILLING_RECONCILIATION_REQUIRED')}
          ) ON CONFLICT (tenant_id,issue_type,resource_key) WHERE status IN ('open','repairing','manual_review','failed')
          DO UPDATE SET expected_json=EXCLUDED.expected_json,last_error_code=EXCLUDED.last_error_code,status='open',updated_at=NOW()
        `);
      }
      await activity(request, 'callcommand.number.released', 'channel', channelId, 'Provider confirmed delayed managed-number release', {
        providerNumberId: released.providerNumberId,
        billingAction: billingResult?.action ?? 'reconciliation_required',
      });
      return {
        released: true,
        providerActionConfirmed: true,
        phoneMasked: maskPhone(released.phoneNumber),
        providerNumberId: released.providerNumberId,
        billing: billingResult,
      };
    } catch (error) { return fail(reply, error); }
  });

  app.patch(`${base}/profiles/:id`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request);
      const profileId = id(request);
      const loaded = await db.execute(sql`
        SELECT * FROM callcommand_profiles
        WHERE tenant_id=${tenant(request)} AND id=${profileId} AND deleted_at IS NULL LIMIT 1
      `);
      const current = loaded.rows[0] as Row | undefined;
      if (!current) throw new CallCommandCommercialError('Receptionist was not found', 'CALLCOMMAND_PROFILE_NOT_FOUND', 404);

      const intakeFields = value.intakeSchema === undefined && value.intakeFields === undefined
        ? current.intake_fields
        : normalizeIntakeSchema(value.intakeSchema ?? value.intakeFields ?? []);
      const voice = value.voice === undefined && value.voiceId === undefined
        ? String(current.voice_id ?? 'alloy')
        : String(value.voice ?? value.voiceId);
      if (!VOICES.has(voice)) throw new CallCommandCommercialError('voice is invalid', 'CALLCOMMAND_PROFILE_VOICE_INVALID');
      const languages = value.languages === undefined && value.additionalLanguages === undefined
        ? current.additional_languages
        : boundedStringArray(value.languages ?? value.additionalLanguages, 20, 'languages');
      const faqs = value.faqs === undefined ? current.faqs : value.faqs;
      if (!Array.isArray(faqs) || faqs.length > 100) throw new CallCommandCommercialError('faqs is invalid', 'CALLCOMMAND_PROFILE_CONFIGURATION_INVALID');
      const holidays = value.holidaySchedule === undefined ? current.holiday_schedule : value.holidaySchedule;
      if (!Array.isArray(holidays) || holidays.length > 100) throw new CallCommandCommercialError('holidaySchedule is invalid', 'CALLCOMMAND_PROFILE_CONFIGURATION_INVALID');
      const hours = value.businessHoursConfig !== undefined
        ? safeJsonObject(value.businessHoursConfig, 'businessHoursConfig')
        : value.businessHoursDescription !== undefined
          ? { description: cleanText(value.businessHoursDescription, 'businessHoursDescription', 1000)! }
          : current.business_hours_config;
      const permissions = value.dataPermissions === undefined
        ? current.data_permissions
        : safeJsonObject(value.dataPermissions, 'dataPermissions');
      const recordingPolicy = String(value.recordingPolicy ?? current.recording_policy ?? 'consent_required');
      const transcriptionPolicy = String(value.transcriptionPolicy ?? current.transcription_policy ?? 'consent_required');
      if (!RECORDING_POLICIES.has(recordingPolicy) || !TRANSCRIPTION_POLICIES.has(transcriptionPolicy)) {
        throw new CallCommandCommercialError('Recording or transcription policy is invalid', 'CALLCOMMAND_PROFILE_POLICY_INVALID');
      }
      const retentionDays = Number(value.retentionDays ?? current.retention_days ?? 30);
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
        throw new CallCommandCommercialError('retentionDays must be 1-3650', 'CALLCOMMAND_PROFILE_RETENTION_INVALID');
      }
      const fallback = normalizeFallback(value.fallbackBehavior ?? current.fallback_behavior);
      const profileMode = String(value.mode ?? current.mode ?? 'receptionist');
      const productMode = String(value.productMode ?? current.product_mode ?? 'general');
      if (!PROFILE_MODES.has(profileMode)) {
        throw new CallCommandCommercialError('mode is invalid', 'CALLCOMMAND_PROFILE_MODE_INVALID');
      }
      if (!CALLCOMMAND_PRODUCT_MODES.includes(productMode as any)) {
        throw new CallCommandCommercialError('productMode is invalid', 'CALLCOMMAND_PROFILE_PRODUCT_MODE_INVALID');
      }
      if (productMode !== String(current.product_mode ?? 'general')) {
        throw new CallCommandCommercialError(
          'A receptionist cannot be moved between product modes through an update',
          'CALLCOMMAND_PROFILE_PRODUCT_MODE_IMMUTABLE',
          409,
        );
      }
      const updated = await db.transaction(async tx => {
        if (value.isDefault === true) {
          await tx.execute(sql`UPDATE callcommand_profiles SET is_default=FALSE,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id<>${profileId}`);
        }
        const result = await tx.execute(sql`
          UPDATE callcommand_profiles SET
            name=${value.name === undefined ? current.name : cleanText(value.name,'name',120)},
            mode=${profileMode},
            greeting=${value.greeting === undefined && value.greetingScript === undefined ? current.greeting : cleanText(value.greeting ?? value.greetingScript,'greeting',1000)},
            intake_fields=${JSON.stringify(intakeFields)}::jsonb,
            status=${['active','paused','archived'].includes(String(value.status)) ? String(value.status) : current.status},
            script=${value.script === undefined ? current.script : cleanText(value.script,'script',12000,true) ?? ''},
            tone=${value.tone === undefined ? current.tone : cleanText(value.tone,'tone',32)},
            escalation_rules=${JSON.stringify(value.escalationRules === undefined ? current.escalation_rules : (Array.isArray(value.escalationRules) ? value.escalationRules.slice(0,20) : []))}::jsonb,
            product_mode=${productMode},
            is_default=${typeof value.isDefault === 'boolean' ? value.isDefault : current.is_default},
            business_name=${value.businessName === undefined ? current.business_name : cleanText(value.businessName,'businessName',160,true) ?? ''},
            department_name=${value.department === undefined && value.departmentName === undefined ? current.department_name : cleanText(value.department ?? value.departmentName,'department',120,true)},
            voice_id=${voice},
            personality=${value.personality === undefined && value.tone === undefined ? current.personality : cleanText(value.personality ?? value.tone,'personality',80)},
            agent_purpose=${value.primaryPurpose === undefined && value.agentPurpose === undefined ? current.agent_purpose : cleanText(value.primaryPurpose ?? value.agentPurpose,'primaryPurpose',4000,true) ?? ''},
            business_description=${value.businessDescription === undefined ? current.business_description : cleanText(value.businessDescription,'businessDescription',8000,true) ?? ''},
            faqs=${JSON.stringify(faqs)}::jsonb,
            business_hours_config=${JSON.stringify(hours)}::jsonb,
            holiday_schedule=${JSON.stringify(holidays)}::jsonb,
            primary_language=${value.primaryLanguage === undefined ? current.primary_language : cleanText(value.primaryLanguage,'primaryLanguage',32)},
            additional_languages=${JSON.stringify(languages)}::jsonb,
            fallback_behavior=${fallback},
            voicemail_greeting=${value.voicemailGreeting === undefined ? current.voicemail_greeting : cleanText(value.voicemailGreeting,'voicemailGreeting',2000,true) ?? ''},
            after_hours_instructions=${value.afterHoursInstructions === undefined ? current.after_hours_instructions : cleanText(value.afterHoursInstructions,'afterHoursInstructions',4000,true) ?? ''},
            data_permissions=${JSON.stringify(permissions)}::jsonb,
            recording_policy=${recordingPolicy},transcription_policy=${transcriptionPolicy},retention_days=${retentionDays},
            advanced_prompt=${value.advancedPrompt === undefined ? current.advanced_prompt : cleanText(value.advancedPrompt,'advancedPrompt',12000,true) ?? ''},
            version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${profileId} RETURNING *
        `);
        return result.rows[0] as Row;
      });
      await activity(request, 'callcommand.profile.updated', 'receptionist_profile', profileId, 'Updated tenant receptionist behavior and policy');
      return { profile: camel(updated) };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/profiles/:id/knowledge`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request);
      const profileId = id(request);
      const profile = await db.execute(sql`
        SELECT id FROM callcommand_profiles WHERE tenant_id=${tenant(request)} AND id=${profileId} AND deleted_at IS NULL LIMIT 1
      `);
      if (!profile.rows[0]) throw new CallCommandCommercialError('Receptionist was not found', 'CALLCOMMAND_PROFILE_NOT_FOUND', 404);
      const kind = String(value.knowledgeType ?? 'custom');
      if (!['faq','policy','service','hours','custom'].includes(kind)) {
        throw new CallCommandCommercialError('knowledgeType is invalid', 'CALLCOMMAND_KNOWLEDGE_TYPE_INVALID');
      }
      const priority = Number(value.priority ?? 100);
      if (!Number.isInteger(priority) || priority < 1 || priority > 1000) {
        throw new CallCommandCommercialError('priority must be 1-1000', 'CALLCOMMAND_KNOWLEDGE_PRIORITY_INVALID');
      }
      const created = await db.execute(sql`
        INSERT INTO callcommand_agent_knowledge(
          tenant_id,profile_id,created_by_user_id,updated_by_user_id,knowledge_type,
          title,content,source_label,enabled,priority
        ) VALUES (
          ${tenant(request)},${profileId},${actor(request)},${actor(request)},${kind},
          ${cleanText(value.title,'title',200)},${cleanText(value.content,'content',12000)},
          ${cleanText(value.sourceLabel,'sourceLabel',200,true)},${value.enabled !== false},${priority}
        ) RETURNING *
      `);
      const row = created.rows[0] as Row;
      await activity(request, 'callcommand.knowledge.created', 'agent_knowledge', String(row.id), 'Added bounded receptionist knowledge', { profileId, knowledgeType: kind });
      return reply.code(201).send({ knowledge: camel(row) });
    } catch (error) { return fail(reply, error); }
  });

  app.patch(`${base}/profiles/:profileId/knowledge/:id`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request);
      const profileId = id(request, 'profileId');
      const knowledgeId = id(request);
      const loaded = await db.execute(sql`
        SELECT * FROM callcommand_agent_knowledge
        WHERE tenant_id=${tenant(request)} AND profile_id=${profileId} AND id=${knowledgeId} AND deleted_at IS NULL LIMIT 1
      `);
      const current = loaded.rows[0] as Row | undefined;
      if (!current) throw new CallCommandCommercialError('Knowledge item was not found', 'CALLCOMMAND_KNOWLEDGE_NOT_FOUND', 404);
      const kind = String(value.knowledgeType ?? current.knowledge_type);
      const priority = Number(value.priority ?? current.priority);
      if (!['faq','policy','service','hours','custom'].includes(kind) || !Number.isInteger(priority) || priority < 1 || priority > 1000) {
        throw new CallCommandCommercialError('Knowledge configuration is invalid', 'CALLCOMMAND_KNOWLEDGE_INVALID');
      }
      const updated = await db.execute(sql`
        UPDATE callcommand_agent_knowledge SET knowledge_type=${kind},
          title=${value.title === undefined ? current.title : cleanText(value.title,'title',200)},
          content=${value.content === undefined ? current.content : cleanText(value.content,'content',12000)},
          source_label=${value.sourceLabel === undefined ? current.source_label : cleanText(value.sourceLabel,'sourceLabel',200,true)},
          enabled=${typeof value.enabled === 'boolean' ? value.enabled : current.enabled},priority=${priority},
          updated_by_user_id=${actor(request)},version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND profile_id=${profileId} AND id=${knowledgeId} RETURNING *
      `);
      await activity(request, 'callcommand.knowledge.updated', 'agent_knowledge', knowledgeId, 'Updated receptionist knowledge', { profileId });
      return { knowledge: camel(updated.rows[0] as Row) };
    } catch (error) { return fail(reply, error); }
  });

  app.delete(`${base}/profiles/:profileId/knowledge/:id`, { preHandler: writes }, async (request, reply) => {
    try {
      const profileId = id(request, 'profileId');
      const knowledgeId = id(request);
      const removed = await db.execute(sql`
        UPDATE callcommand_agent_knowledge SET enabled=FALSE,deleted_at=NOW(),updated_by_user_id=${actor(request)},
          version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND profile_id=${profileId} AND id=${knowledgeId} AND deleted_at IS NULL RETURNING id
      `);
      if (!removed.rows[0]) throw new CallCommandCommercialError('Knowledge item was not found', 'CALLCOMMAND_KNOWLEDGE_NOT_FOUND', 404);
      await activity(request, 'callcommand.knowledge.archived', 'agent_knowledge', knowledgeId, 'Archived receptionist knowledge', { profileId });
      return reply.code(204).send();
    } catch (error) { return fail(reply, error); }
  });

  app.patch(`${base}/automation-rules/:id`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request);
      const ruleId = id(request);
      const loaded = await db.execute(sql`
        SELECT * FROM callcommand_automation_rules
        WHERE tenant_id=${tenant(request)} AND id=${ruleId} AND deleted_at IS NULL LIMIT 1
      `);
      const current = loaded.rows[0] as Row | undefined;
      if (!current) throw new CallCommandCommercialError('Automation rule was not found', 'CALLCOMMAND_RULE_NOT_FOUND', 404);
      if (current.managed_key) {
        throw new CallCommandCommercialError(
          'This automation rule is managed by the commercial workflow setup',
          'CALLCOMMAND_RULE_MANAGED',
          409,
        );
      }
      const conditions = value.conditions === undefined ? current.conditions_json : safeJsonObject(value.conditions, 'conditions');
      const actions = await validateCallCommandAutomationActions({
        tenantId: tenant(request),
        actions: value.actions === undefined ? current.actions_json : value.actions,
      });
      const priority = Number(value.priority ?? current.priority);
      if (!Number.isInteger(priority) || priority < 1 || priority > 1000) {
        throw new CallCommandCommercialError('priority must be 1-1000', 'CALLCOMMAND_RULE_PRIORITY_INVALID');
      }
      const updated = await db.execute(sql`
        UPDATE callcommand_automation_rules SET
          name=${value.name === undefined ? current.name : cleanText(value.name,'name',160)},priority=${priority},
          enabled=${typeof value.enabled === 'boolean' ? value.enabled : current.enabled},
          conditions_json=${JSON.stringify(conditions)}::jsonb,actions_json=${JSON.stringify(actions)}::jsonb,
          version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${ruleId} RETURNING *
      `);
      await activity(request, 'callcommand.rule.updated', 'automation_rule', ruleId, 'Updated tenant automation rule');
      return { rule: camel(updated.rows[0] as Row) };
    } catch (error) { return fail(reply, error); }
  });

  app.put(`${base}/commercial/channels/:channelId/alert-rule`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      const channelId = id(request, 'channelId');
      const channel = await db.execute(sql`
        SELECT id,name FROM callcommand_channels
        WHERE tenant_id=${tenant(request)} AND id=${channelId} AND product_mode='general'
          AND routing_mode<>'msp' AND deleted_at IS NULL LIMIT 1
      `);
      if (!channel.rows[0]) {
        throw new CallCommandCommercialError('Phone number was not found', 'CALLCOMMAND_NUMBER_NOT_FOUND', 404);
      }
      const actions = await validateCallCommandAutomationActions({
        tenantId: tenant(request), actions: value.actions ?? [], allowEmpty: true,
      });
      if (actions.some(action => !['email', 'slack', 'webhook'].includes(String(action.actionType)))) {
        throw new CallCommandCommercialError(
          'Commercial workflow alerts support email, Slack, and signed webhooks only',
          'CALLCOMMAND_COMMERCIAL_ALERT_ACTION_INVALID',
        );
      }
      const managedKey = `commercial_channel_alerts:${channelId}`;
      const enabled = actions.some(action => action.enabled !== false);
      const rule = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-alerts:${tenant(request)}:${channelId}`},0))`);
        const saved = await tx.execute(sql`
          INSERT INTO callcommand_automation_rules(
            tenant_id,created_by_user_id,name,priority,enabled,conditions_json,actions_json,managed_key
          ) VALUES (
            ${tenant(request)},${actor(request)},${`Commercial alerts for ${String((channel.rows[0] as Row).name).slice(0, 120)}`},
            50,${enabled},${JSON.stringify({ channelId })}::jsonb,${JSON.stringify(actions)}::jsonb,${managedKey}
          )
          ON CONFLICT (tenant_id,managed_key)
            WHERE managed_key IS NOT NULL AND deleted_at IS NULL
          DO UPDATE SET
            name=EXCLUDED.name,priority=EXCLUDED.priority,enabled=EXCLUDED.enabled,
            conditions_json=EXCLUDED.conditions_json,actions_json=EXCLUDED.actions_json,
            version=callcommand_automation_rules.version+1,updated_at=NOW()
          RETURNING *
        `);
        return saved.rows[0] as Row;
      });
      await activity(
        request,
        enabled ? 'callcommand.commercial_alerts.configured' : 'callcommand.commercial_alerts.disabled',
        'automation_rule',
        String(rule.id),
        enabled ? 'Configured channel-scoped commercial alerts' : 'Disabled channel-scoped commercial alerts',
        { channelId, actionTypes: actions.map(action => action.actionType) },
      );
      return { rule: camel(rule), duplicateSafe: true };
    } catch (error) { return fail(reply, error); }
  });

  app.get(`${base}/profiles/:id/knowledge`, { preHandler: reads }, async (request, reply) => {
    try {
      const profileId = id(request);
      const profile = await db.execute(sql`
        SELECT id FROM callcommand_profiles
        WHERE tenant_id=${tenant(request)} AND id=${profileId} AND deleted_at IS NULL LIMIT 1
      `);
      if (!profile.rows[0]) {
        throw new CallCommandCommercialError('Receptionist was not found', 'CALLCOMMAND_PROFILE_NOT_FOUND', 404);
      }
      const knowledge = await db.execute(sql`
        SELECT * FROM callcommand_agent_knowledge
        WHERE tenant_id=${tenant(request)} AND profile_id=${profileId} AND deleted_at IS NULL
        ORDER BY priority,id
      `);
      return { knowledge: knowledge.rows.map(row => camel(row as Row)) };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/transfer-targets/:id/verification/start`, { preHandler: writes }, async (request, reply) => {
    try {
      const targetId = id(request);
      const outcome = await db.transaction(async tx => {
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-transfer-verification:${tenant(request)}:${targetId}`},0))
        `);
        const loaded = await tx.execute(sql`
          SELECT id,phone_e164,verified_at,status,kind
          FROM callcommand_transfer_targets
          WHERE tenant_id=${tenant(request)} AND id=${targetId} AND deleted_at IS NULL
          FOR UPDATE
        `);
        const target = loaded.rows[0] as Row | undefined;
        if (!target) {
          throw new CallCommandCommercialError('Transfer destination was not found', 'CALLCOMMAND_TRANSFER_TARGET_NOT_FOUND', 404);
        }
        if (target.kind !== 'external' || target.status !== 'active' || !target.phone_e164) {
          throw new CallCommandCommercialError(
            'Only active external destinations can be verified',
            'CALLCOMMAND_TRANSFER_TARGET_UNAVAILABLE',
            409,
          );
        }
        if (target.verified_at) {
          return { alreadyVerified: true, status: 'approved' as const, verificationId: null, providerReference: null };
        }

        await tx.execute(sql`
          UPDATE callcommand_transfer_verifications
          SET status='expired',failed_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND transfer_target_id=${targetId}
            AND status='pending' AND expires_at<=NOW()
        `);
        const pending = await tx.execute(sql`
          SELECT id,provider_reference,expires_at
          FROM callcommand_transfer_verifications
          WHERE tenant_id=${tenant(request)} AND transfer_target_id=${targetId}
            AND status='pending' AND expires_at>NOW()
          LIMIT 1
        `);
        if (pending.rows[0]) {
          const row = pending.rows[0] as Row;
          return {
            alreadyVerified: false,
            status: 'pending' as const,
            verificationId: String(row.id),
            providerReference: row.provider_reference ? String(row.provider_reference) : null,
            expiresAt: row.expires_at,
          };
        }

        const provider = await startTwilioVerification(String(target.phone_e164));
        const status = provider.status === 'pending' && provider.ok ? 'pending' : 'failed';
        const inserted = await tx.execute(sql`
          INSERT INTO callcommand_transfer_verifications(
            tenant_id,transfer_target_id,initiated_by_user_id,provider,verification_channel,
            destination_fingerprint,destination_last4,provider_reference,status,attempt_count,
            expires_at,failed_at
          ) VALUES (
            ${tenant(request)},${targetId},${actor(request)},'twilio_verify','sms',
            ${phoneFingerprint(String(target.phone_e164))},${String(target.phone_e164).slice(-4)},
            ${provider.providerReference ?? null},${status},0,NOW()+INTERVAL '10 minutes',
            ${status === 'failed' ? new Date() : null}
          ) RETURNING id,expires_at
        `);
        const row = inserted.rows[0] as Row;
        return {
          alreadyVerified: false,
          status: provider.status,
          verificationId: String(row.id),
          providerReference: provider.providerReference ?? null,
          reasonCode: provider.reasonCode ?? null,
          expiresAt: row.expires_at,
        };
      });

      await activity(
        request,
        'callcommand.transfer_verification.started',
        'transfer_target',
        targetId,
        outcome.alreadyVerified ? 'Transfer destination was already verified' : 'Started provider-owned transfer destination verification',
        { verificationId: outcome.verificationId, status: outcome.status },
      );
      if (outcome.status === 'provider_unavailable') {
        return reply.code(503).send({
          error: 'Transfer verification is not configured',
          code: outcome.reasonCode ?? 'TWILIO_VERIFY_NOT_CONFIGURED',
          verification: outcome,
          providerActionConfirmed: false,
        });
      }
      if (outcome.status === 'failed') {
        return reply.code(502).send({
          error: 'The verification provider did not accept the challenge',
          code: outcome.reasonCode ?? 'CALLCOMMAND_TRANSFER_VERIFICATION_START_FAILED',
          verification: outcome,
          providerActionConfirmed: false,
        });
      }
      return reply.code(outcome.alreadyVerified ? 200 : 202).send({
        verification: outcome,
        providerActionConfirmed: outcome.status === 'pending',
      });
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/transfer-targets/:id/verification/check`, { preHandler: writes }, async (request, reply) => {
    try {
      const value = body(request);
      const targetId = id(request);
      const code = String(value.code ?? '').trim();
      if (!/^\d{4,10}$/.test(code)) {
        throw new CallCommandCommercialError(
          'A 4-10 digit verification code is required',
          'TWILIO_VERIFY_CODE_INVALID',
        );
      }
      const loaded = await db.execute(sql`
        SELECT t.id,t.phone_e164,t.verified_at,t.status,t.kind,
          verification.id AS verification_id,verification.destination_fingerprint,
          verification.attempt_count,verification.expires_at
        FROM callcommand_transfer_targets t
        LEFT JOIN LATERAL (
          SELECT id,destination_fingerprint,attempt_count,expires_at
          FROM callcommand_transfer_verifications
          WHERE tenant_id=t.tenant_id AND transfer_target_id=t.id AND status='pending'
          ORDER BY created_at DESC LIMIT 1
        ) verification ON TRUE
        WHERE t.tenant_id=${tenant(request)} AND t.id=${targetId} AND t.deleted_at IS NULL
        LIMIT 1
      `);
      const target = loaded.rows[0] as Row | undefined;
      if (!target) {
        throw new CallCommandCommercialError('Transfer destination was not found', 'CALLCOMMAND_TRANSFER_TARGET_NOT_FOUND', 404);
      }
      if (target.verified_at) {
        return { verification: { status: 'approved', alreadyVerified: true }, providerActionConfirmed: false };
      }
      if (target.kind !== 'external' || target.status !== 'active' || !target.phone_e164 || !target.verification_id) {
        throw new CallCommandCommercialError(
          'A pending external-destination verification was not found',
          'CALLCOMMAND_TRANSFER_VERIFICATION_NOT_PENDING',
          409,
        );
      }
      if (new Date(target.expires_at).getTime() <= Date.now()) {
        await db.execute(sql`
          UPDATE callcommand_transfer_verifications SET status='expired',failed_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${String(target.verification_id)} AND status='pending'
        `);
        throw new CallCommandCommercialError(
          'The verification challenge expired; send a new code',
          'CALLCOMMAND_TRANSFER_VERIFICATION_EXPIRED',
          409,
        );
      }
      if (target.destination_fingerprint !== phoneFingerprint(String(target.phone_e164))) {
        await db.execute(sql`
          UPDATE callcommand_transfer_verifications SET status='canceled',canceled_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${String(target.verification_id)} AND status='pending'
        `);
        throw new CallCommandCommercialError(
          'The destination changed; send a new verification code',
          'CALLCOMMAND_TRANSFER_VERIFICATION_DESTINATION_CHANGED',
          409,
        );
      }

      const provider = await checkTwilioVerification(String(target.phone_e164), code);
      if (provider.status === 'provider_unavailable') {
        return reply.code(503).send({
          error: 'Transfer verification is not configured',
          code: provider.reasonCode ?? 'TWILIO_VERIFY_NOT_CONFIGURED',
          providerActionConfirmed: false,
        });
      }
      const attempts = Number(target.attempt_count ?? 0) + 1;
      const approved = provider.status === 'approved' && provider.ok;
      const terminalFailure = !approved && attempts >= 5;
      await db.transaction(async tx => {
        await tx.execute(sql`
          UPDATE callcommand_transfer_verifications SET
            provider_reference=COALESCE(${provider.providerReference ?? null},provider_reference),
            attempt_count=${attempts},status=${approved ? 'approved' : terminalFailure ? 'failed' : 'pending'},
            approved_at=${approved ? new Date() : null},failed_at=${terminalFailure ? new Date() : null},updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${String(target.verification_id)} AND status='pending'
        `);
        if (approved) {
          await tx.execute(sql`
            UPDATE callcommand_transfer_targets SET verified_at=NOW(),updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${targetId} AND status='active'
          `);
        }
      });
      await activity(
        request,
        approved ? 'callcommand.transfer_verification.approved' : 'callcommand.transfer_verification.checked',
        'transfer_target',
        targetId,
        approved ? 'Provider confirmed transfer destination possession' : 'Provider did not approve the transfer destination challenge',
        { verificationId: String(target.verification_id), approved, terminalFailure, attemptCount: attempts },
      );
      if (!approved) {
        return reply.code(409).send({
          error: terminalFailure ? 'Verification failed after the maximum attempts' : 'The verification code was not approved',
          code: provider.reasonCode ?? 'TWILIO_VERIFY_CHALLENGE_FAILED',
          verification: { status: terminalFailure ? 'failed' : 'pending', attempts, attemptsRemaining: Math.max(0, 5 - attempts) },
          providerActionConfirmed: false,
        });
      }
      return {
        verification: { status: 'approved', verificationId: String(target.verification_id), verifiedAt: new Date().toISOString() },
        providerActionConfirmed: true,
      };
    } catch (error) { return fail(reply, error); }
  });

  app.patch(`${base}/commercial/runtime-settings`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      const overflowPolicy = String(value.overflowPolicy ?? 'refuse');
      if (!['refuse', 'voicemail', 'forward', 'queue'].includes(overflowPolicy)) {
        throw new CallCommandCommercialError('overflowPolicy is invalid', 'CALLCOMMAND_OVERFLOW_POLICY_INVALID');
      }
      const forwardTargetId = overflowPolicy === 'forward'
        ? optionalId(value.overflowForwardTargetId, 'overflowForwardTargetId')
        : null;
      if (overflowPolicy === 'forward' && !forwardTargetId) {
        throw new CallCommandCommercialError(
          'A verified external transfer destination is required for forward overflow',
          'CALLCOMMAND_OVERFLOW_TARGET_REQUIRED',
        );
      }
      if (forwardTargetId) {
        const target = await db.execute(sql`
          SELECT id FROM callcommand_transfer_targets
          WHERE tenant_id=${tenant(request)} AND id=${forwardTargetId} AND kind='external'
            AND status='active' AND verified_at IS NOT NULL AND deleted_at IS NULL LIMIT 1
        `);
        if (!target.rows[0]) {
          throw new CallCommandCommercialError(
            'The overflow destination is not a verified active tenant target',
            'CALLCOMMAND_OVERFLOW_TARGET_UNAVAILABLE',
            409,
          );
        }
      }
      const defaultLeaseSeconds = Number(value.defaultLeaseSeconds ?? 900);
      const maximumLeaseSeconds = Number(value.maximumLeaseSeconds ?? 14400);
      if (!Number.isInteger(defaultLeaseSeconds) || defaultLeaseSeconds < 30 || defaultLeaseSeconds > 14400
        || !Number.isInteger(maximumLeaseSeconds) || maximumLeaseSeconds < defaultLeaseSeconds || maximumLeaseSeconds > 86400) {
        throw new CallCommandCommercialError(
          'Lease settings are outside the supported bounds',
          'CALLCOMMAND_RUNTIME_LEASE_INVALID',
        );
      }
      const realtimeEnabled = value.realtimeEnabled === true;
      const activationChannelId = realtimeEnabled
        ? optionalId(value.activationChannelId, 'activationChannelId')
        : null;
      if (realtimeEnabled && !activationChannelId) {
        throw new CallCommandCommercialError(
          'The exact provider-verified channel is required to enable Realtime',
          'CALLCOMMAND_ACTIVATION_CHANNEL_REQUIRED',
        );
      }
      if (realtimeEnabled) {
        const realtime = inspectCallCommandRealtimeReadiness();
        if (!realtime.ready) {
          throw new CallCommandCommercialError(
            'OpenAI Realtime SIP authority is not configured for this deployment',
            'CALLCOMMAND_REALTIME_NOT_CONFIGURED',
            409,
          );
        }
      }
      const saved = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-activation:${tenant(request)}`},0))`);
        if (realtimeEnabled && activationChannelId) {
          const ready = await tx.execute(sql`
            SELECT c.id
            FROM callcommand_channels c
            JOIN callcommand_profiles p
              ON p.tenant_id=c.tenant_id AND p.id=c.profile_id AND p.product_mode='general'
              AND p.status='active' AND p.deleted_at IS NULL
            JOIN callcommand_flows f
              ON f.tenant_id=c.tenant_id AND f.id=c.active_flow_id AND f.product_mode='general'
              AND f.status='active' AND f.deleted_at IS NULL
            JOIN callcommand_telephony_accounts a
              ON a.tenant_id=c.tenant_id AND a.id=c.telephony_account_id
              AND a.status='active' AND a.health_status='healthy' AND a.archived_at IS NULL
            JOIN shared_secret_references secret
              ON secret.tenant_id=a.tenant_id AND secret.id=a.secret_reference_id AND secret.revoked_at IS NULL
            WHERE c.tenant_id=${tenant(request)} AND c.id=${activationChannelId}
              AND c.product_mode='general' AND c.routing_mode<>'msp' AND c.deleted_at IS NULL
              AND c.provider_number_status='active' AND c.provider_verified_at IS NOT NULL
              AND c.health_status='healthy' AND c.health_checked_at IS NOT NULL
            FOR UPDATE OF c,p,f,a,secret
          `);
          if (!ready.rows[0]) {
            throw new CallCommandCommercialError(
              'The selected number, provider, receptionist, and published workflow are not all verified for live calls',
              'CALLCOMMAND_CHANNEL_NOT_READY_FOR_LIVE',
              409,
            );
          }
        }
        const runtime = await tx.execute(sql`
          INSERT INTO callcommand_tenant_runtime_settings(
            tenant_id,overflow_policy,overflow_forward_target_id,default_lease_seconds,
            maximum_lease_seconds,realtime_enabled
          ) VALUES (
            ${tenant(request)},${overflowPolicy},${forwardTargetId},${defaultLeaseSeconds},
            ${maximumLeaseSeconds},${realtimeEnabled}
          )
          ON CONFLICT (tenant_id) DO UPDATE SET
            overflow_policy=EXCLUDED.overflow_policy,
            overflow_forward_target_id=EXCLUDED.overflow_forward_target_id,
            default_lease_seconds=EXCLUDED.default_lease_seconds,
            maximum_lease_seconds=EXCLUDED.maximum_lease_seconds,
            realtime_enabled=EXCLUDED.realtime_enabled,
            version=callcommand_tenant_runtime_settings.version+1,
            updated_at=NOW()
          RETURNING *
        `);
        if (realtimeEnabled && activationChannelId) {
          const activated = await tx.execute(sql`
            UPDATE callcommand_channels SET status='active',version=version+1,updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${activationChannelId}
              AND product_mode='general' AND routing_mode<>'msp' AND deleted_at IS NULL
            RETURNING id
          `);
          if (!activated.rows[0]) {
            throw new CallCommandCommercialError('Phone number was not found', 'CALLCOMMAND_NUMBER_NOT_FOUND', 404);
          }
        }
        return runtime.rows[0] as Row;
      });
      await activity(request, 'callcommand.runtime_settings.updated', 'tenant_runtime_settings', tenant(request), 'Updated tenant CallCommand overflow and lane policy', {
        overflowPolicy,
        defaultLeaseSeconds,
        maximumLeaseSeconds,
        realtimeEnabled,
        activationChannelId,
      });
      return {
        runtime: camel(saved),
        activationChannelId,
        providerActionConfirmed: false,
        liveProviderConfigurationRequired: realtimeEnabled,
      };
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/commercial/lane-checkout`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      if (value.confirmPaidLaneQuantity !== true) {
        throw new CallCommandCommercialError(
          'Explicit confirmation of the paid concurrent-lane quantity is required',
          'CALLCOMMAND_LANE_QUANTITY_NOT_CONFIRMED',
          409,
        );
      }
      const additionalLanes = Number(value.additionalLanes ?? value.quantity);
      if (additionalLanes === 0 && value.confirmCancelPaidLanes !== true) {
        throw new CallCommandCommercialError(
          'Explicit confirmation is required to schedule removal of all paid concurrent lanes',
          'CALLCOMMAND_LANE_CANCELLATION_NOT_CONFIRMED',
          409,
        );
      }
      const result = await createOrUpdateCallCommandLaneCheckout({
        tenantId: tenant(request),
        userId: actor(request),
        additionalLanes,
        idempotencyKey: String(value.idempotencyKey ?? request.headers['idempotency-key'] ?? ''),
      });
      await activity(
        request,
        'callcommand.capacity.checkout_requested',
        'capacity_entitlement',
        tenant(request),
        'Requested licensed concurrent-call lane quantity; capacity remains unchanged until signed payment settlement',
        { action: result.action, additionalLanes: result.additionalLanes, cancellationScheduled: result.additionalLanes === 0 },
      );
      return reply.code(result.action === 'checkout_created' ? 201 : 202).send({
        ...result,
        pricing: getCallCommandLaneCatalog(),
        capacityGranted: false,
        providerActionConfirmed: true,
      });
    } catch (error) { return fail(reply, error); }
  });
}
