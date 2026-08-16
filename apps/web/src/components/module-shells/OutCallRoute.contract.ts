import {
  BellRing, CalendarClock, ContactRound, Gauge, History, Megaphone,
  PhoneCall, Settings, ShieldCheck, Truck, UserCheck,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type OutCallRouteArea =
  | 'overview' | 'contacts' | 'schedules' | 'campaigns' | 'calls' | 'reminders'
  | 'verification' | 'delivery' | 'history' | 'compliance' | 'settings';

export interface OutCallRouteState {
  area: OutCallRouteArea;
  canonicalPath: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  recordId?: string;
}

export const OUTCALL_THEME: ModuleThemeTokens = {
  id: 'outcall-midnight-violet-safety',
  colorScheme: 'dark',
  colors: {
    background: '#090812', panel: '#13111f', panelRaised: '#1c1930', text: '#f8f7ff', muted: '#b8b3ca',
    border: '#48405f', primary: '#c4b5fd', secondary: '#7c3aed', accent: '#a78bfa', danger: '#fb7185',
    success: '#6ee7b7', focus: '#fbbf24',
  },
  radius: { small: '8px', medium: '12px', large: '18px' },
  density: 'comfortable',
  typography: {
    body: 'Inter, ui-sans-serif, system-ui, sans-serif',
    heading: 'Inter, ui-sans-serif, system-ui, sans-serif',
    accent: 'ui-monospace, "Cascadia Code", monospace',
  },
  imagery: { overlay: 'radial-gradient(circle at 90% 0,rgba(139,92,246,.18),transparent 34rem),linear-gradient(135deg,rgba(196,181,253,.05),transparent 45%)' },
};

export const OUTCALL_NAVIGATION: readonly ModuleRouteManifestGroup[] = [
  { id: 'assistance', label: 'Exit assistance', items: [
    { id: 'overview', canonicalPath: '/', label: 'Overview', icon: Gauge, activeMatch: { kind: 'exact' } },
    { id: 'contacts', canonicalPath: '/contacts', label: 'Verified destination', icon: ContactRound, activeMatch: { kind: 'prefix' } },
    { id: 'schedules', canonicalPath: '/schedules', label: 'Schedules', icon: CalendarClock, activeMatch: { kind: 'prefix' } },
    { id: 'campaigns', canonicalPath: '/campaigns', label: 'Private triggers', icon: Megaphone, activeMatch: { kind: 'prefix' } },
    { id: 'calls', canonicalPath: '/calls', label: 'Calls', icon: PhoneCall, activeMatch: { kind: 'prefix' } },
    { id: 'reminders', canonicalPath: '/reminders', label: 'Reminders', icon: BellRing, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'trust', label: 'Trust and delivery', items: [
    { id: 'verification', canonicalPath: '/verification', label: 'Verification', icon: UserCheck, activeMatch: { kind: 'prefix' } },
    { id: 'delivery', canonicalPath: '/delivery', label: 'Delivery readiness', icon: Truck, activeMatch: { kind: 'prefix' } },
    { id: 'history', canonicalPath: '/history', label: 'History', icon: History, activeMatch: { kind: 'prefix' } },
    { id: 'compliance', canonicalPath: '/compliance', label: 'Privacy and safety', icon: ShieldCheck, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
] as const;

const copy: Record<OutCallRouteArea, Pick<OutCallRouteState, 'eyebrow' | 'title' | 'subtitle'>> = {
  overview: { eyebrow: 'Discreet assistance', title: 'OutCall overview', subtitle: 'Check safety acknowledgement, verified destination, rescue profile, and provider readiness.' },
  contacts: { eyebrow: 'Single verified destination', title: 'Verified destination and rescue profiles', subtitle: 'Configure neutral assistance messages without adding arbitrary recipients or a bulk contact list.' },
  schedules: { eyebrow: 'Bounded outbound request', title: 'Schedules', subtitle: 'Request an immediate or future call only to your independently verified number.' },
  campaigns: { eyebrow: 'Private exact-match activation', title: 'Private triggers', subtitle: 'Configure private SMS phrases for one bounded assistance call; bulk campaigns are intentionally unsupported.' },
  calls: { eyebrow: 'Durable request state', title: 'Calls', subtitle: 'Review requested, scheduled, attempted, provider-confirmed, failed, or canceled call records.' },
  reminders: { eyebrow: 'Planned assistance', title: 'Reminders', subtitle: 'Schedule a future exit-assistance call without recurring marketing or audience targeting.' },
  verification: { eyebrow: 'Destination ownership', title: 'Verification', subtitle: 'Independently confirm the only mobile number OutCall is allowed to call.' },
  delivery: { eyebrow: 'Provider truth', title: 'Delivery readiness', subtitle: 'Distinguish configured request handling from provider-confirmed call delivery.' },
  history: { eyebrow: 'Attempt history', title: 'History', subtitle: 'Review durable call requests and outcomes without converting unknown provider state into success.' },
  compliance: { eyebrow: 'Privacy and emergency boundary', title: 'Privacy and safety', subtitle: 'Export or delete private data and review the explicit non-emergency-service boundary.' },
  settings: { eyebrow: 'Safety configuration', title: 'OutCall settings', subtitle: 'Review readiness and safety limits under OperatorOS identity and entitlement authority.' },
};

const state = (area: OutCallRouteArea, canonicalPath: string, recordId?: string): OutCallRouteState => ({ area, canonicalPath, recordId, ...copy[area] });

export function resolveOutCallRoute(routePath?: string): OutCallRouteState {
  const raw = (routePath || '/').split(/[?#]/u, 1)[0];
  const path = `/${raw.replace(/^\/(?:modules|apps)\/outcall\/?/u, '').split('/').filter(Boolean).join('/')}`;
  const [root, recordId] = path.split('/').filter(Boolean);
  if (!root || ['dashboard', 'readiness'].includes(root)) return state('overview', '/');
  if (['contacts', 'profiles'].includes(root)) return state('contacts', '/contacts', recordId);
  if (root === 'schedules') return state('schedules', '/schedules', recordId);
  if (['campaigns', 'triggers'].includes(root)) return state('campaigns', '/campaigns', recordId);
  if (root === 'calls') return state('calls', '/calls', recordId);
  if (root === 'reminders') return state('reminders', '/reminders', recordId);
  if (['verification', 'setup'].includes(root)) return state('verification', '/verification');
  if (root === 'delivery') return state('delivery', '/delivery');
  if (root === 'history') return state('history', '/history');
  if (['compliance', 'privacy'].includes(root)) return state('compliance', '/compliance');
  if (root === 'settings') return state('settings', '/settings');
  return state('overview', '/');
}

export const OUTCALL_LEGACY_REDIRECTS = {
  '/dashboard': '/', '/readiness': '/', '/profiles': '/contacts', '/triggers': '/campaigns',
  '/setup': '/verification', '/privacy': '/compliance',
} as const;
