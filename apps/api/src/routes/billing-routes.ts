import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { subscriptions, subscriptionPlans, billingEvents } from '../schema.js';
import { eq, desc } from 'drizzle-orm';
import { authenticate, getUserPlanLimits } from '../lib/auth.js';
import {
  getUserPlanConfig, getUserUsageSummary, getDowngradeViolations,
  isDowngrade, PLAN_CONFIGS, FEATURE_LABELS, LIMIT_LABELS,
} from '../lib/plans.js';
import {
  subscribeToPlan, cancelSubscription, reactivateSubscription,
  createCheckoutSession, createPortalSession, processWebhookEvent,
  verifyWebhookSignature, isStripeEnabled, getBillingMode,
} from '../lib/billing-service.js';

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
        slug: p.slug, name: p.name, price: p.price, interval: p.interval,
        description: p.description, highlight: p.highlight,
        limits: p.limits, features: p.features,
      })),
      featureLabels: FEATURE_LABELS,
      limitLabels: LIMIT_LABELS,
    };
  });

  app.get('/v1/billing/mode', async () => {
    return getBillingMode();
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

    try {
      const result = await subscribeToPlan(user.id, planSlug);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post('/v1/billing/create-checkout-session', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { planSlug } = request.body as any;

    if (!isStripeEnabled()) {
      return reply.code(400).send({
        error: 'Stripe is not configured. Subscriptions are managed locally.',
        mode: 'local',
      });
    }

    try {
      const result = await createCheckoutSession(user.id, planSlug);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post('/v1/billing/create-portal-session', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;

    if (!isStripeEnabled()) {
      return reply.code(400).send({
        error: 'Stripe is not configured. Use the in-app billing page to manage your subscription.',
        mode: 'local',
      });
    }

    try {
      const result = await createPortalSession(user.id);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post('/v1/billing/cancel', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    return await cancelSubscription(user.id);
  });

  app.post('/v1/billing/reactivate', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    return await reactivateSubscription(user.id);
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
    if (!isStripeEnabled()) {
      console.log('[billing webhook] Stripe not enabled, ignoring webhook');
      return { received: true, mode: 'local' };
    }

    try {
      const signature = request.headers['stripe-signature'] as string;
      if (!signature) {
        return reply.code(400).send({ error: 'Missing stripe-signature header' });
      }

      const rawBody = (request as any).rawBody || request.body;
      let event;
      if (typeof rawBody === 'string' || Buffer.isBuffer(rawBody)) {
        event = verifyWebhookSignature(rawBody, signature);
      } else {
        event = rawBody;
        console.warn('[billing webhook] Raw body not available, skipping signature verification');
      }

      const result = await processWebhookEvent(event);

      console.log(`[billing webhook] ${event.type}: handled=${result.handled} action=${result.action || 'none'}`);
      return { received: true, ...result };
    } catch (err: any) {
      console.error('[billing webhook] Error:', err.message);
      return reply.code(400).send({ error: err.message });
    }
  });
}
