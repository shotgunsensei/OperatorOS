/**
 * Gate 1 — Tenant routes integration tests.
 *
 * Covers:
 *   GET  /v1/tenants                — super_admin gating
 *   GET  /v1/tenants/:tenantId      — member access + cross-tenant 404
 *   GET  /v1/me/tenants             — caller's tenants
 *   POST /v1/tenants/:tenantId/switch — sets users.current_tenant_id
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
let alice: any;
let bob: any;
let superAdmin: any;
let tenantA: any;
let tenantB: any;

before(async () => {
  await ensureSchemaReady();

  alice = await createTestUser();
  bob = await createTestUser();
  superAdmin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

  [tenantA] = await db.insert(tenants).values({
    name: 'Tenant A', slug: `tr-a-${alice.id}`, type: 'company', ownerUserId: alice.id,
  }).returning();
  [tenantB] = await db.insert(tenants).values({
    name: 'Tenant B', slug: `tr-b-${bob.id}`, type: 'company', ownerUserId: bob.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenantA.id, userId: alice.id, role: 'owner' },
    { tenantId: tenantB.id, userId: bob.id, role: 'owner' },
  ]);

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerTenantRoutes } = await import('../src/routes/tenant-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerTenantRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const t of [tenantA, tenantB]) {
    if (!t) continue;
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
  }
  for (const u of [alice, bob, superAdmin]) if (u) await cleanupUser(u.id);
});

function bearer(u: any) {
  return { authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` };
}

test('GET /v1/tenants requires super_admin (403 for normal user)', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/tenants', headers: bearer(alice) });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
});

test('GET /v1/tenants returns ALL tenants for super_admin', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/v1/tenants',
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  // We seeded at least 2 in this test; there may also be personal tenants
  // backfilled from previous test runs.
  assert.ok(body.total >= 2);
  const slugs = body.tenants.map((t: any) => t.slug);
  assert.ok(slugs.includes(tenantA.slug));
  assert.ok(slugs.includes(tenantB.slug));
});

test('GET /v1/tenants/:tenantId returns tenant + role for a member', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/tenants/${tenantA.id}`,
    headers: bearer(alice),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.tenant.id, tenantA.id);
  assert.equal(body.membership.role, 'owner');
  assert.equal(body.membership.viaPlatformRole, false);
});

test('GET /v1/tenants/:tenantId returns 404 for non-member (no existence leak)', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/tenants/${tenantA.id}`,
    headers: bearer(bob),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'TENANT_NOT_FOUND');
});

test('GET /v1/me/tenants lists only the caller\'s tenants', async () => {
  const aliceRes = await app.inject({ method: 'GET', url: '/v1/me/tenants', headers: bearer(alice) });
  assert.equal(aliceRes.statusCode, 200);
  const aliceBody = aliceRes.json();
  const ids = aliceBody.tenants.map((t: any) => t.id);
  assert.ok(ids.includes(tenantA.id));
  assert.ok(!ids.includes(tenantB.id), 'tenantB must not appear in alice\'s list');

  const bobRes = await app.inject({ method: 'GET', url: '/v1/me/tenants', headers: bearer(bob) });
  const bobIds = bobRes.json().tenants.map((t: any) => t.id);
  assert.ok(bobIds.includes(tenantB.id));
  assert.ok(!bobIds.includes(tenantA.id));
});

test('POST /v1/tenants/:tenantId/switch updates current_tenant_id for a member', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/tenants/${tenantA.id}/switch`,
    headers: bearer(alice),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().currentTenantId, tenantA.id);

  const [reloaded] = await db.select().from(users).where(eq(users.id, alice.id)).limit(1);
  assert.equal(reloaded.currentTenantId, tenantA.id);
});

test('POST /v1/tenants/:tenantId/switch returns 404 for a non-member', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/tenants/${tenantA.id}/switch`,
    headers: bearer(bob),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'TENANT_NOT_FOUND');
});

test('POST /v1/tenants/:tenantId/switch is allowed for super_admin (cross-tenant)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/tenants/${tenantB.id}/switch`,
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().currentTenantId, tenantB.id);
});
