export interface CoreModuleDeepLinkTarget {
  /** Stable DOM target rendered by the consolidated native shell. */
  sectionId: string;
  /** Operator-facing name used by tests and future recovery navigation. */
  label: string;
  /** Optional source-compatibility redirect to the canonical active route. */
  redirectPath?: string;
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
    '/leads/demo': { sectionId: 'tradeflowkit-lead-center', label: 'Lead Center', redirectPath: '/leads' },
    '/customers': { sectionId: 'tradeflowkit-revenue-flow', label: 'Customers' },
    '/directory': { sectionId: 'tradeflowkit-directory', label: 'Business Directory' },
    '/contacts': { sectionId: 'tradeflowkit-directory', label: 'Shared Contacts' },
    '/sites': { sectionId: 'tradeflowkit-directory', label: 'Shared Sites' },
    '/jobs': { sectionId: 'tradeflowkit-operations', label: 'Jobs' },
    '/tasks': { sectionId: 'tradeflowkit-operations', label: 'Tasks' },
    '/quotes': { sectionId: 'tradeflowkit-revenue-flow', label: 'Quotes' },
    '/quotes/new': { sectionId: 'tradeflowkit-revenue-flow', label: 'New Quote' },
    '/invoices': { sectionId: 'tradeflowkit-revenue-flow', label: 'Invoices' },
    '/invoices/new': { sectionId: 'tradeflowkit-revenue-flow', label: 'New Invoice' },
    '/payments': { sectionId: 'tradeflowkit-revenue-flow', label: 'Payments' },
    '/analytics': { sectionId: 'tradeflowkit-operations', label: 'Operational Analytics' },
    '/trash': { sectionId: 'tradeflowkit-trash', label: 'Archived Records' },
    '/settings': { sectionId: 'tradeflowkit-settings', label: 'Settings' },
  },
  techdeck: {
    '/dashboard': { sectionId: 'techdeck-overview', label: 'Overview' },
    '/m': { sectionId: 'techdeck-overview', label: 'Overview' },
    '/m/tickets': { sectionId: 'techdeck-ticket-queue', label: 'Ticket Queue' },
    '/m/time': { sectionId: 'techdeck-time', label: 'Technician Time' },
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
    '/kb': { sectionId: 'techdeck-documentation', label: 'Knowledge Base' },
    '/knowledge-base': { sectionId: 'techdeck-documentation', label: 'Knowledge Base' },
    '/evidence': { sectionId: 'techdeck-evidence', label: 'Evidence' },
    '/evidence/upload': { sectionId: 'techdeck-evidence', label: 'Record Evidence' },
    '/reports': { sectionId: 'techdeck-reports', label: 'Reports' },
    '/time': { sectionId: 'techdeck-time', label: 'Technician Time' },
    '/clients': { sectionId: 'techdeck-directory', label: 'Shared Clients' },
    '/sites': { sectionId: 'techdeck-directory', label: 'Shared Sites' },
    '/contacts': { sectionId: 'techdeck-directory', label: 'Shared Contacts' },
    '/calendar': { sectionId: 'techdeck-calendar', label: 'Service Calendar' },
    '/recurring-tickets': { sectionId: 'techdeck-calendar', label: 'Recurring Tickets' },
    '/portal': { sectionId: 'techdeck-portal', label: 'Client Portal' },
    '/portal/tickets': { sectionId: 'techdeck-portal', label: 'Portal Tickets' },
    '/portal/evidence': { sectionId: 'techdeck-portal', label: 'Portal Evidence' },
    '/licenses': { sectionId: 'techdeck-licenses', label: 'License Server' },
    '/licenses/developer': { sectionId: 'techdeck-licenses', label: 'License Validation' },
    '/webhooks': { sectionId: 'techdeck-webhooks', label: 'Outbound Webhooks' },
    '/api-tokens': { sectionId: 'techdeck-api-tokens', label: 'Scoped API Tokens' },
    '/status-admin': { sectionId: 'techdeck-status', label: 'Status Administration' },
    '/secure-intake': { sectionId: 'techdeck-secure-intake', label: 'Secure Intake' },
    '/compliance-packets': { sectionId: 'techdeck-compliance', label: 'Compliance Packets' },
    '/itops': { sectionId: 'techdeck-compliance', label: 'IT Operations Guidance' },
    '/settings': { sectionId: 'techdeck-settings', label: 'Settings' },
  },
  pulsedesk: {
    '/app': { sectionId: 'pulsedesk-overview', label: 'Overview' },
    '/dashboard': { sectionId: 'pulsedesk-overview', label: 'Overview' },
    '/tickets': { sectionId: 'pulsedesk-operations', label: 'Request Queue' },
    '/requests': { sectionId: 'pulsedesk-operations', label: 'Request Queue' },
    '/submit': { sectionId: 'pulsedesk-operations', label: 'Submit a Request' },
    '/departments': { sectionId: 'pulsedesk-operations', label: 'Departments' },
    '/assets': { sectionId: 'pulsedesk-operations', label: 'Operational Equipment' },
    '/supply-requests': { sectionId: 'pulsedesk-operations', label: 'Supply Requests' },
    '/facility-requests': { sectionId: 'pulsedesk-operations', label: 'Facility Requests' },
    '/knowledge': { sectionId: 'pulsedesk-operations', label: 'Operational Knowledge' },
    '/service-desk/admin': { sectionId: 'pulsedesk-operations', label: 'Service Desk Administration' },
    '/service-desk-admin': { sectionId: 'pulsedesk-operations', label: 'Service Desk Administration' },
    '/analytics': { sectionId: 'pulsedesk-overview', label: 'Operational Analytics' },
    '/clients': { sectionId: 'pulsedesk-directory', label: 'Service Clients' },
    '/facilities': { sectionId: 'pulsedesk-directory', label: 'Shared Facilities' },
    '/sites': { sectionId: 'pulsedesk-directory', label: 'Shared Sites' },
    '/contacts': { sectionId: 'pulsedesk-directory', label: 'Shared Contacts' },
    '/vendors': { sectionId: 'pulsedesk-directory', label: 'Shared Vendors' },
    '/settings': { sectionId: 'pulsedesk-settings', label: 'Settings' },
  },
  torqueshed: {
    '/native-auth': { sectionId: 'torqueshed-native-authorize', label: 'Native Device Authorization' },
    '/dashboard': { sectionId: 'torqueshed-dashboard', label: 'Dashboard', redirectPath: '/' },
    '/garage': { sectionId: 'torqueshed-garage', label: 'Garage' },
    '/garage/vehicles/new': { sectionId: 'torqueshed-garage', label: 'Add Vehicle' },
    '/vehicles': { sectionId: 'torqueshed-garage', label: 'Vehicles', redirectPath: '/garage' },
    '/service': { sectionId: 'torqueshed-service', label: 'Service' },
    '/maintenance': { sectionId: 'torqueshed-service', label: 'Maintenance', redirectPath: '/service' },
    '/repairs': { sectionId: 'torqueshed-service', label: 'Repairs', redirectPath: '/service' },
    '/reminders': { sectionId: 'torqueshed-service', label: 'Service Reminders', redirectPath: '/service' },
    '/builds': { sectionId: 'torqueshed-builds', label: 'Builds' },
    '/journal': { sectionId: 'torqueshed-journal', label: 'Build Journal' },
    '/build-journal': { sectionId: 'torqueshed-journal', label: 'Build Journal', redirectPath: '/journal' },
    '/diagnostics': { sectionId: 'torqueshed-diagnostics', label: 'Diagnostics' },
    '/diagnostics/new': { sectionId: 'torqueshed-diagnostics', label: 'New Diagnostic' },
    '/live-bay': { sectionId: 'torqueshed-live-bay', label: 'Live Bay', redirectPath: '/live-bays' },
    '/live-bays': { sectionId: 'torqueshed-live-bay', label: 'Live Bays' },
    '/templates': { sectionId: 'torqueshed-templates', label: 'Templates and Vendors' },
    '/diagnostic-templates': { sectionId: 'torqueshed-templates', label: 'Diagnostic Templates', redirectPath: '/templates' },
    '/vendors': { sectionId: 'torqueshed-templates', label: 'Vendors', redirectPath: '/templates' },
    '/marketplace': { sectionId: 'torqueshed-marketplace', label: 'Marketplace' },
    '/community': { sectionId: 'torqueshed-community', label: 'Community' },
    '/profile': { sectionId: 'torqueshed-tools', label: 'Profile' },
    '/billing/credits': { sectionId: 'torqueshed-credits-route', label: 'Credits and Usage' },
    '/search': { sectionId: 'torqueshed-tools', label: 'Product Search' },
    '/activity': { sectionId: 'torqueshed-tools', label: 'Activity' },
    '/notifications': { sectionId: 'torqueshed-tools', label: 'Notifications', redirectPath: '/activity' },
    '/exports': { sectionId: 'torqueshed-tools', label: 'Exports' },
    '/settings': { sectionId: 'torqueshed-tools', label: 'Settings' },
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
    '/online': { sectionId: 'ninja-pool-hall-shell', label: 'Online Rooms' },
    '/host': { sectionId: 'ninja-pool-hall-shell', label: 'Host Online Room' },
    '/join': { sectionId: 'ninja-pool-hall-shell', label: 'Join Online Room' },
    '/profile': { sectionId: 'ninja-pool-hall-shell', label: 'Player Profile' },
  },
  brandforgeos: {
    '/dashboard': { sectionId: 'brandforgeos-dashboard', label: 'Dashboard' },
    '/brands': { sectionId: 'brandforgeos-brands', label: 'Brand Kits' },
    '/personas': { sectionId: 'brandforgeos-personas', label: 'Audience Personas' },
    '/offers': { sectionId: 'brandforgeos-offers', label: 'Offers' },
    '/campaigns': { sectionId: 'brandforgeos-campaigns', label: 'Campaigns' },
    '/copy-studio': { sectionId: 'brandforgeos-copy', label: 'Copy Studio' },
    '/calendar': { sectionId: 'brandforgeos-calendar', label: 'Content Calendar' },
    '/analytics': { sectionId: 'brandforgeos-analytics', label: 'Analytics' },
    '/ai-workflows': { sectionId: 'brandforgeos-ai', label: 'AI Workflows' },
    '/strategy': { sectionId: 'brandforgeos-strategy', label: 'Guided Strategy' },
    '/templates': { sectionId: 'brandforgeos-templates', label: 'Template Marketplace' },
    '/integrations': { sectionId: 'brandforgeos-integrations', label: 'Integrations' },
    '/reports': { sectionId: 'brandforgeos-reports', label: 'Reports and Exports' },
    '/activity': { sectionId: 'brandforgeos-activity', label: 'Activity and Notifications' },
    '/admin': { sectionId: 'brandforgeos-admin', label: 'Plan and Security' },
    '/onboarding': { sectionId: 'brandforgeos-settings', label: 'Onboarding' },
    '/pricing': { sectionId: 'brandforgeos-admin', label: 'OperatorOS Plan' },
    '/legal': { sectionId: 'brandforgeos-admin', label: 'Legal and Security' },
    '/privacy': { sectionId: 'brandforgeos-admin', label: 'Privacy' },
    '/terms': { sectionId: 'brandforgeos-admin', label: 'Terms' },
    '/home': { sectionId: 'brandforgeos-dashboard', label: 'Home' },
    '/login': { sectionId: 'brandforgeos-dashboard', label: 'OperatorOS Login' },
    '/settings': { sectionId: 'brandforgeos-settings', label: 'Settings' },
  },
  snapproofos: {
    '/dashboard': { sectionId: 'snapproofos-dashboard', label: 'Dashboard' },
    '/customers': { sectionId: 'snapproofos-customers', label: 'Customers' },
    '/jobs': { sectionId: 'snapproofos-jobs', label: 'Jobs' },
    '/capture': { sectionId: 'snapproofos-capture', label: 'Mobile Capture' },
    '/files': { sectionId: 'snapproofos-capture', label: 'Files and Photos' },
    '/work': { sectionId: 'snapproofos-work', label: 'Findings and Notes' },
    '/costs': { sectionId: 'snapproofos-costs', label: 'Parts and Labor' },
    '/templates': { sectionId: 'snapproofos-templates', label: 'Job Templates' },
    '/team': { sectionId: 'snapproofos-team', label: 'Team' },
    '/activity': { sectionId: 'snapproofos-activity', label: 'Activity' },
    '/branding': { sectionId: 'snapproofos-branding', label: 'Organization Branding' },
    '/profile': { sectionId: 'snapproofos-branding', label: 'Profile and Organization' },
    '/billing': { sectionId: 'snapproofos-branding', label: 'Plan and Billing' },
    '/cases': { sectionId: 'snapproofos-cases', label: 'Evidence Cases' },
    '/evidence': { sectionId: 'snapproofos-evidence', label: 'Evidence' },
    '/review': { sectionId: 'snapproofos-review', label: 'Review Queue' },
    '/findings': { sectionId: 'snapproofos-work', label: 'Findings' },
    '/reports': { sectionId: 'snapproofos-reports', label: 'Reports' },
    '/exports': { sectionId: 'snapproofos-reports', label: 'Defensible Exports' },
    '/custody': { sectionId: 'snapproofos-custody', label: 'Chain of Custody' },
    '/retention': { sectionId: 'snapproofos-retention', label: 'Retention' },
    '/settings': { sectionId: 'snapproofos-settings', label: 'Settings' },
  },
  'studyforge-ai': {
    '/app': { sectionId: 'studyforge-dashboard', label: 'Learning Home' },
    '/dashboard': { sectionId: 'studyforge-dashboard', label: 'Learning Home' },
    '/sets': { sectionId: 'studyforge-sets', label: 'Study Sets' },
    '/sets/new': { sectionId: 'studyforge-new-set', label: 'New Study Set' },
    '/folders': { sectionId: 'studyforge-sets', label: 'Folders' },
    '/exams': { sectionId: 'studyforge-exams', label: 'Exam Countdowns' },
    '/account': { sectionId: 'studyforge-account', label: 'Plan and Usage' },
    '/admin': { sectionId: 'studyforge-account', label: 'StudyForge Administration' },
    '/pricing': { sectionId: 'studyforge-account', label: 'OperatorOS Plan' },
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
    '/app': { sectionId: 'launchkit-dashboard', label: 'Launch Dashboard' },
    '/launches': { sectionId: 'launchkit-execution', label: 'Launch Workspaces' },
    '/builder': { sectionId: 'launchkit-builder', label: 'Launch Brief' },
    '/templates': { sectionId: 'launchkit-templates', label: 'Launch Templates' },
    '/kits': { sectionId: 'launchkit-kits', label: 'Generated Launch Kits' },
    '/brands': { sectionId: 'launchkit-brands', label: 'Brand Profiles' },
    '/visual-promos': { sectionId: 'launchkit-visual-promos', label: 'Visual Promo Briefs' },
    '/plan': { sectionId: 'launchkit-execution', label: 'Launch Plan' },
    '/artifacts': { sectionId: 'launchkit-execution', label: 'Campaign Artifacts' },
    '/readiness': { sectionId: 'launchkit-execution', label: 'Launch Readiness' },
    '/exports': { sectionId: 'launchkit-exports', label: 'Exports' },
    '/account': { sectionId: 'launchkit-account', label: 'Plan and Usage' },
    '/admin': { sectionId: 'launchkit-admin', label: 'Ninja Launch Kit Administration' },
    '/pricing': { sectionId: 'launchkit-account', label: 'OperatorOS Plan' },
  },
  'callcommand-ai': {
    '/dashboard': { sectionId: 'callcommand-dashboard', label: 'Call Dashboard' },
    '/app': { sectionId: 'callcommand-dashboard', label: 'CallCommand AI' },
    '/channels': { sectionId: 'callcommand-configuration', label: 'Channels' },
    '/profiles': { sectionId: 'callcommand-receptionists', label: 'Reception Profiles' },
    '/receptionist-profiles': { sectionId: 'callcommand-receptionists', label: 'Receptionist Profiles' },
    '/flows': { sectionId: 'callcommand-flows', label: 'Call Flows' },
    '/automation-rules': { sectionId: 'callcommand-automation', label: 'Automation Rules' },
    '/switchboard': { sectionId: 'callcommand-switchboard', label: 'Live Switchboard' },
    '/setup/telephony': { sectionId: 'callcommand-settings', label: 'Telephony Setup' },
    '/integrations': { sectionId: 'callcommand-settings', label: 'Integrations' },
    '/transfer-targets': { sectionId: 'callcommand-switchboard', label: 'Transfer Targets' },
    '/simulate': { sectionId: 'callcommand-calls', label: 'Call Simulator' },
    '/simulate/live-call': { sectionId: 'callcommand-switchboard', label: 'Live Call Simulator' },
    '/consent': { sectionId: 'callcommand-configuration', label: 'Consent Policy and Ledger' },
    '/suppressions': { sectionId: 'callcommand-settings', label: 'Suppression Controls' },
    '/calls': { sectionId: 'callcommand-calls', label: 'Call Records' },
    '/operations': { sectionId: 'callcommand-calls', label: 'Controlled Calling' },
    '/tickets': { sectionId: 'callcommand-work', label: 'Call Tickets' },
    '/leads': { sectionId: 'callcommand-work', label: 'Call Leads' },
    '/tasks': { sectionId: 'callcommand-work', label: 'Call Tasks' },
    '/billing': { sectionId: 'callcommand-settings', label: 'OperatorOS Plan and Usage' },
    '/settings': { sectionId: 'callcommand-settings', label: 'CallCommand Settings' },
    '/organizations': { sectionId: 'callcommand-msp-organizations', label: 'MSP Organizations' },
    '/contacts': { sectionId: 'callcommand-msp-contacts', label: 'MSP Support Contacts' },
    '/integrations/health': { sectionId: 'callcommand-msp-integrations', label: 'MSP Integration Health' },
    '/action-catalog': { sectionId: 'callcommand-msp-policy', label: 'Approved Action Catalog' },
    '/policy': { sectionId: 'callcommand-msp-policy', label: 'Automation Policy' },
    '/audit': { sectionId: 'callcommand-msp-audit', label: 'Call Evidence Ledger' },
    '/onboarding': { sectionId: 'callcommand-msp-onboarding', label: 'MSP Production Onboarding' },
  },
  ninjamation: {
    '/dashboard': { sectionId: 'ninjamation-dashboard', label: 'Script Dashboard' },
    '/scripts': { sectionId: 'ninjamation-scripts', label: 'Script Library' },
    '/library': { sectionId: 'ninjamation-library', label: 'Script Library' },
    '/editor': { sectionId: 'ninjamation-editor', label: 'Script Editor' },
    '/review': { sectionId: 'ninjamation-review', label: 'Review Queue' },
    '/generate': { sectionId: 'ninjamation-generations', label: 'AI Draft Generator' },
    '/generations': { sectionId: 'ninjamation-generations', label: 'AI Draft Generator' },
    '/downloads': { sectionId: 'ninjamation-downloads', label: 'Download Audit' },
    '/sync': { sectionId: 'ninjamation-sync', label: 'GitHub Synchronization' },
    '/account': { sectionId: 'ninjamation-account', label: 'Account and Usage' },
    '/billing': { sectionId: 'ninjamation-account', label: 'OperatorOS Billing' },
    '/checkout/success': { sectionId: 'ninjamation-account', label: 'OperatorOS Billing Status' },
    '/checkout/cancel': { sectionId: 'ninjamation-account', label: 'OperatorOS Billing Status' },
    '/admin': { sectionId: 'ninjamation-admin', label: 'Ninjamation Administration' },
  },
  outcall: {
    '/dashboard': { sectionId: 'outcall-readiness', label: 'Readiness and Safety' },
    '/readiness': { sectionId: 'outcall-readiness', label: 'Readiness and Safety' },
    '/setup': { sectionId: 'outcall-setup', label: 'Verified Mobile' },
    '/profiles': { sectionId: 'outcall-profiles', label: 'Rescue Profiles' },
    '/triggers': { sectionId: 'outcall-triggers', label: 'Private SMS Triggers' },
    '/calls': { sectionId: 'outcall-schedule', label: 'Scheduled Calls' },
    '/privacy': { sectionId: 'outcall-privacy', label: 'Privacy Controls' },
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
  if (slug === 'tradeflowkit' && pathSegments.length === 3) {
    const [resource, id, action] = pathSegments;
    if (resource === 'quotes' && (action === 'edit' || action === 'view')) {
      return { sectionId: 'tradeflowkit-revenue-flow', label: 'Quote Record', redirectPath: `/quotes/${encodeURIComponent(id)}` };
    }
    if (resource === 'invoices' && (action === 'edit' || action === 'pay')) {
      return { sectionId: 'tradeflowkit-revenue-flow', label: 'Invoice Record', redirectPath: `/invoices/${encodeURIComponent(id)}` };
    }
  }
  if (slug === 'tradeflowkit' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'jobs' || resource === 'tasks') return { sectionId: 'tradeflowkit-operations', label: resource === 'jobs' ? 'Job Record' : 'Task Record' };
    if (resource === 'leads') return { sectionId: 'tradeflowkit-lead-center', label: 'Lead Record' };
    if (resource === 'clients') return { sectionId: 'tradeflowkit-directory', label: 'Directory Organization' };
    if (['customers', 'quotes', 'invoices', 'payments'].includes(resource)) return { sectionId: 'tradeflowkit-revenue-flow', label: 'Revenue Record' };
  }
  if (slug === 'techdeck' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'assets' || resource === 'inventory') return { sectionId: 'techdeck-inventory', label: 'Configuration Item' };
    if (resource === 'documents' || resource === 'runbooks' || resource === 'kb' || resource === 'knowledge-base') return { sectionId: 'techdeck-documentation', label: 'Document' };
    if (resource === 'tickets') return { sectionId: 'techdeck-ticket-queue', label: 'Ticket Record' };
    if (resource === 'clients') return { sectionId: 'techdeck-directory', label: 'Managed Client Record' };
    if (resource === 'evidence') return { sectionId: 'techdeck-evidence', label: 'Evidence Record' };
    if (resource === 'reports') return { sectionId: 'techdeck-reports', label: 'Report Snapshot' };
    if (resource === 'appointments' || resource === 'recurring-tickets') return { sectionId: 'techdeck-calendar', label: 'Calendar Record' };
    if (resource === 'licenses') return { sectionId: 'techdeck-licenses', label: 'License Product' };
    if (resource === 'status-admin') return { sectionId: 'techdeck-status', label: 'Status Record' };
    if (resource === 'secure-intake') return { sectionId: 'techdeck-secure-intake', label: 'Intake Record' };
  }
  if (
    slug === 'techdeck' &&
    pathSegments.length === 3 &&
    pathSegments[0] === 'm' &&
    pathSegments[1] === 'tickets'
  ) {
    return { sectionId: 'techdeck-ticket-queue', label: 'Ticket Record' };
  }
  if (slug === 'pulsedesk' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'tickets' || resource === 'requests') return { sectionId: 'pulsedesk-operations', label: 'Ticket Record' };
    if (resource === 'clients') return { sectionId: 'pulsedesk-directory', label: 'Service Client Record' };
  }
  if (slug === 'outcall' && pathSegments.length === 2 && pathSegments[0] === 'calls') {
    return { sectionId: 'outcall-schedule', label: 'Scheduled Call Record' };
  }
  if (
    slug === 'pulsedesk' &&
    pathSegments.length === 3 &&
    pathSegments[0] === 'assets' &&
    pathSegments[2] === 'report-issue'
  ) {
    return { sectionId: 'pulsedesk-operations', label: 'Report Equipment Issue' };
  }
  if (slug === 'torqueshed' && pathSegments.length === 2) {
    const [resource, id] = pathSegments;
    if (resource === 'vehicles') return { sectionId: 'torqueshed-garage', label: 'Vehicle Record', redirectPath: `/garage/vehicles/${encodeURIComponent(id)}` };
    if (resource === 'builds') return { sectionId: 'torqueshed-builds', label: 'Build Record' };
    if (resource === 'diagnostics') return { sectionId: 'torqueshed-diagnostics', label: 'Diagnostic Session' };
    if (resource === 'marketplace') return { sectionId: 'torqueshed-marketplace', label: 'Marketplace Listing' };
    if (resource === 'community') return { sectionId: 'torqueshed-community', label: 'Community Post' };
    if (resource === 'live-bays') return { sectionId: 'torqueshed-live-bay', label: 'Live Bay Record' };
  }
  if (
    slug === 'torqueshed' &&
    pathSegments.length === 3 &&
    pathSegments[0] === 'garage' &&
    pathSegments[1] === 'vehicles'
  ) {
    return { sectionId: 'torqueshed-garage', label: 'Vehicle Record' };
  }
  if (
    slug === 'torqueshed' &&
    pathSegments.length === 3 &&
    pathSegments[0] === 'diagnostics' &&
    pathSegments[2] === 'assist'
  ) {
    return { sectionId: 'torqueshed-diagnostics', label: 'Torque Assist' };
  }
  if (slug === 'faultlinelab' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'challenges') return { sectionId: 'faultlinelab-challenges', label: 'Challenge' };
    if (resource === 'sessions') return { sectionId: 'faultlinelab-session', label: 'Investigation' };
  }
  if (slug === 'ninja-pool-hall' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'matches') return { sectionId: 'ninja-pool-hall-shell', label: 'Saved Match' };
    if (resource === 'rooms') return { sectionId: 'ninja-pool-hall-shell', label: 'Online Room' };
  }
  if (slug === 'brandforgeos' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'brands') return { sectionId: 'brandforgeos-brands', label: 'Brand Kit' };
    if (resource === 'personas') return { sectionId: 'brandforgeos-personas', label: 'Audience Persona' };
    if (resource === 'campaigns') return { sectionId: 'brandforgeos-campaigns', label: 'Campaign' };
    if (resource === 'copy-assets') return { sectionId: 'brandforgeos-copy', label: 'Copy Asset' };
    if (resource === 'calendar-items') return { sectionId: 'brandforgeos-calendar', label: 'Calendar Item' };
    if (resource === 'generations') return { sectionId: 'brandforgeos-ai', label: 'Generation Result' };
    if (resource === 'offers') return { sectionId: 'brandforgeos-offers', label: 'Offer' };
    if (resource === 'templates') return { sectionId: 'brandforgeos-templates', label: 'Template' };
    if (resource === 'reports' || resource === 'exports') return { sectionId: 'brandforgeos-reports', label: resource === 'reports' ? 'Report' : 'Export' };
    if (resource === 'workflows') return { sectionId: 'brandforgeos-strategy', label: 'Guided Workflow' };
  }
  if (slug === 'snapproofos' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'cases') return { sectionId: 'snapproofos-cases', label: 'Evidence Case' };
    if (resource === 'evidence') return { sectionId: 'snapproofos-evidence', label: 'Evidence Item' };
    if (resource === 'reports') return { sectionId: 'snapproofos-reports', label: 'Report' };
    if (resource === 'jobs') return { sectionId: 'snapproofos-jobs', label: 'Job' };
    if (resource === 'customers') return { sectionId: 'snapproofos-customers', label: 'Customer' };
  }
  if (slug === 'studyforge-ai' && pathSegments.length >= 2) {
    const [resource] = pathSegments;
    if (resource === 'sets') return { sectionId: 'studyforge-set-workspace', label: 'Study Set' };
    if (resource === 'subjects' || resource === 'courses') return { sectionId: 'studyforge-subjects', label: 'Subject' };
    if (resource === 'sources') return { sectionId: 'studyforge-sources', label: 'Source' };
    if (resource === 'decks' || resource === 'cards') return { sectionId: 'studyforge-decks', label: 'Flashcard Deck' };
    if (resource === 'quizzes') return { sectionId: 'studyforge-quizzes', label: 'Quiz' };
    if (resource === 'plans') return { sectionId: 'studyforge-plans', label: 'Study Plan' };
  }
  if (slug === 'ninja-launch-kit' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'launches') return { sectionId: 'launchkit-execution', label: 'Launch Workspace' };
    if (resource === 'tasks' || resource === 'milestones' || resource === 'phases') return { sectionId: 'launchkit-execution', label: 'Launch Plan Record' };
    if (resource === 'artifacts') return { sectionId: 'launchkit-execution', label: 'Campaign Artifact' };
    if (resource === 'kits') return { sectionId: 'launchkit-visual-promos', label: 'Generated Launch Kit' };
    if (resource === 'templates') return { sectionId: 'launchkit-templates', label: 'Launch Template' };
    if (resource === 'brands') return { sectionId: 'launchkit-brands', label: 'Brand Profile' };
    if (resource === 'exports') return { sectionId: 'launchkit-exports', label: 'Launch Export' };
  }
  if (slug === 'callcommand-ai' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'calls') return { sectionId: 'callcommand-calls', label: 'Call Record' };
    if (resource === 'channels' || resource === 'profiles') return { sectionId: 'callcommand-configuration', label: 'Call Configuration' };
    if (resource === 'consents' || resource === 'suppressions') return { sectionId: 'callcommand-settings', label: 'Consent Record' };
    if (resource === 'flows') return { sectionId: 'callcommand-flows', label: 'Call Flow' };
    if (resource === 'tickets' || resource === 'leads' || resource === 'tasks') return { sectionId: 'callcommand-work', label: 'Generated Work Record' };
  }
  if (slug === 'ninjamation' && pathSegments.length === 2) {
    const [resource] = pathSegments;
    if (resource === 'scripts') return { sectionId: 'ninjamation-editor', label: 'Script Record' };
    if (resource === 'generations') return { sectionId: 'ninjamation-generations', label: 'Generation Record' };
    if (resource === 'downloads') return { sectionId: 'ninjamation-downloads', label: 'Download Record' };
    if (resource === 'sync-runs') return { sectionId: 'ninjamation-sync', label: 'Synchronization Run' };
  }
  return null;
}

export function formatModuleDeepPath(pathSegments: readonly string[]): string {
  if (pathSegments.length === 0) return '/';
  return `/${pathSegments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}
