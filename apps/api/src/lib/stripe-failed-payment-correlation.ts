import { stripeInvoiceSubscriptionId } from './stripe-invoice-subscription.js';

type ObjectValue = Record<string, unknown>;
type ReadOptions = { timeout: number; maxNetworkRetries: number };

/** Central-account reads only; no provider mutation or database capability. */
export interface FailedPaymentReadClient {
  paymentIntents: { retrieve(id: string, params: unknown, options: ReadOptions): Promise<unknown> };
  invoicePayments: { list(params: {
    payment: { type: 'payment_intent'; payment_intent: string };
    limit: number; starting_after?: string;
  }, options: ReadOptions): Promise<unknown> };
  invoices: { retrieve(id: string, params: unknown, options: ReadOptions): Promise<unknown> };
  subscriptions: { retrieve(id: string, params: unknown, options: ReadOptions): Promise<unknown> };
}

export type FailedPaymentCorrelation = {
  ok: true;
  paymentIntentId: string;
  invoiceId: string;
  subscriptionId: string;
  customerId: string;
  tenantId: string;
  stackId: string;
  checkoutAttemptId: string;
  subscription: ObjectValue;
} | { ok: false; error: string };

class CorrelationError extends Error {}
function reject(code: string): never { throw new CorrelationError(code); }
function object(value: unknown): ObjectValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && value.trim() === value;
}
function resourceId(value: unknown, prefix: string): string | null {
  const expanded = object(value);
  if (expanded?.deleted === true) return null;
  const expectedObject: Record<string, string> = { pi_: 'payment_intent', cus_: 'customer', in_: 'invoice', sub_: 'subscription', evt_: 'event' };
  if (expanded?.object != null && expanded.object !== expectedObject[prefix]) return null;
  const id = typeof value === 'string' ? value : expanded?.id;
  return text(id) && id.startsWith(prefix) && id.length > prefix.length && /^[A-Za-z0-9_]+$/.test(id) ? id : null;
}
function customer(value: ObjectValue, expectedMode: boolean): string {
  const id = resourceId(value.customer, 'cus_');
  if (!id || value.customer_account != null || value.livemode !== expectedMode) {
    reject('FAILED_PAYMENT_CUSTOMER_OR_MODE_MISMATCH');
  }
  return id;
}

/**
 * Resolve one exact PI -> invoice -> canonical subscription graph. A failed
 * attempt never supplies lifecycle/paid/entitlement authority. Unknown or
 * incomplete graphs stay retryable, including multi-invoice allocations.
 */
export async function resolveBoundStackFailedPayment(
  event: unknown,
  getClient: () => FailedPaymentReadClient,
  mode: string,
  now: () => number = Date.now,
): Promise<FailedPaymentCorrelation> {
  try {
    const envelope = object(event);
    const snapshot = object(object(envelope?.data)?.object);
    const paymentIntentId = resourceId(snapshot?.id, 'pi_');
    if (!envelope || envelope.type !== 'payment_intent.payment_failed'
        || !resourceId(envelope.id, 'evt_') || !snapshot || snapshot.object !== 'payment_intent'
        || !paymentIntentId) reject('FAILED_PAYMENT_EVENT_INVALID');
    // Do not forward arbitrary Connect/org context into the central key's
    // request options, or silently read an object from a different account.
    if (envelope.account != null || envelope.context != null) reject('FAILED_PAYMENT_CONTEXT_UNSUPPORTED');
    if (!['test', 'live'].includes(mode) || envelope.livemode !== (mode === 'live')) {
      reject('FAILED_PAYMENT_EVENT_MODE_MISMATCH');
    }
    const expectedMode = mode === 'live';
    const customerId = customer(snapshot, expectedMode);
    const deadline = now() + 10_000;
    const client = getClient();
    async function read(action: (options: ReadOptions) => Promise<unknown>) {
      const remaining = deadline - now();
      if (remaining <= 0) reject('FAILED_PAYMENT_CORRELATION_TIMEOUT');
      const timeout = Math.min(3_000, remaining);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // SDK socket timeouts do not bound a never-settling/trickling read.
        // Promise.race observes late outcomes but cannot resume this graph
        // after timeout. The underlying SDK GET may finish; it has no writes.
        const pending = Promise.resolve().then(() => action({ timeout, maxNetworkRetries: 0 }));
        const value = await Promise.race([pending, new Promise<never>((_resolve, rejectTimeout) => {
          timer = setTimeout(() => rejectTimeout(new CorrelationError('FAILED_PAYMENT_CORRELATION_TIMEOUT')), timeout);
        })]);
        if (now() >= deadline) reject('FAILED_PAYMENT_CORRELATION_TIMEOUT');
        return value;
      } finally { clearTimeout(timer); }
    }
    const current = object(await read(options => client.paymentIntents.retrieve(paymentIntentId, {}, options)));
    if (!current || current.object !== 'payment_intent' || current.id !== paymentIntentId
        || customer(current, expectedMode) !== customerId) reject('FAILED_PAYMENT_INTENT_MISMATCH');

    const seen = new Set<string>();
    const invoiceIds = new Set<string>();
    let cursor: string | undefined;
    let complete = false;
    for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
      const page = object(await read(options => client.invoicePayments.list({
        payment: { type: 'payment_intent', payment_intent: paymentIntentId }, limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }, options)));
      if (!page || page.object !== 'list' || !Array.isArray(page.data)
          || typeof page.has_more !== 'boolean' || page.data.length > 100) reject('FAILED_PAYMENT_PAGE_INVALID');
      for (const value of page.data) {
        const allocation = object(value);
        const payment = object(allocation?.payment);
        const invoiceId = resourceId(allocation?.invoice, 'in_');
        if (!allocation || allocation.object !== 'invoice_payment' || !text(allocation.id)
            || seen.has(allocation.id) || allocation.livemode !== expectedMode
            || payment?.type !== 'payment_intent' || resourceId(payment.payment_intent, 'pi_') !== paymentIntentId
            || !invoiceId) reject('FAILED_PAYMENT_ALLOCATION_INVALID');
        seen.add(allocation.id);
        invoiceIds.add(invoiceId);
      }
      if (page.has_more === false) { complete = true; break; }
      const last = object(page.data.at(-1));
      if (!last || !text(last.id) || last.id === cursor) reject('FAILED_PAYMENT_PAGE_INVALID');
      cursor = last.id;
    }
    if (!complete) reject('FAILED_PAYMENT_PAGE_LIMIT');
    if (invoiceIds.size !== 1) reject('FAILED_PAYMENT_INVOICE_AMBIGUOUS');
    const invoiceId = [...invoiceIds][0];
    const invoice = object(await read(options => client.invoices.retrieve(invoiceId, {}, options)));
    const parent = object(invoice?.parent);
    const details = object(parent?.subscription_details);
    const subscriptionId = stripeInvoiceSubscriptionId(invoice);
    if (!invoice || invoice.object !== 'invoice' || invoice.deleted === true || invoice.id !== invoiceId
        || customer(invoice, expectedMode) !== customerId || parent?.type !== 'subscription_details'
        || !details || !resourceId(subscriptionId, 'sub_')) reject('FAILED_PAYMENT_INVOICE_MISMATCH');
    const subscription = object(await read(options => client.subscriptions.retrieve(subscriptionId!, {
      expand: ['items.data.price'],
    }, options)));
    const metadata = object(subscription?.metadata);
    if (!subscription || subscription.object !== 'subscription' || subscription.id !== subscriptionId
        || customer(subscription, expectedMode) !== customerId || !metadata
        || metadata.billing_model !== 'core_product_stack' || metadata.billing_interval !== 'month'
        || metadata.type === 'addon' || metadata.kind === 'addon'
        || metadata.type === 'feature_addon' || metadata.kind === 'feature_addon'
        || !text(metadata.tenant_id) || !text(metadata.internal_application_subscription_id)
        || !text(metadata.checkout_attempt_id)) reject('FAILED_PAYMENT_SUBSCRIPTION_MISMATCH');
    // These are contradiction checks only. The exact graph and local binding,
    // not any optional PI/invoice metadata, must establish tenant authority.
    for (const hint of [snapshot.metadata, current.metadata, details.metadata]) {
      if (hint == null) continue;
      const claim = object(hint);
      if (!claim) reject('FAILED_PAYMENT_METADATA_MISMATCH');
      if (claim.operatoros_kind === 'torque_assist_credit' || ['addon', 'feature_addon'].includes(String(claim.type))
          || ['addon', 'feature_addon'].includes(String(claim.kind))) reject('FAILED_PAYMENT_METADATA_SCOPE_UNSUPPORTED');
      for (const key of ['billing_model', 'tenant_id', 'internal_application_subscription_id', 'checkout_attempt_id']) {
        if (claim[key] != null && claim[key] !== metadata[key]) reject('FAILED_PAYMENT_METADATA_MISMATCH');
      }
    }
    return { ok: true, paymentIntentId, invoiceId, subscriptionId: subscriptionId!, customerId,
      tenantId: metadata.tenant_id, stackId: metadata.internal_application_subscription_id,
      checkoutAttemptId: metadata.checkout_attempt_id, subscription };
  } catch (error) {
    // Provider errors can contain client secrets or payment/customer details.
    // Keep a fixed retry reason rather than copying any raw provider message.
    return { ok: false, error: error instanceof CorrelationError ? error.message : 'FAILED_PAYMENT_PROVIDER_UNAVAILABLE' };
  }
}
