import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { OFFICEEXIT_CAPABILITIES, OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION } from '@operatoros/sdk';
import { officeExitCapabilitiesForEdition } from '@operatoros/sdk';
import { databasePool } from '../src/db.js';
import { createTestUser, cleanupUser, ensureSchemaReady } from './_setup.js';
import { ensureToolPurchaseTables, verifyToolPurchaseTables } from '../src/lib/tool-purchase-db-init.js';
import {
  applyVerifiedToolPaymentEvent, attachToolCheckout, claimToolFulfillment, completeToolFulfillment,
  createPendingToolPurchase, findToolPurchaseByProviderBinding, getTenantToolPurchase,
  getToolPurchaseById, getTenantToolAccess, listTenantToolPurchases, retryToolFulfillment,
  type ToolPurchase, type ToolPurchaseSnapshot, type VerifiedToolPaymentEvent,
} from '../src/lib/tool-purchase-store.js';

let owner: Awaited<ReturnType<typeof createTestUser>>;
let other: Awaited<ReturnType<typeof createTestUser>>;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const snapshot = (tool = 'officeexit'): ToolPurchaseSnapshot => ({
  offerVersion: 'fixture-reviewed-release', providerPriceId: 'price_synthetic', providerProductId: 'prod_synthetic',
  amountMinor: 9900, currency: 'usd', licenseTermsVersion: OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION,
  licenseUnit: 'tenant', licenseAllowance: 1, coverage: 'entire_tenant',
  officeexitGrant: tool === 'officeexit' ? { edition: 'MSP Pro', coverage: 'entire_tenant', capabilities: [...OFFICEEXIT_CAPABILITIES] } : null,
});
async function order(options: { user?: typeof owner; account?: string; tool?: 'officeexit' | 'vendortrust365'; key?: string; bind?: boolean } = {}) {
  const user = options.user ?? owner, tool = options.tool ?? 'officeexit';
  const result = await createPendingToolPurchase({ tenantId: user.currentTenantId, userId: user.id, toolSlug: tool,
    requestKey: options.key ?? randomUUID(), snapshot: snapshot(tool), providerMode: 'test', providerAccountId: options.account ?? 'acct_synthetic' });
  if (options.bind === false) return result;
  return attachToolCheckout({ tenantId: result.tenantId, purchaseId: result.id, providerMode: 'test', providerAccountId: result.providerAccountId,
    customerId: 'cus_' + user.id.replaceAll('-', ''), checkoutSessionId: 'cs_' + result.id.replaceAll('-', '') });
}
function event(purchase: ToolPurchase, patch: Partial<VerifiedToolPaymentEvent> = {}): VerifiedToolPaymentEvent {
  const eventId = 'evt_' + randomUUID().replaceAll('-', '');
  return { eventId, eventType: 'checkout.session.completed', payloadSha256: sha(eventId), providerMode: purchase.providerMode,
    providerAccountId: purchase.providerAccountId, purchaseId: purchase.id, tenantId: purchase.tenantId, userId: purchase.userId,
    toolSlug: purchase.toolSlug, checkoutSessionId: purchase.checkoutSessionId!, customerId: purchase.customerId!,
    paymentIntentId: 'pi_' + purchase.id.replaceAll('-', ''), chargeId: 'ch_' + purchase.id.replaceAll('-', ''),
    priceId: purchase.snapshot.providerPriceId, productId: purchase.snapshot.providerProductId,
    amountMinor: purchase.snapshot.amountMinor, currency: purchase.snapshot.currency, action: 'paid', ...patch };
}
async function counts() {
  const { rows } = await databasePool.query<{ orders: number; events: number; deliveries: number }>(`SELECT
    (SELECT count(*)::int FROM tool_purchases) orders,(SELECT count(*)::int FROM tool_purchase_events) events,
    (SELECT count(*)::int FROM tool_fulfillment_outbox) deliveries`);
  return rows[0]!;
}
async function clearPurchases() {
  if (!owner || !other) return;
  const tenants = [owner.currentTenantId, other.currentTenantId];
  for (const table of ['tool_fulfillment_outbox', 'tool_purchase_events', 'tool_purchases']) {
    await databasePool.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::text[])`, [tenants]);
  }
}
before(async () => {
  await ensureSchemaReady();
  await ensureToolPurchaseTables();
  await verifyToolPurchaseTables();
  owner = await createTestUser(); other = await createTestUser();
  await databasePool.query('UPDATE tenants SET seat_limit=0 WHERE id=$1', [owner.currentTenantId]);
});
beforeEach(clearPurchases);
after(async () => {
  await clearPurchases();
  if (owner) await cleanupUser(owner.id);
  if (other) await cleanupUser(other.id);
});

test('clean schema and exact reapply are unseeded and verified', async () => {
  assert.deepEqual(await counts(), { orders: 0, events: 0, deliveries: 0 });
  await ensureToolPurchaseTables(); await ensureToolPurchaseTables(); await verifyToolPurchaseTables();
  assert.deepEqual(await counts(), { orders: 0, events: 0, deliveries: 0 });
});
test('free owner with zero seats creates explicit USD99 entire-tenant order without subscription', async () => {
  const created = await order({ bind: false });
  assert.equal(created.status, 'pending'); assert.equal(created.revision, 1);
  assert.deepEqual(created.snapshot, snapshot());
  assert.equal(created.snapshot.licenseUnit, 'tenant'); assert.equal(created.snapshot.licenseAllowance, 1);
  assert.equal(created.snapshot.coverage, 'entire_tenant');
  assert.equal((await getTenantToolPurchase(other.currentTenantId, created.id)), null);
  assert.deepEqual(await listTenantToolPurchases(other.currentTenantId), []);
  assert.equal((await listTenantToolPurchases(owner.currentTenantId))[0]?.id, created.id);
});

test('explicit existing MSP Pro edition and capability matrix remain deliverable', async () => {
  const approvedSnapshot = { ...snapshot(), officeexitGrant: { edition: 'MSP Pro', coverage: 'entire_tenant' as const, capabilities: officeExitCapabilitiesForEdition('MSP Pro') } };
  const created = await createPendingToolPurchase({ tenantId: owner.currentTenantId, userId: owner.id, toolSlug: 'officeexit', requestKey: randomUUID(), snapshot: approvedSnapshot, providerMode: 'test', providerAccountId: 'acct_synthetic' });
  assert.deepEqual(created.snapshot, approvedSnapshot);
});
test('same request is idempotent under concurrent order creation', async () => {
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => order({ key, bind: false })));
  assert.equal(new Set(results.map(item => item.id)).size, 1);
  assert.deepEqual(await counts(), { orders: 1, events: 0, deliveries: 0 });
});
test('different request key cannot bypass an uncertain pending checkout', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => order({ bind: false })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, 'TOOL_PURCHASE_PENDING_EXISTS');
  assert.equal((await counts()).orders, 1);
  await order({ tool: 'vendortrust365', bind: false });
  await order({ user: other, bind: false });
  assert.equal((await counts()).orders, 3);
});
test('same key cannot change immutable offer or provider identity', async () => {
  const created = await order({ bind: false });
  for (const patch of [{ providerAccountId: 'acct_other' }, { providerMode: 'live' as const }, { snapshot: { ...snapshot(), offerVersion: 'other-version' } }]) {
    await assert.rejects(createPendingToolPurchase({ tenantId: owner.currentTenantId, userId: owner.id, toolSlug: 'officeexit', requestKey: created.requestKey,
      snapshot: snapshot(), providerMode: 'test', providerAccountId: 'acct_synthetic', ...patch }), { code: 'TOOL_PURCHASE_REQUEST_CONFLICT' });
  }
  assert.equal((await counts()).orders, 1);
});

test('already-owned tenant offer cannot create a duplicate charge; revoked purchase can be replaced', async () => {
  const created = await order(); await applyVerifiedToolPaymentEvent(event(created));
  assert.equal((await order({ key: created.requestKey, bind: false })).id, created.id);
  await assert.rejects(order({ bind: false }), { code: 'TOOL_PURCHASE_ALREADY_OWNED' });
  assert.equal((await getTenantToolAccess(owner.currentTenantId, 'officeexit'))?.id, created.id);
  assert.equal(await getTenantToolAccess(other.currentTenantId, 'officeexit'), null);
  assert.equal(await getTenantToolAccess(owner.currentTenantId, 'vendortrust365'), null);
  await applyVerifiedToolPaymentEvent(event(created, { action: 'disputed' }));
  assert.equal(await getTenantToolAccess(owner.currentTenantId, 'officeexit'), null);
  const replacement = await order({ bind: false });
  assert.notEqual(replacement.id, created.id);
  assert.equal((await order({ key: created.requestKey, bind: false })).id, created.id);
});

test('read-only schema verifier rejects missing columns, disabled trigger and missing index', async () => {
  await databasePool.query('ALTER TABLE tool_purchase_events RENAME COLUMN ignored TO ignored_fixture');
  try { await assert.rejects(verifyToolPurchaseTables(), /TOOL_PURCHASE_SCHEMA_NOT_READY/); }
  finally { await databasePool.query('ALTER TABLE tool_purchase_events RENAME COLUMN ignored_fixture TO ignored'); }
  await databasePool.query('ALTER TABLE tool_purchases DISABLE TRIGGER tool_purchase_immutability');
  try { await assert.rejects(verifyToolPurchaseTables(), /TOOL_PURCHASE_SCHEMA_NOT_READY/); }
  finally { await databasePool.query('ALTER TABLE tool_purchases ENABLE TRIGGER tool_purchase_immutability'); }
  await databasePool.query('DROP INDEX tool_purchases_one_current');
  try { await assert.rejects(verifyToolPurchaseTables(), /TOOL_PURCHASE_SCHEMA_NOT_READY/); }
  finally { await ensureToolPurchaseTables(); }
  await verifyToolPurchaseTables();
});
test('narrower license restrictions, wrong price and coercible input fail before persistence', async () => {
  for (const altered of [
    { ...snapshot(), amountMinor: 9901 }, { ...snapshot(), currency: 'eur' }, { ...snapshot(), licenseAllowance: 2 },
    { ...snapshot(), licenseUnit: 'device' }, { ...snapshot(), coverage: 'one_user' },
    { ...snapshot(), officeexitGrant: { ...snapshot().officeexitGrant!, maximumDevices: 1 } },
    { ...snapshot(), perSiteLimit: 1 }, { ...snapshot(), currency: ['usd'] },
    { ...snapshot(), officeexitGrant: { ...snapshot().officeexitGrant!, edition: 'Unapproved' } },
    { ...snapshot(), officeexitGrant: { ...snapshot().officeexitGrant!, capabilities: ['localAssessment'] } },
    { ...snapshot(), officeexitGrant: { ...snapshot().officeexitGrant!, capabilities: ['localAssessment', 'migrationPlanning', 'htmlReporting', 'commercialUse'] } },
  ]) {
    await assert.rejects(createPendingToolPurchase({ tenantId: owner.currentTenantId, userId: owner.id, toolSlug: 'officeexit', requestKey: randomUUID(),
      snapshot: altered as ToolPurchaseSnapshot, providerMode: 'test', providerAccountId: 'acct_synthetic' }), { code: 'TOOL_PURCHASE_INPUT_INVALID' });
  }
  await assert.rejects(createPendingToolPurchase({ tenantId: owner.currentTenantId, userId: [owner.id] as unknown as string, toolSlug: 'officeexit', requestKey: randomUUID(), snapshot: snapshot(), providerMode: 'test', providerAccountId: 'acct_synthetic' }), { code: 'TOOL_PURCHASE_INPUT_INVALID' });
  assert.deepEqual(await counts(), { orders: 0, events: 0, deliveries: 0 });
});

test('database snapshot constraints reject missing explicit terms and narrower grant inserts', async () => {
  const { officeexitGrant: _grant, ...missingGrant } = snapshot();
  for (const altered of [missingGrant, { ...snapshot(), amountMinor: 1 }, { ...snapshot(), coverage: 'one_site' },
    { ...snapshot(), officeexitGrant: {} }, { ...snapshot(), officeexitGrant: { edition: null, coverage: 'entire_tenant', capabilities: [] } },
    { ...snapshot(), officeexitGrant: { ...snapshot().officeexitGrant!, maximumDevices: 1 } }]) {
    await assert.rejects(databasePool.query(`INSERT INTO tool_purchases(tenant_id,user_id,tool_slug,request_key,offer_snapshot,snapshot_sha256,provider_mode,provider_account_id)
      VALUES($1,$2,'officeexit',$3,$4::jsonb,$5,'test','acct_synthetic')`,
    [owner.currentTenantId, owner.id, randomUUID(), JSON.stringify(altered), sha('synthetic direct insert')]), { code: '23514' });
  }
  assert.equal((await counts()).orders, 0);
});
test('synthetic support-owner membership cannot replace persisted tenant ownership', async () => {
  await databasePool.query(`INSERT INTO tenant_users(tenant_id,user_id,role) VALUES($1,$2,'owner')`, [owner.currentTenantId, other.id]);
  await databasePool.query(`UPDATE users SET platform_role='super_admin' WHERE id=$1`, [other.id]);
  try {
    await assert.rejects(createPendingToolPurchase({ tenantId: owner.currentTenantId, userId: other.id, toolSlug: 'officeexit', requestKey: randomUUID(), snapshot: snapshot(), providerMode: 'test', providerAccountId: 'acct_synthetic' }), { code: 'TOOL_PURCHASE_OWNER_REQUIRED' });
  } finally {
    await databasePool.query('DELETE FROM tenant_users WHERE tenant_id=$1 AND user_id=$2', [owner.currentTenantId, other.id]);
    await databasePool.query(`UPDATE users SET platform_role='user' WHERE id=$1`, [other.id]);
  }
});
test('inactive user or tenant cannot create an order', async () => {
  for (const target of ['users', 'tenants']) {
    const id = target === 'users' ? owner.id : owner.currentTenantId;
    await databasePool.query(`UPDATE ${target} SET status='suspended' WHERE id=$1`, [id]);
    try { await assert.rejects(order({ bind: false }), { code: 'TOOL_PURCHASE_OWNER_REQUIRED' }); }
    finally { await databasePool.query(`UPDATE ${target} SET status='active' WHERE id=$1`, [id]); }
  }
});
test('checkout attach is idempotent and immutable, including database provenance fence', async () => {
  const created = await order();
  const same = { tenantId: created.tenantId, purchaseId: created.id, providerMode: created.providerMode, providerAccountId: created.providerAccountId, customerId: created.customerId!, checkoutSessionId: created.checkoutSessionId! };
  assert.equal((await attachToolCheckout(same)).id, created.id);
  for (const patch of [{ customerId: 'cus_other' }, { checkoutSessionId: 'cs_other' }, { providerMode: 'live' as const }, { providerAccountId: 'acct_other' }]) {
    await assert.rejects(attachToolCheckout({ ...same, ...patch }), { code: 'TOOL_PURCHASE_CHECKOUT_CONFLICT' });
  }
  await assert.rejects(attachToolCheckout({ ...same, tenantId: other.currentTenantId }), { code: 'TOOL_PURCHASE_NOT_FOUND' });
  await assert.rejects(databasePool.query(`UPDATE tool_purchases SET offer_snapshot=jsonb_set(offer_snapshot,'{licenseAllowance}','2') WHERE id=$1`, [created.id]), { code: '23514' });
  await assert.rejects(databasePool.query('UPDATE tool_purchases SET customer_id=$2 WHERE id=$1', [created.id, 'cus_other']), { code: '23514' });
  assert.equal((await getToolPurchaseById(created.id))?.snapshot.licenseAllowance, 1);
});
test('known provider binding lookup rejects ambiguity and mixed references', async () => {
  const first = await order(); const second = await order({ account: 'acct_second', user: other, bind: false });
  await attachToolCheckout({ tenantId: second.tenantId, purchaseId: second.id, providerMode: 'test', providerAccountId: second.providerAccountId, customerId: 'cus_second', checkoutSessionId: first.checkoutSessionId! });
  assert.equal((await findToolPurchaseByProviderBinding({ providerMode: 'test', providerAccountId: first.providerAccountId, checkoutSessionId: first.checkoutSessionId! }))?.id, first.id);
  await assert.rejects(findToolPurchaseByProviderBinding({ providerMode: 'test', checkoutSessionId: first.checkoutSessionId! }), { code: 'TOOL_PURCHASE_PROVIDER_BINDING_AMBIGUOUS' });
  assert.equal(await findToolPurchaseByProviderBinding({ providerMode: 'live', checkoutSessionId: first.checkoutSessionId! }), null);
  assert.equal(await findToolPurchaseByProviderBinding({ providerMode: 'test', providerAccountId: first.providerAccountId, checkoutSessionId: first.checkoutSessionId!, paymentIntentId: 'pi_wrong' }), null);
  await assert.rejects(findToolPurchaseByProviderBinding({ providerMode: 'test' }), { code: 'TOOL_PURCHASE_INPUT_INVALID' });
});

test('session, payment and charge references cannot belong to two purchases in the same provider account', async () => {
  const first = await order(); await applyVerifiedToolPaymentEvent(event(first));
  const second = await order({ user: other, bind: false });
  await assert.rejects(attachToolCheckout({ tenantId: second.tenantId, purchaseId: second.id, providerMode: 'test', providerAccountId: first.providerAccountId,
    customerId: 'cus_second', checkoutSessionId: first.checkoutSessionId! }), { code: 'TOOL_PURCHASE_PROVIDER_BINDING_CONFLICT' });
  const attached = await attachToolCheckout({ tenantId: second.tenantId, purchaseId: second.id, providerMode: 'test', providerAccountId: first.providerAccountId,
    customerId: 'cus_second', checkoutSessionId: 'cs_second' });
  const settled = (await getToolPurchaseById(first.id))!;
  await assert.rejects(applyVerifiedToolPaymentEvent(event(attached, { paymentIntentId: settled.paymentIntentId })), { code: 'TOOL_PURCHASE_PROVIDER_BINDING_CONFLICT' });
  await assert.rejects(applyVerifiedToolPaymentEvent(event(attached, { chargeId: settled.chargeId })), { code: 'TOOL_PURCHASE_PROVIDER_BINDING_CONFLICT' });
  assert.equal((await getToolPurchaseById(second.id))?.status, 'pending');
  assert.deepEqual(await counts(), { orders: 2, events: 1, deliveries: 1 });
});
test('paid event and entire-tenant fulfillment are persisted atomically', async () => {
  const created = await order(); const result = await applyVerifiedToolPaymentEvent(event(created));
  assert.equal(result.purchase.status, 'paid'); assert.equal(result.purchase.revision, 2);
  assert.deepEqual(await counts(), { orders: 1, events: 1, deliveries: 1 });
  const [delivery] = await claimToolFulfillment({ workerId: 'fixture-worker' });
  assert.equal(delivery?.payload.state, 'active'); assert.equal(delivery?.payload.operatorosTenantId, created.tenantId);
  assert.deepEqual(delivery?.payload.grant, { ...snapshot().officeexitGrant, licenseTermsVersion: snapshot().licenseTermsVersion });
  assert.doesNotMatch(JSON.stringify(delivery?.payload), /customerId|paymentIntentId|maximumDevices|amountMinor|providerPriceId/);
});

test('VendorTrust paid and refunded access uses the authoritative ledger without remote bridge work', async () => {
  const created = await order({ tool: 'vendortrust365' });
  assert.equal(await getTenantToolAccess(created.tenantId, 'vendortrust365'), null);
  const paid = event(created);
  const result = await applyVerifiedToolPaymentEvent(paid);
  assert.equal(result.purchase.status, 'paid'); assert.equal(result.purchase.revision, 2);
  assert.equal((await getTenantToolAccess(created.tenantId, 'vendortrust365'))?.id, created.id);
  assert.equal(await getTenantToolAccess(other.currentTenantId, 'vendortrust365'), null);
  assert.deepEqual(await counts(), { orders: 1, events: 1, deliveries: 0 });
  assert.deepEqual(await claimToolFulfillment({ workerId: 'fixture-worker' }), []);
  const revoked = await applyVerifiedToolPaymentEvent(event(created, { action: 'refunded', refundedAmountMinor: 9900 }));
  assert.equal(revoked.purchase.status, 'refunded'); assert.equal(revoked.purchase.revision, 3);
  assert.equal(await getTenantToolAccess(created.tenantId, 'vendortrust365'), null);
  assert.deepEqual(await counts(), { orders: 1, events: 2, deliveries: 0 });
  const replay = await applyVerifiedToolPaymentEvent(paid);
  assert.equal(replay.duplicate, true); assert.equal(replay.purchase.status, 'refunded');
  assert.equal(replay.purchase.revision, 3);
  assert.deepEqual(await claimToolFulfillment({ workerId: 'fixture-worker', toolSlug: 'vendortrust365' }), []);
  assert.deepEqual(await counts(), { orders: 1, events: 2, deliveries: 0 });
});
test('all normalized payment bindings must match a pre-created order', async () => {
  const created = await order();
  const invalid: Partial<VerifiedToolPaymentEvent>[] = [{ tenantId: other.currentTenantId }, { userId: other.id }, { toolSlug: 'vendortrust365' },
    { providerMode: 'live' }, { providerAccountId: 'acct_other' }, { customerId: 'cus_other' }, { checkoutSessionId: 'cs_other' },
    { priceId: 'price_other' }, { productId: 'prod_other' }, { amountMinor: 1 }, { currency: 'eur' }];
  for (const patch of invalid) await assert.rejects(applyVerifiedToolPaymentEvent(event(created, patch)));
  await assert.rejects(applyVerifiedToolPaymentEvent(event(created, { purchaseId: randomUUID() })), { code: 'TOOL_PURCHASE_NOT_FOUND' });
  assert.deepEqual(await counts(), { orders: 1, events: 0, deliveries: 0 });
  assert.equal((await getToolPurchaseById(created.id))?.status, 'pending');
});
test('metadata cannot settle an order without its attached checkout', async () => {
  const created = await order({ bind: false });
  await assert.rejects(applyVerifiedToolPaymentEvent(event(created, { checkoutSessionId: 'cs_unattached', customerId: 'cus_unattached' })), { code: 'TOOL_PURCHASE_EVENT_BINDING_MISMATCH' });
  assert.equal((await counts()).events, 0);
});
test('concurrent event replay settles once, conflicting verified raw body is rejected', async () => {
  const created = await order(), paid = event(created);
  const results = await Promise.all(Array.from({ length: 8 }, () => applyVerifiedToolPaymentEvent(paid)));
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.equal((await getToolPurchaseById(created.id))?.revision, 2);
  assert.deepEqual(await counts(), { orders: 1, events: 1, deliveries: 1 });
  await assert.rejects(applyVerifiedToolPaymentEvent({ ...paid, payloadSha256: sha('different verified bytes') }), { code: 'TOOL_PURCHASE_EVENT_CONFLICT' });
  await assert.rejects(applyVerifiedToolPaymentEvent({ ...paid, userId: other.id }), { code: 'TOOL_PURCHASE_EVENT_CONFLICT' });
});

test('exact signed replay after refund returns current revoked purchase despite newer provider normalization', async () => {
  const created = await order(), original = event(created);
  await applyVerifiedToolPaymentEvent(original);
  const receiptSql = 'SELECT * FROM tool_purchase_events WHERE provider_mode=$1 AND provider_account_id=$2 AND event_id=$3';
  const receiptValues = [original.providerMode, original.providerAccountId, original.eventId];
  const initialReceipt = (await databasePool.query(receiptSql, receiptValues)).rows;
  assert.equal(initialReceipt[0]?.raw_payload_sha256, original.payloadSha256);
  await applyVerifiedToolPaymentEvent(event(created, { action: 'refunded', refundedAmountMinor: 9900 }));
  const current = (await getToolPurchaseById(created.id))!;
  const before = await counts();
  for (const changedNormalization of [
    { action: 'refunded' as const, refundedAmountMinor: 100 },
    { action: 'disputed' as const },
    { action: 'paid' as const },
  ]) {
    const result = await applyVerifiedToolPaymentEvent({ ...original, ...changedNormalization });
    assert.equal(result.duplicate, true); assert.deepEqual(result.purchase, current);
    assert.equal(result.purchase.status, 'refunded'); assert.equal(result.purchase.revision, 3);
  }
  assert.deepEqual(await counts(), before);
  assert.deepEqual((await databasePool.query(receiptSql, receiptValues)).rows, initialReceipt);
  await assert.rejects(applyVerifiedToolPaymentEvent({ ...original, action: 'disputed', payloadSha256: sha('changed raw event') }), { code: 'TOOL_PURCHASE_EVENT_CONFLICT' });
  await assert.rejects(applyVerifiedToolPaymentEvent({ ...original, action: 'disputed', purchaseId: randomUUID() }), { code: 'TOOL_PURCHASE_EVENT_CONFLICT' });
  const [delivery] = await claimToolFulfillment({ workerId: 'fixture-worker' });
  assert.equal(delivery?.payload.state, 'refunded'); assert.equal(delivery?.payload.grant, null);
});
for (const action of ['refunded', 'disputed', 'cancelled'] as const) {
  test(`${action} before settlement fences a late paid event`, async () => {
    const created = await order();
    const revoked = event(created, { action, ...(action === 'refunded' ? { refundedAmountMinor: 9900 } : {}), ...(action === 'cancelled' ? { paymentIntentId: null, chargeId: null } : {}) });
    await applyVerifiedToolPaymentEvent(revoked);
    const late = await applyVerifiedToolPaymentEvent(event(created));
    assert.equal(late.ignored, true); assert.equal(late.purchase.status, action); assert.equal(late.purchase.revision, 2);
    const [delivery] = await claimToolFulfillment({ workerId: 'fixture-worker' });
    assert.equal(delivery?.payload.state, action); assert.equal(delivery?.payload.grant, null);
  });
}
test('partial refund revokes for policy review without inventing refund coverage', async () => {
  const created = await order(); await applyVerifiedToolPaymentEvent(event(created));
  const result = await applyVerifiedToolPaymentEvent(event(created, { action: 'refunded', refundedAmountMinor: 100 }));
  assert.equal(result.purchase.status, 'refunded'); assert.equal(result.purchase.policyReviewRequired, true); assert.equal(result.purchase.revision, 3);
  const late = await applyVerifiedToolPaymentEvent(event(created));
  assert.equal(late.purchase.status, 'refunded'); assert.equal(late.purchase.policyReviewRequired, true);
  await assert.rejects(applyVerifiedToolPaymentEvent(event(created, { action: 'refunded' })), { code: 'TOOL_PURCHASE_INPUT_INVALID' });
});
test('revocation supersedes an in-flight grant; stale ack and retry cannot erase it', async () => {
  const created = await order(); await applyVerifiedToolPaymentEvent(event(created));
  const [old] = await claimToolFulfillment({ workerId: 'old-worker' }); assert.ok(old?.leaseToken);
  await applyVerifiedToolPaymentEvent(event(created, { action: 'disputed' }));
  const oldFence = { tenantId: old.tenantId, purchaseId: old.purchaseId, revision: old.revision, leaseToken: old.leaseToken };
  assert.equal(await completeToolFulfillment(oldFence), false);
  assert.equal(await retryToolFulfillment({ ...oldFence, errorCode: 'SYNTHETIC_RETRY' }), false);
  const [next] = await claimToolFulfillment({ workerId: 'next-worker' }); assert.ok(next?.leaseToken);
  assert.equal(next.revision, 3); assert.equal(next.payload.state, 'disputed'); assert.equal(next.payload.grant, null);
  assert.equal(await completeToolFulfillment({ tenantId: next.tenantId, purchaseId: next.purchaseId, revision: next.revision, leaseToken: next.leaseToken }), true);
});
test('concurrent workers cannot double-claim; expired lease is reclaimed with a new fence', async () => {
  const created = await order(); await applyVerifiedToolPaymentEvent(event(created));
  const groups = await Promise.all(Array.from({ length: 8 }, (_, index) => claimToolFulfillment({ workerId: 'fixture-worker-' + index, limit: 1 })));
  const claimed = groups.flat(); assert.equal(claimed.length, 1); const first = claimed[0]!; assert.ok(first.leaseToken);
  await databasePool.query(`UPDATE tool_fulfillment_outbox SET lease_expires_at=NOW()-interval '1 second' WHERE purchase_id=$1`, [created.id]);
  const [second] = await claimToolFulfillment({ workerId: 'reclaimer' }); assert.ok(second?.leaseToken);
  assert.notEqual(second.leaseToken, first.leaseToken); assert.equal(second.attempts, 2);
  assert.equal(await completeToolFulfillment({ tenantId: first.tenantId, purchaseId: first.purchaseId, revision: first.revision, leaseToken: first.leaseToken }), false);
  assert.equal(await completeToolFulfillment({ tenantId: other.currentTenantId, purchaseId: second.purchaseId, revision: second.revision, leaseToken: second.leaseToken }), false);
});
test('retry is bounded and a dead grant does not block a newer revocation', async () => {
  const created = await order(); await applyVerifiedToolPaymentEvent(event(created));
  await databasePool.query('UPDATE tool_fulfillment_outbox SET attempts=19 WHERE purchase_id=$1', [created.id]);
  const [last] = await claimToolFulfillment({ workerId: 'fixture-worker' }); assert.ok(last?.leaseToken); assert.equal(last.attempts, 20);
  assert.equal(await retryToolFulfillment({ tenantId: last.tenantId, purchaseId: last.purchaseId, revision: last.revision, leaseToken: last.leaseToken, errorCode: 'SYNTHETIC_DOWN', retryAfterSeconds: 1 }), true);
  assert.deepEqual(await claimToolFulfillment({ workerId: 'fixture-worker' }), []);
  await applyVerifiedToolPaymentEvent(event(created, { action: 'refunded', refundedAmountMinor: 9900 }));
  const [revocation] = await claimToolFulfillment({ workerId: 'fixture-worker' });
  assert.equal(revocation?.payload.state, 'refunded'); assert.equal(revocation?.attempts, 1);
});

test('exhausted crashed lease is marked dead without losing a later revocation', async () => {
  const created = await order(); await applyVerifiedToolPaymentEvent(event(created));
  await databasePool.query('UPDATE tool_fulfillment_outbox SET attempts=19 WHERE purchase_id=$1', [created.id]);
  await claimToolFulfillment({ workerId: 'crashed-worker' });
  await databasePool.query(`UPDATE tool_fulfillment_outbox SET lease_expires_at=NOW()-interval '1 second' WHERE purchase_id=$1`, [created.id]);
  assert.deepEqual(await claimToolFulfillment({ workerId: 'next-worker' }), []);
  assert.equal((await databasePool.query('SELECT status FROM tool_fulfillment_outbox WHERE purchase_id=$1', [created.id])).rows[0]?.status, 'dead');
  await applyVerifiedToolPaymentEvent(event(created, { action: 'disputed' }));
  assert.equal((await claimToolFulfillment({ workerId: 'next-worker' }))[0]?.payload.state, 'disputed');
});
test('outbox write failure rolls back settlement, binding and event receipt', async () => {
  const created = await order(), paid = event(created);
  await databasePool.query(`CREATE FUNCTION tool_fixture_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$;
    CREATE TRIGGER tool_fixture_reject_outbox BEFORE INSERT ON tool_fulfillment_outbox FOR EACH ROW EXECUTE FUNCTION tool_fixture_reject_outbox()`);
  try { await assert.rejects(applyVerifiedToolPaymentEvent(paid)); }
  finally { await databasePool.query('DROP TRIGGER tool_fixture_reject_outbox ON tool_fulfillment_outbox; DROP FUNCTION tool_fixture_reject_outbox()'); }
  const stored = await getToolPurchaseById(created.id);
  assert.equal(stored?.status, 'pending'); assert.equal(stored?.revision, 1); assert.equal(stored?.paymentIntentId, null);
  assert.deepEqual(await counts(), { orders: 1, events: 0, deliveries: 0 });
  assert.equal((await applyVerifiedToolPaymentEvent(paid)).purchase.status, 'paid');
});
test('settlement never manufactures legacy module or subscription entitlements', async () => {
  const query = `SELECT (SELECT count(*)::int FROM tenant_modules WHERE tenant_id=$1) modules,
    (SELECT count(*)::int FROM tenant_entitlements WHERE tenant_id=$1) entitlements`;
  const previous = (await databasePool.query(query, [owner.currentTenantId])).rows;
  const created = await order(); await applyVerifiedToolPaymentEvent(event(created));
  assert.deepEqual((await databasePool.query(query, [owner.currentTenantId])).rows, previous);
});
