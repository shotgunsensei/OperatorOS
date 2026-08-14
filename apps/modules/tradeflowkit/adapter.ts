export type OperatorOSTenantRole = 'owner' | 'admin' | 'member' | string | null | undefined;

export interface TradeFlowKitAdapterUser {
  id: string;
  email: string;
  name?: string | null;
  platformRole?: string | null;
}

export interface TradeFlowKitAdapterInput {
  currentUser: TradeFlowKitAdapterUser | null;
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

export type TradeFlowKitLocalRole = 'admin' | 'tech' | 'viewer';

export interface TradeFlowKitAdapterContext {
  moduleId: 'tradeflowkit';
  moduleName: 'TradeFlowKit';
  source: 'operatoros';
  currentUser: TradeFlowKitAdapterUser | null;
  tenantId: string | null;
  operatorosRole: OperatorOSTenantRole;
  localRole: TradeFlowKitLocalRole;
  platformAdmin: boolean;
  entitled: boolean;
  standaloneLoginMode: 'operatoros_managed';
  billingMode: 'operatoros_managed';
  legacySourcePath: 'apps/modules/tradeflowkit/source';
  apiCompatibilityBasePath: '/api/modules/tradeflowkit';
  localFallbackPath: '/modules/tradeflowkit';
  hostnames: {
    production: 'tradeflowkit.operatoros.net';
  };
  coreRoutes: Array<{
    id: string;
    label: string;
    sourcePath: string;
  }>;
  externalDependencies: Array<{
    id: string;
    label: string;
    purpose: string;
  }>;
}

function hasTradeFlowKitEntitlement(entitlements: TradeFlowKitAdapterInput['entitlements']): boolean {
  if (!entitlements) return false;

  const modules = Array.isArray(entitlements.modules) ? entitlements.modules : [];
  if (modules.some(module =>
    module.enabled === true &&
    (module.id === 'tradeflowkit' ||
      module.slug === 'tradeflowkit' ||
      module.entitlementKey === 'tradeflowkit')
  )) {
    return true;
  }

  const direct = entitlements.tradeflowkit;
  if (direct === true) return true;
  if (direct && typeof direct === 'object' && 'enabled' in direct) {
    return (direct as { enabled?: unknown }).enabled === true;
  }
  return false;
}

export function mapOperatorOSTenantRoleToTradeFlowKitRole(
  role: OperatorOSTenantRole,
  platformAdmin: boolean,
): TradeFlowKitLocalRole {
  if (platformAdmin) return 'admin';
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'viewer' || role === 'readonly' || role === 'read') return 'viewer';
  return 'tech';
}

export function createTradeFlowKitAdapterContext(input: TradeFlowKitAdapterInput): TradeFlowKitAdapterContext {
  return {
    moduleId: 'tradeflowkit',
    moduleName: 'TradeFlowKit',
    source: 'operatoros',
    currentUser: input.currentUser,
    tenantId: input.tenantId,
    operatorosRole: input.role,
    localRole: mapOperatorOSTenantRoleToTradeFlowKitRole(input.role, input.platformAdmin),
    platformAdmin: input.platformAdmin,
    entitled: input.platformAdmin || hasTradeFlowKitEntitlement(input.entitlements),
    standaloneLoginMode: 'operatoros_managed',
    billingMode: 'operatoros_managed',
    legacySourcePath: 'apps/modules/tradeflowkit/source',
    apiCompatibilityBasePath: '/api/modules/tradeflowkit',
    localFallbackPath: '/modules/tradeflowkit',
    hostnames: {
      production: 'tradeflowkit.operatoros.net',
    },
    coreRoutes: [
      { id: 'dashboard', label: 'Dashboard', sourcePath: '/dashboard' },
      { id: 'leads', label: 'Leads', sourcePath: '/leads' },
      { id: 'customers', label: 'Customers', sourcePath: '/customers' },
      { id: 'jobs', label: 'Jobs', sourcePath: '/jobs' },
      { id: 'quotes', label: 'Quotes', sourcePath: '/quotes' },
      { id: 'invoices', label: 'Invoices', sourcePath: '/invoices' },
      { id: 'analytics', label: 'Analytics', sourcePath: '/analytics' },
      { id: 'call-recovery', label: 'Call Recovery', sourcePath: '/call-recovery' },
      { id: 'settings', label: 'Settings', sourcePath: '/settings' },
    ],
    externalDependencies: [
      { id: 'postgres', label: 'PostgreSQL', purpose: 'Drizzle data model, sessions, tenant/org state, and revenue workflows.' },
      { id: 'stripe', label: 'Stripe', purpose: 'Legacy subscriptions, Stripe Connect payouts, and invoice payment links.' },
      { id: 'sendgrid', label: 'SendGrid', purpose: 'Quote and invoice email delivery.' },
      { id: 'twilio', label: 'Twilio', purpose: 'SMS reminders and Call Recovery workflows.' },
      { id: 'openai', label: 'OpenAI', purpose: 'Call Recovery AI conversation support.' },
    ],
  };
}
