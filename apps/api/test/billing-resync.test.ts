import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  users as usersTable,
  subscriptions,
  subscriptionPlans,
  addonSubscriptions,
  billingEvents,
} from '../src/schema.js';
import {
  resyncUserBilling,
  __setStripeTestOverrides,
} from '../src/lib/billing-service.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
  uniqueId,
} from './_setup.js';

// Build a minimal Stripe-shaped subscription object that matches what
// resyncUserBilling reads off `stripe.subscriptions.list()`.
function buildStripeSub(opts: {
  id?: string;
  customer: string;
  metadata?: Record<string, string>;
  priceId?: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: opts.id ?? uniqueId('sub'),
    customer: opts.customer,
    status: opts.status ?? 'active',
    cancel_at_period_end: !!opts.cancelAtPeriodEnd,
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60,
    metadata: opts.metadata ?? {},
    items: opts.priceId
      ? { data: [{ price: { id: opts.priceId } }] }
      : { data: [] },
  };
}

let userId: string;
let moduleId: string;
let moduleSlug: string;
let testPlanId: string;
let testPlanPriceId: string;

before(async () => {
  await ensureSchemaReady();
  const u = await createTestUser();
  userId = u.id;

  const m = await createTestModule();
  moduleId = m.id;
  moduleSlug = m.slug;

  // Create a dedicated test plan with a Stripe price id we control, so the
  // base-plan reconciliation path matches deterministically regardless of
  // whatever STRIPE_PRICE_* env vars happen to be set in this environment.
  testPlanPriceId = uniqueId('price');
  const planSlug = uniqueId('plan');
  const [plan] = await db.insert(subscriptionPlans).values({
    name: planSlug,
    slug: planSlug,
    price: 1900,
    interval: 'month',
    stripePriceId: testPlanPriceId,
  }).returning();
  testPlanId = plan.id;
});

after(async () => {
  __setStripeTestOverrides(null);
  // Detach subscriptions/plans we created (cleanupUser handles addons +
  // billing_events + the user row itself).
  try {
    await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  } catch {}
  if (userId) await cleanupUser(userId);
  if (testPlanId) {
    try { await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, testPlanId)); } catch {}
  }
  if (moduleId) await cleanupModule(moduleId);
});

test('resyncUserBilling: local mode short-circuits without touching state', async () => {
  __setStripeTestOverrides({ enabled: false });

  const beforeEvents = await db.select().from(billingEvents).where(eq(billingEvents.userId, userId));
  const result = await resyncUserBilling(userId);

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'local', 'must short-circuit to local mode when Stripe is disabled');
  assert.equal(result.scanned, 0);
  assert.equal(result.reconciled, 0);

  const afterEvents = await db.select().from(billingEvents).where(eq(billingEvents.userId, userId));
  assert.equal(
    afterEvents.length, beforeEvents.length,
    'local-mode resync must NOT write any billing_events rows',
  );
});

test('resyncUserBilling: stripe-mode reconciles addon + base plan and writes admin_resync audit row', async () => {
  // Seed: user already has a (stale) plan subscription row with a known
  // customerId. resyncUserBilling discovers customers from existing rows.
  const customerId = uniqueId('cus');
  const stalePlanSubId = uniqueId('sub-stale');
  await db.insert(subscriptions).values({
    userId,
    planId: testPlanId,
    status: 'past_due',                 // intentionally stale — Stripe says active
    stripeSubscriptionId: stalePlanSubId,
    stripeCustomerId: customerId,
  });

  // Seed: a stale addon row whose status drifted (e.g. a past_due→active
  // `customer.subscription.updated` webhook was missed). Resync replays
  // through processAddonWebhookEvent, which heals by stripeSubscriptionId.
  const addonStripeSubId = uniqueId('sub-addon');
  await db.insert(addonSubscriptions).values({
    userId,
    moduleId,
    status: 'past_due',
    stripeSubscriptionId: addonStripeSubId,
    stripeCustomerId: customerId,
    amount: 1500,
    currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });

  // Stub Stripe: list returns one addon-tagged sub + one base-plan sub
  // priced at our test plan's stripePriceId. Anything else (unknown price,
  // unknown metadata) should be silently ignored by resync.
  const addonSub = buildStripeSub({
    id: addonStripeSubId,
    customer: customerId,
    metadata: {
      // resync forcibly re-stamps userId/kind onto the synthetic event,
      // but classifyWebhookEvent still requires moduleSlug from metadata.
      type: 'addon',
      module_slug: moduleSlug,
      moduleSlug,
    },
  });
  const planSub = buildStripeSub({
    id: stalePlanSubId,
    customer: customerId,
    priceId: testPlanPriceId,
    status: 'active',
  });
  const unknownPriceSub = buildStripeSub({
    customer: customerId,
    priceId: uniqueId('price-unknown'),  // not in our planByStripePriceId map
  });

  const listCalls: any[] = [];
  const stubStripe = {
    subscriptions: {
      list: async (args: any) => {
        listCalls.push(args);
        return { data: [addonSub, planSub, unknownPriceSub] };
      },
    },
  };

  __setStripeTestOverrides({ enabled: true, client: stubStripe });

  const result = await resyncUserBilling(userId);

  // ---- result shape ------------------------------------------------------
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'stripe');
  assert.equal(result.scanned, 3, 'should scan every Stripe sub returned for the customer');
  assert.equal(
    result.reconciled, 2,
    'should reconcile exactly the addon + the matched-price plan (the unknown-price sub is skipped)',
  );

  // ---- stripe was actually queried for the right customer ---------------
  assert.equal(listCalls.length, 1, 'exactly one stripe.subscriptions.list call per known customer');
  assert.equal(listCalls[0].customer, customerId);
  assert.equal(listCalls[0].status, 'all');

  // ---- addon row reconciled via processAddonWebhookEvent machinery -----
  const addons = await db.select().from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.userId, userId), eq(addonSubscriptions.moduleId, moduleId)));
  assert.equal(addons.length, 1, 'resync must create the addon row for the addon-tagged Stripe sub');
  assert.equal(addons[0].stripeSubscriptionId, addonStripeSubId);
  assert.equal(addons[0].stripeCustomerId, customerId);
  assert.ok(['active', 'trialing'].includes(addons[0].status), 'reconciled addon must end up active');

  // ---- base-plan row reconciled by Stripe price id ---------------------
  const planRows = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.stripeSubscriptionId, stalePlanSubId)));
  assert.equal(planRows.length, 1, 'should update existing plan row in place, not duplicate');
  assert.equal(planRows[0].planId, testPlanId, 'planId must match the plan whose stripePriceId we sent');
  assert.equal(planRows[0].status, 'active', 'stale past_due row must be healed back to active');
  assert.equal(planRows[0].stripeCustomerId, customerId);

  // ---- admin_resync audit event recorded with counts -------------------
  const evts = await db.select().from(billingEvents)
    .where(and(eq(billingEvents.userId, userId), eq(billingEvents.eventType, 'admin_resync')))
    .orderBy(desc(billingEvents.createdAt));
  assert.ok(evts.length >= 1, 'resync must write at least one admin_resync billing_events audit row');
  const md = (evts[0].metadata ?? {}) as any;
  assert.equal(md.mode, 'stripe');
  assert.equal(md.scanned, 3, 'audit metadata.scanned must match scanned count');
  assert.equal(md.reconciledAddons, 1, 'audit metadata.reconciledAddons must be 1');
  assert.equal(md.reconciledPlans, 1, 'audit metadata.reconciledPlans must be 1');
  assert.ok(evts[0].processedAt, 'admin_resync row should be marked processed (not in DLQ)');
});

test('resyncUserBilling: unhealed addon (no local row) is reported as needsAttention, not reconciled', async () => {
  // Re-use the same userId/customerId. Add a *new* addon-tagged Stripe sub
  // whose stripeSubscriptionId does NOT match any local addon row — i.e.
  // the missed-webhook case. The previous test left exactly one local
  // addon row with addonStripeSubId; this one uses a fresh sub id.
  const localAddons = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.userId, userId));
  const knownCustomerId = localAddons[0]?.stripeCustomerId
    ?? (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1))[0]?.stripeCustomerId!;

  const orphanAddonSubId = uniqueId('sub-orphan');
  const orphanSub = buildStripeSub({
    id: orphanAddonSubId,
    customer: knownCustomerId!,
    metadata: { type: 'addon', module_slug: moduleSlug, moduleSlug },
  });

  const stubStripe = {
    subscriptions: {
      list: async () => ({ data: [orphanSub] }),
    },
  };
  __setStripeTestOverrides({ enabled: true, client: stubStripe });

  const result: any = await resyncUserBilling(userId);

  assert.equal(result.ok, true);
  assert.equal(result.scanned, 1);
  assert.equal(result.reconciled, 0, 'orphan addon must NOT be counted as reconciled');
  assert.equal(result.needsAttention, 1, 'orphan addon must be reported as needsAttention');
  assert.equal(result.needsAttentionAddons.length, 1);
  assert.equal(result.needsAttentionAddons[0].stripeSubscriptionId, orphanAddonSubId);
  assert.equal(result.needsAttentionAddons[0].moduleSlug, moduleSlug);

  const evts = await db.select().from(billingEvents)
    .where(and(eq(billingEvents.userId, userId), eq(billingEvents.eventType, 'admin_resync')))
    .orderBy(desc(billingEvents.createdAt));
  const md = (evts[0].metadata ?? {}) as any;
  assert.equal(md.needsAttention, 1, 'audit metadata.needsAttention must be 1');
  assert.equal(Array.isArray(md.needsAttentionAddonDetails), true);
  assert.equal(md.needsAttentionAddonDetails[0].stripeSubscriptionId, orphanAddonSubId);
});
