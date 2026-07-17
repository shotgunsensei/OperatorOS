import { logger as defaultLogger } from './logger';

export interface GrantOpts {
  userId: string;
  productId: string;
  source: string;
  stripePaymentId?: string | null;
}

export interface RecordPurchaseOpts {
  userId: string;
  productId: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  amount?: number | null;
  currency?: string | null;
}

export interface RevokeOpts {
  userId: string;
  productId: string;
}

export interface StripeEventDeps {
  grantEntitlement: (opts: GrantOpts) => Promise<unknown>;
  recordPurchase: (opts: RecordPurchaseOpts) => Promise<unknown>;
  revokeEntitlement: (opts: RevokeOpts) => Promise<number>;
  logger?: { warn: (...args: any[]) => void; error: (...args: any[]) => void };
}

export interface HandleResult {
  type: string;
  action: 'granted' | 'revoked' | 'ignored' | 'skipped';
  userId?: string;
  productId?: string;
  reason?: string;
}

/**
 * Pure event-routing layer for Stripe webhook events. It is intentionally
 * decoupled from the database so we can drive it with fixture events in tests.
 *
 * Handles:
 *   - checkout.session.completed → grant entitlement + record purchase
 *   - customer.subscription.deleted → revoke the subscription entitlement
 *   - customer.subscription.updated with status canceled / unpaid / incomplete_expired
 *     → revoke the subscription entitlement (mirrors the client "expired" case)
 */
export async function handleStripeEvent(
  event: any,
  deps: StripeEventDeps
): Promise<HandleResult> {
  const log = deps.logger ?? defaultLogger;
  const type: string = event?.type ?? '';

  if (type === 'checkout.session.completed') {
    const session = event?.data?.object ?? {};
    const md = session.metadata ?? {};
    const userId = md.userId;
    const productId = md.catalogProductId;
    if (!userId || !productId) {
      log.warn({ type, sessionId: session.id }, '[stripe] missing metadata, skipping fulfillment');
      return { type, action: 'skipped', reason: 'missing-metadata' };
    }
    const stripePaymentId =
      session.payment_intent || session.subscription || session.id || null;
    await deps.grantEntitlement({
      userId,
      productId,
      source: 'stripe',
      stripePaymentId,
    });
    await deps.recordPurchase({
      userId,
      productId,
      stripeSessionId: session.id ?? null,
      stripePaymentIntentId: session.payment_intent ?? null,
      amount: session.amount_total ?? null,
      currency: session.currency ?? 'usd',
    });
    return { type, action: 'granted', userId, productId };
  }

  if (
    type === 'customer.subscription.deleted' ||
    (type === 'customer.subscription.updated' && isCanceledStatus(event?.data?.object?.status))
  ) {
    const sub = event?.data?.object ?? {};
    const md = sub.metadata ?? {};
    const userId = md.userId;
    const productId = md.catalogProductId || 'pro-subscription';
    if (!userId) {
      log.warn({ type, subId: sub.id }, '[stripe] subscription event missing userId, skipping');
      return { type, action: 'skipped', reason: 'missing-userId' };
    }
    await deps.revokeEntitlement({ userId, productId });
    return { type, action: 'revoked', userId, productId };
  }

  return { type, action: 'ignored' };
}

function isCanceledStatus(status: unknown): boolean {
  return (
    status === 'canceled' ||
    status === 'unpaid' ||
    status === 'incomplete_expired'
  );
}
