process.env.SESSION_SECRET ||= 'operatoros-local-revocation-test-secret-v1';

import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { revokedSessionTokens } from '../src/schema.js';
import { cleanupUser, createTestUser, ensureSchemaReady } from './_setup.js';

test('local logout revokes only the presented host session and never stores its raw JWT', async (t) => {
  let user: any;
  let app: any;
  try {
    await ensureSchemaReady();
    user = await createTestUser();

    const Fastify = (await import('fastify')).default;
    const cookie = (await import('@fastify/cookie')).default;
    const { registerAuthRoutes } = await import('../src/routes/auth-routes.js');
    const { signToken, sessionTokenFingerprint } = await import('../src/lib/auth.js');

    const platformToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    });
    const siblingModuleToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'module',
      tenantId: user.currentTenantId,
      moduleId: 'techdeck',
    });

    app = Fastify();
    await app.register(cookie);
    await registerAuthRoutes(app);
    await app.ready();

    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${platformToken}` },
    });
    assert.equal(logout.statusCode, 200);
    assert.equal(logout.json().ok, true);

    const replay = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${platformToken}` },
    });
    assert.equal(replay.statusCode, 401);
    assert.equal(replay.json().code, 'SESSION_REVOKED');

    const sibling = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${siblingModuleToken}` },
    });
    assert.equal(sibling.statusCode, 200);
    assert.equal(sibling.json().session.type, 'module');

    const [stored] = await db.select().from(revokedSessionTokens)
      .where(eq(revokedSessionTokens.tokenHash, sessionTokenFingerprint(platformToken)))
      .limit(1);
    assert.ok(stored);
    assert.equal(stored.tokenHash.length, 64);
    assert.notEqual(stored.tokenHash, platformToken);
    assert.equal(stored.userId, user.id);
    assert.equal(stored.sessionType, 'platform');
  } catch (err) {
    if (!user && /ECONNREFUSED|connect/i.test(String(err))) {
      t.skip(`Postgres unavailable: ${String(err)}`);
      return;
    }
    throw err;
  } finally {
    if (app) await app.close();
    if (user) await cleanupUser(user.id);
  }
});
