/**
 * Task #108 — Centralized role-taxonomy aliases.
 *
 * OperatorOS has two parallel role vocabularies:
 *   - INTERNAL (stored): tenant_users.role = owner|admin|member,
 *     tenant_user_module_access.access_level = none|user|manager.
 *   - PUBLIC (spec): tenant_role = owner|tenant_admin|billing_admin|user|viewer,
 *     module_role = module_admin|module_user|viewer|none.
 *
 * Modules and downstream tools consume the public vocabulary so that we
 * can rename the internal columns later without breaking external
 * receivers. This module is the single source of truth for translation.
 *
 * Mapping is intentionally append-only on the internal side: every
 * internal value MUST map to a public value, and every new public role
 * is added here before any caller depends on it.
 */

export type InternalTenantRole = 'owner' | 'admin' | 'member';
export type PublicTenantRole =
  | 'owner'
  | 'tenant_admin'
  | 'billing_admin'
  | 'user'
  | 'viewer';

export type InternalModuleAccessLevel = 'none' | 'user' | 'manager';
export type PublicModuleRole = 'module_admin' | 'module_user' | 'viewer' | 'none';

const TENANT_ROLE_TO_PUBLIC: Record<InternalTenantRole, PublicTenantRole> = {
  owner: 'owner',
  admin: 'tenant_admin',
  member: 'user',
};

/** Public → internal. `billing_admin` and `viewer` collapse to the
 * closest internal write-permission level because the underlying column
 * has not been extended yet. */
const TENANT_ROLE_TO_INTERNAL: Record<PublicTenantRole, InternalTenantRole> = {
  owner: 'owner',
  tenant_admin: 'admin',
  billing_admin: 'admin',
  user: 'member',
  viewer: 'member',
};

const MODULE_LEVEL_TO_PUBLIC: Record<InternalModuleAccessLevel, PublicModuleRole> = {
  manager: 'module_admin',
  user: 'module_user',
  none: 'none',
};

/**
 * Read-path normalization (Task #108): a stored row may now hold EITHER
 * the legacy internal vocabulary OR the new public vocabulary because
 * the DB CHECK was widened to accept both. Both functions below MUST
 * map any accepted DB value deterministically to the public taxonomy.
 */
const PUBLIC_TENANT_ROLES: ReadonlySet<PublicTenantRole> = new Set(
  ['owner', 'tenant_admin', 'billing_admin', 'user', 'viewer'],
);

export function tenantRoleToPublic(role: InternalTenantRole | PublicTenantRole | string | null | undefined): PublicTenantRole {
  if (!role) return 'user';
  const v = String(role).trim().toLowerCase();
  // Stored value is already a public-taxonomy value — pass through.
  if (PUBLIC_TENANT_ROLES.has(v as PublicTenantRole)) return v as PublicTenantRole;
  // Stored value is in the legacy internal taxonomy — map deterministically.
  if (v in TENANT_ROLE_TO_PUBLIC) return TENANT_ROLE_TO_PUBLIC[v as InternalTenantRole];
  return 'user';
}

export function tenantRoleToInternal(role: PublicTenantRole | string | null | undefined): InternalTenantRole {
  if (!role) return 'member';
  const v = String(role).trim().toLowerCase();
  if (v === 'owner' || v === 'admin' || v === 'member') return v as InternalTenantRole;
  if (v in TENANT_ROLE_TO_INTERNAL) return TENANT_ROLE_TO_INTERNAL[v as PublicTenantRole];
  return 'member';
}

const PUBLIC_MODULE_ROLES: ReadonlySet<PublicModuleRole> = new Set(
  ['module_admin', 'module_user', 'viewer', 'none'],
);

export function moduleAccessLevelToPublic(level: InternalModuleAccessLevel | PublicModuleRole | string | null | undefined): PublicModuleRole {
  if (!level) return 'none';
  const v = String(level).trim().toLowerCase();
  // Stored value is already a public-taxonomy value — pass through.
  if (PUBLIC_MODULE_ROLES.has(v as PublicModuleRole)) return v as PublicModuleRole;
  // Stored value is in the legacy internal taxonomy — map deterministically.
  if (v in MODULE_LEVEL_TO_PUBLIC) return MODULE_LEVEL_TO_PUBLIC[v as InternalModuleAccessLevel];
  return 'none';
}

/** Accepts either vocabulary on the wire — used when a caller PATCHes a
 * tenant_users.role and may speak either dialect. Returns the canonical
 * internal value or null when neither matches. */
export function normalizeIncomingTenantRole(value: unknown): InternalTenantRole | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'owner' || v === 'admin' || v === 'member') return v as InternalTenantRole;
  if (v in TENANT_ROLE_TO_INTERNAL) return TENANT_ROLE_TO_INTERNAL[v as PublicTenantRole];
  return null;
}

/**
 * Public → internal mapping for module access levels. Accepts either
 * vocabulary on write and returns the canonical internal value.
 */
const MODULE_LEVEL_TO_INTERNAL: Record<PublicModuleRole, InternalModuleAccessLevel> = {
  module_admin: 'manager',
  module_user: 'user',
  viewer: 'user',
  none: 'none',
};

export function normalizeIncomingModuleAccessLevel(value: unknown): InternalModuleAccessLevel | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'user' || v === 'manager') return v as InternalModuleAccessLevel;
  if (v in MODULE_LEVEL_TO_INTERNAL) return MODULE_LEVEL_TO_INTERNAL[v as PublicModuleRole];
  return null;
}
