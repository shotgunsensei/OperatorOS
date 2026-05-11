/**
 * Integration coverage for the two super-admin pricing drift-fix endpoints
 *   POST /v1/platform/pricing/:slug/sync-from-stripe
 *   POST /v1/platform/pricing/:slug/create-stripe-price
 *
 * Asserts:
 *   - Happy paths mutate modules.metadata.addonPriceCents and write the
 *     correctly-shaped audit row (action + extra payload).
 *   - All documented error codes:
 *       sync:    404 MODULE_NOT_FOUND
 *                409 STRIPE_PRICE_NOT_CONFIGURED
 *                502 STRIPE_LOOKUP_FAILED
 *       create:  404 MODULE_NOT_FOUND
 *                400 BAD_REQUEST  (unitAmountCents validation)
 *                409 STRIPE_NOT_LIVE  (Stripe disabled)
 *                502 STRIPE_PRICE_CREATE_FAILED  (Stripe live, SDK throws)
 *   - Super-admin gating: 401 unauthenticated, 403 PLATFORM_ROLE_REQUIRED
 *     for non-super-admin.
 *
 * Stripe is mocked via __setStripeTestOverrides so no network calls fly.
 */

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, modules, adminAuditLogs } from '../src/schema.js';
import {
  __setStripeTestOverrides,
  getAddonStripePriceEnvKey,
} from '../src/lib/billing-service.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
  uniqueId,
} from './_setup.js';

let app: any;
let superAdmin: any;
let alice: any;
let mod: any;
let envKey: string;

const savedEnv: Record<string, string | undefined> = {};
const savedStripeMode = process.env.STRIPE_MODE;
const savedStripeSecret = process.env.STRIPE_SECRET_KEY;

before(async () => {
  await ensureSchemaReady();

  superAdmin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));
  alice = await createTestUser();

  mod = await createTestModule(`drift-${uniqueId('m').replace(/_/g, '-')}`);
  envKey = getAddonStripePriceEnvKey(mod.slug);
  savedEnv[envKey] = process.env[envKey];

  // Seed an initial declared price so we can detect overwrites.
  await db.update(modules)
    .set({ metadata: { ...(mod.metadata ?? {}), addonPriceCents: 999 }, updatedAt: new Date() })
    .where(eq(modules.id, mod.id));

  // STRIPE_SECRET_KEY must be present for lookupAddonStripePrice to even
  // attempt a Stripe call (otherwise it returns "not configured" early).
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

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
  if (savedEnv[envKey] === undefined) delete process.env[envKey];
  else process.env[envKey] = savedEnv[envKey];
  if (savedStripeMode === undefined) delete process.env.STRIPE_MODE;
  else process.env.STRIPE_MODE = savedStripeMode;
  if (savedStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = savedStripeSecret;

  if (app) await app.close();
  if (mod) await cleanupModule(mod.id);
  for (const u of [alice, superAdmin]) if (u) await cleanupUser(u.id);
});

beforeEach(() => {
  __setStripeTestOverrides(null);
});
afterEach(() => {
  __setStripeTestOverrides(null);
});

const bearer = (u: any) => ({
  authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}`,
});

async function setDeclaredCents(value: number | null) {
  const [m] = await db.select().from(modules).where(eq(modules.id, mod.id)).limit(1);
  const md = { ...((m.metadata ?? {}) as Record<string, any>) };
  if (value == null) delete md.addonPriceCents; else md.addonPriceCents = value;
  await db.update(modules).set({ metadata: md, updatedAt: new Date() }).where(eq(modules.id, mod.id));
}

async function getDeclaredCents(): Promise<number | null> {
  const [m] = await db.select().from(modules).where(eq(modules.id, mod.id)).limit(1);
  const md = (m.metadata ?? {}) as Record<string, any>;
  return typeof md.addonPriceCents === 'number' ? md.addonPriceCents : null;
}

async function latestAudit(action: string) {
  const [row] = await db.select().from(adminAuditLogs)
    .where(and(eq(adminAuditLogs.action, action), eq(adminAuditLogs.adminId, superAdmin.id)))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(1);
  return row;
}

// ─────────────────────────────────────────────────────────────────────────
// RBAC gating
// ─────────────────────────────────────────────────────────────────────────

test('sync-from-stripe: 401 unauthenticated', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/sync-from-stripe`,
  });
  assert.equal(res.statusCode, 401);
});

test('sync-from-stripe: 403 PLATFORM_ROLE_REQUIRED for non-super-admin', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/sync-from-stripe`,
    headers: bearer(alice),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
});

test('create-stripe-price: 401 unauthenticated', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`,
    payload: { unitAmountCents: 1500 },
  });
  assert.equal(res.statusCode, 401);
});

test('create-stripe-price: 403 PLATFORM_ROLE_REQUIRED for non-super-admin', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`,
    headers: bearer(alice),
    payload: { unitAmountCents: 1500 },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
});

// ─────────────────────────────────────────────────────────────────────────
// sync-from-stripe — error paths
// ─────────────────────────────────────────────────────────────────────────

test('sync-from-stripe: 404 MODULE_NOT_FOUND for unknown slug', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/does-not-exist-${uniqueId('x').replace(/_/g,'-')}/sync-from-stripe`,
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'MODULE_NOT_FOUND');
});

test('sync-from-stripe: 409 STRIPE_PRICE_NOT_CONFIGURED when env binding is empty', async () => {
  delete process.env[envKey];
  __setStripeTestOverrides({ enabled: true, client: { prices: { retrieve: async () => ({}) } } });

  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/sync-from-stripe`,
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, 'STRIPE_PRICE_NOT_CONFIGURED');
});

test('sync-from-stripe: 502 STRIPE_LOOKUP_FAILED when Stripe throws', async () => {
  process.env[envKey] = 'price_drift_fixture';
  __setStripeTestOverrides({
    enabled: true,
    client: { prices: { retrieve: async () => { throw new Error('No such price: price_drift_fixture'); } } },
  });

  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/sync-from-stripe`,
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 502);
  const body = res.json();
  assert.equal(body.code, 'STRIPE_LOOKUP_FAILED');
  assert.match(String(body.error), /No such price/);
});

// ─────────────────────────────────────────────────────────────────────────
// sync-from-stripe — happy path + audit
// ─────────────────────────────────────────────────────────────────────────

test('sync-from-stripe: rewrites declared cents to live Stripe value and writes audit row', async () => {
  await setDeclaredCents(999);
  process.env[envKey] = 'price_drift_fixture';
  const stripeAmount = 2499;
  __setStripeTestOverrides({
    enabled: true,
    client: {
      prices: {
        retrieve: async (id: string) => ({
          id,
          unit_amount: stripeAmount,
          currency: 'usd',
          active: true,
        }),
      },
    },
  });

  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/sync-from-stripe`,
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.action, 'synced_from_stripe');
  assert.equal(body.previousCents, 999);
  assert.equal(body.nextCents, stripeAmount);

  // DB-level confirmation that the metadata was actually mutated.
  assert.equal(await getDeclaredCents(), stripeAmount);

  const audit = await latestAudit('module_addon_price_synced_from_stripe');
  assert.ok(audit, 'audit row must be written');
  assert.equal(audit!.targetUserId, null, 'module audit rows have no targetUserId');
  const details = (audit!.details ?? {}) as any;
  assert.equal(details.targetType, 'module');
  assert.equal(details.targetId, mod.id);
  assert.equal(details.slug, mod.slug);
  assert.equal(details.envKey, envKey);
  assert.equal(details.priceId, 'price_drift_fixture');
  assert.equal(details.previousCents, 999);
  assert.equal(details.nextCents, stripeAmount);
  assert.equal(details.currency, 'usd');
  assert.ok(details.before, 'audit captures before snapshot');
  assert.ok(details.after, 'audit captures after snapshot');
});

// ─────────────────────────────────────────────────────────────────────────
// create-stripe-price — validation + error paths
// ─────────────────────────────────────────────────────────────────────────

test('create-stripe-price: 400 BAD_REQUEST when unitAmountCents is missing/invalid', async () => {
  for (const bad of [undefined, null, 0, -10, 1.5, '1500', NaN, 100_001_00]) {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`,
      headers: bearer(superAdmin),
      payload: { unitAmountCents: bad as any },
    });
    assert.equal(res.statusCode, 400, `bad value ${String(bad)} should 400`);
    assert.equal(res.json().code, 'BAD_REQUEST');
  }
});

test('create-stripe-price: 404 MODULE_NOT_FOUND for unknown slug', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/does-not-exist-${uniqueId('y').replace(/_/g,'-')}/create-stripe-price`,
    headers: bearer(superAdmin),
    payload: { unitAmountCents: 1500 },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'MODULE_NOT_FOUND');
});

test('create-stripe-price: 409 STRIPE_NOT_LIVE when Stripe is disabled', async () => {
  __setStripeTestOverrides({ enabled: false });
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`,
    headers: bearer(superAdmin),
    payload: { unitAmountCents: 1500 },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, 'STRIPE_NOT_LIVE');
});

test('create-stripe-price: 502 STRIPE_PRICE_CREATE_FAILED when Stripe throws (live)', async () => {
  process.env.STRIPE_MODE = 'live';
  __setStripeTestOverrides({
    enabled: true,
    client: { prices: { create: async () => { throw new Error('card_declined: simulated'); } } },
  });
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`,
      headers: bearer(superAdmin),
      payload: { unitAmountCents: 1500 },
    });
    assert.equal(res.statusCode, 502);
    const body = res.json();
    assert.equal(body.code, 'STRIPE_PRICE_CREATE_FAILED');
    assert.match(String(body.error), /card_declined/);
  } finally {
    process.env.STRIPE_MODE = savedStripeMode;
  }
});

// ─────────────────────────────────────────────────────────────────────────
// create-stripe-price — happy path + audit + env rotation
// ─────────────────────────────────────────────────────────────────────────

test('create-stripe-price: provisions price, rotates env binding, aligns declared cents, writes audit', async () => {
  await setDeclaredCents(999);
  const previousPriceId = 'price_old_fixture';
  process.env[envKey] = previousPriceId;

  const newPriceId = `price_new_${uniqueId('p')}`;
  const newProductId = `prod_${uniqueId('pr')}`;
  const newAmount = 3499;
  let createCalledWith: any = null;
  let lookupCalls = 0;
  __setStripeTestOverrides({
    enabled: true,
    client: {
      prices: {
        create: async (args: any) => {
          createCalledWith = args;
          return {
            id: newPriceId,
            product: newProductId,
            unit_amount: newAmount,
            currency: 'usd',
          };
        },
        retrieve: async (id: string) => {
          lookupCalls++;
          return { id, unit_amount: newAmount, currency: 'usd', active: true };
        },
      },
    },
  });

  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/create-stripe-price`,
    headers: bearer(superAdmin),
    payload: { unitAmountCents: newAmount, currency: 'USD' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.action, 'stripe_price_created');
  assert.equal(body.envKey, envKey);
  // The "previous" priceId is the resolved binding (metadata override
  // wins over env). With no metadata override seeded, the env binding wins.
  assert.equal(body.previousPriceId, previousPriceId);
  assert.equal(body.previousMetaPriceId, null);
  assert.equal(body.envPriceId, previousPriceId);
  assert.equal(body.newPriceId, newPriceId);
  assert.equal(body.productId, newProductId);
  assert.equal(body.previousCents, 999);
  assert.equal(body.nextCents, newAmount);
  assert.equal(body.currency, 'usd');
  // Contract evolved: the new priceId is now persisted to
  // modules.metadata.stripePriceId so it survives a restart, which means
  // secret rotation is no longer mandatory (just optional for parity).
  assert.equal(body.persistedToMetadata, true);
  assert.equal(body.requiresSecretRotation, false);
  assert.match(String(body.secretRotationHint), new RegExp(envKey));
  assert.match(String(body.secretRotationHint), new RegExp(newPriceId));
  assert.match(String(body.secretRotationHint), /metadata\.stripePriceId/);

  // Stripe SDK was called with the right shape.
  assert.equal(createCalledWith.unit_amount, newAmount);
  assert.equal(createCalledWith.currency, 'usd');
  assert.equal(createCalledWith.recurring?.interval, 'month');
  assert.equal(createCalledWith.metadata?.moduleSlug, mod.slug);

  // In-process env binding rotated.
  assert.equal(process.env[envKey], newPriceId);

  // Module metadata aligned.
  assert.equal(await getDeclaredCents(), newAmount);

  // Fresh lookup happened so the response carries verified state.
  assert.ok(lookupCalls >= 1, 'fresh lookupAddonStripePrice was invoked');

  const audit = await latestAudit('module_stripe_price_created');
  assert.ok(audit, 'audit row written');
  const details = (audit!.details ?? {}) as any;
  assert.equal(details.targetType, 'module');
  assert.equal(details.targetId, mod.id);
  assert.equal(details.slug, mod.slug);
  assert.equal(details.envKey, envKey);
  assert.equal(details.previousPriceId, previousPriceId);
  assert.equal(details.previousMetaPriceId, null);
  assert.equal(details.envPriceId, previousPriceId);
  assert.equal(details.newPriceId, newPriceId);
  assert.equal(details.previousCents, 999);
  assert.equal(details.nextCents, newAmount);
  assert.equal(details.currency, 'usd');
  assert.equal(details.productId, newProductId);
  assert.equal(details.persistedToMetadata, true);
  assert.ok(details.before, 'before snapshot present');
  assert.ok(details.after, 'after snapshot present');
});

// -------------------------------------------------------------------------
// Guardrails for the dev/test-only Stripe override seam.
// The seam exists so a Playwright spec can deterministically drive Stripe
// from the running API process. It must be inert in production and gated
// to super_admins only — both behaviors are asserted here.
// -------------------------------------------------------------------------

test('test-seam: 401 unauthenticated', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/__test__/stripe-override`,
    payload: { reset: true },
  });
  assert.equal(res.statusCode, 401);
});

test('test-seam: 403 PLATFORM_ROLE_REQUIRED for non-super-admin', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/platform/__test__/stripe-override`,
    headers: bearer(alice),
    payload: { reset: true },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'PLATFORM_ROLE_REQUIRED');
});

test('test-seam: 404 NOT_FOUND when NODE_ENV=production', async () => {
  const savedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/platform/__test__/stripe-override`,
      headers: bearer(superAdmin),
      payload: { reset: true },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().code, 'NOT_FOUND');
  } finally {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
  }
});

test('test-seam: super-admin can install and reset a Stripe override', async () => {
  // Install: subsequent lookupAddonStripePrice should see the stub.
  process.env[envKey] = 'price_seam_fixture';
  const installRes = await app.inject({
    method: 'POST',
    url: `/v1/platform/__test__/stripe-override`,
    headers: bearer(superAdmin),
    payload: {
      enabled: true,
      retrievePrice: { unit_amount: 1234, currency: 'usd', active: true },
    },
  });
  assert.equal(installRes.statusCode, 200);
  assert.equal(installRes.json().ok, true);

  // Drive a sync to prove the stub is wired.
  await setDeclaredCents(777);
  const syncRes = await app.inject({
    method: 'POST',
    url: `/v1/platform/pricing/${mod.slug}/sync-from-stripe`,
    headers: bearer(superAdmin),
  });
  assert.equal(syncRes.statusCode, 200);
  assert.equal(syncRes.json().nextCents, 1234);

  // Reset: stub goes away, lookup falls back to real (disabled) Stripe.
  const resetRes = await app.inject({
    method: 'POST',
    url: `/v1/platform/__test__/stripe-override`,
    headers: bearer(superAdmin),
    payload: { reset: true },
  });
  assert.equal(resetRes.statusCode, 200);
  assert.equal(resetRes.json().action, 'reset');
});
