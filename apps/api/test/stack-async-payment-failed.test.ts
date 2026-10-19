import assert from 'node:assert/strict';
import test from 'node:test';
import { checkout, deferred, intent, stackFixture, subscription, tenantId } from './_stack-billing-source.js';

const dispatch = (fixture: ReturnType<typeof stackFixture>, object: any, type = 'checkout.session.async_payment_failed') =>
  fixture.billing.processWebhookEvent({ type, data: { object } });
const snapshot = (fixture: ReturnType<typeof stackFixture>) => structuredClone(fixture.state);

for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'canceled', 'incomplete_expired']) {
  test(`owned async failure reconciles latest ${status}, never initially grants`, async () => {
    const row = intent(); const fixture = stackFixture(row); fixture.setProvider(subscription(row, status));
    const result = await dispatch(fixture, checkout(row));
    assert.equal(result.handled, true);
    assert.equal(fixture.state.stacks[0].status, status === 'canceled' ? 'canceled' : status === 'incomplete_expired' ? 'expired' : 'incomplete');
    assert.equal(fixture.state.stacks[0].stripeSubscriptionId, 'sub_old_fixture');
    assert.equal(fixture.state.entitlements.length, 0); assert.equal(fixture.state.tenants[0].seatLimit, 0);
    assert.equal(fixture.state.events.length, 0); assert.equal(fixture.state.activity.length, 0);
    assert.deepEqual(fixture.propagations, ['canceled', 'incomplete_expired'].includes(status) ? [tenantId] : []);
  });
}

for (const status of ['checkout_failed', 'canceled', 'expired']) {
  test(`fully owned terminal ${status} failure is observational across later provider states`, async () => {
    const row = intent({ status, stripeSubscriptionId: 'sub_old_fixture' }); const fixture = stackFixture(row);
    const before = snapshot(fixture);
    for (const providerStatus of ['unpaid', 'active', 'canceled']) {
      fixture.setProvider(subscription(row, providerStatus));
      const result = await dispatch(fixture, checkout(row));
      assert.equal(result.action, 'core_product_stack_terminal_payment_failure_observed');
      assert.equal(result.shouldPropagate, false);
    }
    assert.deepEqual(snapshot(fixture), before); assert.deepEqual(fixture.providerCalls, []);
    assert.equal(fixture.propagations.length, 0);
  });
}

for (const expanded of [false, true]) {
  test(`late async failure preserves actual paid activation and exact tenant propagation (${expanded ? 'expanded' : 'string'} references)`, async () => {
    const row = intent(); const fixture = stackFixture(row);
    await dispatch(fixture, checkout(row, 'paid'), 'checkout.session.async_payment_succeeded');
    const paidGrants = structuredClone(fixture.state.entitlements);
    const paidSeats = fixture.state.tenants[0].seatLimit;
    const event = checkout(row);
    if (expanded) { event.subscription = { id: event.subscription }; event.customer = { id: event.customer }; }
    const result = await dispatch(fixture, event);
    assert.equal(result.action, 'core_product_stack_updated'); assert.equal(fixture.state.stacks[0].status, 'active');
    assert.deepEqual(fixture.state.entitlements, paidGrants); assert.equal(fixture.state.tenants[0].seatLimit, paidSeats);
    assert.deepEqual(fixture.propagations, [tenantId, tenantId]);
  });
}

const invalid: Array<[string, (event: any) => void]> = [
  ['foreign namespace', event => { event.metadata.billing_model = 'foreign'; }],
  ['wrong mode', event => { event.mode = 'payment'; }],
  ['not completed', event => { event.status = 'open'; }],
  ['paid event', event => { event.payment_status = 'paid'; }],
  ['missing Session ID', event => { delete event.id; }],
  ['different Session ID', event => { event.id = 'cs_foreign'; }],
  ['missing subscription', event => { delete event.subscription; }],
  ['customer mismatch', event => { event.customer = 'cus_foreign'; }],
  ['intent mismatch', event => { event.metadata.internal_application_subscription_id = 'foreign'; }],
  ['tenant mismatch', event => { event.metadata.tenant_id = 'foreign'; }],
  ['user mismatch', event => { event.metadata.user_id = 'foreign'; }],
  ['missing attempt', event => { delete event.metadata.checkout_attempt_id; }],
  ['newer attempt', event => { event.metadata.checkout_attempt_id = 'foreign'; }],
  ['core mismatch', event => { event.metadata.selected_core_product = 'tradeflowkit'; }],
  ['companion mismatch', event => { event.metadata.selected_free_companion_module = 'brandforgeos'; }],
  ['modules mismatch', event => { event.metadata.additional_module_keys = 'brandforgeos'; }],
  ['duplicate modules', event => { event.metadata.additional_module_keys = 'brandforgeos,brandforgeos'; }],
  ['included duplicate', event => { event.metadata.additional_module_keys = 'snapproofos'; }],
  ['excluded module', event => { event.metadata.additional_module_keys = 'outcall'; }],
  ['seat mismatch', event => { event.metadata.additional_seats = '1'; }],
  ['malformed seats', event => { event.metadata.additional_seats = '-1'; }],
  ['interval mismatch', event => { event.metadata.billing_interval = 'year'; }],
];
for (const [label, mutate] of invalid) {
  test(`async failure ${label} fails closed before provider or effects`, async () => {
    const row = intent({ status: 'canceled', stripeSubscriptionId: 'sub_old_fixture' });
    const fixture = stackFixture(row); const before = snapshot(fixture); const event = checkout(row); mutate(event);
    const result = await dispatch(fixture, event);
    assert.equal(result.handled, false); assert.equal(fixture.providerCalls.length, 0);
    assert.deepEqual(snapshot(fixture), before); assert.equal(fixture.propagations.length, 0);
    if (label === 'tenant mismatch') {
      const reads = fixture.operations.filter(item => item.kind === 'read' && item.table === 'stacks');
      assert.equal(reads.length, 1, 'no legacy or other-tenant fallback');
      assert.deepEqual(reads[0].selectedTenants, [], 'the initial query must not select the foreign tenant row');
    }
  });
}

test('async failure bound subscription mismatch cannot borrow a different provider subscription', async () => {
  const row = intent({ stripeSubscriptionId: 'sub_owned' }); const fixture = stackFixture(row);
  const result = await dispatch(fixture, { ...checkout(row), subscription: 'sub_foreign' });
  assert.equal(result.handled, false); assert.equal(fixture.providerCalls.length, 0);
});

for (const state of ['missing', 'foreign tenant', 'changed cart', 'new attempt']) {
  test(`expected failure scope rejects ${state} at lifecycle re-selection without legacy fallback`, async () => {
    const row = intent(); const fixture = stackFixture(row);
    const expected = { id: row.id, tenantId: row.tenantId, checkoutAttemptId: row.metadata.checkout_attempt_id,
      snapshot: fixture.fence.captureStackMutationSnapshot(row) };
    if (state === 'missing') fixture.state.stacks.length = 0;
    if (state === 'foreign tenant') fixture.state.stacks[0].tenantId = 'foreign';
    if (state === 'changed cart') fixture.state.stacks[0].additionalSeats = 1;
    if (state === 'new attempt') fixture.state.stacks[0].metadata.checkout_attempt_id = 'new';
    const before = snapshot(fixture);
    const result = await fixture.billing.handleSubscriptionUpdated(subscription(row), expected);
    assert.equal(result.handled, state === 'new attempt'); assert.equal(fixture.providerCalls.length, 0);
    assert.deepEqual(snapshot(fixture), before);
  });
}

for (const at of ['provider', 'catalog']) {
  test(`async failure suspended at ${at} rejects replacement at final locked mutation boundary`, { timeout: 10_000 }, async () => {
    const row = intent(); const fixture = stackFixture(row); fixture.setProvider(subscription(row, 'canceled'));
    const reached = deferred(); const resume = deferred();
    const hook = async () => { reached.resolve(); await resume.promise; };
    if (at === 'provider') fixture.setProviderHook(hook); else fixture.setCatalogHook(hook);
    const pending = dispatch(fixture, checkout(row));
    const rejected = assert.rejects(pending, (error: any) => error.code === 'STACK_CHECKOUT_IN_PROGRESS');
    try {
      await reached.promise;
      fixture.state.stacks[0] = intent({ metadata: { checkout_attempt_id: 'replacement' }, stripeCheckoutSessionId: 'cs_new' });
      const before = snapshot(fixture); resume.resolve(); await rejected;
      assert.deepEqual(snapshot(fixture), before); assert.equal(fixture.propagations.length, 0);
    } finally { resume.resolve(); await rejected; }
  });
}

test('transient provider failure is retryable and never becomes a financial acknowledgment', async () => {
  const row = intent(); const fixture = stackFixture(row); const before = snapshot(fixture);
  fixture.setProviderHook(async () => { throw new Error('Synthetic provider unavailable'); });
  await assert.rejects(dispatch(fixture, checkout(row)), /Synthetic provider unavailable/);
  assert.deepEqual(snapshot(fixture), before); assert.equal(fixture.propagations.length, 0);
});

for (const type of ['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed', 'payment_intent.payment_failed']) {
  test(`${type} still requires its own authoritative policy/correlation; no blanket ack`, async () => {
    const row = intent(); const fixture = stackFixture(row); const before = snapshot(fixture);
    const result = await dispatch(fixture, checkout(row), type);
    assert.equal(result.handled, false); assert.deepEqual(snapshot(fixture), before); assert.equal(fixture.providerCalls.length, 0);
  });
}
