/**
 * Task #81 — GET /v1/platform/sso/settings
 *
 * Verifies:
 *   - 401 unauthenticated, 403 PLATFORM_ROLE_REQUIRED for non-super-admin
 *   - returns issuer / env / ttlSeconds=90 / secretStatus / modules / envBlock
 *   - secretStatus reflects MODULE_SSO_SECRET presence (≥16 chars)
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
const SECRET = 'this-is-a-test-secret-please-rotate-32chars';
let originalSecret: string | undefined;

before(async () => {
  await ensureSchemaReady();
  admin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, admin.id));
  regular = await createTestUser();

  originalSecret = process.env.MODULE_SSO_SECRET;
  process.env.MODULE_SSO_SECRET = SECRET;

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
  if (originalSecret == null) delete process.env.MODULE_SSO_SECRET;
  else process.env.MODULE_SSO_SECRET = originalSecret;
  for (const u of [admin, regular]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

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
  assert.equal(body.ttlSeconds, 90);
  assert.equal(body.secretStatus, 'configured');

  assert.ok(Array.isArray(body.modules), 'modules is an array');
  assert.ok(body.modules.length >= 11, `expected >=11 modules, got ${body.modules.length}`);
  for (const m of body.modules) {
    assert.equal(typeof m.slug, 'string');
    assert.equal(m.slug, m.slug.toLowerCase(), 'slug is lowercase');
    assert.equal(typeof m.displayName, 'string');
    assert.equal(typeof m.baseUrlConfigured, 'boolean');
    assert.equal(typeof m.launchUrlPattern, 'string');
    assert.ok(m.launchUrlPattern.includes('/sso?token='), 'launch URL pattern contains /sso?token=');
  }

  assert.equal(typeof body.envBlock, 'string');
  assert.ok(body.envBlock.includes('MODULE_SSO_SECRET='), 'env block has the secret KEY name');
  assert.ok(body.envBlock.includes('OPERATOROS_BASE_URL='));
  assert.ok(body.envBlock.includes('OPERATOROS_SSO_AUDIENCE='));
  assert.ok(body.envBlock.includes('OPERATOROS_SSO_ENV='));

  // Hard rule: secret VALUE must never appear anywhere in the response.
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(SECRET),
    'response must not contain the MODULE_SSO_SECRET value anywhere');
});

test('sso/settings: secretStatus = missing when MODULE_SSO_SECRET unset', async () => {
  const prev = process.env.MODULE_SSO_SECRET;
  delete process.env.MODULE_SSO_SECRET;
  try {
    const res = await app.inject({
      method: 'GET', url: '/v1/platform/sso/settings', headers: bearer(admin),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().secretStatus, 'missing');
  } finally {
    process.env.MODULE_SSO_SECRET = prev;
  }
});
