process.env.SESSION_SECRET ||= 'operatoros-outcall-phase12b-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.OUTCALL_TEST_ADAPTER = 'enabled';
process.env.TWILIO_ACCOUNT_SID = `AC${'a'.repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = 'outcall-signed-webhook-test-token';
process.env.TWILIO_VERIFY_SERVICE_SID = `VA${'b'.repeat(32)}`;
process.env.TWILIO_PHONE_NUMBER = '+15555550123';
process.env.TWILIO_ALLOWED_COUNTRIES = 'US,CA';
process.env.OUTCALL_PUBLIC_URL = 'https://outcall.operatoros.net';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers, users } from '../src/schema.js';
import { ensureOutCallTables } from '../src/lib/outcall-db-init.js';
import { processSharedJobBatch } from '../src/lib/shared-background-jobs.js';
import {createOutCallResourceFixture,SYNTHETIC_OUTCALL_POLICY} from './outcall-resource-fixture.js';
import {beginOutCallSubmission,reserveOutCallResource} from '../src/lib/outcall-resources.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let signToken: typeof import('../src/lib/auth.js').signToken;
let profileId = '';
let callId = '';
let triggerId = '';
let resourceFixture:Awaited<ReturnType<typeof createOutCallResourceFixture>>;

function signWebhook(path: string, body: Record<string, string>) {
  let data = `https://outcall.operatoros.net${path.replace('/v1/', '/api/')}`;
  for (const key of Object.keys(body).sort()) data += key + body[key];
  return createHmac('sha1', process.env.TWILIO_AUTH_TOKEN!).update(data).digest('base64');
}

function headers(user: typeof ownerA, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

async function cleanTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM outcall_events WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_webhook_receipts WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM outcall_call_requests WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM outcall_triggers WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM outcall_rate_limits WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM outcall_profiles WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM outcall_settings WHERE tenant_id=${tenantId}`);
  await db.execute(sql`
    DELETE FROM outcall_phone_owners p
    WHERE p.user_id IN (SELECT id FROM users WHERE current_tenant_id=${tenantId})
      AND NOT EXISTS (SELECT 1 FROM outcall_settings s WHERE s.phone_fingerprint=p.phone_fingerprint)
  `);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  // Remove only deterministic synthetic consent fixtures from earlier failed
  // runs. This suite must not begin with a leftover STOP from its own tests.
  await db.execute(sql`DELETE FROM operatoros_sms_consent_events WHERE consent_record_id IN
    (SELECT id FROM operatoros_sms_consent_records WHERE phone_e164 IN ('+12025550101','+12025550102'))`);
  await db.execute(sql`DELETE FROM operatoros_sms_consent_records WHERE phone_e164 IN ('+12025550101','+12025550102')`);
  await ensureOutCallTables();
  resourceFixture=await createOutCallResourceFixture();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  // Borrow the catalog row as a live test fixture without changing the
  // production registry contract; cleanupModule restores its coming-soon state.
  moduleRow = await createTestModule('outcall');
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  app = Fastify();
  await app.register(cookie);
  const { registerOutCallRoutes } = await import('../src/routes/outcall-routes.js');
  await registerOutCallRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await resourceFixture?.cleanup();
  if (ownerA && moduleRow) await cleanTenant(ownerA.currentTenantId);
  if (ownerB && moduleRow) await cleanTenant(ownerB.currentTenantId);
  if (moduleRow) {
    await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id));
    await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id));
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('OutCall enforces OperatorOS auth, entitlement, write access, and trusted tenant authority', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/outcall/workspace' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);

  const read = await app.inject({
    method: 'GET', url: '/v1/modules/outcall/workspace',
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(read.statusCode, 200, read.body);
  assert.equal(read.json().safety.arbitraryDestinations, false);

  const denied = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/profiles',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { name: 'Denied', message: 'Please stay on the line.' },
  });
  assert.equal(denied.statusCode, 403, denied.body);

  const override = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/calls',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      tenantId: ownerB.currentTenantId,
      destination: '+12025550101',
      profileId: 'not-used',
      idempotencyKey: crypto.randomUUID(),
    },
  });
  assert.equal(override.statusCode, 400, override.body);
  assert.equal(override.json().code, 'OUTCALL_SERVER_FIELD');
});

test('OutCall persists encrypted onboarding, profile and private trigger without returning secrets', async () => {
  const accepted = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/onboarding/accept-safety',
    headers: headers(ownerA, ownerA.currentTenantId), payload: { accepted: true },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);

  const acceptedOwnerB = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/onboarding/accept-safety',
    headers: headers(ownerB, ownerB.currentTenantId), payload: { accepted: true },
  });
  assert.equal(acceptedOwnerB.statusCode, 200, acceptedOwnerB.body);
  const concurrentOwnerB = await Promise.all([
    app.inject({
      method: 'POST', url: '/v1/modules/outcall/phone-verification',
      headers: headers(ownerB, ownerB.currentTenantId),
      payload: { phone: '+15550001001', verificationCode: '000000' },
    }),
    app.inject({
      method: 'POST', url: '/v1/modules/outcall/phone-verification',
      headers: headers(ownerB, ownerB.currentTenantId),
      payload: { phone: '+15550001002', verificationCode: '000000' },
    }),
  ]);
  assert.deepEqual(concurrentOwnerB.map(response => response.statusCode), [200, 200]);
  const concurrentOwnerRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM outcall_phone_owners WHERE user_id=${ownerB.id}
  `);
  assert.equal(Number(concurrentOwnerRows.rows[0]?.count), 1, 'concurrent first verification must retain one ownership row');

  const verified = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/phone-verification',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { phone: '+12025550101', verificationCode: '000000' },
  });
  assert.equal(verified.statusCode, 200, verified.body);
  assert.equal(verified.json().phoneMasked, '+12\u2022\u2022\u2022\u20220101');

  const foreignOwnership = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/phone-verification',
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { phone: '+12025550101', verificationCode: '000000' },
  });
  assert.equal(foreignOwnership.statusCode, 409, foreignOwnership.body);
  assert.equal(foreignOwnership.json().code, 'OUTCALL_PHONE_OWNERSHIP_CONFLICT');

  const replaced = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/phone-verification',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { phone: '+12025550102', verificationCode: '000000' },
  });
  assert.equal(replaced.statusCode, 200, replaced.body);
  const ownerRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM outcall_phone_owners WHERE user_id=${ownerA.id}
  `);
  assert.equal(Number(ownerRows.rows[0]?.count), 1, 'replaced phone ownership must not remain stale');

  const releasedOwnership = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/phone-verification',
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { phone: '+12025550101', verificationCode: '000000' },
  });
  assert.equal(releasedOwnership.statusCode, 200, releasedOwnership.body);

  const profile = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/profiles',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Neutral exit', message: 'Please stay on the line while I share an update.' },
  });
  assert.equal(profile.statusCode, 201, profile.body);
  profileId = profile.json().profile.id;

  const blocked = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/profiles',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Unsafe', message: 'This is the police. Leave now.' },
  });
  assert.equal(blocked.statusCode, 400, blocked.body);
  assert.equal(blocked.json().code, 'OUTCALL_MESSAGE_POLICY');

  const trigger = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/triggers',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { profileId, phrase: 'Did you feed the cat?', neutralReply: 'Request received.', delaySeconds: 0 },
  });
  assert.equal(trigger.statusCode, 201, trigger.body);
  triggerId = trigger.json().trigger.id;
  assert.doesNotMatch(trigger.body, /feed the cat/i);

  const stored = await db.execute(sql`
    SELECT phone_ciphertext,phrase_ciphertext,phrase_digest
    FROM outcall_settings s JOIN outcall_triggers t
      ON t.tenant_id=s.tenant_id AND t.user_id=s.user_id
    WHERE s.tenant_id=${ownerA.currentTenantId} AND s.user_id=${ownerA.id}
  `);
  assert.match(String(stored.rows[0].phone_ciphertext), /^v1\./);
  assert.match(String(stored.rows[0].phrase_ciphertext), /^v1\./);
  assert.doesNotMatch(String(stored.rows[0].phrase_ciphertext), /feed/i);
  assert.match(String(stored.rows[0].phrase_digest), /^[0-9a-f]{64}$/);
});

test('OutCall schedules only the server-verified destination and records exactly-once test usage', async () => {
  const idempotencyKey = `outcall-${crypto.randomUUID()}`;
  const payload = { profileId, idempotencyKey };
  const first = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/calls',
    headers: headers(ownerA, ownerA.currentTenantId), payload,
  });
  assert.equal(first.statusCode, 201, first.body);
  callId = first.json().call.id;

  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/calls',
    headers: headers(ownerA, ownerA.currentTenantId), payload,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().call.id, callId);
  const conflict = await app.inject({ method: 'POST', url: '/v1/modules/outcall/calls', headers: headers(ownerA, ownerA.currentTenantId), payload: { ...payload, profileId: crypto.randomUUID() } });
  assert.equal(conflict.statusCode, 409, conflict.body);
  assert.equal(conflict.json().code, 'OUTCALL_IDEMPOTENCY_CONFLICT');

  await processSharedJobBatch({ workerId: 'outcall-test', limit: 10 });
  const [call, usage, jobs] = await Promise.all([
    db.execute(sql`SELECT status,provider,destination_masked FROM outcall_call_requests WHERE id=${callId}`),
    db.execute(sql`
      SELECT COUNT(*)::integer AS count FROM shared_usage_events
      WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}
        AND operation='outcall.test_call' AND external_reference=${callId}
    `),
    db.execute(sql`
      SELECT COUNT(*)::integer AS count FROM shared_jobs
      WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}
        AND handler_key='outcall.place_verified_call.v1'
    `),
  ]);
  assert.equal(call.rows[0].status, 'completed');
  assert.equal(call.rows[0].provider, 'test');
  assert.equal(call.rows[0].destination_masked, '+12\u2022\u2022\u2022\u20220102');
  assert.equal(Number(usage.rows[0].count), 1);
  assert.equal(Number(jobs.rows[0].count), 1);

  const foreign = await app.inject({
    method: 'GET', url: '/v1/modules/outcall/workspace',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreign.statusCode, 200, foreign.body);
  assert.equal(foreign.json().calls.length, 0);
  assert.equal(foreign.json().profiles.length, 0);
});

test('OutCall accepts only signed, replay-safe voice and exact-trigger SMS callbacks', async () => {
  const sid = `CA${'c'.repeat(32)}`;
  await db.execute(sql`
    UPDATE outcall_call_requests
    SET provider='twilio',provider_call_sid=${sid},status='processing',completed_at=NULL
    WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id} AND id=${callId}
  `);

  const statusPath = `/v1/modules/outcall/webhooks/twilio/voice/status?request_id=${callId}`;
  const statusBody = { CallSid: sid, CallStatus: 'completed', SequenceNumber: '1' };
  const firstStatus = await app.inject({
    method: 'POST', url: statusPath,
    headers: { 'x-twilio-signature': signWebhook(statusPath, statusBody) },
    payload: statusBody,
  });
  assert.equal(firstStatus.statusCode, 200, firstStatus.body);
  assert.equal(firstStatus.json().duplicate, false);
  const replayStatus = await app.inject({
    method: 'POST', url: statusPath,
    headers: { 'x-twilio-signature': signWebhook(statusPath, statusBody) },
    payload: statusBody,
  });
  assert.equal(replayStatus.statusCode, 200, replayStatus.body);
  assert.equal(replayStatus.json().duplicate, true);

  const forged = await app.inject({
    method: 'POST', url: statusPath,
    headers: { 'x-twilio-signature': 'forged' }, payload: statusBody,
  });
  assert.equal(forged.statusCode, 403, forged.body);

  const gatherPath = `/v1/modules/outcall/webhooks/twilio/voice/gather?request_id=${callId}`;
  const gatherBody = { CallSid: sid, Digits: '1' };
  const gather = await app.inject({
    method: 'POST', url: gatherPath,
    headers: { 'x-twilio-signature': signWebhook(gatherPath, gatherBody) },
    payload: gatherBody,
  });
  assert.equal(gather.statusCode, 200, gather.body);
  assert.match(gather.body, /Confirmation received/);

  const smsPath = '/v1/modules/outcall/webhooks/twilio/sms';
  const smsBody = {
    MessageSid: `SM${'d'.repeat(32)}`,
    From: '+12025550102',
    To: process.env.TWILIO_PHONE_NUMBER!,
    Body: 'Did you feed the cat?',
  };
  const sms = await app.inject({
    method: 'POST', url: smsPath,
    headers: { 'x-twilio-signature': signWebhook(smsPath, smsBody) },
    payload: smsBody,
  });
  assert.equal(sms.statusCode, 200, sms.body);
  assert.match(sms.body, /Request received/);
  const smsReplay = await app.inject({
    method: 'POST', url: smsPath,
    headers: { 'x-twilio-signature': signWebhook(smsPath, smsBody) },
    payload: smsBody,
  });
  assert.equal(smsReplay.statusCode, 200, smsReplay.body);

  const evidence = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM outcall_events WHERE call_request_id=${callId} AND event_type='provider.status.completed')::integer AS statuses,
      (SELECT COUNT(*) FROM outcall_events WHERE call_request_id=${callId} AND event_type='provider.dtmf')::integer AS confirmations,
      (SELECT COUNT(*) FROM outcall_call_requests WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}
        AND source='sms' AND idempotency_key=${`twilio:sms:${smsBody.MessageSid}`})::integer AS sms_calls,
      (SELECT COUNT(*) FROM shared_webhook_receipts WHERE tenant_id=${ownerA.currentTenantId}
        AND module_id=${moduleRow.id} AND provider_event_id=${smsBody.MessageSid})::integer AS sms_receipts
  `);
  assert.equal(Number(evidence.rows[0].statuses), 1);
  assert.equal(Number(evidence.rows[0].confirmations), 1);
  assert.equal(Number(evidence.rows[0].sms_calls), 1);
  assert.equal(Number(evidence.rows[0].sms_receipts), 1);
  assert.equal(triggerId.length > 0, true);
});

test('OutCall rechecks queued-call authority after revocation', async () => {
  const cases = [
    { name: 'user inactive', change: () => db.execute(sql`UPDATE users SET status='suspended' WHERE id=${ownerA.id}`), restore: () => db.execute(sql`UPDATE users SET status='active' WHERE id=${ownerA.id}`) },
    { name: 'tenant suspended', change: () => db.execute(sql`UPDATE tenants SET status='suspended' WHERE id=${ownerA.currentTenantId}`), restore: () => db.execute(sql`UPDATE tenants SET status='active' WHERE id=${ownerA.currentTenantId}`) },
    { name: 'global module unavailable', change: () => db.execute(sql`UPDATE modules SET status='coming_soon' WHERE id=${moduleRow.id}`), restore: () => db.execute(sql`UPDATE modules SET status='beta' WHERE id=${moduleRow.id}`) },
    { name: 'tenant entitlement disabled', change: () => db.execute(sql`UPDATE tenant_modules SET status='disabled' WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}`), restore: () => db.execute(sql`UPDATE tenant_modules SET status='enabled' WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}`) },
    { name: 'module viewer', change: () => db.insert(tenantUserModuleAccess).values({ tenantId: ownerA.currentTenantId, userId: ownerA.id, moduleId: moduleRow.id, accessLevel: 'viewer' }), restore: () => db.execute(sql`DELETE FROM tenant_user_module_access WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id} AND module_id=${moduleRow.id}`) },
    { name: 'tenant viewer', change: () => db.execute(sql`UPDATE tenant_users SET role='viewer' WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`), restore: () => db.execute(sql`UPDATE tenant_users SET role='owner' WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`) },
    { name: 'membership removed', change: () => db.execute(sql`DELETE FROM tenant_users WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`), restore: () => db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: ownerA.id, role: 'owner' }) },
  ];
  for (const item of cases) {
    await db.execute(sql`DELETE FROM outcall_rate_limits WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
    const queued = await app.inject({ method: 'POST', url: '/v1/modules/outcall/calls', headers: headers(ownerA, ownerA.currentTenantId), payload: { profileId, idempotencyKey: crypto.randomUUID() } });
    assert.equal(queued.statusCode, 201, `${item.name}: ${queued.body}`);
    const id = queued.json().call.id;
    await item.change();
    try {
      await processSharedJobBatch({ workerId: 'outcall-revoked-test', limit: 50 });
      const result = await db.execute(sql`SELECT status,failure_code FROM outcall_call_requests WHERE id=${id}`);
      assert.deepEqual(result.rows[0], { status: 'failed', failure_code: 'OUTCALL_ACCESS_REVOKED' }, item.name);
      const usage = await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_usage_events WHERE external_reference=${id}`);
      assert.equal(Number(usage.rows[0].count), 0, item.name);
    } finally { await item.restore(); }
  }
});

test('OutCall resolves a lost-response retry after its scheduled time and without new rate consumption', async () => {
  const stored = await db.execute(sql`SELECT idempotency_key,scheduled_at FROM outcall_call_requests WHERE id=${callId}`);
  const input = { profileId, idempotencyKey: String(stored.rows[0].idempotency_key), runAt: new Date(stored.rows[0].scheduled_at as Date).toISOString() };
  const before = await db.execute(sql`SELECT COALESCE(SUM(request_count),0)::int AS count FROM outcall_rate_limits WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  // That original immediate schedule is now in the past; returning the stored
  // receipt must precede new-schedule time, provider and rate validation.
  const replay = await app.inject({ method: 'POST', url: '/v1/modules/outcall/calls', headers: headers(ownerA, ownerA.currentTenantId), payload: input });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().call.id, callId);
  assert.equal(replay.json().replayed, true);
  const after = await db.execute(sql`SELECT COALESCE(SUM(request_count),0)::int AS count FROM outcall_rate_limits WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  assert.deepEqual(after.rows[0], before.rows[0]);
});

test('OutCall terminal callbacks survive late, conflicting and unknown statuses', async () => {
  const path = `/v1/modules/outcall/webhooks/twilio/voice/status?request_id=${callId}`;
  const sid = `CA${'c'.repeat(32)}`;
  const before = await db.execute(sql`SELECT status,completed_at,failure_code FROM outcall_call_requests WHERE id=${callId}`);
  for (const [sequence, status] of [['2', 'ringing'], ['3', 'in-progress'], ['4', 'failed']]) {
    const body = { CallSid: sid, CallStatus: status, SequenceNumber: sequence };
    const response = await app.inject({ method: 'POST', url: path, headers: { 'x-twilio-signature': signWebhook(path, body) }, payload: body });
    assert.equal(response.statusCode, 200, response.body);
    const after = await db.execute(sql`SELECT status,completed_at,failure_code FROM outcall_call_requests WHERE id=${callId}`);
    assert.deepEqual(after.rows[0], before.rows[0]);
  }
  const unknown = { CallSid: sid, CallStatus: 'something-new', SequenceNumber: '5' };
  const rejected = await app.inject({ method: 'POST', url: path, headers: { 'x-twilio-signature': signWebhook(path, unknown) }, payload: unknown });
  assert.equal(rejected.statusCode, 400, rejected.body);
  assert.equal(rejected.json().code, 'OUTCALL_PROVIDER_STATUS_INVALID');
  await db.execute(sql`UPDATE outcall_call_requests SET status='failed',failure_code='TWILIO_21211' WHERE id=${callId}`);
  const completed = { CallSid: sid, CallStatus: 'completed', SequenceNumber: '6' };
  const conflict = await app.inject({ method: 'POST', url: path, headers: { 'x-twilio-signature': signWebhook(path, completed) }, payload: completed });
  assert.equal(conflict.statusCode, 200, conflict.body);
  const retained = await db.execute(sql`SELECT status,failure_code FROM outcall_call_requests WHERE id=${callId}`);
  assert.deepEqual(retained.rows[0], { status: 'failed', failure_code: 'TWILIO_21211' });
});

test('OutCall signed SMS cannot schedule through a viewer grant or revoked SMS consent', async () => {
  const path = '/v1/modules/outcall/webhooks/twilio/sms';
  const send = (body: Record<string, string>) => app.inject({ method: 'POST', url: path, headers: { 'x-twilio-signature': signWebhook(path, body) }, payload: body });
  const base = { From: '+12025550102', To: process.env.TWILIO_PHONE_NUMBER!, Body: 'Did you feed the cat?' };
  await db.insert(tenantUserModuleAccess).values({ tenantId: ownerA.currentTenantId, userId: ownerA.id, moduleId: moduleRow.id, accessLevel: 'viewer' });
  try {
    const body = { ...base, MessageSid: `SM${'e'.repeat(32)}` };
    assert.equal((await send(body)).statusCode, 200);
    const calls = await db.execute(sql`SELECT COUNT(*)::int AS count FROM outcall_call_requests WHERE idempotency_key=${`twilio:sms:${body.MessageSid}`}`);
    assert.equal(Number(calls.rows[0].count), 0);
  } finally {
    await db.execute(sql`DELETE FROM tenant_user_module_access WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id} AND module_id=${moduleRow.id}`);
  }
  const stop = await send({ ...base, Body: 'STOP', MessageSid: `SM${'f'.repeat(32)}` });
  assert.equal(stop.statusCode, 200, stop.body);
  const trigger = { ...base, MessageSid: `SM${'a'.repeat(31)}1` };
  const suppressed = await send(trigger);
  assert.equal(suppressed.statusCode, 200, suppressed.body);
  assert.doesNotMatch(suppressed.body, /<Message>/);
  const calls = await db.execute(sql`SELECT COUNT(*)::int AS count FROM outcall_call_requests WHERE idempotency_key=${`twilio:sms:${trigger.MessageSid}`}`);
  assert.equal(Number(calls.rows[0].count), 0);
  // SMS STOP does not revoke a separately requested verified-self web call.
  await db.execute(sql`DELETE FROM outcall_rate_limits WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  const web = await app.inject({ method: 'POST', url: '/v1/modules/outcall/calls', headers: headers(ownerA, ownerA.currentTenantId), payload: { profileId, idempotencyKey: crypto.randomUUID() } });
  assert.equal(web.statusCode, 201, web.body);
  const canceled = await app.inject({ method: 'POST', url: `/v1/modules/outcall/calls/${web.json().call.id}/cancel`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(canceled.statusCode, 200, canceled.body);
  await db.execute(sql`DELETE FROM operatoros_sms_consent_events WHERE consent_record_id IN (SELECT id FROM operatoros_sms_consent_records WHERE phone_e164=${base.From})`);
  await db.execute(sql`DELETE FROM operatoros_sms_consent_records WHERE phone_e164=${base.From}`);
});

test('OutCall expired processing lease records uncertainty without submitting again', async () => {
  await db.execute(sql`DELETE FROM outcall_rate_limits WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  const queued = await app.inject({ method: 'POST', url: '/v1/modules/outcall/calls', headers: headers(ownerA, ownerA.currentTenantId), payload: { profileId, idempotencyKey: crypto.randomUUID() } });
  assert.equal(queued.statusCode, 201, queued.body);
  const id = queued.json().call.id;
  await db.execute(sql`UPDATE outcall_call_requests SET status='processing',provider='twilio',started_at=NOW() WHERE id=${id}`);
  await db.execute(sql`UPDATE shared_jobs SET status='processing',lease_owner='crashed-worker',lease_expires_at=NOW()-interval '1 minute' WHERE tenant_id=${ownerA.currentTenantId} AND payload_json->>'requestId'=${id}`);
  await processSharedJobBatch({ workerId: 'outcall-recovery-test', limit: 50 });
  const result = await db.execute(sql`SELECT status,failure_code,provider_call_sid FROM outcall_call_requests WHERE id=${id}`);
  assert.deepEqual(result.rows[0], { status: 'processing', failure_code: 'OUTCALL_PROVIDER_OUTCOME_UNKNOWN', provider_call_sid: null });
  const path = `/v1/modules/outcall/webhooks/twilio/voice/status?request_id=${id}`;
  const body = { CallSid: `CA${'b'.repeat(32)}`, CallStatus: 'completed', SequenceNumber: '1' };
  const callback = await app.inject({ method: 'POST', url: path, headers: { 'x-twilio-signature': signWebhook(path, body) }, payload: body });
  assert.equal(callback.statusCode, 200, callback.body);
  const reconciled = await db.execute(sql`SELECT status,failure_code,provider_call_sid FROM outcall_call_requests WHERE id=${id}`);
  assert.deepEqual(reconciled.rows[0], { status: 'completed', failure_code: null, provider_call_sid: body.CallSid });
});

test('OutCall carrier acceptance followed by lost response or database failure remains unconfirmed', async () => {
  const previousFetch = globalThis.fetch;
  const previousAdapter = process.env.OUTCALL_TEST_ADAPTER;
  const previousLive = process.env.OUTCALL_LIVE_PROVIDER;
  const previousPolicy=process.env.OUTCALL_RESOURCE_POLICY_JSON;
  const transaction = db.transaction.bind(db);
  delete process.env.OUTCALL_TEST_ADAPTER;
  process.env.OUTCALL_LIVE_PROVIDER = 'enabled';
  process.env.OUTCALL_RESOURCE_POLICY_JSON=JSON.stringify(SYNTHETIC_OUTCALL_POLICY);
  await resourceFixture.approve();
  try {
    for (const outcome of ['lost-response', 'database-failure']) {
      let submissions = 0;
      let accepted = false;
      let failedTransaction = false;
      const sid = `CA${outcome === 'lost-response' ? 'd'.repeat(32) : 'e'.repeat(32)}`;
      globalThis.fetch = (async () => {
        submissions++;
        accepted = true;
        if (outcome === 'lost-response') throw new Error('synthetic accepted request response lost');
        return new Response(JSON.stringify({ sid, status: 'queued' }), { status: 200 });
      }) as typeof fetch;
      db.transaction = (async (...args: Parameters<typeof db.transaction>) => {
        if (outcome === 'database-failure' && accepted && !failedTransaction) {
          failedTransaction = true;
          throw new Error('synthetic carrier acceptance persistence failure');
        }
        return transaction(...args);
      }) as typeof db.transaction;
      await db.execute(sql`DELETE FROM outcall_rate_limits WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
      const queued = await app.inject({ method: 'POST', url: '/v1/modules/outcall/calls', headers: headers(ownerA, ownerA.currentTenantId), payload: { profileId, idempotencyKey: crypto.randomUUID() } });
      assert.equal(queued.statusCode, 201, queued.body);
      const id = queued.json().call.id;
      await processSharedJobBatch({ workerId: 'outcall-uncertain-test', limit: 50 });
      const state = await db.execute(sql`SELECT status,failure_code,completed_at FROM outcall_call_requests WHERE id=${id}`);
      assert.deepEqual(state.rows[0], { status: 'processing', failure_code: 'OUTCALL_PROVIDER_OUTCOME_UNKNOWN', completed_at: null });
      assert.equal(submissions, 1);
      await db.execute(sql`UPDATE shared_jobs SET status='retry',run_at=NOW() WHERE tenant_id=${ownerA.currentTenantId} AND payload_json->>'requestId'=${id}`);
      await processSharedJobBatch({ workerId: 'outcall-no-resubmit-test', limit: 50 });
      assert.equal(submissions, 1, 'unknown requests must never be resubmitted');
      const path = `/v1/modules/outcall/webhooks/twilio/voice/status?request_id=${id}`;
      const body = { CallSid: sid, CallStatus: 'completed', SequenceNumber: '1' };
      const callback = await app.inject({ method: 'POST', url: path, headers: { 'x-twilio-signature': signWebhook(path, body) }, payload: body });
      assert.equal(callback.statusCode, 200, callback.body);
      const reconciled = await db.execute(sql`SELECT status,failure_code FROM outcall_call_requests WHERE id=${id}`);
      assert.deepEqual(reconciled.rows[0], { status: 'completed', failure_code: null });
      const usage = await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_usage_events WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id} AND operation='outcall.live_call' AND external_reference=${id}`);
      assert.equal(Number(usage.rows[0].count), 1, 'signed recovery records acceptance usage exactly once');
      db.transaction = transaction;
    }
  } finally {
    globalThis.fetch = previousFetch;
    db.transaction = transaction;
    if (previousAdapter === undefined) delete process.env.OUTCALL_TEST_ADAPTER;
    else process.env.OUTCALL_TEST_ADAPTER = previousAdapter;
    if (previousLive === undefined) delete process.env.OUTCALL_LIVE_PROVIDER;
    else process.env.OUTCALL_LIVE_PROVIDER = previousLive;
    if(previousPolicy===undefined)delete process.env.OUTCALL_RESOURCE_POLICY_JSON;
    else process.env.OUTCALL_RESOURCE_POLICY_JSON=previousPolicy;
  }
});

test('OutCall pages older pending calls and binds cursors, detail and cancellation to their owner', async () => {
  await db.execute(sql`
    INSERT INTO outcall_call_requests (tenant_id,user_id,profile_id,destination_fingerprint,destination_masked,source,status,provider,idempotency_key,scheduled_at,created_at)
    SELECT ${ownerA.currentTenantId},${ownerA.id},${profileId},s.phone_fingerprint,s.phone_masked,'web',
      CASE WHEN series=105 THEN 'scheduled' ELSE 'completed' END,'test','pagination-test-'||series,
      NOW()+interval '1 day',NOW()-series*interval '1 day'
    FROM outcall_settings s CROSS JOIN generate_series(1,105) series
    WHERE s.tenant_id=${ownerA.currentTenantId} AND s.user_id=${ownerA.id}
  `);
  try {
    const first = await app.inject({ method: 'GET', url: '/v1/modules/outcall/workspace', headers: headers(ownerA, ownerA.currentTenantId) });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().calls.length, 100);
    assert.equal(first.json().callsHasMore, true);
    const cursor = first.json().calls.at(-1).id;
    const next = await app.inject({ method: 'GET', url: `/v1/modules/outcall/calls?before=${cursor}`, headers: headers(ownerA, ownerA.currentTenantId) });
    assert.equal(next.statusCode, 200, next.body);
    assert.equal(next.json().hasMore, false);
    const pending = next.json().calls.find((call: any) => call.status === 'scheduled');
    assert.ok(pending, 'an older pending call must remain reachable');
    const foreign = await app.inject({ method: 'GET', url: `/v1/modules/outcall/calls?before=${cursor}`, headers: headers(ownerB, ownerB.currentTenantId) });
    assert.equal(foreign.statusCode, 404, foreign.body);
    const detail = await app.inject({ method: 'GET', url: `/v1/modules/outcall/calls/${pending.id}`, headers: headers(ownerA, ownerA.currentTenantId) });
    assert.equal(detail.statusCode, 200, detail.body);
    const foreignDetail = await app.inject({ method: 'GET', url: `/v1/modules/outcall/calls/${pending.id}`, headers: headers(ownerB, ownerB.currentTenantId) });
    assert.equal(foreignDetail.statusCode, 404, foreignDetail.body);
    const canceled = await app.inject({ method: 'POST', url: `/v1/modules/outcall/calls/${pending.id}/cancel`, headers: headers(ownerA, ownerA.currentTenantId) });
    assert.equal(canceled.statusCode, 200, canceled.body);
    assert.equal(canceled.json().call.status, 'canceled');
  } finally {
    await db.execute(sql`DELETE FROM outcall_call_requests WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id} AND idempotency_key LIKE 'pagination-test-%'`);
  }
});

test('OutCall reauthenticates private export and deletes only the current user tenant slice', async () => {
  const { hashPassword } = await import('../src/lib/auth.js');
  const password = 'OutCall-test-password-42!';
  await db.execute(sql`UPDATE users SET password_hash=${await hashPassword(password)} WHERE id=${ownerA.id}`);

  const denied = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/data-export',
    headers: headers(ownerA, ownerA.currentTenantId), payload: { password: 'wrong-password' },
  });
  assert.equal(denied.statusCode, 401, denied.body);

  const exported = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/data-export',
    headers: headers(ownerA, ownerA.currentTenantId), payload: { password },
  });
  assert.equal(exported.statusCode, 200, exported.body);
  assert.equal(exported.json().export.phone, '+12025550102');
  assert.equal(exported.json().export.triggers[0].phrase, 'did you feed the cat?');
  assert.doesNotMatch(exported.body, /phoneCiphertext|phraseCiphertext|passwordHash/i);

  const previousPolicy=process.env.OUTCALL_RESOURCE_POLICY_JSON;
  process.env.OUTCALL_RESOURCE_POLICY_JSON=JSON.stringify(SYNTHETIC_OUTCALL_POLICY);
  await resourceFixture.approve();
  const queuedReservation=await db.transaction(tx=>reserveOutCallResource({tenantId:ownerA.currentTenantId,userId:ownerA.id,operation:'verify_start',idempotencyKey:crypto.randomUUID()},tx));
  const heldReservation=await db.transaction(tx=>reserveOutCallResource({tenantId:ownerA.currentTenantId,userId:ownerA.id,operation:'verify_check',idempotencyKey:crypto.randomUUID()},tx));
  await beginOutCallSubmission(heldReservation,ownerA.currentTenantId,ownerA.id,'verify_check');
  const deleted = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/data-deletion',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { password, confirmation: 'DELETE OUTCALL' },
  });
  assert.equal(deleted.statusCode, 200, deleted.body);
  const resources=await db.execute(sql`SELECT id,state,user_id FROM outcall_resource_reservations WHERE id IN (${queuedReservation},${heldReservation})`);
  assert.deepEqual(resources.rows.find(row=>row.id===queuedReservation),{id:queuedReservation,state:'released',user_id:null});
  assert.deepEqual(resources.rows.find(row=>row.id===heldReservation),{id:heldReservation,state:'submitting',user_id:null});
  if(previousPolicy===undefined)delete process.env.OUTCALL_RESOURCE_POLICY_JSON;
  else process.env.OUTCALL_RESOURCE_POLICY_JSON=previousPolicy;
  const remaining = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM outcall_settings WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id})::integer AS settings,
      (SELECT COUNT(*) FROM outcall_profiles WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id})::integer AS profiles,
      (SELECT COUNT(*) FROM outcall_triggers WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id})::integer AS triggers,
      (SELECT COUNT(*) FROM outcall_call_requests WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id})::integer AS calls
  `);
  assert.deepEqual(remaining.rows[0], { settings: 0, profiles: 0, triggers: 0, calls: 0 });
  const foreign = await app.inject({
    method: 'GET', url: '/v1/modules/outcall/workspace',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreign.statusCode, 200, foreign.body);
});
