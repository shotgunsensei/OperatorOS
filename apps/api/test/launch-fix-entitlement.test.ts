/**
 * Task #66 — entitlement default-enabled fallback regression tests.
 *
 * The launch-fix pass added a runtime fallback in
 * `hasModuleAccessTenantScoped`: when a tenant has NO `tenant_modules`
 * row at all (vs. an explicit `disabled`/`archived` row) AND the
 * module is included in the user's active plan, access is granted with
 * `source: 'plan'`. Explicit-deny semantics (`disabled`, `archived`,
 * `accessLevel='none'`) MUST keep winning.
 *
 * Six cases:
 *   1. Plan-included + no tenant_modules row -> granted ('plan')
 *   2. Explicit 'disabled' tenant_modules row -> denied even if plan-included
 *   3. Explicit 'archived' tenant_modules row -> denied even if plan-included
 *   4. accessLevel='none' overrides plan inclusion -> denied
 *   5. Module NOT in plan + no tenant_modules row -> denied
 *   6. super_admin -> always granted, regardless of plan/tenant_modules
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
  modules, planModules, subscriptions, subscriptionPlans,
} from '../src/schema.js';
import { hasModuleAccess } from '../src/lib/entitlement-service.js';
import {
  ensureSchemaReady, createTestUser, createTestModule, cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

let userId: string;
let tenantId: string;
let elitePlanId: string;
let includedModuleId: string;
let includedModuleSlug: string;
let outsideModuleId: string;
let outsideModuleSlug: string;

before(async () => {
  await ensureSchemaReady();

  // Resolve elite plan (created by seedPlansAndAdmin during boot).
  const [elite] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'elite')).limit(1);
  if (!elite) throw new Error('elite plan must be seeded before running this test');
  elitePlanId = elite.id;

  const u = await createTestUser();
  userId = u.id;
  tenantId = u.currentTenantId!;

  // Subscribe the user to the Elite plan.
  await db.insert(subscriptions).values({
    userId,
    planId: elitePlanId,
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
  });

  // Module that IS included in the Elite plan.
  const m1 = await createTestModule(uniqueId('lf-incl'));
  includedModuleId = m1.id;
  includedModuleSlug = m1.slug;
  await db.insert(planModules).values({ planId: elitePlanId, moduleId: includedModuleId });

  // Module NOT included in any plan.
  const m2 = await createTestModule(uniqueId('lf-out'));
  outsideModuleId = m2.id;
  outsideModuleSlug = m2.slug;
});

after(async () => {
  // Best-effort: drop plan_modules + subs first, then user/modules.
  try { await db.delete(planModules).where(eq(planModules.moduleId, includedModuleId)); } catch {}
  try { await db.delete(subscriptions).where(eq(subscriptions.userId, userId)); } catch {}
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, userId)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenantId)); } catch {}
  try { await cleanupModule(includedModuleId); } catch {}
  try { await cleanupModule(outsideModuleId); } catch {}
  try { await cleanupUser(userId); } catch {}
});

test('case 1 — plan-included module grants without tenant_modules row', async () => {
  // No tenant_modules row exists for (tenantId, includedModuleId).
  const acc = await hasModuleAccess(userId, tenantId, includedModuleSlug);
  assert.equal(acc.hasAccess, true, 'should grant via plan-included fallback');
  assert.equal(acc.source, 'plan');
});

test('case 2 — explicit disabled tenant_modules row denies even if plan-included', async () => {
  await db.insert(tenantModules).values({
    tenantId, moduleId: includedModuleId, status: 'disabled', source: 'included',
  }).onConflictDoNothing({ target: [tenantModules.tenantId, tenantModules.moduleId] });
  await db.update(tenantModules)
    .set({ status: 'disabled' })
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, includedModuleId)));

  const acc = await hasModuleAccess(userId, tenantId, includedModuleSlug);
  assert.equal(acc.hasAccess, false);
  assert.equal(acc.reason, 'tenant_module_disabled');
});

test('case 3 — explicit archived tenant_modules row denies even if plan-included', async () => {
  await db.update(tenantModules)
    .set({ status: 'archived' })
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, includedModuleId)));

  const acc = await hasModuleAccess(userId, tenantId, includedModuleSlug);
  assert.equal(acc.hasAccess, false);
  assert.equal(acc.reason, 'tenant_module_disabled');
});

test('case 4 — accessLevel="none" denies even when tenant_modules is enabled and plan-included', async () => {
  // Re-enable the row + opt-in all members.
  await db.update(tenantModules)
    .set({ status: 'enabled', allowAllMembers: true })
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, includedModuleId)));
  // Explicit deny for the user.
  await db.insert(tenantUserModuleAccess).values({
    tenantId, userId, moduleId: includedModuleId, accessLevel: 'none',
  }).onConflictDoNothing({
    target: [tenantUserModuleAccess.tenantId, tenantUserModuleAccess.userId, tenantUserModuleAccess.moduleId],
  });
  await db.update(tenantUserModuleAccess)
    .set({ accessLevel: 'none' })
    .where(and(
      eq(tenantUserModuleAccess.tenantId, tenantId),
      eq(tenantUserModuleAccess.userId, userId),
      eq(tenantUserModuleAccess.moduleId, includedModuleId),
    ));

  const acc = await hasModuleAccess(userId, tenantId, includedModuleSlug);
  assert.equal(acc.hasAccess, false);
  assert.equal(acc.reason, 'explicit_deny');
});

test('case 5 — module not in plan + no tenant_modules row denies', async () => {
  const acc = await hasModuleAccess(userId, tenantId, outsideModuleSlug);
  assert.equal(acc.hasAccess, false);
  // The reason can be either 'tenant_module_disabled' (existing branch) or
  // 'no_plan_grant' (new fallback). Accept either to keep the test resilient
  // across implementation tweaks.
  assert.ok(['tenant_module_disabled', 'no_plan_grant', 'no_tenant_grant'].includes(acc.reason ?? ''),
    `unexpected reason: ${acc.reason}`);
});

test('case 6 — super_admin always granted', async () => {
  await db.update(users)
    .set({ platformRole: 'super_admin' })
    .where(eq(users.id, userId));
  const acc = await hasModuleAccess(userId, tenantId, outsideModuleSlug);
  assert.equal(acc.hasAccess, true);
  assert.equal(acc.source, 'admin_role');
  // restore so cleanup still runs cleanly
  await db.update(users).set({ platformRole: 'user' }).where(eq(users.id, userId));
});
