export type OperatorOSTenantRole = 'owner' | 'admin' | 'member' | string | null | undefined;

export interface TechDeckAdapterUser {
  id: string;
  email: string;
  name?: string | null;
  platformRole?: string | null;
}

export interface TechDeckAdapterInput {
  currentUser: TechDeckAdapterUser | null;
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

export type TechDeckLocalRole = 'ADMIN' | 'TECH' | 'CLIENT';

export interface TechDeckAdapterContext {
  moduleId: 'techdeck';
  moduleName: 'TechDeck';
  source: 'operatoros';
  currentUser: TechDeckAdapterUser | null;
  tenantId: string | null;
  operatorosRole: OperatorOSTenantRole;
  localRole: TechDeckLocalRole;
  platformAdmin: boolean;
  entitled: boolean;
  standaloneLoginMode: 'operatoros_managed';
  legacySourcePath: 'apps/modules/techdeck/source';
  apiCompatibilityBasePath: '/api/modules/techdeck';
  localFallbackPath: '/modules/techdeck';
  hostnames: {
    production: 'techdeck.operatoros.net';
    legacy: 'techdeck.app';
  };
}

function hasTechDeckEntitlement(entitlements: TechDeckAdapterInput['entitlements']): boolean {
  if (!entitlements) return false;

  const modules = Array.isArray(entitlements.modules) ? entitlements.modules : [];
  if (modules.some(module =>
    module.enabled === true &&
    (module.id === 'techdeck' || module.slug === 'techdeck' || module.entitlementKey === 'techdeck')
  )) {
    return true;
  }

  const direct = entitlements.techdeck;
  if (direct === true) return true;
  if (direct && typeof direct === 'object' && 'enabled' in direct) {
    return (direct as { enabled?: unknown }).enabled === true;
  }
  return false;
}

export function mapOperatorOSTenantRoleToTechDeckRole(
  role: OperatorOSTenantRole,
  platformAdmin: boolean,
): TechDeckLocalRole {
  if (platformAdmin) return 'ADMIN';
  if (role === 'owner' || role === 'admin') return 'ADMIN';
  return 'TECH';
}

export function createTechDeckAdapterContext(input: TechDeckAdapterInput): TechDeckAdapterContext {
  return {
    moduleId: 'techdeck',
    moduleName: 'TechDeck',
    source: 'operatoros',
    currentUser: input.currentUser,
    tenantId: input.tenantId,
    operatorosRole: input.role,
    localRole: mapOperatorOSTenantRoleToTechDeckRole(input.role, input.platformAdmin),
    platformAdmin: input.platformAdmin,
    entitled: input.platformAdmin || hasTechDeckEntitlement(input.entitlements),
    standaloneLoginMode: 'operatoros_managed',
    legacySourcePath: 'apps/modules/techdeck/source',
    apiCompatibilityBasePath: '/api/modules/techdeck',
    localFallbackPath: '/modules/techdeck',
    hostnames: {
      production: 'techdeck.operatoros.net',
      legacy: 'techdeck.app',
    },
  };
}
