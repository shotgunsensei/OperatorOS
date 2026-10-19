import assert from 'node:assert/strict';
import test from 'node:test';
import { checkout, intent, stackFixture, subscription } from './_stack-billing-source.js';

const callers = ['customer.subscription.updated', 'invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed'];
function send(fixture: ReturnType<typeof stackFixture>, type: string, provider: any) {
  fixture.setProvider(provider);
  const object = type.startsWith('invoice.')
    ? { id: 'in_terminal_fixture', parent: { type: 'subscription_details', subscription_details: { subscription: { id: provider.id } } } }
    : provider;
  return fixture.billing.processWebhookEvent({ type, data: { object } });
}

for (const type of callers) {
  test(`${type}: actual pending catalog quarantine cannot become recovery-eligible through unpaid→active`, async () => {
    const row = intent(); const fixture = stackFixture(row); const states: string[] = [];
    fixture.setCorePrice('price_changed_fixture');
    const quarantined = await send(fixture, 'customer.subscription.updated', subscription(row, 'active'));
    assert.equal(quarantined.action, 'core_product_stack_provider_drift_deactivated');
    const failed = fixture.state.stacks[0];
    assert.equal(failed.status, 'checkout_failed'); assert.equal(failed.stripeSubscriptionId, 'sub_old_fixture');
    assert.match(failed.metadata.providerValidationReason, /STACK_PRICE_CONFIGURATION_CHANGED/);
    assert.equal(fixture.state.entitlements.length, 0);
    assert.equal(fixture.providerCalls.some(call => call.startsWith('update:')), false, 'quarantine never canceled the provider subscription');
    states.push(failed.status);

    // Mutate only the fixture's synthetic env. The actual configured-price and
    // selection helper constructs the mismatch and its later correction.
    fixture.setCorePrice('price_core_fixture');
    for (const status of ['unpaid', 'active']) {
      await send(fixture, type, subscription(row, status));
      states.push(fixture.state.stacks[0].status);
    }
    assert.deepEqual({ states, activeCore: fixture.state.entitlements.some(item => item.active && item.entitlementType === 'core_product'),
      seatLimit: fixture.state.tenants[0].seatLimit },
    { states: ['checkout_failed', 'checkout_failed', 'checkout_failed'], activeCore: false, seatLimit: 0 });
  });
}

for (const status of ['checkout_failed', 'canceled', 'expired']) {
  for (const providerStatus of ['unpaid', 'incomplete', 'unknown_future_status', 'active', 'trialing', 'past_due']) {
    test(`terminal ${status} retains eligibility under provider ${providerStatus}`, async () => {
      const row = intent({ status, stripeSubscriptionId: 'sub_old_fixture' }); const fixture = stackFixture(row);
      const result = await send(fixture, 'customer.subscription.updated', subscription(row, providerStatus));
      assert.equal(result.action, 'core_product_stack_terminal_update_ignored');
      assert.equal(fixture.state.stacks[0].status, status); assert.equal(fixture.state.entitlements.length, 0);
      assert.equal(fixture.state.tenants[0].seatLimit, 0);
    });
  }
}

for (const providerStatus of ['canceled', 'incomplete_expired', 'paused']) {
  test(`existing mapped terminal provider reporting ${providerStatus} remains available`, async () => {
    const row = intent({ status: 'checkout_failed', stripeSubscriptionId: 'sub_old_fixture' }); const fixture = stackFixture(row);
    const result = await send(fixture, 'customer.subscription.updated', subscription(row, providerStatus));
    assert.equal(result.action, 'core_product_stack_updated');
    assert.equal(fixture.state.stacks[0].status, providerStatus === 'incomplete_expired' ? 'expired' : 'canceled');
    assert.equal(fixture.state.entitlements.length, 0);
  });
}

for (const initialStatus of ['active', 'trialing', 'past_due', 'canceling']) {
  test(`previously paid ${initialStatus} still recovers actual catalog quarantine under corrected provider`, async () => {
    const row = intent(); const fixture = stackFixture(row);
    const paid = await fixture.billing.processWebhookEvent({ type: 'checkout.session.async_payment_succeeded', data: { object: checkout(row, 'paid') } });
    assert.equal(paid.action, 'core_product_stack_activated');
    fixture.state.stacks[0].status = initialStatus;
    fixture.setCorePrice('price_changed_fixture');
    const quarantined = await send(fixture, 'customer.subscription.updated', subscription(row, 'unpaid'));
    assert.equal(quarantined.action, 'core_product_stack_provider_drift_deactivated');
    assert.equal(fixture.state.stacks[0].status, 'past_due');
    assert.equal(fixture.state.entitlements.some(item => item.active), false);
    fixture.setCorePrice('price_core_fixture');
    await send(fixture, 'invoice.payment_failed', subscription(row, 'unpaid'));
    const recovered = await send(fixture, 'invoice.paid', subscription(row, 'active'));
    assert.equal(recovered.action, 'core_product_stack_updated'); assert.equal(fixture.state.stacks[0].status, 'active');
    assert.equal(fixture.state.entitlements.filter(item => item.active && item.entitlementType === 'core_product').length, 1);
    assert.ok(fixture.state.tenants[0].seatLimit > 0);
  });
}
