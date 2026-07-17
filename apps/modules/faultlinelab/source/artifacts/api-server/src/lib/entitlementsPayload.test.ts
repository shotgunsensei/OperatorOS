import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { userEntitlementsTable } from "@workspace/db/schema";
import { like } from "drizzle-orm";
import { computeEntitlementsPayload } from "./entitlementsPayload";

const PREFIX = "vitest-entpay-";

beforeEach(async () => {
  await db.delete(usersTable).where(like(usersTable.email, PREFIX + "%"));
});

afterAll(async () => {
  await db.delete(usersTable).where(like(usersTable.email, PREFIX + "%"));
});

describe("computeEntitlementsPayload — OperatorOS source-of-truth", () => {
  it("regression: OperatorOS identity + local Stripe entitlements + no snapshot does NOT unlock paid access", async () => {
    const userId = randomUUID();
    const opId = PREFIX + "op-" + randomUUID();
    await db.insert(usersTable).values({
      id: userId,
      operatorIdentityId: opId,
      email: PREFIX + "no-snap@test.local",
      localRole: "standard",
      // Note: entitlementSnapshotJson intentionally NULL.
    });
    // Plant legacy Stripe-source pro entitlement on the same user row.
    await db.insert(userEntitlementsTable).values({
      id: randomUUID(),
      userId,
      productId: "pro-subscription",
      entitlementType: "subscription",
      source: "stripe",
      isActive: true,
    });

    const payload = await computeEntitlementsPayload(userId);

    expect(payload.managedByOperatorOs).toBe(true);
    expect(payload.source).toBe("operatoros");
    expect(payload.isProUser).toBe(false);
    expect(payload.ownedProductIds).toEqual(["base-free"]);
    expect(payload.activeSubscription).toBeNull();
  });

  it("OperatorOS identity + snapshot derives pro/admin from the snapshot, not is_admin/Stripe", async () => {
    const userId = randomUUID();
    const opId = PREFIX + "op-" + randomUUID();
    await db.insert(usersTable).values({
      id: userId,
      operatorIdentityId: opId,
      email: PREFIX + "snap@test.local",
      // Legacy flag deliberately false; localRole drives admin now.
      isAdmin: false,
      localRole: "admin",
      lastEntitlementSyncAt: new Date(),
      entitlementSnapshotJson: {
        accessLevel: "pro",
        moduleEnabled: true,
        moduleRole: "module_admin",
        tenantRole: "tenant_admin",
        planSlug: "ops-pro",
        subscriptionStatus: "active",
        features: ["pro-analytics"],
        grantedProductIds: ["pack-network-ops"],
        syncedAt: Date.now(),
      },
    });

    const payload = await computeEntitlementsPayload(userId);

    expect(payload.source).toBe("operatoros");
    expect(payload.isAdmin).toBe(true);
    expect(payload.isProUser).toBe(true);
    expect(payload.localRole).toBe("admin");
    expect(payload.features).toEqual(["pro-analytics"]);
    expect(payload.ownedProductIds).toContain("pack-network-ops");
    expect(payload.ownedProductIds).toContain("pro-subscription");
  });

  it("legacy Clerk users still receive Stripe-sourced entitlements", async () => {
    const userId = randomUUID();
    await db.insert(usersTable).values({
      id: userId,
      clerkId: PREFIX + "clerk-" + randomUUID(),
      email: PREFIX + "clerk@test.local",
    });
    await db.insert(userEntitlementsTable).values({
      id: randomUUID(),
      userId,
      productId: "pack-network-ops",
      entitlementType: "one-time",
      source: "stripe",
      isActive: true,
    });

    const payload = await computeEntitlementsPayload(userId);

    expect(payload.source).toBe("stripe");
    expect(payload.managedByOperatorOs).toBe(false);
    expect(payload.ownedProductIds).toContain("pack-network-ops");
  });
});
