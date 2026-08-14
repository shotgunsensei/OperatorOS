import type { VerifiedSsoToken } from "./operatorOsSso";

export type LocalRole = "admin" | "standard" | "read-only" | "deny";

export interface EntitlementSnapshot {
  accessLevel: "pro" | "standard" | "read-only" | "denied";
  moduleEnabled: boolean;
  moduleRole: string | null;
  tenantRole: string | null;
  planSlug: string | null;
  subscriptionStatus: string | null;
  features: string[];
  grantedProductIds: string[];
  syncedAt: number;
}

export interface SyncInput {
  accessLevel?: EntitlementSnapshot["accessLevel"] | string | null;
  moduleEnabled?: boolean | null;
  moduleRole?: string | null;
  tenantRole?: string | null;
  planSlug?: string | null;
  subscriptionStatus?: string | null;
  features?: string[] | null;
  grantedProductIds?: string[] | null;
}

/**
 * Map OperatorOS-issued role + access claims to the local role enum. The
 * pivot rule from Task #108:
 *
 *   - module disabled OR access_level=denied OR module_role=none → deny
 *   - tenant owner / (tenant_admin + module_admin) / module_admin → admin
 *   - module_role=module_user → standard
 *   - module_role=viewer → read-only
 *   - otherwise → standard (best-effort default)
 */
export function deriveLocalRole(snap: EntitlementSnapshot): LocalRole {
  if (
    snap.moduleEnabled === false ||
    snap.accessLevel === "denied" ||
    snap.moduleRole === "none"
  ) {
    return "deny";
  }
  if (snap.tenantRole === "owner") return "admin";
  if (snap.moduleRole === "module_admin") return "admin";
  if (snap.tenantRole === "tenant_admin" && snap.moduleRole === "module_admin")
    return "admin";
  if (snap.moduleRole === "viewer") return "read-only";
  if (snap.accessLevel === "read-only") return "read-only";
  return "standard";
}

export function snapshotFromToken(token: VerifiedSsoToken): EntitlementSnapshot {
  return {
    accessLevel: token.accessLevel,
    moduleEnabled: token.targetModuleEnabled !== false,
    moduleRole: token.moduleRole,
    tenantRole: token.tenantRole,
    planSlug: token.planSlug ?? null,
    subscriptionStatus: token.subscriptionStatus ?? null,
    features: token.features ?? [],
    grantedProductIds: token.grantedProductIds ?? [],
    syncedAt: Date.now(),
  };
}

export function snapshotFromSyncInput(
  input: SyncInput,
  previous: EntitlementSnapshot | null,
): EntitlementSnapshot {
  const accessLevelRaw = input.accessLevel ?? previous?.accessLevel ?? "standard";
  const accessLevel: EntitlementSnapshot["accessLevel"] =
    accessLevelRaw === "pro" ||
    accessLevelRaw === "standard" ||
    accessLevelRaw === "read-only" ||
    accessLevelRaw === "denied"
      ? accessLevelRaw
      : "standard";
  return {
    accessLevel,
    moduleEnabled:
      input.moduleEnabled ?? previous?.moduleEnabled ?? true,
    moduleRole: input.moduleRole ?? previous?.moduleRole ?? null,
    tenantRole: input.tenantRole ?? previous?.tenantRole ?? null,
    planSlug: input.planSlug ?? previous?.planSlug ?? null,
    subscriptionStatus:
      input.subscriptionStatus ?? previous?.subscriptionStatus ?? null,
    features: input.features ?? previous?.features ?? [],
    grantedProductIds:
      input.grantedProductIds ?? previous?.grantedProductIds ?? [],
    syncedAt: Date.now(),
  };
}
