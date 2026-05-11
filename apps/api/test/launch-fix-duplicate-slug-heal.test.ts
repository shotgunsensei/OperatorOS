/**
 * Task #68 — `launchFixPreSeed` duplicate-slug self-heal regression.
 *
 * `launchFixPreSeed` has a defensive branch that fires when BOTH the
 * legacy `bf-os` and canonical `brandforgeos` module rows exist at boot
 * (e.g. an old install renamed once, then a manual re-insert recreated
 * the legacy slug). All FK dependents (`plan_modules`, `tenant_modules`,
 * `tenant_user_module_access`, `addon_subscriptions`,
 * `entitlement_overrides`) must be re-pointed from the legacy id to the
 * canonical id WITHOUT colliding on the per-table composite uniqueness
 * (`(plan_id, module_id)`, `(tenant_id, module_id)`,
 * `(tenant_id, user_id, module_id)`), and the legacy row must be
 * dropped. Running the heal twice must be a no-op the second time.
 *
 * The test seeds:
 *   - a fresh `bf-os` row alongside the existing `brandforgeos` row
 *   - "re-point" dependents on `bf-os` only (one tenant + one user)
 *   - "collision" dependents on BOTH `bf-os` and `brandforgeos` for a
 *     second tenant + user, so the launch-fix logic has to fall through
 *     its `NOT EXISTS` guard and drop the legacy row instead of dup-
 *     inserting it
 *
 * After two `launchFixPreSeed` calls, the test asserts:
 *   - the legacy `bf-os` row is gone
 *   - every "re-point" dependent now lives on the canonical id
 *   - every "collision" dependent has exactly one row on the canonical
 *     id (the one that was already there) and zero on the legacy id
 *   - `addon_subscriptions` + `entitlement_overrides` (no composite
 *     uniqueness) are simply re-pointed in place
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules, planModules, tenantModules, tenantUserModuleAccess,
  addonSubscriptions, entitlementOverrides, subscriptionPlans,
} from '../src/schema.js';
import { launchFixPreSeed } from '../src/lib/launch-fix-init.js';
import {
  ensureSchemaReady, createTestUser, cleanupUser, uniqueId,
} from './_setup.js';

let canonicalId: string;
let legacyId: string;
let elitePlanId: string;

let repointUserId: string; let repointTenantId: string;
let collisionUserId: string; let collisionTenantId: string;

const allUserIds: string[] = [];

async function ensureCanonicalModule(): Promise<string> {
  const [existing] = await db.select().from(modules)
    .where(eq(modules.slug, 'brandforgeos')).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(modules).values({
    slug: 'brandforgeos',
    name: 'BrandForgeOS',
    description: 'launch-fix duplicate-heal test fixture',
    baseUrl: 'https://example.test',
    status: 'live',
    planMin: 'elite',
    ord: 0,
  }).returning();
  return created.id;
}

async function freshLegacyModule(): Promise<string> {
  // Drop any leftover `bf-os` row from a previous failed run; a unique
  // constraint on `slug` would otherwise reject the insert.
  await db.delete(modules).where(eq(modules.slug, 'bf-os'));
  const [created] = await db.insert(modules).values({
    slug: 'bf-os',
    name: 'BrandForge OS (legacy)',
    description: 'launch-fix duplicate-heal test fixture',
    baseUrl: 'https://example.test',
    status: 'live',
    planMin: 'elite',
    ord: 0,
  }).returning();
  return created.id;
}

before(async () => {
  await ensureSchemaReady();

  const [elite] = await db.select().from(subscriptionPlans)
    .where(eq(subscriptionPlans.slug, 'elite')).limit(1);
  if (!elite) throw new Error('elite plan must be seeded before running this test');
  elitePlanId = elite.id;

  canonicalId = await ensureCanonicalModule();
  legacyId = await freshLegacyModule();

  const ru = await createTestUser();
  repointUserId = ru.id; repointTenantId = ru.currentTenantId!;
  const cu = await createTestUser();
  collisionUserId = cu.id; collisionTenantId = cu.currentTenantId!;
  allUserIds.push(repointUserId, collisionUserId);

  // --- "re-point only" dependents (legacy id, no canonical counterpart) ---
  await db.insert(tenantModules).values({
    tenantId: repointTenantId, moduleId: legacyId,
    status: 'enabled', source: 'included', allowAllMembers: true,
  });
  await db.insert(tenantUserModuleAccess).values({
    tenantId: repointTenantId, userId: repointUserId,
    moduleId: legacyId, accessLevel: 'manager',
  });

  // --- "collision" dependents (legacy AND canonical both already exist) ---
  await db.insert(tenantModules).values({
    tenantId: collisionTenantId, moduleId: canonicalId,
    status: 'enabled', source: 'included', allowAllMembers: true,
  });
  await db.insert(tenantModules).values({
    tenantId: collisionTenantId, moduleId: legacyId,
    status: 'enabled', source: 'included', allowAllMembers: true,
  });
  await db.insert(tenantUserModuleAccess).values({
    tenantId: collisionTenantId, userId: collisionUserId,
    moduleId: canonicalId, accessLevel: 'user',
  });
  await db.insert(tenantUserModuleAccess).values({
    tenantId: collisionTenantId, userId: collisionUserId,
    moduleId: legacyId, accessLevel: 'manager',
  });

  // plan_modules: collision case — both (elitePlanId, legacy) and
  // (elitePlanId, canonical) exist. We have to be careful not to
  // disturb any pre-existing (elitePlanId, canonical) row from a real
  // seedModules run; check first and only insert what's missing.
  const existingCanonicalLink = await db.select().from(planModules).where(and(
    eq(planModules.planId, elitePlanId), eq(planModules.moduleId, canonicalId),
  )).limit(1);
  if (existingCanonicalLink.length === 0) {
    await db.insert(planModules).values({ planId: elitePlanId, moduleId: canonicalId });
  }
  await db.insert(planModules).values({ planId: elitePlanId, moduleId: legacyId });

  // addon_subscriptions + entitlement_overrides: no composite uniqueness,
  // launch-fix re-points in place.
  await db.insert(addonSubscriptions).values({
    userId: repointUserId, moduleId: legacyId, status: 'active',
    amount: 1500, tenantId: repointTenantId,
  });
  await db.insert(entitlementOverrides).values({
    userId: repointUserId, moduleId: legacyId, grant: true,
    reason: 'launch-fix-duplicate-heal-test',
    createdByAdminId: repointUserId, tenantId: repointTenantId,
  });
});

after(async () => {
  // Best-effort: scrub every dependent row pointing at either id, then
  // drop the legacy row (if the heal failed mid-test) and the test
  // users. We deliberately do NOT delete the canonical `brandforgeos`
  // row — it's part of the seeded catalog the rest of the suite relies
  // on.
  const ids = [legacyId, canonicalId].filter(Boolean);
  try { await db.delete(addonSubscriptions).where(inArray(addonSubscriptions.userId, allUserIds)); } catch {}
  try { await db.delete(entitlementOverrides).where(inArray(entitlementOverrides.userId, allUserIds)); } catch {}
  try { await db.delete(tenantUserModuleAccess).where(inArray(tenantUserModuleAccess.userId, allUserIds)); } catch {}
  try {
    await db.delete(tenantModules).where(and(
      inArray(tenantModules.tenantId, [repointTenantId, collisionTenantId].filter(Boolean)),
      inArray(tenantModules.moduleId, ids),
    ));
  } catch {}
  // Remove ONLY the test-added (elitePlanId, legacyId) link; leave the
  // canonical link alone (it may have existed before this test ran).
  try {
    await db.delete(planModules).where(and(
      eq(planModules.planId, elitePlanId), eq(planModules.moduleId, legacyId),
    ));
  } catch {}
  try { await db.delete(modules).where(eq(modules.slug, 'bf-os')); } catch {}
  for (const uid of allUserIds) { try { await cleanupUser(uid); } catch {} }
});

test('first launchFixPreSeed call heals duplicate slug, re-points FK dependents, drops legacy row', async () => {
  await launchFixPreSeed();

  // Legacy `bf-os` row is gone.
  const legacyRows = await db.select().from(modules).where(eq(modules.slug, 'bf-os'));
  assert.equal(legacyRows.length, 0, 'legacy bf-os module row should be deleted');
  const legacyById = await db.select().from(modules).where(eq(modules.id, legacyId));
  assert.equal(legacyById.length, 0, 'legacy module id should be gone');

  // Canonical row still exists.
  const [canonical] = await db.select().from(modules).where(eq(modules.id, canonicalId));
  assert.ok(canonical, 'canonical brandforgeos row must still exist');
  assert.equal(canonical.slug, 'brandforgeos');

  // --- Re-point case: rows now live on the canonical id ---
  const tmRepoint = await db.select().from(tenantModules)
    .where(eq(tenantModules.tenantId, repointTenantId));
  assert.equal(tmRepoint.length, 1, 'repoint tenant should have exactly 1 tenant_modules row');
  assert.equal(tmRepoint[0].moduleId, canonicalId, 'tenant_modules row must point at canonical id');

  const tumaRepoint = await db.select().from(tenantUserModuleAccess)
    .where(eq(tenantUserModuleAccess.userId, repointUserId));
  assert.equal(tumaRepoint.length, 1, 'repoint user should have exactly 1 tenant_user_module_access row');
  assert.equal(tumaRepoint[0].moduleId, canonicalId);
  assert.equal(tumaRepoint[0].accessLevel, 'manager', 're-point must preserve grant payload');

  // --- Collision case: only the canonical row remains, never duplicated ---
  const tmCollision = await db.select().from(tenantModules)
    .where(eq(tenantModules.tenantId, collisionTenantId));
  assert.equal(tmCollision.length, 1, 'collision tenant must end with exactly 1 tenant_modules row');
  assert.equal(tmCollision[0].moduleId, canonicalId);

  const tumaCollision = await db.select().from(tenantUserModuleAccess)
    .where(eq(tenantUserModuleAccess.userId, collisionUserId));
  assert.equal(tumaCollision.length, 1, 'collision user must end with exactly 1 tuma row');
  assert.equal(tumaCollision[0].moduleId, canonicalId);
  // The pre-existing canonical grant ('user') must be preserved — the
  // legacy ('manager') row is the one that should be dropped, not the
  // other way around. Asserts the launch-fix didn't accidentally
  // overwrite the canonical row's payload.
  assert.equal(tumaCollision[0].accessLevel, 'user',
    'pre-existing canonical grant must survive the heal unchanged');

  // plan_modules: exactly one (elitePlanId, canonicalId) row, zero on legacy.
  const pmCanonical = await db.select().from(planModules).where(and(
    eq(planModules.planId, elitePlanId), eq(planModules.moduleId, canonicalId),
  ));
  assert.equal(pmCanonical.length, 1, 'plan_modules must have exactly 1 (elite, canonical) row');
  const pmLegacy = await db.select().from(planModules)
    .where(eq(planModules.moduleId, legacyId));
  assert.equal(pmLegacy.length, 0, 'plan_modules legacy rows should be gone');

  // addon_subscriptions + entitlement_overrides re-pointed in place.
  const addonRows = await db.select().from(addonSubscriptions)
    .where(eq(addonSubscriptions.userId, repointUserId));
  assert.equal(addonRows.length, 1);
  assert.equal(addonRows[0].moduleId, canonicalId, 'addon_subscriptions must re-point in place');

  const eoRows = await db.select().from(entitlementOverrides)
    .where(eq(entitlementOverrides.userId, repointUserId));
  assert.equal(eoRows.length, 1);
  assert.equal(eoRows[0].moduleId, canonicalId, 'entitlement_overrides must re-point in place');
});

test('second launchFixPreSeed call is a no-op (idempotent across retries)', async () => {
  // Snapshot relevant state, run the heal again, assert nothing moved.
  const before = {
    moduleCount: (await db.select().from(modules).where(eq(modules.slug, 'brandforgeos'))).length,
    legacyCount: (await db.select().from(modules).where(eq(modules.slug, 'bf-os'))).length,
    tmRepoint: (await db.select().from(tenantModules).where(eq(tenantModules.tenantId, repointTenantId))).length,
    tmCollision: (await db.select().from(tenantModules).where(eq(tenantModules.tenantId, collisionTenantId))).length,
    tumaRepoint: (await db.select().from(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, repointUserId))).length,
    tumaCollision: (await db.select().from(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, collisionUserId))).length,
    pmCanonical: (await db.select().from(planModules).where(and(
      eq(planModules.planId, elitePlanId), eq(planModules.moduleId, canonicalId),
    ))).length,
  };

  await launchFixPreSeed();

  const after = {
    moduleCount: (await db.select().from(modules).where(eq(modules.slug, 'brandforgeos'))).length,
    legacyCount: (await db.select().from(modules).where(eq(modules.slug, 'bf-os'))).length,
    tmRepoint: (await db.select().from(tenantModules).where(eq(tenantModules.tenantId, repointTenantId))).length,
    tmCollision: (await db.select().from(tenantModules).where(eq(tenantModules.tenantId, collisionTenantId))).length,
    tumaRepoint: (await db.select().from(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, repointUserId))).length,
    tumaCollision: (await db.select().from(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, collisionUserId))).length,
    pmCanonical: (await db.select().from(planModules).where(and(
      eq(planModules.planId, elitePlanId), eq(planModules.moduleId, canonicalId),
    ))).length,
  };

  assert.deepEqual(after, before, 'second heal must be a pure no-op');
  assert.equal(after.legacyCount, 0, 'legacy slug must remain absent after retry');
  assert.equal(after.moduleCount, 1, 'canonical slug must remain unique after retry');
});
