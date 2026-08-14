/**
 * Task #108 — POST /v1/sso/entitlements/sync registers / clears the
 * module's entitlement webhook URL. Service-token gated.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules } from '../src/schema.js';
import { ensureSchemaReady, createTestModule, cleanupModule } from './_setup.js';

let app: any, mod: any;
const TOKEN = 'svc-token-sync-test-abcdef1234567890';
const PREV_TOKEN = process.env.OPERATOROS_SERVICE_TOKEN;

before(async () => {
  process.env.OPERATOROS_SERVICE_TOKEN = TOKEN;
  await ensureSchemaReady();
  mod = await createTestModule();

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerEntitlementRoutes } = await import('../src/routes/entitlement-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerEntitlementRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (mod) await cleanupModule(mod.id);
  if (PREV_TOKEN === undefined) delete process.env.OPERATOROS_SERVICE_TOKEN;
  else process.env.OPERATOROS_SERVICE_TOKEN = PREV_TOKEN;
});

test('register webhook URL persists to modules row', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/sso/entitlements/sync',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    payload: JSON.stringify({
      module_slug: mod.slug,
      webhook_url: 'https://example.test/entitlements/hook',
    }),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.webhook_url, 'https://example.test/entitlements/hook');
  assert.equal(body.updated, true);

  const [reloaded] = await db.select().from(modules).where(eq(modules.id, mod.id));
  assert.equal(reloaded.entitlementWebhookUrl, 'https://example.test/entitlements/hook');
});

test('clearing with null webhook_url removes it', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/sso/entitlements/sync',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    payload: JSON.stringify({ module_slug: mod.slug, webhook_url: null }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().webhook_url, null);
  const [reloaded] = await db.select().from(modules).where(eq(modules.id, mod.id));
  assert.equal(reloaded.entitlementWebhookUrl, null);
});

test('invalid URL -> 400 SYNC_URL_INVALID', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/sso/entitlements/sync',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    payload: JSON.stringify({ module_slug: mod.slug, webhook_url: 'not a url' }),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'SYNC_URL_INVALID');
});

test('unknown module slug -> 404', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/sso/entitlements/sync',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    payload: JSON.stringify({
      module_slug: 'definitely-not-a-real-slug',
      webhook_url: 'https://example.test/hook',
    }),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'MODULE_NOT_FOUND');
});
