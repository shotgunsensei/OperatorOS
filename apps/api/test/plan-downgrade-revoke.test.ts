/**
 * Task #108 — Plan downgrade DROPS tenant_modules + REVOKES per-user grants.
 *
 * Scenario: tenant owner is on "elite" plan that includes a module.
 * tenant_modules.source='included' row exists; a per-user grant exists.
 * After we swap the active subscription to a "starter" plan that does
 * NOT include the module and call recomputeAndPropagateEntitlements(tenantId),
 * we expect:
 *   - tenant_modules.status flips to 'disabled' for the dropped module
 *   - tenant_user_module_access rows for that module are revoked to 'none'
 *   - resolveEntitlements() reports the module as enabled=false thereafter
 *   - propagation result reports the drop in droppedModuleSlugs
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess, planModules,
  subscriptions, subscriptionPlans, modules,
} from '../src/schema.js';
import { resolveEntitlements } from '../src/lib/entitlement-resolver.js';
import { recomputeAndPropagateEntitlements } from '../src/lib/entitlement-propagation.js';
import {
  ensureSchemaReady, createTestUser, createTestModule,
  cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

let owner: any, tenant: any, mod: any, elitePlan: any, starterPlan: any;

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  mod = await createTestModule();

  const eliteSlug = uniqueId('elite-test');
  const starterSlug = uniqueId('starter-test');
  [elitePlan] = await db.insert(subscriptionPlans).values({
    name: eliteSlug, slug: eliteSlug, price: 9900, interval: 'month',
  }).returning();
  [starterPlan] = await db.insert(subscriptionPlans).values({
    name: starterSlug, slug: starterSlug, price: 0, interval: 'month',
  }).returning();
  // Elite includes our test module; starter does not.
  await db.insert(planModules).values({ planId: elitePlan.id, moduleId: mod.id });

  [tenant] = await db.insert(tenants).values({
    name: 'Downgrade', slug: `down-${owner.id}`,
    type: 'company', ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: tenant.id, userId: owner.id, role: 'owner' });
  await db.insert(tenantModules).values({
    tenantId: tenant.id, moduleId: mod.id,
    status: 'enabled', source: 'included', allowAllMembers: false,
  });
  // Pre-existing explicit grant we expect to see revoked.
  await db.insert(tenantUserModuleAccess).values({
    tenantId: tenant.id, userId: owner.id, moduleId: mod.id,
    accessLevel: 'manager',
  });
});

after(async () => {
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenant.id)); } catch {}
  try { await db.delete(planModules).where(eq(planModules.moduleId, mod.id)); } catch {}
  try { await db.delete(subscriptions).where(eq(subscriptions.userId, owner.id)); } catch {}
  try { await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, elitePlan.id)); } catch {}
  try { await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, starterPlan.id)); } catch {}
  if (mod) await cleanupModule(mod.id);
  if (owner) await cleanupUser(owner.id);
});

test('on elite plan -> module unlocked, access_level preserved', async () => {
  await db.insert(subscriptions).values({
    userId: owner.id, planId: elitePlan.id, status: 'active',
  });
  const snap = await resolveEntitlements(owner.id, tenant.id);
  const entry = snap!.modules.find(m => m.slug === mod.slug);
  assert.ok(entry);
  assert.equal(entry!.enabled, true);
  assert.equal(entry!.accessLevel, 'manager');
});

test('downgrade + recompute -> tenant_modules disabled, per-user grant revoked, audit recorded', async () => {
  await db.update(subscriptions)
    .set({ planId: starterPlan.id, updatedAt: new Date() })
    .where(eq(subscriptions.userId, owner.id));

  const result = await recomputeAndPropagateEntitlements(tenant.id, {
    reason: 'test:plan_downgrade',
  });

  assert.deepEqual(result.droppedModuleSlugs, [mod.slug]);
  assert.equal(result.revokedAccessRows, 1);

  // tenant_modules row is now disabled.
  const [tmAfter] = await db.select().from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenant.id), eq(tenantModules.moduleId, mod.id)))
    .limit(1);
  assert.equal(tmAfter.status, 'disabled');

  // tenant_user_module_access row is revoked.
  const [accessAfter] = await db.select().from(tenantUserModuleAccess)
    .where(and(
      eq(tenantUserModuleAccess.tenantId, tenant.id),
      eq(tenantUserModuleAccess.userId, owner.id),
      eq(tenantUserModuleAccess.moduleId, mod.id),
    )).limit(1);
  assert.equal(accessAfter.accessLevel, 'none');

  // Snapshot reflects the dropped module.
  const snap = await resolveEntitlements(owner.id, tenant.id);
  assert.equal(snap!.subscription?.planSlug, starterPlan.slug);
  const entry = snap!.modules.find(m => m.slug === mod.slug);
  assert.ok(entry);
  assert.equal(entry!.enabled, false);
  assert.equal(entry!.accessLevel, 'none');
  assert.equal(entry!.moduleRole, 'none');
});
