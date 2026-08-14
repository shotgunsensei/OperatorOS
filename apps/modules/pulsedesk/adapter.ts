export type OperatorOSTenantRole = 'owner' | 'admin' | 'member' | string | null | undefined;

export interface PulseDeskAdapterUser {
  id: string;
  email: string;
  name?: string | null;
  platformRole?: string | null;
}

export interface PulseDeskAdapterInput {
  currentUser: PulseDeskAdapterUser | null;
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

export type PulseDeskLocalRole = 'admin' | 'supervisor' | 'technician' | 'staff' | 'readonly';

export interface PulseDeskAdapterContext {
  moduleId: 'pulsedesk';
  moduleName: 'PulseDesk';
  source: 'operatoros';
  currentUser: PulseDeskAdapterUser | null;
  tenantId: string | null;
  operatorosRole: OperatorOSTenantRole;
  localRole: PulseDeskLocalRole;
  platformAdmin: boolean;
  entitled: boolean;
  standaloneLoginMode: 'operatoros_managed';
  legacySourcePath: 'apps/modules/pulsedesk/source';
  apiCompatibilityBasePath: '/api/modules/pulsedesk';
  localFallbackPath: '/modules/pulsedesk';
  hostnames: {
    production: 'pulsedesk.operatoros.net';
  };
  coreRoutes: Array<{
    id: string;
    label: string;
    sourcePath: string;
  }>;
}

function hasPulseDeskEntitlement(entitlements: PulseDeskAdapterInput['entitlements']): boolean {
  if (!entitlements) return false;

  const modules = Array.isArray(entitlements.modules) ? entitlements.modules : [];
  if (modules.some(module =>
    module.enabled === true &&
    (module.id === 'pulsedesk' ||
      module.slug === 'pulsedesk' ||
      module.entitlementKey === 'pulsedesk')
  )) {
    return true;
  }

  const direct = entitlements.pulsedesk;
  if (direct === true) return true;
  if (direct && typeof direct === 'object' && 'enabled' in direct) {
    return (direct as { enabled?: unknown }).enabled === true;
  }
  return false;
}

export function mapOperatorOSTenantRoleToPulseDeskRole(
  role: OperatorOSTenantRole,
  platformAdmin: boolean,
): PulseDeskLocalRole {
  if (platformAdmin) return 'admin';
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'supervisor') return 'supervisor';
  if (role === 'technician') return 'technician';
  if (role === 'readonly') return 'readonly';
  return 'staff';
}

export function createPulseDeskAdapterContext(input: PulseDeskAdapterInput): PulseDeskAdapterContext {
  return {
    moduleId: 'pulsedesk',
    moduleName: 'PulseDesk',
    source: 'operatoros',
    currentUser: input.currentUser,
    tenantId: input.tenantId,
    operatorosRole: input.role,
    localRole: mapOperatorOSTenantRoleToPulseDeskRole(input.role, input.platformAdmin),
    platformAdmin: input.platformAdmin,
    entitled: input.platformAdmin || hasPulseDeskEntitlement(input.entitlements),
    standaloneLoginMode: 'operatoros_managed',
    legacySourcePath: 'apps/modules/pulsedesk/source',
    apiCompatibilityBasePath: '/api/modules/pulsedesk',
    localFallbackPath: '/modules/pulsedesk',
    hostnames: {
      production: 'pulsedesk.operatoros.net',
    },
    coreRoutes: [
      { id: 'dashboard', label: 'Dashboard', sourcePath: '/dashboard' },
      { id: 'tickets', label: 'Tickets', sourcePath: '/tickets' },
      { id: 'departments', label: 'Departments', sourcePath: '/departments' },
      { id: 'assets', label: 'Assets', sourcePath: '/assets' },
      { id: 'supply-requests', label: 'Supply Requests', sourcePath: '/supply-requests' },
      { id: 'facility-requests', label: 'Facility Requests', sourcePath: '/facility-requests' },
      { id: 'vendors', label: 'Vendors', sourcePath: '/vendors' },
      { id: 'analytics', label: 'Analytics', sourcePath: '/analytics' },
      { id: 'knowledge', label: 'Knowledge', sourcePath: '/knowledge' },
      { id: 'service-desk-admin', label: 'Service Desk Admin', sourcePath: '/service-desk/admin' },
    ],
  };
}
