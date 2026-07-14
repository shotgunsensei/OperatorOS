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
    '/jobs': { sectionId: 'tradeflowkit-revenue-flow', label: 'Jobs' },
    '/quotes': { sectionId: 'tradeflowkit-revenue-flow', label: 'Quotes' },
    '/invoices': { sectionId: 'tradeflowkit-revenue-flow', label: 'Invoices' },
    '/settings': { sectionId: 'tradeflowkit-settings', label: 'Settings' },
  },
  techdeck: {
    '/dashboard': { sectionId: 'techdeck-overview', label: 'Overview' },
    '/tickets': { sectionId: 'techdeck-ticket-queue', label: 'Ticket Queue' },
    '/settings': { sectionId: 'techdeck-settings', label: 'Settings' },
  },
  pulsedesk: {
    '/dashboard': { sectionId: 'pulsedesk-overview', label: 'Overview' },
    '/tickets': { sectionId: 'pulsedesk-operations', label: 'Request Queue' },
    '/requests': { sectionId: 'pulsedesk-operations', label: 'Request Queue' },
    '/departments': { sectionId: 'pulsedesk-operations', label: 'Departments' },
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
  return CORE_MODULE_DEEP_LINKS[slug]?.[routePath] ?? null;
}

export function formatModuleDeepPath(pathSegments: readonly string[]): string {
  if (pathSegments.length === 0) return '/';
  return `/${pathSegments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}
