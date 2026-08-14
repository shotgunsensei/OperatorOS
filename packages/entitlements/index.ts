import {
  AuthRequirementError,
  hasPlatformAdminAuthority,
  requireAuth,
  type OperatorOSUserLike,
  type RequestWithUser,
} from '../auth/index.js';
import {
  getLaunchableModulesForEntitlements,
  getModuleById,
  type ModuleEntitlementEntry,
  type ModuleEntitlementInput,
} from '../modules/registry.js';

export interface RequestWithEntitlements<TUser extends OperatorOSUserLike = OperatorOSUserLike>
  extends RequestWithUser<TUser> {
  entitlements?: ModuleEntitlementInput;
  entitlementSnapshot?: { modules?: readonly ModuleEntitlementEntry[] } | null;
  operatoros?: {
    entitlements?: ModuleEntitlementInput;
    entitlementSnapshot?: { modules?: readonly ModuleEntitlementEntry[] } | null;
  } | null;
}

function readEntitlements(request: RequestWithEntitlements | null | undefined): ModuleEntitlementInput {
  return (
    request?.entitlements ??
    request?.entitlementSnapshot ??
    request?.operatoros?.entitlements ??
    request?.operatoros?.entitlementSnapshot ??
    null
  );
}

export function hasModuleEntitlement(
  entitlements: ModuleEntitlementInput,
  moduleId: string,
): boolean {
  const module = getModuleById(moduleId);
  if (!module) return false;
  return getLaunchableModulesForEntitlements(entitlements).some(entry => entry.id === module.id);
}

export function requireModuleEntitlement<TUser extends OperatorOSUserLike = OperatorOSUserLike>(
  request: RequestWithEntitlements<TUser> | null | undefined,
  moduleId: string,
): true {
  const user = requireAuth(request);
  const module = getModuleById(moduleId);
  if (!module) {
    throw new AuthRequirementError(404, 'MODULE_NOT_FOUND', 'Module not found');
  }
  if (hasPlatformAdminAuthority(user)) return true;
  if (!hasModuleEntitlement(readEntitlements(request), module.id)) {
    throw new AuthRequirementError(403, 'MODULE_ACCESS_DENIED', 'Module entitlement required');
  }
  return true;
}
