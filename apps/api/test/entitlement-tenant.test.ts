/**
 * Gate 1 — Tenant module access semantics.
 *
 * Locks in the resolution order for `requireTenantModuleAccess` and
 * `hasModuleAccess(userId, tenantId, slug)`:
 *
 *   1. tenant_modules row missing / wrong status -> deny
 *   2. explicit per-user grant with access_level='none' -> DENY
 *      (this MUST override `allowAllMembers=true`)
 *   3. explicit per-user grant 'user' | 'manager' -> grant
 *   4. no explicit row, `allowAllMembers=true`, user is tenant member -> grant
 *   5. otherwise -> deny
 *
 * Regression guard: an earlier draft short-circuited on `allowAllMembers`
 * before checking the explicit grant row, which silently bypassed
 * tenant-admin revocations. Do not let that come back.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, tenants, tenantUsers, tenantModules, tenantUserModuleAccess } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
} from './_setup.js';

let app: any;
let owner: any;
let memberA: any;
let memberB: any;
let outsider: any;
let tenant: any;
let mod: any;

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  memberA = await createTestUser();
  memberB = await createTestUser();
  outsider = await createTestUser();
  mod = await createTestModule();

  [tenant] = await db.insert(tenants).values({
    name: 'AccessTest', slug: `access-${owner.id}`, type: 'company', ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenant.id, userId: owner.id, role: 'owner' },
    { tenantId: tenant.id, userId: memberA.id, role: 'member' },
    { tenantId: tenant.id, userId: memberB.id, role: 'member' },
  ]);

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { requireTenantModuleAccess } = await import('../src/lib/tenant-auth.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  app.get(`/test/tenants/:tenantId/use-${mod.slug}`,
    { preHandler: [requireTenantModuleAccess(mod.slug)] },
    async (req: any, reply: any) => reply.send({ ok: true, level: (req as any).tenantModuleAccessLevel }),
  );
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (tenant) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, tenant.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenant.id)); } catch {}
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenant.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, tenant.id)); } catch {}
  }
  if (mod) await cleanupModule(mod.id);
  for (const u of [owner, memberA, memberB, outsider]) if (u) await cleanupUser(u.id);
});

function bearer(u: any) {
  return { authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` };
}

async function setTenantModule(opts: { allowAllMembers: boolean; status?: string }) {
  await db.delete(tenantModules)
    .where(eq(tenantModules.tenantId, tenant.id));
  await db.insert(tenantModules).values({
    tenantId: tenant.id,
    moduleId: mod.id,
    status: (opts.status as any) ?? 'enabled',
    source: 'included',
    allowAllMembers: opts.allowAllMembers,
  });
}

async function setUserAccess(userId: string, level: 'none' | 'user' | 'manager' | null) {
  await db.delete(tenantUserModuleAccess)
    .where(eq(tenantUserModuleAccess.userId, userId));
  if (level !== null) {
    await db.insert(tenantUserModuleAccess).values({
      tenantId: tenant.id,
      userId,
      moduleId: mod.id,
      accessLevel: level,
    });
  }
}

test('module disabled for tenant -> 403 TENANT_MODULE_DISABLED', async () => {
  await setTenantModule({ allowAllMembers: true, status: 'disabled' });
  await setUserAccess(memberA.id, 'manager');
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenant.id}/use-${mod.slug}`,
    headers: bearer(memberA),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'TENANT_MODULE_DISABLED');
});

test('allowAllMembers=true grants any tenant member with no explicit row', async () => {
  await setTenantModule({ allowAllMembers: true });
  await setUserAccess(memberA.id, null);
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenant.id}/use-${mod.slug}`,
    headers: bearer(memberA),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().level, 'user');
});

test('REGRESSION: access_level=none MUST override allowAllMembers=true', async () => {
  await setTenantModule({ allowAllMembers: true });
  await setUserAccess(memberA.id, 'none');
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenant.id}/use-${mod.slug}`,
    headers: bearer(memberA),
  });
  assert.equal(res.statusCode, 403,
    'explicit deny must override the tenant-wide allow-all flag');
  assert.equal(res.json().code, 'TENANT_MODULE_ACCESS_DENIED');
});

test('explicit user grant works when allowAllMembers=false', async () => {
  await setTenantModule({ allowAllMembers: false });
  await setUserAccess(memberB.id, 'user');
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenant.id}/use-${mod.slug}`,
    headers: bearer(memberB),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().level, 'user');
});

test('member with no row + allowAllMembers=false -> 403', async () => {
  await setTenantModule({ allowAllMembers: false });
  await setUserAccess(memberA.id, null);
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenant.id}/use-${mod.slug}`,
    headers: bearer(memberA),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'TENANT_MODULE_ACCESS_DENIED');
});

test('non-member outsider -> 404 TENANT_NOT_FOUND (no existence leak)', async () => {
  await setTenantModule({ allowAllMembers: true });
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenant.id}/use-${mod.slug}`,
    headers: bearer(outsider),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'TENANT_NOT_FOUND');
});

test('hasModuleAccess(userId, tenantId, slug): explicit none overrides allowAllMembers', async () => {
  const { hasModuleAccess } = await import('../src/lib/entitlement-service.js');
  await setTenantModule({ allowAllMembers: true });
  await setUserAccess(memberA.id, 'none');
  const r = await hasModuleAccess(memberA.id, tenant.id, mod.slug);
  assert.equal(r.hasAccess, false);
  assert.equal(r.reason, 'explicit_deny');
});

test('hasModuleAccess: tenant member granted via allowAllMembers when no row', async () => {
  const { hasModuleAccess } = await import('../src/lib/entitlement-service.js');
  await setTenantModule({ allowAllMembers: true });
  await setUserAccess(memberA.id, null);
  const r = await hasModuleAccess(memberA.id, tenant.id, mod.slug);
  assert.equal(r.hasAccess, true);
  assert.equal(r.source, 'plan');
});

test('hasModuleAccess: explicit user grant -> granted (entitlement matrix happy path)', async () => {
  const { hasModuleAccess } = await import('../src/lib/entitlement-service.js');
  await setTenantModule({ allowAllMembers: false });
  await setUserAccess(memberA.id, 'user');
  const r = await hasModuleAccess(memberA.id, tenant.id, mod.slug);
  assert.equal(r.hasAccess, true);
  assert.equal(r.source, 'plan');
});

test('hasModuleAccess: tenant_module status="disabled" denies even with explicit grant', async () => {
  const { hasModuleAccess } = await import('../src/lib/entitlement-service.js');
  await setTenantModule({ allowAllMembers: true, status: 'disabled' });
  await setUserAccess(memberA.id, 'manager');
  const r = await hasModuleAccess(memberA.id, tenant.id, mod.slug);
  assert.equal(r.hasAccess, false);
  assert.equal(r.reason, 'tenant_module_disabled');
});

test('hasModuleAccess: archived tenant module denies even with explicit manager grant', async () => {
  // Tenant-level archive cascades cleanly: if a tenant has retired a module
  // (e.g. removed an add-on after cancel-and-archive), no individual user
  // grant should resurrect access. This is the regression case the spec
  // explicitly calls out.
  const { hasModuleAccess } = await import('../src/lib/entitlement-service.js');
  await setTenantModule({ allowAllMembers: false, status: 'archived' });
  await setUserAccess(memberA.id, 'manager');
  const r = await hasModuleAccess(memberA.id, tenant.id, mod.slug);
  assert.equal(r.hasAccess, false);
  assert.equal(r.reason, 'tenant_module_disabled');
});

// (removed) The pre-tenant `legacy=true` opt-in was dropped in follow-up
// #19. Every caller now resolves access against an explicit tenant id;
// the `hasModuleAccessLegacy` per-user resolver no longer exists.
