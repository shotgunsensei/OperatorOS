/**
 * Task #66 (review fix #4) — plan-tier matrix + super-admin billing isolation.
 *
 * Asserts the entitlement service correctly walks the tier ladder:
 *   - Starter user  → starter modules granted, pro+elite denied
 *   - Pro user      → starter+pro granted, elite denied (no addon)
 *   - Pro user + active addon for an elite module → that elite module granted
 *   - Elite user    → all modules granted
 *
 * Plus the security-critical assertion that **a super_admin platform role
 * cannot be used to fake their tenant's billing state**: super_admin's
 * `getUserPlanConfig()` still derives from the actual subscriptions row
 * (or the Starter fallback when none exists), so promoting a user to
 * super_admin does not silently grant them Elite billing limits.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, subscriptions, subscriptionPlans, modules, planModules,
  addonSubscriptions, tenantModules,
} from '../src/schema.js';
import { hasModuleAccess } from '../src/lib/entitlement-service.js';
import { getUserPlanConfig } from '../src/lib/plans.js';
import {
  ensureSchemaReady, createTestUser, createTestModule,
  cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

// One module per tier so the test verifies the ladder, not just one slug.
let starterMod: { id: string; slug: string };
let proMod:     { id: string; slug: string };
let eliteMod:   { id: string; slug: string };

let starterPlanId: string;
let proPlanId: string;
let elitePlanId: string;

let starterUserId: string;  let starterTenantId: string;
let proUserId: string;      let proTenantId: string;
let eliteUserId: string;    let eliteTenantId: string;
let superUserId: string;    let superTenantId: string;

const allUserIds: string[] = [];
const allModuleIds: string[] = [];

before(async () => {
  await ensureSchemaReady();

  const [s] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'starter')).limit(1);
  const [p] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'pro')).limit(1);
  const [e] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'elite')).limit(1);
  if (!s || !p || !e) throw new Error('starter/pro/elite plans must be seeded');
  starterPlanId = s.id; proPlanId = p.id; elitePlanId = e.id;

  starterMod = await createTestModule(uniqueId('tm-starter'));
  proMod     = await createTestModule(uniqueId('tm-pro'));
  eliteMod   = await createTestModule(uniqueId('tm-elite'));
  allModuleIds.push(starterMod.id, proMod.id, eliteMod.id);

  // Wire plan_modules to mirror real tier inclusion: pro inherits starter,
  // elite inherits everything (matches seedModules' tier walk).
  await db.insert(planModules).values([
    { planId: starterPlanId, moduleId: starterMod.id },
    { planId: proPlanId,     moduleId: starterMod.id },
    { planId: proPlanId,     moduleId: proMod.id },
    { planId: elitePlanId,   moduleId: starterMod.id },
    { planId: elitePlanId,   moduleId: proMod.id },
    { planId: elitePlanId,   moduleId: eliteMod.id },
  ]);

  // Subscribed users at each tier.
  const su = await createTestUser(); starterUserId = su.id; starterTenantId = su.currentTenantId!;
  const pu = await createTestUser(); proUserId     = pu.id; proTenantId     = pu.currentTenantId!;
  const eu = await createTestUser(); eliteUserId   = eu.id; eliteTenantId   = eu.currentTenantId!;
  const ru = await createTestUser(); superUserId   = ru.id; superTenantId   = ru.currentTenantId!;
  allUserIds.push(starterUserId, proUserId, eliteUserId, superUserId);

  const now = new Date(); const future = new Date(Date.now() + 30 * 86400_000);
  await db.insert(subscriptions).values([
    { userId: starterUserId, planId: starterPlanId, status: 'active', currentPeriodStart: now, currentPeriodEnd: future },
    { userId: proUserId,     planId: proPlanId,     status: 'active', currentPeriodStart: now, currentPeriodEnd: future },
    { userId: eliteUserId,   planId: elitePlanId,   status: 'active', currentPeriodStart: now, currentPeriodEnd: future },
    // super-admin user: ONLY a starter sub, so the test can prove the
    // platform role does not leak into billing config.
    { userId: superUserId,   planId: starterPlanId, status: 'active', currentPeriodStart: now, currentPeriodEnd: future },
  ]);
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superUserId));
});

after(async () => {
  try { await db.delete(addonSubscriptions).where(inArray(addonSubscriptions.userId, allUserIds)); } catch {}
  try { await db.delete(tenantModules).where(inArray(tenantModules.moduleId, allModuleIds)); } catch {}
  try { await db.delete(subscriptions).where(inArray(subscriptions.userId, allUserIds)); } catch {}
  try { await db.delete(planModules).where(inArray(planModules.moduleId, allModuleIds)); } catch {}
  for (const mid of allModuleIds) { try { await cleanupModule(mid); } catch {} }
  for (const uid of allUserIds)   { try { await cleanupUser(uid);   } catch {} }
});

// -------------------- Tier matrix --------------------

test('starter user → starter granted, pro+elite denied', async () => {
  const a = await hasModuleAccess(starterUserId, starterTenantId, starterMod.slug);
  const b = await hasModuleAccess(starterUserId, starterTenantId, proMod.slug);
  const c = await hasModuleAccess(starterUserId, starterTenantId, eliteMod.slug);
  assert.equal(a.hasAccess, true,  'starter mod should be granted to starter user');
  assert.equal(b.hasAccess, false, 'pro mod must be denied to starter user');
  assert.equal(c.hasAccess, false, 'elite mod must be denied to starter user');
});

test('pro user → starter+pro granted, elite denied (no addon)', async () => {
  const a = await hasModuleAccess(proUserId, proTenantId, starterMod.slug);
  const b = await hasModuleAccess(proUserId, proTenantId, proMod.slug);
  const c = await hasModuleAccess(proUserId, proTenantId, eliteMod.slug);
  assert.equal(a.hasAccess, true);
  assert.equal(b.hasAccess, true);
  assert.equal(c.hasAccess, false, 'elite mod must be denied to pro user without addon');
});

test('pro user with active addon for elite module → granted', async () => {
  // Real addon-purchase flow writes BOTH an addon_subscriptions row AND a
  // tenant_modules row with status='purchased' (the tenant-scoped
  // entitlement check resolves access against tenant_modules; addon
  // subs are the billing record). Mirror that here.
  await db.insert(addonSubscriptions).values({
    userId: proUserId,
    tenantId: proTenantId,
    moduleId: eliteMod.id,
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd:   new Date(Date.now() + 30 * 86400_000),
  });
  await db.insert(tenantModules).values({
    tenantId: proTenantId,
    moduleId: eliteMod.id,
    status: 'purchased',
    source: 'addon',
    allowAllMembers: true,
  }).onConflictDoNothing({ target: [tenantModules.tenantId, tenantModules.moduleId] });

  const c = await hasModuleAccess(proUserId, proTenantId, eliteMod.slug);
  assert.equal(c.hasAccess, true, 'elite mod must be granted via active addon');
  assert.equal(c.source, 'addon', 'source should be addon (tenant_modules.status=purchased)');
});

test('elite user → all tiers granted', async () => {
  const a = await hasModuleAccess(eliteUserId, eliteTenantId, starterMod.slug);
  const b = await hasModuleAccess(eliteUserId, eliteTenantId, proMod.slug);
  const c = await hasModuleAccess(eliteUserId, eliteTenantId, eliteMod.slug);
  assert.equal(a.hasAccess, true);
  assert.equal(b.hasAccess, true);
  assert.equal(c.hasAccess, true);
});

// -------------------- super_admin billing isolation --------------------

test('super_admin platform role does NOT promote billing plan', async () => {
  // Sanity: the user IS super_admin and CAN access elite modules
  // (entitlement-side admin shortcut).
  const acc = await hasModuleAccess(superUserId, superTenantId, eliteMod.slug);
  assert.equal(acc.hasAccess, true, 'super_admin gets entitlement access');
  assert.equal(acc.source, 'admin_role');

  // BUT billing config must still derive from their real subscription
  // (Starter), not silently flip to Elite limits/price. This is the
  // "super_admin cannot fake tenant billing state" assertion.
  const cfg = await getUserPlanConfig(superUserId);
  assert.equal(cfg.config.slug, 'starter',
    'super_admin role MUST NOT upgrade billing plan; got ' + cfg.config.slug);
  assert.notEqual(cfg.config.limits.maxAiActionsPerMonth, 9999,
    'super_admin must not silently inherit elite AI limits');
});

test('super_admin with NO subscription falls back to Starter, not Elite', async () => {
  // Drop their subscription to simulate a freshly-bootstrapped super_admin
  // that has not been billed.
  await db.delete(subscriptions).where(eq(subscriptions.userId, superUserId));
  const cfg = await getUserPlanConfig(superUserId);
  assert.equal(cfg.config.slug, 'starter',
    'unsubscribed super_admin must fall back to Starter, never Elite');
});
