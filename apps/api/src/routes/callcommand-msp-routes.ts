import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { writeAudit } from '../lib/audit.js';
import { maskPhone, normalizeE164, parseTwilioCallSid, phoneFingerprint } from '../lib/callcommand.js';
import {
  CALLCOMMAND_MSP_CONTRACT,
  CallCommandMspError,
  classifyMspIntake,
  evaluateMspPolicy,
  issueSupportLinkId,
  normalizeSupportLinkId,
  redactMspText,
  supportLinkLookupHmac,
  trustedLineLookupHmac,
  validateActionManifest,
  type PolicyInput,
} from '../lib/callcommand-msp.js';
import {
  appendMspCallEvent,
  callCommandModuleId,
  camelMsp,
  consumeMspRateLimit,
  createLocalCase,
  queueBmsTicket,
  recordMspWebhookReceipt,
  transitionMspCall,
  type MspRow,
} from '../lib/callcommand-msp-service.js';
import { xml } from '../lib/callcommand-phase35.js';
import { storeEncryptedSecretReference } from '../lib/shared-secret-vault.js';
import { requireTenantAdmin, requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import { verifyTwilioSignature } from '../lib/telephony.js';

const MODULE_SLUG = 'callcommand-ai';
const base = '/v1/modules/callcommand-ai/product/msp';
const reads = [requireTenantModuleAccess(MODULE_SLUG)];
const writes = [...reads, requireTenantModuleWriteAccess];
const admins = [...writes, requireTenantAdmin];

const tenant = (request: FastifyRequest) => String((request as any).tenantContext.tenantId);
const actor = (request: FastifyRequest) => String((request as any).user.id);

function body(request: FastifyRequest): MspRow {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new CallCommandMspError('A JSON object is required');
  }
  const value = request.body as MspRow;
  for (const key of ['tenantId', 'tenant_id', 'userId', 'user_id', 'role', 'entitlement', 'plan']) {
    if (key in value) throw new CallCommandMspError(`${key} is resolved from the trusted OperatorOS session`);
  }
  return value;
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const result = String(value);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(result)) throw new CallCommandMspError(`${field} is invalid`, 'CALLCOMMAND_MSP_IDENTIFIER_INVALID', 400, field);
  return result;
}

function requiredUuid(value: unknown, field: string): string {
  const result = optionalUuid(value, field);
  if (!result) throw new CallCommandMspError(`${field} is required`, 'CALLCOMMAND_MSP_IDENTIFIER_REQUIRED', 400, field);
  return result;
}

function boundedText(value: unknown, field: string, max: number, optional = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new CallCommandMspError(`${field} is required`, 'CALLCOMMAND_MSP_FIELD_REQUIRED', 400, field);
  }
  if (typeof value !== 'string') throw new CallCommandMspError(`${field} must be text`, 'CALLCOMMAND_MSP_FIELD_INVALID', 400, field);
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    throw new CallCommandMspError(`${field} must contain 1-${max} valid characters`, 'CALLCOMMAND_MSP_FIELD_INVALID', 400, field);
  }
  return result;
}

function choice<T extends string>(value: unknown, field: string, values: readonly T[], fallback?: T): T {
  if ((value === undefined || value === null || value === '') && fallback) return fallback;
  const result = String(value ?? '') as T;
  if (!values.includes(result)) throw new CallCommandMspError(`${field} is invalid`, 'CALLCOMMAND_MSP_FIELD_INVALID', 400, field);
  return result;
}

function containsSensitiveConfigurationKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSensitiveConfigurationKey);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    /(?:password|passphrase|secret|token|credential|api[-_]?key|private[-_]?key|client[-_]?secret)/i.test(key)
      || containsSensitiveConfigurationKey(child));
}

function fail(reply: FastifyReply, error: unknown) {
  const value = error as any;
  if (value instanceof CallCommandMspError || (Number(value?.statusCode) >= 400 && Number(value?.statusCode) < 500)) {
    return reply.code(value.statusCode ?? 400).send({ error: value.message, code: value.code ?? 'CALLCOMMAND_MSP_REQUEST_FAILED', field: value.field });
  }
  throw error;
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
    throw new CallCommandMspError('Twilio signature verification failed', 'CALLCOMMAND_SIGNATURE_INVALID', 403);
  }
  return value;
}

function sendTwiml(reply: FastifyReply, content: string) {
  return reply.header('content-type', 'text/xml; charset=utf-8').send(content);
}

function publicAction(path: string, callId: string): string {
  return `${path}?call_id=${encodeURIComponent(callId)}`;
}

async function loadPublicContext(providerCallId: string, callId: string): Promise<MspRow> {
  const result = await db.execute(sql`
    SELECT x.*,c.phone_fingerprint,c.phone_masked,c.channel_id,c.profile_id,c.status AS call_status
    FROM callcommand_msp_call_contexts x
    JOIN callcommand_calls c ON c.tenant_id=x.tenant_id AND c.id=x.call_id
    WHERE x.provider_call_id=${providerCallId} AND x.call_id=${callId}
    LIMIT 1
  `);
  if (!result.rows[0]) throw new CallCommandMspError('Call context was not found', 'CALLCOMMAND_CONTEXT_NOT_FOUND', 404);
  return result.rows[0] as MspRow;
}

function supportLinkGather(callId: string, prompt: string): string {
  const action = publicAction('/v1/modules/callcommand-ai/webhooks/twilio/voice/support-link', callId);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="10" timeout="8" action="${xml(action)}" method="POST"><Say>${xml(prompt)}</Say></Gather><Redirect method="POST">${xml(action)}</Redirect></Response>`;
}

function intentGather(callId: string, firstName?: string | null): string {
  const action = publicAction('/v1/modules/callcommand-ai/webhooks/twilio/voice/intent', callId);
  const greeting = firstName ? `Thank you, ${firstName}.` : 'Thank you.';
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" timeout="8" action="${xml(action)}" method="POST"><Say>${xml(`${greeting} Briefly describe the issue. Do not say a password or verification code.`)}</Say></Gather><Say>We did not receive a description. Please call again or remain on the line for support.</Say></Response>`;
}

async function auditMutation(request: FastifyRequest, action: string, targetType: string, targetId: string | null, after: MspRow) {
  await writeAudit({
    actorUserId: actor(request), tenantId: tenant(request), action, targetType, targetId,
    after, ipAddress: request.ip, extra: { module: MODULE_SLUG, contract: CALLCOMMAND_MSP_CONTRACT, requestId: request.id },
  }, request);
}

async function assertDirectoryOrganization(tenantId: string, organizationId: string): Promise<MspRow> {
  const result = await db.execute(sql`SELECT * FROM directory_organizations WHERE tenant_id=${tenantId} AND id=${organizationId} AND status='active' AND archived_at IS NULL LIMIT 1`);
  if (!result.rows[0]) throw new CallCommandMspError('Organization was not found', 'CALLCOMMAND_ORGANIZATION_NOT_FOUND', 404);
  return result.rows[0] as MspRow;
}

async function assertDirectoryContact(tenantId: string, contactId: string): Promise<MspRow> {
  const result = await db.execute(sql`SELECT * FROM directory_contacts WHERE tenant_id=${tenantId} AND id=${contactId} AND status='active' AND archived_at IS NULL LIMIT 1`);
  if (!result.rows[0]) throw new CallCommandMspError('Contact was not found', 'CALLCOMMAND_CONTACT_NOT_FOUND', 404);
  return result.rows[0] as MspRow;
}

export async function registerCallCommandMspRoutes(app: FastifyInstance) {
  app.get(`${base}/workspace`, { preHandler: reads }, async (request) => {
    const tenantId = tenant(request);
    const [settings, organizations, directoryContacts, trustedLines, contacts, supportLinks, integrations, actionCatalog, activeCalls, cases, outbox, auditEvents] = await Promise.all([
      db.execute(sql`SELECT * FROM callcommand_msp_settings WHERE tenant_id=${tenantId}`),
      db.execute(sql`
        SELECT o.id,o.name,o.type,o.status,p.id AS profile_id,p.support_tier,p.support_contract_status,p.automation_mode,p.incident_mode,p.bms_account_external_id,p.policy_template,p.status AS profile_status,p.version,p.updated_at
        FROM directory_organizations o LEFT JOIN callcommand_organization_profiles p ON p.tenant_id=o.tenant_id AND p.organization_id=o.id
        WHERE o.tenant_id=${tenantId} AND o.archived_at IS NULL ORDER BY o.name LIMIT 500
      `),
      db.execute(sql`SELECT id,first_name,last_name,email,title,status FROM directory_contacts WHERE tenant_id=${tenantId} AND archived_at IS NULL ORDER BY first_name,last_name LIMIT 500`),
      db.execute(sql`
        SELECT id,organization_id,site_id,display_last4,line_type,trust_mode,verified_at,
          verification_method,cooldown_until,status,version,created_at,updated_at
        FROM callcommand_trusted_originating_lines
        WHERE tenant_id=${tenantId} ORDER BY updated_at DESC LIMIT 500
      `),
      db.execute(sql`
        SELECT p.*,d.first_name,d.last_name,d.email,d.title,o.name AS organization_name
        FROM callcommand_contact_profiles p JOIN directory_contacts d ON d.tenant_id=p.tenant_id AND d.id=p.contact_id
        JOIN directory_organizations o ON o.tenant_id=p.tenant_id AND o.id=p.organization_id
        WHERE p.tenant_id=${tenantId} ORDER BY o.name,d.first_name,d.last_name LIMIT 500
      `),
      db.execute(sql`SELECT id,organization_id,contact_id,last4,status,issued_at,activated_at,expires_at,locked_until,failed_attempts,replaced_by_id,revoked_at,revoke_reason,created_at,updated_at FROM callcommand_support_links WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 500`),
      db.execute(sql`SELECT id,organization_id,provider_type,label,mode,public_config,schema_fingerprint,status,health_reason_code,last_health_at,last_rotated_at,circuit_open_until,kill_switch,version,updated_at FROM automation_fabric_integrations WHERE tenant_id=${tenantId} ORDER BY provider_type,organization_id NULLS FIRST`),
      db.execute(sql`SELECT * FROM automation_fabric_action_catalog WHERE tenant_id=${tenantId} ORDER BY risk_class,display_name LIMIT 500`),
      db.execute(sql`
        SELECT x.*,o.name AS organization_name,d.first_name,d.last_name,c.phone_masked,lc.reference AS case_reference,lc.priority,lc.bms_sync_status
        FROM callcommand_msp_call_contexts x JOIN callcommand_calls c ON c.tenant_id=x.tenant_id AND c.id=x.call_id
        LEFT JOIN directory_organizations o ON o.tenant_id=x.tenant_id AND o.id=x.organization_id
        LEFT JOIN directory_contacts d ON d.tenant_id=x.tenant_id AND d.id=x.contact_id
        LEFT JOIN callcommand_local_cases lc ON lc.tenant_id=x.tenant_id AND lc.call_context_id=x.id
        WHERE x.tenant_id=${tenantId} AND x.ended_at IS NULL ORDER BY x.updated_at DESC LIMIT 100
      `),
      db.execute(sql`
        SELECT c.*,o.name AS organization_name,d.first_name,d.last_name,l.external_ticket_number,l.sync_status AS ticket_sync_status
        FROM callcommand_local_cases c LEFT JOIN directory_organizations o ON o.tenant_id=c.tenant_id AND o.id=c.organization_id
        LEFT JOIN directory_contacts d ON d.tenant_id=c.tenant_id AND d.id=c.contact_id
        LEFT JOIN callcommand_bms_ticket_links l ON l.tenant_id=c.tenant_id AND l.local_case_id=c.id
        WHERE c.tenant_id=${tenantId} ORDER BY c.updated_at DESC LIMIT 250
      `),
      db.execute(sql`SELECT id,kind,status,attempt_count,max_attempts,next_attempt_at,last_error_code,created_at,updated_at,completed_at FROM callcommand_integration_outbox WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 200`),
      db.execute(sql`SELECT * FROM callcommand_msp_call_events WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 250`),
    ]);
    const configuredSettings = settings.rows[0] as MspRow | undefined;
    return {
      contract: CALLCOMMAND_MSP_CONTRACT,
      phases: [
        { phase: 1, label: 'Paid MSP intake', status: 'ACTIVE_LOCAL', capabilities: ['signed Twilio intake', 'trusted originating lines', 'SupportLink association', 'local case', 'BMS outbox', 'screen-pop', 'hash-linked audit'] },
        { phase: 2, label: 'Read-only device health', status: 'ONBOARDING_GATED' },
        { phase: 3, label: 'Reversible workstation actions', status: 'PROVIDER_GATED' },
        { phase: 4, label: 'Cloud identity reset', status: 'SECURITY_REVIEW_GATED' },
        { phase: 5, label: 'On-premises AD broker', status: 'BROKER_GATED' },
      ],
      settings: configuredSettings ? camelMsp(configuredSettings) : {
        automationMode: 'TICKET_ONLY', incidentMode: false, passwordResetEnabled: false,
        dattoActionsEnabled: false, recordingDefault: 'OFF', transcriptRetentionHours: 24,
        allowedChallengeMethods: ['PASSKEY', 'TOTP', 'PUSH', 'SMS'], policyVersion: 'callcommand-msp-strict-1.0.0', version: 0,
      },
      organizations: organizations.rows.map(row => camelMsp(row as MspRow)),
      directoryContacts: directoryContacts.rows.map(row => camelMsp(row as MspRow)),
      trustedLines: trustedLines.rows.map(row => camelMsp(row as MspRow)),
      contacts: contacts.rows.map(row => camelMsp(row as MspRow)),
      supportLinks: supportLinks.rows.map(row => camelMsp(row as MspRow)),
      integrations: integrations.rows.map(row => camelMsp(row as MspRow)),
      actionCatalog: actionCatalog.rows.map(row => camelMsp(row as MspRow)),
      activeCalls: activeCalls.rows.map(row => camelMsp(row as MspRow)),
      cases: cases.rows.map(row => camelMsp(row as MspRow)),
      outbox: outbox.rows.map(row => camelMsp(row as MspRow)),
      audit: auditEvents.rows.map(row => camelMsp(row as MspRow)),
      readiness: {
        tenantChannel: Number(organizations.rows.length) > 0,
        recognizedOrganization: trustedLines.rows.some((row: any) => row.status === 'ACTIVE'),
        contactAssociation: supportLinks.rows.some((row: any) => row.status === 'ACTIVE'),
        ticketOnlySafeDefault: !configuredSettings || configuredSettings.automation_mode === 'TICKET_ONLY' || configuredSettings.automation_mode === 'MANUAL_ONLY',
      },
    };
  });

  app.patch(`${base}/settings`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request);
      const automationMode = choice(value.automationMode, 'automationMode', ['TICKET_ONLY', 'READ_ONLY', 'STANDARD', 'MANUAL_ONLY'] as const, 'TICKET_ONLY');
      const recordingDefault = choice(value.recordingDefault, 'recordingDefault', ['OFF', 'CONSENT_REQUIRED'] as const, 'OFF');
      const retention = Number(value.transcriptRetentionHours ?? 24);
      if (!Number.isInteger(retention) || retention < 0 || retention > 720) throw new CallCommandMspError('transcriptRetentionHours must be 0-720');
      if ((value.passwordResetEnabled === true || value.dattoActionsEnabled === true) && automationMode === 'TICKET_ONLY') {
        throw new CallCommandMspError('Privileged automation cannot be enabled in ticket-only mode', 'CALLCOMMAND_AUTOMATION_MODE_CONFLICT', 409);
      }
      const result = await db.execute(sql`
        INSERT INTO callcommand_msp_settings(tenant_id,automation_mode,incident_mode,password_reset_enabled,datto_actions_enabled,recording_default,transcript_retention_hours,created_by_user_id,updated_by_user_id)
        VALUES (${tenant(request)},${automationMode},${value.incidentMode === true},FALSE,FALSE,${recordingDefault},${retention},${actor(request)},${actor(request)})
        ON CONFLICT (tenant_id) DO UPDATE SET automation_mode=EXCLUDED.automation_mode,incident_mode=EXCLUDED.incident_mode,
          password_reset_enabled=FALSE,datto_actions_enabled=FALSE,recording_default=EXCLUDED.recording_default,
          transcript_retention_hours=EXCLUDED.transcript_retention_hours,updated_by_user_id=EXCLUDED.updated_by_user_id,
          version=callcommand_msp_settings.version+1,updated_at=NOW()
        RETURNING *
      `);
      const row = camelMsp(result.rows[0] as MspRow);
      await auditMutation(request, 'callcommand_msp.settings.update', 'callcommand_msp_settings', tenant(request), row);
      return row;
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/organizations`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request); const organizationId = requiredUuid(value.organizationId, 'organizationId');
      await assertDirectoryOrganization(tenant(request), organizationId);
      const supportContractStatus = choice(value.supportContractStatus, 'supportContractStatus', ['ACTIVE', 'SUSPENDED', 'EXPIRED'] as const, 'ACTIVE');
      const automationMode = choice(value.automationMode, 'automationMode', ['TICKET_ONLY', 'READ_ONLY', 'STANDARD', 'MANUAL_ONLY'] as const, 'TICKET_ONLY');
      const policyTemplate = choice(value.policyTemplate, 'policyTemplate', ['STANDARD', 'HEALTHCARE_STRICT', 'CUSTOM'] as const, 'STANDARD');
      const status = choice(value.status, 'status', ['ACTIVE', 'INACTIVE', 'PILOT'] as const, 'ACTIVE');
      const result = await db.execute(sql`
        INSERT INTO callcommand_organization_profiles(tenant_id,organization_id,support_tier,support_contract_status,automation_mode,incident_mode,bms_account_external_id,policy_template,status,created_by_user_id,updated_by_user_id)
        VALUES (${tenant(request)},${organizationId},${boundedText(value.supportTier,'supportTier',80,true)},${supportContractStatus},${automationMode},${value.incidentMode === true},${boundedText(value.bmsAccountExternalId,'bmsAccountExternalId',200,true)},${policyTemplate},${status},${actor(request)},${actor(request)})
        ON CONFLICT (tenant_id,organization_id) DO UPDATE SET support_tier=EXCLUDED.support_tier,support_contract_status=EXCLUDED.support_contract_status,
          automation_mode=EXCLUDED.automation_mode,incident_mode=EXCLUDED.incident_mode,bms_account_external_id=EXCLUDED.bms_account_external_id,
          policy_template=EXCLUDED.policy_template,status=EXCLUDED.status,updated_by_user_id=EXCLUDED.updated_by_user_id,
          version=callcommand_organization_profiles.version+1,updated_at=NOW() RETURNING *
      `);
      const row = camelMsp(result.rows[0] as MspRow); await auditMutation(request, 'callcommand_msp.organization.configure', 'organization', organizationId, row);
      return reply.code(201).send(row);
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/trusted-lines`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request); const organizationId = requiredUuid(value.organizationId, 'organizationId');
      await assertDirectoryOrganization(tenant(request), organizationId);
      const line = trustedLineLookupHmac(value.phone);
      const moduleId = await callCommandModuleId();
      const lineType = choice(value.lineType, 'lineType', ['MAIN', 'BRANCH', 'PBX_OUTBOUND', 'DIRECT_DID', 'SIP_TRUNK'] as const, 'MAIN');
      const trustMode = choice(value.trustMode, 'trustMode', ['STRICT', 'RISK_SIGNAL', 'CALLBACK_ONLY'] as const, 'STRICT');
      const result = await db.transaction(async tx => {
        const existing = await tx.execute(sql`SELECT phone_secret_reference_id FROM callcommand_trusted_originating_lines WHERE tenant_id=${tenant(request)} AND lookup_hmac=${line.hmac} LIMIT 1 FOR UPDATE`);
        const secret = await storeEncryptedSecretReference({ tenantId: tenant(request), moduleId, purpose: 'callcommand.trusted-originating-line', reference: line.normalized, actorUserId: actor(request), rotatedFromId: (existing.rows[0] as MspRow | undefined)?.phone_secret_reference_id ?? null }, tx);
        return tx.execute(sql`
          INSERT INTO callcommand_trusted_originating_lines(tenant_id,organization_id,site_id,phone_secret_reference_id,lookup_hmac,display_last4,line_type,trust_mode,allows_automation,status,cooldown_until,risk_flags,created_by_user_id,updated_by_user_id)
          VALUES (${tenant(request)},${organizationId},${optionalUuid(value.siteId,'siteId')},${String((secret as MspRow).id)},${line.hmac},${line.last4},${lineType},${trustMode},FALSE,'PENDING',NOW()+INTERVAL '24 hours','["NEW_LINE_COOLDOWN"]'::jsonb,${actor(request)},${actor(request)})
          ON CONFLICT (tenant_id,lookup_hmac) DO UPDATE SET organization_id=EXCLUDED.organization_id,site_id=EXCLUDED.site_id,
            phone_secret_reference_id=EXCLUDED.phone_secret_reference_id,line_type=EXCLUDED.line_type,trust_mode=EXCLUDED.trust_mode,
            allows_automation=FALSE,status='PENDING',verified_at=NULL,cooldown_until=NOW()+INTERVAL '24 hours',risk_flags='["LINE_ROTATED_COOLDOWN"]'::jsonb,
            updated_by_user_id=EXCLUDED.updated_by_user_id,version=callcommand_trusted_originating_lines.version+1,updated_at=NOW()
          RETURNING id,organization_id,site_id,display_last4,line_type,trust_mode,allows_automation,
            verified_at,verification_method,cooldown_until,risk_flags,status,version,created_at,updated_at
        `);
      });
      const row = camelMsp(result.rows[0] as MspRow); await auditMutation(request, 'callcommand_msp.trusted_line.configure', 'trusted_originating_line', String(row.id), row);
      return reply.code(201).send(row);
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/trusted-lines/:id/verify`, { preHandler: admins }, async (request, reply) => {
    try {
      const lineId = requiredUuid((request.params as MspRow).id, 'id'); const value = body(request);
      const method = choice(value.verificationMethod, 'verificationMethod', ['CARRIER_DOCUMENT', 'PBX_ADMIN_ATTESTATION', 'CALLBACK_TEST', 'SIP_CONFIGURATION_REVIEW'] as const);
      const evidence = boundedText(value.verificationEvidence, 'verificationEvidence', 1_000)!;
      const result = await db.execute(sql`
        UPDATE callcommand_trusted_originating_lines SET status='ACTIVE',verification_method=${method},verification_evidence=${evidence},
          verified_at=NOW(),verified_by_user_id=${actor(request)},allows_automation=${value.allowsAutomation === true},risk_flags='[]'::jsonb,
          updated_by_user_id=${actor(request)},version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${lineId} AND status <> 'REVOKED'
        RETURNING id,organization_id,site_id,display_last4,line_type,trust_mode,allows_automation,
          verified_at,verification_method,cooldown_until,risk_flags,status,version,created_at,updated_at
      `);
      if (!result.rows[0]) throw new CallCommandMspError('Trusted line was not found', 'CALLCOMMAND_TRUSTED_LINE_NOT_FOUND', 404);
      const row = camelMsp(result.rows[0] as MspRow); await auditMutation(request, 'callcommand_msp.trusted_line.verify', 'trusted_originating_line', lineId, { ...row, verificationEvidence: '[RECORDED]' });
      return row;
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${base}/trusted-lines/:id/status`, { preHandler: admins }, async (request, reply) => {
    try {
      const lineId=requiredUuid((request.params as MspRow).id,'id'); const value=body(request);
      const status=choice(value.status,'status',['SUSPENDED','REVOKED'] as const); const reason=boundedText(value.reason,'reason',500)!;
      const result=await db.execute(sql`
        UPDATE callcommand_trusted_originating_lines SET status=${status},allows_automation=FALSE,
          risk_flags=${JSON.stringify([`ADMIN_${status}`])}::jsonb,updated_by_user_id=${actor(request)},
          version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${lineId} AND status <> 'REVOKED'
        RETURNING id,organization_id,site_id,display_last4,line_type,trust_mode,allows_automation,
          verified_at,verification_method,cooldown_until,risk_flags,status,version,created_at,updated_at
      `);
      if(!result.rows[0])throw new CallCommandMspError('Trusted line was not found or is already revoked','CALLCOMMAND_TRUSTED_LINE_NOT_FOUND',404);
      const row=camelMsp(result.rows[0] as MspRow); await auditMutation(request,'callcommand_msp.trusted_line.status','trusted_originating_line',lineId,{...row,reason}); return row;
    }catch(error){return fail(reply,error);}
  });

  app.post(`${base}/contacts`, { preHandler: admins }, async (request, reply) => {
    try {
      const value = body(request); const organizationId = requiredUuid(value.organizationId, 'organizationId'); const contactId = requiredUuid(value.contactId, 'contactId');
      await Promise.all([assertDirectoryOrganization(tenant(request), organizationId), assertDirectoryContact(tenant(request), contactId)]);
      await db.execute(sql`
        INSERT INTO directory_organization_contacts(tenant_id,organization_id,contact_id,role,is_primary,created_by_user_id)
        VALUES (${tenant(request)},${organizationId},${contactId},'CallCommand support contact',FALSE,${actor(request)}) ON CONFLICT (tenant_id,organization_id,contact_id) DO NOTHING
      `);
      const result = await db.execute(sql`
        INSERT INTO callcommand_contact_profiles(tenant_id,organization_id,contact_id,bms_contact_external_id,support_eligible,eligible_for_phone_reset,status,created_by_user_id,updated_by_user_id)
        VALUES (${tenant(request)},${organizationId},${contactId},${boundedText(value.bmsContactExternalId,'bmsContactExternalId',200,true)},${value.supportEligible !== false},FALSE,${choice(value.status,'status',['ACTIVE','INACTIVE','TERMINATED'] as const,'ACTIVE')},${actor(request)},${actor(request)})
        ON CONFLICT (tenant_id,organization_id,contact_id) DO UPDATE SET bms_contact_external_id=EXCLUDED.bms_contact_external_id,
          support_eligible=EXCLUDED.support_eligible,eligible_for_phone_reset=FALSE,status=EXCLUDED.status,updated_by_user_id=EXCLUDED.updated_by_user_id,
          version=callcommand_contact_profiles.version+1,updated_at=NOW() RETURNING *
      `);
      const row=camelMsp(result.rows[0] as MspRow); await auditMutation(request,'callcommand_msp.contact.configure','contact',contactId,row); return reply.code(201).send(row);
    } catch(error){ return fail(reply,error); }
  });

  app.post(`${base}/support-links`, { preHandler: admins }, async (request, reply) => {
    try {
      const value=body(request); const organizationId=requiredUuid(value.organizationId,'organizationId'); const contactId=requiredUuid(value.contactId,'contactId');
      const profile=await db.execute(sql`SELECT * FROM callcommand_contact_profiles WHERE tenant_id=${tenant(request)} AND organization_id=${organizationId} AND contact_id=${contactId} AND status='ACTIVE' LIMIT 1`);
      if(!profile.rows[0]) throw new CallCommandMspError('An active organization contact profile is required','CALLCOMMAND_CONTACT_PROFILE_REQUIRED',409);
      const raw=issueSupportLinkId(); const hmac=supportLinkLookupHmac(raw); const moduleId=await callCommandModuleId();
      const expiresDays=Number(value.expiresInDays ?? 365); if(!Number.isInteger(expiresDays)||expiresDays<1||expiresDays>730) throw new CallCommandMspError('expiresInDays must be 1-730');
      const result=await db.transaction(async tx=>{
        const previous=await tx.execute(sql`SELECT id,secret_reference_id FROM callcommand_support_links WHERE tenant_id=${tenant(request)} AND contact_id=${contactId} AND revoked_at IS NULL FOR UPDATE`);
        const secret=await storeEncryptedSecretReference({tenantId:tenant(request),moduleId,purpose:'callcommand.support-link-id',reference:raw,actorUserId:actor(request),rotatedFromId:(previous.rows[0] as MspRow|undefined)?.secret_reference_id??null},tx);
        if(previous.rows[0]) await tx.execute(sql`UPDATE callcommand_support_links SET status='REPLACED',revoked_at=NOW(),revoke_reason='ROTATED',updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${String((previous.rows[0] as MspRow).id)}`);
        const created=await tx.execute(sql`
          INSERT INTO callcommand_support_links(tenant_id,organization_id,contact_id,secret_reference_id,lookup_hmac,last4,status,issued_at,activated_at,expires_at,issued_by_user_id)
          VALUES (${tenant(request)},${organizationId},${contactId},${String((secret as MspRow).id)},${hmac},${raw.slice(-4)},'ACTIVE',NOW(),NOW(),NOW()+make_interval(days => ${expiresDays}),${actor(request)})
          RETURNING id,organization_id,contact_id,last4,status,issued_at,activated_at,expires_at,
            locked_until,failed_attempts,replaced_by_id,revoked_at,revoke_reason,created_at,updated_at
        `);
        if(previous.rows[0]) await tx.execute(sql`UPDATE callcommand_support_links SET replaced_by_id=${String((created.rows[0] as MspRow).id)} WHERE tenant_id=${tenant(request)} AND id=${String((previous.rows[0] as MspRow).id)}`);
        return created.rows[0] as MspRow;
      });
      const safe=camelMsp(result); await auditMutation(request,'callcommand_msp.support_link.issue','support_link',String(safe.id),{...safe,supportLinkId:'[DISPLAYED_ONCE]'});
      return reply.code(201).send({...safe,supportLinkId:raw,displayOnce:true});
    } catch(error){ return fail(reply,error); }
  });

  app.post(`${base}/support-links/:id/status`, { preHandler: admins }, async (request, reply) => {
    try {
      const supportLinkId=requiredUuid((request.params as MspRow).id,'id'); const value=body(request);
      const status=choice(value.status,'status',['SUSPENDED','REVOKED'] as const); const reason=boundedText(value.reason,'reason',500)!;
      const result=await db.transaction(async tx=>{
        const current=await tx.execute(sql`SELECT secret_reference_id FROM callcommand_support_links WHERE tenant_id=${tenant(request)} AND id=${supportLinkId} AND status NOT IN ('REVOKED','REPLACED','EXPIRED') FOR UPDATE`);
        if(!current.rows[0])throw new CallCommandMspError('SupportLink was not found or is no longer active','CALLCOMMAND_SUPPORT_LINK_NOT_FOUND',404);
        if(status==='REVOKED')await tx.execute(sql`UPDATE shared_secret_references SET revoked_at=COALESCE(revoked_at,NOW()) WHERE tenant_id=${tenant(request)} AND id=${String((current.rows[0] as MspRow).secret_reference_id)}`);
        return tx.execute(sql`
          UPDATE callcommand_support_links SET status=${status},revoked_at=${status==='REVOKED'?new Date():null},
            revoke_reason=${reason},locked_until=NULL,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${supportLinkId}
          RETURNING id,organization_id,contact_id,last4,status,issued_at,activated_at,expires_at,
            locked_until,failed_attempts,replaced_by_id,revoked_at,revoke_reason,created_at,updated_at
        `);
      });
      const row=camelMsp(result.rows[0] as MspRow); await auditMutation(request,'callcommand_msp.support_link.status','support_link',supportLinkId,row); return row;
    }catch(error){return fail(reply,error);}
  });

  app.post(`${base}/integrations`, { preHandler: admins }, async (request, reply) => {
    try {
      const value=body(request); const providerType=choice(value.providerType,'providerType',['BMS','DATTO_RMM','MICROSOFT_GRAPH','AD_BROKER','TWILIO_VERIFY'] as const);
      const mode=choice(value.mode,'mode',['DISABLED','TEST','LIVE'] as const,'DISABLED'); const organizationId=optionalUuid(value.organizationId,'organizationId');
      if(organizationId) await assertDirectoryOrganization(tenant(request),organizationId);
      const publicConfig=value.publicConfig && typeof value.publicConfig==='object'&&!Array.isArray(value.publicConfig)?value.publicConfig as MspRow:{};
      if(Buffer.byteLength(JSON.stringify(publicConfig),'utf8')>12_000) throw new CallCommandMspError('publicConfig is too large');
      if(containsSensitiveConfigurationKey(publicConfig)) throw new CallCommandMspError('Credentials must be supplied only in the sealed credentials field','CALLCOMMAND_PUBLIC_CONFIG_SECRET_REJECTED',400,'publicConfig');
      const schemaDocument=boundedText(value.schemaDocument,'schemaDocument',100_000,true); const schemaFingerprint=schemaDocument?createHash('sha256').update(schemaDocument).digest('hex'):null;
      const credentialsJson=value.credentials && typeof value.credentials==='object'&&!Array.isArray(value.credentials)
        ? JSON.stringify(value.credentials)
        : null;
      if(credentialsJson && Buffer.byteLength(credentialsJson,'utf8')>2_000) throw new CallCommandMspError('Sealed credentials are too large','CALLCOMMAND_INTEGRATION_CREDENTIALS_TOO_LARGE',400,'credentials');
      const testReady=mode==='TEST'&&process.env.APP_ENV==='test';
      const status=mode==='DISABLED'?'BLOCKED':testReady?'READY':'DEGRADED';
      const reason=mode==='DISABLED'?'PROVIDER_DISABLED':testReady?'TEST_ADAPTER_READY':providerType==='BMS'&&!schemaFingerprint?'TENANT_SWAGGER_FINGERPRINT_REQUIRED':'PROVIDER_ACCEPTANCE_REQUIRED';
      const result=await db.transaction(async tx=>{
        let secretReferenceId:string|null=null;
        if(credentialsJson){
          const prior=await tx.execute(sql`SELECT secret_reference_id FROM automation_fabric_integrations WHERE tenant_id=${tenant(request)} AND organization_id IS NOT DISTINCT FROM ${organizationId} AND provider_type=${providerType} LIMIT 1 FOR UPDATE`);
          const secret=await storeEncryptedSecretReference({tenantId:tenant(request),moduleId:await callCommandModuleId(),purpose:`callcommand.integration.${providerType.toLowerCase()}`,reference:credentialsJson,actorUserId:actor(request),rotatedFromId:(prior.rows[0] as MspRow|undefined)?.secret_reference_id??null},tx);
          secretReferenceId=String((secret as MspRow).id);
        }
        return tx.execute(sql`
          INSERT INTO automation_fabric_integrations(tenant_id,organization_id,provider_type,label,mode,public_config,secret_reference_id,schema_fingerprint,status,health_reason_code,last_health_at,last_rotated_at,created_by_user_id,updated_by_user_id)
          VALUES (${tenant(request)},${organizationId},${providerType},${boundedText(value.label,'label',160)},${mode},${JSON.stringify(publicConfig)}::jsonb,${secretReferenceId},${schemaFingerprint},${status},${reason},NOW(),${secretReferenceId?new Date():null},${actor(request)},${actor(request)})
          ON CONFLICT (tenant_id,organization_id,provider_type) DO UPDATE SET label=EXCLUDED.label,mode=EXCLUDED.mode,public_config=EXCLUDED.public_config,
            secret_reference_id=COALESCE(EXCLUDED.secret_reference_id,automation_fabric_integrations.secret_reference_id),schema_fingerprint=COALESCE(EXCLUDED.schema_fingerprint,automation_fabric_integrations.schema_fingerprint),
            status=EXCLUDED.status,health_reason_code=EXCLUDED.health_reason_code,last_health_at=NOW(),last_rotated_at=CASE WHEN EXCLUDED.secret_reference_id IS NULL THEN automation_fabric_integrations.last_rotated_at ELSE NOW() END,
            kill_switch=FALSE,updated_by_user_id=EXCLUDED.updated_by_user_id,version=automation_fabric_integrations.version+1,updated_at=NOW()
          RETURNING id,organization_id,provider_type,label,mode,public_config,schema_fingerprint,status,
            health_reason_code,last_health_at,last_rotated_at,circuit_open_until,kill_switch,version,created_at,updated_at
        `);
      });
      const row=camelMsp(result.rows[0] as MspRow); await auditMutation(request,'callcommand_msp.integration.configure','automation_fabric_integration',String(row.id),row); return reply.code(201).send(row);
    }catch(error){return fail(reply,error);}
  });

  app.post(`${base}/integrations/:id/kill-switch`, { preHandler: admins }, async(request,reply)=>{
    try{
      const integrationId=requiredUuid((request.params as MspRow).id,'id'); const value=body(request); const active=value.active!==false;
      const result=await db.execute(sql`UPDATE automation_fabric_integrations SET kill_switch=${active},status=${active?'BLOCKED':'DEGRADED'},health_reason_code=${active?'KILL_SWITCH_ACTIVE':'REVALIDATION_REQUIRED'},updated_by_user_id=${actor(request)},version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${integrationId}
        RETURNING id,organization_id,provider_type,label,mode,public_config,schema_fingerprint,status,
          health_reason_code,last_health_at,last_rotated_at,circuit_open_until,kill_switch,version,created_at,updated_at`);
      if(!result.rows[0])throw new CallCommandMspError('Integration was not found','CALLCOMMAND_INTEGRATION_NOT_FOUND',404);
      const row=camelMsp(result.rows[0] as MspRow); await auditMutation(request,'callcommand_msp.integration.kill_switch','automation_fabric_integration',integrationId,row); return row;
    }catch(error){return fail(reply,error);}
  });

  app.post(`${base}/action-catalog`, { preHandler: admins }, async(request,reply)=>{
    try{
      const manifest=validateActionManifest(body(request));
      const result=await db.execute(sql`
        INSERT INTO automation_fabric_action_catalog(tenant_id,action_key,display_name,provider,component_uid,component_version,source_commit,risk_class,allowed_device_classes,allowed_operating_systems,minimum_assurance,requires_caller_confirmation,requires_technician_approval,must_be_online,allow_offline_queue,expires_after_seconds,maximum_runtime_seconds,parameter_schema,result_schema,status,created_by_user_id)
        VALUES (${tenant(request)},${manifest.actionKey},${manifest.displayName},${manifest.provider},${manifest.componentUid??null},${manifest.componentVersion},${manifest.sourceCommit},${manifest.riskClass},${JSON.stringify(manifest.allowedDeviceClasses)}::jsonb,${JSON.stringify(manifest.allowedOperatingSystems)}::jsonb,${manifest.minimumAssurance},${manifest.requiresCallerConfirmation},${manifest.requiresTechnicianApproval},${manifest.mustBeOnline},${manifest.allowOfflineQueue},${manifest.expiresAfterSeconds},${manifest.maximumRuntimeSeconds},${JSON.stringify(manifest.parameterSchema)}::jsonb,${manifest.resultSchema},'DRAFT',${actor(request)})
        ON CONFLICT (tenant_id,action_key) DO UPDATE SET display_name=EXCLUDED.display_name,provider=EXCLUDED.provider,component_uid=EXCLUDED.component_uid,component_version=EXCLUDED.component_version,source_commit=EXCLUDED.source_commit,risk_class=EXCLUDED.risk_class,allowed_device_classes=EXCLUDED.allowed_device_classes,allowed_operating_systems=EXCLUDED.allowed_operating_systems,minimum_assurance=EXCLUDED.minimum_assurance,requires_caller_confirmation=EXCLUDED.requires_caller_confirmation,requires_technician_approval=EXCLUDED.requires_technician_approval,must_be_online=EXCLUDED.must_be_online,allow_offline_queue=EXCLUDED.allow_offline_queue,expires_after_seconds=EXCLUDED.expires_after_seconds,maximum_runtime_seconds=EXCLUDED.maximum_runtime_seconds,parameter_schema=EXCLUDED.parameter_schema,result_schema=EXCLUDED.result_schema,status='DRAFT',approved_by_user_id=NULL,approved_at=NULL,version=automation_fabric_action_catalog.version+1,updated_at=NOW() RETURNING *
      `);
      const row=camelMsp(result.rows[0] as MspRow); await auditMutation(request,'callcommand_msp.action_catalog.draft','automation_fabric_action',String(row.id),row); return reply.code(201).send(row);
    }catch(error){return fail(reply,error);}
  });

  app.post(`${base}/policy/evaluate`, { preHandler: writes }, async(request,reply)=>{
    try{
      const value=body(request); const input=value as PolicyInput; const result=evaluateMspPolicy(input);
      return {contract:CALLCOMMAND_MSP_CONTRACT,result,providerActionConfirmed:false};
    }catch(error){return fail(reply,error);}
  });

  app.post(`${base}/simulate/intake`, { preHandler: writes }, async(request,reply)=>{
    try{
      const value=body(request); const organizationId=requiredUuid(value.organizationId,'organizationId'); const contactId=requiredUuid(value.contactId,'contactId');
      const [org,contact]=await Promise.all([assertDirectoryOrganization(tenant(request),organizationId),assertDirectoryContact(tenant(request),contactId)]);
      const configured=await db.execute(sql`SELECT c.*,p.id AS resolved_profile_id FROM callcommand_channels c JOIN callcommand_profiles p ON p.tenant_id=c.tenant_id AND p.id=c.profile_id WHERE c.tenant_id=${tenant(request)} AND c.status='active' AND c.deleted_at IS NULL ORDER BY c.updated_at DESC LIMIT 1`);
      if(!configured.rows[0])throw new CallCommandMspError('An active CallCommand channel and profile are required','CALLCOMMAND_CHANNEL_REQUIRED',409);
      const channel=configured.rows[0] as MspRow; const syntheticPhone='+15550000000'; const key=`msp-simulator:${request.id}`;
      const call=await db.execute(sql`INSERT INTO callcommand_calls(tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,direction,purpose,provider,status,idempotency_key,recording_status) VALUES (${tenant(request)},${actor(request)},${channel.id},${channel.resolved_profile_id},${phoneFingerprint(syntheticPhone)},'simulator',${syntheticPhone},'inbound','support','simulator','in_progress',${key},'disabled') RETURNING *`);
      const context=await db.execute(sql`INSERT INTO callcommand_msp_call_contexts(tenant_id,call_id,organization_id,contact_id,provider_call_id,state,assurance_level) VALUES (${tenant(request)},${String((call.rows[0] as MspRow).id)},${organizationId},${contactId},${`SIM-${request.id}`},'INTENT_CAPTURED','A1') RETURNING *`);
      const contextId=String((context.rows[0] as MspRow).id); const suggestion=classifyMspIntake(value.description); const localCase=await createLocalCase({tenantId:tenant(request),callContextId:contextId,organizationId,contactId,suggestion});
      await appendMspCallEvent({tenantId:tenant(request),callContextId:contextId,eventType:'simulator.intake.completed',actorType:'TECHNICIAN',actorId:actor(request),outcome:'LOCAL_CASE_CREATED',evidence:{intent:suggestion.intent,organizationName:String(org.name),contactName:String(contact.first_name)}});
      await db.execute(sql`UPDATE callcommand_msp_call_contexts SET state='LOCAL_CASE_CREATED',intent=${suggestion.intent},intent_confidence=${suggestion.confidence},requested_action_hint=${suggestion.requestedActionHint},updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${contextId}`);
      const bms=await queueBmsTicket({tenantId:tenant(request),callContextId:contextId,localCaseId:String(localCase.id),organizationId,contactId});
      await transitionMspCall({tenantId:tenant(request),callContextId:contextId,to:'BMS_TICKET_QUEUED',eventType:'bms.ticket.outbox',actorType:'SYSTEM',outcome:bms.status,evidence:{providerActionConfirmed:bms.status==='TEST_RECORDED'}});
      return reply.code(201).send({case:camelMsp(localCase),suggestion,bms:{status:bms.status,providerActionConfirmed:bms.status==='TEST_RECORDED'}});
    }catch(error){return fail(reply,error);}
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/voice/inbound', async(request,reply)=>{
    try{
      const value=await signedTwilio(request); const sid=parseTwilioCallSid(value.CallSid); const to=normalizeE164(value.To,'To'); const from=normalizeE164(value.From,'From');
      const configured=await db.execute(sql`
        SELECT c.*,p.id AS resolved_profile_id FROM callcommand_channels c JOIN callcommand_profiles p ON p.tenant_id=c.tenant_id AND p.id=c.profile_id
        WHERE c.phone_e164=${to} AND c.status='active' AND c.deleted_at IS NULL AND c.product_mode='msp' LIMIT 1
      `);
      if(!configured.rows[0])return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>This service line is unavailable.</Say><Hangup/></Response>');
      const channel=configured.rows[0] as MspRow; const tenantId=String(channel.tenant_id); const key=`twilio-msp:${sid}`;
      const call=await db.execute(sql`
        INSERT INTO callcommand_calls(tenant_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,direction,purpose,provider,provider_call_sid,status,idempotency_key,recording_status)
        VALUES (${tenantId},${channel.id},${channel.resolved_profile_id},${phoneFingerprint(from)},${maskPhone(from)},${from},'inbound','support','twilio',${sid},'in_progress',${key},'disabled')
        ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET updated_at=NOW() RETURNING *
      `);
      const callRow=call.rows[0] as MspRow; const created=await db.execute(sql`
        INSERT INTO callcommand_msp_call_contexts(tenant_id,call_id,provider_call_id,state,assurance_level)
        VALUES (${tenantId},${callRow.id},${sid},'RECEIVED','A0') ON CONFLICT (tenant_id,call_id) DO NOTHING RETURNING *
      `);
      const contextResult=created.rows[0]?created:await db.execute(sql`SELECT * FROM callcommand_msp_call_contexts WHERE tenant_id=${tenantId} AND call_id=${callRow.id}`);
      const context=contextResult.rows[0] as MspRow; const contextId=String(context.id);
      const receipt=await recordMspWebhookReceipt({tenantId,providerCallId:sid,stage:'msp-inbound',payload:value,callId:String(callRow.id)});
      if(receipt.duplicate){
        if(context.organization_id)return sendTwiml(reply,supportLinkGather(String(callRow.id),'Enter your ten digit Support Link I D.'));
        const action=publicAction('/v1/modules/callcommand-ai/webhooks/twilio/voice/unrecognized',String(callRow.id));
        return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" timeout="8" action="${xml(action)}" method="POST"><Say>Press 1 to request a callback, or press 2 for general support.</Say></Gather><Hangup/></Response>`);
      }
      await appendMspCallEvent({tenantId,callContextId:contextId,eventType:'provider.webhook.received',actorType:'PROVIDER',actorId:'twilio',outcome:'RECEIVED',evidence:{signatureVerified:true},correlationIds:{providerCallId:sid,requestId:request.id}});
      await transitionMspCall({tenantId,callContextId:contextId,to:'PROVIDER_VERIFIED',eventType:'provider.signature.verified',actorType:'SYSTEM',evidence:{exactUrlValidated:true}});
      await transitionMspCall({tenantId,callContextId:contextId,to:'TENANT_RESOLVED',eventType:'tenant.resolved.by.exact.to',actorType:'SYSTEM',evidence:{channelId:String(channel.id)}});
      const indexed=trustedLineLookupHmac(from);
      const matched=await db.execute(sql`
        SELECT l.*,o.support_contract_status,o.status AS organization_status FROM callcommand_trusted_originating_lines l
        JOIN callcommand_organization_profiles o ON o.tenant_id=l.tenant_id AND o.organization_id=l.organization_id
        WHERE l.tenant_id=${tenantId} AND l.lookup_hmac=${indexed.hmac} AND l.status='ACTIVE' AND o.status IN ('ACTIVE','PILOT') AND o.support_contract_status='ACTIVE' LIMIT 1
      `);
      await transitionMspCall({tenantId,callContextId:contextId,to:'ORIGINATING_LINE_EVALUATED',eventType:'originating_line.evaluated',actorType:'SYSTEM',evidence:{matched:Boolean(matched.rows[0]),last4:indexed.last4}});
      if(!matched.rows[0]){
        await transitionMspCall({tenantId,callContextId:contextId,to:'UNRECOGNIZED_LINE',eventType:'originating_line.unrecognized',actorType:'SYSTEM',riskFlags:['UNRECOGNIZED_ORIGINATING_LINE'],evidence:{automationEligible:false}});
        const action=publicAction('/v1/modules/callcommand-ai/webhooks/twilio/voice/unrecognized',String(callRow.id));
        return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" timeout="8" action="${xml(action)}" method="POST"><Say>We could not associate this line. Press 1 to request a callback, or press 2 for general support.</Say></Gather><Hangup/></Response>`);
      }
      const line=matched.rows[0] as MspRow;
      await transitionMspCall({tenantId,callContextId:contextId,to:'ORGANIZATION_MATCHED',eventType:'organization.associated',actorType:'SYSTEM',organizationId:String(line.organization_id),originatingLineId:String(line.id),evidence:{organizationDisclosed:false,trustMode:String(line.trust_mode),cooldownComplete:!line.cooldown_until||new Date(line.cooldown_until)<=new Date()}});
      await transitionMspCall({tenantId,callContextId:contextId,to:'SUPPORT_ID_REQUESTED',eventType:'support_link.requested',actorType:'SYSTEM',evidence:{digits:10,checksum:'luhn',spokenBack:false}});
      return sendTwiml(reply,supportLinkGather(String(callRow.id),'Enter your ten digit Support Link I D.'));
    }catch(error){if((error as any)?.statusCode===403)return reply.code(403).send({error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID'});request.log.error({err:error,code:(error as any)?.code},'CallCommand MSP inbound failed');return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>This service is temporarily unavailable. Please contact support directly.</Say><Hangup/></Response>');}
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/voice/support-link',async(request,reply)=>{
    try{
      const value=await signedTwilio(request); const sid=parseTwilioCallSid(value.CallSid); const callId=requiredUuid((request.query as MspRow)?.call_id,'call_id'); const context=await loadPublicContext(sid,callId); const tenantId=String(context.tenant_id); const contextId=String(context.id);
      const receipt=await recordMspWebhookReceipt({tenantId,providerCallId:sid,stage:`support-link-${String(value.SequenceNumber??context.support_link_attempts??0)}`,payload:value,callId});
      if(receipt.duplicate){
        if(context.contact_id){const contact=await db.execute(sql`SELECT first_name FROM directory_contacts WHERE tenant_id=${tenantId} AND id=${context.contact_id}`);return sendTwiml(reply,intentGather(callId,String((contact.rows[0] as MspRow)?.first_name??'')));}
        if(context.state==='LOCKED')return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>We could not verify the information. Please remain on the line for a support callback.</Say></Response>');
        return sendTwiml(reply,supportLinkGather(callId,'That information could not be verified. Re enter your ten digit Support Link I D.'));
      }
      const lineRate=await consumeMspRateLimit({tenantId,scope:'SUPPORT_LINK_LINE',subjectHmac:String(context.phone_fingerprint),limit:10,windowSeconds:900,blockSeconds:900});
      let normalized:string|null=null; try{normalized=normalizeSupportLinkId(value.Digits);}catch{normalized=null;}
      const attempts=Number(context.support_link_attempts??0)+1;
      let link:MspRow|undefined;
      if(normalized){
        const idRate=await consumeMspRateLimit({tenantId,scope:'SUPPORT_LINK_ID',subjectHmac:supportLinkLookupHmac(normalized),limit:5,windowSeconds:900,blockSeconds:900});
        if(idRate.allowed&&lineRate.allowed){const found=await db.execute(sql`
          SELECT l.*,p.support_eligible,p.status AS contact_profile_status,d.first_name,d.status AS directory_contact_status,d.archived_at
          FROM callcommand_support_links l JOIN callcommand_contact_profiles p ON p.tenant_id=l.tenant_id AND p.organization_id=l.organization_id AND p.contact_id=l.contact_id
          JOIN directory_contacts d ON d.tenant_id=l.tenant_id AND d.id=l.contact_id
          WHERE l.tenant_id=${tenantId} AND l.lookup_hmac=${supportLinkLookupHmac(normalized)} AND l.organization_id=${context.organization_id}
            AND l.status='ACTIVE' AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>NOW()) AND (l.locked_until IS NULL OR l.locked_until<=NOW())
            AND p.status='ACTIVE' AND p.support_eligible=TRUE AND d.status='active' AND d.archived_at IS NULL LIMIT 1
        `);link=found.rows[0] as MspRow|undefined;}
      }
      await db.execute(sql`UPDATE callcommand_msp_call_contexts SET support_link_attempts=${attempts},updated_at=NOW() WHERE tenant_id=${tenantId} AND id=${contextId}`);
      if(!link){
        await appendMspCallEvent({tenantId,callContextId:contextId,eventType:'support_link.validation.failed',actorType:'CALLER',outcome:'INVALID',evidence:{attempt:attempts,formatValid:Boolean(normalized),lineRateAllowed:lineRate.allowed}});
        if(attempts>=3||!lineRate.allowed){await transitionMspCall({tenantId,callContextId:contextId,to:'LOCKED',eventType:'support_link.locked',actorType:'SYSTEM',outcome:'LOCKED',riskFlags:['SUPPORT_LINK_RETRY_LIMIT'],evidence:{attempts}});return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>We could not verify the information. Please remain on the line for a support callback.</Say></Response>');}
        if(context.state==='SUPPORT_ID_REQUESTED')await transitionMspCall({tenantId,callContextId:contextId,to:'SUPPORT_ID_INVALID',eventType:'support_link.invalid',actorType:'SYSTEM',evidence:{attempts}});
        await transitionMspCall({tenantId,callContextId:contextId,to:'SUPPORT_ID_REQUESTED',eventType:'support_link.retry',actorType:'SYSTEM',evidence:{attempts}});
        return sendTwiml(reply,supportLinkGather(callId,'That information could not be verified. Re enter your ten digit Support Link I D.'));
      }
      await db.execute(sql`UPDATE callcommand_support_links SET failed_attempts=0,locked_until=NULL,updated_at=NOW() WHERE tenant_id=${tenantId} AND id=${link.id}`);
      await transitionMspCall({tenantId,callContextId:contextId,to:'CONTACT_ASSOCIATED',eventType:'support_link.verified',actorType:'SYSTEM',contactId:String(link.contact_id),assuranceLevel:'A1',evidence:{supportLinkId:String(link.id),organizationMatch:true,firstFactorOnly:true}});
      return sendTwiml(reply,intentGather(callId,String(link.first_name)));
    }catch(error){if((error as any)?.statusCode===403)return reply.code(403).send({error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID'});return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>We could not verify the information. Please contact support.</Say><Hangup/></Response>');}
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/voice/intent',async(request,reply)=>{
    try{
      const value=await signedTwilio(request);const sid=parseTwilioCallSid(value.CallSid);const callId=requiredUuid((request.query as MspRow)?.call_id,'call_id');const context=await loadPublicContext(sid,callId);const tenantId=String(context.tenant_id);const contextId=String(context.id);
      const receipt=await recordMspWebhookReceipt({tenantId,providerCallId:sid,stage:`intent-${String(value.SequenceNumber??0)}`,payload:value,callId});
      const existing=await db.execute(sql`SELECT * FROM callcommand_local_cases WHERE tenant_id=${tenantId} AND call_context_id=${contextId}`);
      if(receipt.duplicate&&existing.rows[0])return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Your request reference is ${xml(String((existing.rows[0] as MspRow).reference))}. Goodbye.</Say><Hangup/></Response>`);
      const suggestion=classifyMspIntake(value.SpeechResult);await transitionMspCall({tenantId,callContextId:contextId,to:'INTENT_CAPTURED',eventType:'intake.intent.classified',actorType:'SYSTEM',intent:suggestion.intent,intentConfidence:suggestion.confidence,requestedActionHint:suggestion.requestedActionHint,riskFlags:suggestion.securityIndicators,evidence:{confidence:suggestion.confidence,requiresHumanReview:suggestion.requiresHumanReview,rawTranscriptStored:false}});
      const localCase=await createLocalCase({tenantId,callContextId:contextId,organizationId:String(context.organization_id),contactId:String(context.contact_id),suggestion});
      await transitionMspCall({tenantId,callContextId:contextId,to:'LOCAL_CASE_CREATED',eventType:'local_case.created',actorType:'SYSTEM',evidence:{caseId:String(localCase.id),reference:String(localCase.reference)}});
      const bms=await queueBmsTicket({tenantId,callContextId:contextId,localCaseId:String(localCase.id),organizationId:String(context.organization_id),contactId:String(context.contact_id)});
      await transitionMspCall({tenantId,callContextId:contextId,to:'BMS_TICKET_QUEUED',eventType:'bms.ticket.outbox',actorType:'SYSTEM',outcome:bms.status,evidence:{providerActionConfirmed:bms.status==='TEST_RECORDED'}});
      await transitionMspCall({tenantId,callContextId:contextId,to:'COMPLETED',eventType:'intake.completed',actorType:'SYSTEM',evidence:{reference:String(localCase.reference),automationExecuted:false}});
      await db.execute(sql`UPDATE callcommand_calls SET transcript=${redactMspText(value.SpeechResult,1000)},summary=${suggestion.summary},status='completed',completed_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND id=${callId}`);
      return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Your request has been recorded. Your reference is ${xml(String(localCase.reference))}. ${suggestion.requiresHumanReview?'A technician will review it.':''} Goodbye.</Say><Hangup/></Response>`);
    }catch(error){if((error as any)?.statusCode===403)return reply.code(403).send({error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID'});return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>We could not record the request. Please contact support.</Say><Hangup/></Response>');}
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/voice/unrecognized',async(request,reply)=>{
    try{
      const value=await signedTwilio(request);const sid=parseTwilioCallSid(value.CallSid);const callId=requiredUuid((request.query as MspRow)?.call_id,'call_id');const context=await loadPublicContext(sid,callId);const tenantId=String(context.tenant_id);const contextId=String(context.id);
      const receipt=await recordMspWebhookReceipt({tenantId,providerCallId:sid,stage:`unrecognized-${String(value.SequenceNumber??value.Digits??0)}`,payload:value,callId});
      if(receipt.duplicate){
        const existing=await db.execute(sql`SELECT reference FROM callcommand_local_cases WHERE tenant_id=${tenantId} AND call_context_id=${contextId} LIMIT 1`);
        if(existing.rows[0])return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Your callback request reference is ${xml(String((existing.rows[0] as MspRow).reference))}. Goodbye.</Say><Hangup/></Response>`);
        return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>No automated action was taken. Please contact your managed service provider.</Say><Hangup/></Response>');
      }
      if(value.Digits==='1'){
        await transitionMspCall({tenantId,callContextId:contextId,to:'CALLBACK_REQUESTED',eventType:'callback.requested',actorType:'CALLER',evidence:{automationEligible:false}});
        const suggestion=classifyMspIntake('Human support callback requested from an unrecognized originating line.');
        const localCase=await createLocalCase({tenantId,callContextId:contextId,suggestion});
        await transitionMspCall({tenantId,callContextId:contextId,to:'LOCAL_CASE_CREATED',eventType:'callback.local_case.created',actorType:'SYSTEM',evidence:{caseId:String(localCase.id),unrecognizedLine:true}});
        await transitionMspCall({tenantId,callContextId:contextId,to:'COMPLETED',eventType:'callback.intake.completed',actorType:'SYSTEM',evidence:{reference:String(localCase.reference),automationExecuted:false,bmsQueued:false}});
        return sendTwiml(reply,`<?xml version="1.0" encoding="UTF-8"?><Response><Say>A callback request was recorded. Your reference is ${xml(String(localCase.reference))}. Goodbye.</Say><Hangup/></Response>`);
      }
      await transitionMspCall({tenantId,callContextId:contextId,to:'TRANSFERRED',eventType:'general_support.requested',actorType:'CALLER',evidence:{providerTransferConfirmed:false,manualFollowUpRequired:true}});
      return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please contact your managed service provider using the number in your support agreement. No automated action was taken.</Say><Hangup/></Response>');
    }catch(error){if((error as any)?.statusCode===403)return reply.code(403).send({error:'Invalid signature',code:'CALLCOMMAND_SIGNATURE_INVALID'});return sendTwiml(reply,'<?xml version="1.0" encoding="UTF-8"?><Response><Say>This request is unavailable.</Say><Hangup/></Response>');}
  });
}
