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
 * Deliberately small route contract for consolidated native modules.
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
    '/assets': { sectionId: 'pulsedesk-operations', label: 'Operational Equipment' },
    '/supply-requests': { sectionId: 'pulsedesk-operations', label: 'Supply Requests' },
    '/facility-requests': { sectionId: 'pulsedesk-operations', label: 'Facility Requests' },
    '/knowledge': { sectionId: 'pulsedesk-operations', label: 'Operational Knowledge' },
    '/service-desk/admin': { sectionId: 'pulsedesk-operations', label: 'Service Desk Administration' },
    '/clients': { sectionId: 'pulsedesk-directory', label: 'Service Clients' },
    '/facilities': { sectionId: 'pulsedesk-directory', label: 'Shared Facilities' },
    '/sites': { sectionId: 'pulsedesk-directory', label: 'Shared Sites' },
    '/contacts': { sectionId: 'pulsedesk-directory', label: 'Shared Contacts' },
    '/vendors': { sectionId: 'pulsedesk-directory', label: 'Shared Vendors' },
    '/settings': { sectionId: 'pulsedesk-settings', label: 'Settings' },
  },
  torqueshed: {
    '/dashboard': { sectionId: 'torqueshed-dashboard', label: 'Dashboard' },
    '/garage': { sectionId: 'torqueshed-garage', label: 'Garage' },
    '/vehicles': { sectionId: 'torqueshed-garage', label: 'Vehicles' },
    '/maintenance': { sectionId: 'torqueshed-service', label: 'Maintenance' },
    '/repairs': { sectionId: 'torqueshed-service', label: 'Repairs' },
    '/reminders': { sectionId: 'torqueshed-service', label: 'Service Reminders' },
    '/builds': { sectionId: 'torqueshed-builds', label: 'Builds' },
    '/diagnostics': { sectionId: 'torqueshed-diagnostics', label: 'Diagnostics' },
    '/diagnostic-templates': { sectionId: 'torqueshed-templates', label: 'Diagnostic Templates' },
    '/vendors': { sectionId: 'torqueshed-templates', label: 'Vendors' },
    '/marketplace': { sectionId: 'torqueshed-marketplace', label: 'Marketplace' },
    '/community': { sectionId: 'torqueshed-community', label: 'Community' },
    '/settings': { sectionId: 'torqueshed-templates', label: 'Settings' },
  },
  faultlinelab: {
    '/dashboard': { sectionId: 'faultlinelab-dashboard', label: 'Dashboard' },
    '/challenges': { sectionId: 'faultlinelab-challenges', label: 'Challenge Board' },
    '/daily': { sectionId: 'faultlinelab-challenges', label: 'Daily Challenge' },
    '/sessions': { sectionId: 'faultlinelab-session', label: 'Investigations' },
    '/assignments': { sectionId: 'faultlinelab-assignments', label: 'Assignments' },
    '/progress': { sectionId: 'faultlinelab-progress', label: 'Progress' },
    '/authoring': { sectionId: 'faultlinelab-authoring', label: 'Challenge Authoring' },
    '/analytics': { sectionId: 'faultlinelab-analytics', label: 'Tenant Analytics' },
  },
  'ninja-pool-hall': {
    '/practice': { sectionId: 'ninja-pool-hall-shell', label: 'Free Shoot' },
    '/cpu': { sectionId: 'ninja-pool-hall-shell', label: 'CPU Match' },
    '/local': { sectionId: 'ninja-pool-hall-shell', label: 'Local Match' },
    '/profile': { sectionId: 'ninja-pool-hall-shell', label: 'Player Profile' },
  },
  brandforgeos: {
    '/dashboard': { sectionId: 'brandforgeos-dashboard', label: 'Dashboard' },
    '/brands': { sectionId: 'brandforgeos-brands', label: 'Brand Kits' },
    '/personas': { sectionId: 'brandforgeos-personas', label: 'Audience Personas' },
    '/campaigns': { sectionId: 'brandforgeos-campaigns', label: 'Campaigns' },
    '/copy-studio': { sectionId: 'brandforgeos-copy', label: 'Copy Studio' },
    '/calendar': { sectionId: 'brandforgeos-calendar', label: 'Content Calendar' },
    '/analytics': { sectionId: 'brandforgeos-analytics', label: 'Analytics' },
    '/ai-workflows': { sectionId: 'brandforgeos-ai', label: 'AI Workflows' },
    '/settings': { sectionId: 'brandforgeos-settings', label: 'Settings' },
  },
  snapproofos: {
    '/dashboard': { sectionId: 'snapproofos-dashboard', label: 'Dashboard' },
    '/cases': { sectionId: 'snapproofos-cases', label: 'Evidence Cases' },
    '/evidence': { sectionId: 'snapproofos-evidence', label: 'Evidence' },
    '/review': { sectionId: 'snapproofos-review', label: 'Review Queue' },
    '/findings': { sectionId: 'snapproofos-findings', label: 'Findings' },
    '/reports': { sectionId: 'snapproofos-reports', label: 'Reports' },
    '/exports': { sectionId: 'snapproofos-reports', label: 'Defensible Exports' },
    '/custody': { sectionId: 'snapproofos-custody', label: 'Chain of Custody' },
    '/retention': { sectionId: 'snapproofos-retention', label: 'Retention' },
    '/settings': { sectionId: 'snapproofos-settings', label: 'Settings' },
  },
  'studyforge-ai': {
    '/dashboard': { sectionId: 'studyforge-dashboard', label: 'Dashboard' },
    '/subjects': { sectionId: 'studyforge-subjects', label: 'Subjects and Courses' },
    '/courses': { sectionId: 'studyforge-subjects', label: 'Subjects and Courses' },
    '/sources': { sectionId: 'studyforge-sources', label: 'Authorized Sources' },
    '/studio': { sectionId: 'studyforge-studio', label: 'AI Studio' },
    '/decks': { sectionId: 'studyforge-decks', label: 'Flashcard Decks' },
    '/flashcards': { sectionId: 'studyforge-decks', label: 'Flashcard Decks' },
    '/quizzes': { sectionId: 'studyforge-quizzes', label: 'Quizzes' },
    '/plans': { sectionId: 'studyforge-plans', label: 'Study Plans' },
    '/progress': { sectionId: 'studyforge-analytics', label: 'Progress' },
    '/analytics': { sectionId: 'studyforge-analytics', label: 'Analytics' },
  },
  'ninja-launch-kit': {
    '/dashboard': { sectionId: 'launchkit-dashboard', label: 'Launch Dashboard' },
    '/launches': { sectionId: 'launchkit-launches', label: 'Launch Workspaces' },
    '/builder': { sectionId: 'launchkit-builder', label: 'Launch Brief' },
    '/templates': { sectionId: 'launchkit-templates', label: 'Launch Templates' },
    '/plan': { sectionId: 'launchkit-plan', label: 'Launch Plan' },
    '/artifacts': { sectionId: 'launchkit-artifacts', label: 'Campaign Artifacts' },
    '/readiness': { sectionId: 'launchkit-readiness', label: 'Launch Readiness' },
    '/exports': { sectionId: 'launchkit-exports', label: 'Exports' },
  },
  'callcommand-ai': {
    '/dashboard': { sectionId: 'callcommand-calls', label: 'Call Dashboard' },
    '/channels': { sectionId: 'callcommand-configuration', label: 'Channels' },
    '/profiles': { sectionId: 'callcommand-configuration', label: 'Reception Profiles' },
    '/consent': { sectionId: 'callcommand-consent', label: 'Consent Ledger' },
    '/suppressions': { sectionId: 'callcommand-consent', label: 'Suppression Controls' },
    '/calls': { sectionId: 'callcommand-calls', label: 'Call Records' },
    '/operations': { sectionId: 'callcommand-operations', label: 'Controlled Calling' },
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
  if (slug === 'pulsedesk' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'tickets' || resource === 'requests') return { sectionId: 'pulsedesk-operations', label: 'Ticket Record' };
  }
  if (slug === 'torqueshed' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'vehicles') return { sectionId: 'torqueshed-garage', label: 'Vehicle Record' };
    if (resource === 'builds') return { sectionId: 'torqueshed-builds', label: 'Build Record' };
    if (resource === 'diagnostics') return { sectionId: 'torqueshed-diagnostics', label: 'Diagnostic Session' };
    if (resource === 'marketplace') return { sectionId: 'torqueshed-marketplace', label: 'Marketplace Listing' };
    if (resource === 'community') return { sectionId: 'torqueshed-community', label: 'Community Post' };
  }
  if (slug === 'faultlinelab' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'challenges') return { sectionId: 'faultlinelab-challenges', label: 'Challenge' };
    if (resource === 'sessions') return { sectionId: 'faultlinelab-session', label: 'Investigation' };
  }
  if (slug === 'ninja-pool-hall' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'matches') return { sectionId: 'ninja-pool-hall-shell', label: 'Saved Match' };
  }
  if (slug === 'brandforgeos' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'brands') return { sectionId: 'brandforgeos-brands', label: 'Brand Kit' };
    if (resource === 'personas') return { sectionId: 'brandforgeos-personas', label: 'Audience Persona' };
    if (resource === 'campaigns') return { sectionId: 'brandforgeos-campaigns', label: 'Campaign' };
    if (resource === 'copy-assets') return { sectionId: 'brandforgeos-copy', label: 'Copy Asset' };
    if (resource === 'calendar-items') return { sectionId: 'brandforgeos-calendar', label: 'Calendar Item' };
    if (resource === 'generations') return { sectionId: 'brandforgeos-ai', label: 'Generation Result' };
  }
  if (slug === 'snapproofos' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'cases') return { sectionId: 'snapproofos-cases', label: 'Evidence Case' };
    if (resource === 'evidence') return { sectionId: 'snapproofos-evidence', label: 'Evidence Item' };
    if (resource === 'reports') return { sectionId: 'snapproofos-reports', label: 'Report' };
  }
  if (slug === 'studyforge-ai' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'subjects' || resource === 'courses') return { sectionId: 'studyforge-subjects', label: 'Subject' };
    if (resource === 'sources') return { sectionId: 'studyforge-sources', label: 'Source' };
    if (resource === 'decks' || resource === 'cards') return { sectionId: 'studyforge-decks', label: 'Flashcard Deck' };
    if (resource === 'quizzes') return { sectionId: 'studyforge-quizzes', label: 'Quiz' };
    if (resource === 'plans') return { sectionId: 'studyforge-plans', label: 'Study Plan' };
  }
  if (slug === 'ninja-launch-kit' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'launches') return { sectionId: 'launchkit-launches', label: 'Launch Workspace' };
    if (resource === 'tasks' || resource === 'milestones' || resource === 'phases') return { sectionId: 'launchkit-plan', label: 'Launch Plan Record' };
    if (resource === 'artifacts') return { sectionId: 'launchkit-artifacts', label: 'Campaign Artifact' };
  }
  if (slug === 'callcommand-ai' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'calls') return { sectionId: 'callcommand-calls', label: 'Call Record' };
    if (resource === 'channels' || resource === 'profiles') return { sectionId: 'callcommand-configuration', label: 'Call Configuration' };
    if (resource === 'consents' || resource === 'suppressions') return { sectionId: 'callcommand-consent', label: 'Consent Record' };
  }
  return null;
}

export function formatModuleDeepPath(pathSegments: readonly string[]): string {
  if (pathSegments.length === 0) return '/';
  return `/${pathSegments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}
