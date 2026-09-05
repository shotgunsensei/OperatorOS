/**
 * Release-v60 replacement for the former per-module pricing drift editor.
 * The routes remain authenticated compatibility endpoints, but a super admin
 * cannot mutate module metadata, rotate process env, or call Stripe through
 * them. Application Stack owns the shared companion price going forward.
 */

import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, users } from '../src/schema.js';
import {
  __setStripeTestOverrides,
  getAddonStripePriceEnvKey,
  lookupAddonStripePrice,
} from '../src/lib/billing-service.js';
import { signToken } from '../src/lib/auth.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';

let app: any;
let superAdmin: any;
let member: any;
let mod: any;
let envKey: string;
let savedEnvValue: string | undefined;
let savedNodeEnv: string | undefined;

let stripeRetrieveCalls = 0;
let stripeCreateCalls = 0;

before(async () => {
  await ensureSchemaReady();
  superAdmin = await createTestUser();
  member = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

  mod = await createTestModule(`drift-${uniqueId('m').replace(/_/g, '-')}`);
  await db.update(modules)
    .set({ metadata: { addonPriceCents: 999 }, updatedAt: new Date() })
    .where(eq(modules.id, mod.id));

  envKey = getAddonStripePriceEnvKey(mod.slug);
  savedEnvValue = process.env[envKey];
  savedNodeEnv = process.env.NODE_ENV;
  process.env[envKey] = 'price_legacy_fixture';

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerPlatformRoutes(app);
  await app.ready();
});

after(async () => {
  __setStripeTestOverrides(null);
  if (savedEnvValue === undefined) delete process.env[envKey];
  else process.env[envKey] = savedEnvValue;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
  if (app) await app.close();
  if (mod) await cleanupModule(mod.id);
  for (const user of [member, superAdmin]) if (user) await cleanupUser(user.id);
});

afterEach(() => {
  __setStripeTestOverrides(null);
  stripeRetrieveCalls = 0;
  stripeCreateCalls = 0;
});

const bearer = (user: any) => ({
  authorization: `Bearer ${signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionType: 'platform',
  })}`,
});

async function currentMetadata() {
  const [row] = await db.select().from(modules).where(eq(modules.id, mod.id)).limit(1);
  return (row?.metadata ?? {}) as Record<string, unknown>;
}

function providerOverride() {
  return {
    enabled: true,
    client: {
      prices: {
        retrieve: async (id: string) => {
          stripeRetrieveCalls += 1;
          return { id, unit_amount: 2900, currency: 'usd', active: true };
        },
        create: async () => {
          stripeCreateCalls += 1;
          return {
            id: 'price_should_never_be_created',
            product: 'prod_should_never_be_created',
            unit_amount: 2900,
            currency: 'usd',
          };
        },
      },
    },
  };
}

test('retired pricing mutation endpoints preserve authentication and platform RBAC', async () => {
  for (const attempt of [
    { method: 'POST', url: `/v1/platform/pricing/${mod.slug}/sync-from-stripe`, payload: undefined },
    { method: 'POST', url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`, payload: { unitAmountCents: 2900 } },
  ]) {
    const anonymous = await app.inject(attempt);
    assert.equal(anonymous.statusCode, 401, `${attempt.url}: ${anonymous.body}`);

    const forbidden = await app.inject({ ...attempt, headers: bearer(member) });
    assert.equal(forbidden.statusCode, 403, `${attempt.url}: ${forbidden.body}`);
    assert.equal(forbidden.json().code, 'PLATFORM_ROLE_REQUIRED');
  }
});

test('unknown modules remain non-enumerable before the shared-price closure response', async () => {
  const missing = `does-not-exist-${uniqueId('x').replace(/_/g, '-')}`;
  for (const attempt of [
    { method: 'POST', url: `/v1/platform/pricing/${missing}/sync-from-stripe`, payload: undefined },
    { method: 'POST', url: `/v1/platform/pricing/${missing}/create-stripe-price`, payload: { unitAmountCents: 2900 } },
  ]) {
    const response = await app.inject({ ...attempt, headers: bearer(superAdmin) });
    assert.equal(response.statusCode, 404, `${attempt.url}: ${response.body}`);
    assert.equal(response.json().code, 'MODULE_NOT_FOUND');
  }
});

test('sync-from-stripe is closed before provider lookup or metadata mutation', async () => {
  __setStripeTestOverrides(providerOverride());
  const before = await currentMetadata();

  const response = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/sync-from-stripe`,
    headers: bearer(superAdmin),
  });
  assert.equal(response.statusCode, 409, response.body);
  assert.equal(response.json().code, 'APPLICATION_STACK_SHARED_PRICE_REQUIRED');
  assert.equal(stripeRetrieveCalls, 0);
  assert.deepEqual(await currentMetadata(), before);
});

test('create-stripe-price validates shape, then closes valid writes before Stripe or env rotation', async () => {
  for (const invalid of [undefined, null, 0, -10, 1.5, '2900', Number.NaN, 100_001_00]) {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`,
      headers: bearer(superAdmin),
      payload: { unitAmountCents: invalid },
    });
    assert.equal(response.statusCode, 400, `${String(invalid)}: ${response.body}`);
    assert.equal(response.json().code, 'BAD_REQUEST');
  }

  __setStripeTestOverrides(providerOverride());
  const before = await currentMetadata();
  const envBefore = process.env[envKey];
  const response = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`,
    headers: bearer(superAdmin),
    payload: { unitAmountCents: 2900, currency: 'USD' },
  });
  assert.equal(response.statusCode, 409, response.body);
  assert.equal(response.json().code, 'APPLICATION_STACK_SHARED_PRICE_REQUIRED');
  assert.equal(stripeCreateCalls, 0);
  assert.equal(stripeRetrieveCalls, 0);
  assert.equal(process.env[envKey], envBefore);
  assert.deepEqual(await currentMetadata(), before);
});

test('test-only Stripe override seam remains RBAC-gated and disabled in production', async () => {
  const anonymous = await app.inject({
    method: 'POST',
    url: '/v1/platform/__test__/stripe-override',
    payload: { reset: true },
  });
  assert.equal(anonymous.statusCode, 401);

  const forbidden = await app.inject({
    method: 'POST',
    url: '/v1/platform/__test__/stripe-override',
    headers: bearer(member),
    payload: { reset: true },
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.json().code, 'PLATFORM_ROLE_REQUIRED');

  process.env.NODE_ENV = 'production';
  try {
    const production = await app.inject({
      method: 'POST',
      url: '/v1/platform/__test__/stripe-override',
      headers: bearer(superAdmin),
      payload: { reset: true },
    });
    assert.equal(production.statusCode, 404);
    assert.equal(production.json().code, 'NOT_FOUND');
  } finally {
    process.env.NODE_ENV = savedNodeEnv ?? 'test';
  }
});

test('test-only Stripe seam can still install and reset deterministic read stubs', async () => {
  process.env[envKey] = 'price_seam_fixture';
  const install = await app.inject({
    method: 'POST',
    url: '/v1/platform/__test__/stripe-override',
    headers: bearer(superAdmin),
    payload: {
      enabled: true,
      retrievePrice: { unit_amount: 1234, currency: 'usd', active: true },
    },
  });
  assert.equal(install.statusCode, 200, install.body);
  assert.equal(install.json().ok, true);

  const lookup = await lookupAddonStripePrice(mod.slug);
  assert.equal(lookup.priceId, 'price_seam_fixture');
  assert.equal(lookup.unitAmountCents, 1234);

  const reset = await app.inject({
    method: 'POST',
    url: '/v1/platform/__test__/stripe-override',
    headers: bearer(superAdmin),
    payload: { reset: true },
  });
  assert.equal(reset.statusCode, 200, reset.body);
  assert.equal(reset.json().action, 'reset');
});
