import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users } from '../src/schema.js';
import { cleanupUser, createTestUser, ensureSchemaReady } from './_setup.js';

process.env.SESSION_SECRET ||= 'test-session-secret-with-enough-entropy';

function sessionCookie(response: any): string {
  const setCookie = String(response.headers['set-cookie'] || '');
  const pair = setCookie.split(';', 1)[0];
  assert.match(pair, /^operatoros_session=/);
  return pair;
}

describe('auth security controls', () => {
  let app: any;
  let user: any;
  const password = 'correct-password';

  before(async () => {
    await ensureSchemaReady();
    user = await createTestUser();
    const { hashPassword } = await import('../src/lib/auth.js');
    await db.update(users)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
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

  test('wrong password increments failed login tracking and success resets it', async () => {
    const fail = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: 'wrong-password' },
    });
    assert.equal(fail.statusCode, 401);

    const [afterFail] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    assert.equal(afterFail.failedLoginCount, 1);

    const success = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password },
    });
    assert.equal(success.statusCode, 200);

    const [afterSuccess] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    assert.equal(afterSuccess.failedLoginCount, 0);
    assert.equal(afterSuccess.lockedUntil, null);
  });

  test('password change rotates the host-only session without returning a bearer token', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password },
    });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().token, undefined);
    const oldCookie = sessionCookie(login);

    const change = await app.inject({
      method: 'PUT',
      url: '/v1/auth/change-password',
      headers: { cookie: oldCookie },
      payload: { currentPassword: password, newPassword: 'new-correct-password' },
    });
    assert.equal(change.statusCode, 200);
    assert.equal(change.json().token, undefined);
    const replacementCookie = sessionCookie(change);
    assert.notEqual(replacementCookie, oldCookie);

    const oldMe = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: oldCookie },
    });
    assert.equal(oldMe.statusCode, 401);

    const newMe = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: replacementCookie },
    });
    assert.equal(newMe.statusCode, 200);

    await db.update(users)
      .set({ passwordHash: await (await import('../src/lib/auth.js')).hashPassword(password), updatedAt: new Date() })
      .where(eq(users.id, user.id));
  });

  test('JWT verification rejects non-HS256 and malformed payloads', async () => {
    const { signToken, verifyToken } = await import('../src/lib/auth.js');

    const good = signToken({
      userId: user.id,
      email: user.email,
      role: 'user',
      tokenVersion: 0,
      sessionType: 'platform',
    });
    assert.equal(verifyToken(good)?.userId, user.id);

    const wrongAlgorithm = jwt.sign(
      { userId: user.id, email: user.email, role: 'user', tokenVersion: 0, sessionType: 'platform' },
      process.env.SESSION_SECRET!,
      { algorithm: 'HS512' },
    );
    assert.equal(verifyToken(wrongAlgorithm), null);

    const malformed = jwt.sign(
      { email: user.email, role: 'user', tokenVersion: 0, sessionType: 'platform' },
      process.env.SESSION_SECRET!,
      { algorithm: 'HS256' },
    );
    assert.equal(verifyToken(malformed), null);
  });
});
