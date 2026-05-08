/**
 * Task #27 — End-to-end: a brand-new user can register, accept an invite,
 * log in, and see ONLY the modules granted to them on the launchpad.
 *
 * This test stitches together the real HTTP surface (auth + tenant-admin +
 * module-routes) into a single Fastify instance and drives the journey
 * through `app.inject` so a regression in any one layer (register, accept,
 * login, /v1/me/modules) shows up here.
 *
 * Journey:
 *   1. Owner exists in a tenant with TWO enabled modules:
 *        - grantedMod   → invitee will get an explicit per-user grant
 *        - withheldMod  → tenant-enabled but allowAllMembers=false and
 *                         no per-user grant for the invitee
 *      A third module lives in OTHER tenant; it must never leak.
 *   2. Owner POST /v1/tenants/:id/invites for invitee@... .
 *   3. Brand-new user POST /v1/auth/register with that email.
 *   4. New user POST /v1/invites/:token/accept .
 *   5. New user POST /v1/auth/login (cookie + token round-trip).
 *   6. Owner POST .../users/:userId/module-access for grantedMod (level=user).
 *   7. New user GET /v1/me/modules with the cookie from step 5 → asserts
 *      exactly {grantedMod} appears (withheldMod absent, otherTenantMod absent).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, tenantUsers, tenantInvites,
  tenantModules, tenantUserModuleAccess,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady, createTestUser, createTestModule,
  cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

let app: any;
let owner: any;
let tenantA: any, tenantB: any;
let grantedMod: any, withheldMod: any, otherTenantMod: any;
// Captured during the journey so teardown can reach them.
let inviteeUserId: string | null = null;
let inviteeEmail: string | null = null;

before(async () => {
  await ensureSchemaReady();

  owner = await createTestUser();
  grantedMod    = await createTestModule();
  withheldMod   = await createTestModule();
  otherTenantMod = await createTestModule();

  // Tenant A — the one the invitee will join.
  [tenantA] = await db.insert(tenants).values({
    name: 'Onboarding Co',
    slug: uniqueId('e2e-onboard'),
    type: 'company',
    status: 'active',
    ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values({
    tenantId: tenantA.id, userId: owner.id, role: 'owner', status: 'active',
  });
  await db.insert(tenantModules).values([
    // Granted module: enabled, NOT auto-shared. Owner will explicitly grant
    // the invitee access in step 6.
    { tenantId: tenantA.id, moduleId: grantedMod.id,  status: 'enabled', allowAllMembers: false },
    // Withheld module: enabled in the tenant but caller has no grant +
    // allowAllMembers=false → must not appear on launchpad.
    { tenantId: tenantA.id, moduleId: withheldMod.id, status: 'enabled', allowAllMembers: false },
  ]);

  // Tenant B — a sibling tenant the invitee never joins. Its enabled
  // module must NEVER leak across the tenant boundary.
  [tenantB] = await db.insert(tenants).values({
    name: 'Other Co',
    slug: uniqueId('e2e-other'),
    type: 'company',
    status: 'active',
    ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantModules).values({
    tenantId: tenantB.id, moduleId: otherTenantMod.id,
    status: 'enabled', allowAllMembers: true,
  });

  // Stand up a Fastify app with all the routes the journey touches.
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerAuthRoutes } = await import('../src/routes/auth-routes.js');
  const { registerTenantAdminRoutes } = await import('../src/routes/tenant-admin-routes.js');
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerAuthRoutes(app);
  await registerTenantAdminRoutes(app);
  await registerModuleRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  // Tenant A
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantInvites).where(eq(tenantInvites.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenantA.id)); } catch {}
  // Tenant B
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenantB.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantB.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenantB.id)); } catch {}
  // Users + modules
  if (inviteeUserId) await cleanupUser(inviteeUserId);
  if (owner) await cleanupUser(owner.id);
  for (const m of [grantedMod, withheldMod, otherTenantMod]) if (m) await cleanupModule(m.id);
});

const ownerBearer = () => ({
  authorization: `Bearer ${signToken({ userId: owner.id, email: owner.email, role: owner.role })}`,
});

test('owner→invite→register→accept→login→launchpad shows only granted module', async () => {
  inviteeEmail = `${uniqueId('e2e-invitee')}@test.local`;

  // 1. Owner creates an invite for the future member.
  const inviteRes = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: ownerBearer(),
    payload: { email: inviteeEmail, role: 'member' },
  });
  assert.equal(inviteRes.statusCode, 200, `invite create: ${inviteRes.body}`);
  const inviteToken: string = inviteRes.json().invite.token;
  assert.ok(inviteToken, 'invite must carry a token');

  // 2. Brand-new user registers themselves.
  const registerRes = await app.inject({
    method: 'POST', url: '/v1/auth/register',
    payload: { email: inviteeEmail, password: 'CorrectHorseBattery9!', name: 'New Member' },
  });
  assert.equal(registerRes.statusCode, 200, `register: ${registerRes.body}`);
  const registerBody = registerRes.json();
  inviteeUserId = registerBody.user.id;
  const registerToken: string = registerBody.token;
  assert.ok(inviteeUserId && registerToken);

  // 3. New user accepts the invite using the JWT issued at registration.
  const acceptRes = await app.inject({
    method: 'POST', url: `/v1/invites/${inviteToken}/accept`,
    headers: { authorization: `Bearer ${registerToken}` },
  });
  assert.equal(acceptRes.statusCode, 200, `accept: ${acceptRes.body}`);
  assert.equal(acceptRes.json().tenantId, tenantA.id);
  // Membership row exists with role=member.
  const [mem] = await db.select().from(tenantUsers).where(eq(tenantUsers.userId, inviteeUserId));
  assert.equal(mem.role, 'member');

  // 4. New user logs in via /v1/auth/login. Use the resulting auth cookie
  //    on the launchpad call so we exercise the full cookie path that the
  //    web client uses, not just bearer-token shortcuts.
  const loginRes = await app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { email: inviteeEmail, password: 'CorrectHorseBattery9!' },
  });
  assert.equal(loginRes.statusCode, 200, `login: ${loginRes.body}`);
  const loginCookie = loginRes.cookies.find((c: any) => c.name === 'token');
  assert.ok(loginCookie, 'login must set a token cookie');

  // 5. Owner explicitly grants the invitee access to grantedMod.
  const grantRes = await app.inject({
    method: 'POST',
    url: `/v1/tenants/${tenantA.id}/users/${inviteeUserId}/module-access`,
    headers: ownerBearer(),
    payload: { moduleSlug: grantedMod.slug, accessLevel: 'user' },
  });
  assert.equal(grantRes.statusCode, 200, `grant: ${grantRes.body}`);

  // 6. New user fetches their launchpad with the login cookie.
  const launchRes = await app.inject({
    method: 'GET', url: '/v1/me/modules',
    cookies: { token: loginCookie.value },
  });
  assert.equal(launchRes.statusCode, 200, `launchpad: ${launchRes.body}`);
  const slugs: string[] = launchRes.json().modules.map((m: any) => m.slug);

  // Strict "only their apps" contract: the launchpad must list EXACTLY the
  // single granted module — no extra rows, no withheld sibling, no
  // cross-tenant leak.
  assert.deepEqual(slugs.slice().sort(), [grantedMod.slug],
    `launchpad must contain exactly [${grantedMod.slug}]; got ${JSON.stringify(slugs)}`);
  assert.ok(!slugs.includes(withheldMod.slug),
    `withheld module ${withheldMod.slug} must NOT appear; got ${JSON.stringify(slugs)}`);
  assert.ok(!slugs.includes(otherTenantMod.slug),
    `other-tenant module ${otherTenantMod.slug} must NOT leak; got ${JSON.stringify(slugs)}`);

  // Shape contract MyAppsPage relies on.
  const m = launchRes.json().modules.find((x: any) => x.slug === grantedMod.slug);
  for (const k of ['slug', 'name', 'description', 'category', 'iconUrl', 'baseUrl']) {
    assert.ok(k in m, `launchpad module missing field ${k}`);
  }
});
