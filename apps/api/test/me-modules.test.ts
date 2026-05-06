/**
 * Gate 3 — GET /v1/me/modules launchpad shape.
 *
 * Verifies that:
 *   - Auth required.
 *   - Modules are resolved through tenant_modules + tenant_user_module_access
 *     (tenant-scoped, NOT legacy per-user entitlement).
 *   - Modules in tenants where the caller has no access do NOT appear.
 *   - Modules with explicit access OR allowAllMembers DO appear.
 *   - beta-status modules with access are included alongside live ones.
 *   - Response shape matches what MyAppsPage consumes.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady, createTestUser, createTestModule, cleanupUser, cleanupModule,
  uniqueId,
} from './_setup.js';

let app: any;
let user: any;
let tenant: any;
let lockedMod: any, unlockedMod: any, betaMod: any, otherTenantMod: any;
let otherTenant: any;

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();
  lockedMod = await createTestModule();
  unlockedMod = await createTestModule();
  betaMod = await createTestModule();
  otherTenantMod = await createTestModule();
  // Flip betaMod into beta status — entitlement service treats `beta`
  // as launchable when access exists, so My Apps must include it.
  const { modules: modsTable } = await import('../src/schema.js');
  await db.update(modsTable).set({ status: 'beta' }).where(eq(modsTable.id, betaMod.id));

  // Tenant 1 — caller is a member, has explicit access to unlockedMod and
  // betaMod via allowAllMembers + explicit grant. lockedMod is enabled in
  // tenant but caller has no row + allowAllMembers=false, so it stays hidden.
  const slug = uniqueId('me-mod-tenant');
  [tenant] = await db.insert(tenants).values({
    name: 'Me Modules Tenant', slug, type: 'company', status: 'active',
    ownerUserId: user.id,
  }).returning();
  await db.insert(tenantUsers).values({
    tenantId: tenant.id, userId: user.id, role: 'member', status: 'active',
  });
  await db.insert(tenantModules).values([
    { tenantId: tenant.id, moduleId: unlockedMod.id, status: 'enabled', allowAllMembers: true },
    { tenantId: tenant.id, moduleId: betaMod.id,     status: 'enabled', allowAllMembers: false },
    { tenantId: tenant.id, moduleId: lockedMod.id,   status: 'enabled', allowAllMembers: false },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: tenant.id, userId: user.id, moduleId: betaMod.id, accessLevel: 'user',
  });

  // Tenant 2 — caller is NOT a member; module here must NOT leak.
  const otherSlug = uniqueId('me-mod-other');
  [otherTenant] = await db.insert(tenants).values({
    name: 'Other Tenant', slug: otherSlug, type: 'company', status: 'active',
    ownerUserId: user.id,
  }).returning();
  await db.insert(tenantModules).values({
    tenantId: otherTenant.id, moduleId: otherTenantMod.id, status: 'enabled', allowAllMembers: true,
  });

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerModuleRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, user.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.userId, user.id)); } catch {}
  for (const t of [tenant, otherTenant]) {
    if (!t) continue;
    try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
  }
  if (user) await cleanupUser(user.id);
  for (const m of [lockedMod, unlockedMod, betaMod, otherTenantMod]) if (m) await cleanupModule(m.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

test('401 when unauthenticated', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/me/modules' });
  assert.equal(r.statusCode, 401);
});

test('returns only tenant-scoped unlocked modules with the launchpad shape', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/me/modules', headers: bearer(user) });
  assert.equal(r.statusCode, 200);
  const body = r.json();
  assert.ok(Array.isArray(body.modules), 'modules must be an array');
  const slugs = body.modules.map((m: any) => m.slug);
  assert.ok(slugs.includes(unlockedMod.slug), 'allowAllMembers module should be present');
  assert.ok(!slugs.includes(lockedMod.slug), 'tenant-enabled but not granted to user must not appear');
  assert.ok(!slugs.includes(otherTenantMod.slug), 'modules from tenants the user does not belong to must not leak');
  // Shape contract for MyAppsPage.
  const m = body.modules.find((x: any) => x.slug === unlockedMod.slug);
  for (const k of ['slug', 'name', 'description', 'category', 'iconUrl', 'baseUrl']) {
    assert.ok(k in m, `missing field ${k}`);
  }
});

test('beta-status modules with explicit access are also returned (not just live)', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/me/modules', headers: bearer(user) });
  const slugs = r.json().modules.map((m: any) => m.slug);
  assert.ok(slugs.includes(betaMod.slug),
    'beta-status modules with active tenant grant must appear on the launchpad');
});

test('user with no tenant memberships gets an empty launchpad (no legacy fallback)', async () => {
  const lonelyUser = await createTestUser();
  try {
    const r = await app.inject({ method: 'GET', url: '/v1/me/modules', headers: bearer(lonelyUser) });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { modules: [] });
  } finally {
    await cleanupUser(lonelyUser.id);
  }
});
