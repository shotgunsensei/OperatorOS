/**
 * OperatorOS entitlement snapshot â€” the per-user, per-login authoritative
 * record of what this user can do in Tech Deck. Persisted on
 * `users.entitlement_snapshot_json` and refreshed on every SSO login and
 * server-to-server sync.
 * This module also owns the role-mapping table. OperatorOS-supplied
 * feature and limit claims are preserved as the access authority; Tech Deck
 * must not infer module access from local plan names.
 */

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "none";

export type LocalRole = "OWNER" | "ADMIN" | "TECH" | "CLIENT";

export interface EntitlementLimits {
  usersMax?: number;
  storageGb?: number;
  reportsPerMonth?: number;
  webhooksMax?: number;
  intakeSpacesMax?: number;
  intakeRequestsPerMonth?: number;
  intakeStorageGb?: number;
}

export interface EntitlementSnapshot {
  schemaVersion: 1;
  planSlug: string;
  subscriptionStatus: SubscriptionStatus;
  accessLevel: string;
  features: string[];
  limits: EntitlementLimits;
  moduleRole: string;
  tenantRole?: string;
  organizationId?: string;
  operatorosUserId?: string;
  enabled: boolean;
  syncedAt: string;
}

// Legacy migration fallback only. Production snapshots must carry explicit
// OperatorOS limit values.
const LIMIT_DEFAULTS: Record<string, EntitlementLimits> = {
  basic: {
    usersMax: 1,
    storageGb: 1,
    reportsPerMonth: 5,
    webhooksMax: 2,
    intakeSpacesMax: 1,
    intakeRequestsPerMonth: 5,
    intakeStorageGb: 1,
  },
  pro: {
    usersMax: 5,
    storageGb: 25,
    reportsPerMonth: 50,
    webhooksMax: 10,
    intakeSpacesMax: 5,
    intakeRequestsPerMonth: 50,
    intakeStorageGb: 10,
  },
  msp: {
    usersMax: 25,
    storageGb: 100,
    reportsPerMonth: 500,
    webhooksMax: 50,
    intakeSpacesMax: 25,
    intakeRequestsPerMonth: 500,
    intakeStorageGb: 50,
  },
  enterprise: {
    usersMax: 999,
    storageGb: 999,
    reportsPerMonth: 9999,
    webhooksMax: 999,
    intakeSpacesMax: 999,
    intakeRequestsPerMonth: 9999,
    intakeStorageGb: 500,
  },
};

export function defaultLimitsFor(accessLevel: string): EntitlementLimits {
  return LIMIT_DEFAULTS[accessLevel.toLowerCase()] ?? LIMIT_DEFAULTS.basic;
}

/**
 * Map OperatorOS role claims to a local Tech Deck role.
 * Returns null when access should be denied entirely (module_role=none).
 *
 * Mapping table (per spec point 5):
 *   module_role=none                                  â†’ null (deny)
 *   tenant_role=owner|tenant_admin OR
 *     module_role=owner|module_admin|admin             â†’ ADMIN
 *     (OperatorOS-driven users never claim local OWNER;
 *      local OWNER is reserved for the legacy email/password
 *      account that originally created the workspace.)
 *   module_role=viewer                                â†’ CLIENT (read-only)
 *   module_role=module_user|tech|technician|member    â†’ TECH
 *   no recognised role at all                         â†’ null (deny)
 *   anything else recognised                          â†’ TECH (safe default)
 */
export function mapOperatorOsRole(
  moduleRole: string | undefined,
  tenantRole: string | undefined,
): LocalRole | null {
  const mr = (moduleRole || "").toLowerCase();
  const tr = (tenantRole || "").toLowerCase();
  if (mr === "none") return null;
  // Per spec: OperatorOS-driven users never claim local OWNER. Local OWNER
  // is reserved for the legacy email/password account that created the
  // workspace. Any owner/admin signal from OperatorOS maps to ADMIN.
  if (tr === "owner" || tr === "tenant_admin"
      || mr === "owner" || mr === "module_admin" || mr === "admin") {
    return "ADMIN";
  }
  if (mr === "viewer") return "CLIENT";
  if (mr === "module_user" || mr === "tech" || mr === "technician" || mr === "member") return "TECH";
  // No recognised positive role and no tenant role â†’ deny. Previously this
  // returned TECH which let unclaimed tokens slip through.
  if (!mr && !tr) return null;
  return "TECH";
}

export interface BuildSnapshotInput {
  planSlug?: string;
  subscriptionStatus?: string;
  accessLevel?: string;
  features?: string[];
  limits?: EntitlementLimits;
  moduleRole?: string;
  tenantRole?: string;
  organizationId?: string;
  operatorosUserId?: string;
  enabled?: boolean;
}

export function buildSnapshot(input: BuildSnapshotInput): EntitlementSnapshot {
  const accessLevel = (input.accessLevel || input.planSlug || "basic").toLowerCase();
  const status = (input.subscriptionStatus || "active").toLowerCase() as SubscriptionStatus;
  return {
    schemaVersion: 1,
    planSlug: input.planSlug || accessLevel,
    subscriptionStatus: ([
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "canceled",
      "none",
    ].includes(status)
      ? status
      : "active") as SubscriptionStatus,
    accessLevel,
    features: Array.isArray(input.features)
      ? input.features.map((f) => f.toLowerCase())
      : [],
    limits: { ...(input.limits || {}) },
    moduleRole: (input.moduleRole || "").toLowerCase(),
    tenantRole: input.tenantRole?.toLowerCase(),
    organizationId: input.organizationId,
    operatorosUserId: input.operatorosUserId,
    // Explicit deny: if OperatorOS sent module_role=none, force enabled=false
    // so downstream snapshot consumers (middleware/UI) see a single unambiguous
    // "no access" signal regardless of the target_module_enabled flag.
    enabled: (input.moduleRole || "").toLowerCase() === "none" ? false : input.enabled !== false,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Best-effort coerce of a JSONB column read back from Postgres into a snapshot.
 * Returns null when the shape is missing or unrecognised.
 */
export function parseSnapshot(raw: unknown): EntitlementSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.accessLevel !== "string") return null;
  return r as unknown as EntitlementSnapshot;
}

/**
 * Subscription statuses that should block write traffic. The legacy
 * `tenant_subscriptions.pausedAt` column is no longer consulted.
 */
const BLOCKING_STATUSES: SubscriptionStatus[] = ["past_due", "unpaid", "canceled"];

export function isBlockingStatus(s: SubscriptionStatus | string | undefined): boolean {
  if (!s) return false;
  return BLOCKING_STATUSES.includes(s as SubscriptionStatus);
}
