/**
 * Task #34 — End-to-end: switching tenants reloads data with the new tenant
 * context.
 *
 * The tenant picker (`apps/web/src/components/TenantSwitcher.tsx`) is the
 * user-visible entry point for multi-tenancy on the web. When the user picks
 * a different tenant, three things must hold:
 *
 *   (a) `GET  /v1/me/tenants` lists every tenant the user belongs to and
 *       reports the currently active one (this is what the picker renders).
 *   (b) `POST /v1/tenants/:id/switch` flips `users.current_tenant_id`
 *       server-side so that subsequent requests resolve the new tenant
 *       context — including requests that omit an explicit `X-Tenant-Id`
 *       header and rely on the user's stored preference.
 *   (c) Tenant-scoped pages (Tenant Members, Tenant Modules, Tenant
 *       Activity / Command Center) hit endpoints that include the tenant
 *       id in the URL, so after the switch they MUST surface the new
 *       tenant's data, not the old one's.
 *
 * The web client reloads the page after `switchTenant`, which causes every
 * subsequent fetch to send the new id (via URL param, X-Tenant-Id header
 * derived from the stored localStorage value, or the just-updated
 * `users.current_tenant_id`). This integration test stitches together the
 * real HTTP surface (auth + tenants + tenant-admin) and drives the journey
 * via `app.inject` so a regression in any one layer (login, /me/tenants,
 * /switch, the tenant-scoped reads) shows up here without needing a real
 * browser harness.
 *
 * Two journeys are exercised:
 *   1. A normal user who is a member of TWO tenants opens the picker,
 *      switches, and then sees the second tenant's members + modules +
 *      activity (and not the first tenant's).
 *   2. A super_admin uses the "Show all tenants" surface (`GET /v1/tenants`)
 *      to see a tenant they are NOT a member of, switches into it, and the
 *      tenant-scoped reads work via the platform-role bypass
 *      (`viaPlatformRole=true`).
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, tenantUsers, tenantModules, modules,
} from '../src/schema.js';
import {
  ensureSchemaReady, createTestUser, createTestModule,
  cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

let app: any;
// Two-tenant member.
let alice: any;
let alicePassword: string;
// Owner-of-record for the two member tenants (they need an owner).
let bossA: any;
let bossB: any;
// Super-admin used in journey #2.
let superAdmin: any;
let superAdminPassword: string;
// Owner of the third tenant the super_admin is NOT a member of.
let strangerOwner: any;

let tenantA: any;  // Alice owner
let tenantB: any;  // Alice admin (second membership)
let tenantC: any;  // Alice not a member; super_admin not a member either
let modA: any;
let modB: any;

// Captured during journey for cleanup.
const cleanupTenantIds: string[] = [];

before(async () => {
  await ensureSchemaReady();

  // Two distinct modules so we can prove the tenant-scoped module list
  // changes after the switch (tenantA enables modA, tenantB enables modB).
  modA = await createTestModule();
  modB = await createTestModule();

  // Alice is the protagonist of journey #1. She needs a real password so
  // we can exercise /v1/auth/login (the same path the web client uses
  // before opening the picker).
  alice = await createTestUser();
  alicePassword = 'CorrectHorseBattery9!';
  // createTestUser inserts a placeholder hash; replace with a real one.
  const { hashPassword } = await import('../src/lib/auth.js');
  await db.update(users)
    .set({ passwordHash: await hashPassword(alicePassword), updatedAt: new Date() })
    .where(eq(users.id, alice.id));

  bossA = await createTestUser();
  bossB = await createTestUser();
  strangerOwner = await createTestUser();

  superAdmin = await createTestUser();
  superAdminPassword = 'SuperSecret#1234';
  await db.update(users)
    .set({
      platformRole: 'super_admin',
      passwordHash: await hashPassword(superAdminPassword),
      updatedAt: new Date(),
    })
    .where(eq(users.id, superAdmin.id));

  // Tenant A — alice is owner.
  [tenantA] = await db.insert(tenants).values({
    name: 'Acme Holdings', slug: uniqueId('e2e-tsw-a'),
    type: 'company', status: 'active', ownerUserId: bossA.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenantA.id, userId: bossA.id, role: 'owner', status: 'active' },
    { tenantId: tenantA.id, userId: alice.id, role: 'owner', status: 'active' },
  ]);
  await db.insert(tenantModules).values({
    tenantId: tenantA.id, moduleId: modA.id, status: 'enabled', allowAllMembers: true,
  });
  cleanupTenantIds.push(tenantA.id);

  // Tenant B — alice is admin (second membership).
  [tenantB] = await db.insert(tenants).values({
    name: 'Globex Ltd', slug: uniqueId('e2e-tsw-b'),
    type: 'company', status: 'active', ownerUserId: bossB.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenantB.id, userId: bossB.id, role: 'owner', status: 'active' },
    { tenantId: tenantB.id, userId: alice.id, role: 'admin', status: 'active' },
  ]);
  await db.insert(tenantModules).values({
    tenantId: tenantB.id, moduleId: modB.id, status: 'enabled', allowAllMembers: true,
  });
  cleanupTenantIds.push(tenantB.id);

  // Tenant C — neither alice nor super_admin are members. Used for
  // journey #2 (super_admin "Show all tenants" → switch into a tenant
  // they don't belong to).
  [tenantC] = await db.insert(tenants).values({
    name: 'Initech Corp', slug: uniqueId('e2e-tsw-c'),
    type: 'company', status: 'active', ownerUserId: strangerOwner.id,
  }).returning();
  await db.insert(tenantUsers).values({
    tenantId: tenantC.id, userId: strangerOwner.id, role: 'owner', status: 'active',
  });
  cleanupTenantIds.push(tenantC.id);

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerAuthRoutes } = await import('../src/routes/auth-routes.js');
  const { registerTenantRoutes } = await import('../src/routes/tenant-routes.js');
  const { registerTenantAdminRoutes } = await import('../src/routes/tenant-admin-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerAuthRoutes(app);
  await registerTenantRoutes(app);
  await registerTenantAdminRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const tid of cleanupTenantIds) {
    try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tid)); } catch {}
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tid)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, tid)); } catch {}
  }
  for (const u of [alice, bossA, bossB, strangerOwner, superAdmin]) {
    if (u) await cleanupUser(u.id);
  }
  for (const m of [modA, modB]) if (m) await cleanupModule(m.id);
});

// ─────────────────────────────────────────────────────────────────────────
// Journey #1 — member of TWO tenants opens the picker and switches.
// ─────────────────────────────────────────────────────────────────────────
test('member of two tenants: picker lists both, switch flips active context, scoped reads follow', async () => {
  // (0) Login the same way the web client does. The picker is rendered
  //     inside the authenticated shell, so all subsequent requests rely on
  //     the cookie returned here.
  const loginRes = await app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { email: alice.email, password: alicePassword },
  });
  assert.equal(loginRes.statusCode, 200, `login: ${loginRes.body}`);
  const tokenCookie = loginRes.cookies.find((c: any) => c.name === 'token');
  assert.ok(tokenCookie, 'login must set a token cookie');
  const cookies = { token: tokenCookie.value };

  // (a) The picker source: GET /v1/me/tenants must list BOTH tenants alice
  //     belongs to, with their roles, and report a current active tenant.
  const listRes = await app.inject({ method: 'GET', url: '/v1/me/tenants', cookies });
  assert.equal(listRes.statusCode, 200);
  const list = listRes.json();
  const ids: string[] = list.tenants.map((t: any) => t.id);
  assert.ok(ids.includes(tenantA.id), `picker must list tenantA; got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes(tenantB.id), `picker must list tenantB; got ${JSON.stringify(ids)}`);
  // Roles surface on the row so the picker can render an "owner/admin" badge.
  const rowA = list.tenants.find((t: any) => t.id === tenantA.id);
  const rowB = list.tenants.find((t: any) => t.id === tenantB.id);
  assert.equal(rowA.role, 'owner');
  assert.equal(rowB.role, 'admin');
  // tenantC is not a membership of alice's, so it must NOT appear.
  assert.ok(!ids.includes(tenantC.id), 'non-member tenant must not appear in /me/tenants');

  // Pin the active tenant to A so the rest of the test has a known
  // starting point regardless of what previous tests left behind.
  const pinRes = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/switch`, cookies,
  });
  assert.equal(pinRes.statusCode, 200);
  assert.equal(pinRes.json().currentTenantId, tenantA.id);

  // Sanity: tenant-scoped reads against tenantA show A's data.
  const usersA = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantA.id}/users`, cookies,
  });
  assert.equal(usersA.statusCode, 200);
  const userIdsA: string[] = usersA.json().users.map((u: any) => u.userId);
  assert.ok(userIdsA.includes(alice.id) && userIdsA.includes(bossA.id),
    `tenantA members should include alice + bossA; got ${JSON.stringify(userIdsA)}`);
  assert.ok(!userIdsA.includes(bossB.id), 'tenantB owner must not appear in tenantA');

  // (b) The picker click — POST /v1/tenants/:id/switch — flips the
  //     server-side active tenant to B.
  const switchRes = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantB.id}/switch`, cookies,
  });
  assert.equal(switchRes.statusCode, 200, `switch: ${switchRes.body}`);
  assert.equal(switchRes.json().currentTenantId, tenantB.id);

  // The /me/tenants `current` field is what the TenantProvider uses to
  // pick `activeTenant` after the page reloads. It must reflect the new
  // selection without a fresh login.
  const reList = await app.inject({ method: 'GET', url: '/v1/me/tenants', cookies });
  assert.equal(reList.json().current, tenantB.id,
    'after switch, /me/tenants must report tenantB as current');

  // And the underlying users.current_tenant_id row was updated — this is
  // what tenant-context resolution falls back on when a request omits
  // both the URL param and the X-Tenant-Id header.
  const [reloaded] = await db.select().from(users).where(eq(users.id, alice.id)).limit(1);
  assert.equal(reloaded.currentTenantId, tenantB.id);

  // (c) Tenant-scoped pages now resolve the NEW tenant's data.
  //     - Tenant Members page (TenantUsersPage) — membership list.
  const usersB = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantB.id}/users`, cookies,
  });
  assert.equal(usersB.statusCode, 200, `users B: ${usersB.body}`);
  const userIdsB: string[] = usersB.json().users.map((u: any) => u.userId);
  assert.ok(userIdsB.includes(alice.id) && userIdsB.includes(bossB.id),
    `tenantB members should include alice + bossB; got ${JSON.stringify(userIdsB)}`);
  assert.ok(!userIdsB.includes(bossA.id),
    `tenantB members must NOT include bossA (cross-tenant leak); got ${JSON.stringify(userIdsB)}`);

  //     - Tenant Modules page — module catalog scoped to the new tenant.
  const modsB = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantB.id}/modules`, cookies,
  });
  assert.equal(modsB.statusCode, 200, `mods B: ${modsB.body}`);
  const modSlugsB: string[] = (modsB.json().modules ?? []).map((m: any) => m.moduleSlug);
  assert.ok(modSlugsB.includes(modB.slug),
    `tenantB modules should include modB; got ${JSON.stringify(modSlugsB)}`);
  assert.ok(!modSlugsB.includes(modA.slug),
    `tenantB modules must NOT include modA (cross-tenant leak); got ${JSON.stringify(modSlugsB)}`);

  //     - Command Center / Activity — tenant-scoped audit + summary.
  const actB = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantB.id}/activity`, cookies,
  });
  // The activity endpoint must at least be reachable for the new tenant
  // (it returns 200 with an empty payload for a freshly-created tenant).
  assert.equal(actB.statusCode, 200, `activity B: ${actB.body}`);

  // And cross-tenant reads against the OLD tenant still work because alice
  // is also a member there — what changed is only the *default* active
  // tenant, not access. This mirrors what the picker promises: switching
  // is a navigation action, not a permission change.
  const usersAStill = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantA.id}/users`, cookies,
  });
  assert.equal(usersAStill.statusCode, 200);
});

// ─────────────────────────────────────────────────────────────────────────
// Journey #2 — super_admin uses "Show all tenants" + switches to a tenant
// they are NOT a member of.
// ─────────────────────────────────────────────────────────────────────────
test('super_admin: "Show all tenants" reveals non-member tenants and switching into one works', async () => {
  // Login as super_admin.
  const loginRes = await app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { email: superAdmin.email, password: superAdminPassword },
  });
  assert.equal(loginRes.statusCode, 200, `super login: ${loginRes.body}`);
  const tokenCookie = loginRes.cookies.find((c: any) => c.name === 'token');
  const cookies = { token: tokenCookie.value };

  // Membership-only listing (`meApi.tenants()`) must NOT include tenantC,
  // because super_admin was never added as a member there. This is what
  // the picker shows by default.
  const meList = await app.inject({ method: 'GET', url: '/v1/me/tenants', cookies });
  assert.equal(meList.statusCode, 200);
  const memberIds: string[] = meList.json().tenants.map((t: any) => t.id);
  assert.ok(!memberIds.includes(tenantC.id),
    'tenantC must not show up in the membership-only list');

  // Toggling "Show all tenants" calls the platform-only listing
  // (`meApi.allTenants()` → GET /v1/tenants). It must succeed for
  // super_admin and include tenantC.
  const allRes = await app.inject({ method: 'GET', url: '/v1/tenants', cookies });
  assert.equal(allRes.statusCode, 200, `super /v1/tenants: ${allRes.body}`);
  const allIds: string[] = allRes.json().tenants.map((t: any) => t.id);
  assert.ok(allIds.includes(tenantC.id),
    'super_admin "all tenants" view must include non-member tenants');

  // Picking that non-member tenant from the picker calls the same /switch
  // endpoint. The route's super_admin branch must allow it (no 404).
  const switchRes = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantC.id}/switch`, cookies,
  });
  assert.equal(switchRes.statusCode, 200, `super switch: ${switchRes.body}`);
  assert.equal(switchRes.json().currentTenantId, tenantC.id);

  // After the switch, tenant-scoped reads for tenantC succeed via
  // viaPlatformRole=true (no membership row needed).
  const usersC = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantC.id}/users`, cookies,
  });
  assert.equal(usersC.statusCode, 200, `super users C: ${usersC.body}`);
  const userIdsC: string[] = usersC.json().users.map((u: any) => u.userId);
  assert.ok(userIdsC.includes(strangerOwner.id),
    `tenantC members should include its owner; got ${JSON.stringify(userIdsC)}`);

  // And the active-tenant pointer is persisted on the user row, so a
  // subsequent page reload would resolve tenantC as the active context
  // for the super_admin.
  const [reloaded] = await db.select().from(users).where(eq(users.id, superAdmin.id)).limit(1);
  assert.equal(reloaded.currentTenantId, tenantC.id);
});
