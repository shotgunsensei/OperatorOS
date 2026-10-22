import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { OFFICEEXIT_CAPABILITIES, OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION } from '@operatoros/sdk';
import { deliverOfficeExitPurchases } from '../src/lib/tool-fulfillment.js';
import { verifyToolBridgeAssertion } from '../src/lib/tool-bridge-assertion.js';
import type { ToolFulfillment, ToolPurchase } from '../src/lib/tool-purchase-store.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = 1_800_000_000_000;
const context = { issuer: 'https://authority.example.test', audience: 'https://office.example.test', keyId: 'ephemeral-test-fixture' };
const signing = { ...context, privateKey: keys.privateKey };
const verifying = { ...context, publicKey: keys.publicKey };
function fixture() {
  const order: ToolPurchase = {
    id: '11111111-1111-4111-8111-111111111111', tenantId: 'fixture-tenant', userId: 'fixture-owner', toolSlug: 'officeexit',
    requestKey: 'fixture-request', providerMode: 'test', providerAccountId: 'acct_fixture', status: 'paid', revision: 2,
    customerId: 'cus_fixture', checkoutSessionId: 'cs_fixture', paymentIntentId: 'pi_fixture', chargeId: 'ch_fixture',
    policyReviewRequired: false, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    snapshot: { offerVersion: 'synthetic-release-only', providerPriceId: 'price_fixture', providerProductId: 'prod_fixture',
      amountMinor: 9900, currency: 'usd', licenseTermsVersion: OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION, licenseUnit: 'tenant', licenseAllowance: 1,
      coverage: 'entire_tenant', officeexitGrant: { edition: 'MSP Pro', coverage: 'entire_tenant', capabilities: [...OFFICEEXIT_CAPABILITIES] } },
  };
  const row: ToolFulfillment = { id: order.id, tenantId: order.tenantId, purchaseId: order.id, toolSlug: 'officeexit', revision: 2,
    payload: { contractVersion: 1, moduleSlug: 'officeexit', purchaseKind: 'one_time', operatorosTenantId: order.tenantId,
      purchaseId: order.id, revision: 2, state: 'active', grant: { ...order.snapshot.officeexitGrant!, licenseTermsVersion: OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION } },
    status: 'leased', attempts: 1, leaseToken: '22222222-2222-4222-8222-222222222222', leaseExpiresAt: new Date(now + 60_000).toISOString() };
  const calls: { claim: unknown[]; sent: unknown[]; ack: unknown[]; retry: unknown[] } = { claim: [], sent: [], ack: [], retry: [] };
  let response = () => new Response(JSON.stringify({ applied: true, reason: 'updated' }), { status: 200 });
  let current: ToolPurchase | null = order;
  let ack = true;
  const dependencies = {
    now: () => now,
    store: {
      async claimToolFulfillment(input: unknown) { calls.claim.push(input); return [row]; },
      async getTenantToolPurchase(tenant: string, id: string) { assert.equal(tenant, order.tenantId); assert.equal(id, order.id); return current; },
      async completeToolFulfillment(input: unknown) { calls.ack.push(input); return ack; },
      async retryToolFulfillment(input: unknown) { calls.retry.push(input); return true; },
    },
    fetch: (async (url: unknown, options: RequestInit) => {
      assert.equal(url, context.audience + '/api/operatoros/fulfillment');
      assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
      assert.ok(options.signal); assert.deepEqual(options.headers, { 'Content-Type': 'application/json', Accept: 'application/json' });
      const body = JSON.parse(options.body as string); assert.deepEqual(Object.keys(body), ['assertion']);
      const claims = verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', body.assertion, Math.floor(now / 1000));
      calls.sent.push(claims.data); return response();
    }) as typeof globalThis.fetch,
  };
  return { order, row, calls, dependencies, setCurrent(value: ToolPurchase | null) { current = value; },
    setResponse(value: typeof response) { response = value; }, setAck(value: boolean) { ack = value; } };
}
test('closed delivery performs no store, signing or transport operation', async () => {
  const f = fixture();
  assert.deepEqual(await deliverOfficeExitPurchases({ enabled: false }, f.dependencies), { enabled: false, claimed: 0, delivered: 0, deferred: 0 });
  assert.deepEqual(f.calls, { claim: [], sent: [], ack: [], retry: [] });
});
test('current paid whole-tenant grant is signed and acknowledged with its exact revision/lease', async () => {
  const f = fixture();
  assert.deepEqual(await deliverOfficeExitPurchases({ enabled: true, signing }, f.dependencies), { enabled: true, claimed: 1, delivered: 1, deferred: 0 });
  assert.deepEqual(f.calls.sent, [f.row.payload]);
  assert.deepEqual(f.calls.ack, [{ tenantId: f.order.tenantId, purchaseId: f.order.id, revision: 2, leaseToken: f.row.leaseToken }]);
  assert.equal(f.calls.retry.length, 0);
  const delivered = (f.calls.sent[0] as { grant: { edition: string; capabilities: string[] } }).grant;
  assert.equal(delivered.edition, 'MSP Pro'); assert.equal(delivered.capabilities.length, 10);
  assert.ok(delivered.capabilities.includes('publisherRescue'));
});
for (const status of ['refunded', 'disputed', 'cancelled'] as const) {
  test(`${status} delivers no positive grant`, async () => {
    const f = fixture(); f.order.status = status; f.row.payload.state = status; f.row.payload.grant = null;
    assert.equal((await deliverOfficeExitPurchases({ enabled: true, signing }, f.dependencies)).delivered, 1);
    assert.equal((f.calls.sent[0] as { grant: unknown }).grant, null);
  });
}
for (const change of ['revoked', 'foreign', 'missing', 'grant'] as const) {
  test(`stale or changed ${change} authority cannot be signed`, async () => {
    const f = fixture();
    if (change === 'revoked') f.setCurrent({ ...f.order, status: 'refunded', revision: 3 });
    if (change === 'foreign') f.row.payload.operatorosTenantId = 'other-tenant';
    if (change === 'missing') f.setCurrent(null);
    if (change === 'grant') f.row.payload.grant!.licenseTermsVersion = 'other-terms';
    const result = await deliverOfficeExitPurchases({ enabled: true, signing }, f.dependencies);
    assert.equal(result.deferred, 1); assert.equal(f.calls.sent.length, 0); assert.equal(f.calls.ack.length, 0);
    assert.equal(f.calls.retry.length, 1);
  });
}
for (const body of [null, {}, { applied: true, reason: 'stale' }, { applied: false, reason: 'stale' }, { applied: true, reason: 'updated', extra: 'x' }]) {
  test(`unconfirmed consumer response ${JSON.stringify(body)} cannot acknowledge delivery`, async () => {
    const f = fixture(); f.setResponse(() => new Response(JSON.stringify(body), { status: 200 }));
    assert.equal((await deliverOfficeExitPurchases({ enabled: true, signing }, f.dependencies)).deferred, 1);
    assert.equal(f.calls.ack.length, 0); assert.equal(f.calls.retry.length, 1);
    assert.doesNotMatch(JSON.stringify(f.calls.retry), /assertion|secret|https:/);
  });
}
test('duplicate response is safe while a lost revision/lease acknowledgement stays deferred', async () => {
  const f = fixture(); f.setResponse(() => new Response(JSON.stringify({ applied: false, reason: 'duplicate' }), { status: 200 }));
  f.setAck(false);
  assert.equal((await deliverOfficeExitPurchases({ enabled: true, signing }, f.dependencies)).deferred, 1);
  assert.equal(f.calls.retry.length, 0);
});
test('redirect/oversize/failed transport never becomes delivery or leaks its error', async () => {
  for (const response of [() => new Response('', { status: 302 }), () => new Response('x'.repeat(1025)), () => { throw new Error('secret provider body'); }]) {
    const f = fixture(); f.setResponse(response);
    assert.equal((await deliverOfficeExitPurchases({ enabled: true, signing }, f.dependencies)).deferred, 1);
    assert.equal(f.calls.ack.length, 0); assert.doesNotMatch(JSON.stringify(f.calls.retry), /secret|provider body/);
  }
});
test('noncanonical origin fails before claiming work', async () => {
  const f = fixture();
  await assert.rejects(deliverOfficeExitPurchases({ enabled: true, signing: { ...signing, audience: 'http://127.0.0.1' } }, f.dependencies));
  assert.equal(f.calls.claim.length, 0);
});
