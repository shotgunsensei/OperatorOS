import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, pool } from "@workspace/db";
import {
  purchasesTable,
  userEntitlementsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, like } from "drizzle-orm";
import {
  grantEntitlementFromCheckout,
  PRODUCT_TYPE_MAP,
  recordPurchase,
  revokeEntitlement,
} from "./grantEntitlement";
import { handleStripeEvent } from "./stripeEventHandler";
import { computeEntitlementsPayload } from "./entitlementsPayload";

// Real-deps wiring identical to what app.ts uses in production.
const REAL_DEPS = {
  grantEntitlement: grantEntitlementFromCheckout,
  recordPurchase,
  revokeEntitlement,
  logger: { warn: () => {}, error: () => {} },
};

// Source of truth for paid SKUs comes from the actual Faultline Lab catalog
// file, parsed at test time. This way, adding or removing a SKU in the catalog
// fails this suite if the server's PRODUCT_TYPE_MAP isn't updated to match.
function parseCatalogSkus(): Array<{ id: string; pricingType: string }> {
  const catalogPath = path.resolve(
    __dirname,
    "../../../faultline-lab/src/data/catalog.ts",
  );
  const src = readFileSync(catalogPath, "utf8");
  const skus: Array<{ id: string; pricingType: string }> = [];
  // CATALOG entries look like: { id: '...', ..., pricingType: '...' }
  const entryRe = /\{\s*id:\s*'([^']+)'[\s\S]*?pricingType:\s*'([^']+)'/g;
  for (const m of src.matchAll(entryRe)) {
    skus.push({ id: m[1], pricingType: m[2] });
  }
  if (skus.length === 0) {
    throw new Error("Failed to parse catalog SKUs from " + catalogPath);
  }
  return skus;
}

const CATALOG_SKUS = parseCatalogSkus();
const PAID_CATALOG_SKUS = CATALOG_SKUS.filter((s) => s.pricingType !== "free");
const ONE_TIME_PAID_SKUS = PAID_CATALOG_SKUS.filter(
  (s) => s.pricingType === "one-time",
).map((s) => s.id);
const SUBSCRIPTION_SKUS = PAID_CATALOG_SKUS.filter((s) =>
  s.pricingType.startsWith("subscription"),
).map((s) => s.id);

// Test users are namespaced so we can clean up safely without touching real
// data. Each it-block gets its own user row.
const TEST_USER_PREFIX = "vitest-stripe-";

async function createTestUser(label: string): Promise<string> {
  const id = TEST_USER_PREFIX + label + "-" + randomUUID();
  await db.insert(usersTable).values({
    id,
    clerkId: id,
    email: id + "@test.local",
    displayName: "Vitest User",
  });
  return id;
}

async function cleanupTestUsers() {
  // Cascade deletes user_entitlements + purchases via FK ON DELETE CASCADE.
  await db.delete(usersTable).where(like(usersTable.id, TEST_USER_PREFIX + "%"));
}

beforeAll(async () => {
  await cleanupTestUsers();
});

afterAll(async () => {
  await cleanupTestUsers();
  await pool.end();
});

function checkoutEvent(opts: {
  userId: string;
  catalogProductId: string;
  mode?: "payment" | "subscription";
  amount?: number;
  sessionId?: string;
}) {
  const sessionId = opts.sessionId ?? "cs_test_" + opts.catalogProductId + "_" + randomUUID();
  const isSub = opts.mode === "subscription";
  return {
    id: "evt_" + sessionId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        mode: opts.mode ?? "payment",
        amount_total: opts.amount ?? 999,
        currency: "usd",
        payment_intent: isSub ? null : "pi_" + sessionId,
        subscription: isSub ? "sub_" + sessionId : null,
        metadata: {
          userId: opts.userId,
          catalogProductId: opts.catalogProductId,
        },
      },
    },
  };
}

function subscriptionDeletedEvent(userId: string, catalogProductId = "pro-subscription") {
  return {
    id: "evt_sub_del_" + randomUUID(),
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_" + randomUUID(),
        status: "canceled",
        metadata: { userId, catalogProductId },
      },
    },
  };
}

function subscriptionUpdatedEvent(userId: string, status: string) {
  return {
    id: "evt_sub_upd_" + randomUUID(),
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_" + randomUUID(),
        status,
        metadata: { userId, catalogProductId: "pro-subscription" },
      },
    },
  };
}

async function getActiveEntitlements(userId: string) {
  return db
    .select()
    .from(userEntitlementsTable)
    .where(
      and(
        eq(userEntitlementsTable.userId, userId),
        eq(userEntitlementsTable.isActive, true),
      ),
    );
}

async function getPurchases(userId: string) {
  return db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.userId, userId));
}

describe("catalog ↔ server entitlement coverage", () => {
  it("PRODUCT_TYPE_MAP covers every paid SKU in the Faultline Lab catalog", () => {
    const missing = PAID_CATALOG_SKUS.map((s) => s.id).filter(
      (id) => !PRODUCT_TYPE_MAP[id],
    );
    expect(missing).toEqual([]);
  });

  it("PRODUCT_TYPE_MAP does not contain stale SKUs absent from the catalog", () => {
    const catalogIds = new Set(CATALOG_SKUS.map((s) => s.id));
    const stale = Object.keys(PRODUCT_TYPE_MAP).filter(
      (id) => !catalogIds.has(id),
    );
    expect(stale).toEqual([]);
  });

  it("entitlement type matches catalog pricing intent (subscription vs one-time)", () => {
    for (const sku of PAID_CATALOG_SKUS) {
      const t = PRODUCT_TYPE_MAP[sku.id];
      if (sku.pricingType.startsWith("subscription")) {
        expect(t, sku.id).toBe("subscription");
      } else if (sku.pricingType === "one-time") {
        expect(["content-pack", "feature-upgrade", "bundle"], sku.id).toContain(t);
      }
    }
  });
});

describe("checkout.session.completed → entitlement granted (real DB)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await createTestUser("grant");
  });
  afterEach(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  it.each(ONE_TIME_PAID_SKUS)(
    "grants %s and records purchase",
    async (sku) => {
      const ev = checkoutEvent({
        userId,
        catalogProductId: sku,
        mode: "payment",
        amount: 1234,
      });

      const result = await handleStripeEvent(ev, REAL_DEPS);
      expect(result).toMatchObject({ action: "granted", productId: sku });

      const ents = await getActiveEntitlements(userId);
      expect(ents).toHaveLength(1);
      expect(ents[0]).toMatchObject({
        userId,
        productId: sku,
        entitlementType: PRODUCT_TYPE_MAP[sku],
        source: "stripe",
        isActive: true,
      });
      expect(ents[0].stripePaymentId).toBe(ev.data.object.payment_intent);

      const purchases = await getPurchases(userId);
      expect(purchases).toHaveLength(1);
      expect(purchases[0]).toMatchObject({
        userId,
        productId: sku,
        stripeSessionId: ev.data.object.id,
        stripePaymentIntentId: ev.data.object.payment_intent,
        amount: 1234,
        currency: "usd",
        status: "completed",
      });
      expect(purchases[0].fulfilledAt).toBeInstanceOf(Date);
    },
  );

  it.each(SUBSCRIPTION_SKUS)(
    "grants subscription SKU %s with subscription id as paymentId",
    async (sku) => {
      const ev = checkoutEvent({
        userId,
        catalogProductId: sku,
        mode: "subscription",
        amount: 899,
      });
      await handleStripeEvent(ev, REAL_DEPS);

      const ents = await getActiveEntitlements(userId);
      expect(ents).toHaveLength(1);
      expect(ents[0].entitlementType).toBe("subscription");
      expect(ents[0].stripePaymentId).toBe(ev.data.object.subscription);

      const [purchase] = await getPurchases(userId);
      expect(purchase.stripePaymentIntentId).toBeNull();
      expect(purchase.amount).toBe(899);
    },
  );

  it("supports both pro monthly and pro yearly purchases for the same user without duplicating entitlement", async () => {
    await handleStripeEvent(
      checkoutEvent({
        userId,
        catalogProductId: "pro-subscription",
        mode: "subscription",
        amount: 899,
      }),
      REAL_DEPS,
    );
    await handleStripeEvent(
      checkoutEvent({
        userId,
        catalogProductId: "pro-subscription",
        mode: "subscription",
        amount: 7900,
      }),
      REAL_DEPS,
    );

    const ents = await getActiveEntitlements(userId);
    expect(ents).toHaveLength(1); // dedupes on (userId, productId, isActive)

    const purchases = await getPurchases(userId);
    expect(purchases).toHaveLength(2); // both purchases recorded
    expect(purchases.map((p) => p.amount).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([899, 7900]);
  });

  it("/entitlements payload reflects pro purchase", async () => {
    await handleStripeEvent(
      checkoutEvent({
        userId,
        catalogProductId: "pro-subscription",
        mode: "subscription",
      }),
      REAL_DEPS,
    );
    const payload = await computeEntitlementsPayload(userId);
    expect(payload.isProUser).toBe(true);
    expect(payload.activeSubscription).toBe("pro-subscription");
    expect(payload.ownedProductIds).toContain("pro-subscription");
    expect(payload.ownedProductIds).toContain("base-free");
  });

  it("/entitlements payload expands master bundle to include every child product", async () => {
    await handleStripeEvent(
      checkoutEvent({
        userId,
        catalogProductId: "bundle-master-investigator",
        amount: 4999,
      }),
      REAL_DEPS,
    );
    const payload = await computeEntitlementsPayload(userId);
    expect(payload.isProUser).toBe(true);
    for (const child of [
      "pro-subscription",
      "pack-network-ops",
      "upgrade-chaos-mode",
      "upgrade-pro-analytics",
    ]) {
      expect(payload.ownedProductIds).toContain(child);
    }
  });

  it("/entitlements payload expands clinical bundle to its three children", async () => {
    await handleStripeEvent(
      checkoutEvent({
        userId,
        catalogProductId: "bundle-clinical-systems",
        amount: 1999,
      }),
      REAL_DEPS,
    );
    const payload = await computeEntitlementsPayload(userId);
    expect(payload.isProUser).toBe(false);
    for (const child of [
      "pack-healthcare-imaging",
      "upgrade-advanced-tools",
      "upgrade-deep-telemetry",
    ]) {
      expect(payload.ownedProductIds).toContain(child);
    }
  });
});

describe("subscription cancellation / expiration → entitlement revoked (real DB)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await createTestUser("cancel");
  });
  afterEach(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  it("flips Pro off on customer.subscription.deleted (mirrors expired-subscription client case)", async () => {
    await handleStripeEvent(
      checkoutEvent({
        userId,
        catalogProductId: "pro-subscription",
        mode: "subscription",
      }),
      REAL_DEPS,
    );
    let payload = await computeEntitlementsPayload(userId);
    expect(payload.isProUser).toBe(true);

    await handleStripeEvent(subscriptionDeletedEvent(userId), REAL_DEPS);

    payload = await computeEntitlementsPayload(userId);
    expect(payload.isProUser).toBe(false);
    expect(payload.activeSubscription).toBeNull();
    expect(payload.ownedProductIds).toEqual(["base-free"]);

    // Underlying row is marked inactive + revokedAt is set, not deleted.
    const all = await db
      .select()
      .from(userEntitlementsTable)
      .where(eq(userEntitlementsTable.userId, userId));
    expect(all).toHaveLength(1);
    expect(all[0].isActive).toBe(false);
    expect(all[0].revokedAt).toBeInstanceOf(Date);
  });

  it.each(["canceled", "unpaid", "incomplete_expired"])(
    "revokes pro on customer.subscription.updated status=%s",
    async (status) => {
      await handleStripeEvent(
        checkoutEvent({
          userId,
          catalogProductId: "pro-subscription",
          mode: "subscription",
        }),
        REAL_DEPS,
      );
      await handleStripeEvent(
        subscriptionUpdatedEvent(userId, status),
        REAL_DEPS,
      );
      const payload = await computeEntitlementsPayload(userId);
      expect(payload.isProUser).toBe(false);
    },
  );

  it("does NOT revoke on customer.subscription.updated status=active", async () => {
    await handleStripeEvent(
      checkoutEvent({
        userId,
        catalogProductId: "pro-subscription",
        mode: "subscription",
      }),
      REAL_DEPS,
    );
    await handleStripeEvent(
      subscriptionUpdatedEvent(userId, "active"),
      REAL_DEPS,
    );
    const payload = await computeEntitlementsPayload(userId);
    expect(payload.isProUser).toBe(true);
  });

  it("ignores unrelated event types and leaves entitlements untouched", async () => {
    await handleStripeEvent(
      checkoutEvent({
        userId,
        catalogProductId: "pack-network-ops",
      }),
      REAL_DEPS,
    );
    const before = await computeEntitlementsPayload(userId);

    const result = await handleStripeEvent(
      { type: "invoice.paid", data: { object: {} } },
      REAL_DEPS,
    );
    expect(result.action).toBe("ignored");

    const after = await computeEntitlementsPayload(userId);
    expect(after).toEqual(before);
  });
});
