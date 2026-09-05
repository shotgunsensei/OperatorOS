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
    { id: 'evidence', canonicalPath: '/evidence', label: 'File verification', icon: FileCheck2, activeMatch: { kind: 'prefix' } },
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
  overview: { eyebrow: 'Turn field work into customer proof', title: 'Proof operations overview', subtitle: 'See active jobs, missing photos or files, work awaiting review, and reports ready to deliver.' },
  customers: { eyebrow: 'Know who the work is for', title: 'Customers', subtitle: 'Keep each customer connected to their jobs, proof packages, and reports.' },
  projects: { eyebrow: 'Keep related work together', title: 'Projects', subtitle: 'Use each job as a workspace for the people, proof, findings, costs, and final report.' },
  jobs: { eyebrow: 'Complete the field record', title: 'Jobs', subtitle: 'Plan customer work, collect the required proof, and move each job through review to delivery.' },
  capture: { eyebrow: 'Collect proof from the field', title: 'Capture', subtitle: 'Add private photos and files, even when the device must upload them later.' },
  work: { eyebrow: 'Explain what happened', title: 'Findings and notes', subtitle: 'Record what was found, what was done, and the internal notes needed for review.' },
  costs: { eyebrow: 'Show the value delivered', title: 'Parts and labor', subtitle: 'Track job parts, labor, and customer value alongside the completed work.' },
  templates: { eyebrow: 'Make every job consistent', title: 'Job templates', subtitle: 'Create reusable job checklists so technicians capture the right proof every time.' },
  team: { eyebrow: 'Put someone in charge', title: 'Team', subtitle: 'Choose organization members who can own or review proof work.' },
  activity: { eyebrow: 'See what changed', title: 'Activity', subtitle: 'Review recent field actions, decisions, and updates across your organization.' },
  cases: { eyebrow: 'Keep the complete proof package together', title: 'Evidence cases', subtitle: 'Group photos, files, findings, decisions, reports, and retention details for one piece of work.' },
  evidence: { eyebrow: 'Confirm the submitted proof', title: 'File verification', subtitle: 'Inspect private photos and files, confirm they are unchanged, and keep their history available.' },
  review: { eyebrow: 'Check the work before delivery', title: 'Review', subtitle: 'Approve or reject submitted proof, completed jobs, and customer reports.' },
  findings: { eyebrow: 'Record the conclusion', title: 'Case findings', subtitle: 'Document the finding, resolution, and internal review notes for the active job.' },
  reports: { eyebrow: 'Prepare the customer closeout', title: 'Reports', subtitle: 'Create a branded report from approved job details, findings, costs, photos, and files.' },
  share: { eyebrow: 'Prepare controlled customer access', title: 'Secure sharing', subtitle: 'Create an expiring report link, deliver it through an approved external channel, and revoke access when it should end.' },
  exports: { eyebrow: 'Download the finished package', title: 'Exports', subtitle: 'Create PDF or DOCX reports and approved proof packages for delivery or recordkeeping.' },
  custody: { eyebrow: 'Follow the proof history', title: 'Chain of custody', subtitle: 'See when each photo, file, and review decision was added or changed.' },
  retention: { eyebrow: 'Keep records for the right amount of time', title: 'Retention', subtitle: 'Set review dates, legal holds, and when completed proof can be archived.' },
  branding: { eyebrow: 'Make reports look like your business', title: 'Branding', subtitle: 'Set the logo, colors, and business details used on customer reports.' },
  settings: { eyebrow: 'Understand how proof is protected', title: 'Privacy, review, and access', subtitle: 'Review private-file protection, approval responsibilities, controlled share links, and where account access is managed.' },
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
