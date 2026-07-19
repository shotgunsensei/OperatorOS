process.env.SESSION_SECRET ||= 'operatoros-native-workflow-modules-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed,
  modules,
  moduleWorkflowItems,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
} from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

const SPECS = [
  { slug: 'torqueshed', initial: 'open', next: 'testing' },
  { slug: 'brandforgeos', initial: 'draft', next: 'planning' },
  { slug: 'snapproofos', initial: 'draft', next: 'captured' },
] as const;

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let signToken: typeof import('../src/lib/auth.js').signToken;
const createdModules: any[] = [];
const modulesUnderTest: any[] = [];

function headers(user: any, tenantId: string) {
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

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();

  await db.insert(tenantUsers).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    role: 'member',
  });

  for (const spec of SPECS) {
    const [existing] = await db.select().from(modules).where(eq(modules.slug, spec.slug)).limit(1);
    const module = existing ?? await createTestModule(spec.slug);
    modulesUnderTest.push(module);
    if (!existing) createdModules.push(module);
    await db.insert(tenantModules).values([
      { tenantId: ownerA.currentTenantId, moduleId: module.id, status: 'enabled', source: 'admin', allowAllMembers: true },
      { tenantId: ownerB.currentTenantId, moduleId: module.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    ]);
    await db.insert(tenantUserModuleAccess).values({
      tenantId: ownerA.currentTenantId,
      userId: viewer.id,
      moduleId: module.id,
      accessLevel: 'viewer',
    });
  }

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerModuleShellRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  const ids = modulesUnderTest.map((module) => module.id);
  if (ids.length) {
    try { await db.delete(tenantUserModuleAccess).where(inArray(tenantUserModuleAccess.moduleId, ids)); } catch {}
    try { await db.delete(tenantModules).where(inArray(tenantModules.moduleId, ids)); } catch {}
  }
  if (ownerA) {
    try { await db.delete(activityFeed).where(eq(activityFeed.tenantId, ownerA.currentTenantId)); } catch {}
    try { await db.delete(moduleWorkflowItems).where(eq(moduleWorkflowItems.tenantId, ownerA.currentTenantId)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  for (const module of createdModules) await cleanupModule(module.id);
});

for (const spec of SPECS) {
  test(`${spec.slug} persists tenant-scoped workflow CRUD with optimistic concurrency`, async () => {
    const create = await app.inject({
      method: 'POST',
      url: `/v1/modules/${spec.slug}/work-items`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { title: `${spec.slug} test record`, summary: 'Grounded workflow details', data: { context: 'test-context' } },
    });
    assert.equal(create.statusCode, 201, create.body);
    const row = create.json();
    assert.equal(row.tenantId, ownerA.currentTenantId);
    assert.equal(row.moduleSlug, spec.slug);
    assert.equal(row.status, spec.initial);
    assert.equal(row.version, 1);

    const isolated = await app.inject({
      method: 'GET', url: `/v1/modules/${spec.slug}/work-items`,
      headers: headers(ownerB, ownerB.currentTenantId),
    });
    assert.equal(isolated.statusCode, 200, isolated.body);
    assert.equal(isolated.json().items.length, 0);

    const update = await app.inject({
      method: 'PATCH', url: `/v1/modules/${spec.slug}/work-items/${row.id}`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { expectedVersion: 1, status: spec.next },
    });
    assert.equal(update.statusCode, 200, update.body);
    assert.equal(update.json().status, spec.next);
    assert.equal(update.json().version, 2);

    const stale = await app.inject({
      method: 'PATCH', url: `/v1/modules/${spec.slug}/work-items/${row.id}`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { expectedVersion: 1, title: 'stale write' },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().code, 'WORKFLOW_VERSION_CONFLICT');

    const remove = await app.inject({
      method: 'DELETE', url: `/v1/modules/${spec.slug}/work-items/${row.id}`,
      headers: headers(ownerA, ownerA.currentTenantId),
    });
    assert.equal(remove.statusCode, 200, remove.body);
    const [deleted] = await db.select().from(moduleWorkflowItems).where(and(
      eq(moduleWorkflowItems.id, row.id),
      eq(moduleWorkflowItems.tenantId, ownerA.currentTenantId),
    ));
    assert.ok(deleted.deletedAt);
  });
}

test('module viewer may read but cannot create workflow records', async () => {
  const read = await app.inject({
    method: 'GET', url: '/v1/modules/brandforgeos/work-items',
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(read.statusCode, 200, read.body);

  const write = await app.inject({
    method: 'POST', url: '/v1/modules/brandforgeos/work-items',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { title: 'viewer should not create' },
  });
  assert.equal(write.statusCode, 403, write.body);
  assert.equal(write.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
});
