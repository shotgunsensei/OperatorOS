import {
  hasPlatformAdminAuthority,
  isRootSuperAdmin,
  type OperatorOSUserLike,
} from '../../../../packages/auth/index.js';

export type PlatformRole = 'super_admin' | 'user' | string | null | undefined;
export type TenantRole = 'owner' | 'admin' | 'member' | string | null | undefined;

export { hasPlatformAdminAuthority, isRootSuperAdmin };

export function isSuperAdmin(
  platformRole: PlatformRole,
  user?: Pick<OperatorOSUserLike, 'email' | 'platformRole'> | null,
): boolean {
  return platformRole === 'super_admin' || (user ? isRootSuperAdmin(user) : false);
}

export function isTenantOwner(role: TenantRole): boolean {
  return role === 'owner';
}

export function isTenantAdmin(
  role: TenantRole,
  platformRole?: PlatformRole,
  user?: Pick<OperatorOSUserLike, 'email' | 'platformRole'> | null,
): boolean {
  return isSuperAdmin(platformRole, user) || role === 'owner' || role === 'admin';
}
