import express, { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db, usersTable, stripeEventsTable } from "@workspace/db";
import { CreateCheckoutSessionBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { planOf } from "../lib/plans";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];
const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"];
const STRIPE_PRO_PRICE_ID = process.env["STRIPE_PRO_PRICE_ID"];
const STRIPE_TUTOR_PRICE_ID = process.env["STRIPE_TUTOR_PRICE_ID"];

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

function isDemoMode(): boolean {
  return !stripe || (!STRIPE_PRO_PRICE_ID && !STRIPE_TUTOR_PRICE_ID);
}

function priceIdFor(plan: string): string | undefined {
  if (plan === "pro") return STRIPE_PRO_PRICE_ID;
  if (plan === "tutor") return STRIPE_TUTOR_PRICE_ID;
  return undefined;
}

function planForPrice(priceId: string | undefined): "pro" | "tutor" | null {
  if (!priceId) return null;
  if (priceId === STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === STRIPE_TUTOR_PRICE_ID) return "tutor";
  return null;
}

function originFor(req: Request): string {
  // Prefer the canonical app origin so Stripe redirects can't be hijacked
  // by spoofed Host headers.
  const canonical = process.env["APP_PUBLIC_URL"];
  if (canonical) return canonical.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

router.get("/billing/status", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  res.json({
    plan: planOf(user),
    demoMode: isDemoMode(),
    renewsAt: null,
    cancelAtPeriodEnd: false,
  });
});

router.post("/billing/checkout", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = CreateCheckoutSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (isDemoMode()) {
    await db
      .update(usersTable)
      .set({ plan: parsed.data.plan })
      .where(eq(usersTable.id, user.id));
    res.json({
      url: null,
      demoMode: true,
      message: `Demo mode: instantly upgraded to ${parsed.data.plan.toUpperCase()}. In production this opens Stripe Checkout.`,
      plan: parsed.data.plan,
    });
    return;
  }
  const priceId = priceIdFor(parsed.data.plan);
  if (!priceId) {
    res.status(400).json({ error: `No Stripe price configured for ${parsed.data.plan}` });
    return;
  }
  const origin = originFor(req);
  try {
    const session = await stripe!.checkout.sessions.create({
      mode: "subscription",
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
      client_reference_id: String(user.id),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app/account?upgraded=1`,
      cancel_url: `${origin}/pricing?canceled=1`,
      metadata: { userId: String(user.id), plan: parsed.data.plan },
      subscription_data: {
        metadata: { userId: String(user.id), plan: parsed.data.plan },
      },
    });
    res.json({
      url: session.url,
      demoMode: false,
      message: "Redirecting to Stripe Checkout",
      plan: parsed.data.plan,
    });
  } catch (err) {
    req.log.error({ err }, "Stripe checkout session creation failed");
    res.status(500).json({ error: "Failed to start checkout" });
  }
});

router.post("/billing/portal", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  if (isDemoMode()) {
    await db
      .update(usersTable)
      .set({ plan: "free" })
      .where(eq(usersTable.id, user.id));
    res.json({
      url: null,
      demoMode: true,
      message: "Demo mode: subscription canceled and reset to FREE. In production this opens the Stripe billing portal.",
      plan: "free",
    });
    return;
  }
  if (!user.stripeCustomerId) {
    res.status(400).json({ error: "No Stripe customer on file. Complete a checkout first." });
    return;
  }
  try {
    const portalSession = await stripe!.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${originFor(req)}/app/account`,
    });
    res.json({
      url: portalSession.url,
      demoMode: false,
      message: "Opening billing portal",
      plan: planOf(user),
    });
  } catch (err) {
    req.log.error({ err }, "Stripe billing portal session failed");
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

// Stripe webhook — must receive the raw body to verify the signature.
// Mounted with `express.raw()` instead of the default JSON parser.
router.post(
  "/billing/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      res.status(503).json({ error: "Webhook not configured" });
      return;
    }
    const sig = req.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      res.status(400).json({ error: "Missing signature" });
      return;
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ err }, "Stripe webhook signature verification failed");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    // Idempotency guard — atomically claim the event id. ON CONFLICT DO NOTHING
    // returns 0 rows when another concurrent delivery already claimed it; we
    // skip in that case. We only mark "claimed" here; if business logic fails
    // below, we delete the row so Stripe's retry can reprocess the event.
    const claimed = await db
      .insert(stripeEventsTable)
      .values({ eventId: event.id, type: event.type })
      .onConflictDoNothing({ target: stripeEventsTable.eventId })
      .returning({ eventId: stripeEventsTable.eventId });
    if (claimed.length === 0) {
      logger.info({ eventId: event.id, type: event.type }, "Stripe event already processed");
      res.json({ received: true, duplicate: true });
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = Number(session.client_reference_id);
          const plan = (session.metadata?.["plan"] ?? "pro") as "pro" | "tutor";
          if (Number.isFinite(userId)) {
            await db
              .update(usersTable)
              .set({
                plan,
                stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
                stripeSubscriptionId:
                  typeof session.subscription === "string" ? session.subscription : null,
              })
              .where(eq(usersTable.id, userId));
          }
          break;
        }
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const priceId = sub.items.data[0]?.price.id;
          const plan = planForPrice(priceId);
          const userId = Number(sub.metadata?.["userId"]);
          if (plan && Number.isFinite(userId)) {
            await db.update(usersTable).set({ plan }).where(eq(usersTable.id, userId));
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = Number(sub.metadata?.["userId"]);
          if (Number.isFinite(userId)) {
            await db
              .update(usersTable)
              .set({ plan: "free", stripeSubscriptionId: null })
              .where(eq(usersTable.id, userId));
          }
          break;
        }
        default:
          // Other events are acknowledged but not acted on.
          break;
      }
      res.json({ received: true });
    } catch (err) {
      // Release the idempotency claim so Stripe's retry can re-process this event.
      await db
        .delete(stripeEventsTable)
        .where(eq(stripeEventsTable.eventId, event.id))
        .catch((e) =>
          logger.error({ err: e, eventId: event.id }, "Failed to release stripe event claim"),
        );
      logger.error({ err, eventType: event.type }, "Stripe webhook handler failed");
      res.status(500).json({ error: "Webhook handler failed" });
    }
  },
);

export default router;
