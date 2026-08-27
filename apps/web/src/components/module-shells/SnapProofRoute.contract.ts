import {
  Activity,
  Archive,
  BriefcaseBusiness,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  MessageSquareText,
  PackageOpen,
  Palette,
  Settings,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type SnapProofRouteArea =
  | 'overview' | 'customers' | 'projects' | 'jobs' | 'capture' | 'work' | 'costs' | 'templates'
  | 'team' | 'activity' | 'cases' | 'evidence' | 'review' | 'findings' | 'reports' | 'share' | 'exports'
  | 'custody' | 'retention' | 'branding' | 'settings';

export interface SnapProofRouteState {
  area: SnapProofRouteArea;
  canonicalPath: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  recordId?: string;
}

export const SNAPPROOF_THEME: ModuleThemeTokens = {
  id: 'snapproof-forensic-red-teal',
  colorScheme: 'dark',
  colors: {
    background: '#0b0d11', panel: '#14171c', panelRaised: '#1d2128', text: '#f5f7fa', muted: '#a8adb7',
    border: '#3b414b', primary: '#fda4af', secondary: '#b91c1c', accent: '#2dd4bf', danger: '#fb7185',
    success: '#34d399', focus: '#5eead4',
  },
  radius: { small: '6px', medium: '9px', large: '14px' },
  density: 'comfortable',
  typography: {
    body: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    heading: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    accent: 'ui-monospace, "Cascadia Code", monospace',
  },
  imagery: { overlay: 'linear-gradient(135deg,rgba(239,68,68,.14),transparent 42%),linear-gradient(315deg,rgba(45,212,191,.07),transparent 34%)' },
};

export const SNAPPROOF_NAVIGATION: readonly ModuleRouteManifestGroup[] = [
  { id: 'field-work', label: 'Field work', items: [
    { id: 'overview', canonicalPath: '/', label: 'Overview', icon: LayoutDashboard, activeMatch: { kind: 'exact' } },
    { id: 'customers', canonicalPath: '/customers', label: 'Customers', icon: UserRound, activeMatch: { kind: 'prefix' } },
    { id: 'projects', canonicalPath: '/projects', label: 'Projects', icon: FolderKanban, activeMatch: { kind: 'prefix' } },
    { id: 'jobs', canonicalPath: '/jobs', label: 'Jobs', icon: BriefcaseBusiness, activeMatch: { kind: 'prefix' } },
    { id: 'capture', canonicalPath: '/capture', label: 'Capture', icon: Upload, activeMatch: { kind: 'prefix' } },
    { id: 'work', canonicalPath: '/work', label: 'Findings and notes', icon: MessageSquareText, activeMatch: { kind: 'prefix' } },
    { id: 'costs', canonicalPath: '/costs', label: 'Parts and labor', icon: PackageOpen, activeMatch: { kind: 'prefix' } },
    { id: 'templates', canonicalPath: '/templates', label: 'Templates', icon: LayoutTemplate, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'proof-delivery', label: 'Proof and delivery', items: [
    { id: 'cases', canonicalPath: '/cases', label: 'Evidence cases', icon: FolderKanban, activeMatch: { kind: 'prefix' } },
    { id: 'evidence', canonicalPath: '/evidence', label: 'Evidence integrity', icon: FileCheck2, activeMatch: { kind: 'prefix' } },
    { id: 'findings', canonicalPath: '/findings', label: 'Case findings', icon: MessageSquareText, activeMatch: { kind: 'prefix' } },
    { id: 'review', canonicalPath: '/review', label: 'Review', icon: ClipboardCheck, activeMatch: { kind: 'prefix' } },
    { id: 'reports', canonicalPath: '/reports', label: 'Reports', icon: FileText, activeMatch: { kind: 'prefix' } },
    { id: 'share', canonicalPath: '/share', label: 'Secure sharing', icon: Link2, activeMatch: { kind: 'prefix' } },
    { id: 'exports', canonicalPath: '/exports', label: 'Exports', icon: Download, activeMatch: { kind: 'prefix' } },
    { id: 'custody', canonicalPath: '/custody', label: 'Custody', icon: Fingerprint, activeMatch: { kind: 'prefix' } },
    { id: 'retention', canonicalPath: '/retention', label: 'Retention', icon: Archive, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'organization', label: 'Organization', items: [
    { id: 'team', canonicalPath: '/team', label: 'Team', icon: Users, activeMatch: { kind: 'prefix' } },
    { id: 'activity', canonicalPath: '/activity', label: 'Activity', icon: Activity, activeMatch: { kind: 'prefix' } },
    { id: 'branding', canonicalPath: '/branding', label: 'Branding', icon: Palette, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
] as const;

const copy: Record<SnapProofRouteArea, Pick<SnapProofRouteState, 'eyebrow' | 'title' | 'subtitle'>> = {
  overview: { eyebrow: 'Field proof operations', title: 'Evidence operations overview', subtitle: 'See jobs, captured proof, review pressure, approved delivery, and documented value.' },
  customers: { eyebrow: 'Customer records', title: 'Customers', subtitle: 'Manage tenant-scoped customers and their related proof jobs.' },
  projects: { eyebrow: 'Project workspaces', title: 'Projects', subtitle: 'Use durable jobs as SnapProofOS project workspaces; no separate duplicate project record is invented.' },
  jobs: { eyebrow: 'Field execution', title: 'Jobs', subtitle: 'Plan and progress customer proof work from capture through completion.' },
  capture: { eyebrow: 'Mobile-first collection', title: 'Capture', subtitle: 'Capture private photos and files with offline queueing, validation, scanning, and checksums.' },
  work: { eyebrow: 'Structured field record', title: 'Findings and notes', subtitle: 'Record structured findings and append-only internal notes against the selected job.' },
  costs: { eyebrow: 'Documented value', title: 'Parts and labor', subtitle: 'Track real job costs and documented value without mixing platform billing.' },
  templates: { eyebrow: 'Repeatable delivery', title: 'Job templates', subtitle: 'Create and apply tenant-scoped job templates to consistent field workflows.' },
  team: { eyebrow: 'Assignment context', title: 'Team', subtitle: 'Review OperatorOS organization members available for proof-work assignment.' },
  activity: { eyebrow: 'Audit trail', title: 'Activity', subtitle: 'Review the tenant-scoped field action stream.' },
  cases: { eyebrow: 'Evidence lifecycle', title: 'Evidence cases', subtitle: 'Group evidence, findings, decisions, reports, retention, and custody under a durable case.' },
  evidence: { eyebrow: 'Integrity control', title: 'Evidence integrity', subtitle: 'Capture, inspect, verify, and preserve private evidence with durable hashes.' },
  review: { eyebrow: 'Approval control', title: 'Review', subtitle: 'Approve or reject evidence, jobs, and reports through server-enforced manager authority.' },
  findings: { eyebrow: 'Structured conclusions', title: 'Case findings', subtitle: 'Record editable findings and append-only internal review notes against the active evidence case.' },
  reports: { eyebrow: 'Customer delivery', title: 'Reports', subtitle: 'Generate branded report snapshots from persistent job data and review state.' },
  share: { eyebrow: 'Revocable access', title: 'Secure sharing', subtitle: 'Create bounded, revocable report links only from authorized persistent records.' },
  exports: { eyebrow: 'Defensible delivery', title: 'Exports', subtitle: 'Generate and download real PDF/DOCX or approved hash-bound evidence exports.' },
  custody: { eyebrow: 'Proof provenance', title: 'Chain of custody', subtitle: 'Verify the append-only sequence linking each evidence and review event.' },
  retention: { eyebrow: 'Lifecycle control', title: 'Retention', subtitle: 'Set retention dates, legal holds, and archive eligibility with manager authority.' },
  branding: { eyebrow: 'Customer presentation', title: 'Branding', subtitle: 'Manage tenant report identity and approved brand assets.' },
  settings: { eyebrow: 'Workspace control', title: 'SnapProofOS settings', subtitle: 'Review evidence privacy, access, review, sharing, and integration boundaries.' },
};

function state(area: SnapProofRouteArea, canonicalPath: string, recordId?: string): SnapProofRouteState {
  return { area, canonicalPath, recordId, ...copy[area] };
}

export function resolveSnapProofRoute(routePath?: string): SnapProofRouteState {
  const raw = (routePath || '/').split(/[?#]/u, 1)[0];
  const path = `/${raw.replace(/^\/(?:modules|apps)\/snapproofos\/?/u, '').split('/').filter(Boolean).join('/')}`;
  const segments = path.split('/').filter(Boolean);
  const [root, recordId] = segments;
  if (!root || root === 'dashboard') return state('overview', '/');
  if (root === 'jobs') return state('jobs', '/jobs', ['new', undefined].includes(recordId) ? undefined : recordId);
  if (root === 'cases') return state('cases', '/cases', recordId);
  if (root === 'customers') return state('customers', '/customers', recordId);
  if (root === 'projects') return state('projects', '/projects', recordId);
  if (['capture', 'files'].includes(root)) return state('capture', '/capture', recordId);
  if (root === 'work') return state('work', '/work', recordId);
  if (root === 'findings') return state('findings', '/findings', recordId);
  if (root === 'costs') return state('costs', '/costs');
  if (root === 'templates') return state('templates', '/templates');
  if (root === 'team') return state('team', '/team');
  if (root === 'activity') return state('activity', '/activity');
  if (root === 'evidence') return state('evidence', '/evidence', recordId);
  if (root === 'review') return state('review', '/review');
  if (root === 'reports') return state('reports', '/reports', recordId);
  if (root === 'share') return state('share', '/share');
  if (root === 'exports') return state('exports', '/exports');
  if (root === 'custody') return state('custody', '/custody');
  if (root === 'retention') return state('retention', '/retention');
  if (root === 'branding') return state('branding', '/branding');
  if (['settings', 'profile', 'billing'].includes(root)) return state('settings', '/settings');
  return state('overview', '/');
}

export const SNAPPROOF_LEGACY_REDIRECTS = {
  '/dashboard': '/', '/jobs/new': '/jobs', '/files': '/capture',
  '/profile': '/settings', '/billing': '/settings',
} as const;
