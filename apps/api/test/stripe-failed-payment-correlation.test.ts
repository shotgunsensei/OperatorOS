import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBoundStackFailedPayment } from '../src/lib/stripe-failed-payment-correlation.js';
import { paymentGraph, failedPaymentFixture } from './_failed-payment-source.js';

test('exact modern graph with empty PI metadata resolves without payment-status inference', async () => {
  const g = paymentGraph();
  const result = await resolveBoundStackFailedPayment(g.event, () => g.client, 'test');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.subscriptionId, g.row.stripeSubscriptionId);
  assert.equal(result.tenantId, g.row.tenantId); assert.equal(result.stackId, g.row.id);
  assert.equal(result.checkoutAttemptId, 'attempt_old');
  assert.deepEqual(g.reads.map(read => read.kind), ['pi', 'allocations', 'invoice', 'subscription']);
  assert.deepEqual(g.reads[1].params, { payment: { type: 'payment_intent', payment_intent: g.event.data.object.id }, limit: 100 });
  for (const read of g.reads) {
    assert.deepEqual(read.options, { timeout: 3000, maxNetworkRetries: 0 });
    assert.doesNotMatch(JSON.stringify(read), /stripeAccount|stripeContext|status.*open/);
  }
});

test('expanded identifiers, historical latest invoice and completed pagination preserve exact correlation', async () => {
  const g = paymentGraph();
  g.state.paymentIntent.customer = { id: g.row.stripeCustomerId, object: 'customer' };
  g.state.invoice.customer = { id: g.row.stripeCustomerId };
  g.state.invoice.parent.subscription_details.subscription = { id: g.row.stripeSubscriptionId };
  g.state.subscription.latest_invoice = { id: 'in_newer_paid_fixture', object: 'invoice', status: 'paid' };
  const first = g.state.pages[0].data[0];
  first.invoice = { id: g.state.invoice.id }; first.payment.payment_intent = { id: g.event.data.object.id };
  g.state.pages = [{ object: 'list', has_more: true, data: [first] },
    { object: 'list', has_more: false, data: [{ ...structuredClone(first), id: 'inpay_second_allocation' }] }];
  assert.equal((await resolveBoundStackFailedPayment(g.event, () => g.client, 'test')).ok, true);
  assert.deepEqual(g.reads[2].params, { payment: { type: 'payment_intent', payment_intent: g.event.data.object.id },
    limit: 100, starting_after: 'inpay_bound_fixture' });
});

const invalid: Array<[string, (g: ReturnType<typeof paymentGraph>) => void, string]> = [
  ['wrong event', g => { g.event.type = 'payment_intent.succeeded'; }, 'FAILED_PAYMENT_EVENT_INVALID'],
  ['wrong object', g => { g.event.data.object.object = 'invoice'; }, 'FAILED_PAYMENT_EVENT_INVALID'],
  ['missing PI id', g => { g.event.data.object.id = ''; }, 'FAILED_PAYMENT_EVENT_INVALID'],
  ['empty PI suffix', g => { g.event.data.object.id = 'pi_'; }, 'FAILED_PAYMENT_EVENT_INVALID'],
  ['Connect account', g => { g.event.account = 'acct_foreign'; }, 'FAILED_PAYMENT_CONTEXT_UNSUPPORTED'],
  ['organization context', g => { g.event.context = 'ctx_foreign'; }, 'FAILED_PAYMENT_CONTEXT_UNSUPPORTED'],
  ['event mode', g => { g.event.livemode = true; }, 'FAILED_PAYMENT_EVENT_MODE_MISMATCH'],
  ['event customer account', g => { g.event.data.object.customer_account = 'acct_customer'; }, 'FAILED_PAYMENT_CUSTOMER_OR_MODE_MISMATCH'],
  ['missing signed customer', g => { g.event.data.object.customer = null; }, 'FAILED_PAYMENT_CUSTOMER_OR_MODE_MISMATCH'],
  ['deleted customer', g => { g.event.data.object.customer = { id: g.row.stripeCustomerId, deleted: true }; }, 'FAILED_PAYMENT_CUSTOMER_OR_MODE_MISMATCH'],
  ['wrong expanded customer object', g => { g.event.data.object.customer = { id: g.row.stripeCustomerId, object: 'invoice' }; }, 'FAILED_PAYMENT_CUSTOMER_OR_MODE_MISMATCH'],
  ['retrieved PI id', g => { g.state.paymentIntent.id = 'pi_foreign'; }, 'FAILED_PAYMENT_INTENT_MISMATCH'],
  ['retrieved PI customer', g => { g.state.paymentIntent.customer = 'cus_foreign'; }, 'FAILED_PAYMENT_INTENT_MISMATCH'],
  ['retrieved PI mode', g => { g.state.paymentIntent.livemode = true; }, 'FAILED_PAYMENT_CUSTOMER_OR_MODE_MISMATCH'],
  ['zero allocations', g => { g.state.pages[0].data = []; }, 'FAILED_PAYMENT_INVOICE_AMBIGUOUS'],
  ['multiple invoices', g => { g.state.pages[0].data.push({ ...g.state.pages[0].data[0], id: 'inpay_other', invoice: 'in_other' }); }, 'FAILED_PAYMENT_INVOICE_AMBIGUOUS'],
  ['missing has_more', g => { delete g.state.pages[0].has_more; }, 'FAILED_PAYMENT_PAGE_INVALID'],
  ['empty incomplete page', g => { g.state.pages[0] = { object: 'list', data: [], has_more: true }; }, 'FAILED_PAYMENT_PAGE_INVALID'],
  ['wrong payment discriminator', g => { g.state.pages[0].data[0].payment.type = 'charge'; }, 'FAILED_PAYMENT_ALLOCATION_INVALID'],
  ['wrong allocation PI', g => { g.state.pages[0].data[0].payment.payment_intent = 'pi_foreign'; }, 'FAILED_PAYMENT_ALLOCATION_INVALID'],
  ['wrong expanded allocation object', g => { g.state.pages[0].data[0].payment.payment_intent = { id: g.event.data.object.id, object: 'charge' }; }, 'FAILED_PAYMENT_ALLOCATION_INVALID'],
  ['allocation mode', g => { g.state.pages[0].data[0].livemode = true; }, 'FAILED_PAYMENT_ALLOCATION_INVALID'],
  ['duplicate page identity', g => { g.state.pages = [{ ...g.state.pages[0], has_more: true }, g.state.pages[0]]; }, 'FAILED_PAYMENT_ALLOCATION_INVALID'],
  ['deleted expanded invoice', g => { g.state.pages[0].data[0].invoice = { id: g.state.invoice.id, deleted: true }; }, 'FAILED_PAYMENT_ALLOCATION_INVALID'],
  ['wrong invoice id', g => { g.state.invoice.id = 'in_foreign'; }, 'FAILED_PAYMENT_INVOICE_MISMATCH'],
  ['deleted invoice', g => { g.state.invoice.deleted = true; }, 'FAILED_PAYMENT_INVOICE_MISMATCH'],
  ['invoice customer', g => { g.state.invoice.customer = 'cus_foreign'; }, 'FAILED_PAYMENT_INVOICE_MISMATCH'],
  ['unsupported invoice parent', g => { g.state.invoice.parent.type = 'quote_details'; }, 'FAILED_PAYMENT_INVOICE_MISMATCH'],
  ['conflicting legacy subscription', g => { g.state.invoice.subscription = 'sub_foreign'; }, 'FAILED_PAYMENT_INVOICE_MISMATCH'],
  ['missing invoice subscription', g => { delete g.state.invoice.parent.subscription_details.subscription; }, 'FAILED_PAYMENT_INVOICE_MISMATCH'],
  ['retrieved subscription id', g => { g.state.subscription.id = 'sub_foreign'; }, 'FAILED_PAYMENT_SUBSCRIPTION_MISMATCH'],
  ['retrieved subscription customer', g => { g.state.subscription.customer = 'cus_foreign'; }, 'FAILED_PAYMENT_SUBSCRIPTION_MISMATCH'],
  ['feature subscription', g => { g.state.subscription.metadata.type = 'feature_addon'; }, 'FAILED_PAYMENT_SUBSCRIPTION_MISMATCH'],
  ['legacy subscription', g => { delete g.state.subscription.metadata.billing_model; }, 'FAILED_PAYMENT_SUBSCRIPTION_MISMATCH'],
  ['missing tenant', g => { delete g.state.subscription.metadata.tenant_id; }, 'FAILED_PAYMENT_SUBSCRIPTION_MISMATCH'],
  ['missing generation', g => { delete g.state.subscription.metadata.checkout_attempt_id; }, 'FAILED_PAYMENT_SUBSCRIPTION_MISMATCH'],
  ['signed PI tenant hint conflict', g => { g.event.data.object.metadata.tenant_id = 'foreign'; }, 'FAILED_PAYMENT_METADATA_MISMATCH'],
  ['retrieved PI Stack hint conflict', g => { g.state.paymentIntent.metadata.internal_application_subscription_id = 'foreign'; }, 'FAILED_PAYMENT_METADATA_MISMATCH'],
  ['retrieved PI feature metadata', g => { g.state.paymentIntent.metadata.type = 'feature_addon'; }, 'FAILED_PAYMENT_METADATA_SCOPE_UNSUPPORTED'],
  ['retrieved PI Torque metadata', g => { g.state.paymentIntent.metadata.operatoros_kind = 'torque_assist_credit'; }, 'FAILED_PAYMENT_METADATA_SCOPE_UNSUPPORTED'],
  ['invoice snapshot generation conflict', g => { g.state.invoice.parent.subscription_details.metadata = { checkout_attempt_id: 'old' }; }, 'FAILED_PAYMENT_METADATA_MISMATCH'],
];
for (const [name, change, error] of invalid) test(`unresolved ${name} stays retryable with exact reason`, async () => {
  const g = paymentGraph(); change(g);
  assert.deepEqual(await resolveBoundStackFailedPayment(g.event, () => g.client, 'test'), { ok: false, error });
});

test('page budget cannot silently truncate a longer mapping list', async () => {
  const g = paymentGraph();
  g.state.pages = Array.from({ length: 4 }, (_, index) => ({ object: 'list', has_more: true,
    data: [{ ...structuredClone(g.state.pages[0].data[0]), id: `inpay_page_${index}` }] }));
  assert.deepEqual(await resolveBoundStackFailedPayment(g.event, () => g.client, 'test'), { ok: false, error: 'FAILED_PAYMENT_PAGE_LIMIT' });
  assert.equal(g.reads.filter(read => read.kind === 'allocations').length, 3);
  assert.equal(g.reads.some(read => read.kind === 'invoice'), false);
});

test('overall deadline and provider errors remain bounded sanitized retry failures', async () => {
  const g = paymentGraph(); let clock = 0;
  g.setReadHook(async () => { clock = 10_001; });
  assert.deepEqual(await resolveBoundStackFailedPayment(g.event, () => g.client, 'test', () => clock),
    { ok: false, error: 'FAILED_PAYMENT_CORRELATION_TIMEOUT' });
  assert.equal(g.reads.length, 1);
  g.setReadHook(async () => { throw new Error('synthetic_client_secret_payment_details'); });
  assert.deepEqual(await resolveBoundStackFailedPayment(g.event, () => g.client, 'test'),
    { ok: false, error: 'FAILED_PAYMENT_PROVIDER_UNAVAILABLE' });
});

test('completion deadline bounds a never-settling provider read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = paymentGraph();
  g.setReadHook(async () => new Promise<void>(() => {}));
  const settled: unknown[] = [];
  const pending = resolveBoundStackFailedPayment(g.event, () => g.client, 'test');
  void pending.then(result => settled.push(result));
  t.mock.timers.tick(3_000);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(settled, [{ ok: false, error: 'FAILED_PAYMENT_CORRELATION_TIMEOUT' }]);
  assert.equal(g.reads.length, 1);
});

for (const outcome of ['resolve', 'reject'] as const) {
  test(`completion deadline discards late ${outcome} without downstream reads, writes or propagation`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const g = failedPaymentFixture(); const before = structuredClone(g.f.state);
    let resolve!: () => void; let reject!: (error: Error) => void;
    const late = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    g.setReadHook(async kind => { if (kind === 'pi') await late; });
    const settled: any[] = [];
    const pending = g.f.billing.processWebhookEvent(g.event);
    void pending.then((result: unknown) => settled.push(result));
    t.mock.timers.tick(3_000);
    await new Promise<void>(done => setImmediate(done));
    try {
      assert.equal(settled.length, 1, 'the resolver must finish even if the SDK read does not');
      assert.equal(settled[0].handled, false); assert.equal(settled[0].error, 'FAILED_PAYMENT_CORRELATION_TIMEOUT');
    } finally {
      if (outcome === 'resolve') resolve(); else reject(new Error('synthetic_secret_late_provider_rejection'));
      // A real event-loop turn flushes the observed SDK promise reactions. No
      // arbitrary sleep or suppression of unhandled rejections is used.
      await new Promise<void>(done => setImmediate(done));
    }
    assert.equal(g.reads.length, 1); assert.equal(g.f.operations.length, 0);
    assert.deepEqual(g.f.state, before); assert.deepEqual(g.f.propagations, []);
  });
}

test('completion deadline clamps each read to the remaining total budget', async () => {
  const g = paymentGraph(); let clock = 0;
  g.setReadHook(async () => { clock += 2_700; });
  assert.deepEqual(await resolveBoundStackFailedPayment(g.event, () => g.client, 'test', () => clock),
    { ok: false, error: 'FAILED_PAYMENT_CORRELATION_TIMEOUT' });
  assert.deepEqual(g.reads.at(-1)?.options, { timeout: 1900, maxNetworkRetries: 0 });
});
