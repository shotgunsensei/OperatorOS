'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import {
  Activity,
  Bot,
  Download,
  FileCode2,
  GitBranch,
  Grid2X2,
  History,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  ShieldCheck,
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

const Workspace = dynamic(() => import('./NinjamationShell'), {
  loading: () => (
    <div role="status" aria-busy="true">
      <Activity size={18} /> Opening your script workspace…
    </div>
  ),
});

const theme: ModuleThemeTokens = {
  id: 'script-ops-blue-violet-automation',
  colorScheme: 'dark',
  density: 'compact',
  colors: {
    background: '#020711',
    panel: '#061025',
    panelRaised: '#08182e',
    text: '#e8f4ff',
    muted: '#9db1c8',
    border: '#275176',
    primary: '#7dd3fc',
    secondary: '#137ee8',
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
      'radial-gradient(circle at 12% 0,rgba(41,151,255,.18),transparent 34rem),radial-gradient(circle at 88% 10%,rgba(139,92,246,.13),transparent 28rem)',
  },
};

const nav: readonly ModuleRouteManifestGroup[] = [
  {
    id: 'automate',
    label: 'Reviewed automation',
    items: [
      {
        id: 'overview',
        canonicalPath: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        activeMatch: { kind: 'exact' },
      },
      {
        id: 'library',
        canonicalPath: '/library',
        label: 'Script library',
        icon: FileCode2,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'sources',
        canonicalPath: '/sources',
        label: 'Library updates',
        icon: GitBranch,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'generate',
        canonicalPath: '/generate',
        label: 'AI drafting',
        icon: Bot,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'review',
        canonicalPath: '/review',
        label: 'Review',
        icon: ShieldCheck,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'runs',
        canonicalPath: '/runs',
        label: 'Downloads',
        icon: Download,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'versions',
        canonicalPath: '/versions',
        label: 'Versions',
        icon: History,
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
      {
        id: 'admin',
        canonicalPath: '/admin',
        label: 'Administration',
        icon: ShieldCheck,
        activeMatch: { kind: 'prefix' },
      },
    ],
  },
];

const copy: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: 'Find, review, and deliver scripts',
    title: 'Script Ops dashboard',
    subtitle:
      'See approved scripts, drafts awaiting review, library update issues, and recent downloads.',
  },
  library: {
    eyebrow: 'Start with work that has already been reviewed',
    title: 'Script library',
    subtitle: 'Search, inspect, save, and download the exact approved script version your technician needs.',
  },
  sources: {
    eyebrow: 'Keep the approved library current',
    title: 'Library updates',
    subtitle:
      'Import changes from approved catalogs, review update problems, and keep missing entries from being deleted by mistake.',
  },
  generate: {
    eyebrow: 'Draft what the library does not have',
    title: 'AI drafting',
    subtitle:
      'Create a defensive script draft, check it for risk, and send it through human review before download.',
  },
  review: {
    eyebrow: 'Approve the version people will use',
    title: 'Review queue',
    subtitle: 'Review, approve, reject, or retire scripts. Script Ops does not run them from the web app.',
  },
  runs: {
    eyebrow: 'Know which version was delivered',
    title: 'Download history',
    subtitle: 'Review who downloaded each approved version and when. Execution happens outside Script Ops.',
  },
  versions: {
    eyebrow: 'Follow every approved change',
    title: 'Versions',
    subtitle: 'Compare script versions, safety findings, library updates, and the file-verification details for each download.',
  },
  settings: {
    eyebrow: 'Shape the review workflow',
    title: 'Script Ops settings',
    subtitle: 'Manage usage, team access, approval preferences, and library update rules.',
  },
  admin: {
    eyebrow: 'Manage the organization library',
    title: 'Script Ops administration',
    subtitle: 'Create drafts, choose approved script catalogs, and control review policy without running imported scripts.',
  },
};

function area(path?: string) {
  const root =
    (path || '/')
      .split(/[?#]/u, 1)[0]
      .replace(/^\/modules\/ninjamation\/?/u, '')
      .split('/')
      .filter(Boolean)[0] || 'overview';
  if (root === 'dashboard') return 'overview';
  if (['library', 'scripts'].includes(root)) return 'library';
  if (['sources', 'sync', 'sync-runs'].includes(root)) return 'sources';
  if (['generate', 'generations'].includes(root)) return 'generate';
  if (root === 'review') return 'review';
  if (['runs', 'downloads'].includes(root)) return 'runs';
  if (root === 'versions') return 'versions';
  if (root === 'admin') return 'admin';
  if (['settings', 'account', 'billing', 'checkout'].includes(root)) return 'settings';
  return 'overview';
}

export default function NinjamationRouteShell({
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
  const canManageModule = canWriteModule && (
    user?.platformRole === 'super_admin'
    || activeRole === 'owner'
    || activeRole === 'admin'
  );
  const current = area(routePath || pathname);
  const localRoute = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback(
    (path: string) => (localRoute ? `/modules/ninjamation${path}` : path),
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
      moduleId="ninjamation"
      moduleName="Script Ops"
      theme={theme}
      currentPath={hrefFor(current === 'overview' ? '/dashboard' : `/${current}`)}
      navigation={navigation}
      brand={
        <Link
          href={hrefFor('/dashboard')}
          style={{ color: '#e8f4ff', textDecoration: 'none', fontWeight: 950 }}
        >
          SCRIPT <span style={{ color: '#7dd3fc' }}>OPS</span>
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
              ? 'Read-only library access'
              : canManageModule
                ? 'Script Ops administrator'
                : 'Script contributor',
      }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2 },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound },
        { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'ninjamation', page: current === 'overview' ? '/dashboard' : `/${current}` }), icon: LifeBuoy },
      ]}
      page={copy[current]}
      state={authLoading || tenantLoading ? 'loading' : !tenantId ? 'empty' : 'ready'}
      stateMessage={!tenantId ? 'Choose an organization before opening Script Ops.' : undefined}
      mobileNavigation="drawer"
      testId="ninjamation-module-shell"
      pageHeaderTestId="ninjamation-module-header"
    >
      <aside
        data-testid="notice-ninjamation-no-execution"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          marginBottom: 16,
          border: '1px solid rgba(139,92,246,.4)',
          borderRadius: 10,
          background: 'rgba(49,46,129,.16)',
          color: '#ddd6fe',
          padding: '10px 12px',
          fontSize: 13,
        }}
      >
        <ShieldCheck size={16} /> Script Ops never executes script source in the browser, web server, or API process.
      </aside>
      {tenantId && (
        <Workspace
          key={`${tenantId}-${current}-${routePath ?? ''}`}
          routePath={routePath || `/${current}`}
          embedded
          view={current}
          hrefFor={hrefFor}
          canWrite={canWriteModule}
          canManage={canManageModule}
        />
      )}
    </ModuleApplicationShell>
  );
}
