import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { subscriptions, subscriptionPlans, billingEvents, modules, tenantEntitlements, tenants, tenantApplicationSubscriptions, addonSubscriptions } from '../schema.js';
import { eq, desc, isNull, asc, and, inArray, sql } from 'drizzle-orm';
import { authenticate, getUserPlanLimits } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { resolveTenantContext } from '../lib/tenant-auth.js';
import {
  getUserPlanConfig, getUserUsageSummary, getDowngradeViolations,
  isDowngrade, PLAN_CONFIGS, FEATURE_LABELS, LIMIT_LABELS,
  PLAN_CATALOG_BY_SLUG,
} from '../lib/plans.js';
import {
  cancelSubscription, reactivateSubscription,
  createPortalSession, processWebhookEvent,
  isStripeEnabled, getBillingMode,
  cancelAddon, processAddonWebhookEvent,
  classifyWebhookEvent, claimStripeEvent,
  markStripeEventProcessed, markStripeEventFailed,
  createStackCheckoutSession,
  changeStackFreeCompanion,
  CommercePolicyError,
  legacyPlanSalesClosed,
  legacyAddonSalesClosed,
  recordTorqueStripeEventDispatch,
} from '../lib/billing-service.js';
import {
  isTorqueTokenStripeEvent,
  OperatorOsTokenBillingError,
  receiveVerifiedTorqueTokenStripeEvent,
  registerTorqueTokenWebhookHandler,
} from '../lib/operatoros-token-billing.js';
import { getPaymentProviderAdapter } from '../lib/shared-provider-adapters.js';
import {
  COMPANION_MODULES,
  COMPANION_MODULE_PRICE_CENTS,
  CORE_PRODUCTS,
  DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
  FREE_WITH_ANY_ACCOUNT,
  getCanonicalModuleDisplayName,
} from '@operatoros/sdk';
import { ProductEntitlementConflictError } from '../lib/product-entitlements.js';
import { processCallCommandLaneWebhookEvent } from '../lib/callcommand-lane-billing.js';
import {
  CALLCOMMAND_NUMBER_FEATURE_KEY,
  processCallCommandNumberWebhookEvent,
} from '../lib/callcommand-number-billing.js';

export async function registerBillingRoutes(app: FastifyInstance) {
  const ownerRequired = (ctx: { viaPlatformRole?: boolean; role?: string }, reply: any) => {
    if (ctx.viaPlatformRole || ctx.role === 'owner') return false;
    reply.code(403).send({ error: 'Tenant owner access required', code: 'TENANT_OWNER_REQUIRED' });
    return true;
  };
  const billingReadRequired = (ctx: { viaPlatformRole?: boolean; role?: string }, reply: any) => {
    if (ctx.viaPlatformRole || ctx.role === 'owner' || ctx.role === 'admin') return false;
    reply.code(403).send({ error: 'Tenant billing visibility requires an owner or administrator', code: 'TENANT_BILLING_READ_REQUIRED' });
    return true;
  };
  registerTorqueTokenWebhookHandler();
  app.get('/v1/billing/catalog', async () => ({
    operatorOsMonthlyPriceCents: 0,
    coreProducts: CORE_PRODUCTS,
    includedApps: FREE_WITH_ANY_ACCOUNT,
    companionModules: COMPANION_MODULES,
    billingInterval: 'month',
    includedSeats: 5,
    includedCompanionCount: 1,
    companionModuleMonthlyPriceCents: COMPANION_MODULE_PRICE_CENTS,
    additionalSeatMonthlyPriceCents: DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
    stripeConfigured: {
      tradeflowkit: !!process.env.STRIPE_PRICE_TRADEFLOWKIT_MONTHLY,
      pulsedesk: !!process.env.STRIPE_PRICE_PULSEDESK_MONTHLY,
      techdeck: !!process.env.STRIPE_PRICE_TECHDECK_MONTHLY,
      companionModule: !!process.env.STRIPE_PRICE_COMPANION_MODULE_MONTHLY,
      additionalSeat: !!process.env.STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY,
    },
  }));

  app.get('/v1/billing/stack', { preHandler: [authenticate] }, async (request, reply) => {
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    if (billingReadRequired(ctx, reply)) return;
    const [tenant] = await db.select({ seatLimit: tenants.seatLimit })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);
    const entitlements = await db.select({
      entitlementKey: tenantEntitlements.entitlementKey,
      entitlementType: tenantEntitlements.entitlementType,
      source: tenantEntitlements.source,
      active: tenantEntitlements.active,
      createdAt: tenantEntitlements.createdAt,
    }).from(tenantEntitlements)
      .where(and(
        eq(tenantEntitlements.tenantId, ctx.tenantId),
        eq(tenantEntitlements.active, true),
      ))
      .orderBy(asc(tenantEntitlements.createdAt));
    const [applicationSubscription] = await db.select({
      status: tenantApplicationSubscriptions.status,
      coreProduct: tenantApplicationSubscriptions.coreProduct,
      includedCompanionKey: tenantApplicationSubscriptions.includedCompanionKey,
      additionalModuleKeys: tenantApplicationSubscriptions.additionalModuleKeys,
      additionalSeats: tenantApplicationSubscriptions.additionalSeats,
      cancelAtPeriodEnd: tenantApplicationSubscriptions.cancelAtPeriodEnd,
      currentPeriodStart: tenantApplicationSubscriptions.currentPeriodStart,
      currentPeriodEnd: tenantApplicationSubscriptions.currentPeriodEnd,
    }).from(tenantApplicationSubscriptions)
      .where(eq(tenantApplicationSubscriptions.tenantId, ctx.tenantId))
      .limit(1);
    const legacyResult = await db.execute(sql`
      SELECT sp.slug AS plan_slug, sp.name AS plan_name, s.status,
             s.cancel_at_period_end, s.current_period_end
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id=s.plan_id
      JOIN tenants t ON t.id=${ctx.tenantId} AND t.owner_user_id=s.user_id
      WHERE s.tenant_id=${ctx.tenantId}
        AND s.legacy_access_grandfathered_at IS NOT NULL
      ORDER BY s.created_at DESC
      LIMIT 1
    `);
    const legacy = legacyResult.rows[0] as Record<string, unknown> | undefined;
    const legacyAddonContracts = await db.select({
      moduleSlug: modules.slug,
      status: addonSubscriptions.status,
      cancelAtPeriodEnd: addonSubscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: addonSubscriptions.currentPeriodEnd,
    }).from(addonSubscriptions)
      .innerJoin(modules, eq(modules.id, addonSubscriptions.moduleId))
      .where(and(
        eq(addonSubscriptions.tenantId, ctx.tenantId),
        sql`${addonSubscriptions.status} IN ('active','trialing','past_due')`,
      ));
    return {
      tenantId: ctx.tenantId,
      seatLimit: tenant?.seatLimit ?? 0,
      entitlements,
      applicationSubscription: applicationSubscription ?? null,
      legacyContract: {
        grandfathered: !!legacy,
        planSlug: typeof legacy?.plan_slug === 'string' ? legacy.plan_slug : null,
        planName: typeof legacy?.plan_name === 'string' ? legacy.plan_name : null,
        status: typeof legacy?.status === 'string' ? legacy.status : null,
        cancelAtPeriodEnd: legacy?.cancel_at_period_end === true,
        currentPeriodEnd: legacy?.current_period_end ?? null,
      },
      legacyAddonContracts,
    };
  });

  app.post('/v1/billing/stack/checkout', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    if (ownerRequired(ctx, reply)) return;
    if (!isStripeEnabled()) {
      return reply.code(409).send({ error: 'Stripe checkout is not configured', code: 'STRIPE_NOT_CONFIGURED' });
    }

    try {
      const body = (request.body ?? {}) as any;
      const result = await createStackCheckoutSession({
        tenantId: ctx.tenantId,
        userId: user.id,
        coreProduct: body.coreProduct,
        freeCompanionModule: body.freeCompanionModule,
        additionalModules: body.additionalModules,
        additionalSeats: body.additionalSeats,
        interval: body.interval,
      });
      await writeAudit({
        actorUserId: user.id,
        tenantId: ctx.tenantId,
        targetType: 'stripe_checkout',
        targetId: result.sessionId,
        action: 'core_product_stack_checkout_created',
        extra: {
          coreProduct: body.coreProduct,
          freeCompanionModule: body.freeCompanionModule,
          additionalModules: body.additionalModules ?? [],
          additionalSeats: body.additionalSeats ?? 0,
        },
        ipAddress: request.ip,
      }, request);
      return result;
    } catch (error) {
      const policy = error instanceof CommercePolicyError || error instanceof ProductEntitlementConflictError;
      return reply.code(policy ? error.httpStatus : 400).send({
        error: error instanceof Error ? error.message : 'Could not create checkout',
        code: policy ? error.code : 'STACK_CHECKOUT_INVALID',
      });
    }
  });

  app.post('/v1/billing/stack/free-companion', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    if (ownerRequired(ctx, reply)) return;
    try {
      const moduleKey = (request.body as any)?.moduleKey;
      await changeStackFreeCompanion(ctx.tenantId, moduleKey);
      await writeAudit({
        actorUserId: user.id,
        tenantId: ctx.tenantId,
        targetType: 'tenant_entitlement',
        targetId: moduleKey,
        action: 'free_companion_changed',
        after: { moduleKey },
        ipAddress: request.ip,
      }, request);
      return { ok: true, moduleKey };
    } catch (error) {
      const policy = error instanceof CommercePolicyError;
      return reply.code(policy ? error.httpStatus : 400).send({
        error: error instanceof Error ? error.message : 'Could not change companion module',
        code: policy ? error.code : 'FREE_COMPANION_INVALID',
      });
    }
  });

  app.get('/v1/billing/subscription', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    if (billingReadRequired(ctx, reply)) return;
    const result = await db.execute(sql`
      SELECT s.id FROM subscriptions s
      JOIN tenants t ON t.id=${ctx.tenantId} AND t.owner_user_id=s.user_id
      WHERE s.tenant_id=${ctx.tenantId}
        AND s.legacy_access_grandfathered_at IS NOT NULL
      ORDER BY s.created_at DESC
      LIMIT 1
    `);
    const legacyId = result.rows[0]?.id;
    const [sub] = typeof legacyId === 'string'
      ? await db.select().from(subscriptions).where(eq(subscriptions.id, legacyId)).limit(1)
      : [];
    let plan = null;
    if (sub) {
      [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
    }
    const [tenantOwner] = await db.select({ ownerUserId: tenants.ownerUserId })
      .from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    const limits = await getUserPlanLimits(tenantOwner?.ownerUserId ?? user.id, ctx.tenantId);
    return {
      subscription: sub ? {
        id: sub.id,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        trialEnd: sub.trialEnd,
      } : null,
      plan: plan ? {
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        price: plan.price,
        interval: plan.interval,
        limits: {
          maxWorkspaces: plan.maxWorkspaces,
          maxProjects: plan.maxProjects,
          maxTasks: plan.maxTasks,
          maxTeamMembers: plan.maxTeamMembers,
          maxAiActionsPerMonth: plan.maxAiActionsPerMonth,
        },
        features: {
          exports: plan.hasExports,
          automation: plan.hasAutomation,
          templates: plan.hasTemplates,
          advancedAnalytics: plan.hasAdvancedAnalytics,
        },
      } : null,
      limits,
    };
  });

  app.get('/v1/billing/usage', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    const [tenantOwner] = await db.select({ ownerUserId: tenants.ownerUserId })
      .from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    const { config, subscription } = await getUserPlanConfig(tenantOwner?.ownerUserId ?? user.id, ctx.tenantId);
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
    // Task #98: marketing /pricing now sources live amounts from this
    // endpoint, so we also surface the per-add-on display prices that
    // the platform admin sets on `modules.metadata.addonPriceCents`.
    // Returned shape is public-safe: slug, name, and display price only —
    // no Stripe price IDs, env keys, or admin-only fields.
    const addonRows = await db.select({
      slug: modules.slug,
      name: modules.name,
      metadata: modules.metadata,
    })
      .from(modules)
      .where(and(
        isNull(modules.archivedAt),
        inArray(modules.slug, COMPANION_MODULES.map(module => module.key)),
      ))
      .orderBy(asc(modules.ord), asc(modules.slug));
    const addons = addonRows.map(row => {
      const cents = (row.metadata as Record<string, unknown> | null)?.addonPriceCents;
      return {
        slug: row.slug,
        name: getCanonicalModuleDisplayName(row.slug) ?? row.name,
        addonPriceCents: typeof cents === 'number' ? cents : null,
      };
    });

    return {
      legacyPlansSalesStatus: 'grandfathered_only',
      plans: PLAN_CONFIGS.map(p => {
        // Task #66 round 3: thread shared display pricing through to the
        // BillingPage so the UI never re-derives annual cost from monthly.
        // PLAN_CATALOG_BY_SLUG owns both numbers; if a slug is somehow
        // missing from the catalog we fall back to the legacy field so
        // the response shape stays compatible.
        const cat = PLAN_CATALOG_BY_SLUG[p.slug];
        return {
          slug: p.slug, name: p.name, price: p.price, interval: p.interval,
          description: p.description, highlight: p.highlight,
          limits: p.limits, features: p.features,
          displayMonthlyPriceCents: cat?.monthlyPriceCents ?? p.price,
          displayAnnualPriceCents: cat?.annualPriceCents ?? null,
          salesStatus: 'grandfathered_only',
        };
      }),
      addons,
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
    try {
      const ctx = await resolveTenantContext(request);
      if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      if (ownerRequired(ctx, reply)) return;
      return legacyPlanSalesClosed();
    } catch (err: unknown) {
      if (err instanceof CommercePolicyError) {
        return reply.code(err.httpStatus).send({ error: err.message, code: err.code });
      }
      const message = err instanceof Error ? err.message : 'Subscription failed';
      return reply.code(400).send({ error: message });
    }
  });

  app.post('/v1/billing/create-checkout-session', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const ctx = await resolveTenantContext(request);
      if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      if (ownerRequired(ctx, reply)) return;
      return legacyPlanSalesClosed();
    } catch (err: unknown) {
      if (err instanceof CommercePolicyError) {
        return reply.code(err.httpStatus).send({ error: err.message, code: err.code });
      }
      const errCode = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : 'Checkout failed';
      const httpCode = errCode === 'NO_STRIPE_PRICE_FOR_INTERVAL' ? 409 : 400;
      return reply.code(httpCode).send({ error: message, code: errCode });
    }
  });

  app.post('/v1/billing/create-portal-session', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    if (ownerRequired(ctx, reply)) return;

    if (!isStripeEnabled()) {
      return reply.code(400).send({
        error: 'Stripe is not configured. Use the in-app billing page to manage your subscription.',
        mode: 'local',
      });
    }

    try {
      const result = await createPortalSession(user.id, ctx.tenantId);
      await writeAudit({
        actorUserId: user.id,
        tenantId: ctx.tenantId,
        targetType: 'user',
        targetId: user.id,
        action: 'billing_portal_opened',
        ipAddress: request.ip ?? null,
      }, request);
      return result;
    } catch (err: any) {
      if (err instanceof CommercePolicyError) {
        return reply.code(err.httpStatus).send({ error: err.message, code: err.code });
      }
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post('/v1/billing/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    if (ownerRequired(ctx, reply)) return;
    try {
      return await cancelSubscription(user.id, ctx.tenantId);
    } catch (error) {
      if (error instanceof CommercePolicyError) {
        return reply.code(error.httpStatus).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.post('/v1/billing/reactivate', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    if (ownerRequired(ctx, reply)) return;
    try {
      return await reactivateSubscription(user.id, ctx.tenantId);
    } catch (error) {
      if (error instanceof CommercePolicyError) {
        return reply.code(error.httpStatus).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.get('/v1/billing/history', { preHandler: [authenticate] }, async (request, reply) => {
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    if (billingReadRequired(ctx, reply)) return;
    const events = await db.select().from(billingEvents)
      .where(eq(billingEvents.tenantId, ctx.tenantId))
      .orderBy(desc(billingEvents.createdAt))
      .limit(50);
    return {
      events: events.map(event => {
        const metadata = (event.metadata ?? {}) as Record<string, unknown>;
        return {
          id: event.id,
          eventType: event.eventType,
          amount: event.amount,
          currency: event.currency,
          createdAt: event.createdAt,
          metadata: {
            coreProduct: typeof metadata.coreProduct === 'string' ? metadata.coreProduct : null,
            planSlug: typeof metadata.planSlug === 'string' ? metadata.planSlug : null,
            moduleSlug: typeof metadata.moduleSlug === 'string' ? metadata.moduleSlug : null,
          },
        };
      }),
    };
  });

  // -------------------------------------------------------------------------
  // Add-on subscriptions (per-module)
  // -------------------------------------------------------------------------
  app.post('/v1/billing/addons/subscribe', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const ctx = await resolveTenantContext(request);
      if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      if (ownerRequired(ctx, reply)) return;
      return legacyAddonSalesClosed();
    } catch (err: any) {
      if (err instanceof CommercePolicyError) {
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
      const ctx = await resolveTenantContext(request);
      if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      if (ownerRequired(ctx, reply)) return;
      const result = await cancelAddon(user.id, ctx.tenantId, moduleSlug);
      if (!result.ok) return reply.code(400).send(result);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post('/v1/billing/webhook', async (request, reply) => {
    const paymentAdapter = getPaymentProviderAdapter();
    if (paymentAdapter.status.state === 'disabled') {
      request.log.warn('billing_webhook_rejected_stripe_not_configured');
      return reply.code(503).send({
        error: 'Stripe webhook processing is not configured',
        code: 'STRIPE_NOT_CONFIGURED',
      });
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
      const event = await paymentAdapter.verifyWebhook(rawBody, signature) as any;

      // Canonical revenue dispatcher: Torque credit events are routed before
      // the generic plan/add-on claim. Signature verification happens exactly
      // once, and the shared receipt owns exactly-once fulfillment.
      if (await isTorqueTokenStripeEvent(event)) {
        const received = await receiveVerifiedTorqueTokenStripeEvent({ event, rawBody });
        const receipt = received.receipt as Record<string, any>;
        const payload = (receipt.safe_payload_json ?? {}) as Record<string, any>;
        await recordTorqueStripeEventDispatch({
          event,
          tenantId: String(receipt.tenant_id),
          userId: String(payload.userId),
          purchaseId: String(payload.purchaseId),
          receiptId: String(receipt.id),
          status: received.status,
          errorCode: receipt.last_error_code ? String(receipt.last_error_code) : null,
        });
        return reply.code(received.status === 'processed' ? 200 : 202).send({
          received: true,
          kind: 'torque_assist_credit',
          handled: received.status === 'processed',
          duplicate: received.duplicate,
          status: received.status,
        });
      }

      // Single idempotency point for ALL Stripe webhook events. Classify
      // first (checks metadata in object / subscription_data /
      // subscription_details / invoice line items), then claim by event.id
      // with ON CONFLICT DO NOTHING. Duplicate => return early without
      // running side effects. Handler outcome updates the claim row with
      // processed_at or error_message so admin DLQ retry can see it.
      const classification = classifyWebhookEvent(event);
      const { claimedRowId, isDuplicate, duplicateState } = await claimStripeEvent(event, classification);

      if (isDuplicate) {
        const kind = classification.isFeatureAddon ? 'feature_addon' : classification.isAddon ? 'addon' : 'plan';
        if (duplicateState === 'payload_mismatch') {
          return reply.code(400).send({
            received: false,
            kind,
            handled: false,
            code: 'STRIPE_EVENT_ID_PAYLOAD_MISMATCH',
          });
        }
        if (duplicateState === 'in_flight') {
          // The first worker may still succeed, but a 2xx here would tell
          // Stripe to discard its retry schedule even if that worker crashes
          // before committing the side effect. Keep provider retry alive; a
          // later redelivery either observes `processed` or reclaims the
          // expired processing lease on the same immutable event row.
          return reply.code(503).send({
            received: true,
            kind,
            handled: false,
            code: 'WEBHOOK_PROCESSING_IN_PROGRESS',
          });
        }
        console.log(`[billing webhook] ${event.type} (${kind}): duplicate event, no-op`);
        return { received: true, kind, handled: true, action: 'duplicate_ignored' };
      }

      let result: { handled: boolean; action?: string; error?: string };
      try {
        result = classification.isFeatureAddon
          ? classification.featureKey === CALLCOMMAND_NUMBER_FEATURE_KEY
            ? await processCallCommandNumberWebhookEvent(event)
            : await processCallCommandLaneWebhookEvent(event)
          : classification.isAddon
            ? await processAddonWebhookEvent(event)
            : await processWebhookEvent(event);
      } catch (err: any) {
        if (claimedRowId) await markStripeEventFailed(claimedRowId, err.message ?? String(err));
        return reply.code(503).send({
          received: true,
          handled: false,
          code: 'WEBHOOK_PROCESSING_RETRY_REQUIRED',
        });
      }

      if (claimedRowId) {
        if (result.handled) {
          await markStripeEventProcessed(claimedRowId, result.action);
        } else {
          await markStripeEventFailed(claimedRowId, result.error ?? 'not_handled');
          return reply.code(503).send({
            received: true,
            handled: false,
            code: 'WEBHOOK_PROCESSING_RETRY_REQUIRED',
          });
        }
      }

      const kind = classification.isFeatureAddon ? 'feature_addon' : classification.isAddon ? 'addon' : 'plan';
      console.log(`[billing webhook] ${event.type} (${kind}): handled=${result.handled} action=${result.action || 'none'} matched=${classification.matchedAt}`);
      return { received: true, kind, ...result };
    } catch (err: any) {
      console.error('[billing webhook] Verification or processing failed', {
        code: typeof err?.code === 'string' ? err.code : 'WEBHOOK_REJECTED',
      });
      if (err instanceof OperatorOsTokenBillingError) {
        return reply.code(err.statusCode).send({
          error: 'Torque payment event validation failed',
          code: err.code,
        });
      }
      return reply.code(400).send({
        error: 'Webhook verification or processing failed',
        code: 'WEBHOOK_REJECTED',
      });
    }
  });
}
