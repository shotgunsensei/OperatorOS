// Tests for POST /v1/modules/sso/diagnose — the operator smoke-test
// endpoint used to verify a child app's SSO config against the hub's
// without ever transmitting the shared secret.

process.env.TRUST_PROXY = '1';
process.env.APP_ENV = 'dev';
process.env.OPERATOROS_BASE_URL = 'https://operatoros.test';
process.env.MODULE_SSO_SECRET = 'a'.repeat(32);

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users } from '../src/schema.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
} from './_setup.js';

let app: any;
let superAdminId: string;
let superAdminToken: string;
let normalUserId: string;
let normalUserToken: string;
let moduleSlug: string;
let moduleId: string;

async function tokenFor(userId: string): Promise<string> {
  const { signSession } = await import('../src/lib/auth.js');
  return signSession(userId);
}

before(async () => {
  await ensureSchemaReady();

  const sa = await createTestUser();
  superAdminId = sa.id;
  await db.update(users)
    .set({ platformRole: 'super_admin' })
    .where(eq(users.id, superAdminId));
  superAdminToken = await tokenFor(superAdminId);

  const nu = await createTestUser();
  normalUserId = nu.id;
  normalUserToken = await tokenFor(normalUserId);

  const m = await createTestModule();
  moduleId = m.id;
  moduleSlug = m.slug;

  const Fastify = (await import('fastify')).default;
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await registerModuleRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (superAdminId) await cleanupUser(superAdminId);
  if (normalUserId) await cleanupUser(normalUserId);
  if (moduleId) await cleanupModule(moduleId);
});

async function diagnose(body: unknown, token: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/modules/sso/diagnose',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-forwarded-for': '10.20.30.40',
    },
    payload: body,
  });
  return { status: res.statusCode, body: res.json() };
}

test('sso/diagnose · returns ok=true when every value lines up', async () => {
  const r = await diagnose({
    moduleSlug,
    claimedIssuer: 'https://operatoros.test',
    claimedEnv: 'dev',
    claimedSecretLength: 32,
  }, superAdminToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true, JSON.stringify(r.body.checks));
  assert.equal(r.body.hub.issuer, 'https://operatoros.test');
  assert.equal(r.body.hub.env, 'dev');
  assert.equal(r.body.hub.secretConfigured, true);
  assert.equal(r.body.hub.secretLength, 32);
  assert.equal(r.body.module.slug, moduleSlug);
  for (const [k, v] of Object.entries(r.body.checks)) {
    assert.equal((v as any).ok, true, `check ${k} should pass`);
  }
});

test('sso/diagnose · pinpoints issuer drift (trailing slash)', async () => {
  const r = await diagnose({
    moduleSlug,
    claimedIssuer: 'https://operatoros.test/',
    claimedEnv: 'dev',
    claimedSecretLength: 32,
  }, superAdminToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.checks.issuerMatch.ok, false);
  assert.equal(r.body.checks.envMatch.ok, true);
  assert.equal(r.body.checks.secretLengthMatch.ok, true);
  assert.match(r.body.checks.issuerMatch.hint, /bad_issuer/);
});

test('sso/diagnose · pinpoints env mismatch (production vs dev)', async () => {
  const r = await diagnose({
    moduleSlug,
    claimedIssuer: 'https://operatoros.test',
    claimedEnv: 'production',
    claimedSecretLength: 32,
  }, superAdminToken);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.checks.envMatch.ok, false);
  assert.equal(r.body.checks.envMatch.claimed.raw, 'production');
  assert.equal(r.body.checks.envMatch.claimed.normalized, 'prod');
  assert.equal(r.body.checks.envMatch.expected, 'dev');
});

test('sso/diagnose · pinpoints secret length mismatch without revealing the secret', async () => {
  const r = await diagnose({
    moduleSlug,
    claimedIssuer: 'https://operatoros.test',
    claimedEnv: 'dev',
    claimedSecretLength: 24,
  }, superAdminToken);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.checks.secretLengthMatch.ok, false);
  assert.equal(r.body.checks.secretLengthMatch.expected, 32);
  assert.equal(r.body.checks.secretLengthMatch.claimed, 24);
  // Sanity: the actual secret string is never echoed back in any field.
  const serialized = JSON.stringify(r.body);
  assert.equal(serialized.includes('a'.repeat(32)), false);
});

test('sso/diagnose · flags unknown module slug', async () => {
  const r = await diagnose({
    moduleSlug: 'definitely-not-a-real-module',
    claimedIssuer: 'https://operatoros.test',
    claimedEnv: 'dev',
    claimedSecretLength: 32,
  }, superAdminToken);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.checks.moduleExists.ok, false);
  assert.equal(r.body.checks.moduleHasBaseUrl.ok, false);
  assert.equal(r.body.module, null);
});

test('sso/diagnose · 400 when moduleSlug is missing', async () => {
  const r = await diagnose({
    claimedIssuer: 'https://operatoros.test',
    claimedEnv: 'dev',
    claimedSecretLength: 32,
  }, superAdminToken);
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'BAD_REQUEST');
});

test('sso/diagnose · 403 for non-super-admin callers', async () => {
  const r = await diagnose({
    moduleSlug,
    claimedIssuer: 'https://operatoros.test',
    claimedEnv: 'dev',
    claimedSecretLength: 32,
  }, normalUserToken);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'PLATFORM_ROLE_REQUIRED');
});

test('sso/diagnose · 401 without auth', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/modules/sso/diagnose',
    headers: { 'content-type': 'application/json' },
    payload: { moduleSlug },
  });
  assert.equal(res.statusCode, 401);
});
