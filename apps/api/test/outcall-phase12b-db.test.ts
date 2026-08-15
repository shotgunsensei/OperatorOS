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
  await ensureOutCallTables();
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
      destination: '+15551234567',
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
    payload: { phone: '+15551234567', verificationCode: '000000' },
  });
  assert.equal(verified.statusCode, 200, verified.body);
  assert.equal(verified.json().phoneMasked, '+15••••4567');

  const foreignOwnership = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/phone-verification',
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { phone: '+15551234567', verificationCode: '000000' },
  });
  assert.equal(foreignOwnership.statusCode, 409, foreignOwnership.body);
  assert.equal(foreignOwnership.json().code, 'OUTCALL_PHONE_OWNERSHIP_CONFLICT');

  const replaced = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/phone-verification',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { phone: '+15557654321', verificationCode: '000000' },
  });
  assert.equal(replaced.statusCode, 200, replaced.body);
  const ownerRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM outcall_phone_owners WHERE user_id=${ownerA.id}
  `);
  assert.equal(Number(ownerRows.rows[0]?.count), 1, 'replaced phone ownership must not remain stale');

  const releasedOwnership = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/phone-verification',
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { phone: '+15551234567', verificationCode: '000000' },
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
  assert.equal(call.rows[0].destination_masked, '+15••••4321');
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
    From: '+15557654321',
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
  assert.equal(exported.json().export.phone, '+15557654321');
  assert.equal(exported.json().export.triggers[0].phrase, 'did you feed the cat?');
  assert.doesNotMatch(exported.body, /phoneCiphertext|phraseCiphertext|passwordHash/i);

  const deleted = await app.inject({
    method: 'POST', url: '/v1/modules/outcall/data-deletion',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { password, confirmation: 'DELETE OUTCALL' },
  });
  assert.equal(deleted.statusCode, 200, deleted.body);
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
