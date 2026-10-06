import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recurringCommercialPrices, TORQUESHED_CREDIT_CATALOG } from '@operatoros/sdk';
import { auditEcosystemStripe, ECOSYSTEM_STRIPE_EVENTS, ECOSYSTEM_STRIPE_WEBHOOK_URL } from '../src/lib/ecosystem-stripe-audit.js';
import { recurringStripePriceError } from '../src/lib/stripe-price-contract.js';

function recurringPrice(id = 'price_test', cents = 4900) {
  return { id, active: true, livemode: false, currency: 'usd', billing_scheme: 'per_unit', transform_quantity: null, custom_unit_amount: null, type: 'recurring', unit_amount: cents, product: 'prod_test', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
}

test('all recurring billing flows reject wrong amounts, modes, cadences and quantity transforms', () => {
  const expected = { priceId: 'price_test', unitAmountCents: 4900, mode: 'test' as const };
  assert.equal(recurringStripePriceError(recurringPrice(), expected), null);
  for (const [override, code] of [
    [{ id: 'price_other' }, 'PRICE_ID_MISMATCH'], [{ active: false }, 'PRICE_INACTIVE'],
    [{ livemode: true }, 'PRICE_MODE_MISMATCH'], [{ currency: 'eur' }, 'PRICE_CURRENCY_MISMATCH'],
    [{ billing_scheme: 'tiered' }, 'PRICE_QUANTITY_MODEL_MISMATCH'],
    [{ transform_quantity: { divide_by: 10 } }, 'PRICE_QUANTITY_MODEL_MISMATCH'],
    [{ custom_unit_amount: { enabled: true } }, 'PRICE_QUANTITY_MODEL_MISMATCH'],
    [{ type: 'one_time' }, 'PRICE_RECURRENCE_MISMATCH'],
    [{ recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } }, 'PRICE_RECURRENCE_MISMATCH'],
    [{ recurring: { interval: 'month', interval_count: 2, usage_type: 'licensed' } }, 'PRICE_RECURRENCE_MISMATCH'],
    [{ recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } }, 'PRICE_RECURRENCE_MISMATCH'],
    [{ unit_amount: 4901 }, 'PRICE_AMOUNT_MISMATCH'],
  ] as const) assert.equal(recurringStripePriceError({ ...recurringPrice(), ...override }, expected), code);
  assert.equal(recurringStripePriceError(recurringPrice(), { ...expected, mode: 'live' }), 'PRICE_MODE_MISMATCH');
});

function fixture() {
  const env: Record<string, string> = { STRIPE_MODE: 'test', STRIPE_EXPECTED_ACCOUNT_ID: 'acct_test', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_test' };
  const catalog = recurringCommercialPrices(env);
  const priceById = new Map<string, any>();
  for (const item of catalog) {
    env[item.envKey] = `price_${item.key.replaceAll('-', '_')}`;
    priceById.set(env[item.envKey], recurringPrice(env[item.envKey], item.cents));
  }
  const tokens = TORQUESHED_CREDIT_CATALOG.map(item => ({
    ...recurringPrice(`price_${item.key}`, item.amountMinor), type: 'one_time', recurring: null, lookup_key: item.lookupKey,
    metadata: { operatoros_product: 'torqueshed_ai_credits', module_slug: 'torqueshed', package_key: item.key, units: String(item.units), catalog_version: 'torqueshed-credit-v1', environment: 'test', sku: item.sku, currency: item.currency },
  }));
  const portal = { id: 'bpc_test', active: true, livemode: false, features: { subscription_update: { enabled: false }, subscription_pause: { enabled: false } } };
  const endpoints = [{ id: 'we_test', url: ECOSYSTEM_STRIPE_WEBHOOK_URL, status: 'enabled', livemode: false, enabled_events: [...ECOSYSTEM_STRIPE_EVENTS] }];
  const client = {
    accounts: { retrieve: async () => ({ id: 'acct_test', charges_enabled: true, payouts_enabled: true }) },
    prices: { retrieve: async (id: string) => priceById.get(id), list: async (args: any) => ({ data: tokens.filter(price => args.lookup_keys.includes(price.lookup_key)), has_more: false }) },
    products: { retrieve: async (id: string) => ({ id, active: true, livemode: false }) },
    billingPortal: { configurations: { retrieve: async () => portal } },
    webhookEndpoints: { list: async () => ({ data: endpoints, has_more: false }) },
  };
  return { env, client, priceById, tokens, portal, endpoints };
}

test('read-only ecosystem inspection validates exactly eight recurring and three token SKUs', async () => {
  const { env, client } = fixture();
  const report = await auditEcosystemStripe(client, env);
  assert.equal(report.providerConfigurationValidated, true);
  assert.equal(report.prices.length, 11);
  assert.equal(report.prices.filter(price => price.cadence === 'month').length, 8);
  assert.equal(report.prices.filter(price => price.cadence === 'one_time').length, 3);
  assert.equal(report.operation, 'read-only');
  assert.ok(report.outstandingAcceptance.length > 0);
  assert.equal(JSON.stringify(report).includes('whsec_test'), false);
});

test('wrong account stops before reading any product or price', async () => {
  const { env, client } = fixture();
  env.STRIPE_EXPECTED_ACCOUNT_ID = 'acct_wrong';
  client.prices.retrieve = async () => { throw new Error('must not inspect prices'); };
  await assert.rejects(auditEcosystemStripe(client, env), /STRIPE_ACCOUNT_MISMATCH/);
});

test('audit exposes missing, inactive, reused and wrong-price bindings without permitting collection', async () => {
  const { env, client, priceById } = fixture();
  delete env.STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY;
  env.STRIPE_PRICE_PULSEDESK_MONTHLY = env.STRIPE_PRICE_TRADEFLOWKIT_MONTHLY;
  priceById.get(env.STRIPE_PRICE_TECHDECK_MONTHLY).unit_amount = 1;
  client.products.retrieve = async id => ({ id, active: false, livemode: false });
  const report = await auditEcosystemStripe(client, env);
  assert.equal(report.providerConfigurationValidated, false);
  for (const issue of ['RECURRING_PRICE_IDS_REUSED', 'additional-seat:PRICE_NOT_CONFIGURED', 'techdeck:PRICE_AMOUNT_MISMATCH', 'tradeflowkit:PRODUCT_INACTIVE_OR_MODE_MISMATCH']) assert.ok(report.issues.includes(issue), issue);
});

test('unsafe portal, missing settlement events and token metadata drift block configuration acceptance', async () => {
  const { env, client, portal, endpoints, tokens } = fixture();
  portal.features.subscription_update.enabled = true;
  endpoints[0].enabled_events = ['checkout.session.completed'];
  tokens[0].metadata.units = '1';
  const report = await auditEcosystemStripe(client, env);
  assert.equal(report.providerConfigurationValidated, false);
  for (const issue of ['STRIPE_PORTAL_CONFIGURATION_UNSAFE', 'STRIPE_CANONICAL_WEBHOOK_MISSING_AMBIGUOUS_OR_EVENTS_INCOMPLETE', 'roadside-25000:TOKEN_METADATA_MISMATCH']) assert.ok(report.issues.includes(issue), issue);
});

test('duplicate webhook delivery targets and ambiguous token lookup keys fail closed', async () => {
  const { env, client, endpoints, tokens } = fixture();
  endpoints.push({ ...endpoints[0], id: 'we_duplicate' });
  tokens.push({ ...tokens[0], id: 'price_duplicate' });
  const report = await auditEcosystemStripe(client, env);
  assert.equal(report.webhookValidated, false);
  assert.ok(report.issues.includes('roadside-25000:TOKEN_LOOKUP_MISSING_OR_AMBIGUOUS'));
});

test('capacity price configuration is bounded and never includes retired plans or OutCall', () => {
  assert.throws(() => recurringCommercialPrices({ CALLCOMMAND_LANE_PRICE_CENTS: '1' }), /supported/);
  assert.equal(recurringCommercialPrices({ CALLCOMMAND_LANE_PRICE_CENTS: '5900' }).find(item => item.key === 'callcommand-lane')?.cents, 5900);
  for (const key of ['outcall', 'starter', 'pro', 'elite']) assert.equal(recurringCommercialPrices().some(item => item.key === key), false);
});
