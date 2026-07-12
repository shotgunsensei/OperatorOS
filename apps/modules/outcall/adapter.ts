/**
 * OperatorOS boundary for the planned OutCall child module.
 *
 * This adapter is deliberately data-only. OperatorOS remains authoritative
 * for the authenticated user, active tenant, role, and entitlement snapshot.
 * The OutCall runtime must never rebuild those decisions from client input.
 */

export type OperatorOSTenantRole = 'owner' | 'admin' | 'member' | string | null | undefined;

export interface OutCallAdapterUser {
  id: string;
  email: string;
  name?: string | null;
  platformRole?: string | null;
  status?: string | null;
}

export interface OutCallAdapterInput {
  currentUser: OutCallAdapterUser | null;
  tenantId: string | null;
  role: OperatorOSTenantRole;
  entitlements: {
    modules?: Array<{
      id?: string;
      slug?: string;
      entitlementKey?: string;
      enabled?: boolean;
    }>;
    [key: string]: unknown;
  } | null;
  platformAdmin: boolean;
}

export interface OutCallAdapterContext {
  moduleId: 'outcall';
  moduleName: 'OutCall';
  source: 'operatoros';
  currentUser: OutCallAdapterUser | null;
  tenantId: string | null;
  operatorosRole: OperatorOSTenantRole;
  platformAdmin: boolean;
  entitled: boolean;
  standaloneLoginMode: 'operatoros_managed';
  legacySourcePath: 'apps/modules/outcall/source';
  apiCompatibilityBasePath: '/api/outcall';
  localFallbackPath: '/modules/outcall';
  hostnames: {
    production: 'outcall.operatoros.net';
  };
}

function hasOutCallEntitlement(entitlements: OutCallAdapterInput['entitlements']): boolean {
  if (!entitlements) return false;

  const modules = Array.isArray(entitlements.modules) ? entitlements.modules : [];
  if (
    modules.some(
      (module) =>
        module.enabled === true &&
        (module.id === 'outcall' ||
          module.slug === 'outcall' ||
          module.entitlementKey === 'outcall'),
    )
  ) {
    return true;
  }

  const direct = entitlements.outcall;
  if (direct === true) return true;
  return Boolean(
    direct &&
    typeof direct === 'object' &&
    'enabled' in direct &&
    (direct as { enabled?: unknown }).enabled === true,
  );
}

export function createOutCallAdapterContext(input: OutCallAdapterInput): OutCallAdapterContext {
  return {
    moduleId: 'outcall',
    moduleName: 'OutCall',
    source: 'operatoros',
    currentUser: input.currentUser,
    tenantId: input.tenantId,
    operatorosRole: input.role,
    platformAdmin: input.platformAdmin,
    entitled: input.platformAdmin || hasOutCallEntitlement(input.entitlements),
    standaloneLoginMode: 'operatoros_managed',
    legacySourcePath: 'apps/modules/outcall/source',
    apiCompatibilityBasePath: '/api/outcall',
    localFallbackPath: '/modules/outcall',
    hostnames: { production: 'outcall.operatoros.net' },
  };
}
