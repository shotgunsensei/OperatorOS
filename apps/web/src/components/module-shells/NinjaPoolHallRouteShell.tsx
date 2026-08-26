'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import {
  Activity,
  Bot,
  Crosshair,
  Grid2X2,
  History,
  Settings,
  Target,
  Trophy,
  UserRound,
  Users,
  Wifi,
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

const Workspace = dynamic(() => import('./NinjaPoolHallShell'), {
  loading: () => (
    <div role="status" aria-busy="true">
      <Activity size={18} /> Loading the table…
    </div>
  ),
});

const theme: ModuleThemeTokens = {
  id: 'operator-pool-hall-operations-table',
  colorScheme: 'dark',
  density: 'compact',
  colors: {
    background: '#020617',
    panel: '#07111f',
    panelRaised: '#0b1d2e',
    text: '#f8fafc',
    muted: '#a8c2d4',
    border: '#164e63',
    primary: '#67e8f9',
    secondary: '#0284c7',
    accent: '#22d3ee',
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
      'radial-gradient(circle at 8% 0,rgba(34,211,238,.18),transparent 30rem),radial-gradient(circle at 92% 4%,rgba(2,132,199,.14),transparent 26rem)',
  },
};

const nav: readonly ModuleRouteManifestGroup[] = [
  {
    id: 'play',
    label: 'Table operations',
    items: [
      {
        id: 'home',
        canonicalPath: '/',
        label: 'Hall',
        icon: Target,
        activeMatch: { kind: 'exact' },
      },
      {
        id: 'practice',
        canonicalPath: '/practice',
        label: 'Practice',
        icon: Crosshair,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'cpu',
        canonicalPath: '/cpu',
        label: 'Vs CPU',
        icon: Bot,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'local',
        canonicalPath: '/local',
        label: 'Local match',
        icon: Users,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'online',
        canonicalPath: '/online',
        label: 'Online',
        icon: Wifi,
        activeMatch: { kind: 'prefix' },
      },
    ],
  },
  {
    id: 'player',
    label: 'Player',
    items: [
      {
        id: 'history',
        canonicalPath: '/history',
        label: 'History & stats',
        icon: History,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'profile',
        canonicalPath: '/profile',
        label: 'Profile',
        icon: Trophy,
        activeMatch: { kind: 'prefix' },
      },
      {
        id: 'settings',
        canonicalPath: '/settings',
        label: 'Rules & settings',
        icon: Settings,
        activeMatch: { kind: 'prefix' },
      },
    ],
  },
];

const copy: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  home: {
    eyebrow: 'Operator table',
    title: 'Operator Pool Hall',
    subtitle: 'Choose practice, CPU, local hot-seat, or protected online play.',
  },
  practice: {
    eyebrow: 'Free shoot',
    title: 'Practice table',
    subtitle: 'Clear the rack at your pace and persist a practice summary.',
  },
  cpu: {
    eyebrow: 'House opponent',
    title: 'CPU match',
    subtitle: 'Play a complete deterministic 8-ball match against the house.',
  },
  local: {
    eyebrow: 'Hot-seat play',
    title: 'Local match',
    subtitle: 'Play and persist a two-player match on one device.',
  },
  online: {
    eyebrow: 'Authenticated rooms',
    title: 'Online lobby and match',
    subtitle: 'Host, join, play, and reconnect to server-verified rooms.',
  },
  history: {
    eyebrow: 'Durable results',
    title: 'History and stats',
    subtitle: 'Review saved results and player progression.',
  },
  profile: {
    eyebrow: 'Player context',
    title: 'Profile',
    subtitle: 'Review progression and player identity under OperatorOS.',
  },
  settings: {
    eyebrow: 'Table control',
    title: 'Rules and settings',
    subtitle: 'Configure player feedback, table speed, and optional rule variations.',
  },
};

function area(path?: string) {
  const root =
    (path || '/')
      .split(/[?#]/u, 1)[0]
      .replace(/^\/modules\/ninja-pool-hall\/?/u, '')
      .split('/')
      .filter(Boolean)[0] || 'home';
  if (['host', 'join', 'rooms'].includes(root)) return 'online';
  if (root === 'matches' || root === 'stats') return 'history';
  if (['rules', 'settings'].includes(root)) return 'settings';
  return copy[root] ? root : 'home';
}

export default function NinjaPoolHallRouteShell({
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
  const game = ['practice', 'cpu', 'local', 'online'].includes(current);
  const localRoute = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback(
    (path: string) => (localRoute ? `/modules/ninja-pool-hall${path === '/' ? '' : path}` : path),
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
    <>
      <style>
        {game
          ? '.nph-adaptive-workspace{min-height:100vh;display:grid;grid-template-columns:1fr}.nph-adaptive-rail{display:none}.nph-adaptive-content{min-width:0;padding:10px}'
          : ''}
      </style>
      <ModuleApplicationShell
        moduleId="ninja-pool-hall"
        moduleName="Operator Pool Hall"
        theme={theme}
        currentPath={hrefFor(current === 'home' ? '/' : `/${current}`)}
        navigation={navigation}
        brand={
          <Link
            href={hrefFor('/')}
            style={{ color: '#f8fafc', textDecoration: 'none', fontWeight: 950 }}
          >
            OPERATOR <span style={{ color: '#67e8f9' }}>POOL HALL</span>
          </Link>
        }
        organization={{
          label: 'Organization',
          value: activeTenant?.name ?? tenantId ?? 'No organization selected',
        }}
        accessContext={{
          label: 'Player access',
          value:
            user?.platformRole === 'super_admin'
              ? 'Platform administrator'
              : (activeRole ?? 'member'),
        }}
        utilityActions={[
          {
            label: game ? 'Exit to My Apps' : 'My Apps',
            href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl,
            icon: Grid2X2,
          },
          {
            label: 'Profile',
            href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl,
            icon: UserRound,
          },
        ]}
        page={copy[current]}
        state={authLoading || tenantLoading ? 'loading' : !tenantId ? 'empty' : 'ready'}
        stateMessage={
          !tenantId ? 'Choose an organization before entering Operator Pool Hall.' : undefined
        }
        mobileNavigation="drawer"
        testId="ninja-pool-hall-module-shell"
        pageHeaderTestId="ninja-pool-hall-module-header"
        classNames={
          game
            ? {
                workspace: 'nph-adaptive-workspace',
                sideRail: 'nph-adaptive-rail',
                content: 'nph-adaptive-content',
              }
            : undefined
        }
      >
        {tenantId && (
          <Workspace
            key={`${tenantId}-${current}-${routePath ?? ''}`}
            routePath={routePath || `/${current}`}
            embedded
            gameActive={game}
          />
        )}
      </ModuleApplicationShell>
    </>
  );
}
