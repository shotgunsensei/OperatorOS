import './_billing-webhook-env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { db, databasePool } from '../src/db.js';
import { billingEvents, tenantApplicationSubscriptions, tenantEntitlements } from '../src/schema.js';
import { cleanupUser, createTestUser, ensureSchemaReady } from './_setup.js';

// Intentionally no skip/fallback URL: the shared fixture validates the pool's
// captured disposable loopback target before DDL. This file needs release PG.
const prefix = `evt_stack_fence_${randomUUID().replaceAll('-', '')}`;
const secret = 'whsec_synthetic_disposable_billing_fixture';
let app: FastifyInstance;
let owner: Awaited<ReturnType<typeof createTestUser>>;
let billing: typeof import('../src/lib/billing-service.js');
let product: typeof import('../src/lib/product-entitlements.js');
let fence: typeof import('../src/lib/stack-mutation-fence.js');
let signToken: typeof import('../src/lib/auth.js')['signToken'];
let provider: any;
let providerHook: (() => Promise<void>) | undefined;
let catalogHook: (() => Promise<void>) | undefined;
let providerHttpCalls = 0;
let providerRetrieveCalls = 0;
let externalFetchCalls = 0;
const sdk = new Stripe('sk_test_synthetic_stack_fence_only', { maxNetworkRetries: 0, httpClient: {
  getClientName: () => 'blocked-offline',
  makeRequest() { providerHttpCalls++; throw new Error('Provider networking prohibited'); },
  async makeRequestAsync() { providerHttpCalls++; throw new Error('Provider networking prohibited'); },
} as unknown as Stripe.HttpClient });
function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Synthetic concurrency boundary timed out')), 8_000);
  })]); } finally { clearTimeout(timer); }
}
function metadata(row: typeof tenantApplicationSubscriptions.$inferSelect) {
  return { billing_model: 'core_product_stack', billing_interval: 'month', tenant_id: row.tenantId,
    user_id: row.initiatedByUserId!, internal_application_subscription_id: row.id,
    checkout_attempt_id: String((row.metadata as any).checkout_attempt_id), selected_core_product: row.coreProduct,
    selected_free_companion_module: row.includedCompanionKey, additional_module_keys: row.additionalModuleKeys.join(','),
    additional_seats: String(row.additionalSeats) };
}
function providerFor(row: typeof tenantApplicationSubscriptions.$inferSelect, status = 'active', id = `sub_${row.id}`) {
  return { id, customer: row.stripeCustomerId, status, cancel_at_period_end: false, metadata: metadata(row),
    current_period_start: 1700000000, current_period_end: 1702678400,
    items: { data: [{ price: { id: row.corePriceId }, quantity: 1 }] } };
}
function sessionFor(row: typeof tenantApplicationSubscriptions.$inferSelect, payment = 'unpaid', subscriptionId = `sub_${row.id}`) {
  return { id: row.stripeCheckoutSessionId, mode: 'subscription', status: 'complete', payment_status: payment,
    subscription: subscriptionId, customer: row.stripeCustomerId, metadata: metadata(row) };
}
async function event(type: string, object: any, id = `${prefix}_${randomUUID()}`) {
  const input = { id, type, livemode: false, data: { object } }; const payload = JSON.stringify(input);
  return app.inject({ method: 'POST', url: '/v1/billing/webhook', payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': sdk.webhooks.generateTestHeaderString({ payload, secret }) } });
}
async function ownerCheckout() {
  return app.inject({ method: 'POST', url: '/v1/billing/stack/checkout',
    headers: { authorization: `Bearer ${signToken({ userId: owner.id, email: owner.email, role: owner.role, sessionType: 'platform' })}`,
      'x-tenant-id': owner.currentTenantId! }, payload: { coreProduct: 'techdeck', freeCompanionModule: 'snapproofos' } });
}
async function reset() {
  providerHook = undefined; catalogHook = undefined;
  await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, owner.currentTenantId!));
  await db.delete(tenantApplicationSubscriptions).where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId!));
  await db.execute(sql`DELETE FROM billing_events WHERE tenant_id=${owner.currentTenantId}`);
  await db.execute(sql`DELETE FROM admin_audit_logs WHERE tenant_id=${owner.currentTenantId}`);
  await db.execute(sql`UPDATE tenants SET seat_limit=0, metadata='{}'::jsonb WHERE id=${owner.currentTenantId}`);
  const [row] = await db.insert(tenantApplicationSubscriptions).values({ tenantId: owner.currentTenantId!,
    initiatedByUserId: owner.id, coreProduct: 'techdeck', includedCompanionKey: 'snapproofos',
    stripeCustomerId: `cus_fence_${owner.id}`, stripeCheckoutSessionId: `cs_old_${randomUUID()}`,
    corePriceId: 'price_fence_core', metadata: { billing_model: 'core_product_stack', billing_interval: 'month', checkout_attempt_id: randomUUID() } }).returning();
  provider = providerFor(row); return row;
}
async function projection(connection: { query: (text: string, values: any[]) => Promise<any> } = databasePool) {
  // Receipt retry/lease changes are expected. Compare only commercial effects.
  const result = await connection.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM tenant_application_subscriptions s WHERE s.tenant_id=$1) AS stack,
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM tenant_entitlements e WHERE e.tenant_id=$1) AS grants,
    (SELECT to_jsonb(t) FROM tenants t WHERE t.id=$1) AS seats,
    (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM billing_events b WHERE b.tenant_id=$1 AND b.stripe_event_id IS NULL) AS events,
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM admin_audit_logs a WHERE a.tenant_id=$1
      AND a.action IN ('core_product_stack_activated','core_product_stack_checkout_created')) AS audit`, [owner.currentTenantId]);
  return result.rows[0];
}

before(async () => {
  process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'test'; process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE = '0';
  process.env.STRIPE_MODE = 'test'; process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_stack_fence_only';
  process.env.STRIPE_PRICE_TECHDECK_MONTHLY = 'price_fence_core';
  await ensureSchemaReady(); // Refuses an absent/remote/persistent captured pool target.
  globalThis.fetch = async () => { externalFetchCalls++; throw new Error('External networking prohibited in Stack fixture'); };
  owner = await createTestUser();
  const receivers = await db.execute(sql`SELECT COUNT(*)::int AS count FROM tenant_modules WHERE tenant_id=${owner.currentTenantId}`);
  assert.equal(receivers.rows[0].count, 0, 'the isolated tenant must have no external propagation receivers');
  billing = await import('../src/lib/billing-service.js');
  product = await import('../src/lib/product-entitlements.js'); fence = await import('../src/lib/stack-mutation-fence.js');
  ({ signToken } = await import('../src/lib/auth.js'));
  billing.__setStripeTestOverrides({ enabled: true, client: {
    webhooks: sdk.webhooks,
    subscriptions: { async retrieve(id: string) {
      providerRetrieveCalls++;
      assert.equal(provider.id, id); const snapshot = structuredClone(provider); await providerHook?.(); return snapshot;
    } },
    prices: { async retrieve(id: string) {
      await catalogHook?.(); return { id, active: true, currency: 'usd', unit_amount: 9900, livemode: false,
        billing_scheme: 'per_unit', transform_quantity: null, type: 'recurring',
        recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
    } },
    checkout: { sessions: {
      async retrieve(id: string) { return { id, mode: 'subscription', status: 'complete', payment_status: 'unpaid' }; },
      async create() { return { id: `cs_new_${randomUUID()}`, url: 'https://checkout.example.invalid/synthetic' }; },
    } },
  } });
  const { registerBillingRoutes } = await import('../src/routes/billing-routes.js');
  app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    (request as typeof request & { rawBody: Buffer }).rawBody = body as Buffer;
    try { done(null, JSON.parse((body as Buffer).toString('utf8'))); } catch (error) { done(error as Error); }
  });
  await registerBillingRoutes(app); await app.ready();
});
after(async () => {
  providerHook = undefined; catalogHook = undefined;
  if (app) await app.close(); billing?.__setStripeTestOverrides(null);
  if (owner) {
    await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, owner.currentTenantId!));
    await db.delete(tenantApplicationSubscriptions).where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId!));
    await db.execute(sql`DELETE FROM admin_audit_logs WHERE tenant_id=${owner.currentTenantId}`);
    await cleanupUser(owner.id);
  }
  await db.execute(sql`DELETE FROM billing_events WHERE stripe_event_id LIKE ${`${prefix}%`}`);
  // Keep fetch blocked for this isolated test process, including any late
  // fire-and-forget propagation callback. No host/global settings are changed.
  assert.equal(providerHttpCalls, 0);
  assert.equal(externalFetchCalls, 0);
});

for (const at of ['provider', 'catalog']) {
  test(`PostgreSQL: deferred old ${at} event preserves actual owner replacement and new paid projection`, { timeout: 30_000 }, async () => {
    const row = await reset(); provider = providerFor(row, 'canceled');
    const reached = gate(); const resume = gate(); let calls = 0;
    const hook = async () => { if (++calls === 1) { reached.resolve(); await bounded(resume.promise); } };
    if (at === 'provider') providerHook = hook; else catalogHook = hook;
    const oldEventId = `${prefix}_old_${randomUUID()}`;
    const oldObject = providerFor(row, 'canceled');
    const old = event('customer.subscription.updated', oldObject, oldEventId);
    // Hold a distinct acquired connection to verify committed projections.
    const observer = await databasePool.connect();
    try {
      await bounded(reached.promise);
      const before = await projection(observer);
      const blocked = await ownerCheckout(); assert.equal(blocked.statusCode, 409, blocked.body);
      assert.equal(blocked.json().code, 'STACK_FLAGSHIP_LIMIT'); assert.deepEqual(await projection(observer), before);
      const removed = await event('customer.subscription.deleted', providerFor(row, 'canceled'));
      assert.equal(removed.statusCode, 200, removed.body);
      const created = await ownerCheckout(); assert.equal(created.statusCode, 200, created.body);
      const [next] = await db.select().from(tenantApplicationSubscriptions).where(eq(tenantApplicationSubscriptions.id, row.id));
      assert.notEqual((next.metadata as any).checkout_attempt_id, (row.metadata as any).checkout_attempt_id);
      assert.equal(next.stripeCheckoutSessionId, created.json().sessionId);
      const nextSubId = `sub_new_${randomUUID()}`; provider = providerFor(next, 'active', nextSubId);
      const paid = await event('checkout.session.async_payment_succeeded', sessionFor(next, 'paid', nextSubId));
      assert.equal(paid.statusCode, 200, paid.body); assert.equal(paid.json().action, 'core_product_stack_activated');
      const current = await projection(observer); resume.resolve();
      const rejected = await bounded(old); assert.equal(rejected.statusCode, 503, rejected.body);
      assert.deepEqual(await projection(observer), current);
      const [receipt] = await db.select().from(billingEvents).where(eq(billingEvents.stripeEventId, oldEventId));
      assert.equal(receipt.processedAt, null); assert.ok(receipt.errorMessage);
      const retried = await event('customer.subscription.updated', oldObject, oldEventId);
      assert.equal(retried.statusCode, 200, retried.body); assert.equal(retried.json().shouldPropagate, false);
      assert.deepEqual(await projection(observer), current);
    } finally { resume.resolve(); await bounded(old); observer.release(); }
  });
}

test('PostgreSQL: signed async failure has durable receipt and no initial grant; provider failure retries', async () => {
  const row = await reset(); const id = `${prefix}_async_${randomUUID()}`;
  const first = await event('checkout.session.async_payment_failed', sessionFor(row), id);
  assert.equal(first.statusCode, 200, first.body); assert.equal(first.json().shouldPropagate, false);
  const [pending] = await db.select().from(tenantApplicationSubscriptions).where(eq(tenantApplicationSubscriptions.id, row.id));
  assert.equal(pending.status, 'incomplete');
  const grants = await db.select().from(tenantEntitlements).where(eq(tenantEntitlements.tenantId, row.tenantId));
  assert.equal(grants.length, 0);
  assert.equal((await event('checkout.session.async_payment_failed', sessionFor(row), id)).json().action, 'duplicate_ignored');
  providerHook = async () => { throw new Error('Synthetic provider unavailable'); };
  const failingId = `${prefix}_unavailable_${randomUUID()}`;
  const unavailable = await event('checkout.session.async_payment_failed', sessionFor(row), failingId);
  assert.equal(unavailable.statusCode, 503, unavailable.body);
  const [receipt] = await db.select().from(billingEvents).where(eq(billingEvents.stripeEventId, failingId));
  assert.equal(receipt.processedAt, null); assert.ok(receipt.errorMessage);
  providerHook = undefined;
});

test('PostgreSQL: actual helper and final activation roll back with their shared executor', async () => {
  const row = await reset(); const before = await projection();
  await assert.rejects(fence.withStackMutation(fence.captureStackMutationSnapshot(row), async tx => {
    await product.grantStackEntitlements({ tenantId: row.tenantId, stripeSubscriptionId: `sub_${row.id}`,
      coreProduct: 'techdeck', freeCompanionModule: 'snapproofos', applicationSubscriptionId: row.id }, { executor: tx });
    await tx.insert(billingEvents).values({ userId: owner.id, tenantId: row.tenantId, eventType: 'synthetic_rollback' });
    throw new Error('Synthetic post-grant transaction failure');
  }), /Synthetic post-grant/);
  assert.deepEqual(await projection(), before);
});

test('PostgreSQL: supplied deactivation stays in the trusted tenant despite a foreign duplicate-subscription grant', { timeout: 30_000 }, async () => {
  const row = await reset(); const foreign = await createTestUser(); const foreignSub = `sub_foreign_${randomUUID()}`;
  const blocker = await databasePool.connect();
  try {
    const [foreignStack] = await db.insert(tenantApplicationSubscriptions).values({ tenantId: foreign.currentTenantId!,
      initiatedByUserId: foreign.id, coreProduct: 'techdeck', includedCompanionKey: 'snapproofos',
      status: 'active', stripeCustomerId: `cus_foreign_${foreign.id}`, stripeSubscriptionId: foreignSub,
      corePriceId: 'price_fence_foreign_core' }).returning();
    await db.insert(tenantEntitlements).values({ tenantId: foreign.currentTenantId!, entitlementKey: 'techdeck',
      entitlementType: 'core_product', source: 'stripe', stripeSubscriptionId: `sub_${row.id}` });
    await db.execute(sql`UPDATE tenants SET seat_limit=77 WHERE id=${foreign.currentTenantId}`);
    const beforeForeign = await projection(); const reads = providerRetrieveCalls;
    const wrongTenantSession = sessionFor(row);
    wrongTenantSession.metadata.tenant_id = foreign.currentTenantId!;
    const denied = await event('checkout.session.async_payment_failed', wrongTenantSession);
    assert.equal(denied.statusCode, 503, denied.body);
    assert.equal(providerRetrieveCalls, reads, 'a foreign tenant reference must not reach provider reconciliation or fallback');
    assert.deepEqual(await projection(), beforeForeign);
    const before = await databasePool.query('SELECT to_jsonb(e) AS grant FROM tenant_entitlements e WHERE tenant_id=$1', [foreign.currentTenantId]);
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM tenant_application_subscriptions WHERE id=$1 FOR UPDATE', [foreignStack.id]);
    // Holding the foreign Stack proves the trusted path does not discover B
    // and attempt a second, foreign row lock after locking its owned Stack A.
    const response = await bounded(event('customer.subscription.deleted', providerFor(row, 'canceled')));
    assert.equal(response.statusCode, 200, response.body);
    const after = await databasePool.query('SELECT to_jsonb(e) AS grant FROM tenant_entitlements e WHERE tenant_id=$1', [foreign.currentTenantId]);
    assert.deepEqual(after.rows, before.rows);
    const seats = await databasePool.query('SELECT seat_limit FROM tenants WHERE id=$1', [foreign.currentTenantId]);
    assert.equal(seats.rows[0].seat_limit, 77);
  } finally {
    await blocker.query('ROLLBACK'); blocker.release();
    await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, foreign.currentTenantId!));
    await db.delete(tenantApplicationSubscriptions).where(eq(tenantApplicationSubscriptions.tenantId, foreign.currentTenantId!));
    await cleanupUser(foreign.id);
  }
});

test('PostgreSQL: separate row-lock holder commits terminal state before paid activation; no late initial grant', { timeout: 30_000 }, async () => {
  const row = await reset(); const reached = gate(); const resume = gate();
  providerHook = async () => { reached.resolve(); await bounded(resume.promise); };
  const paid = event('checkout.session.async_payment_succeeded', sessionFor(row, 'paid'));
  const blocker = await databasePool.connect();
  try {
    await bounded(reached.promise); await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM tenant_application_subscriptions WHERE id=$1 FOR UPDATE', [row.id]);
    const pid = Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    resume.resolve();
    const deadline = Date.now() + 5_000; let blocked = false;
    while (Date.now() < deadline) {
      const result = await databasePool.query('SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked', [pid]);
      if (result.rows[0].blocked) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(blocked, true, 'paid service must wait on the separately acquired Stack row lock');
    await blocker.query("UPDATE tenant_application_subscriptions SET status='canceled', updated_at=now() WHERE id=$1", [row.id]);
    await blocker.query('COMMIT');
    const response = await bounded(paid); assert.equal(response.statusCode, 503, response.body);
    const grants = await db.select().from(tenantEntitlements).where(eq(tenantEntitlements.tenantId, row.tenantId));
    assert.equal(grants.length, 0);
  } finally { resume.resolve(); await blocker.query('ROLLBACK'); blocker.release(); await bounded(paid); providerHook = undefined; }
});

test('PostgreSQL: paid helper owns Stack lock before grants; stale terminal continuation cannot undo committed projection', { timeout: 30_000 }, async () => {
  const row = await reset(); const reached = gate(); const resume = gate(); let lockPid = 0;
  const paid = fence.withStackMutation(fence.captureStackMutationSnapshot(row), async tx => {
    lockPid = Number((await tx.execute(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid);
    await product.grantStackEntitlements({ tenantId: row.tenantId, stripeSubscriptionId: `sub_${row.id}`,
      coreProduct: 'techdeck', freeCompanionModule: 'snapproofos', applicationSubscriptionId: row.id }, { executor: tx });
    reached.resolve(); await bounded(resume.promise);
  });
  let old: ReturnType<typeof event> | undefined;
  try {
    await bounded(reached.promise); provider = providerFor(row, 'canceled');
    old = event('customer.subscription.updated', provider);
    const deadline = Date.now() + 5_000; let blocked = false;
    while (Date.now() < deadline) {
      const result = await databasePool.query('SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked', [lockPid]);
      if (result.rows[0].blocked) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(blocked, true); resume.resolve(); await bounded(paid);
    const current = await projection(); const response = await bounded(old); assert.equal(response.statusCode, 503, response.body);
    assert.deepEqual(await projection(), current);
  } finally { resume.resolve(); await bounded(paid); if (old) await bounded(old); }
});
