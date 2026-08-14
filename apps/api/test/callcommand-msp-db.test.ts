process.env.SESSION_SECRET ||= 'operatoros-callcommand-msp-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.TWILIO_AUTH_TOKEN = 'callcommand-msp-twilio-test-token';
process.env.TWILIO_ACCOUNT_SID = `AC${'1'.repeat(32)}`;
process.env.TWILIO_FROM_NUMBER = '+15550109090';
process.env.TWILIO_PUBLIC_BASE_URL = 'https://voice.operatoros.test';
process.env.CALLCOMMAND_ASSOCIATION_INDEX_KEY = 'callcommand-msp-test-association-index-key-2026';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import twilio from 'twilio';
import { db } from '../src/db.js';
import { modules, tenantModules } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

type Row = Record<string, any>;
let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let organizationId = '';
let contactId = '';
let profileId = '';
let channelId = '';
let trustedLineId = '';
let supportLinkId = '';
const twilioNumber = '+15550109090';
const trustedCaller = '+15550109091';
const unknownCaller = '+15550109092';

function headers(user: typeof ownerA, tenantId = user.currentTenantId) {
  return {
    authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
  };
}

function signedHeaders(path: string, payload: Record<string, string>) {
  const signature = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, `${process.env.TWILIO_PUBLIC_BASE_URL}${path}`, payload);
  return { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature };
}

function form(payload: Record<string, string>) {
  return new URLSearchParams(payload).toString();
}

async function cleanupTenant(tenantId: string) {
  for (const table of [
    'callcommand_action_executions','callcommand_action_approvals','callcommand_verification_challenges','callcommand_policy_decisions',
    'callcommand_reset_sessions','callcommand_integration_outbox','callcommand_action_requests','callcommand_bms_ticket_links','callcommand_local_cases',
    'callcommand_msp_call_events','callcommand_msp_rate_limits','callcommand_msp_call_contexts','callcommand_tenant_action_policies',
    'automation_fabric_device_affinities','automation_fabric_devices','automation_fabric_datto_sites','automation_fabric_directory_accounts',
    'automation_fabric_action_catalog','callcommand_verification_methods','callcommand_support_links','callcommand_contact_profiles',
    'callcommand_trusted_originating_lines','automation_fabric_integrations','callcommand_organization_profiles','callcommand_msp_settings',
    'callcommand_live_sessions','callcommand_ingestion_events','callcommand_calls','callcommand_channels','callcommand_profiles',
    'directory_organization_contacts','directory_contacts','directory_organizations','shared_secret_references',
  ]) await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${tenantId}'`));
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'callcommand-ai')).limit(1);
  moduleRow = existing ?? await createTestModule('callcommand-ai'); createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  const org = await db.execute(sql`INSERT INTO directory_organizations(tenant_id,name,normalized_name,type,status,created_by_user_id,updated_by_user_id) VALUES (${ownerA.currentTenantId},'Acme Managed Client','acme managed client','client','active',${ownerA.id},${ownerA.id}) RETURNING id`);
  organizationId = String((org.rows[0] as Row).id);
  const contact = await db.execute(sql`INSERT INTO directory_contacts(tenant_id,first_name,last_name,normalized_name,email,normalized_email,status,created_by_user_id,updated_by_user_id) VALUES (${ownerA.currentTenantId},'Jordan','Lee','jordan lee','jordan@example.test','jordan@example.test','active',${ownerA.id},${ownerA.id}) RETURNING id`);
  contactId = String((contact.rows[0] as Row).id);
  const profile = await db.execute(sql`INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,product_mode) VALUES (${ownerA.currentTenantId},${ownerA.id},'MSP secure intake','receptionist','Thank you for calling managed support.','[]'::jsonb,'active','msp') RETURNING id`);
  profileId = String((profile.rows[0] as Row).id);
  const channel = await db.execute(sql`INSERT INTO callcommand_channels(tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,status,profile_id,product_mode) VALUES (${ownerA.currentTenantId},${ownerA.id},'MSP paid intake',${twilioNumber},'America/New_York','Recording is off for MSP intake.',FALSE,'active',${profileId},'msp') RETURNING id`);
  channelId = String((channel.rows[0] as Row).id);
  app = Fastify(); await app.register(cookie);
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, raw, done) => {
    const parameters = new URLSearchParams(typeof raw === 'string' ? raw : String(raw));
    done(null, Object.fromEntries(parameters.entries()));
  });
  const { registerCallCommandMspRoutes } = await import('../src/routes/callcommand-msp-routes.js');
  await registerCallCommandMspRoutes(app); await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (ownerA) await cleanupTenant(ownerA.currentTenantId);
  if (ownerB) await cleanupTenant(ownerB.currentTenantId);
  if (moduleRow) await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id));
  if (ownerA) await cleanupUser(ownerA.id); if (ownerB) await cleanupUser(ownerB.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('MSP administration is authenticated, tenant-scoped, encrypted and safe by default', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/product/msp/workspace' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const configuredOrg = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/msp/organizations', headers: headers(ownerA), payload: { organizationId, supportTier: 'Managed Support', automationMode: 'TICKET_ONLY', bmsAccountExternalId: 'BMS-ACME-1', policyTemplate: 'STANDARD' } });
  assert.equal(configuredOrg.statusCode, 201, configuredOrg.body);
  const line = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/msp/trusted-lines', headers: headers(ownerA), payload: { organizationId, phone: trustedCaller, lineType: 'MAIN', trustMode: 'STRICT' } });
  assert.equal(line.statusCode, 201, line.body); trustedLineId = line.json().id;
  assert.equal(line.json().phone, undefined); assert.equal(line.json().lookupHmac, undefined); assert.equal(line.json().displayLast4, '9091');
  const verified = await app.inject({ method: 'POST', url: `/v1/modules/callcommand-ai/product/msp/trusted-lines/${trustedLineId}/verify`, headers: headers(ownerA), payload: { verificationMethod: 'CALLBACK_TEST', verificationEvidence: 'Documented provider callback and number ownership review.', allowsAutomation: false } });
  assert.equal(verified.statusCode, 200, verified.body); assert.equal(verified.json().status, 'ACTIVE'); assert.equal(verified.json().allowsAutomation, false);
  const suspendedLine = await app.inject({ method: 'POST', url: `/v1/modules/callcommand-ai/product/msp/trusted-lines/${trustedLineId}/status`, headers: headers(ownerA), payload: { status: 'SUSPENDED', reason: 'Controlled lifecycle test.' } });
  assert.equal(suspendedLine.statusCode, 200, suspendedLine.body); assert.equal(suspendedLine.json().status, 'SUSPENDED'); assert.equal(suspendedLine.json().allowsAutomation, false);
  const reverified = await app.inject({ method: 'POST', url: `/v1/modules/callcommand-ai/product/msp/trusted-lines/${trustedLineId}/verify`, headers: headers(ownerA), payload: { verificationMethod: 'CALLBACK_TEST', verificationEvidence: 'Controlled re-verification after suspension.', allowsAutomation: false } });
  assert.equal(reverified.statusCode, 200, reverified.body); assert.equal(reverified.json().status, 'ACTIVE');
  const mapped = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/msp/contacts', headers: headers(ownerA), payload: { organizationId, contactId, supportEligible: true, bmsContactExternalId: 'BMS-CONTACT-1' } });
  assert.equal(mapped.statusCode, 201, mapped.body); assert.equal(mapped.json().eligibleForPhoneReset, false);
  const issued = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/msp/support-links', headers: headers(ownerA), payload: { organizationId, contactId, expiresInDays: 365 } });
  assert.equal(issued.statusCode, 201, issued.body); assert.match(issued.json().supportLinkId, /^\d{10}$/); assert.equal(issued.json().displayOnce, true);
  const suspendedLink = await app.inject({ method: 'POST', url: `/v1/modules/callcommand-ai/product/msp/support-links/${issued.json().id}/status`, headers: headers(ownerA), payload: { status: 'SUSPENDED', reason: 'Controlled lifecycle test.' } });
  assert.equal(suspendedLink.statusCode, 200, suspendedLink.body); assert.equal(suspendedLink.json().status, 'SUSPENDED');
  const rotated = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/msp/support-links', headers: headers(ownerA), payload: { organizationId, contactId, expiresInDays: 365 } });
  assert.equal(rotated.statusCode, 201, rotated.body); supportLinkId = rotated.json().supportLinkId; assert.match(supportLinkId, /^\d{10}$/); assert.notEqual(supportLinkId, issued.json().supportLinkId);
  const workspace = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/product/msp/workspace', headers: headers(ownerA) });
  assert.equal(workspace.statusCode, 200, workspace.body); assert.equal(workspace.json().supportLinks[0].supportLinkId, undefined); assert.equal(workspace.json().supportLinks[0].secretReferenceId, undefined); assert.equal(workspace.json().supportLinks[0].lookupHmac, undefined); assert.equal(workspace.json().trustedLines[0].phone, undefined); assert.equal(workspace.json().trustedLines[0].phoneSecretReferenceId, undefined); assert.equal(workspace.json().trustedLines[0].lookupHmac, undefined);
  const foreign = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/product/msp/workspace', headers: headers(ownerB) });
  assert.equal(foreign.statusCode, 200, foreign.body); assert.equal(foreign.json().organizations.length, 0); assert.equal(foreign.json().supportLinks.length, 0);
  const settings = await app.inject({ method: 'PATCH', url: '/v1/modules/callcommand-ai/product/msp/settings', headers: headers(ownerA), payload: { automationMode: 'TICKET_ONLY', passwordResetEnabled: true } });
  assert.equal(settings.statusCode, 409, settings.body);
});

test('test-mode BMS integration never implies live provider acceptance', async () => {
  const leaked = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/msp/integrations', headers: headers(ownerA), payload: { providerType: 'BMS', label: 'Invalid public configuration', mode: 'TEST', publicConfig: { apiKey: 'must-not-be-public' } } });
  assert.equal(leaked.statusCode, 400, leaked.body); assert.equal(leaked.json().code, 'CALLCOMMAND_PUBLIC_CONFIG_SECRET_REJECTED');
  const oversized = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/msp/integrations', headers: headers(ownerA), payload: { providerType: 'BMS', label: 'Oversized credentials', mode: 'TEST', credentials: { token: 'x'.repeat(2_100) } } });
  assert.equal(oversized.statusCode, 400, oversized.body); assert.equal(oversized.json().code, 'CALLCOMMAND_INTEGRATION_CREDENTIALS_TOO_LARGE');
  const response = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/msp/integrations', headers: headers(ownerA), payload: { providerType: 'BMS', label: 'BMS deterministic adapter', mode: 'TEST', schemaDocument: '{"openapi":"3.0.0","info":{"title":"accepted test fixture"}}', publicConfig: { region: 'test' }, credentials: { token: 'sealed-test-token' } } });
  assert.equal(response.statusCode, 201, response.body); assert.equal(response.json().status, 'READY'); assert.equal(response.json().healthReasonCode, 'TEST_ADAPTER_READY');
  assert.equal(response.json().credentials, undefined); assert.equal(response.json().secretReferenceId, undefined);
  const workspace = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/product/msp/workspace', headers: headers(ownerA) });
  assert.equal(workspace.statusCode, 200, workspace.body); assert.equal(workspace.json().integrations[0].secretReferenceId, undefined);
});

test('signed recognized call reaches A1 association and creates exactly one local/BMS test ticket', async () => {
  const inboundPath = '/v1/modules/callcommand-ai/webhooks/twilio/voice/inbound';
  const inboundPayload = { CallSid: `CA${'A'.repeat(30)}`, To: twilioNumber, From: trustedCaller };
  const invalid = await app.inject({ method: 'POST', url: inboundPath, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'invalid' }, payload: form(inboundPayload) });
  assert.equal(invalid.statusCode, 403, invalid.body);
  const inbound = await app.inject({ method: 'POST', url: inboundPath, headers: signedHeaders(inboundPath, inboundPayload), payload: form(inboundPayload) });
  assert.equal(inbound.statusCode, 200, inbound.body); assert.match(inbound.body, /ten digit Support Link I D/); assert.doesNotMatch(inbound.body, /Acme Managed Client/);
  const call = await db.execute(sql`SELECT id FROM callcommand_calls WHERE tenant_id=${ownerA.currentTenantId} AND provider_call_sid=${inboundPayload.CallSid}`);
  const callId = String((call.rows[0] as Row).id);
  const linkPath = `/v1/modules/callcommand-ai/webhooks/twilio/voice/support-link?call_id=${callId}`;
  const invalidLinkPayload = { CallSid: inboundPayload.CallSid, Digits: '0000000000', SequenceNumber: 'invalid-replay' };
  const invalidLink = await app.inject({ method: 'POST', url: linkPath, headers: signedHeaders(linkPath, invalidLinkPayload), payload: form(invalidLinkPayload) });
  const invalidReplay = await app.inject({ method: 'POST', url: linkPath, headers: signedHeaders(linkPath, invalidLinkPayload), payload: form(invalidLinkPayload) });
  assert.equal(invalidLink.statusCode, 200, invalidLink.body); assert.equal(invalidReplay.statusCode, 200, invalidReplay.body);
  const attempts = await db.execute(sql`SELECT support_link_attempts FROM callcommand_msp_call_contexts WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${callId}`);
  assert.equal(Number((attempts.rows[0] as Row).support_link_attempts), 1);
  const linkPayload = { CallSid: inboundPayload.CallSid, Digits: supportLinkId, SequenceNumber: '1' };
  const associated = await app.inject({ method: 'POST', url: linkPath, headers: signedHeaders(linkPath, linkPayload), payload: form(linkPayload) });
  assert.equal(associated.statusCode, 200, associated.body); assert.match(associated.body, /Thank you, Jordan/); assert.doesNotMatch(associated.body, new RegExp(supportLinkId));
  const intentPath = `/v1/modules/callcommand-ai/webhooks/twilio/voice/intent?call_id=${callId}`;
  const intentPayload = { CallSid: inboundPayload.CallSid, SpeechResult: 'The office printer spooler is stuck and the user cannot print.', SequenceNumber: '2' };
  const first = await app.inject({ method: 'POST', url: intentPath, headers: signedHeaders(intentPath, intentPayload), payload: form(intentPayload) });
  assert.equal(first.statusCode, 200, first.body); assert.match(first.body, /Your request has been recorded/);
  const replay = await app.inject({ method: 'POST', url: intentPath, headers: signedHeaders(intentPath, intentPayload), payload: form(intentPayload) });
  assert.equal(replay.statusCode, 200, replay.body);
  const contexts = await db.execute(sql`SELECT * FROM callcommand_msp_call_contexts WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${callId}`);
  assert.equal(contexts.rows.length, 1); assert.equal((contexts.rows[0] as Row).assurance_level, 'A1'); assert.equal((contexts.rows[0] as Row).state, 'COMPLETED');
  const cases = await db.execute(sql`SELECT * FROM callcommand_local_cases WHERE tenant_id=${ownerA.currentTenantId} AND call_context_id=${String((contexts.rows[0] as Row).id)}`);
  const links = await db.execute(sql`SELECT * FROM callcommand_bms_ticket_links WHERE tenant_id=${ownerA.currentTenantId} AND local_case_id=${String((cases.rows[0] as Row).id)}`);
  const outbox = await db.execute(sql`SELECT * FROM callcommand_integration_outbox WHERE tenant_id=${ownerA.currentTenantId} AND local_case_id=${String((cases.rows[0] as Row).id)}`);
  assert.equal(cases.rows.length, 1); assert.equal((cases.rows[0] as Row).bms_sync_status, 'TEST_RECORDED'); assert.equal(links.rows.length, 1); assert.equal(outbox.rows.length, 1);
  const events = await db.execute(sql`SELECT sequence,previous_event_hash,event_hash FROM callcommand_msp_call_events WHERE tenant_id=${ownerA.currentTenantId} AND call_context_id=${String((contexts.rows[0] as Row).id)} ORDER BY sequence`);
  assert.ok(events.rows.length >= 10); assert.equal((events.rows[0] as Row).previous_event_hash, null);
  for (let index = 1; index < events.rows.length; index += 1) assert.equal((events.rows[index] as Row).previous_event_hash, (events.rows[index - 1] as Row).event_hash);
});

test('unrecognized callers can request a callback but cannot queue BMS or automation', async () => {
  const inboundPath = '/v1/modules/callcommand-ai/webhooks/twilio/voice/inbound';
  const inboundPayload = { CallSid: `CA${'B'.repeat(30)}`, To: twilioNumber, From: unknownCaller };
  const inbound = await app.inject({ method: 'POST', url: inboundPath, headers: signedHeaders(inboundPath, inboundPayload), payload: form(inboundPayload) });
  assert.equal(inbound.statusCode, 200, inbound.body); assert.match(inbound.body, /could not associate this line/); assert.doesNotMatch(inbound.body, /Support Link/);
  const call = await db.execute(sql`SELECT id FROM callcommand_calls WHERE tenant_id=${ownerA.currentTenantId} AND provider_call_sid=${inboundPayload.CallSid}`); const callId = String((call.rows[0] as Row).id);
  const callbackPath = `/v1/modules/callcommand-ai/webhooks/twilio/voice/unrecognized?call_id=${callId}`; const callbackPayload = { CallSid: inboundPayload.CallSid, Digits: '1', SequenceNumber: '1' };
  const callback = await app.inject({ method: 'POST', url: callbackPath, headers: signedHeaders(callbackPath, callbackPayload), payload: form(callbackPayload) });
  assert.equal(callback.statusCode, 200, callback.body); assert.match(callback.body, /callback request was recorded/i);
  const context = await db.execute(sql`SELECT * FROM callcommand_msp_call_contexts WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${callId}`); assert.equal((context.rows[0] as Row).assurance_level, 'A0');
  const localCase = await db.execute(sql`SELECT * FROM callcommand_local_cases WHERE tenant_id=${ownerA.currentTenantId} AND call_context_id=${String((context.rows[0] as Row).id)}`); assert.equal(localCase.rows.length, 1); assert.equal((localCase.rows[0] as Row).organization_id, null);
  const outbox = await db.execute(sql`SELECT * FROM callcommand_integration_outbox WHERE tenant_id=${ownerA.currentTenantId} AND local_case_id=${String((localCase.rows[0] as Row).id)}`); assert.equal(outbox.rows.length, 0);
});
