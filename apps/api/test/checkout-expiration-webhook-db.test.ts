import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { billingEvents, tenantApplicationSubscriptions } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

const fixtureSecret = 'whsec_synthetic_checkout_expiration_only';
const prefix = `evt_expiry_${randomUUID().replaceAll('-', '')}`;
const managedKeys = ['APP_ENV', 'NODE_ENV', 'OPERATOROS_DETERMINISTIC_PROVIDER_MODE', 'STRIPE_MODE', 'STRIPE_SECRET_KEY', 'OPERATOROS_BILLING_WEBHOOK_SIGNING_SECRET'] as const;
const savedEnv = new Map(managedKeys.map(key => [key, process.env[key]]));
let app: FastifyInstance;
let noRawBodyApp: FastifyInstance;
let owner: Awaited<ReturnType<typeof createTestUser>>;
let torqueModule: Awaited<ReturnType<typeof createTestModule>>;
let billing: typeof import('../src/lib/billing-service.js');
const purchaseId = randomUUID();
const vehicleId = randomUUID();
const diagnosticId = randomUUID();
const torqueCheckoutId = `cs_test_${randomUUID().replaceAll('-', '')}`;
let providerHttpCalls = 0;
const stripe = new Stripe('sk_test_synthetic_checkout_expiration_only', {
  maxNetworkRetries: 0,
  httpClient: {
    getClientName: () => 'blocked-offline',
    makeRequest() { providerHttpCalls++; throw new Error('Provider networking prohibited'); },
    async makeRequestAsync() { providerHttpCalls++; throw new Error('Provider networking prohibited'); },
  } as unknown as Stripe.HttpClient,
});

function event(suffix: string, metadata: Record<string, string> = {}) {
  return {
    id: `${prefix}_${suffix}`, type: 'checkout.session.expired', livemode: false,
    data: { object: { id: `cs_test_${suffix}`, status: 'expired', payment_status: 'unpaid', metadata } },
  };
}

async function send(input: ReturnType<typeof event>, options: {
  secret?: string; timestamp?: number; payload?: string; missingSignature?: boolean; target?: FastifyInstance;
} = {}) {
  const payload = JSON.stringify(input);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload, secret: options.secret ?? fixtureSecret,
    ...(options.timestamp == null ? {} : { timestamp: options.timestamp }),
  });
  return (options.target ?? app).inject({
    method: 'POST', url: '/v1/billing/webhook',
    headers: { 'content-type': 'application/json', ...(options.missingSignature ? {} : { 'stripe-signature': signature }) },
    payload: options.payload ?? payload,
  });
}

async function rows(id: string) {
  return db.select().from(billingEvents).where(eq(billingEvents.stripeEventId, id));
}

async function authoritySnapshot() {
  const snapshot = await db.execute(sql`
    SELECT
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM tenant_application_subscriptions s WHERE s.tenant_id=${owner.currentTenantId}) AS cart,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM subscriptions s WHERE s.user_id=${owner.id}) AS subscriptions,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM addon_subscriptions s WHERE s.user_id=${owner.id}) AS addons,
      (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM tenant_entitlements e WHERE e.tenant_id=${owner.currentTenantId}) AS entitlements,
      (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM torqueshed_token_ledger_entries l WHERE l.tenant_id=${owner.currentTenantId}) AS credits
  `);
  return snapshot.rows[0];
}

before(async () => {
  assert.equal(process.env.PARITY_DATABASE_IS_DISPOSABLE, '1');
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname, /(?:^|[_-])(?:test|phase21|ci|disposable)(?:[_-]|$)/i);
  assert.equal(databaseUrl.search + databaseUrl.hash, '');
  await ensureSchemaReady();
  owner = await createTestUser();
  torqueModule = await createTestModule('torqueshed');
  await db.insert(tenantApplicationSubscriptions).values({
    tenantId: owner.currentTenantId!, initiatedByUserId: owner.id,
    coreProduct: 'techdeck', includedCompanionKey: 'snapproofos', additionalModuleKeys: ['brandforgeos'],
    additionalSeats: 1, status: 'incomplete', stripeCustomerId: `cus_expiry_${owner.id}`,
    stripeCheckoutSessionId: 'cs_test_expiry_pending_cart', corePriceId: 'price_expiry_core',
  });
  await db.execute(sql`
    INSERT INTO torqueshed_vehicles (id,tenant_id,owner_user_id,nickname,year,make,model,created_by_user_id,updated_by_user_id)
    VALUES (${vehicleId},${owner.currentTenantId},${owner.id},'Expiry fixture',2018,'Example','Roadster',${owner.id},${owner.id})
  `);
  await db.execute(sql`
    INSERT INTO torqueshed_diagnostic_sessions (id,tenant_id,owner_user_id,vehicle_id,title,customer_concern,created_by_user_id,updated_by_user_id)
    VALUES (${diagnosticId},${owner.currentTenantId},${owner.id},${vehicleId},'Expiry fixture','Unpaid expiration',${owner.id},${owner.id})
  `);
  await db.execute(sql`
    INSERT INTO operatoros_token_purchase_intents (
      id,tenant_id,user_id,module_id,diagnostic_session_id,package_key,units,amount_minor,currency,
      provider,provider_mode,provider_checkout_id,status,idempotency_key
    ) VALUES (
      ${purchaseId},${owner.currentTenantId},${owner.id},${torqueModule.id},${diagnosticId},
      'roadside-25000',25000,500,'USD','stripe','test',${torqueCheckoutId},'checkout_open',${`expiry:${purchaseId}`}
    )
  `);

  // Ordinary NODE_ENV=test always selects the deterministic adapter. Select
  // the real configured Stripe verification branch only in this child process,
  // with synthetic credentials, a real SDK HMAC verifier, and blocked egress.
  process.env.APP_ENV = 'development';
  process.env.NODE_ENV = 'development';
  process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE = '0';
  process.env.STRIPE_MODE = 'test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_checkout_expiration_only';
  process.env.OPERATOROS_BILLING_WEBHOOK_SIGNING_SECRET = fixtureSecret;
  billing = await import('../src/lib/billing-service.js');
  billing.__setStripeTestOverrides({ enabled: true, client: stripe });
  const { registerBillingRoutes } = await import('../src/routes/billing-routes.js');
  app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    (request as typeof request & { rawBody: Buffer }).rawBody = body as Buffer;
    try { done(null, JSON.parse((body as Buffer).toString('utf8'))); } catch (error) { done(error as Error); }
  });
  await registerBillingRoutes(app);
  await app.ready();
  noRawBodyApp = Fastify();
  await registerBillingRoutes(noRawBodyApp);
  await noRawBodyApp.ready();
});

after(async () => {
  if (app) await app.close();
  if (noRawBodyApp) await noRawBodyApp.close();
  billing?.__setStripeTestOverrides(null);
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await db.execute(sql`DELETE FROM billing_events WHERE stripe_event_id LIKE ${`${prefix}%`}`);
  await db.execute(sql`DELETE FROM shared_webhook_receipts WHERE provider_event_id LIKE ${`${prefix}%`}`);
  await db.execute(sql`DELETE FROM operatoros_token_purchase_intents WHERE id=${purchaseId}`);
  await db.execute(sql`DELETE FROM torqueshed_diagnostic_sessions WHERE id=${diagnosticId}`);
  await db.execute(sql`DELETE FROM torqueshed_vehicles WHERE id=${vehicleId}`);
  if (owner) await cleanupUser(owner.id);
  if (torqueModule) await cleanupModule(torqueModule.id);
  assert.equal(providerHttpCalls, 0);
});

test('signed generic unpaid expiry is durably acknowledged without cart, subscription, entitlement or credit changes', async () => {
  const input = event('generic', { billing_model: 'core_product_stack', user_id: owner.id });
  const before = await authoritySnapshot();
  const response = await send(input);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().action, 'checkout_expired_ignored');
  assert.equal(response.json().shouldPropagate, false);
  const [receipt] = await rows(input.id);
  assert.ok(receipt.processedAt);
  assert.equal(receipt.errorMessage, null);
  assert.equal((receipt.metadata as any).lastAction, 'checkout_expired_ignored');
  assert.deepEqual((receipt.metadata as any).rawEvent, input);
  assert.equal(receipt.payloadHash, createHash('sha256').update(JSON.stringify(input)).digest('hex'));
  assert.deepEqual(await authoritySnapshot(), before);
});

test('concurrent deliveries claim exactly one persistent receipt; later duplicates do not rewrite it', async () => {
  const input = event('concurrent', { user_id: owner.id });
  const before = await authoritySnapshot();
  const responses = await Promise.all(Array.from({ length: 12 }, () => send(input)));
  assert.equal(responses.filter(r => r.json().action === 'checkout_expired_ignored').length, 1);
  for (const response of responses) {
    assert.ok(response.statusCode === 200 || response.statusCode === 503);
    if (response.statusCode === 503) assert.equal(response.json().code, 'WEBHOOK_PROCESSING_IN_PROGRESS');
  }
  const recorded = await rows(input.id);
  assert.equal(recorded.length, 1);
  assert.ok(recorded[0].processedAt);
  assert.equal(recorded[0].retryCount, 0);
  const duplicate = await send(input);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().action, 'duplicate_ignored');
  assert.deepEqual(await rows(input.id), recorded);
  assert.deepEqual(await authoritySnapshot(), before);
});

test('in-flight leases remain retryable and failed receipts reclaim the same row', async () => {
  const input = event('lease', { user_id: owner.id });
  const claim = await billing.claimStripeEvent(input, billing.classifyWebhookEvent(input));
  assert.ok(claim.claimedRowId);
  const busy = await send(input);
  assert.equal(busy.statusCode, 503);
  assert.equal(busy.json().code, 'WEBHOOK_PROCESSING_IN_PROGRESS');
  await billing.markStripeEventFailed(claim.claimedRowId!, 'synthetic_previous_failure');
  const recovered = await send(input);
  assert.equal(recovered.statusCode, 200);
  const [receipt] = await rows(input.id);
  assert.equal(receipt.id, claim.claimedRowId);
  assert.equal(receipt.retryCount, 1);
  assert.ok(receipt.processedAt);
  assert.equal(receipt.errorMessage, null);
});

test('same event identity with a different signed payload cannot replace the processed receipt', async () => {
  const input = event('mismatch');
  assert.equal((await send(input)).statusCode, 200);
  const recorded = await rows(input.id);
  const changed = { ...input, data: { object: { ...input.data.object, status: 'complete' } } };
  const response = await send(changed);
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'STRIPE_EVENT_ID_PAYLOAD_MISMATCH');
  assert.deepEqual(await rows(input.id), recorded);
});

test('an expired processing lease is reclaimed once on the original immutable receipt', async () => {
  const input = event('expired_lease');
  const claim = await billing.claimStripeEvent(input, billing.classifyWebhookEvent(input));
  assert.ok(claim.claimedRowId);
  await db.execute(sql`
    UPDATE billing_events SET metadata=metadata || ${JSON.stringify({
      processingLeaseExpiresAt: new Date(Date.now() - 600_000).toISOString(),
    })}::jsonb WHERE id=${claim.claimedRowId}
  `);
  const recovered = await send(input);
  assert.equal(recovered.statusCode, 200);
  const [receipt] = await rows(input.id);
  assert.equal(receipt.id, claim.claimedRowId);
  assert.equal(receipt.retryCount, 1);
  assert.ok(receipt.processedAt);
  assert.equal((await send(input)).json().action, 'duplicate_ignored');
});

test('wrong secret, expired signature, changed raw bytes, missing signature and missing raw body create no receipt', async () => {
  for (const [suffix, options] of [
    ['wrong_secret', { secret: 'whsec_synthetic_wrong_secret' }],
    ['old_signature', { timestamp: Math.floor(Date.now() / 1000) - 600 }],
    ['missing_signature', { missingSignature: true }],
    ['missing_raw', { target: noRawBodyApp }],
  ] as const) {
    const input = event(suffix);
    assert.equal((await send(input, options)).statusCode, 400);
    assert.equal((await rows(input.id)).length, 0);
  }
  const changed = event('changed_raw');
  assert.equal((await send(changed, { payload: JSON.stringify(changed) + ' ' })).statusCode, 400);
  assert.equal((await rows(changed.id)).length, 0);
});

test('unsupported generic types retain failed receipts and retries while recognized completion retains its cutover behavior', async () => {
  const unsupported = { ...event('unknown'), type: 'checkout.session.synthetic_unsupported' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await send(unsupported);
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().code, 'WEBHOOK_PROCESSING_RETRY_REQUIRED');
  }
  const [failed] = await rows(unsupported.id);
  assert.equal(failed.processedAt, null);
  assert.equal(failed.retryCount, 1);
  const completed = { ...event('legacy_completed'), type: 'checkout.session.completed' };
  const response = await send(completed);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().action, 'legacy_checkout_rejected_after_cutover');
  assert.equal(response.json().shouldPropagate, false);
});

test('addon-classified expiration keeps its existing separate handler and retry state', async () => {
  const input = event('addon', { type: 'addon', user_id: owner.id, module_slug: torqueModule.slug });
  const response = await send(input);
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, 'WEBHOOK_PROCESSING_RETRY_REQUIRED');
  const [receipt] = await rows(input.id);
  assert.equal((receipt.metadata as any).kind, 'addon');
  assert.equal(receipt.processedAt, null);
});

test('a legacy plan-classified Torque expiry stays failed during admin retry and cannot skip shared settlement', async () => {
  const input = event('legacy_torque_retry', {
    operatoros_kind: 'torque_assist_credit', purchase_id: purchaseId,
    tenant_id: owner.currentTenantId!, user_id: owner.id, module_id: torqueModule.id,
    package_key: 'roadside-25000', units: '25000',
  });
  input.data.object.id = torqueCheckoutId;
  const claim = await billing.claimStripeEvent(input, billing.classifyWebhookEvent(input));
  assert.ok(claim.claimedRowId);
  await billing.markStripeEventFailed(claim.claimedRowId!, 'synthetic_legacy_plan_dispatch');
  const retried = await billing.retryBillingEvent(claim.claimedRowId!);
  assert.equal(retried.ok, false);
  const [receipt] = await rows(input.id);
  assert.equal(receipt.processedAt, null);
  assert.ok(receipt.errorMessage);
  const shared = await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_webhook_receipts WHERE provider_event_id=${input.id}`);
  assert.equal(shared.rows[0].count, 0);
  const purchase = await db.execute(sql`SELECT status FROM operatoros_token_purchase_intents WHERE id=${purchaseId}`);
  assert.equal(purchase.rows[0].status, 'checkout_open');
});

test('saved generic expiry retains admin retry behavior and is recoverable through canonical provider redelivery', async () => {
  const input = event('generic_admin_retry');
  const claim = await billing.claimStripeEvent(input, billing.classifyWebhookEvent(input));
  assert.ok(claim.claimedRowId);
  await billing.markStripeEventFailed(claim.claimedRowId!, 'synthetic_legacy_plan_dispatch');
  assert.equal((await billing.retryBillingEvent(claim.claimedRowId!)).ok, false);
  assert.equal((await rows(input.id))[0].processedAt, null);
  assert.equal((await send(input)).statusCode, 200);
  const [receipt] = await rows(input.id);
  assert.equal(receipt.id, claim.claimedRowId);
  assert.equal(receipt.retryCount, 2);
  assert.ok(receipt.processedAt);
});

test('Torque expiration uses the real shared receipt and closes its unpaid purchase without crediting it', async () => {
  const input = event('torque', {
    operatoros_kind: 'torque_assist_credit', purchase_id: purchaseId,
    tenant_id: owner.currentTenantId!, user_id: owner.id, module_id: torqueModule.id,
    package_key: 'roadside-25000', units: '25000',
  });
  input.data.object.id = torqueCheckoutId;
  const response = await send(input);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().kind, 'torque_assist_credit');
  const duplicate = await send(input);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().duplicate, true);
  const result = await db.execute(sql`
    SELECT p.status,p.failure_code,
      (SELECT COUNT(*)::int FROM shared_webhook_receipts r WHERE r.provider_event_id=${input.id} AND r.status='processed') AS receipts,
      (SELECT COUNT(*)::int FROM torqueshed_token_ledger_entries l WHERE l.purchase_intent_id=p.id) AS ledger_entries
    FROM operatoros_token_purchase_intents p WHERE p.id=${purchaseId}
  `);
  assert.equal(result.rows[0].status, 'expired');
  assert.equal(result.rows[0].failure_code, 'CHECKOUT_EXPIRED');
  assert.equal(result.rows[0].receipts, 1);
  assert.equal(result.rows[0].ledger_entries, 0);
  const [receipt] = await rows(input.id);
  assert.match(receipt.eventType, /^torque_/);
  assert.equal((receipt.metadata as any).kind, 'torque_assist_credit');
  assert.ok(receipt.processedAt);
});

test('invalid Torque scope remains rejected instead of becoming a generic expiration acknowledgment', async () => {
  const input = event('torque_foreign', {
    operatoros_kind: 'torque_assist_credit', purchase_id: purchaseId,
    tenant_id: randomUUID(), user_id: owner.id, module_id: torqueModule.id,
    package_key: 'roadside-25000', units: '25000',
  });
  input.data.object.id = torqueCheckoutId;
  const response = await send(input);
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'TORQUE_PAYMENT_SCOPE_CONFLICT');
  assert.equal((await rows(input.id)).length, 0);
});
