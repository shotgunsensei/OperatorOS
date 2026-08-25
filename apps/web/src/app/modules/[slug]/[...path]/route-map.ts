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
    '/workflows': { sectionId: 'tradeflowkit-workflows', label: 'Workflows' },
    '/tasks': { sectionId: 'tradeflowkit-tasks', label: 'Team Tasks' },
    '/recurring-jobs': { sectionId: 'tradeflowkit-recurring-jobs', label: 'Recurring Jobs' },
    '/activity': { sectionId: 'tradeflowkit-activity', label: 'Activity' },
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
    '/dashboard': { sectionId: 'techdeck-overview', label: 'Overview', redirectPath: '/' },
    '/m': { sectionId: 'techdeck-overview', label: 'Overview', redirectPath: '/' },
    '/m/tickets': { sectionId: 'techdeck-ticket-queue', label: 'Ticket Queue', redirectPath: '/tickets' },
    '/m/time': { sectionId: 'techdeck-time', label: 'Technician Time', redirectPath: '/time' },
    '/tickets': { sectionId: 'techdeck-ticket-queue', label: 'Ticket Queue' },
    '/assets': { sectionId: 'techdeck-inventory', label: 'Configuration Inventory' },
    '/inventory': { sectionId: 'techdeck-inventory', label: 'Configuration Inventory', redirectPath: '/assets' },
    '/alerts': { sectionId: 'techdeck-inventory', label: 'Health Alerts', redirectPath: '/assets' },
    '/scripts': { sectionId: 'techdeck-runbooks', label: 'Runbooks', redirectPath: '/runbooks' },
    '/runbooks': { sectionId: 'techdeck-runbooks', label: 'Runbooks' },
    '/network': { sectionId: 'techdeck-network', label: 'Network and IPAM' },
    '/ipam': { sectionId: 'techdeck-network', label: 'Network and IPAM', redirectPath: '/network' },
    '/lifecycle': { sectionId: 'techdeck-lifecycle', label: 'Lifecycle' },
    '/documentation': { sectionId: 'techdeck-documentation', label: 'Documentation' },
    '/kb': { sectionId: 'techdeck-documentation', label: 'Knowledge Base', redirectPath: '/documentation' },
    '/knowledge-base': { sectionId: 'techdeck-documentation', label: 'Knowledge Base', redirectPath: '/documentation' },
    '/evidence': { sectionId: 'techdeck-evidence', label: 'Evidence' },
    '/evidence/upload': { sectionId: 'techdeck-evidence', label: 'Record Evidence', redirectPath: '/evidence' },
    '/reports': { sectionId: 'techdeck-reports', label: 'Reports' },
    '/time': { sectionId: 'techdeck-time', label: 'Technician Time' },
    '/clients': { sectionId: 'techdeck-directory', label: 'Shared Clients' },
    '/sites': { sectionId: 'techdeck-directory', label: 'Shared Sites', redirectPath: '/clients' },
    '/contacts': { sectionId: 'techdeck-directory', label: 'Shared Contacts', redirectPath: '/clients' },
    '/calendar': { sectionId: 'techdeck-calendar', label: 'Service Calendar' },
    '/recurring-tickets': { sectionId: 'techdeck-calendar', label: 'Recurring Tickets', redirectPath: '/calendar' },
    '/portal': { sectionId: 'techdeck-portal', label: 'Client Portal' },
    '/portal/tickets': { sectionId: 'techdeck-portal', label: 'Portal Tickets', redirectPath: '/portal' },
    '/portal/evidence': { sectionId: 'techdeck-portal', label: 'Portal Evidence', redirectPath: '/portal' },
    '/licenses': { sectionId: 'techdeck-licenses', label: 'License Server' },
    '/licenses/developer': { sectionId: 'techdeck-licenses', label: 'License Validation', redirectPath: '/licenses' },
    '/webhooks': { sectionId: 'techdeck-webhooks', label: 'Outbound Webhooks' },
    '/api-tokens': { sectionId: 'techdeck-api-tokens', label: 'Scoped API Tokens' },
    '/status': { sectionId: 'techdeck-status', label: 'Status Administration' },
    '/status-admin': { sectionId: 'techdeck-status', label: 'Status Administration', redirectPath: '/status' },
    '/compliance': { sectionId: 'techdeck-compliance', label: 'Compliance and Secure Intake' },
    '/secure-intake': { sectionId: 'techdeck-secure-intake', label: 'Secure Intake', redirectPath: '/compliance' },
    '/compliance-packets': { sectionId: 'techdeck-compliance', label: 'Compliance Packets', redirectPath: '/compliance' },
    '/itops': { sectionId: 'techdeck-compliance', label: 'IT Operations Guidance', redirectPath: '/compliance' },
    '/settings': { sectionId: 'techdeck-settings', label: 'Settings' },
  },
  pulsedesk: {
    '/app': { sectionId: 'pulsedesk-overview', label: 'Overview', redirectPath: '/' },
    '/dashboard': { sectionId: 'pulsedesk-overview', label: 'Overview', redirectPath: '/' },
    '/tickets': { sectionId: 'pulsedesk-operations', label: 'Request Queue', redirectPath: '/requests' },
    '/requests': { sectionId: 'pulsedesk-operations', label: 'Request Queue' },
    '/requests/new': { sectionId: 'pulsedesk-operations', label: 'Submit a Request', redirectPath: '/requests' },
    '/submit': { sectionId: 'pulsedesk-operations', label: 'Submit a Request', redirectPath: '/requests' },
    '/assignments': { sectionId: 'pulsedesk-assignments', label: 'Assignments and Escalation' },
    '/departments': { sectionId: 'pulsedesk-assignments', label: 'Departments', redirectPath: '/assignments' },
    '/operations': { sectionId: 'pulsedesk-operations-route', label: 'Equipment, Supplies, and Facilities' },
    '/assets': { sectionId: 'pulsedesk-operations-route', label: 'Operational Equipment', redirectPath: '/operations' },
    '/supply-requests': { sectionId: 'pulsedesk-operations-route', label: 'Supply Requests', redirectPath: '/operations' },
    '/facility-requests': { sectionId: 'pulsedesk-operations-route', label: 'Facility Requests', redirectPath: '/operations' },
    '/knowledge': { sectionId: 'pulsedesk-knowledge-route', label: 'Operational Knowledge' },
    '/service-desk/admin': { sectionId: 'pulsedesk-assignments', label: 'Service Desk Administration', redirectPath: '/assignments' },
    '/service-desk-admin': { sectionId: 'pulsedesk-assignments', label: 'Service Desk Administration', redirectPath: '/assignments' },
    '/inbound': { sectionId: 'pulsedesk-connectors', label: 'Inbound Communication' },
    '/analytics': { sectionId: 'pulsedesk-analytics', label: 'Operational Analytics' },
    '/clients': { sectionId: 'pulsedesk-directory', label: 'Service Clients', redirectPath: '/contacts' },
    '/facilities': { sectionId: 'pulsedesk-directory', label: 'Shared Facilities', redirectPath: '/contacts' },
    '/sites': { sectionId: 'pulsedesk-directory', label: 'Shared Sites', redirectPath: '/contacts' },
    '/contacts': { sectionId: 'pulsedesk-directory', label: 'Shared Contacts' },
    '/vendors': { sectionId: 'pulsedesk-directory', label: 'Shared Vendors', redirectPath: '/contacts' },
    '/integrations': { sectionId: 'pulsedesk-connectors', label: 'Integrations' },
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
    '/dashboard': { sectionId: 'faultlinelab-dashboard', label: 'Dashboard', redirectPath: '/' },
    '/challenges': { sectionId: 'faultlinelab-challenges', label: 'Challenge Board' },
    '/daily': { sectionId: 'faultlinelab-challenges', label: 'Daily Challenge', redirectPath: '/challenges' },
    '/sessions': { sectionId: 'faultlinelab-session', label: 'Investigations' },
    '/assignments': { sectionId: 'faultlinelab-assignments', label: 'Assignments' },
    '/progress': { sectionId: 'faultlinelab-progress', label: 'Progress', redirectPath: '/runs' },
    '/runs': { sectionId: 'faultlinelab-progress', label: 'Runs and Progress' },
    '/evidence': { sectionId: 'faultlinelab-evidence', label: 'Evidence' },
    '/authoring': { sectionId: 'faultlinelab-authoring', label: 'Challenge Authoring' },
    '/analytics': { sectionId: 'faultlinelab-analytics', label: 'Tenant Analytics', redirectPath: '/reports' },
    '/reports': { sectionId: 'faultlinelab-analytics', label: 'Reports' },
    '/settings': { sectionId: 'faultlinelab-settings', label: 'Settings' },
  },
  'ninja-pool-hall': {
    '/practice': { sectionId: 'ninja-pool-hall-shell', label: 'Free Shoot' },
    '/cpu': { sectionId: 'ninja-pool-hall-shell', label: 'CPU Match' },
    '/local': { sectionId: 'ninja-pool-hall-shell', label: 'Local Match' },
    '/online': { sectionId: 'ninja-pool-hall-shell', label: 'Online Rooms' },
    '/host': { sectionId: 'ninja-pool-hall-shell', label: 'Host Online Room' },
    '/join': { sectionId: 'ninja-pool-hall-shell', label: 'Join Online Room' },
    '/profile': { sectionId: 'ninja-pool-hall-shell', label: 'Player Profile' },
    '/history': { sectionId: 'ninja-pool-hall-shell', label: 'Match History' },
    '/stats': { sectionId: 'ninja-pool-hall-shell', label: 'Player Statistics', redirectPath: '/history' },
    '/rules': { sectionId: 'ninja-pool-hall-shell', label: 'Rules', redirectPath: '/settings' },
    '/settings': { sectionId: 'ninja-pool-hall-shell', label: 'Rules and Settings' },
  },
  brandforgeos: {
    '/dashboard': { sectionId: 'brandforgeos-dashboard', label: 'Dashboard', redirectPath: '/' },
    '/brands': { sectionId: 'brandforgeos-brands', label: 'Brand Kits' },
    '/personas': { sectionId: 'brandforgeos-personas', label: 'Audience Personas', redirectPath: '/brands' },
    '/offers': { sectionId: 'brandforgeos-offers', label: 'Offers', redirectPath: '/campaigns' },
    '/campaigns': { sectionId: 'brandforgeos-campaigns', label: 'Campaigns' },
    '/copy-studio': { sectionId: 'brandforgeos-copy', label: 'Copy Studio', redirectPath: '/content' },
    '/content': { sectionId: 'brandforgeos-copy', label: 'Content' },
    '/assets': { sectionId: 'brandforgeos-copy', label: 'Assets', redirectPath: '/content' },
    '/calendar': { sectionId: 'brandforgeos-calendar', label: 'Content Calendar' },
    '/approvals': { sectionId: 'brandforgeos-campaigns', label: 'Approvals' },
    '/analytics': { sectionId: 'brandforgeos-analytics', label: 'Analytics' },
    '/ai-workflows': { sectionId: 'brandforgeos-ai', label: 'AI Workflows' },
    '/strategy': { sectionId: 'brandforgeos-strategy', label: 'Guided Strategy' },
    '/templates': { sectionId: 'brandforgeos-templates', label: 'Template Marketplace' },
    '/integrations': { sectionId: 'brandforgeos-integrations', label: 'Integrations' },
    '/reports': { sectionId: 'brandforgeos-reports', label: 'Reports and Exports' },
    '/activity': { sectionId: 'brandforgeos-activity', label: 'Activity and Notifications', redirectPath: '/settings' },
    '/admin': { sectionId: 'brandforgeos-admin', label: 'Plan and Security', redirectPath: '/settings' },
    '/onboarding': { sectionId: 'brandforgeos-settings', label: 'Onboarding', redirectPath: '/settings' },
    '/pricing': { sectionId: 'brandforgeos-admin', label: 'OperatorOS Plan', redirectPath: '/settings' },
    '/legal': { sectionId: 'brandforgeos-admin', label: 'Legal and Security', redirectPath: '/settings' },
    '/privacy': { sectionId: 'brandforgeos-admin', label: 'Privacy', redirectPath: '/settings' },
    '/terms': { sectionId: 'brandforgeos-admin', label: 'Terms', redirectPath: '/settings' },
    '/home': { sectionId: 'brandforgeos-dashboard', label: 'Home', redirectPath: '/' },
    '/login': { sectionId: 'brandforgeos-dashboard', label: 'OperatorOS Login', redirectPath: '/' },
    '/settings': { sectionId: 'brandforgeos-settings', label: 'Settings' },
  },
  snapproofos: {
    '/dashboard': { sectionId: 'snapproofos-overview-route', label: 'Overview', redirectPath: '/' },
    '/customers': { sectionId: 'snapproofos-customers', label: 'Customers' },
    '/projects': { sectionId: 'snapproofos-projects-route', label: 'Projects' },
    '/jobs': { sectionId: 'snapproofos-jobs', label: 'Jobs' },
    '/jobs/new': { sectionId: 'snapproofos-jobs', label: 'New Job', redirectPath: '/jobs' },
    '/capture': { sectionId: 'snapproofos-capture', label: 'Mobile Capture' },
    '/files': { sectionId: 'snapproofos-capture', label: 'Files and Photos', redirectPath: '/capture' },
    '/work': { sectionId: 'snapproofos-work', label: 'Findings and Notes' },
    '/costs': { sectionId: 'snapproofos-costs', label: 'Parts and Labor' },
    '/templates': { sectionId: 'snapproofos-templates', label: 'Job Templates' },
    '/team': { sectionId: 'snapproofos-team', label: 'Team' },
    '/activity': { sectionId: 'snapproofos-activity', label: 'Activity' },
    '/branding': { sectionId: 'snapproofos-branding', label: 'Organization Branding' },
    '/profile': { sectionId: 'snapproofos-settings', label: 'Profile and Organization', redirectPath: '/settings' },
    '/billing': { sectionId: 'snapproofos-settings', label: 'Plan and Billing', redirectPath: '/settings' },
    '/cases': { sectionId: 'snapproofos-jobs', label: 'Evidence Cases', redirectPath: '/jobs' },
    '/evidence': { sectionId: 'snapproofos-evidence', label: 'Evidence' },
    '/review': { sectionId: 'snapproofos-review', label: 'Review Queue' },
    '/findings': { sectionId: 'snapproofos-work', label: 'Findings', redirectPath: '/work' },
    '/reports': { sectionId: 'snapproofos-reports', label: 'Reports' },
    '/share': { sectionId: 'snapproofos-share-route', label: 'Secure Sharing' },
    '/exports': { sectionId: 'snapproofos-exports-route', label: 'Defensible Exports' },
    '/custody': { sectionId: 'snapproofos-custody', label: 'Chain of Custody' },
    '/retention': { sectionId: 'snapproofos-retention', label: 'Retention' },
    '/settings': { sectionId: 'snapproofos-settings', label: 'Settings' },
  },
  'studyforge-ai': {
    '/app': { sectionId: 'studyforge-dashboard', label: 'Learning Home', redirectPath: '/' },
    '/dashboard': { sectionId: 'studyforge-dashboard', label: 'Learning Home', redirectPath: '/' },
    '/sets': { sectionId: 'studyforge-sets', label: 'Study Sets' },
    '/sets/new': { sectionId: 'studyforge-new-set', label: 'New Study Set', redirectPath: '/sets' },
    '/folders': { sectionId: 'studyforge-sets', label: 'Folders', redirectPath: '/sets' },
    '/exams': { sectionId: 'studyforge-exams', label: 'Exam Countdowns', redirectPath: '/sessions' },
    '/sessions': { sectionId: 'studyforge-plans', label: 'Learning Sessions' },
    '/notes': { sectionId: 'studyforge-sources', label: 'Notes', redirectPath: '/sources' },
    '/exports': { sectionId: 'studyforge-analytics', label: 'Exports', redirectPath: '/progress' },
    '/settings': { sectionId: 'studyforge-account', label: 'Settings' },
    '/account': { sectionId: 'studyforge-account', label: 'Plan and Usage', redirectPath: '/settings' },
    '/admin': { sectionId: 'studyforge-account', label: 'StudyForge Administration', redirectPath: '/settings' },
    '/pricing': { sectionId: 'studyforge-account', label: 'OperatorOS Plan', redirectPath: '/settings' },
    '/subjects': { sectionId: 'studyforge-subjects', label: 'Subjects and Courses', redirectPath: '/sources' },
    '/courses': { sectionId: 'studyforge-subjects', label: 'Subjects and Courses', redirectPath: '/sources' },
    '/sources': { sectionId: 'studyforge-sources', label: 'Authorized Sources' },
    '/studio': { sectionId: 'studyforge-studio', label: 'AI Studio' },
    '/decks': { sectionId: 'studyforge-decks', label: 'Flashcard Decks', redirectPath: '/flashcards' },
    '/flashcards': { sectionId: 'studyforge-decks', label: 'Flashcard Decks' },
    '/quizzes': { sectionId: 'studyforge-quizzes', label: 'Quizzes' },
    '/plans': { sectionId: 'studyforge-plans', label: 'Study Plans', redirectPath: '/sessions' },
    '/progress': { sectionId: 'studyforge-analytics', label: 'Progress' },
    '/analytics': { sectionId: 'studyforge-analytics', label: 'Analytics', redirectPath: '/progress' },
  },
  'ninja-launch-kit': {
    '/dashboard': { sectionId: 'launchkit-dashboard', label: 'Launch Dashboard' },
    '/app': { sectionId: 'launchkit-dashboard', label: 'Launch Dashboard', redirectPath: '/dashboard' },
    '/projects': { sectionId: 'launchkit-kits', label: 'Projects' },
    '/launches': { sectionId: 'launchkit-execution', label: 'Launch Workspaces', redirectPath: '/review' },
    '/builder': { sectionId: 'launchkit-builder', label: 'Launch Brief', redirectPath: '/brief' },
    '/brief': { sectionId: 'launchkit-builder', label: 'Brand and Visual Brief' },
    '/templates': { sectionId: 'launchkit-templates', label: 'Launch Templates' },
    '/kits': { sectionId: 'launchkit-kits', label: 'Generated Launch Kits', redirectPath: '/projects' },
    '/brands': { sectionId: 'launchkit-brands', label: 'Brand Profiles', redirectPath: '/brief' },
    '/visual-promos': { sectionId: 'launchkit-visual-promos', label: 'Visual Promo Briefs', redirectPath: '/deliverables' },
    '/deliverables': { sectionId: 'launchkit-outputs', label: 'Generated Deliverables' },
    '/generate': { sectionId: 'launchkit-builder', label: 'Generate Deliverables', redirectPath: '/deliverables' },
    '/review': { sectionId: 'launchkit-execution', label: 'Review and Readiness' },
    '/plan': { sectionId: 'launchkit-execution', label: 'Launch Plan', redirectPath: '/review' },
    '/artifacts': { sectionId: 'launchkit-execution', label: 'Campaign Artifacts', redirectPath: '/review' },
    '/readiness': { sectionId: 'launchkit-execution', label: 'Launch Readiness', redirectPath: '/review' },
    '/exports': { sectionId: 'launchkit-exports', label: 'Exports' },
    '/settings': { sectionId: 'launchkit-account', label: 'Settings' },
    '/account': { sectionId: 'launchkit-account', label: 'Plan and Usage', redirectPath: '/settings' },
    '/admin': { sectionId: 'launchkit-admin', label: 'Deploy Ops Administration', redirectPath: '/settings' },
    '/pricing': { sectionId: 'launchkit-account', label: 'OperatorOS Plan', redirectPath: '/settings' },
  },
  'callcommand-ai': {
    '/dashboard': { sectionId: 'callcommand-overview-route', label: 'Switchboard', redirectPath: '/' },
    '/app': { sectionId: 'callcommand-overview-route', label: 'CallCommand AI', redirectPath: '/' },
    '/switchboard': { sectionId: 'callcommand-overview-route', label: 'Live Switchboard', redirectPath: '/' },
    '/calls': { sectionId: 'callcommand-calls', label: 'Call Records' },
    '/operations': { sectionId: 'callcommand-calls', label: 'Controlled Calling', redirectPath: '/calls' },
    '/recordings': { sectionId: 'callcommand-recordings-route', label: 'Recordings' },
    '/transcripts': { sectionId: 'callcommand-transcripts-route', label: 'Transcripts' },
    '/analysis': { sectionId: 'callcommand-analysis-route', label: 'Call Analysis' },
    '/actions': { sectionId: 'callcommand-work', label: 'Actions' },
    '/tickets': { sectionId: 'callcommand-work', label: 'Call Tickets', redirectPath: '/actions' },
    '/leads': { sectionId: 'callcommand-work', label: 'Call Leads', redirectPath: '/actions' },
    '/tasks': { sectionId: 'callcommand-work', label: 'Call Tasks', redirectPath: '/actions' },
    '/automations': { sectionId: 'callcommand-automation', label: 'Automations' },
    '/channels': { sectionId: 'callcommand-automation', label: 'Channels', redirectPath: '/automations' },
    '/profiles': { sectionId: 'callcommand-automation', label: 'Reception Profiles', redirectPath: '/automations' },
    '/receptionist-profiles': { sectionId: 'callcommand-automation', label: 'Receptionist Profiles', redirectPath: '/automations' },
    '/flows': { sectionId: 'callcommand-automation', label: 'Call Flows', redirectPath: '/automations' },
    '/automation-rules': { sectionId: 'callcommand-automation', label: 'Automation Rules', redirectPath: '/automations' },
    '/numbers': { sectionId: 'callcommand-configuration', label: 'Numbers and Channels' },
    '/transfer-targets': { sectionId: 'callcommand-configuration', label: 'Transfer Targets', redirectPath: '/numbers' },
    '/providers': { sectionId: 'callcommand-providers-route', label: 'Providers' },
    '/setup/telephony': { sectionId: 'callcommand-providers-route', label: 'Telephony Setup', redirectPath: '/providers' },
    '/integrations': { sectionId: 'callcommand-providers-route', label: 'Integrations', redirectPath: '/providers' },
    '/integrations/health': { sectionId: 'callcommand-providers-route', label: 'Integration Health', redirectPath: '/providers' },
    '/simulate': { sectionId: 'callcommand-overview-route', label: 'Call Simulator', redirectPath: '/' },
    '/simulate/live-call': { sectionId: 'callcommand-overview-route', label: 'Live Call Simulator', redirectPath: '/' },
    '/organizations': { sectionId: 'callcommand-msp-organizations', label: 'MSP Organizations' },
    '/msp/organizations': { sectionId: 'callcommand-msp-organizations', label: 'MSP Organizations', redirectPath: '/organizations' },
    '/contacts': { sectionId: 'callcommand-msp-contacts', label: 'MSP Support Contacts', redirectPath: '/organizations' },
    '/msp/contacts': { sectionId: 'callcommand-msp-contacts', label: 'MSP Support Contacts', redirectPath: '/organizations' },
    '/onboarding': { sectionId: 'callcommand-msp-organizations', label: 'MSP Production Onboarding', redirectPath: '/organizations' },
    '/msp/onboarding': { sectionId: 'callcommand-msp-organizations', label: 'MSP Production Onboarding', redirectPath: '/organizations' },
    '/compliance': { sectionId: 'callcommand-msp-policy', label: 'Compliance and Call Evidence' },
    '/consent': { sectionId: 'callcommand-msp-policy', label: 'Consent Policy and Ledger', redirectPath: '/compliance' },
    '/suppressions': { sectionId: 'callcommand-msp-policy', label: 'Suppression Controls', redirectPath: '/compliance' },
    '/action-catalog': { sectionId: 'callcommand-msp-policy', label: 'Approved Action Catalog', redirectPath: '/compliance' },
    '/policy': { sectionId: 'callcommand-msp-policy', label: 'Automation Policy', redirectPath: '/compliance' },
    '/msp/policy': { sectionId: 'callcommand-msp-policy', label: 'Automation Policy', redirectPath: '/compliance' },
    '/audit': { sectionId: 'callcommand-msp-policy', label: 'Call Evidence Ledger', redirectPath: '/compliance' },
    '/msp/audit': { sectionId: 'callcommand-msp-policy', label: 'Call Evidence Ledger', redirectPath: '/compliance' },
    '/billing': { sectionId: 'callcommand-settings', label: 'OperatorOS Plan and Usage', redirectPath: '/settings' },
    '/settings': { sectionId: 'callcommand-settings', label: 'CallCommand Settings' },
  },
  ninjamation: {
    '/dashboard': { sectionId: 'ninjamation-dashboard', label: 'Script Dashboard' },
    '/scripts': { sectionId: 'ninjamation-scripts', label: 'Script Library', redirectPath: '/library' },
    '/library': { sectionId: 'ninjamation-library', label: 'Script Library' },
    '/editor': { sectionId: 'ninjamation-editor', label: 'Script Editor', redirectPath: '/library' },
    '/review': { sectionId: 'ninjamation-review', label: 'Review Queue' },
    '/generate': { sectionId: 'ninjamation-generations', label: 'AI Draft Generator' },
    '/generations': { sectionId: 'ninjamation-generations', label: 'AI Draft Generator', redirectPath: '/generate' },
    '/sources': { sectionId: 'ninjamation-sync', label: 'Sources and Synchronization' },
    '/downloads': { sectionId: 'ninjamation-downloads', label: 'Download Audit', redirectPath: '/runs' },
    '/runs': { sectionId: 'ninjamation-downloads', label: 'Runs and Downloads' },
    '/versions': { sectionId: 'ninjamation-editor', label: 'Version History' },
    '/sync': { sectionId: 'ninjamation-sync', label: 'GitHub Synchronization', redirectPath: '/sources' },
    '/settings': { sectionId: 'ninjamation-account', label: 'Settings' },
    '/account': { sectionId: 'ninjamation-account', label: 'Account and Usage', redirectPath: '/settings' },
    '/billing': { sectionId: 'ninjamation-account', label: 'OperatorOS Billing', redirectPath: '/settings' },
    '/checkout/success': { sectionId: 'ninjamation-account', label: 'OperatorOS Billing Status', redirectPath: '/settings' },
    '/checkout/cancel': { sectionId: 'ninjamation-account', label: 'OperatorOS Billing Status', redirectPath: '/settings' },
    '/admin': { sectionId: 'ninjamation-admin', label: 'Script Ops Administration', redirectPath: '/settings' },
  },
  outcall: {
    '/dashboard': { sectionId: 'outcall-overview-route', label: 'Overview', redirectPath: '/' },
    '/readiness': { sectionId: 'outcall-overview-route', label: 'Readiness and Safety', redirectPath: '/' },
    '/contacts': { sectionId: 'outcall-profiles', label: 'Verified Destination and Profiles' },
    '/profiles': { sectionId: 'outcall-profiles', label: 'Rescue Profiles', redirectPath: '/contacts' },
    '/schedules': { sectionId: 'outcall-schedule', label: 'Schedules' },
    '/campaigns': { sectionId: 'outcall-triggers', label: 'Private Triggers' },
    '/triggers': { sectionId: 'outcall-triggers', label: 'Private SMS Triggers', redirectPath: '/campaigns' },
    '/calls': { sectionId: 'outcall-schedule', label: 'Scheduled Calls' },
    '/reminders': { sectionId: 'outcall-schedule', label: 'Reminders' },
    '/verification': { sectionId: 'outcall-setup', label: 'Verified Mobile' },
    '/setup': { sectionId: 'outcall-setup', label: 'Verified Mobile', redirectPath: '/verification' },
    '/delivery': { sectionId: 'outcall-readiness', label: 'Delivery Readiness' },
    '/history': { sectionId: 'outcall-schedule', label: 'Call History' },
    '/compliance': { sectionId: 'outcall-privacy', label: 'Privacy and Safety' },
    '/privacy': { sectionId: 'outcall-privacy', label: 'Privacy Controls', redirectPath: '/compliance' },
    '/settings': { sectionId: 'outcall-safety-boundary', label: 'OutCall Settings' },
  },
};

const SAFE_PATH_SEGMENT = /^[a-z0-9-]+$/;

export function resolveCoreModuleDeepLink(
  slug: string,
  pathSegments: readonly string[],
): CoreModuleDeepLinkTarget | null {
  if (
    slug === 'tradeflowkit' &&
    pathSegments.length === 2 &&
    pathSegments[0] === 'portal' &&
    /^[A-Za-z0-9_-]{32,64}$/.test(pathSegments[1] ?? '')
  ) {
    return {
      sectionId: 'tradeflowkit-public-portal',
      label: 'Customer Portal',
      redirectPath: `/public/tradeflowkit/customers/${encodeURIComponent(pathSegments[1])}`,
    };
  }
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
    if (resource === 'jobs') return { sectionId: 'tradeflowkit-operations', label: 'Job Record' };
    if (resource === 'tasks') return { sectionId: 'tradeflowkit-tasks', label: 'Task Record' };
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
    return { sectionId: 'outcall-call-record', label: 'Scheduled Call Record' };
  }
  if (
    slug === 'pulsedesk' &&
    pathSegments.length === 3 &&
    pathSegments[0] === 'assets' &&
    pathSegments[2] === 'report-issue'
  ) {
    return { sectionId: 'pulsedesk-operations-route', label: 'Report Equipment Issue' };
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
    const [resource, id] = pathSegments;
    if (resource === 'cases') return { sectionId: 'snapproofos-jobs', label: 'Evidence Case', redirectPath: `/jobs/${encodeURIComponent(id)}` };
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
    if (resource === 'recordings') return { sectionId: 'callcommand-recordings-route', label: 'Recording Record' };
    if (resource === 'transcripts') return { sectionId: 'callcommand-transcripts-route', label: 'Transcript Record' };
    if (resource === 'analysis') return { sectionId: 'callcommand-analysis-route', label: 'Analysis Record' };
    if (resource === 'channels' || resource === 'profiles' || resource === 'flows') return { sectionId: 'callcommand-automation', label: 'Automation Configuration', redirectPath: '/automations' };
    if (resource === 'consents' || resource === 'suppressions') return { sectionId: 'callcommand-msp-policy', label: 'Compliance Record', redirectPath: '/compliance' };
    if (resource === 'tickets' || resource === 'leads' || resource === 'tasks') return { sectionId: 'callcommand-work', label: 'Generated Work Record', redirectPath: '/actions' };
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
