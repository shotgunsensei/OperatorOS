/**
 * Gate 1 — Tenant RBAC unit tests.
 *
 * Covers:
 *   - resolveTenantContext precedence: :tenantId > X-Tenant-Id > current_tenant_id
 *   - requireSuperAdmin       (403 PLATFORM_ROLE_REQUIRED for non-super_admin)
 *   - requireTenantRole       (404 TENANT_NOT_FOUND for cross-tenant)
 *   - requireTenantRole       (403 TENANT_ROLE_INSUFFICIENT for too-low role)
 *   - super_admin tenant bypass (synthetic 'owner' role)
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, tenants, tenantUsers } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady,
  createTestUser,
  cleanupUser,
} from './_setup.js';

let app: any;
let alice: any;          // owner of tenant A
let bob: any;            // owner of tenant B (used to test cross-tenant 404)
let memberOnly: any;     // member-role user inside tenant A
let superAdmin: any;     // platform super_admin
let tenantA: any;
let tenantB: any;

before(async () => {
  await ensureSchemaReady();

  alice = await createTestUser();
  bob = await createTestUser();
  memberOnly = await createTestUser();
  superAdmin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

  [tenantA] = await db.insert(tenants).values({
    name: 'Tenant A', slug: `tenant-a-${alice.id}`, type: 'company', ownerUserId: alice.id,
  }).returning();
  [tenantB] = await db.insert(tenants).values({
    name: 'Tenant B', slug: `tenant-b-${bob.id}`, type: 'company', ownerUserId: bob.id,
  }).returning();

  await db.insert(tenantUsers).values([
    { tenantId: tenantA.id, userId: alice.id, role: 'owner' },
    { tenantId: tenantA.id, userId: memberOnly.id, role: 'member' },
    { tenantId: tenantB.id, userId: bob.id, role: 'owner' },
  ]);

  // Set Alice's current_tenant_id so we can exercise the "header/path absent"
  // resolution path.
  await db.update(users).set({ currentTenantId: tenantA.id }).where(eq(users.id, alice.id));
  alice = (await db.select().from(users).where(eq(users.id, alice.id)))[0];

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const {
    requireSuperAdmin,
    requireTenantMember,
    requireTenantAdmin,
    resolveTenantContext,
  } = await import('../src/lib/tenant-auth.js');
  const { authenticate } = await import('../src/lib/auth.js');

  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });

  // Test surface: each endpoint exercises one pre-handler / helper.
  app.get('/test/super-only', { preHandler: [requireSuperAdmin] }, async (_r: any, reply: any) =>
    reply.send({ ok: true }));
  app.get('/test/tenants/:tenantId/peek', { preHandler: [requireTenantMember] }, async (req: any, reply: any) =>
    reply.send({ ctx: (req as any).tenantContext }));
  app.get('/test/tenants/:tenantId/admin-only', { preHandler: [requireTenantAdmin] }, async (req: any, reply: any) =>
    reply.send({ ctx: (req as any).tenantContext }));
  // Resolve via header / current_tenant_id (no path param).
  app.get('/test/active-tenant', { preHandler: [authenticate] }, async (req: any, reply: any) => {
    const ctx = await resolveTenantContext(req);
    return reply.send({ ctx });
  });

  await app.ready();
});

after(async () => {
  if (app) await app.close();
  // Tenant FKs cascade-blocking → delete in dependency order.
  for (const t of [tenantA, tenantB]) {
    if (!t) continue;
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
  }
  for (const u of [alice, bob, memberOnly, superAdmin]) {
    if (u) await cleanupUser(u.id);
  }
});

function bearer(u: any) {
  return { authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` };
}

test('requireSuperAdmin: 401 when unauthenticated', async () => {
  const res = await app.inject({ method: 'GET', url: '/test/super-only' });
  assert.equal(res.statusCode, 401);
});

test('requireSuperAdmin: 403 PLATFORM_ROLE_REQUIRED for regular user', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/test/super-only',
    headers: bearer(alice),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
});

test('requireSuperAdmin: 200 for platform super_admin', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/test/super-only',
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 200);
});

test('requireTenantMember: 200 for the tenant owner', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenantA.id}/peek`,
    headers: bearer(alice),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ctx.tenantId, tenantA.id);
  assert.equal(body.ctx.role, 'owner');
  assert.equal(body.ctx.viaPlatformRole, false);
});

test('requireTenantMember: 404 TENANT_NOT_FOUND for cross-tenant access', async () => {
  // Bob is owner of B but NOT a member of A → must look identical to "tenant
  // does not exist" so we never leak existence to outsiders.
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenantA.id}/peek`,
    headers: bearer(bob),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'TENANT_NOT_FOUND');
});

test('requireTenantMember: 404 TENANT_NOT_FOUND for non-existent tenant id', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/00000000-0000-0000-0000-000000000000/peek`,
    headers: bearer(alice),
  });
  assert.equal(res.statusCode, 404);
});

test('requireTenantAdmin: 403 TENANT_ROLE_INSUFFICIENT for member role', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenantA.id}/admin-only`,
    headers: bearer(memberOnly),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'TENANT_ROLE_INSUFFICIENT');
});

test('super_admin bypass: synthetic owner role on cross-tenant access', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/test/tenants/${tenantB.id}/peek`,
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ctx.role, 'owner');
  assert.equal(body.ctx.viaPlatformRole, true,
    'super_admin should be flagged as via-platform for audit trails');
});

test('resolveTenantContext: precedence — X-Tenant-Id header overrides current_tenant_id', async () => {
  // Alice's current_tenant_id is tenantA; explicit header tenantB → membership
  // missing on B for Alice → ctx is null → 404. This proves the header is
  // consulted BEFORE current_tenant_id.
  const res = await app.inject({
    method: 'GET',
    url: '/test/active-tenant',
    headers: { ...bearer(alice), 'x-tenant-id': tenantB.id },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ctx, null,
    'header wins: alice is not member of tenantB → null context');
});

test('resolveTenantContext: falls back to current_tenant_id when no header/path', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/test/active-tenant',
    headers: bearer(alice),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ctx.tenantId, tenantA.id);
  assert.equal(body.ctx.role, 'owner');
});
