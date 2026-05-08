/**
 * Gate 3 — Tenant member management.
 *
 * Covers list / role-change (admin vs owner / last-owner guard) / remove.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db.js';
import { tenants, tenantUsers } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser } from './_setup.js';

let app: any;
let owner: any, secondOwner: any, admin: any, member: any, outsider: any;
let tenantA: any;

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  secondOwner = await createTestUser();
  admin = await createTestUser();
  member = await createTestUser();
  outsider = await createTestUser();

  [tenantA] = await db.insert(tenants).values({
    name: 'Members Co', slug: `mem-${owner.id}`, type: 'company', ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenantA.id, userId: owner.id, role: 'owner' },
    { tenantId: tenantA.id, userId: secondOwner.id, role: 'owner' },
    { tenantId: tenantA.id, userId: admin.id, role: 'admin' },
    { tenantId: tenantA.id, userId: member.id, role: 'member' },
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
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenantA.id)); } catch {}
  for (const u of [owner, secondOwner, admin, member, outsider]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

test('outsider listing members → 404 TENANT_NOT_FOUND', async () => {
  const r = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantA.id}/users`,
    headers: bearer(outsider),
  });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'TENANT_NOT_FOUND');
});

test('admin lists members successfully', async () => {
  const r = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantA.id}/users`,
    headers: bearer(admin),
  });
  assert.equal(r.statusCode, 200);
  const ids = r.json().users.map((u: any) => u.userId).sort();
  assert.deepEqual(ids, [owner.id, secondOwner.id, admin.id, member.id].sort());
});

test('admin cannot demote owner (TENANT_ROLE_INSUFFICIENT)', async () => {
  const r = await app.inject({
    method: 'PATCH', url: `/v1/tenants/${tenantA.id}/users/${owner.id}`,
    headers: bearer(admin),
    payload: { role: 'member' },
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'TENANT_ROLE_INSUFFICIENT');
});

test('owner promotes member to admin', async () => {
  const r = await app.inject({
    method: 'PATCH', url: `/v1/tenants/${tenantA.id}/users/${member.id}`,
    headers: bearer(owner),
    payload: { role: 'admin' },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().membership.role, 'admin');
});

test('cannot demote the last owner', async () => {
  // First demote secondOwner so only one owner remains.
  await app.inject({
    method: 'PATCH', url: `/v1/tenants/${tenantA.id}/users/${secondOwner.id}`,
    headers: bearer(owner), payload: { role: 'admin' },
  });
  const r = await app.inject({
    method: 'PATCH', url: `/v1/tenants/${tenantA.id}/users/${owner.id}`,
    headers: bearer(owner), payload: { role: 'admin' },
  });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'LAST_OWNER');
});

test('owner removes a member', async () => {
  const r = await app.inject({
    method: 'DELETE', url: `/v1/tenants/${tenantA.id}/users/${admin.id}`,
    headers: bearer(owner),
  });
  assert.equal(r.statusCode, 200);
  const [row] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.userId, admin.id), eq(tenantUsers.tenantId, tenantA.id)));
  assert.equal(row, undefined);
});

test('admin cannot promote member to owner (TENANT_ROLE_INSUFFICIENT)', async () => {
  // member was promoted to admin earlier in this suite; he tries to
  // promote himself further to owner. Body.role === 'owner' triggers
  // the same owner-escalation guard as touching an existing owner.
  const r = await app.inject({
    method: 'PATCH', url: `/v1/tenants/${tenantA.id}/users/${member.id}`,
    headers: bearer(member),
    payload: { role: 'owner' },
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'TENANT_ROLE_INSUFFICIENT');
});

test('cannot delete the last owner', async () => {
  // After the previous suite calls, only `owner` remains as owner.
  const r = await app.inject({
    method: 'DELETE', url: `/v1/tenants/${tenantA.id}/users/${owner.id}`,
    headers: bearer(owner),
  });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'LAST_OWNER');
});

test('removing a non-member returns TENANT_USER_NOT_FOUND', async () => {
  const r = await app.inject({
    method: 'DELETE', url: `/v1/tenants/${tenantA.id}/users/${outsider.id}`,
    headers: bearer(owner),
  });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'TENANT_USER_NOT_FOUND');
});
