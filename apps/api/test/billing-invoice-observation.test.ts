import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import Fastify, { type RouteHandlerMethod } from 'fastify';
import Stripe from 'stripe';
import ts from 'typescript';
import { resolveBoundStackFailedPayment } from '../src/lib/stripe-failed-payment-correlation.js';

// Exercise the actual registered route body through Fastify with the real SDK
// HMAC verifier, without importing production environment/DB modules. Durable
// claim/settlement dependencies are synthetic; the DB suite covers persistence.
const routes = readFileSync(new URL('../src/routes/billing-routes.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/lib/billing-service.ts', import.meta.url), 'utf8');
const routeTree = ts.createSourceFile('billing-routes.ts', routes, ts.ScriptTarget.Latest, true);
const serviceTree = ts.createSourceFile('billing-service.ts', service, ts.ScriptTarget.Latest, true);
let handlerSource: string | undefined;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'post' && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === '/v1/billing/webhook') {
    handlerSource = node.arguments[node.arguments.length - 1].getText(routeTree);
  }
  ts.forEachChild(node, visit);
}
visit(routeTree);
assert.ok(handlerSource, 'actual billing webhook route must exist');
function sourceFunction(name: string) {
  const node = serviceTree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node, `actual ${name} function must exist`);
  return node.getText(serviceTree);
}
const compiled = ts.transpileModule([
  sourceFunction('classifyWebhookEvent'), sourceFunction('processWebhookEvent'), sourceFunction('billingObservationResult'),
  sourceFunction('stripeResourceId'), sourceFunction('handleStackCheckoutPaymentFailed'),
  sourceFunction('handleBoundStackPaymentIntentFailed'),
  `module.exports={handler:${handlerSource}};`,
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const secret = 'whsec_synthetic_invoice_observation_only';
const metadataCases = [
  ['plain', {}], ['stack', { billing_model: 'core_product_stack' }],
  ['legacy addon', { type: 'addon', user_id: 'synthetic_user', module_slug: 'synthetic_module' }],
  ['managed numbers', { type: 'feature_addon', feature: 'managed_phone_numbers' }],
  ['call lanes', { type: 'feature_addon', feature: 'concurrent_call_lanes' }],
] as const;

type Options = { disabled?: boolean; missingRaw?: boolean; claimState?: 'in_flight' | 'payload_mismatch';
  handlerFailure?: 'return' | 'throw'; markFailure?: boolean; torque?: boolean; torquePending?: boolean };
async function fixture(options: Options = {}) {
  const calls = { verify: 0, claim: 0, processed: 0, failed: 0, providerHttp: 0, torque: 0,
    settlement: [] as string[], failureErrors: [] as string[] };
  const stripe = new Stripe('sk_test_synthetic_invoice_observation_only', {
    maxNetworkRetries: 0,
    httpClient: { getClientName: () => 'blocked-offline',
      makeRequest() { calls.providerHttp++; throw new Error('Provider networking prohibited'); },
      async makeRequestAsync() { calls.providerHttp++; throw new Error('Provider networking prohibited'); },
    } as unknown as Stripe.HttpClient,
  });
  const receipts = new Map<string, { hash: string; processed: boolean; action?: string }>();
  const settlement = (name: string) => async () => {
    calls.settlement.push(name);
    if (options.handlerFailure === 'throw') throw new Error('synthetic settlement failure');
    return { handled: false, error: 'synthetic unsupported or failed settlement' };
  };
  const module = { exports: {} as { handler: RouteHandlerMethod } };
  runInNewContext(compiled, {
    module, exports: module.exports, Buffer,
    resolveBoundStackFailedPayment, STRIPE_MODE: 'test',
    console: { log() {}, warn() {}, error() {} },
    CALLCOMMAND_NUMBER_FEATURE_KEY: 'managed_phone_numbers',
    getPaymentProviderAdapter: () => ({ status: { state: options.disabled ? 'disabled' : 'configured' },
      async verifyWebhook(raw: Buffer, signature: string) {
        calls.verify++;
        assert.ok(Buffer.isBuffer(raw));
        return stripe.webhooks.constructEvent(raw, signature, secret);
      } }),
    async isTorqueTokenStripeEvent() { return options.torque ?? false; },
    async receiveVerifiedTorqueTokenStripeEvent() {
      calls.torque++;
      return { status: options.torquePending ? 'retry' : 'processed', duplicate: false,
        receipt: { id: 'synthetic_receipt', tenant_id: 'synthetic_tenant', safe_payload_json: {} } };
    },
    async recordTorqueStripeEventDispatch() {},
    async claimStripeEvent(event: { id: string }) {
      calls.claim++;
      if (options.claimState) return { isDuplicate: true, duplicateState: options.claimState };
      const hash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
      const old = receipts.get(event.id);
      if (old?.hash !== undefined && old.hash !== hash) return { isDuplicate: true, duplicateState: 'payload_mismatch' };
      if (old?.processed) return { isDuplicate: true, duplicateState: 'processed' };
      receipts.set(event.id, { hash, processed: false });
      return { isDuplicate: false, claimedRowId: event.id };
    },
    async markStripeEventProcessed(id: string, action: string) {
      if (options.markFailure) throw new Error('synthetic receipt persistence failure');
      calls.processed++;
      Object.assign(receipts.get(id)!, { processed: true, action });
    },
    async markStripeEventFailed(_id: string, error: string) { calls.failed++; calls.failureErrors.push(error); },
    handleCheckoutCompleted: settlement('checkout'), handleSubscriptionCreated: settlement('subscription_created'),
    handleSubscriptionUpdated: settlement('subscription_updated'), handleSubscriptionDeleted: settlement('subscription_deleted'),
    handleInvoicePaid: settlement('invoice_paid'), handlePaymentFailed: settlement('invoice_failed'),
    processAddonWebhookEvent: settlement('legacy_addon'), processCallCommandNumberWebhookEvent: settlement('managed_numbers'),
    processCallCommandLaneWebhookEvent: settlement('call_lanes'),
    stripeWebhookFailureDiagnostic: () => ({ synthetic: true }), OperatorOsTokenBillingError: class extends Error {},
  });
  const app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    if (!options.missingRaw) (request as typeof request & { rawBody: Buffer }).rawBody = body as Buffer;
    try { done(null, JSON.parse((body as Buffer).toString('utf8'))); } catch (error) { done(error as Error); }
  });
  app.post('/v1/billing/webhook', module.exports.handler);
  await app.ready();
  return { app, calls, receipts, async send(type: string, metadata: object = {}, opts: {
    missingSignature?: boolean; wrongSecret?: boolean; stale?: boolean; suffix?: string;
  } = {}) {
    const payload = JSON.stringify({ id: `evt_observation_${opts.suffix ?? 'one'}`, type,
      data: { object: { id: 'in_observation_only', status: 'draft', metadata } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload,
      secret: opts.wrongSecret ? 'whsec_wrong_synthetic_only' : secret,
      ...(opts.stale ? { timestamp: Math.floor(Date.now() / 1000) - 301 } : {}),
    });
    return app.inject({ method: 'POST', url: '/v1/billing/webhook',
      headers: { 'content-type': 'application/json', ...(opts.missingSignature ? {} : { 'stripe-signature': signature }) }, payload });
  } };
}

for (const [name, metadata] of metadataCases) {
  test(`verified invoice.created is recorded without ${name} settlement or propagation`, async t => {
    const f = await fixture(); t.after(() => f.app.close());
    const response = await f.send('invoice.created', metadata);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().action, 'invoice_created_observed');
    assert.equal(response.json().shouldPropagate, false);
    assert.equal(f.calls.claim, 1); assert.equal(f.calls.processed, 1); assert.equal(f.calls.failed, 0);
    assert.deepEqual(f.calls.settlement, []); assert.equal(f.calls.providerHttp, 0);
    assert.equal(f.receipts.get('evt_observation_one')?.processed, true);
  });
}
test('verified observation preserves processed duplicate and payload identity rules', async t => {
  const f = await fixture(); t.after(() => f.app.close());
  assert.equal((await f.send('invoice.created')).statusCode, 200);
  const original = structuredClone(f.receipts.get('evt_observation_one'));
  const replay = await f.send('invoice.created');
  assert.equal(replay.statusCode, 200); assert.equal(replay.json().action, 'duplicate_ignored');
  assert.equal(f.calls.processed, 1); assert.deepEqual(f.receipts.get('evt_observation_one'), original);
  const changed = await f.send('invoice.created', { changed: 'synthetic' });
  assert.equal(changed.statusCode, 400); assert.equal(changed.json().code, 'STRIPE_EVENT_ID_PAYLOAD_MISMATCH');
  assert.deepEqual(f.receipts.get('evt_observation_one'), original);
});

for (const [name, options, sendOptions, expected] of [
  ['disabled adapter', { disabled: true }, {}, 503], ['missing raw body', { missingRaw: true }, {}, 400],
  ['missing signature', {}, { missingSignature: true }, 400], ['wrong dedicated signature', {}, { wrongSecret: true }, 400],
  ['stale signed payload', {}, { stale: true }, 400],
] as const) {
  test(`invoice observation still rejects ${name} before claim/settlement`, async t => {
    const f = await fixture(options); t.after(() => f.app.close());
    assert.equal((await f.send('invoice.created', {}, sendOptions)).statusCode, expected);
    assert.equal(f.calls.claim, 0); assert.equal(f.calls.processed, 0); assert.deepEqual(f.calls.settlement, []);
    assert.equal(f.calls.providerHttp, 0);
  });
}
for (const [claimState, status] of [['in_flight', 503], ['payload_mismatch', 400]] as const) {
  test(`invoice observation preserves ${claimState} claim rejection`, async t => {
    const f = await fixture({ claimState }); t.after(() => f.app.close());
    assert.equal((await f.send('invoice.created')).statusCode, status);
    assert.equal(f.calls.processed, 0); assert.deepEqual(f.calls.settlement, []);
  });
}
test('failed observation receipt persistence cannot return a successful acknowledgment', async t => {
  const f = await fixture({ markFailure: true }); t.after(() => f.app.close());
  assert.equal((await f.send('invoice.created')).statusCode, 400);
  assert.equal(f.receipts.get('evt_observation_one')?.processed, false);
});

for (const type of ['charge.dispute.closed', 'charge.dispute.created', 'charge.refunded',
  'checkout.session.async_payment_failed', 'payment_intent.payment_failed']) {
  test(`verified ${type} without Torque authority remains retryable`, async t => {
    const f = await fixture(); t.after(() => f.app.close());
    const response = await f.send(type);
    assert.equal(response.statusCode, 503); assert.equal(response.json().code, 'WEBHOOK_PROCESSING_RETRY_REQUIRED');
    assert.equal(f.calls.failed, 1); assert.equal(f.calls.processed, 0);
    if (type === 'checkout.session.async_payment_failed') {
      // Prove the real invalid-Stack boundary, not a caught missing VM binding.
      assert.deepEqual(f.calls.failureErrors, ['Invalid Application Stack asynchronous payment failure']);
    }
    if (type === 'payment_intent.payment_failed') {
      assert.deepEqual(f.calls.failureErrors, ['FAILED_PAYMENT_EVENT_INVALID']);
    }
  });
}
for (const type of ['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed']) {
  for (const handlerFailure of ['return', 'throw'] as const) {
    test(`${type} ${handlerFailure} failure cannot become an observational acknowledgment`, async t => {
      const f = await fixture({ handlerFailure }); t.after(() => f.app.close());
      const response = await f.send(type);
      assert.equal(response.statusCode, 503); assert.equal(f.calls.failed, 1); assert.equal(f.calls.processed, 0);
      assert.equal(f.calls.settlement.length, 1);
    });
  }
}
for (const [name, metadata] of metadataCases.slice(2)) {
  for (const handlerFailure of ['return', 'throw'] as const) {
    test(`${name} paid-handler ${handlerFailure} failure remains retryable`, async t => {
      const f = await fixture({ handlerFailure }); t.after(() => f.app.close());
      const response = await f.send('invoice.paid', metadata);
      assert.equal(response.statusCode, 503); assert.equal(f.calls.failed, 1); assert.equal(f.calls.processed, 0);
      assert.equal(f.calls.settlement.length, 1);
    });
  }
}
for (const torquePending of [false, true]) {
  test(`recognized Torque settlement ${torquePending ? 'retry' : 'processed'} retains its separate receipt`, async t => {
    const f = await fixture({ torque: true, torquePending }); t.after(() => f.app.close());
    const response = await f.send('charge.refunded', { operatoros_kind: 'torque_assist_credit' });
    assert.equal(response.statusCode, torquePending ? 202 : 200);
    assert.equal(f.calls.torque, 1); assert.equal(f.calls.claim, 0); assert.equal(f.calls.processed, 0);
  });
}
