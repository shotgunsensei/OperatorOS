import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stripeInvoiceSubscriptionId } from '../src/lib/stripe-invoice-subscription.js';

// Execute actual selected source declarations without importing DB/environment
// initialization. SQL is compiled by Drizzle; only execution/provider IO is fake.
const path = new URL('../src/lib/callcommand-number-billing.ts', import.meta.url);
const source = readFileSync(path, 'utf8');
const tree = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true);
const names = ['CallCommandNumberBillingError', 'quantity', 'metadataCandidates', 'numberMetadata',
  'subscriptionId', 'itemForPrice', 'itemId', 'processCallCommandNumberWebhookEvent', 'isCallCommandNumberStripeEvent'];
const declarations = names.map(name => {
  const declaration = tree.statements.find(node => (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
    && node.name?.text === name);
  assert.ok(declaration, `actual managed-number declaration ${name} must exist`);
  return declaration.getText(tree);
});
const compiled = ts.transpileModule(declarations.join('\n')
  + '\nmodule.exports={processCallCommandNumberWebhookEvent,isCallCommandNumberStripeEvent};', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

type Row = Record<string, unknown>;
type Result = { handled: boolean; action?: string; rowsAffected?: number };
const tenant = '11111111-1111-4111-8111-111111111111';
const subscription = 'sub_numbers_exact';
const customer = 'cus_numbers_exact';
const feature = 'managed_phone_numbers';
const metadata = { feature, tenant_id: tenant };
const modern = (reference: unknown) => ({ parent: {
  type: 'subscription_details', subscription_details: { subscription: reference, metadata },
} });
const references: ReadonlyArray<readonly [string, Row]> = [
  ['legacy ID', { subscription }],
  ['legacy expanded', { subscription: { id: subscription } }],
  ['legacy subscription_details', { subscription_details: { subscription } }],
  ['legacy undiscriminated parent', { parent: { subscription_details: { subscription, metadata } } }],
  ['legacy undiscriminated parent expanded', { parent: { subscription_details: { subscription: { id: subscription }, metadata } } }],
  ['modern ID', modern(subscription)],
  ['modern expanded', modern({ id: subscription })],
  ['matching legacy and modern expanded', { subscription, ...modern({ id: subscription }) }],
];

function harness(options: {
  current?: Row | null; provider?: Row; providerError?: boolean; staleWrite?: boolean;
} = {}) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const providerIds: string[] = [];
  const dialect = new PgDialect();
  const current = options.current === undefined ? {
    stripe_subscription_id: subscription, stripe_customer_id: customer,
    stripe_local_price_id: 'price_local', stripe_toll_free_price_id: 'price_toll_free',
    last_stripe_event_created: 10, last_billing_event_id: 'evt_prior',
  } : options.current;
  const provider: Row = {
    id: subscription, customer, metadata, pending_update: null,
    latest_invoice: { id: 'in_numbers', status: 'paid' },
    items: { data: [
      { id: 'si_local', price: { id: 'price_local' }, quantity: 2 },
      { id: 'si_toll_free', price: { id: 'price_toll_free' }, quantity: 1 },
    ] }, ...options.provider,
  };
  const tx = { async execute(query: SQL) {
    const rendered = dialect.sqlToQuery(query);
    queries.push(rendered);
    if (/SELECT stripe_local_price_id/.test(rendered.sql)) return { rows: current ? [current] : [] };
    if (/UPDATE callcommand_number_billing_entitlements/.test(rendered.sql)) return {
      rows: options.staleWrite ? [] : [{ tenant_id: tenant, grace_expires_at: 'synthetic-grace' }],
    };
    return { rows: [] };
  } };
  const module = { exports: {} as {
    processCallCommandNumberWebhookEvent: (event: unknown) => Promise<Result>;
    isCallCommandNumberStripeEvent: (event: unknown) => boolean;
  } };
  runInNewContext(compiled, {
    module, exports: module.exports, sql, stripeInvoiceSubscriptionId,
    CALLCOMMAND_NUMBER_FEATURE_KEY: feature,
    db: { transaction: (callback: (value: typeof tx) => unknown) => callback(tx) },
    getStripeFeatureBillingClient: () => ({ subscriptions: { async retrieve(id: string, expand: unknown) {
      providerIds.push(id);
      assert.equal(JSON.stringify(expand), JSON.stringify({ expand: ['latest_invoice'] }));
      if (options.providerError) throw new Error('synthetic provider unavailable');
      return provider;
    } } }),
    callCommandNumberBillingGraceDays: () => 7,
  });
  const event = (type: string, reference: Row, object: Row = {}) => ({
    id: 'evt_numbers', created: 100, type, data: { object: {
      id: 'in_numbers', customer, metadata,
      // Deliberately untrusted proration quantities: provider items win.
      lines: { data: [{ price: { id: 'price_local' }, quantity: 999 }] },
      ...reference, ...object,
    } },
  });
  return { ...module.exports, event, queries, providerIds,
    writes: () => queries.filter(query => /^\s*UPDATE/.test(query.sql)) };
}

for (const type of ['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed']) {
  for (const [label, reference] of references) {
    test(`${type}: actual number handler accepts ${label} with provider authority intact`, async () => {
      const h = harness({ provider: { latest_invoice: { id: 'in_numbers', status: type === 'invoice.payment_failed' ? 'open' : 'paid' } } });
      const event = h.event(type, reference);
      assert.equal(h.isCallCommandNumberStripeEvent(event), true);
      const result = await h.processCallCommandNumberWebhookEvent(event);
      assert.equal(result.action, type === 'invoice.payment_failed'
        ? 'callcommand_number_payment_grace_started' : 'callcommand_number_quantities_settled');
      assert.equal(result.rowsAffected, 1);
      assert.deepEqual(h.providerIds, [subscription]);
      assert.equal(h.writes().length, 2);
      assert.ok(h.writes().every(query => query.params.includes(tenant)));
      if (type !== 'invoice.payment_failed') {
        assert.deepEqual(h.writes()[0].params.slice(0, 2), [2, 1]);
        assert.ok(!h.writes()[0].params.includes(999));
      } else {
        assert.match(h.writes()[0].sql, /grace_expires_at=COALESCE\(grace_expires_at/);
        assert.ok(h.writes()[0].params.includes(7));
      }
    });
  }
  for (const [label, reference] of [
    ['missing reference', {}],
    ['invalid expanded ID', modern({ id: 123 })],
    ['conflicting top and modern', { subscription, ...modern('sub_other') }],
    ['conflicting expanded top and modern', { subscription: { id: subscription }, ...modern({ id: 'sub_other' }) }],
    ['conflicting legacy details and modern', { subscription_details: { subscription }, ...modern('sub_other') }],
    ['wrong parent discriminator', { parent: { type: 'quote_details', subscription_details: { subscription } } }],
  ] as const) {
    test(`${type}: ${label} cannot reach provider or settlement`, async () => {
      const h = harness();
      const result = await h.processCallCommandNumberWebhookEvent(h.event(type, reference));
      assert.match(result.action ?? '', /unmatched/);
      assert.deepEqual(h.providerIds, []);
      assert.deepEqual(h.writes(), []);
    });
  }
}

test('modern parent metadata alone classifies and settles the exact bound subscription', async () => {
  const h = harness();
  const event = h.event('invoice.paid', modern({ id: subscription }), { metadata: undefined });
  assert.equal(h.isCallCommandNumberStripeEvent(event), true);
  assert.equal((await h.processCallCommandNumberWebhookEvent(event)).rowsAffected, 1);
  assert.deepEqual(h.providerIds, [subscription]);
});

for (const [label, current] of [
  ['missing local entitlement', null],
  ['foreign subscription', { stripe_subscription_id: 'sub_foreign' }],
  ['foreign customer', { stripe_customer_id: 'cus_foreign' }],
  ['duplicate event', { last_billing_event_id: 'evt_numbers' }],
  ['older event', { last_stripe_event_created: 101 }],
] as const) {
  test(`modern expanded reference preserves ${label} guard`, async () => {
    const h = harness({ current });
    assert.equal((await h.processCallCommandNumberWebhookEvent(h.event('invoice.paid', modern({ id: subscription })))).rowsAffected, 0);
    assert.deepEqual(h.providerIds, []);
    assert.deepEqual(h.writes(), []);
  });
}

for (const [label, provider] of [
  ['older invoice', { latest_invoice: { id: 'in_older', status: 'paid' } }],
  ['unpaid invoice', { latest_invoice: { id: 'in_numbers', status: 'open' } }],
  ['pending upgrade', { pending_update: {} }],
  ['foreign tenant', { metadata: { ...metadata, tenant_id: 'tenant_foreign' } }],
  ['foreign feature', { metadata: { ...metadata, feature: 'other' } }],
  ['foreign provider customer', { customer: 'cus_foreign' }],
] as const) {
  test(`modern expanded paid reference preserves ${label} provider guard`, async () => {
    const h = harness({ provider });
    const result = await h.processCallCommandNumberWebhookEvent(h.event('invoice.paid', modern({ id: subscription })));
    assert.equal(result.action, 'callcommand_number_invoice_not_current');
    assert.deepEqual(h.providerIds, [subscription]);
    assert.deepEqual(h.writes(), []);
  });
}

for (const [label, provider] of [
  ['pending upgrade', { pending_update: {} }],
  ['older invoice', { latest_invoice: { id: 'in_older', status: 'open' } }],
  ['already paid invoice', {}],
] as const) {
  test(`modern expanded payment failure preserves ${label} without starting grace`, async () => {
    const h = harness({ provider });
    const result = await h.processCallCommandNumberWebhookEvent(h.event('invoice.payment_failed', modern({ id: subscription })));
    assert.equal(result.action, 'callcommand_number_upgrade_payment_pending');
    assert.deepEqual(h.writes(), []);
  });
}

test('provider failure propagates before settlement and invalid provider quantity is rejected', async () => {
  const h = harness({ providerError: true });
  await assert.rejects(h.processCallCommandNumberWebhookEvent(h.event('invoice.paid', modern({ id: subscription }))), /provider unavailable/);
  assert.deepEqual(h.writes(), []);
  const bad = harness({ provider: { items: { data: [{ price: { id: 'price_local' }, quantity: 1001 }] } } });
  await assert.rejects(bad.processCallCommandNumberWebhookEvent(bad.event('invoice.paid', modern({ id: subscription }))), /whole number between 0 and 1000/);
  assert.deepEqual(bad.writes(), []);
});

test('stale settlement write does not project channel changes', async () => {
  const h = harness({ staleWrite: true });
  assert.equal((await h.processCallCommandNumberWebhookEvent(h.event('invoice.paid', modern({ id: subscription })))).action,
    'callcommand_number_stale_invoice');
  assert.equal(h.writes().length, 1);
});

for (const type of ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted']) {
  test(`${type}: existing lifecycle identity and action are preserved`, async () => {
    const h = harness();
    const result = await h.processCallCommandNumberWebhookEvent(h.event(type, { subscription }, {
      id: type.startsWith('customer.subscription.') ? subscription : 'cs_numbers', status: 'active',
    }));
    assert.equal(result.rowsAffected, 1);
    assert.equal(result.action, type.endsWith('.deleted')
      ? 'callcommand_number_billing_suspended' : 'callcommand_number_billing_state_observed');
    assert.deepEqual(h.providerIds, []);
  });
}
