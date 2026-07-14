import { sendValidationError } from "../lib/http-errors";
import { Router, type IRouter } from "express";
import { eq, and, gte, count } from "drizzle-orm";
import { db, usersTable, launchKitsTable, brandProfilesTable } from "@workspace/db";
import {
  ListPlansResponse,
  SubscribeBody,
  SubscribeResponse,
  GetSubscriptionResponse,
  CreateCheckoutSessionBody,
  CreateCheckoutSessionResponse,
  CreateBillingPortalResponse,
} from "@workspace/api-zod";
import { requireUser } from "../lib/session";
import { PLAN_LIMITS, planIdFor, type PlanId } from "../lib/features";
import { STRIPE_ENABLED, getStripe, PRICE_IDS, getAppBaseUrl } from "../lib/stripe";
import { writeLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    priceMonthly: 0,
    tagline: "Test the kit forge before you commit",
    features: [
      "2 launch kits per month",
      "Basic exports (TXT only)",
      "Watermarked flyer copy",
      "Personal use only",
    ],
    ctaLabel: "Start Free",
    highlighted: false,
  },
  {
    id: "pro" as const,
    name: "Pro",
    priceMonthly: 19,
    tagline: "Built for solo operators who ship every week",
    features: [
      "Unlimited launch kits",
      "Full export system (TXT, Markdown, JSON)",
      "Ad copy variants generator",
      "Email & SMS sequence generator",
      "Brand profiles (5)",
      "No watermark",
    ],
    ctaLabel: "Go Pro",
    highlighted: true,
  },
  {
    id: "agency" as const,
    name: "Agency",
    priceMonthly: 59,
    tagline: "For teams launching for clients",
    features: [
      "Everything in Pro",
      "Client workspaces",
      "White-label exports",
      "Unlimited brand profiles",
      "Team access",
      "Commercial client-use rights",
    ],
    ctaLabel: "Scale Up",
    highlighted: false,
  },
];

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function buildSubscriptionPayload(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new Error("User not found after requireUser");
  const planId = planIdFor(user);
  const limits = PLAN_LIMITS[planId];
  const periodEnd = user.subscriptionPeriodEnd ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  })();

  const [{ value: kitsThisMonth }] = await db
    .select({ value: count() })
    .from(launchKitsTable)
    .where(and(eq(launchKitsTable.userId, user.id), gte(launchKitsTable.createdAt, startOfMonth())));
  const [{ value: brandProfilesUsed }] = await db
    .select({ value: count() })
    .from(brandProfilesTable)
    .where(eq(brandProfilesTable.userId, user.id));

  return {
    plan: planId,
    status: user.subscriptionStatus,
    currentPeriodEnd: periodEnd,
    stripeEnabled: STRIPE_ENABLED,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    limits,
    usage: {
      kitsThisMonth: Number(kitsThisMonth),
      brandProfilesUsed: Number(brandProfilesUsed),
    },
  };
}

router.get("/billing/plans", async (_req, res): Promise<void> => {
  res.json(ListPlansResponse.parse(PLANS));
});

router.post("/billing/subscribe", writeLimiter, async (req, res): Promise<void> => {
  // Demo-only path retained for test/back-compat. When Stripe is enabled,
  // clients should use /billing/checkout instead.
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const user = await requireUser(req, res);
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);
  await db
    .update(usersTable)
    .set({
      plan: parsed.data.planId,
      subscriptionStatus: STRIPE_ENABLED ? "active" : "demo",
      subscriptionPeriodEnd: periodEnd,
    })
    .where(eq(usersTable.id, user.id));
  req.log.info({ userId: user.id, plan: parsed.data.planId, stripeEnabled: STRIPE_ENABLED }, "Subscription updated (demo)");
  const payload = await buildSubscriptionPayload(user.id);
  res.json(SubscribeResponse.parse(payload));
});

router.get("/billing/subscription", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  const payload = await buildSubscriptionPayload(user.id);
  res.json(GetSubscriptionResponse.parse(payload));
});

router.post("/billing/checkout", writeLimiter, async (req, res): Promise<void> => {
  const parsed = CreateCheckoutSessionBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const planId = parsed.data.planId as Exclude<PlanId, "free">;
  const user = await requireUser(req, res);

  // Demo fallback when Stripe is not configured
  if (!STRIPE_ENABLED) {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);
    await db
      .update(usersTable)
      .set({ plan: planId, subscriptionStatus: "demo", subscriptionPeriodEnd: periodEnd })
      .where(eq(usersTable.id, user.id));
    req.log.info({ userId: user.id, plan: planId }, "Demo upgrade (Stripe disabled)");
    res.json(
      CreateCheckoutSessionResponse.parse({ url: null, demo: true, plan: planId }),
    );
    return;
  }

  const priceId = PRICE_IDS[planId];
  if (!priceId) {
    res.status(503).json({ error: `Stripe price for plan '${planId}' is not configured on the server.` });
    return;
  }

  try {
    const stripe = getStripe();
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: String(user.id) },
      });
      customerId = customer.id;
      await db.update(usersTable).set({ stripeCustomerId: customerId }).where(eq(usersTable.id, user.id));
    }

    // Prevent double-subscriptions: if user already has an active/trialing
    // subscription, send them to the billing portal to switch plans instead
    // of creating a parallel Stripe subscription.
    if (user.stripeSubscriptionId) {
      try {
        const existing = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        if (existing.status === "active" || existing.status === "trialing" || existing.status === "past_due") {
          const portal = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${getAppBaseUrl()}/account`,
          });
          res.json(
            CreateCheckoutSessionResponse.parse({ url: portal.url, demo: false, plan: planId }),
          );
          return;
        }
      } catch (err) {
        // Subscription may have been deleted upstream — fall through to fresh checkout.
        req.log.warn({ err, subId: user.stripeSubscriptionId }, "Existing subscription lookup failed; creating new checkout");
      }
    }

    const baseUrl = getAppBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/account?upgraded=1&plan=${planId}`,
      cancel_url: `${baseUrl}/pricing?canceled=1`,
      client_reference_id: String(user.id),
      metadata: { userId: String(user.id), planId },
      allow_promotion_codes: true,
    });

    res.json(
      CreateCheckoutSessionResponse.parse({ url: session.url, demo: false, plan: planId }),
    );
  } catch (err) {
    req.log.error({ err }, "Stripe checkout creation failed");
    res.status(502).json({ error: "Failed to start checkout" });
  }
});

router.post("/billing/portal", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!STRIPE_ENABLED) {
    res.json(
      CreateBillingPortalResponse.parse({
        url: null,
        available: false,
        reason: "Stripe is not configured on the server.",
      }),
    );
    return;
  }
  if (!user.stripeCustomerId) {
    res.json(
      CreateBillingPortalResponse.parse({
        url: null,
        available: false,
        reason: "No Stripe customer record. Subscribe to a paid plan first.",
      }),
    );
    return;
  }
  try {
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${getAppBaseUrl()}/account`,
    });
    res.json(
      CreateBillingPortalResponse.parse({ url: portal.url, available: true, reason: null }),
    );
  } catch (err) {
    req.log.error({ err }, "Stripe portal creation failed");
    res.status(502).json({ error: "Failed to open billing portal" });
  }
});

export default router;
