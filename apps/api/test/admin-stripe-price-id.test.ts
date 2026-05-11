/**
 * Task #43 — API contract for the per-module Stripe Price ID override.
 * Validates: round-trip persistence, mismatch banner clearing on save,
 * fall-back to env binding on clear, and rejection of bogus ids.
 * Stripe is stubbed via `__setStripeTestOverrides`. See companion UI
 * spec at apps/web/e2e/admin-stripe-price-id.spec.ts.
 */

import './_stripe-env.js';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, modules } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
  uniqueId,
} from './_setup.js';
import { __setStripeTestOverrides, getAddonStripePriceEnvKey } from '../src/lib/billing-service.js';

let app: any;
let superAdmin: any;
let mod: any;
let envKey: string;
let savedEnvVal: string | undefined;

const VALID_ID = 'price_validxyz123';
const ROTATED_ID = 'price_rotatedabc456';
const BOGUS_ID = 'price_bogusnope999';
const ENV_PRICE_ID = 'price_envoldfallback';

const stripeStub = {
  prices: {
    retrieve: async (id: string) => {
      if (id === VALID_ID) {
        return { id: VALID_ID, unit_amount: 9900, currency: 'usd', active: true };
      }
      if (id === ROTATED_ID) {
        return { id: ROTATED_ID, unit_amount: 9900, currency: 'usd', active: true };
      }
      if (id === ENV_PRICE_ID) {
        // Old env-bound price — wrong unit_amount, drives the mismatch banner.
        return { id: ENV_PRICE_ID, unit_amount: 5000, currency: 'usd', active: true };
      }
      throw new Error(`No such price: ${id}`);
    },
  },
};

before(async () => {
  await ensureSchemaReady();

  __setStripeTestOverrides({ enabled: true, client: stripeStub });

  superAdmin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

  mod = await createTestModule(`stripe-pid-${uniqueId('m').replace(/_/g, '-')}`);
  // Declare an addonPriceCents that is intentionally OUT of sync with the
  // env-bound price (5000¢) so the drift surface reports a mismatch until
  // the admin saves an override that matches.
  await db.update(modules)
    .set({ metadata: { addonPriceCents: 9900 } as any, updatedAt: new Date() })
    .where(eq(modules.id, mod.id));

  envKey = getAddonStripePriceEnvKey(mod.slug);
  savedEnvVal = process.env[envKey];
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
  if (savedEnvVal === undefined) delete process.env[envKey];
  else process.env[envKey] = savedEnvVal;
  if (app) await app.close();
  if (mod) await cleanupModule(mod.id);
  if (superAdmin) await cleanupUser(superAdmin.id);
});

const bearer = (u: any) => ({
  authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}`,
});

async function getModuleMetadata() {
  const [row] = await db.select().from(modules).where(eq(modules.id, mod.id)).limit(1);
  return (row?.metadata ?? {}) as Record<string, unknown>;
}

test('baseline: env binding drives the lookup and produces a mismatch', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/platform/modules/${mod.slug}/stripe-price`,
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.lookup.priceId, ENV_PRICE_ID, 'falls back to env-bound id');
  assert.equal(body.lookup.unitAmountCents, 5000);

  // Confirm the /pricing surface (mismatch banner source) flags drift.
  const pricing = await app.inject({
    method: 'GET',
    url: '/v1/platform/pricing',
    headers: bearer(superAdmin),
  });
  assert.equal(pricing.statusCode, 200);
  const row = pricing.json().pricing.find((p: any) => p.slug === mod.slug);
  assert.ok(row, 'module appears in pricing list');
  assert.equal(row.declaredAddonPriceCents, 9900);
  assert.equal(row.stripeUnitAmountCents, 5000);
  assert.equal(row.mismatch, true, 'baseline mismatch present');
});

test('PUT /stripe-price-id validates and persists override; mismatch clears', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
    headers: bearer(superAdmin),
    payload: { stripePriceId: VALID_ID },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.validation.ok, true);
  assert.equal(body.validation.priceId, VALID_ID);
  assert.equal(body.validation.unitAmountCents, 9900);
  assert.equal((body.module.metadata as any).stripePriceId, VALID_ID);

  // Round-tripped on disk.
  const md = await getModuleMetadata();
  assert.equal(md.stripePriceId, VALID_ID);

  // Lookup now resolves the metadata override (not the env binding).
  const lookup = await app.inject({
    method: 'GET',
    url: `/v1/platform/modules/${mod.slug}/stripe-price`,
    headers: bearer(superAdmin),
  });
  assert.equal(lookup.statusCode, 200);
  const lb = lookup.json();
  assert.equal(lb.lookup.priceId, VALID_ID, 'metadata override beats env binding');
  assert.equal(lb.lookup.unitAmountCents, 9900);

  // Pricing drift surface no longer reports mismatch — declared (9900) ===
  // override-resolved unit_amount (9900).
  const pricing = await app.inject({
    method: 'GET',
    url: '/v1/platform/pricing',
    headers: bearer(superAdmin),
  });
  const row = pricing.json().pricing.find((p: any) => p.slug === mod.slug);
  assert.equal(row.mismatch, false, 'mismatch banner cleared after override');
  assert.equal(row.stripeUnitAmountCents, 9900);
});

test('PUT /stripe-price-id supports rotating the override id', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
    headers: bearer(superAdmin),
    payload: { stripePriceId: ROTATED_ID },
  });
  assert.equal(res.statusCode, 200);
  const md = await getModuleMetadata();
  assert.equal(md.stripePriceId, ROTATED_ID, 'rotation overwrites previous override');
});

test('bogus Stripe Price ID is rejected 400 and never persisted', async () => {
  const before = await getModuleMetadata();
  const beforeId = before.stripePriceId;

  const res = await app.inject({
    method: 'PUT',
    url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
    headers: bearer(superAdmin),
    payload: { stripePriceId: BOGUS_ID },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.code, 'STRIPE_PRICE_INVALID');
  assert.equal(body.validation.ok, false);
  assert.match(body.validation.error || '', /No such price|Stripe price lookup failed/i);

  const after = await getModuleMetadata();
  assert.equal(after.stripePriceId, beforeId, 'metadata.stripePriceId unchanged after rejected save');
});

test('malformed id (does not match price_XXXX) is rejected without hitting Stripe', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
    headers: bearer(superAdmin),
    payload: { stripePriceId: 'not-a-price-id' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'STRIPE_PRICE_INVALID');
});

test('clearing override (null) falls back to env binding cleanly', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
    headers: bearer(superAdmin),
    payload: { stripePriceId: null },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.validation, null, 'no validation on clear');
  assert.equal((body.module.metadata as any).stripePriceId, undefined);

  const md = await getModuleMetadata();
  assert.ok(!('stripePriceId' in md), 'metadata.stripePriceId removed');
  // addonPriceCents (sibling key) preserved.
  assert.equal(md.addonPriceCents, 9900);

  const lookup = await app.inject({
    method: 'GET',
    url: `/v1/platform/modules/${mod.slug}/stripe-price`,
    headers: bearer(superAdmin),
  });
  assert.equal(lookup.json().lookup.priceId, ENV_PRICE_ID, 'falls back to env binding');
});

test('clearing override with no env binding leaves no Stripe price id', async () => {
  const prev = process.env[envKey];
  delete process.env[envKey];
  try {
    // Ensure metadata.stripePriceId is already cleared (previous test cleared it).
    const lookup = await app.inject({
      method: 'GET',
      url: `/v1/platform/modules/${mod.slug}/stripe-price`,
      headers: bearer(superAdmin),
    });
    const lb = lookup.json();
    assert.equal(lb.lookup.priceId, '', 'no priceId when neither override nor env is set');
    assert.equal(lb.lookup.fetched, false);
    assert.equal(lb.lookup.unitAmountCents, null);
  } finally {
    if (prev !== undefined) process.env[envKey] = prev;
  }
});

test('empty-string override is treated as a clear, not a bad id', async () => {
  // First, plant an override so we can prove empty-string clears it.
  const plant = await app.inject({
    method: 'PUT',
    url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
    headers: bearer(superAdmin),
    payload: { stripePriceId: VALID_ID },
  });
  assert.equal(plant.statusCode, 200);
  assert.equal((await getModuleMetadata()).stripePriceId, VALID_ID);

  const res = await app.inject({
    method: 'PUT',
    url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
    headers: bearer(superAdmin),
    payload: { stripePriceId: '   ' },
  });
  assert.equal(res.statusCode, 200);
  const md = await getModuleMetadata();
  assert.ok(!('stripePriceId' in md), 'whitespace-only payload clears the override');
});

test('non-super-admin cannot edit the override (RBAC)', async () => {
  const intruder = await createTestUser();
  try {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/platform/modules/${mod.slug}/stripe-price-id`,
      headers: bearer(intruder),
      payload: { stripePriceId: VALID_ID },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
  } finally {
    await cleanupUser(intruder.id);
  }
});
