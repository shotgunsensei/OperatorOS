/**
 * Task #81 — DELETE /v1/platform/tenants/:id
 *
 * Verifies:
 *   - 400 TENANT_DELETE_CONFIRM_REQUIRED if ?confirm=<slug> missing/wrong
 *   - 409 TENANT_HAS_DEPENDENTS when active addons / launchable modules /
 *     non-super-admin members exist (returns dependents counts)
 *   - 200 + transactional delete on a clean tenant; audit row written
 *     BEFORE the delete with action 'tenant_deleted' and pickSafe snapshot
 *   - tenant + child rows actually removed
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, tenantUsers, tenantModules, modules, addonSubscriptions,
  adminAuditLogs,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, createTestModule, cleanupUser, cleanupModule, uniqueId } from './_setup.js';

let app: any;
let admin: any;
let otherUser: any;

before(async () => {
  await ensureSchemaReady();
  admin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, admin.id));
  otherUser = await createTestUser();

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
  for (const u of [admin, otherUser]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

async function makeTenant(slug?: string) {
  const s = slug ?? `del-${uniqueId('t').replace(/_/g, '-')}`;
  const [t] = await db.insert(tenants).values({
    name: 'Delete Me', slug: s, type: 'company', ownerUserId: admin.id, status: 'active',
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: t.id, userId: admin.id, role: 'owner' });
  return t;
}

test('hard-delete: 400 TENANT_DELETE_CONFIRM_REQUIRED when confirm missing', async () => {
  const t = await makeTenant();
  try {
    const res = await app.inject({
      method: 'DELETE', url: `/v1/platform/tenants/${t.id}`,
      headers: bearer(admin),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().code, 'TENANT_DELETE_CONFIRM_REQUIRED');
  } finally {
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
  }
});

test('hard-delete: 400 when confirm slug does not match', async () => {
  const t = await makeTenant();
  try {
    const res = await app.inject({
      method: 'DELETE', url: `/v1/platform/tenants/${t.id}?confirm=wrong-slug`,
      headers: bearer(admin),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().code, 'TENANT_DELETE_CONFIRM_REQUIRED');
  } finally {
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
  }
});

test('hard-delete: 409 TENANT_HAS_DEPENDENTS — non-super-admin member', async () => {
  const t = await makeTenant();
  await db.insert(tenantUsers).values({ tenantId: t.id, userId: otherUser.id, role: 'member' });
  try {
    const res = await app.inject({
      method: 'DELETE', url: `/v1/platform/tenants/${t.id}?confirm=${t.slug}`,
      headers: bearer(admin),
    });
    assert.equal(res.statusCode, 409);
    const body = res.json();
    assert.equal(body.code, 'TENANT_HAS_DEPENDENTS');
    assert.equal(body.dependents.nonAdminMembers, 1);
    assert.equal(body.dependents.activeAddons, 0);
    assert.equal(body.dependents.launchableModules, 0);

    // Tenant must still exist.
    const [still] = await db.select().from(tenants).where(eq(tenants.id, t.id));
    assert.ok(still, 'tenant not deleted');
  } finally {
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
  }
});

test('hard-delete: 409 TENANT_HAS_DEPENDENTS — launchable tenant_module', async () => {
  const t = await makeTenant();
  const m = await createTestModule();
  await db.insert(tenantModules).values({
    tenantId: t.id, moduleId: m.id, status: 'enabled', source: 'admin',
  });
  try {
    const res = await app.inject({
      method: 'DELETE', url: `/v1/platform/tenants/${t.id}?confirm=${t.slug}`,
      headers: bearer(admin),
    });
    assert.equal(res.statusCode, 409);
    const body = res.json();
    assert.equal(body.code, 'TENANT_HAS_DEPENDENTS');
    assert.equal(body.dependents.launchableModules, 1);
  } finally {
    try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, t.id)); } catch {}
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
    await cleanupModule(m.id);
  }
});

test('hard-delete: 409 TENANT_HAS_DEPENDENTS — active addon subscription', async () => {
  const t = await makeTenant();
  const m = await createTestModule();
  await db.insert(addonSubscriptions).values({
    userId: admin.id, tenantId: t.id, moduleId: m.id,
    status: 'active', amount: 0,
  });
  try {
    const res = await app.inject({
      method: 'DELETE', url: `/v1/platform/tenants/${t.id}?confirm=${t.slug}`,
      headers: bearer(admin),
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().dependents.activeAddons, 1);
  } finally {
    try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.tenantId, t.id)); } catch {}
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
    await cleanupModule(m.id);
  }
});

test('hard-delete: 200 deletes tenant + writes audit before delete', async () => {
  const t = await makeTenant();
  // Deliberately leave only the calling super_admin as a member.
  const res = await app.inject({
    method: 'DELETE', url: `/v1/platform/tenants/${t.id}?confirm=${t.slug}`,
    headers: bearer(admin),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.deletedTenant.slug, t.slug);

  const remaining = await db.select().from(tenants).where(eq(tenants.id, t.id));
  assert.equal(remaining.length, 0, 'tenant row removed');
  const remainingMembers = await db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, t.id));
  assert.equal(remainingMembers.length, 0, 'tenant_users rows removed');

  const auditRows = await db.select().from(adminAuditLogs).where(and(
    eq(adminAuditLogs.tenantId, t.id),
    eq(adminAuditLogs.action, 'tenant_deleted'),
  ));
  assert.ok(auditRows.length >= 1, 'audit row written');
  const audit = auditRows[0];
  assert.equal(audit.adminId, admin.id);
  const details = audit.details as any;
  assert.equal(details.targetType, 'tenant');
  assert.equal(details.before?.slug, t.slug);
  assert.equal(details.after, null);
});

test('hard-delete: 403 PLATFORM_ROLE_REQUIRED for non-super-admin', async () => {
  const t = await makeTenant();
  try {
    const res = await app.inject({
      method: 'DELETE', url: `/v1/platform/tenants/${t.id}?confirm=${t.slug}`,
      headers: bearer(otherUser),
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
  } finally {
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
  }
});
