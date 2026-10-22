import './_billing-webhook-env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import Fastify, { type RouteHandlerMethod } from 'fastify';
import Stripe from 'stripe';
import ts from 'typescript';
import { OFFICEEXIT_CAPABILITIES, OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION } from '@operatoros/sdk';
import { createToolPurchaseProvider, ToolPurchaseProviderError,
  type ToolPurchaseProviderStore, type ToolPurchaseStripeClient } from '../src/lib/tool-purchase-provider.js';
import type { ToolPurchase, VerifiedToolPaymentEvent } from '../src/lib/tool-purchase-store.js';

const purchaseId = 'b7d94328-70f2-46d5-ae4b-2da463fd2472';
const now = Date.parse('2026-10-21T17:00:00Z');
function order(): ToolPurchase {
  return { id: purchaseId, tenantId: 'tenant_fixture', userId: 'user_fixture', toolSlug: 'officeexit',
    requestKey: 'request_fixture', snapshot: { offerVersion: 'fixture-reviewed-v1', providerPriceId: 'price_fixture',
      providerProductId: 'prod_fixture', amountMinor: 9900, currency: 'usd', licenseTermsVersion: OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION,
      licenseUnit: 'tenant', licenseAllowance: 1, coverage: 'entire_tenant',
      officeexitGrant: { edition: 'MSP Pro', coverage: 'entire_tenant', capabilities: [...OFFICEEXIT_CAPABILITIES] } },
    providerMode: 'test', providerAccountId: 'acct_fixture', status: 'pending', revision: 0,
    customerId: 'cus_fixture', checkoutSessionId: 'cs_fixture', paymentIntentId: 'pi_fixture', chargeId: 'ch_fixture',
    policyReviewRequired: false, createdAt: new Date(now - 1000).toISOString(), updatedAt: new Date(now).toISOString() };
}
function fixture() {
  let purchase = order();
  const calls: Array<{ name: string; input?: any; options?: any }> = [];
  const applied: VerifiedToolPaymentEvent[] = [];
  const meta = () => ({ operatoros_kind: 'tool_purchase', contract_version: '1', purchase_id: purchase.id,
    tenant_id: purchase.tenantId, user_id: purchase.userId, tool_slug: purchase.toolSlug,
    offer_version: purchase.snapshot.offerVersion, provider_price_id: purchase.snapshot.providerPriceId,
    provider_product_id: purchase.snapshot.providerProductId, provider_account_id: purchase.providerAccountId,
    provider_mode: purchase.providerMode, license_terms_version: purchase.snapshot.licenseTermsVersion });
  const price: any = { id: 'price_fixture', product: 'prod_fixture', type: 'one_time', recurring: null,
    unit_amount: 9900, currency: 'usd', active: true, livemode: false };
  const product: any = { id: 'prod_fixture', active: true, livemode: false };
  const session: any = { id: 'cs_fixture', customer: 'cus_fixture', mode: 'payment', subscription: null, livemode: false,
    amount_total: 9900, amount_subtotal: 9900, currency: 'usd', metadata: meta(), payment_intent: 'pi_fixture',
    status: 'complete', payment_status: 'paid', url: 'https://checkout.stripe.com/c/pay/cs_fixture',
    line_items: { has_more: false, data: [{ quantity: 1, price: structuredClone(price) }] } };
  const charge: any = { id: 'ch_fixture', payment_intent: 'pi_fixture', customer: 'cus_fixture', amount: 9900,
    currency: 'usd', livemode: false, paid: true, amount_refunded: 0, disputed: false };
  const intent: any = { id: 'pi_fixture', customer: 'cus_fixture', amount: 9900, amount_received: 9900,
    currency: 'usd', livemode: false, status: 'succeeded', metadata: meta(), latest_charge: charge };
  let failCreate = false, failApply = false, runtime: 'test' | 'live' | 'disabled' = 'test';
  const receipts = new Map<string, string>();
  function record(name: string, input?: unknown, options?: unknown) { calls.push({ name, input, options }); }
  const store: ToolPurchaseProviderStore = {
    async getTenantToolPurchase(tenant, id) { record('scoped_lookup'); return tenant === purchase.tenantId && id === purchase.id ? structuredClone(purchase) : null; },
    async getToolPurchaseById(id) { record('order_lookup'); return id === purchase.id ? structuredClone(purchase) : null; },
    async findToolPurchaseByProviderBinding(input) {
      record('binding_lookup', input);
      const matches = input.providerMode === purchase.providerMode
        && (!input.providerAccountId || input.providerAccountId === purchase.providerAccountId)
        && (!input.checkoutSessionId || input.checkoutSessionId === purchase.checkoutSessionId)
        && (!input.paymentIntentId || input.paymentIntentId === purchase.paymentIntentId)
        && (!input.chargeId || input.chargeId === purchase.chargeId);
      return matches ? structuredClone(purchase) : null;
    },
    async attachToolCheckout(input) { record('attach', input); purchase = { ...purchase, ...input, id: input.purchaseId }; return structuredClone(purchase); },
    async applyVerifiedToolPaymentEvent(input) {
      record('apply', input);
      if (failApply) throw new Error('PRIVATE_STORE_FAILURE');
      const hash = receipts.get(input.eventId);
      if (hash && hash !== input.payloadSha256) throw new Error('fixture receipt conflict');
      const duplicate = Boolean(hash); receipts.set(input.eventId, input.payloadSha256);
      applied.push(input);
      return { purchase: structuredClone(purchase), duplicate, ignored: false };
    },
  };
  const client: ToolPurchaseStripeClient = {
    accounts: { async retrieve() { record('account'); return { id: 'acct_fixture' }; } },
    prices: { async retrieve(id) { record('price', id); return structuredClone(price); } },
    products: { async retrieve(id) { record('product', id); return structuredClone(product); } },
    customers: { async create(input, options) { record('customer_create', input, options); return { id: 'cus_fixture' }; } },
    checkout: { sessions: {
      async create(input, options) { record('session_create', input, options); if (failCreate) { failCreate = false; throw new Error('synthetic lost response'); } return structuredClone(session); },
      async retrieve(id, input) { record('session_read', id, input); return structuredClone(session); },
    } },
    paymentIntents: { async retrieve(id, input) { record('pi_read', id, input); return structuredClone(intent); } },
    charges: { async retrieve(id) { record('charge_read', id); return structuredClone(charge); } },
  };
  const provider = createToolPurchaseProvider({ store, client() { record('client'); return client; }, runtimeMode: () => runtime,
    assertWebhookReady() { record('webhook_ready'); }, now: () => now });
  function event(type = 'checkout.session.completed', direct = true): any {
    const resource = type.startsWith('checkout.session.') ? structuredClone(session)
      : type.startsWith('payment_intent.') ? structuredClone(intent)
      : type === 'charge.refunded' ? structuredClone(charge) : { id: 'dp_fixture', charge: 'ch_fixture' };
    resource.metadata = direct ? meta() : {};
    return { id: 'evt_fixture', type, livemode: false, data: { object: resource } };
  }
  async function receive(value = event(), rawBody = JSON.stringify(value)) { return provider.receiveVerifiedEvent({ event: value, rawBody }); }
  return { provider, store, calls, applied, price, product, session, charge, intent, event, receive,
    get purchase() { return purchase; }, set purchase(value: ToolPurchase) { purchase = value; },
    set runtime(value: typeof runtime) { runtime = value; },
    set failCreate(value: boolean) { failCreate = value; }, set failApply(value: boolean) { failApply = value; },
    pending() { purchase.checkoutSessionId = purchase.customerId = purchase.paymentIntentId = purchase.chargeId = null; session.status = 'open'; session.payment_status = 'unpaid'; },
  };
}
const rejected = (operation: Promise<unknown>, code?: string) => assert.rejects(operation,
  (error: unknown) => error instanceof ToolPurchaseProviderError && (!code || error.code === code));
const checkoutInput = { tenantId: 'tenant_fixture', purchaseId, returnOrigin: 'https://app.operatoros.net' };

test('independent one-time checkout uses approved entire-tenant terms and immutable idempotency without Stack input', async () => {
  const f = fixture(); f.pending();
  const result = await f.provider.createCheckout(checkoutInput);
  assert.equal(result.sessionId, 'cs_fixture'); assert.equal(result.purchase.customerId, 'cus_fixture');
  const create = f.calls.find(call => call.name === 'session_create')!;
  assert.equal(create.input.mode, 'payment'); assert.equal(create.input.customer, 'cus_fixture');
  assert.equal(create.input.metadata.tenant_id, 'tenant_fixture'); assert.equal(create.input.metadata.purchase_id, purchaseId);
  assert.deepEqual(create.input.line_items, [{ price: 'price_fixture', quantity: 1 }]);
  assert.equal(create.options.idempotencyKey, `operatoros-tool-checkout-${purchaseId}`);
  assert.equal(create.input.subscription_data, undefined); assert.equal(create.input.allow_promotion_codes, false);
  assert.ok(f.calls.findIndex(c => c.name === 'session_read') < f.calls.findIndex(c => c.name === 'attach'));
});

test('uncertain creation retries identical order/customer keys and does not attach until authoritative response', async () => {
  const f = fixture(); f.pending(); f.failCreate = true;
  await assert.rejects(f.provider.createCheckout(checkoutInput));
  assert.equal(f.calls.filter(c => c.name === 'attach').length, 0);
  await f.provider.createCheckout(checkoutInput);
  for (const name of ['customer_create', 'session_create']) {
    const attempts = f.calls.filter(c => c.name === name);
    assert.equal(attempts.length, 2); assert.deepEqual(attempts[0], attempts[1]);
  }
});

test('VendorTrust remains a separate identical-price tenant purchase without a subscription prerequisite', async () => {
  const f = fixture(); f.purchase.toolSlug = 'vendortrust365'; f.purchase.snapshot.officeexitGrant = null; f.pending();
  f.session.metadata.tool_slug = 'vendortrust365'; f.intent.metadata.tool_slug = 'vendortrust365';
  const result = await f.provider.createCheckout(checkoutInput);
  assert.equal(result.purchase.toolSlug, 'vendortrust365');
  const create = f.calls.find(call => call.name === 'session_create')!;
  assert.equal(create.input.metadata.tool_slug, 'vendortrust365'); assert.equal(create.input.mode, 'payment');
  assert.ok(f.calls.find(c => c.name === 'customer_create')!.options.idempotencyKey.length < 255);
});

test('untrusted return origins fail before local or provider access', async () => {
  for (const returnOrigin of ['http://app.operatoros.net', 'https://app.operatoros.net/elsewhere',
    'https://user:pass@app.operatoros.net', 'https://app.operatoros.net?redirect=foreign', 'https://app.operatoros.net:444']) {
    const f = fixture(); await rejected(f.provider.createCheckout({ ...checkoutInput, returnOrigin }), 'TOOL_CHECKOUT_RETURN_ORIGIN_INVALID');
    assert.equal(f.calls.length, 0);
  }
});

test('foreign tenant, runtime mismatch, old uncertain order and unapproved terms cannot create charges', async () => {
  for (const kind of ['tenant', 'mode', 'old', 'amount', 'coverage'] as const) {
    const f = fixture(); f.pending();
    if (kind === 'mode') f.runtime = 'live';
    if (kind === 'old') f.purchase.createdAt = new Date(now - 24 * 3600_000).toISOString();
    if (kind === 'amount') f.purchase.snapshot.amountMinor = 1;
    if (kind === 'coverage') f.purchase.snapshot.coverage = 'device' as 'entire_tenant';
    await rejected(f.provider.createCheckout({ ...checkoutInput, ...(kind === 'tenant' ? { tenantId: 'foreign' } : {}) }));
    assert.equal(f.calls.filter(c => c.name.endsWith('_create')).length, 0, kind);
  }
});

test('invalid or cross-tool grants are rejected before provider access and charging', async () => {
  for (const kind of ['edition', 'capability', 'device_limit', 'null', 'vendor_grant', 'narrow_alias', 'publisher_missing', 'terms']) {
    const f = fixture(); f.pending();
    if (kind === 'edition') f.purchase.snapshot.officeexitGrant!.edition = 'invented';
    if (kind === 'capability') f.purchase.snapshot.officeexitGrant!.capabilities = ['invented'];
    if (kind === 'device_limit') Object.assign(f.purchase.snapshot.officeexitGrant!, { maximumDevices: 1 });
    if (kind === 'null') f.purchase.snapshot.officeexitGrant = null;
    if (kind === 'vendor_grant') f.purchase.toolSlug = 'vendortrust365';
    if (kind === 'narrow_alias') { f.purchase.snapshot.officeexitGrant!.edition = 'Professional';
      f.purchase.snapshot.officeexitGrant!.capabilities = ['localAssessment', 'migrationPlanning', 'htmlReporting', 'multiDevice']; }
    if (kind === 'publisher_missing') f.purchase.snapshot.officeexitGrant!.capabilities = f.purchase.snapshot.officeexitGrant!.capabilities.filter(value => value !== 'publisherRescue');
    if (kind === 'terms') f.purchase.snapshot.licenseTermsVersion = 'unapproved-other-terms';
    await rejected(f.provider.createCheckout(checkoutInput), 'TOOL_OFFER_GRANT_INVALID');
    assert.equal(f.calls.some(c => c.name === 'client'), false, kind);
  }
});

for (const [field, value] of [['type', 'recurring'], ['unit_amount', 1], ['currency', 'eur'], ['product', 'prod_other'],
  ['livemode', true], ['active', false]] as const) {
  test(`checkout rejects provider Price ${field} mismatch before customer creation`, async () => {
    const f = fixture(); f.pending(); f.price[field] = value;
    await rejected(f.provider.createCheckout(checkoutInput));
    assert.equal(f.calls.filter(c => c.name.endsWith('_create')).length, 0);
  });
}
for (const url of ['http://checkout.stripe.com/c/pay/x', 'https://checkout.stripe.com.evil.test/c/pay/x',
  'https://user:pass@checkout.stripe.com/c/pay/x', 'https://checkout.stripe.com:444/c/pay/x', 'https://evil.test/']) {
  test(`checkout rejects unsafe provider URL ${url}`, async () => {
    const f = fixture(); f.pending(); f.session.url = url;
    await rejected(f.provider.createCheckout(checkoutInput), 'TOOL_CHECKOUT_URL_INVALID');
    assert.equal(f.calls.some(c => c.name === 'attach'), false);
  });
}

test('attached checkout is retrieved rather than re-created; foreign response cannot be attached', async () => {
  const f = fixture(); f.session.status = 'open';
  await f.provider.createCheckout(checkoutInput); assert.equal(f.calls.some(c => c.name.endsWith('_create')), false);
  const other = fixture(); other.pending(); other.session.customer = 'cus_foreign';
  await rejected(other.provider.createCheckout(checkoutInput)); assert.equal(other.calls.some(c => c.name === 'attach'), false);
});

test('unbound metadata, foreign metadata and known cross-account/mode refs do not authorize provider reads', async () => {
  for (const kind of ['unbound', 'tenant', 'account_metadata', 'account_event', 'known_account', 'known_mode']) {
    const f = fixture(); const event = f.event('checkout.session.completed', !kind.startsWith('known'));
    if (kind === 'unbound') event.data.object.metadata.purchase_id = '8cf24f4b-7b7e-4235-aad1-467769bc5727';
    if (kind === 'tenant') event.data.object.metadata.tenant_id = 'foreign';
    if (kind === 'account_metadata') event.data.object.metadata.provider_account_id = 'acct_foreign';
    if (kind.endsWith('account') || kind === 'account_event') event.account = 'acct_foreign';
    if (kind === 'known_mode') event.livemode = true;
    await rejected(f.receive(event)); assert.equal(f.calls.some(c => c.name === 'client'), false, kind);
    assert.equal(f.applied.length, 0); assert.equal(f.calls.some(c => c.name === 'attach'), false);
  }
});

test('unknown immutable references fall through without provider networking; unsupported direct marker fails closed', async () => {
  const f = fixture(); const event = f.event('charge.refunded', false); event.data.object.id = 'ch_unknown';
  event.data.object.payment_intent = 'pi_unknown';
  assert.equal(await f.receive(event), null); assert.equal(f.calls.some(c => c.name === 'client'), false);
  await rejected(f.receive(f.event('unrecognized.event')), 'TOOL_PAYMENT_EVENT_UNSUPPORTED');
  assert.equal(await f.receive({ type: 'checkout.session.completed', data: { object: {} } }), null);
});

test('one forged reference cannot conceal another known tool reference from the isolated lane', async () => {
  for (const type of ['checkout.session.completed', 'charge.refunded']) {
    const f = fixture(); const event = f.event(type, false);
    event.data.object.id = type.startsWith('checkout') ? 'cs_forged' : 'ch_forged';
    await rejected(f.receive(event));
    assert.equal(f.applied.length, 0); assert.equal(f.calls.some(c => c.name === 'client'), false);
  }
});

test('verified settlement proves authoritative session/PI/charge and hashes exact raw bytes', async () => {
  const f = fixture(); const event = f.event(); const body = ' \n' + JSON.stringify(event) + '\n';
  const result = await f.receive(event, body);
  assert.equal(result?.handled, true); assert.equal(f.applied.length, 1);
  assert.equal(f.applied[0].payloadSha256, createHash('sha256').update(body).digest('hex'));
  assert.equal(f.applied[0].action, 'paid'); assert.equal(f.applied[0].amountMinor, 9900);
  assert.equal(f.applied[0].productId, 'prod_fixture');
  assert.deepEqual(f.calls.filter(c => ['session_read', 'pi_read', 'charge_read'].includes(c.name)).map(c => c.name), ['session_read', 'pi_read']);
});

test('archived catalog lines retain settlement proof but cannot authorize a new checkout', async () => {
  const f = fixture(); f.session.line_items.data[0].price.active = false;
  await f.receive(); assert.equal(f.applied[0].action, 'paid');
  assert.equal(f.calls.some(c => c.name === 'price' || c.name === 'product'), false);
});

for (const [target, field, value] of [
  ['session', 'customer', 'cus_foreign'], ['session', 'subscription', 'sub_forbidden'], ['session', 'mode', 'subscription'],
  ['session', 'amount_total', 1], ['session', 'amount_subtotal', 10000], ['session', 'currency', 'eur'],
  ['session', 'livemode', true], ['session', 'payment_status', 'unpaid'], ['intent', 'amount_received', 1],
  ['intent', 'customer', 'cus_foreign'], ['intent', 'status', 'processing'], ['intent', 'currency', 'eur'],
  ['charge', 'customer', 'cus_foreign'], ['charge', 'payment_intent', 'pi_foreign'], ['charge', 'amount', 1],
  ['charge', 'paid', false], ['charge', 'amount_refunded', -1],
] as const) {
  test(`settlement rejects ${target}.${field} mismatch without store mutation`, async () => {
    const f = fixture(); f[target][field] = value;
    await rejected(f.receive()); assert.equal(f.applied.length, 0);
  });
}

test('multi-price/quantity sessions and forged authoritative metadata cannot settle', async () => {
  for (const kind of ['quantity', 'extra_line', 'has_more', 'price', 'metadata']) {
    const f = fixture();
    if (kind === 'quantity') f.session.line_items.data[0].quantity = 2;
    if (kind === 'extra_line') f.session.line_items.data.push(structuredClone(f.session.line_items.data[0]));
    if (kind === 'has_more') f.session.line_items.has_more = true;
    if (kind === 'price') f.session.line_items.data[0].price.id = 'price_other';
    if (kind === 'metadata') f.intent.metadata.tenant_id = 'foreign';
    await rejected(f.receive()); assert.equal(f.applied.length, 0);
  }
});

test('metadata-less bound refunds and disputes revoke and old checkout delivery observes current reversal', async () => {
  for (const kind of ['refund', 'dispute', 'old_paid']) {
    const f = fixture();
    if (kind === 'dispute') f.charge.disputed = true; else f.charge.amount_refunded = 100;
    const event = f.event(kind === 'refund' ? 'charge.refunded' : kind === 'dispute' ? 'charge.dispute.closed' : 'checkout.session.completed', false);
    await f.receive(event);
    assert.equal(f.applied[0].action, kind === 'dispute' ? 'disputed' : 'refunded');
    if (kind !== 'dispute') assert.equal(f.applied[0].refundedAmountMinor, 100);
  }
});

test('expired and failed known checkout cancel without credit and reject a contradictory paid session', async () => {
  for (const type of ['checkout.session.expired', 'checkout.session.async_payment_failed']) {
    const f = fixture(); f.session.status = 'expired'; f.session.payment_status = 'unpaid';
    await f.receive(f.event(type)); assert.equal(f.applied[0].action, 'cancelled');
    const paid = fixture(); await rejected(paid.receive(paid.event(type)), 'TOOL_PAYMENT_CANCEL_CONFLICT');
  }
});

test('a retryable failed attempt preserves pending order and can settle its later successful retry once', async () => {
  const f = fixture(); f.session.status = 'open'; f.session.payment_status = 'unpaid'; f.intent.status = 'requires_payment_method';
  const failed = f.event('payment_intent.payment_failed');
  for (let attempt = 0; attempt < 2; attempt++) {
    const observed = await f.receive(failed); assert.equal(observed?.ignored, true); assert.equal(observed?.purchase.status, 'pending');
  }
  assert.equal(f.applied.length, 0);
  f.session.status = 'complete'; f.session.payment_status = 'paid'; f.intent.status = 'succeeded';
  await f.receive(f.event('payment_intent.succeeded')); assert.equal(f.applied.length, 1); assert.equal(f.applied[0].action, 'paid');
});

test('expired failed attempt cancels, but failure metadata or customer mismatch cannot authorize an observation', async () => {
  const expired = fixture(); expired.session.status = 'expired'; expired.session.payment_status = 'unpaid';
  await expired.receive(expired.event('payment_intent.payment_failed')); assert.equal(expired.applied[0].action, 'cancelled');
  for (const kind of ['customer', 'metadata']) {
    const f = fixture(); f.session.status = 'open'; f.session.payment_status = 'unpaid'; f.intent.status = 'requires_payment_method';
    if (kind === 'customer') f.intent.customer = 'cus_foreign'; else f.intent.metadata.tenant_id = 'foreign';
    await rejected(f.receive(f.event('payment_intent.payment_failed', false))); assert.equal(f.applied.length, 0);
  }
});

test('duplicate receipt and conflicting raw-body replay remain store-fenced and bounded failures retry', async () => {
  const f = fixture(); const event = f.event();
  assert.equal((await f.receive(event))?.duplicate, false); assert.equal((await f.receive(event))?.duplicate, true);
  await rejected(f.receive(event, JSON.stringify(event) + ' '), 'TOOL_PAYMENT_SETTLEMENT_RETRY_REQUIRED');
  f.failApply = true;
  await assert.rejects(f.receive(), (error: unknown) => error instanceof ToolPurchaseProviderError
    && error.statusCode === 503 && !error.message.includes('PRIVATE_STORE_FAILURE'));
  const missing = fixture(); await rejected(missing.receive(missing.event(), ''), 'TOOL_PAYMENT_VERIFIED_BODY_REQUIRED');
  assert.equal(missing.calls.some(c => c.name === 'client'), false);
});

test('identical raw event replay after current provider reversal uses the store duplicate fence', async () => {
  const f = fixture(); const event = f.event(); const rawBody = JSON.stringify(event);
  assert.equal((await f.receive(event, rawBody))?.duplicate, false);
  f.charge.amount_refunded = 100;
  assert.equal((await f.receive(event, rawBody))?.duplicate, true);
  assert.equal(f.applied[0].action, 'paid'); assert.equal(f.applied[1].action, 'refunded');
  assert.equal(f.applied[0].payloadSha256, f.applied[1].payloadSha256);
});

// Actual registered handler + real Stripe HMAC, fully inert transport/store.
const routeText = readFileSync(new URL('../src/routes/billing-routes.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('billing-routes.ts', routeText, ts.ScriptTarget.Latest, true);
let handler: string | undefined;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'post'
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === '/v1/billing/webhook') handler = node.arguments.at(-1)!.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree); assert.ok(handler);
const compiled = ts.transpileModule(`module.exports=${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
async function routeFixture() {
  const f = fixture(); const calls: string[] = []; let http = 0;
  const stripe = new Stripe('sk_test_synthetic_tool_only', { maxNetworkRetries: 0,
    httpClient: { getClientName: () => 'blocked', makeRequest() { http++; throw new Error('offline'); },
      async makeRequestAsync() { http++; throw new Error('offline'); } } as unknown as Stripe.HttpClient });
  const secret = 'whsec_synthetic_tool_route';
  const module = { exports: undefined as unknown as RouteHandlerMethod };
  runInNewContext(compiled, { module, Buffer, ToolPurchaseProviderError, OperatorOsTokenBillingError: class extends Error {},
    console: { log() {}, error() {} }, stripeWebhookFailureDiagnostic: () => ({}),
    getPaymentProviderAdapter: () => ({ status: { state: 'configured' }, async verifyWebhook(raw: Buffer, signature: string) {
      calls.push('verify'); return stripe.webhooks.constructEvent(raw, signature, secret); } }),
    receiveVerifiedToolPurchaseEvent: f.provider.receiveVerifiedEvent,
    async isTorqueTokenStripeEvent() { calls.push('torque'); return false; },
    classifyWebhookEvent() { calls.push('classify'); return { isAddon: false, isFeatureAddon: false }; },
    async claimStripeEvent() { calls.push('claim'); return { isDuplicate: true, duplicateState: 'processed' }; },
  });
  const app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    (request as typeof request & { rawBody: Buffer }).rawBody = body as Buffer;
    done(null, JSON.parse((body as Buffer).toString()));
  });
  app.post('/v1/billing/webhook', module.exports); await app.ready();
  return { f, calls, app, get http() { return http; }, async send(event = f.event(), badSignature = false) {
    const payload = JSON.stringify(event); const signature = stripe.webhooks.generateTestHeaderString({ payload,
      secret: badSignature ? 'whsec_wrong_fixture' : secret });
    return app.inject({ method: 'POST', url: '/v1/billing/webhook', payload,
      headers: { 'content-type': 'application/json', 'stripe-signature': signature } });
  } };
}

test('real signed route verifies once and prevents tool events reaching Torque or generic grants', async t => {
  const r = await routeFixture(); t.after(() => r.app.close());
  const response = await r.send(); assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().kind, 'tool_purchase'); assert.deepEqual(r.calls, ['verify']); assert.equal(r.f.applied.length, 1);
  assert.equal(r.http, 0);
});
test('real signed route rejects wrong signatures and unbound/cross-account metadata before other billing lanes', async t => {
  for (const kind of ['signature', 'unbound', 'account']) {
    const r = await routeFixture(); t.after(() => r.app.close()); const event = r.f.event();
    if (kind === 'unbound') event.data.object.metadata.purchase_id = '8cf24f4b-7b7e-4235-aad1-467769bc5727';
    if (kind === 'account') event.account = 'acct_foreign';
    const response = await r.send(event, kind === 'signature');
    assert.ok(response.statusCode >= 400, response.body); assert.deepEqual(r.calls, ['verify']);
    assert.equal(r.f.calls.some(c => c.name === 'client'), false); assert.equal(r.f.applied.length, 0); assert.equal(r.http, 0);
  }
});
test('unmatched signed route retains legacy Torque/classify/claim dispatch', async t => {
  const r = await routeFixture(); t.after(() => r.app.close());
  const event = { id: 'evt_unrelated', type: 'invoice.created', data: { object: { id: 'in_unrelated', metadata: {} } } };
  const response = await r.send(event); assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(r.calls, ['verify', 'torque', 'classify', 'claim']); assert.equal(r.f.applied.length, 0);
});
