import { db } from '../db.js';
import crypto from 'node:crypto';
import {
  users, subscriptions, subscriptionPlans, billingEvents, activityFeed,
  modules, addonSubscriptions,
} from '../schema.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  getUserPlanConfig, getDowngradeViolations, isUpgrade, isDowngrade, PLAN_CONFIGS,
} from './plans.js';

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

export function isStripeEnabled(): boolean {
  return !!STRIPE_SECRET_KEY && STRIPE_MODE === 'live';
}

function getStripe() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  // Lazy-load stripe to avoid import errors when not installed
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  try {
    const Stripe = require('stripe');
    return new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  } catch {
    throw new Error('Stripe SDK is not installed. Run: npm install stripe');
  }
}

const STRIPE_PRICE_MAP: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER || '',
  pro: process.env.STRIPE_PRICE_PRO || '',
  elite: process.env.STRIPE_PRICE_ELITE || '',
};

function getStripePriceId(planSlug: string): string {
  return STRIPE_PRICE_MAP[planSlug] || '';
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

export async function subscribeToPlan(userId: string, planSlug: string): Promise<SubscribeResult> {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, planSlug)).limit(1);
  if (!plan) throw new Error('Plan not found');

  const { config: currentConfig, subscription: currentSub } = await getUserPlanConfig(userId);
  if (currentConfig.slug === planSlug) throw new Error('You are already on this plan');

  const upgrading = isUpgrade(currentConfig.slug, planSlug);
  const downgrading = isDowngrade(currentConfig.slug, planSlug);

  if (isStripeEnabled() && plan.price > 0) {
    const checkoutResult = await createCheckoutSession(userId, planSlug);
    return {
      ok: true,
      plan: plan.name,
      action: upgrading ? 'upgraded' : downgrading ? 'downgraded' : 'subscribed',
      downgradeWarnings: [],
      checkoutUrl: checkoutResult.url,
    };
  }

  return await applyPlanChangeLocally(userId, plan, currentConfig.slug, currentSub);
}

async function applyPlanChangeLocally(
  userId: string, plan: any, fromSlug: string, currentSub: any
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
    const violations = await getDowngradeViolations(userId, plan.slug);
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

export async function createCheckoutSession(userId: string, planSlug: string): Promise<CheckoutSessionResult> {
  if (!isStripeEnabled()) {
    throw new Error('Stripe is not enabled. Set STRIPE_SECRET_KEY and STRIPE_MODE=live');
  }

  const stripe = getStripe();
  const priceId = getStripePriceId(planSlug);
  if (!priceId) {
    throw new Error(`No Stripe price ID configured for plan: ${planSlug}. Set STRIPE_PRICE_${planSlug.toUpperCase()} env var.`);
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
}

export function verifyWebhookSignature(payload: string | Buffer, signature: string): any {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}

export async function processWebhookEvent(event: { type: string; data: { object: any } }): Promise<WebhookProcessResult> {
  const { type, data } = event;
  const obj = data.object;

  console.log(`[billing-service] Processing webhook: ${type}`);

  switch (type) {
    case 'checkout.session.completed':
      return await handleCheckoutCompleted(obj);

    case 'customer.subscription.created':
      return await handleSubscriptionCreated(obj);

    case 'customer.subscription.updated':
      return await handleSubscriptionUpdated(obj);

    case 'customer.subscription.deleted':
      return await handleSubscriptionDeleted(obj);

    case 'invoice.payment_failed':
      return await handlePaymentFailed(obj);

    case 'invoice.paid':
      return await handleInvoicePaid(obj);

    default:
      console.log(`[billing-service] Unhandled webhook event: ${type}`);
      return { handled: false };
  }
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

  await db.insert(billingEvents).values({
    userId, eventType: 'checkout_completed',
    stripeEventId: session.id,
    metadata: { planSlug, stripeSubscriptionId, stripeCustomerId, mode: 'stripe' },
  });

  await db.insert(activityFeed).values({
    userId, action: 'subscribed', entityType: 'subscription',
    metadata: { planName: plan.name, planSlug, via: 'stripe_checkout' },
  });

  console.log(`[billing-service] Checkout completed: user=${userId} plan=${planSlug}`);
  return { handled: true, action: 'checkout_completed' };
}

async function handleSubscriptionCreated(subscription: any): Promise<WebhookProcessResult> {
  const userId = subscription.metadata?.userId;
  if (!userId) return { handled: false, error: 'Missing userId in subscription metadata' };

  const stripeSubId = subscription.id;
  const customerId = subscription.customer;
  const status = mapStripeStatus(subscription.status);

  const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (existingSub) {
    await db.update(subscriptions).set({
      stripeSubscriptionId: stripeSubId, stripeCustomerId: customerId,
      status, updatedAt: new Date(),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    }).where(eq(subscriptions.id, existingSub.id));
  }

  await db.insert(billingEvents).values({
    userId, eventType: 'stripe_subscription_created',
    stripeEventId: stripeSubId,
    metadata: { status, customerId, mode: 'stripe' },
  });

  console.log(`[billing-service] Subscription created: user=${userId} stripe_sub=${stripeSubId}`);
  return { handled: true, action: 'subscription_created' };
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

  await db.insert(billingEvents).values({
    userId: existingSub.userId, eventType: 'stripe_subscription_updated',
    stripeEventId: stripeSubId,
    metadata: { status, cancelAtEnd, priceId, mode: 'stripe' },
  });

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

  await db.insert(billingEvents).values({
    userId: existingSub.userId, eventType: 'stripe_subscription_deleted',
    stripeEventId: stripeSubId,
    metadata: { mode: 'stripe' },
  });

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

  await db.insert(billingEvents).values({
    userId: existingSub.userId, eventType: 'payment_failed',
    stripeEventId: invoice.id,
    amount: invoice.amount_due,
    metadata: { attemptCount: invoice.attempt_count, mode: 'stripe' },
  });

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

  await db.insert(billingEvents).values({
    userId: existingSub.userId, eventType: 'invoice_paid',
    stripeEventId: invoice.id,
    amount: invoice.amount_paid,
    metadata: { invoiceNumber: invoice.number, mode: 'stripe' },
  });

  console.log(`[billing-service] Invoice paid: stripe_sub=${stripeSubId}`);
  return { handled: true, action: 'invoice_paid' };
}

function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
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

function getAddonStripePriceId(moduleSlug: string): string {
  const key = `STRIPE_PRICE_ADDON_${moduleSlug.toUpperCase().replace(/-/g, '_')}`;
  return process.env[key] || '';
}

export interface AddonSubscribeResult {
  ok: boolean;
  moduleSlug: string;
  action: 'subscribed' | 'already_active';
  checkoutUrl?: string;
}

export async function subscribeToAddon(userId: string, moduleSlug: string): Promise<AddonSubscribeResult> {
  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) throw new Error(`Module not found: ${moduleSlug}`);
  if (mod.status === 'disabled') throw new Error(`Module is disabled: ${moduleSlug}`);
  if (mod.status === 'coming_soon') throw new Error(`Module is not yet available: ${moduleSlug}`);

  const existing = await db.select().from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.userId, userId), eq(addonSubscriptions.moduleId, mod.id)));
  const active = existing.find(a => ['active', 'trialing'].includes(a.status));
  if (active) return { ok: true, moduleSlug, action: 'already_active' };

  const priceId = getAddonStripePriceId(moduleSlug);
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
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}?addon=success&module=${moduleSlug}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}?addon=canceled&module=${moduleSlug}`,
      // Send BOTH metadata keysets so consumers on either contract work:
      //   legacy: kind='addon', moduleSlug
      //   spec:   type='addon', module_slug
      metadata: { userId, user_id: userId, moduleSlug, module_slug: moduleSlug, kind: 'addon', type: 'addon' },
      subscription_data: { metadata: { userId, user_id: userId, moduleSlug, module_slug: moduleSlug, kind: 'addon', type: 'addon' } },
    });
    return { ok: true, moduleSlug, action: 'subscribed', checkoutUrl: session.url! };
  }

  // Local mode: create active addon row immediately
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

// Idempotent addon webhook processor. Race-safe via partial unique index
// uq_billing_events_stripe_event_id (WHERE stripe_event_id IS NOT NULL).
export async function processAddonWebhookEvent(event: { id: string; type: string; data: { object: any } }): Promise<WebhookProcessResult> {
  const { type, data, id: stripeEventId } = event;
  const obj = data.object;
  // Accept both metadata contracts: spec ({ type, module_slug, user_id })
  // and legacy ({ kind, moduleSlug, userId }).
  const md = obj.metadata ?? {};
  const userId = md.user_id ?? md.userId;
  const moduleSlug = md.module_slug ?? md.moduleSlug;
  const isAddon = md.type === 'addon' || md.kind === 'addon';
  if (!isAddon || !userId || !moduleSlug) {
    return { handled: false, error: 'Not an addon event or missing metadata' };
  }

  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);

  // ON CONFLICT must include the same predicate as the partial unique index
  // so PostgreSQL can infer it; otherwise the insert errors instead of no-op.
  const claim = await db.insert(billingEvents).values({
    userId, eventType: `addon_${type.replace(/\./g, '_')}`,
    stripeEventId, payloadHash,
    metadata: { moduleSlug, mode: 'stripe', rawEvent: event },
  }).onConflictDoNothing({
    target: billingEvents.stripeEventId,
    where: sql`stripe_event_id IS NOT NULL`,
  }).returning({ id: billingEvents.id });

  // Empty claim => another worker owns this event id; skip side effects.
  if (claim.length === 0) {
    return { handled: true, action: 'duplicate_ignored' };
  }
  const claimedId = claim[0].id;

  if (!mod) {
    await db.update(billingEvents).set({
      errorMessage: `Module ${moduleSlug} not found`,
    }).where(eq(billingEvents.id, claimedId));
    return { handled: false, error: 'Module not found' };
  }

  try {
    switch (type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created': {
        const stripeSubId = obj.subscription || obj.id;
        const customerId = obj.customer;
        const periodStart = obj.current_period_start ? new Date(obj.current_period_start * 1000) : new Date();
        const periodEnd = obj.current_period_end
          ? new Date(obj.current_period_end * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const existingAddon = await db.select().from(addonSubscriptions)
          .where(and(eq(addonSubscriptions.userId, userId), eq(addonSubscriptions.moduleId, mod.id)));
        const active = existingAddon.find(a => ['active', 'trialing'].includes(a.status));
        if (active) {
          await db.update(addonSubscriptions).set({
            stripeSubscriptionId: stripeSubId, stripeCustomerId: customerId,
            status: 'active', updatedAt: new Date(),
            currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
          }).where(eq(addonSubscriptions.id, active.id));
        } else {
          await db.insert(addonSubscriptions).values({
            userId, moduleId: mod.id, status: 'active',
            stripeSubscriptionId: stripeSubId, stripeCustomerId: customerId,
            amount: obj.amount_total ?? 0,
            currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const stripeSubId = obj.id;
        const status = mapStripeStatus(obj.status);
        await db.update(addonSubscriptions).set({
          status, cancelAtPeriodEnd: obj.cancel_at_period_end,
          currentPeriodStart: new Date(obj.current_period_start * 1000),
          currentPeriodEnd: new Date(obj.current_period_end * 1000),
          updatedAt: new Date(),
        }).where(eq(addonSubscriptions.stripeSubscriptionId, stripeSubId));
        break;
      }
      case 'customer.subscription.deleted': {
        const stripeSubId = obj.id;
        await db.update(addonSubscriptions).set({
          status: 'canceled', updatedAt: new Date(),
        }).where(eq(addonSubscriptions.stripeSubscriptionId, stripeSubId));
        break;
      }
      default:
        // Unknown event type — keep the claim row but mark as not-handled
        // so admins can see what arrived.
        await db.update(billingEvents).set({
          errorMessage: `Unhandled event type: ${type}`,
        }).where(eq(billingEvents.id, claimedId));
        return { handled: false };
    }

    await db.update(billingEvents).set({
      processedAt: new Date(), errorMessage: null,
    }).where(eq(billingEvents.id, claimedId));
    return { handled: true, action: type };
  } catch (err: any) {
    await db.update(billingEvents).set({
      errorMessage: err.message,
    }).where(eq(billingEvents.id, claimedId));
    return { handled: false, error: err.message };
  }
}

// Admin DLQ retry: replay the persisted raw event through
// processAddonWebhookEvent. Falls back to "mark resolved" when the original
// row predates raw-payload capture.
export async function retryBillingEvent(eventId: string): Promise<{ ok: boolean; message: string; replayed?: boolean; replayResult?: any }> {
  const [evt] = await db.select().from(billingEvents).where(eq(billingEvents.id, eventId)).limit(1);
  if (!evt) return { ok: false, message: 'Event not found' };
  if (evt.processedAt) return { ok: false, message: 'Event already processed' };

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

  let replayResult: WebhookProcessResult;
  try {
    replayResult = await processAddonWebhookEvent(rawEvent);
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
export async function resyncUserBilling(userId: string): Promise<{
  ok: boolean;
  mode: 'stripe' | 'local';
  message: string;
  scanned?: number;
  reconciled?: number;
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
        const synthetic = {
          id: `resync_${sub.id}_${Date.now()}`,
          type: 'customer.subscription.updated' as const,
          data: { object: { ...sub, metadata: { ...md, userId, user_id: userId, kind: 'addon', type: 'addon' } } },
        };
        const r = await processAddonWebhookEvent(synthetic);
        if (r.handled) reconciledAddons += 1;
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

  await db.insert(billingEvents).values({
    userId, eventType: 'admin_resync',
    metadata: { mode: 'stripe', scanned, reconciledAddons, reconciledPlans },
    processedAt: new Date(),
  });

  return {
    ok: true, mode: 'stripe',
    message: `Resync complete. Scanned ${scanned} Stripe subscription(s); reconciled ${reconciledPlans} plan + ${reconciledAddons} addon record(s).`,
    scanned, reconciled: reconciledPlans + reconciledAddons,
  };
}

export function getBillingMode() {
  return {
    mode: isStripeEnabled() ? 'stripe' : 'local',
    stripeConfigured: !!STRIPE_SECRET_KEY,
    webhookConfigured: !!STRIPE_WEBHOOK_SECRET,
    prices: {
      starter: !!STRIPE_PRICE_MAP.starter,
      pro: !!STRIPE_PRICE_MAP.pro,
      elite: !!STRIPE_PRICE_MAP.elite,
    },
  };
}
