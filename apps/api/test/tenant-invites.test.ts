/**
 * Gate 3 — Tenant invites lifecycle.
 *
 * Covers create / list / accept (auth, email-mismatch, expiry) / revoke.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, tenants, tenantUsers, tenantInvites } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser } from './_setup.js';

let app: any;
let owner: any, member: any, outsider: any, invitee: any;
let tenantA: any;

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  member = await createTestUser();
  outsider = await createTestUser();
  invitee = await createTestUser();

  [tenantA] = await db.insert(tenants).values({
    name: 'Invites Co', slug: `inv-${owner.id}`, type: 'company', ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenantA.id, userId: owner.id, role: 'owner' },
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
  try { await db.delete(tenantInvites).where(eq(tenantInvites.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenantA.id)); } catch {}
  for (const u of [owner, member, outsider, invitee]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

test('member cannot create invites (TENANT_ROLE_INSUFFICIENT)', async () => {
  const r = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(member),
    payload: { email: 'x@y.com', role: 'member' },
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'TENANT_ROLE_INSUFFICIENT');
});

test('outsider cannot list invites (404 TENANT_NOT_FOUND)', async () => {
  const r = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(outsider),
  });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().code, 'TENANT_NOT_FOUND');
});

test('owner creates invite, list returns it', async () => {
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: invitee.email, role: 'member' },
  });
  assert.equal(create.statusCode, 200);
  const inv = create.json().invite;
  assert.equal(inv.email, invitee.email.toLowerCase());
  assert.equal(inv.role, 'member');
  assert.ok(inv.token);

  const list = await app.inject({
    method: 'GET', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().invites.find((x: any) => x.id === inv.id));
});

test('admin (non-owner) cannot invite owner role', async () => {
  // Promote member to admin to exercise the boundary.
  const [m] = await db.update(tenantUsers).set({ role: 'admin' })
    .where(and(eq(tenantUsers.userId, member.id), eq(tenantUsers.tenantId, tenantA.id))).returning();
  assert.equal(m.role, 'admin');
  const r = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(member),
    payload: { email: 'x@y.com', role: 'owner' },
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'TENANT_ROLE_INSUFFICIENT');
});

test('email mismatch on accept → 403 INVITE_EMAIL_MISMATCH', async () => {
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: 'no-such@example.com', role: 'member' },
  });
  const token = create.json().invite.token;
  const r = await app.inject({
    method: 'POST', url: `/v1/invites/${token}/accept`,
    headers: bearer(invitee),
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'INVITE_EMAIL_MISMATCH');
});

test('happy path: invitee accepts, joins as member, second accept is 409', async () => {
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: invitee.email, role: 'admin' },
  });
  const token = create.json().invite.token;
  const accept = await app.inject({
    method: 'POST', url: `/v1/invites/${token}/accept`,
    headers: bearer(invitee),
  });
  assert.equal(accept.statusCode, 200);
  assert.equal(accept.json().tenantId, tenantA.id);
  // Membership exists with the role from the invite.
  const [mem] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.userId, invitee.id), eq(tenantUsers.tenantId, tenantA.id)));
  assert.equal(mem.role, 'admin');

  const replay = await app.inject({
    method: 'POST', url: `/v1/invites/${token}/accept`,
    headers: bearer(invitee),
  });
  assert.equal(replay.statusCode, 409);
  assert.equal(replay.json().code, 'INVITE_ALREADY_ACCEPTED');
});

test('expired invite → 410 INVITE_EXPIRED on accept', async () => {
  // Owner creates a fresh invite for the invitee (the email-mismatch
  // test earlier consumed a different one). We then move expiresAt
  // into the past directly in the DB so the accept handler trips the
  // expiry branch — invariant: token is otherwise valid, only TTL fails.
  const expiredEmail = `expired-${Date.now()}@example.com`;
  const expired = await createTestUser();
  // Patch the user's email to match the invite so the email check passes
  // and we exercise ONLY the expiry branch.
  await db.update(users).set({ email: expiredEmail }).where(eq(users.id, expired.id));
  const refreshed = { ...expired, email: expiredEmail };
  try {
    const create = await app.inject({
      method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
      headers: bearer(owner),
      payload: { email: expiredEmail, role: 'member' },
    });
    assert.equal(create.statusCode, 200);
    const inv = create.json().invite;
    // Force-expire the invite.
    await db.update(tenantInvites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(tenantInvites.id, inv.id));

    const r = await app.inject({
      method: 'POST', url: `/v1/invites/${inv.token}/accept`,
      headers: bearer(refreshed),
    });
    assert.equal(r.statusCode, 410);
    assert.equal(r.json().code, 'INVITE_EXPIRED');
  } finally {
    await cleanupUser(expired.id);
  }
});

test('owner revokes a pending invite', async () => {
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: 'tmp@example.com', role: 'member' },
  });
  const inv = create.json().invite;
  const r = await app.inject({
    method: 'DELETE', url: `/v1/tenants/${tenantA.id}/invites/${inv.id}`,
    headers: bearer(owner),
  });
  assert.equal(r.statusCode, 200);
  const [row] = await db.select().from(tenantInvites).where(eq(tenantInvites.id, inv.id));
  assert.equal(row, undefined);
});
