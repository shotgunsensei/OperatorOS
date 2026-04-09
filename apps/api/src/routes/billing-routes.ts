import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import {
  subscriptions, subscriptionPlans, billingEvents, activityFeed,
} from '../schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate, getUserPlanLimits } from '../lib/auth.js';
import {
  getUserPlanConfig, getUserUsageSummary, getDowngradeViolations,
  isUpgrade, isDowngrade, PLAN_CONFIGS, FEATURE_LABELS, LIMIT_LABELS,
  formatLimit,
} from '../lib/plans.js';

export async function registerBillingRoutes(app: FastifyInstance) {
  app.get('/v1/billing/subscription', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    let plan = null;
    if (sub) {
      [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
    }
    const limits = await getUserPlanLimits(user.id);
    return { subscription: sub || null, plan, limits };
  });

  app.get('/v1/billing/usage', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const { config, subscription } = await getUserPlanConfig(user.id);
    const usage = await getUserUsageSummary(user.id);
    return {
      plan: {
        slug: config.slug,
        name: config.name,
        price: config.price,
        interval: config.interval,
        description: config.description,
      },
      usage,
      features: config.features,
      featureLabels: FEATURE_LABELS,
      limitLabels: LIMIT_LABELS,
      subscription: subscription ? {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      } : null,
    };
  });

  app.get('/v1/billing/plans', async () => {
    return {
      plans: PLAN_CONFIGS.map(p => ({
        slug: p.slug,
        name: p.name,
        price: p.price,
        interval: p.interval,
        description: p.description,
        highlight: p.highlight,
        limits: p.limits,
        features: p.features,
      })),
      featureLabels: FEATURE_LABELS,
      limitLabels: LIMIT_LABELS,
    };
  });

  app.post('/v1/billing/check-downgrade', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const { planSlug } = request.body as any;
    const { config: currentConfig } = await getUserPlanConfig(user.id);

    if (!isDowngrade(currentConfig.slug, planSlug)) {
      return { violations: [], isDowngrade: false };
    }

    const violations = await getDowngradeViolations(user.id, planSlug);
    return { violations, isDowngrade: true };
  });

  app.post('/v1/billing/subscribe', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { planSlug } = request.body as any;

    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, planSlug)).limit(1);
    if (!plan) return reply.code(404).send({ error: 'Plan not found' });

    const { config: currentConfig, subscription: currentSub } = await getUserPlanConfig(user.id);
    const isUpgrading = isUpgrade(currentConfig.slug, planSlug);
    const isDowngrading = isDowngrade(currentConfig.slug, planSlug);

    if (currentConfig.slug === planSlug) {
      return reply.code(400).send({ error: 'You are already on this plan' });
    }

    const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);

    if (existingSub) {
      await db.update(subscriptions).set({
        planId: plan.id,
        status: 'active',
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).where(eq(subscriptions.id, existingSub.id));

      const eventType = isUpgrading ? 'upgraded' : isDowngrading ? 'downgraded' : 'plan_changed';
      await db.insert(billingEvents).values({
        userId: user.id,
        subscriptionId: existingSub.id,
        eventType,
        amount: plan.price,
        metadata: { fromPlan: currentConfig.slug, toPlan: planSlug, action: eventType },
      });
    } else {
      const [newSub] = await db.insert(subscriptions).values({
        userId: user.id,
        planId: plan.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).returning();

      await db.insert(billingEvents).values({
        userId: user.id,
        subscriptionId: newSub.id,
        eventType: 'subscribed',
        amount: plan.price,
        metadata: { planSlug },
      });
    }

    let downgradeWarnings: string[] = [];
    if (isDowngrading) {
      const violations = await getDowngradeViolations(user.id, planSlug);
      downgradeWarnings = violations.map(v => v.message);
    }

    await db.insert(activityFeed).values({
      userId: user.id,
      action: isUpgrading ? 'upgraded' : isDowngrading ? 'downgraded' : 'subscribed',
      entityType: 'subscription',
      metadata: { planName: plan.name, planSlug, fromPlan: currentConfig.slug },
    });

    return {
      ok: true,
      plan: plan.name,
      action: isUpgrading ? 'upgraded' : isDowngrading ? 'downgraded' : 'subscribed',
      downgradeWarnings,
    };
  });

  app.post('/v1/billing/cancel', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    if (!sub) return { ok: false, error: 'No active subscription' };

    await db.update(subscriptions).set({
      cancelAtPeriodEnd: true,
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, sub.id));

    await db.insert(billingEvents).values({
      userId: user.id,
      subscriptionId: sub.id,
      eventType: 'cancel_scheduled',
    });

    return { ok: true, message: 'Subscription will cancel at end of billing period' };
  });

  app.post('/v1/billing/reactivate', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    if (!sub) return { ok: false, error: 'No subscription found' };

    await db.update(subscriptions).set({
      cancelAtPeriodEnd: false,
      status: 'active',
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, sub.id));

    await db.insert(billingEvents).values({
      userId: user.id,
      subscriptionId: sub.id,
      eventType: 'reactivated',
    });

    return { ok: true };
  });

  app.get('/v1/billing/history', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const events = await db.select().from(billingEvents)
      .where(eq(billingEvents.userId, user.id))
      .orderBy(desc(billingEvents.createdAt))
      .limit(50);
    return { events };
  });

  app.post('/v1/billing/webhook', async (request, reply) => {
    const { type, data } = request.body as any;
    console.log('[billing webhook]', type, data);
    return { received: true };
  });
}
