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
    body: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    heading: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
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
  overview: { eyebrow: 'MSP operations', title: 'Operations overview', subtitle: 'See the tickets, systems, deadlines, and client commitments that need attention now.' },
  tickets: { eyebrow: 'Move support work forward', title: 'Ticket queue', subtitle: 'Triage, assign, update, and resolve support work without losing priority or response targets.' },
  directory: { eyebrow: 'Know every environment', title: 'Clients and sites', subtitle: 'Keep client organizations, sites, contacts, and service details ready for the technician handling the work.' },
  inventory: { eyebrow: 'Know what you support', title: 'Configuration inventory', subtitle: 'Track client systems, ownership, health, and the technical details needed to service them.' },
  network: { eyebrow: 'See the network clearly', title: 'Network and IPAM', subtitle: 'Map firewalls, switches, addresses, subnets, VLANs, and how they connect.' },
  lifecycle: { eyebrow: 'Act before coverage expires', title: 'Lifecycle and health', subtitle: 'Find upcoming warranties, renewals, expirations, incomplete records, and unhealthy systems.' },
  documentation: { eyebrow: 'Keep technical knowledge useful', title: 'Documentation', subtitle: 'Create, review, and update procedures technicians can trust across managed environments.' },
  runbooks: { eyebrow: 'Give technicians a safe procedure', title: 'Runbooks', subtitle: 'Prepare and approve step-by-step procedures for repeat work. TechDeck stores the instructions; it does not run commands.' },
  evidence: { eyebrow: 'Show what was checked', title: 'Service records', subtitle: 'Attach observations, configuration snapshots, test results, and files to the systems and tickets they support.' },
  reports: { eyebrow: 'Prepare the client delivery', title: 'Operations reports', subtitle: 'Create consistent reports covering infrastructure, lifecycle, tickets, service records, and technician time.' },
  time: { eyebrow: 'Account for service delivery', title: 'Technician time', subtitle: 'Record time against the right client, ticket, site, or managed system.' },
  calendar: { eyebrow: 'Plan service before it is late', title: 'Calendar and recurrence', subtitle: 'Schedule appointments and create recurring tickets for routine maintenance.' },
  portal: { eyebrow: 'Work with clients securely', title: 'Client portal', subtitle: 'Choose which tickets and service records each client or site can see and update.' },
  licenses: { eyebrow: 'Manage product access', title: 'License server', subtitle: 'Issue, validate, revoke, and review licenses without showing the full key again.' },
  status: { eyebrow: 'Keep customers informed', title: 'Public status', subtitle: 'Publish service health, incidents, updates, and a clear history of resolved events.' },
  compliance: { eyebrow: 'Prepare for reviews', title: 'Compliance and secure intake', subtitle: 'Collect approved files and results, then prepare a consistent compliance package.' },
  webhooks: { eyebrow: 'Send updates to other systems', title: 'Signed webhooks', subtitle: 'Manage destinations, signing, delivery history, retries, and messages that still need attention.' },
  'api-tokens': { eyebrow: 'Connect tools with limited access', title: 'Scoped API tokens', subtitle: 'Create and revoke API access with only the permissions each integration needs.' },
  settings: { eyebrow: 'Understand workspace access and limits', title: 'Access and service boundaries', subtitle: 'Review who manages the workspace, where team access changes happen, and what TechDeck runbooks can safely do.' },
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
