/**
 * Task #81 — GET /v1/platform/sso/settings
 *
 * Verifies:
 *   - 401 unauthenticated, 403 PLATFORM_ROLE_REQUIRED for non-super-admin
 *   - returns the unified-runtime contract, code TTL, secret-presence flags,
 *     exact module registrations, and deployment env block
 *   - no legacy JWT-query or shared child-secret configuration is advertised
 *   - response NEVER includes the secret value in any field or envBlock
 *   - per-module entries include slug, displayName, baseUrlConfigured, launchUrlPattern
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser } from './_setup.js';

let app: any;
let admin: any;
let regular: any;
const CODE_SECRET = 'this-is-a-test-code-encryption-secret-40chars';
let originalCodeSecret: string | undefined;
let originalSessionSecret: string | undefined;

before(async () => {
  await ensureSchemaReady();
  admin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, admin.id));
  regular = await createTestUser();

  originalCodeSecret = process.env.SSO_CODE_ENCRYPTION_SECRET;
  originalSessionSecret = process.env.SESSION_SECRET;
  process.env.SSO_CODE_ENCRYPTION_SECRET = CODE_SECRET;
  process.env.SESSION_SECRET ||= 'platform-sso-settings-session-secret';

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
  if (originalCodeSecret == null) delete process.env.SSO_CODE_ENCRYPTION_SECRET;
  else process.env.SSO_CODE_ENCRYPTION_SECRET = originalCodeSecret;
  if (originalSessionSecret == null) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
  for (const u of [admin, regular]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role, sessionType: 'platform' })}` });

test('sso/settings: 401 unauthenticated', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/platform/sso/settings' });
  assert.equal(res.statusCode, 401);
});

test('sso/settings: 403 PLATFORM_ROLE_REQUIRED for non-super-admin', async () => {
  const res = await app.inject({
    method: 'GET', url: '/v1/platform/sso/settings', headers: bearer(regular),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
});

test('sso/settings: returns spec shape with secret status only (never value)', async () => {
  const res = await app.inject({
    method: 'GET', url: '/v1/platform/sso/settings', headers: bearer(admin),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();

  assert.equal(typeof body.issuer, 'string');
  assert.ok(['prod', 'staging', 'dev'].includes(body.env), `env in tri-state, got ${body.env}`);
  assert.equal(body.contractVersion, 'v1');
  assert.equal(body.runtimeMode, 'unified_shared_runtime');
  assert.equal(body.ttlSeconds, 60);
  assert.equal(body.codeSecretStatus, 'configured');
  assert.equal(body.sessionSecretStatus, 'configured');

  assert.ok(Array.isArray(body.modules), 'modules is an array');
  assert.equal(body.modules.length, 13);
  for (const m of body.modules) {
    assert.equal(typeof m.slug, 'string');
    assert.equal(m.slug, m.slug.toLowerCase(), 'slug is lowercase');
    assert.equal(typeof m.displayName, 'string');
    assert.equal(typeof m.baseUrlConfigured, 'boolean');
    assert.match(m.clientId, /^operatoros:/);
    assert.equal(m.redirectUri, `${m.baseUrl}/sso`);
    assert.equal(m.logoutUri, `${m.baseUrl}/logout`);
    assert.equal(m.allowedOrigin, m.baseUrl);
    assert.equal(typeof m.launchUrlPattern, 'string');
    assert.ok(m.launchUrlPattern.includes('/sso?code='), 'launch URL pattern contains /sso?code=');
    assert.ok(m.launchUrlPattern.includes('&state='), 'launch URL pattern contains required state');
    assert.doesNotMatch(m.launchUrlPattern, /token|jwt/i);
  }

  assert.equal(typeof body.envBlock, 'string');
  assert.ok(body.envBlock.includes('SESSION_SECRET='));
  assert.ok(body.envBlock.includes('SSO_CODE_ENCRYPTION_SECRET='));
  assert.ok(body.envBlock.includes('TRUST_PROXY=true'));
  assert.ok(body.envBlock.includes('OPERATOROS_BASE_URL='));
  assert.ok(body.envBlock.includes('APP_ENV='));
  assert.ok(!body.envBlock.includes('OPERATOROS_SSO_ENV='));
  assert.doesNotMatch(body.envBlock, /MODULE_SSO_SECRET|OPERATOROS_SSO_AUDIENCE/);

  // Hard rule: secret VALUE must never appear anywhere in the response.
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(CODE_SECRET),
    'response must not contain the SSO_CODE_ENCRYPTION_SECRET value anywhere');
});

test('sso/settings: codeSecretStatus = missing when the hub-only key is unset', async () => {
  const prev = process.env.SSO_CODE_ENCRYPTION_SECRET;
  delete process.env.SSO_CODE_ENCRYPTION_SECRET;
  try {
    const res = await app.inject({
      method: 'GET', url: '/v1/platform/sso/settings', headers: bearer(admin),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().codeSecretStatus, 'missing');
  } finally {
    if (prev === undefined) delete process.env.SSO_CODE_ENCRYPTION_SECRET;
    else process.env.SSO_CODE_ENCRYPTION_SECRET = prev;
  }
});
