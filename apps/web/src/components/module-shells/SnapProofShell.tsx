'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import { Activity, BriefcaseBusiness, ExternalLink, Fingerprint, Grid2X2, LifeBuoy, UserRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ModuleApplicationShell } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import { SNAPPROOF_NAVIGATION, SNAPPROOF_THEME, resolveSnapProofRoute } from './SnapProofRoute.contract';

interface SnapProofShellProps { baseUrl?: string; routePath?: string }

function RouteLoading() {
  return <section className="snapproof-route-state" aria-busy="true"><Activity size={18} />Loading this SnapProofOS route…</section>;
}

const SnapProofWorkspace = dynamic(() => import('./SnapProofWorkspace'), { loading: RouteLoading });

export default function SnapProofShell({ routePath }: SnapProofShellProps) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId();
  const route = resolveSnapProofRoute(routePath || pathname);
  const sourceRouted = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback(
    (path: string) => sourceRouted ? `/modules/snapproofos${path === '/' ? '/dashboard' : path}` : path,
    [sourceRouted],
  );
  const navigation = useMemo(() => SNAPPROOF_NAVIGATION.map(group => ({
    ...group,
    items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
  })), [hrefFor]);
  const platformAdmin = user?.platformRole === 'super_admin';
  const roleLabel = platformAdmin
    ? 'Platform administrator'
    : activeRole === 'owner'
      ? 'Organization owner'
      : activeRole === 'admin'
        ? 'Organization administrator'
        : activeRole === 'viewer'
          ? 'Read-only observer'
          : 'Field operator';
  const pageAction = route.area === 'jobs'
    ? null
    : route.area === 'settings' && platformAdmin
      ? <Link className="snapproof-action" href={`${DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}app/platform/modules/snapproofos`}><ExternalLink size={15} />Platform settings</Link>
      : <Link className="snapproof-action" href={hrefFor('/jobs')}><BriefcaseBusiness size={15} />Open jobs</Link>;

  return (
    <ModuleApplicationShell
      moduleId="snapproofos"
      moduleName="SnapProofOS"
      theme={SNAPPROOF_THEME}
      currentPath={hrefFor(route.canonicalPath)}
      navigation={navigation}
      brand={<Link href={hrefFor('/')} className="snapproof-brand"><span><Fingerprint size={20} /></span><strong>SnapProofOS</strong></Link>}
      organization={{ label: 'Organization', value: activeTenant?.name ?? tenantId ?? 'No organization selected', testId: 'snapproofos-tenant-badge' }}
      accessContext={{ label: 'Access', value: roleLabel, testId: 'snapproofos-role-badge' }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2, testId: 'snapproofos-return-command-center' },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound, testId: 'snapproofos-profile' },
        { label: 'Help', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.supportUrl, icon: LifeBuoy, testId: 'snapproofos-help' },
      ]}
      page={{ eyebrow: route.eyebrow, title: route.title, subtitle: route.subtitle, actions: pageAction, detailLabel: route.recordId }}
      state={authLoading || tenantLoading ? 'loading' : !tenantId ? 'empty' : 'ready'}
      stateMessage={!tenantId ? 'Choose an organization in My Apps before opening tenant-scoped proof work.' : undefined}
      pageHeaderTestId="snapproofos-module-header"
      mobileNavigation="drawer"
      testId="snapproofos-module-shell"
      dataAttributes={{ 'data-snapproofos-route': route.area }}
    >
      <style>{routeCss}</style>
      {tenantId && <SnapProofWorkspace key={`${tenantId}-${route.area}-${route.recordId ?? ''}`} view={route.area} recordId={route.recordId} hrefFor={hrefFor} />}
    </ModuleApplicationShell>
  );
}

const routeCss = `
  [data-testid="snapproofos-module-shell"] { box-sizing:border-box; width:100%; min-width:0; color-scheme:dark; }
  [data-testid="snapproofos-module-shell"] *,[data-testid="snapproofos-module-shell"] *:before,[data-testid="snapproofos-module-shell"] *:after { box-sizing:border-box; min-width:0; }
  [data-testid="snapproofos-module-shell"]:before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1; background:radial-gradient(circle at 12% -5%,rgba(239,68,68,.17),transparent 31rem),radial-gradient(circle at 92% 8%,rgba(45,212,191,.07),transparent 28rem); }
  .snapproof-brand { display:flex; align-items:center; gap:10px; color:#f5f7fa; text-decoration:none; }
  .snapproof-brand span { width:36px; height:36px; display:grid; place-items:center; border:1px solid #71313a; border-radius:8px; background:#301217; color:#fda4af; }
  .snapproof-action { display:inline-flex; align-items:center; gap:7px; border:1px solid #71313a; border-radius:7px; background:#3a1115; color:#fff1f2; padding:9px 12px; text-decoration:none; font-weight:800; }
  .snapproof-route-state { min-height:180px; display:flex; align-items:center; justify-content:center; gap:9px; border:1px solid #3b414b; border-radius:10px; background:#14171c; color:#a8adb7; }
  @media(max-width:650px){.snapproof-action{width:100%;justify-content:center}}
`;
