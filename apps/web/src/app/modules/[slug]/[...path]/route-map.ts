export interface CoreModuleDeepLinkTarget {
  /** Stable DOM target rendered by the consolidated native shell. */
  sectionId: string;
  /** Operator-facing name used by tests and future recovery navigation. */
  label: string;
}

type CoreModuleDeepLinkMap = Readonly<
  Record<string, Readonly<Record<string, CoreModuleDeepLinkTarget>>>
>;

/**
 * Deliberately small route contract for the three core consolidated modules.
 *
 * A path belongs here only when the shared OperatorOS runtime already renders
 * a meaningful native workflow for it. Imported-but-pending child routes must
 * continue to resolve to the module-scoped recovery state instead of silently
 * presenting the module overview as though the requested feature existed.
 */
export const CORE_MODULE_DEEP_LINKS: CoreModuleDeepLinkMap = {
  tradeflowkit: {
    '/dashboard': { sectionId: 'tradeflowkit-overview', label: 'Overview' },
    '/leads': { sectionId: 'tradeflowkit-lead-center', label: 'Lead Center' },
    '/customers': { sectionId: 'tradeflowkit-revenue-flow', label: 'Customers' },
    '/directory': { sectionId: 'tradeflowkit-directory', label: 'Business Directory' },
    '/contacts': { sectionId: 'tradeflowkit-directory', label: 'Shared Contacts' },
    '/sites': { sectionId: 'tradeflowkit-directory', label: 'Shared Sites' },
    '/jobs': { sectionId: 'tradeflowkit-operations', label: 'Jobs' },
    '/tasks': { sectionId: 'tradeflowkit-operations', label: 'Tasks' },
    '/quotes': { sectionId: 'tradeflowkit-revenue-flow', label: 'Quotes' },
    '/invoices': { sectionId: 'tradeflowkit-revenue-flow', label: 'Invoices' },
    '/payments': { sectionId: 'tradeflowkit-revenue-flow', label: 'Payments' },
    '/analytics': { sectionId: 'tradeflowkit-operations', label: 'Operational Analytics' },
    '/settings': { sectionId: 'tradeflowkit-settings', label: 'Settings' },
  },
  techdeck: {
    '/dashboard': { sectionId: 'techdeck-overview', label: 'Overview' },
    '/tickets': { sectionId: 'techdeck-ticket-queue', label: 'Ticket Queue' },
    '/assets': { sectionId: 'techdeck-inventory', label: 'Configuration Inventory' },
    '/inventory': { sectionId: 'techdeck-inventory', label: 'Configuration Inventory' },
    '/alerts': { sectionId: 'techdeck-inventory', label: 'Health Alerts' },
    '/scripts': { sectionId: 'techdeck-runbooks', label: 'Runbooks' },
    '/runbooks': { sectionId: 'techdeck-runbooks', label: 'Runbooks' },
    '/network': { sectionId: 'techdeck-network', label: 'Network and IPAM' },
    '/ipam': { sectionId: 'techdeck-network', label: 'Network and IPAM' },
    '/lifecycle': { sectionId: 'techdeck-lifecycle', label: 'Lifecycle' },
    '/documentation': { sectionId: 'techdeck-documentation', label: 'Documentation' },
    '/knowledge-base': { sectionId: 'techdeck-documentation', label: 'Knowledge Base' },
    '/evidence': { sectionId: 'techdeck-evidence', label: 'Evidence' },
    '/reports': { sectionId: 'techdeck-reports', label: 'Reports' },
    '/time': { sectionId: 'techdeck-time', label: 'Technician Time' },
    '/clients': { sectionId: 'techdeck-directory', label: 'Shared Clients' },
    '/sites': { sectionId: 'techdeck-directory', label: 'Shared Sites' },
    '/contacts': { sectionId: 'techdeck-directory', label: 'Shared Contacts' },
    '/settings': { sectionId: 'techdeck-settings', label: 'Settings' },
  },
  pulsedesk: {
    '/dashboard': { sectionId: 'pulsedesk-overview', label: 'Overview' },
    '/tickets': { sectionId: 'pulsedesk-operations', label: 'Request Queue' },
    '/requests': { sectionId: 'pulsedesk-operations', label: 'Request Queue' },
    '/departments': { sectionId: 'pulsedesk-operations', label: 'Departments' },
    '/clients': { sectionId: 'pulsedesk-directory', label: 'Service Clients' },
    '/facilities': { sectionId: 'pulsedesk-directory', label: 'Shared Facilities' },
    '/sites': { sectionId: 'pulsedesk-directory', label: 'Shared Sites' },
    '/contacts': { sectionId: 'pulsedesk-directory', label: 'Shared Contacts' },
    '/vendors': { sectionId: 'pulsedesk-directory', label: 'Shared Vendors' },
    '/settings': { sectionId: 'pulsedesk-settings', label: 'Settings' },
  },
};

const SAFE_PATH_SEGMENT = /^[a-z0-9-]+$/;

export function resolveCoreModuleDeepLink(
  slug: string,
  pathSegments: readonly string[],
): CoreModuleDeepLinkTarget | null {
  if (
    pathSegments.length === 0 ||
    pathSegments.some((segment) => !SAFE_PATH_SEGMENT.test(segment))
  ) {
    return null;
  }

  const routePath = `/${pathSegments.join('/')}`;
  const exact = CORE_MODULE_DEEP_LINKS[slug]?.[routePath];
  if (exact) return exact;
  if (slug === 'tradeflowkit' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'jobs' || resource === 'tasks') return { sectionId: 'tradeflowkit-operations', label: resource === 'jobs' ? 'Job Record' : 'Task Record' };
    if (resource === 'leads') return { sectionId: 'tradeflowkit-lead-center', label: 'Lead Record' };
    if (['customers', 'quotes', 'invoices', 'payments'].includes(resource)) return { sectionId: 'tradeflowkit-revenue-flow', label: 'Revenue Record' };
  }
  if (slug === 'techdeck' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'assets' || resource === 'inventory') return { sectionId: 'techdeck-inventory', label: 'Configuration Item' };
    if (resource === 'documents' || resource === 'runbooks') return { sectionId: 'techdeck-documentation', label: 'Document' };
    if (resource === 'evidence') return { sectionId: 'techdeck-evidence', label: 'Evidence Record' };
    if (resource === 'reports') return { sectionId: 'techdeck-reports', label: 'Report Snapshot' };
  }
  return null;
}

export function formatModuleDeepPath(pathSegments: readonly string[]): string {
  if (pathSegments.length === 0) return '/';
  return `/${pathSegments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}
