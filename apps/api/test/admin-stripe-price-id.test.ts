/**
 * Release-v60 compatibility coverage for retired per-module Stripe bindings.
 * Historical bindings remain readable for diagnosis, while every mutation is
 * rejected because Application Stack owns one shared companion price.
 */

import './_stripe-env.js';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, users } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';
import { __setStripeTestOverrides, getAddonStripePriceEnvKey } from '../src/lib/billing-service.js';

let app: any;
let superAdmin: any;
let mod: any;
let envKey: string;
let savedEnvValue: string | undefined;
let retrieveCalls = 0;

const ENV_PRICE_ID = 'price_envoldfallback';

before(async () => {
  await ensureSchemaReady();

  __setStripeTestOverrides({
    enabled: true,
    client: {
      prices: {
        retrieve: async (id: string) => {
          retrieveCalls += 1;
          if (id === ENV_PRICE_ID) {
            return { id, unit_amount: 5000, currency: 'usd', active: true };
          }
          throw new Error(`Unexpected Stripe lookup: ${id}`);
        },
      },
    },
  });

  superAdmin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));
  mod = await createTestModule(`stripe-pid-${uniqueId('m').replace(/_/g, '-')}`);
  await db.update(modules)
    .set({ metadata: { addonPriceCents: 9900 }, updatedAt: new Date() })
    .where(eq(modules.id, mod.id));

  envKey = getAddonStripePriceEnvKey(mod.slug);
  savedEnvValue = process.env[envKey];
  process.env[envKey] = ENV_PRICE_ID;

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
  if (app) await app.close();
  if (mod) await cleanupModule(mod.id);
  if (superAdmin) await cleanupUser(superAdmin.id);
});

const bearer = (user: any) => ({
  authorization: `Bearer ${signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionType: 'platform',
  })}`,
});

async function metadata() {
  const [row] = await db.select().from(modules).where(eq(modules.id, mod.id)).limit(1);
  return (row?.metadata ?? {}) as Record<string, unknown>;
}

test('historic env binding remains readable but is absent from the six-item sellable list', async () => {
  const read = await app.inject({
    method: 'GET',
    url: `/v1/platform/modules/${mod.slug}/stripe-price`,
    headers: bearer(superAdmin),
  });
  assert.equal(read.statusCode, 200, read.body);
  assert.equal(read.json().lookup.priceId, ENV_PRICE_ID);
  assert.equal(read.json().lookup.unitAmountCents, 5000);
  assert.equal(retrieveCalls, 1);

  const pricing = await app.inject({
    method: 'GET',
    url: '/v1/platform/pricing',
    headers: bearer(superAdmin),
  });
  assert.equal(pricing.statusCode, 200, pricing.body);
  assert.equal(pricing.json().pricing.some((row: any) => row.slug === mod.slug), false);
});

test('all per-module Stripe binding writes fail closed without changing metadata or calling Stripe', async () => {
  const before = await metadata();
  const callsBefore = retrieveCalls;
  for (const stripePriceId of [
    'price_validxyz123',
    'price_rotatedabc456',
    'price_bogusnope999',
    'not-a-price-id',
    null,
    '   ',
  ]) {
    const response = await app.inject({
      method: 'PUT',
      url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
      headers: bearer(superAdmin),
      payload: { stripePriceId },
    });
    assert.equal(response.statusCode, 409, `${String(stripePriceId)}: ${response.body}`);
    assert.equal(response.json().code, 'APPLICATION_STACK_SHARED_PRICE_REQUIRED');
  }
  assert.deepEqual(await metadata(), before);
  assert.equal(retrieveCalls, callsBefore, 'closed writes stop before provider validation');
});

test('read fallback reports no price when neither legacy binding source exists', async () => {
  const prior = process.env[envKey];
  delete process.env[envKey];
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/platform/modules/${mod.slug}/stripe-price`,
      headers: bearer(superAdmin),
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().lookup.priceId, '');
    assert.equal(response.json().lookup.fetched, false);
    assert.equal(response.json().lookup.unitAmountCents, null);
  } finally {
    if (prior !== undefined) process.env[envKey] = prior;
  }
});

test('non-super-admin cannot edit the retired binding control', async () => {
  const intruder = await createTestUser();
  try {
    const response = await app.inject({
      method: 'PUT',
      url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
      headers: bearer(intruder),
      payload: { stripePriceId: 'price_forbidden' },
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().code, 'PLATFORM_ROLE_REQUIRED');
  } finally {
    await cleanupUser(intruder.id);
  }
});
