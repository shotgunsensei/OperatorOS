import test from 'node:test';
import assert from 'node:assert/strict';
import { intent, stackFixture, subscription, tenantId } from './_stack-billing-source.js';
import { failedPaymentFixture } from './_failed-payment-source.js';

function fixture() {
  const row = intent({ status: 'past_due', stripeSubscriptionId: 'sub_bound_fixture' });
  const paymentIntent = { id: 'pi_bound_fixture', object: 'payment_intent', customer: row.stripeCustomerId,
    customer_account: null, livemode: false, metadata: { user_id: 'untrusted_metadata_user' }, status: 'succeeded' };
  const invoice = { id: 'in_bound_fixture', object: 'invoice', customer: row.stripeCustomerId,
    customer_account: null, livemode: false, parent: { type: 'subscription_details', subscription_details: { subscription: row.stripeSubscriptionId } } };
  const reads: string[] = [];
  const readClient = {
    paymentIntents: { async retrieve(id: string) { reads.push(`pi:${id}`); return structuredClone(paymentIntent); } },
    invoicePayments: { async list() { reads.push('invoice_payments'); return { object: 'list', has_more: false,
      data: [{ id: 'inpay_bound_fixture', object: 'invoice_payment', livemode: false, invoice: invoice.id,
        payment: { type: 'payment_intent', payment_intent: paymentIntent.id } }] }; } },
    invoices: { async retrieve(id: string) { reads.push(`invoice:${id}`); return structuredClone(invoice); } },
  };
  // The second argument is ignored by the immutable baseline fixture. Its
  // dispatcher returns unhandled before any new read, reproducing the gap.
  const f = (stackFixture as (initial: any, options?: any) => ReturnType<typeof stackFixture>)(row, { readClient });
  f.setProvider({ ...subscription(row), object: 'subscription', livemode: false, customer_account: null, latest_invoice: invoice.id });
  f.state.entitlements.push({ id: 'existing_core', tenantId, entitlementType: 'core_product', active: true,
    stripeSubscriptionId: row.stripeSubscriptionId });
  const event = { id: 'evt_failed_bound_fixture', type: 'payment_intent.payment_failed', livemode: false,
    data: { object: { ...structuredClone(paymentIntent), status: 'requires_payment_method' } } };
  return { f, row, paymentIntent, invoice, event, reads };
}

test('existing invoice failure control reconciles the bound current subscription', async () => {
  const { f, invoice } = fixture();
  const result = await f.billing.processWebhookEvent({ type: 'invoice.payment_failed', data: { object: invoice } });
  assert.equal(result.handled, true);
  assert.equal(f.state.stacks[0].status, 'active');
  assert.deepEqual(f.propagations, [tenantId]);
});

test('bound failed PaymentIntent correlates current truth and propagates only the owned tenant', async () => {
  const { f, event, reads } = fixture();
  const result = await f.billing.processWebhookEvent(event);
  assert.equal(result.handled, true);
  assert.equal(f.state.stacks[0].status, 'active', 'an older failed attempt must not override current active truth');
  assert.deepEqual(f.propagations, [tenantId], 'never use pi_ID or PI metadata user fallback');
  assert.deepEqual(reads, ['pi:pi_bound_fixture', 'invoice_payments', 'invoice:in_bound_fixture']);
  assert.ok(f.providerCalls.every(value => value.startsWith('retrieve:')), 'no provider mutations');
});

for (const status of ['active', 'trialing', 'past_due', 'canceling']) {
  test(`already activated ${status} Stack preserves existing current-subscription reconciliation`, async () => {
    const g = failedPaymentFixture({ status });
    g.setProvider({ ...g.state.subscription, status: status === 'canceling' ? 'active' : status,
      cancel_at_period_end: status === 'canceling' });
    const result = await g.f.billing.processWebhookEvent(g.event);
    assert.equal(result.handled, true); assert.equal(result.action, 'core_product_stack_updated');
    assert.equal(g.f.state.stacks[0].status, status);
    assert.deepEqual(g.f.propagations, [tenantId]);
    assert.equal(g.f.state.entitlements.length, 1);
  });
}
for (const status of ['checkout_failed', 'canceled', 'expired']) {
  test(`failed attempt cannot revive or grant terminal ${status} Stack`, async () => {
    const g = failedPaymentFixture({ status });
    const before = structuredClone(g.f.state);
    const result = await g.f.billing.processWebhookEvent(g.event);
    assert.equal(result.handled, true); assert.equal(result.action, 'core_product_stack_terminal_payment_failure_observed');
    assert.deepEqual(g.f.state, before); assert.deepEqual(g.f.propagations, []);
    assert.equal(g.f.operations.some(op => op.kind === 'write'), false);
  });
}
for (const [name, changes] of [
  ['unbound', { stripeSubscriptionId: null }], ['initial incomplete', { status: 'incomplete' }],
] as const) {
  test(`${name} Stack has no new-grant fallback`, async () => {
    const g = failedPaymentFixture(changes); const before = structuredClone(g.f.state);
    const result = await g.f.billing.processWebhookEvent(g.event);
    assert.equal(result.handled, false); assert.equal(result.error, 'FAILED_PAYMENT_BOUND_STACK_MISMATCH');
    assert.deepEqual(g.f.state, before); assert.deepEqual(g.f.propagations, []);
  });
}
for (const key of ['tenant_id', 'internal_application_subscription_id', 'checkout_attempt_id']) {
  test(`foreign provider ${key} cannot select another tenant or generation`, async () => {
    const g = failedPaymentFixture();
    g.setProvider({ ...g.state.subscription, metadata: { ...g.state.subscription.metadata, [key]: 'foreign' } });
    const before = structuredClone(g.f.state);
    const result = await g.f.billing.processWebhookEvent(g.event);
    assert.equal(result.handled, false); assert.equal(result.error, 'FAILED_PAYMENT_BOUND_STACK_MISMATCH');
    assert.deepEqual(g.f.state, before); assert.deepEqual(g.f.propagations, []);
    if (key !== 'checkout_attempt_id') {
      assert.ok(g.f.operations.filter(op => op.kind === 'read').every(op => !op.selectedTenants?.length),
        'ID+tenant+subscription+customer predicates must reject before private rows are returned');
    }
  });
}
test('catalog/selection drift does not become a PI acknowledgment or quarantine authority', async () => {
  const g = failedPaymentFixture();
  g.setProvider({ ...g.state.subscription, items: { data: [{ price: { id: 'price_foreign' }, quantity: 1 }] } });
  const before = structuredClone(g.f.state);
  const result = await g.f.billing.processWebhookEvent(g.event);
  assert.equal(result.handled, false); assert.equal(result.error, 'FAILED_PAYMENT_STACK_BINDING_MISMATCH');
  assert.deepEqual(g.f.state, before); assert.deepEqual(g.f.propagations, []);
});

test('nullable actor never falls back to PI user metadata for propagation', async () => {
  const g = failedPaymentFixture({ initiatedByUserId: null });
  g.event.data.object.metadata = { user_id: 'foreign_metadata_actor' };
  g.state.paymentIntent.metadata = { user_id: 'foreign_metadata_actor' };
  g.setProvider({ ...g.state.subscription, metadata: { ...g.state.subscription.metadata, user_id: 'historical_actor' } });
  const result = await g.f.billing.processWebhookEvent(g.event);
  assert.equal(result.handled, true); assert.deepEqual(g.f.propagations, [tenantId]);
  assert.deepEqual(g.f.propagationSubjects, [{ tenantId, actorUserId: null }]);
});

test('local generation changed across provider await cannot commit or propagate', async () => {
  const g = failedPaymentFixture(); let calls = 0;
  g.f.setProviderHook(async () => {
    if (++calls === 2) {
      g.f.state.stacks[0].metadata.checkout_attempt_id = 'replacement';
      g.f.state.stacks[0].stripeCheckoutSessionId = 'cs_replacement';
    }
  });
  await assert.rejects(g.f.billing.processWebhookEvent(g.event), { code: 'STACK_CHECKOUT_IN_PROGRESS' });
  assert.equal(g.f.state.stacks[0].metadata.checkout_attempt_id, 'replacement');
  assert.equal(g.f.operations.some(op => op.kind === 'write'), false);
  assert.deepEqual(g.f.propagations, []);
});

test('transaction write failure rolls back all commercial effects and propagation', async () => {
  const g = failedPaymentFixture({ status: 'past_due' }); const before = structuredClone(g.f.state);
  g.f.failOnTable('stacks');
  await assert.rejects(g.f.billing.processWebhookEvent(g.event), /Synthetic write failure/);
  assert.deepEqual(g.f.state, before); assert.deepEqual(g.f.propagations, []);
  assert.ok(g.f.operations.some(op => op.kind === 'rollback'));
});
