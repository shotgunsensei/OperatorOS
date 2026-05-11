export type PlatformRole = 'super_admin' | 'user' | string | null | undefined;
export type TenantRole = 'owner' | 'admin' | 'member' | string | null | undefined;

export function isSuperAdmin(platformRole: PlatformRole): boolean {
  return platformRole === 'super_admin';
}

export function isTenantOwner(role: TenantRole): boolean {
  return role === 'owner';
}

export function isTenantAdmin(role: TenantRole, platformRole?: PlatformRole): boolean {
  return isSuperAdmin(platformRole) || role === 'owner' || role === 'admin';
}
