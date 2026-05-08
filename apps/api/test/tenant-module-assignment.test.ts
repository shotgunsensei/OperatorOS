/**
 * Gate 2 — Per-tenant module assignment + per-user access overrides.
 *
 * Covers the three super-admin endpoints that mutate who-can-use-what:
 *   - POST /v1/platform/tenants/:id/modules/:slug/enable
 *   - POST /v1/platform/tenants/:id/modules/:slug/disable
 *   - POST /v1/platform/tenants/:id/users/:userId/module-access
 *
 * Plus an integration check that `requireTenantModuleAccess` honors an
 * explicit `access_level='none'` row even when the tenant_module is
 * `allowAllMembers=true` (the documented "revoke a single user from a
 * public module" behavior).
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
  modules, adminAuditLogs,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { requireTenantModuleAccess } from '../src/lib/tenant-auth.js';
import {
  ensureSchemaReady, createTestUser, createTestModule,
  cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

let app: any;
let superAdmin: any, owner: any, member: any;
let tenantA: any;
let mod: any;          // enable/disable target
let archivedMod: any;  // marked archived in catalog
let publicMod: any;    // for allowAllMembers + access_level='none' override

before(async () => {
  await ensureSchemaReady();
  superAdmin = await createTestUser();
  owner = await createTestUser();
  member = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

  [tenantA] = await db.insert(tenants).values({
    name: 'Assign Co',
    slug: `tma-${uniqueId('t').replace(/_/g, '-')}`,
    type: 'company',
    ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenantA.id, userId: owner.id, role: 'owner' },
    { tenantId: tenantA.id, userId: member.id, role: 'member' },
  ]);

  mod = await createTestModule();
  archivedMod = await createTestModule();
  await db.update(modules).set({ archivedAt: new Date() }).where(eq(modules.id, archivedMod.id));
  publicMod = await createTestModule();

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerPlatformRoutes(app);

  // Tiny consumer route to exercise the requireTenantModuleAccess pre-handler
  // end-to-end (so we can assert that an explicit 'none' grant overrides
  // the tenant_module.allow_all_members opt-in).
  app.get(
    `/v1/test/${publicMod.slug}/launch`,
    { preHandler: [requireTenantModuleAccess(publicMod.slug)] },
    async () => ({ ok: true }),
  );
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  try { await db.delete(adminAuditLogs).where(eq(adminAuditLogs.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenantA.id)); } catch {}
  for (const u of [superAdmin, owner, member]) if (u) await cleanupUser(u.id);
  for (const m of [mod, archivedMod, publicMod]) if (m) await cleanupModule(m.id);
});

const bearer = (u: any) => ({
  authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}`,
});

// ---------------------------------------------------------------------------
// enable
// ---------------------------------------------------------------------------

test('enable: idempotent — second call updates the same row + flips allow_all_members', async () => {
  const r1 = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/modules/${mod.slug}/enable`,
    headers: bearer(superAdmin),
    payload: { allowAllMembers: false },
  });
  assert.equal(r1.statusCode, 200);
  const tm1 = r1.json().tenantModule;
  assert.equal(tm1.status, 'enabled');
  assert.equal(tm1.allowAllMembers, false);

  const r2 = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/modules/${mod.slug}/enable`,
    headers: bearer(superAdmin),
    payload: { allowAllMembers: true },
  });
  assert.equal(r2.statusCode, 200);
  const tm2 = r2.json().tenantModule;
  assert.equal(tm2.id, tm1.id, 'enable must upsert the same row, not duplicate');
  assert.equal(tm2.status, 'enabled');
  assert.equal(tm2.allowAllMembers, true);

  // Exactly one row in the DB for (tenant, module).
  const rows = await db.select().from(tenantModules).where(and(
    eq(tenantModules.tenantId, tenantA.id),
    eq(tenantModules.moduleId, mod.id),
  ));
  assert.equal(rows.length, 1);
});

test('enable: writes module_enabled_for_tenant audit row with before/after diff', async () => {
  const rows = await db.select().from(adminAuditLogs).where(and(
    eq(adminAuditLogs.action, 'module_enabled_for_tenant'),
    eq(adminAuditLogs.tenantId, tenantA.id),
    eq(adminAuditLogs.adminId, superAdmin.id),
  )).orderBy(desc(adminAuditLogs.createdAt));
  assert.ok(rows.length >= 2, 'each enable call writes an audit row');
  const latest: any = rows[0];
  const details: any = latest.details ?? {};
  assert.equal(details.targetType, 'tenant_module');
  assert.equal(details.moduleSlug, mod.slug);
  // Second enable: before is the previous row (allowAllMembers=false), after is true.
  assert.equal(details.before?.allowAllMembers, false);
  assert.equal(details.after?.allowAllMembers, true);
  assert.equal(details.after?.status, 'enabled');
});

test('enable: archived module rejected with 409 MODULE_ARCHIVED', async () => {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/modules/${archivedMod.slug}/enable`,
    headers: bearer(superAdmin),
    payload: {},
  });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'MODULE_ARCHIVED');

  // Nothing inserted as a side effect.
  const rows = await db.select().from(tenantModules).where(and(
    eq(tenantModules.tenantId, tenantA.id),
    eq(tenantModules.moduleId, archivedMod.id),
  ));
  assert.equal(rows.length, 0);
});

test('enable: unknown tenant -> 404 TENANT_NOT_FOUND', async () => {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/00000000-0000-0000-0000-000000000000/modules/${mod.slug}/enable`,
    headers: bearer(superAdmin),
    payload: {},
  });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'TENANT_NOT_FOUND');
});

// ---------------------------------------------------------------------------
// disable
// ---------------------------------------------------------------------------

test('disable: flips status to disabled and writes audit row', async () => {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/modules/${mod.slug}/disable`,
    headers: bearer(superAdmin),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().tenantModule.status, 'disabled');

  // DB confirms the flip.
  const [row] = await db.select().from(tenantModules).where(and(
    eq(tenantModules.tenantId, tenantA.id),
    eq(tenantModules.moduleId, mod.id),
  ));
  assert.equal(row.status, 'disabled');

  // Audit row written with before='enabled', after='disabled'.
  const [audit] = await db.select().from(adminAuditLogs).where(and(
    eq(adminAuditLogs.action, 'module_disabled_for_tenant'),
    eq(adminAuditLogs.tenantId, tenantA.id),
  )).orderBy(desc(adminAuditLogs.createdAt));
  assert.ok(audit, 'disable must produce an audit row');
  const details: any = (audit as any).details ?? {};
  assert.equal(details.targetType, 'tenant_module');
  assert.equal(details.moduleSlug, mod.slug);
  assert.equal(details.before?.status, 'enabled');
  assert.equal(details.after?.status, 'disabled');
});

test('disable: tenant has no row for the module -> 404 TENANT_MODULE_NOT_FOUND', async () => {
  // archivedMod was never enabled for this tenant.
  const r = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/modules/${archivedMod.slug}/disable`,
    headers: bearer(superAdmin),
  });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'TENANT_MODULE_NOT_FOUND');
});

test('disable: unknown module slug -> 404 MODULE_NOT_FOUND', async () => {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/modules/no-such-mod-xyz/disable`,
    headers: bearer(superAdmin),
  });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'MODULE_NOT_FOUND');
});

// ---------------------------------------------------------------------------
// per-user access override
// ---------------------------------------------------------------------------

test('access override: rejects unknown accessLevel with 400', async () => {
  // Module must exist for the validator to even be reached, but the order
  // of checks means an invalid accessLevel short-circuits to 400 first.
  const r = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(superAdmin),
    payload: { moduleSlug: mod.slug, accessLevel: 'admin' },
  });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().code, 'BAD_REQUEST');
});

test('access override: missing moduleSlug -> 400', async () => {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(superAdmin),
    payload: { accessLevel: 'user' },
  });
  assert.equal(r.statusCode, 400);
});

test('access override: non-member target -> 404 TENANT_USER_NOT_FOUND', async () => {
  const stranger = await createTestUser();
  try {
    const r = await app.inject({
      method: 'POST',
      url: `/v1/platform/tenants/${tenantA.id}/users/${stranger.id}/module-access`,
      headers: bearer(superAdmin),
      payload: { moduleSlug: mod.slug, accessLevel: 'user' },
    });
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().code, 'TENANT_USER_NOT_FOUND');
  } finally {
    await cleanupUser(stranger.id);
  }
});

test('access override: accepts user/manager/none and upserts the same row + audits each', async () => {
  // First grant: user
  const r1 = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(superAdmin),
    payload: { moduleSlug: mod.slug, accessLevel: 'user' },
  });
  assert.equal(r1.statusCode, 200);
  const a1 = r1.json().access;
  assert.equal(a1.accessLevel, 'user');
  assert.equal(a1.grantedByUserId, superAdmin.id);

  // Upgrade: manager (must reuse row)
  const r2 = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(superAdmin),
    payload: { moduleSlug: mod.slug, accessLevel: 'manager' },
  });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().access.id, a1.id, 'upsert reuses the row');
  assert.equal(r2.json().access.accessLevel, 'manager');

  // Revoke: none (still same row)
  const r3 = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(superAdmin),
    payload: { moduleSlug: mod.slug, accessLevel: 'none' },
  });
  assert.equal(r3.statusCode, 200);
  assert.equal(r3.json().access.id, a1.id);
  assert.equal(r3.json().access.accessLevel, 'none');

  // Exactly one row in DB for (tenant, user, module).
  const rows = await db.select().from(tenantUserModuleAccess).where(and(
    eq(tenantUserModuleAccess.tenantId, tenantA.id),
    eq(tenantUserModuleAccess.userId, member.id),
    eq(tenantUserModuleAccess.moduleId, mod.id),
  ));
  assert.equal(rows.length, 1);

  // Audit: at least 3 tenant_user_module_access_set rows for this admin/tenant.
  const audits = await db.select().from(adminAuditLogs).where(and(
    eq(adminAuditLogs.action, 'tenant_user_module_access_set'),
    eq(adminAuditLogs.tenantId, tenantA.id),
    eq(adminAuditLogs.adminId, superAdmin.id),
  )).orderBy(desc(adminAuditLogs.createdAt));
  assert.ok(audits.length >= 3, 'each override writes an audit row');
  const latest: any = audits[0];
  const details: any = latest.details ?? {};
  assert.equal(details.targetType, 'tenant_user_module_access');
  assert.equal(details.moduleSlug, mod.slug);
  assert.equal(details.targetUserId, member.id);
  assert.equal(details.before?.accessLevel, 'manager');
  assert.equal(details.after?.accessLevel, 'none');
});

// ---------------------------------------------------------------------------
// integration with requireTenantModuleAccess
// ---------------------------------------------------------------------------

test('requireTenantModuleAccess: allow_all_members lets a plain member in...', async () => {
  // Enable publicMod with allow_all_members=true via the platform endpoint.
  const enable = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/modules/${publicMod.slug}/enable`,
    headers: bearer(superAdmin),
    payload: { allowAllMembers: true },
  });
  assert.equal(enable.statusCode, 200);
  assert.equal(enable.json().tenantModule.allowAllMembers, true);

  const r = await app.inject({
    method: 'GET',
    url: `/v1/test/${publicMod.slug}/launch`,
    headers: { ...bearer(member), 'x-tenant-id': tenantA.id },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().ok, true);
});

test('requireTenantModuleAccess: explicit access_level=none overrides allow_all_members', async () => {
  // Set the override.
  const override = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(superAdmin),
    payload: { moduleSlug: publicMod.slug, accessLevel: 'none' },
  });
  assert.equal(override.statusCode, 200);

  const blocked = await app.inject({
    method: 'GET',
    url: `/v1/test/${publicMod.slug}/launch`,
    headers: { ...bearer(member), 'x-tenant-id': tenantA.id },
  });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().code, 'TENANT_MODULE_ACCESS_DENIED');

  // Restore access by flipping the override to 'user' — same code path
  // proves the override is the only thing that was blocking the member.
  const restore = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(superAdmin),
    payload: { moduleSlug: publicMod.slug, accessLevel: 'user' },
  });
  assert.equal(restore.statusCode, 200);

  const ok = await app.inject({
    method: 'GET',
    url: `/v1/test/${publicMod.slug}/launch`,
    headers: { ...bearer(member), 'x-tenant-id': tenantA.id },
  });
  assert.equal(ok.statusCode, 200);
});

test('requireTenantModuleAccess: disabling the tenant_module blocks even granted users', async () => {
  // Disable the publicMod that the member has an explicit 'user' grant on.
  const disable = await app.inject({
    method: 'POST',
    url: `/v1/platform/tenants/${tenantA.id}/modules/${publicMod.slug}/disable`,
    headers: bearer(superAdmin),
  });
  assert.equal(disable.statusCode, 200);

  const r = await app.inject({
    method: 'GET',
    url: `/v1/test/${publicMod.slug}/launch`,
    headers: { ...bearer(member), 'x-tenant-id': tenantA.id },
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'TENANT_MODULE_DISABLED');
});
