/**
 * End-to-end tenant invitation onboarding: new and existing accounts retain
 * their default tenant until the invited user explicitly accepts.
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
 *   3. Brand-new user POST /v1/auth/register with that exact invite email.
 *      Registration creates only the user's default tenant and keeps the
 *      invitation pending.
 *   4. New user POST /v1/auth/login and receives a host-only session cookie.
 *   5. The user explicitly accepts; retrying acceptance is idempotent.
 *   7. Owner POST .../users/:userId/module-access for grantedMod (level=user).
 *   8. New user GET /v1/me/modules with the cookie from step 4 → asserts the
 *      explicit grant plus only canonical free companions appear
 *      (withheldMod absent, otherTenantMod absent).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, tenantUsers, tenantInvites,
  tenantModules, tenantUserModuleAccess,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { FREE_ACCOUNT_APP_SLUGS } from '../src/lib/free-account-apps.js';
import {
  ensureSchemaReady, createTestUser, createTestModule,
  cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

let app: any;
let owner: any;
let tenantA: any, tenantB: any;
let grantedMod: any, withheldMod: any, otherTenantMod: any;
// Captured during the journey so teardown can reach them.
const inviteeUserIds: string[] = [];
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
    { tenantId: tenantA.id, moduleId: grantedMod.id,  status: 'enabled', source: 'admin', allowAllMembers: false },
    // Withheld module: enabled in the tenant but caller has no grant +
    // allowAllMembers=false → must not appear on launchpad.
    { tenantId: tenantA.id, moduleId: withheldMod.id, status: 'enabled', source: 'admin', allowAllMembers: false },
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
    status: 'enabled', source: 'admin', allowAllMembers: true,
  });

  // Stand up a Fastify app with all the routes the journey touches.
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerAuthRoutes } = await import('../src/routes/auth-routes.js');
  const { registerTenantAdminRoutes } = await import('../src/routes/tenant-admin-routes.js');
  const { registerTenantRoutes } = await import('../src/routes/tenant-routes.js');
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerAuthRoutes(app);
  await registerTenantAdminRoutes(app);
  await registerTenantRoutes(app);
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
  for (const userId of inviteeUserIds) await cleanupUser(userId);
  if (owner) await cleanupUser(owner.id);
  for (const m of [grantedMod, withheldMod, otherTenantMod]) if (m) await cleanupModule(m.id);
});

const ownerBearer = () => ({
  authorization: `Bearer ${signToken({ userId: owner.id, email: owner.email, role: owner.role, sessionType: 'platform' })}`,
});

test('generic registration preserves the default tenant until explicit invitation acceptance', async () => {
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
  assert.equal(registerRes.statusCode, 202, `register: ${registerRes.body}`);
  const registerBody = registerRes.json();
  assert.deepEqual(registerBody, { ok: true }, 'registration must not disclose whether the account already existed');
  assert.ok(!('user' in registerBody), 'registration must not disclose the registered user');
  assert.ok(!('token' in registerBody), 'registration must not issue a browser bearer token');

  const [registeredUser] = await db.select().from(users).where(eq(users.email, inviteeEmail));
  assert.ok(registeredUser, 'registration must persist the invited user');
  inviteeUserIds.push(registeredUser.id);
  assert.notEqual(registeredUser.currentTenantId, tenantA.id, 'registration must not switch into an invited tenant');
  const [personalTenant] = await db.select().from(tenants).where(and(
    eq(tenants.ownerUserId, registeredUser.id),
    eq(tenants.type, 'personal'),
  ));
  assert.ok(personalTenant, 'every new account owns a default tenant');
  assert.equal(registeredUser.currentTenantId, personalTenant.id);
  const [prematureMembership] = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, tenantA.id),
    eq(tenantUsers.userId, registeredUser.id),
  ));
  assert.equal(prematureMembership, undefined, 'registration must not grant invited tenant membership');
  const [pendingInvite] = await db.select().from(tenantInvites).where(eq(tenantInvites.token, inviteToken));
  assert.equal(pendingInvite?.acceptedAt, null);
  assert.equal(pendingInvite?.declinedAt, null);

  // 3. New user logs in via /v1/auth/login. The generic registration response
  //    intentionally carries neither user identity nor credentials, so login
  //    is the first authenticated step in the journey.
  const loginRes = await app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { email: inviteeEmail, password: 'CorrectHorseBattery9!' },
  });
  assert.equal(loginRes.statusCode, 200, `login: ${loginRes.body}`);
  const loginBody = loginRes.json();
  const inviteeUserId = loginBody.user.id as string;
  assert.equal(inviteeUserId, registeredUser.id);
  assert.ok(inviteeUserId, 'login must return the authenticated user id');
  assert.equal(loginBody.user.currentTenantId, personalTenant.id, 'login must preserve the existing tenant choice');
  assert.ok(!('onboarding' in loginBody), 'login must not auto-accept pending invitations');
  const loginCookie = loginRes.cookies.find((c: any) => c.name === 'operatoros_session');
  assert.ok(loginCookie, 'login must set the host-only OperatorOS session cookie');

  // 4. The recipient explicitly accepts from the emailed link.
  const acceptRes = await app.inject({
    method: 'POST', url: `/v1/invites/${inviteToken}/accept`,
    cookies: { operatoros_session: loginCookie.value },
  });
  assert.equal(acceptRes.statusCode, 200, `accept: ${acceptRes.body}`);
  assert.equal(acceptRes.json().tenantId, tenantA.id);
  assert.equal(acceptRes.json().alreadyAccepted, false);
  // Membership row exists with role=member.
  const [mem] = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, tenantA.id),
    eq(tenantUsers.userId, inviteeUserId),
  ));
  assert.equal(mem.role, 'member');
  const [acceptedUser] = await db.select().from(users).where(eq(users.id, inviteeUserId));
  assert.equal(acceptedUser.currentTenantId, tenantA.id, 'acceptance switches to the inviting tenant');
  const retry = await app.inject({
    method: 'POST', url: `/v1/invites/${inviteToken}/accept`,
    cookies: { operatoros_session: loginCookie.value },
  });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json().alreadyAccepted, true);

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
    cookies: { operatoros_session: loginCookie.value },
  });
  assert.equal(launchRes.statusCode, 200, `launchpad: ${launchRes.body}`);
  const slugs: string[] = launchRes.json().modules.map((m: any) => m.slug);

  // Strict "only their apps" contract: the explicit grant must be present and
  // any additional launcher must be one of the product-owned free companions.
  // Which free rows exist is deliberately seed-order independent so this test
  // proves the real persisted policy on both a fresh and a reused disposable
  // database without weakening withheld/cross-tenant assertions.
  assert.ok(slugs.includes(grantedMod.slug),
    `launchpad must contain explicit grant ${grantedMod.slug}; got ${JSON.stringify(slugs)}`);
  const allowed = new Set<string>([grantedMod.slug, ...FREE_ACCOUNT_APP_SLUGS]);
  const unexpected = slugs.filter(slug => !allowed.has(slug));
  assert.deepEqual(unexpected, [],
    `launchpad contains unauthorized modules ${JSON.stringify(unexpected)}; got ${JSON.stringify(slugs)}`);
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

test('invite link creates a normal account first and joins only after explicit acceptance', async () => {
  const email = `${uniqueId('direct-invitee')}@test.local`;
  const inviteRes = await app.inject({
    method: 'POST',
    url: `/v1/tenants/${tenantA.id}/invites`,
    headers: ownerBearer(),
    payload: { email, role: 'member' },
  });
  assert.equal(inviteRes.statusCode, 200, `invite create: ${inviteRes.body}`);
  const token: string = inviteRes.json().invite.token;

  const registerRes = await app.inject({
    method: 'POST',
    url: '/v1/auth/register-with-invite',
    payload: { token, password: 'DirectInvitePassword9!', name: 'Direct Invitee' },
  });
  assert.equal(registerRes.statusCode, 201, `direct invite registration: ${registerRes.body}`);
  const body = registerRes.json();
  inviteeUserIds.push(body.user.id);
  assert.equal(body.user.email, email);
  assert.equal(body.user.currentTenantId, body.personalTenantId);
  assert.equal(body.invitation.tenantName, tenantA.name);
  assert.equal(body.invitation.role, 'member');
  assert.equal(body.invitation.status, 'pending');
  const sessionCookie = registerRes.cookies.find((cookie: any) => cookie.name === 'operatoros_session');
  assert.ok(sessionCookie, 'direct invite registration must issue the host-only session cookie');

  const membershipsBeforeConsent = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, tenantA.id),
    eq(tenantUsers.userId, body.user.id),
  ));
  assert.equal(membershipsBeforeConsent.length, 0, 'account creation must not grant invited tenant membership');

  const personalTenants = await db.select().from(tenants).where(and(
    eq(tenants.ownerUserId, body.user.id),
    eq(tenants.type, 'personal'),
  ));
  assert.equal(personalTenants.length, 1, 'invite registration creates the same default tenant as ordinary registration');
  assert.equal(personalTenants[0].id, body.personalTenantId);

  const accept = await app.inject({
    method: 'POST',
    url: `/v1/invites/${token}/accept`,
    cookies: { operatoros_session: sessionCookie.value },
  });
  assert.equal(accept.statusCode, 200, accept.body);
  assert.equal(accept.json().alreadyAccepted, false);
  assert.equal(accept.json().tenantId, tenantA.id);
  const membershipsAfterConsent = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, tenantA.id),
    eq(tenantUsers.userId, body.user.id),
  ));
  assert.equal(membershipsAfterConsent.length, 1);
  assert.equal(membershipsAfterConsent[0].role, 'member');

  const acceptRetry = await app.inject({
    method: 'POST', url: `/v1/invites/${token}/accept`,
    cookies: { operatoros_session: sessionCookie.value },
  });
  assert.equal(acceptRetry.statusCode, 200, acceptRetry.body);
  assert.equal(acceptRetry.json().alreadyAccepted, true);
});

test('an existing account signs in without joining and accepts from the invitation page', async () => {
  const email = `${uniqueId('existing-invitee')}@test.local`;
  const password = 'ExistingInviteePassword9!';
  const registerRes = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password, name: 'Existing Invitee' },
  });
  assert.equal(registerRes.statusCode, 202, registerRes.body);
  const [createdUser] = await db.select().from(users).where(eq(users.email, email));
  assert.ok(createdUser);
  inviteeUserIds.push(createdUser.id);
  assert.notEqual(createdUser.currentTenantId, tenantA.id);

  const inviteRes = await app.inject({
    method: 'POST',
    url: `/v1/tenants/${tenantA.id}/invites`,
    headers: ownerBearer(),
    payload: { email, role: 'member' },
  });
  assert.equal(inviteRes.statusCode, 200, inviteRes.body);

  const loginRes = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  });
  assert.equal(loginRes.statusCode, 200, loginRes.body);
  assert.equal(loginRes.json().user.currentTenantId, createdUser.currentTenantId);
  assert.ok(!('onboarding' in loginRes.json()));
  const membershipsBeforeConsent = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, tenantA.id),
    eq(tenantUsers.userId, createdUser.id),
  ));
  assert.equal(membershipsBeforeConsent.length, 0);
  const [pendingInvite] = await db.select().from(tenantInvites)
    .where(eq(tenantInvites.token, inviteRes.json().invite.token));
  assert.equal(pendingInvite.acceptedAt, null, 'login must leave the invitation pending');

  const loginCookie = loginRes.cookies.find((cookie: any) => cookie.name === 'operatoros_session');
  assert.ok(loginCookie);
  const acceptRes = await app.inject({
    method: 'POST',
    url: `/v1/invites/${inviteRes.json().invite.token}/accept`,
    cookies: { operatoros_session: loginCookie.value },
  });
  assert.equal(acceptRes.statusCode, 200, acceptRes.body);
  const membershipsAfterConsent = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, tenantA.id),
    eq(tenantUsers.userId, createdUser.id),
  ));
  assert.equal(membershipsAfterConsent.length, 1);
});

test('a newly created account can decline and remain in its default tenant', async () => {
  const email = `${uniqueId('declining-invitee')}@test.local`;
  const inviteRes = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: ownerBearer(),
    payload: { email, role: 'member' },
  });
  assert.equal(inviteRes.statusCode, 200, inviteRes.body);
  const token: string = inviteRes.json().invite.token;

  const registerRes = await app.inject({
    method: 'POST', url: '/v1/auth/register-with-invite',
    payload: { token, password: 'DeclineInvitePassword9!', name: 'Declining Invitee' },
  });
  assert.equal(registerRes.statusCode, 201, registerRes.body);
  const registered = registerRes.json();
  inviteeUserIds.push(registered.user.id);
  const sessionCookie = registerRes.cookies.find((cookie: any) => cookie.name === 'operatoros_session');
  assert.ok(sessionCookie);

  const declineRes = await app.inject({
    method: 'POST', url: `/v1/invites/${token}/decline`,
    cookies: { operatoros_session: sessionCookie.value },
  });
  assert.equal(declineRes.statusCode, 200, declineRes.body);
  assert.equal(declineRes.json().alreadyDeclined, false);

  const [userAfterDecline] = await db.select().from(users).where(eq(users.id, registered.user.id));
  assert.equal(userAfterDecline.currentTenantId, registered.personalTenantId);
  const targetMemberships = await db.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, tenantA.id),
    eq(tenantUsers.userId, registered.user.id),
  ));
  assert.equal(targetMemberships.length, 0);
  const [declinedInvite] = await db.select().from(tenantInvites).where(eq(tenantInvites.token, token));
  assert.equal(declinedInvite.acceptedAt, null);
  assert.ok(declinedInvite.declinedAt);

  const retry = await app.inject({
    method: 'POST', url: `/v1/invites/${token}/decline`,
    cookies: { operatoros_session: sessionCookie.value },
  });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json().alreadyDeclined, true);

  const acceptAfterDecline = await app.inject({
    method: 'POST', url: `/v1/invites/${token}/accept`,
    cookies: { operatoros_session: sessionCookie.value },
  });
  assert.equal(acceptAfterDecline.statusCode, 409, acceptAfterDecline.body);
  assert.equal(acceptAfterDecline.json().code, 'INVITE_DECLINED');
});
