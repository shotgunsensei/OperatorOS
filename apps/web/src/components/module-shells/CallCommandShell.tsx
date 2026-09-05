'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import { Activity, Grid2X2, Headphones, LifeBuoy, PhoneCall, UserRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useModuleAccessLevel } from '@/components/ModuleAccessContext';
import { ModuleApplicationShell } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import { CALLCOMMAND_NAVIGATION, CALLCOMMAND_THEME, resolveCallCommandRoute } from './CallCommandRoute.contract';

interface CallCommandShellProps { baseUrl?: string; routePath?: string }

function RouteLoading() {
  return <section className="callcommand-route-state" aria-busy="true"><Activity size={18}/>Loading this CallCommand route…</section>;
}

const CallCommandWorkspace = dynamic(() => import('./CallCommandWorkspace'), { loading: RouteLoading });

export default function CallCommandShell({ routePath }: CallCommandShellProps) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId();
  const route = resolveCallCommandRoute(routePath || pathname);
  const sourceRouted = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback((path: string) => sourceRouted ? `/modules/callcommand-ai${path === '/' ? '/dashboard' : path}` : path, [sourceRouted]);
  const navigation = useMemo(() => CALLCOMMAND_NAVIGATION.map(group => ({
    ...group, items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
  })), [hrefFor]);
  const platformAdmin = user?.platformRole === 'super_admin';
  const moduleAccessLevel = useModuleAccessLevel();
  const canWriteModule = platformAdmin || (activeRole !== 'viewer' && (moduleAccessLevel
    ? moduleAccessLevel === 'user' || moduleAccessLevel === 'manager'
    : Boolean(activeRole)));
  const canManageModule = canWriteModule && (platformAdmin || activeRole === 'owner' || activeRole === 'admin');
  const roleLabel = platformAdmin ? 'Platform administrator' : !canWriteModule ? 'Read-only access' : activeRole === 'owner' ? 'Organization owner' : activeRole === 'admin' ? 'Organization administrator' : moduleAccessLevel === 'manager' ? 'CallCommand manager' : 'Call operator';
  return <ModuleApplicationShell
    moduleId="callcommand"
    moduleName="CallCommand AI"
    theme={CALLCOMMAND_THEME}
    currentPath={hrefFor(route.canonicalPath)}
    navigation={navigation}
    brand={<Link href={hrefFor('/')} className="callcommand-brand"><span><Headphones size={20}/></span><strong>CallCommand AI</strong></Link>}
    organization={{ label: 'Organization', value: activeTenant?.name ?? (tenantId ? 'Selected organization' : 'No organization selected'), testId: 'callcommand-tenant-badge' }}
    accessContext={{ label: 'Access', value: roleLabel, testId: 'callcommand-role-badge' }}
    utilityActions={[
      { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2, testId: 'callcommand-return-command-center' },
      { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound, testId: 'callcommand-profile' },
      { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'callcommand-ai', page: route.canonicalPath }), icon: LifeBuoy, testId: 'callcommand-help' },
    ]}
    page={{ eyebrow: route.eyebrow, title: route.title, subtitle: route.subtitle, actions: route.area === 'calls' ? null : <Link className="callcommand-action" href={hrefFor('/calls')}><PhoneCall size={15}/>Review calls</Link>, detailLabel: route.recordId }}
    state={authLoading || tenantLoading ? 'loading' : !tenantId ? 'empty' : 'ready'}
    stateMessage={!tenantId ? 'Choose an organization in My Apps before opening its call operations.' : undefined}
    pageHeaderTestId="callcommand-module-header"
    mobileNavigation="drawer"
    testId="callcommand-module-shell"
    dataAttributes={{ 'data-callcommand-route': route.area }}
  >
    <style>{routeCss}</style>
    {tenantId && <CallCommandWorkspace key={`${tenantId}-${route.area}-${route.recordId ?? ''}`} view={route.area} recordId={route.recordId} hrefFor={hrefFor} canWriteModule={canWriteModule} canManageModule={canManageModule}/>}
  </ModuleApplicationShell>;
}

const routeCss = `
  [data-testid="callcommand-module-shell"] { box-sizing:border-box; width:100%; min-width:0; color-scheme:dark; }
  [data-testid="callcommand-module-shell"] *,[data-testid="callcommand-module-shell"] *:before,[data-testid="callcommand-module-shell"] *:after { box-sizing:border-box; min-width:0; }
  [data-testid="callcommand-module-shell"]:before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1; background:radial-gradient(circle at 12% -5%,rgba(16,185,129,.14),transparent 31rem),radial-gradient(circle at 92% 8%,rgba(45,212,191,.08),transparent 28rem); }
  .callcommand-brand { display:flex; align-items:center; gap:10px; color:#f2fbfa; text-decoration:none; }
  .callcommand-brand span { width:36px; height:36px; display:grid; place-items:center; border:1px solid #2a5957; border-radius:10px; background:#082925; color:#5eead4; }
  .callcommand-action { display:inline-flex; align-items:center; gap:7px; border:1px solid #2a5957; border-radius:8px; background:#0b332e; color:#d1fae5; padding:9px 12px; text-decoration:none; font-weight:800; }
  .callcommand-route-state { min-height:180px; display:flex; align-items:center; justify-content:center; gap:9px; border:1px solid #2a4a50; border-radius:10px; background:#08151d; color:#a8c4c2; }
  @media(max-width:650px){.callcommand-action{width:100%;justify-content:center}}
`;
