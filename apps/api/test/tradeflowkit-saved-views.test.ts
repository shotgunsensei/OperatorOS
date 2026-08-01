process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-saved-views-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed, modules, tenantModules, tenantUserModuleAccess, tenantUsers, tradeflowkitSavedViews,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let member: any;
let viewer: any;
let moduleRow: any;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id, email: user.email, role: user.role,
      tokenVersion: user.tokenVersion, sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

async function createApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const instance = Fastify();
  await instance.register(cookie);
  const { registerTradeFlowKitRoutes } = await import('../src/routes/tradeflowkit-routes.js');
  await registerTradeFlowKitRoutes(instance);
  await instance.ready();
  return instance;
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser(); member = await createTestUser(); viewer = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('tradeflowkit'); createdModule = true; }
  await db.insert(tenantUsers).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, role: 'member' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' },
  ]);
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer',
  });
  app = await createApp();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    try { await db.delete(tenantUserModuleAccess).where(and(eq(tenantUserModuleAccess.moduleId, moduleRow.id), eq(tenantUserModuleAccess.tenantId, ownerA.currentTenantId))); } catch {}
    for (const tenant of [ownerA.currentTenantId, ownerB.currentTenantId]) {
      try { await db.delete(tenantModules).where(and(eq(tenantModules.moduleId, moduleRow.id), eq(tenantModules.tenantId, tenant))); } catch {}
    }
  }
  for (const user of [viewer, member, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('saved views are bounded, tenant isolated, share-gated, owned, soft-deleted, and durable', async () => {
  const tenantA = ownerA.currentTenantId;
  const tenantB = ownerB.currentTenantId;
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/saved-views?resource=jobs' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);

  for (const payload of [
    { resource: 'secrets', name: 'Invalid resource', filters: {}, sort: { field: 'updatedAt', direction: 'desc' } },
    { resource: 'toString', name: 'Prototype resource', filters: {}, sort: { field: 'updatedAt', direction: 'desc' } },
    { resource: 'jobs', name: 'Invalid filter', filters: { password: 'anything' }, sort: { field: 'updatedAt', direction: 'desc' } },
    { resource: 'jobs', name: 'Invalid sort', filters: {}, sort: { field: 'paidAt', direction: 'desc' } },
    { resource: 'jobs', name: 'Unknown field', filters: {}, sort: { field: 'updatedAt', direction: 'desc' }, unexpected: true },
  ]) {
    const invalid = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/saved-views', headers: headers(member, tenantA), payload });
    assert.equal(invalid.statusCode, 400, invalid.body);
  }

  const viewerCreate = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/saved-views', headers: headers(viewer, tenantA),
    payload: { resource: 'jobs', name: 'Viewer write', filters: {}, sort: { field: 'updatedAt', direction: 'desc' } },
  });
  assert.equal(viewerCreate.statusCode, 403, viewerCreate.body);

  const memberShared = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/saved-views', headers: headers(member, tenantA),
    payload: { resource: 'jobs', name: 'Unauthorized shared', filters: {}, sort: { field: 'updatedAt', direction: 'desc' }, isShared: true },
  });
  assert.equal(memberShared.statusCode, 403, memberShared.body);
  assert.equal(memberShared.json().code, 'SAVED_VIEW_ADMIN_REQUIRED');

  const personalResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/saved-views', headers: headers(member, tenantA),
    payload: { resource: 'jobs', name: 'My Urgent Work', filters: { search: 'Atlas', status: 'in_progress' }, sort: { field: 'updatedAt', direction: 'desc' } },
  });
  assert.equal(personalResponse.statusCode, 201, personalResponse.body);
  const personal = personalResponse.json();
  assert.equal(personal.owned, true);
  assert.equal('userId' in personal, false);
  assert.equal('tenantId' in personal, false);

  const duplicate = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/saved-views', headers: headers(member, tenantA),
    payload: { resource: 'jobs', name: '  MY   urgent work ', filters: {}, sort: { field: 'updatedAt', direction: 'desc' } },
  });
  assert.equal(duplicate.statusCode, 409, duplicate.body);
  assert.equal(duplicate.json().code, 'SAVED_VIEW_NAME_CONFLICT');

  const sharedResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/saved-views', headers: headers(ownerA, tenantA),
    payload: { resource: 'jobs', name: 'Tenant Dispatch', filters: { status: 'scheduled' }, sort: { field: 'priority', direction: 'asc' }, isShared: true },
  });
  assert.equal(sharedResponse.statusCode, 201, sharedResponse.body);
  const shared = sharedResponse.json();
  assert.equal(shared.isShared, true);

  const foreignResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/saved-views', headers: headers(ownerB, tenantB),
    payload: { resource: 'jobs', name: 'Foreign Shared', filters: {}, sort: { field: 'updatedAt', direction: 'desc' }, isShared: true },
  });
  assert.equal(foreignResponse.statusCode, 201, foreignResponse.body);
  const foreign = foreignResponse.json();

  const memberList = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/saved-views?resource=jobs', headers: headers(member, tenantA) });
  assert.equal(memberList.statusCode, 200, memberList.body);
  assert.deepEqual(memberList.json().savedViews.map((row: any) => row.id).sort(), [personal.id, shared.id].sort());
  assert.equal(memberList.json().savedViews.find((row: any) => row.id === shared.id).owned, false);
  assert.equal(memberList.body.includes(foreign.id), false);

  const ownerList = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/saved-views?resource=jobs', headers: headers(ownerA, tenantA) });
  assert.equal(ownerList.statusCode, 200, ownerList.body);
  assert.deepEqual(ownerList.json().savedViews.map((row: any) => row.id), [shared.id]);

  for (const [user, tenant, id] of [[ownerA, tenantA, personal.id], [ownerB, tenantB, personal.id], [member, tenantA, shared.id]] as const) {
    const denied = await app.inject({ method: 'DELETE', url: `/v1/modules/tradeflowkit/saved-views/${id}`, headers: headers(user, tenant) });
    assert.equal(denied.statusCode, 404, denied.body);
  }

  const archived = await app.inject({ method: 'DELETE', url: `/v1/modules/tradeflowkit/saved-views/${personal.id}`, headers: headers(member, tenantA) });
  assert.equal(archived.statusCode, 200, archived.body);
  const [archivedRow] = await db.select().from(tradeflowkitSavedViews).where(and(
    eq(tradeflowkitSavedViews.id, personal.id), eq(tradeflowkitSavedViews.tenantId, tenantA), isNotNull(tradeflowkitSavedViews.archivedAt),
  )).limit(1);
  assert.ok(archivedRow);

  await app.close(); app = await createApp();
  const durable = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/saved-views?resource=jobs', headers: headers(member, tenantA) });
  assert.equal(durable.statusCode, 200, durable.body);
  assert.deepEqual(durable.json().savedViews.map((row: any) => row.id), [shared.id]);

  await db.insert(tradeflowkitSavedViews).values(Array.from({ length: 50 }, (_, index) => ({
    tenantId: tenantA,
    userId: member.id,
    resource: 'tasks',
    name: `Task view ${index + 1}`,
    normalizedName: `task view ${index + 1}`,
    filters: {},
    sort: { field: 'updatedAt', direction: 'desc' as const },
  })));
  const overLimit = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/saved-views', headers: headers(member, tenantA),
    payload: { resource: 'tasks', name: 'Task view 51', filters: {}, sort: { field: 'updatedAt', direction: 'desc' } },
  });
  assert.equal(overLimit.statusCode, 409, overLimit.body);
  assert.equal(overLimit.json().code, 'SAVED_VIEW_LIMIT_REACHED');

  const auditRows = await db.select().from(activityFeed).where(and(
    eq(activityFeed.tenantId, tenantA), eq(activityFeed.entityType, 'tradeflowkit_saved_view'),
  ));
  assert.equal(auditRows.filter(row => [personal.id, shared.id].includes(row.entityId ?? '')).length, 3);
});
