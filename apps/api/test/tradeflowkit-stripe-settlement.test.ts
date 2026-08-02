process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-stripe-settlement-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import Fastify from 'fastify';
import Stripe from 'stripe';
import { db } from '../src/db.js';
import {
  tenantModules,
  tradeflowkitCustomers,
  tradeflowkitInvoices,
  tradeflowkitPaymentProviderAccounts,
  tradeflowkitPayments,
  tradeflowkitSettings,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let owner: any;
let moduleRow: any;
let customerId = '';
let invoiceId = '';
let paymentId = '';
let providerAccountRowId = '';
let app: ReturnType<typeof Fastify>;

const webhookSecret = 'whsec_not-a-real-tradeflowkit-test-secret';
let providerAccountId = '';
let providerEventId = '';

before(async () => {
  process.env.APP_ENV = 'test';
  process.env.NODE_ENV = 'test';
  process.env.TRADEFLOWKIT_PAYMENT_PROVIDER = 'stripe_connect';
  process.env.STRIPE_MODE = 'test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_not-a-real-secret';
  process.env.STRIPE_CLIENT_ID = 'ca_test_client';
  process.env.TRADEFLOWKIT_STRIPE_CONNECT_WEBHOOK_SECRET = webhookSecret;
  process.env.TRADEFLOWKIT_STRIPE_CONNECT_REDIRECT_URI = 'https://tradeflowkit.example.test/v1/modules/tradeflowkit/payments/connect/callback';
  process.env.TRADEFLOWKIT_PUBLIC_BASE_URL = 'https://tradeflowkit.example.test';
  await ensureSchemaReady();
  owner = await createTestUser();
  const fixtureSuffix = owner.id.replaceAll('-', '').slice(0, 20);
  providerAccountId = `acct_test_${fixtureSuffix}`;
  providerEventId = `evt_test_${fixtureSuffix}`;
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantModules).values({
    tenantId: owner.currentTenantId,
    moduleId: moduleRow.id,
    status: 'enabled',
    source: 'admin',
    allowAllMembers: true,
  });
  await db.insert(tradeflowkitSettings).values({ tenantId: owner.currentTenantId, currency: 'USD' })
    .onConflictDoNothing({ target: tradeflowkitSettings.tenantId });
  const [providerAccount] = await db.insert(tradeflowkitPaymentProviderAccounts).values({
    tenantId: owner.currentTenantId,
    provider: 'stripe_connect',
    providerAccountId,
    livemode: false,
    status: 'connected',
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    createdByUserId: owner.id,
    updatedByUserId: owner.id,
  }).returning();
  providerAccountRowId = providerAccount.id;
  const [customer] = await db.insert(tradeflowkitCustomers).values({
    tenantId: owner.currentTenantId,
    createdByUserId: owner.id,
    name: 'Stripe Settlement Fixture',
  }).returning();
  customerId = customer.id;
  const [invoice] = await db.insert(tradeflowkitInvoices).values({
    tenantId: owner.currentTenantId,
    customerId,
    createdByUserId: owner.id,
    status: 'sent',
    lineItems: [{ description: 'Service', quantity: 1, unitPriceCents: 25_000 }],
    subtotalCents: 25_000,
    totalCents: 25_000,
    paidCents: 0,
    balanceCents: 25_000,
  }).returning();
  invoiceId = invoice.id;
  const [payment] = await db.insert(tradeflowkitPayments).values({
    tenantId: owner.currentTenantId,
    invoiceId,
    createdByUserId: owner.id,
    amountCents: 25_000,
    method: 'provider',
    status: 'pending',
    provider: 'stripe_connect',
    providerReference: 'cs_test_settlement_fixture',
    providerAccountId,
    idempotencyKey: 'stripe-settlement-fixture-v1',
    paidAt: null,
  }).returning();
  paymentId = payment.id;

  app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request: any, body: Buffer, done: any) => {
    request.rawBody = body;
    try { done(null, JSON.parse(body.toString('utf8'))); } catch (error) { done(error); }
  });
  const { registerTradeFlowKitPaymentRoutes } = await import('../src/routes/tradeflowkit-payment-routes.js');
  await registerTradeFlowKitPaymentRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (providerEventId) await db.execute(sql`
    DELETE FROM shared_webhook_receipts
    WHERE provider = 'stripe_connect' AND provider_event_id = ${providerEventId}
  `);
  if (paymentId) await db.delete(tradeflowkitPayments).where(eq(tradeflowkitPayments.id, paymentId));
  if (invoiceId) await db.delete(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.id, invoiceId));
  if (customerId) await db.delete(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.id, customerId));
  if (providerAccountRowId) await db.delete(tradeflowkitPaymentProviderAccounts).where(eq(tradeflowkitPaymentProviderAccounts.id, providerAccountRowId));
  if (moduleRow) {
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  if (owner) await cleanupUser(owner.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('signed Stripe Connect webhook settles once, rejects tampering, and treats replay as a duplicate', async () => {
  const payload = JSON.stringify({
    id: providerEventId,
    object: 'event',
    account: providerAccountId,
    api_version: '2025-06-30.basil',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_settlement_fixture',
        object: 'checkout.session',
        amount_total: 25_000,
        currency: 'usd',
        payment_status: 'paid',
        metadata: { tradeflowkit_payment_id: paymentId },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'checkout.session.completed',
  });
  const stripe = new Stripe('sk_test_not-a-real-secret');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  const accepted = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/tradeflowkit/stripe-connect',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    payload,
  });
  assert.equal(accepted.statusCode, 202, accepted.body);
  assert.deepEqual(accepted.json(), { received: true, duplicate: false, status: 'processed' });

  const replay = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/tradeflowkit/stripe-connect',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    payload,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);

  const tampered = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/tradeflowkit/stripe-connect',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    payload: payload.replace('25000', '25001'),
  });
  assert.equal(tampered.statusCode, 400, tampered.body);
  assert.equal(tampered.json().code, 'WEBHOOK_SIGNATURE_INVALID');

  const [payment] = await db.select().from(tradeflowkitPayments).where(and(
    eq(tradeflowkitPayments.id, paymentId),
    eq(tradeflowkitPayments.tenantId, owner.currentTenantId),
  ));
  const [invoice] = await db.select().from(tradeflowkitInvoices).where(and(
    eq(tradeflowkitInvoices.id, invoiceId),
    eq(tradeflowkitInvoices.tenantId, owner.currentTenantId),
  ));
  assert.equal(payment.status, 'succeeded');
  assert.equal(payment.providerEventId, providerEventId);
  assert.ok(payment.paidAt instanceof Date);
  assert.equal(invoice.status, 'paid');
  assert.equal(invoice.paidCents, 25_000);
  assert.equal(invoice.balanceCents, 0);
});
