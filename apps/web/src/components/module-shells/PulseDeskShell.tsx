'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  ClipboardList,
  ExternalLink,
  Grid2X2,
  HeartPulse,
  Inbox,
  LifeBuoy,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ModuleApplicationShell } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { hasPlatformAdminAuthority } from '../../../../../packages/auth/index.js';
import { createPulseDeskAdapterContext } from '../../../../../apps/modules/pulsedesk/adapter.js';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import {
  PULSEDESK_NAVIGATION,
  PULSEDESK_THEME,
  resolvePulseDeskRoute,
  type PulseDeskRouteArea,
} from './PulseDeskRoute.contract';

interface PulseDeskShellProps {
  baseUrl?: string;
  routePath?: string;
}

function RouteLoading() {
  return <section className="pulsedesk-route-state" aria-busy="true"><Activity size={18} />Loading this PulseDesk route…</section>;
}

const PulseDeskServiceDeskWorkspace = dynamic(() => import('./PulseDeskServiceDeskWorkspace'), { loading: RouteLoading });
const PulseDeskDepartmentEscalationQueue = dynamic(() => import('./PulseDeskDepartmentEscalationQueue'), { loading: RouteLoading });
const PulseDeskConnectorConsole = dynamic(() => import('./PulseDeskConnectorConsole'), { loading: RouteLoading });
const BusinessDirectory = dynamic(() => import('./BusinessDirectory'), { loading: RouteLoading });

const overviewRoutes: Array<{ area: PulseDeskRouteArea; path: string; label: string; summary: string; Icon: LucideIcon }> = [
  { area: 'requests', path: '/requests', label: 'Requests', summary: 'Triage and progress PHI-minimized operational work.', Icon: ClipboardList },
  { area: 'assignments', path: '/assignments', label: 'Assignments', summary: 'Coordinate department routing and escalations.', Icon: UsersRound },
  { area: 'contacts', path: '/contacts', label: 'Facilities and contacts', summary: 'Use the authorized operational directory.', Icon: Building2 },
  { area: 'operations', path: '/operations', label: 'Facility operations', summary: 'Coordinate equipment, supplies, and physical facilities.', Icon: Stethoscope },
  { area: 'inbound', path: '/inbound', label: 'Inbound communication', summary: 'Review authorized mailbox delivery and intake state.', Icon: Inbox },
  { area: 'analytics', path: '/analytics', label: 'Analytics', summary: 'Review demand, SLA pressure, and service health.', Icon: BarChart3 },
];

const serviceView: Partial<Record<PulseDeskRouteArea, 'dashboard' | 'tickets' | 'operations' | 'knowledge' | 'admin'>> = {
  overview: 'dashboard', requests: 'tickets', operations: 'operations', analytics: 'dashboard', knowledge: 'knowledge', settings: 'admin',
};

export default function PulseDeskShell({ routePath }: PulseDeskShellProps) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const fallbackTenantId = user?.currentTenantId ?? getActiveTenantId();
  const tenantId = activeTenant?.id ?? fallbackTenantId;
  const platformAdmin = hasPlatformAdminAuthority(user);
  const adapterRole = platformAdmin ? 'admin' : activeRole ?? 'member';
  const route = resolvePulseDeskRoute(routePath || pathname);
  const sourceRouted = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback(
    (path: string) => sourceRouted ? `/modules/pulsedesk${path === '/' ? '/dashboard' : path}` : path,
    [sourceRouted],
  );
  const navigation = useMemo(() => PULSEDESK_NAVIGATION.map(group => ({
    ...group,
    items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
  })), [hrefFor]);

  const adapter = useMemo(() => createPulseDeskAdapterContext({
    currentUser: user ? { id: user.id, email: user.email, name: user.name, platformRole: user.platformRole } : null,
    tenantId,
    role: adapterRole,
    entitlements: { modules: [{ slug: 'pulsedesk', enabled: true }] },
    platformAdmin,
  }), [adapterRole, platformAdmin, tenantId, user]);

  const isLoading = authLoading || tenantLoading;
  const hasTenantContext = !!adapter.tenantId;
  const canManageModule = platformAdmin || activeRole === 'owner' || activeRole === 'admin';
  const restrictedProviderRoute = (route.area === 'inbound' || route.area === 'integrations') && !canManageModule;
  const roleLabel = platformAdmin
    ? 'Platform administrator'
    : activeRole === 'owner'
      ? 'Organization owner'
      : activeRole === 'admin'
        ? 'Organization administrator'
        : activeRole === 'viewer'
          ? 'Read-only access'
          : 'Team member';
  const tenantLabel = activeTenant?.name ?? adapter.tenantId ?? 'No organization selected';
  const activeServiceView = serviceView[route.area];

  const pageAction = route.area === 'requests'
    ? null
    : route.area === 'settings' && platformAdmin
      ? <Link className="pulsedesk-action" href={`${DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}app/platform/modules/pulsedesk`}><ExternalLink size={15} />Platform settings</Link>
      : <Link className="pulsedesk-action" href={hrefFor('/requests')}><ClipboardList size={15} />Open request queue</Link>;

  return (
    <ModuleApplicationShell
      moduleId="pulsedesk"
      moduleName="PulseDesk"
      theme={PULSEDESK_THEME}
      currentPath={hrefFor(route.canonicalPath)}
      navigation={navigation}
      brand={(
        <Link href={hrefFor('/')} className="pulsedesk-brand">
          <span><HeartPulse size={21} /></span><strong>PulseDesk</strong>
        </Link>
      )}
      organization={{ label: 'Organization', value: tenantLabel, testId: 'pulsedesk-tenant-badge' }}
      accessContext={{ label: 'Access', value: roleLabel, testId: 'pulsedesk-role-badge' }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2, testId: 'pulsedesk-return-command-center' },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound, testId: 'pulsedesk-profile' },
        { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'pulsedesk', page: route.canonicalPath }), icon: LifeBuoy, testId: 'pulsedesk-help' },
      ]}
      page={{ eyebrow: route.eyebrow, title: route.title, subtitle: route.subtitle, actions: pageAction, detailLabel: route.recordId }}
      state={isLoading ? 'loading' : !hasTenantContext ? 'empty' : restrictedProviderRoute ? 'forbidden' : 'ready'}
      stateMessage={!hasTenantContext
        ? 'Choose an organization in My Apps before opening tenant-scoped PulseDesk work.'
        : restrictedProviderRoute
          ? 'An organization administrator must review inbound provider configuration and delivery state.'
          : undefined}
      pageHeaderTestId="pulsedesk-module-header"
      mobileNavigation="drawer"
      testId="pulsedesk-module-shell"
      dataAttributes={{ 'data-pulsedesk-route': route.area }}
    >
      <style>{pulseDeskRouteCss}</style>
      {hasTenantContext && adapter.tenantId && !restrictedProviderRoute && (
        <>
          {route.area === 'overview' && (
            <section className="pulsedesk-route-grid" id="pulsedesk-overview" data-testid="pulsedesk-overview-route">
              {overviewRoutes.map(item => (
                <Link key={item.area} href={hrefFor(item.path)} className="pulsedesk-route-card" data-testid={`pulsedesk-overview-${item.area}`}>
                  <item.Icon size={19} /><strong>{item.label}</strong><span>{item.summary}</span>
                </Link>
              ))}
            </section>
          )}

          {activeServiceView && (
            <section
              id={route.area === 'requests' ? 'pulsedesk-operations' : route.area === 'settings' ? 'pulsedesk-settings-workflow' : route.area === 'overview' ? 'pulsedesk-overview-dashboard' : `pulsedesk-${route.area}`}
              data-testid={route.area === 'overview' ? 'pulsedesk-overview-dashboard' : `pulsedesk-${route.area}-route`}
            >
              <PulseDeskServiceDeskWorkspace
                key={`${adapter.tenantId}-${route.area}`}
                tenantKey={adapter.tenantId}
                canManageModule={canManageModule}
                view={activeServiceView}
                requestHref={id => hrefFor(`/requests/${id}`)}
              />
            </section>
          )}

          {route.area === 'assignments' && (
            <section id="pulsedesk-assignments" className="pulsedesk-route-panel" data-testid="pulsedesk-assignments-route">
              <PulseDeskDepartmentEscalationQueue key={`department-queue-${adapter.tenantId}`} tenantKey={adapter.tenantId} />
            </section>
          )}

          {route.area === 'contacts' && (
            <section id="pulsedesk-directory" data-testid="pulsedesk-contacts-route">
              <div className="pulsedesk-boundary"><ShieldCheck size={17} /><span><strong>Operational directory only.</strong> Do not store patient charts, clinical records, diagnoses, or unnecessary PHI.</span></div>
              <BusinessDirectory moduleSlug="pulsedesk" tenantKey={adapter.tenantId} canArchive={canManageModule} />
            </section>
          )}

          {(route.area === 'inbound' || route.area === 'integrations') && canManageModule && (
            <section data-testid={`pulsedesk-${route.area}-route`}>
              <PulseDeskConnectorConsole key={`${adapter.tenantId}-${route.area}`} mode={route.area} />
            </section>
          )}

          {route.area === 'settings' && (
            <section id="pulsedesk-settings" className="pulsedesk-settings" data-testid="pulsedesk-settings-panel">
              <h2><Settings size={19} />Healthcare operations boundary</h2>
              <p>PulseDesk coordinates operational work. It is not a patient chart, EHR, clinical record, medical device, or HIPAA certification claim.</p>
              <SettingsRow label="Identity and access" value="OperatorOS manages sign-in, entitlements, tenant selection, roles, and membership." />
              <SettingsRow label="Data minimization" value="Requests and integrations must remain operational and exclude patient names, MRNs, diagnoses, treatment details, and other unnecessary PHI." />
              <SettingsRow label="Integration authority" value="Only organization administrators can configure inbound providers. Live modes fail closed until their provider checks pass." />
            </section>
          )}
        </>
      )}
    </ModuleApplicationShell>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return <div className="pulsedesk-settings-row"><strong>{label}</strong><span>{value}</span></div>;
}

const pulseDeskRouteCss = `
  [data-testid="pulsedesk-module-shell"] { box-sizing:border-box; width:100%; min-width:0; color-scheme:dark; }
  [data-testid="pulsedesk-module-shell"] *,[data-testid="pulsedesk-module-shell"] *:before,[data-testid="pulsedesk-module-shell"] *:after { box-sizing:border-box; min-width:0; }
  [data-testid="pulsedesk-module-shell"]:before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1; background:radial-gradient(circle at 10% -4%,rgba(56,189,248,.18),transparent 31rem),radial-gradient(circle at 90% 4%,rgba(74,222,128,.07),transparent 27rem); }
  .pulsedesk-brand { display:flex; align-items:center; gap:10px; color:#eaf4ff; text-decoration:none; }
  .pulsedesk-brand>span { width:40px; height:40px; display:grid; place-items:center; color:#4ade80; border:1px solid rgba(56,189,248,.42); border-radius:10px; background:#0b2232; }
  .pulsedesk-brand strong { font-size:16px; font-weight:900; }
  .pulsedesk-action { display:inline-flex; align-items:center; gap:7px; border:1px solid rgba(56,189,248,.42); background:#075985; color:#e0f2fe; border-radius:8px; padding:9px 12px; font-size:13px; font-weight:850; text-decoration:none; }
  .pulsedesk-action:focus-visible,.pulsedesk-route-card:focus-visible { outline:2px solid #7dd3fc; outline-offset:3px; }
  .pulsedesk-route-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
  .pulsedesk-route-card { display:grid; grid-template-columns:auto 1fr; gap:7px 11px; padding:18px; border:1px solid #29445a; border-radius:12px; color:#eaf4ff; text-decoration:none; background:linear-gradient(145deg,#0e1a27,#0a1722); }
  .pulsedesk-route-card:hover { border-color:#38bdf8; }
  .pulsedesk-route-card svg { grid-row:1/3; color:#4ade80; }
  .pulsedesk-route-card span { color:#9bb0c6; font-size:12px; line-height:1.5; }
  .pulsedesk-route-state { min-height:170px; display:flex; align-items:center; justify-content:center; gap:9px; border:1px solid #29445a; border-radius:10px; background:#0e1a27; color:#9bb0c6; }
  .pulsedesk-route-panel { border:1px solid #29445a; border-radius:10px; background:#0e1a27; padding:18px; }
  .pulsedesk-route-panel .pdq-heading { grid-template-columns:1fr; }
  .pulsedesk-route-panel .pdq-metrics { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .pulsedesk-route-panel .pdq-filters { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .pulsedesk-route-panel .pdq-workspace { grid-template-columns:1fr; }
  .pulsedesk-boundary { display:flex; align-items:flex-start; gap:10px; margin-bottom:14px; padding:12px; border:1px solid rgba(251,191,36,.35); border-radius:9px; color:#fde68a; background:rgba(120,53,15,.18); font-size:13px; line-height:1.5; }
  .pulsedesk-settings { border:1px solid #29445a; background:#0e1a27; border-radius:10px; padding:19px; display:grid; gap:12px; margin-top:16px; }
  .pulsedesk-settings h2 { margin:0; display:flex; align-items:center; gap:9px; color:#eaf4ff; font-size:18px; }
  .pulsedesk-settings h2 svg { color:#4ade80; }
  .pulsedesk-settings>p { margin:0; color:#9bb0c6; line-height:1.55; }
  .pulsedesk-settings-row { display:grid; gap:5px; padding:12px; border-left:2px solid #38bdf8; background:#091622; }
  .pulsedesk-settings-row strong { color:#eaf4ff; font-size:13px; }
  .pulsedesk-settings-row span { color:#9bb0c6; font-size:12px; line-height:1.5; }
  [data-testid="pulsedesk-module-shell"] :is(input,select,textarea) { color-scheme:dark; background:#0a1520!important; color:#eaf4ff!important; border-color:#29445a!important; }
  [data-testid="pulsedesk-module-shell"] :is(input,select,textarea)::placeholder { color:#6e849b; }
  [data-testid="pulsedesk-module-shell"] :is(.pds,.pdq-root,.directory-root,.pdc) { color:#eaf4ff; }
  [data-testid="pulsedesk-module-shell"] :is(.pds,.pdq-root,.directory-root,.pdc) :is(h2,h3,h4,strong,summary) { color:#eaf4ff; }
  [data-testid="pulsedesk-module-shell"] :is(.pds-card,.pds-metrics article,.pds-ticket,.pds-row-button,.pdq-intake,.pdq-departments,.pdq-list,.pdq-detail,.pdq-card,.pdq-manager-controls,.pdq-timeline,.directory-root,.pdc,.pdc article) { background:#0e1a27!important; color:#eaf4ff!important; border-color:#29445a!important; }
  [data-testid="pulsedesk-module-shell"] :is(.pdq-metric,.pdq-warning,.pdq-error,.pdq-success,.pdq-inline-error,.pdq-assignee-error,.pdq-department-list>div,.pdq-detail-heading dl>div,.pdq-skeleton) { background:#132536!important; color:#eaf4ff!important; border-color:#29445a!important; }
  [data-testid="pulsedesk-module-shell"] :is(.pds-form,.pds-empty,.pds-config div,.pds-message,.pds-chips span,.pds-route-context,.pdq-filters,.pdq-empty,.pdq-detail-empty,.pdq-department-body,.pdq-timeline-empty,.pdc-notice) { background:#132536!important; color:#9bb0c6!important; border-color:#29445a!important; }
  [data-testid="pulsedesk-module-shell"] :is(.pds-ticket.selected,.pdq-card[aria-pressed='true']) { background:rgba(56,189,248,.10)!important; border-color:#38bdf8!important; }
  [data-testid="pulsedesk-module-shell"] :is(.pds-secondary,.pdq-secondary) { background:#132536!important; color:#eaf4ff!important; border-color:#29445a!important; }
  [data-testid="pulsedesk-module-shell"] :is(.pds-heading p,.pds-row small,.pds-ticket small,.pds-description,.pds-config span,.pdq-heading p,.pdq-card-context,.pdq-card-footer,.pdc article span,.pdc article small,.pdc header p) { color:#9bb0c6!important; }
  [data-testid="pulsedesk-module-shell"] :is(.pdc header span,.pdc-empty) { color:#b9cada!important; }
  [data-testid="pulsedesk-module-shell"] :is(.pds-metrics span,.pds-row-button small) { color:#9bb0c6!important; }
  [data-testid="pulsedesk-module-shell"] :is(.pds-check,.pds-toggle,.pds-row p,.pds-message small) { color:#b9cada!important; }
  [data-testid="pulsedesk-module-shell"] .pds-ticket > button { color:#eaf4ff!important; }
  [data-testid="pulsedesk-module-shell"] .pdq-root button { background:#0369a1!important; border-color:#0369a1!important; color:#fff!important; }
  [data-testid="pulsedesk-module-shell"] .pdq-root :is(.pdq-eyebrow,.pdq-card h3>span,.pdq-detail-heading h3,.pdq-form-title>svg,.pdq-search>svg) { color:#7dd3fc!important; }
  [data-testid="pulsedesk-module-shell"] .pdq-root :is(.pdq-metric span,.pdq-form-title span,.pdq-intake label>span,.pdq-manager-controls label>span,.pdq-department-body label>span,.pdq-checkbox span,.pdq-departments summary>small,.pdq-department-list span:nth-child(3),.pdq-card-footer>span,.pdq-detail-heading dt,.pdq-detail-heading dd,.pdq-timeline li span,.pdq-timeline li small,.pdq-wide small) { color:#b9cada!important; }
  [data-testid="pulsedesk-module-shell"] .pdq-root :is(.pdq-metric-blue strong) { color:#7dd3fc!important; }
  [data-testid="pulsedesk-module-shell"] .pdq-root :is(.pdq-metric-amber strong,.pdq-warning,.pdq-warning strong) { color:#fde68a!important; }
  [data-testid="pulsedesk-module-shell"] .pdq-root :is(.pdq-metric-red strong,.pdq-error,.pdq-inline-error,.pdq-assignee-error) { color:#fecaca!important; }
  [data-testid="pulsedesk-module-shell"] .pdq-root .pdq-success { color:#bbf7d0!important; }
  [data-testid="pulsedesk-module-shell"] .pds-route-label { margin:0; color:#eaf4ff; font-size:15px; text-transform:capitalize; }
  [data-testid="pulsedesk-module-shell"] .pds-warning { background:rgba(120,53,15,.22); border-color:rgba(251,191,36,.4); color:#fde68a; }
  [data-testid="pulsedesk-module-shell"] .pds-warning strong { color:#fef3c7!important; }
  [data-testid="pulsedesk-module-shell"] .pds-row-button { text-decoration:none; }
  [data-testid="pulsedesk-module-shell"] .directory-pulsedesk { --d-bg:#0a1520;--d-panel:#132536;--d-text:#eaf4ff;--d-muted:#9bb0c6;--d-border:#29445a;--d-accent:#38bdf8;--d-danger:#fb7185; }
  [data-testid="pulsedesk-module-shell"] .directory-tabs button[aria-selected='true'] { color:#07111b!important; }
  @media(max-width:1100px){#pulsedesk-directory .directory-layout{grid-template-columns:1fr}#pulsedesk-directory .directory-list{max-height:320px}}
  @media(max-width:720px){.pulsedesk-route-grid{grid-template-columns:1fr}.pulsedesk-action{width:100%;justify-content:center}#pulsedesk-directory .directory-columns{grid-template-columns:1fr}}
`;
