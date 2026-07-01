import {
  AuthRequirementError,
  hasPlatformAdminAuthority,
  requireAuth,
  type OperatorOSUserLike,
  type RequestWithUser,
} from '../auth/index.js';

export type TenantRole = 'owner' | 'admin' | 'member' | string | null | undefined;

export interface TenantContextLike {
  tenantId?: string | null;
  role?: TenantRole;
  viaPlatformRole?: boolean;
  status?: string | null;
  suspended?: boolean;
}

export interface RequestWithTenantContext<TUser extends OperatorOSUserLike = OperatorOSUserLike>
  extends RequestWithUser<TUser> {
  tenantContext?: TenantContextLike | null;
  params?: Record<string, unknown> | null;
}

export function getTenantContext(request: RequestWithTenantContext | null | undefined): TenantContextLike | null {
  return request?.tenantContext ?? null;
}

export function isTenantMember(
  request: RequestWithTenantContext | null | undefined,
  tenantId?: string | null,
): boolean {
  const user = request?.user ?? null;
  const ctx = getTenantContext(request);
  if (!ctx && !hasPlatformAdminAuthority(user)) return false;
  if (!tenantId) return !!ctx || hasPlatformAdminAuthority(user);
  if (ctx?.tenantId === tenantId) return true;
  return hasPlatformAdminAuthority(user);
}

export function requireTenantMember<TUser extends OperatorOSUserLike = OperatorOSUserLike>(
  request: RequestWithTenantContext<TUser> | null | undefined,
  tenantId?: string | null,
): TenantContextLike {
  const user = requireAuth(request);
  const ctx = getTenantContext(request);
  const requestedTenantId =
    tenantId ??
    (typeof request?.params?.tenantId === 'string' ? request.params.tenantId : undefined);

  if (!ctx) {
    if (hasPlatformAdminAuthority(user) && requestedTenantId) {
      return {
        tenantId: requestedTenantId,
        role: 'owner',
        viaPlatformRole: true,
        status: 'active',
        suspended: false,
      };
    }
    throw new AuthRequirementError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }

  if (requestedTenantId && ctx.tenantId !== requestedTenantId && !hasPlatformAdminAuthority(user)) {
    throw new AuthRequirementError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }

  if (ctx.suspended && !hasPlatformAdminAuthority(user)) {
    throw new AuthRequirementError(403, 'TENANT_SUSPENDED', 'Tenant is suspended');
  }

  return ctx;
}

export function isTenantAdmin(
  tenantContext: TenantContextLike | null | undefined,
  user?: OperatorOSUserLike | null,
): boolean {
  return hasPlatformAdminAuthority(user) || tenantContext?.role === 'owner' || tenantContext?.role === 'admin';
}
