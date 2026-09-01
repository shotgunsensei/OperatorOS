process.env.SESSION_SECRET ||= 'operatoros-callcommand-phase35-realtime-handoff-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.TWILIO_ACCOUNT_SID = `AC${'2'.repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = 'phase35realtimehandoffauthtoken123456';
process.env.TWILIO_FROM_NUMBER = '+15550109998';
process.env.TWILIO_PUBLIC_BASE_URL = 'https://voice.operatoros.test';
process.env.OPENAI_API_KEY = 'sk-proj-callcommand-realtime-handoff-test';
process.env.OPENAI_PROJECT_ID = 'proj_OperatorOSRealtimeTest';
process.env.OPENAI_WEBHOOK_SECRET = 'whsec_callcommand_realtime_handoff_test';
process.env.CALLCOMMAND_SIP_ROUTE_SECRET = 'callcommand-realtime-route-secret-for-handoff-tests';
process.env.CALLCOMMAND_REALTIME_MODEL = 'gpt-realtime-2.1-mini';

import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules } from '../src/schema.js';
import { clearTelephonyCache } from '../src/lib/telephony.js';
import { storeEncryptedSecretReference } from '../src/lib/shared-secret-vault.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';

type User = Awaited<ReturnType<typeof createTestUser>>;
type Row = Record<string, any>;

const PUBLIC_BASE = process.env.TWILIO_PUBLIC_BASE_URL!;
const INCOMING_PATH = '/v1/modules/callcommand-ai/twilio/voice/incoming';
const PHONE_SEED = randomInt(100_000, 899_990);
const phone = (offset: number) => `+1555${String(PHONE_SEED + offset).padStart(7, '0')}`;
const SID_SEED = randomBytes(16).toString('hex');
const callSid = (marker: string) => `CA${SID_SEED.slice(0, 31)}${marker}`;
const SIP_DESTINATION = 'sip:proj_OperatorOSRealtimeTest@sip.api.openai.com;transport=tls';

let app: ReturnType<typeof Fastify>;
let owner: User;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let profileId = '';
let flowId = '';
let consentChannelId = '';
let flowlessChannelId = '';
let incompatibleLiveChannelId = '';
let incompatibleAfterHoursChannelId = '';
let telephonyAccountId = '';

function sign(path: string, payload: Record<string, string>) {
  let signed = `${PUBLIC_BASE}${path}`;
  for (const key of Object.keys(payload).sort()) signed += key + payload[key];
  return createHmac('sha1', process.env.TWILIO_AUTH_TOKEN!).update(signed).digest('base64');
}

async function injectSigned(path: string, payload: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: path,
    headers: {
      'x-twilio-signature': sign(path, payload),
      'content-type': 'application/json',
    },
    payload,
  });
}

async function createChannel(input: {
  phone: string;
  activeFlowId?: string | null;
  liveBehavior: 'ai_receptionist' | 'forward_only';
  afterHoursBehavior: 'ai_intake' | 'voicemail';
  businessHours: Record<string, unknown>;
}) {
  const created = await db.execute(sql`
    INSERT INTO callcommand_channels(
      tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,status,
      business_hours,live_behavior,after_hours_behavior,require_recording_consent,profile_id,active_flow_id,
      product_mode,routing_mode,telephony_account_id,acquisition_mode,provider_number_sid,
      provider_number_status,provider_verified_at,health_status,health_checked_at,number_type,lifecycle_state,billing_status
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('realtime-handoff-channel')},${input.phone},'UTC',
      'Consent is required for automated transcription.',FALSE,'active',${JSON.stringify(input.businessHours)}::jsonb,
      ${input.liveBehavior},${input.afterHoursBehavior},FALSE,${profileId},${input.activeFlowId ?? null},'general','general',
      ${telephonyAccountId},'platform_provisioned',${`PN${randomBytes(16).toString('hex')}`},
      'active',NOW(),'healthy',NOW(),'local','ACTIVE','included'
    ) RETURNING id
  `);
  return String(created.rows[0].id);
}

async function callBySid(sid: string): Promise<Row> {
  const result = await db.execute(sql`
    SELECT * FROM callcommand_calls
    WHERE tenant_id=${owner.currentTenantId} AND provider='twilio' AND provider_call_sid=${sid}
    LIMIT 1
  `);
  assert.equal(result.rows.length, 1, `expected one tenant call for ${sid}`);
  return result.rows[0] as Row;
}

async function cleanupTenant(tenantId: string) {
  await db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL operatoros.allow_callcommand_usage_delete='on'`));
    await tx.execute(sql`UPDATE callcommand_calls SET capacity_lease_id=NULL WHERE tenant_id=${tenantId}`);
    for (const table of [
      'callcommand_usage_events', 'callcommand_transfer_logs', 'callcommand_reports', 'callcommand_flow_traces',
      'callcommand_tickets', 'callcommand_leads', 'callcommand_tasks', 'callcommand_action_runs',
      'callcommand_ingestion_events', 'callcommand_live_sessions', 'callcommand_lane_leases',
      'callcommand_events', 'callcommand_followups', 'callcommand_calls', 'callcommand_consents',
      'callcommand_agent_knowledge', 'callcommand_automation_rules', 'callcommand_transfer_targets',
      'callcommand_channels', 'callcommand_telephony_accounts', 'shared_secret_references',
      'callcommand_flow_versions', 'callcommand_flows',
      'callcommand_capacity_entitlements', 'callcommand_tenant_runtime_settings', 'callcommand_profiles',
      'shared_usage_events', 'shared_activity_events',
    ]) {
      await tx.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${tenantId.replaceAll("'", "''")}'`));
    }
  });
}

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  const [existingModule] = await db.select().from(modules).where(eq(modules.slug, 'callcommand-ai')).limit(1);
  moduleRow = existingModule ?? await createTestModule('callcommand-ai');
  createdModule = !existingModule;
  await db.insert(tenantModules).values({
    tenantId: owner.currentTenantId,
    moduleId: moduleRow.id,
    status: 'enabled',
    source: 'admin',
    allowAllMembers: true,
  });

  const profile = await db.execute(sql`
    INSERT INTO callcommand_profiles(
      tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,product_mode,
      business_name,business_description,recording_policy,transcription_policy
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('realtime-handoff-profile')},'receptionist',
      'Welcome to Realtime Handoff Works.','[]'::jsonb,'active','general','Realtime Handoff Works',
      'Tenant-owned appliance support.','disabled','consent_required'
    ) RETURNING id
  `);
  profileId = String(profile.rows[0].id);

  const flow = await db.execute(sql`
    INSERT INTO callcommand_flows(
      tenant_id,created_by_user_id,name,product_mode,status,active_version,start_node_key
    ) VALUES (${owner.currentTenantId},${owner.id},${uniqueId('realtime-handoff-flow')},'general','active',1,'start')
    RETURNING id
  `);
  flowId = String(flow.rows[0].id);
  await db.execute(sql`
    INSERT INTO callcommand_flow_versions(
      tenant_id,flow_id,version,graph_json,validation_json,published_by_user_id
    ) VALUES (
      ${owner.currentTenantId},${flowId},1,
      ${JSON.stringify({ start: 'start', nodes: [{ key: 'start', type: 'prompt', config: {} }] })}::jsonb,
      '{"valid":true}'::jsonb,${owner.id}
    )
  `);

  const providerAccountSid = `AC${randomBytes(16).toString('hex')}`;
  const secret = await storeEncryptedSecretReference({
    tenantId: owner.currentTenantId,
    moduleId: moduleRow.id,
    purpose: 'callcommand.realtime-handoff-test-credential',
    reference: JSON.stringify({
      provider: 'twilio',
      providerAccountId: providerAccountSid,
      authToken: process.env.TWILIO_AUTH_TOKEN,
    }),
    actorUserId: owner.id,
  });
  const account = await db.execute(sql`
    INSERT INTO callcommand_telephony_accounts(
      tenant_id,created_by_user_id,provider,account_mode,provider_account_sid,
      secret_reference_id,status,health_status,last_health_at,verified_at
    ) VALUES (
      ${owner.currentTenantId},${owner.id},'twilio','platform',${providerAccountSid},
      ${String(secret.id)},'active','healthy',NOW(),NOW()
    ) RETURNING id
  `);
  telephonyAccountId = String(account.rows[0].id);

  consentChannelId = await createChannel({
    phone: phone(1), activeFlowId: flowId, liveBehavior: 'ai_receptionist',
    afterHoursBehavior: 'voicemail', businessHours: { always: true },
  });
  flowlessChannelId = await createChannel({
    phone: phone(2), activeFlowId: null, liveBehavior: 'ai_receptionist',
    afterHoursBehavior: 'voicemail', businessHours: { always: true },
  });
  incompatibleLiveChannelId = await createChannel({
    phone: phone(3), activeFlowId: flowId, liveBehavior: 'forward_only',
    afterHoursBehavior: 'voicemail', businessHours: { always: true },
  });
  incompatibleAfterHoursChannelId = await createChannel({
    phone: phone(4), activeFlowId: flowId, liveBehavior: 'ai_receptionist',
    afterHoursBehavior: 'voicemail', businessHours: { always: false },
  });
  assert.ok(consentChannelId && flowlessChannelId && incompatibleLiveChannelId && incompatibleAfterHoursChannelId);

  await db.execute(sql`
    INSERT INTO callcommand_tenant_runtime_settings(
      tenant_id,overflow_policy,default_lease_seconds,maximum_lease_seconds,realtime_enabled
    ) VALUES (${owner.currentTenantId},'refuse',120,600,TRUE)
  `);
  await db.execute(sql`
    INSERT INTO callcommand_capacity_entitlements(
      tenant_id,base_lanes,additional_lanes,pending_additional_lanes,billing_status
    ) VALUES (${owner.currentTenantId},5,0,0,'inactive')
  `);

  clearTelephonyCache();
  app = Fastify();
  const { registerCallCommandPhase35Routes } = await import('../src/routes/callcommand-phase35-routes.js');
  await registerCallCommandPhase35Routes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (owner) await cleanupTenant(owner.currentTenantId);
  if (owner) await db.delete(tenantModules).where(eq(tenantModules.tenantId, owner.currentTenantId));
  if (owner) await cleanupUser(owner.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('consent-required eligible Realtime call gathers consent before SIP and DTMF consent creates tenant evidence before handoff', async () => {
  const sid = callSid('a');
  const incoming = await injectSigned(INCOMING_PATH, { CallSid: sid, From: phone(50), To: phone(1) });
  assert.equal(incoming.statusCode, 200, incoming.body);
  assert.match(incoming.body, /<Gather input="dtmf"/);
  assert.match(incoming.body, /Press 1 to consent/i);
  assert.doesNotMatch(incoming.body, /sip\.api\.openai\.com/i, 'SIP must not be emitted before required consent');

  const call = await callBySid(sid);
  assert.equal(call.channel_id, consentChannelId);
  assert.equal(call.recording_status, 'disabled', 'recording-disabled calls must not start in pending state');
  assert.equal(call.realtime_status, 'disabled', 'Realtime must not become pending before consent');

  const consentPath = `/v1/modules/callcommand-ai/twilio/voice/consent?call_id=${encodeURIComponent(String(call.id))}`;
  const consent = await injectSigned(consentPath, { CallSid: sid, Digits: '1' });
  assert.equal(consent.statusCode, 200, consent.body);
  assert.match(consent.body, new RegExp(SIP_DESTINATION.replaceAll('.', '\\.')));
  assert.doesNotMatch(consent.body, /<Gather input="speech"/);

  const persisted = await db.execute(sql`
    SELECT c.tenant_id,c.consent_id,c.recording_status,c.realtime_status,
      consent.tenant_id AS consent_tenant_id,consent.phone_fingerprint,consent.phone_e164
    FROM callcommand_calls c
    JOIN callcommand_consents consent ON consent.tenant_id=c.tenant_id AND consent.id=c.consent_id
    WHERE c.tenant_id=${owner.currentTenantId} AND c.id=${call.id}
  `);
  assert.equal(persisted.rows.length, 1, 'successful DTMF consent must persist and bind one consent row');
  assert.equal(persisted.rows[0].tenant_id, owner.currentTenantId);
  assert.equal(persisted.rows[0].consent_tenant_id, owner.currentTenantId);
  assert.ok(persisted.rows[0].consent_id);
  assert.equal(persisted.rows[0].recording_status, 'disabled');
  assert.equal(persisted.rows[0].realtime_status, 'pending');
  assert.equal(persisted.rows[0].phone_e164, phone(50));
});

test('flowless and incompatible live or after-hours configurations never emit OpenAI SIP and recording-disabled calls remain disabled', async () => {
  const cases = [
    { marker: 'b', to: phone(2), channelId: flowlessChannelId, label: 'flowless' },
    { marker: 'c', to: phone(3), channelId: incompatibleLiveChannelId, label: 'incompatible-live' },
    { marker: 'd', to: phone(4), channelId: incompatibleAfterHoursChannelId, label: 'incompatible-after-hours' },
  ];
  for (const item of cases) {
    const sid = callSid(item.marker);
    const response = await injectSigned(INCOMING_PATH, { CallSid: sid, From: phone(60 + item.marker.charCodeAt(0)), To: item.to });
    assert.equal(response.statusCode, 200, `${item.label}: ${response.body}`);
    assert.doesNotMatch(response.body, /sip\.api\.openai\.com/i, `${item.label} configuration must not emit OpenAI SIP`);
    const call = await callBySid(sid);
    assert.equal(call.channel_id, item.channelId);
    assert.equal(call.recording_status, 'disabled', `${item.label} recording-disabled call must not remain pending`);
    assert.notEqual(call.realtime_status, 'pending', `${item.label} call is not eligible for a Realtime handoff`);
  }
});
