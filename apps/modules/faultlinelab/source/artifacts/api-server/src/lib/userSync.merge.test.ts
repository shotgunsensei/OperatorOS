import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { mergeUserRows } from "./userSync";

const PREFIX = "vitest-merge-";

async function insertUser(values: Partial<typeof usersTable.$inferInsert>) {
  const id = values.id ?? randomUUID();
  const [row] = await db
    .insert(usersTable)
    .values({ id, ...values })
    .returning();
  return row;
}

beforeEach(async () => {
  await db.delete(usersTable).where(like(usersTable.email, PREFIX + "%"));
});

afterAll(async () => {
  await db.delete(usersTable).where(like(usersTable.email, PREFIX + "%"));
});

describe("mergeUserRows — OperatorOS entitlement snapshot preservation", () => {
  it("carries snapshot + localRole + tenantId from other into primary when primary has none", async () => {
    const primary = await insertUser({
      clerkId: "clerk_" + randomUUID(),
      email: PREFIX + "primary@test.local",
    });
    const otherDate = new Date();
    const otherSnap = {
      accessLevel: "pro" as const,
      moduleEnabled: true,
      moduleRole: "module_admin" as const,
      tenantRole: "tenant_admin",
      planSlug: "pro-tenant",
      subscriptionStatus: "active",
      features: ["pro-analytics"],
      grantedProductIds: ["pack-network-ops"],
      syncedAt: otherDate.getTime(),
    };
    const other = await insertUser({
      operatorIdentityId: PREFIX + randomUUID(),
      email: PREFIX + "other@test.local",
      operatorosTenantId: "tenant-xyz",
      localRole: "admin",
      lastEntitlementSyncAt: otherDate,
      entitlementSnapshotJson: otherSnap,
    });

    await mergeUserRows(primary, other);
    const [merged] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, primary.id));
    expect(merged.operatorIdentityId).toBe(other.operatorIdentityId);
    expect(merged.operatorosTenantId).toBe("tenant-xyz");
    expect(merged.localRole).toBe("admin");
    expect(merged.entitlementSnapshotJson?.accessLevel).toBe("pro");
    expect(merged.lastEntitlementSyncAt?.getTime()).toBe(otherDate.getTime());
    // other row is gone
    const remaining = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, other.id));
    expect(remaining).toHaveLength(0);
  });

  it("prefers the newer snapshot when both rows have one (other newer)", async () => {
    const oldDate = new Date(Date.now() - 60_000);
    const newDate = new Date();
    const primary = await insertUser({
      clerkId: "clerk_" + randomUUID(),
      email: PREFIX + "p2@test.local",
      localRole: "standard",
      lastEntitlementSyncAt: oldDate,
      entitlementSnapshotJson: {
        accessLevel: "standard",
        moduleEnabled: true,
        moduleRole: "module_user",
        tenantRole: "member",
        planSlug: "free",
        subscriptionStatus: null,
        features: [],
        grantedProductIds: [],
        syncedAt: oldDate.getTime(),
      },
    });
    const other = await insertUser({
      operatorIdentityId: PREFIX + randomUUID(),
      email: PREFIX + "o2@test.local",
      localRole: "admin",
      lastEntitlementSyncAt: newDate,
      entitlementSnapshotJson: {
        accessLevel: "pro",
        moduleEnabled: true,
        moduleRole: "module_admin",
        tenantRole: "tenant_admin",
        planSlug: "pro-tenant",
        subscriptionStatus: "active",
        features: [],
        grantedProductIds: ["pack-network-ops"],
        syncedAt: newDate.getTime(),
      },
    });

    await mergeUserRows(primary, other);
    const [merged] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, primary.id));
    expect(merged.localRole).toBe("admin");
    expect(merged.entitlementSnapshotJson?.accessLevel).toBe("pro");
    expect(merged.lastEntitlementSyncAt?.getTime()).toBe(newDate.getTime());
  });

  it("keeps the primary's newer snapshot when other is stale", async () => {
    const oldDate = new Date(Date.now() - 60_000);
    const newDate = new Date();
    const primary = await insertUser({
      clerkId: "clerk_" + randomUUID(),
      email: PREFIX + "p3@test.local",
      localRole: "admin",
      lastEntitlementSyncAt: newDate,
      entitlementSnapshotJson: {
        accessLevel: "pro",
        moduleEnabled: true,
        moduleRole: "module_admin",
        tenantRole: "tenant_admin",
        planSlug: "pro-tenant",
        subscriptionStatus: "active",
        features: [],
        grantedProductIds: [],
        syncedAt: newDate.getTime(),
      },
    });
    const other = await insertUser({
      operatorIdentityId: PREFIX + randomUUID(),
      email: PREFIX + "o3@test.local",
      localRole: "deny",
      lastEntitlementSyncAt: oldDate,
      entitlementSnapshotJson: {
        accessLevel: "denied",
        moduleEnabled: false,
        moduleRole: "none",
        tenantRole: "viewer",
        planSlug: "free",
        subscriptionStatus: null,
        features: [],
        grantedProductIds: [],
        syncedAt: oldDate.getTime(),
      },
    });

    await mergeUserRows(primary, other);
    const [merged] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, primary.id));
    expect(merged.localRole).toBe("admin");
    expect(merged.entitlementSnapshotJson?.accessLevel).toBe("pro");
    expect(merged.lastEntitlementSyncAt?.getTime()).toBe(newDate.getTime());
  });
});
