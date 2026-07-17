import { Router, type IRouter, raw } from "express";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, usersTable, stripeEventsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { STRIPE_ENABLED, STRIPE_WEBHOOK_SECRET, getStripe, priceToPlan } from "../lib/stripe";

const router: IRouter = Router();

// IMPORTANT: this router must be mounted BEFORE express.json() with raw body
router.post(
  "/api/webhooks/stripe",
  raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    if (!STRIPE_ENABLED) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }
    if (!STRIPE_WEBHOOK_SECRET) {
      logger.error("STRIPE_WEBHOOK_SECRET missing; refusing webhook");
      res.status(503).json({ error: "Webhook secret not configured" });
      return;
    }
    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    const stripe = getStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ err }, "Stripe webhook signature verification failed");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    // Idempotency: skip events we've already successfully processed.
    try {
      const inserted = await db
        .insert(stripeEventsTable)
        .values({ id: event.id, type: event.type })
        .onConflictDoNothing({ target: stripeEventsTable.id })
        .returning({ id: stripeEventsTable.id });
      if (inserted.length === 0) {
        logger.info({ eventId: event.id, type: event.type }, "Stripe webhook: duplicate event ignored");
        res.json({ received: true, duplicate: true, type: event.type });
        return;
      }
    } catch (err) {
      logger.error({ err, eventId: event.id }, "Stripe webhook: dedup insert failed");
      // Treat as transient — return 500 so Stripe retries.
      res.status(500).json({ error: "Internal error" });
      return;
    }

    try {
      await handleEvent(stripe, event);
    } catch (err) {
      logger.error({ err, type: event.type, eventId: event.id }, "Stripe webhook handler error");
      // Roll back dedup so Stripe's retry can re-process this event.
      await db
        .delete(stripeEventsTable)
        .where(eq(stripeEventsTable.id, event.id))
        .catch((cleanupErr) =>
          logger.error({ err: cleanupErr, eventId: event.id }, "Failed to roll back dedup row"),
        );
      res.status(500).json({ error: "Handler failed" });
      return;
    }

    res.json({ received: true, type: event.type });
  },
);

async function findUserIdFromCustomer(customerId: string): Promise<number | null> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.stripeCustomerId, customerId));
  return u?.id ?? null;
}

async function applySubscription(stripe: Stripe, sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let userId = await findUserIdFromCustomer(customerId);
  if (!userId) {
    // Recover from metadata if customer wasn't yet linked
    const metaUserId = sub.metadata?.["userId"];
    if (metaUserId) userId = Number(metaUserId);
  }
  if (!userId) {
    logger.warn({ customerId, subId: sub.id }, "Webhook: no matching user for subscription");
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  const plan = priceToPlan(priceId);
  const isActive = sub.status === "active" || sub.status === "trialing";
  // Stripe API moved current_period_end onto subscription items; fall back to root for older shapes.
  const periodEndUnix =
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  await db
    .update(usersTable)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      plan: isActive && plan ? plan : "free",
      subscriptionStatus: sub.status,
      subscriptionPeriodEnd: periodEnd,
    })
    .where(eq(usersTable.id, userId));

  logger.info({ userId, plan, status: sub.status }, "Stripe subscription synced");
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        // Make sure customer is linked first via client_reference_id
        if (session.client_reference_id && session.customer) {
          const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
          await db
            .update(usersTable)
            .set({ stripeCustomerId: customerId })
            .where(eq(usersTable.id, Number(session.client_reference_id)));
        }
        await applySubscription(stripe, sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await applySubscription(stripe, sub);
      break;
    }
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice & {
        subscription?: string | { id: string } | null;
      };
      const subRef = inv.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        await applySubscription(stripe, sub);
      }
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (customerId) {
        const userId = await findUserIdFromCustomer(customerId);
        if (userId) {
          await db
            .update(usersTable)
            .set({ subscriptionStatus: "past_due" })
            .where(eq(usersTable.id, userId));
          logger.warn({ userId, invoice: inv.id }, "Invoice payment failed; marked past_due");
        }
      }
      break;
    }
    default:
      logger.debug({ type: event.type }, "Stripe webhook: unhandled event type");
  }
}

export default router;
