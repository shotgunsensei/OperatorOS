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

export function tenantRoleToPublic(role: InternalTenantRole | string | null | undefined): PublicTenantRole {
  if (!role) return 'user';
  return TENANT_ROLE_TO_PUBLIC[role as InternalTenantRole] ?? 'user';
}

export function tenantRoleToInternal(role: PublicTenantRole | string | null | undefined): InternalTenantRole {
  if (!role) return 'member';
  return TENANT_ROLE_TO_INTERNAL[role as PublicTenantRole] ?? 'member';
}

export function moduleAccessLevelToPublic(level: InternalModuleAccessLevel | string | null | undefined): PublicModuleRole {
  if (!level) return 'none';
  return MODULE_LEVEL_TO_PUBLIC[level as InternalModuleAccessLevel] ?? 'none';
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
