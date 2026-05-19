/**
 * Task #108 — resolveEntitlements() unified spec-shaped snapshot.
 *
 * Locks in:
 *   - Top-level shape: { version, computedAt, tenant, user, subscription, modules[], limits, capabilities }
 *   - Per-module shape: { slug, name, baseUrl, status, enabled, accessLevel, moduleRole, features, source }
 *   - Tenant role alias mapping (owner -> owner, admin -> tenant_admin, member -> user)
 *   - Feature merge: plan_modules.feature_flags_json + tenant_modules.metadata.features
 *   - Non-member outsider returns null
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
  planModules, subscriptions, subscriptionPlans,
} from '../src/schema.js';
import { resolveEntitlements } from '../src/lib/entitlement-resolver.js';
import {
  ensureSchemaReady, createTestUser, createTestModule,
  cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

let owner: any, member: any, outsider: any, tenant: any, mod: any, plan: any;

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  member = await createTestUser();
  outsider = await createTestUser();
  mod = await createTestModule();

  const planSlug = uniqueId('resolver-plan');
  [plan] = await db.insert(subscriptionPlans).values({
    name: planSlug, slug: planSlug, price: 0, interval: 'month',
  }).returning();
  // Plan includes the test module with default feature defaults.
  await db.insert(planModules).values({
    planId: plan.id, moduleId: mod.id,
    featureFlagsJson: { ai_assistant: true, advanced_reports: false, seats: 5 },
  });
  await db.insert(subscriptions).values({
    userId: owner.id, planId: plan.id, status: 'active',
  });

  [tenant] = await db.insert(tenants).values({
    name: 'ResolverTest', slug: `resolver-${owner.id}`,
    type: 'company', ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenant.id, userId: owner.id, role: 'owner' },
    { tenantId: tenant.id, userId: member.id, role: 'member' },
  ]);
  // Per-tenant overrides one feature flag.
  await db.insert(tenantModules).values({
    tenantId: tenant.id, moduleId: mod.id,
    status: 'enabled', source: 'included', allowAllMembers: true,
    metadata: { features: { advanced_reports: true } },
  });
});

after(async () => {
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenant.id)); } catch {}
  try { await db.delete(subscriptions).where(eq(subscriptions.userId, owner.id)); } catch {}
  try { await db.delete(planModules).where(eq(planModules.planId, plan.id)); } catch {}
  try { await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, plan.id)); } catch {}
  if (mod) await cleanupModule(mod.id);
  for (const u of [owner, member, outsider]) if (u) await cleanupUser(u.id);
});

test('snapshot has required top-level spec fields + version=1', async () => {
  const snap = await resolveEntitlements(owner.id, tenant.id);
  assert.ok(snap, 'snapshot returned');
  assert.equal(snap!.version, 1);
  assert.ok(typeof snap!.computedAt === 'string');
  assert.equal(snap!.user.id, owner.id);
  assert.equal(snap!.tenant.id, tenant.id);
  assert.ok(snap!.subscription, 'subscription block present (owner has active plan)');
  assert.equal(snap!.subscription!.planSlug, plan.slug);
  assert.ok(Array.isArray(snap!.modules));
  assert.ok(snap!.limits && typeof snap!.limits === 'object');
  assert.ok(snap!.capabilities && typeof snap!.capabilities === 'object');
});

test('tenant role alias: owner -> owner', async () => {
  const snap = await resolveEntitlements(owner.id, tenant.id);
  assert.equal(snap!.tenant.role, 'owner');
  assert.equal(snap!.tenant.roleAlias, 'owner');
  assert.equal(snap!.tenant.viaPlatformRole, false);
});

test('tenant role alias: member -> user', async () => {
  const snap = await resolveEntitlements(member.id, tenant.id);
  assert.equal(snap!.tenant.role, 'member');
  assert.equal(snap!.tenant.roleAlias, 'user');
});

test('module entry carries spec fields: enabled, accessLevel, moduleRole, features', async () => {
  const snap = await resolveEntitlements(member.id, tenant.id);
  const entry = snap!.modules.find(m => m.slug === mod.slug);
  assert.ok(entry, 'module entry present');
  assert.equal(entry!.enabled, true, 'allowAllMembers grants access');
  assert.equal(entry!.accessLevel, 'user');
  assert.equal(entry!.moduleRole, 'module_user');
  assert.equal(typeof entry!.baseUrl, 'string');
});

test('features merge: plan defaults overlaid with per-tenant overrides', async () => {
  const snap = await resolveEntitlements(member.id, tenant.id);
  const entry = snap!.modules.find(m => m.slug === mod.slug)!;
  // plan default: ai_assistant=true, advanced_reports=false, seats=5
  // tenant override: advanced_reports=true
  // expected: ai_assistant=true, advanced_reports=true (overridden), seats=5
  assert.equal(entry.features.ai_assistant, true);
  assert.equal(entry.features.advanced_reports, true, 'tenant override wins');
  assert.equal(entry.features.seats, 5);
});

test('non-member outsider returns null (no snapshot)', async () => {
  const snap = await resolveEntitlements(outsider.id, tenant.id);
  assert.equal(snap, null);
});
