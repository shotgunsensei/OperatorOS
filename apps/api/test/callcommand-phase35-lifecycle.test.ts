process.env.SESSION_SECRET ||= 'operatoros-callcommand-phase35-lifecycle-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.TWILIO_ACCOUNT_SID = `AC${'1'.repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = 'phase35-lifecycle-test-auth-token';
process.env.TWILIO_FROM_NUMBER = '+15550109999';
process.env.TWILIO_PUBLIC_BASE_URL = 'https://callcommand-lifecycle.operatoros.test';
process.env.OPENAI_API_KEY = 'sk-proj-callcommand-lifecycle-test';
process.env.OPENAI_PROJECT_ID = 'proj_CallCommandLifecycleTest';
process.env.OPENAI_WEBHOOK_SECRET = 'whsec_callcommand_lifecycle_test';
process.env.CALLCOMMAND_SIP_ROUTE_SECRET = 'callcommand-lifecycle-route-secret-at-least-32-bytes';
process.env.CALLCOMMAND_REALTIME_MODEL = 'gpt-realtime-2.1-mini';

import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess } from '../src/schema.js';
import { clearTelephonyCache } from '../src/lib/telephony.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady, uniqueId } from './_setup.js';

type User = Awaited<ReturnType<typeof createTestUser>>;
type Row = Record<string, any>;
const INCOMING_PATH = '/v1/modules/callcommand-ai/twilio/voice/incoming';
const PHONE_BASE = randomInt(1_000, 9_996);
const GENERAL_PHONE = `+155501${String(PHONE_BASE).padStart(4, '0')}`;
const CONSENT_PHONE = `+155501${String(PHONE_BASE + 1).padStart(4, '0')}`;
const MSP_PHONE = `+155501${String(PHONE_BASE + 2).padStart(4, '0')}`;
const COMMERCIAL_UNREADY_PHONE = `+155501${String(PHONE_BASE + 3).padStart(4, '0')}`;
const SID_SEED = randomBytes(14).toString('hex');
const callSid = (marker: string) => `CA${SID_SEED}${marker.repeat(4)}`;
const INBOUND_SID = callSid('a');
const MSP_SID = callSid('b');
const OVERFLOW_SID = callSid('c');
const CONSENT_SID = callSid('d');
const GATHER_SID = callSid('e');
const COMPLETED_SID = callSid('f');
const MANUAL_END_SID = callSid('g');
const PROVIDER_UNREADY_REALTIME_SID = callSid('h');
let app: ReturnType<typeof Fastify>;
let owner: User;
let ownerB: User;
let profileId = '';
let channelId = '';
let managedChannelId = '';
let consentChannelId = '';
let mspChannelId = '';
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;

function sign(path: string, payload: Record<string, string>) {
  let signed = `${process.env.TWILIO_PUBLIC_BASE_URL!}${path}`;
  for (const key of Object.keys(payload).sort()) signed += key + payload[key];
  return createHmac('sha1', process.env.TWILIO_AUTH_TOKEN!).update(signed).digest('base64');
}

async function injectSigned(path: string, payload: Record<string, string>) {
  return app.inject({
    method: 'POST', url: path,
    headers: { 'x-twilio-signature': sign(path, payload), 'content-type': 'application/json' },
    payload,
  });
}

function authHeaders(user: User = owner) {
  return {
    authorization: `Bearer ${signToken({ userId:user.id,email:user.email,role:user.role,tokenVersion:user.tokenVersion,sessionType:'platform' })}`,
    'x-tenant-id': user.currentTenantId,
  };
}

async function createChannel(input: { phone: string; recording?: boolean; consent?: boolean; productMode?: string; routingMode?: string }) {
  const created = await db.execute(sql`
    INSERT INTO callcommand_channels(
      tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,status,
      business_hours,live_behavior,after_hours_behavior,require_recording_consent,profile_id,product_mode,routing_mode
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('lifecycle-channel')},${input.phone},'UTC','Consent required.',
      ${input.recording === true},'active','{"always":true}'::jsonb,'ai_receptionist','voicemail',${input.consent !== false},
      ${profileId},${input.productMode ?? 'general'},${input.routingMode ?? 'general'}
    ) RETURNING id
  `);
  return String(created.rows[0].id);
}

async function cleanupTenant(tenantId: string) {
  await db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL operatoros.allow_callcommand_usage_delete='on'`));
    await tx.execute(sql`UPDATE callcommand_calls SET capacity_lease_id=NULL WHERE tenant_id=${tenantId}`);
    for (const table of [
      'callcommand_usage_events','callcommand_transfer_logs','callcommand_reports','callcommand_flow_traces',
      'callcommand_tickets','callcommand_leads','callcommand_tasks','callcommand_action_runs','callcommand_ingestion_events',
      'callcommand_automation_rules',
      'callcommand_live_sessions','callcommand_lane_leases','callcommand_events','callcommand_followups','callcommand_calls',
      'callcommand_agent_knowledge','callcommand_capacity_entitlements','callcommand_tenant_runtime_settings',
      'callcommand_number_reconciliation_issues','callcommand_number_orders','callcommand_number_billing_entitlements',
      'callcommand_channels','callcommand_telephony_accounts','shared_secret_references',
      'callcommand_flow_versions','callcommand_flows','callcommand_profiles','shared_usage_events','shared_activity_events',
    ]) await tx.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${tenantId.replaceAll("'", "''")}'`));
  });
}

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  ownerB = await createTestUser();
  const [existingModule] = await db.select().from(modules).where(eq(modules.slug, 'callcommand-ai')).limit(1);
  moduleRow = existingModule ?? await createTestModule('callcommand-ai');
  createdModule = !existingModule;
  await db.insert(tenantModules).values({
    tenantId:owner.currentTenantId,moduleId:moduleRow.id,status:'enabled',source:'admin',allowAllMembers:true,
  });
  await db.insert(tenantModules).values({
    tenantId:ownerB.currentTenantId,moduleId:moduleRow.id,status:'enabled',source:'admin',allowAllMembers:true,
  });
  ({ signToken } = await import('../src/lib/auth.js'));
  const profile = await db.execute(sql`
    INSERT INTO callcommand_profiles(
      tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,product_mode,
      business_name,business_description,advanced_prompt
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('lifecycle-profile')},'receptionist','Welcome to Lifecycle Works.',
      '[{"key":"request","label":"Request"}]'::jsonb,'active','general','Lifecycle Works','Tenant business context','Ask only for service needs.'
    ) RETURNING id
  `);
  profileId = String(profile.rows[0].id);
  await db.execute(sql`
    INSERT INTO callcommand_agent_knowledge(tenant_id,profile_id,created_by_user_id,title,content,priority)
    VALUES (${owner.currentTenantId},${profileId},${owner.id},'Hours','Open weekdays from nine to five.',1)
  `);
  channelId = await createChannel({ phone: GENERAL_PHONE, recording: false, consent: false });
  consentChannelId = await createChannel({ phone: CONSENT_PHONE, recording: true, consent: true });
  mspChannelId = await createChannel({ phone: MSP_PHONE, recording: false, consent: false, productMode: 'msp', routingMode: 'msp' });
  assert.ok(channelId && consentChannelId && mspChannelId);
  await db.execute(sql`
    INSERT INTO callcommand_tenant_runtime_settings(tenant_id,overflow_policy,default_lease_seconds,maximum_lease_seconds)
    VALUES (${owner.currentTenantId},'refuse',120,600)
  `);
  await db.execute(sql`
    INSERT INTO callcommand_capacity_entitlements(
      tenant_id,base_lanes,additional_lanes,pending_additional_lanes,billing_status,current_period_start,current_period_end
    ) VALUES (${owner.currentTenantId},1,4,8,'pending',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days')
  `);
  clearTelephonyCache();
  app = Fastify();
  await app.register(cookie);
  const { registerCallCommandPhase35Routes } = await import('../src/routes/callcommand-phase35-routes.js');
  const { MockCallCommandNumberProvider } = await import('../src/lib/callcommand-number-provider.js');
  const commercialRoutes = await import('../src/routes/callcommand-commercial-routes.js');
  commercialRoutes.__setCallCommandNumberProviderForTests(new MockCallCommandNumberProvider([
    {
      provider: 'twilio', phoneNumber: '+19105550123', friendlyName: '(910) 555-0123',
      isoCountry: 'US', locality: 'Fayetteville', region: 'NC', postalCode: '28301', numberType: 'local',
      addressRequirement: 'none', capabilities: { voice: true, sms: true, mms: true, fax: false },
      cost: { pricingModel: 'provider_usage_based', currency: null, monthlyAmount: null, usageAmount: null, quoteRequired: true },
    },
    {
      provider: 'twilio', phoneNumber: '+19105550124', friendlyName: '(910) 555-0124',
      isoCountry: 'US', locality: 'Fayetteville', region: 'NC', postalCode: '28301', numberType: 'local',
      addressRequirement: 'none', capabilities: { voice: true, sms: true, mms: true, fax: false },
      cost: { pricingModel: 'provider_usage_based', currency: null, monthlyAmount: null, usageAmount: null, quoteRequired: true },
    },
    {
      provider: 'twilio', phoneNumber: '+18005550125', friendlyName: '(800) 555-0125',
      isoCountry: 'US', locality: null, region: null, postalCode: null, numberType: 'toll_free',
      addressRequirement: 'none', capabilities: { voice: true, sms: false, mms: false, fax: false },
      cost: { pricingModel: 'provider_usage_based', currency: null, monthlyAmount: null, usageAmount: null, quoteRequired: true },
    },
  ]));
  await registerCallCommandPhase35Routes(app);
  await commercialRoutes.registerCallCommandCommercialRoutes(app);
  await app.ready();
});

after(async () => {
  const commercialRoutes = await import('../src/routes/callcommand-commercial-routes.js');
  commercialRoutes.__setCallCommandNumberProviderForTests(null);
  if (app) await app.close();
  if (owner) await cleanupTenant(owner.currentTenantId);
  if (ownerB) await cleanupTenant(ownerB.currentTenantId);
  if (owner) await db.delete(tenantModules).where(eq(tenantModules.tenantId, owner.currentTenantId));
  if (ownerB) await db.delete(tenantModules).where(eq(tenantModules.tenantId, ownerB.currentTenantId));
  if (owner) await cleanupUser(owner.id);
  if (ownerB) await cleanupUser(ownerB.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('signed inbound is single-write, payload-conflict safe, and excludes MSP-routed channels', async () => {
  const sid = INBOUND_SID;
  const payload = { CallSid: sid, From: '+15550107111', To: GENERAL_PHONE };
  const first = await injectSigned(INCOMING_PATH, payload);
  assert.equal(first.statusCode, 200, first.body);
  assert.match(first.body, /Lifecycle Works/);
  const replay = await injectSigned(INCOMING_PATH, payload);
  assert.equal(replay.statusCode, 200, replay.body);
  const rows = await db.execute(sql`
    SELECT c.id,c.phone_masked,count(s.id)::int AS sessions
    FROM callcommand_calls c JOIN callcommand_live_sessions s ON s.tenant_id=c.tenant_id AND s.call_id=c.id
    WHERE c.tenant_id=${owner.currentTenantId} AND c.provider_call_sid=${sid}
    GROUP BY c.id,c.phone_masked
  `);
  assert.equal(rows.rows.length, 1);
  assert.equal(Number(rows.rows[0].sessions), 1);
  const conflictPayload = { ...payload, From: '+15550107999' };
  const conflict = await injectSigned(INCOMING_PATH, conflictPayload);
  assert.equal(conflict.statusCode, 409, conflict.body);
  assert.equal(conflict.json().code, 'CALLCOMMAND_INGESTION_PAYLOAD_CONFLICT');
  const unchanged = await db.execute(sql`SELECT phone_masked FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND provider_call_sid=${sid}`);
  assert.equal(unchanged.rows[0].phone_masked, rows.rows[0].phone_masked);

  const mspPayload = { CallSid: MSP_SID, From: '+15550107112', To: MSP_PHONE };
  const msp = await injectSigned(INCOMING_PATH, mspPayload);
  assert.equal(msp.statusCode, 200, msp.body);
  assert.match(msp.body, /line is unavailable/i);
  const mspCalls = await db.execute(sql`SELECT id FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND provider_call_sid=${mspPayload.CallSid}`);
  assert.equal(mspCalls.rows.length, 0);
});

test('commercial workspace excludes MSP configuration and cost-bearing routes require explicit confirmation', async () => {
  const workspace = await app.inject({
    method: 'GET',
    url: '/v1/modules/callcommand-ai/product/commercial/workspace',
    headers: authHeaders(),
  });
  assert.equal(workspace.statusCode, 200, workspace.body);
  const channelIds = workspace.json().numbers.map((item: Row) => String(item.id));
  assert.ok(channelIds.includes(channelId));
  assert.ok(!channelIds.includes(mspChannelId));

  const numberPurchase = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/product/commercial/numbers/provision',
    headers: authHeaders(),
    payload: { phone: '+15550108888' },
  });
  assert.equal(numberPurchase.statusCode, 409, numberPurchase.body);
  assert.equal(numberPurchase.json().code, 'CALLCOMMAND_NUMBER_RECURRING_CHARGE_NOT_CONFIRMED');

  const lanePurchase = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/product/commercial/lane-checkout',
    headers: authHeaders(),
    payload: { quantity: 2 },
  });
  assert.equal(lanePurchase.statusCode, 409, lanePurchase.body);
  assert.equal(lanePurchase.json().code, 'CALLCOMMAND_LANE_QUANTITY_NOT_CONFIRMED');

  const activation = await app.inject({
    method: 'PATCH',
    url: '/v1/modules/callcommand-ai/product/commercial/runtime-settings',
    headers: authHeaders(),
    payload: {
      overflowPolicy: 'refuse',
      defaultLeaseSeconds: 120,
      maximumLeaseSeconds: 600,
      realtimeEnabled: true,
      activationChannelId: channelId,
    },
  });
  assert.equal(activation.statusCode, 409, activation.body);
  assert.equal(activation.json().code, 'CALLCOMMAND_CHANNEL_NOT_READY_FOR_LIVE');
  const unchangedRuntime = await db.execute(sql`
    SELECT realtime_enabled FROM callcommand_tenant_runtime_settings WHERE tenant_id=${owner.currentTenantId}
  `);
  assert.equal(unchangedRuntime.rows[0].realtime_enabled, false);
});

test('managed-number search, provisioning, replay, tenant isolation, reconciliation, and safe release scheduling are real', async () => {
  const search = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/product/commercial/numbers/search',
    headers: authHeaders(),
    payload: { country: 'US', numberType: 'local', areaCode: '910', limit: 20 },
  });
  assert.equal(search.statusCode, 200, search.body);
  assert.deepEqual(search.json().numbers.map((number: Row) => number.phoneE164), ['+19105550123', '+19105550124']);
  assert.ok(search.json().numbers.every((number: Row) => number.capabilities.voice === true));

  const raced = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/product/commercial/numbers/provision',
    headers: authHeaders(),
    payload: {
      phone: '+19105550999', numberType: 'local', areaCode: '910', region: 'NC',
      confirmRecurringProviderCharge: true, idempotencyKey: uniqueId('managed-number-race'),
    },
  });
  assert.equal(raced.statusCode, 409, raced.body);
  assert.equal(raced.json().code, 'CALLCOMMAND_NUMBER_INVENTORY_CHANGED');
  assert.equal(raced.json().refreshSearch, true);

  const idempotencyKey = uniqueId('managed-number-provision');
  const payload = {
    phone: '+19105550123', numberType: 'local', areaCode: '910', region: 'NC', locality: 'Fayetteville',
    friendlyName: 'Main CallCommand Line', confirmRecurringProviderCharge: true, idempotencyKey,
  };
  const provisioned = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/product/commercial/numbers/provision',
    headers: authHeaders(), payload,
  });
  assert.equal(provisioned.statusCode, 201, provisioned.body);
  assert.equal(provisioned.json().providerActionConfirmed, true);
  assert.equal(provisioned.json().readyForLiveCalls, true);
  assert.equal(provisioned.json().lifecycleState, 'ACTIVE');
  managedChannelId = String(provisioned.json().channel.id);

  const stored = await db.execute(sql`
    SELECT c.tenant_id,c.profile_id,c.active_flow_id,c.lifecycle_state,c.billing_status,c.number_type,
      a.provider_account_sid,a.secret_reference_id,f.name AS flow_name,v.graph_json
    FROM callcommand_channels c
    JOIN callcommand_telephony_accounts a ON a.tenant_id=c.tenant_id AND a.id=c.telephony_account_id
    JOIN callcommand_flows f ON f.tenant_id=c.tenant_id AND f.id=c.active_flow_id
    JOIN callcommand_flow_versions v ON v.tenant_id=f.tenant_id AND v.flow_id=f.id AND v.version=f.active_version
    WHERE c.tenant_id=${owner.currentTenantId} AND c.id=${managedChannelId}
  `);
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].lifecycle_state, 'ACTIVE');
  assert.equal(stored.rows[0].billing_status, 'included');
  assert.equal(stored.rows[0].number_type, 'local');
  assert.equal(stored.rows[0].flow_name, 'General Reception');
  assert.equal(stored.rows[0].graph_json.nodes[0].type, 'route');
  assert.match(String(stored.rows[0].provider_account_sid), /^AC[0-9a-f]{32}$/);
  assert.match(String(stored.rows[0].secret_reference_id), /^[0-9a-f-]{36}$/);

  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/product/commercial/numbers/provision',
    headers: authHeaders(), payload,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);
  assert.equal(String(replay.json().channel.id), managedChannelId);
  const oneProviderPurchase = await db.execute(sql`
    SELECT count(*)::int AS count FROM callcommand_number_orders
    WHERE tenant_id=${owner.currentTenantId} AND operation_type='provision' AND requested_phone_e164='+19105550123'
  `);
  assert.equal(Number(oneProviderPurchase.rows[0].count), 1);

  const tenantBWorkspace = await app.inject({
    method: 'GET', url: '/v1/modules/callcommand-ai/product/commercial/workspace', headers: authHeaders(ownerB),
  });
  assert.equal(tenantBWorkspace.statusCode, 200, tenantBWorkspace.body);
  assert.equal(tenantBWorkspace.json().numbers.some((number: Row) => String(number.id) === managedChannelId), false);
  const tenantBHealth = await app.inject({
    method: 'POST', url: `/v1/modules/callcommand-ai/product/commercial/numbers/${managedChannelId}/health`,
    headers: authHeaders(ownerB), payload: {},
  });
  assert.equal(tenantBHealth.statusCode, 404, tenantBHealth.body);
  const tenantBRelease = await app.inject({
    method: 'POST', url: `/v1/modules/callcommand-ai/product/commercial/numbers/${managedChannelId}/release`,
    headers: authHeaders(ownerB), payload: { confirmRelease: true, confirmationText: 'RELEASE NUMBER' },
  });
  assert.equal(tenantBRelease.statusCode, 404, tenantBRelease.body);

  const reconciliation = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/product/commercial/numbers/reconcile',
    headers: authHeaders(), payload: { autoRepair: true },
  });
  assert.equal(reconciliation.statusCode, 200, reconciliation.body);
  assert.equal(reconciliation.json().summary.findings, 0);

  const release = await app.inject({
    method: 'POST', url: `/v1/modules/callcommand-ai/product/commercial/numbers/${managedChannelId}/release`,
    headers: authHeaders(), payload: { confirmRelease: true, confirmationText: 'RELEASE NUMBER' },
  });
  assert.equal(release.statusCode, 202, release.body);
  assert.equal(release.json().released, false);
  assert.equal(release.json().providerActionConfirmed, false);
  assert.equal(release.json().lifecycleState, 'RELEASE_PENDING');
  const pending = await db.execute(sql`
    SELECT lifecycle_state,released_at FROM callcommand_channels
    WHERE tenant_id=${owner.currentTenantId} AND id=${managedChannelId}
  `);
  assert.equal(pending.rows[0].lifecycle_state, 'RELEASE_PENDING');
  assert.equal(pending.rows[0].released_at, null);

  const canceled = await app.inject({
    method: 'POST', url: `/v1/modules/callcommand-ai/product/commercial/numbers/${managedChannelId}/release/cancel`,
    headers: authHeaders(), payload: { confirmCancel: true },
  });
  assert.equal(canceled.statusCode, 200, canceled.body);
  assert.equal(canceled.json().canceled, true);

  await db.execute(sql`
    UPDATE callcommand_number_billing_entitlements SET billing_status='grace_period',grace_expires_at=NOW()-INTERVAL '1 minute'
    WHERE tenant_id=${owner.currentTenantId}
  `);
  await db.execute(sql`
    UPDATE callcommand_channels SET billing_status='grace_period',billing_grace_expires_at=NOW()-INTERVAL '1 minute'
    WHERE tenant_id=${owner.currentTenantId} AND id=${managedChannelId}
  `);
  const graceReconciliation = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/product/commercial/numbers/reconcile',
    headers: authHeaders(), payload: { autoRepair: false },
  });
  assert.equal(graceReconciliation.statusCode, 200, graceReconciliation.body);
  assert.equal(graceReconciliation.json().summary.billingNumbersSuspended, 1);
  const suspended = await db.execute(sql`
    SELECT lifecycle_state,billing_status,provider_number_status,released_at
    FROM callcommand_channels WHERE tenant_id=${owner.currentTenantId} AND id=${managedChannelId}
  `);
  assert.equal(suspended.rows[0].lifecycle_state, 'SUSPENDED');
  assert.equal(suspended.rows[0].billing_status, 'suspended');
  assert.equal(suspended.rows[0].provider_number_status, 'active');
  assert.equal(suspended.rows[0].released_at, null);
});

test('profile and channel updates reject cross-product-mode reassignment', async () => {
  const created = await db.execute(sql`
    INSERT INTO callcommand_profiles(
      tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,product_mode
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('lifecycle-msp-profile')},'intake','MSP intake',
      '[]'::jsonb,'active','msp'
    ) RETURNING id
  `);
  const mspProfileId = String(created.rows[0].id);

  const convert = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/callcommand-ai/product/profiles/${mspProfileId}`,
    headers: authHeaders(),
    payload: { productMode: 'general', name: 'Do not convert' },
  });
  assert.equal(convert.statusCode, 409, convert.body);
  assert.equal(convert.json().code, 'CALLCOMMAND_PROFILE_PRODUCT_MODE_IMMUTABLE');

  const crossMode = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/callcommand-ai/product/channels/${channelId}`,
    headers: authHeaders(),
    payload: { profileId: mspProfileId },
  });
  assert.equal(crossMode.statusCode, 409, crossMode.body);
  assert.equal(crossMode.json().code, 'CALLCOMMAND_CHANNEL_PROFILE_MODE_MISMATCH');

  const compatible = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/callcommand-ai/product/channels/${mspChannelId}`,
    headers: authHeaders(),
    payload: { profileId: mspProfileId },
  });
  assert.equal(compatible.statusCode, 200, compatible.body);
  assert.equal(compatible.json().channel.profileId, mspProfileId);

  const provisionWithMspProfile = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/product/commercial/numbers/provision',
    headers: authHeaders(),
    payload: {
      phone: '+15550108881', profileId: mspProfileId,
      confirmRecurringProviderCharge: true, idempotencyKey: uniqueId('msp-profile-provision'),
    },
  });
  assert.equal(provisionWithMspProfile.statusCode, 404, provisionWithMspProfile.body);
  assert.equal(provisionWithMspProfile.json().code, 'CALLCOMMAND_PROFILE_NOT_FOUND');

  const connectWithMspProfile = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/product/commercial/numbers/connect',
    headers: authHeaders(),
    payload: { phone: '+15550108882', profileId: mspProfileId, connectionType: 'forwarding' },
  });
  assert.equal(connectWithMspProfile.statusCode, 404, connectWithMspProfile.body);
  assert.equal(connectWithMspProfile.json().code, 'CALLCOMMAND_PROFILE_NOT_FOUND');

  const healthMspChannel = await app.inject({
    method: 'POST', url: `/v1/modules/callcommand-ai/product/commercial/numbers/${mspChannelId}/health`,
    headers: authHeaders(), payload: {},
  });
  assert.equal(healthMspChannel.statusCode, 404, healthMspChannel.body);
  assert.equal(healthMspChannel.json().code, 'CALLCOMMAND_NUMBER_NOT_FOUND');

  const releaseMspChannel = await app.inject({
    method: 'POST', url: `/v1/modules/callcommand-ai/product/commercial/numbers/${mspChannelId}/release`,
    headers: authHeaders(), payload: { confirmRelease: true, confirmationText: 'RELEASE NUMBER' },
  });
  assert.equal(releaseMspChannel.statusCode, 404, releaseMspChannel.body);
  assert.equal(releaseMspChannel.json().code, 'CALLCOMMAND_PROVIDER_NUMBER_NOT_FOUND');
});

test('BYO connection plans survive an incomplete health check and workspace reload', async () => {
  const connected = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/product/commercial/numbers/connect',
    headers: authHeaders(),
    payload: { phone: '+15550108883', profileId, connectionType: 'sip', friendlyName: 'Lifecycle BYO SIP' },
  });
  assert.equal(connected.statusCode, 201, connected.body);
  const byoChannelId = String(connected.json().channel.id);
  assert.equal(connected.json().connectionPlan.type, 'sip');

  const health = await app.inject({
    method: 'POST',
    url: `/v1/modules/callcommand-ai/product/commercial/numbers/${byoChannelId}/health`,
    headers: authHeaders(), payload: {},
  });
  assert.equal(health.statusCode, 200, health.body);
  assert.equal(health.json().health, 'action_required');

  const workspace = await app.inject({
    method: 'GET', url: '/v1/modules/callcommand-ai/product/commercial/workspace', headers: authHeaders(),
  });
  assert.equal(workspace.statusCode, 200, workspace.body);
  const number = workspace.json().numbers.find((item: Row) => String(item.id) === byoChannelId);
  assert.equal(number.connectionType, 'sip');
  assert.equal(number.connectionPlan.type, 'sip');
  assert.ok(number.connectionPlan.instructions.length > 0);
});

test('commercial alerts are channel-scoped, destination-validated, and repeat-safe', async () => {
  const invalidEmail = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/product/automation-rules',
    headers: authHeaders(),
    payload: { name: 'Invalid email', conditions: { channelId }, actions: [{ actionType: 'email', destination: 'not-an-email' }] },
  });
  assert.equal(invalidEmail.statusCode, 400, invalidEmail.body);
  assert.equal(invalidEmail.json().code, 'CALLCOMMAND_RULE_EMAIL_INVALID');

  const foreignEndpoint = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/product/automation-rules',
    headers: authHeaders(),
    payload: { name: 'Unavailable endpoint', conditions: { channelId }, actions: [{ actionType: 'webhook', endpointId: randomUUID() }] },
  });
  assert.equal(foreignEndpoint.statusCode, 409, foreignEndpoint.body);
  assert.equal(foreignEndpoint.json().code, 'CALLCOMMAND_RULE_ENDPOINT_UNAVAILABLE');

  const payload = { actions: [{ actionType: 'email', destination: 'alerts@example.com', subject: 'Call summary' }] };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const saved = await app.inject({
      method: 'PUT',
      url: `/v1/modules/callcommand-ai/product/commercial/channels/${channelId}/alert-rule`,
      headers: authHeaders(), payload,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(saved.json().rule.conditionsJson, { channelId });
  }
  const stored = await db.execute(sql`
    SELECT enabled,conditions_json,actions_json,count(*) OVER ()::int AS count
    FROM callcommand_automation_rules
    WHERE tenant_id=${owner.currentTenantId} AND managed_key=${`commercial_channel_alerts:${channelId}`}
  `);
  assert.equal(stored.rows.length, 1);
  assert.equal(Number(stored.rows[0].count), 1);
  assert.equal(stored.rows[0].enabled, true);
  assert.deepEqual(stored.rows[0].conditions_json, { channelId });

  const disabled = await app.inject({
    method: 'PUT',
    url: `/v1/modules/callcommand-ai/product/commercial/channels/${channelId}/alert-rule`,
    headers: authHeaders(), payload: { actions: [] },
  });
  assert.equal(disabled.statusCode, 200, disabled.body);
  assert.equal(disabled.json().rule.enabled, false);
});

test('workspace capabilities fail closed for an explicit module viewer grant', async () => {
  await db.insert(tenantUserModuleAccess).values({
    tenantId: owner.currentTenantId,
    userId: owner.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
    grantedByUserId: owner.id,
  });
  try {
    const workspace = await app.inject({
      method: 'GET', url: '/v1/modules/callcommand-ai/product/commercial/workspace', headers: authHeaders(),
    });
    assert.equal(workspace.statusCode, 200, workspace.body);
    assert.deepEqual(workspace.json().capabilities, {
      canWrite: false, canAdmin: false, moduleAccessLevel: 'viewer',
    });
    const blocked = await app.inject({
      method: 'PATCH',
      url: `/v1/modules/callcommand-ai/product/profiles/${profileId}`,
      headers: authHeaders(), payload: { name: 'Viewer must not write' },
    });
    assert.equal(blocked.statusCode, 403, blocked.body);
    assert.equal(blocked.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
  } finally {
    await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, owner.id));
  }
});

test('base lane remains usable while pending extras do not admit an N+1 live call', async () => {
  const active = await db.execute(sql`SELECT c.id,l.status,l.lane_number FROM callcommand_calls c JOIN callcommand_lane_leases l ON l.tenant_id=c.tenant_id AND l.call_id=c.id WHERE c.tenant_id=${owner.currentTenantId} AND c.provider_call_sid=${INBOUND_SID}`);
  assert.equal(active.rows[0].status, 'active');
  assert.equal(Number(active.rows[0].lane_number), 1);
  const overflowSid = OVERFLOW_SID;
  const overflow = await injectSigned(INCOMING_PATH, { CallSid: overflowSid, From: '+15550107113', To: GENERAL_PHONE });
  assert.equal(overflow.statusCode, 200, overflow.body);
  assert.match(overflow.body, /All live assistants are busy/);
  const lease = await db.execute(sql`SELECT id FROM callcommand_lane_leases WHERE tenant_id=${owner.currentTenantId} AND provider_call_sid=${overflowSid}`);
  assert.equal(lease.rows.length, 0);
});

test('signed terminal status is monotonic, reconciles once, appends one usage event, and releases the lane', async () => {
  const sid = INBOUND_SID;
  const callResult = await db.execute(sql`SELECT id,started_at FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND provider_call_sid=${sid}`);
  const call = callResult.rows[0] as Row;
  const statusPath = `/v1/modules/callcommand-ai/twilio/voice/status?call_id=${encodeURIComponent(String(call.id))}`;
  const payload = {
    CallSid: sid, CallStatus: 'completed', SequenceNumber: '10', CallDuration: '2', Price: '-0.03', PriceUnit: 'USD',
    Timestamp: new Date(Math.max(Date.now() + 2_000, new Date(call.started_at).getTime() + 2_000)).toUTCString(),
  };
  const first = await injectSigned(statusPath, payload);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().reconciled, true);
  const replay = await injectSigned(statusPath, payload);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);
  const settled = await db.execute(sql`SELECT status,provider_sequence,provider_outcome,billable_seconds,telephony_cost_minor,terminal_reconciled_at FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND id=${call.id}`);
  assert.equal(settled.rows[0].status, 'completed');
  assert.equal(Number(settled.rows[0].provider_sequence), 10);
  assert.equal(settled.rows[0].provider_outcome, 'completed');
  assert.equal(Number(settled.rows[0].billable_seconds), 2);
  assert.equal(Number(settled.rows[0].telephony_cost_minor), 3);
  assert.ok(settled.rows[0].terminal_reconciled_at);
  const usage = await db.execute(sql`SELECT id FROM callcommand_usage_events WHERE tenant_id=${owner.currentTenantId} AND call_id=${call.id}`);
  assert.equal(usage.rows.length, 1);
  const released = await db.execute(sql`SELECT status,release_reason FROM callcommand_lane_leases WHERE tenant_id=${owner.currentTenantId} AND call_id=${call.id}`);
  assert.equal(released.rows[0].status, 'released');
  assert.equal(released.rows[0].release_reason, 'terminal_reconciliation');

  const stale = await injectSigned(statusPath, { CallSid: sid, CallStatus: 'ringing', SequenceNumber: '9' });
  assert.equal(stale.statusCode, 409, stale.body);
  const conflictingTerminal = await injectSigned(statusPath, { ...payload, CallStatus: 'failed' });
  assert.equal(conflictingTerminal.statusCode, 409, conflictingTerminal.body);
  const unchanged = await db.execute(sql`SELECT provider_sequence,provider_outcome FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND id=${call.id}`);
  assert.equal(Number(unchanged.rows[0].provider_sequence), 10);
  assert.equal(unchanged.rows[0].provider_outcome, 'completed');
});

test('a provider-managed active line without exact commercial readiness cannot accept a live call', async () => {
  const originalPublicBase = process.env.TWILIO_PUBLIC_BASE_URL;
  try {
    process.env.TWILIO_PUBLIC_BASE_URL = 'https://callcommand-lifecycle.example.test';
    const connected = await app.inject({
      method: 'POST',url: '/v1/modules/callcommand-ai/product/commercial/numbers/connect',headers: authHeaders(),
      payload: { phone: COMMERCIAL_UNREADY_PHONE, profileId, connectionType: 'forwarding', friendlyName: 'Unready managed line' },
    });
    assert.equal(connected.statusCode, 201, connected.body);
    const managedChannelId = String(connected.json().channel.id);
    const graph = {
      start: 'start',
      nodes: [{ key: 'start', type: 'action', config: { actionType: 'task', title: 'Fallback follow-up' } }],
    };
    const createdFlow = await app.inject({
      method: 'POST',url: '/v1/modules/callcommand-ai/product/flows',headers: authHeaders(),
      payload: { name: uniqueId('provider-unready-flow'), productMode: 'general', graph },
    });
    assert.equal(createdFlow.statusCode, 201, createdFlow.body);
    const flowId = String(createdFlow.json().flow.id);
    const published = await app.inject({
      method: 'POST',url: `/v1/modules/callcommand-ai/product/flows/${flowId}/publish`,headers: authHeaders(),payload: {},
    });
    assert.equal(published.statusCode, 200, published.body);
    const activatedByGenericMutation = await app.inject({
      method: 'PATCH',url: `/v1/modules/callcommand-ai/product/channels/${managedChannelId}`,headers: authHeaders(),
      payload: { status: 'active', activeFlowId: flowId },
    });
    assert.equal(activatedByGenericMutation.statusCode, 200, activatedByGenericMutation.body);
    await db.execute(sql`
      UPDATE callcommand_tenant_runtime_settings SET realtime_enabled=TRUE,updated_at=NOW()
      WHERE tenant_id=${owner.currentTenantId}
    `);

    const incoming = await injectSigned(INCOMING_PATH, {
      CallSid: PROVIDER_UNREADY_REALTIME_SID,From: '+15550107118',To: COMMERCIAL_UNREADY_PHONE,
    });
    assert.equal(incoming.statusCode, 200, incoming.body);
    assert.match(incoming.body, /line is unavailable/i);
    assert.match(incoming.body, /<Hangup\s*\/>/);
    assert.doesNotMatch(incoming.body, /<Gather\b|<Sip\b|sip:/i);
    const call = await db.execute(sql`
      SELECT id FROM callcommand_calls
      WHERE tenant_id=${owner.currentTenantId} AND provider_call_sid=${PROVIDER_UNREADY_REALTIME_SID}
    `);
    assert.equal(call.rows.length, 0, 'an unready provider-managed line must fail before call/session/lane creation');
  } finally {
    process.env.TWILIO_PUBLIC_BASE_URL = originalPublicBase;
    await db.execute(sql`
      UPDATE callcommand_tenant_runtime_settings SET realtime_enabled=FALSE,updated_at=NOW()
      WHERE tenant_id=${owner.currentTenantId}
    `);
  }
});

test('consent decline plus gather failure and completion release capacity without leaking compiled instructions', async () => {
  const consentSid = CONSENT_SID;
  const incoming = await injectSigned(INCOMING_PATH, { CallSid: consentSid, From: '+15550107114', To: CONSENT_PHONE });
  assert.equal(incoming.statusCode, 200, incoming.body);
  assert.match(incoming.body, /Press 1 to consent/);
  const consentCall = await db.execute(sql`SELECT id FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND provider_call_sid=${consentSid}`);
  const consentPath = `/v1/modules/callcommand-ai/twilio/voice/consent?call_id=${encodeURIComponent(String(consentCall.rows[0].id))}`;
  const declined = await injectSigned(consentPath, { CallSid: consentSid, Digits: '2' });
  assert.equal(declined.statusCode, 200, declined.body);
  assert.match(declined.body, /Consent was declined/);
  const declinedLease = await db.execute(sql`SELECT status,release_reason FROM callcommand_lane_leases WHERE tenant_id=${owner.currentTenantId} AND call_id=${String(consentCall.rows[0].id)}`);
  assert.equal(declinedLease.rows[0].status, 'released');
  assert.equal(declinedLease.rows[0].release_reason, 'consent_declined');

  const gatherSid = GATHER_SID;
  await injectSigned(INCOMING_PATH, { CallSid: gatherSid, From: '+15550107115', To: GENERAL_PHONE });
  const gatherCall = await db.execute(sql`SELECT id FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND provider_call_sid=${gatherSid}`);
  const gatherPath = `/v1/modules/callcommand-ai/twilio/voice/gather?call_id=${encodeURIComponent(String(gatherCall.rows[0].id))}`;
  const noSpeech = await injectSigned(gatherPath, { CallSid: gatherSid, SpeechResult: '' });
  assert.equal(noSpeech.statusCode, 200, noSpeech.body);
  assert.match(noSpeech.body, /did not receive a response/i);
  const gatherLease = await db.execute(sql`SELECT status,release_reason FROM callcommand_lane_leases WHERE tenant_id=${owner.currentTenantId} AND call_id=${String(gatherCall.rows[0].id)}`);
  assert.equal(gatherLease.rows[0].status, 'released');
  assert.equal(gatherLease.rows[0].release_reason, 'gather_no_response');

  const completedSid = COMPLETED_SID;
  await injectSigned(INCOMING_PATH, { CallSid: completedSid, From: '+15550107116', To: GENERAL_PHONE });
  const completedCall = await db.execute(sql`SELECT id FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND provider_call_sid=${completedSid}`);
  const completedGatherPath = `/v1/modules/callcommand-ai/twilio/voice/gather?call_id=${encodeURIComponent(String(completedCall.rows[0].id))}`;
  const completed = await injectSigned(completedGatherPath, { CallSid: completedSid, SpeechResult: 'I need help scheduling service.' });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.match(completed.body, /recorded and routed/i);
  const completedLease = await db.execute(sql`SELECT status,release_reason FROM callcommand_lane_leases WHERE tenant_id=${owner.currentTenantId} AND call_id=${String(completedCall.rows[0].id)}`);
  assert.equal(completedLease.rows[0].status, 'released');
  assert.equal(completedLease.rows[0].release_reason, 'gather_completed');
  const completedSession = await db.execute(sql`SELECT transcript_tail FROM callcommand_live_sessions WHERE tenant_id=${owner.currentTenantId} AND call_id=${String(completedCall.rows[0].id)}`);
  assert.doesNotMatch(String(completedSession.rows[0].transcript_tail), /OPERATOROS_CALLCOMMAND_COMMERCIAL_V1|Lifecycle Works|Open weekdays/);
});

test('explicit session end is replay-safe and releases the admitted lane', async () => {
  await injectSigned(INCOMING_PATH, { CallSid: MANUAL_END_SID, From: '+15550107117', To: GENERAL_PHONE });
  const sessionResult = await db.execute(sql`
    SELECT s.id,s.call_id FROM callcommand_live_sessions s
    JOIN callcommand_calls c ON c.tenant_id=s.tenant_id AND c.id=s.call_id
    WHERE s.tenant_id=${owner.currentTenantId} AND c.provider_call_sid=${MANUAL_END_SID}
  `);
  const session = sessionResult.rows[0] as Row;
  const path = `/v1/modules/callcommand-ai/product/switchboard/sessions/${session.id}/end`;
  const ended = await app.inject({ method:'POST',url:path,headers:authHeaders(),payload:{} });
  assert.equal(ended.statusCode, 200, ended.body);
  assert.equal(ended.json().duplicate, false);
  const replay = await app.inject({ method:'POST',url:path,headers:authHeaders(),payload:{} });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);
  const lease = await db.execute(sql`SELECT status,release_reason FROM callcommand_lane_leases WHERE tenant_id=${owner.currentTenantId} AND call_id=${String(session.call_id)}`);
  assert.equal(lease.rows[0].status, 'released');
  assert.equal(lease.rows[0].release_reason, 'operator_session_end');
});

test('route contract compiles stored profile knowledge and keeps simulation outside lane admission', () => {
  const route = readFileSync(new URL('../src/routes/callcommand-phase35-routes.ts', import.meta.url), 'utf8');
  assert.match(route, /compiledCallInstructions/);
  assert.match(route, /callcommand_agent_knowledge/);
  assert.match(route, /reconcileCallCommandTerminalUsage/);
  assert.match(route, /operator_session_end/);
  assert.match(route, /<Record maxLength="120"/);
  assert.match(route, /<Dial answerOnBridge="true">/);
  assert.match(route, /<Enqueue>/);
  const simulation = route.slice(route.indexOf("app.post(`${base}/simulate`"), route.indexOf("app.post(`${base}/switchboard/sessions/:id/end`"));
  assert.ok(simulation.length > 0);
  assert.doesNotMatch(simulation, /acquireCallCommandLane|callcommand_lane_leases/);
});
