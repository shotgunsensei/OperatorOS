import {
  Activity, Bot, Building2, FileAudio, FileText, Gauge, Headphones, ListChecks,
  Network, PhoneCall, RadioTower, Settings, ShieldCheck,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type CallCommandRouteArea =
  | 'overview' | 'calls' | 'recordings' | 'transcripts' | 'analysis' | 'actions'
  | 'automations' | 'numbers' | 'providers' | 'organizations' | 'compliance' | 'settings';

export interface CallCommandRouteState {
  area: CallCommandRouteArea;
  canonicalPath: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  recordId?: string;
}

export const CALLCOMMAND_THEME: ModuleThemeTokens = {
  id: 'callcommand-emerald-signal-grid',
  colorScheme: 'dark',
  colors: {
    background: '#040a0f', panel: '#08151d', panelRaised: '#10232c', text: '#f2fbfa', muted: '#a8c4c2',
    border: '#2a4a50', primary: '#5eead4', secondary: '#0f766e', accent: '#34d399', danger: '#fb7185',
    success: '#6ee7b7', focus: '#fbbf24',
  },
  radius: { small: '7px', medium: '10px', large: '16px' },
  density: 'comfortable',
  typography: {
    body: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    heading: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    accent: 'ui-monospace, "Cascadia Code", monospace',
  },
  imagery: { overlay: 'linear-gradient(135deg,rgba(16,185,129,.12),transparent 42%),radial-gradient(circle at 88% 2%,rgba(45,212,191,.1),transparent 32rem)' },
};

export const CALLCOMMAND_NAVIGATION: readonly ModuleRouteManifestGroup[] = [
  { id: 'call-operations', label: 'Call operations', items: [
    { id: 'overview', canonicalPath: '/', label: 'Switchboard', icon: Gauge, activeMatch: { kind: 'exact' } },
    { id: 'calls', canonicalPath: '/calls', label: 'Calls', icon: PhoneCall, activeMatch: { kind: 'prefix' } },
    { id: 'recordings', canonicalPath: '/recordings', label: 'Recordings', icon: FileAudio, activeMatch: { kind: 'prefix' } },
    { id: 'transcripts', canonicalPath: '/transcripts', label: 'Transcripts', icon: FileText, activeMatch: { kind: 'prefix' } },
    { id: 'analysis', canonicalPath: '/analysis', label: 'Analysis', icon: Activity, activeMatch: { kind: 'prefix' } },
    { id: 'actions', canonicalPath: '/actions', label: 'Actions', icon: ListChecks, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'configuration', label: 'Configuration', items: [
    { id: 'automations', canonicalPath: '/automations', label: 'Automations', icon: Bot, activeMatch: { kind: 'prefix' } },
    { id: 'numbers', canonicalPath: '/numbers', label: 'Numbers and channels', icon: RadioTower, activeMatch: { kind: 'prefix' } },
    { id: 'providers', canonicalPath: '/providers', label: 'Providers', icon: Network, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'msp-assurance', label: 'MSP assurance', items: [
    { id: 'organizations', canonicalPath: '/organizations', label: 'Organizations', icon: Building2, activeMatch: { kind: 'prefix' } },
    { id: 'compliance', canonicalPath: '/compliance', label: 'Compliance', icon: ShieldCheck, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
] as const;

const copy: Record<CallCommandRouteArea, Pick<CallCommandRouteState, 'eyebrow' | 'title' | 'subtitle'>> = {
  overview: { eyebrow: 'Live communications', title: 'Switchboard', subtitle: 'Monitor call posture and operator-controlled sessions without overstating provider availability.' },
  calls: { eyebrow: 'Call intelligence', title: 'Calls', subtitle: 'Review durable call records, outcomes, provenance, and validated report artifacts.' },
  recordings: { eyebrow: 'Consent-bound media', title: 'Recordings', subtitle: 'Review recording availability under explicit consent, provider, retention, and access controls.' },
  transcripts: { eyebrow: 'Structured call record', title: 'Transcripts', subtitle: 'Review or process persisted transcripts without treating generated analysis as provider fact.' },
  analysis: { eyebrow: 'Bounded intelligence', title: 'Analysis', subtitle: 'Inspect summaries, sentiment, priority, extracted fields, and deterministic flow results.' },
  actions: { eyebrow: 'Follow-up operations', title: 'Actions', subtitle: 'Review idempotent ticket, lead, task, and explicitly bounded action outcomes.' },
  automations: { eyebrow: 'Policy-driven routing', title: 'Automations', subtitle: 'Manage receptionist profiles, validated versioned flows, and allowlisted automation rules.' },
  numbers: { eyebrow: 'Telephony configuration', title: 'Numbers and channels', subtitle: 'Configure channels, consent behavior, business hours, and signed-webhook provider state.' },
  providers: { eyebrow: 'Provider truth', title: 'Providers', subtitle: 'Review telephony and MSP adapters, schema fingerprints, health reasons, and kill switches.' },
  organizations: { eyebrow: 'Verified MSP association', title: 'Organizations and support contacts', subtitle: 'Manage directory-backed support profiles, trusted lines, contacts, and rotatable SupportLinks.' },
  compliance: { eyebrow: 'Assurance and evidence', title: 'Compliance and call evidence', subtitle: 'Review consent, prohibited actions, assurance levels, hash-linked audit, and onboarding gates.' },
  settings: { eyebrow: 'Safety controls', title: 'CallCommand AI settings', subtitle: 'Keep ticket-first automation and incident-mode controls under OperatorOS authority.' },
};

const state = (area: CallCommandRouteArea, canonicalPath: string, recordId?: string): CallCommandRouteState => ({ area, canonicalPath, recordId, ...copy[area] });

export function resolveCallCommandRoute(routePath?: string): CallCommandRouteState {
  const raw = (routePath || '/').split(/[?#]/u, 1)[0];
  const path = `/${raw.replace(/^\/(?:modules|apps)\/callcommand-ai\/?/u, '').split('/').filter(Boolean).join('/')}`;
  const [root, recordId] = path.split('/').filter(Boolean);
  if (!root || ['dashboard', 'app', 'switchboard', 'simulate', 'simulate-live-call'].includes(root)) return state('overview', '/');
  if (root === 'calls' || root === 'operations') return state('calls', '/calls', recordId);
  if (root === 'recordings') return state('recordings', '/recordings', recordId);
  if (root === 'transcripts') return state('transcripts', '/transcripts', recordId);
  if (root === 'analysis') return state('analysis', '/analysis', recordId);
  if (['actions', 'work', 'tickets', 'leads', 'tasks'].includes(root)) return state('actions', '/actions', recordId);
  if (['automations', 'automation-rules', 'profiles', 'receptionist-profiles', 'flows', 'channels'].includes(root)) return state('automations', '/automations', recordId);
  if (['numbers', 'transfer-targets'].includes(root)) return state('numbers', '/numbers', recordId);
  if (['providers', 'setup', 'integrations'].includes(root)) return state('providers', '/providers', recordId);
  if (['organizations', 'contacts', 'onboarding'].includes(root)) return state('organizations', '/organizations', recordId);
  if (['compliance', 'consent', 'suppressions', 'audit', 'policy', 'action-catalog'].includes(root)) return state('compliance', '/compliance', recordId);
  if (['settings', 'billing'].includes(root)) return state('settings', '/settings');
  return state('overview', '/');
}

export const CALLCOMMAND_LEGACY_REDIRECTS = {
  '/dashboard': '/', '/app': '/', '/switchboard': '/', '/tickets': '/actions', '/leads': '/actions', '/tasks': '/actions',
  '/profiles': '/automations', '/receptionist-profiles': '/automations', '/flows': '/automations', '/channels': '/automations',
  '/automation-rules': '/automations', '/setup/telephony': '/providers', '/integrations': '/providers', '/transfer-targets': '/numbers',
  '/consent': '/compliance', '/suppressions': '/compliance', '/audit': '/compliance', '/policy': '/compliance',
  '/action-catalog': '/compliance', '/onboarding': '/organizations', '/billing': '/settings',
} as const;
