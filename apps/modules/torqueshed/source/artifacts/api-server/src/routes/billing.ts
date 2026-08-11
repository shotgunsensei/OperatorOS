import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import {
  auditEvents,
  db,
  tokenLedgerEntries,
  tokenPackages,
  tokenPurchases,
} from "@workspace/db";
import { asyncRoute, HttpError, requireUser, stringValue } from "../lib/http";

const router = Router();
const stripeApi = "https://api.stripe.com/v1";

const configuredPackages = [
  { id: "starter-10", name: "Starter", tokenAmount: 10, priceCents: 500, sortOrder: 10, env: "STRIPE_PRICE_TORQUE_ASSIST_10" },
  { id: "builder-30", name: "Builder", tokenAmount: 30, priceCents: 1200, sortOrder: 20, env: "STRIPE_PRICE_TORQUE_ASSIST_30" },
  { id: "shop-75", name: "Shop", tokenAmount: 75, priceCents: 2500, sortOrder: 30, env: "STRIPE_PRICE_TORQUE_ASSIST_75" },
] as const;

async function syncTokenPackages() {
  await Promise.all(
    configuredPackages.map((pack) =>
      db
        .insert(tokenPackages)
        .values({
          id: pack.id,
          name: pack.name,
          tokenAmount: pack.tokenAmount,
          priceCents: pack.priceCents,
          stripePriceId: process.env[pack.env]?.trim() || null,
          sortOrder: pack.sortOrder,
        })
        .onConflictDoUpdate({
          target: tokenPackages.id,
          set: {
            name: pack.name,
            tokenAmount: pack.tokenAmount,
            priceCents: pack.priceCents,
            stripePriceId: process.env[pack.env]?.trim() || null,
            sortOrder: pack.sortOrder,
            active: true,
            updatedAt: new Date(),
          },
        }),
    ),
  );
}

router.get(
  "/billing/packages",
  asyncRoute(async (request, response) => {
    await requireUser(request);
    await syncTokenPackages();
    const packages = await db.select({
      id: tokenPackages.id,
      name: tokenPackages.name,
      tokenAmount: tokenPackages.tokenAmount,
      priceCents: tokenPackages.priceCents,
      currency: tokenPackages.currency,
      checkoutConfigured: tokenPackages.stripePriceId,
    }).from(tokenPackages).where(eq(tokenPackages.active, true)).orderBy(tokenPackages.sortOrder);
    return response.json({ packages: packages.map((pack) => ({ ...pack, checkoutConfigured: Boolean(pack.checkoutConfigured) })) });
  }),
);

router.post(
  "/billing/checkout",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) throw new HttpError(503, "stripe_not_configured", "Token checkout is not configured.");
    await syncTokenPackages();
    const packageId = stringValue(request.body?.packageId, "packageId", { max: 80 })!;
    const [pack] = await db.select().from(tokenPackages).where(and(eq(tokenPackages.id, packageId), eq(tokenPackages.active, true))).limit(1);
    if (!pack) throw new HttpError(404, "token_package_not_found", "Token package not found.");
    if (!pack.stripePriceId) throw new HttpError(503, "stripe_price_not_configured", "This token package is not configured for checkout.");

    const [purchase] = await db.insert(tokenPurchases).values({
      tenantId: user.tenantId,
      ownerUserId: user.id,
      packageId: pack.id,
      tokenAmount: pack.tokenAmount,
      amountCents: pack.priceCents,
      currency: pack.currency,
      status: "pending",
    }).returning();
    if (!purchase) throw new Error("Failed to create token purchase");

    const publicUrl = (process.env.TORQUESHED_PUBLIC_URL ?? "https://torqueshed.pro").replace(/\/+$/, "");
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("line_items[0][price]", pack.stripePriceId);
    form.set("line_items[0][quantity]", "1");
    form.set("client_reference_id", purchase.id);
    form.set("customer_email", user.email);
    form.set("success_url", `${publicUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${publicUrl}/?checkout=cancelled`);
    for (const [key, value] of Object.entries({
      purchase_id: purchase.id,
      torqueshed_user_id: user.id,
      tenant_id: user.tenantId,
      package_id: pack.id,
      token_amount: String(pack.tokenAmount),
    })) {
      form.set(`metadata[${key}]`, value);
      form.set(`payment_intent_data[metadata][${key}]`, value);
    }

    const stripeResponse = await fetch(`${stripeApi}/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": purchase.id,
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await stripeResponse.json().catch(() => ({}))) as { id?: unknown; url?: unknown; livemode?: unknown };
    if (!stripeResponse.ok || typeof payload.id !== "string" || typeof payload.url !== "string") {
      await db.update(tokenPurchases).set({ status: "failed", updatedAt: new Date() }).where(eq(tokenPurchases.id, purchase.id));
      throw new HttpError(502, "stripe_checkout_failed", "Stripe checkout could not be created.");
    }
    await db.update(tokenPurchases).set({
      stripeCheckoutSessionId: payload.id,
      livemode: payload.livemode === true,
      updatedAt: new Date(),
    }).where(eq(tokenPurchases.id, purchase.id));
    return response.status(201).json({ purchaseId: purchase.id, checkoutUrl: payload.url });
  }),
);

router.get(
  "/billing/purchases",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const purchases = await db.select().from(tokenPurchases).where(and(eq(tokenPurchases.ownerUserId, user.id), eq(tokenPurchases.tenantId, user.tenantId))).orderBy(desc(tokenPurchases.createdAt)).limit(100);
    return response.json({ purchases });
  }),
);

function stripeSignatureValid(rawBody: Buffer, header: string, secret: string) {
  const values = new Map<string, string[]>();
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const timestamp = values.get("t")?.[0];
  const signatures = values.get("v1") ?? [];
  if (!timestamp || signatures.length === 0) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest();
  return signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  data?: { object?: Record<string, unknown> };
};

export async function stripeWebhookHandler(request: Request, response: Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = request.get("stripe-signature");
  if (!secret || !signature || !Buffer.isBuffer(request.body) || !stripeSignatureValid(request.body, signature, secret)) {
    return response.status(400).json({ code: "invalid_signature" });
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(request.body.toString("utf8")) as StripeEvent;
  } catch {
    return response.status(400).json({ code: "invalid_payload" });
  }
  if (typeof event.id !== "string" || typeof event.type !== "string" || !event.data?.object) {
    return response.status(400).json({ code: "invalid_event" });
  }
  const object = event.data.object;

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const metadata = object.metadata as Record<string, unknown> | undefined;
    const purchaseId = typeof metadata?.purchase_id === "string" ? metadata.purchase_id : null;
    const checkoutId = typeof object.id === "string" ? object.id : null;
    if (!purchaseId || !checkoutId || object.payment_status !== "paid") return response.status(200).json({ received: true });
    await db.transaction(async (transaction) => {
      const [purchase] = await transaction.select().from(tokenPurchases).where(and(eq(tokenPurchases.id, purchaseId), eq(tokenPurchases.stripeCheckoutSessionId, checkoutId))).limit(1);
      if (!purchase) return;
      await transaction.insert(tokenLedgerEntries).values({
        tenantId: purchase.tenantId,
        ownerUserId: purchase.ownerUserId,
        delta: purchase.tokenAmount,
        entryType: "purchase",
        description: `${purchase.tokenAmount} Torque Assist tokens purchased`,
        purchaseId: purchase.id,
        externalEventId: event.id as string,
      }).onConflictDoNothing({ target: tokenLedgerEntries.externalEventId });
      await transaction.update(tokenPurchases).set({
        status: "completed",
        stripePaymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : purchase.stripePaymentIntentId,
        updatedAt: new Date(),
      }).where(eq(tokenPurchases.id, purchase.id));
      await transaction.insert(auditEvents).values({ tenantId: purchase.tenantId, actorUserId: purchase.ownerUserId, action: "token_purchase.completed", entityType: "token_purchase", entityId: purchase.id, metadata: { stripeEventId: event.id } });
    });
  } else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
    const checkoutId = typeof object.id === "string" ? object.id : null;
    if (checkoutId) await db.update(tokenPurchases).set({ status: "failed", updatedAt: new Date() }).where(eq(tokenPurchases.stripeCheckoutSessionId, checkoutId));
  } else if (event.type === "charge.refunded") {
    const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : null;
    if (paymentIntentId) {
      await db.transaction(async (transaction) => {
        const [purchase] = await transaction.select().from(tokenPurchases).where(eq(tokenPurchases.stripePaymentIntentId, paymentIntentId)).limit(1);
        if (!purchase) return;
        await transaction.insert(tokenLedgerEntries).values({
          tenantId: purchase.tenantId,
          ownerUserId: purchase.ownerUserId,
          delta: -purchase.tokenAmount,
          entryType: "refund_reversal",
          description: `${purchase.tokenAmount} tokens reversed after refund`,
          purchaseId: purchase.id,
          externalEventId: event.id as string,
        }).onConflictDoNothing({ target: tokenLedgerEntries.externalEventId });
        await transaction.update(tokenPurchases).set({ status: "refunded", updatedAt: new Date() }).where(eq(tokenPurchases.id, purchase.id));
        await transaction.insert(auditEvents).values({ tenantId: purchase.tenantId, actorUserId: purchase.ownerUserId, action: "token_purchase.refunded", entityType: "token_purchase", entityId: purchase.id, metadata: { stripeEventId: event.id } });
      });
    }
  }
  return response.status(200).json({ received: true });
}

export default router;
