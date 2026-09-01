import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { emailVerificationTokens, users } from '../src/schema.js';
import { cleanupUser, createTestUser, ensureSchemaReady } from './_setup.js';

process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'email-verification-test-session-secret-32-plus';

let app: any;
let user: Awaited<ReturnType<typeof createTestUser>>;

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();
  const { hashPassword } = await import('../src/lib/auth.js');
  await db.update(users).set({ passwordHash: await hashPassword('verified-email-password') })
    .where(eq(users.id, user.id));
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerAuthRoutes } = await import('../src/routes/auth-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerAuthRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (user) await cleanupUser(user.id);
});

test('email verification routes are non-enumerating, hashed, single-use, and reset on address change', async () => {
  const existingRequest = await app.inject({
    method: 'POST',
    url: '/v1/auth/email-verification/request',
    payload: { email: user.email },
  });
  const absentRequest = await app.inject({
    method: 'POST',
    url: '/v1/auth/email-verification/request',
    payload: { email: `absent-${user.email}` },
  });
  assert.equal(existingRequest.statusCode, 202);
  assert.equal(absentRequest.statusCode, 202);
  assert.deepEqual(existingRequest.json(), absentRequest.json());

  const stored = await db.select().from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, user.id));
  assert.equal(stored.length, 1);
  assert.match(stored[0]!.tokenHash, /^[0-9a-f]{64}$/);
  assert.match(stored[0]!.emailFingerprint, /^[0-9a-f]{64}$/);

  const { issueEmailVerificationToken } = await import('../src/lib/email-verification.js');
  const issued = await issueEmailVerificationToken(user.id, '127.0.0.1');
  assert.equal(stored[0]!.tokenHash.includes(issued.token), false, 'raw capability is never stored');
  const confirmed = await app.inject({
    method: 'POST',
    url: '/v1/auth/email-verification/confirm',
    payload: { token: issued.token },
  });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  const replay = await app.inject({
    method: 'POST',
    url: '/v1/auth/email-verification/confirm',
    payload: { token: issued.token },
  });
  assert.equal(replay.statusCode, 400);
  assert.equal(replay.json().code, 'EMAIL_VERIFICATION_INVALID');

  const [verified] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  assert.ok(verified.emailVerifiedAt);
  const { signToken } = await import('../src/lib/auth.js');
  const session = signToken({
    userId: verified.id,
    email: verified.email,
    role: verified.role,
    tokenVersion: verified.tokenVersion,
    sessionType: 'platform',
  });
  const changed = await app.inject({
    method: 'PUT',
    url: '/v1/auth/change-email',
    headers: { cookie: `operatoros_session=${session}` },
    payload: { newEmail: `changed-${user.email}`, password: 'verified-email-password' },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const [afterChange] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  assert.equal(afterChange.emailVerifiedAt, null, 'a changed address must prove mailbox control again');

  const staleAddressToken = await issueEmailVerificationToken(user.id, '127.0.0.1');
  await db.update(users).set({
    email: `race-${afterChange.email}`,
    emailVerifiedAt: null,
  }).where(eq(users.id, user.id));
  const { confirmEmailVerificationToken } = await import('../src/lib/email-verification.js');
  assert.equal(
    await confirmEmailVerificationToken(staleAddressToken.token),
    null,
    'a token issued to a previous mailbox cannot verify the current address even if invalidation is bypassed',
  );
});
