/**
 * Gate 2 — Tenant CRUD platform tests.
 *
 * Covers:
 *   - POST   /v1/platform/tenants               — create + audit
 *   - POST   /v1/platform/tenants               — slug collision -> 409
 *   - PATCH  /v1/platform/tenants/:id           — slug collision -> 409
 *   - POST   .../suspend / .../reactivate / .../archive — status flips + audit
 *   - GET    .../detail                          — bundles members + modules
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, tenants, tenantUsers, adminAuditLogs } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser, uniqueId } from './_setup.js';

let app: any;
let superAdmin: any;
let owner: any;
const createdTenantIds: string[] = [];

before(async () => {
  await ensureSchemaReady();
  superAdmin = await createTestUser();
  owner = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

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
  for (const id of createdTenantIds) {
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, id)); } catch {}
    try { await db.delete(adminAuditLogs).where(eq(adminAuditLogs.tenantId, id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, id)); } catch {}
  }
  for (const u of [superAdmin, owner]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

test('POST /v1/platform/tenants creates tenant + owner mapping + audit', async () => {
  const slug = `tcrud-${uniqueId("t").replace(/_/g,"-")}`;
  const res = await app.inject({
    method: 'POST', url: '/v1/platform/tenants',
    headers: bearer(superAdmin),
    payload: { name: 'Crud Co', slug, ownerUserId: owner.id, type: 'company' },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.tenant.slug, slug);
  assert.equal(body.tenant.status, 'active');
  createdTenantIds.push(body.tenant.id);

  // Owner mapping created.
  const [m] = await db.select().from(tenantUsers).where(and(eq(tenantUsers.tenantId, body.tenant.id), eq(tenantUsers.userId, owner.id)));
  assert.ok(m, 'owner mapping inserted');
  assert.equal(m.role, 'owner');

  // Audit row written.
  const [audit] = await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.tenantId, body.tenant.id)).orderBy(desc(adminAuditLogs.createdAt));
  assert.ok(audit, 'audit row written');
  assert.equal(audit.action, 'tenant_created');
  assert.equal((audit.details as any)?.targetType, 'tenant');
});

test('POST /v1/platform/tenants returns 409 SLUG_TAKEN on collision', async () => {
  const slug = `tcrud-collide-${uniqueId("t").replace(/_/g,"-")}`;
  const r1 = await app.inject({ method: 'POST', url: '/v1/platform/tenants', headers: bearer(superAdmin), payload: { name: 'A', slug, ownerUserId: owner.id, type: 'company' } });
  assert.equal(r1.statusCode, 201);
  createdTenantIds.push(r1.json().tenant.id);
  const r2 = await app.inject({ method: 'POST', url: '/v1/platform/tenants', headers: bearer(superAdmin), payload: { name: 'B', slug, ownerUserId: owner.id, type: 'company' } });
  assert.equal(r2.statusCode, 409);
  assert.equal(r2.json().code, 'SLUG_TAKEN');
});

test('PATCH slug collision -> 409 SLUG_TAKEN; rename succeeds otherwise', async () => {
  const a = await app.inject({ method: 'POST', url: '/v1/platform/tenants', headers: bearer(superAdmin), payload: { name: 'A', slug: `tcrud-a-${uniqueId("t").replace(/_/g,"-")}`, ownerUserId: owner.id, type: 'company' } });
  const b = await app.inject({ method: 'POST', url: '/v1/platform/tenants', headers: bearer(superAdmin), payload: { name: 'B', slug: `tcrud-b-${uniqueId("t").replace(/_/g,"-")}`, ownerUserId: owner.id, type: 'company' } });
  const aid = a.json().tenant.id, bid = b.json().tenant.id;
  createdTenantIds.push(aid, bid);

  // Collision: try renaming A to B's slug.
  const collide = await app.inject({ method: 'PATCH', url: `/v1/platform/tenants/${aid}`, headers: bearer(superAdmin), payload: { slug: b.json().tenant.slug } });
  assert.equal(collide.statusCode, 409);
  assert.equal(collide.json().code, 'SLUG_TAKEN');

  // Rename to a fresh slug works.
  const fresh = `tcrud-renamed-${uniqueId("t").replace(/_/g,"-")}`;
  const rename = await app.inject({ method: 'PATCH', url: `/v1/platform/tenants/${aid}`, headers: bearer(superAdmin), payload: { slug: fresh, name: 'Renamed' } });
  assert.equal(rename.statusCode, 200);
  assert.equal(rename.json().tenant.slug, fresh);
  assert.equal(rename.json().tenant.name, 'Renamed');
});

test('lifecycle: suspend -> reactivate -> archive sets timestamps + status', async () => {
  const r = await app.inject({ method: 'POST', url: '/v1/platform/tenants', headers: bearer(superAdmin), payload: { name: 'LC', slug: `tcrud-lc-${uniqueId("t").replace(/_/g,"-")}`, ownerUserId: owner.id, type: 'company' } });
  const id = r.json().tenant.id; createdTenantIds.push(id);

  let res = await app.inject({ method: 'POST', url: `/v1/platform/tenants/${id}/suspend`, headers: bearer(superAdmin) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().tenant.status, 'suspended');
  assert.ok(res.json().tenant.suspendedAt);

  res = await app.inject({ method: 'POST', url: `/v1/platform/tenants/${id}/reactivate`, headers: bearer(superAdmin) });
  assert.equal(res.json().tenant.status, 'active');
  assert.equal(res.json().tenant.suspendedAt, null);

  res = await app.inject({ method: 'POST', url: `/v1/platform/tenants/${id}/archive`, headers: bearer(superAdmin) });
  assert.equal(res.json().tenant.status, 'archived');
  assert.ok(res.json().tenant.archivedAt);
});

test('GET .../detail bundles members and modules and billing summary', async () => {
  const r = await app.inject({ method: 'POST', url: '/v1/platform/tenants', headers: bearer(superAdmin), payload: { name: 'D', slug: `tcrud-d-${uniqueId("t").replace(/_/g,"-")}`, ownerUserId: owner.id, type: 'company' } });
  const id = r.json().tenant.id; createdTenantIds.push(id);
  const detail = await app.inject({ method: 'GET', url: `/v1/platform/tenants/${id}/detail`, headers: bearer(superAdmin) });
  assert.equal(detail.statusCode, 200);
  const body = detail.json();
  assert.equal(body.tenant.id, id);
  assert.ok(Array.isArray(body.members));
  assert.equal(body.members.length, 1, 'owner mapped on create');
  assert.ok(Array.isArray(body.modules));
  assert.equal(typeof body.billing.activeAddonCount, 'number');
});

test('GET .../detail 404 for unknown tenant', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/platform/tenants/00000000-0000-0000-0000-000000000000/detail', headers: bearer(superAdmin) });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'TENANT_NOT_FOUND');
});
