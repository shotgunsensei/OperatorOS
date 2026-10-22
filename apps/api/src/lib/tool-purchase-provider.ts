import { createHash } from 'node:crypto';
import { isOfficeExitToolGrant } from '@operatoros/sdk';
import { assertBillingWebhookBindingReady } from './billing-webhook-binding.js';
import { getStripeRuntimeMode, getStripeToolPurchaseClient } from './billing-service.js';
import type { ToolPurchase } from './tool-purchase-store.js';
import * as productionStore from './tool-purchase-store.js';

type JsonObject = Record<string, unknown>;
type ProviderMode = 'test' | 'live';
export type ToolPurchaseProviderStore = Pick<typeof productionStore,
  'getTenantToolPurchase' | 'getToolPurchaseById' | 'findToolPurchaseByProviderBinding'
  | 'attachToolCheckout' | 'applyVerifiedToolPaymentEvent'>;

export interface ToolPurchaseStripeClient {
  accounts: { retrieve(): Promise<unknown> };
  products: { retrieve(id: string): Promise<unknown> };
  prices: { retrieve(id: string): Promise<unknown> };
  customers: { create(input: unknown, options: { idempotencyKey: string }): Promise<unknown> };
  checkout: { sessions: {
    create(input: unknown, options: { idempotencyKey: string }): Promise<unknown>;
    retrieve(id: string, input?: unknown): Promise<unknown>;
  } };
  paymentIntents: { retrieve(id: string, input?: unknown): Promise<unknown> };
  charges: { retrieve(id: string): Promise<unknown> };
}

export class ToolPurchaseProviderError extends Error {
  constructor(readonly code: string, readonly statusCode = 409) {
    super('The one-time tool payment could not be validated.');
    this.name = 'ToolPurchaseProviderError';
  }
}

function failure(code: string, status = 409): never { throw new ToolPurchaseProviderError(code, status); }
const object = (value: unknown): JsonObject | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as JsonObject : null;
function id(value: unknown, prefix: string): string | null {
  const raw = typeof value === 'string' ? value : object(value)?.id;
  return typeof raw === 'string' && raw.length <= 255 && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(raw) ? raw : null;
}
function metadata(value: unknown): JsonObject { return object(object(value)?.metadata) ?? {}; }
function exact(actual: unknown, expected: unknown, code = 'TOOL_PAYMENT_BINDING_CONFLICT'): void {
  if (actual !== expected) failure(code);
}
function mode(value: unknown): ProviderMode {
  if (typeof value !== 'boolean') failure('TOOL_PAYMENT_MODE_INVALID');
  return value ? 'live' : 'test';
}

const supportedEvents = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.refunded',
  'charge.dispute.created', 'charge.dispute.closed',
]);

function orderMetadata(purchase: ToolPurchase): Record<string, string> {
  return {
    operatoros_kind: 'tool_purchase', contract_version: '1', purchase_id: purchase.id,
    tenant_id: purchase.tenantId, user_id: purchase.userId, tool_slug: purchase.toolSlug,
    offer_version: purchase.snapshot.offerVersion, provider_price_id: purchase.snapshot.providerPriceId,
    provider_product_id: purchase.snapshot.providerProductId, provider_account_id: purchase.providerAccountId,
    provider_mode: purchase.providerMode, license_terms_version: purchase.snapshot.licenseTermsVersion,
  };
}
function assertMetadata(value: unknown, purchase: ToolPurchase): void {
  const actual = metadata(value);
  for (const [key, expected] of Object.entries(orderMetadata(purchase))) exact(actual[key], expected);
}

function safeCheckoutUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 4096) failure('TOOL_CHECKOUT_URL_INVALID', 502);
  let url: URL;
  try { url = new URL(raw); } catch { return failure('TOOL_CHECKOUT_URL_INVALID', 502); }
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port
    || url.username || url.password || !url.pathname.startsWith('/c/pay/')) failure('TOOL_CHECKOUT_URL_INVALID', 502);
  return url.href;
}
function returnUrls(returnOrigin: string): { success_url: string; cancel_url: string } {
  let origin: URL;
  try { origin = new URL(returnOrigin); } catch { return failure('TOOL_CHECKOUT_RETURN_ORIGIN_INVALID', 422); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port
    || origin.pathname !== '/' || origin.search || origin.hash || origin.origin !== returnOrigin) {
    failure('TOOL_CHECKOUT_RETURN_ORIGIN_INVALID', 422);
  }
  // This is a server-owned configured origin; the public route never accepts it.
  return {
    success_url: `${origin.origin}/app?page=apps&tool_purchase=complete`,
    cancel_url: `${origin.origin}/app?page=apps&tool_purchase=cancelled`,
  };
}

function assertPrice(raw: unknown, purchase: ToolPurchase): void {
  const price = object(raw) ?? failure('TOOL_PRICE_INVALID', 503);
  exact(price.id, purchase.snapshot.providerPriceId, 'TOOL_PRICE_CONFLICT');
  exact(id(price.product, 'prod'), purchase.snapshot.providerProductId, 'TOOL_PRICE_CONFLICT');
  exact(price.type, 'one_time', 'TOOL_PRICE_NOT_ONE_TIME');
  exact(price.recurring ?? null, null, 'TOOL_PRICE_NOT_ONE_TIME');
  exact(price.unit_amount, purchase.snapshot.amountMinor, 'TOOL_PRICE_CONFLICT');
  exact(price.currency, purchase.snapshot.currency, 'TOOL_PRICE_CONFLICT');
  exact(price.livemode, purchase.providerMode === 'live', 'TOOL_PRICE_CONFLICT');
  exact(price.active, true, 'TOOL_PRICE_INACTIVE');
}

function assertApprovedTerms(purchase: ToolPurchase): void {
  exact(purchase.snapshot.amountMinor, 9900, 'TOOL_OFFER_TERMS_CONFLICT');
  exact(purchase.snapshot.currency, 'usd', 'TOOL_OFFER_TERMS_CONFLICT');
  exact(purchase.snapshot.licenseUnit, 'tenant', 'TOOL_OFFER_TERMS_CONFLICT');
  exact(purchase.snapshot.licenseAllowance, 1, 'TOOL_OFFER_TERMS_CONFLICT');
  exact(purchase.snapshot.coverage, 'entire_tenant', 'TOOL_OFFER_TERMS_CONFLICT');
  if (purchase.toolSlug === 'officeexit') {
    const grant = purchase.snapshot.officeexitGrant;
    if (!grant || !isOfficeExitToolGrant({ ...grant, licenseTermsVersion: purchase.snapshot.licenseTermsVersion })) {
      failure('TOOL_OFFER_GRANT_INVALID');
    }
  } else exact(purchase.snapshot.officeexitGrant, null, 'TOOL_OFFER_GRANT_INVALID');
}

function assertSession(raw: unknown, purchase: ToolPurchase): JsonObject {
  const session = object(raw) ?? failure('TOOL_PAYMENT_SESSION_INVALID');
  if (!purchase.checkoutSessionId || !purchase.customerId) failure('TOOL_PAYMENT_CHECKOUT_NOT_ATTACHED', 503);
  exact(id(session.id, 'cs'), purchase.checkoutSessionId);
  exact(id(session.customer, 'cus'), purchase.customerId);
  exact(session.mode, 'payment', 'TOOL_PAYMENT_NOT_ONE_TIME');
  exact(session.subscription ?? null, null, 'TOOL_PAYMENT_NOT_ONE_TIME');
  exact(mode(session.livemode), purchase.providerMode);
  exact(session.amount_total, purchase.snapshot.amountMinor);
  exact(session.amount_subtotal, purchase.snapshot.amountMinor);
  exact(session.currency, purchase.snapshot.currency);
  assertMetadata(session, purchase);
  const lines = object(session.line_items);
  if (!lines || lines.has_more !== false || !Array.isArray(lines.data) || lines.data.length !== 1) {
    failure('TOOL_PAYMENT_LINES_INVALID');
  }
  const line = object(lines.data[0]) ?? failure('TOOL_PAYMENT_LINES_INVALID');
  exact(line.quantity, 1);
  const price = object(line.price) ?? failure('TOOL_PAYMENT_LINES_INVALID');
  // The session's immutable line is authoritative even if the catalog is later
  // deactivated. No new purchase can use that deactivated catalog price.
  exact(price.id, purchase.snapshot.providerPriceId);
  exact(id(price.product, 'prod'), purchase.snapshot.providerProductId);
  exact(price.type, 'one_time', 'TOOL_PAYMENT_NOT_ONE_TIME');
  exact(price.recurring ?? null, null, 'TOOL_PAYMENT_NOT_ONE_TIME');
  exact(price.unit_amount, purchase.snapshot.amountMinor);
  exact(price.currency, purchase.snapshot.currency);
  exact(price.livemode, purchase.providerMode === 'live');
  return session;
}

export interface ToolPurchaseProviderDependencies {
  store: ToolPurchaseProviderStore;
  client(): ToolPurchaseStripeClient;
  runtimeMode(): ProviderMode | 'disabled';
  assertWebhookReady(): void;
  now?: () => number;
}

export function createToolPurchaseProvider(deps: ToolPurchaseProviderDependencies) {
  const clock = deps.now ?? Date.now;
  async function boundClient(purchase: ToolPurchase): Promise<ToolPurchaseStripeClient> {
    assertApprovedTerms(purchase);
    exact(deps.runtimeMode(), purchase.providerMode, 'TOOL_PAYMENT_RUNTIME_MODE_CONFLICT');
    const client = deps.client();
    const account = object(await client.accounts.retrieve());
    exact(account?.id, purchase.providerAccountId, 'TOOL_PAYMENT_ACCOUNT_CONFLICT');
    return client;
  }

  async function createCheckout(input: { tenantId: string; purchaseId: string; returnOrigin: string }) {
    const urls = returnUrls(input.returnOrigin);
    const purchase = await deps.store.getTenantToolPurchase(input.tenantId, input.purchaseId);
    if (!purchase) failure('TOOL_PURCHASE_NOT_FOUND', 404);
    if (purchase.status !== 'pending' || purchase.policyReviewRequired) failure('TOOL_PURCHASE_NOT_PENDING');
    deps.assertWebhookReady();
    const client = await boundClient(purchase);
    if (purchase.checkoutSessionId) {
      const session = assertSession(await client.checkout.sessions.retrieve(purchase.checkoutSessionId,
        { expand: ['line_items.data.price'] }), purchase);
      if (session.status !== 'open') failure('TOOL_CHECKOUT_RECONCILIATION_REQUIRED');
      return { checkoutUrl: safeCheckoutUrl(session.url), sessionId: purchase.checkoutSessionId, purchase };
    }
    const created = Date.parse(purchase.createdAt);
    if (!Number.isFinite(created) || created > clock() + 5000 || clock() - created > 23 * 60 * 60 * 1000) {
      failure('TOOL_CHECKOUT_RECONCILIATION_REQUIRED');
    }
    assertPrice(await client.prices.retrieve(purchase.snapshot.providerPriceId), purchase);
    const product = object(await client.products.retrieve(purchase.snapshot.providerProductId));
    exact(product?.id, purchase.snapshot.providerProductId, 'TOOL_PRICE_CONFLICT');
    exact(product?.active, true, 'TOOL_PRICE_INACTIVE');
    exact(product?.deleted ?? false, false, 'TOOL_PRICE_INACTIVE');
    exact(product?.livemode, purchase.providerMode === 'live', 'TOOL_PRICE_CONFLICT');
    const customer = object(await client.customers.create({
      metadata: { tenantId: purchase.tenantId, operatoros_customer_kind: 'independent_tools' },
    }, { idempotencyKey: `operatoros-tool-customer-${createHash('sha256').update(JSON.stringify([
      purchase.providerMode, purchase.providerAccountId, purchase.tenantId,
    ])).digest('hex')}` }));
    const customerId = id(customer?.id, 'cus') ?? failure('TOOL_CHECKOUT_CUSTOMER_INVALID', 502);
    const session = object(await client.checkout.sessions.create({
      ...urls, mode: 'payment', customer: customerId,
      client_reference_id: purchase.id,
      line_items: [{ price: purchase.snapshot.providerPriceId, quantity: 1 }],
      allow_promotion_codes: false,
      metadata: orderMetadata(purchase), payment_intent_data: { metadata: orderMetadata(purchase) },
    }, { idempotencyKey: `operatoros-tool-checkout-${purchase.id}` })) ?? failure('TOOL_CHECKOUT_RESPONSE_INVALID', 502);
    const sessionId = id(session.id, 'cs') ?? failure('TOOL_CHECKOUT_RESPONSE_INVALID', 502);
    safeCheckoutUrl(session.url);
    // A lost create response is recovered with the same order idempotency key.
    // Before attaching any provider identity, prove the authoritative session
    // against the pre-existing local order and the server-created customer.
    const verifiedSession = assertSession(await client.checkout.sessions.retrieve(sessionId,
      { expand: ['line_items.data.price'] }), { ...purchase, customerId, checkoutSessionId: sessionId });
    exact(verifiedSession.status, 'open', 'TOOL_CHECKOUT_RECONCILIATION_REQUIRED');
    const checkoutUrl = safeCheckoutUrl(verifiedSession.url);
    const attached = await deps.store.attachToolCheckout({
      tenantId: purchase.tenantId, purchaseId: purchase.id, providerMode: purchase.providerMode,
      providerAccountId: purchase.providerAccountId, customerId, checkoutSessionId: sessionId,
      paymentIntentId: id(verifiedSession.payment_intent, 'pi'),
    });
    return { checkoutUrl, sessionId, purchase: attached };
  }

  async function receiveVerifiedEvent(input: { event: unknown; rawBody: string | Buffer }) {
    const event = object(input.event);
    if (!event || typeof event.type !== 'string') return null;
    const value = object(event.data);
    const resource = object(value?.object);
    if (!resource) return null;
    const direct = metadata(resource).operatoros_kind === 'tool_purchase';
    if (!supportedEvents.has(event.type)) {
      if (direct) failure('TOOL_PAYMENT_EVENT_UNSUPPORTED', 422);
      return null;
    }
    // Malformed unrelated legacy events keep their existing dispatch behavior.
    // A direct tool marker is always fail-closed, even before local lookup.
    if (!direct && typeof event.livemode !== 'boolean') return null;
    const providerMode = mode(event.livemode);
    const account = event.account === undefined ? undefined : id(event.account, 'acct');
    const checkoutSessionId = event.type.startsWith('checkout.session.') ? id(resource.id, 'cs') : null;
    const paymentIntentId = event.type.startsWith('payment_intent.')
      ? id(resource.id, 'pi') : id(resource.payment_intent, 'pi');
    const chargeId = event.type === 'charge.refunded' ? id(resource.id, 'ch') : id(resource.charge, 'ch');
    let purchase: ToolPurchase | null;
    if (direct) {
      const purchaseId = metadata(resource).purchase_id;
      if (typeof purchaseId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(purchaseId)) {
        failure('TOOL_PAYMENT_PURCHASE_REFERENCE_INVALID', 422);
      }
      purchase = await deps.store.getToolPurchaseById(purchaseId);
      if (!purchase) failure('TOOL_PAYMENT_PURCHASE_NOT_FOUND', 503);
      assertMetadata(resource, purchase);
    } else {
      if (!checkoutSessionId && !paymentIntentId && !chargeId) return null;
      purchase = null;
      // Correlate references independently. One substituted reference must not
      // hide another known tool reference and escape into legacy settlement.
      for (const reference of [
        ...(checkoutSessionId ? [{ checkoutSessionId }] : []),
        ...(paymentIntentId ? [{ paymentIntentId }] : []), ...(chargeId ? [{ chargeId }] : []),
      ]) {
        for (const lookupMode of [providerMode, providerMode === 'live' ? 'test' as const : 'live' as const]) {
          const candidate = await deps.store.findToolPurchaseByProviderBinding({ providerMode: lookupMode, ...reference });
          if (candidate) {
            if (purchase && purchase.id !== candidate.id) failure('TOOL_PAYMENT_BINDING_CONFLICT');
            purchase = candidate;
          }
        }
      }
      if (!purchase) return null;
      if (metadata(resource).operatoros_kind !== undefined) failure('TOOL_PAYMENT_KIND_CONFLICT');
    }
    if (event.account !== undefined && !account) failure('TOOL_PAYMENT_ACCOUNT_INVALID');
    exact(providerMode, purchase.providerMode, 'TOOL_PAYMENT_MODE_CONFLICT');
    if (account) exact(account, purchase.providerAccountId, 'TOOL_PAYMENT_ACCOUNT_CONFLICT');
    if (checkoutSessionId) exact(checkoutSessionId, purchase.checkoutSessionId);
    if (paymentIntentId && purchase.paymentIntentId) exact(paymentIntentId, purchase.paymentIntentId);
    if (chargeId && purchase.chargeId) exact(chargeId, purchase.chargeId);
    if (!purchase.checkoutSessionId || !purchase.customerId) failure('TOOL_PAYMENT_CHECKOUT_NOT_ATTACHED', 503);
    const eventId = id(event.id, 'evt') ?? failure('TOOL_PAYMENT_EVENT_INVALID', 422);
    if ((!Buffer.isBuffer(input.rawBody) && typeof input.rawBody !== 'string') || input.rawBody.length === 0) {
      failure('TOOL_PAYMENT_VERIFIED_BODY_REQUIRED', 400);
    }
    const client = await boundClient(purchase);
    const session = assertSession(await client.checkout.sessions.retrieve(purchase.checkoutSessionId,
      { expand: ['line_items.data.price'] }), purchase);
    const sessionIntentId = id(session.payment_intent, 'pi');
    if (paymentIntentId) exact(paymentIntentId, sessionIntentId);
    if (purchase.paymentIntentId) exact(sessionIntentId, purchase.paymentIntentId);
    if (event.type === 'payment_intent.payment_failed' && session.status !== 'expired' && session.payment_status !== 'paid') {
      // A declined attempt can retry the same Checkout/PI. Terminally cancelling
      // this order would permit a replacement charge while the old session is
      // still payable. Observe the bound failure without changing access, the
      // pending-order fence, or fulfillment. A later paid/expired event settles.
      if (!sessionIntentId) failure('TOOL_PAYMENT_INTENT_REQUIRED');
      const intent = object(await client.paymentIntents.retrieve(sessionIntentId)) ?? failure('TOOL_PAYMENT_INTENT_INVALID');
      exact(id(intent.id, 'pi'), sessionIntentId);
      exact(id(intent.customer, 'cus'), purchase.customerId);
      exact(intent.amount, purchase.snapshot.amountMinor);
      exact(intent.currency, purchase.snapshot.currency);
      exact(mode(intent.livemode), purchase.providerMode);
      assertMetadata(intent, purchase);
      if (!['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'canceled'].includes(String(intent.status))) {
        failure('TOOL_PAYMENT_FAILURE_STATE_CONFLICT');
      }
      return { handled: true as const, duplicate: false, ignored: true, purchase };
    }
    const cancelling = ['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)
      || (event.type === 'payment_intent.payment_failed' && session.status === 'expired');
    let action: 'paid' | 'refunded' | 'disputed' | 'cancelled' = cancelling ? 'cancelled' : 'paid';
    let verifiedChargeId: string | null = null;
    let refundedAmountMinor: number | undefined;
    if (cancelling) {
      if (session.payment_status === 'paid') failure('TOOL_PAYMENT_CANCEL_CONFLICT');
      if (event.type === 'checkout.session.expired') exact(session.status, 'expired');
    } else {
      exact(session.payment_status, 'paid', 'TOOL_PAYMENT_NOT_PAID');
      if (!sessionIntentId) failure('TOOL_PAYMENT_INTENT_REQUIRED');
      const intent = object(await client.paymentIntents.retrieve(sessionIntentId, { expand: ['latest_charge'] }))
        ?? failure('TOOL_PAYMENT_INTENT_INVALID');
      exact(id(intent.id, 'pi'), sessionIntentId);
      exact(id(intent.customer, 'cus'), purchase.customerId);
      exact(intent.amount, purchase.snapshot.amountMinor);
      exact(intent.amount_received, purchase.snapshot.amountMinor);
      exact(intent.currency, purchase.snapshot.currency);
      exact(mode(intent.livemode), purchase.providerMode);
      exact(intent.status, 'succeeded', 'TOOL_PAYMENT_NOT_PAID');
      assertMetadata(intent, purchase);
      verifiedChargeId = id(intent.latest_charge, 'ch') ?? failure('TOOL_PAYMENT_CHARGE_REQUIRED');
      if (chargeId) exact(verifiedChargeId, chargeId);
      if (purchase.chargeId) exact(verifiedChargeId, purchase.chargeId);
      const charge = object(intent.latest_charge) ?? object(await client.charges.retrieve(verifiedChargeId))
        ?? failure('TOOL_PAYMENT_CHARGE_INVALID');
      exact(id(charge.id, 'ch'), verifiedChargeId);
      exact(id(charge.payment_intent, 'pi'), sessionIntentId);
      exact(id(charge.customer, 'cus'), purchase.customerId);
      exact(charge.amount, purchase.snapshot.amountMinor);
      exact(charge.currency, purchase.snapshot.currency);
      exact(mode(charge.livemode), purchase.providerMode);
      exact(charge.paid, true, 'TOOL_PAYMENT_NOT_PAID');
      if (typeof charge.disputed !== 'boolean') failure('TOOL_PAYMENT_DISPUTE_INVALID');
      const refunded = charge.amount_refunded;
      if (!Number.isSafeInteger(refunded) || (refunded as number) < 0 || (refunded as number) > purchase.snapshot.amountMinor) {
        failure('TOOL_PAYMENT_REFUND_INVALID');
      }
      if (event.type.startsWith('charge.dispute.') || charge.disputed === true) action = 'disputed';
      else if ((refunded as number) > 0) { action = 'refunded'; refundedAmountMinor = refunded as number; }
      else if (event.type === 'charge.refunded') failure('TOOL_PAYMENT_REFUND_NOT_CONFIRMED');
    }
    let applied: Awaited<ReturnType<ToolPurchaseProviderStore['applyVerifiedToolPaymentEvent']>>;
    try {
      applied = await deps.store.applyVerifiedToolPaymentEvent({
        eventId, eventType: event.type, payloadSha256: createHash('sha256').update(input.rawBody).digest('hex'),
        providerMode: purchase.providerMode, providerAccountId: purchase.providerAccountId,
        purchaseId: purchase.id, tenantId: purchase.tenantId, userId: purchase.userId,
        toolSlug: purchase.toolSlug, checkoutSessionId: purchase.checkoutSessionId,
        customerId: purchase.customerId, paymentIntentId: sessionIntentId, chargeId: verifiedChargeId,
        priceId: purchase.snapshot.providerPriceId, productId: purchase.snapshot.providerProductId,
        amountMinor: purchase.snapshot.amountMinor, currency: purchase.snapshot.currency,
        action, ...(refundedAmountMinor !== undefined ? { refundedAmountMinor } : {}),
      });
    } catch {
      return failure('TOOL_PAYMENT_SETTLEMENT_RETRY_REQUIRED', 503);
    }
    return { handled: true as const, duplicate: applied.duplicate, ignored: applied.ignored, purchase: applied.purchase };
  }
  return { createCheckout, receiveVerifiedEvent };
}

const provider = createToolPurchaseProvider({
  store: productionStore,
  client: getStripeToolPurchaseClient,
  runtimeMode: getStripeRuntimeMode,
  assertWebhookReady: assertBillingWebhookBindingReady,
});
export const createToolCheckoutForPurchase = provider.createCheckout;
/** Only call after the shared billing adapter verified these exact raw bytes. */
export const receiveVerifiedToolPurchaseEvent = provider.receiveVerifiedEvent;
