import { db } from '../db.js';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import {
  users, subscriptions, subscriptionPlans, billingEvents, activityFeed,
  modules, addonSubscriptions,
} from '../schema.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  getUserPlanConfig, getDowngradeViolations, isUpgrade, isDowngrade, PLAN_CONFIGS,
} from './plans.js';

// Task #66: `apps/api/package.json` is `"type":"module"`, so the previous
// `require('stripe')` inside `getStripe()` was undefined and every checkout
// call threw "Stripe SDK is not installed" even though the package was
// hoisted. createRequire(import.meta.url) restores CommonJS resolution
// from inside an ES module without modifying package.json.
const esmRequire = createRequire(import.meta.url);
// Stripe SDK is loaded lazily via createRequire (ESM context); the
// official type lives in the optional `stripe` package and we don't want
// `apps/api` to take a hard import on it. `unknown` keeps callers honest
// — the only call sites use the narrow methods through the public
// helpers below (checkout/create, subscriptions/update, webhooks/etc).
type StripeClient = {
  checkout: { sessions: { create: (args: unknown) => Promise<{ id: string; url: string | null }> } };
  customers: { create: (args: unknown) => Promise<{ id: string }> };
  subscriptions: { update: (id: string, args: unknown) => Promise<unknown> };
  billingPortal: { sessions: { create: (args: unknown) => Promise<{ url: string }> } };
  webhooks: { constructEvent: (payload: string | Buffer, sig: string, secret: string) => unknown };
};
let __stripeSingleton: StripeClient | null = null;

// ---------------------------------------------------------------------------
// Stripe Configuration
// ---------------------------------------------------------------------------
// To enable live Stripe:
//   1. Set STRIPE_SECRET_KEY in your environment secrets
//   2. Set STRIPE_WEBHOOK_SECRET in your environment secrets
//   3. Set stripePriceId on each subscription_plans row (or STRIPE_PRICE_MAP below)
//   4. Set STRIPE_MODE=live
//
// Price ID mapping — fill these in when you create Stripe products:
//   STRIPE_PRICE_STARTER = price_xxx (free tier — no checkout needed)
//   STRIPE_PRICE_PRO     = price_xxx
//   STRIPE_PRICE_ELITE   = price_xxx
// ---------------------------------------------------------------------------

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_MODE = process.env.STRIPE_MODE || 'test';

// Test-only injection seam. Allows tests to force Stripe-mode behavior and
// substitute a stubbed Stripe client without touching real env vars or
// hitting the network. Pass `null` to clear. NEVER call from production code.
let __stripeTestOverride: { enabled?: boolean; client?: any } | null = null;
export function __setStripeTestOverrides(o: { enabled?: boolean; client?: any } | null) {
  __stripeTestOverride = o;
}

export function isStripeEnabled(): boolean {
  if (__stripeTestOverride && typeof __stripeTestOverride.enabled === 'boolean') {
    return __stripeTestOverride.enabled;
  }
  return !!STRIPE_SECRET_KEY && STRIPE_MODE === 'live';
}

function getStripe() {
  if (__stripeTestOverride?.client) return __stripeTestOverride.client;
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (__stripeSingleton) return __stripeSingleton;
  // Task #66: ES-module-safe require via createRequire. Cached so we
  // don't re-resolve / re-instantiate on every checkout call.
  try {
    const StripeModule = esmRequire('stripe') as { default?: unknown } | unknown;
    const StripeCtor = (StripeModule as { default?: unknown })?.default ?? StripeModule;
    type StripeFactory = new (key: string, opts: { apiVersion: string }) => StripeClient;
    __stripeSingleton = new (StripeCtor as StripeFactory)(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    return __stripeSingleton;
  } catch (err) {
    throw new Error(`Stripe SDK could not be loaded: ${(err as Error)?.message ?? 'unknown'}`);
  }
}

// Task #66: monthly + annual price resolution. STRIPE_PRICE_<PLAN>_<INTERVAL>
// is the canonical form; the bare STRIPE_PRICE_<PLAN> is honored only for the
// monthly fallback so existing prod env stays valid through the cutover.
export type BillingInterval = 'month' | 'year';

function getStripePriceIdForInterval(planSlug: string, interval: BillingInterval): string {
  const upper = planSlug.toUpperCase();
  if (interval === 'year') {
    return process.env[`STRIPE_PRICE_${upper}_ANNUAL`] || '';
  }
  return process.env[`STRIPE_PRICE_${upper}_MONTHLY`]
    || process.env[`STRIPE_PRICE_${upper}`]
    || '';
}

// Legacy monthly-only resolver kept for callers that haven't been
// migrated to the interval-aware variant yet.
function getStripePriceId(planSlug: string): string {
  return getStripePriceIdForInterval(planSlug, 'month');
}

// ---------------------------------------------------------------------------
// Core Billing Service — routes through Stripe or local mode automatically
// ---------------------------------------------------------------------------

export interface SubscribeResult {
  ok: boolean;
  plan: string;
  action: 'subscribed' | 'upgraded' | 'downgraded';
  downgradeWarnings: string[];
  checkoutUrl?: string;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface PortalSessionResult {
  url: string;
}

export async function subscribeToPlan(
  userId: string,
  tenantId: string,
  planSlug: string,
  interval: BillingInterval = 'month',
): Promise<SubscribeResult> {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, planSlug)).limit(1);
  if (!plan) throw new Error('Plan not found');

  const { config: currentConfig, subscription: currentSub } = await getUserPlanConfig(userId);
  if (currentConfig.slug === planSlug) throw new Error('You are already on this plan');

  const upgrading = isUpgrade(currentConfig.slug, planSlug);
  const downgrading = isDowngrade(currentConfig.slug, planSlug);

  if (isStripeEnabled() && plan.price > 0) {
    const checkoutResult = await createCheckoutSession(userId, planSlug, interval);
    return {
      ok: true,
      plan: plan.name,
      action: upgrading ? 'upgraded' : downgrading ? 'downgraded' : 'subscribed',
      downgradeWarnings: [],
      checkoutUrl: checkoutResult.url,
    };
  }

  return await applyPlanChangeLocally(userId, tenantId, plan, currentConfig.slug, currentSub);
}

async function applyPlanChangeLocally(
  userId: string, tenantId: string, plan: any, fromSlug: string, currentSub: any
): Promise<SubscribeResult> {
  const upgrading = isUpgrade(fromSlug, plan.slug);
  const downgrading = isDowngrade(fromSlug, plan.slug);

  const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);

  if (existingSub) {
    await db.update(subscriptions).set({
      planId: plan.id, status: 'active', cancelAtPeriodEnd: false,
      updatedAt: new Date(), currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).where(eq(subscriptions.id, existingSub.id));

    const eventType = upgrading ? 'upgraded' : downgrading ? 'downgraded' : 'plan_changed';
    await db.insert(billingEvents).values({
      userId, subscriptionId: existingSub.id, eventType,
      amount: plan.price,
      metadata: { fromPlan: fromSlug, toPlan: plan.slug, action: eventType, mode: 'local' },
    });
  } else {
    const [newSub] = await db.insert(subscriptions).values({
      userId, planId: plan.id, status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    await db.insert(billingEvents).values({
      userId, subscriptionId: newSub.id, eventType: 'subscribed',
      amount: plan.price, metadata: { planSlug: plan.slug, mode: 'local' },
    });
  }

  let downgradeWarnings: string[] = [];
  if (downgrading) {
    const violations = await getDowngradeViolations(userId, tenantId, plan.slug);
    downgradeWarnings = violations.map(v => v.message);
  }

  await db.insert(activityFeed).values({
    userId,
    action: upgrading ? 'upgraded' : downgrading ? 'downgraded' : 'subscribed',
    entityType: 'subscription',
    metadata: { planName: plan.name, planSlug: plan.slug, fromPlan: fromSlug },
  });

  return {
    ok: true,
    plan: plan.name,
    action: upgrading ? 'upgraded' : downgrading ? 'downgraded' : 'subscribed',
    downgradeWarnings,
  };
}

export async function cancelSubscription(userId: string): Promise<{ ok: boolean; message: string }> {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub) return { ok: false, message: 'No active subscription' };

  if (isStripeEnabled() && sub.stripeSubscriptionId) {
    const stripe = getStripe();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  await db.update(subscriptions).set({
    cancelAtPeriodEnd: true, updatedAt: new Date(),
  }).where(eq(subscriptions.id, sub.id));

  await db.insert(billingEvents).values({
    userId, subscriptionId: sub.id, eventType: 'cancel_scheduled',
    metadata: { mode: isStripeEnabled() ? 'stripe' : 'local' },
  });

  return { ok: true, message: 'Subscription will cancel at end of billing period' };
}

export async function reactivateSubscription(userId: string): Promise<{ ok: boolean }> {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub) return { ok: false };

  if (isStripeEnabled() && sub.stripeSubscriptionId) {
    const stripe = getStripe();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  }

  await db.update(subscriptions).set({
    cancelAtPeriodEnd: false, status: 'active', updatedAt: new Date(),
  }).where(eq(subscriptions.id, sub.id));

  await db.insert(billingEvents).values({
    userId, subscriptionId: sub.id, eventType: 'reactivated',
    metadata: { mode: isStripeEnabled() ? 'stripe' : 'local' },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stripe Checkout & Portal Sessions
// ---------------------------------------------------------------------------

export async function createCheckoutSession(
  userId: string,
  planSlug: string,
  interval: BillingInterval = 'month',
): Promise<CheckoutSessionResult> {
  if (!isStripeEnabled()) {
    throw new Error('Stripe is not enabled. Set STRIPE_SECRET_KEY and STRIPE_MODE=live');
  }

  const stripe = getStripe();
  const priceId = getStripePriceIdForInterval(planSlug, interval);
  if (!priceId) {
    const upper = planSlug.toUpperCase();
    const want = interval === 'year' ? `${upper}_ANNUAL` : `${upper}_MONTHLY` + ` (or bare ${upper})`;
    const code = interval === 'year' ? 'NO_STRIPE_PRICE_FOR_INTERVAL' : 'NO_STRIPE_PRICE';
    const err: any = new Error(
      `No Stripe price ID configured for plan="${planSlug}" interval="${interval}". ` +
      `Set STRIPE_PRICE_${want} env var.`,
    );
    err.code = code;
    throw err;
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('User not found');

  const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  let customerId = existingSub?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId },
    });
    customerId = customer.id;

    if (existingSub) {
      await db.update(subscriptions).set({ stripeCustomerId: customerId }).where(eq(subscriptions.id, existingSub.id));
    }
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5000';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}?billing=canceled`,
    metadata: { userId, planSlug },
    subscription_data: { metadata: { userId, planSlug } },
  });

  return { url: session.url!, sessionId: session.id };
}

export async function createPortalSession(userId: string): Promise<PortalSessionResult> {
  if (!isStripeEnabled()) {
    throw new Error('Stripe is not enabled. Set STRIPE_SECRET_KEY and STRIPE_MODE=live');
  }

  const stripe = getStripe();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);

  if (!sub?.stripeCustomerId) {
    throw new Error('No Stripe customer found. The user must have a Stripe subscription first.');
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5000';

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${appUrl}?page=billing`,
  });

  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Webhook Event Processing
// ---------------------------------------------------------------------------

export interface WebhookProcessResult {
  handled: boolean;
  action?: string;
  error?: string;
  /**
   * Task #108: gate the centralized entitlement propagation. Set true
   * ONLY when local subscription state is durably written so the
   * recompute pass sees the correct owner plan. Out-of-order
   * `customer.subscription.created` events that arrive before checkout
   * has persisted the local row set this false to avoid revoking
   * valid module access based on missing subscription state.
   */
  shouldPropagate?: boolean;
  /**
   * For addon update/delete branches: the number of local
   * addon_subscriptions rows that were actually mutated. `0` means the
   * webhook was understood but no local row matched (the missed-webhook
   * case admins use resync to surface). Undefined for branches where the
   * concept doesn't apply (insert/upsert paths, plan webhooks).
   */
  rowsAffected?: number;
  /**
   * Stable signal that the addon update/delete branch ran but found no
   * local row. Distinct from `handled: false` so callers can count it
   * separately without re-parsing error strings.
   */
  noLocalRow?: boolean;
}

export function verifyWebhookSignature(payload: string | Buffer, signature: string): any {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}

// Classify a Stripe event as addon vs plan. Looks at metadata in
// multiple places because Stripe puts it on different objects depending
// on the event family:
//   - customer.subscription.*: object.metadata
//   - checkout.session.completed: object.metadata + subscription_data.metadata
//   - invoice.*: object.subscription_details?.metadata, plus
//     object.lines.data[].metadata for line-level tagging.
// Returns a structured classification and the user_id/module_slug it
// resolved (when present) so the caller doesn't have to re-parse.
export interface WebhookClassification {
  isAddon: boolean;
  userId: string | null;
  moduleSlug: string | null;
  /** Gate 2: tenant scope from checkout metadata. Falls back to user's
   *  personal tenant downstream when missing. */
  tenantId: string | null;
  /** Gate 2: which user clicked "Buy" (may differ from owner of the
   *  resulting subscription if a tenant admin purchases on behalf of an
   *  owner). Used for audit trail. */
  initiatedByUserId: string | null;
  /** Gate 2: pre-created addon_subscriptions.id so the webhook can
   *  promote the existing 'incomplete' row to 'active' instead of
   *  inserting a duplicate. */
  internalAddonSubscriptionId: string | null;
  matchedAt: 'object' | 'subscription_data' | 'subscription_details' | 'invoice_line' | 'none';
}

export function classifyWebhookEvent(event: { type: string; data: { object: any } }): WebhookClassification {
  const obj = event.data?.object || {};
  const candidates: Array<{ md: any; at: WebhookClassification['matchedAt'] }> = [];
  if (obj.metadata) candidates.push({ md: obj.metadata, at: 'object' });
  if (obj.subscription_data?.metadata) candidates.push({ md: obj.subscription_data.metadata, at: 'subscription_data' });
  if (obj.subscription_details?.metadata) candidates.push({ md: obj.subscription_details.metadata, at: 'subscription_details' });
  if (Array.isArray(obj.lines?.data)) {
    for (const line of obj.lines.data) {
      if (line?.metadata) candidates.push({ md: line.metadata, at: 'invoice_line' });
    }
  }
  for (const { md, at } of candidates) {
    const isAddon = md.type === 'addon' || md.kind === 'addon';
    if (isAddon) {
      return {
        isAddon: true,
        userId: md.user_id ?? md.userId ?? null,
        moduleSlug: md.module_slug ?? md.moduleSlug ?? null,
        tenantId: md.tenant_id ?? md.tenantId ?? null,
        initiatedByUserId: md.initiated_by_user_id ?? md.initiatedByUserId ?? md.user_id ?? md.userId ?? null,
        internalAddonSubscriptionId: md.internal_addon_subscription_id ?? md.internalAddonSubscriptionId ?? null,
        matchedAt: at,
      };
    }
  }
  // Plan path: surface user_id when present so the claim row can be
  // attributed to the right user.
  const planMd = candidates[0]?.md ?? {};
  return {
    isAddon: false,
    userId: planMd.user_id ?? planMd.userId ?? null,
    moduleSlug: null,
    tenantId: null,
    initiatedByUserId: null,
    internalAddonSubscriptionId: null,
    matchedAt: candidates.length ? candidates[0].at : 'none',
  };
}

// Single source of idempotency for ALL Stripe webhook events (plan and
// addon alike). The route layer calls this BEFORE running any handler:
//   - Inserts a billing_events row keyed by event.id with the raw
//     payload + payload_hash so admin DLQ retry can replay it later.
//   - ON CONFLICT DO NOTHING (matches partial unique index
//     uq_billing_events_stripe_event_id) makes redelivery a no-op.
//   - Returns the claim row id for the route to update with
//     processed_at / error_message after the handler runs.
export async function claimStripeEvent(
  event: { id: string; type: string; data: { object: any } },
  classification: WebhookClassification,
): Promise<{ claimedRowId: string | null; isDuplicate: boolean }> {
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
  const userId = classification.userId; // may be null for plan events without metadata
  const eventTypeLabel = `${classification.isAddon ? 'addon' : 'plan'}_${event.type.replace(/\./g, '_')}`;

  const claim = await db.insert(billingEvents).values({
    userId,
    eventType: eventTypeLabel,
    stripeEventId: event.id,
    payloadHash,
    metadata: {
      mode: 'stripe',
      kind: classification.isAddon ? 'addon' : 'plan',
      moduleSlug: classification.moduleSlug,
      classifiedAt: classification.matchedAt,
      rawEvent: event,
    },
  }).onConflictDoNothing({
    target: billingEvents.stripeEventId,
    where: sql`stripe_event_id IS NOT NULL`,
  }).returning({ id: billingEvents.id });

  if (claim.length === 0) {
    return { claimedRowId: null, isDuplicate: true };
  }
  return { claimedRowId: claim[0].id, isDuplicate: false };
}

export async function markStripeEventProcessed(claimedRowId: string, action: string | undefined) {
  await db.update(billingEvents).set({
    processedAt: new Date(),
    errorMessage: null,
    metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ lastAction: action ?? 'handled' })}::jsonb`,
  }).where(eq(billingEvents.id, claimedRowId));
}

export async function markStripeEventFailed(claimedRowId: string, errorMessage: string) {
  await db.update(billingEvents).set({
    errorMessage,
    metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ lastFailureAt: new Date().toISOString() })}::jsonb`,
  }).where(eq(billingEvents.id, claimedRowId));
}

export async function processWebhookEvent(event: { type: string; data: { object: any } }): Promise<WebhookProcessResult> {
  const { type, data } = event;
  const obj = data.object;

  console.log(`[billing-service] Processing webhook: ${type}`);

  let result: WebhookProcessResult;
  switch (type) {
    case 'checkout.session.completed':
      result = await handleCheckoutCompleted(obj); break;
    case 'customer.subscription.created':
      result = await handleSubscriptionCreated(obj); break;
    case 'customer.subscription.updated':
      result = await handleSubscriptionUpdated(obj); break;
    case 'customer.subscription.deleted':
      result = await handleSubscriptionDeleted(obj); break;
    case 'invoice.payment_failed':
      result = await handlePaymentFailed(obj); break;
    case 'invoice.paid':
      result = await handleInvoicePaid(obj); break;
    default:
      console.log(`[billing-service] Unhandled webhook event: ${type}`);
      return { handled: false };
  }

  // Task #108: centralized recompute + propagation. After any successful
  // plan-affecting event, fire entitlement push for the affected user
  // across every tenant they belong to. Fire-and-forget — receivers'
  // availability MUST NOT block our webhook ack.
  //
  // SOURCE-OF-TRUTH for userId (in order of reliability):
  //   1. Stripe metadata.userId / user_id (set on checkout we initiated)
  //   2. Local subscriptions row joined by stripe_subscription_id
  //      (covers subscription.updated/deleted where Stripe doesn't echo
  //      our metadata back)
  //   3. Local subscriptions row joined by stripe_customer_id (invoice.*)
  if (result.handled && result.shouldPropagate !== false) {
    let userId: string | null = obj?.metadata?.userId
      ?? obj?.metadata?.user_id
      ?? null;
    if (!userId) {
      const stripeSubId = obj?.subscription ?? obj?.id ?? null;
      if (stripeSubId && typeof stripeSubId === 'string') {
        const [row] = await db.select({ userId: subscriptions.userId })
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
          .limit(1);
        if (row) userId = row.userId;
      }
    }
    if (!userId) {
      const stripeCustomerId = obj?.customer ?? null;
      if (stripeCustomerId && typeof stripeCustomerId === 'string') {
        const [row] = await db.select({ userId: subscriptions.userId })
          .from(subscriptions)
          .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
          .limit(1);
        if (row) userId = row.userId;
      }
    }
    if (userId) {
      try {
        const { schedulePropagationForUser } = await import('./entitlement-propagation.js');
        schedulePropagationForUser(userId, { reason: `stripe:${type}` });
      } catch (err) {
        console.warn('[billing-service] entitlement propagate import failed:', err);
      }
    } else {
      console.warn(`[billing-service] could not resolve userId for ${type}; skipping entitlement push`);
    }
  }
  return result;
}

async function handleCheckoutCompleted(session: any): Promise<WebhookProcessResult> {
  const userId = session.metadata?.userId;
  const planSlug = session.metadata?.planSlug;
  const stripeSubscriptionId = session.subscription;
  const stripeCustomerId = session.customer;

  if (!userId || !planSlug) {
    return { handled: false, error: 'Missing userId or planSlug in session metadata' };
  }

  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, planSlug)).limit(1);
  if (!plan) return { handled: false, error: `Plan not found: ${planSlug}` };

  const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);

  if (existingSub) {
    await db.update(subscriptions).set({
      planId: plan.id, status: 'active', cancelAtPeriodEnd: false,
      stripeSubscriptionId, stripeCustomerId, updatedAt: new Date(),
    }).where(eq(subscriptions.id, existingSub.id));
  } else {
    await db.insert(subscriptions).values({
      userId, planId: plan.id, status: 'active',
      stripeSubscriptionId, stripeCustomerId,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  // Idempotency lives at the route layer (claimStripeEvent). The
  // user-facing activity feed entry is still useful here.
  await db.insert(activityFeed).values({
    userId, action: 'subscribed', entityType: 'subscription',
    metadata: { planName: plan.name, planSlug, via: 'stripe_checkout' },
  });

  console.log(`[billing-service] Checkout completed: user=${userId} plan=${planSlug}`);
  return { handled: true, action: 'checkout_completed', shouldPropagate: true };
}

async function handleSubscriptionCreated(subscription: any): Promise<WebhookProcessResult> {
  const userId = subscription.metadata?.userId;
  if (!userId) return { handled: false, error: 'Missing userId in subscription metadata' };

  const stripeSubId = subscription.id;
  const customerId = subscription.customer;
  const status = mapStripeStatus(subscription.status);

  // Task #108: only propagate when the local subscription row already
  // exists (was upserted by checkout.session.completed). If Stripe
  // delivers `customer.subscription.created` BEFORE the checkout
  // webhook lands — perfectly legal under out-of-order delivery — we
  // would otherwise propagate against an empty subscriptions table
  // and the recompute pass would mass-revoke module access.
  const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (existingSub) {
    await db.update(subscriptions).set({
      stripeSubscriptionId: stripeSubId, stripeCustomerId: customerId,
      status, updatedAt: new Date(),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    }).where(eq(subscriptions.id, existingSub.id));
    console.log(`[billing-service] Subscription created (synced): user=${userId} stripe_sub=${stripeSubId}`);
    return { handled: true, action: 'subscription_created', shouldPropagate: true };
  }

  console.warn(
    `[billing-service] subscription.created arrived before local row for user=${userId} ` +
    `stripe_sub=${stripeSubId}; skipping propagation (will run once checkout webhook lands).`,
  );
  return { handled: true, action: 'subscription_created_deferred', shouldPropagate: false };
}

async function handleSubscriptionUpdated(subscription: any): Promise<WebhookProcessResult> {
  const stripeSubId = subscription.id;
  const status = mapStripeStatus(subscription.status);
  const cancelAtEnd = subscription.cancel_at_period_end;

  const [existingSub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId)).limit(1);

  if (!existingSub) {
    console.log(`[billing-service] No local subscription for stripe_sub=${stripeSubId}`);
    return { handled: false, error: 'No matching local subscription' };
  }

  const priceId = subscription.items?.data?.[0]?.price?.id;
  let newPlanId = existingSub.planId;

  if (priceId) {
    const [matchingPlan] = await db.select().from(subscriptionPlans)
      .where(eq(subscriptionPlans.stripePriceId, priceId)).limit(1);
    if (matchingPlan) newPlanId = matchingPlan.id;
  }

  await db.update(subscriptions).set({
    planId: newPlanId, status, cancelAtPeriodEnd: cancelAtEnd,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    updatedAt: new Date(),
  }).where(eq(subscriptions.id, existingSub.id));

  console.log(`[billing-service] Subscription updated: stripe_sub=${stripeSubId} status=${status}`);
  return { handled: true, action: 'subscription_updated' };
}

async function handleSubscriptionDeleted(subscription: any): Promise<WebhookProcessResult> {
  const stripeSubId = subscription.id;

  const [existingSub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId)).limit(1);

  if (!existingSub) {
    return { handled: false, error: 'No matching local subscription' };
  }

  const starterPlan = await db.select().from(subscriptionPlans)
    .where(eq(subscriptionPlans.slug, 'starter')).limit(1);

  await db.update(subscriptions).set({
    status: 'canceled', cancelAtPeriodEnd: false,
    planId: starterPlan[0]?.id || existingSub.planId,
    updatedAt: new Date(),
  }).where(eq(subscriptions.id, existingSub.id));

  await db.insert(activityFeed).values({
    userId: existingSub.userId, action: 'subscription_canceled',
    entityType: 'subscription', metadata: { via: 'stripe' },
  });

  console.log(`[billing-service] Subscription deleted: stripe_sub=${stripeSubId}`);
  return { handled: true, action: 'subscription_deleted' };
}

async function handlePaymentFailed(invoice: any): Promise<WebhookProcessResult> {
  const stripeSubId = invoice.subscription;
  if (!stripeSubId) return { handled: false, error: 'No subscription on invoice' };

  const [existingSub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId)).limit(1);

  if (!existingSub) return { handled: false, error: 'No matching local subscription' };

  await db.update(subscriptions).set({
    status: 'past_due', updatedAt: new Date(),
  }).where(eq(subscriptions.id, existingSub.id));

  console.log(`[billing-service] Payment failed: stripe_sub=${stripeSubId}`);
  return { handled: true, action: 'payment_failed' };
}

async function handleInvoicePaid(invoice: any): Promise<WebhookProcessResult> {
  const stripeSubId = invoice.subscription;
  if (!stripeSubId) return { handled: false, error: 'No subscription on invoice' };

  const [existingSub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId)).limit(1);

  if (!existingSub) return { handled: false, error: 'No matching local subscription' };

  await db.update(subscriptions).set({
    status: 'active', updatedAt: new Date(),
  }).where(eq(subscriptions.id, existingSub.id));

  console.log(`[billing-service] Invoice paid: stripe_sub=${stripeSubId}`);
  return { handled: true, action: 'invoice_paid' };
}

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'past_due',
    incomplete: 'past_due',
    incomplete_expired: 'expired',
    paused: 'canceled',
  };
  return map[stripeStatus] || 'active';
}

// ---------------------------------------------------------------------------
// Billing mode info for frontend
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Add-on Subscriptions (per-module purchase on top of the base plan)
// ---------------------------------------------------------------------------

export function getAddonStripePriceEnvKey(moduleSlug: string): string {
  return `STRIPE_PRICE_ADDON_${moduleSlug.toUpperCase().replace(/-/g, '_')}`;
}

// Task #66: addon env-key alias chain. After the bf-os -> brandforgeos
// rename, `STRIPE_PRICE_ADDON_BRANDFORGEOS` is the canonical key but
// `STRIPE_PRICE_ADDON_BF_OS` may still be the only one set in prod.
// Add new aliases here as further renames happen.
const ADDON_ENV_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  brandforgeos: ['STRIPE_PRICE_ADDON_BRANDFORGEOS', 'STRIPE_PRICE_ADDON_BF_OS'],
});

// Returns the env-var-bound Stripe Price ID for the module's add-on. Kept
// for the rare callsite that has only the slug and intentionally wants the
// env binding (e.g. the Pricing tab "envKey/envKeyConfigured" surface).
// Most callers should prefer `getAddonStripePriceIdFromModule` so that an
// admin-edited override on `modules.metadata.stripePriceId` wins.
export function getAddonStripePriceIdFromEnv(moduleSlug: string): string {
  const aliases = ADDON_ENV_ALIASES[moduleSlug];
  if (aliases) {
    for (const k of aliases) {
      const v = process.env[k];
      if (v && v.trim()) return v;
    }
    return '';
  }
  return process.env[getAddonStripePriceEnvKey(moduleSlug)] || '';
}

// Resolves the effective Stripe Price ID for a module's add-on, preferring
// the per-module override stored in `modules.metadata.stripePriceId` and
// falling back to the legacy env binding so existing deployments keep
// working without an admin edit.
export function getAddonStripePriceIdFromModule(
  mod: { slug: string; metadata?: Record<string, unknown> | null } | null | undefined,
): string {
  if (!mod) return '';
  const md = (mod.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = typeof md.stripePriceId === 'string' ? md.stripePriceId.trim() : '';
  if (fromMeta) return fromMeta;
  return getAddonStripePriceIdFromEnv(mod.slug);
}

// Async helper for callers that only have a slug. Loads the module and
// applies the metadata-first resolution.
export async function getAddonStripePriceId(moduleSlug: string): Promise<string> {
  const [mod] = await db.select({ slug: modules.slug, metadata: modules.metadata })
    .from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  return getAddonStripePriceIdFromModule(mod ?? null);
}

// Fetches the live unit_amount + currency for a module's resolved Stripe
// Price binding so admins can spot drift between what they typed into
// modules.metadata.addonPriceCents and what Stripe will actually charge.
// Reports both the metadata override and the legacy env binding plus
// which one is currently winning, so admins can tell at a glance how a
// module is configured. Never throws; returns a typed result.
export type AddonStripePriceSource = 'override' | 'env' | 'none';

export interface AddonStripePriceLookup {
  envKey: string;
  /** Resolved priceId actually used by checkout (override wins over env). */
  priceId: string;
  /** Raw metadata.stripePriceId value (the override), if set. */
  overridePriceId: string;
  /** Raw STRIPE_PRICE_ADDON_<SLUG> env value, if set. */
  envPriceId: string;
  /** Which mechanism is currently winning. 'none' means neither configured. */
  source: AddonStripePriceSource;
  stripeMode: string;
  stripeEnabled: boolean;
  fetched: boolean;
  unitAmountCents: number | null;
  currency: string | null;
  active: boolean | null;
  error: string | null;
}

export async function lookupAddonStripePrice(
  moduleSlug: string,
  preloaded?: { slug: string; metadata?: Record<string, unknown> | null } | null,
): Promise<AddonStripePriceLookup> {
  const envKey = getAddonStripePriceEnvKey(moduleSlug);
  // Accept a preloaded module row so list endpoints (e.g. /v1/platform/pricing)
  // can avoid an N+1 DB roundtrip when iterating the module catalog.
  let mod = preloaded ?? null;
  if (!mod) {
    const [row] = await db.select({ slug: modules.slug, metadata: modules.metadata })
      .from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
    mod = row ?? null;
  }
  const md = (mod?.metadata ?? {}) as Record<string, unknown>;
  const overridePriceId = typeof md.stripePriceId === 'string' ? md.stripePriceId.trim() : '';
  const envPriceId = getAddonStripePriceIdFromEnv(moduleSlug);
  const priceId = overridePriceId || envPriceId;
  const source: AddonStripePriceSource = overridePriceId
    ? 'override'
    : (envPriceId ? 'env' : 'none');
  const base: AddonStripePriceLookup = {
    envKey,
    priceId,
    overridePriceId,
    envPriceId,
    source,
    stripeMode: STRIPE_MODE,
    stripeEnabled: isStripeEnabled(),
    fetched: false,
    unitAmountCents: null,
    currency: null,
    active: null,
    error: null,
  };
  if (!priceId) return base;
  if (!STRIPE_SECRET_KEY) {
    return { ...base, error: 'STRIPE_SECRET_KEY is not configured; cannot verify price.' };
  }
  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    return {
      ...base,
      fetched: true,
      unitAmountCents: typeof price.unit_amount === 'number' ? price.unit_amount : null,
      currency: typeof price.currency === 'string' ? price.currency : null,
      active: typeof price.active === 'boolean' ? price.active : null,
    };
  } catch (err: any) {
    return { ...base, error: err?.message || 'Stripe price lookup failed' };
  }
}

// Creates a brand-new recurring (monthly) Stripe Price for a module's add-on.
// Used by the super-admin "Create new Stripe price" drift-fix action so an
// admin can rotate to a corrected unit_amount without leaving the UI.
// Requires Stripe to be live (secret + STRIPE_MODE=live) — local/test stubs
// are intentionally rejected so we never invent priceIds against a real env.
export interface CreateAddonStripePriceArgs {
  moduleSlug: string;
  moduleName: string;
  unitAmountCents: number;
  currency?: string;
}
export interface CreateAddonStripePriceResult {
  priceId: string;
  productId: string;
  unitAmountCents: number;
  currency: string;
}
export async function createAddonStripePrice(
  args: CreateAddonStripePriceArgs,
): Promise<CreateAddonStripePriceResult> {
  if (!isStripeEnabled()) {
    throw new Error('Stripe is not enabled (set STRIPE_SECRET_KEY and STRIPE_MODE=live)');
  }
  if (!Number.isInteger(args.unitAmountCents) || args.unitAmountCents <= 0) {
    throw new Error('unitAmountCents must be a positive integer (cents)');
  }
  const currency = (args.currency || 'usd').toLowerCase();
  const stripe = getStripe();
  const price = await stripe.prices.create({
    unit_amount: args.unitAmountCents,
    currency,
    recurring: { interval: 'month' },
    product_data: { name: `OperatorOS — ${args.moduleName} (add-on)` },
    metadata: { moduleSlug: args.moduleSlug, source: 'platform_pricing_create' },
  });
  return {
    priceId: price.id,
    productId: typeof price.product === 'string'
      ? price.product
      : (price.product && typeof price.product === 'object' && 'id' in price.product
          ? String(price.product.id)
          : ''),
    unitAmountCents: typeof price.unit_amount === 'number' ? price.unit_amount : args.unitAmountCents,
    currency: price.currency || currency,
  };
}

// Validates a Stripe Price ID by retrieving it from Stripe. Used by the
// admin "edit price id" surface so we never persist a bogus id that would
// break the checkout flow. Returns the live price details on success.
export interface AddonStripePriceValidation {
  ok: boolean;
  priceId: string;
  unitAmountCents: number | null;
  currency: string | null;
  active: boolean | null;
  error: string | null;
}

export async function validateAddonStripePriceId(priceId: string): Promise<AddonStripePriceValidation> {
  const trimmed = priceId.trim();
  const base: AddonStripePriceValidation = {
    ok: false, priceId: trimmed, unitAmountCents: null,
    currency: null, active: null, error: null,
  };
  if (!trimmed) {
    return { ...base, error: 'Stripe Price ID is required' };
  }
  if (!/^price_[A-Za-z0-9]+$/.test(trimmed)) {
    return { ...base, error: 'Stripe Price ID must look like "price_XXXX"' };
  }
  if (!STRIPE_SECRET_KEY) {
    return { ...base, error: 'STRIPE_SECRET_KEY is not configured; cannot validate price id' };
  }
  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(trimmed);
    return {
      ok: true,
      priceId: trimmed,
      unitAmountCents: typeof price.unit_amount === 'number' ? price.unit_amount : null,
      currency: typeof price.currency === 'string' ? price.currency : null,
      active: typeof price.active === 'boolean' ? price.active : null,
      error: null,
    };
  } catch (err: any) {
    return { ...base, error: err?.message || 'Stripe price lookup failed' };
  }
}

// In local-mode (no Stripe) the buy_addon CTA is allowed so dev can
// exercise the local addon path; with Stripe enabled, a price id is required.
// Accepts the loaded module row so the metadata override on
// `modules.metadata.stripePriceId` is honored without a second DB roundtrip.
export function isAddonPurchasable(
  mod: { slug: string; metadata?: Record<string, unknown> | null } | null | undefined,
): boolean {
  if (!isStripeEnabled()) return true;
  return !!getAddonStripePriceIdFromModule(mod);
}

export class AddonNotPurchasableError extends Error {
  code = 'ADDON_NOT_PURCHASABLE' as const;
  httpStatus = 409 as const;
  constructor(public moduleSlug: string, message: string) {
    super(message);
    this.name = 'AddonNotPurchasableError';
  }
}

// Fail-closed: with Stripe enabled but no STRIPE_PRICE_ADDON_<SLUG>,
// the purchase endpoint must refuse instead of falling through to the
// local-mode insert (which would grant a free addon).
export function assertAddonPurchasableOrThrow(
  mod: { slug: string; metadata?: Record<string, unknown> | null },
): void {
  if (isStripeEnabled() && !getAddonStripePriceIdFromModule(mod)) {
    throw new AddonNotPurchasableError(
      mod.slug,
      `Add-on for module "${mod.slug}" is not configured for purchase in this environment. ` +
      `Stripe is enabled but neither modules.metadata.stripePriceId nor ` +
      `STRIPE_PRICE_ADDON_${mod.slug.toUpperCase().replace(/-/g, '_')} is set.`
    );
  }
}

export interface AddonSubscribeResult {
  ok: boolean;
  moduleSlug: string;
  action: 'subscribed' | 'already_active';
  checkoutUrl?: string;
}

export async function subscribeToAddon(
  userId: string,
  moduleSlug: string,
  opts?: { tenantId?: string | null; initiatedByUserId?: string | null },
): Promise<AddonSubscribeResult> {
  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) throw new Error(`Module not found: ${moduleSlug}`);
  if (mod.status === 'disabled') throw new Error(`Module is disabled: ${moduleSlug}`);
  if (mod.status === 'coming_soon') throw new Error(`Module is not yet available: ${moduleSlug}`);

  // Fail-closed before any branch that could create an active addon row.
  assertAddonPurchasableOrThrow(mod);

  // Dedupe scope: when a tenantId is provided, the same admin user can
  // legitimately purchase the same addon for a different tenant, so only
  // block when an active row exists for THIS (user, module, tenant) tuple.
  // Falls back to the legacy (user, module) check for non-tenant flows.
  const tenantScope = opts?.tenantId ?? null;
  const existing = await db.select().from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.userId, userId), eq(addonSubscriptions.moduleId, mod.id)));
  const active = existing.find(a =>
    ['active', 'trialing'].includes(a.status) &&
    (tenantScope === null || (a.tenantId ?? null) === tenantScope),
  );
  if (active) return { ok: true, moduleSlug, action: 'already_active' };

  const priceId = getAddonStripePriceIdFromModule(mod);
  if (isStripeEnabled() && priceId) {
    const stripe = getStripe();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error('User not found');

    // Reuse existing customer if there is a base subscription
    const [baseSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    let customerId = baseSub?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email, name: user.name, metadata: { userId },
      });
      customerId = customer.id;
    }
    const appUrl = process.env.APP_URL || 'http://localhost:5000';

    // Gate 2: pre-create the addon_subscriptions row in 'incomplete' so
    // the webhook handler can `UPDATE` instead of `INSERT`. This row is
    // invisible to the double-buy guard above (only 'active'/'trialing'
    // count). Threading the row id through Stripe metadata gives us a
    // strong link from webhook → original purchase intent.
    const initiatedByUserId = opts?.initiatedByUserId ?? userId;
    const tenantId = opts?.tenantId ?? null;
    const [pending] = await db.insert(addonSubscriptions).values({
      userId,
      moduleId: mod.id,
      status: 'incomplete',
      tenantId,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      amount: 0,
      currentPeriodStart: new Date(),
    }).returning();

    const md: Record<string, string> = {
      userId, user_id: userId,
      moduleSlug, module_slug: moduleSlug,
      kind: 'addon', type: 'addon',
      initiated_by_user_id: initiatedByUserId,
      initiatedByUserId,
      internal_addon_subscription_id: pending.id,
      internalAddonSubscriptionId: pending.id,
    };
    if (tenantId) {
      md.tenant_id = tenantId;
      md.tenantId = tenantId;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}?addon=success&module=${moduleSlug}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}?addon=canceled&module=${moduleSlug}`,
      // Both metadata keysets so consumers on either contract work:
      //   legacy: kind='addon', moduleSlug
      //   spec:   type='addon', module_slug
      // Plus Gate 2 fields: tenant_id, initiated_by_user_id, internal_addon_subscription_id.
      metadata: md,
      subscription_data: { metadata: md },
    });
    return { ok: true, moduleSlug, action: 'subscribed', checkoutUrl: session.url! };
  }

  // Local mode: create active addon row immediately. Defense-in-depth
  // — the gate above already refused Stripe-enabled-but-misconfigured.
  if (isStripeEnabled()) {
    throw new AddonNotPurchasableError(
      moduleSlug,
      `Refusing to create local addon row while Stripe is enabled.`,
    );
  }
  await db.insert(addonSubscriptions).values({
    userId, moduleId: mod.id, status: 'active', amount: 0,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  await db.insert(billingEvents).values({
    userId, eventType: 'addon_subscribed',
    metadata: { moduleSlug, mode: 'local' },
    processedAt: new Date(),
  });
  await db.insert(activityFeed).values({
    userId, action: 'addon_subscribed', entityType: 'module',
    entityId: mod.id, metadata: { moduleSlug, mode: 'local' },
  });
  return { ok: true, moduleSlug, action: 'subscribed' };
}

export async function cancelAddon(userId: string, moduleSlug: string): Promise<{ ok: boolean; message: string }> {
  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) throw new Error(`Module not found: ${moduleSlug}`);

  const rows = await db.select().from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.userId, userId), eq(addonSubscriptions.moduleId, mod.id)));
  const active = rows.find(a => ['active', 'trialing'].includes(a.status));
  if (!active) return { ok: false, message: 'No active add-on for this module' };

  if (isStripeEnabled() && active.stripeSubscriptionId) {
    const stripe = getStripe();
    await stripe.subscriptions.update(active.stripeSubscriptionId, { cancel_at_period_end: true });
    await db.update(addonSubscriptions).set({
      cancelAtPeriodEnd: true, updatedAt: new Date(),
    }).where(eq(addonSubscriptions.id, active.id));
  } else {
    await db.update(addonSubscriptions).set({
      status: 'canceled', cancelAtPeriodEnd: false, updatedAt: new Date(),
    }).where(eq(addonSubscriptions.id, active.id));
  }

  await db.insert(billingEvents).values({
    userId, eventType: 'addon_cancel_scheduled',
    metadata: { moduleSlug, mode: isStripeEnabled() ? 'stripe' : 'local' },
    processedAt: new Date(),
  });

  return { ok: true, message: 'Add-on cancellation scheduled' };
}

// Pure addon webhook processor — idempotency is owned by claimStripeEvent
// at the route layer. This function only performs side effects.
// Reuses classifyWebhookEvent so processor and route agree on metadata
// source: object.metadata, subscription_data, subscription_details, and
// invoice line items are all considered (spec + legacy contracts).
export async function processAddonWebhookEvent(event: { id: string; type: string; data: { object: any } }): Promise<WebhookProcessResult> {
  const { type, data } = event;
  const obj = data.object;
  const cls = classifyWebhookEvent(event);
  if (!cls.isAddon || !cls.userId || !cls.moduleSlug) {
    return { handled: false, error: 'Not an addon event or missing metadata' };
  }
  const userId = cls.userId;
  const moduleSlug = cls.moduleSlug;

  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) return { handled: false, error: `Module ${moduleSlug} not found` };

  switch (type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created': {
      const stripeSubId = obj.subscription || obj.id;
      const customerId = obj.customer;
      const periodStart = obj.current_period_start ? new Date(obj.current_period_start * 1000) : new Date();
      const periodEnd = obj.current_period_end
        ? new Date(obj.current_period_end * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Gate 2: prefer the pre-created row identified by metadata
      // `internal_addon_subscription_id`, falling back to active rows
      // (legacy contract) or `incomplete` rows for the same user+module
      // pair (in case metadata was lost in transit).
      const existingAddon = await db.select().from(addonSubscriptions)
        .where(and(eq(addonSubscriptions.userId, userId), eq(addonSubscriptions.moduleId, mod.id)));
      const promotable = (cls.internalAddonSubscriptionId
        ? existingAddon.find(a => a.id === cls.internalAddonSubscriptionId)
        : null)
        ?? existingAddon.find(a => ['active', 'trialing'].includes(a.status))
        ?? existingAddon.find(a => a.status === 'incomplete');
      if (promotable) {
        await db.update(addonSubscriptions).set({
          stripeSubscriptionId: stripeSubId, stripeCustomerId: customerId,
          status: 'active', updatedAt: new Date(),
          currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
          // Backfill tenantId from metadata if the pending row was created
          // before tenantId was known (legacy buyers / personal scope).
          ...(cls.tenantId && !promotable.tenantId ? { tenantId: cls.tenantId } : {}),
        }).where(eq(addonSubscriptions.id, promotable.id));
      } else {
        await db.insert(addonSubscriptions).values({
          userId, moduleId: mod.id, status: 'active',
          tenantId: cls.tenantId ?? null,
          stripeSubscriptionId: stripeSubId, stripeCustomerId: customerId,
          amount: obj.amount_total ?? 0,
          currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
        });
      }
      return { handled: true, action: type };
    }
    case 'customer.subscription.updated': {
      const stripeSubId = obj.id;
      const status = mapStripeStatus(obj.status);
      const updated = await db.update(addonSubscriptions).set({
        status, cancelAtPeriodEnd: obj.cancel_at_period_end,
        currentPeriodStart: new Date(obj.current_period_start * 1000),
        currentPeriodEnd: new Date(obj.current_period_end * 1000),
        updatedAt: new Date(),
      }).where(eq(addonSubscriptions.stripeSubscriptionId, stripeSubId))
        .returning({ id: addonSubscriptions.id });
      const rowsAffected = updated.length;
      return {
        handled: true,
        action: type,
        rowsAffected,
        noLocalRow: rowsAffected === 0,
      };
    }
    case 'customer.subscription.deleted': {
      const stripeSubId = obj.id;
      const updated = await db.update(addonSubscriptions).set({
        status: 'canceled', updatedAt: new Date(),
      }).where(eq(addonSubscriptions.stripeSubscriptionId, stripeSubId))
        .returning({ id: addonSubscriptions.id });
      const rowsAffected = updated.length;
      return {
        handled: true,
        action: type,
        rowsAffected,
        noLocalRow: rowsAffected === 0,
      };
    }
    default:
      return { handled: false, error: `Unhandled event type: ${type}` };
  }
}

// Admin DLQ retry: replay the persisted raw event through
// processAddonWebhookEvent. Falls back to "mark resolved" when the original
// row predates raw-payload capture.
export async function retryBillingEvent(eventId: string): Promise<{ ok: boolean; message: string; replayed?: boolean; replayResult?: any }> {
  const [evt] = await db.select().from(billingEvents).where(eq(billingEvents.id, eventId)).limit(1);
  if (!evt) return { ok: false, message: 'Event not found' };
  // Idempotent no-op: if the event has already been processed (either by
  // the live webhook handler or by a prior successful replay), refuse to
  // re-run side effects. The `duplicate_ignored` action mirrors the
  // contract used by the /v1/billing/webhook claim path so callers can
  // treat both as "saw it, did nothing" in a uniform way.
  if (evt.processedAt) return {
    ok: true,
    replayed: false,
    message: 'Event already processed; ignoring duplicate retry.',
    replayResult: { handled: true, action: 'duplicate_ignored' },
  };

  const next = (evt.retryCount ?? 0) + 1;
  const rawEvent = (evt.metadata as any)?.rawEvent;

  // No raw payload → just mark resolved (legacy / non-replayable)
  if (!rawEvent || typeof rawEvent !== 'object' || !rawEvent.type) {
    await db.update(billingEvents).set({
      retryCount: next, processedAt: new Date(), errorMessage: null,
    }).where(eq(billingEvents.id, eventId));
    return {
      ok: true,
      message: `Event marked resolved (attempts=${next}). No raw payload was captured for true replay.`,
      replayed: false,
    };
  }

  // Release the stripe_event_id slot so the replay can re-claim it via the
  // partial unique index. The DLQ row's stripe_event_id stays NULL.
  await db.update(billingEvents).set({
    stripeEventId: null,
    metadata: { ...(evt.metadata as any || {}), replayInProgress: true },
  }).where(eq(billingEvents.id, eventId));

  // Dispatch by event family. Stripe's webhook router tags addon flows via
  // metadata.type==='addon' || metadata.kind==='addon' on the affected object;
  // everything else is a plan/base-subscription event handled by
  // processWebhookEvent. Without this branch, plan-side failures could not be
  // replayed and would stay stuck in the DLQ forever.
  const replayObj = rawEvent?.data?.object || {};
  const replayMd = (replayObj.metadata || {}) as Record<string, string>;
  const isAddonReplay = replayMd.type === 'addon' || replayMd.kind === 'addon';

  let replayResult: WebhookProcessResult;
  try {
    replayResult = isAddonReplay
      ? await processAddonWebhookEvent(rawEvent)
      : await processWebhookEvent(rawEvent);
  } catch (err: any) {
    await db.update(billingEvents).set({
      retryCount: next,
      errorMessage: `replay_error: ${err.message}`,
      metadata: { ...(evt.metadata as any || {}), replayedAt: new Date().toISOString(), replayError: err.message },
    }).where(eq(billingEvents.id, eventId));
    return { ok: false, message: `Replay threw: ${err.message}` };
  }

  if (replayResult.handled) {
    await db.update(billingEvents).set({
      retryCount: next, processedAt: new Date(), errorMessage: null,
      metadata: {
        ...(evt.metadata as any || {}),
        replayedAt: new Date().toISOString(),
        replayedAction: replayResult.action || 'handled',
      },
    }).where(eq(billingEvents.id, eventId));
    return {
      ok: true,
      message: `Event replayed successfully (attempts=${next}, action=${replayResult.action || 'handled'}).`,
      replayed: true,
      replayResult,
    };
  }

  await db.update(billingEvents).set({
    retryCount: next,
    errorMessage: `replay_failed: ${replayResult.error || 'not_handled'}`,
    metadata: {
      ...(evt.metadata as any || {}),
      replayedAt: new Date().toISOString(),
      replayError: replayResult.error || 'not_handled',
    },
  }).where(eq(billingEvents.id, eventId));
  return {
    ok: false,
    message: `Replay failed: ${replayResult.error || 'not handled'}. Attempts=${next}.`,
    replayed: false,
    replayResult,
  };
}

/**
 * Admin recovery hook: re-fetches the user's Stripe state and reconciles
 * local subscriptions + addon_subscriptions rows. This is the primary
 * tool for recovering from missed webhooks (e.g. webhook endpoint was
 * down, signature secret rotated mid-flight).
 *
 * In local mode this is a no-op (there is no upstream state to fetch).
 * In stripe mode it lists the customer's subscriptions and replays each
 * one through the local idempotent processors so the local DB ends up
 * matching upstream regardless of whatever webhooks were missed.
 */
export type ResyncNeedsAttentionAddon = {
  stripeSubscriptionId: string;
  moduleSlug: string | null;
  reason: string;
};

export async function resyncUserBilling(userId: string): Promise<{
  ok: boolean;
  mode: 'stripe' | 'local';
  message: string;
  scanned?: number;
  reconciled?: number;
  needsAttention?: number;
  needsAttentionAddons?: ResyncNeedsAttentionAddon[];
}> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { ok: false, mode: 'local', message: 'User not found' };

  if (!isStripeEnabled()) {
    return {
      ok: true, mode: 'local',
      message: 'Stripe is not enabled in this environment; nothing to resync.',
      scanned: 0, reconciled: 0,
    };
  }

  const stripe = getStripe();

  // Find every customer id we already know for this user
  const localPlanSub = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const localAddonSubs = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.userId, userId));
  const customerIds = new Set<string>();
  for (const s of localPlanSub) if (s.stripeCustomerId) customerIds.add(s.stripeCustomerId);
  for (const a of localAddonSubs) if (a.stripeCustomerId) customerIds.add(a.stripeCustomerId);

  // Track which stripeSubscriptionIds already have a local addon row, so
  // we can decide whether to replay as `customer.subscription.updated`
  // (heal an existing row) vs `customer.subscription.created` (insert a
  // missing row). Without this, an addon whose original
  // `checkout.session.completed` was missed would resync as a no-op
  // UPDATE and the user would silently keep losing access.
  const knownAddonStripeSubIds = new Set<string>();
  for (const a of localAddonSubs) {
    if (a.stripeSubscriptionId) knownAddonStripeSubIds.add(a.stripeSubscriptionId);
  }

  if (customerIds.size === 0) {
    return {
      ok: true, mode: 'stripe',
      message: 'No Stripe customer is associated with this user yet; nothing to resync.',
      scanned: 0, reconciled: 0,
    };
  }

  let scanned = 0;
  let reconciledAddons = 0;
  let reconciledPlans = 0;
  const needsAttentionAddons: ResyncNeedsAttentionAddon[] = [];

  // Snapshot active plan-price -> plan_id mapping once per resync.
  const allPlans = await db.select().from(subscriptionPlans);
  const planByStripePriceId = new Map<string, typeof allPlans[number]>();
  for (const p of allPlans) {
    if (p.stripePriceId) planByStripePriceId.set(p.stripePriceId, p);
  }

  for (const customerId of customerIds) {
    const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    for (const sub of list.data ?? []) {
      scanned += 1;
      const md = sub?.metadata ?? {};
      const isAddon = md.type === 'addon' || md.kind === 'addon';

      if (isAddon) {
        // Reuse the addon idempotency machinery via a synthetic event.
        // If we have NO local addon row for this Stripe subscription id,
        // the original `checkout.session.completed` was missed entirely
        // — replay as `customer.subscription.created` so the
        // processAddonWebhookEvent insert branch fires. Otherwise replay
        // as `customer.subscription.updated` to heal status/period drift
        // on the existing row.
        const hasLocalRow = knownAddonStripeSubIds.has(sub.id);
        const syntheticType = hasLocalRow
          ? 'customer.subscription.updated'
          : 'customer.subscription.created';
        const synthetic = {
          id: `resync_${sub.id}_${Date.now()}`,
          type: syntheticType as 'customer.subscription.updated' | 'customer.subscription.created',
          data: { object: { ...sub, metadata: { ...md, userId, user_id: userId, kind: 'addon', type: 'addon' } } },
        };
        const r = await processAddonWebhookEvent(synthetic);
        if (r.handled) {
          reconciledAddons += 1;
        } else {
          needsAttentionAddons.push({
            stripeSubscriptionId: sub.id,
            moduleSlug: (md.module_slug ?? md.moduleSlug ?? null) as string | null,
            reason: r.error ?? 'Could not reconcile add-on subscription',
          });
        }
        continue;
      }

      // Base plan subscription: match by Stripe price id.
      const stripePriceId = sub.items?.data?.[0]?.price?.id;
      const plan = stripePriceId ? planByStripePriceId.get(stripePriceId) : null;
      if (!plan) continue;

      const status = (sub.status as any) ?? 'active';
      const currentPeriodStart = sub.current_period_start
        ? new Date(sub.current_period_start * 1000) : new Date();
      const currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000) : null;

      // Upsert the local subscriptions row keyed by stripeSubscriptionId.
      const [existing] = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.stripeSubscriptionId, sub.id)))
        .limit(1);
      if (existing) {
        await db.update(subscriptions).set({
          planId: plan.id,
          status,
          stripeCustomerId: customerId,
          currentPeriodStart, currentPeriodEnd,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          updatedAt: new Date(),
        }).where(eq(subscriptions.id, existing.id));
      } else {
        await db.insert(subscriptions).values({
          userId, planId: plan.id, status,
          stripeSubscriptionId: sub.id, stripeCustomerId: customerId,
          currentPeriodStart, currentPeriodEnd,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        });
      }
      reconciledPlans += 1;
    }
  }

  const needsAttention = needsAttentionAddons.length;
  await db.insert(billingEvents).values({
    userId, eventType: 'admin_resync',
    metadata: { mode: 'stripe', scanned, reconciledAddons, reconciledPlans, needsAttention, needsAttentionAddons },
    processedAt: new Date(),
  });

  const attentionSuffix = needsAttention > 0
    ? ` ${needsAttention} addon(s) need attention.`
    : '';
  return {
    ok: true, mode: 'stripe',
    message: `Resync complete. Scanned ${scanned} Stripe subscription(s); reconciled ${reconciledPlans} plan + ${reconciledAddons} addon record(s).${attentionSuffix}`,
    scanned, reconciled: reconciledPlans + reconciledAddons,
    needsAttention, needsAttentionAddons,
  };
}

export function getBillingMode() {
  return {
    mode: isStripeEnabled() ? 'stripe' : 'local',
    stripeConfigured: !!STRIPE_SECRET_KEY,
    webhookConfigured: !!STRIPE_WEBHOOK_SECRET,
    prices: {
      starter: !!getStripePriceIdForInterval('starter', 'month'),
      pro: !!getStripePriceIdForInterval('pro', 'month'),
      elite: !!getStripePriceIdForInterval('elite', 'month'),
    },
  };
}
