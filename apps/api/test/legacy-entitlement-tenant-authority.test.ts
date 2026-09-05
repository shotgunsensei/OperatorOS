import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  planModules,
  subscriptions,
  subscriptionPlans,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tenants,
} from '../src/schema.js';
import {
  getActiveSubscriptionForTenant,
  hasModuleAccess,
} from '../src/lib/entitlement-service.js';
import { resolveEntitlements } from '../src/lib/entitlement-resolver.js';
import { recomputeAndPropagateEntitlements } from '../src/lib/entitlement-propagation.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';

let owner: Awaited<ReturnType<typeof createTestUser>>;
let tenantA: typeof tenants.$inferSelect;
let tenantB: typeof tenants.$inferSelect;
let moduleRow: Awaited<ReturnType<typeof createTestModule>>;
let plan: typeof subscriptionPlans.$inferSelect;
let subscription: typeof subscriptions.$inferSelect;

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  moduleRow = await createTestModule(uniqueId('tenant-plan-module'));
  [plan] = await db.insert(subscriptionPlans).values({
    name: uniqueId('Tenant Authority Plan'),
    slug: uniqueId('tenant-authority-plan'),
    price: 0,
    interval: 'month',
  }).returning();
  await db.insert(planModules).values({
    planId: plan.id,
    moduleId: moduleRow.id,
    featureFlagsJson: { tenantAOnly: true },
  });
  [tenantA] = await db.insert(tenants).values({
    name: 'Legacy Tenant A',
    slug: uniqueId('legacy-tenant-a'),
    type: 'company',
    ownerUserId: owner.id,
  }).returning();
  [tenantB] = await db.insert(tenants).values({
    name: 'Legacy Tenant B',
    slug: uniqueId('legacy-tenant-b'),
    type: 'company',
    ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenantA.id, userId: owner.id, role: 'owner' },
    { tenantId: tenantB.id, userId: owner.id, role: 'owner' },
  ]);
  [subscription] = await db.insert(subscriptions).values({
    userId: owner.id,
    tenantId: tenantA.id,
    planId: plan.id,
    status: 'active',
  }).returning();
  await db.execute(sql`
    UPDATE subscriptions
    SET legacy_access_grandfathered_at=clock_timestamp()
    WHERE id=${subscription.id}
  `);
});

after(async () => {
  if (tenantA || tenantB) {
    const tenantIds = [tenantA?.id, tenantB?.id].filter(Boolean) as string[];
    for (const tenantId of tenantIds) {
      try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, tenantId)); } catch {}
      try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenantId)); } catch {}
      try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantId)); } catch {}
    }
    try { await db.delete(subscriptions).where(eq(subscriptions.userId, owner.id)); } catch {}
    for (const tenantId of tenantIds) {
      try { await db.delete(tenants).where(eq(tenants.id, tenantId)); } catch {}
    }
  }
  if (plan) {
    try { await db.delete(planModules).where(eq(planModules.planId, plan.id)); } catch {}
    try { await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, plan.id)); } catch {}
  }
  if (moduleRow) await cleanupModule(moduleRow.id);
  if (owner) await cleanupUser(owner.id);
});

test('one owner cannot carry a grandfathered plan or feature flags into another tenant', async () => {
  assert.equal((await getActiveSubscriptionForTenant(owner.id, tenantA.id))?.id, subscription.id);
  assert.equal(await getActiveSubscriptionForTenant(owner.id, tenantB.id), null);

  const accessA = await hasModuleAccess(owner.id, tenantA.id, moduleRow.slug);
  const accessB = await hasModuleAccess(owner.id, tenantB.id, moduleRow.slug);
  assert.equal(accessA.hasAccess, true);
  assert.equal(accessA.source, 'plan');
  assert.equal(accessB.hasAccess, false);

  const snapshotA = await resolveEntitlements(owner.id, tenantA.id);
  const snapshotB = await resolveEntitlements(owner.id, tenantB.id);
  assert.equal(snapshotA?.subscription?.planSlug, plan.slug);
  assert.equal(snapshotA?.modules.find(row => row.slug === moduleRow.slug)?.features.tenantAOnly, true);
  assert.equal(snapshotB?.subscription, null);
  assert.equal(snapshotB?.modules.find(row => row.slug === moduleRow.slug)?.features.tenantAOnly, undefined);
});

test('canceled grandfathered subscriptions cannot survive or re-enable propagation', async () => {
  await db.insert(tenantModules).values({
    tenantId: tenantA.id,
    moduleId: moduleRow.id,
    status: 'enabled',
    source: 'included',
    allowAllMembers: true,
  }).onConflictDoUpdate({
    target: [tenantModules.tenantId, tenantModules.moduleId],
    set: { status: 'enabled', source: 'included', allowAllMembers: true },
  });
  await db.insert(tenantUserModuleAccess).values({
    tenantId: tenantA.id,
    userId: owner.id,
    moduleId: moduleRow.id,
    accessLevel: 'manager',
  }).onConflictDoUpdate({
    target: [
      tenantUserModuleAccess.tenantId,
      tenantUserModuleAccess.userId,
      tenantUserModuleAccess.moduleId,
    ],
    set: { accessLevel: 'manager' },
  });
  await db.update(subscriptions)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(and(eq(subscriptions.id, subscription.id), eq(subscriptions.tenantId, tenantA.id)));

  assert.equal(await getActiveSubscriptionForTenant(owner.id, tenantA.id), null);
  const result = await recomputeAndPropagateEntitlements(tenantA.id, {
    reason: 'test:canceled-grandfathered-contract',
  });
  assert.deepEqual(result.droppedModuleSlugs, [moduleRow.slug]);
  assert.equal(result.revokedAccessRows, 1);

  const [tenantModule] = await db.select().from(tenantModules).where(and(
    eq(tenantModules.tenantId, tenantA.id),
    eq(tenantModules.moduleId, moduleRow.id),
  )).limit(1);
  const [userAccess] = await db.select().from(tenantUserModuleAccess).where(and(
    eq(tenantUserModuleAccess.tenantId, tenantA.id),
    eq(tenantUserModuleAccess.userId, owner.id),
    eq(tenantUserModuleAccess.moduleId, moduleRow.id),
  )).limit(1);
  assert.equal(tenantModule.status, 'disabled');
  assert.equal(userAccess.accessLevel, 'none');
});
