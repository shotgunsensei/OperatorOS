'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  ContactRound,
  CreditCard,
  FileText,
  GitBranch,
  Grid2X2,
  LifeBuoy,
  ListChecks,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Moon,
  PhoneCall,
  Sun,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ModuleApplicationShell, type ModuleShellClassNames } from '@/components/module-application-shell';
import { useAuth } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { hasPlatformAdminAuthority } from '../../../../../packages/auth/index.js';
import { createTradeFlowKitAdapterContext } from '../../../../../apps/modules/tradeflowkit/adapter.js';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import TradeFlowKitLeadCenter from './TradeFlowKitLeadCenter';
import TradeFlowKitRevenueFlow, { type TradeFlowKitRevenueView } from './TradeFlowKitRevenueFlow';
import TradeFlowKitOperations, { type TradeFlowKitOperationsView } from './TradeFlowKitOperations';
import TradeFlowKitWorkManagement from './TradeFlowKitWorkManagement';
import TradeFlowKitGlobalSearch from './TradeFlowKitGlobalSearch';
import TradeFlowKitTrash from './TradeFlowKitTrash';
import BusinessDirectory from './BusinessDirectory';
import {
  TRADEFLOWKIT_MOBILE_ROUTE_IDS,
  TRADEFLOWKIT_NAVIGATION,
  TRADEFLOWKIT_THEME,
  type TradeFlowKitCapability,
  type TradeFlowKitRole,
} from './TradeFlowKitShell.contract';
import styles from './TradeFlowKitShell.module.css';

interface TradeFlowKitShellProps {
  baseUrl?: string;
  routePath?: string;
}

type TradeFlowKitScreen =
  | 'dashboard'
  | 'leads'
  | 'customers'
  | 'jobs'
  | 'workflows'
  | 'tasks'
  | 'recurring'
  | 'activity'
  | 'quotes'
  | 'invoices'
  | 'payments'
  | 'analytics'
  | 'directory'
  | 'trash'
  | 'settings'
  | 'subscription'
  | 'call-recovery'
  | 'admin'
  | 'access-denied';

interface RouteState {
  screen: TradeFlowKitScreen;
  recordId?: string;
  intent?: 'new';
}

const shellClasses: Partial<ModuleShellClassNames> = {
  shell: styles.shell,
  workspace: styles.workspace,
  sideRail: styles.sidebar,
  brand: styles.brand,
  contextChip: styles.tenantCard,
  navGroup: styles.navGroup,
  navLabel: styles.navLabel,
  navLink: styles.navLink,
  navLinkActive: styles.navLinkActive,
  railFooter: styles.sidebarFoot,
  content: styles.content,
  topbar: styles.topbar,
  breadcrumbs: styles.crumbs,
  topActions: styles.topActions,
  page: styles.page,
  pageHeader: styles.pageHeader,
  eyebrow: styles.eyebrow,
  stateCard: styles.stateCard,
  mobileNav: styles.mobileNav,
  mobileNavLink: '',
  mobileNavLinkActive: styles.navLinkActive,
};

const pageCopy: Record<TradeFlowKitScreen, { eyebrow: string; title: string; description: string }> = {
  dashboard: {
    eyebrow: 'Service management overview',
    title: 'Dashboard',
    description: 'Move leads into customers, jobs, quotes, invoices, payments, and a clear collection state for this organization.',
  },
  leads: {
    eyebrow: 'Sales pipeline',
    title: 'Leads',
    description: 'Capture, qualify, follow up, and convert service opportunities into customers and numbered jobs.',
  },
  customers: {
    eyebrow: 'Customer records',
    title: 'Customers',
    description: 'Manage persisted customer profiles and follow their linked work and revenue history.',
  },
  jobs: {
    eyebrow: 'Field operations',
    title: 'Jobs',
    description: 'Schedule and update real jobs, coordinate tasks, and keep the workflow stage current.',
  },
  workflows: {
    eyebrow: 'Workflow studio',
    title: 'Workflows',
    description: 'Define reusable job and task stages, then move active work through the approved delivery process.',
  },
  tasks: {
    eyebrow: 'Team execution',
    title: 'Team tasks',
    description: 'Search and update the job-scoped work assigned across this organization without losing record context.',
  },
  recurring: {
    eyebrow: 'Scheduled automation',
    title: 'Recurring jobs',
    description: 'Create, pause, resume, and review repeat work enqueued by the shared audited scheduler.',
  },
  activity: {
    eyebrow: 'Operational history',
    title: 'Activity',
    description: 'Review tenant-scoped job, task, recurring-work, and workflow changes recorded by TradeFlowKit.',
  },
  quotes: {
    eyebrow: 'Revenue documents',
    title: 'Quotes',
    description: 'Create, edit, send, and track customer quotes backed by the TradeFlowKit revenue ledger.',
  },
  invoices: {
    eyebrow: 'Billing operations',
    title: 'Invoices',
    description: 'Issue invoices, record authoritative payment history, and share secure customer documents.',
  },
  payments: {
    eyebrow: 'Business payments',
    title: 'Payments',
    description: 'Review invoice balances and record customer payments without mixing them with OperatorOS billing.',
  },
  analytics: {
    eyebrow: 'Operational reporting',
    title: 'Analytics',
    description: 'Use persisted lead, job, task, invoice, and collection totals to understand current performance.',
  },
  directory: {
    eyebrow: 'Connected workspace',
    title: 'Business Directory',
    description: 'Reuse tenant-scoped organizations, contacts, and sites across TradeFlowKit workflows.',
  },
  trash: {
    eyebrow: 'Retention workspace',
    title: 'Trash',
    description: 'Review and restore retained business records without bypassing record dependencies.',
  },
  settings: {
    eyebrow: 'Workspace configuration',
    title: 'Settings',
    description: 'Configure operating defaults, lead intake, and provider readiness under OperatorOS authority.',
  },
  subscription: {
    eyebrow: 'OperatorOS commercial authority',
    title: 'Subscription',
    description: 'Review the organization plan, module access, invoices, and subscription changes in OperatorOS.',
  },
  'call-recovery': {
    eyebrow: 'Connected customer recovery',
    title: 'Call recovery',
    description: 'Continue missed-call recovery through the tenant-scoped OutCall companion application.',
  },
  admin: {
    eyebrow: 'Shared platform administration',
    title: 'Administration',
    description: 'Manage organization membership and platform controls through the authoritative OperatorOS console.',
  },
  'access-denied': {
    eyebrow: 'Access boundary',
    title: 'Access denied',
    description: 'OperatorOS could not validate the required organization or module authority for this request.',
  },
};

function operatorConsolePageUrl(page: string): string {
  const url = new URL(DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl);
  url.searchParams.set('page', page);
  return url.toString();
}

function resolveRoute(routePath?: string): RouteState {
  const clean = (routePath || '/dashboard').split('?')[0].replace(/^\/modules\/tradeflowkit/, '') || '/dashboard';
  const segments = clean.split('/').filter(Boolean);
  const resource = segments[0] || 'dashboard';
  const recordId = segments.length > 1 && segments[1] !== 'new' ? segments[1] : undefined;
  const intent = segments[1] === 'new' ? 'new' : undefined;
  if (resource === 'leads') return { screen: 'leads', recordId };
  if (resource === 'customers') return { screen: 'customers', recordId };
  if (resource === 'jobs') return { screen: 'jobs', recordId };
  if (resource === 'workflows') return { screen: 'workflows', recordId };
  if (resource === 'tasks') return { screen: 'tasks', recordId };
  if (resource === 'recurring-jobs') return { screen: 'recurring', recordId };
  if (resource === 'activity') return { screen: 'activity' };
  if (resource === 'quotes') return { screen: 'quotes', recordId, intent };
  if (resource === 'invoices') return { screen: 'invoices', recordId, intent };
  if (resource === 'payments') return { screen: 'payments', recordId };
  if (resource === 'analytics') return { screen: 'analytics' };
  if (['directory', 'contacts', 'sites'].includes(resource)) return { screen: 'directory', recordId };
  if (resource === 'trash') return { screen: 'trash' };
  if (resource === 'settings') return { screen: 'settings' };
  if (resource === 'subscription') return { screen: 'subscription' };
  if (resource === 'call-recovery') return { screen: 'call-recovery' };
  if (resource === 'admin') return { screen: 'admin' };
  if (resource === 'access-denied') return { screen: 'access-denied' };
  return { screen: 'dashboard' };
}

export default function TradeFlowKitShell({ routePath }: TradeFlowKitShellProps) {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const pathname = usePathname();
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [systemDark, setSystemDark] = useState(false);
  const fallbackTenantId = user?.currentTenantId ?? getActiveTenantId();
  const tenantId = activeTenant?.id ?? fallbackTenantId;
  const platformAdmin = hasPlatformAdminAuthority(user);
  const adapterRole = platformAdmin ? 'admin' : activeRole ?? 'member';
  const route = resolveRoute(routePath || pathname);
  // Embedded and source-compatible entry points use the stable local fallback
  // route. On tradeflowkit.operatoros.net middleware canonicalizes this prefix
  // to the clean host-relative path before auth and internal module rewriting.
  const routePrefix = '/modules/tradeflowkit';

  useEffect(() => {
    const stored = window.localStorage.getItem('tradeflowkit-theme-v1');
    if (stored === 'light' || stored === 'dark') setTheme(stored);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemDark(media.matches);
    updateSystemTheme();
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifest = manifest?.href;
    if (manifest) manifest.href = '/tradeflowkit.webmanifest';
    if ('serviceWorker' in navigator && window.location.hostname.toLowerCase() === 'tradeflowkit.operatoros.net') {
      void navigator.serviceWorker.register('/tradeflowkit-sw.js', { scope: '/' }).catch(() => undefined);
    }
    return () => {
      if (manifest && previousManifest) manifest.href = previousManifest;
    };
  }, [pathname]);

  const adapter = useMemo(() => createTradeFlowKitAdapterContext({
    currentUser: user
      ? { id: user.id, email: user.email, name: user.name, platformRole: user.platformRole }
      : null,
    tenantId,
    role: adapterRole,
    entitlements: { modules: [{ slug: 'tradeflowkit', enabled: true }] },
    platformAdmin,
  }), [adapterRole, platformAdmin, tenantId, user]);

  const hasTenantContext = !!adapter.tenantId || platformAdmin;
  const canManageModule = platformAdmin || activeRole === 'owner' || activeRole === 'admin';
  const tenantLabel = activeTenant?.name ?? adapter.tenantId ?? 'No organization selected';
  const roleLabel = platformAdmin
    ? 'Platform administrator'
    : activeRole === 'owner'
      ? 'Organization owner'
      : activeRole === 'admin'
        ? 'Organization administrator'
        : activeRole === 'viewer'
          ? 'Read-only access'
          : 'Team member';
  const hrefFor = (href: string) => `${routePrefix}${href}`;
  const darkThemeActive = theme === 'dark' || (theme === 'system' && systemDark);
  const toggleTheme = () => {
    const next = darkThemeActive ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem('tradeflowkit-theme-v1', next);
  };
  const routeAccess = {
    capabilities: new Set<TradeFlowKitCapability>(canManageModule ? ['read', 'manage'] : ['read']),
    roles: new Set<TradeFlowKitRole>([
      platformAdmin
        ? 'platform-admin'
        : activeRole === 'owner' || activeRole === 'admin' || activeRole === 'viewer'
          ? activeRole
          : 'member',
    ]),
  };
  const currentManifestPath = hrefFor(`/${route.screen}${route.recordId ? `/${route.recordId}` : ''}`);
  const pageActions = route.screen === 'dashboard'
    ? <Link className={styles.primaryLink} href={hrefFor('/leads')} data-testid="tradeflowkit-start-with-lead"><ClipboardList size={15} /> Start with a lead</Link>
    : route.screen === 'quotes' && canManageModule
      ? <Link className={styles.primaryLink} href={hrefFor('/quotes/new')}><FileText size={15} /> New quote</Link>
      : route.screen === 'invoices' && canManageModule
        ? <Link className={styles.primaryLink} href={hrefFor('/invoices/new')}><Receipt size={15} /> New invoice</Link>
        : undefined;

  if (authLoading || tenantLoading) {
    return (
      <main className={styles.shell} data-testid="tradeflowkit-module-shell">
        <div className={styles.content}>
          <section className={styles.stateCard} data-testid="tradeflowkit-loading-state" aria-busy="true">
            <Activity size={19} color="var(--tfk-primary)" />
            <div><strong>Loading TradeFlowKit</strong><span>Preparing your organization-scoped service workspace.</span></div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <ModuleApplicationShell<TradeFlowKitCapability, TradeFlowKitRole>
      moduleId="tradeflowkit"
      moduleName="TradeFlowKit"
      theme={TRADEFLOWKIT_THEME}
      themeMode={theme}
      currentPath={currentManifestPath}
      navigation={TRADEFLOWKIT_NAVIGATION}
      access={routeAccess}
      brand={(
        <Link className={styles.brand} href={hrefFor('/dashboard')} aria-label="TradeFlowKit dashboard">
          <Image src="/brand/tradeflowkit-logo.png" alt="TradeFlowKit" width={46} height={46} priority />
          <span className={styles.brandText}><strong>TradeFlow</strong><span>Service management</span></span>
        </Link>
      )}
      organization={{ label: 'Organization', value: tenantLabel, title: tenantLabel, testId: 'tradeflowkit-tenant-badge' }}
      accessContext={{ label: 'Access', value: roleLabel, testId: 'tradeflowkit-role-badge' }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2 },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound },
        { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'tradeflowkit', page: currentManifestPath }), icon: LifeBuoy },
      ]}
      topActions={(
        <>
          <Link className={styles.iconButton} href={`${hrefFor('/dashboard')}#tradeflowkit-global-search-input`} aria-label="Open TradeFlowKit search"><Search size={17} /></Link>
          <Link className={styles.iconButton} href={hrefFor('/settings')} aria-label="TradeFlowKit settings"><Settings size={17} /></Link>
          <button className={styles.iconButton} type="button" onClick={toggleTheme} aria-label={`Use ${darkThemeActive ? 'light' : 'dark'} TradeFlowKit theme`} title={`Use ${darkThemeActive ? 'light' : 'dark'} TradeFlowKit theme`}>{darkThemeActive ? <Sun size={17} /> : <Moon size={17} />}</button>
          <span className={styles.iconButton} role="img" aria-label="Protected by OperatorOS" title="Protected by OperatorOS"><ShieldCheck size={17} /></span>
          <span className={styles.iconButton} role="img" aria-label="Notifications are delivered by OperatorOS" title="Notifications are delivered by OperatorOS"><Bell size={17} /></span>
        </>
      )}
      breadcrumbContent={<>TradeFlowKit / <strong>{pageCopy[route.screen].title}</strong></>}
      page={{
        eyebrow: pageCopy[route.screen].eyebrow,
        title: route.recordId ? `${pageCopy[route.screen].title} detail` : pageCopy[route.screen].title,
        subtitle: pageCopy[route.screen].description,
        actions: pageActions,
      }}
      classNames={shellClasses}
      mobileNavigation="bottom"
      mobileItemIds={TRADEFLOWKIT_MOBILE_ROUTE_IDS}
      testId="tradeflowkit-module-shell"
      contentId="tradeflowkit-overview"
      pageHeaderTestId="tradeflowkit-module-header"
      dataAttributes={{ 'data-tradeflowkit-screen': route.screen }}
    >
      {!hasTenantContext ? (
        <section className={styles.stateCard} data-testid="tradeflowkit-empty-state" role="alert">
          <AlertTriangle size={19} color="var(--tfk-danger)" />
          <div><strong>Choose an organization</strong><span>TradeFlowKit only loads records for the organization validated by OperatorOS.</span></div>
        </section>
      ) : adapter.tenantId ? (
        <TradeFlowKitScreen
          screen={route.screen}
          recordId={route.recordId}
          intent={route.intent}
          tenantKey={adapter.tenantId}
          canManage={canManageModule}
          hrefFor={hrefFor}
        />
      ) : null}
    </ModuleApplicationShell>
  );
}

function TradeFlowKitScreen({
  screen,
  recordId,
  intent,
  tenantKey,
  canManage,
  hrefFor,
}: RouteState & { tenantKey: string; canManage: boolean; hrefFor: (href: string) => string }) {
  if (screen === 'dashboard') {
    return <>
      <TradeFlowKitGlobalSearch tenantKey={tenantKey} />
      <TradeFlowKitOperations tenantKey={tenantKey} canManage={canManage} view="dashboard" routePrefix={hrefFor('')} />
      <div className={styles.dashboardGrid} aria-label="TradeFlowKit active workflows">
        <QuickLink href={hrefFor('/leads')} Icon={ClipboardList} title="Lead pipeline" body="Capture and qualify real service opportunities." />
        <QuickLink href={hrefFor('/customers')} Icon={Users} title="Customer records" body="Open persisted customer and service history." />
        <QuickLink href={hrefFor('/jobs')} Icon={BriefcaseBusiness} title="Jobs and tasks" body="Coordinate scheduled work and task completion." />
        <QuickLink href={hrefFor('/workflows')} Icon={GitBranch} title="Workflows" body="Manage reusable stages and job workflow assignment." />
        <QuickLink href={hrefFor('/tasks')} Icon={ListChecks} title="Team tasks" body="Open the organization-wide task queue." />
        <QuickLink href={hrefFor('/recurring-jobs')} Icon={CalendarClock} title="Recurring jobs" body="Schedule and monitor repeat service work." />
        <QuickLink href={hrefFor('/activity')} Icon={Activity} title="Activity" body="Review persisted operational history." />
        <QuickLink href={hrefFor('/quotes')} Icon={FileText} title="Quotes" body="Prepare customer quotes and track responses." />
        <QuickLink href={hrefFor('/invoices')} Icon={Receipt} title="Invoices" body="Issue invoices and record payment history." />
        <QuickLink href={hrefFor('/payments')} Icon={CreditCard} title="Payments" body="Review balances and authoritative customer payments." />
        <QuickLink href={hrefFor('/analytics')} Icon={BarChart3} title="Analytics" body="Review metrics calculated from persisted records." />
        <QuickLink href={hrefFor('/directory')} Icon={ContactRound} title="Business Directory" body="Reuse tenant-scoped organizations, contacts, and sites." />
      </div>
    </>;
  }
  if (screen === 'leads') return <section id="tradeflowkit-lead-center" data-testid="tradeflowkit-lead-center-panel" tabIndex={-1}><TradeFlowKitLeadCenter tenantKey={tenantKey} canManage={canManage} view="leads" routePrefix={hrefFor('')} /></section>;
  if (screen === 'customers' || screen === 'quotes' || screen === 'invoices' || screen === 'payments') {
    const view: TradeFlowKitRevenueView = screen;
    return <TradeFlowKitRevenueFlow tenantKey={tenantKey} canManage={canManage} view={view} recordId={recordId} intent={intent} routePrefix={hrefFor('')} />;
  }
  if (screen === 'jobs') return <><TradeFlowKitOperations tenantKey={tenantKey} canManage={canManage} view="jobs" recordId={recordId} routePrefix={hrefFor('')} /><TradeFlowKitWorkManagement tenantKey={tenantKey} canManage={canManage} view="jobs" /></>;
  if (screen === 'workflows') return <TradeFlowKitWorkManagement tenantKey={tenantKey} canManage={canManage} view="workflows" recordId={recordId} />;
  if (screen === 'tasks') return <TradeFlowKitWorkManagement tenantKey={tenantKey} canManage={canManage} view="tasks" recordId={recordId} />;
  if (screen === 'recurring') return <TradeFlowKitWorkManagement tenantKey={tenantKey} canManage={canManage} view="recurring" recordId={recordId} />;
  if (screen === 'activity') return <TradeFlowKitWorkManagement tenantKey={tenantKey} canManage={canManage} view="activity" />;
  if (screen === 'analytics') return <TradeFlowKitOperations tenantKey={tenantKey} canManage={canManage} view="analytics" routePrefix={hrefFor('')} />;
  if (screen === 'directory') return <section id="tradeflowkit-directory" tabIndex={-1}><BusinessDirectory moduleSlug="tradeflowkit" tenantKey={tenantKey} canArchive={canManage} /></section>;
  if (screen === 'trash') return <TradeFlowKitTrash tenantKey={tenantKey} canManage={canManage} />;
  if (screen === 'settings') {
    const operationsView: TradeFlowKitOperationsView = 'settings';
    return <section id="tradeflowkit-settings" data-testid="tradeflowkit-settings-panel" tabIndex={-1}><TradeFlowKitOperations tenantKey={tenantKey} canManage={canManage} view={operationsView} routePrefix={hrefFor('')} /><TradeFlowKitLeadCenter tenantKey={tenantKey} canManage={canManage} view="settings" routePrefix={hrefFor('')} /></section>;
  }
  if (screen === 'subscription') {
    return <section className={styles.dashboardGrid} data-testid="tradeflowkit-subscription-route" tabIndex={-1}>
      <QuickLink href={DEFAULT_OPERATOROS_NAVIGATION_URLS.billingUrl} Icon={CreditCard} title="Manage subscription" body="Open the OperatorOS-owned plan, invoice, checkout, and customer-portal controls." />
      <QuickLink href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl} Icon={ShieldCheck} title="Review module access" body="Return to My Apps to review the organization and its enabled modules." />
    </section>;
  }
  if (screen === 'call-recovery') {
    return <section className={styles.dashboardGrid} data-testid="tradeflowkit-call-recovery-route" tabIndex={-1}>
      <QuickLink href={`${DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}modules/outcall`} Icon={PhoneCall} title="Review OutCall availability" body="Continue only when OperatorOS has enabled the verified-self companion module and its provider gate for this organization." />
      <QuickLink href={hrefFor('/leads')} Icon={ClipboardList} title="Return to leads" body="Keep qualification, follow-up, and lead conversion inside TradeFlowKit." />
    </section>;
  }
  if (screen === 'admin') {
    return <section className={styles.dashboardGrid} data-testid="tradeflowkit-admin-route" tabIndex={-1}>
      <QuickLink href={operatorConsolePageUrl('tenant-users')} Icon={Users} title="Organization members" body="Manage tenant membership and bounded roles through OperatorOS." />
      <QuickLink href={DEFAULT_OPERATOROS_NAVIGATION_URLS.billingUrl} Icon={ShieldCheck} title="Commercial controls" body="Manage module entitlement and billing without creating a second authority in TradeFlowKit." />
    </section>;
  }
  if (screen === 'access-denied') {
    return <section className={styles.stateCard} data-testid="tradeflowkit-access-denied-route" role="alert" tabIndex={-1}>
      <AlertTriangle size={19} color="var(--tfk-danger)" />
      <div><strong>Access denied</strong><span>Return to My Apps and select an organization with TradeFlowKit access.</span></div>
      <Link href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}>Return to My Apps</Link>
    </section>;
  }
  return null;
}

function QuickLink({ href, Icon, title, body }: { href: string; Icon: LucideIcon; title: string; body: string }) {
  return <Link className={styles.quickLink} href={href}><span className={styles.quickIcon}><Icon size={18} /></span><strong>{title}</strong><span>{body}</span></Link>;
}
