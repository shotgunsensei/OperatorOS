import './_billing-webhook-env.js';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { billingEvents, tenantApplicationSubscriptions, tenantEntitlements } from '../src/schema.js';
import { cleanupUser, createTestUser, ensureSchemaReady } from './_setup.js';

// No fallback URL or skip. ensureSchemaReady validates the captured disposable
// pool target before DDL; teardown also refuses to query if that guard failed.
const token = randomUUID().replaceAll('-', '');
const prefix = `evt_failed_pi_${token}`;
const secret = 'whsec_synthetic_disposable_billing_fixture';
let schemaReady = false;
let app: FastifyInstance | undefined;
let billing: typeof import('../src/lib/billing-service.js');
let owner: Awaited<ReturnType<typeof createTestUser>> | undefined;
let foreign: Awaited<ReturnType<typeof createTestUser>> | undefined;
let row: typeof tenantApplicationSubscriptions.$inferSelect;
let provider: any;
let throwAllocations = false;
let providerHook: (() => Promise<void>) | undefined;
let retrieves = 0;
let networkCalls = 0;
const customerId = `cus_failed_pi_${token}`;
const subscriptionId = `sub_failed_pi_${token}`;
const paymentIntentId = `pi_failed_pi_${token}`;
const invoiceId = `in_failed_pi_${token}`;
const sdk = new Stripe('sk_test_synthetic_failed_pi_sql_only', { maxNetworkRetries: 0, httpClient: {
  getClientName: () => 'blocked-offline',
  makeRequest() { networkCalls++; throw new Error('Provider networking prohibited'); },
  async makeRequestAsync() { networkCalls++; throw new Error('Provider networking prohibited'); },
} as unknown as Stripe.HttpClient });
function metadata() {
  return { billing_model: 'core_product_stack', billing_interval: 'month', tenant_id: row.tenantId,
    internal_application_subscription_id: row.id, checkout_attempt_id: 'attempt_sql_bound',
    user_id: owner!.id, selected_core_product: 'techdeck', selected_free_companion_module: 'snapproofos',
    additional_module_keys: '', additional_seats: '0' };
}
function paymentIntent() { return { id: paymentIntentId, object: 'payment_intent', livemode: false,
  customer: customerId, customer_account: null, metadata: {}, status: 'succeeded' }; }
function signedEvent(suffix: string) { return { id: `${prefix}_${suffix}`, type: 'payment_intent.payment_failed',
  livemode: false, data: { object: { ...paymentIntent(), status: 'requires_payment_method' } } }; }
async function send(event: ReturnType<typeof signedEvent>) {
  const payload = JSON.stringify(event);
  return app!.inject({ method: 'POST', url: '/v1/billing/webhook', payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': sdk.webhooks.generateTestHeaderString({ payload, secret }) } });
}
async function commercialProjection() {
  const result = await db.execute(sql`SELECT
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM tenant_application_subscriptions s WHERE s.tenant_id IN (${owner!.currentTenantId},${foreign!.currentTenantId})) AS stacks,
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM tenant_entitlements e WHERE e.tenant_id IN (${owner!.currentTenantId},${foreign!.currentTenantId})) AS grants,
    (SELECT jsonb_agg(jsonb_build_object('id',t.id,'seats',t.seat_limit) ORDER BY t.id) FROM tenants t WHERE t.id IN (${owner!.currentTenantId},${foreign!.currentTenantId})) AS seats`);
  return result.rows[0];
}

before(async () => {
  process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'test';
  process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE = '0';
  process.env.STRIPE_MODE = 'test'; process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_failed_pi_sql_only';
  process.env.STRIPE_PRICE_TECHDECK_MONTHLY = 'price_failed_pi_core';
  await ensureSchemaReady(); schemaReady = true;
  globalThis.fetch = async () => { networkCalls++; throw new Error('External networking prohibited'); };
  owner = await createTestUser(); foreign = await createTestUser();
  const receivers = await db.execute(sql`SELECT COUNT(*)::int AS count FROM tenant_modules WHERE tenant_id IN (${owner.currentTenantId},${foreign.currentTenantId})`);
  assert.equal(receivers.rows[0].count, 0, 'isolated tenants must have no external propagation receivers');
  [row] = await db.insert(tenantApplicationSubscriptions).values({ tenantId: owner.currentTenantId!, initiatedByUserId: owner.id,
    coreProduct: 'techdeck', includedCompanionKey: 'snapproofos', status: 'past_due', stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId, stripeCheckoutSessionId: `cs_failed_pi_${token}`, corePriceId: 'price_failed_pi_core',
    metadata: { billing_model: 'core_product_stack', billing_interval: 'month', checkout_attempt_id: 'attempt_sql_bound' } }).returning();
  await db.insert(tenantApplicationSubscriptions).values({ tenantId: foreign.currentTenantId!, initiatedByUserId: foreign.id,
    coreProduct: 'techdeck', includedCompanionKey: 'snapproofos', status: 'active', stripeCustomerId: `cus_foreign_${token}`,
    stripeSubscriptionId: `sub_foreign_${token}`, corePriceId: 'price_failed_pi_core' });
  for (const [tenant, sub] of [[owner.currentTenantId!, subscriptionId], [foreign.currentTenantId!, `sub_foreign_${token}`]]) {
    await db.insert(tenantEntitlements).values({ tenantId: tenant, entitlementKey: 'techdeck', entitlementType: 'core_product',
      source: 'stripe', active: true, stripeSubscriptionId: sub });
  }
  await db.execute(sql`UPDATE tenants SET seat_limit=77 WHERE id=${foreign.currentTenantId}`);
  provider = { id: subscriptionId, object: 'subscription', customer: customerId, customer_account: null,
    livemode: false, status: 'active', cancel_at_period_end: false, metadata: metadata(), latest_invoice: invoiceId,
    current_period_start: 1700000000, current_period_end: 1702678400,
    items: { data: [{ price: { id: 'price_failed_pi_core' }, quantity: 1 }] } };
  // Match the existing real-HMAC disposable fixture: NODE_ENV=test always
  // forces deterministic verification. Change only this guarded child after
  // captured-pool validation, with synthetic key, SDK verifier and blocked egress.
  process.env.APP_ENV = 'development'; process.env.NODE_ENV = 'development';
  process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE = '0';
  billing = await import('../src/lib/billing-service.js');
  billing.__setStripeTestOverrides({ enabled: true, client: {
    webhooks: sdk.webhooks,
    paymentIntents: { async retrieve(id: string) { assert.equal(id, paymentIntentId); return paymentIntent(); } },
    invoicePayments: { async list() {
      if (throwAllocations) throw new Error('synthetic_secret_provider_failure');
      return { object: 'list', has_more: false, data: [{ id: `inpay_${token}`, object: 'invoice_payment', livemode: false,
        invoice: invoiceId, payment: { type: 'payment_intent', payment_intent: paymentIntentId } }] };
    } },
    invoices: { async retrieve(id: string) { assert.equal(id, invoiceId); return { id, object: 'invoice', customer: customerId,
      customer_account: null, livemode: false, parent: { type: 'subscription_details', subscription_details: { subscription: subscriptionId } } }; } },
    subscriptions: { async retrieve(id: string) {
      assert.equal(id, subscriptionId); retrieves++; const value = structuredClone(provider); await providerHook?.(); return value;
    } },
    prices: { async retrieve(id: string) { return { id, active: true, currency: 'usd', unit_amount: 9900, livemode: false,
      billing_scheme: 'per_unit', transform_quantity: null, type: 'recurring',
      recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } }; } },
  } });
  const { getPaymentProviderAdapter } = await import('../src/lib/shared-provider-adapters.js');
  assert.deepEqual(getPaymentProviderAdapter().status, { kind: 'payments', name: 'stripe', state: 'configured' });
  const { registerBillingRoutes } = await import('../src/routes/billing-routes.js');
  app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    (request as typeof request & { rawBody: Buffer }).rawBody = body as Buffer;
    try { done(null, JSON.parse((body as Buffer).toString('utf8'))); } catch (error) { done(error as Error); }
  });
  await registerBillingRoutes(app); await app.ready();
});

after(async () => {
  providerHook = undefined; await app?.close(); billing?.__setStripeTestOverrides(null);
  if (!schemaReady) return;
  for (const user of [owner, foreign]) if (user) {
    await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, user.currentTenantId!));
    await db.delete(tenantApplicationSubscriptions).where(eq(tenantApplicationSubscriptions.tenantId, user.currentTenantId!));
    await cleanupUser(user.id);
  }
  await db.execute(sql`DELETE FROM billing_events WHERE stripe_event_id LIKE ${`${prefix}%`}`);
  assert.equal(networkCalls, 0);
});

test('PostgreSQL: signed bound PI durably processes once and preserves the original event', async () => {
  const event = signedEvent('bound'); const result = await send(event);
  assert.equal(result.statusCode, 200, result.body); assert.equal(result.json().handled, true);
  const [receipt] = await db.select().from(billingEvents).where(eq(billingEvents.stripeEventId, event.id));
  assert.ok(receipt.processedAt); assert.equal(receipt.errorMessage, null);
  assert.deepEqual((receipt.metadata as any).rawEvent, event);
  const [current] = await db.select().from(tenantApplicationSubscriptions).where(eq(tenantApplicationSubscriptions.id, row.id));
  assert.equal(current.status, 'active');
  const before = await commercialProjection(); const readCount = retrieves;
  assert.equal((await send(event)).json().action, 'duplicate_ignored');
  assert.equal((await billing.retryBillingEvent(receipt.id)).replayed, false);
  assert.equal(retrieves, readCount); assert.deepEqual(await commercialProjection(), before);
});

test('PostgreSQL: failed correlation persists a reclaimable receipt and actual saved retry recovers', async () => {
  const event = signedEvent('retry'); throwAllocations = true;
  try {
    const before = await commercialProjection(); const result = await send(event);
    assert.equal(result.statusCode, 503, result.body); assert.deepEqual(await commercialProjection(), before);
    const [receipt] = await db.select().from(billingEvents).where(eq(billingEvents.stripeEventId, event.id));
    assert.equal(receipt.processedAt, null); assert.equal(receipt.errorMessage, 'FAILED_PAYMENT_PROVIDER_UNAVAILABLE');
    throwAllocations = false;
    const retried = await billing.retryBillingEvent(receipt.id); assert.equal(retried.ok, true); assert.equal(retried.replayed, true);
    const [saved] = await db.select().from(billingEvents).where(eq(billingEvents.id, receipt.id));
    assert.ok(saved.processedAt); assert.deepEqual((saved.metadata as any).rawEvent, event);
  } finally { throwAllocations = false; }
});

test('PostgreSQL: foreign tenant hint cannot select the owned bound Stack or mutate either tenant', async () => {
  const before = await commercialProjection(); const original = structuredClone(provider);
  provider.metadata.tenant_id = foreign!.currentTenantId;
  try {
    const event = signedEvent('foreign'); const result = await send(event);
    assert.equal(result.statusCode, 503, result.body); assert.deepEqual(await commercialProjection(), before);
    const [receipt] = await db.select().from(billingEvents).where(eq(billingEvents.stripeEventId, event.id));
    assert.equal(receipt.processedAt, null); assert.equal(receipt.errorMessage, 'FAILED_PAYMENT_BOUND_STACK_MISMATCH');
  } finally { provider = original; }
});
