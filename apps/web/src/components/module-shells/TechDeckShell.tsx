'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  ExternalLink,
  FileCheck2,
  FileLock2,
  Gauge,
  Grid2X2,
  KeyRound,
  LifeBuoy,
  Network,
  ServerCog,
  Settings,
  ShieldCheck,
  TicketCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ModuleApplicationShell } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { useModuleAccessLevel } from '@/components/ModuleAccessContext';
import { getActiveTenantId } from '@/lib/auth';
import { hasPlatformAdminAuthority } from '../../../../../packages/auth/index.js';
import { createTechDeckAdapterContext } from '../../../../../apps/modules/techdeck/adapter.js';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import {
  TECHDECK_NAVIGATION,
  TECHDECK_THEME,
  resolveTechDeckRoute,
  type TechDeckRouteArea,
} from './TechDeckRoute.contract';

interface TechDeckShellProps {
  baseUrl?: string;
  routePath?: string;
}

function RouteLoading() {
  return <section className="techdeck-route-state" aria-busy="true"><Gauge size={18} />Loading this TechDeck route…</section>;
}

const TechDeckTicketQueue = dynamic(() => import('./TechDeckTicketQueue'), { loading: RouteLoading });
const TechDeckOperations = dynamic(() => import('./TechDeckOperations'), { loading: RouteLoading });
const TechDeckLiteralConsole = dynamic(() => import('./TechDeckLiteralConsole'), { loading: RouteLoading });
const TechDeckWorkdayBrief = dynamic(() => import('./TechDeckWorkdayBrief'), { loading: RouteLoading });
const BusinessDirectory = dynamic(() => import('./BusinessDirectory'), { loading: RouteLoading });

const overviewRoutes: Array<{ area: TechDeckRouteArea; label: string; summary: string; path: string; Icon: LucideIcon }> = [
  { area: 'tickets', label: 'Ticket queue', summary: 'Triage assignment, response deadlines, and technician ownership.', path: '/tickets', Icon: TicketCheck },
  { area: 'inventory', label: 'Managed assets', summary: 'Review client-linked configuration and current health.', path: '/assets', Icon: ServerCog },
  { area: 'network', label: 'Network / IPAM', summary: 'Map addresses, subnets, VLANs, and system relationships.', path: '/network', Icon: Network },
  { area: 'documentation', label: 'Documentation', summary: 'Maintain reviewed procedures and managed knowledge.', path: '/documentation', Icon: FileCheck2 },
  { area: 'evidence', label: 'Evidence', summary: 'Capture observations, snapshots, and test results.', path: '/evidence', Icon: FileLock2 },
  { area: 'reports', label: 'Reports', summary: 'Generate downloadable operations reports with recorded file checks.', path: '/reports', Icon: BarChart3 },
  { area: 'calendar', label: 'Service calendar', summary: 'Coordinate appointments and recurring work.', path: '/calendar', Icon: CalendarClock },
  { area: 'compliance', label: 'Compliance', summary: 'Run secure intake and create customer-ready compliance packages.', path: '/compliance', Icon: ShieldCheck },
];

const operationsAreas = new Set<TechDeckRouteArea>(['inventory', 'network', 'lifecycle', 'documentation', 'runbooks', 'evidence', 'reports', 'time']);
const literalAreas = new Set<TechDeckRouteArea>(['calendar', 'portal', 'licenses', 'status', 'compliance', 'webhooks', 'api-tokens']);

export default function TechDeckShell({ routePath }: TechDeckShellProps) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const fallbackTenantId = user?.currentTenantId ?? getActiveTenantId();
  const tenantId = activeTenant?.id ?? fallbackTenantId;
  const platformAdmin = hasPlatformAdminAuthority(user);
  const moduleAccessLevel = useModuleAccessLevel();
  const adapterRole = platformAdmin ? 'admin' : activeRole ?? 'member';
  const route = resolveTechDeckRoute(routePath || pathname);
  const sourceRouted = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback(
    (path: string) => sourceRouted ? `/modules/techdeck${path === '/' ? '/dashboard' : path}` : path,
    [sourceRouted],
  );
  const navigation = useMemo(() => TECHDECK_NAVIGATION.map(group => ({
    ...group,
    items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
  })), [hrefFor]);

  const adapter = useMemo(() => createTechDeckAdapterContext({
    currentUser: user ? {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
    } : null,
    tenantId,
    role: adapterRole,
    entitlements: { modules: [{ slug: 'techdeck', enabled: true }] },
    platformAdmin,
  }), [adapterRole, platformAdmin, tenantId, user]);

  const isLoading = authLoading || tenantLoading;
  const hasTenantContext = !!adapter.tenantId;
  const tenantLabel = activeTenant?.name ?? (adapter.tenantId ? 'Selected organization' : 'No organization selected');
  const canWriteModule = platformAdmin || (activeRole !== 'viewer' && (moduleAccessLevel
    ? moduleAccessLevel === 'user' || moduleAccessLevel === 'manager'
    : Boolean(activeRole)));
  const canManageModule = canWriteModule && (platformAdmin || activeRole === 'owner' || activeRole === 'admin');
  const roleLabel = platformAdmin
    ? 'Platform administrator'
    : !canWriteModule
      ? 'Read-only access'
      : activeRole === 'owner'
        ? 'Organization owner'
        : activeRole === 'admin'
          ? 'Organization administrator'
          : moduleAccessLevel === 'manager'
            ? 'TechDeck manager'
            : 'Technician';

  const pageAction = route.area === 'tickets'
    ? null
    : route.area === 'settings' && platformAdmin
      ? <Link className="techdeck-action" href={`${DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}app/platform/modules/techdeck`}><ExternalLink size={15} />Platform settings</Link>
      : <Link className="techdeck-action" href={hrefFor('/tickets')}><TicketCheck size={15} />Open ticket queue</Link>;

  return (
    <ModuleApplicationShell
      moduleId="techdeck"
      moduleName="TechDeck"
      theme={TECHDECK_THEME}
      currentPath={hrefFor(route.canonicalPath)}
      navigation={navigation}
      brand={(
        <Link href={hrefFor('/')} className="techdeck-brand">
          <span><ServerCog size={21} /></span><strong>TechDeck</strong>
        </Link>
      )}
      organization={{ label: 'Organization', value: tenantLabel, testId: 'techdeck-tenant-badge' }}
      accessContext={{ label: 'Access', value: roleLabel, testId: 'techdeck-role-badge' }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2, testId: 'techdeck-return-command-center' },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound, testId: 'techdeck-profile' },
        { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'techdeck', page: route.canonicalPath }), icon: LifeBuoy, testId: 'techdeck-help' },
      ]}
      page={{ eyebrow: route.eyebrow, title: route.title, subtitle: route.subtitle, actions: pageAction, detailLabel: route.recordId }}
      state={isLoading ? 'loading' : !hasTenantContext ? 'empty' : 'ready'}
      stateMessage={!hasTenantContext ? 'Choose an organization in My Apps before opening its TechDeck service work.' : undefined}
      pageHeaderTestId="techdeck-module-header"
      mobileNavigation="drawer"
      testId="techdeck-module-shell"
      dataAttributes={{ 'data-techdeck-route': route.area }}
    >
      <style>{techDeckRouteCss}</style>
      {hasTenantContext && adapter.tenantId && (
        <>
          {route.area === 'overview' && (
            <section className="techdeck-overview" id="techdeck-overview" data-testid="techdeck-overview-route">
              <TechDeckWorkdayBrief tenantKey={adapter.tenantId} hrefFor={hrefFor} />
              <div className="techdeck-readiness" aria-label="TechDeck readiness">
                <Metric label="Sign-in" value="Protected" Icon={ShieldCheck} />
                <Metric label="Client records" value="Organization-only" Icon={Building2} />
                <Metric label="Team access" value="Role-based" Icon={KeyRound} />
                <Metric label="Activity history" value="Recorded" Icon={Activity} />
              </div>
              <div className="techdeck-route-grid">
                {overviewRoutes.map(item => (
                  <Link key={item.area} href={hrefFor(item.path)} className="techdeck-route-card" data-testid={`techdeck-overview-${item.area}`}>
                    <item.Icon size={19} /><strong>{item.label}</strong><span>{item.summary}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {route.area === 'tickets' && user && (
            <section id="techdeck-ticket-queue" data-testid="techdeck-ticket-queue-panel">
              <TechDeckTicketQueue key={adapter.tenantId} currentUserId={user.id} canWriteTickets={canWriteModule} canManageTickets={canManageModule} tenantKey={adapter.tenantId} recordId={route.recordId} />
            </section>
          )}

          {route.area === 'directory' && (
            <section id="techdeck-directory" data-testid="techdeck-directory-route">
              <BusinessDirectory moduleSlug="techdeck" tenantKey={adapter.tenantId} canWrite={canWriteModule} canArchive={canManageModule} />
            </section>
          )}

          {operationsAreas.has(route.area) && (
            <TechDeckOperations
              key={`ops-${adapter.tenantId}-${route.area}`}
              tenantKey={adapter.tenantId}
              canWrite={canWriteModule}
              canApprove={canManageModule}
              area={route.area as 'inventory' | 'network' | 'lifecycle' | 'documentation' | 'runbooks' | 'evidence' | 'reports' | 'time'}
              recordId={route.recordId}
            />
          )}

          {literalAreas.has(route.area) && (
            <TechDeckLiteralConsole
              key={`literal-${adapter.tenantId}-${route.area}`}
              tenantKey={adapter.tenantId}
              canWrite={canWriteModule}
              canManage={canManageModule}
              area={route.area as 'calendar' | 'portal' | 'licenses' | 'status' | 'compliance' | 'webhooks' | 'api-tokens'}
            />
          )}

          {route.area === 'settings' && (
            <section id="techdeck-settings" className="techdeck-settings" data-testid="techdeck-settings-panel">
              <h2><Settings size={19} />Access and settings</h2>
              <p>{canManageModule ? 'You can manage this workspace because you are an organization administrator.' : 'Your organization administrator controls team access and workspace settings.'}</p>
              <SettingsRow label="Identity and access" value="OperatorOS manages sign-in, subscription access, roles, and workspace membership." />
              <SettingsRow label="Managed operations" value="TechDeck keeps technical documentation, infrastructure records, service evidence, and support work with the correct organization." />
              <SettingsRow label="Command boundary" value="Runbooks remain documentation-only. The public TechDeck application does not execute arbitrary commands." />
            </section>
          )}
        </>
      )}
    </ModuleApplicationShell>
  );
}

function Metric({ label, value, Icon }: { label: string; value: string; Icon: LucideIcon }) {
  return <div className="techdeck-metric"><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>;
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return <div className="techdeck-settings-row"><strong>{label}</strong><span>{value}</span></div>;
}

const techDeckRouteCss = `
  [data-testid="techdeck-module-shell"] { box-sizing:border-box; width:100%; min-width:0; }
  [data-testid="techdeck-module-shell"] *,[data-testid="techdeck-module-shell"] *:before,[data-testid="techdeck-module-shell"] *:after { box-sizing:border-box; min-width:0; }
  [data-testid="techdeck-module-shell"]:before { content:""; position:fixed; inset:0; z-index:-1; pointer-events:none; background:radial-gradient(circle at 12% 0%,rgba(56,189,248,.14),transparent 30rem),repeating-linear-gradient(90deg,transparent 0 89px,rgba(56,189,248,.018) 90px 91px); }
  .techdeck-brand { display:flex; align-items:center; gap:10px; color:#e5eefc; text-decoration:none; }
  .techdeck-brand>span { width:38px; height:38px; display:grid; place-items:center; color:#38bdf8; border:1px solid rgba(56,189,248,.42); border-radius:7px; background:#08111e; box-shadow:inset 0 0 18px rgba(56,189,248,.09); }
  .techdeck-brand strong { font:900 16px ui-monospace,"Cascadia Code",monospace; letter-spacing:.03em; }
  .techdeck-action { display:inline-flex; align-items:center; gap:7px; border:1px solid rgba(56,189,248,.38); background:#0c4a6e; color:#e0f2fe; border-radius:6px; padding:9px 12px; font-size:13px; font-weight:850; text-decoration:none; }
  .techdeck-action:focus-visible,.techdeck-route-card:focus-visible { outline:2px solid #7dd3fc; outline-offset:3px; }
  .techdeck-overview { display:grid; gap:18px; }
  .techdeck-readiness { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
  .techdeck-metric,.techdeck-route-card,.techdeck-settings { border:1px solid #263348; background:linear-gradient(145deg,#0d1320,#080d16); border-radius:8px; }
  .techdeck-metric { padding:15px; display:grid; gap:7px; }
  .techdeck-metric svg { color:#22c55e; }
  .techdeck-metric span { color:#8fa3bd; font-size:12px; }
  .techdeck-metric strong { color:#e5eefc; font-size:15px; }
  .techdeck-route-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .techdeck-route-card { padding:17px; display:grid; grid-template-columns:auto 1fr; gap:7px 10px; color:#e5eefc; text-decoration:none; transition:border-color .16s ease,transform .16s ease; }
  .techdeck-route-card:hover { border-color:#38bdf8; transform:translateY(-1px); }
  .techdeck-route-card svg { grid-row:1/3; color:#38bdf8; }
  .techdeck-route-card strong { font-size:14px; }
  .techdeck-route-card span { color:#8fa3bd; font-size:12px; line-height:1.5; }
  .techdeck-route-state { min-height:160px; display:flex; align-items:center; justify-content:center; gap:9px; color:#8fa3bd; border:1px solid #263348; background:#0d1320; border-radius:8px; }
  .techdeck-workday-state { min-height:220px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; padding:18px; border:1px solid #263348; background:#080d16; border-radius:12px; }
  .techdeck-workday-state span { min-height:90px; border:1px solid #263348; border-radius:8px; background:#0d1320; }
  .techdeck-workday-error { display:flex; align-items:center; gap:9px; padding:13px; border:1px solid rgba(251,113,133,.45); border-radius:8px; background:#0d1320; color:#fecdd3; }
  .techdeck-workday-error a { margin-left:auto; color:#7dd3fc; }
  .techdeck-settings { padding:20px; display:grid; gap:12px; }
  .techdeck-settings h2 { display:flex; align-items:center; gap:9px; margin:0; font-size:18px; }
  .techdeck-settings h2 svg { color:#38bdf8; }
  .techdeck-settings>p { color:#8fa3bd; margin:0 0 4px; line-height:1.55; }
  .techdeck-settings-row { display:grid; gap:5px; padding:13px; border-left:2px solid rgba(56,189,248,.5); background:#080d16; }
  .techdeck-settings-row strong { color:#e5eefc; font-size:13px; }
  .techdeck-settings-row span { color:#8fa3bd; font-size:12px; line-height:1.5; }
  .techdeck-panel { border:1px solid #263348; background:#0d1320; border-radius:8px; }
  @media(max-width:900px){.techdeck-readiness{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:640px){.techdeck-readiness,.techdeck-route-grid,.techdeck-workday-state{grid-template-columns:1fr}.techdeck-action{width:100%;justify-content:center}.techdeck-workday-error{align-items:flex-start;flex-direction:column}.techdeck-workday-error a{margin-left:0}}
`;
