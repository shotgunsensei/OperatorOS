/**
 * Gate 2 — Platform-route RBAC tests.
 *
 * Asserts the canonical contract:
 *   - All /v1/platform/* routes return 401 unauthenticated.
 *   - Regular and tenant-admin users get 403 PLATFORM_ROLE_REQUIRED.
 *   - super_admin gets through.
 *
 * Smoke-tests three representative routes (one GET, one POST, one
 * lifecycle action) so the gate covers the whole surface without
 * exhaustively re-listing every endpoint.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, tenants, tenantUsers } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser, uniqueId } from './_setup.js';

let app: any;
let alice: any;
let superAdmin: any;
let tenantA: any;

before(async () => {
  await ensureSchemaReady();
  alice = await createTestUser();
  superAdmin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

  [tenantA] = await db.insert(tenants).values({
    name: 'PRBAC Tenant', slug: `prbac-${uniqueId("t").replace(/_/g,"-")}`, type: 'company', ownerUserId: alice.id,
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: tenantA.id, userId: alice.id, role: 'owner' });

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerPlatformRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (tenantA) {
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantA.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, tenantA.id)); } catch {}
  }
  for (const u of [alice, superAdmin]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

const SAMPLE_ROUTES: Array<{ method: 'GET' | 'POST'; url: () => string }> = [
  { method: 'GET',  url: () => '/v1/platform/tenants' },
  { method: 'GET',  url: () => '/v1/platform/health' },
  { method: 'POST', url: () => `/v1/platform/tenants/${tenantA.id}/suspend` },
];

test('all platform routes: 401 unauthenticated', async () => {
  for (const r of SAMPLE_ROUTES) {
    const res = await app.inject({ method: r.method, url: r.url() });
    assert.equal(res.statusCode, 401, `${r.method} ${r.url()} should require auth`);
  }
});

test('all platform routes: 403 PLATFORM_ROLE_REQUIRED for non-super_admin', async () => {
  for (const r of SAMPLE_ROUTES) {
    const res = await app.inject({ method: r.method, url: r.url(), headers: bearer(alice) });
    assert.equal(res.statusCode, 403, `${r.method} ${r.url()} should reject non-super-admin`);
    assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
  }
});

test('platform routes: super_admin reaches GET endpoints', async () => {
  const list = await app.inject({ method: 'GET', url: '/v1/platform/tenants', headers: bearer(superAdmin) });
  assert.equal(list.statusCode, 200);
  assert.ok(Array.isArray(list.json().tenants), 'list returns tenants[]');

  const health = await app.inject({ method: 'GET', url: '/v1/platform/health', headers: bearer(superAdmin) });
  assert.equal(health.statusCode, 200);
  assert.equal(typeof health.json().ok, 'boolean');
});
