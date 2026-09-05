import {
  BarChart3,
  Beaker,
  ClipboardList,
  FileJson2,
  FlaskConical,
  History,
  SearchCheck,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type FaultlineLabRouteArea =
  | 'overview'
  | 'challenges'
  | 'session'
  | 'assignments'
  | 'runs'
  | 'evidence'
  | 'authoring'
  | 'reports'
  | 'settings';

export interface FaultlineLabRouteState {
  area: FaultlineLabRouteArea;
  canonicalPath: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  recordId?: string;
  challengeId?: string;
}

export const FAULTLINELAB_THEME: ModuleThemeTokens = {
  id: 'faultlinelab-violet-evidence-grid',
  colorScheme: 'dark',
  colors: {
    background: '#05040b', panel: '#0d0b18', panelRaised: '#151126', text: '#f2efff', muted: '#aaa3c3',
    border: '#382d57', primary: '#a78bfa', secondary: '#7c3aed', accent: '#67e8f9', danger: '#fb7185',
    success: '#6ee7b7', focus: '#c4b5fd',
  },
  radius: { small: '8px', medium: '12px', large: '18px' },
  density: 'comfortable',
  typography: {
    body: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    heading: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    accent: 'ui-monospace, "Cascadia Code", monospace',
  },
  imagery: { overlay: 'linear-gradient(135deg,rgba(139,92,246,.18),transparent 44%),linear-gradient(315deg,rgba(34,211,238,.08),transparent 36%)' },
};

export const FAULTLINELAB_NAVIGATION: readonly ModuleRouteManifestGroup[] = [
  { id: 'investigate', label: 'Investigate', items: [
    { id: 'overview', canonicalPath: '/', label: 'Overview', icon: FlaskConical, activeMatch: { kind: 'exact' } },
    { id: 'challenges', canonicalPath: '/challenges', label: 'Challenge library', icon: Beaker, activeMatch: { kind: 'prefix' } },
    { id: 'sessions', canonicalPath: '/sessions', label: 'Investigation', icon: SearchCheck, activeMatch: { kind: 'prefix' } },
    { id: 'assignments', canonicalPath: '/assignments', label: 'Assignments', icon: ClipboardList, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'prove', label: 'Proof and learning', items: [
    { id: 'runs', canonicalPath: '/runs', label: 'Runs and progress', icon: History, activeMatch: { kind: 'prefix' } },
    { id: 'evidence', canonicalPath: '/evidence', label: 'Evidence', icon: ShieldCheck, activeMatch: { kind: 'prefix' } },
    { id: 'authoring', canonicalPath: '/authoring', label: 'Authoring', icon: FileJson2, activeMatch: { kind: 'prefix' } },
    { id: 'reports', canonicalPath: '/reports', label: 'Reports', icon: BarChart3, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
] as const;

const copy: Record<FaultlineLabRouteArea, Pick<FaultlineLabRouteState, 'eyebrow' | 'title' | 'subtitle'>> = {
  overview: { eyebrow: 'Build diagnostic skill', title: 'Learning operations overview', subtitle: 'See assigned investigations, recent attempts, skill coverage, and the areas that need more practice.' },
  challenges: { eyebrow: 'Choose the next problem', title: 'Challenge library', subtitle: 'Find a reviewed diagnostic case and start working through the clues.' },
  session: { eyebrow: 'Investigate before you answer', title: 'Follow the evidence', subtitle: 'Run the available checks, unlock clues, identify the cause, and see how well your reasoning holds up.' },
  assignments: { eyebrow: 'Develop the team', title: 'Assignments', subtitle: 'Assign published challenges, set expectations, and follow each learner’s progress.' },
  runs: { eyebrow: 'Track improvement over time', title: 'Runs and progress', subtitle: 'Review scored attempts, solved challenges, streaks, badges, and personal history.' },
  evidence: { eyebrow: 'Review the reasoning', title: 'Evidence', subtitle: 'See which checks and clues supported each submitted diagnosis.' },
  authoring: { eyebrow: 'Build realistic challenges', title: 'Authoring', subtitle: 'Create, test, revise, publish, export, and retire diagnostic cases for your team.' },
  reports: { eyebrow: 'See where skills are growing', title: 'Reports', subtitle: 'Review individual and team results, solved cases, and practice gaps.' },
  settings: { eyebrow: 'Understand the rules of the lab', title: 'Workspace rules and access', subtitle: 'Review how training cases, scores, private proof, authoring, and team access are handled.' },
};

function state(area: FaultlineLabRouteArea, canonicalPath: string, extra: Partial<FaultlineLabRouteState> = {}): FaultlineLabRouteState {
  return { area, canonicalPath, ...copy[area], ...extra };
}

export function resolveFaultlineLabRoute(routePath?: string): FaultlineLabRouteState {
  const raw = (routePath || '/').split(/[?#]/u, 1)[0];
  const path = `/${raw.replace(/^\/(?:modules|apps)\/faultlinelab\/?/u, '').split('/').filter(Boolean).join('/')}`;
  const segments = path.split('/').filter(Boolean);
  const [root, recordId] = segments;
  if (!root || root === 'dashboard') return state('overview', '/');
  if (root === 'daily') return state('challenges', '/challenges');
  if (root === 'challenges') return state('challenges', '/challenges', { challengeId: recordId });
  if (root === 'sessions') return state('session', '/sessions', { recordId });
  if (root === 'assignments') return state('assignments', '/assignments');
  if (['progress', 'runs'].includes(root)) return state('runs', '/runs');
  if (root === 'evidence') return state('evidence', '/evidence');
  if (root === 'authoring') return state('authoring', '/authoring', { challengeId: recordId });
  if (['analytics', 'reports'].includes(root)) return state('reports', '/reports');
  if (root === 'settings') return state('settings', '/settings');
  return state('overview', '/');
}

export const FAULTLINELAB_LEGACY_REDIRECTS = {
  '/dashboard': '/', '/daily': '/challenges', '/progress': '/runs', '/analytics': '/reports',
} as const;
