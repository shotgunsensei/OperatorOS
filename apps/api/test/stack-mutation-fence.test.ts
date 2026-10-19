import assert from 'node:assert/strict';
import test from 'node:test';
import { checkout, deferred, intent, stackFixture, subscription, tenantId, userId } from './_stack-billing-source.js';

const dispatch = (fixture: ReturnType<typeof stackFixture>, type: string, object: any) =>
  fixture.billing.processWebhookEvent({ type, data: { object } });
const conflict = (error: any) => error?.code === 'STACK_CHECKOUT_IN_PROGRESS';
function projection(fixture: ReturnType<typeof stackFixture>) { return structuredClone(fixture.state); }
function assertLockOrder(fixture: ReturnType<typeof stackFixture>) {
  for (const operation of fixture.operations.filter(item => item.kind === 'write')) {
    assert.ok(operation.tx, `Stack effects require one transaction: ${operation.table}`);
    const preceding = fixture.operations.slice(0, fixture.operations.indexOf(operation));
    assert.ok(preceding.some(item => item.tx === operation.tx && item.kind === 'lock' && item.table === 'stacks'));
  }
}

for (const at of ['provider', 'catalog'] as const) {
 for (const activate of [false, true]) {
  test(`old reconciliation paused at ${at} cannot overwrite actual deleted→owner retry→new ${activate ? 'paid' : 'pending'} Stack`, { timeout: 10_000 }, async () => {
    const row = intent(); const fixture = stackFixture(row);
    const reached = deferred(); const resume = deferred(); let calls = 0;
    const hook = async () => { if (++calls === 1) { reached.resolve(); await resume.promise; } };
    fixture.setProvider(subscription(row, 'canceled'));
    if (at === 'provider') fixture.setProviderHook(hook); else fixture.setCatalogHook(hook);
    const old = dispatch(fixture, 'customer.subscription.updated', subscription(row, 'canceled'));
    const rejected = assert.rejects(old, conflict);
    try {
      await reached.promise;
      const beforeRetry = projection(fixture);
      await assert.rejects(fixture.billing.createStackCheckoutSession({ tenantId, userId, coreProduct: 'techdeck', freeCompanionModule: 'snapproofos' }),
        (error: any) => error.code === 'STACK_FLAGSHIP_LIMIT');
      assert.deepEqual(projection(fixture), beforeRetry, 'complete/unpaid Session does not authorize replacement');
      await dispatch(fixture, 'customer.subscription.deleted', subscription(row, 'canceled'));
      assert.equal(fixture.state.stacks[0].status, 'canceled');
      await fixture.billing.createStackCheckoutSession({ tenantId, userId, coreProduct: 'techdeck', freeCompanionModule: 'snapproofos' });
      const next = structuredClone(fixture.state.stacks[0]);
      assert.equal(next.id, row.id); assert.notEqual(next.metadata.checkout_attempt_id, row.metadata.checkout_attempt_id);
      assert.equal(next.stripeCheckoutSessionId, 'cs_new_fixture');
      const paid = { ...subscription(next), id: 'sub_new_fixture' };
      if (activate) {
        fixture.setProvider(paid);
        const activated = await dispatch(fixture, 'checkout.session.async_payment_succeeded', { ...checkout(next, 'paid'), subscription: paid.id });
        assert.equal(activated.action, 'core_product_stack_activated');
      }
      const current = projection(fixture); const pushes = fixture.propagations.length;
      resume.resolve(); await rejected;
      assert.deepEqual(projection(fixture), current, 'stale continuation preserves row, grants, seats and audit/event state');
      assert.equal(fixture.propagations.length, pushes, 'stale failure does not propagate');
      assert.equal(fixture.state.stacks[0].stripeSubscriptionId, activate ? paid.id : null);
      assert.equal(fixture.state.entitlements.some(item => item.entitlementType === 'core_product' && item.active), activate);
      assertLockOrder(fixture);
    } finally { resume.resolve(); await rejected; }
  });
 }
}

for (const winner of ['terminal', 'paid'] as const) {
  test(`${winner} operation holds Stack lock first; competing same-generation continuation has no partial effects`, { timeout: 10_000 }, async () => {
    const row = intent(); const fixture = stackFixture(row);
    const reached = deferred(); const resume = deferred(); let held = false;
    fixture.setBeforeWrite(async name => {
      if (!held && name === (winner === 'paid' ? 'entitlements' : 'stacks')) { held = true; reached.resolve(); await resume.promise; }
    });
    fixture.setProvider(subscription(row, winner === 'paid' ? 'active' : 'canceled'));
    const first = winner === 'paid'
      ? dispatch(fixture, 'checkout.session.async_payment_succeeded', checkout(row, 'paid'))
      : dispatch(fixture, 'customer.subscription.updated', subscription(row, 'canceled'));
    try {
      await reached.promise;
      fixture.setProvider(subscription(row, winner === 'paid' ? 'canceled' : 'active'));
      const second = winner === 'paid'
        ? dispatch(fixture, 'customer.subscription.updated', subscription(row, 'canceled'))
        : dispatch(fixture, 'checkout.session.async_payment_succeeded', checkout(row, 'paid'));
      const rejected = assert.rejects(second, conflict);
      // Let the competitor capture its original snapshot before the first commit.
      await new Promise<void>(resolve => setImmediate(resolve));
      resume.resolve(); await first; await rejected;
      assert.equal(fixture.state.stacks[0].status, winner === 'paid' ? 'active' : 'canceled');
      assert.equal(fixture.state.entitlements.some(item => item.entitlementType === 'core_product' && item.active), winner === 'paid');
      assertLockOrder(fixture);
    } finally { resume.resolve(); await first; }
  });
}

for (const boundary of ['provider', 'catalog'] as const) {
  for (const operation of ['active recovery', 'quarantine', 'companion', 'reactivate', 'cancel'] as const) {
    if (operation === 'cancel' && boundary === 'catalog') continue;
    test(`${operation}: ${boundary} await rejects changed generation before all related effects`, { timeout: 10_000 }, async () => {
      const row = intent({ status: operation === 'reactivate' ? 'canceling' : 'active', stripeSubscriptionId: 'sub_old_fixture' });
      const fixture = stackFixture(row); const reached = deferred(); const resume = deferred(); let count = 0;
      const hook = async () => { if (++count === 1) { reached.resolve(); await resume.promise; } };
      if (boundary === 'provider') fixture.setProviderHook(hook); else fixture.setCatalogHook(hook);
      const provider = subscription(row);
      if (operation === 'quarantine') provider.items.data[0].price.id = 'price_foreign';
      fixture.setProvider(provider);
      const pending = operation === 'cancel' ? fixture.billing.cancelSubscription(userId, tenantId)
        : operation === 'reactivate' ? fixture.billing.reactivateSubscription(userId, tenantId)
        : operation === 'companion' ? fixture.billing.changeStackFreeCompanion(tenantId, 'brandforgeos')
        : dispatch(fixture, 'customer.subscription.updated', provider);
      const rejected = assert.rejects(pending, conflict);
      try {
        await reached.promise;
        fixture.state.stacks[0] = intent({ stripeCheckoutSessionId: 'cs_replacement', metadata: { checkout_attempt_id: 'replacement' } });
        const current = projection(fixture);
        resume.resolve(); await rejected;
        assert.deepEqual(projection(fixture), current); assert.equal(fixture.propagations.length, 0);
      } finally { resume.resolve(); await rejected; }
    });
  }
}

test('checkout provider response cannot attach an old Session to a newer attempt', { timeout: 10_000 }, async () => {
  const row = intent({ status: 'canceled', stripeSubscriptionId: 'sub_old_fixture' });
  const fixture = stackFixture(row); fixture.setProvider(subscription(row, 'canceled'));
  const reached = deferred(); const resume = deferred();
  fixture.setCreateHook(async () => { reached.resolve(); await resume.promise; });
  const pending = fixture.billing.createStackCheckoutSession({ tenantId, userId, coreProduct: 'techdeck', freeCompanionModule: 'snapproofos' });
  const rejected = assert.rejects(pending, conflict);
  try {
    await reached.promise;
    fixture.state.stacks[0] = intent({ stripeCheckoutSessionId: 'cs_replacement', metadata: { checkout_attempt_id: 'replacement' } });
    const current = projection(fixture);
    resume.resolve(); await rejected; assert.deepEqual(projection(fixture), current);
  } finally { resume.resolve(); await rejected; }
});

for (const failTable of ['entitlements', 'tenants', 'stacks', 'events', 'activity']) {
  test(`paid activation failure at ${failTable} rolls row/grants/seats/events/audit back together`, async () => {
    const row = intent(); const fixture = stackFixture(row); const before = projection(fixture);
    fixture.failOnTable(failTable);
    await assert.rejects(dispatch(fixture, 'checkout.session.async_payment_succeeded', checkout(row, 'paid')), /Synthetic write failure/);
    assert.deepEqual(projection(fixture), before); assert.equal(fixture.propagations.length, 0);
    assert.equal(fixture.operations.filter(item => item.kind === 'begin').length, 1);
    assert.equal(fixture.operations.filter(item => item.kind === 'rollback').length, 1);
    assertLockOrder(fixture);
  });
}

test('default grant/change/deactivate each own one Stack-first transaction; supplied paths do not nest', async () => {
  const row = intent({ status: 'active', stripeSubscriptionId: 'sub_old_fixture' }); const fixture = stackFixture(row);
  await fixture.product.grantStackEntitlements({ tenantId, stripeSubscriptionId: row.stripeSubscriptionId,
    coreProduct: row.coreProduct, freeCompanionModule: row.includedCompanionKey });
  await fixture.product.changeFreeCompanionModule(tenantId, 'brandforgeos');
  await fixture.product.deactivateSubscriptionEntitlements(row.stripeSubscriptionId);
  assert.equal(fixture.operations.filter(item => item.kind === 'begin').length, 3);
  assert.equal(fixture.state.tenants[0].seatLimit, 0); assertLockOrder(fixture);
});

test('manual/default grant without a Stack retains historical direct-helper behavior', async () => {
  const fixture = stackFixture(null);
  await fixture.product.grantStackEntitlements({ tenantId, stripeSubscriptionId: 'sub_manual', coreProduct: 'techdeck', freeCompanionModule: 'snapproofos' });
  assert.ok(fixture.state.entitlements.some(item => item.active && item.entitlementType === 'core_product'));
  assert.equal(fixture.state.stacks.length, 0);
  await fixture.product.deactivateSubscriptionEntitlements('sub_manual');
  assert.equal(fixture.state.entitlements.some(item => item.active), false);
  assert.equal(fixture.state.tenants[0].seatLimit, 0);
});

test('deletion rechecks the selected snapshot after waiting for its Stack lock', async () => {
  const row = intent({ status: 'active', stripeSubscriptionId: 'sub_old_fixture' }); const fixture = stackFixture(row);
  fixture.setBeforeLock(async () => { fixture.state.stacks[0] = intent({ metadata: { checkout_attempt_id: 'replacement' } }); });
  await assert.rejects(dispatch(fixture, 'customer.subscription.deleted', subscription(row, 'canceled')), conflict);
  assert.equal(fixture.operations.some(item => item.kind === 'write'), false);
  assert.equal(fixture.propagations.length, 0);
});

test('expired Session reconciliation cannot fail a replacement checkout while awaiting the old Session', { timeout: 10_000 }, async () => {
  const row = intent(); const fixture = stackFixture(row); fixture.setSessionStatus('expired');
  const reached = deferred(); const resume = deferred();
  fixture.setSessionHook(async () => { reached.resolve(); await resume.promise; });
  const pending = fixture.billing.createStackCheckoutSession({ tenantId, userId, coreProduct: 'techdeck', freeCompanionModule: 'snapproofos' });
  const rejected = assert.rejects(pending, conflict);
  try {
    await reached.promise;
    fixture.state.stacks[0] = intent({ metadata: { checkout_attempt_id: 'replacement' }, stripeCheckoutSessionId: 'cs_new' });
    const before = projection(fixture); resume.resolve(); await rejected;
    assert.deepEqual(projection(fixture), before); assert.equal(fixture.operations.some(item => item.kind === 'write'), false);
  } finally { resume.resolve(); await rejected; }
});

for (const type of ['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed']) {
 for (const activate of [false, true]) {
  test(`${type} outer provider await cannot mutate replacement ${activate ? 'paid' : 'pending'} generation`, { timeout: 10_000 }, async () => {
    const row = intent({ stripeSubscriptionId: 'sub_old_fixture' }); const fixture = stackFixture(row);
    const reached = deferred(); const resume = deferred(); let calls = 0;
    fixture.setProvider(subscription(row, 'canceled'));
    fixture.setProviderHook(async () => { if (++calls === 1) { reached.resolve(); await resume.promise; } });
    const old = dispatch(fixture, type, { id: 'in_synthetic', parent: { type: 'subscription_details',
      subscription_details: { subscription: { id: row.stripeSubscriptionId } } } });
    try {
      await reached.promise;
      await dispatch(fixture, 'customer.subscription.deleted', subscription(row, 'canceled'));
      await fixture.billing.createStackCheckoutSession({ tenantId, userId, coreProduct: 'techdeck', freeCompanionModule: 'snapproofos' });
      if (activate) {
        const next = structuredClone(fixture.state.stacks[0]); const paid = { ...subscription(next), id: 'sub_new_fixture' };
        fixture.setProvider(paid);
        await dispatch(fixture, 'checkout.session.async_payment_succeeded', { ...checkout(next, 'paid'), subscription: paid.id });
      }
      const before = projection(fixture); const pushes = fixture.propagations.length; resume.resolve();
      const result = await old;
      assert.equal(result.handled, true); assert.equal(result.shouldPropagate, false);
      assert.deepEqual(projection(fixture), before); assert.equal(fixture.propagations.length, pushes);
    } finally { resume.resolve(); await old; }
  });
 }
}

test('snapshot copies metadata/arrays/dates and rejects in-place mutation before acquiring authority', async () => {
  const row = intent(); const fixture = stackFixture(row); const selected = structuredClone(fixture.state.stacks[0]);
  const snapshot = fixture.fence.captureStackMutationSnapshot(selected);
  selected.metadata.checkout_attempt_id = 'mutated'; selected.additionalModuleKeys.push('brandforgeos');
  fixture.state.stacks[0].metadata.checkout_attempt_id = 'mutated';
  let effects = 0;
  await assert.rejects(fixture.fence.withStackMutation(snapshot, async () => { effects++; }), /changed while its provider/);
  assert.equal(effects, 0);
});

test('supplied lifecycle deactivation cannot discover or lock a foreign tenant from a duplicate subscription grant', async () => {
  const row = intent({ status: 'active', stripeSubscriptionId: 'sub_shared_fixture' }); const fixture = stackFixture(row);
  fixture.state.entitlements.push({ id: 'foreign_core', tenantId: 'foreign_tenant', stripeSubscriptionId: row.stripeSubscriptionId,
    entitlementType: 'core_product', active: true, metadata: {} });
  fixture.state.tenants.push({ id: 'foreign_tenant', seatLimit: 99, metadata: {} });
  const foreign = structuredClone(fixture.state.entitlements[0]);
  await dispatch(fixture, 'customer.subscription.deleted', subscription(row, 'canceled'));
  assert.deepEqual(fixture.state.entitlements, [foreign]); assert.equal(fixture.state.tenants[1].seatLimit, 99);
  assert.equal(fixture.state.stacks[0].status, 'canceled');
  assert.equal(fixture.operations.filter(item => item.kind === 'lock').length, 1, 'only the trusted outer Stack was locked');
  await assert.rejects(fixture.db.transaction((tx: any) => fixture.product.deactivateSubscriptionEntitlements(row.stripeSubscriptionId, { executor: tx })), /requires its trusted tenant/);
  assert.deepEqual(fixture.state.entitlements, [foreign]);
});
