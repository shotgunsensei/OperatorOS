/**
 * Task #81 — bootstrap idempotency for "Shotgun Ninjas Productions"
 *
 * Verifies that calling fixShotgunTenant():
 *   - Creates a canonical tenant with slug=shotgun-ninjas, status=active,
 *     type=company, ownerUserId=john when missing.
 *   - Sets john's current_tenant_id to the canonical tenant.
 *   - Adds an owner-role tenantUsers row.
 *   - Is idempotent — second call leaves tenant id, slug, name, status,
 *     type, ownerUserId untouched and creates no duplicate row.
 *   - Does NOT mutate other unrelated tenants.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
  subscriptions, addonSubscriptions, tenantEntitlements,
} from '../src/schema.js';
import { fixShotgunTenant } from '../src/lib/launch-fix-init.js';
import { ensureSchemaReady, uniqueId } from './_setup.js';

const ADMIN_EMAIL = `bootstrap-test-${uniqueId('john')}@shotgunninjas.com`;
let originalAdminEmail: string | undefined;
let john: any;
let unrelatedTenant: any;
let unrelatedSnapshot: any;

before(async () => {
  await ensureSchemaReady();
  // Create john manually (bypass createTestUser to control email exactly).
  [john] = await db.insert(users).values({
    email: ADMIN_EMAIL,
    name: 'John Test',
    passwordHash: 'x',
    role: 'user',
    platformRole: 'super_admin',
  }).returning();

  // Create an unrelated tenant we MUST NOT touch.
  [unrelatedTenant] = await db.insert(tenants).values({
    name: 'Unrelated Co', slug: `unrelated-${uniqueId('t').replace(/_/g, '-')}`,
    type: 'company', ownerUserId: john.id, status: 'active',
  }).returning();
  unrelatedSnapshot = { ...unrelatedTenant };

  // Make sure no canonical row exists from a prior run. Clear FK
  // children before the parent tenant row.
  const stale = await db.select().from(tenants).where(eq(tenants.slug, 'shotgun-ninjas'));
  for (const s of stale) {
    await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, s.id));
    await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, s.id));
    await db.delete(tenantModules).where(eq(tenantModules.tenantId, s.id));
    await db.delete(addonSubscriptions).where(eq(addonSubscriptions.tenantId, s.id));
    await db.delete(subscriptions).where(eq(subscriptions.tenantId, s.id));
    await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, s.id));
    // null out any users still pointing here so we don't FK on users.current_tenant_id
    await db.update(users).set({ currentTenantId: null }).where(eq(users.currentTenantId, s.id));
    await db.delete(tenants).where(eq(tenants.id, s.id));
  }

  originalAdminEmail = process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL;
  process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL = ADMIN_EMAIL;
});

after(async () => {
  if (originalAdminEmail == null) delete process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL;
  else process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL = originalAdminEmail;

  const canonical = await db.select().from(tenants).where(eq(tenants.slug, 'shotgun-ninjas'));
  for (const t of canonical) {
    if (t.ownerUserId === john.id) {
      await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, t.id));
      await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, t.id));
      await db.delete(tenantModules).where(eq(tenantModules.tenantId, t.id));
      await db.delete(addonSubscriptions).where(eq(addonSubscriptions.tenantId, t.id));
      await db.delete(subscriptions).where(eq(subscriptions.tenantId, t.id));
      await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id));
      await db.update(users).set({ currentTenantId: null }).where(eq(users.currentTenantId, t.id));
      await db.delete(tenants).where(eq(tenants.id, t.id));
    }
  }
  if (unrelatedTenant) {
    await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, unrelatedTenant.id));
    await db.delete(tenants).where(eq(tenants.id, unrelatedTenant.id));
  }
  if (john) await db.delete(users).where(eq(users.id, john.id));
});

test('fixShotgunTenant: creates canonical tenant when missing', async () => {
  await fixShotgunTenant();

  const [canonical] = await db.select().from(tenants).where(eq(tenants.slug, 'shotgun-ninjas'));
  assert.ok(canonical, 'canonical tenant created');
  assert.equal(canonical.name, 'Shotgun Ninjas Productions');
  assert.equal(canonical.slug, 'shotgun-ninjas');
  assert.equal(canonical.type, 'company');
  assert.equal(canonical.status, 'active');
  assert.equal(canonical.ownerUserId, john.id);

  const memberships = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, canonical.id),
    eq(tenantUsers.userId, john.id),
  ));
  assert.equal(memberships.length, 1, 'one owner membership');
  assert.equal(memberships[0].role, 'owner');

  const [johnAfter] = await db.select().from(users).where(eq(users.id, john.id));
  assert.equal(johnAfter.currentTenantId, canonical.id, 'current_tenant_id repointed');
});

test('fixShotgunTenant: idempotent — second call is a no-op on canonical row', async () => {
  const [before] = await db.select().from(tenants).where(eq(tenants.slug, 'shotgun-ninjas'));
  await fixShotgunTenant();
  await fixShotgunTenant();
  const all = await db.select().from(tenants).where(eq(tenants.slug, 'shotgun-ninjas'));
  assert.equal(all.length, 1, 'no duplicate tenant created');
  const after = all[0];
  assert.equal(after.id, before.id, 'same tenant id');
  assert.equal(after.slug, before.slug);
  assert.equal(after.name, before.name);
  assert.equal(after.status, before.status);
  assert.equal(after.type, before.type);
  assert.equal(after.ownerUserId, before.ownerUserId);

  const memberships = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, after.id),
    eq(tenantUsers.userId, john.id),
  ));
  assert.equal(memberships.length, 1, 'no duplicate membership');
});

test('fixShotgunTenant: does not mutate unrelated tenants', async () => {
  await fixShotgunTenant();
  const [unrelatedAfter] = await db.select().from(tenants).where(eq(tenants.id, unrelatedTenant.id));
  assert.equal(unrelatedAfter.name, unrelatedSnapshot.name);
  assert.equal(unrelatedAfter.slug, unrelatedSnapshot.slug);
  assert.equal(unrelatedAfter.status, unrelatedSnapshot.status);
  assert.equal(unrelatedAfter.type, unrelatedSnapshot.type);
});

test('fixShotgunTenant: never modifies an existing canonical tenant\'s fields', async () => {
  // The canonical tenant already exists from prior tests. Drift its
  // status/name and confirm fixShotgunTenant() does NOT change them
  // back — this codifies the "create-if-missing only" requirement.
  const [canonical] = await db.select().from(tenants).where(eq(tenants.slug, 'shotgun-ninjas'));
  await db.update(tenants).set({ status: 'archived', archivedAt: new Date(), name: 'Drifted Name' })
    .where(eq(tenants.id, canonical.id));

  await fixShotgunTenant();
  const [after] = await db.select().from(tenants).where(eq(tenants.id, canonical.id));
  assert.equal(after.status, 'archived', 'status NOT mutated back to active');
  assert.equal(after.name, 'Drifted Name', 'name NOT mutated back');
  assert.notEqual(after.archivedAt, null, 'archivedAt NOT cleared');
});
