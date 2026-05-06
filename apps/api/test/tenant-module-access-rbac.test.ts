/**
 * Gate 3 — Per-tenant per-user module access (owner/admin scoped).
 *
 * Distinguishes from existing super-admin platform/* override:
 *   POST /v1/tenants/:id/users/:userId/module-access
 *   GET  /v1/tenants/:id/users/:userId/module-access
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess, modules,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady, createTestUser, createTestModule, cleanupUser, cleanupModule,
} from './_setup.js';

let app: any;
let owner: any, member: any, outsider: any;
let tenantA: any;
let mod: any, archivedMod: any;

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  member = await createTestUser();
  outsider = await createTestUser();

  [tenantA] = await db.insert(tenants).values({
    name: 'Access Co', slug: `acc-${owner.id}`, type: 'company', ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenantA.id, userId: owner.id, role: 'owner' },
    { tenantId: tenantA.id, userId: member.id, role: 'member' },
  ]);

  mod = await createTestModule();
  archivedMod = await createTestModule();
  // Wire tenant_modules: one enabled, one archived.
  await db.insert(tenantModules).values([
    { tenantId: tenantA.id, moduleId: mod.id, status: 'enabled', source: 'included', allowAllMembers: false },
    { tenantId: tenantA.id, moduleId: archivedMod.id, status: 'archived', source: 'included', allowAllMembers: false },
  ]);

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerTenantAdminRoutes } = await import('../src/routes/tenant-admin-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerTenantAdminRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenantA.id)); } catch {}
  for (const u of [owner, member, outsider]) if (u) await cleanupUser(u.id);
  for (const m of [mod, archivedMod]) if (m) await cleanupModule(m.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

test('member cannot grant module access (TENANT_ROLE_INSUFFICIENT)', async () => {
  const r = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(member),
    payload: { moduleSlug: mod.slug, accessLevel: 'user' },
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'TENANT_ROLE_INSUFFICIENT');
});

test('outsider gets 404 TENANT_NOT_FOUND', async () => {
  const r = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(outsider),
  });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'TENANT_NOT_FOUND');
});

test('owner cannot grant on archived module (TENANT_MODULE_DISABLED)', async () => {
  const r = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(owner),
    payload: { moduleSlug: archivedMod.slug, accessLevel: 'user' },
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'TENANT_MODULE_DISABLED');
});

test('owner grants user access; grid reflects it; second call updates same row', async () => {
  const grant = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(owner),
    payload: { moduleSlug: mod.slug, accessLevel: 'user' },
  });
  assert.equal(grant.statusCode, 200);
  assert.equal(grant.json().access.accessLevel, 'user');
  const firstId = grant.json().access.id;

  const upgrade = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(owner),
    payload: { moduleSlug: mod.slug, accessLevel: 'manager' },
  });
  assert.equal(upgrade.statusCode, 200);
  assert.equal(upgrade.json().access.id, firstId, 'upsert must reuse the row');
  assert.equal(upgrade.json().access.accessLevel, 'manager');

  const grid = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(owner),
  });
  assert.equal(grid.statusCode, 200);
  const row = grid.json().grid.find((g: any) => g.moduleSlug === mod.slug);
  assert.equal(row.accessLevel, 'manager');
});

test('granting non-existent module returns MODULE_NOT_FOUND', async () => {
  const r = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/users/${member.id}/module-access`,
    headers: bearer(owner),
    payload: { moduleSlug: 'no-such-mod', accessLevel: 'user' },
  });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'MODULE_NOT_FOUND');
});
