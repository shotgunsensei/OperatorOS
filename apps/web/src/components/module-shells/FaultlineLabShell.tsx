'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Activity, Beaker, ExternalLink, FlaskConical, Grid2X2, LifeBuoy, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ModuleApplicationShell } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import {
  FAULTLINELAB_NAVIGATION,
  FAULTLINELAB_THEME,
  resolveFaultlineLabRoute,
} from './FaultlineLabRoute.contract';

interface FaultlineLabShellProps {
  baseUrl?: string;
  routePath?: string;
}

function RouteLoading() {
  return <section className="faultline-route-state" aria-busy="true"><Activity size={18} />Loading this FaultlineLab route…</section>;
}

const FaultlineLabWorkspace = dynamic(() => import('./FaultlineLabWorkspace'), { loading: RouteLoading });

export default function FaultlineLabShell({ routePath }: FaultlineLabShellProps) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId();
  const route = resolveFaultlineLabRoute(routePath || pathname);
  const sourceRouted = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback(
    (path: string) => sourceRouted ? `/modules/faultlinelab${path === '/' ? '/dashboard' : path}` : path,
    [sourceRouted],
  );
  const navigation = useMemo(() => FAULTLINELAB_NAVIGATION.map(group => ({
    ...group,
    items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
  })), [hrefFor]);
  const platformAdmin = user?.platformRole === 'super_admin';
  const canManage = platformAdmin || activeRole === 'owner' || activeRole === 'admin';
  const roleLabel = platformAdmin
    ? 'Platform administrator'
    : activeRole === 'owner'
      ? 'Organization owner'
      : activeRole === 'admin'
        ? 'Organization administrator'
        : activeRole === 'viewer'
          ? 'Read-only observer'
          : 'Investigator';
  const tenantLabel = activeTenant?.name ?? tenantId ?? 'No organization selected';
  const pageAction = route.area === 'challenges'
    ? null
    : route.area === 'settings' && platformAdmin
      ? <Link className="faultline-action" href={`${DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}app/platform/modules/faultlinelab`}><ExternalLink size={15} />Platform settings</Link>
      : <Link className="faultline-action" href={hrefFor('/challenges')}><Beaker size={15} />Browse challenges</Link>;

  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifest = manifest?.href;
    if (manifest) manifest.href = '/faultlinelab.webmanifest';
    if ('serviceWorker' in navigator && window.location.hostname.toLowerCase() === 'faultlinelab.operatoros.net') {
      void navigator.serviceWorker.register('/faultlinelab-sw.js', { scope: '/' }).catch(() => undefined);
    }
    return () => {
      if (manifest && previousManifest) manifest.href = previousManifest;
    };
  }, [pathname]);

  return (
    <ModuleApplicationShell
      moduleId="faultlinelab"
      moduleName="FaultlineLab"
      theme={FAULTLINELAB_THEME}
      currentPath={hrefFor(route.canonicalPath)}
      navigation={navigation}
      brand={<Link href={hrefFor('/')} className="faultline-brand"><span><FlaskConical size={21} /></span><strong>FaultlineLab</strong></Link>}
      organization={{ label: 'Organization', value: tenantLabel, testId: 'faultlinelab-tenant-badge' }}
      accessContext={{ label: 'Access', value: roleLabel, testId: 'faultlinelab-role-badge' }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2, testId: 'faultlinelab-return-command-center' },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound, testId: 'faultlinelab-profile' },
        { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'faultlinelab', page: route.canonicalPath }), icon: LifeBuoy, testId: 'faultlinelab-help' },
      ]}
      page={{ eyebrow: route.eyebrow, title: route.title, subtitle: route.subtitle, actions: pageAction, detailLabel: route.recordId ?? route.challengeId }}
      state={authLoading || tenantLoading ? 'loading' : !tenantId ? 'empty' : 'ready'}
      stateMessage={!tenantId ? 'Choose an organization in My Apps before opening tenant-scoped diagnostic work.' : undefined}
      pageHeaderTestId="faultlinelab-module-header"
      mobileNavigation="drawer"
      testId="faultlinelab-module-shell"
      dataAttributes={{ 'data-faultlinelab-route': route.area }}
    >
      <style>{routeCss}</style>
      {tenantId && route.area !== 'settings' && (
        <FaultlineLabWorkspace
          key={`${tenantId}-${route.area}-${route.recordId ?? route.challengeId ?? ''}`}
          view={route.area}
          recordId={route.recordId}
          challengeId={route.challengeId}
          hrefFor={hrefFor}
        />
      )}
      {tenantId && route.area === 'settings' && (
        <section className="faultline-settings" data-testid="faultlinelab-settings-route">
          <h2><Settings size={19} />Diagnostic workspace boundaries</h2>
          <p>FaultlineLab records training investigations and server-scored diagnostic work. It does not grant production access or issue certificates.</p>
          <SettingsRow label="Identity and tenancy" value="OperatorOS owns sign-in, entitlement, organization membership, and role authority." />
          <SettingsRow label="Execution boundary" value="Challenge commands are allowlisted simulations defined by published content; arbitrary host commands are unavailable." />
          <SettingsRow label="Evidence" value="Actions, submissions, scores, revisions, assignments, and private proof remain tenant-scoped and auditable." />
          <SettingsRow label="Authoring" value={canManage ? 'You can manage tenant challenge assignments and publication.' : 'Workspace managers control shared assignment and publication.'} />
          <div className="faultline-safety"><ShieldCheck size={17} />No certificate, production authorization, or live-system access is implied by a score.</div>
        </section>
      )}
    </ModuleApplicationShell>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return <div className="faultline-settings-row"><strong>{label}</strong><span>{value}</span></div>;
}

const routeCss = `
  [data-testid="faultlinelab-module-shell"] { box-sizing:border-box; width:100%; min-width:0; color-scheme:dark; }
  [data-testid="faultlinelab-module-shell"] *,[data-testid="faultlinelab-module-shell"] *:before,[data-testid="faultlinelab-module-shell"] *:after { box-sizing:border-box; min-width:0; }
  [data-testid="faultlinelab-module-shell"]:before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1; background:radial-gradient(circle at 13% -6%,rgba(139,92,246,.20),transparent 31rem),radial-gradient(circle at 92% 8%,rgba(34,211,238,.08),transparent 28rem); }
  .faultline-brand { display:flex; align-items:center; gap:10px; color:#f2efff; text-decoration:none; }
  .faultline-brand span { width:36px; height:36px; display:grid; place-items:center; border:1px solid #5b4288; border-radius:9px; color:#c4b5fd; background:#1d1533; transform:rotate(45deg); }
  .faultline-brand span svg { transform:rotate(-45deg); }
  .faultline-action { display:inline-flex; align-items:center; gap:7px; border:1px solid #5b4288; border-radius:8px; background:#281b48; color:#f2efff; padding:9px 12px; text-decoration:none; font-weight:800; }
  .faultline-route-state { min-height:180px; display:flex; align-items:center; justify-content:center; gap:9px; border:1px solid #382d57; border-radius:12px; background:#0d0b18; color:#aaa3c3; }
  .faultline-settings { display:grid; gap:12px; border:1px solid #382d57; border-radius:14px; background:#0d0b18; padding:20px; }
  .faultline-settings h2 { margin:0; display:flex; align-items:center; gap:9px; font-size:18px; }
  .faultline-settings p { margin:0; color:#aaa3c3; line-height:1.55; }
  .faultline-settings-row { display:grid; grid-template-columns:minmax(150px,.35fr) minmax(0,1fr); gap:12px; border-top:1px solid #382d57; padding-top:12px; }
  .faultline-settings-row span { color:#aaa3c3; line-height:1.5; }
  .faultline-safety { display:flex; align-items:flex-start; gap:9px; border:1px solid rgba(103,232,249,.3); border-radius:9px; background:rgba(14,116,144,.12); color:#a5f3fc; padding:12px; }
  @media(max-width:650px){.faultline-settings-row{grid-template-columns:1fr}.faultline-action{width:100%;justify-content:center}}
`;
