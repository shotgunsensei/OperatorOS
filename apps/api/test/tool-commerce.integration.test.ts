import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import Stripe from 'stripe';
import { OFFICEEXIT_CAPABILITIES, OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION } from '@operatoros/sdk';
import { databasePool } from '../src/db.js';
import { signToken } from '../src/lib/auth.js';
import { ensureToolPurchaseTables, verifyToolPurchaseTables } from '../src/lib/tool-purchase-db-init.js';
import * as store from '../src/lib/tool-purchase-store.js';
import { createToolPurchaseProvider, type ToolPurchaseStripeClient } from '../src/lib/tool-purchase-provider.js';
import { verifyToolBridgeAssertion } from '../src/lib/tool-bridge-assertion.js';
import { deliverOfficeExitPurchases } from '../src/lib/tool-fulfillment.js';
import { CLOSED_TOOL_COMMERCE } from '../src/lib/tool-commerce.js';
import { registerToolModuleRoutes } from '../src/routes/tool-module-routes.js';
import { createTestUser, cleanupUser, ensureSchemaReady } from './_setup.js';

type User = Awaited<ReturnType<typeof createTestUser>>;
let owner: User, member: User, outsider: User, support: User;
let app: import('fastify').FastifyInstance, prepared: import('fastify').FastifyInstance;
let artifactRoot = '';
const syntheticArtifact = Buffer.from('PK\x03\x04inert-byte-delivery-fixture-not-an-accepted-release');
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const authority = { issuer: 'https://authority.example.test', audience: 'https://office.example.test', keyId: 'memory-test-only' };
const signing = { ...authority, privateKey: keys.privateKey };
const verifying = { ...authority, publicKey: keys.publicKey };
const snapshot: store.ToolPurchaseSnapshot = {
  offerVersion: 'isolated-not-approved-release', providerPriceId: 'price_fixture', providerProductId: 'prod_fixture',
  amountMinor: 9900, currency: 'usd', licenseTermsVersion: OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION, licenseUnit: 'tenant',
  licenseAllowance: 1, coverage: 'entire_tenant', officeexitGrant: { edition: 'MSP Pro', coverage: 'entire_tenant',
    capabilities: [...OFFICEEXIT_CAPABILITIES] },
};
const headers = (user: User, tenant = owner.currentTenantId) => ({
  authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, sessionType: 'platform' })}`,
  'x-tenant-id': tenant, origin: authority.issuer,
});
let session: Record<string, any> | null = null;
let metadata: Record<string, string> = {};
let paid = false, refunded = false;
let transferDuringInspect = false;
const relayRequestId = '44444444-4444-4444-8444-444444444444';
const selectedOffice = { officeexitOrganizationId: '22222222-2222-4222-8222-222222222222', officeexitUserId: '33333333-3333-4333-8333-333333333333' };
let providerCalls = 0;
const price = { id: 'price_fixture', product: 'prod_fixture', type: 'one_time', recurring: null,
  unit_amount: 9900, currency: 'usd', active: true, livemode: false };
const charge = () => ({ id: 'ch_fixture', payment_intent: 'pi_fixture', customer: 'cus_fixture', amount: 9900,
  currency: 'usd', livemode: false, paid, amount_refunded: refunded ? 9900 : 0, disputed: false });
const intent = () => ({ id: 'pi_fixture', customer: 'cus_fixture', amount: 9900, amount_received: paid ? 9900 : 0,
  currency: 'usd', livemode: false, status: paid ? 'succeeded' : 'requires_payment_method', metadata,
  latest_charge: charge() });
const providerClient: ToolPurchaseStripeClient = {
  accounts: { async retrieve() { providerCalls++; return { id: 'acct_fixture' }; } },
  prices: { async retrieve() { providerCalls++; return price; } },
  products: { async retrieve() { providerCalls++; return { id: 'prod_fixture', active: true, livemode: false }; } },
  customers: { async create() { providerCalls++; return { id: 'cus_fixture' }; } },
  checkout: { sessions: {
    async create(raw) {
      providerCalls++;
      const input = raw as { mode: string; metadata: Record<string, string>; line_items: unknown };
      assert.equal(input.mode, 'payment'); assert.deepEqual(input.line_items, [{ price: 'price_fixture', quantity: 1 }]);
      metadata = input.metadata;
      session = { id: 'cs_fixture', customer: 'cus_fixture', mode: 'payment', subscription: null, livemode: false,
        amount_total: 9900, amount_subtotal: 9900, currency: 'usd', metadata, payment_intent: 'pi_fixture',
        status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/cs_fixture',
        line_items: { has_more: false, data: [{ quantity: 1, price }] } };
      return session;
    },
    async retrieve() { providerCalls++; return { ...session, status: paid ? 'complete' : 'open', payment_status: paid ? 'paid' : 'unpaid' }; },
  } },
  paymentIntents: { async retrieve() { providerCalls++; return intent(); } },
  charges: { async retrieve() { providerCalls++; return charge(); } },
};
const provider = createToolPurchaseProvider({ store, client: () => providerClient, runtimeMode: () => 'test', assertWebhookReady() {} });
const stripe = new Stripe('sk_test_inert_signature_fixture_not_a_real_key');
const webhookSecret = 'whsec_inert_memory_only_no_live_authority';
async function receive(type: string) {
  const event = { id: 'evt_' + randomUUID().replaceAll('-', ''), object: 'event', type, livemode: false,
    data: { object: type === 'charge.refunded' ? charge() : { ...session, metadata } } };
  const rawBody = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: webhookSecret });
  const verified = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  return provider.receiveVerifiedEvent({ event: verified, rawBody });
}
before(async () => {
  await ensureSchemaReady(); await ensureToolPurchaseTables(); await verifyToolPurchaseTables();
  owner = await createTestUser(); member = await createTestUser(); outsider = await createTestUser(); support = await createTestUser();
  await databasePool.query("UPDATE tenants SET seat_limit=0 WHERE id=$1", [owner.currentTenantId]);
  await databasePool.query("INSERT INTO tenant_users(tenant_id,user_id,role) VALUES($1,$2,'member')", [owner.currentTenantId, member.id]);
  await databasePool.query("UPDATE users SET platform_role='super_admin' WHERE id=$1", [support.id]);
  const fastify = (await import('fastify')).default, cookie = (await import('@fastify/cookie')).default;
  app = fastify(); await app.register(cookie); await registerToolModuleRoutes(app); await app.ready();
  artifactRoot = await mkdtemp(join(tmpdir(), 'operatoros-tool-byte-fixture-'));
  const artifactPath = join(artifactRoot, 'synthetic.zip'); await writeFile(artifactPath, syntheticArtifact);
  prepared = fastify(); await prepared.register(cookie);
  await registerToolModuleRoutes(prepared, {
    artifacts: { officeexit: { approvedRoot: artifactRoot, filePath: artifactPath,
      expectedSha256: createHash('sha256').update(syntheticArtifact).digest('hex'), expectedBytes: syntheticArtifact.length,
      version: '1.0.0-fixture', archiveValidationReceiptSha256: createHash('sha256').update('inert-fixture-reference-not-release-acceptance').digest('hex') } },
    checkout: { enabled: true, publicOrigin: authority.issuer, offers: { officeexit: { providerMode: 'test', providerAccountId: 'acct_fixture', snapshot } } },
    officeexitLink: { enabled: true, signing },
  }, { checkout: provider.createCheckout, fetch: (async (url, options) => {
    const body = JSON.parse(options!.body as string);
    if (url === authority.audience + '/api/operatoros/link-requests/inspect') {
      const claims = verifyToolBridgeAssertion(verifying, 'officeexit.mapping.inspect', body.assertion);
      assert.equal((claims.data as { requestId: string }).requestId, relayRequestId);
      if (transferDuringInspect) await databasePool.query('UPDATE tenants SET owner_user_id=$2 WHERE id=$1', [owner.currentTenantId, member.id]);
      return new Response(JSON.stringify({ requestId: relayRequestId, ...selectedOffice, officeexitOrganizationName: 'Synthetic Office organization', expiresAt: new Date(Date.now() + 240_000).toISOString() }));
    }
    assert.equal(url, authority.audience + '/api/operatoros/link-requests/propose');
    assert.equal(body.requestId, relayRequestId);
    const claims = verifyToolBridgeAssertion(verifying, 'officeexit.mapping.link', body.assertion);
    assert.equal(claims.data.operatorosTenantId, owner.currentTenantId);
    return new Response(JSON.stringify({ pendingConfirmation: true }));
  }) as typeof globalThis.fetch });
  await prepared.ready();
});
after(async () => {
  await app?.close(); await prepared?.close();
  if (artifactRoot) {
    assert.ok(resolve(artifactRoot).startsWith(resolve(tmpdir()) + sep));
    assert.ok(artifactRoot.slice(artifactRoot.lastIndexOf(sep) + 1).startsWith('operatoros-tool-byte-fixture-'));
    await rm(artifactRoot, { recursive: true });
  }
  for (const user of [owner, member, outsider, support]) if (user) {
    for (const table of ['tool_fulfillment_outbox', 'tool_purchase_events', 'tool_purchases']) {
      await databasePool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [user.currentTenantId]);
    }
    await cleanupUser(user.id);
  }
});
test('production composition is closed and cannot charge, grant trust, or create an order', async () => {
  assert.equal(CLOSED_TOOL_COMMERCE.checkout.enabled, false); assert.equal(CLOSED_TOOL_COMMERCE.officeexitLink.enabled, false);
  for (const slug of ['officeexit', 'vendortrust365']) {
    const r = await app.inject({ method: 'POST', url: `/v1/tools/${slug}/checkout`, headers: headers(owner), payload: { requestKey: randomUUID() } });
    assert.equal(r.statusCode, 503); assert.equal(r.json().code, 'TOOL_CHECKOUT_NOT_OPEN');
  }
  const link = await app.inject({ method: 'POST', url: '/v1/tools/officeexit/link-assertion', headers: headers(owner), payload: {} });
  assert.equal(link.statusCode, 503);
  assert.deepEqual(await store.listTenantToolPurchases(owner.currentTenantId), []); assert.equal(providerCalls, 0);
});
test('real owner, foreign tenant and support boundaries precede every purchase/list/link action', async () => {
  for (const [user, expected] of [[member, 403], [outsider, 404], [support, 404]] as const) {
    for (const [method, url] of [['GET', '/v1/tools/purchases'], ['POST', '/v1/tools/officeexit/checkout'], ['POST', '/v1/tools/officeexit/link-assertion']] as const) {
      const result = await prepared.inject({ method, url, headers: headers(user), ...(method === 'POST' ? { payload: {} } : {}) });
      assert.equal(result.statusCode, expected, `${user.id} ${url}`);
    }
  }
  assert.equal(providerCalls, 0);
});
test('prepared checkout rejects foreign origin, arbitrary prices, redirects and tenant identity fields before charge', async () => {
  const foreign = await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/checkout', headers: { ...headers(owner), origin: 'https://sibling.example.test' }, payload: { requestKey: randomUUID() } });
  assert.equal(foreign.statusCode, 403);
  for (const extra of [{ amountMinor: 1 }, { tenantId: outsider.currentTenantId }, { priceId: 'price_other' }, { returnOrigin: 'https://foreign.example.test' }]) {
    const result = await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/checkout', headers: headers(owner), payload: { requestKey: randomUUID(), ...extra } });
    assert.equal(result.statusCode, 422);
  }
  assert.equal(providerCalls, 0);
});
let purchaseId = '';
test('free owner with zero Stack seats completes a local one-time checkout using server-selected USD99 tenant terms', async () => {
  const result = await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/checkout', headers: headers(owner), payload: { requestKey: randomUUID() } });
  assert.equal(result.statusCode, 200, result.body); purchaseId = result.json().purchaseId;
  assert.equal(result.json().checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_fixture');
  assert.equal((await store.getTenantToolPurchase(owner.currentTenantId, purchaseId))?.snapshot.coverage, 'entire_tenant');
  const access = await app.inject({ method: 'GET', url: '/v1/tools/officeexit/access', headers: headers(member) });
  assert.equal(access.json().purchased, false);
  const before = providerCalls;
  const repeat = await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/checkout', headers: headers(owner), payload: { requestKey: randomUUID() } });
  assert.equal(repeat.statusCode, 409); assert.equal(providerCalls, before);
});
test('verified synthetic Stripe payment settles real SQL and grants current tenant members without Stack subscription', async () => {
  paid = true;
  const result = await receive('checkout.session.completed');
  assert.equal(result?.purchase.status, 'paid'); assert.equal(result?.purchase.id, purchaseId);
  const access = await app.inject({ method: 'GET', url: '/v1/tools/officeexit/access', headers: headers(member) });
  assert.equal(access.statusCode, 200); assert.deepEqual(access.json(), { tenantId: owner.currentTenantId, toolSlug: 'officeexit', purchased: true, coverage: 'entire_tenant', downloadsAvailable: false });
  const other = await app.inject({ method: 'GET', url: '/v1/tools/officeexit/access', headers: headers(outsider, outsider.currentTenantId) });
  assert.equal(other.json().purchased, false);
  const orders = await app.inject({ method: 'GET', url: '/v1/tools/purchases', headers: headers(owner) });
  assert.equal(orders.json().purchases[0].id, purchaseId); assert.equal(orders.headers['cache-control'], 'no-store');
  assert.doesNotMatch(orders.body, /acct_|cus_|pi_|price_|prod_|cs_|capabilities|secret/i);
  const closedDownload = await app.inject({ method: 'GET', url: '/v1/tools/officeexit/download', headers: headers(member) });
  assert.equal(closedDownload.statusCode, 503);
  const download = await prepared.inject({ method: 'GET', url: '/v1/tools/officeexit/download', headers: headers(member) });
  assert.equal(download.statusCode, 200, download.body); assert.deepEqual(download.rawPayload, syntheticArtifact);
  assert.equal(download.headers['cache-control'], 'no-store');
  assert.equal(download.headers['content-type'], 'application/zip');
  assert.equal(download.headers['content-disposition'], 'attachment; filename="officeexit-1.0.0-fixture.zip"');
});
test('real SQL outbox feeds signed exact current grant and lease-fenced delivery without external I/O', async () => {
  let calls = 0;
  const result = await deliverOfficeExitPurchases({ enabled: true, signing }, { store, fetch: (async (url, options) => {
    calls++; assert.equal(url, authority.audience + '/api/operatoros/fulfillment');
    const claims = verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', JSON.parse(options!.body as string).assertion);
    assert.equal(claims.data.operatorosTenantId, owner.currentTenantId);
    const data = claims.data as { state: string; grant: { coverage: string } };
    assert.equal(data.state, 'active'); assert.equal(data.grant.coverage, 'entire_tenant');
    return new Response(JSON.stringify({ applied: true, reason: 'updated' }));
  }) as typeof globalThis.fetch });
  assert.deepEqual(result, { enabled: true, claimed: 1, delivered: 1, deferred: 0 }); assert.equal(calls, 1);
});
test('whole refund removes tenant access and late successful event cannot reactivate revoked order', async () => {
  refunded = true;
  const result = await receive('charge.refunded'); assert.equal(result?.purchase.status, 'refunded');
  assert.equal(await store.getTenantToolAccess(owner.currentTenantId, 'officeexit'), null);
  assert.equal((await prepared.inject({ method: 'GET', url: '/v1/tools/officeexit/download', headers: headers(member) })).statusCode, 403);
  const late = await receive('checkout.session.completed'); assert.equal(late?.purchase.status, 'refunded');
  let revoked = false;
  await deliverOfficeExitPurchases({ enabled: true, signing }, { store, fetch: (async (_url, options) => {
    const claims = verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', JSON.parse(options!.body as string).assertion);
    const data = claims.data as { state: string; grant: unknown }; revoked = data.state === 'refunded' && data.grant === null;
    return new Response(JSON.stringify({ applied: true, reason: 'updated' }));
  }) as typeof globalThis.fetch });
  assert.equal(revoked, true);
});
test('link assertion binds server-resolved owner/tenant to selected local identities; forgery and foreign origin fail', async () => {
  const ids = { officeexitOrganizationId: '22222222-2222-4222-8222-222222222222', officeexitUserId: '33333333-3333-4333-8333-333333333333' };
  const result = await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/link-assertion', headers: headers(owner), payload: ids });
  assert.equal(result.statusCode, 200); assert.equal(result.headers['cache-control'], 'no-store');
  const data = verifyToolBridgeAssertion(verifying, 'officeexit.mapping.link', result.json().assertion).data;
  assert.deepEqual(data, { ...ids, contractVersion: 1, moduleSlug: 'officeexit', operatorosTenantId: owner.currentTenantId, operatorosUserId: owner.id });
  for (const payload of [{ ...ids, operatorosTenantId: outsider.currentTenantId }, { ...ids, officeexitUserId: ['x'] }]) {
    assert.equal((await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/link-assertion', headers: headers(owner), payload })).statusCode, 422);
  }
  assert.equal((await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/link-assertion', headers: { ...headers(owner), origin: 'https://sibling.example.test' }, payload: ids })).statusCode, 403);
  await databasePool.query('UPDATE tenants SET owner_user_id=$2 WHERE id=$1', [owner.currentTenantId, member.id]);
  try {
    assert.equal((await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/link-assertion', headers: headers(owner), payload: ids })).statusCode, 403);
  } finally { await databasePool.query('UPDATE tenants SET owner_user_id=$2 WHERE id=$1', [owner.currentTenantId, owner.id]); }
});
test('compatible relay resolves only signed requests, requires owner confirmation, and returns a fixed token-free URL', async () => {
  const resolve = await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/link-requests/resolve', headers: headers(owner), payload: { requestId: relayRequestId } });
  assert.equal(resolve.statusCode, 200, resolve.body); assert.equal(resolve.json().tenantId, owner.currentTenantId);
  assert.equal(resolve.json().officeexitOrganizationId, selectedOffice.officeexitOrganizationId);
  assert.doesNotMatch(resolve.body, /assertion|eyJ|privateKey|secret/i);
  const confirm = await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/link-requests/approve', headers: headers(owner), payload: { requestId: relayRequestId } });
  assert.equal(confirm.statusCode, 200, confirm.body);
  assert.deepEqual(confirm.json(), { redirectUrl: authority.audience + '/operatoros/link?request=' + relayRequestId });
  const closed = await app.inject({ method: 'POST', url: '/v1/tools/officeexit/link-requests/approve', headers: headers(owner), payload: { requestId: relayRequestId } });
  assert.equal(closed.statusCode, 503);
  for (const payload of [{ requestId: relayRequestId, tenantId: outsider.currentTenantId }, { requestId: relayRequestId, returnUrl: 'https://other.example.test' }]) {
    assert.equal((await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/link-requests/approve', headers: headers(owner), payload })).statusCode, 422);
  }
});
test('tenant ownership revoked during remote inspection prevents proposal', async () => {
  transferDuringInspect = true;
  try {
    const result = await prepared.inject({ method: 'POST', url: '/v1/tools/officeexit/link-requests/approve', headers: headers(owner), payload: { requestId: relayRequestId } });
    assert.equal(result.statusCode, 403);
  } finally {
    transferDuringInspect = false;
    await databasePool.query('UPDATE tenants SET owner_user_id=$2 WHERE id=$1', [owner.currentTenantId, owner.id]);
  }
});
