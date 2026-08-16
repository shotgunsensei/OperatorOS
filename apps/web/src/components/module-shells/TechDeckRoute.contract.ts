import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  FileLock2,
  Gauge,
  KeyRound,
  Network,
  Settings,
  ShieldCheck,
  TicketCheck,
  Timer,
  Webhook,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type TechDeckRouteArea =
  | 'overview' | 'tickets' | 'directory' | 'inventory' | 'network' | 'lifecycle'
  | 'documentation' | 'runbooks' | 'evidence' | 'reports' | 'time' | 'calendar'
  | 'portal' | 'licenses' | 'status' | 'compliance' | 'webhooks' | 'api-tokens' | 'settings';

export interface TechDeckRouteState {
  area: TechDeckRouteArea;
  canonicalPath: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  recordId?: string;
}

export const TECHDECK_THEME: ModuleThemeTokens = {
  id: 'techdeck-midnight-msp-cyan',
  colorScheme: 'dark',
  colors: {
    background: '#05070d', panel: '#0d1320', panelRaised: '#101826', text: '#e5eefc', muted: '#8fa3bd',
    border: '#263348', primary: '#38bdf8', secondary: '#0284c7', accent: '#22c55e', danger: '#ef4444',
    success: '#22c55e', focus: '#7dd3fc',
  },
  radius: { small: '6px', medium: '8px', large: '12px' },
  density: 'compact',
  typography: {
    body: 'Inter, ui-sans-serif, system-ui, sans-serif',
    heading: 'Inter, ui-sans-serif, system-ui, sans-serif',
    accent: 'ui-monospace, "Cascadia Code", monospace',
  },
  imagery: { overlay: 'linear-gradient(130deg,rgba(56,189,248,.09),transparent 48%)' },
};

export const TECHDECK_NAVIGATION: readonly ModuleRouteManifestGroup[] = [
  { id: 'service-operations', label: 'Service operations', items: [
    { id: 'overview', canonicalPath: '/', label: 'Overview', icon: Gauge, activeMatch: { kind: 'exact' } },
    { id: 'tickets', canonicalPath: '/tickets', label: 'Tickets', icon: TicketCheck, activeMatch: { kind: 'prefix' } },
    { id: 'clients', canonicalPath: '/clients', label: 'Clients', icon: Building2, activeMatch: { kind: 'prefix' } },
    { id: 'assets', canonicalPath: '/assets', label: 'Assets', icon: ClipboardList, activeMatch: { kind: 'prefix' } },
    { id: 'network', canonicalPath: '/network', label: 'Network / IPAM', icon: Network, activeMatch: { kind: 'prefix' } },
    { id: 'lifecycle', canonicalPath: '/lifecycle', label: 'Lifecycle', icon: Activity, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'knowledge-evidence', label: 'Knowledge and evidence', items: [
    { id: 'documentation', canonicalPath: '/documentation', label: 'Documentation', icon: FileCheck2, activeMatch: { kind: 'prefix' } },
    { id: 'runbooks', canonicalPath: '/runbooks', label: 'Runbooks', icon: ShieldCheck, activeMatch: { kind: 'prefix' } },
    { id: 'evidence', canonicalPath: '/evidence', label: 'Evidence', icon: FileLock2, activeMatch: { kind: 'prefix' } },
    { id: 'reports', canonicalPath: '/reports', label: 'Reports', icon: BarChart3, activeMatch: { kind: 'prefix' } },
    { id: 'time', canonicalPath: '/time', label: 'Time', icon: Timer, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'trust-platform', label: 'Trust and platform', items: [
    { id: 'calendar', canonicalPath: '/calendar', label: 'Calendar', icon: CalendarClock, activeMatch: { kind: 'prefix' } },
    { id: 'portal', canonicalPath: '/portal', label: 'Client portal', icon: ShieldCheck, activeMatch: { kind: 'prefix' } },
    { id: 'licenses', canonicalPath: '/licenses', label: 'Licensing', icon: KeyRound, activeMatch: { kind: 'prefix' } },
    { id: 'status', canonicalPath: '/status', label: 'Status', icon: Activity, activeMatch: { kind: 'prefix' } },
    { id: 'compliance', canonicalPath: '/compliance', label: 'Compliance', icon: ClipboardList, activeMatch: { kind: 'prefix' } },
    { id: 'webhooks', canonicalPath: '/webhooks', label: 'Webhooks', icon: Webhook, activeMatch: { kind: 'prefix' } },
    { id: 'api-tokens', canonicalPath: '/api-tokens', label: 'API tokens', icon: KeyRound, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
] as const;

const copy: Record<TechDeckRouteArea, Pick<TechDeckRouteState, 'eyebrow' | 'title' | 'subtitle'>> = {
  overview: { eyebrow: 'MSP command posture', title: 'Operations overview', subtitle: 'Prioritize service work, managed systems, evidence, and trust operations for this organization.' },
  tickets: { eyebrow: 'Service desk', title: 'Ticket queue', subtitle: 'Triage, assign, and progress tenant-scoped support work without losing SLA context.' },
  directory: { eyebrow: 'Customer operations', title: 'Clients and sites', subtitle: 'Maintain the shared organizations, sites, contacts, and service context used across TechDeck.' },
  inventory: { eyebrow: 'Managed infrastructure', title: 'Configuration inventory', subtitle: 'Register client-linked systems and keep their health and technical context current.' },
  network: { eyebrow: 'Managed infrastructure', title: 'Network and IPAM', subtitle: 'Map firewalls, switches, addresses, subnets, VLANs, and their relationships.' },
  lifecycle: { eyebrow: 'Managed infrastructure', title: 'Lifecycle and posture', subtitle: 'Review warranty, renewal, expiration, incomplete-record, and health pressure.' },
  documentation: { eyebrow: 'Technical knowledge', title: 'Documentation', subtitle: 'Create versioned, reviewable procedures and technical knowledge for managed environments.' },
  runbooks: { eyebrow: 'Controlled procedures', title: 'Runbooks', subtitle: 'Maintain approval-controlled documentation-only procedures. TechDeck does not execute arbitrary commands.' },
  evidence: { eyebrow: 'Operational proof', title: 'Evidence register', subtitle: 'Capture observations, configuration snapshots, tests, and attachments against managed systems.' },
  reports: { eyebrow: 'Operational reporting', title: 'Snapshot reports', subtitle: 'Generate checksummed infrastructure, lifecycle, ticket, evidence, and time snapshots.' },
  time: { eyebrow: 'Service delivery', title: 'Technician time', subtitle: 'Record work against the correct client, ticket, site, or configuration item.' },
  calendar: { eyebrow: 'Service automation', title: 'Calendar and recurrence', subtitle: 'Schedule appointments and manage recurring service-ticket rules.' },
  portal: { eyebrow: 'Customer collaboration', title: 'Client portal', subtitle: 'Control client and site visibility for authorized ticket and evidence collaboration.' },
  licenses: { eyebrow: 'Product operations', title: 'License server', subtitle: 'Issue, validate, revoke, and audit licenses without exposing raw keys after creation.' },
  status: { eyebrow: 'Service trust', title: 'Public status', subtitle: 'Maintain service components, incidents, updates, and public history.' },
  compliance: { eyebrow: 'Service trust', title: 'Compliance and secure intake', subtitle: 'Collect evidence safely and produce deterministic packets with audit-ready integrity metadata.' },
  webhooks: { eyebrow: 'Integration delivery', title: 'Signed webhooks', subtitle: 'Manage bounded outbound endpoints, signing, delivery history, retry, and dead-letter state.' },
  'api-tokens': { eyebrow: 'Integration access', title: 'Scoped API tokens', subtitle: 'Issue revocable, limited headless identities while keeping OperatorOS authority intact.' },
  settings: { eyebrow: 'Workspace control', title: 'TechDeck settings', subtitle: 'Review OperatorOS-owned access, membership, entitlements, and module operating boundaries.' },
};

function state(area: TechDeckRouteArea, canonicalPath: string, recordId?: string): TechDeckRouteState {
  return { area, canonicalPath, recordId, ...copy[area] };
}

export function resolveTechDeckRoute(routePath?: string): TechDeckRouteState {
  const raw = (routePath || '/').split(/[?#]/u, 1)[0];
  const path = `/${raw.replace(/^\/(?:modules|apps)\/techdeck\/?/u, '').split('/').filter(Boolean).join('/')}`;
  const segments = path.split('/').filter(Boolean);
  const root = segments[0];
  if (!root || root === 'dashboard' || root === 'm' && !segments[1]) return state('overview', '/');
  if (root === 'm' && segments[1] === 'tickets') return state('tickets', '/tickets');
  if (root === 'm' && segments[1] === 'time') return state('time', '/time');
  if (root === 'tickets') return state('tickets', '/tickets', segments[1]);
  if (['clients', 'sites', 'contacts'].includes(root)) return state('directory', '/clients', segments[1]);
  if (['assets', 'inventory', 'alerts'].includes(root)) return state('inventory', '/assets', segments[1]);
  if (['network', 'ipam'].includes(root)) return state('network', '/network', segments[1]);
  if (root === 'lifecycle') return state('lifecycle', '/lifecycle');
  if (['documentation', 'documents', 'kb', 'knowledge-base'].includes(root)) return state('documentation', '/documentation', segments[1]);
  if (['runbooks', 'scripts'].includes(root)) return state('runbooks', '/runbooks', segments[1]);
  if (root === 'evidence') return state('evidence', '/evidence', segments[1] === 'upload' ? undefined : segments[1]);
  if (root === 'reports') return state('reports', '/reports', segments[1]);
  if (root === 'time') return state('time', '/time');
  if (['calendar', 'recurring-tickets'].includes(root)) return state('calendar', '/calendar');
  if (root === 'portal') return state('portal', '/portal');
  if (root === 'licenses') return state('licenses', '/licenses', segments[1] === 'developer' ? undefined : segments[1]);
  if (['status', 'status-admin'].includes(root)) return state('status', '/status');
  if (['compliance', 'compliance-packets', 'secure-intake', 'itops'].includes(root)) return state('compliance', '/compliance');
  if (root === 'webhooks') return state('webhooks', '/webhooks');
  if (root === 'api-tokens') return state('api-tokens', '/api-tokens');
  if (root === 'settings') return state('settings', '/settings');
  return state('overview', '/');
}

export const TECHDECK_LEGACY_REDIRECTS = {
  '/dashboard': '/', '/m': '/', '/m/tickets': '/tickets', '/m/time': '/time', '/inventory': '/assets', '/alerts': '/assets',
  '/ipam': '/network', '/scripts': '/runbooks', '/kb': '/documentation', '/knowledge-base': '/documentation',
  '/evidence/upload': '/evidence', '/recurring-tickets': '/calendar', '/portal/tickets': '/portal', '/portal/evidence': '/portal',
  '/licenses/developer': '/licenses', '/status-admin': '/status', '/secure-intake': '/compliance',
  '/compliance-packets': '/compliance', '/itops': '/compliance',
} as const;
