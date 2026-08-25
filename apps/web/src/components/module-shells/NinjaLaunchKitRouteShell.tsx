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
import { getActiveTenantId } from '@/lib/auth';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

const Workspace = dynamic(() => import('./NinjaLaunchKitProductShell'), {
  loading: () => (
    <div role="status" aria-busy="true">
      <Activity size={18} /> Loading release operations…
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
    body: 'Inter,ui-sans-serif,system-ui,sans-serif',
    heading: 'Inter,ui-sans-serif,system-ui,sans-serif',
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
    label: 'Release operations',
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
        label: 'Releases',
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
        label: 'Artifacts',
        icon: FileText,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'review',
        canonicalPath: '/review',
        label: 'Readiness',
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
    eyebrow: 'Release control',
    title: 'Deploy Ops dashboard',
    subtitle:
      'See durable release packages, generation usage, exports, approvals, and readiness evidence.',
  },
  projects: {
    eyebrow: 'Release systems',
    title: 'Releases and packages',
    subtitle:
      'Create and reopen tenant-scoped release packages without claiming provider deployment success.',
  },
  templates: {
    eyebrow: 'Pinned source catalog',
    title: 'Templates',
    subtitle: 'Choose from the reviewed template catalog without leaking locked prefills.',
  },
  brief: {
    eyebrow: 'Deployment direction',
    title: 'Configuration and release brief',
    subtitle: 'Define audience, environment intent, rollout notes, and reusable release direction.',
  },
  deliverables: {
    eyebrow: 'Persisted release package',
    title: 'Artifacts',
    subtitle: 'Review stored deliverables, communications, evidence, and release briefs.',
  },
  review: {
    eyebrow: 'Promotion discipline',
    title: 'Readiness and approvals',
    subtitle:
      'Manage tasks, artifacts, approvals, promotion evidence, rollback notes, and release proof.',
  },
  exports: {
    eyebrow: 'Audited delivery',
    title: 'Export history',
    subtitle: 'Download authorized formats with durable checksum evidence.',
  },
  settings: {
    eyebrow: 'OperatorOS authority',
    title: 'Deploy Ops settings',
    subtitle: 'Review plan limits, administration, and safe provider configuration.',
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
  const current = area(routePath || pathname);
  const localRoute = pathname.startsWith('/modules/');
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
        value: activeTenant?.name ?? tenantId ?? 'No organization selected',
      }}
      accessContext={{
        label: 'Access',
        value:
          user?.platformRole === 'super_admin'
            ? 'Platform administrator'
            : (activeRole ?? 'member'),
      }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2 },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound },
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
        />
      )}
    </ModuleApplicationShell>
  );
}
