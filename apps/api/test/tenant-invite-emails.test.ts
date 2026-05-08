/**
 * Task 30 — invite email delivery audit + resend endpoint coverage.
 *
 * What this guards:
 *  - POST /v1/tenants/:tenantId/invites writes a `tenant_invite_email_sent`
 *    audit row alongside the `tenant_invite_created` row.
 *  - POST /v1/tenants/:tenantId/invites/:inviteId/resend writes
 *    `tenant_invite_email_resent` and returns 200 on the happy path.
 *  - Resend rejects accepted invites with 409 INVITE_ALREADY_ACCEPTED
 *    and expired invites with 410 INVITE_EXPIRED, mirroring the accept
 *    handler's contract.
 *
 * Provider: we force `delete process.env.RESEND_API_KEY` so the email
 * service falls back to the `log` provider — no network required, and
 * `sendInviteEmail` returns ok:true synchronously, exercising the
 * happy-path audit branch deterministically.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users, tenants, tenantUsers, tenantInvites, adminAuditLogs,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser } from './_setup.js';

let app: any;
let owner: any, member: any, invitee: any;
let tenantA: any;
let priorResendApiKey: string | undefined;

before(async () => {
  await ensureSchemaReady();
  // Force the log provider so the test never hits the network.
  priorResendApiKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  owner = await createTestUser();
  member = await createTestUser();
  invitee = await createTestUser();

  [tenantA] = await db.insert(tenants).values({
    name: 'Email Co', slug: `email-${owner.id}`, type: 'company', ownerUserId: owner.id,
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
  try { await db.delete(adminAuditLogs).where(eq(adminAuditLogs.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantInvites).where(eq(tenantInvites.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantA.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenantA.id)); } catch {}
  for (const u of [owner, member, invitee]) if (u) await cleanupUser(u.id);
  if (priorResendApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = priorResendApiKey;
  }
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

async function findAudit(action: string, inviteId: string) {
  // We pull recent rows for the action then match details.targetId; cheaper
  // than a JSONB containment query and good enough at test scale.
  const rows = await db.select().from(adminAuditLogs)
    .where(and(eq(adminAuditLogs.action, action), eq(adminAuditLogs.tenantId, tenantA.id)))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(20);
  return rows.find(r => (r.details as any)?.targetId === inviteId);
}

test('creating invite writes tenant_invite_email_sent audit row (log provider)', async () => {
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: `task30-${Date.now()}@example.com`, role: 'member' },
  });
  assert.equal(create.statusCode, 200);
  const body = create.json();
  assert.equal(body.emailDelivery?.ok, true);
  assert.equal(body.emailDelivery?.provider, 'log');

  const sent = await findAudit('tenant_invite_email_sent', body.invite.id);
  assert.ok(sent, 'expected tenant_invite_email_sent audit row');
  const details: any = sent!.details;
  assert.equal(details.provider, 'log');
  assert.equal(details.error, null);
});

test('resend on a pending invite writes tenant_invite_email_resent audit row', async () => {
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: `task30-resend-${Date.now()}@example.com`, role: 'member' },
  });
  assert.equal(create.statusCode, 200);
  const inviteId = create.json().invite.id;

  const resend = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites/${inviteId}/resend`,
    headers: bearer(owner),
  });
  assert.equal(resend.statusCode, 200);
  assert.equal(resend.json().ok, true);
  assert.equal(resend.json().provider, 'log');

  const resent = await findAudit('tenant_invite_email_resent', inviteId);
  assert.ok(resent, 'expected tenant_invite_email_resent audit row');
  const details: any = resent!.details;
  assert.equal(details.provider, 'log');
  assert.equal(details.resend, true);
});

test('resend on an accepted invite → 409 INVITE_ALREADY_ACCEPTED', async () => {
  // Create + accept (mark acceptedAt directly so we don't need a second
  // user with a matching email).
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: `task30-accepted-${Date.now()}@example.com`, role: 'member' },
  });
  const inviteId = create.json().invite.id;
  await db.update(tenantInvites).set({ acceptedAt: new Date() })
    .where(eq(tenantInvites.id, inviteId));

  const r = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites/${inviteId}/resend`,
    headers: bearer(owner),
  });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'INVITE_ALREADY_ACCEPTED');
});

test('resend rejects non-admin callers with 403 TENANT_ROLE_INSUFFICIENT', async () => {
  // Guard regression: the resend route must keep its requireTenantAdmin
  // pre-handler. Owner creates an invite, then a `member` of the same
  // tenant tries to resend it and gets the standard role-deny.
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: `task30-authz-${Date.now()}@example.com`, role: 'member' },
  });
  const inviteId = create.json().invite.id;
  const r = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites/${inviteId}/resend`,
    headers: bearer(member),
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'TENANT_ROLE_INSUFFICIENT');
});

test('resend on an expired invite → 410 INVITE_EXPIRED', async () => {
  const create = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites`,
    headers: bearer(owner),
    payload: { email: `task30-expired-${Date.now()}@example.com`, role: 'member' },
  });
  const inviteId = create.json().invite.id;
  await db.update(tenantInvites)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(tenantInvites.id, inviteId));

  const r = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantA.id}/invites/${inviteId}/resend`,
    headers: bearer(owner),
  });
  assert.equal(r.statusCode, 410);
  assert.equal(r.json().code, 'INVITE_EXPIRED');
});
