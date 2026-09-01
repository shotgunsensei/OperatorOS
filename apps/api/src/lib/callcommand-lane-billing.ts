import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { modules, subscriptions, tenantUsers, users } from '../schema.js';
import {
  getStripeFeatureBillingClient,
  isStripeEnabled,
} from './billing-service.js';
import { resolveAppBaseUrl } from './public-url.js';
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
} from './shared-usage-activity.js';

export const CALLCOMMAND_LANE_ENTITLEMENT_KEY = 'callcommand.concurrent_calls';
export const CALLCOMMAND_LANE_FEATURE_KEY = 'concurrent_call_lane';
export const CALLCOMMAND_LANE_PRICE_LOOKUP_KEY = 'operatoros_callcommand_concurrent_lane_monthly_v1';
export const CALLCOMMAND_LANE_DEFAULT_PRICE_CENTS = 4_900;
export const CALLCOMMAND_LANE_MAX_ADDITIONAL = 100;

type Row = Record<string, any>;

export class CallCommandLaneBillingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function getCallCommandLanePriceCents(value = process.env.CALLCOMMAND_LANE_PRICE_CENTS): number {
  if (!value) return CALLCOMMAND_LANE_DEFAULT_PRICE_CENTS;
  if (!/^\d{3,6}$/.test(value)) {
    throw new CallCommandLaneBillingError(
      'CALLCOMMAND_LANE_PRICE_CENTS must be a whole USD-cent amount',
      'CALLCOMMAND_LANE_PRICE_INVALID',
      500,
    );
  }
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 500 || cents > 100_000) {
    throw new CallCommandLaneBillingError(
      'CALLCOMMAND_LANE_PRICE_CENTS is outside the supported range',
      'CALLCOMMAND_LANE_PRICE_INVALID',
      500,
    );
  }
  return cents;
}

export function getCallCommandLaneCatalog() {
  const priceId = process.env.STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY?.trim() || null;
  return {
    entitlementKey: CALLCOMMAND_LANE_ENTITLEMENT_KEY,
    feature: CALLCOMMAND_LANE_FEATURE_KEY,
    lookupKey: CALLCOMMAND_LANE_PRICE_LOOKUP_KEY,
    unitAmountCents: getCallCommandLanePriceCents(),
    currency: 'usd',
    interval: 'month',
    baseIncludedLanes: 1,
    priceConfigured: Boolean(priceId),
    stripeConfigured: isStripeEnabled(),
  } as const;
}

function additionalLaneQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > CALLCOMMAND_LANE_MAX_ADDITIONAL) {
    throw new CallCommandLaneBillingError(
      `additionalLanes must be an integer between 0 and ${CALLCOMMAND_LANE_MAX_ADDITIONAL}`,
      'CALLCOMMAND_LANE_QUANTITY_INVALID',
    );
  }
  return quantity;
}

function laneBillingIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,160}$/.test(value)) {
    throw new CallCommandLaneBillingError(
      'idempotencyKey must contain 8 to 160 safe characters',
      'CALLCOMMAND_LANE_IDEMPOTENCY_KEY_INVALID',
      422,
    );
  }
  return value;
}

function stripeIdempotencyKey(
  tenantId: string,
  idempotencyKey: string,
  operation: 'customer' | 'checkout' | 'update',
): string {
  const source = operation === 'customer'
    ? `callcommand-lane:${tenantId}:customer`
    : `callcommand-lane:${tenantId}:${idempotencyKey}:${operation}`;
  return `operatoros_cc_lane_${operation}_${createHash('sha256').update(source).digest('hex')}`;
}

function configuredPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY?.trim() || '';
  if (!/^price_[A-Za-z0-9_]+$/.test(priceId)) {
    throw new CallCommandLaneBillingError(
      'The CallCommand concurrent-lane Stripe Price is not configured',
      'CALLCOMMAND_LANE_PRICE_NOT_CONFIGURED',
      409,
    );
  }
  return priceId;
}

export interface CallCommandLaneCheckoutInput {
  tenantId: string;
  userId: string;
  additionalLanes: number;
  idempotencyKey: string;
}

export interface CallCommandLaneCheckoutResult {
  action: 'checkout_created' | 'quantity_update_pending';
  additionalLanes: number;
  effectiveLanesBeforeSettlement: number;
  effectiveLanesAfterSettlement: number;
  checkoutUrl?: string;
  subscriptionId?: string;
}

function storedLaneCheckoutResult(value: unknown): CallCommandLaneCheckoutResult {
  const row = value && typeof value === 'object' ? value as Row : null;
  const action = row?.action;
  const additionalLanes = Number(row?.additionalLanes);
  const effectiveLanesBeforeSettlement = Number(row?.effectiveLanesBeforeSettlement);
  const effectiveLanesAfterSettlement = Number(row?.effectiveLanesAfterSettlement);
  if (
    (action !== 'checkout_created' && action !== 'quantity_update_pending')
    || !Number.isInteger(additionalLanes)
    || additionalLanes < 0
    || additionalLanes > CALLCOMMAND_LANE_MAX_ADDITIONAL
    || !Number.isInteger(effectiveLanesBeforeSettlement)
    || effectiveLanesBeforeSettlement < 0
    || !Number.isInteger(effectiveLanesAfterSettlement)
    || effectiveLanesAfterSettlement < 0
  ) {
    throw new CallCommandLaneBillingError(
      'The persisted lane billing response is invalid',
      'CALLCOMMAND_LANE_IDEMPOTENCY_RESPONSE_INVALID',
      500,
    );
  }
  if (action === 'checkout_created' && typeof row?.checkoutUrl !== 'string') {
    throw new CallCommandLaneBillingError(
      'The persisted lane checkout response is incomplete',
      'CALLCOMMAND_LANE_IDEMPOTENCY_RESPONSE_INVALID',
      500,
    );
  }
  if (action === 'quantity_update_pending' && typeof row?.subscriptionId !== 'string') {
    throw new CallCommandLaneBillingError(
      'The persisted lane update response is incomplete',
      'CALLCOMMAND_LANE_IDEMPOTENCY_RESPONSE_INVALID',
      500,
    );
  }
  return {
    action,
    additionalLanes,
    effectiveLanesBeforeSettlement,
    effectiveLanesAfterSettlement,
    ...(typeof row?.checkoutUrl === 'string' ? { checkoutUrl: row.checkoutUrl } : {}),
    ...(typeof row?.subscriptionId === 'string' ? { subscriptionId: row.subscriptionId } : {}),
  };
}

/**
 * Creates the licensed quantity checkout or requests an update to the one
 * existing lane item.  This function never changes effective capacity.  Only
 * the signed central Stripe webhook settles pending quantity into the runtime
 * projection after payment evidence arrives.
 */
export async function createOrUpdateCallCommandLaneCheckout(
  input: CallCommandLaneCheckoutInput,
): Promise<CallCommandLaneCheckoutResult> {
  const quantity = additionalLaneQuantity(input.additionalLanes);
  const idempotencyKey = laneBillingIdempotencyKey(input.idempotencyKey);
  const priceId = configuredPriceId();
  if (!isStripeEnabled()) {
    throw new CallCommandLaneBillingError(
      'Stripe checkout is not configured',
      'STRIPE_NOT_CONFIGURED',
      409,
    );
  }
  const stripe = getStripeFeatureBillingClient();
  return db.transaction(async tx => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`callcommand-lane-billing:${input.tenantId}`}, 0)
      )
    `);

    const [moduleRow] = await tx.select({ id: modules.id }).from(modules)
      .where(eq(modules.slug, 'callcommand-ai'))
      .limit(1);
    if (!moduleRow) {
      throw new CallCommandLaneBillingError(
        'CallCommand billing is not configured',
        'CALLCOMMAND_LANE_MODULE_NOT_CONFIGURED',
        503,
      );
    }

    const idempotency = await beginIdempotentOperation({
      tenantId: input.tenantId,
      moduleId: moduleRow.id,
      scope: 'callcommand-lane-billing',
      idempotencyKey,
      request: { userId: input.userId, additionalLanes: quantity, priceId },
      leaseMs: 5 * 60_000,
    }, tx);
    if (idempotency.state === 'replay') {
      return storedLaneCheckoutResult(idempotency.responseJson);
    }
    if (idempotency.state === 'conflict') {
      throw new CallCommandLaneBillingError(
        'The idempotency key was already used for a different lane request',
        'CALLCOMMAND_LANE_IDEMPOTENCY_CONFLICT',
        409,
      );
    }
    if (idempotency.state === 'in_progress') {
      throw new CallCommandLaneBillingError(
        'The lane billing request is already in progress',
        'CALLCOMMAND_LANE_REQUEST_IN_PROGRESS',
        409,
      );
    }

    const [user] = await tx.select({
      id: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
    }).from(users).innerJoin(
      tenantUsers,
      and(eq(tenantUsers.userId, users.id), eq(tenantUsers.tenantId, input.tenantId)),
    ).where(eq(users.id, input.userId)).limit(1);
    if (!user || user.status !== 'active') {
      throw new CallCommandLaneBillingError('User was not found', 'USER_NOT_FOUND', 404);
    }

    const existing = await tx.execute(sql`
      SELECT * FROM callcommand_capacity_entitlements
      WHERE tenant_id = ${input.tenantId}
      LIMIT 1
      FOR UPDATE
    `);
    const current = existing.rows[0] as Row | undefined;
    const [baseSubscription] = await tx.select().from(subscriptions)
      .where(and(
        eq(subscriptions.userId, input.userId),
        eq(subscriptions.tenantId, input.tenantId),
      ))
      .limit(1);
    const subscriptionId = String(current?.stripe_subscription_id ?? '');
    const subscriptionItemId = String(current?.stripe_subscription_item_id ?? '');
    const hasSubscription = Boolean(subscriptionId && subscriptionItemId);
    if (Boolean(subscriptionId) !== Boolean(subscriptionItemId)) {
      throw new CallCommandLaneBillingError(
        'The existing lane subscription state is incomplete',
        'CALLCOMMAND_LANE_BILLING_STATE_INVALID',
        409,
      );
    }
    if (quantity === 0 && !hasSubscription) {
      throw new CallCommandLaneBillingError(
        'There is no licensed lane subscription to cancel',
        'CALLCOMMAND_LANE_SUBSCRIPTION_NOT_FOUND',
        409,
      );
    }

    const baseLanes = Number(current?.base_lanes ?? 1);
    const currentAdditionalLanes = Number(current?.additional_lanes ?? 0);
    const metadata = {
      type: 'feature_addon',
      kind: 'feature_addon',
      operatoros_module: 'callcommand-ai',
      module_slug: 'callcommand-ai',
      feature: CALLCOMMAND_LANE_FEATURE_KEY,
      entitlement: CALLCOMMAND_LANE_ENTITLEMENT_KEY,
      billing_type: 'licensed_quantity',
      tenant_id: input.tenantId,
      user_id: input.userId,
      initiated_by_user_id: input.userId,
      requested_additional_lanes: String(quantity),
      price_lookup_key: CALLCOMMAND_LANE_PRICE_LOOKUP_KEY,
    };

    let customerId = String(current?.stripe_customer_id ?? baseSubscription?.stripeCustomerId ?? '');
    let result: CallCommandLaneCheckoutResult;
    try {
      if (hasSubscription && current) {
        const updateSubscription = stripe.subscriptions.update as unknown as (
          id: string,
          params: Record<string, unknown>,
          options: { idempotencyKey: string },
        ) => Promise<unknown>;
        await updateSubscription(
          subscriptionId,
          quantity === 0
            ? {
                cancel_at_period_end: true,
                metadata,
              }
            : {
                items: [{ id: String(current.stripe_subscription_item_id), quantity }],
                cancel_at_period_end: false,
                payment_behavior: 'pending_if_incomplete',
                proration_behavior: 'always_invoice',
                metadata,
              },
          { idempotencyKey: stripeIdempotencyKey(input.tenantId, idempotencyKey, 'update') },
        );
        result = {
          action: 'quantity_update_pending',
          additionalLanes: quantity,
          effectiveLanesBeforeSettlement: baseLanes + currentAdditionalLanes,
          effectiveLanesAfterSettlement: baseLanes + quantity,
          subscriptionId,
        };
      } else {
        if (!customerId) {
          const createCustomer = stripe.customers.create as unknown as (
            params: Record<string, unknown>,
            options: { idempotencyKey: string },
          ) => Promise<{ id: string }>;
          const customer = await createCustomer({
            email: user.email,
            name: user.name,
            metadata: { operatoros_user_id: input.userId, tenant_id: input.tenantId },
          }, {
            idempotencyKey: stripeIdempotencyKey(input.tenantId, idempotencyKey, 'customer'),
          });
          customerId = customer.id;
        }

        const appUrl = resolveAppBaseUrl();
        const createCheckout = stripe.checkout.sessions.create as unknown as (
          params: Record<string, unknown>,
          options: { idempotencyKey: string },
        ) => Promise<{ id: string; url: string | null }>;
        const session = await createCheckout({
          customer: customerId,
          mode: 'subscription',
          line_items: [{ price: priceId, quantity }],
          success_url: `${appUrl}/modules/callcommand-ai/billing?lane=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/modules/callcommand-ai/billing?lane=canceled`,
          client_reference_id: input.tenantId,
          metadata,
          subscription_data: { metadata },
        }, {
          idempotencyKey: stripeIdempotencyKey(input.tenantId, idempotencyKey, 'checkout'),
        });
        if (!session.url) {
          throw new CallCommandLaneBillingError(
            'Stripe did not return a checkout URL',
            'CALLCOMMAND_LANE_CHECKOUT_UNAVAILABLE',
            502,
          );
        }
        result = {
          action: 'checkout_created',
          additionalLanes: quantity,
          effectiveLanesBeforeSettlement: baseLanes + currentAdditionalLanes,
          effectiveLanesAfterSettlement: baseLanes + quantity,
          checkoutUrl: session.url,
        };
      }
    } catch (error) {
      if (error instanceof CallCommandLaneBillingError) throw error;
      throw new CallCommandLaneBillingError(
        'Stripe did not accept the lane billing request',
        'CALLCOMMAND_LANE_STRIPE_REQUEST_FAILED',
        502,
      );
    }

    await tx.execute(sql`
      INSERT INTO callcommand_capacity_entitlements (
        tenant_id, base_lanes, additional_lanes, pending_additional_lanes,
        billing_status, stripe_customer_id, stripe_price_id,
        price_lookup_key, version, updated_at
      ) VALUES (
        ${input.tenantId}, 1, 0, ${quantity}, 'pending', ${customerId || null},
        ${priceId}, ${CALLCOMMAND_LANE_PRICE_LOOKUP_KEY}, 1, NOW()
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        pending_additional_lanes = EXCLUDED.pending_additional_lanes,
        billing_status = CASE
          WHEN callcommand_capacity_entitlements.billing_status = 'active' THEN 'active'
          ELSE EXCLUDED.billing_status
        END,
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, callcommand_capacity_entitlements.stripe_customer_id),
        stripe_price_id = EXCLUDED.stripe_price_id,
        price_lookup_key = EXCLUDED.price_lookup_key,
        version = callcommand_capacity_entitlements.version + 1,
        updated_at = NOW()
    `);
    await completeIdempotentOperation({
      tenantId: input.tenantId,
      id: idempotency.id,
      leaseExpiresAt: idempotency.leaseExpiresAt,
      responseStatus: result.action === 'checkout_created' ? 201 : 202,
      responseJson: result,
    }, tx);
    return result;
  });
}

function eventMetadata(object: Row): Row[] {
  const candidates: Row[] = [];
  if (object.metadata && typeof object.metadata === 'object') candidates.push(object.metadata);
  if (object.subscription_data?.metadata) candidates.push(object.subscription_data.metadata);
  if (object.subscription_details?.metadata) candidates.push(object.subscription_details.metadata);
  for (const line of object.lines?.data ?? []) {
    if (line?.metadata) candidates.push(line.metadata);
    if (line?.parent?.subscription_item_details?.subscription?.metadata) {
      candidates.push(line.parent.subscription_item_details.subscription.metadata);
    }
  }
  return candidates;
}

function laneMetadata(object: Row): Row | null {
  return eventMetadata(object).find(metadata =>
    metadata?.feature === CALLCOMMAND_LANE_FEATURE_KEY
      || metadata?.entitlement === CALLCOMMAND_LANE_ENTITLEMENT_KEY,
  ) ?? null;
}

function eventSubscriptionId(type: string, object: Row): string | null {
  if (type.startsWith('customer.subscription.')) return typeof object.id === 'string' ? object.id : null;
  if (typeof object.subscription === 'string') return object.subscription;
  if (typeof object.subscription?.id === 'string') return object.subscription.id;
  if (typeof object.subscription_details?.subscription === 'string') return object.subscription_details.subscription;
  return null;
}

function laneLine(object: Row, priceId: string): Row | null {
  const rows = [...(object.items?.data ?? []), ...(object.lines?.data ?? [])] as Row[];
  return rows.find(row => {
    const rowPrice = row.price?.id ?? row.pricing?.price_details?.price ?? row.price;
    const metadata = row.metadata ?? row.price?.metadata ?? {};
    return rowPrice === priceId
      || metadata.feature === CALLCOMMAND_LANE_FEATURE_KEY
      || metadata.entitlement === CALLCOMMAND_LANE_ENTITLEMENT_KEY;
  }) ?? null;
}

function safeStripeStatus(value: unknown): 'pending' | 'active' | 'past_due' | 'canceled' {
  if (value === 'active' || value === 'trialing') return 'active';
  if (value === 'past_due' || value === 'unpaid' || value === 'incomplete') return 'past_due';
  if (value === 'canceled' || value === 'incomplete_expired' || value === 'paused') return 'canceled';
  return 'pending';
}

export interface CallCommandLaneWebhookResult {
  handled: boolean;
  action?: string;
  error?: string;
  rowsAffected?: number;
}

/**
 * Settles the runtime lane projection from the already signature-verified and
 * globally idempotency-claimed OperatorOS Stripe event.  Unknown or unpaid
 * states never grant capacity, and older provider events cannot overwrite a
 * newer projection.
 */
export async function processCallCommandLaneWebhookEvent(event: {
  id: string;
  created?: number;
  type: string;
  data: { object: Row };
}): Promise<CallCommandLaneWebhookResult> {
  const object = event.data?.object ?? {};
  const metadata = laneMetadata(object);
  if (!metadata) return { handled: false, error: 'Not a CallCommand lane event' };
  const tenantId = String(metadata.tenant_id ?? metadata.tenantId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(tenantId)) {
    return { handled: false, error: 'CallCommand lane event has no valid tenant' };
  }
  const priceId = configuredPriceId();
  const subscriptionId = eventSubscriptionId(event.type, object);
  const line = laneLine(object, priceId);
  const created = Number.isSafeInteger(event.created) ? Number(event.created) : 0;
  const periodStart = object.current_period_start
    ?? object.period_start
    ?? line?.period?.start
    ?? null;
  const periodEnd = object.current_period_end
    ?? object.period_end
    ?? line?.period?.end
    ?? null;
  const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id ?? null;

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    const quantity = Number(line?.quantity ?? metadata.requested_additional_lanes ?? 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > CALLCOMMAND_LANE_MAX_ADDITIONAL) {
      return { handled: false, error: 'Paid lane invoice has an invalid quantity' };
    }
    const itemId = String(
      line?.subscription_item
        ?? line?.parent?.subscription_item_details?.subscription_item
        ?? line?.id
        ?? '',
    );
    const updated = await db.execute(sql`
      UPDATE callcommand_capacity_entitlements SET
        additional_lanes = ${quantity},
        pending_additional_lanes = 0,
        billing_status = 'active',
        stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
        stripe_subscription_id = COALESCE(${subscriptionId}, stripe_subscription_id),
        stripe_subscription_item_id = COALESCE(${itemId || null}, stripe_subscription_item_id),
        stripe_price_id = ${priceId},
        price_lookup_key = ${CALLCOMMAND_LANE_PRICE_LOOKUP_KEY},
        current_period_start = CASE WHEN ${periodStart}::bigint IS NULL THEN current_period_start ELSE to_timestamp(${periodStart}::bigint) END,
        current_period_end = CASE WHEN ${periodEnd}::bigint IS NULL THEN current_period_end ELSE to_timestamp(${periodEnd}::bigint) END,
        last_stripe_event_created = GREATEST(last_stripe_event_created, ${created}),
        last_billing_event_id = ${event.id},
        version = version + 1,
        updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND ${created} >= last_stripe_event_created
      RETURNING tenant_id
    `);
    return { handled: true, action: 'callcommand_lane_quantity_settled', rowsAffected: updated.rows.length };
  }

  if (event.type === 'invoice.payment_failed') {
    const updated = await db.execute(sql`
      UPDATE callcommand_capacity_entitlements SET
        additional_lanes = 0,
        billing_status = 'past_due',
        last_stripe_event_created = GREATEST(last_stripe_event_created, ${created}),
        last_billing_event_id = ${event.id},
        version = version + 1,
        updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND ${created} >= last_stripe_event_created
      RETURNING tenant_id
    `);
    return { handled: true, action: 'callcommand_lane_payment_failed', rowsAffected: updated.rows.length };
  }

  if (event.type === 'customer.subscription.deleted') {
    const updated = await db.execute(sql`
      UPDATE callcommand_capacity_entitlements SET
        additional_lanes = 0,
        pending_additional_lanes = 0,
        billing_status = 'canceled',
        stripe_subscription_id = NULL,
        stripe_subscription_item_id = NULL,
        last_stripe_event_created = GREATEST(last_stripe_event_created, ${created}),
        last_billing_event_id = ${event.id},
        version = version + 1,
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND (${subscriptionId}::text IS NULL OR stripe_subscription_id = ${subscriptionId})
        AND ${created} >= last_stripe_event_created
      RETURNING tenant_id
    `);
    return { handled: true, action: 'callcommand_lane_canceled', rowsAffected: updated.rows.length };
  }

  if (
    event.type === 'checkout.session.completed'
    || event.type === 'customer.subscription.created'
    || event.type === 'customer.subscription.updated'
  ) {
    const status = event.type === 'checkout.session.completed'
      ? 'pending'
      : safeStripeStatus(object.status);
    const removesPaidCapacity = status === 'past_due' || status === 'canceled';
    const updated = await db.execute(sql`
      UPDATE callcommand_capacity_entitlements SET
        billing_status = ${status},
        additional_lanes = CASE WHEN ${removesPaidCapacity} THEN 0 ELSE additional_lanes END,
        pending_additional_lanes = CASE WHEN ${status === 'canceled'} THEN 0 ELSE pending_additional_lanes END,
        stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
        stripe_subscription_id = COALESCE(${subscriptionId}, stripe_subscription_id),
        stripe_subscription_item_id = COALESCE(${String(line?.id ?? '') || null}, stripe_subscription_item_id),
        current_period_start = CASE WHEN ${periodStart}::bigint IS NULL THEN current_period_start ELSE to_timestamp(${periodStart}::bigint) END,
        current_period_end = CASE WHEN ${periodEnd}::bigint IS NULL THEN current_period_end ELSE to_timestamp(${periodEnd}::bigint) END,
        last_stripe_event_created = GREATEST(last_stripe_event_created, ${created}),
        last_billing_event_id = ${event.id},
        version = version + 1,
        updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND ${created} >= last_stripe_event_created
      RETURNING tenant_id
    `);
    return { handled: true, action: 'callcommand_lane_state_observed', rowsAffected: updated.rows.length };
  }

  return { handled: false, error: `Unhandled CallCommand lane event type: ${event.type}` };
}

export function isCallCommandLaneStripeEvent(event: { data?: { object?: Row } }): boolean {
  return Boolean(laneMetadata(event.data?.object ?? {}));
}
