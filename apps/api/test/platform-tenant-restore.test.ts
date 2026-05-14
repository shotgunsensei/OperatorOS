/**
 * Task #81 — POST /v1/platform/tenants/:id/restore
 *
 * Verifies:
 *   - 404 on unknown tenant
 *   - 409 TENANT_NOT_ARCHIVED when tenant is active or suspended
 *   - 200 on archived → active, audit row written with action 'tenant_restored'
 *   - non-super-admin gets 403 PLATFORM_ROLE_REQUIRED (RBAC sanity check)
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, tenants, tenantUsers, adminAuditLogs } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser, uniqueId } from './_setup.js';

let app: any;
let admin: any;
let regular: any;
let archivedTenant: any;
let activeTenant: any;

before(async () => {
  await ensureSchemaReady();
  admin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, admin.id));
  regular = await createTestUser();

  [archivedTenant] = await db.insert(tenants).values({
    name: 'Archived Co', slug: `arch-${uniqueId('t').replace(/_/g, '-')}`,
    type: 'company', ownerUserId: admin.id, status: 'archived', archivedAt: new Date(),
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: archivedTenant.id, userId: admin.id, role: 'owner' });

  [activeTenant] = await db.insert(tenants).values({
    name: 'Active Co', slug: `act-${uniqueId('t').replace(/_/g, '-')}`,
    type: 'company', ownerUserId: admin.id, status: 'active',
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: activeTenant.id, userId: admin.id, role: 'owner' });

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
  for (const t of [archivedTenant, activeTenant]) {
    if (t) {
      try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
      try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
    }
  }
  for (const u of [admin, regular]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

test('restore: 404 unknown tenant', async () => {
  const res = await app.inject({
    method: 'POST', url: '/v1/platform/tenants/00000000-0000-0000-0000-000000000000/restore',
    headers: bearer(admin),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'TENANT_NOT_FOUND');
});

test('restore: 403 PLATFORM_ROLE_REQUIRED for non-super-admin', async () => {
  const res = await app.inject({
    method: 'POST', url: `/v1/platform/tenants/${archivedTenant.id}/restore`,
    headers: bearer(regular),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
});

test('restore: 409 TENANT_NOT_ARCHIVED on active tenant', async () => {
  const res = await app.inject({
    method: 'POST', url: `/v1/platform/tenants/${activeTenant.id}/restore`,
    headers: bearer(admin),
  });
  assert.equal(res.statusCode, 409);
  const body = res.json();
  assert.equal(body.code, 'TENANT_NOT_ARCHIVED');
  assert.equal(body.currentStatus, 'active');
});

test('restore: 200 archived → active, audit written', async () => {
  const res = await app.inject({
    method: 'POST', url: `/v1/platform/tenants/${archivedTenant.id}/restore`,
    headers: bearer(admin),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.tenant.status, 'active');
  assert.equal(body.tenant.archivedAt, null);

  const [t] = await db.select().from(tenants).where(eq(tenants.id, archivedTenant.id));
  assert.equal(t.status, 'active');
  assert.equal(t.archivedAt, null);

  const auditRows = await db.select().from(adminAuditLogs).where(and(
    eq(adminAuditLogs.tenantId, archivedTenant.id),
    eq(adminAuditLogs.action, 'tenant.restored'),
  ));
  assert.ok(auditRows.length >= 1, 'audit row written');
  assert.equal(auditRows[0].adminId, admin.id);
});

test('restore: idempotent reject — calling restore on already-active fails 409', async () => {
  // After the previous test, archivedTenant is now active.
  const res = await app.inject({
    method: 'POST', url: `/v1/platform/tenants/${archivedTenant.id}/restore`,
    headers: bearer(admin),
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, 'TENANT_NOT_ARCHIVED');
});
