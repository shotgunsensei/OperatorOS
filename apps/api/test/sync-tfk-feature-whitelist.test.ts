/**
 * Task #109 — POST /v1/sso/entitlements/sync rejects unknown feature
 * keys with `400 invalid_body` when the target module's `push_shape`
 * is `tradeflowkit_v1`. The canonical shape ignores feature keys on
 * registration (TFK's 12-key whitelist is TFK-specific).
 *
 * This guards against the operator silently registering a TFK receiver
 * with bogus feature keys that would then be dropped on every push
 * (instead of failing fast at register-time).
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules } from '../src/schema.js';
import { ensureSchemaReady, createTestModule, cleanupModule } from './_setup.js';

let app: any, tfkMod: any, canonicalMod: any;
const SVC_TOKEN = 'sync-tfk-whitelist-test-svc-token-1234567890';
const ENV_PREV = process.env.OPERATOROS_SERVICE_TOKEN;

before(async () => {
  process.env.OPERATOROS_SERVICE_TOKEN = SVC_TOKEN;
  await ensureSchemaReady();

  tfkMod = await createTestModule(`tfk-sync-${Date.now()}`);
  canonicalMod = await createTestModule(`cnn-sync-${Date.now()}`);
  // Pin tfkMod to tradeflowkit_v1 (createTestModule defaults to canonical).
  await db.update(modules)
    .set({ pushShape: 'tradeflowkit_v1', pushAuthMode: 'bearer_token',
           pushBearerEnvVar: 'TFK_TEST_SVC_TOKEN_DUMMY' })
    .where(eq(modules.id, tfkMod.id));

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
  if (tfkMod) await cleanupModule(tfkMod.id);
  if (canonicalMod) await cleanupModule(canonicalMod.id);
  if (ENV_PREV === undefined) delete process.env.OPERATOROS_SERVICE_TOKEN;
  else process.env.OPERATOROS_SERVICE_TOKEN = ENV_PREV;
});

function inject(slug: string, body: any) {
  return app.inject({
    method: 'POST', url: '/v1/sso/entitlements/sync',
    headers: {
      'content-type': 'application/json',
      'x-service-token': SVC_TOKEN,
    },
    payload: JSON.stringify({ module_slug: slug, ...body }),
  });
}

test('tfk receiver: unknown feature key -> 400 invalid_body', async () => {
  const res = await inject(tfkMod.slug, {
    webhook_url: 'https://tfk.test/webhook',
    features: { automations: true, bogus_key: true, another_unknown: false },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.code, 'invalid_body');
  assert.ok(Array.isArray(body.unknownKeys));
  assert.deepEqual(body.unknownKeys.sort(), ['another_unknown', 'bogus_key']);
});

test('tfk receiver: all-whitelisted features -> accepted', async () => {
  const res = await inject(tfkMod.slug, {
    webhook_url: 'https://tfk.test/webhook',
    features: { automations: true, analytics: false, stripe_connect: true },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
});

test('tfk receiver: non-object features -> 400 invalid_body', async () => {
  const res = await inject(tfkMod.slug, {
    webhook_url: 'https://tfk.test/webhook',
    features: ['automations', 'analytics'],
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'invalid_body');
});

test('canonical receiver: unknown feature keys are NOT rejected', async () => {
  // Canonical shape doesn't have a whitelist — any keys are fine
  // because canonical receivers consume the full snapshot.
  const res = await inject(canonicalMod.slug, {
    webhook_url: 'https://canonical.test/webhook',
    features: { whatever: true, anything_goes: false },
  });
  assert.notEqual(res.statusCode, 400,
    'canonical receiver must not enforce TFK whitelist');
});
