import {
  Activity, Bot, Building2, CreditCard, Gauge, Headphones, HeartPulse, ListChecks,
  Network, PhoneCall, RadioTower, Settings, ShieldCheck, Sparkles, Workflow,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type CallCommandRouteArea =
  | 'overview' | 'setup' | 'calls' | 'actions' | 'agents' | 'workflows' | 'numbers'
  | 'usage' | 'health' | 'providers' | 'organizations' | 'compliance' | 'settings'
  | 'recordings' | 'transcripts' | 'analysis' | 'automations';

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
  { id: 'getting-started', label: 'Getting started', items: [
    { id: 'overview', canonicalPath: '/', label: 'Operations overview', icon: Gauge, activeMatch: { kind: 'exact' } },
    { id: 'setup', canonicalPath: '/setup', label: 'Set up CallCommand', icon: Sparkles, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'callcommand-configuration', label: 'Your receptionist', items: [
    { id: 'numbers', canonicalPath: '/numbers', label: 'Phone numbers', icon: RadioTower, activeMatch: { kind: 'prefix' } },
    { id: 'agents', canonicalPath: '/agents', label: 'AI receptionists', icon: Bot, activeMatch: { kind: 'prefix' } },
    { id: 'workflows', canonicalPath: '/workflows', label: 'Call workflows', icon: Workflow, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'call-operations', label: 'Operations', items: [
    { id: 'calls', canonicalPath: '/calls', label: 'Calls and history', icon: PhoneCall, activeMatch: { kind: 'prefix' } },
    { id: 'actions', canonicalPath: '/actions', label: 'Follow-up work', icon: ListChecks, activeMatch: { kind: 'prefix' } },
    { id: 'usage', canonicalPath: '/usage', label: 'Usage and billing', icon: CreditCard, activeMatch: { kind: 'prefix' } },
    { id: 'health', canonicalPath: '/health', label: 'Health and readiness', icon: HeartPulse, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'msp-assurance', label: 'MSP assurance', items: [
    { id: 'organizations', canonicalPath: '/organizations', label: 'Organizations', icon: Building2, activeMatch: { kind: 'prefix' } },
    { id: 'providers', canonicalPath: '/providers', label: 'Advanced connections', icon: Network, activeMatch: { kind: 'prefix' } },
    { id: 'compliance', canonicalPath: '/compliance', label: 'Compliance', icon: ShieldCheck, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
] as const;

const copy: Record<CallCommandRouteArea, Pick<CallCommandRouteState, 'eyebrow' | 'title' | 'subtitle'>> = {
  overview: { eyebrow: 'Turn calls into completed work', title: 'Operations overview', subtitle: 'See setup progress, clearly labeled simulations or calls confirmed by your phone service, caller outcomes, available capacity, and follow-ups that need attention.' },
  setup: { eyebrow: 'Get ready for the first call', title: 'Set up CallCommand', subtitle: 'Choose a number, prepare your receptionist, select a workflow, run a test, and finish the requirements for live calls.' },
  calls: { eyebrow: 'Understand every caller outcome', title: 'Calls and history', subtitle: 'Review summaries, timelines, recordings, transcripts, and the follow-up work created from each call.' },
  recordings: { eyebrow: 'Listen when consent allows', title: 'Calls and history', subtitle: 'Open the recording available for this call and review it alongside the call summary.' },
  transcripts: { eyebrow: 'Review what was said', title: 'Calls and history', subtitle: 'Read the saved transcript for this call without changing the original conversation record.' },
  analysis: { eyebrow: 'See what the call produced', title: 'Calls and history', subtitle: 'Review the summary, call path, decisions, and follow-up work created from this call.' },
  actions: { eyebrow: 'Do not lose the next step', title: 'Follow-up work', subtitle: 'Review tickets, leads, tasks, alerts, and other work created from calls.' },
  agents: { eyebrow: 'AI receptionist', title: 'AI receptionists', subtitle: 'Describe your business and how your receptionist should greet, help, collect information, and escalate.' },
  workflows: { eyebrow: 'Decide what happens on each call', title: 'Call workflows', subtitle: 'Start from an editable business template, choose the follow-up actions, and assign the workflow to a phone number.' },
  automations: { eyebrow: 'Decide what happens on each call', title: 'Call workflows', subtitle: 'Start from an editable business template, choose the follow-up actions, and assign the workflow to a phone number.' },
  numbers: { eyebrow: 'Business phone lines', title: 'Phone numbers', subtitle: 'Review number options or prepare the number your customers already know. Purchase and live activation stay locked until an administrator confirms them and the phone service is ready.' },
  usage: { eyebrow: 'Know your call capacity and cost', title: 'Usage and billing', subtitle: 'See active phone lines, minutes used, included capacity, and current call-service pricing.' },
  health: { eyebrow: 'Finish setup before going live', title: 'Health and readiness', subtitle: 'See what is working, what needs attention, and the next step for each connected service.' },
  providers: { eyebrow: 'Manage advanced connections', title: 'Connected services', subtitle: 'Review phone and MSP connections, current health, safety shutoffs, and issues needing attention.' },
  organizations: { eyebrow: 'Route callers to the right support team', title: 'Organizations and support contacts', subtitle: 'Manage support profiles, trusted phone lines, contacts, and replaceable support links.' },
  compliance: { eyebrow: 'Keep call handling safe', title: 'Compliance and call records', subtitle: 'Review consent, prohibited actions, safety levels, change history, and setup requirements.' },
  settings: { eyebrow: 'Control how calls are handled', title: 'CallCommand AI settings', subtitle: 'Manage follow-up defaults, incident controls, team access, and safety limits.' },
};

const state = (area: CallCommandRouteArea, canonicalPath: string, recordId?: string): CallCommandRouteState => ({ area, canonicalPath, recordId, ...copy[area] });

export function resolveCallCommandRoute(routePath?: string): CallCommandRouteState {
  const raw = (routePath || '/').split(/[?#]/u, 1)[0];
  const path = `/${raw.replace(/^\/(?:modules|apps)\/callcommand-ai\/?/u, '').split('/').filter(Boolean).join('/')}`;
  const [root, recordId] = path.split('/').filter(Boolean);
  if (!root || ['dashboard', 'app', 'switchboard', 'simulate', 'simulate-live-call'].includes(root)) return state('overview', '/');
  if (['setup', 'getting-started', 'onboarding'].includes(root)) return state('setup', '/setup');
  if (root === 'calls' || root === 'operations') return state('calls', '/calls', recordId);
  if (['recordings', 'transcripts', 'analysis'].includes(root)) return state('calls', '/calls', recordId);
  if (['actions', 'work', 'tickets', 'leads', 'tasks'].includes(root)) return state('actions', '/actions', recordId);
  if (['agents', 'profiles', 'receptionist-profiles'].includes(root)) return state('agents', '/agents', recordId);
  if (['workflows', 'automations', 'automation-rules', 'flows'].includes(root)) return state('workflows', '/workflows', recordId);
  if (['numbers', 'channels', 'transfer-targets'].includes(root)) return state('numbers', '/numbers', recordId);
  if (['usage', 'billing'].includes(root)) return state('usage', '/usage');
  if (['health', 'readiness'].includes(root) || root === 'integrations' && recordId === 'health') return state('health', '/health');
  if (['providers', 'integrations'].includes(root)) return state('providers', '/providers', recordId);
  if (['organizations', 'contacts'].includes(root)) return state('organizations', '/organizations', recordId);
  if (['compliance', 'consent', 'suppressions', 'audit', 'policy', 'action-catalog'].includes(root)) return state('compliance', '/compliance', recordId);
  if (root === 'settings') return state('settings', '/settings');
  return state('overview', '/');
}

export const CALLCOMMAND_LEGACY_REDIRECTS = {
  '/dashboard': '/', '/app': '/', '/switchboard': '/', '/tickets': '/actions', '/leads': '/actions', '/tasks': '/actions',
  '/profiles': '/agents', '/receptionist-profiles': '/agents', '/flows': '/workflows', '/channels': '/numbers',
  '/automation-rules': '/workflows', '/automations': '/workflows', '/setup/telephony': '/health', '/integrations': '/providers', '/integrations/health': '/health', '/transfer-targets': '/numbers',
  '/recordings': '/calls', '/transcripts': '/calls', '/analysis': '/calls',
  '/consent': '/compliance', '/suppressions': '/compliance', '/audit': '/compliance', '/policy': '/compliance',
  '/action-catalog': '/compliance', '/onboarding': '/setup', '/billing': '/usage',
} as const;
