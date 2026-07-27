process.env.SESSION_SECRET ||= 'operatoros-outcall-phase12b-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.OUTCALL_TEST_ADAPTER = 'enabled';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
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
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let profileId = '';

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
  await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM outcall_call_requests WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM outcall_triggers WHERE tenant_id=${tenantId}`);
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
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'outcall')).limit(1);
  moduleRow = existing ?? await createTestModule('outcall');
  createdModule = !existing;
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
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
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
    payload: { phrase: 'Did you feed the cat?', neutralReply: 'Request received.', delaySeconds: 0 },
  });
  assert.equal(trigger.statusCode, 201, trigger.body);
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
  const callId = first.json().call.id;

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
  assert.equal(call.rows[0].destination_masked, '+15••••4567');
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
