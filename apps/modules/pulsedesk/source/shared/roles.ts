export const CANONICAL_ROLES = [
  "owner",
  "admin",
  "supervisor",
  "technician",
  "staff",
  "readonly",
] as const;

export type CanonicalRole = typeof CANONICAL_ROLES[number];

const CANONICAL_ROLE_SET = new Set<string>(CANONICAL_ROLES);

export const LEGACY_ROLE_ALIASES: Record<string, CanonicalRole> = {
  tech: "technician",
  viewer: "readonly",
};

export const ROLE_HIERARCHY: Record<CanonicalRole, number> = {
  owner: 120,
  admin: 100,
  supervisor: 80,
  technician: 60,
  staff: 40,
  readonly: 10,
};

export const ROLE_LABELS: Record<CanonicalRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  supervisor: "Supervisor",
  technician: "Technician",
  staff: "Staff",
  readonly: "Executive (Read-Only)",
};

export function normalizeRole(role: string | null | undefined): CanonicalRole | null {
  const normalized = (role ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) return null;
  if (normalized in LEGACY_ROLE_ALIASES) return LEGACY_ROLE_ALIASES[normalized];
  return CANONICAL_ROLE_SET.has(normalized) ? (normalized as CanonicalRole) : null;
}

export function isCanonicalRole(role: unknown): role is CanonicalRole {
  return typeof role === "string" && normalizeRole(role) === role;
}

export function hasRole(userRole: string | null | undefined, minRole: CanonicalRole): boolean {
  const normalizedUserRole = normalizeRole(userRole);
  if (!normalizedUserRole) return false;
  return ROLE_HIERARCHY[normalizedUserRole] >= ROLE_HIERARCHY[minRole];
}
