import { db } from "@workspace/db";
import { userEntitlementsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const BUNDLE_CONTENTS: Record<string, string[]> = {
  "bundle-master-investigator": [
    "pro-subscription",
    "pack-network-ops",
    "pack-server-graveyard",
    "pack-garage-diagnostics",
    "pack-sensor-mesh",
    "pack-mixed-cascades",
    "upgrade-advanced-tools",
    "upgrade-chaos-mode",
    "upgrade-deep-telemetry",
    "upgrade-sandbox-pro",
    "upgrade-pro-analytics",
  ],
  "bundle-clinical-systems": [
    "pack-healthcare-imaging",
    "upgrade-advanced-tools",
    "upgrade-deep-telemetry",
  ],
};

export type EntitlementSource = "operatoros" | "stripe" | "free";

export interface EntitlementsPayload {
  ownedProductIds: string[];
  activeSubscription: string | null;
  isProUser: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  source: EntitlementSource;
  managedByOperatorOs: boolean;
  accessLevel?: 'pro' | 'standard' | 'read-only' | 'denied';
  localRole?: 'admin' | 'standard' | 'read-only' | 'deny';
  features?: string[];
  planSlug?: string | null;
  subscriptionStatus?: string | null;
  lastSyncAt?: string | null;
}

function expandBundles(ids: string[]): Set<string> {
  const out = new Set<string>(ids);
  for (const id of ids) {
    const children = BUNDLE_CONTENTS[id];
    if (children) for (const c of children) out.add(c);
  }
  return out;
}

/**
 * Builds the `/api/entitlements` payload for a given app-user id. When the
 * user has an OperatorOS-issued entitlement snapshot we treat that as the
 * authoritative source (parent app owns plans + access). Otherwise we fall
 * back to the legacy Stripe/local `user_entitlements` table.
 */
export async function computeEntitlementsPayload(
  userId: string,
): Promise<EntitlementsPayload> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const snap = user?.entitlementSnapshotJson ?? null;
  // OperatorOS-managed identity is authoritative: never fall back to local
  // Stripe entitlements for these users. If the snapshot has not been
  // delivered yet we fail closed to base-free access. Bootstrap super admins
  // remain admin-capable so they can recover.
  if (user?.operatorIdentityId) {
    if (!snap) {
      const isAdmin = user.localRole === "admin" || !!user.isSuperAdmin;
      return {
        ownedProductIds: ["base-free"],
        activeSubscription: null,
        isProUser: false,
        isAdmin,
        isSuperAdmin: !!user.isSuperAdmin,
        source: "operatoros",
        managedByOperatorOs: true,
        accessLevel: undefined,
        localRole: (user.localRole as EntitlementsPayload["localRole"]) ?? "standard",
        features: [],
        planSlug: user.operatorPlanSlug ?? null,
        subscriptionStatus: null,
        lastSyncAt: null,
      };
    }
    const expanded = expandBundles(snap.grantedProductIds ?? []);
    if (snap.accessLevel === "pro") expanded.add("pro-subscription");
    const ownedProductIds = ["base-free", ...Array.from(expanded)];
    // For OperatorOS-launched users, derive admin from local_role so
    // OperatorOS owns the role assignment end-to-end. Bootstrap super-admins
    // (legacy is_super_admin flag) still get admin so the in-app admin panel
    // remains reachable for founder accounts even via SSO.
    const isAdmin = user.localRole === "admin" || !!user.isSuperAdmin;
    return {
      ownedProductIds,
      activeSubscription: snap.accessLevel === "pro" ? "pro-subscription" : null,
      isProUser: snap.accessLevel === "pro",
      isAdmin,
      isSuperAdmin: !!user.isSuperAdmin,
      source: "operatoros",
      managedByOperatorOs: true,
      accessLevel: snap.accessLevel,
      localRole: (user.localRole as EntitlementsPayload["localRole"]) ?? "standard",
      features: snap.features ?? [],
      planSlug: snap.planSlug ?? null,
      subscriptionStatus: snap.subscriptionStatus ?? null,
      lastSyncAt: user.lastEntitlementSyncAt?.toISOString?.() ?? null,
    };
  }

  const entitlements = await db
    .select()
    .from(userEntitlementsTable)
    .where(eq(userEntitlementsTable.userId, userId));

  const active = entitlements.filter((e) => e.isActive && !e.revokedAt);
  const directIds = active.map((e) => e.productId);
  const expanded = expandBundles(directIds);

  const ownedProductIds = ["base-free", ...Array.from(expanded)];
  const activeSubscription =
    active.find((e) => e.entitlementType === "subscription")?.productId ||
    (expanded.has("pro-subscription") ? "pro-subscription" : null);
  const isProUser = expanded.has("pro-subscription");

  return {
    ownedProductIds,
    activeSubscription,
    isProUser,
    isAdmin: !!user?.isAdmin,
    isSuperAdmin: !!user?.isSuperAdmin,
    source: directIds.length > 0 ? "stripe" : "free",
    managedByOperatorOs: false,
  };
}
