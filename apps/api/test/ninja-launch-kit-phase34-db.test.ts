process.env.SESSION_SECRET ||= 'operatoros-ninja-launch-kit-phase34-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { ensureNinjaLaunchKitPhase34Tables } from '../src/lib/ninja-launch-kit-phase34-db-init.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let kitId = '';

function headers(user: typeof ownerA, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
  };
}

function payload(name: string, key: string) {
  return {
    title: `${name} Launch Kit`,
    generationMode: 'deterministic',
    idempotencyKey: key,
    input: {
      businessName: name,
      businessType: 'Auto repair shop',
      targetCustomer: 'Local drivers with older vehicles',
      offer: '$29 complete vehicle inspection',
      price: '$29',
      location: 'Atlanta, Georgia',
      tone: 'bold',
      painPoint: 'Unexpected repair costs and unclear estimates',
      desiredAction: 'Book an inspection',
      websiteUrl: 'https://example.com/book',
    },
  };
}

async function cleanTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM launchkit_product_exports WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_product_revisions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_product_kits WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_brand_profiles WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_usage_counters WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  await ensureNinjaLaunchKitPhase34Tables();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser(); viewer = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'ninja-launch-kit')).limit(1);
  moduleRow = existing ?? await createTestModule('ninja-launch-kit'); createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true, metadata: { features: { ninjaLaunchKitPlan: 'pro' } } },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true, metadata: { features: { ninjaLaunchKitPlan: 'free' } } },
  ]);
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
  await db.insert(tenantUserModuleAccess).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer' });
  app = Fastify(); await app.register(cookie);
  const { registerNinjaLaunchKitPhase34Routes } = await import('../src/routes/ninja-launch-kit-phase34-routes.js');
  await registerNinjaLaunchKitPhase34Routes(app); await app.ready();
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

test('Phase 34 enforces OperatorOS authentication, trusted tenancy, and write authority', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/v1/modules/ninja-launch-kit/product/overview' })).statusCode, 401);
  const override = await app.inject({ method: 'POST', url: '/v1/modules/ninja-launch-kit/product/kits', headers: headers(ownerA, ownerA.currentTenantId), payload: { ...payload('Rejected', 'phase34-rejected-tenant-001'), tenantId: ownerB.currentTenantId } });
  assert.equal(override.statusCode, 400, override.body);
  const denied = await app.inject({ method: 'POST', url: '/v1/modules/ninja-launch-kit/product/kits', headers: headers(viewer, ownerA.currentTenantId), payload: payload('Viewer', 'phase34-viewer-denied-001') });
  assert.equal(denied.statusCode, 403, denied.body);
});

test('complete kit creation persists every output, nine briefs, one revision, one meter event, and one idempotent business row', async () => {
  const request = payload('Ronin Auto', 'phase34-complete-kit-0001');
  const created = await app.inject({ method: 'POST', url: '/v1/modules/ninja-launch-kit/product/kits', headers: headers(ownerA, ownerA.currentTenantId), payload: request });
  assert.equal(created.statusCode, 201, created.body); kitId = created.json().kit.id;
  assert.equal(created.json().kit.visualPromos.length, 9);
  assert.ok(created.json().kit.content.emailSequence.length);
  assert.ok(created.json().kit.content.smsPromos.length);
  assert.ok(created.json().kit.content.googleAds.length);
  const replay = await app.inject({ method: 'POST', url: '/v1/modules/ninja-launch-kit/product/kits', headers: headers(ownerA, ownerA.currentTenantId), payload: request });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().kit.id, kitId);
  const counts = await db.execute(sql`SELECT (SELECT count(*) FROM launchkit_product_kits WHERE tenant_id=${ownerA.currentTenantId})::int AS kits,(SELECT count(*) FROM launchkit_product_revisions WHERE tenant_id=${ownerA.currentTenantId})::int AS revisions,(SELECT count(*) FROM shared_usage_events WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id} AND operation='launchkit.complete_generation')::int AS events`);
  assert.deepEqual({ kits: Number(counts.rows[0].kits), revisions: Number(counts.rows[0].revisions), events: Number(counts.rows[0].events) }, { kits: 1, revisions: 1, events: 1 });
});

test('concurrent duplicate replay creates one business row and rejects cross-operation key reuse', async () => {
  const duplicatePayload = { title: 'Ronin Auto Launch Kit Copy', idempotencyKey: 'phase34-concurrent-duplicate-0001' };
  const [first, second] = await Promise.all([
    app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}/duplicate`, headers: headers(ownerA, ownerA.currentTenantId), payload: duplicatePayload }),
    app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}/duplicate`, headers: headers(ownerA, ownerA.currentTenantId), payload: duplicatePayload }),
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 201], `${first.body}\n${second.body}`);
  assert.equal(first.json().kit.id, second.json().kit.id);
  const count = await db.execute(sql`SELECT count(*)::int AS count FROM launchkit_product_kits WHERE tenant_id=${ownerA.currentTenantId} AND idempotency_key=${duplicatePayload.idempotencyKey}`);
  assert.equal(Number(count.rows[0].count), 1);
  const conflict = await app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}/duplicate`, headers: headers(ownerA, ownerA.currentTenantId), payload: { title: 'Wrong replay', idempotencyKey: 'phase34-complete-kit-0001' } });
  assert.equal(conflict.statusCode, 409, conflict.body);
});

test('export replay returns the original persisted artifact and tenant isolation hides another tenant kit', async () => {
  const request = { format: 'json', idempotencyKey: 'phase34-export-json-0001' };
  const created = await app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}/exports`, headers: headers(ownerA, ownerA.currentTenantId), payload: request });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(JSON.parse(created.json().content).visualPromos.length, 9);
  const replay = await app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}/exports`, headers: headers(ownerA, ownerA.currentTenantId), payload: request });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().export.id, created.json().export.id);
  const isolated = await app.inject({ method: 'GET', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}`, headers: headers(ownerB, ownerB.currentTenantId) });
  assert.equal(isolated.statusCode, 404, isolated.body);
});

test('free entitlement enforces two monthly kits, hides eight brief bodies, and denies brands and premium export formats', async () => {
  for (let index = 1; index <= 2; index += 1) {
    const result = await app.inject({ method: 'POST', url: '/v1/modules/ninja-launch-kit/product/kits', headers: headers(ownerB, ownerB.currentTenantId), payload: payload(`Free ${index}`, `phase34-free-kit-000${index}`) });
    assert.equal(result.statusCode, 201, result.body);
    assert.equal(result.json().kit.visualPromos.filter((brief: Record<string, any>) => brief.locked && brief.brief === '').length, 8);
  }
  const limited = await app.inject({ method: 'POST', url: '/v1/modules/ninja-launch-kit/product/kits', headers: headers(ownerB, ownerB.currentTenantId), payload: payload('Free 3', 'phase34-free-kit-0003') });
  assert.equal(limited.statusCode, 402, limited.body);
  const brand = await app.inject({ method: 'POST', url: '/v1/modules/ninja-launch-kit/product/brands', headers: headers(ownerB, ownerB.currentTenantId), payload: { name: 'Locked brand' } });
  assert.equal(brand.statusCode, 403, brand.body);
  const own = await db.execute(sql`SELECT id FROM launchkit_product_kits WHERE tenant_id=${ownerB.currentTenantId} ORDER BY created_at LIMIT 1`);
  const premium = await app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${String((own.rows[0] as any).id)}/exports`, headers: headers(ownerB, ownerB.currentTenantId), payload: { format: 'markdown', idempotencyKey: 'phase34-free-markdown-denied' } });
  assert.equal(premium.statusCode, 403, premium.body);
});

test('archive, restore, soft delete, and undo retain immutable revision and export history', async () => {
  const before = await app.inject({ method: 'GET', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}`, headers: headers(ownerA, ownerA.currentTenantId) });
  const archive = await app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}/archive`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(archive.json().kit.status, 'archived');
  const restore = await app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}/restore`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(restore.json().kit.status, 'active');
  assert.equal((await app.inject({ method: 'DELETE', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}`, headers: headers(ownerA, ownerA.currentTenantId) })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}`, headers: headers(ownerA, ownerA.currentTenantId) })).statusCode, 404);
  const undo = await app.inject({ method: 'POST', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}/undo-delete`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(undo.statusCode, 200, undo.body);
  const afterUndo = await app.inject({ method: 'GET', url: `/v1/modules/ninja-launch-kit/product/kits/${kitId}`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(afterUndo.statusCode, 200, afterUndo.body);
  assert.ok(afterUndo.json().history.length >= before.json().history.length);
  assert.equal(afterUndo.json().exports.length, before.json().exports.length);
});
