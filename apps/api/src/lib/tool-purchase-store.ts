import { createHash, randomUUID } from 'node:crypto';
import { isOfficeExitToolGrant } from '@operatoros/sdk';
import type { PoolClient } from 'pg';
import { databasePool } from '../db.js';

export type ToolPurchaseSlug = 'officeexit' | 'vendortrust365';
export type ToolPurchaseState = 'pending' | 'paid' | 'refunded' | 'disputed' | 'cancelled';
export type ToolProviderMode = 'test' | 'live';
export interface ToolPurchaseSnapshot {
  offerVersion: string;
  providerPriceId: string;
  providerProductId: string;
  amountMinor: number;
  currency: string;
  licenseTermsVersion: string;
  licenseUnit: string;
  licenseAllowance: number;
  coverage: 'entire_tenant';
  officeexitGrant: { edition: string; coverage: 'entire_tenant'; capabilities: string[] } | null;
}
export interface ToolPurchase {
  id: string; tenantId: string; userId: string; toolSlug: ToolPurchaseSlug; requestKey: string;
  snapshot: ToolPurchaseSnapshot; providerMode: ToolProviderMode; providerAccountId: string;
  status: ToolPurchaseState; revision: number; customerId: string | null;
  checkoutSessionId: string | null; paymentIntentId: string | null; chargeId: string | null;
  policyReviewRequired: boolean; createdAt: string; updatedAt: string;
}
export interface VerifiedToolPaymentEvent {
  eventId: string; eventType: string; payloadSha256: string;
  providerMode: ToolProviderMode; providerAccountId: string; purchaseId: string;
  tenantId: string; userId: string; toolSlug: ToolPurchaseSlug;
  checkoutSessionId: string; customerId: string; paymentIntentId: string | null;
  chargeId?: string | null; priceId: string; productId: string; amountMinor: number;
  currency: string; action: Exclude<ToolPurchaseState, 'pending'>; refundedAmountMinor?: number;
}
export interface ToolFulfillment {
  id: string; tenantId: string; purchaseId: string; toolSlug: ToolPurchaseSlug; revision: number;
  payload: {
    contractVersion: 1; moduleSlug: ToolPurchaseSlug; purchaseKind: 'one_time';
    operatorosTenantId: string; purchaseId: string; revision: number;
    state: 'active' | 'refunded' | 'disputed' | 'cancelled';
    grant: (NonNullable<ToolPurchaseSnapshot['officeexitGrant']> & { licenseTermsVersion: string }) | null;
  };
  status: 'pending' | 'leased' | 'delivered' | 'dead'; attempts: number;
  leaseToken: string | null; leaseExpiresAt: string | null;
}
export class ToolPurchaseStoreError extends Error {
  constructor(readonly code: string, readonly statusCode = 409) { super(code); this.name = 'ToolPurchaseStoreError'; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,35}$/;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const providerId = (value: unknown, prefix: string) => typeof value === 'string' && value.length <= 200 && new RegExp('^' + prefix + '[A-Za-z0-9_]+$').test(value);
function requireValue(value: unknown, code = 'TOOL_PURCHASE_INPUT_INVALID'): asserts value { if (!value) throw new ToolPurchaseStoreError(code, 422); }
function validateScope(tenantId: unknown, purchaseId?: unknown) { requireValue(typeof tenantId === 'string' && ID.test(tenantId)); if (purchaseId !== undefined) requireValue(typeof purchaseId === 'string' && UUID.test(purchaseId)); }
function validateProvider(mode: unknown, account: unknown) { requireValue(mode === 'test' || mode === 'live'); requireValue(providerId(account, 'acct_')); }
function positiveInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new ToolPurchaseStoreError('TOOL_PURCHASE_INPUT_INVALID', 422);
  return encoded;
}
function hash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function validateSnapshot(input: ToolPurchaseSnapshot, toolSlug: ToolPurchaseSlug): ToolPurchaseSnapshot {
  requireValue(input && typeof input === 'object' && !Array.isArray(input));
  const keys = ['offerVersion', 'providerPriceId', 'providerProductId', 'amountMinor', 'currency', 'licenseTermsVersion', 'licenseUnit', 'licenseAllowance', 'coverage', 'officeexitGrant'];
  requireValue(Object.keys(input).length === keys.length && Object.keys(input).every(key => keys.includes(key)));
  requireValue(typeof input.offerVersion === 'string' && LABEL.test(input.offerVersion));
  requireValue(providerId(input.providerPriceId, 'price_') && providerId(input.providerProductId, 'prod_'));
  requireValue(input.amountMinor === 9900 && input.currency === 'usd');
  requireValue(typeof input.licenseTermsVersion === 'string' && LABEL.test(input.licenseTermsVersion));
  requireValue(input.licenseUnit === 'tenant' && input.licenseAllowance === 1 && input.coverage === 'entire_tenant');
  const grant = input.officeexitGrant;
  if (toolSlug === 'officeexit') {
    requireValue(grant && typeof grant.edition === 'string');
    requireValue(Object.keys(grant).length === 3 && Object.keys(grant).every(key => ['edition', 'coverage', 'capabilities'].includes(key)));
    requireValue(grant.coverage === 'entire_tenant' && Array.isArray(grant.capabilities) && grant.capabilities.length <= 64);
    requireValue(grant.capabilities.every(capability => typeof capability === 'string' && LABEL.test(capability)) && new Set(grant.capabilities).size === grant.capabilities.length);
    requireValue(isOfficeExitToolGrant({ ...grant, licenseTermsVersion: input.licenseTermsVersion }));
  } else requireValue(grant === null);
  // Copy only the specified contract, never an arbitrary provider/credential object.
  return {
    offerVersion: input.offerVersion, providerPriceId: input.providerPriceId, providerProductId: input.providerProductId,
    amountMinor: input.amountMinor, currency: input.currency, licenseTermsVersion: input.licenseTermsVersion,
    licenseUnit: input.licenseUnit, licenseAllowance: input.licenseAllowance, coverage: input.coverage,
    officeexitGrant: grant ? { edition: grant.edition, coverage: grant.coverage, capabilities: [...grant.capabilities] } : null,
  };
}
type PurchaseRow = {
  id: string; tenant_id: string; user_id: string; tool_slug: ToolPurchaseSlug; request_key: string;
  offer_snapshot: ToolPurchaseSnapshot; provider_mode: ToolProviderMode; provider_account_id: string;
  status: ToolPurchaseState; revision: number; customer_id: string | null; checkout_session_id: string | null;
  payment_intent_id: string | null; charge_id: string | null; policy_review_required: boolean;
  created_at: Date; updated_at: Date;
};
function purchase(row: PurchaseRow): ToolPurchase {
  return { id: row.id, tenantId: row.tenant_id, userId: row.user_id, toolSlug: row.tool_slug, requestKey: row.request_key,
    snapshot: row.offer_snapshot, providerMode: row.provider_mode, providerAccountId: row.provider_account_id,
    status: row.status, revision: row.revision, customerId: row.customer_id, checkoutSessionId: row.checkout_session_id,
    paymentIntentId: row.payment_intent_id, chargeId: row.charge_id, policyReviewRequired: row.policy_review_required,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await databasePool.connect();
  try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
  catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new ToolPurchaseStoreError('TOOL_PURCHASE_PROVIDER_BINDING_CONFLICT');
    throw error;
  }
  finally { client.release(); }
}

/** Server-owned actor and explicit terms only; free/paid subscription is irrelevant. */
export async function createPendingToolPurchase(input: {
  tenantId: string; userId: string; toolSlug: ToolPurchaseSlug; requestKey: string;
  snapshot: ToolPurchaseSnapshot; providerMode: ToolProviderMode; providerAccountId: string;
}): Promise<ToolPurchase> {
  validateScope(input.tenantId); requireValue(typeof input.userId === 'string' && ID.test(input.userId)); validateProvider(input.providerMode, input.providerAccountId);
  requireValue(['officeexit', 'vendortrust365'].includes(input.toolSlug));
  requireValue(typeof input.requestKey === 'string' && LABEL.test(input.requestKey));
  const snapshot = validateSnapshot(input.snapshot, input.toolSlug), snapshotHash = hash(snapshot);
  return transaction(async client => {
    const allowed = await client.query(`SELECT t.id FROM tenants t JOIN users u ON u.id=$2
      JOIN tenant_users m ON m.tenant_id=t.id AND m.user_id=u.id
      WHERE t.id=$1 AND t.status='active' AND u.status='active' AND t.owner_user_id=u.id AND m.role='owner'
      FOR SHARE OF t,u,m`, [input.tenantId, input.userId]);
    if (allowed.rowCount !== 1) throw new ToolPurchaseStoreError('TOOL_PURCHASE_OWNER_REQUIRED', 403);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['tool-lane:' + input.tenantId + ':' + input.toolSlug]);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, ['tool-order:' + input.tenantId + ':' + input.requestKey]);
    const existing = await client.query<PurchaseRow & { snapshot_sha256: string }>('SELECT * FROM tool_purchases WHERE tenant_id=$1 AND request_key=$2 FOR UPDATE', [input.tenantId, input.requestKey]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.user_id !== input.userId || row.tool_slug !== input.toolSlug || row.snapshot_sha256 !== snapshotHash || row.provider_mode !== input.providerMode || row.provider_account_id !== input.providerAccountId) throw new ToolPurchaseStoreError('TOOL_PURCHASE_REQUEST_CONFLICT');
      return purchase(row);
    }
    const current = await client.query<{ status: ToolPurchaseState }>('SELECT status FROM tool_purchases WHERE tenant_id=$1 AND tool_slug=$2 AND status IN (\'pending\',\'paid\') FOR UPDATE', [input.tenantId, input.toolSlug]);
    if (current.rows.some(row => row.status === 'paid')) throw new ToolPurchaseStoreError('TOOL_PURCHASE_ALREADY_OWNED');
    if (current.rows.length) throw new ToolPurchaseStoreError('TOOL_PURCHASE_PENDING_EXISTS');
    await client.query(`INSERT INTO tool_purchases (tenant_id,user_id,tool_slug,request_key,offer_snapshot,snapshot_sha256,provider_mode,provider_account_id)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) ON CONFLICT (tenant_id,request_key) DO NOTHING`,
    [input.tenantId, input.userId, input.toolSlug, input.requestKey, JSON.stringify(snapshot), snapshotHash, input.providerMode, input.providerAccountId]);
    const { rows } = await client.query<PurchaseRow & { snapshot_sha256: string }>(`SELECT * FROM tool_purchases WHERE tenant_id=$1 AND request_key=$2 FOR UPDATE`, [input.tenantId, input.requestKey]);
    const row = rows[0];
    if (!row || row.user_id !== input.userId || row.tool_slug !== input.toolSlug || row.snapshot_sha256 !== snapshotHash || row.provider_mode !== input.providerMode || row.provider_account_id !== input.providerAccountId) {
      throw new ToolPurchaseStoreError('TOOL_PURCHASE_REQUEST_CONFLICT');
    }
    return purchase(row);
  });
}

export async function getTenantToolPurchase(tenantId: string, purchaseId: string): Promise<ToolPurchase | null> {
  validateScope(tenantId, purchaseId);
  const { rows } = await databasePool.query<PurchaseRow>('SELECT * FROM tool_purchases WHERE tenant_id=$1 AND id=$2', [tenantId, purchaseId]);
  return rows[0] ? purchase(rows[0]) : null;
}
export async function listTenantToolPurchases(tenantId: string): Promise<ToolPurchase[]> {
  validateScope(tenantId);
  const { rows } = await databasePool.query<PurchaseRow>('SELECT * FROM tool_purchases WHERE tenant_id=$1 ORDER BY created_at DESC,id LIMIT 100', [tenantId]);
  return rows.map(purchase);
}
export async function getTenantToolAccess(tenantId: string, toolSlug: ToolPurchaseSlug): Promise<ToolPurchase | null> {
  validateScope(tenantId); requireValue(['officeexit', 'vendortrust365'].includes(toolSlug));
  const { rows } = await databasePool.query<PurchaseRow>(`SELECT * FROM tool_purchases WHERE tenant_id=$1 AND tool_slug=$2 AND status='paid' ORDER BY created_at DESC,id LIMIT 1`, [tenantId, toolSlug]);
  return rows[0] ? purchase(rows[0]) : null;
}
/** Internal settlement lookup only. Never expose this unscoped helper through a client route. */
export async function getToolPurchaseById(purchaseId: string): Promise<ToolPurchase | null> {
  requireValue(typeof purchaseId === 'string' && UUID.test(purchaseId));
  const { rows } = await databasePool.query<PurchaseRow>('SELECT * FROM tool_purchases WHERE id=$1', [purchaseId]);
  return rows[0] ? purchase(rows[0]) : null;
}
export async function findToolPurchaseByProviderBinding(input: {
  providerMode: ToolProviderMode; providerAccountId?: string; checkoutSessionId?: string; paymentIntentId?: string; chargeId?: string;
}): Promise<ToolPurchase | null> {
  requireValue(input.providerMode === 'test' || input.providerMode === 'live');
  if (input.providerAccountId !== undefined) requireValue(providerId(input.providerAccountId, 'acct_'));
  const values: unknown[] = [input.providerMode], clauses = ['provider_mode=$1'];
  if (input.providerAccountId !== undefined) { values.push(input.providerAccountId); clauses.push('provider_account_id=$' + values.length); }
  let references = 0;
  for (const [key, column, prefix] of [['checkoutSessionId', 'checkout_session_id', 'cs_'], ['paymentIntentId', 'payment_intent_id', 'pi_'], ['chargeId', 'charge_id', 'ch_']] as const) {
    if (input[key] !== undefined) { requireValue(providerId(input[key], prefix)); values.push(input[key]); clauses.push(column + '=$' + values.length); references++; }
  }
  requireValue(references > 0);
  const { rows } = await databasePool.query<PurchaseRow>('SELECT * FROM tool_purchases WHERE ' + clauses.join(' AND ') + ' LIMIT 2', values);
  if (rows.length > 1) throw new ToolPurchaseStoreError('TOOL_PURCHASE_PROVIDER_BINDING_AMBIGUOUS');
  return rows[0] ? purchase(rows[0]) : null;
}

export async function attachToolCheckout(input: {
  tenantId: string; purchaseId: string; providerMode: ToolProviderMode; providerAccountId: string;
  customerId: string; checkoutSessionId: string; paymentIntentId?: string | null;
}): Promise<ToolPurchase> {
  validateScope(input.tenantId, input.purchaseId); validateProvider(input.providerMode, input.providerAccountId);
  requireValue(providerId(input.customerId, 'cus_') && providerId(input.checkoutSessionId, 'cs_'));
  requireValue(input.paymentIntentId == null || providerId(input.paymentIntentId, 'pi_'));
  return transaction(async client => {
    const { rows } = await client.query<PurchaseRow>('SELECT * FROM tool_purchases WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [input.tenantId, input.purchaseId]);
    const row = rows[0];
    if (!row) throw new ToolPurchaseStoreError('TOOL_PURCHASE_NOT_FOUND', 404);
    if (row.provider_mode !== input.providerMode || row.provider_account_id !== input.providerAccountId
      || (row.customer_id && row.customer_id !== input.customerId) || (row.checkout_session_id && row.checkout_session_id !== input.checkoutSessionId)
      || (row.payment_intent_id && input.paymentIntentId && row.payment_intent_id !== input.paymentIntentId)) throw new ToolPurchaseStoreError('TOOL_PURCHASE_CHECKOUT_CONFLICT');
    if (row.status !== 'pending' && !row.checkout_session_id) throw new ToolPurchaseStoreError('TOOL_PURCHASE_NOT_PENDING');
    const next = await client.query<PurchaseRow>(`UPDATE tool_purchases SET customer_id=$3,checkout_session_id=$4,
      payment_intent_id=COALESCE(payment_intent_id,$5),updated_at=NOW() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [input.tenantId, input.purchaseId, input.customerId, input.checkoutSessionId, input.paymentIntentId ?? null]);
    return purchase(next.rows[0]!);
  });
}

function normalizeEvent(event: VerifiedToolPaymentEvent): VerifiedToolPaymentEvent {
  validateScope(event.tenantId, event.purchaseId); validateProvider(event.providerMode, event.providerAccountId);
  requireValue(typeof event.userId === 'string' && ID.test(event.userId) && ['officeexit', 'vendortrust365'].includes(event.toolSlug));
  requireValue(providerId(event.eventId, 'evt_') && typeof event.eventType === 'string' && LABEL.test(event.eventType));
  requireValue(typeof event.payloadSha256 === 'string' && /^[a-f0-9]{64}$/.test(event.payloadSha256));
  requireValue(providerId(event.checkoutSessionId, 'cs_') && providerId(event.customerId, 'cus_'));
  requireValue(['paid', 'refunded', 'disputed', 'cancelled'].includes(event.action));
  requireValue(event.paymentIntentId === null ? event.action === 'cancelled' : providerId(event.paymentIntentId, 'pi_'));
  requireValue(event.chargeId == null || providerId(event.chargeId, 'ch_'));
  requireValue(providerId(event.priceId, 'price_') && providerId(event.productId, 'prod_') && positiveInteger(event.amountMinor));
  requireValue(typeof event.currency === 'string' && /^[a-z]{3}$/.test(event.currency));
  if (event.action === 'refunded') requireValue(positiveInteger(event.refundedAmountMinor) && event.refundedAmountMinor <= event.amountMinor);
  else requireValue(event.refundedAmountMinor === undefined);
  return { eventId: event.eventId, eventType: event.eventType, payloadSha256: event.payloadSha256,
    providerMode: event.providerMode, providerAccountId: event.providerAccountId, purchaseId: event.purchaseId,
    tenantId: event.tenantId, userId: event.userId, toolSlug: event.toolSlug, checkoutSessionId: event.checkoutSessionId,
    customerId: event.customerId, paymentIntentId: event.paymentIntentId, chargeId: event.chargeId ?? null,
    priceId: event.priceId, productId: event.productId, amountMinor: event.amountMinor, currency: event.currency,
    action: event.action, ...(event.refundedAmountMinor === undefined ? {} : { refundedAmountMinor: event.refundedAmountMinor }) };
}
function deliveryPayload(order: ToolPurchase): ToolFulfillment['payload'] {
  if (order.status === 'pending') throw new ToolPurchaseStoreError('TOOL_PURCHASE_NOT_SETTLED');
  const grant = order.snapshot.officeexitGrant;
  return { contractVersion: 1, moduleSlug: order.toolSlug, purchaseKind: 'one_time', operatorosTenantId: order.tenantId,
    purchaseId: order.id, revision: order.revision, state: order.status === 'paid' ? 'active' : order.status,
    grant: order.status === 'paid' && grant ? { ...grant, capabilities: [...grant.capabilities], licenseTermsVersion: order.snapshot.licenseTermsVersion } : null };
}

/** Caller must first verify signature and current provider correlation; raw metadata is not authority. */
export async function applyVerifiedToolPaymentEvent(input: VerifiedToolPaymentEvent): Promise<{ purchase: ToolPurchase; duplicate: boolean; ignored: boolean }> {
  const event = normalizeEvent(input), payloadHash = hash(event);
  // Provider revalidation can derive a newer revocation from the same original
  // signed event. Its immutable identities/raw bytes must still be identical;
  // a duplicate never reapplies a new derived state under an old event id.
  const bindingHash = hash({ eventId: event.eventId, eventType: event.eventType,
    providerMode: event.providerMode, providerAccountId: event.providerAccountId, purchaseId: event.purchaseId,
    tenantId: event.tenantId, userId: event.userId, toolSlug: event.toolSlug,
    checkoutSessionId: event.checkoutSessionId, customerId: event.customerId, paymentIntentId: event.paymentIntentId,
    chargeId: event.chargeId, priceId: event.priceId, productId: event.productId, amountMinor: event.amountMinor, currency: event.currency });
  return transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['tool-event:' + event.providerMode + ':' + event.providerAccountId + ':' + event.eventId]);
    const previous = await client.query<{ raw_payload_sha256: string; binding_sha256: string; purchase_id: string; tenant_id: string; ignored: boolean }>(`SELECT * FROM tool_purchase_events WHERE provider_mode=$1 AND provider_account_id=$2 AND event_id=$3`, [event.providerMode, event.providerAccountId, event.eventId]);
    if (previous.rows[0]) {
      if (previous.rows[0].raw_payload_sha256 !== event.payloadSha256 || previous.rows[0].binding_sha256 !== bindingHash
        || previous.rows[0].purchase_id !== event.purchaseId || previous.rows[0].tenant_id !== event.tenantId) throw new ToolPurchaseStoreError('TOOL_PURCHASE_EVENT_CONFLICT');
      const existing = await client.query<PurchaseRow>('SELECT * FROM tool_purchases WHERE tenant_id=$1 AND id=$2', [event.tenantId, event.purchaseId]);
      if (!existing.rows[0]) throw new ToolPurchaseStoreError('TOOL_PURCHASE_NOT_FOUND', 404);
      return { purchase: purchase(existing.rows[0]), duplicate: true, ignored: previous.rows[0].ignored };
    }
    const current = await client.query<PurchaseRow>('SELECT * FROM tool_purchases WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [event.tenantId, event.purchaseId]);
    const row = current.rows[0];
    if (!row) throw new ToolPurchaseStoreError('TOOL_PURCHASE_NOT_FOUND', 404);
    if (row.user_id !== event.userId || row.tool_slug !== event.toolSlug || row.provider_mode !== event.providerMode || row.provider_account_id !== event.providerAccountId
      || !row.checkout_session_id || row.checkout_session_id !== event.checkoutSessionId || !row.customer_id || row.customer_id !== event.customerId
      || row.offer_snapshot.providerPriceId !== event.priceId || row.offer_snapshot.providerProductId !== event.productId || row.offer_snapshot.amountMinor !== event.amountMinor || row.offer_snapshot.currency !== event.currency
      || (row.payment_intent_id && row.payment_intent_id !== event.paymentIntentId) || (row.charge_id && event.chargeId && row.charge_id !== event.chargeId)) {
      throw new ToolPurchaseStoreError('TOOL_PURCHASE_EVENT_BINDING_MISMATCH');
    }
    const terminal = ['refunded', 'disputed', 'cancelled'].includes(row.status);
    const ignored = event.action === 'paid' && (terminal || row.status === 'paid');
    const nextStatus = ignored ? row.status : event.action;
    const changed = nextStatus !== row.status;
    const review = row.policy_review_required || (event.action === 'refunded' && event.refundedAmountMinor !== event.amountMinor);
    const updated = await client.query<PurchaseRow>(`UPDATE tool_purchases SET status=$3,revision=revision+$4,
      payment_intent_id=COALESCE(payment_intent_id,$5),charge_id=COALESCE(charge_id,$6),policy_review_required=$7,updated_at=NOW()
      WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [event.tenantId, event.purchaseId, nextStatus, changed ? 1 : 0, event.paymentIntentId, event.chargeId ?? null, review]);
    const order = purchase(updated.rows[0]!);
    await client.query(`INSERT INTO tool_purchase_events(provider_mode,provider_account_id,event_id,tenant_id,purchase_id,event_type,action,payload_sha256,raw_payload_sha256,binding_sha256,ignored)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [event.providerMode, event.providerAccountId, event.eventId, event.tenantId, event.purchaseId, event.eventType, event.action, payloadHash, event.payloadSha256, bindingHash, ignored]);
    // Only OfficeExit has a remote licensing receiver. VendorTrust access is
    // fulfilled directly from the paid ledger; it must not leave orphan bridge work.
    if (changed && order.toolSlug === 'officeexit') {
      await client.query(`INSERT INTO tool_fulfillment_outbox(tenant_id,purchase_id,tool_slug,revision,payload)
        VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(purchase_id) DO UPDATE SET
        revision=EXCLUDED.revision,payload=EXCLUDED.payload,status='pending',attempts=0,available_at=NOW(),
        lease_token=NULL,worker_id=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=NOW()
        WHERE tool_fulfillment_outbox.tenant_id=EXCLUDED.tenant_id AND tool_fulfillment_outbox.revision<EXCLUDED.revision`,
      [order.tenantId, order.id, order.toolSlug, order.revision, JSON.stringify(deliveryPayload(order))]);
    }
    return { purchase: order, duplicate: false, ignored };
  });
}

type FulfillmentRow = { id: string; tenant_id: string; purchase_id: string; tool_slug: ToolPurchaseSlug; revision: number; payload: ToolFulfillment['payload']; status: ToolFulfillment['status']; attempts: number; lease_token: string | null; lease_expires_at: Date | null };
function fulfillment(row: FulfillmentRow): ToolFulfillment { return { id: row.id, tenantId: row.tenant_id, purchaseId: row.purchase_id, toolSlug: row.tool_slug, revision: row.revision, payload: row.payload, status: row.status, attempts: row.attempts, leaseToken: row.lease_token, leaseExpiresAt: row.lease_expires_at?.toISOString() ?? null }; }
export async function claimToolFulfillment(input: { workerId: string; limit?: number; leaseSeconds?: number; toolSlug?: ToolPurchaseSlug }): Promise<ToolFulfillment[]> {
  requireValue(typeof input.workerId === 'string' && LABEL.test(input.workerId) && input.workerId.length <= 100);
  const limit = input.limit ?? 10, leaseSeconds = input.leaseSeconds ?? 60;
  requireValue(positiveInteger(limit) && limit <= 100 && positiveInteger(leaseSeconds) && leaseSeconds <= 300);
  requireValue(input.toolSlug === undefined || ['officeexit', 'vendortrust365'].includes(input.toolSlug));
  const { rows } = await databasePool.query<FulfillmentRow>(`WITH exhausted AS (
    UPDATE tool_fulfillment_outbox SET status='dead',lease_token=NULL,worker_id=NULL,lease_expires_at=NULL,last_error_code='LEASE_ATTEMPTS_EXHAUSTED',updated_at=NOW()
    WHERE status='leased' AND lease_expires_at<=NOW() AND attempts>=20
    RETURNING id
  ), ready AS (
    SELECT id FROM tool_fulfillment_outbox WHERE attempts<20 AND ($4::text IS NULL OR tool_slug=$4)
      AND ((status='pending' AND available_at<=NOW()) OR (status='leased' AND lease_expires_at<=NOW()))
    ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT $1
  ) UPDATE tool_fulfillment_outbox o SET status='leased',attempts=o.attempts+1,
    lease_token=gen_random_uuid(),worker_id=$2,lease_expires_at=NOW()+make_interval(secs=>$3),updated_at=NOW()
    FROM ready WHERE o.id=ready.id RETURNING o.*`, [limit, input.workerId, leaseSeconds, input.toolSlug ?? null]);
  return rows.map(fulfillment);
}
type DeliveryFence = { tenantId: string; purchaseId: string; revision: number; leaseToken: string };
function validateFence(input: DeliveryFence) { validateScope(input.tenantId, input.purchaseId); requireValue(positiveInteger(input.revision) && typeof input.leaseToken === 'string' && UUID.test(input.leaseToken)); }
export async function completeToolFulfillment(input: DeliveryFence): Promise<boolean> {
  validateFence(input);
  const result = await databasePool.query(`UPDATE tool_fulfillment_outbox SET status='delivered',lease_token=NULL,worker_id=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=NOW()
    WHERE tenant_id=$1 AND purchase_id=$2 AND revision=$3 AND lease_token=$4 AND status='leased' AND lease_expires_at>NOW()`, [input.tenantId, input.purchaseId, input.revision, input.leaseToken]);
  return result.rowCount === 1;
}
export async function retryToolFulfillment(input: DeliveryFence & { errorCode: string; retryAfterSeconds?: number }): Promise<boolean> {
  validateFence(input); requireValue(typeof input.errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(input.errorCode));
  const delay = input.retryAfterSeconds ?? 60; requireValue(positiveInteger(delay) && delay <= 3600);
  const result = await databasePool.query(`UPDATE tool_fulfillment_outbox SET status=CASE WHEN attempts>=20 THEN 'dead' ELSE 'pending' END,
    available_at=NOW()+make_interval(secs=>$5),lease_token=NULL,worker_id=NULL,lease_expires_at=NULL,last_error_code=$6,updated_at=NOW()
    WHERE tenant_id=$1 AND purchase_id=$2 AND revision=$3 AND lease_token=$4 AND status='leased' AND lease_expires_at>NOW()`,
  [input.tenantId, input.purchaseId, input.revision, input.leaseToken, delay, input.errorCode]);
  return result.rowCount === 1;
}

// Exposed only for explicit caller-generated operation keys, never a credential.
export const newToolPurchaseRequestKey = () => randomUUID();
