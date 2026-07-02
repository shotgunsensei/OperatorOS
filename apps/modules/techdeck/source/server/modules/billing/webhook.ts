import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { getStripe, getPlanCodeFromPriceId, isStripeConfigured } from "./stripe";
import { storage } from "../../storage";
import { emitEvent } from "../../core/events/helpers";
import { WebhookHandlers } from "../../webhookHandlers";

export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: "Stripe not configured" });
    }

    const rawBody = req.rawBody;
    if (!rawBody || !(rawBody instanceof Buffer)) {
      return res.status(400).json({ error: "Missing raw body for signature verification" });
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    const sigString = Array.isArray(sig) ? sig[0] : sig;

    try {
      await WebhookHandlers.processWebhook(rawBody, sigString);
    } catch (err: any) {
      console.error("[stripe-webhook] stripe-replit-sync processWebhook error:", err.message);
      return res.status(400).json({ error: `Webhook verification failed: ${err.message}` });
    }

    try {
      const event = JSON.parse(rawBody.toString()) as Stripe.Event;
      await handleStripeEvent(event);
    } catch (err: any) {
      console.error(`[stripe-webhook] Error handling custom event logic:`, err);
      return res.status(500).json({ error: "Internal webhook handling error" });
    }

    res.json({ received: true });
  });
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    default:
      break;
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const tenantId = session.metadata?.tenantId;
  if (!tenantId) {
    console.error("[stripe-webhook] checkout.session.completed missing tenantId in metadata");
    return;
  }

  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!subscriptionId || !customerId) return;

  const stripe = getStripe();
  const subResponse = await stripe.subscriptions.retrieve(subscriptionId);
  const subData = subResponse as Stripe.Subscription;
  const priceId = subData.items.data[0]?.price?.id;
  const planCode = priceId ? getPlanCodeFromPriceId(priceId) : undefined;

  await emitEvent("billing.subscription_updated", tenantId, undefined, "tenant_subscription", tenantId, {
    planCode: planCode || "solo",
    status: subData.status,
    stripeSubscriptionId: subscriptionId,
    legacyAuditOnly: true,
  });
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const tenantId = subscription.metadata?.tenantId;
  let sub = tenantId ? await storage.getTenantSubscription(tenantId) : null;

  if (!sub && subscription.id) {
    sub = await storage.getTenantSubscriptionByStripeSubscriptionId(subscription.id);
  }

  if (!sub) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (customerId) {
      sub = await storage.getTenantSubscriptionByStripeCustomerId(customerId);
    }
  }

  if (!sub) {
    console.error(`[stripe-webhook] Cannot find tenant subscription for stripe sub ${subscription.id}`);
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  const planCode = priceId ? getPlanCodeFromPriceId(priceId) : sub.planCode;

  await emitEvent("billing.subscription_updated", sub.tenantId, undefined, "tenant_subscription", sub.tenantId, {
    planCode,
    status: subscription.status,
    stripeSubscriptionId: subscription.id,
    legacyAuditOnly: true,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  let sub = await storage.getTenantSubscriptionByStripeSubscriptionId(subscription.id);
  if (!sub) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (customerId) {
      sub = await storage.getTenantSubscriptionByStripeCustomerId(customerId);
    }
  }
  if (!sub) return;

  await emitEvent("billing.subscription_updated", sub.tenantId, undefined, "tenant_subscription", sub.tenantId, {
    planCode: sub.planCode,
    status: "canceled",
    stripeSubscriptionId: subscription.id,
    legacyAuditOnly: true,
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const sub = await storage.getTenantSubscriptionByStripeCustomerId(customerId);
  if (!sub) return;

  await emitEvent("billing.payment_failed", sub.tenantId, undefined, "tenant_subscription", sub.tenantId, {
    invoiceId: invoice.id,
    legacyAuditOnly: true,
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const sub = await storage.getTenantSubscriptionByStripeCustomerId(customerId);
  if (!sub) return;

  await emitEvent("billing.subscription_updated", sub.tenantId, undefined, "tenant_subscription", sub.tenantId, {
    planCode: sub.planCode,
    status: "active",
    invoiceId: invoice.id,
    legacyAuditOnly: true,
  });
}
