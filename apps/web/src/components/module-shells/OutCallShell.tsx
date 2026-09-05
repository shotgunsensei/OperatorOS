'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import { Activity, Grid2X2, LifeBuoy, PhoneCall, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ModuleApplicationShell } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { useModuleAccessLevel } from '@/components/ModuleAccessContext';
import { getActiveTenantId } from '@/lib/auth';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import { OUTCALL_NAVIGATION, OUTCALL_THEME, resolveOutCallRoute } from './OutCallRoute.contract';

interface OutCallShellProps { baseUrl?: string; routePath?: string }

const OutCallWorkspace = dynamic(() => import('./OutCallWorkspace'), {
  loading: () => <section className="outcall-route-state" aria-busy="true"><Activity size={18}/>Loading this OutCall route…</section>,
});

export default function OutCallShell({ routePath }: OutCallShellProps) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId();
  const route = resolveOutCallRoute(routePath || pathname);
  const sourceRouted = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback((path: string) => sourceRouted ? `/modules/outcall${path === '/' ? '/dashboard' : path}` : path, [sourceRouted]);
  const navigation = useMemo(() => OUTCALL_NAVIGATION.map(group => ({
    ...group, items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
  })), [hrefFor]);
  const platformAdmin = user?.platformRole === 'super_admin';
  const moduleAccessLevel = useModuleAccessLevel();
  const canWriteModule = platformAdmin || (activeRole !== 'viewer' && (moduleAccessLevel
    ? moduleAccessLevel === 'user' || moduleAccessLevel === 'manager'
    : Boolean(activeRole)));
  const roleLabel = platformAdmin ? 'Platform administrator' : !canWriteModule ? 'Read-only access' : activeRole === 'owner' ? 'Organization owner' : activeRole === 'admin' ? 'Organization administrator' : 'OutCall user';
  return <ModuleApplicationShell
    moduleId="outcall"
    moduleName="OutCall"
    theme={OUTCALL_THEME}
    currentPath={hrefFor(route.canonicalPath)}
    navigation={navigation}
    brand={<Link href={hrefFor('/')} className="outcall-brand"><span><PhoneCall size={20}/></span><strong>OutCall</strong></Link>}
    organization={{ label: 'Organization', value: activeTenant?.name ?? (tenantId ? 'Selected organization' : 'No organization selected'), testId: 'outcall-tenant-badge' }}
    accessContext={{ label: 'Access', value: roleLabel, testId: 'outcall-role-badge' }}
    utilityActions={[
      { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2, testId: 'outcall-return-command-center' },
      { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound, testId: 'outcall-profile' },
      { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'outcall', page: route.canonicalPath }), icon: LifeBuoy, testId: 'outcall-help' },
    ]}
    page={{ eyebrow: route.eyebrow, title: route.title, subtitle: route.subtitle, actions: route.area === 'compliance' ? null : <Link className="outcall-action" href={hrefFor('/compliance')}><ShieldCheck size={15}/>Safety and privacy</Link>, detailLabel: route.recordId }}
    state={authLoading || tenantLoading ? 'loading' : !tenantId ? 'empty' : 'ready'}
    stateMessage={!tenantId ? 'Choose an organization in My Apps before opening its OutCall workspace.' : undefined}
    pageHeaderTestId="outcall-module-header"
    mobileNavigation="drawer"
    testId="outcall-module-shell"
    dataAttributes={{ 'data-outcall-route': route.area }}
  >
    <style>{routeCss}</style>
    {tenantId && <OutCallWorkspace key={`${tenantId}-${route.area}-${route.recordId ?? ''}`} view={route.area} recordId={route.recordId} hrefFor={hrefFor} canWrite={canWriteModule}/>}
  </ModuleApplicationShell>;
}

const routeCss = `
  [data-testid="outcall-module-shell"] { box-sizing:border-box; width:100%; min-width:0; color-scheme:dark; }
  [data-testid="outcall-module-shell"] *,[data-testid="outcall-module-shell"] *:before,[data-testid="outcall-module-shell"] *:after { box-sizing:border-box; min-width:0; }
  [data-testid="outcall-module-shell"]:before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1; background:radial-gradient(circle at 10% -5%,rgba(139,92,246,.18),transparent 31rem),radial-gradient(circle at 94% 4%,rgba(196,181,253,.08),transparent 28rem); }
  .outcall-brand { display:flex; align-items:center; gap:10px; color:#f8f7ff; text-decoration:none; }
  .outcall-brand span { width:36px; height:36px; display:grid; place-items:center; border:1px solid #544479; border-radius:12px; background:#251b43; color:#c4b5fd; }
  .outcall-action { display:inline-flex; align-items:center; gap:7px; border:1px solid #544479; border-radius:9px; background:#281b4b; color:#ede9fe; padding:9px 12px; text-decoration:none; font-weight:800; }
  .outcall-route-state { min-height:180px; display:flex; align-items:center; justify-content:center; gap:9px; border:1px solid #48405f; border-radius:12px; background:#13111f; color:#b8b3ca; }
  @media(max-width:650px){.outcall-action{width:100%;justify-content:center}}
`;
