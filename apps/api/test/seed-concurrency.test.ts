/**
 * Task 21 — first-boot tenant setup must be safe under multi-process race.
 *
 * `backfillPersonalTenants`, `bootstrapSuperAdmin`, and `seedDemoCoTenant`
 * all run on every API boot. In a multi-replica deploy two pods can boot
 * in parallel; without ON CONFLICT handling the loser of a race on
 * `tenants.slug` (or on a tenant-membership composite key) crashes.
 *
 * These tests run each seed function twice concurrently and assert:
 *   - neither call throws
 *   - exactly one row per natural key remains in the DB
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users,
  tenants,
  tenantUsers,
  tenantModules,
  tenantUserModuleAccess,
  modules,
} from '../src/schema.js';
import {
  backfillPersonalTenants,
  bootstrapSuperAdmin,
  seedDemoCoTenant,
} from '../src/lib/saas-db-init.js';
import { ensureSchemaReady, createTestUser, cleanupUser, uniqueId } from './_setup.js';

const cleanupTenantSlugs: string[] = [];
const cleanupUserIds: string[] = [];
const cleanupModuleIds: string[] = [];

async function purgeTenantBySlug(slug: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!t) return;
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, t.id)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, t.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
}

before(async () => {
  await ensureSchemaReady();
});

after(async () => {
  for (const slug of cleanupTenantSlugs) await purgeTenantBySlug(slug);
  for (const id of cleanupUserIds) {
    // Personal tenant created by the backfill must be purged first so the
    // tenant_users FK to users doesn't block the user delete.
    await purgeTenantBySlug(`personal-${id}`);
    await cleanupUser(id);
  }
  if (cleanupModuleIds.length) {
    try { await db.delete(modules).where(inArray(modules.id, cleanupModuleIds)); } catch {}
  }
});

test('backfillPersonalTenants is race-safe when invoked in parallel', async () => {
  // Fresh users with no personal tenant yet.
  const u1 = await createTestUser();
  const u2 = await createTestUser();
  cleanupUserIds.push(u1.id, u2.id);

  await Promise.all([
    backfillPersonalTenants(),
    backfillPersonalTenants(),
  ]);

  for (const u of [u1, u2]) {
    const slug = `personal-${u.id}`;
    const tRows = await db.select().from(tenants).where(eq(tenants.slug, slug));
    assert.equal(tRows.length, 1, `expected exactly one personal tenant for ${u.email}`);

    const tuRows = await db.select().from(tenantUsers)
      .where(and(eq(tenantUsers.tenantId, tRows[0].id), eq(tenantUsers.userId, u.id)));
    assert.equal(tuRows.length, 1, `expected exactly one owner membership for ${u.email}`);
    assert.equal(tuRows[0].role, 'owner');
  }
});

test('bootstrapSuperAdmin is race-safe when invoked in parallel', async () => {
  const u = await createTestUser();
  cleanupUserIds.push(u.id);

  const original = process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL;
  process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL = u.email;
  try {
    await Promise.all([bootstrapSuperAdmin(), bootstrapSuperAdmin()]);
  } finally {
    if (original === undefined) delete process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL;
    else process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL = original;
  }

  const [after] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
  assert.equal(after.platformRole, 'super_admin');
});

test('seedDemoCoTenant is race-safe when invoked in parallel', async () => {
  // Use a one-off demo email so we don't collide with a real demo seed.
  const demoEmail = `${uniqueId('demo-race')}@test.local`;
  const demoUser = await createTestUser();
  await db.update(users).set({ email: demoEmail }).where(eq(users.id, demoUser.id));
  cleanupUserIds.push(demoUser.id);

  // Seed a couple of live modules so the per-module loop runs and races too.
  const mod1Slug = uniqueId('race-mod');
  const mod2Slug = uniqueId('race-mod');
  const [m1] = await db.insert(modules).values({
    slug: mod1Slug, name: 'Race Mod 1', description: 'fixture',
    baseUrl: 'https://example.test', status: 'live', planMin: 'starter', ord: 0,
  }).returning();
  const [m2] = await db.insert(modules).values({
    slug: mod2Slug, name: 'Race Mod 2', description: 'fixture',
    baseUrl: 'https://example.test', status: 'live', planMin: 'starter', ord: 0,
  }).returning();
  cleanupModuleIds.push(m1.id, m2.id);

  // The slug is hard-coded to 'demo-co' inside seedDemoCoTenant. Purge any
  // pre-existing row from prior test runs and register cleanup so the
  // assertions below see only what this test inserted.
  cleanupTenantSlugs.push('demo-co');
  await purgeTenantBySlug('demo-co');

  const original = process.env.DEMO_EMAIL;
  process.env.DEMO_EMAIL = demoEmail;
  try {
    await Promise.all([seedDemoCoTenant(), seedDemoCoTenant()]);
  } finally {
    if (original === undefined) delete process.env.DEMO_EMAIL;
    else process.env.DEMO_EMAIL = original;
  }

  const tRows = await db.select().from(tenants).where(eq(tenants.slug, 'demo-co'));
  assert.equal(tRows.length, 1, 'expected exactly one demo-co tenant');
  const tenantId = tRows[0].id;

  const tuRows = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, demoUser.id)));
  assert.equal(tuRows.length, 1, 'expected exactly one demo owner membership');

  for (const m of [m1, m2]) {
    const tmRows = await db.select().from(tenantModules)
      .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, m.id)));
    assert.equal(tmRows.length, 1, `expected exactly one tenant_module for ${m.slug}`);

    const accRows = await db.select().from(tenantUserModuleAccess)
      .where(and(
        eq(tenantUserModuleAccess.tenantId, tenantId),
        eq(tenantUserModuleAccess.userId, demoUser.id),
        eq(tenantUserModuleAccess.moduleId, m.id),
      ));
    assert.equal(accRows.length, 1, `expected exactly one access row for ${m.slug}`);
    assert.equal(accRows[0].accessLevel, 'manager');
  }
});
