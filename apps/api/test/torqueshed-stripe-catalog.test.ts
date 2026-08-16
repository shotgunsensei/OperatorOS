import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TORQUESHED_CREDIT_CATALOG, TORQUESHED_CREDIT_CATALOG_VERSION } from '../src/lib/torqueshed-credit-catalog.js';
import { provisionTorqueShedStripeCatalog, type TorqueShedCatalogStripeClient } from '../src/lib/torqueshed-stripe-catalog-provisioner.js';
import { parseTorqueShedCatalogArgs } from '../src/scripts/torqueshed-stripe-catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function fakeStripe(mode: 'test' | 'live'): TorqueShedCatalogStripeClient & { productsData: any[]; pricesData: any[] } {
  const productsData: any[] = [];
  const pricesData: any[] = [];
  let sequence = 0;
  return {
    productsData, pricesData,
    accounts: { retrieve: async () => ({ id: `acct_${mode}_catalog` }) },
    products: {
      list: async () => ({ data: productsData.filter((item) => item.active !== false) }),
      retrieve: async (id) => productsData.find((item) => item.id === id),
      create: async (args: any) => {
        const value = { id: `prod_catalog_${++sequence}`, livemode: mode === 'live', ...args };
        productsData.push(value); return value;
      },
    },
    prices: {
      list: async (args: any) => ({ data: pricesData.filter((item) => {
        if (args.lookup_keys) return args.lookup_keys.includes(item.lookup_key);
        return args.active ? item.active !== false : true;
      }) }),
      create: async (args: any) => {
        const value = { id: `catalog_price_${++sequence}`, active: true, livemode: mode === 'live', recurring: null, ...args };
        pricesData.push(value); return value;
      },
    },
  };
}

test('manifest keeps the approved commercial contract and unique stable lookup keys', () => {
  assert.equal(TORQUESHED_CREDIT_CATALOG_VERSION, 'torqueshed-credit-v1');
  assert.deepEqual(TORQUESHED_CREDIT_CATALOG.map(({ key, name, units, amountMinor, currency }) => ({ key, name, units, amountMinor, currency })), [
    { key: 'roadside-25000', name: 'Roadside', units: 25_000, amountMinor: 500, currency: 'USD' },
    { key: 'workshop-100000', name: 'Workshop', units: 100_000, amountMinor: 1_500, currency: 'USD' },
    { key: 'fleet-500000', name: 'Fleet', units: 500_000, amountMinor: 5_000, currency: 'USD' },
  ]);
  assert.equal(new Set(TORQUESHED_CREDIT_CATALOG.map((item) => item.lookupKey)).size, 3);
});

test('dry-run reports missing objects without provider or mapping mutation', async () => {
  const stripe = fakeStripe('test');
  const persisted: unknown[] = [];
  const report = await provisionTorqueShedStripeCatalog({ client: stripe, mode: 'test', operation: 'dry-run', persist: async (row) => { persisted.push(row); } });
  assert.equal(report.status, 'changes_required');
  assert.equal(report.created.products, 0); assert.equal(report.created.prices, 0);
  assert.equal(stripe.productsData.length, 0); assert.equal(stripe.pricesData.length, 0); assert.equal(persisted.length, 0);
});

test('first test apply creates three durable pairs and second apply is idempotent', async () => {
  const stripe = fakeStripe('test');
  const persisted: unknown[] = [];
  const first = await provisionTorqueShedStripeCatalog({ client: stripe, mode: 'test', operation: 'apply', persist: async (row) => { persisted.push(row); } });
  assert.equal(first.status, 'validated'); assert.deepEqual(first.created, { products: 3, prices: 3 });
  const second = await provisionTorqueShedStripeCatalog({ client: stripe, mode: 'test', operation: 'apply', persist: async (row) => { persisted.push(row); } });
  assert.equal(second.status, 'validated'); assert.deepEqual(second.created, { products: 0, prices: 0 });
  assert.equal(stripe.productsData.length, 3); assert.equal(stripe.pricesData.length, 3); assert.equal(persisted.length, 6);
});

test('amount, metadata, mode, duplicate lookup, and inactive Price drift fail closed', async () => {
  for (const mutate of [
    (stripe: ReturnType<typeof fakeStripe>) => { stripe.pricesData[0].unit_amount = 501; },
    (stripe: ReturnType<typeof fakeStripe>) => { stripe.pricesData[0].metadata.units = '1'; },
    (stripe: ReturnType<typeof fakeStripe>) => { stripe.pricesData[0].livemode = true; },
    (stripe: ReturnType<typeof fakeStripe>) => { stripe.pricesData[0].active = false; },
    (stripe: ReturnType<typeof fakeStripe>) => { stripe.pricesData.push({ ...stripe.pricesData[0], id: 'duplicate_catalog_price', active: true }); },
  ]) {
    const stripe = fakeStripe('test');
    await provisionTorqueShedStripeCatalog({ client: stripe, mode: 'test', operation: 'apply', persist: async () => {} });
    mutate(stripe);
    const report = await provisionTorqueShedStripeCatalog({ client: stripe, mode: 'test', operation: 'validate' });
    assert.equal(report.safeToEnablePurchases, false);
    assert.equal(report.status, 'drift');
  }
});

test('CLI rejects mismatched mode and requires a second live-apply confirmation', () => {
  assert.throws(() => parseTorqueShedCatalogArgs(['--mode', 'live', '--dry-run'], { STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'redacted' }), /does not match/);
  assert.throws(() => parseTorqueShedCatalogArgs(['--mode', 'live', '--apply'], { STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'redacted', DATABASE_URL: 'redacted' }), /Live apply requires/);
  assert.deepEqual(parseTorqueShedCatalogArgs(['--mode', 'live', '--apply', '--confirm-live'], {
    STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'redacted', DATABASE_URL: 'redacted',
    TORQUESHED_STRIPE_LIVE_APPLY_CONFIRM: 'CREATE_LIVE_TORQUESHED_CATALOG',
  }), { mode: 'live', operation: 'apply' });
});

test('checkout source uses a validated persistent Price and has no inline TorqueShed price data or object ID', () => {
  const billing = readFileSync(resolve(root, 'apps/api/src/lib/billing-service.ts'), 'utf8');
  const purchase = readFileSync(resolve(root, 'apps/api/src/lib/operatoros-token-billing.ts'), 'utf8');
  assert.match(billing, /price:\s*input\.priceId/);
  assert.doesNotMatch(billing.slice(billing.indexOf('createUsageCreditCheckoutSession')), /price_data/);
  assert.match(purchase, /getValidatedTorqueShedPrice/);
  for (const source of [billing, purchase]) assert.doesNotMatch(source, /['"]price_[A-Za-z0-9]{12,}['"]/);
});
