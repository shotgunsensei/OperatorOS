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
    body: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    heading: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
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
  overview: { eyebrow: 'Set up discreet exit assistance', title: 'OutCall overview', subtitle: 'Check your safety acknowledgement, verified number, call profile, and whether the calling service is ready.' },
  contacts: { eyebrow: 'Choose one trusted destination', title: 'Verified destination and rescue profiles', subtitle: 'Prepare neutral assistance messages for your verified number. OutCall does not maintain a bulk contact list.' },
  schedules: { eyebrow: 'Plan an assistance call', title: 'Schedules', subtitle: 'Request an immediate or future call to the mobile number you verified.' },
  campaigns: { eyebrow: 'Use a private trigger phrase', title: 'Private triggers', subtitle: 'Choose private SMS phrases that request one assistance call. OutCall does not send bulk campaigns.' },
  calls: { eyebrow: 'Know what happened with each request', title: 'Calls', subtitle: 'See whether a call was requested, scheduled, attempted, confirmed by the calling service, failed, or canceled.' },
  reminders: { eyebrow: 'Plan assistance ahead of time', title: 'Reminders', subtitle: 'Schedule a future exit-assistance call without marketing messages or audience targeting.' },
  verification: { eyebrow: 'Confirm your mobile number', title: 'Verification', subtitle: 'Prove ownership of the only number OutCall is allowed to call.' },
  delivery: { eyebrow: 'Check whether calls can be delivered', title: 'Delivery readiness', subtitle: 'See whether setup is complete and whether the calling service has confirmed delivery.' },
  history: { eyebrow: 'Review prior requests', title: 'History', subtitle: 'See call requests and outcomes, including requests whose delivery could not be confirmed.' },
  compliance: { eyebrow: 'Protect privacy and understand the limits', title: 'Privacy and safety', subtitle: 'Export or delete private data and review why OutCall is not an emergency service.' },
  settings: { eyebrow: 'Set the safety limits', title: 'OutCall settings', subtitle: 'Review setup, privacy, approved access, and the boundaries that keep OutCall focused on personal exit assistance.' },
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
