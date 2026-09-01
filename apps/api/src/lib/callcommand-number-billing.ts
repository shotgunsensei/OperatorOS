import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { subscriptions, tenantUsers, users } from '../schema.js';
import { getStripeFeatureBillingClient, isStripeEnabled } from './billing-service.js';
import { callCommandNumberBillingGraceDays } from './callcommand-managed-number.js';
import { resolveAppBaseUrl } from './public-url.js';

export const CALLCOMMAND_NUMBER_FEATURE_KEY = 'managed_phone_numbers';
export const CALLCOMMAND_LOCAL_NUMBER_ENTITLEMENT_KEY = 'callcommand.additional_local_numbers';
export const CALLCOMMAND_TOLL_FREE_NUMBER_ENTITLEMENT_KEY = 'callcommand.toll_free_numbers';
export const CALLCOMMAND_LOCAL_NUMBER_LOOKUP_KEY = 'operatoros_callcommand_additional_local_number_monthly_v1';
export const CALLCOMMAND_TOLL_FREE_NUMBER_LOOKUP_KEY = 'operatoros_callcommand_toll_free_number_monthly_v1';
export const CALLCOMMAND_LOCAL_NUMBER_DEFAULT_PRICE_CENTS = 500;
export const CALLCOMMAND_TOLL_FREE_NUMBER_DEFAULT_PRICE_CENTS = 800;

type Row = Record<string, any>;

export class CallCommandNumberBillingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 409,
  ) {
    super(message);
  }
}

function configuredPriceId(kind: 'local' | 'toll_free'): string {
  const envName = kind === 'local'
    ? 'STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY'
    : 'STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY';
  const priceId = process.env[envName]?.trim() || '';
  if (!/^price_[A-Za-z0-9_]+$/.test(priceId)) {
    throw new CallCommandNumberBillingError(
      `The ${kind === 'local' ? 'additional-local' : 'toll-free'} CallCommand Stripe Price is not configured`,
      'CALLCOMMAND_NUMBER_PRICE_NOT_CONFIGURED',
    );
  }
  return priceId;
}

function configuredCents(kind: 'local' | 'toll_free'): number {
  const name = kind === 'local'
    ? 'CALLCOMMAND_LOCAL_NUMBER_PRICE_CENTS'
    : 'CALLCOMMAND_TOLL_FREE_NUMBER_PRICE_CENTS';
  const fallback = kind === 'local'
    ? CALLCOMMAND_LOCAL_NUMBER_DEFAULT_PRICE_CENTS
    : CALLCOMMAND_TOLL_FREE_NUMBER_DEFAULT_PRICE_CENTS;
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d{2,6}$/.test(raw) || Number(raw) < 100 || Number(raw) > 100_000) {
    throw new CallCommandNumberBillingError(
      `${name} must be a whole USD-cent amount between 100 and 100000`,
      'CALLCOMMAND_NUMBER_PRICE_INVALID',
      500,
    );
  }
  return Number(raw);
}

function quantity(value: unknown, name: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0 || count > 1000) {
    throw new CallCommandNumberBillingError(
      `${name} must be a whole number between 0 and 1000`,
      'CALLCOMMAND_NUMBER_BILLING_QUANTITY_INVALID',
      422,
    );
  }
  return count;
}

function idempotencyKey(value: unknown): string {
  const key = String(value ?? '').trim();
  if (!/^[A-Za-z0-9._:+-]{8,160}$/.test(key)) {
    throw new CallCommandNumberBillingError(
      'idempotencyKey must contain 8 to 160 safe characters',
      'CALLCOMMAND_NUMBER_BILLING_IDEMPOTENCY_INVALID',
      422,
    );
  }
  return key;
}

function stripeKey(tenantId: string, key: string, operation: string): string {
  return `operatoros_cc_num_${operation}_${createHash('sha256').update(`${tenantId}:${key}:${operation}`).digest('hex')}`;
}

export function getCallCommandNumberCatalog() {
  return {
    includedLocalNumbers: 1,
    local: {
      feature: CALLCOMMAND_LOCAL_NUMBER_ENTITLEMENT_KEY,
      lookupKey: CALLCOMMAND_LOCAL_NUMBER_LOOKUP_KEY,
      unitAmountCents: configuredCents('local'),
      currency: 'usd',
      interval: 'month',
      priceConfigured: Boolean(process.env.STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY?.trim()),
    },
    tollFree: {
      feature: CALLCOMMAND_TOLL_FREE_NUMBER_ENTITLEMENT_KEY,
      lookupKey: CALLCOMMAND_TOLL_FREE_NUMBER_LOOKUP_KEY,
      unitAmountCents: configuredCents('toll_free'),
      currency: 'usd',
      interval: 'month',
      priceConfigured: Boolean(process.env.STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY?.trim()),
    },
    stripeConfigured: isStripeEnabled(),
  } as const;
}

/**
 * Applies the non-destructive end of the managed-number payment grace policy.
 * Paid lines are suspended to stop uncontrolled provider/AI spend, while the
 * provider number remains owned and can be restored after a settled invoice.
 */
export async function expireCallCommandNumberBillingGrace(input: {
  tenantId?: string;
  now?: Date;
} = {}): Promise<{ entitlementsSuspended: number; numbersSuspended: number }> {
  const tenantId = input.tenantId ?? null;
  const now = input.now ?? new Date();
  return db.transaction(async tx => {
    const entitlements = await tx.execute(sql`
      UPDATE callcommand_number_billing_entitlements SET
        billing_status='suspended',version=version+1,updated_at=${now}
      WHERE billing_status IN ('grace_period','past_due')
        AND grace_expires_at IS NOT NULL AND grace_expires_at<=${now}
        AND (${tenantId}::text IS NULL OR tenant_id=${tenantId})
      RETURNING tenant_id
    `);
    const channels = await tx.execute(sql`
      UPDATE callcommand_channels SET billing_status='suspended',lifecycle_state='SUSPENDED',status='paused',
        health_status='degraded',health_reason_code='NUMBER_BILLING_GRACE_EXPIRED',updated_at=${now}
      WHERE acquisition_mode='platform_provisioned' AND billing_status IN ('grace_period','past_due')
        AND billing_grace_expires_at IS NOT NULL AND billing_grace_expires_at<=${now}
        AND lifecycle_state NOT IN ('RELEASE_PENDING','RELEASED') AND deleted_at IS NULL
        AND (${tenantId}::text IS NULL OR tenant_id=${tenantId})
      RETURNING id,tenant_id,telephony_account_id
    `);
    if (channels.rows.length) {
      await tx.execute(sql`
        INSERT INTO callcommand_number_reconciliation_issues(
          tenant_id,telephony_account_id,channel_id,issue_type,resource_key,
          expected_json,actual_json,safe_auto_repair,status
        )
        SELECT tenant_id,telephony_account_id,id,'number_billing_grace_expired',id,
          '{"billing":"active"}'::jsonb,'{"billing":"suspended","providerReleased":false}'::jsonb,
          FALSE,'manual_review'
        FROM callcommand_channels
        WHERE id IN (${sql.join(channels.rows.map(row => sql`${String((row as Row).id)}`), sql`,`)})
        ON CONFLICT (tenant_id,issue_type,resource_key)
          WHERE status IN ('open','repairing','manual_review','failed')
        DO UPDATE SET actual_json=EXCLUDED.actual_json,status='manual_review',updated_at=${now}
      `);
    }
    return {
      entitlementsSuspended: entitlements.rows.length,
      numbersSuspended: channels.rows.length,
    };
  });
}

export interface CallCommandNumberBillingRequest {
  tenantId: string;
  userId: string;
  billableLocalQuantity: number;
  billableTollFreeQuantity: number;
  idempotencyKey: string;
}

export async function requestCallCommandNumberBilling(input: CallCommandNumberBillingRequest): Promise<{
  action: 'included_only' | 'checkout_created' | 'quantity_update_pending';
  billableLocalQuantity: number;
  billableTollFreeQuantity: number;
  checkoutUrl?: string;
  subscriptionId?: string;
}> {
  const local = quantity(input.billableLocalQuantity, 'billableLocalQuantity');
  const tollFree = quantity(input.billableTollFreeQuantity, 'billableTollFreeQuantity');
  const key = idempotencyKey(input.idempotencyKey);
  if (local === 0 && tollFree === 0) {
    const existing = await db.execute(sql`
      SELECT stripe_subscription_id FROM callcommand_number_billing_entitlements
      WHERE tenant_id=${input.tenantId} LIMIT 1
    `);
    if (!(existing.rows[0] as Row | undefined)?.stripe_subscription_id) {
      await db.execute(sql`
        INSERT INTO callcommand_number_billing_entitlements(
          tenant_id,billing_status,pending_billable_local_quantity,pending_billable_toll_free_quantity
        ) VALUES (${input.tenantId},'included',0,0)
        ON CONFLICT (tenant_id) DO UPDATE SET
          billing_status='included',licensed_billable_local_quantity=0,licensed_billable_toll_free_quantity=0,
          pending_billable_local_quantity=0,pending_billable_toll_free_quantity=0,
          version=callcommand_number_billing_entitlements.version+1,updated_at=NOW()
      `);
      return { action: 'included_only', billableLocalQuantity: 0, billableTollFreeQuantity: 0 };
    }
  }
  if (!isStripeEnabled()) {
    throw new CallCommandNumberBillingError('Stripe billing is not configured', 'STRIPE_NOT_CONFIGURED');
  }
  const localPriceId = local > 0 ? configuredPriceId('local') : null;
  const tollFreePriceId = tollFree > 0 ? configuredPriceId('toll_free') : null;
  const stripe = getStripeFeatureBillingClient();

  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-number-billing:${input.tenantId}`},0))`);
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
      throw new CallCommandNumberBillingError('User was not found', 'USER_NOT_FOUND', 404);
    }
    const loaded = await tx.execute(sql`
      SELECT * FROM callcommand_number_billing_entitlements
      WHERE tenant_id=${input.tenantId} LIMIT 1 FOR UPDATE
    `);
    const current = loaded.rows[0] as Row | undefined;
    const [baseSubscription] = await tx.select().from(subscriptions).where(and(
      eq(subscriptions.tenantId, input.tenantId),
      eq(subscriptions.status, 'active'),
    )).limit(1);
    let customerId = String(current?.stripe_customer_id ?? baseSubscription?.stripeCustomerId ?? '');
    const subscriptionId = String(current?.stripe_subscription_id ?? '');
    const metadata = {
      type: 'feature_addon',
      kind: 'feature_addon',
      operatoros_module: 'callcommand-ai',
      module_slug: 'callcommand-ai',
      feature: CALLCOMMAND_NUMBER_FEATURE_KEY,
      entitlement: CALLCOMMAND_NUMBER_FEATURE_KEY,
      billing_type: 'licensed_quantity',
      tenant_id: input.tenantId,
      user_id: input.userId,
      initiated_by_user_id: input.userId,
      requested_billable_local_quantity: String(local),
      requested_billable_toll_free_quantity: String(tollFree),
    };
    let result: {
      action: 'checkout_created' | 'quantity_update_pending';
      billableLocalQuantity: number;
      billableTollFreeQuantity: number;
      checkoutUrl?: string;
      subscriptionId?: string;
    };
    try {
      if (subscriptionId) {
        const items: Array<Record<string, unknown>> = [];
        if (current?.stripe_local_subscription_item_id) {
          items.push(local > 0
            ? { id: current.stripe_local_subscription_item_id, quantity: local }
            : { id: current.stripe_local_subscription_item_id, deleted: true });
        } else if (local > 0 && localPriceId) {
          items.push({ price: localPriceId, quantity: local });
        }
        if (current?.stripe_toll_free_subscription_item_id) {
          items.push(tollFree > 0
            ? { id: current.stripe_toll_free_subscription_item_id, quantity: tollFree }
            : { id: current.stripe_toll_free_subscription_item_id, deleted: true });
        } else if (tollFree > 0 && tollFreePriceId) {
          items.push({ price: tollFreePriceId, quantity: tollFree });
        }
        const update = stripe.subscriptions.update as unknown as (
          id: string,
          params: Record<string, unknown>,
          options: { idempotencyKey: string },
        ) => Promise<unknown>;
        await update(subscriptionId, {
          items,
          cancel_at_period_end: local === 0 && tollFree === 0,
          payment_behavior: 'pending_if_incomplete',
          proration_behavior: 'always_invoice',
          metadata,
        }, { idempotencyKey: stripeKey(input.tenantId, key, 'update') });
        result = { action: 'quantity_update_pending', billableLocalQuantity: local, billableTollFreeQuantity: tollFree, subscriptionId };
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
          }, { idempotencyKey: stripeKey(input.tenantId, key, 'customer') });
          customerId = customer.id;
        }
        const lineItems = [
          ...(local > 0 && localPriceId ? [{ price: localPriceId, quantity: local }] : []),
          ...(tollFree > 0 && tollFreePriceId ? [{ price: tollFreePriceId, quantity: tollFree }] : []),
        ];
        const createCheckout = stripe.checkout.sessions.create as unknown as (
          params: Record<string, unknown>,
          options: { idempotencyKey: string },
        ) => Promise<{ id: string; url: string | null }>;
        const appUrl = resolveAppBaseUrl();
        const session = await createCheckout({
          customer: customerId,
          mode: 'subscription',
          line_items: lineItems,
          success_url: `${appUrl}/modules/callcommand-ai/setup?number_billing=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/modules/callcommand-ai/setup?number_billing=canceled`,
          client_reference_id: input.tenantId,
          metadata,
          subscription_data: { metadata },
        }, { idempotencyKey: stripeKey(input.tenantId, key, 'checkout') });
        if (!session.url) {
          throw new CallCommandNumberBillingError('Stripe did not return a checkout URL', 'CALLCOMMAND_NUMBER_CHECKOUT_UNAVAILABLE', 502);
        }
        result = { action: 'checkout_created', billableLocalQuantity: local, billableTollFreeQuantity: tollFree, checkoutUrl: session.url };
      }
    } catch (error) {
      if (error instanceof CallCommandNumberBillingError) throw error;
      throw new CallCommandNumberBillingError(
        'Stripe did not accept the managed-number billing request',
        'CALLCOMMAND_NUMBER_STRIPE_REQUEST_FAILED',
        502,
      );
    }
    await tx.execute(sql`
      INSERT INTO callcommand_number_billing_entitlements(
        tenant_id,billing_status,stripe_customer_id,
        stripe_local_price_id,stripe_toll_free_price_id,
        pending_billable_local_quantity,pending_billable_toll_free_quantity
      ) VALUES (
        ${input.tenantId},'pending',${customerId || null},${localPriceId},${tollFreePriceId},${local},${tollFree}
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        billing_status=CASE WHEN callcommand_number_billing_entitlements.billing_status='active' THEN 'active' ELSE 'pending' END,
        stripe_customer_id=COALESCE(EXCLUDED.stripe_customer_id,callcommand_number_billing_entitlements.stripe_customer_id),
        stripe_local_price_id=COALESCE(EXCLUDED.stripe_local_price_id,callcommand_number_billing_entitlements.stripe_local_price_id),
        stripe_toll_free_price_id=COALESCE(EXCLUDED.stripe_toll_free_price_id,callcommand_number_billing_entitlements.stripe_toll_free_price_id),
        pending_billable_local_quantity=EXCLUDED.pending_billable_local_quantity,
        pending_billable_toll_free_quantity=EXCLUDED.pending_billable_toll_free_quantity,
        version=callcommand_number_billing_entitlements.version+1,
        updated_at=NOW()
    `);
    return result;
  });
}

function metadataCandidates(object: Row): Row[] {
  const candidates: Row[] = [];
  if (object.metadata) candidates.push(object.metadata);
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

function numberMetadata(object: Row): Row | null {
  return metadataCandidates(object).find(metadata =>
    metadata?.feature === CALLCOMMAND_NUMBER_FEATURE_KEY
      || metadata?.entitlement === CALLCOMMAND_NUMBER_FEATURE_KEY,
  ) ?? null;
}

function subscriptionId(type: string, object: Row): string | null {
  if (type.startsWith('customer.subscription.')) return typeof object.id === 'string' ? object.id : null;
  if (typeof object.subscription === 'string') return object.subscription;
  if (typeof object.subscription?.id === 'string') return object.subscription.id;
  if (typeof object.subscription_details?.subscription === 'string') return object.subscription_details.subscription;
  return null;
}

function itemForPrice(object: Row, priceId: string | null): Row | null {
  if (!priceId) return null;
  const rows = [...(object.items?.data ?? []), ...(object.lines?.data ?? [])] as Row[];
  return rows.find(row => (row.price?.id ?? row.pricing?.price_details?.price ?? row.price) === priceId) ?? null;
}

function itemId(item: Row | null): string | null {
  const value = item?.subscription_item ?? item?.parent?.subscription_item_details?.subscription_item ?? item?.id;
  return typeof value === 'string' && value ? value : null;
}

export async function processCallCommandNumberWebhookEvent(event: {
  id: string;
  created?: number;
  type: string;
  data: { object: Row };
}): Promise<{ handled: boolean; action?: string; error?: string; rowsAffected?: number }> {
  const object = event.data?.object ?? {};
  const metadata = numberMetadata(object);
  if (!metadata) return { handled: false, error: 'Not a CallCommand managed-number event' };
  const tenantId = String(metadata.tenant_id ?? metadata.tenantId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(tenantId)) {
    return { handled: false, error: 'CallCommand managed-number event has no valid tenant' };
  }
  const created = Number.isSafeInteger(event.created) ? Number(event.created) : 0;
  const providerSubscriptionId = subscriptionId(event.type, object);
  const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id ?? null;
  const state = await db.execute(sql`
    SELECT stripe_local_price_id,stripe_toll_free_price_id
    FROM callcommand_number_billing_entitlements WHERE tenant_id=${tenantId} LIMIT 1
  `);
  const current = state.rows[0] as Row | undefined;
  const localLine = itemForPrice(object, String(current?.stripe_local_price_id ?? '') || null);
  const tollFreeLine = itemForPrice(object, String(current?.stripe_toll_free_price_id ?? '') || null);

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    const local = quantity(localLine?.quantity ?? metadata.requested_billable_local_quantity ?? 0, 'paid local quantity');
    const tollFree = quantity(tollFreeLine?.quantity ?? metadata.requested_billable_toll_free_quantity ?? 0, 'paid toll-free quantity');
    const updated = await db.execute(sql`
      UPDATE callcommand_number_billing_entitlements SET
        licensed_billable_local_quantity=${local},
        licensed_billable_toll_free_quantity=${tollFree},
        pending_billable_local_quantity=0,
        pending_billable_toll_free_quantity=0,
        billing_status=CASE WHEN ${local}=0 AND ${tollFree}=0 THEN 'included' ELSE 'active' END,
        grace_expires_at=NULL,
        stripe_customer_id=COALESCE(${customerId},stripe_customer_id),
        stripe_subscription_id=COALESCE(${providerSubscriptionId},stripe_subscription_id),
        stripe_local_subscription_item_id=COALESCE(${itemId(localLine)},stripe_local_subscription_item_id),
        stripe_toll_free_subscription_item_id=COALESCE(${itemId(tollFreeLine)},stripe_toll_free_subscription_item_id),
        last_stripe_event_created=GREATEST(last_stripe_event_created,${created}),
        last_billing_event_id=${event.id},version=version+1,updated_at=NOW()
      WHERE tenant_id=${tenantId} AND ${created} >= last_stripe_event_created RETURNING tenant_id
    `);
    await db.execute(sql`
      UPDATE callcommand_channels SET
        billing_status=CASE
          WHEN number_type='local' AND id IN (
            SELECT id FROM callcommand_channels
            WHERE tenant_id=${tenantId} AND acquisition_mode='platform_provisioned'
              AND lifecycle_state<>'RELEASED' AND number_type='local' AND deleted_at IS NULL
            ORDER BY COALESCE(activated_at,created_at),id LIMIT 1
          ) THEN 'included' ELSE 'active' END,
        billing_grace_expires_at=NULL,updated_at=NOW()
      WHERE tenant_id=${tenantId} AND acquisition_mode='platform_provisioned'
        AND lifecycle_state NOT IN ('RELEASED','RELEASE_PENDING') AND deleted_at IS NULL
    `);
    return { handled: true, action: 'callcommand_number_quantities_settled', rowsAffected: updated.rows.length };
  }
  if (event.type === 'invoice.payment_failed') {
    const days = callCommandNumberBillingGraceDays();
    const updated = await db.execute(sql`
      UPDATE callcommand_number_billing_entitlements SET billing_status='grace_period',
        grace_expires_at=NOW()+(${days}::text || ' days')::interval,
        last_stripe_event_created=GREATEST(last_stripe_event_created,${created}),
        last_billing_event_id=${event.id},version=version+1,updated_at=NOW()
      WHERE tenant_id=${tenantId} AND ${created} >= last_stripe_event_created RETURNING tenant_id,grace_expires_at
    `);
    await db.execute(sql`
      UPDATE callcommand_channels SET billing_status='grace_period',
        billing_grace_expires_at=NOW()+(${days}::text || ' days')::interval,updated_at=NOW()
      WHERE tenant_id=${tenantId} AND acquisition_mode='platform_provisioned'
        AND lifecycle_state='ACTIVE' AND billing_status<>'included' AND deleted_at IS NULL
    `);
    return { handled: true, action: 'callcommand_number_payment_grace_started', rowsAffected: updated.rows.length };
  }
  if (event.type === 'customer.subscription.deleted') {
    const updated = await db.execute(sql`
      UPDATE callcommand_number_billing_entitlements SET
        licensed_billable_local_quantity=0,licensed_billable_toll_free_quantity=0,
        pending_billable_local_quantity=0,pending_billable_toll_free_quantity=0,
        billing_status='suspended',grace_expires_at=NULL,
        stripe_subscription_id=NULL,stripe_local_subscription_item_id=NULL,stripe_toll_free_subscription_item_id=NULL,
        last_stripe_event_created=GREATEST(last_stripe_event_created,${created}),
        last_billing_event_id=${event.id},version=version+1,updated_at=NOW()
      WHERE tenant_id=${tenantId}
        AND (${providerSubscriptionId}::text IS NULL OR stripe_subscription_id=${providerSubscriptionId})
        AND ${created} >= last_stripe_event_created RETURNING tenant_id
    `);
    await db.execute(sql`
      UPDATE callcommand_channels SET billing_status='suspended',lifecycle_state='SUSPENDED',
        health_status='degraded',health_reason_code='NUMBER_BILLING_SUSPENDED',updated_at=NOW()
      WHERE tenant_id=${tenantId} AND acquisition_mode='platform_provisioned'
        AND billing_status<>'included' AND lifecycle_state<>'RELEASED' AND deleted_at IS NULL
    `);
    return { handled: true, action: 'callcommand_number_billing_suspended', rowsAffected: updated.rows.length };
  }
  if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const status = object.status === 'past_due' || object.status === 'unpaid' ? 'past_due' : 'pending';
    const updated = await db.execute(sql`
      UPDATE callcommand_number_billing_entitlements SET billing_status=${status},
        stripe_customer_id=COALESCE(${customerId},stripe_customer_id),
        stripe_subscription_id=COALESCE(${providerSubscriptionId},stripe_subscription_id),
        last_stripe_event_created=GREATEST(last_stripe_event_created,${created}),
        last_billing_event_id=${event.id},version=version+1,updated_at=NOW()
      WHERE tenant_id=${tenantId} AND ${created} >= last_stripe_event_created RETURNING tenant_id
    `);
    return { handled: true, action: 'callcommand_number_billing_state_observed', rowsAffected: updated.rows.length };
  }
  return { handled: false, error: `Unhandled CallCommand managed-number event type: ${event.type}` };
}

export function isCallCommandNumberStripeEvent(event: { data?: { object?: Row } }): boolean {
  return Boolean(numberMetadata(event.data?.object ?? {}));
}
