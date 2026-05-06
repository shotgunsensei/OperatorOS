/**
 * Gate 2 — Module CRUD + slug/archive guards.
 *
 * Covers:
 *   - POST /v1/platform/modules — create + 409 SLUG_TAKEN
 *   - PATCH /v1/platform/modules/:slug — slug change blocked when entitlements exist
 *   - POST .../archive — refuses with 409 MODULE_HAS_ACTIVE_SUBS unless ?confirm=1
 *   - Soft-delete: archived module excluded from default list, included with includeArchived
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, like } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, modules, addonSubscriptions, entitlementOverrides,
  adminAuditLogs,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser, uniqueId } from './_setup.js';

let app: any;
let superAdmin: any;
let owner: any;
let tenantA: any;
const createdModuleIds: string[] = [];

before(async () => {
  await ensureSchemaReady();
  superAdmin = await createTestUser();
  owner = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));
  [tenantA] = await db.insert(tenants).values({
    name: 'MCRUD Tenant', slug: `mcrud-${uniqueId("t").replace(/_/g,"-")}`, type: 'company', ownerUserId: owner.id,
  }).returning();

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
  for (const id of createdModuleIds) {
    try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.moduleId, id)); } catch {}
    try { await db.delete(entitlementOverrides).where(eq(entitlementOverrides.moduleId, id)); } catch {}
    try { await db.delete(modules).where(eq(modules.id, id)); } catch {}
  }
  if (tenantA) try { await db.delete(tenants).where(eq(tenants.id, tenantA.id)); } catch {}
  // Audit cleanup (best-effort) for module-targeting rows.
  try { await db.delete(adminAuditLogs).where(eq(adminAuditLogs.adminId, superAdmin.id)); } catch {}
  for (const u of [superAdmin, owner]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

async function createModule(slugSuffix: string, body: any = {}) {
  const slug = `mcrud-${slugSuffix}-${uniqueId("m").replace(/_/g,"-")}`;
  const res = await app.inject({
    method: 'POST', url: '/v1/platform/modules', headers: bearer(superAdmin),
    payload: { slug, name: `M ${slugSuffix}`, status: 'live', planMin: 'starter', ord: 99, ...body },
  });
  assert.equal(res.statusCode, 201, `create module ${slug}: ${res.body}`);
  const created = res.json().module;
  createdModuleIds.push(created.id);
  return created;
}

test('POST /v1/platform/modules creates module with audit', async () => {
  const m = await createModule('basic');
  assert.equal(m.status, 'live');
  assert.equal(m.archivedAt, null);
});

test('POST /v1/platform/modules returns 409 SLUG_TAKEN', async () => {
  const m = await createModule('collide');
  const dup = await app.inject({
    method: 'POST', url: '/v1/platform/modules', headers: bearer(superAdmin),
    payload: { slug: m.slug, name: 'dup' },
  });
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.json().code, 'SLUG_TAKEN');
});

test('PATCH slug change blocked (409 MODULE_HAS_DEPENDENTS) when entitlements exist', async () => {
  const m = await createModule('slug-guard');
  // Insert an entitlement override to simulate dependent state.
  await db.insert(entitlementOverrides).values({
    userId: owner.id, moduleId: m.id, grant: true, createdByAdminId: superAdmin.id,
  });
  const res = await app.inject({
    method: 'PATCH', url: `/v1/platform/modules/${m.slug}`,
    headers: bearer(superAdmin), payload: { slug: `mcrud-renamed-${uniqueId("m").replace(/_/g,"-")}` },
  });
  assert.equal(res.statusCode, 409);
  const body = res.json();
  assert.equal(body.code, 'MODULE_HAS_DEPENDENTS');
  assert.equal(body.entitlementOverrideCount, 1);
});

test('archive: 409 MODULE_HAS_ACTIVE_SUBS without ?confirm=1; succeeds with', async () => {
  const m = await createModule('archive-guard');
  await db.insert(addonSubscriptions).values({
    userId: owner.id, moduleId: m.id, status: 'active', tenantId: tenantA.id,
    amount: 1500, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30*24*3600*1000),
  });
  const blocked = await app.inject({ method: 'POST', url: `/v1/platform/modules/${m.slug}/archive`, headers: bearer(superAdmin) });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.json().code, 'MODULE_HAS_ACTIVE_SUBS');
  assert.equal(blocked.json().activeSubscriptionCount, 1);

  const ok = await app.inject({ method: 'POST', url: `/v1/platform/modules/${m.slug}/archive?confirm=1`, headers: bearer(superAdmin) });
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.json().module.archivedAt);
});

test('soft-delete: archived module hidden from default list, visible with includeArchived', async () => {
  const m = await createModule('soft-delete', { status: 'live' });
  await app.inject({ method: 'POST', url: `/v1/platform/modules/${m.slug}/archive`, headers: bearer(superAdmin) });

  const def = await app.inject({ method: 'GET', url: '/v1/platform/modules', headers: bearer(superAdmin) });
  const inc = await app.inject({ method: 'GET', url: '/v1/platform/modules?includeArchived=1', headers: bearer(superAdmin) });
  const slugsDef = def.json().modules.map((x: any) => x.slug);
  const slugsInc = inc.json().modules.map((x: any) => x.slug);
  assert.ok(!slugsDef.includes(m.slug), 'archived module hidden by default');
  assert.ok(slugsInc.includes(m.slug),  'archived module returned with includeArchived=1');
});

test('archive idempotency: archiving again returns already_archived', async () => {
  const m = await createModule('idem');
  const a = await app.inject({ method: 'POST', url: `/v1/platform/modules/${m.slug}/archive`, headers: bearer(superAdmin) });
  assert.equal(a.statusCode, 200);
  const b = await app.inject({ method: 'POST', url: `/v1/platform/modules/${m.slug}/archive`, headers: bearer(superAdmin) });
  assert.equal(b.statusCode, 200);
  assert.equal(b.json().action, 'already_archived');
});
