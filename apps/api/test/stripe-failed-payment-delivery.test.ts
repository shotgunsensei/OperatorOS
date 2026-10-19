import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import Stripe from 'stripe';
import { actualSavedRetry, actualWebhookHandler, failedPaymentFixture } from './_failed-payment-source.js';
import { tenantId } from './_stack-billing-source.js';

const secret = 'whsec_synthetic_failed_payment_correlation';
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Synthetic delivery boundary timed out')), 5_000);
  })]); } finally { clearTimeout(timer); }
}
async function routeFixture(options: { torque?: boolean; missingRaw?: boolean; persistFailure?: boolean } = {}) {
  const g = failedPaymentFixture();
  const counters = { http: 0, verified: 0, claim: 0, processed: 0, failed: [] as string[], torque: 0 };
  const receipts = new Map<string, { hash: string; processed: boolean; failed: boolean }>();
  const sdk = new Stripe('sk_test_synthetic_failed_payment_only', { maxNetworkRetries: 0, httpClient: {
    getClientName: () => 'blocked-offline',
    makeRequest() { counters.http++; throw new Error('Provider HTTP prohibited'); },
    async makeRequestAsync() { counters.http++; throw new Error('Provider HTTP prohibited'); },
  } as unknown as Stripe.HttpClient });
  const handler = actualWebhookHandler({
    getPaymentProviderAdapter: () => ({ status: { state: 'configured' }, verifyWebhook(raw: Buffer, signature: string) {
      counters.verified++; return sdk.webhooks.constructEvent(raw, signature, secret);
    } }),
    async isTorqueTokenStripeEvent() { return options.torque ?? false; },
    async receiveVerifiedTorqueTokenStripeEvent() { counters.torque++; return { status: 'processed', duplicate: false,
      receipt: { id: 'credit_receipt', tenant_id: tenantId, safe_payload_json: { userId: 'credit_actor' } } }; },
    async recordTorqueStripeEventDispatch() {},
    async claimStripeEvent(event: any) {
      counters.claim++; const hash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
      const old = receipts.get(event.id);
      if (old && old.hash !== hash) return { isDuplicate: true, duplicateState: 'payload_mismatch' };
      if (old?.processed) return { isDuplicate: true, duplicateState: 'processed' };
      if (old && !old.failed) return { isDuplicate: true, duplicateState: 'in_flight' };
      receipts.set(event.id, { hash, processed: false, failed: false });
      return { isDuplicate: false, claimedRowId: event.id };
    },
    async markStripeEventProcessed(id: string) {
      if (options.persistFailure) throw new Error('Synthetic receipt persistence failure');
      counters.processed++; receipts.get(id)!.processed = true;
    },
    async markStripeEventFailed(id: string, reason: string) { counters.failed.push(reason); receipts.get(id)!.failed = true; },
    processWebhookEvent: g.f.billing.processWebhookEvent,
    async processAddonWebhookEvent() { return { handled: false, error: 'unsupported_feature_fixture' }; },
    async processCallCommandNumberWebhookEvent() { return { handled: false, error: 'unsupported_feature_fixture' }; },
    async processCallCommandLaneWebhookEvent() { return { handled: false, error: 'unsupported_feature_fixture' }; },
  });
  const app = Fastify();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    if (!options.missingRaw) (request as typeof request & { rawBody: Buffer }).rawBody = body as Buffer;
    try { done(null, JSON.parse((body as Buffer).toString('utf8'))); } catch (error) { done(error as Error); }
  });
  app.post('/v1/billing/webhook', handler); await app.ready();
  async function send(event = g.event, wrongSignature = false) {
    const payload = JSON.stringify(event);
    return app.inject({ method: 'POST', url: '/v1/billing/webhook', payload,
      headers: { 'content-type': 'application/json', 'stripe-signature': sdk.webhooks.generateTestHeaderString({ payload,
        secret: wrongSignature ? 'whsec_other_synthetic' : secret }) } });
  }
  return { ...g, app, send, counters, receipts };
}

test('signed bound PI delivery, duplicate and payload mismatch preserve immutable receipt and exact tenant subject', async t => {
  const g = await routeFixture(); t.after(() => g.app.close());
  const original = JSON.stringify(g.event);
  const response = await g.send(); assert.equal(response.statusCode, 200);
  assert.equal(response.json().handled, true); assert.equal(g.counters.processed, 1);
  assert.deepEqual(g.f.propagations, [tenantId]); assert.equal(JSON.stringify(g.event), original);
  const reads = g.reads.length; const writes = g.f.operations.filter(op => op.kind === 'write').length;
  assert.equal((await g.send()).json().action, 'duplicate_ignored');
  assert.equal(g.reads.length, reads); assert.equal(g.f.operations.filter(op => op.kind === 'write').length, writes);
  const changed = structuredClone(g.event); changed.data.object.metadata.extra = 'different';
  assert.equal((await g.send(changed)).statusCode, 400);
  assert.equal(g.counters.http, 0);
});

for (const missingRaw of [false, true]) test(`raw signature boundary rejects ${missingRaw ? 'missing bytes' : 'wrong signature'} before claim`, async t => {
  const g = await routeFixture({ missingRaw }); t.after(() => g.app.close());
  assert.equal((await g.send(g.event, !missingRaw)).statusCode, 400);
  assert.equal(g.counters.claim, 0); assert.equal(g.reads.length, 0); assert.equal(g.counters.processed, 0);
});

test('failed correlation is retried on the same identity and only successful recovery is processed', async t => {
  const g = await routeFixture(); t.after(() => g.app.close());
  g.setReadHook(async () => { throw new Error('synthetic_secret_DO_NOT_EXPOSE'); });
  const response = await g.send(); assert.equal(response.statusCode, 503);
  assert.deepEqual(g.counters.failed, ['FAILED_PAYMENT_PROVIDER_UNAVAILABLE']);
  assert.equal(g.counters.processed, 0); assert.deepEqual(g.f.propagations, []);
  assert.doesNotMatch(response.body, /synthetic_secret|ReferenceError/);
  const hash = g.receipts.get(g.event.id)!.hash; g.setReadHook(undefined);
  assert.equal((await g.send()).statusCode, 200);
  assert.equal(g.receipts.get(g.event.id)!.hash, hash); assert.equal(g.counters.processed, 1);
  assert.deepEqual(g.f.propagations, [tenantId]);
});

test('in-flight delivery stays503 while its original correlation is pending', async t => {
  const g = await routeFixture(); t.after(() => g.app.close());
  let reached!: () => void; const held = new Promise<void>(done => { reached = done; });
  let release!: () => void; const gate = new Promise<void>(done => { release = done; });
  g.setReadHook(async kind => { if (kind === 'pi') { reached(); await gate; } });
  const first = g.send();
  try {
    await bounded(held); const duplicate = await g.send();
    assert.equal(duplicate.statusCode, 503); assert.equal(duplicate.json().code, 'WEBHOOK_PROCESSING_IN_PROGRESS');
    release(); assert.equal((await bounded(first)).statusCode, 200);
    assert.equal(g.counters.processed, 1); assert.deepEqual(g.f.propagations, [tenantId]);
  } finally { release(); await bounded(first); }
});

test('receipt persistence failure cannot acknowledge a successfully reconciled event', async t => {
  const g = await routeFixture({ persistFailure: true }); t.after(() => g.app.close());
  assert.equal((await g.send()).statusCode, 400);
  assert.equal(g.receipts.get(g.event.id)!.processed, false); assert.equal(g.counters.processed, 0);
});

test('Torque routing stays first and bypasses generic correlation and claim', async t => {
  const g = await routeFixture({ torque: true }); t.after(() => g.app.close());
  assert.equal((await g.send()).statusCode, 200);
  assert.equal(g.counters.torque, 1); assert.equal(g.counters.claim, 0);
  assert.equal(g.reads.length, 0); assert.deepEqual(g.f.propagations, []);
});

function savedFixture(processed = false, acquired = true) {
  const g = failedPaymentFixture(); const original = structuredClone(g.event);
  const row = { processedAt: processed ? new Date() : null, metadata: { rawEvent: original } };
  const counters = { acquired: 0, processed: 0, failed: [] as string[] };
  const retry = actualSavedRetry({ billingEvents: { id: 'id', processedAt: 'processed_at' },
    db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
      execute: async () => { counters.acquired++; return { rows: acquired ? [{ retry_count: 1 }] : [] }; },
      update: () => ({ set: () => ({ where: async () => undefined }) }) },
    eq: () => ({}), sql: () => ({}), processWebhookEvent: g.f.billing.processWebhookEvent,
    async markStripeEventProcessed() { counters.processed++; },
    async markStripeEventFailed(_id: string, reason: string) { counters.failed.push(reason); },
  });
  return { ...g, counters, row, retry: () => retry('saved_failed_payment') };
}
test('saved verified PI retry uses actual correlation and exact tenant propagation', async () => {
  const g = savedFixture(); const before = JSON.stringify(g.row.metadata.rawEvent);
  const response = await g.retry(); assert.equal(response.ok, true); assert.equal(response.replayed, true);
  assert.equal(g.counters.processed, 1); assert.deepEqual(g.counters.failed, []);
  assert.deepEqual(g.f.propagations, [tenantId]); assert.equal(JSON.stringify(g.row.metadata.rawEvent), before);
});
test('saved verified unresolved PI stays failed with exact business reason', async () => {
  const g = savedFixture(); g.state.pages[0].data = [];
  assert.equal((await g.retry()).ok, false);
  assert.deepEqual(g.counters.failed, ['replay_failed: FAILED_PAYMENT_INVOICE_AMBIGUOUS']);
  assert.equal(g.counters.processed, 0); assert.deepEqual(g.f.propagations, []);
});
for (const processed of [false, true]) test(`saved retry ${processed ? 'processed guard' : 'in-flight lease'} prevents redispatch`, async () => {
  const g = savedFixture(processed, false); const response = await g.retry();
  assert.equal(response.replayed, false); assert.equal(response.ok, processed);
  assert.equal(g.reads.length, 0); assert.deepEqual(g.f.propagations, []);
});
