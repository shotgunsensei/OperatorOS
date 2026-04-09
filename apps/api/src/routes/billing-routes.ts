import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import {
  subscriptions, subscriptionPlans, billingEvents, activityFeed,
} from '../schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate, getUserPlanLimits } from '../lib/auth.js';

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

  app.post('/v1/billing/subscribe', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { planSlug } = request.body as any;

    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, planSlug)).limit(1);
    if (!plan) return reply.code(404).send({ error: 'Plan not found' });

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

      await db.insert(billingEvents).values({
        userId: user.id,
        subscriptionId: existingSub.id,
        eventType: existingSub.planId === plan.id ? 'reactivated' : 'plan_changed',
        amount: plan.price,
        metadata: { fromPlan: existingSub.planId, toPlan: plan.id, planSlug },
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

    await db.insert(activityFeed).values({
      userId: user.id,
      action: 'subscribed',
      entityType: 'subscription',
      metadata: { planName: plan.name, planSlug },
    });

    return { ok: true, plan: plan.name };
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
