'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import {
  Activity,
  ClipboardCheck,
  FileArchive,
  FileText,
  Grid2X2,
  LayoutDashboard,
  Layers3,
  LifeBuoy,
  Palette,
  Rocket,
  Settings,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import {
  ModuleApplicationShell,
  type ModuleRouteManifestGroup,
  type ModuleThemeTokens,
} from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { useModuleAccessLevel } from '@/components/ModuleAccessContext';
import { getActiveTenantId } from '@/lib/auth';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

const Workspace = dynamic(() => import('./NinjaLaunchKitProductShell'), {
  loading: () => (
    <div role="status" aria-busy="true">
      <Activity size={18} /> Opening your campaign workspace…
    </div>
  ),
});

const theme: ModuleThemeTokens = {
  id: 'deploy-ops-release-control',
  colorScheme: 'dark',
  density: 'compact',
  colors: {
    background: '#020617',
    panel: '#07111f',
    panelRaised: '#10162c',
    text: '#f8fafc',
    muted: '#aebbd0',
    border: '#1e4b67',
    primary: '#67e8f9',
    secondary: '#2563eb',
    accent: '#8b5cf6',
    danger: '#fb7185',
    success: '#4ade80',
    focus: '#fbbf24',
  },
  radius: { small: '8px', medium: '12px', large: '18px' },
  typography: {
    body: '"Inter Variable",ui-sans-serif,system-ui,sans-serif',
    heading: '"Inter Variable",ui-sans-serif,system-ui,sans-serif',
    accent: 'ui-monospace,"Cascadia Code",monospace',
  },
  imagery: {
    overlay:
      'radial-gradient(circle at 10% 0,rgba(34,211,238,.16),transparent 34rem),linear-gradient(145deg,rgba(139,92,246,.08),transparent 48%)',
  },
};

const nav: readonly ModuleRouteManifestGroup[] = [
  {
    id: 'release',
    label: 'Campaign production',
    items: [
      {
        id: 'overview',
        canonicalPath: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        activeMatch: { kind: 'exact' },
      },
      {
        id: 'projects',
        canonicalPath: '/projects',
        label: 'Campaign packages',
        icon: Layers3,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'templates',
        canonicalPath: '/templates',
        label: 'Templates',
        icon: FileArchive,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'brief',
        canonicalPath: '/brief',
        label: 'Configuration',
        icon: Palette,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'deliverables',
        canonicalPath: '/deliverables',
        label: 'Campaign deliverables',
        icon: FileText,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'review',
        canonicalPath: '/review',
        label: 'Launch review',
        icon: ClipboardCheck,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'exports',
        canonicalPath: '/exports',
        label: 'Export history',
        icon: Rocket,
        activeMatch: { kind: 'prefix' },
      },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    items: [
      {
        id: 'settings',
        canonicalPath: '/settings',
        label: 'Settings',
        icon: Settings,
        activeMatch: { kind: 'prefix' },
      },
    ],
  },
];

const copy: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: 'Move the campaign toward launch',
    title: 'Deploy Ops dashboard',
    subtitle:
      'See campaign packages, overdue launch tasks, approval checks, exports, and the next action needed to move a campaign forward.',
  },
  projects: {
    eyebrow: 'Keep every campaign launch organized',
    title: 'Campaign launch packages',
    subtitle:
      'Create or reopen a package with its business brief, campaign copy, visual directions, tasks, files, and review history.',
  },
  templates: {
    eyebrow: 'Start with a reviewed structure',
    title: 'Templates',
    subtitle: 'Choose a business template so the team starts with a complete campaign structure instead of a blank page.',
  },
  brief: {
    eyebrow: 'Define the campaign once',
    title: 'Campaign brief',
    subtitle: 'Capture the business, audience, offer, desired action, tone, channels, brand, and promo deadline.',
  },
  deliverables: {
    eyebrow: 'Gather what the launch team needs',
    title: 'Campaign deliverables',
    subtitle: 'Review landing, ad, email, SMS, social, FAQ, flyer, checklist, and visual-production deliverables.',
  },
  review: {
    eyebrow: 'Find missing work before launch day',
    title: 'Launch checklist and review',
    subtitle:
      'Work through tasks, milestones, required files, and approvals before handing the campaign to its publishing tools.',
  },
  exports: {
    eyebrow: 'Prepare files for your team',
    title: 'Export history',
    subtitle: 'Download complete campaign packages and reopen exports already prepared for your team.',
  },
  settings: {
    eyebrow: 'Understand your launch workspace',
    title: 'Deploy Ops settings',
    subtitle: 'Review application access, usage, brand-profile capacity, export options, and organization administration.',
  },
};

function area(path?: string) {
  const root =
    (path || '/')
      .split(/[?#]/u, 1)[0]
      .replace(/^\/modules\/ninja-launch-kit\/?/u, '')
      .split('/')
      .filter(Boolean)[0] || 'overview';
  if (['dashboard', 'home'].includes(root)) return 'overview';
  if (['projects', 'kits'].includes(root)) return 'projects';
  if (root === 'templates') return 'templates';
  if (['brief', 'brand', 'visual-brief'].includes(root)) return 'brief';
  if (['deliverables', 'generate'].includes(root)) return 'deliverables';
  if (['review', 'readiness', 'launches', 'plan', 'artifacts'].includes(root)) return 'review';
  if (root === 'exports') return 'exports';
  if (['settings', 'account', 'admin'].includes(root)) return 'settings';
  return 'overview';
}

export default function NinjaLaunchKitRouteShell({
  baseUrl,
  routePath,
}: {
  baseUrl?: string;
  routePath?: string;
}) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId();
  const moduleAccessLevel = useModuleAccessLevel();
  const canWriteModule = user?.platformRole === 'super_admin' || (activeRole !== 'viewer' && (moduleAccessLevel
    ? moduleAccessLevel === 'user' || moduleAccessLevel === 'manager'
    : Boolean(activeRole)));
  const current = area(routePath || pathname);
  const localRoute = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback(
    (path: string) => (localRoute ? `/modules/ninja-launch-kit${path}` : path),
    [localRoute],
  );
  const navigation = useMemo(
    () =>
      nav.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
      })),
    [hrefFor],
  );

  return (
    <ModuleApplicationShell
      moduleId="ninja-launch-kit"
      moduleName="Deploy Ops"
      theme={theme}
      currentPath={hrefFor(current === 'overview' ? '/dashboard' : `/${current}`)}
      navigation={navigation}
      brand={
        <Link
          href={hrefFor('/dashboard')}
          style={{ color: '#fafafa', textDecoration: 'none', fontWeight: 950 }}
        >
          DEPLOY <span style={{ color: '#67e8f9' }}>OPS</span>
        </Link>
      }
      organization={{
        label: 'Organization',
        value: activeTenant?.name ?? (tenantId ? 'Selected organization' : 'No organization selected'),
      }}
      accessContext={{
        label: 'Access',
        value:
          user?.platformRole === 'super_admin'
            ? 'Platform administrator'
            : !canWriteModule
              ? 'Read-only access'
              : moduleAccessLevel === 'manager'
                ? 'Deploy Ops manager'
                : 'Launch contributor',
      }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2 },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound },
        { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'ninja-launch-kit', page: current === 'overview' ? '/dashboard' : `/${current}` }), icon: LifeBuoy },
      ]}
      page={copy[current]}
      state={authLoading || tenantLoading ? 'loading' : !tenantId ? 'empty' : 'ready'}
      stateMessage={!tenantId ? 'Choose an organization before opening Deploy Ops.' : undefined}
      mobileNavigation="drawer"
      testId="launchkit-module-shell"
      pageHeaderTestId="launchkit-module-header"
    >
      {tenantId && (
        <Workspace
          key={`${tenantId}-${current}`}
          baseUrl={baseUrl}
          routePath={routePath || `/${current}`}
          embedded
          view={current}
          hrefFor={hrefFor}
          canWrite={canWriteModule}
        />
      )}
    </ModuleApplicationShell>
  );
}
