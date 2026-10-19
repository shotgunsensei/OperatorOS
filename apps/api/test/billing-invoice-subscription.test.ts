import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { stripeInvoiceSubscriptionId } from '../src/lib/stripe-invoice-subscription.js';

const subscriptionId = 'sub_invoice_contract';
const modern = (subscription: unknown) => ({
  parent: { type: 'subscription_details', subscription_details: { subscription } },
});
const accepted = [
  ['legacy ID', { subscription: subscriptionId }],
  ['legacy expanded', { subscription: { id: subscriptionId } }],
  ['modern ID', modern(subscriptionId)],
  ['modern expanded', modern({ id: subscriptionId })],
  ['matching dual references', { subscription: { id: subscriptionId }, ...modern(subscriptionId) }],
  ['legacy with null parent', { subscription: subscriptionId, parent: null }],
  ['legacy with unrelated parent', { subscription: subscriptionId,
    parent: { type: 'quote_details', subscription_details: { subscription: 'sub_ignored' } } }],
] as const;
const rejected: ReadonlyArray<readonly [string, unknown]> = [
  ['null invoice', null], ['missing reference', {}], ['empty reference', { subscription: '' }],
  ['invalid legacy reference', { subscription: { id: 123 } }],
  ['missing parent discriminator', { parent: { subscription_details: { subscription: subscriptionId } } }],
  ['unrelated parent discriminator', { parent: { type: 'quote_details', subscription_details: { subscription: subscriptionId } } }],
  ['missing parent details', { parent: { type: 'subscription_details' } }],
  ['null parent details', { parent: { type: 'subscription_details', subscription_details: null } }],
  ['empty modern reference', modern('')], ['invalid modern reference', modern({ id: 123 })],
  ['conflicting ID references', { subscription: 'sub_other', ...modern(subscriptionId) }],
  ['conflicting expanded references', { subscription: { id: 'sub_other' }, ...modern({ id: subscriptionId }) }],
];

for (const [label, invoice] of accepted) {
  test(`invoice reference accepts ${label}`, () => {
    assert.equal(stripeInvoiceSubscriptionId(invoice), subscriptionId);
  });
}
for (const [label, invoice] of rejected) {
  test(`invoice reference rejects ${label}`, () => {
    assert.equal(stripeInvoiceSubscriptionId(invoice), null);
  });
}

// Execute the actual public dispatcher and invoice handler source bodies without
// importing billing-service's DB/environment. Only its external dependencies are
// synthetic; queries, provider retrieval and propagation are recorded separately.
const path = new URL('../src/lib/billing-service.ts', import.meta.url);
const source = readFileSync(path, 'utf8');
const tree = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true);
const names = ['processWebhookEvent', 'handlePaymentFailed', 'handleInvoicePaid', 'retrieveAuthoritativeSubscription'];
const functions = names.map(name => {
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `actual billing function ${name} must exist`);
  return declaration.getText(tree);
});
const compiled = ts.transpileModule(functions.join('\n') + '\nmodule.exports={processWebhookEvent};', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function dispatcher(options: { known?: boolean; shouldPropagate?: boolean; providerId?: string } = {}) {
  const calls = { queryIds: [] as unknown[], providerIds: [] as string[], lifecycle: 0,
    tenantPushes: [] as string[], userPushes: [] as string[] };
  const module = { exports: {} as { processWebhookEvent: (event: unknown) => Promise<any> } };
  const table = { stripeSubscriptionId: 'stripe_subscription_id', tenantId: 'tenant_id', initiatedByUserId: 'initiated_by_user_id' };
  runInNewContext(compiled, {
    module, exports: module.exports,
    console: { log() {}, warn() {} },
    stripeInvoiceSubscriptionId,
    db: { select() { return { from() { return { where(predicate: { value: unknown }) { return {
      async limit() {
        calls.queryIds.push(predicate.value);
        return options.known !== false && predicate.value === subscriptionId
          ? [{ id: 'stack_contract', tenantId: 'tenant_exact', initiatedByUserId: 'user_exact' }] : [];
      },
    }; } }; } }; } },
    tenantApplicationSubscriptions: table,
    eq(_column: unknown, value: unknown) { return { value }; },
    getStripe: () => ({ subscriptions: { async retrieve(id: string) {
      calls.providerIds.push(id);
      return { id: options.providerId ?? id, status: 'active' };
    } } }),
    CommercePolicyError: class extends Error {},
    async handleSubscriptionUpdated() {
      calls.lifecycle++;
      return { handled: true, action: 'authoritative_lifecycle', shouldPropagate: options.shouldPropagate };
    },
    async findGrandfatheredLegacyByStripeSubscriptionId() { return null; },
    require(id: string) {
      assert.equal(id, './entitlement-propagation.js');
      return {
        schedulePropagation: (tenantId: string) => calls.tenantPushes.push(tenantId),
        schedulePropagationForUser: (userId: string) => calls.userPushes.push(userId),
      };
    },
  });
  return { calls, dispatch: module.exports.processWebhookEvent };
}

for (const type of ['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed']) {
  for (const [label, reference] of accepted) {
    test(`${type}: actual dispatcher reconciles ${label} and propagates only the exact bound tenant`, async () => {
      const { calls, dispatch } = dispatcher();
      const result = await dispatch({ type, data: { object: {
        id: 'in_must_not_be_used_as_subscription', customer: 'cus_invoice_contract',
        metadata: { userId: 'untrusted_invoice_hint' }, ...reference,
      } } });
      assert.equal(result.handled, true);
      assert.equal(result.action, 'authoritative_lifecycle');
      assert.deepEqual(calls.queryIds, [subscriptionId, subscriptionId]);
      assert.deepEqual(calls.providerIds, [subscriptionId]);
      assert.equal(calls.lifecycle, 1);
      assert.deepEqual(calls.tenantPushes, ['tenant_exact']);
      assert.deepEqual(calls.userPushes, []);
    });
  }
  for (const [label, reference] of rejected.filter(([, value]) => value !== null)) {
    test(`${type}: actual dispatcher rejects ${label} before DB/provider/propagation`, async () => {
      const { calls, dispatch } = dispatcher();
      const result = await dispatch({ type, data: { object: reference } });
      assert.equal(result.handled, false);
      assert.equal(result.error, 'No subscription on invoice');
      assert.deepEqual(calls.queryIds, []);
      assert.deepEqual(calls.providerIds, []);
      assert.equal(calls.lifecycle, 0);
      assert.deepEqual(calls.tenantPushes, []);
      assert.deepEqual(calls.userPushes, []);
    });
  }
}

test('unknown modern invoice reference cannot trigger provider retrieval or propagation', async () => {
  const { calls, dispatch } = dispatcher({ known: false });
  const result = await dispatch({ type: 'invoice.paid', data: { object: modern(subscriptionId) } });
  assert.equal(result.action, 'unknown_invoice_paid_observed');
  assert.deepEqual(calls.queryIds, [subscriptionId]);
  assert.deepEqual(calls.providerIds, []);
  assert.deepEqual(calls.tenantPushes, []);
});

test('invoice reconciliation preserves the lifecycle handler propagation suppression', async () => {
  const { calls, dispatch } = dispatcher({ shouldPropagate: false });
  const result = await dispatch({ type: 'invoice.payment_failed', data: { object: modern(subscriptionId) } });
  assert.equal(result.handled, true);
  assert.deepEqual(calls.queryIds, [subscriptionId]);
  assert.deepEqual(calls.tenantPushes, []);
});

test('modern invoice cannot substitute a different authoritative provider subscription', async () => {
  const { calls, dispatch } = dispatcher({ providerId: 'sub_foreign' });
  await assert.rejects(dispatch({ type: 'invoice.paid', data: { object: modern(subscriptionId) } }));
  assert.equal(calls.lifecycle, 0);
  assert.deepEqual(calls.tenantPushes, []);
});
