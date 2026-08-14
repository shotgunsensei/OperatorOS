import {
  ROLE_LABELS as CANONICAL_ROLE_LABELS,
  hasRole as hasCanonicalRole,
  normalizeRole,
  type CanonicalRole,
} from "@shared/roles";

export type Role = CanonicalRole;

export function hasRole(userRole: string | undefined, minRole: Role): boolean {
  return hasCanonicalRole(userRole, minRole);
}

export function canManageTickets(role: string | undefined): boolean {
  return hasRole(role, "technician");
}

export function canAssignTickets(role: string | undefined): boolean {
  return hasRole(role, "supervisor");
}

export function canManageSettings(role: string | undefined): boolean {
  return hasRole(role, "admin");
}

export function canSubmitIssues(role: string | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return !!normalizedRole && normalizedRole !== "readonly";
}

export function canAddNotes(role: string | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return !!normalizedRole && normalizedRole !== "readonly";
}

export function canEscalate(role: string | undefined): boolean {
  return hasRole(role, "supervisor");
}

export function canViewAnalytics(role: string | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return hasRole(role, "supervisor") || normalizedRole === "readonly";
}

export function canManageUsers(role: string | undefined): boolean {
  return hasRole(role, "admin");
}

export function isReadOnly(role: string | undefined): boolean {
  return normalizeRole(role) === "readonly";
}

export const ROLE_LABELS: Record<string, string> = {
  ...CANONICAL_ROLE_LABELS,
  tech: CANONICAL_ROLE_LABELS.technician,
  viewer: CANONICAL_ROLE_LABELS.readonly,
  "": "Unknown",
};
