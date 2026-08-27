import {
  Activity,
  BookOpenText,
  Car,
  ClipboardCheck,
  Coins,
  FileClock,
  Gauge,
  Search,
  Settings,
  Settings2,
  Store,
  Users,
  Wrench,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type TorqueShedRouteKind =
  | 'dashboard' | 'garage' | 'vehicle-new' | 'vehicle-detail' | 'service'
  | 'builds' | 'build-detail' | 'journal' | 'diagnostics' | 'diagnostic-new'
  | 'diagnostic-detail' | 'diagnostic-assist' | 'live-bays' | 'live-bay-detail'
  | 'templates' | 'marketplace' | 'marketplace-detail' | 'community' | 'profile'
  | 'credits' | 'activity' | 'search' | 'exports' | 'settings' | 'native-auth';

export interface TorqueShedRouteState {
  kind: TorqueShedRouteKind;
  area: 'dashboard' | 'garage' | 'service' | 'builds' | 'journal' | 'diagnostics' | 'live' | 'templates' | 'marketplace' | 'community' | 'credits' | 'tools' | 'native';
  canonicalPath: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  recordId?: string;
}

export const TORQUESHED_THEME: ModuleThemeTokens = {
  id: 'torqueshed-dark-garage-amber',
  colorScheme: 'dark',
  colors: {
    background: '#080a0c', panel: '#111315', panelRaised: '#191c1f', text: '#f8fafc', muted: '#a8a29e',
    border: '#34383d', primary: '#f59e0b', secondary: '#d97706', accent: '#fbbf24', danger: '#ef4444',
    success: '#22c55e', focus: '#fcd34d',
  },
  radius: { small: '7px', medium: '11px', large: '16px' },
  density: 'compact',
  typography: {
    body: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    heading: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    accent: 'ui-monospace, "Cascadia Code", monospace',
  },
  imagery: { overlay: 'linear-gradient(118deg,rgba(245,158,11,.08),transparent 45%)' },
};

export const TORQUESHED_NAVIGATION: readonly ModuleRouteManifestGroup[] = [
  { id: 'workshop', label: 'Workshop', items: [
    { id: 'dashboard', canonicalPath: '/', label: 'Overview', icon: Gauge, activeMatch: { kind: 'exact' } },
    { id: 'garage', canonicalPath: '/garage', label: 'Garage', icon: Car, activeMatch: { kind: 'prefix' } },
    { id: 'service', canonicalPath: '/service', label: 'Service', icon: Wrench, activeMatch: { kind: 'prefix' } },
    { id: 'builds', canonicalPath: '/builds', label: 'Builds', icon: Settings2, activeMatch: { kind: 'prefix' } },
    { id: 'journal', canonicalPath: '/journal', label: 'Journal', icon: BookOpenText, activeMatch: { kind: 'prefix' } },
    { id: 'diagnostics', canonicalPath: '/diagnostics', label: 'Diagnostics', icon: Activity, activeMatch: { kind: 'prefix' } },
    { id: 'live-bays', canonicalPath: '/live-bays', label: 'Live Bays', icon: ClipboardCheck, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'network', label: 'Network', items: [
    { id: 'templates', canonicalPath: '/templates', label: 'Templates', icon: ClipboardCheck, activeMatch: { kind: 'prefix' } },
    { id: 'marketplace', canonicalPath: '/marketplace', label: 'Marketplace', icon: Store, activeMatch: { kind: 'prefix' } },
    { id: 'community', canonicalPath: '/community', label: 'Community', icon: Users, activeMatch: { kind: 'prefix' } },
    { id: 'credits', canonicalPath: '/billing/credits', label: 'Credits', icon: Coins, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'system', label: 'System', items: [
    { id: 'activity', canonicalPath: '/activity', label: 'Activity', icon: FileClock, activeMatch: { kind: 'prefix' } },
    { id: 'search', canonicalPath: '/search', label: 'Search', icon: Search, activeMatch: { kind: 'prefix' } },
    { id: 'exports', canonicalPath: '/exports', label: 'Exports', icon: ClipboardCheck, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
] as const;

const copy: Record<TorqueShedRouteKind, Pick<TorqueShedRouteState, 'title' | 'subtitle' | 'eyebrow'>> = {
  dashboard: { eyebrow: 'Workshop command', title: 'Garage overview', subtitle: 'See the vehicles, service work, builds, diagnostics, reminders, and spend that need attention.' },
  garage: { eyebrow: 'Vehicle records', title: 'Garage', subtitle: 'Keep every vehicle and its durable service and diagnostic history together.' },
  'vehicle-new': { eyebrow: 'Vehicle records', title: 'Add vehicle', subtitle: 'Create the vehicle record that service, build, and diagnostic evidence will reference.' },
  'vehicle-detail': { eyebrow: 'Vehicle record', title: 'Vehicle detail', subtitle: 'Review this vehicle and its tenant-scoped service history.' },
  service: { eyebrow: 'Maintenance and repair', title: 'Service', subtitle: 'Record completed work, parts, vendors, costs, and reminders.' },
  builds: { eyebrow: 'Project garage', title: 'Builds', subtitle: 'Plan build stages, tasks, parts, and project costs.' },
  'build-detail': { eyebrow: 'Project garage', title: 'Build detail', subtitle: 'Review this build, its tasks, parts, journal, and costs.' },
  journal: { eyebrow: 'Build evidence', title: 'Journal', subtitle: 'Capture durable build notes, milestones, media, and costs.' },
  diagnostics: { eyebrow: 'Evidence-first diagnosis', title: 'Diagnostics', subtitle: 'Start and review diagnostic sessions without replacing evidence with AI guesses.' },
  'diagnostic-new': { eyebrow: 'Evidence-first diagnosis', title: 'New diagnostic', subtitle: 'Open a session and record the concern, symptoms, visibility, codes, tests, and evidence.' },
  'diagnostic-detail': { eyebrow: 'Diagnostic record', title: 'Diagnostic detail', subtitle: 'Review the session timeline, evidence, tests, findings, and confirmed fix.' },
  'diagnostic-assist': { eyebrow: 'Bounded AI assistance', title: 'Torque Assist', subtitle: 'Use recorded evidence with reserved paid credits and provider-honest failure behavior.' },
  'live-bays': { eyebrow: 'Collaborative workshop', title: 'Live bays', subtitle: 'Open, reconnect to, and review real-time diagnostic work bays.' },
  'live-bay-detail': { eyebrow: 'Collaborative workshop', title: 'Live bay detail', subtitle: 'Continue this bay and its persisted history.' },
  templates: { eyebrow: 'Reusable knowledge', title: 'Templates and vendors', subtitle: 'Maintain diagnostic plans and trusted service vendors.' },
  marketplace: { eyebrow: 'Parts network', title: 'Marketplace', subtitle: 'Publish and inquire about tenant-safe parts listings.' },
  'marketplace-detail': { eyebrow: 'Parts network', title: 'Marketplace listing', subtitle: 'Review this listing and its inquiry flow.' },
  community: { eyebrow: 'Mechanic network', title: 'Community', subtitle: 'Share proof-aware posts with privacy and moderation controls.' },
  profile: { eyebrow: 'Operator identity', title: 'Profile', subtitle: 'Review the OperatorOS-owned identity and organization context used by TorqueShed.' },
  credits: { eyebrow: 'Paid diagnostic capacity', title: 'Credits and usage', subtitle: 'Buy test-mode credit packs and review the authoritative balance, reservations, usage, and settlement state.' },
  activity: { eyebrow: 'Workshop history', title: 'Activity', subtitle: 'Review tenant-scoped changes and notifications.' },
  search: { eyebrow: 'Workshop discovery', title: 'Search', subtitle: 'Find vehicles, builds, diagnostics, service work, and shared records.' },
  exports: { eyebrow: 'Portable evidence', title: 'Exports', subtitle: 'Create and download authorized workshop records.' },
  settings: { eyebrow: 'Workshop control', title: 'Settings', subtitle: 'Review privacy, provider readiness, defaults, and native-device authorization.' },
  'native-auth': { eyebrow: 'Native authorization', title: 'Authorize device', subtitle: 'Complete a bounded OperatorOS authorization for the native TorqueShed client.' },
};

function state(kind: TorqueShedRouteKind, area: TorqueShedRouteState['area'], canonicalPath: string, recordId?: string): TorqueShedRouteState {
  return { kind, area, canonicalPath, recordId, ...copy[kind] };
}

export function resolveTorqueShedRoute(routePath?: string): TorqueShedRouteState {
  const path = `/${(routePath || '/').split(/[?#]/u, 1)[0].replace(/^\/modules\/torqueshed\/?/u, '').split('/').filter(Boolean).join('/')}`;
  const segments = path.split('/').filter(Boolean);
  if (!segments.length || segments[0] === 'dashboard') return state('dashboard', 'dashboard', '/');
  if (segments[0] === 'native-auth') return state('native-auth', 'native', '/native-auth');
  if (segments[0] === 'garage') {
    if (segments[1] === 'vehicles' && segments[2] === 'new') return state('vehicle-new', 'garage', '/garage/vehicles/new');
    if (segments[1] === 'vehicles' && segments[2]) return state('vehicle-detail', 'garage', `/garage/vehicles/${segments[2]}`, segments[2]);
    return state('garage', 'garage', '/garage');
  }
  if (segments[0] === 'vehicles') return segments[1]
    ? state('vehicle-detail', 'garage', `/garage/vehicles/${segments[1]}`, segments[1])
    : state('garage', 'garage', '/garage');
  if (['service', 'maintenance', 'repairs', 'reminders'].includes(segments[0])) return state('service', 'service', '/service');
  if (segments[0] === 'builds') return segments[1]
    ? state('build-detail', 'builds', `/builds/${segments[1]}`, segments[1])
    : state('builds', 'builds', '/builds');
  if (segments[0] === 'journal' || segments[0] === 'build-journal') return state('journal', 'journal', '/journal', segments[1]);
  if (segments[0] === 'diagnostics') {
    if (segments[1] === 'new') return state('diagnostic-new', 'diagnostics', '/diagnostics/new');
    if (segments[1] && segments[2] === 'assist') return state('diagnostic-assist', 'diagnostics', `/diagnostics/${segments[1]}/assist`, segments[1]);
    if (segments[1]) return state('diagnostic-detail', 'diagnostics', `/diagnostics/${segments[1]}`, segments[1]);
    return state('diagnostics', 'diagnostics', '/diagnostics');
  }
  if (segments[0] === 'live-bay' || segments[0] === 'live-bays') return segments[1]
    ? state('live-bay-detail', 'live', `/live-bays/${segments[1]}`, segments[1])
    : state('live-bays', 'live', '/live-bays');
  if (segments[0] === 'templates' || segments[0] === 'diagnostic-templates' || segments[0] === 'vendors') return state('templates', 'templates', '/templates');
  if (segments[0] === 'marketplace') return segments[1]
    ? state('marketplace-detail', 'marketplace', `/marketplace/${segments[1]}`, segments[1])
    : state('marketplace', 'marketplace', '/marketplace');
  if (segments[0] === 'community') return state('community', 'community', '/community', segments[1]);
  if (segments[0] === 'profile') return state('profile', 'tools', '/profile');
  if (segments[0] === 'billing' && segments[1] === 'credits') return state('credits', 'credits', '/billing/credits');
  if (segments[0] === 'search') return state('search', 'tools', '/search');
  if (segments[0] === 'exports') return state('exports', 'tools', '/exports');
  if (segments[0] === 'settings') return state('settings', 'tools', '/settings');
  if (segments[0] === 'activity' || segments[0] === 'notifications') return state('activity', 'tools', '/activity');
  return state('dashboard', 'dashboard', '/');
}

export const TORQUESHED_LEGACY_REDIRECTS = {
  '/dashboard': '/', '/vehicles': '/garage', '/maintenance': '/service', '/repairs': '/service', '/reminders': '/service',
  '/build-journal': '/journal', '/live-bay': '/live-bays', '/diagnostic-templates': '/templates', '/vendors': '/templates',
  '/notifications': '/activity',
} as const;
