process.env.SESSION_SECRET ||= 'operatoros-callcommand-phase11e-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.CALLCOMMAND_TEST_ADAPTER = 'enabled';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';
import { ensureCallCommandTables } from '../src/lib/callcommand-db-init.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let channelId = '';
let profileId = '';
let callId = '';
const phone = '+15551234567';

function headers(user: typeof ownerA, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id, email: user.email, role: user.role,
      tokenVersion: user.tokenVersion, sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

async function clean(tenantId: string) {
  await db.execute(sql`DELETE FROM callcommand_followups WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_events WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_calls WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_suppressions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_consents WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_transfer_targets WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_profiles WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_channels WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  await ensureCallCommandTables();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'callcommand-ai')).limit(1);
  moduleRow = existing ?? await createTestModule('callcommand-ai');
  createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer',
  });
  app = Fastify();
  await app.register(cookie);
  const { registerCallCommandRoutes } = await import('../src/routes/callcommand-routes.js');
  await registerCallCommandRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (ownerA) await clean(ownerA.currentTenantId);
  if (ownerB) await clean(ownerB.currentTenantId);
  if (moduleRow) {
    await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id));
    await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id));
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('CallCommand requires OperatorOS authentication, entitlement, and server write authority', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/workspace' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const viewerRead = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/workspace', headers: headers(viewer, ownerA.currentTenantId) });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);
  const viewerWrite = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/channels',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { name: 'No', phone: '+15550000000', timezone: 'UTC', consentScript: 'No', recordingEnabled: false },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
});

test('CallCommand persists configuration and blocks calls without exact-purpose consent', async () => {
  const channel = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/channels',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'Support line', phone: '+15550001111', timezone: 'America/New_York',
      consentScript: 'This call is recorded only with permission.', recordingEnabled: false,
    },
  });
  assert.equal(channel.statusCode, 201, channel.body);
  channelId = channel.json().id;
  const profile = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/profiles',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Support intake', mode: 'intake', greeting: 'How can we help?', intakeFields: ['name', 'reason'] },
  });
  assert.equal(profile.statusCode, 201, profile.body);
  profileId = profile.json().id;
  const blocked = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/calls',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { phone, subjectName: 'Customer', purpose: 'support', channelId, profileId, idempotencyKey: 'callcommand-no-consent-1' },
  });
  assert.equal(blocked.statusCode, 409, blocked.body);
  assert.equal(blocked.json().code, 'CALLCOMMAND_CONSENT_REQUIRED');
});

test('CallCommand completes test-only provider workflow once and persists data across refresh', async () => {
  const consent = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/consents',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { phone, subjectName: 'Customer', purpose: 'support', source: 'authenticated_portal', evidence: 'Customer requested a support callback.' },
  });
  assert.equal(consent.statusCode, 201, consent.body);
  const payload = { phone, subjectName: 'Customer', purpose: 'support', channelId, profileId, idempotencyKey: 'callcommand-test-call-1' };
  const placed = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/calls', headers: headers(ownerA, ownerA.currentTenantId), payload });
  assert.equal(placed.statusCode, 201, placed.body);
  assert.equal(placed.json().provider, 'test');
  assert.equal(placed.json().status, 'completed');
  callId = placed.json().id;
  assert.equal(placed.json().phoneE164, undefined);
  const replay = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/calls', headers: headers(ownerA, ownerA.currentTenantId), payload });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().id, placed.json().id);
  const detail = await app.inject({ method: 'GET', url: `/v1/modules/callcommand-ai/calls/${placed.json().id}`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().events.length, 2);
  const refreshed = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/workspace', headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(refreshed.statusCode, 200, refreshed.body);
  assert.equal(refreshed.json().summary.calls, 1);
  assert.equal(refreshed.json().calls[0].id, placed.json().id);
});

test('CallCommand persists operator dispositions and review-only follow-up drafts', async () => {
  const disposition = await app.inject({
    method: 'POST',
    url: `/v1/modules/callcommand-ai/calls/${callId}/disposition`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { disposition: 'follow_up_required', note: 'Confirm the support window with the customer.' },
  });
  assert.equal(disposition.statusCode, 200, disposition.body);
  assert.equal(disposition.json().disposition, 'follow_up_required');
  const followup = await app.inject({
    method: 'POST',
    url: `/v1/modules/callcommand-ai/calls/${callId}/followups`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { channel: 'task', body: 'Confirm the support window before any further contact.' },
  });
  assert.equal(followup.statusCode, 201, followup.body);
  assert.equal(followup.json().status, 'draft');
  const refreshed = await app.inject({
    method: 'GET',
    url: '/v1/modules/callcommand-ai/workspace',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(refreshed.statusCode, 200, refreshed.body);
  assert.equal(refreshed.json().calls[0].disposition, 'follow_up_required');
  assert.equal(refreshed.json().followups.length, 1);
  assert.equal(refreshed.json().followups[0].callId, callId);
});

test('CallCommand hides foreign tenant resources and suppression blocks later contact', async () => {
  const workspaceB = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/workspace', headers: headers(ownerB, ownerB.currentTenantId) });
  assert.equal(workspaceB.statusCode, 200, workspaceB.body);
  assert.equal(workspaceB.json().calls.length, 0);
  const foreign = await app.inject({ method: 'GET', url: `/v1/modules/callcommand-ai/calls/${callId}`, headers: headers(ownerB, ownerB.currentTenantId) });
  assert.equal(foreign.statusCode, 404, foreign.body);
  const suppressed = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/suppressions', headers: headers(ownerA, ownerA.currentTenantId),
    payload: { phone, reason: 'Customer requested no further calls.' },
  });
  assert.equal(suppressed.statusCode, 201, suppressed.body);
  const blocked = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/calls', headers: headers(ownerA, ownerA.currentTenantId),
    payload: { phone, subjectName: 'Customer', purpose: 'support', channelId, profileId, idempotencyKey: 'callcommand-suppressed-2' },
  });
  assert.equal(blocked.statusCode, 409, blocked.body);
  assert.equal(blocked.json().code, 'CALLCOMMAND_SUPPRESSED');
});
