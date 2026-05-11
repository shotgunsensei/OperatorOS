import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { subscriptions, subscriptionPlans, billingEvents } from '../schema.js';
import { eq, desc } from 'drizzle-orm';
import { authenticate, getUserPlanLimits } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { canPurchaseAddon, resolveTenantContext } from '../lib/tenant-auth.js';
import {
  getUserPlanConfig, getUserUsageSummary, getDowngradeViolations,
  isDowngrade, PLAN_CONFIGS, FEATURE_LABELS, LIMIT_LABELS,
} from '../lib/plans.js';
import {
  subscribeToPlan, cancelSubscription, reactivateSubscription,
  createCheckoutSession, createPortalSession, processWebhookEvent,
  verifyWebhookSignature, isStripeEnabled, getBillingMode,
  subscribeToAddon, cancelAddon, processAddonWebhookEvent,
  AddonNotPurchasableError, classifyWebhookEvent, claimStripeEvent,
  markStripeEventProcessed, markStripeEventFailed,
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

  app.get('/v1/billing/usage', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    const { config, subscription } = await getUserPlanConfig(user.id);
    const usage = await getUserUsageSummary(user.id, ctx.tenantId);
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

  app.post('/v1/billing/check-downgrade', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { planSlug } = request.body as any;
    const { config: currentConfig } = await getUserPlanConfig(user.id);

    if (!isDowngrade(currentConfig.slug, planSlug)) {
      return { violations: [], isDowngrade: false };
    }

    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    const violations = await getDowngradeViolations(user.id, ctx.tenantId, planSlug);
    return { violations, isDowngrade: true };
  });

  app.post('/v1/billing/subscribe', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const body = (request.body ?? {}) as { planSlug?: string; interval?: string };
    const planSlug = body.planSlug;
    // Task #66: monthly | annual selector. Defaults to monthly so legacy
    // clients keep working. Anything other than the two known values is
    // rejected to avoid accidentally mapping to a wrong Stripe price.
    const interval: 'month' | 'year' =
      body.interval === 'year' || body.interval === 'annual' ? 'year' : 'month';

    try {
      const ctx = await resolveTenantContext(request);
      if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      if (!planSlug) return reply.code(400).send({ error: 'planSlug is required', code: 'PLAN_SLUG_REQUIRED' });
      const result = await subscribeToPlan(user.id, ctx.tenantId, planSlug, interval);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Subscription failed';
      return reply.code(400).send({ error: message });
    }
  });

  app.post('/v1/billing/create-checkout-session', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const body = (request.body ?? {}) as { planSlug?: string; interval?: string };
    const planSlug = body.planSlug;
    const interval: 'month' | 'year' =
      body.interval === 'year' || body.interval === 'annual' ? 'year' : 'month';

    if (!planSlug) {
      return reply.code(400).send({ error: 'planSlug is required', code: 'PLAN_SLUG_REQUIRED' });
    }
    if (!isStripeEnabled()) {
      return reply.code(400).send({
        error: 'Stripe is not configured. Subscriptions are managed locally.',
        mode: 'local',
      });
    }

    try {
      const result = await createCheckoutSession(user.id, planSlug, interval);
      return result;
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : 'Checkout failed';
      const httpCode = errCode === 'NO_STRIPE_PRICE_FOR_INTERVAL' ? 409 : 400;
      return reply.code(httpCode).send({ error: message, code: errCode });
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
      await writeAudit({
        actorUserId: user.id,
        targetType: 'user',
        targetId: user.id,
        action: 'billing_portal_opened',
        ipAddress: request.ip ?? null,
      }, request);
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

  // -------------------------------------------------------------------------
  // Add-on subscriptions (per-module)
  // -------------------------------------------------------------------------
  app.post('/v1/billing/addons/subscribe', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { moduleSlug } = request.body as any;
    if (!moduleSlug) return reply.code(400).send({ error: 'moduleSlug is required' });
    try {
      // Gate 2: thread tenant scope into Stripe metadata so the webhook
      // can promote the right pending row and the right tenant gets the
      // entitlement. Precedence matches resolveTenantContext: explicit
      // body > X-Tenant-Id header > user.currentTenantId.
      const headerVal = request.headers['x-tenant-id'];
      const headerTenantId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
      const bodyTenantId = (request.body as any)?.tenantId;
      const tenantId: string | null =
        (typeof bodyTenantId === 'string' && bodyTenantId) ||
        (typeof headerTenantId === 'string' && headerTenantId) ||
        user.currentTenantId || null;

      // Gate 2 — broken-access-control fix: a tenantId from any source must
      // be authorized for this user. Super admins bypass via platformRole.
      // Without this, a member of tenant A could open a checkout that gets
      // billed to tenant B (whose entitlement they'd then receive via the
      // webhook). canPurchaseAddon also enforces module existence,
      // purchasability, and the no-double-buy invariant in one shot.
      if (tenantId && user.platformRole !== 'super_admin') {
        const check = await canPurchaseAddon(user.id, tenantId, moduleSlug);
        if (!check.allowed) {
          // Mirror the documented HTTP code policy:
          //   TENANT_NOT_FOUND      -> 404 (anti-enumeration)
          //   MODULE_NOT_FOUND      -> 404
          //   TENANT_ROLE_INSUFFICIENT -> 403
          //   ADDON_NOT_PURCHASABLE -> 409
          //   ADDON_ALREADY_ACTIVE  -> 409
          const status =
            check.code === 'TENANT_NOT_FOUND' || check.code === 'MODULE_NOT_FOUND' ? 404 :
            check.code === 'TENANT_ROLE_INSUFFICIENT' ? 403 : 409;
          return reply.code(status).send({ error: check.reason, code: check.code });
        }
      }

      const result = await subscribeToAddon(user.id, moduleSlug, {
        tenantId,
        initiatedByUserId: user.id,
      });

      // Audit: a checkout intent was created. The webhook handler will
      // log the eventual settlement; this row marks the click.
      try {
        await writeAudit({
          actorUserId: user.id,
          tenantId,
          targetType: 'addon_subscription',
          targetId: null,
          action: 'addon_checkout_initiated',
          extra: {
            moduleSlug,
            mode: result.action,
            hasCheckoutUrl: !!result.checkoutUrl,
          },
          ipAddress: request.ip,
        }, request);
      } catch (auditErr) {
        request.log.warn({ err: auditErr }, 'addon checkout audit failed');
      }

      return result;
    } catch (err: any) {
      // Distinguish billing-not-configured (409 + code) from generic
      // 400s (e.g. unknown module slug) so clients can react correctly
      // and audit consumers can identify config-bypass attempts.
      if (err instanceof AddonNotPurchasableError) {
        return reply.code(err.httpStatus).send({ error: err.message, code: err.code });
      }
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post('/v1/billing/addons/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { moduleSlug } = request.body as any;
    if (!moduleSlug) return reply.code(400).send({ error: 'moduleSlug is required' });
    try {
      const result = await cancelAddon(user.id, moduleSlug);
      if (!result.ok) return reply.code(400).send(result);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
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

      // Fail-closed: signature verification REQUIRES the exact bytes Stripe
      // sent. If raw body capture is unavailable (mis-config, wrong content
      // type, proxy stripped it), reject the request rather than trust the
      // parsed JSON — accepting it would let an attacker forge subscription
      // state mutations and grant module entitlements.
      const rawBody = (request as any).rawBody;
      if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') {
        console.error('[billing webhook] Raw body unavailable; rejecting unverifiable webhook');
        return reply.code(400).send({ error: 'Raw body unavailable for signature verification' });
      }
      const event = verifyWebhookSignature(rawBody, signature);

      // Single idempotency point for ALL Stripe webhook events. Classify
      // first (checks metadata in object / subscription_data /
      // subscription_details / invoice line items), then claim by event.id
      // with ON CONFLICT DO NOTHING. Duplicate => return early without
      // running side effects. Handler outcome updates the claim row with
      // processed_at or error_message so admin DLQ retry can see it.
      const classification = classifyWebhookEvent(event);
      const { claimedRowId, isDuplicate } = await claimStripeEvent(event, classification);

      if (isDuplicate) {
        console.log(`[billing webhook] ${event.type} (${classification.isAddon ? 'addon' : 'plan'}): duplicate event.id=${event.id}, no-op`);
        return { received: true, kind: classification.isAddon ? 'addon' : 'plan', handled: true, action: 'duplicate_ignored' };
      }

      let result: { handled: boolean; action?: string; error?: string };
      try {
        result = classification.isAddon
          ? await processAddonWebhookEvent(event)
          : await processWebhookEvent(event);
      } catch (err: any) {
        if (claimedRowId) await markStripeEventFailed(claimedRowId, err.message ?? String(err));
        throw err;
      }

      if (claimedRowId) {
        if (result.handled) {
          await markStripeEventProcessed(claimedRowId, result.action);
        } else {
          await markStripeEventFailed(claimedRowId, result.error ?? 'not_handled');
        }
      }

      console.log(`[billing webhook] ${event.type} (${classification.isAddon ? 'addon' : 'plan'}): handled=${result.handled} action=${result.action || 'none'} matched=${classification.matchedAt}`);
      return { received: true, kind: classification.isAddon ? 'addon' : 'plan', ...result };
    } catch (err: any) {
      console.error('[billing webhook] Error:', err.message);
      return reply.code(400).send({ error: err.message });
    }
  });
}
