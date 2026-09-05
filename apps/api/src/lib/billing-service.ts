import { db } from '../db.js';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import {
  users, subscriptions, subscriptionPlans, billingEvents, activityFeed,
  modules, addonSubscriptions, tenantApplicationSubscriptions, tenantEntitlements,
  type TenantApplicationSubscriptionRow,
} from '../schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { resolveAppBaseUrl } from './public-url.js';
import {
  getUserPlanConfig, getDowngradeViolations, isUpgrade, isDowngrade, PLAN_CONFIGS,
} from './plans.js';
import {
  COMPANION_MODULE_KEYS,
  COMPANION_MODULE_PRICE_CENTS,
  CORE_PRODUCTS_BY_KEY,
  DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
  MODULE_CATALOG_BY_SLUG,
  normalizeStackSelection,
  isEligibleCompanionModuleKey,
  swapIncludedCompanion,
  type CompanionModuleKey,
  type CoreProductKey,
  type StackSelection,
} from '@operatoros/sdk';
import {
  deactivateSubscriptionEntitlements,
  grantStackEntitlements,
  isCoreProductKey,
  changeFreeCompanionModule,
} from './product-entitlements.js';
import { writeAudit } from './audit.js';

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
  checkout: { sessions: {
    create: (args: unknown, options?: { idempotencyKey?: string }) => Promise<{ id: string; url: string | null }>;
    retrieve: (id: string, args?: unknown) => Promise<any>;
    list: (args: unknown) => Promise<{ data: any[] }>;
  } };
  customers: { create: (args: unknown, options?: { idempotencyKey?: string }) => Promise<{ id: string }> };
  subscriptions: {
    update: (id: string, args: unknown) => Promise<any>;
    retrieve: (id: string, args?: unknown) => Promise<any>;
  };
  billingPortal: {
    sessions: { create: (args: unknown) => Promise<{ url: string }> };
    configurations: { retrieve: (id: string) => Promise<any> };
  };
  webhooks: { constructEvent: (payload: string | Buffer, sig: string, secret: string) => unknown };
  paymentIntents: { retrieve: (id: string) => Promise<any> };
  charges: { retrieve: (id: string) => Promise<any> };
  events: { list: (args: unknown) => Promise<{ data: any[] }> };
  accounts: { retrieve: () => Promise<any> };
  products: {
    list: (args: unknown) => Promise<{ data: any[] }>;
    create: (args: unknown) => Promise<any>;
    retrieve: (id: string) => Promise<any>;
  };
  prices: {
    list: (args: unknown) => Promise<{ data: any[] }>;
    create: (args: unknown) => Promise<any>;
    retrieve: (id: string) => Promise<any>;
  };
};
let __stripeSingleton: StripeClient | null = null;

// ---------------------------------------------------------------------------
// Stripe Configuration
// ---------------------------------------------------------------------------
// To enable Stripe (test sandbox OR live production):
//   1. Set STRIPE_SECRET_KEY in your environment secrets
//      (sk_test_… for the sandbox, sk_live_… for production)
//   2. Set STRIPE_WEBHOOK_SECRET in your environment secrets
//   3. Set stripePriceId on each subscription_plans row (or STRIPE_PRICE_MAP below)
//   4. Set STRIPE_MODE=test (sandbox) or STRIPE_MODE=live (production)
//
// Price ID mapping — fill these in when you create Stripe products:
//   STRIPE_PRICE_STARTER = price_xxx (free tier — no checkout needed)
//   STRIPE_PRICE_PRO     = price_xxx
//   STRIPE_PRICE_ELITE   = price_xxx
// ---------------------------------------------------------------------------

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
// Raw env value (empty string when unset). Stripe is only enabled when this is
// EXPLICITLY 'test' or 'live' — a missing/unknown mode leaves billing disabled.
const STRIPE_MODE = process.env.STRIPE_MODE ?? '';

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
  return !!STRIPE_SECRET_KEY && (STRIPE_MODE === 'test' || STRIPE_MODE === 'live');
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
    __stripeSingleton = new (StripeCtor as StripeFactory)(STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' });
    return __stripeSingleton;
  } catch (err) {
    throw new Error(`Stripe SDK could not be loaded: ${(err as Error)?.message ?? 'unknown'}`);
  }
}

/** Narrow server-only access for the versioned catalog provisioner. */
export function getStripeCatalogClient(): Pick<StripeClient, 'accounts' | 'products' | 'prices'> {
  if (!isStripeEnabled()) {
    throw Object.assign(new Error('Stripe is not configured'), { code: 'STRIPE_NOT_CONFIGURED' });
  }
  return getStripe();
}

/**
 * Narrow server-only Stripe surface used by feature-capacity billing.
 *
 * CallCommand concurrent-call lanes are a quantity on a licensed recurring
 * Price.  Keeping access here makes the existing Stripe singleton, runtime
 * mode gate, and test override the only way feature billing can reach Stripe.
 * It deliberately does not expose webhook verification or arbitrary catalog
 * mutation to module routes.
 */
export function getStripeFeatureBillingClient(): Pick<StripeClient, 'checkout' | 'customers' | 'subscriptions'> {
  if (!isStripeEnabled()) {
    throw Object.assign(new Error('Stripe is not configured'), { code: 'STRIPE_NOT_CONFIGURED' });
  }
  return getStripe();
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

export interface StackCheckoutInput extends StackSelection {
  tenantId: string;
  userId: string;
  interval?: string;
}

export interface PortalSessionResult {
  url: string;
}

export class CommercePolicyError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
    this.name = 'CommercePolicyError';
  }
}

export function legacyPlanSalesClosed(): never {
  throw new CommercePolicyError(
    'LEGACY_PLAN_SALES_CLOSED',
    'Starter, Pro, and Elite are grandfathered plans and are no longer available for new sales. Choose an application stack.',
    409,
  );
}

export function legacyAddonSalesClosed(): never {
  throw new CommercePolicyError(
    'LEGACY_ADDON_SALES_CLOSED',
    'Individual application purchases are grandfathered and closed to new sales. Choose a core application stack and companions.',
    409,
  );
}

const STRIPE_PORTAL_CONFIGURATION_ENV = 'STRIPE_BILLING_PORTAL_CONFIGURATION_ID';

type StackPriceExpectation = {
  role: 'core' | 'companion' | 'seat';
  priceId: string;
  quantity: number;
  unitAmountCents: number;
};

export interface ApplicationStackProviderReadiness {
  envConfigured: boolean;
  providerValidated: boolean;
  priceEnvConfigured: Record<'tradeflowkit' | 'pulsedesk' | 'techdeck' | 'companionModule' | 'additionalSeat', boolean>;
  priceProviderValidated: Record<'tradeflowkit' | 'pulsedesk' | 'techdeck' | 'companionModule' | 'additionalSeat', boolean>;
  portalConfigurationEnvConfigured: boolean;
  portalConfigurationProviderValidated: boolean;
  errors: string[];
}

function configuredStackPriceIds() {
  return {
    tradeflowkit: process.env.STRIPE_PRICE_TRADEFLOWKIT_MONTHLY || '',
    pulsedesk: process.env.STRIPE_PRICE_PULSEDESK_MONTHLY || '',
    techdeck: process.env.STRIPE_PRICE_TECHDECK_MONTHLY || '',
    companionModule: process.env.STRIPE_PRICE_COMPANION_MODULE_MONTHLY || '',
    additionalSeat: process.env.STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY || '',
  };
}

function expectedUnitAmountForPriceKey(
  key: keyof ReturnType<typeof configuredStackPriceIds>,
): number {
  if (key === 'companionModule') return COMPANION_MODULE_PRICE_CENTS;
  if (key === 'additionalSeat') return DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS;
  return CORE_PRODUCTS_BY_KEY[key].monthlyPriceCents;
}

function validateRecurringUsdPrice(
  price: any,
  expectedId: string,
  expectedUnitAmountCents: number,
): string | null {
  if (!price || price.id !== expectedId) return 'PRICE_ID_MISMATCH';
  if (price.active !== true) return 'PRICE_INACTIVE';
  if (String(price.currency ?? '').toLowerCase() !== 'usd') return 'PRICE_CURRENCY_MISMATCH';
  if (price.billing_scheme !== 'per_unit' || price.transform_quantity != null) {
    return 'PRICE_QUANTITY_MODEL_MISMATCH';
  }
  if (price.type !== 'recurring' || price.recurring?.interval !== 'month'
      || price.recurring?.interval_count !== 1
      || price.recurring?.usage_type !== 'licensed') return 'PRICE_RECURRENCE_MISMATCH';
  if (price.unit_amount !== expectedUnitAmountCents) return 'PRICE_AMOUNT_MISMATCH';
  return null;
}

async function validatePriceExpectations(expectations: readonly StackPriceExpectation[]): Promise<void> {
  const priceIds = expectations.map(item => item.priceId);
  if (priceIds.some(id => !id) || new Set(priceIds).size !== priceIds.length) {
    throw new CommercePolicyError(
      'STACK_PRICE_CONFIGURATION_INVALID',
      'Application Stack billing prices are missing or reuse the same Stripe Price.',
      409,
    );
  }
  const stripe = getStripe();
  for (const expectation of expectations) {
    const price = await stripe.prices.retrieve(expectation.priceId);
    const error = validateRecurringUsdPrice(price, expectation.priceId, expectation.unitAmountCents);
    if (error) {
      throw new CommercePolicyError(
        'STACK_PRICE_PROVIDER_MISMATCH',
        `Stripe ${expectation.role} Price failed server-side catalog validation (${error}).`,
        409,
      );
    }
  }
}

function selectionPriceExpectations(
  coreProduct: CoreProductKey,
  additionalModuleCount: number,
  additionalSeats: number,
  stored?: Pick<TenantApplicationSubscriptionRow, 'corePriceId' | 'companionPriceId' | 'additionalSeatPriceId'>,
): StackPriceExpectation[] {
  const configured = configuredStackPriceIds();
  const configuredCore = configured[coreProduct];
  const corePriceId = stored?.corePriceId ?? configuredCore;
  const companionPriceId = stored?.companionPriceId ?? configured.companionModule;
  const seatPriceId = stored?.additionalSeatPriceId ?? configured.additionalSeat;

  if (corePriceId !== configuredCore
      || (additionalModuleCount > 0 && companionPriceId !== configured.companionModule)
      || (additionalSeats > 0 && seatPriceId !== configured.additionalSeat)) {
    throw new CommercePolicyError(
      'STACK_PRICE_CONFIGURATION_CHANGED',
      'The pending checkout no longer matches the server-authoritative Stripe Price configuration.',
      409,
    );
  }

  const expectations: StackPriceExpectation[] = [{
    role: 'core',
    priceId: corePriceId,
    quantity: 1,
    unitAmountCents: CORE_PRODUCTS_BY_KEY[coreProduct].monthlyPriceCents,
  }];
  if (additionalModuleCount > 0) expectations.push({
    role: 'companion',
    priceId: companionPriceId || '',
    quantity: additionalModuleCount,
    unitAmountCents: COMPANION_MODULE_PRICE_CENTS,
  });
  if (additionalSeats > 0) expectations.push({
    role: 'seat',
    priceId: seatPriceId || '',
    quantity: additionalSeats,
    unitAmountCents: DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
  });
  return expectations;
}

async function validatedPortalConfigurationId(): Promise<string> {
  const configurationId = process.env[STRIPE_PORTAL_CONFIGURATION_ENV]?.trim() || '';
  if (!configurationId) {
    throw new CommercePolicyError(
      'STRIPE_PORTAL_CONFIGURATION_REQUIRED',
      `Set ${STRIPE_PORTAL_CONFIGURATION_ENV} to a restrictive Stripe Billing Portal configuration.`,
      409,
    );
  }
  const configuration = await getStripe().billingPortal.configurations.retrieve(configurationId);
  const features = configuration?.features ?? {};
  if (configuration?.id !== configurationId
      || configuration?.active !== true
      || features.subscription_update?.enabled !== false
      || features.subscription_pause?.enabled === true) {
    throw new CommercePolicyError(
      'STRIPE_PORTAL_CONFIGURATION_UNSAFE',
      'The Stripe Billing Portal configuration must be active and must disable subscription item and pause changes.',
      409,
    );
  }
  return configurationId;
}

export async function getApplicationStackProviderReadiness(): Promise<ApplicationStackProviderReadiness> {
  const configured = configuredStackPriceIds();
  const priceKeys = Object.keys(configured) as Array<keyof typeof configured>;
  const priceEnvConfigured = Object.fromEntries(
    priceKeys.map(key => [key, !!configured[key]]),
  ) as ApplicationStackProviderReadiness['priceEnvConfigured'];
  const priceProviderValidated = Object.fromEntries(
    priceKeys.map(key => [key, false]),
  ) as ApplicationStackProviderReadiness['priceProviderValidated'];
  const portalConfigurationEnvConfigured = !!process.env[STRIPE_PORTAL_CONFIGURATION_ENV]?.trim();
  const errors: string[] = [];

  if (isStripeEnabled()) {
    const configuredIds = priceKeys.map(key => configured[key]).filter(Boolean);
    if (configuredIds.length !== priceKeys.length || new Set(configuredIds).size !== configuredIds.length) {
      errors.push('STACK_PRICE_CONFIGURATION_INVALID');
    } else {
      for (const key of priceKeys) {
        try {
          const price = await getStripe().prices.retrieve(configured[key]);
          const error = validateRecurringUsdPrice(price, configured[key], expectedUnitAmountForPriceKey(key));
          if (error) errors.push(`${key}:${error}`);
          else priceProviderValidated[key] = true;
        } catch {
          errors.push(`${key}:PRICE_PROVIDER_UNAVAILABLE`);
        }
      }
    }
  } else {
    errors.push('STRIPE_NOT_CONFIGURED');
  }

  let portalConfigurationProviderValidated = false;
  if (isStripeEnabled() && portalConfigurationEnvConfigured) {
    try {
      await validatedPortalConfigurationId();
      portalConfigurationProviderValidated = true;
    } catch (error) {
      errors.push(error instanceof CommercePolicyError ? error.code : 'PORTAL_PROVIDER_UNAVAILABLE');
    }
  } else if (!portalConfigurationEnvConfigured) {
    errors.push('STRIPE_PORTAL_CONFIGURATION_REQUIRED');
  }

  const providerValidated = Object.values(priceProviderValidated).every(Boolean)
    && portalConfigurationProviderValidated;
  return {
    envConfigured: Object.values(priceEnvConfigured).every(Boolean) && portalConfigurationEnvConfigured,
    providerValidated,
    priceEnvConfigured,
    priceProviderValidated,
    portalConfigurationEnvConfigured,
    portalConfigurationProviderValidated,
    errors,
  };
}

async function findGrandfatheredLegacySubscription(userId: string, tenantId: string) {
  const result = await db.execute(sql`
    SELECT id FROM subscriptions
    WHERE user_id=${userId}
      AND tenant_id=${tenantId}
      AND legacy_access_grandfathered_at IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const id = result.rows[0]?.id;
  if (typeof id !== 'string') return null;
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return row ?? null;
}

async function stripeCustomerHasForeignTenant(customerId: string, tenantId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM tenant_application_subscriptions
      WHERE stripe_customer_id=${customerId}
        AND (tenant_id IS NULL OR tenant_id<>${tenantId})
      UNION ALL
      SELECT 1
      FROM subscriptions
      WHERE stripe_customer_id=${customerId}
        AND legacy_access_grandfathered_at IS NOT NULL
        AND (tenant_id IS NULL OR tenant_id<>${tenantId})
    ) AS foreign_tenant
  `);
  return result.rows[0]?.foreign_tenant === true;
}

export async function subscribeToPlan(
  userId: string,
  tenantId: string,
  planSlug: string,
  interval: BillingInterval = 'month',
): Promise<SubscribeResult> {
  legacyPlanSalesClosed();
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

export async function cancelSubscription(userId: string, tenantId: string): Promise<{ ok: boolean; message: string }> {
  const [stack] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, tenantId)).limit(1);
  if (stack && ['active', 'trialing', 'past_due', 'canceling'].includes(stack.status)) {
    if (!isStripeEnabled() || !stack.stripeSubscriptionId) {
      throw new CommercePolicyError(
        'STACK_PROVIDER_MANAGEMENT_REQUIRED',
        'This paid application stack can only be changed after its Stripe subscription is available.',
        409,
      );
    }
    await getStripe().subscriptions.update(stack.stripeSubscriptionId, { cancel_at_period_end: true });
    await db.update(tenantApplicationSubscriptions).set({
      status: 'canceling', cancelAtPeriodEnd: true, updatedAt: new Date(),
    }).where(eq(tenantApplicationSubscriptions.id, stack.id));
    await db.insert(billingEvents).values({
      userId, tenantId, eventType: 'application_stack_cancel_scheduled',
      metadata: { stripeSubscriptionId: stack.stripeSubscriptionId },
    });
    return { ok: true, message: 'Application stack will cancel at end of billing period' };
  }

  const sub = await findGrandfatheredLegacySubscription(userId, tenantId);
  if (!sub || !['active', 'trialing', 'past_due'].includes(sub.status)) {
    return { ok: false, message: 'No active subscription' };
  }

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

export async function reactivateSubscription(userId: string, tenantId: string): Promise<{ ok: boolean }> {
  const [stack] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, tenantId)).limit(1);
  if (stack?.status === 'canceling') {
    if (!isStripeEnabled() || !stack.stripeSubscriptionId) {
      throw new CommercePolicyError(
        'STACK_PROVIDER_MANAGEMENT_REQUIRED',
        'This paid application stack can only be changed after its Stripe subscription is available.',
        409,
      );
    }
    await getStripe().subscriptions.update(stack.stripeSubscriptionId, { cancel_at_period_end: false });
    const providerSubscription = await retrieveAuthoritativeSubscription(stack.stripeSubscriptionId);
    const providerBinding = await validateAuthoritativeStackSubscription(providerSubscription, stack);
    if (!providerBinding.valid) {
      await quarantineStackSubscription(stack, stack.stripeSubscriptionId, providerBinding.error);
      throw new CommercePolicyError(
        'STACK_SUBSCRIPTION_PROVIDER_MISMATCH',
        'The application stack no longer matches its server-authoritative Stripe catalog and was deactivated.',
        409,
      );
    }
    if (providerSubscription.cancel_at_period_end
        || !['active', 'trialing', 'past_due'].includes(providerSubscription.status)) {
      const providerStatus = mapStripeStatus(providerSubscription.status);
      if (!['active', 'trialing', 'past_due'].includes(providerSubscription.status)) {
        await deactivateSubscriptionEntitlements(stack.stripeSubscriptionId);
      }
      await db.update(tenantApplicationSubscriptions).set({
        status: providerSubscription.cancel_at_period_end ? 'canceling' : providerStatus,
        cancelAtPeriodEnd: !!providerSubscription.cancel_at_period_end,
        currentPeriodStart: stripePeriodDate(providerSubscription.current_period_start) ?? stack.currentPeriodStart,
        currentPeriodEnd: stripePeriodDate(providerSubscription.current_period_end) ?? stack.currentPeriodEnd,
        updatedAt: new Date(),
      }).where(eq(tenantApplicationSubscriptions.id, stack.id));
      throw new CommercePolicyError(
        'STACK_REACTIVATION_NOT_CONFIRMED',
        'Stripe did not confirm an uncancelled, access-bearing application stack.',
        409,
      );
    }
    await db.update(tenantApplicationSubscriptions).set({
      status: providerSubscription.status,
      cancelAtPeriodEnd: false,
      currentPeriodStart: stripePeriodDate(providerSubscription.current_period_start) ?? stack.currentPeriodStart,
      currentPeriodEnd: stripePeriodDate(providerSubscription.current_period_end) ?? stack.currentPeriodEnd,
      updatedAt: new Date(),
    }).where(eq(tenantApplicationSubscriptions.id, stack.id));
    await db.insert(billingEvents).values({
      userId, tenantId, eventType: 'application_stack_reactivated',
      metadata: { stripeSubscriptionId: stack.stripeSubscriptionId },
    });
    return { ok: true };
  }

  const sub = await findGrandfatheredLegacySubscription(userId, tenantId);
  if (!sub || !['active', 'trialing'].includes(sub.status) || !sub.cancelAtPeriodEnd) {
    return { ok: false };
  }

  const production = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (production && (!isStripeEnabled() || !sub.stripeSubscriptionId)) {
    throw new CommercePolicyError(
      'LEGACY_PROVIDER_MANAGEMENT_REQUIRED',
      'This grandfathered cancellation can only be reversed through its billing provider. Terminal contracts must start a new application stack.',
      409,
    );
  }

  let confirmedProviderStatus: 'active' | 'trialing' | null = null;
  if (isStripeEnabled() && sub.stripeSubscriptionId) {
    const stripe = getStripe();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    const providerSubscription = await retrieveAuthoritativeSubscription(sub.stripeSubscriptionId);
    const providerStatus = mapStripeStatus(providerSubscription.status);
    const providerCustomerId = stripeResourceId(providerSubscription.customer);
    const providerConfirmed = ['active', 'trialing'].includes(providerSubscription.status)
      && providerSubscription.cancel_at_period_end === false
      && (!sub.stripeCustomerId || providerCustomerId === sub.stripeCustomerId);
    if (!providerConfirmed) {
      await db.update(subscriptions).set({
        status: providerStatus,
        cancelAtPeriodEnd: !!providerSubscription.cancel_at_period_end,
        currentPeriodStart: stripePeriodDate(providerSubscription.current_period_start) ?? sub.currentPeriodStart,
        currentPeriodEnd: stripePeriodDate(providerSubscription.current_period_end) ?? sub.currentPeriodEnd,
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));
      throw new CommercePolicyError(
        'LEGACY_REACTIVATION_NOT_CONFIRMED',
        'Stripe did not confirm an uncancelled, access-bearing grandfathered subscription.',
        409,
      );
    }
    confirmedProviderStatus = providerStatus as 'active' | 'trialing';
  }

  await db.update(subscriptions).set({
    cancelAtPeriodEnd: false,
    status: confirmedProviderStatus ?? 'active',
    updatedAt: new Date(),
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
  legacyPlanSalesClosed();
  if (!isStripeEnabled()) {
    throw new Error('Stripe is not enabled. Set STRIPE_SECRET_KEY and STRIPE_MODE (test or live).');
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

  const appUrl = resolveAppBaseUrl();

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

export async function createStackCheckoutSession(
  input: StackCheckoutInput,
): Promise<CheckoutSessionResult> {
  if (input.interval && input.interval !== 'month') {
    throw new CommercePolicyError(
      'APPLICATION_STACK_MONTHLY_ONLY',
      'Application stacks are available with monthly billing only.',
      400,
    );
  }
  if (!isStripeEnabled()) {
    throw new Error('Stripe is not enabled. Set STRIPE_SECRET_KEY and STRIPE_MODE (test or live).');
  }

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new Error('User not found');

  let normalized = normalizeStackSelection(input);
  const [existingStack] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, input.tenantId))
    .limit(1);
  const stripe = getStripe();
  let retryPendingWithoutSession = false;
  let existingStatusForClaim = existingStack?.status;
  if (existingStack?.status === 'incomplete') {
    if (!existingStack.stripeCheckoutSessionId) {
      if (!isCoreProductKey(existingStack.coreProduct)
          || !isEligibleCompanionModuleKey(existingStack.includedCompanionKey)) {
        throw new CommercePolicyError(
          'STACK_CHECKOUT_INTENT_INVALID',
          'The pending application stack intent is invalid and requires billing support.',
          409,
        );
      }
      const pendingAdditional = existingStack.additionalModuleKeys.filter(isEligibleCompanionModuleKey);
      normalized = normalizeStackSelection({
        coreProduct: existingStack.coreProduct,
        freeCompanionModule: existingStack.includedCompanionKey,
        additionalModules: pendingAdditional,
        additionalSeats: existingStack.additionalSeats,
      });
      const storedModules = [...existingStack.additionalModuleKeys].sort();
      const normalizedModules = [...(normalized.additionalModules ?? [])].sort();
      if (JSON.stringify(storedModules) !== JSON.stringify(normalizedModules)) {
        throw new CommercePolicyError(
          'STACK_CHECKOUT_INTENT_INVALID',
          'The pending application stack intent is invalid and requires billing support.',
          409,
        );
      }
      retryPendingWithoutSession = true;
    } else {
      try {
        const prior = await stripe.checkout.sessions.retrieve(existingStack.stripeCheckoutSessionId);
        if (prior.status === 'open' && prior.url) {
          return { url: prior.url, sessionId: prior.id };
        }
        if (prior.status === 'open') {
          throw new CommercePolicyError(
            'STRIPE_CHECKOUT_UNAVAILABLE',
            'Stripe Checkout is open but did not return a redirect URL. Retry to reconcile it.',
            502,
          );
        }
        if (prior.status === 'expired') {
          const [expired] = await db.update(tenantApplicationSubscriptions)
            .set({ status: 'checkout_failed', updatedAt: new Date() })
            .where(and(
              eq(tenantApplicationSubscriptions.id, existingStack.id),
              eq(tenantApplicationSubscriptions.status, 'incomplete'),
            ))
            .returning({ id: tenantApplicationSubscriptions.id });
          if (!expired) {
            throw new CommercePolicyError(
              'STACK_CHECKOUT_IN_PROGRESS',
              'Another checkout request already reconciled this application stack intent.',
              409,
            );
          }
          existingStatusForClaim = 'checkout_failed';
        } else {
          throw new CommercePolicyError(
            'STACK_FLAGSHIP_LIMIT',
            'This tenant already has a completed or settling application stack checkout.',
            409,
          );
        }
      } catch (error) {
        if (error instanceof CommercePolicyError) throw error;
        throw new CommercePolicyError(
          'STACK_CHECKOUT_IN_PROGRESS',
          'The existing application stack checkout could not be reconciled. Retry after it expires or use billing support.',
          409,
        );
      }
    }
  }

  const product = CORE_PRODUCTS_BY_KEY[normalized.coreProduct];
  const corePriceId = retryPendingWithoutSession
    ? existingStack!.corePriceId
    : process.env[product.stripePriceEnvKey] || '';
  const companionPriceId = retryPendingWithoutSession
    ? existingStack!.companionPriceId || ''
    : process.env.STRIPE_PRICE_COMPANION_MODULE_MONTHLY || '';
  const seatPriceId = retryPendingWithoutSession
    ? existingStack!.additionalSeatPriceId || ''
    : process.env.STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY || '';

  if (!corePriceId) throw new Error(`Set ${product.stripePriceEnvKey}`);
  if ((normalized.additionalModules?.length ?? 0) > 0 && !companionPriceId) {
    throw new Error('Set STRIPE_PRICE_COMPANION_MODULE_MONTHLY');
  }
  if ((normalized.additionalSeats ?? 0) > 0 && !seatPriceId) {
    throw new Error('Set STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY');
  }
  await validatePriceExpectations(selectionPriceExpectations(
    normalized.coreProduct,
    normalized.additionalModules?.length ?? 0,
    normalized.additionalSeats ?? 0,
    retryPendingWithoutSession || existingStack
      ? {
          corePriceId,
          companionPriceId: companionPriceId || null,
          additionalSeatPriceId: seatPriceId || null,
        }
      : undefined,
  ));
  const blockingStatuses = new Set(['trialing', 'active', 'past_due', 'canceling']);
  if (existingStack && blockingStatuses.has(existingStack.status)) {
    throw new CommercePolicyError(
      'STACK_FLAGSHIP_LIMIT',
      'This tenant already has an application stack or a checkout in progress. Manage that stack in billing.',
      409,
    );
  }
  if (existingStack?.stripeSubscriptionId) {
    let priorProviderSubscription: any;
    try {
      priorProviderSubscription = await retrieveAuthoritativeSubscription(existingStack.stripeSubscriptionId);
    } catch {
      throw new CommercePolicyError(
        'STACK_PROVIDER_MANAGEMENT_REQUIRED',
        'The prior Stripe subscription could not be confirmed terminal. Billing support must reconcile it before another checkout.',
        409,
      );
    }
    const priorProviderStatus = mapStripeStatus(priorProviderSubscription.status);
    if (!['canceled', 'expired'].includes(priorProviderStatus)) {
      throw new CommercePolicyError(
        'STACK_PROVIDER_SUBSCRIPTION_EXISTS',
        'A Stripe subscription is still attached to this tenant. Cancel or reconcile it before starting another checkout.',
        409,
      );
    }
  }
  const [activeCore] = await db.select({ id: tenantEntitlements.id })
    .from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.tenantId, input.tenantId),
      eq(tenantEntitlements.entitlementType, 'core_product'),
      eq(tenantEntitlements.active, true),
    ))
    .limit(1);
  if (activeCore) {
    throw new CommercePolicyError(
      'STACK_FLAGSHIP_LIMIT',
      'This tenant already has its release flagship application.',
      409,
    );
  }

  const legacyCustomerResult = await db.execute(sql`
    SELECT stripe_customer_id
    FROM subscriptions
    WHERE user_id=${input.userId}
      AND tenant_id=${input.tenantId}
      AND legacy_access_grandfathered_at IS NOT NULL
      AND stripe_customer_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const legacyCustomerId = legacyCustomerResult.rows[0]?.stripe_customer_id;
  let reusableLegacyCustomerId = typeof legacyCustomerId === 'string' ? legacyCustomerId : undefined;
  if (reusableLegacyCustomerId) {
    if (await stripeCustomerHasForeignTenant(reusableLegacyCustomerId, input.tenantId)) {
      reusableLegacyCustomerId = undefined;
    }
  }
  let customerId = existingStack?.stripeCustomerId
    || reusableLegacyCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: input.userId, tenantId: input.tenantId },
    }, { idempotencyKey: `operatoros-stack-customer-${input.tenantId}` });
    customerId = customer.id;
  }
  if (!customerId) throw new Error('Stripe customer creation did not return a customer id');
  if (await stripeCustomerHasForeignTenant(customerId, input.tenantId)) {
    throw new CommercePolicyError(
      'STRIPE_CUSTOMER_TENANT_AMBIGUOUS',
      'The selected Stripe customer is already associated with another tenant. Billing support must separate the customer before checkout.',
      409,
    );
  }
  const tenantCustomerId = customerId;

  const pendingValues = {
    initiatedByUserId: input.userId,
    coreProduct: normalized.coreProduct,
    includedCompanionKey: normalized.freeCompanionModule,
    additionalModuleKeys: [...(normalized.additionalModules ?? [])],
    additionalSeats: normalized.additionalSeats ?? 0,
    status: 'incomplete' as const,
    stripeCustomerId: tenantCustomerId,
    stripeCheckoutSessionId: null,
    stripeSubscriptionId: null,
    corePriceId,
    companionPriceId: companionPriceId || null,
    additionalSeatPriceId: seatPriceId || null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    metadata: {
      billing_model: 'core_product_stack',
      billing_interval: 'month',
      checkout_attempt_id: crypto.randomUUID(),
    },
    updatedAt: new Date(),
  };
  const [pending] = retryPendingWithoutSession
      ? [existingStack!]
    : existingStack
      ? await db.update(tenantApplicationSubscriptions)
          .set(pendingValues)
          .where(and(
            eq(tenantApplicationSubscriptions.id, existingStack.id),
            eq(tenantApplicationSubscriptions.status, existingStatusForClaim!),
          ))
          .returning()
      : await db.insert(tenantApplicationSubscriptions)
          .values({ tenantId: input.tenantId, ...pendingValues })
          .onConflictDoNothing({ target: tenantApplicationSubscriptions.tenantId })
          .returning();
  if (!pending) {
    throw new CommercePolicyError(
      'STACK_FLAGSHIP_LIMIT',
      'This tenant already has an application stack or a checkout in progress.',
      409,
    );
  }

  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: corePriceId, quantity: 1 },
  ];
  if (normalized.additionalModules?.length) {
    lineItems.push({ price: companionPriceId, quantity: normalized.additionalModules.length });
  }
  if ((normalized.additionalSeats ?? 0) > 0) {
    lineItems.push({ price: seatPriceId, quantity: normalized.additionalSeats! });
  }

  const pendingMetadata = (pending.metadata ?? {}) as Record<string, unknown>;
  const checkoutAttemptId = typeof pendingMetadata.checkout_attempt_id === 'string'
    && pendingMetadata.checkout_attempt_id.length > 0
    ? pendingMetadata.checkout_attempt_id
    : pending.id;
  const metadata = {
    billing_model: 'core_product_stack',
    tenant_id: input.tenantId,
    user_id: pending.initiatedByUserId ?? input.userId,
    selected_core_product: normalized.coreProduct,
    selected_free_companion_module: normalized.freeCompanionModule,
    additional_module_keys: (normalized.additionalModules ?? []).join(','),
    additional_seats: String(normalized.additionalSeats ?? 0),
    internal_application_subscription_id: pending.id,
    checkout_attempt_id: checkoutAttemptId,
    billing_interval: 'month',
  };
  const appUrl = resolveAppBaseUrl();
  let session: { id: string; url: string | null };
  try {
    session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${appUrl}/pricing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?billing=canceled`,
      metadata,
      subscription_data: { metadata },
    }, { idempotencyKey: `operatoros-stack-checkout-${checkoutAttemptId}` });
  } catch (error) {
    // Keep the exact pending intent. A network failure can occur after Stripe
    // created the Session; the next request safely replays this idempotency key.
    throw error;
  }

  if (!session || typeof session.id !== 'string' || session.id.length === 0) {
    await db.update(tenantApplicationSubscriptions)
      .set({ status: 'checkout_failed', updatedAt: new Date() })
      .where(eq(tenantApplicationSubscriptions.id, pending.id));
    throw new CommercePolicyError(
      'STRIPE_CHECKOUT_INVALID_RESPONSE',
      'Stripe did not return a valid Checkout Session.',
      502,
    );
  }

  await db.update(tenantApplicationSubscriptions)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(eq(tenantApplicationSubscriptions.id, pending.id));

  if (typeof session.url !== 'string' || session.url.length === 0) {
    throw new CommercePolicyError(
      'STRIPE_CHECKOUT_UNAVAILABLE',
      'Stripe created the Checkout Session but did not return a redirect URL. Retry to reconcile it.',
      502,
    );
  }
  return { url: session.url, sessionId: session.id };
}

export async function changeStackFreeCompanion(
  tenantId: string,
  moduleKey: string,
): Promise<void> {
  if (!isEligibleCompanionModuleKey(moduleKey)) {
    throw new CommercePolicyError('FREE_COMPANION_INVALID', `Unknown companion module: ${moduleKey}`, 400);
  }
  const [stack] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, tenantId)).limit(1);
  if (!stack || !stack.stripeSubscriptionId || !['active', 'trialing', 'past_due', 'canceling'].includes(stack.status)) {
    throw new CommercePolicyError(
      'APPLICATION_STACK_NOT_ACTIVE',
      'An active application stack is required to change the included companion.',
      409,
    );
  }
  if (!isStripeEnabled()) {
    throw new CommercePolicyError('STRIPE_NOT_CONFIGURED', 'Stripe is required to update this application stack.', 409);
  }

  if (stack.includedCompanionKey === moduleKey) return;
  const currentIncluded = stack.includedCompanionKey as CompanionModuleKey;
  const currentAdditional = stack.additionalModuleKeys.filter(isEligibleCompanionModuleKey);
  const nextAdditionalModules = swapIncludedCompanion(currentIncluded, currentAdditional, moduleKey);

  const currentProviderSubscription = await retrieveAuthoritativeSubscription(stack.stripeSubscriptionId);
  const currentProviderBinding = await validateAuthoritativeStackSubscription(currentProviderSubscription, stack);
  if (!currentProviderBinding.valid) {
    await quarantineStackSubscription(stack, stack.stripeSubscriptionId, currentProviderBinding.error);
    throw new CommercePolicyError(
      'STACK_SUBSCRIPTION_PROVIDER_MISMATCH',
      'The application stack no longer matches its server-authoritative Stripe catalog and was deactivated.',
      409,
    );
  }

  const metadata = {
    billing_model: 'core_product_stack',
    tenant_id: stack.tenantId,
    user_id: stack.initiatedByUserId ?? '',
    selected_core_product: stack.coreProduct,
    selected_free_companion_module: moduleKey,
    additional_module_keys: nextAdditionalModules.join(','),
    additional_seats: String(stack.additionalSeats),
    internal_application_subscription_id: stack.id,
    checkout_attempt_id: stackCheckoutAttemptId(stack),
    billing_interval: 'month',
  };
  // Provider first: a provider failure leaves local access unchanged. If the
  // local transaction then fails, the signed subscription.updated event uses
  // this same metadata to reconcile the tenant-owned row and entitlement.
  await getStripe().subscriptions.update(stack.stripeSubscriptionId, { metadata });
  const updatedProviderSubscription = await retrieveAuthoritativeSubscription(stack.stripeSubscriptionId);
  const updatedProviderBinding = await validateAuthoritativeStackSubscription(updatedProviderSubscription, stack);
  if (!updatedProviderBinding.valid
      || updatedProviderBinding.includedCompanion !== moduleKey
      || JSON.stringify([...updatedProviderBinding.additionalModules].sort())
        !== JSON.stringify([...nextAdditionalModules].sort())) {
    await quarantineStackSubscription(
      stack,
      stack.stripeSubscriptionId,
      updatedProviderBinding.valid
        ? 'Application Stack provider did not confirm the requested companion selection'
        : updatedProviderBinding.error,
    );
    throw new CommercePolicyError(
      'STACK_SUBSCRIPTION_PROVIDER_MISMATCH',
      'Stripe did not confirm the requested companion selection and the application stack was deactivated.',
      409,
    );
  }
  await changeFreeCompanionModule(tenantId, moduleKey, nextAdditionalModules);
}

export interface UsageCreditCheckoutInput {
  purchaseId: string;
  tenantId: string;
  userId: string;
  moduleId: string;
  packageKey: string;
  packageName: string;
  priceId: string;
  productId: string;
  stripeAccountId: string;
  diagnosticSessionId: string;
  catalogVersion: string;
  environment: 'test' | 'live';
  units: number;
  amountMinor: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * OperatorOS-owned one-time usage-credit checkout. The caller supplies only a
 * server-resolved package snapshot and canonical return URLs; no client amount,
 * units, tenant, user, or payment-success assertion reaches Stripe.
 */
export async function createUsageCreditCheckoutSession(
  input: UsageCreditCheckoutInput,
): Promise<CheckoutSessionResult> {
  if (!isStripeEnabled()) {
    throw Object.assign(new Error('Stripe checkout is not configured'), {
      code: 'STRIPE_NOT_CONFIGURED',
    });
  }
  if (
    !Number.isSafeInteger(input.units) ||
    input.units <= 0 ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    !/^[A-Z]{3}$/.test(input.currency) || !/^price_[A-Za-z0-9_]+$/.test(input.priceId)
  ) {
    throw Object.assign(new Error('Usage-credit package snapshot is invalid'), {
      code: 'USAGE_CREDIT_PACKAGE_INVALID',
    });
  }
  const metadata = {
    operatoros_kind: 'torque_assist_credit',
    purchase_id: input.purchaseId,
    tenant_id: input.tenantId,
    user_id: input.userId,
    module_id: input.moduleId,
    module_slug: 'torqueshed',
    diagnostic_session_id: input.diagnosticSessionId,
    package_key: input.packageKey,
    units: String(input.units),
    catalog_version: input.catalogVersion,
    environment: input.environment,
    operatoros_source: 'server_authoritative_catalog',
    stripe_account_id: input.stripeAccountId,
    provider_product_id: input.productId,
    provider_price_id: input.priceId,
  };
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price: input.priceId,
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    payment_intent_data: { metadata },
  });
  if (!session.id || !session.url) {
    throw Object.assign(new Error('Stripe did not return a checkout URL'), {
      code: 'STRIPE_CHECKOUT_INVALID',
    });
  }
  return { url: session.url, sessionId: session.id };
}

export async function createPortalSession(userId: string, tenantId: string): Promise<PortalSessionResult> {
  if (!isStripeEnabled()) {
    throw new Error('Stripe is not enabled. Set STRIPE_SECRET_KEY and STRIPE_MODE (test or live).');
  }

  const stripe = getStripe();
  const [stack] = await db.select().from(tenantApplicationSubscriptions)
    .where(and(
      eq(tenantApplicationSubscriptions.tenantId, tenantId),
      sql`${tenantApplicationSubscriptions.status} IN ('trialing','active','past_due','canceling')`,
    )).limit(1);
  const legacyCandidate = stack ? null : await findGrandfatheredLegacySubscription(userId, tenantId);
  const legacy = legacyCandidate && ['active', 'trialing', 'past_due'].includes(legacyCandidate.status)
    ? legacyCandidate
    : null;
  const customerId = stack?.stripeCustomerId || legacy?.stripeCustomerId;

  if (!customerId) {
    throw new Error('No Stripe customer found for this tenant. Start an application stack first.');
  }
  if (await stripeCustomerHasForeignTenant(customerId, tenantId)) {
    throw new CommercePolicyError(
      'STRIPE_CUSTOMER_TENANT_AMBIGUOUS',
      'This Stripe customer is associated with more than one tenant. Billing support must separate it before the portal can be opened.',
      409,
    );
  }

  const appUrl = resolveAppBaseUrl();
  const configurationId = await validatedPortalConfigurationId();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/pricing`,
    configuration: configurationId,
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

function stripeId(value: unknown, prefix: string): string | null {
  const id = typeof value === 'string' ? value : value && typeof value === 'object' && 'id' in value
    ? String((value as { id: unknown }).id)
    : '';
  return id.startsWith(prefix) ? id : null;
}

/**
 * Resolve signed payment metadata for event families such as refunds and
 * disputes whose event object does not echo Checkout Session metadata. The
 * provider reads are scoped to already signature-verified events.
 */
export async function resolveStripePaymentMetadata(event: {
  type: string;
  data: { object: Record<string, any> };
}) {
  const object = event.data?.object ?? {};
  if (object.metadata?.operatoros_kind === 'torque_assist_credit') {
    return {
      metadata: object.metadata as Record<string, string>,
      paymentIntentId: stripeId(object.payment_intent ?? object.id, 'pi_'),
      chargeId: stripeId(object.charge ?? object.id, 'ch_'),
    };
  }
  let chargeId = stripeId(object.charge ?? object.id, 'ch_');
  let paymentIntentId = stripeId(object.payment_intent ?? object.id, 'pi_');
  if (!paymentIntentId && chargeId) {
    const charge = await getStripe().charges.retrieve(chargeId);
    paymentIntentId = stripeId(charge.payment_intent, 'pi_');
  }
  if (!paymentIntentId) return { metadata: {}, paymentIntentId: null, chargeId };
  const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
  chargeId ||= stripeId(paymentIntent.latest_charge, 'ch_');
  return {
    metadata: paymentIntent.metadata && typeof paymentIntent.metadata === 'object'
      ? paymentIntent.metadata as Record<string, string>
      : {},
    paymentIntentId,
    chargeId,
  };
}

/**
 * Retrieve the actual Checkout line item and account before a v50+ credit
 * grant. Metadata establishes OperatorOS scope; this evidence proves that the
 * provider Session charged the snapshotted durable Product and Price.
 */
export async function retrieveTorqueStripeCheckoutEvidence(checkoutSessionId: string) {
  if (!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(checkoutSessionId)) {
    throw Object.assign(new Error('Checkout Session id is invalid'), {
      code: 'TORQUE_PAYMENT_CHECKOUT_INVALID',
    });
  }
  if (!isStripeEnabled()) {
    throw Object.assign(new Error('Stripe settlement evidence is unavailable'), {
      code: 'STRIPE_NOT_CONFIGURED',
    });
  }
  const stripe = getStripe();
  const [account, session, lineItems] = await Promise.all([
    stripe.accounts.retrieve(),
    stripe.checkout.sessions.retrieve(checkoutSessionId),
    stripe.checkout.sessions.listLineItems(checkoutSessionId, {
      limit: 10,
      expand: ['data.price.product'],
    }),
  ]);
  const item = lineItems.data[0] as any;
  const price = item?.price as any;
  const product = price?.product;
  return {
    accountId: String(account.id || ''),
    checkoutSessionId: String(session.id || ''),
    paymentIntentId: stripeId(session.payment_intent, 'pi_') || '',
    lineItemCount: lineItems.data.length,
    quantity: Number(item?.quantity ?? 0),
    priceId: String(price?.id || ''),
    productId: typeof product === 'string' ? product : String(product?.id || ''),
    amountMinor: Number(session.amount_total || 0),
    currency: String(session.currency || '').toUpperCase(),
    paymentStatus: String(session.payment_status || ''),
    checkoutMode: String(session.mode || ''),
  };
}

const TORQUE_STRIPE_EVENT_TYPES = Object.freeze([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
]);

/** Read-only, redacted provider truth used by the guarded reconciliation CLI. */
export async function retrieveTorqueStripeReconciliationSnapshot(paymentIntentId: string) {
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    throw Object.assign(new Error('PaymentIntent id is invalid'), { code: 'TORQUE_RECONCILE_PAYMENT_INTENT_INVALID' });
  }
  if (!isStripeEnabled()) {
    throw Object.assign(new Error('Stripe read access is unavailable'), { code: 'STRIPE_NOT_CONFIGURED' });
  }
  const stripe = getStripe();
  const [account, paymentIntent, sessions] = await Promise.all([
    stripe.accounts.retrieve(),
    stripe.paymentIntents.retrieve(paymentIntentId),
    stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 10 }),
  ]);
  const session = sessions.data.find((candidate: any) => candidate.payment_intent === paymentIntentId)
    ?? sessions.data[0]
    ?? null;
  const latestChargeId = stripeId(paymentIntent.latest_charge, 'ch_');
  const charge = latestChargeId ? await stripe.charges.retrieve(latestChargeId) : null;
  const created = Number(paymentIntent.created || 0);
  const eventPages = await Promise.all(
    TORQUE_STRIPE_EVENT_TYPES.map((type) => stripe.events.list({
      type,
      created: created ? { gte: Math.max(0, created - 86_400) } : undefined,
      limit: 100,
    })),
  );
  const events = eventPages
    .flatMap((page) => page.data)
    .filter((event) => {
      const object = event.data?.object ?? {};
      return object.id === paymentIntentId
        || object.id === session?.id
        || object.id === latestChargeId
        || object.payment_intent === paymentIntentId
        || object.charge === latestChargeId;
    })
    .map((event) => ({
      id: String(event.id),
      type: String(event.type),
      created: Number(event.created || 0),
      livemode: event.livemode === true,
    }))
    .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  const safeMetadata = (value: unknown) => value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([key]) => [
          'operatoros_kind', 'purchase_id', 'tenant_id', 'user_id', 'module_id',
          'module_slug', 'diagnostic_session_id', 'package_key', 'units',
          'catalog_version', 'environment', 'operatoros_source',
          'stripe_account_id', 'provider_product_id', 'provider_price_id',
        ].includes(key))
        .map(([key, metadataValue]) => [key, String(metadataValue)]))
    : {};
  return {
    account: { id: String(account.id || ''), livemode: paymentIntent.livemode === true },
    paymentIntent: {
      id: String(paymentIntent.id), livemode: paymentIntent.livemode === true,
      status: String(paymentIntent.status || ''), amount: Number(paymentIntent.amount || 0),
      amountReceived: Number(paymentIntent.amount_received || 0),
      currency: String(paymentIntent.currency || '').toLowerCase(), created,
      latestChargeId, metadata: safeMetadata(paymentIntent.metadata),
    },
    checkoutSession: session ? {
      id: String(session.id), livemode: session.livemode === true, mode: String(session.mode || ''),
      paymentStatus: String(session.payment_status || ''), status: String(session.status || ''),
      amountTotal: Number(session.amount_total || 0), currency: String(session.currency || '').toLowerCase(),
      paymentIntentId: stripeId(session.payment_intent, 'pi_'), metadata: safeMetadata(session.metadata),
      lineItems: (await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 10,
        expand: ['data.price.product'],
      })).data.map((item: any) => ({
        quantity: Number(item.quantity || 0),
        priceId: String(item.price?.id || ''),
        productId: typeof item.price?.product === 'string'
          ? item.price.product
          : String(item.price?.product?.id || ''),
      })),
    } : null,
    charge: charge ? {
      id: String(charge.id), amountRefunded: Number(charge.amount_refunded || 0),
      refunded: charge.refunded === true, disputed: charge.disputed === true,
      paymentIntentId: stripeId(charge.payment_intent, 'pi_'),
    } : null,
    events,
  };
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
  /** Quantity-based feature add-ons share the canonical Stripe receipt and
   *  webhook endpoint, but are settled by their feature-specific handler
   *  rather than by the module add-on subscription table. */
  isFeatureAddon: boolean;
  featureKey: string | null;
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
    const isFeatureAddon = md.type === 'feature_addon' || md.kind === 'feature_addon';
    const isAddon = isFeatureAddon || md.type === 'addon' || md.kind === 'addon';
    if (isAddon) {
      return {
        isAddon: true,
        isFeatureAddon,
        featureKey: isFeatureAddon ? String(md.feature ?? md.entitlement ?? '') || null : null,
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
    isFeatureAddon: false,
    featureKey: null,
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
const STRIPE_EVENT_PROCESSING_LEASE_MS = 5 * 60 * 1000;

function stripeEventLeaseMetadata(now = new Date()) {
  return {
    processingState: 'processing',
    processingStartedAt: now.toISOString(),
    processingLeaseExpiresAt: new Date(now.getTime() + STRIPE_EVENT_PROCESSING_LEASE_MS).toISOString(),
  };
}

export async function claimStripeEvent(
  event: { id: string; type: string; data: { object: any } },
  classification: WebhookClassification,
): Promise<{
  claimedRowId: string | null;
  isDuplicate: boolean;
  duplicateState?: 'processed' | 'in_flight' | 'payload_mismatch';
}> {
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
  let userId: string | null = null;
  if (typeof classification.userId === 'string' && classification.userId.length > 0) {
    // Signed provider metadata is a lookup hint, not foreign-key authority.
    // A deleted or mistyped user must not prevent durable event capture.
    const [attributedUser] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.id, classification.userId))
      .limit(1);
    userId = attributedUser?.id ?? null;
  }
  const eventTypeLabel = `${classification.isAddon ? 'addon' : 'plan'}_${event.type.replace(/\./g, '_')}`;
  const lease = stripeEventLeaseMetadata();

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
      ...lease,
    },
  }).onConflictDoNothing({
    target: billingEvents.stripeEventId,
    where: sql`stripe_event_id IS NOT NULL`,
  }).returning({ id: billingEvents.id });

  if (claim.length === 0) {
    // A failed delivery keeps the same immutable Stripe event identity and is
    // atomically reclaimable. An in-flight delivery can only be reclaimed
    // after its bounded lease expires, preventing live/admin double dispatch.
    const reclaimed = await db.execute(sql`
      UPDATE billing_events
      SET error_message=NULL,
          retry_count=retry_count+1,
          metadata=COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(lease)}::jsonb
      WHERE stripe_event_id=${event.id}
        AND processed_at IS NULL
        AND payload_hash=${payloadHash}
        AND (
          error_message IS NOT NULL
          OR COALESCE(
            NULLIF(metadata->>'processingLeaseExpiresAt','')::timestamptz,
            '-infinity'::timestamptz
          ) <= NOW()
        )
      RETURNING id
    `);
    const reclaimedId = reclaimed.rows[0]?.id;
    if (typeof reclaimedId === 'string') {
      return { claimedRowId: reclaimedId, isDuplicate: false };
    }
    const [existing] = await db.select({
      payloadHash: billingEvents.payloadHash,
      processedAt: billingEvents.processedAt,
    }).from(billingEvents).where(eq(billingEvents.stripeEventId, event.id)).limit(1);
    return {
      claimedRowId: null,
      isDuplicate: true,
      duplicateState: existing?.payloadHash !== payloadHash
        ? 'payload_mismatch'
        : existing?.processedAt
          ? 'processed'
          : 'in_flight',
    };
  }
  return { claimedRowId: claim[0].id, isDuplicate: false };
}

/**
 * Record canonical Torque routing in the existing billing event ledger. An old
 * plan-classified claim is explicitly reclassified instead of suppressing the
 * shared Torque receipt. No payment method or client secret is added here.
 */
export async function recordTorqueStripeEventDispatch(input: {
  event: Record<string, any> & { id: string; type: string };
  tenantId: string;
  userId: string;
  purchaseId: string;
  receiptId?: string | null;
  status: string;
  errorCode?: string | null;
}) {
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(input.event)).digest('hex');
  const safeMetadata = {
    mode: 'stripe', kind: 'torque_assist_credit', purchaseId: input.purchaseId,
    sharedReceiptId: input.receiptId ?? null, canonicalWebhook: '/v1/billing/webhook',
    settlementStatus: input.status, reclassifiedAt: new Date().toISOString(),
  };
  await db.execute(sql`
    INSERT INTO billing_events (
      user_id,tenant_id,event_type,stripe_event_id,payload_hash,metadata,processed_at,error_message
    ) VALUES (
      ${input.userId},${input.tenantId},${`torque_${input.event.type.replaceAll('.', '_')}`},
      ${input.event.id},${payloadHash},${safeMetadata},
      ${input.status === 'processed' ? new Date() : null},${input.errorCode ?? null}
    )
    ON CONFLICT (stripe_event_id) WHERE stripe_event_id IS NOT NULL DO UPDATE SET
      user_id=COALESCE(billing_events.user_id,EXCLUDED.user_id),
      tenant_id=COALESCE(billing_events.tenant_id,EXCLUDED.tenant_id),
      event_type=EXCLUDED.event_type,payload_hash=EXCLUDED.payload_hash,
      metadata=COALESCE(billing_events.metadata,'{}'::jsonb)||EXCLUDED.metadata,
      processed_at=EXCLUDED.processed_at,error_message=EXCLUDED.error_message
  `);
}

export async function markStripeEventProcessed(claimedRowId: string, action: string | undefined) {
  await db.update(billingEvents).set({
    processedAt: new Date(),
    errorMessage: null,
    metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      lastAction: action ?? 'handled',
      processingState: 'processed',
      processingLeaseExpiresAt: null,
    })}::jsonb`,
  }).where(and(eq(billingEvents.id, claimedRowId), sql`${billingEvents.processedAt} IS NULL`));
}

export async function markStripeEventFailed(claimedRowId: string, errorMessage: string) {
  await db.update(billingEvents).set({
    errorMessage,
    metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      lastFailureAt: new Date().toISOString(),
      processingState: 'failed',
      processingLeaseExpiresAt: null,
    })}::jsonb`,
  }).where(and(eq(billingEvents.id, claimedRowId), sql`${billingEvents.processedAt} IS NULL`));
}

export async function processWebhookEvent(event: { type: string; data: { object: any } }): Promise<WebhookProcessResult> {
  const { type, data } = event;
  const obj = data.object;

  console.log(`[billing-service] Processing webhook: ${type}`);

  let result: WebhookProcessResult;
  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      result = await handleCheckoutCompleted(obj); break;
    case 'customer.subscription.created':
      result = await handleSubscriptionCreated(obj); break;
    case 'customer.subscription.updated':
      result = await handleSubscriptionUpdated(obj); break;
    case 'customer.subscription.deleted':
      result = await handleSubscriptionDeleted(obj); break;
    case 'invoice.payment_failed':
      result = await handlePaymentFailed(obj); break;
    // Stripe sends both `invoice.paid` and `invoice.payment_succeeded` for a
    // successful invoice. Route them to the same handler so subscribing to
    // EITHER event in the dashboard works (no silently-ignored events).
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
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
    let exactTenantId: string | null = null;
    const stripeSubId = obj?.subscription ?? obj?.id ?? null;
    if (stripeSubId && typeof stripeSubId === 'string') {
      const [stackRow] = await db.select({
        tenantId: tenantApplicationSubscriptions.tenantId,
        initiatedByUserId: tenantApplicationSubscriptions.initiatedByUserId,
      }).from(tenantApplicationSubscriptions)
        .where(eq(tenantApplicationSubscriptions.stripeSubscriptionId, stripeSubId))
        .limit(1);
      if (stackRow) {
        exactTenantId = stackRow.tenantId;
        userId = stackRow.initiatedByUserId ?? userId;
      }
    }
    if (!userId) {
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
    if (exactTenantId || userId) {
      try {
        const { schedulePropagation, schedulePropagationForUser } = await import('./entitlement-propagation.js');
        if (exactTenantId) {
          schedulePropagation(exactTenantId, { reason: `stripe:${type}`, actorUserId: userId });
        } else if (userId) {
          schedulePropagationForUser(userId, { reason: `stripe:${type}` });
        }
      } catch (err) {
        console.warn('[billing-service] entitlement propagation unavailable', {
          code: typeof err === 'object' && err ? (err as { code?: unknown }).code ?? 'unknown' : 'unknown',
        });
      }
    } else {
      console.warn(`[billing-service] could not resolve userId for ${type}; skipping entitlement push`);
    }
  }
  return result;
}

async function handleCheckoutCompleted(session: any): Promise<WebhookProcessResult> {
  if (session.metadata?.billing_model === 'core_product_stack') {
    return handleStackCheckoutCompleted(session);
  }
  // Starter/Pro/Elite and individual add-on sales are permanently closed.
  // A pre-cutover Checkout Session may still complete after the v60 deploy;
  // acknowledging it without mutating local authority prevents that stale
  // provider object from creating or upgrading grandfathered access.
  return {
    handled: true,
    action: 'legacy_checkout_rejected_after_cutover',
    shouldPropagate: false,
  };
}

function stripeResourceId(value: any): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value.id === 'string' && value.id.length > 0) return value.id;
  return null;
}

function stripePeriodDate(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

async function retrieveAuthoritativeSubscription(subscriptionId: string): Promise<any> {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });
  if (!subscription || subscription.id !== subscriptionId) {
    throw new CommercePolicyError(
      'STACK_SUBSCRIPTION_PROVIDER_MISMATCH',
      'Stripe did not return the exact Application Stack subscription.',
      409,
    );
  }
  return subscription;
}

function validateExactSubscriptionItems(
  subscription: any,
  expectations: readonly StackPriceExpectation[],
): string | null {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  if (items.length !== expectations.length) return 'SUBSCRIPTION_ITEM_COUNT_MISMATCH';
  const actual = new Map<string, number>();
  for (const item of items) {
    const priceId = stripeResourceId(item?.price);
    const quantity = item?.quantity;
    if (!priceId || !Number.isSafeInteger(quantity) || quantity <= 0 || actual.has(priceId)) {
      return 'SUBSCRIPTION_ITEM_INVALID';
    }
    actual.set(priceId, quantity);
  }
  for (const expectation of expectations) {
    if (actual.get(expectation.priceId) !== expectation.quantity) {
      return 'SUBSCRIPTION_ITEM_PRICE_OR_QUANTITY_MISMATCH';
    }
  }
  return null;
}

async function validateAuthoritativeStackSubscription(
  subscription: any,
  stackSub: TenantApplicationSubscriptionRow,
  allowInitiallyUnbound = false,
) {
  const binding = validateStackSubscriptionBinding(subscription, stackSub, allowInitiallyUnbound);
  if (!binding.valid) return binding;
  let expectations: StackPriceExpectation[];
  try {
    expectations = selectionPriceExpectations(
      stackSub.coreProduct,
      binding.additionalModules.length,
      stackSub.additionalSeats,
      stackSub,
    );
    await validatePriceExpectations(expectations);
  } catch (error) {
    // A catalog/configuration mismatch is durable provider drift and must
    // deactivate the local grant. Transient Stripe/network failures still
    // escape so the webhook delivery is retried instead of being quarantined.
    if (error instanceof CommercePolicyError) {
      return { valid: false as const, error: `${error.code}: ${error.message}` };
    }
    throw error;
  }
  const itemError = validateExactSubscriptionItems(subscription, expectations);
  if (itemError) return { valid: false as const, error: itemError };
  return { ...binding, expectations };
}

async function handleStackCheckoutCompleted(session: any): Promise<WebhookProcessResult> {
  const metadata = session.metadata ?? {};
  const tenantId = metadata.tenant_id;
  const userId = metadata.user_id;
  const internalSubscriptionId = metadata.internal_application_subscription_id;
  const coreProduct = metadata.selected_core_product;
  const freeCompanionModule = metadata.selected_free_companion_module;
  const stripeSubscriptionId = stripeResourceId(session.subscription);
  const stripeCustomerId = stripeResourceId(session.customer);
  if (!tenantId || !userId || !internalSubscriptionId || !stripeSubscriptionId
      || !stripeCustomerId || !isCoreProductKey(coreProduct)) {
    return { handled: false, error: 'Invalid core product checkout metadata' };
  }

  if (session.mode !== 'subscription' || session.status !== 'complete') {
    return { handled: false, error: 'Application Stack Checkout is not complete and paid' };
  }
  if (session.payment_status === 'unpaid') {
    // Delayed-payment Checkout emits an immutable completed/unpaid event and
    // later a distinct async_payment_succeeded event. Acknowledge the former
    // without granting so it does not retry forever; only the paid event may
    // cross the entitlement boundary below.
    return { handled: true, action: 'core_product_stack_payment_pending', shouldPropagate: false };
  }
  if (!['paid', 'no_payment_required'].includes(session.payment_status)) {
    return { handled: false, error: 'Application Stack Checkout payment state is invalid' };
  }

  const rawAdditionalModules = String(metadata.additional_module_keys ?? '');
  const additionalModules = rawAdditionalModules === ''
    ? []
    : rawAdditionalModules.split(',').map((value: string) => value.trim());
  const uniqueAdditionalModules = [...new Set(additionalModules)];
  const additionalSeatsText = String(metadata.additional_seats ?? '');
  const additionalSeats = /^\d+$/.test(additionalSeatsText)
    ? Number.parseInt(additionalSeatsText, 10)
    : Number.NaN;
  if (!isEligibleCompanionModuleKey(freeCompanionModule)
      || !additionalModules.every(isEligibleCompanionModuleKey)
      || additionalModules.length !== uniqueAdditionalModules.length
      || additionalModules.includes(freeCompanionModule)
      || !Number.isSafeInteger(additionalSeats)) {
    return { handled: false, error: 'Invalid Application Stack selection metadata' };
  }
  const product = CORE_PRODUCTS_BY_KEY[coreProduct];

  const [pending] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, internalSubscriptionId))
    .limit(1);
  if (pending && isStaleStackCheckoutGeneration(session, pending)) {
    return { handled: true, action: 'core_product_stack_stale_checkout_generation_ignored', shouldPropagate: false };
  }
  const rowModules = Array.isArray(pending?.additionalModuleKeys)
    ? [...pending.additionalModuleKeys].sort()
    : [];
  const eventModules = [...additionalModules].sort();
  const rowMatches = !!pending
    && pending.tenantId === tenantId
    && pending.initiatedByUserId === userId
    && pending.stripeCustomerId === stripeCustomerId
    && pending.stripeCheckoutSessionId === session.id
    && pending.coreProduct === coreProduct
    && pending.includedCompanionKey === freeCompanionModule
    && pending.additionalSeats === additionalSeats
    && metadata.billing_interval === 'month'
    && JSON.stringify(rowModules) === JSON.stringify(eventModules);
  if (!rowMatches) {
    return { handled: false, error: 'Core product checkout does not match its tenant-owned purchase intent' };
  }
  if (['active', 'trialing', 'canceling'].includes(pending.status)
      && pending.stripeSubscriptionId === stripeSubscriptionId) {
    return { handled: true, action: 'core_product_stack_already_active', shouldPropagate: false };
  }
  if (pending.status !== 'incomplete') {
    return { handled: true, action: 'core_product_stack_checkout_rejected_terminal', shouldPropagate: false };
  }
  if (pending.stripeSubscriptionId && pending.stripeSubscriptionId !== stripeSubscriptionId) {
    return { handled: false, error: 'Core product checkout subscription binding does not match' };
  }

  const providerSubscription = await retrieveAuthoritativeSubscription(stripeSubscriptionId);
  if (!['active', 'trialing'].includes(providerSubscription.status)
      || stripeResourceId(providerSubscription.customer) !== stripeCustomerId) {
    return { handled: false, error: 'Application Stack subscription is not active for the bound customer' };
  }
  const providerBinding = await validateAuthoritativeStackSubscription(providerSubscription, pending, true);
  if (!providerBinding.valid
      || providerBinding.includedCompanion !== pending.includedCompanionKey
      || JSON.stringify([...providerBinding.additionalModules].sort()) !== JSON.stringify(rowModules)) {
    return {
      handled: false,
      error: providerBinding.valid
        ? 'Application Stack provider selection does not match the checkout intent'
        : providerBinding.error,
    };
  }

  await grantStackEntitlements({
    tenantId,
    coreProduct,
    freeCompanionModule,
    additionalModules: additionalModules as CompanionModuleKey[],
    additionalSeats,
    stripeSubscriptionId,
    corePriceId: pending.corePriceId,
    companionPriceId: pending.companionPriceId,
    additionalSeatPriceId: pending.additionalSeatPriceId,
    applicationSubscriptionId: pending.id,
    applicationSubscriptionStatus: providerSubscription.cancel_at_period_end
      ? 'canceling'
      : providerSubscription.status,
    cancelAtPeriodEnd: !!providerSubscription.cancel_at_period_end,
    currentPeriodStart: stripePeriodDate(providerSubscription.current_period_start),
    currentPeriodEnd: stripePeriodDate(providerSubscription.current_period_end),
  });

  await db.insert(billingEvents).values({
    userId,
    tenantId,
    eventType: 'core_product_stack_activated',
    amount:
      product.monthlyPriceCents +
      additionalModules.length * COMPANION_MODULE_PRICE_CENTS +
      additionalSeats * DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
    metadata: {
      coreProduct,
      freeCompanionModule,
      additionalModules,
      additionalSeats,
      stripeSubscriptionId,
    },
  });
  await writeAudit({
    actorUserId: userId,
    tenantId,
    targetType: 'tenant_entitlements',
    targetId: stripeSubscriptionId,
    action: 'core_product_stack_activated',
    after: { coreProduct, freeCompanionModule, additionalModules, additionalSeats },
  });
  return { handled: true, action: 'core_product_stack_activated', shouldPropagate: true };
}

async function handleSubscriptionCreated(subscription: any): Promise<WebhookProcessResult> {
  if (subscription.metadata?.billing_model === 'core_product_stack') {
    return reconcileStackSubscriptionBeforeCheckout(subscription, 'created');
  }
  const existingSub = await findGrandfatheredLegacyByStripeSubscriptionId(subscription.id);
  if (!existingSub) {
    return { handled: true, action: 'legacy_subscription_created_rejected_after_cutover', shouldPropagate: false };
  }
  const status = mapStripeStatus(subscription.status);
  if (['canceled', 'expired'].includes(existingSub.status)
      && !['canceled', 'expired'].includes(status)) {
    return { handled: true, action: 'stale_grandfathered_subscription_created_ignored', shouldPropagate: false };
  }
  await db.update(subscriptions).set({
    status,
    stripeCustomerId: stripeResourceId(subscription.customer) ?? existingSub.stripeCustomerId,
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    currentPeriodStart: stripePeriodDate(subscription.current_period_start) ?? existingSub.currentPeriodStart,
    currentPeriodEnd: stripePeriodDate(subscription.current_period_end) ?? existingSub.currentPeriodEnd,
    updatedAt: new Date(),
  }).where(eq(subscriptions.id, existingSub.id));
  return { handled: true, action: 'grandfathered_subscription_created_synchronized', shouldPropagate: true };
}

async function findGrandfatheredLegacyByStripeSubscriptionId(stripeSubscriptionId: string) {
  if (!stripeSubscriptionId) return null;
  const result = await db.execute(sql`
    SELECT id FROM subscriptions
    WHERE stripe_subscription_id=${stripeSubscriptionId}
      AND legacy_access_grandfathered_at IS NOT NULL
    LIMIT 1
  `);
  const id = result.rows[0]?.id;
  if (typeof id !== 'string') return null;
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return row ?? null;
}

async function findStackSubscriptionCandidate(subscription: any): Promise<TenantApplicationSubscriptionRow | null> {
  const stripeSubscriptionId = stripeResourceId(subscription?.id);
  if (stripeSubscriptionId) {
    const [bound] = await db.select().from(tenantApplicationSubscriptions)
      .where(eq(tenantApplicationSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    if (bound) return bound;
  }
  const internalId = subscription?.metadata?.internal_application_subscription_id;
  if (subscription?.metadata?.billing_model !== 'core_product_stack'
      || typeof internalId !== 'string' || !internalId) return null;
  const [pending] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, internalId))
    .limit(1);
  return pending ?? null;
}

function stackCheckoutAttemptId(stackSub: TenantApplicationSubscriptionRow): string {
  const metadata = (stackSub.metadata ?? {}) as Record<string, unknown>;
  return typeof metadata.checkout_attempt_id === 'string' && metadata.checkout_attempt_id.length > 0
    ? metadata.checkout_attempt_id
    : stackSub.id;
}

function isStaleStackCheckoutGeneration(
  providerResource: any,
  stackSub: TenantApplicationSubscriptionRow,
): boolean {
  const metadata = providerResource?.metadata ?? {};
  const providerAttemptId = metadata.checkout_attempt_id;
  return metadata.billing_model === 'core_product_stack'
    && metadata.internal_application_subscription_id === stackSub.id
    && metadata.tenant_id === stackSub.tenantId
    && stripeResourceId(providerResource?.customer) === stackSub.stripeCustomerId
    && typeof providerAttemptId === 'string'
    && providerAttemptId.length > 0
    && providerAttemptId !== stackCheckoutAttemptId(stackSub);
}

async function quarantineStackSubscription(
  stackSub: TenantApplicationSubscriptionRow,
  stripeSubscriptionId: string,
  reason: string,
): Promise<void> {
  await deactivateSubscriptionEntitlements(stripeSubscriptionId);
  const quarantineStatus = stackSub.status === 'incomplete'
    ? 'checkout_failed'
    : ['checkout_failed', 'canceled', 'expired'].includes(stackSub.status)
      ? stackSub.status
      : 'past_due';
  await db.update(tenantApplicationSubscriptions).set({
    status: quarantineStatus,
    stripeSubscriptionId,
    metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      providerValidation: 'failed',
      providerValidationReason: reason,
      providerValidationFailedAt: new Date().toISOString(),
    })}::jsonb`,
    updatedAt: new Date(),
  }).where(eq(tenantApplicationSubscriptions.id, stackSub.id));
}

async function reconcileStackSubscriptionBeforeCheckout(
  eventSubscription: any,
  eventKind: 'created' | 'updated',
): Promise<WebhookProcessResult> {
  const stripeSubscriptionId = stripeResourceId(eventSubscription?.id);
  if (!stripeSubscriptionId) return { handled: false, error: 'Stripe subscription id is missing' };
  const stackSub = await findStackSubscriptionCandidate(eventSubscription);
  if (!stackSub) return { handled: false, error: 'No matching Application Stack purchase intent' };
  if (stackSub.status !== 'incomplete') {
    return { handled: true, action: `core_product_stack_${eventKind}_terminal_ignored`, shouldPropagate: false };
  }

  const providerSubscription = await retrieveAuthoritativeSubscription(stripeSubscriptionId);
  if (isStaleStackCheckoutGeneration(providerSubscription, stackSub)) {
    return {
      handled: true,
      action: `core_product_stack_stale_${eventKind}_generation_ignored`,
      shouldPropagate: false,
    };
  }
  const binding = await validateAuthoritativeStackSubscription(providerSubscription, stackSub, true);
  if (!binding.valid) {
    await quarantineStackSubscription(stackSub, stripeSubscriptionId, binding.error);
    return { handled: true, action: 'core_product_stack_provider_drift_deactivated', shouldPropagate: true };
  }
  const providerStatus = mapStripeStatus(providerSubscription.status);
  const terminal = providerStatus === 'canceled' || providerStatus === 'expired';
  await db.update(tenantApplicationSubscriptions).set({
    stripeSubscriptionId,
    status: terminal ? providerStatus : 'incomplete',
    cancelAtPeriodEnd: !!providerSubscription.cancel_at_period_end,
    currentPeriodStart: stripePeriodDate(providerSubscription.current_period_start) ?? stackSub.currentPeriodStart,
    currentPeriodEnd: stripePeriodDate(providerSubscription.current_period_end) ?? stackSub.currentPeriodEnd,
    metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      providerObservedStatus: providerStatus,
      providerObservedBeforeCheckoutAt: new Date().toISOString(),
    })}::jsonb`,
    updatedAt: new Date(),
  }).where(and(
    eq(tenantApplicationSubscriptions.id, stackSub.id),
    eq(tenantApplicationSubscriptions.status, 'incomplete'),
  ));
  if (terminal) await deactivateSubscriptionEntitlements(stripeSubscriptionId);
  return {
    handled: true,
    action: terminal
      ? 'core_product_stack_terminal_before_checkout'
      : `core_product_stack_${eventKind}_deferred`,
    shouldPropagate: terminal,
  };
}

function validateStackSubscriptionBinding(
  subscription: any,
  stackSub: TenantApplicationSubscriptionRow,
  allowInitiallyUnbound = false,
): { valid: true; includedCompanion: CompanionModuleKey; additionalModules: CompanionModuleKey[] }
  | { valid: false; error: string } {
  const md = subscription.metadata ?? {};
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;
  const includedCompanion = md.selected_free_companion_module;
  const additionalSeatsText = String(md.additional_seats ?? '');
  const additionalSeats = /^\d+$/.test(additionalSeatsText)
    ? Number.parseInt(additionalSeatsText, 10)
    : Number.NaN;
  const rawAdditionalModules = String(md.additional_module_keys ?? '');
  const additionalModules = rawAdditionalModules === ''
    ? []
    : rawAdditionalModules.split(',').map((value: string) => value.trim());
  const uniqueAdditionalModules = [...new Set(additionalModules)];
  const checkoutAttemptId = stackCheckoutAttemptId(stackSub);

  if (md.billing_model !== 'core_product_stack'
      || md.billing_interval !== 'month'
      || md.internal_application_subscription_id !== stackSub.id
      || md.checkout_attempt_id !== checkoutAttemptId
      || md.tenant_id !== stackSub.tenantId
      || customerId !== stackSub.stripeCustomerId
      || (stackSub.stripeSubscriptionId
        ? subscription.id !== stackSub.stripeSubscriptionId
        : !allowInitiallyUnbound)
      || md.selected_core_product !== stackSub.coreProduct
      || typeof md.user_id !== 'string'
      || md.user_id.length === 0
      || (stackSub.initiatedByUserId !== null && md.user_id !== stackSub.initiatedByUserId)
      || !isEligibleCompanionModuleKey(includedCompanion)
      || !Number.isSafeInteger(additionalSeats)
      || additionalSeats !== stackSub.additionalSeats
      || additionalModules.length !== uniqueAdditionalModules.length
      || !uniqueAdditionalModules.every(isEligibleCompanionModuleKey)
      || uniqueAdditionalModules.includes(includedCompanion)) {
    return { valid: false, error: 'Application stack subscription metadata binding mismatch' };
  }

  const currentIncluded = stackSub.includedCompanionKey;
  const currentAdditionalModules = stackSub.additionalModuleKeys.filter(isEligibleCompanionModuleKey);
  if (!isEligibleCompanionModuleKey(currentIncluded)
      || currentAdditionalModules.length !== stackSub.additionalModuleKeys.length) {
    return { valid: false, error: 'Application stack subscription row contains an invalid selection' };
  }
  const expectedAdditionalModules = includedCompanion === currentIncluded
    ? currentAdditionalModules
    : swapIncludedCompanion(currentIncluded, currentAdditionalModules, includedCompanion);
  const expectedSorted = [...expectedAdditionalModules].sort();
  const providerSorted = [...uniqueAdditionalModules].sort();
  if (JSON.stringify(expectedSorted) !== JSON.stringify(providerSorted)) {
    return { valid: false, error: 'Application stack subscription selection metadata mismatch' };
  }

  return {
    valid: true,
    includedCompanion,
    additionalModules: uniqueAdditionalModules as CompanionModuleKey[],
  };
}

async function handleSubscriptionUpdated(subscription: any): Promise<WebhookProcessResult> {
  const stripeSubId = stripeResourceId(subscription?.id);
  if (!stripeSubId) return { handled: false, error: 'Stripe subscription id is missing' };
  const stackSub = await findStackSubscriptionCandidate(subscription);
  if (stackSub) {
    if (stackSub.stripeSubscriptionId && stackSub.stripeSubscriptionId !== stripeSubId) {
      return { handled: true, action: 'core_product_stack_stale_update_binding_ignored', shouldPropagate: false };
    }
    if (stackSub.status === 'incomplete') {
      return reconcileStackSubscriptionBeforeCheckout(subscription, 'updated');
    }
    const providerSubscription = await retrieveAuthoritativeSubscription(stripeSubId);
    const binding = await validateAuthoritativeStackSubscription(providerSubscription, stackSub);
    if (!binding.valid) {
      await quarantineStackSubscription(stackSub, stripeSubId, binding.error);
      return { handled: true, action: 'core_product_stack_provider_drift_deactivated', shouldPropagate: true };
    }
    const providerStatus = mapStripeStatus(providerSubscription.status);
    const cancelAtEnd = !!providerSubscription.cancel_at_period_end;
    const status = cancelAtEnd && ['active', 'trialing', 'past_due'].includes(providerStatus)
      ? 'canceling'
      : providerStatus;
    const providerCarriesAccess = ['active', 'trialing', 'past_due'].includes(providerSubscription.status);
    const recoveryEligible = ['active', 'trialing', 'past_due', 'canceling'].includes(stackSub.status);
    if (providerCarriesAccess && !recoveryEligible) {
      // Only checkout completion may establish a new paid grant. Provider
      // updates can repair an already-activated/quarantined stack, but cannot
      // revive canceled/expired contracts or bypass checkout after a failed
      // pre-checkout reconciliation.
      await deactivateSubscriptionEntitlements(stripeSubId);
      return {
        handled: true,
        action: 'core_product_stack_terminal_update_ignored',
        shouldPropagate: true,
      };
    }
    const [activeCoreGrant] = await db.select({ id: tenantEntitlements.id })
      .from(tenantEntitlements)
      .where(and(
        eq(tenantEntitlements.tenantId, stackSub.tenantId),
        eq(tenantEntitlements.entitlementType, 'core_product'),
        eq(tenantEntitlements.stripeSubscriptionId, stripeSubId),
        eq(tenantEntitlements.active, true),
      ))
      .limit(1);
    if (providerCarriesAccess && !activeCoreGrant) {
      // A corrected provider subscription can recover a stack that a prior
      // mismatch quarantined, but only after passing the same exact catalog,
      // item, quantity, tenant, and metadata validation used at checkout.
      await grantStackEntitlements({
        tenantId: stackSub.tenantId,
        coreProduct: stackSub.coreProduct,
        freeCompanionModule: binding.includedCompanion,
        additionalModules: binding.additionalModules,
        additionalSeats: stackSub.additionalSeats,
        stripeSubscriptionId: stripeSubId,
        corePriceId: stackSub.corePriceId,
        companionPriceId: stackSub.companionPriceId,
        additionalSeatPriceId: stackSub.additionalSeatPriceId,
      });
    } else if (providerCarriesAccess && binding.includedCompanion !== stackSub.includedCompanionKey) {
      await changeFreeCompanionModule(
        stackSub.tenantId,
        binding.includedCompanion,
        binding.additionalModules,
      );
    }
    await db.update(tenantApplicationSubscriptions).set({
      status,
      cancelAtPeriodEnd: cancelAtEnd,
      currentPeriodStart: stripePeriodDate(providerSubscription.current_period_start) ?? stackSub.currentPeriodStart,
      currentPeriodEnd: stripePeriodDate(providerSubscription.current_period_end) ?? stackSub.currentPeriodEnd,
      metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
        providerValidation: 'validated',
        providerValidatedAt: new Date().toISOString(),
      })}::jsonb`,
      updatedAt: new Date(),
    }).where(eq(tenantApplicationSubscriptions.id, stackSub.id));
    if (!providerCarriesAccess) {
      await deactivateSubscriptionEntitlements(stripeSubId);
    }
    return { handled: true, action: 'core_product_stack_updated', shouldPropagate: true };
  }

  const existingSub = await findGrandfatheredLegacyByStripeSubscriptionId(stripeSubId);
  if (!existingSub) {
    return { handled: true, action: 'non_grandfathered_subscription_update_ignored', shouldPropagate: false };
  }
  const status = mapStripeStatus(subscription.status);
  if (['canceled', 'expired'].includes(existingSub.status)
      && !['canceled', 'expired'].includes(status)) {
    return { handled: true, action: 'stale_grandfathered_subscription_update_ignored', shouldPropagate: false };
  }
  await db.update(subscriptions).set({
    // The v60 marker freezes the commercial tier. Provider item/Price changes
    // can update lifecycle facts but can never expand the grandfathered plan.
    status,
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    currentPeriodStart: stripePeriodDate(subscription.current_period_start) ?? existingSub.currentPeriodStart,
    currentPeriodEnd: stripePeriodDate(subscription.current_period_end) ?? existingSub.currentPeriodEnd,
    updatedAt: new Date(),
  }).where(eq(subscriptions.id, existingSub.id));

  return { handled: true, action: 'grandfathered_subscription_lifecycle_updated' };
}

async function handleSubscriptionDeleted(subscription: any): Promise<WebhookProcessResult> {
  const stripeSubId = stripeResourceId(subscription?.id);
  if (!stripeSubId) return { handled: false, error: 'Stripe subscription id is missing' };
  const stackSub = await findStackSubscriptionCandidate(subscription);

  if (stackSub) {
    if (stackSub.stripeSubscriptionId && stackSub.stripeSubscriptionId !== stripeSubId) {
      return { handled: true, action: 'core_product_stack_stale_delete_binding_ignored', shouldPropagate: false };
    }
    if (isStaleStackCheckoutGeneration(subscription, stackSub)) {
      return { handled: true, action: 'core_product_stack_stale_delete_generation_ignored', shouldPropagate: false };
    }
    const binding = validateStackSubscriptionBinding(subscription, stackSub, true);
    const alreadyBound = stackSub.stripeSubscriptionId === stripeSubId;
    if (!binding.valid && !alreadyBound) return { handled: false, error: binding.error };
    await deactivateSubscriptionEntitlements(stripeSubId);
    await db.update(tenantApplicationSubscriptions).set({
      status: 'canceled',
      stripeSubscriptionId: stripeSubId,
      cancelAtPeriodEnd: false,
      metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
        providerTerminalEvent: 'customer.subscription.deleted',
        providerTerminalAt: new Date().toISOString(),
        ...(binding.valid ? {} : { providerValidationReason: binding.error }),
      })}::jsonb`,
      updatedAt: new Date(),
    }).where(eq(tenantApplicationSubscriptions.id, stackSub.id));
    return { handled: true, action: 'core_product_stack_deactivated', shouldPropagate: true };
  }

  const existingSub = await findGrandfatheredLegacyByStripeSubscriptionId(stripeSubId);
  if (!existingSub) {
    return { handled: true, action: 'unknown_subscription_delete_observed', shouldPropagate: false };
  }

  await db.update(subscriptions).set({
    status: 'canceled', cancelAtPeriodEnd: false,
    updatedAt: new Date(),
  }).where(eq(subscriptions.id, existingSub.id));

  await db.insert(activityFeed).values({
    userId: existingSub.userId, action: 'subscription_canceled',
    entityType: 'subscription', metadata: { via: 'stripe' },
  });

  console.log('[billing-service] Subscription deleted');
  return { handled: true, action: 'subscription_deleted' };
}

async function handlePaymentFailed(invoice: any): Promise<WebhookProcessResult> {
  const stripeSubId = stripeResourceId(invoice.subscription);
  if (!stripeSubId) return { handled: false, error: 'No subscription on invoice' };

  const [stackSub] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.stripeSubscriptionId, stripeSubId)).limit(1);
  if (stackSub) {
    // Invoice delivery is not subscription lifecycle authority. Re-read the
    // provider object so an older invoice cannot revive or regress a terminal
    // subscription, and run the same exact-item validation as update events.
    const providerSubscription = await retrieveAuthoritativeSubscription(stripeSubId);
    return handleSubscriptionUpdated(providerSubscription);
  }

  return {
    handled: true,
    action: await findGrandfatheredLegacyByStripeSubscriptionId(stripeSubId)
      ? 'grandfathered_invoice_payment_failed_observed'
      : 'unknown_invoice_payment_failed_observed',
    shouldPropagate: false,
  };
}

async function handleInvoicePaid(invoice: any): Promise<WebhookProcessResult> {
  const stripeSubId = stripeResourceId(invoice.subscription);
  if (!stripeSubId) return { handled: false, error: 'No subscription on invoice' };

  const [stackSub] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.stripeSubscriptionId, stripeSubId)).limit(1);
  if (stackSub) {
    const providerSubscription = await retrieveAuthoritativeSubscription(stripeSubId);
    return handleSubscriptionUpdated(providerSubscription);
  }

  return {
    handled: true,
    action: await findGrandfatheredLegacyByStripeSubscriptionId(stripeSubId)
      ? 'grandfathered_invoice_paid_observed'
      : 'unknown_invoice_paid_observed',
    shouldPropagate: false,
  };
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
  // Unknown provider states never grant access by optimistic default.
  return map[stripeStatus] || 'past_due';
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

type AddonModuleCandidate = {
  slug: string;
  status?: string;
  metadata?: Record<string, unknown> | null;
};

/**
 * Known ecosystem modules are classified only by MODULE_CATALOG. Explicit
 * metadata is accepted solely for admin-created modules outside that catalog.
 * A metadata value can never override a canonical core/free classification.
 */
export function isCommercialAddonModule(
  mod: AddonModuleCandidate | null | undefined,
): boolean {
  if (!mod) return false;
  const catalogEntry = MODULE_CATALOG_BY_SLUG[mod.slug];
  if (catalogEntry) return catalogEntry.commercialType === 'addon';
  return mod.metadata?.commercialType === 'addon';
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
  // The explicit in-process test seam supplies a complete client and must not
  // depend on a real Stripe secret. In every production path the override is
  // null, so a missing deployment secret still fails closed exactly as before.
  if (!STRIPE_SECRET_KEY && !__stripeTestOverride?.client) {
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
// Requires Stripe to be enabled (secret + STRIPE_MODE=test or live) — when no
// key is configured we reject so we never invent priceIds against a dead env.
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
  _args: CreateAddonStripePriceArgs,
): Promise<CreateAddonStripePriceResult> {
  throw new CommercePolicyError(
    'APPLICATION_STACK_SHARED_PRICE_REQUIRED',
    'Application stacks use one shared companion price. Per-module Stripe price creation is closed.',
    409,
  );
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
  if (!STRIPE_SECRET_KEY && !__stripeTestOverride?.client) {
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
  mod: AddonModuleCandidate | null | undefined,
): boolean {
  // Existing rows remain effective/cancelable, but no individual application
  // is sold outside the application-stack checkout.
  return false;
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
  mod: AddonModuleCandidate,
): void {
  if (!isCommercialAddonModule(mod)) {
    throw new AddonNotPurchasableError(
      mod.slug,
      `Module "${mod.slug}" is not classified as an OperatorOS add-on.`,
    );
  }
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
  legacyAddonSalesClosed();
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
    const appUrl = resolveAppBaseUrl();

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
      md.tenant_id = String(tenantId);
      md.tenantId = String(tenantId);
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

export async function cancelAddon(userId: string, tenantId: string, moduleSlug: string): Promise<{ ok: boolean; message: string }> {
  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) throw new Error(`Module not found: ${moduleSlug}`);

  const rows = await db.select().from(addonSubscriptions)
    .where(and(
      eq(addonSubscriptions.userId, userId),
      eq(addonSubscriptions.tenantId, tenantId),
      eq(addonSubscriptions.moduleId, mod.id),
    ));
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
    userId, tenantId, eventType: 'addon_cancel_scheduled',
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

  const lease = stripeEventLeaseMetadata();
  const acquired = await db.execute(sql`
    UPDATE billing_events
    SET retry_count=retry_count+1,
        error_message=NULL,
        metadata=COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
          ...lease,
          replayInProgress: true,
        })}::jsonb
    WHERE id=${eventId}
      AND processed_at IS NULL
      AND (
        error_message IS NOT NULL
        OR COALESCE(
          NULLIF(metadata->>'processingLeaseExpiresAt','')::timestamptz,
          '-infinity'::timestamptz
        ) <= NOW()
      )
    RETURNING retry_count
  `);
  const acquiredRetryCount = acquired.rows[0]?.retry_count;
  if (typeof acquiredRetryCount !== 'number') {
    const [current] = await db.select({ processedAt: billingEvents.processedAt })
      .from(billingEvents).where(eq(billingEvents.id, eventId)).limit(1);
    if (current?.processedAt) return {
      ok: true,
      replayed: false,
      message: 'Event already processed; ignoring duplicate retry.',
      replayResult: { handled: true, action: 'duplicate_ignored' },
    };
    return {
      ok: false,
      replayed: false,
      message: 'Event processing is already in progress; retry after its processing lease expires.',
    };
  }
  const next = acquiredRetryCount;
  const rawEvent = (evt.metadata as any)?.rawEvent;

  // No raw payload → just mark resolved (legacy / non-replayable)
  if (!rawEvent || typeof rawEvent !== 'object' || !rawEvent.type) {
    await markStripeEventProcessed(eventId, 'legacy_event_marked_resolved');
    return {
      ok: true,
      message: `Event marked resolved (attempts=${next}). No raw payload was captured for true replay.`,
      replayed: false,
    };
  }

  // Dispatch by event family. Stripe's webhook router tags addon flows via
  // metadata.type==='addon' || metadata.kind==='addon' on the affected object;
  // everything else is a plan/base-subscription event handled by
  // processWebhookEvent. Without this branch, plan-side failures could not be
  // replayed and would stay stuck in the DLQ forever.
  const replayClassification = classifyWebhookEvent(rawEvent);

  let replayResult: WebhookProcessResult;
  try {
    if (replayClassification.isFeatureAddon) {
      const numberBilling = await import('./callcommand-number-billing.js');
      replayResult = replayClassification.featureKey === numberBilling.CALLCOMMAND_NUMBER_FEATURE_KEY
        ? await numberBilling.processCallCommandNumberWebhookEvent(rawEvent)
        : await (await import('./callcommand-lane-billing.js')).processCallCommandLaneWebhookEvent(rawEvent);
    } else {
      replayResult = replayClassification.isAddon
        ? await processAddonWebhookEvent(rawEvent)
        : await processWebhookEvent(rawEvent);
    }
  } catch (err: any) {
    await markStripeEventFailed(eventId, `replay_error: ${err.message}`);
    await db.update(billingEvents).set({
      metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
        replayedAt: new Date().toISOString(),
        replayError: err.message,
      })}::jsonb`,
    }).where(eq(billingEvents.id, eventId));
    return { ok: false, message: `Replay threw: ${err.message}` };
  }

  if (replayResult.handled) {
    await markStripeEventProcessed(eventId, replayResult.action);
    await db.update(billingEvents).set({
      metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
        replayedAt: new Date().toISOString(),
        replayedAction: replayResult.action || 'handled',
      })}::jsonb`,
    }).where(eq(billingEvents.id, eventId));
    return {
      ok: true,
      message: `Event replayed successfully (attempts=${next}, action=${replayResult.action || 'handled'}).`,
      replayed: true,
      replayResult,
    };
  }

  await markStripeEventFailed(eventId, `replay_failed: ${replayResult.error || 'not_handled'}`);
  await db.update(billingEvents).set({
    metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      replayedAt: new Date().toISOString(),
      replayError: replayResult.error || 'not_handled',
    })}::jsonb`,
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

export function getStripeRuntimeMode(): 'test' | 'live' | 'disabled' {
  if (!isStripeEnabled()) return 'disabled';
  return STRIPE_MODE === 'live' ? 'live' : 'test';
}
