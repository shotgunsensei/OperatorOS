/**
 * Task #66 (review fix #5) — "Elite tenant unlocks all 11 live modules".
 *
 * Verifies the entitlement service against the REAL seeded MODULE_CATALOG
 * (not synthetic fixtures) so the tier matrix can never silently break
 * when a new module ships. Asserts:
 *
 *  1. Every module in MODULE_CATALOG with `defaultStatus === 'live'` is
 *     accessible to an Elite-tier tenant via the default-enabled fallback
 *     (no tenant_modules row needs to be hand-inserted — Elite owns the
 *     full catalog by inclusion).
 *  2. A Starter-tier tenant is denied for every module whose `planMin`
 *     is above starter, proving the gate is actually evaluated and not
 *     short-circuited.
 *  3. An explicit `tenant_modules.status='disabled'` row for an Elite
 *     tenant denies access for that specific slug — the default-enabled
 *     fallback only applies when the row is absent, never overriding an
 *     intentional admin disable.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  subscriptions, subscriptionPlans, modules, planModules, tenantModules,
} from '../src/schema.js';
import { hasModuleAccess } from '../src/lib/entitlement-service.js';
import { MODULE_CATALOG, PLAN_TIER_RANK } from '@operatoros/sdk';
import { seedModules } from '../src/lib/saas-db-init.js';
import { ensureSchemaReady, createTestUser, cleanupUser } from './_setup.js';

const LIVE_CATALOG = MODULE_CATALOG.filter(m => m.defaultStatus === 'live');

let elitePlanId: string;
let starterPlanId: string;
let eliteUserId: string;   let eliteTenantId: string;
let starterUserId: string; let starterTenantId: string;

const allUserIds: string[] = [];

before(async () => {
  await ensureSchemaReady();
  // Make sure every catalog slug exists in the modules table (seed is
  // idempotent — safe to call from a test even if the API already ran it).
  await seedModules();

  const [s] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'starter')).limit(1);
  const [e] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'elite')).limit(1);
  if (!s || !e) throw new Error('starter/elite plans must be seeded');
  starterPlanId = s.id; elitePlanId = e.id;

  // Wire plan_modules so the default-enabled fallback (subscriptions ->
  // plan_modules join) can resolve each catalog module to the right tier.
  // Idempotent — only insert links that aren't already present.
  const allMods = await db.select().from(modules)
    .where(inArray(modules.slug, LIVE_CATALOG.map(c => c.slug)));
  const slugToId = new Map(allMods.map(m => [m.slug, m.id]));
  const existingLinks = await db.select().from(planModules)
    .where(inArray(planModules.planId, [starterPlanId, elitePlanId]));
  const linkKey = (pid: string, mid: string) => `${pid}:${mid}`;
  const have = new Set(existingLinks.map(l => linkKey(l.planId, l.moduleId)));
  const toInsert: Array<{ planId: string; moduleId: string }> = [];
  for (const cat of LIVE_CATALOG) {
    const mid = slugToId.get(cat.slug); if (!mid) continue;
    const tier = PLAN_TIER_RANK[cat.planMin];
    // Starter (rank 1) gets only starter modules; Elite (rank 3) gets all.
    if (tier <= 1 && !have.has(linkKey(starterPlanId, mid))) {
      toInsert.push({ planId: starterPlanId, moduleId: mid });
    }
    if (!have.has(linkKey(elitePlanId, mid))) {
      toInsert.push({ planId: elitePlanId, moduleId: mid });
    }
  }
  if (toInsert.length > 0) await db.insert(planModules).values(toInsert);

  const eu = await createTestUser(); eliteUserId   = eu.id; eliteTenantId   = eu.currentTenantId!;
  const su = await createTestUser(); starterUserId = su.id; starterTenantId = su.currentTenantId!;
  allUserIds.push(eliteUserId, starterUserId);

  const now = new Date(); const future = new Date(Date.now() + 30 * 86400_000);
  await db.insert(subscriptions).values([
    { userId: eliteUserId,   planId: elitePlanId,   status: 'active', currentPeriodStart: now, currentPeriodEnd: future },
    { userId: starterUserId, planId: starterPlanId, status: 'active', currentPeriodStart: now, currentPeriodEnd: future },
  ]);
});

after(async () => {
  try { await db.delete(subscriptions).where(inArray(subscriptions.userId, allUserIds)); } catch {}
  for (const uid of allUserIds) { try { await cleanupUser(uid); } catch {} }
});

test(`Elite tenant unlocks ALL ${LIVE_CATALOG.length} live MODULE_CATALOG modules (default-enabled fallback)`, async () => {
  // Sanity: the catalog still has the launch-target 11 live modules.
  // If this number ever drifts (modules added/retired), update the
  // expectation deliberately — the assertion exists to force a code-
  // review conversation when the live ecosystem footprint changes.
  assert.equal(LIVE_CATALOG.length, 11,
    `expected 11 live modules in MODULE_CATALOG, got ${LIVE_CATALOG.length}`);

  const denied: string[] = [];
  for (const cat of LIVE_CATALOG) {
    const acc = await hasModuleAccess(eliteUserId, eliteTenantId, cat.slug);
    if (!acc.hasAccess) denied.push(`${cat.slug} (reason=${acc.reason ?? 'unknown'})`);
  }
  assert.deepEqual(denied, [],
    `Elite tenant must unlock every live module; denied: ${denied.join(', ')}`);
});

test('Starter tenant is denied for every pro/elite-tier live module', async () => {
  const wronglyGranted: string[] = [];
  for (const cat of LIVE_CATALOG) {
    if (PLAN_TIER_RANK[cat.planMin] <= 1) continue; // starter-tier modules are legitimately granted
    const acc = await hasModuleAccess(starterUserId, starterTenantId, cat.slug);
    if (acc.hasAccess) wronglyGranted.push(`${cat.slug} (planMin=${cat.planMin}, source=${acc.source})`);
  }
  assert.deepEqual(wronglyGranted, [],
    `Starter tenant must be denied for pro/elite modules; wrongly granted: ${wronglyGranted.join(', ')}`);
});

test('Explicit tenant_modules.status=disabled overrides Elite default-enabled fallback', async () => {
  // Pick the first elite-tier slug as the disable target.
  const target = LIVE_CATALOG.find(c => c.planMin === 'elite');
  assert.ok(target, 'expected at least one elite-tier module in catalog');

  const [mod] = await db.select().from(modules).where(eq(modules.slug, target.slug)).limit(1);
  assert.ok(mod, `module row must exist for ${target.slug}`);

  await db.insert(tenantModules).values({
    tenantId: eliteTenantId,
    moduleId: mod.id,
    status: 'disabled',
    source: 'admin',
    allowAllMembers: false,
  }).onConflictDoUpdate({
    target: [tenantModules.tenantId, tenantModules.moduleId],
    set: { status: 'disabled', source: 'admin', allowAllMembers: false },
  });

  try {
    const acc = await hasModuleAccess(eliteUserId, eliteTenantId, target.slug);
    assert.equal(acc.hasAccess, false,
      `explicit disable must win over Elite plan-grant fallback for ${target.slug}`);
    assert.equal(acc.reason, 'tenant_module_disabled');
  } finally {
    await db.delete(tenantModules).where(and(
      eq(tenantModules.tenantId, eliteTenantId),
      eq(tenantModules.moduleId, mod.id),
    ));
  }
});
