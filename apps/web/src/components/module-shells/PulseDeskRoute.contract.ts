import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  HeartPulse,
  Inbox,
  PlugZap,
  Settings,
  Stethoscope,
  UsersRound,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type PulseDeskRouteArea = 'overview' | 'requests' | 'assignments' | 'contacts' | 'operations' | 'inbound' | 'analytics' | 'knowledge' | 'integrations' | 'settings';

export interface PulseDeskRouteState {
  area: PulseDeskRouteArea;
  canonicalPath: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  recordId?: string;
}

export const PULSEDESK_THEME: ModuleThemeTokens = {
  id: 'pulsedesk-clinical-operations-blue',
  colorScheme: 'dark',
  colors: {
    background: '#07111b', panel: '#0e1a27', panelRaised: '#132536', text: '#eaf4ff', muted: '#9bb0c6',
    border: '#29445a', primary: '#38bdf8', secondary: '#0ea5e9', accent: '#4ade80', danger: '#fb7185',
    success: '#4ade80', focus: '#7dd3fc',
  },
  radius: { small: '7px', medium: '10px', large: '14px' },
  density: 'comfortable',
  typography: {
    body: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    heading: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    accent: 'ui-monospace, "Cascadia Code", monospace',
  },
  imagery: { overlay: 'linear-gradient(135deg,rgba(56,189,248,.10),transparent 48%)' },
};

export const PULSEDESK_NAVIGATION: readonly ModuleRouteManifestGroup[] = [
  { id: 'coordination', label: 'Care operations', items: [
    { id: 'overview', canonicalPath: '/', label: 'Overview', icon: HeartPulse, activeMatch: { kind: 'exact' } },
    { id: 'requests', canonicalPath: '/requests', label: 'Requests', icon: ClipboardList, activeMatch: { kind: 'prefix' } },
    { id: 'assignments', canonicalPath: '/assignments', label: 'Assignments', icon: UsersRound, activeMatch: { kind: 'prefix' } },
    { id: 'contacts', canonicalPath: '/contacts', label: 'Facilities & contacts', icon: Building2, activeMatch: { kind: 'prefix' } },
    { id: 'operations', canonicalPath: '/operations', label: 'Equipment & facilities', icon: Stethoscope, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'communication-insight', label: 'Communication and insight', items: [
    { id: 'inbound', canonicalPath: '/inbound', label: 'Inbound communication', icon: Inbox, activeMatch: { kind: 'prefix' } },
    { id: 'analytics', canonicalPath: '/analytics', label: 'Analytics', icon: BarChart3, activeMatch: { kind: 'prefix' } },
    { id: 'knowledge', canonicalPath: '/knowledge', label: 'Knowledge', icon: BookOpen, activeMatch: { kind: 'prefix' } },
    { id: 'integrations', canonicalPath: '/integrations', label: 'Integrations', icon: PlugZap, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
] as const;

const copy: Record<PulseDeskRouteArea, Pick<PulseDeskRouteState, 'eyebrow' | 'title' | 'subtitle'>> = {
  overview: { eyebrow: 'Healthcare operations', title: 'Operations overview', subtitle: 'See urgent requests, department workload, equipment needs, supplies, and facility issues at a glance.' },
  requests: { eyebrow: 'Resolve operational requests', title: 'Requests and work queues', subtitle: 'Triage, assign, update, and close operational work while keeping patient details out of the request.' },
  assignments: { eyebrow: 'Keep departments coordinated', title: 'Assignments and escalation', subtitle: 'Give each request a responsible team, track handoffs, and escalate work before it stalls.' },
  contacts: { eyebrow: 'Know who to contact', title: 'Facilities and contacts', subtitle: 'Keep service clients, facilities, contacts, and vendors ready for operational work. Do not store patient charts here.' },
  operations: { eyebrow: 'Keep facilities running', title: 'Equipment, supplies, and facilities', subtitle: 'Track equipment issues, restock needs, vendor work, and facility requests through completion.' },
  inbound: { eyebrow: 'Bring requests into one queue', title: 'Request intake', subtitle: 'Use protected request intake today and see what is needed to connect an organization mailbox later.' },
  analytics: { eyebrow: 'Find pressure early', title: 'Analytics', subtitle: 'See demand, missed response targets, equipment issues, supply needs, facility work, and time trends.' },
  knowledge: { eyebrow: 'Give teams clear answers', title: 'Knowledge', subtitle: 'Maintain requester guidance and internal procedures without including unnecessary patient information.' },
  integrations: { eyebrow: 'Plan safe intake connections', title: 'Mailbox connections', subtitle: 'Use protected request intake today and see what is needed to connect an organization mailbox later. Mailbox import is not connected yet.' },
  settings: { eyebrow: 'Keep operational work safe', title: 'Access and privacy guidance', subtitle: 'Review what belongs in PulseDesk, where team access is managed, and which request channels are available now.' },
};

function state(area: PulseDeskRouteArea, canonicalPath: string, recordId?: string): PulseDeskRouteState {
  return { area, canonicalPath, recordId, ...copy[area] };
}

export function resolvePulseDeskRoute(routePath?: string): PulseDeskRouteState {
  const raw = (routePath || '/').split(/[?#]/u, 1)[0];
  const path = `/${raw.replace(/^\/(?:modules|apps)\/pulsedesk\/?/u, '').split('/').filter(Boolean).join('/')}`;
  const segments = path.split('/').filter(Boolean);
  const root = segments[0];
  if (!root || ['app', 'dashboard'].includes(root)) return state('overview', '/');
  if (['tickets', 'requests', 'submit'].includes(root)) return state('requests', '/requests', ['new', undefined].includes(segments[1]) ? undefined : segments[1]);
  if (root === 'assets' && segments[1] && segments[2] === 'report-issue') {
    return state('requests', '/requests', segments[1]);
  }
  if (
    ['assignments', 'departments'].includes(root) ||
    (root === 'service-desk' && segments[1] === 'admin') ||
    root === 'service-desk-admin'
  ) return state('assignments', '/assignments');
  if (['clients', 'contacts', 'facilities', 'sites', 'vendors'].includes(root)) return state('contacts', '/contacts', segments[1]);
  if (['operations', 'assets', 'supply-requests', 'facility-requests'].includes(root)) return state('operations', '/operations', segments[1]);
  if (root === 'inbound') return state('inbound', '/inbound');
  if (root === 'analytics') return state('analytics', '/analytics');
  if (root === 'knowledge') return state('knowledge', '/knowledge', segments[1]);
  if (['integrations', 'connectors'].includes(root)) return state('integrations', '/integrations');
  if (root === 'settings') return state('settings', '/settings');
  return state('overview', '/');
}

export const PULSEDESK_LEGACY_REDIRECTS = {
  '/app': '/', '/dashboard': '/', '/tickets': '/requests', '/submit': '/requests', '/departments': '/assignments',
  '/service-desk/admin': '/assignments', '/service-desk-admin': '/assignments', '/clients': '/contacts', '/facilities': '/contacts',
  '/sites': '/contacts', '/vendors': '/contacts', '/assets': '/operations', '/supply-requests': '/operations', '/facility-requests': '/operations',
} as const;
