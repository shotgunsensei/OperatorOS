'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Moon,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { hasPlatformAdminAuthority } from '../../../../../packages/auth/index.js';
import { createTradeFlowKitAdapterContext } from '../../../../../apps/modules/tradeflowkit/adapter.js';
import TradeFlowKitLeadCenter from './TradeFlowKitLeadCenter';
import TradeFlowKitRevenueFlow, { type TradeFlowKitRevenueView } from './TradeFlowKitRevenueFlow';
import TradeFlowKitOperations, { type TradeFlowKitOperationsView } from './TradeFlowKitOperations';
import TradeFlowKitWorkManagement from './TradeFlowKitWorkManagement';
import TradeFlowKitGlobalSearch from './TradeFlowKitGlobalSearch';
import TradeFlowKitTrash from './TradeFlowKitTrash';
import BusinessDirectory from './BusinessDirectory';
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
  | 'quotes'
  | 'invoices'
  | 'payments'
  | 'analytics'
  | 'directory'
  | 'trash'
  | 'settings';

interface RouteState {
  screen: TradeFlowKitScreen;
  recordId?: string;
  intent?: 'new';
}

interface NavItem {
  screen: TradeFlowKitScreen;
  href: string;
  label: string;
  Icon: LucideIcon;
}

const primaryNav: NavItem[] = [
  { screen: 'dashboard', href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { screen: 'leads', href: '/leads', label: 'Leads', Icon: ClipboardList },
  { screen: 'customers', href: '/customers', label: 'Customers', Icon: Users },
  { screen: 'jobs', href: '/jobs', label: 'Jobs', Icon: BriefcaseBusiness },
  { screen: 'quotes', href: '/quotes', label: 'Quotes', Icon: FileText },
  { screen: 'invoices', href: '/invoices', label: 'Invoices', Icon: Receipt },
  { screen: 'analytics', href: '/analytics', label: 'Analytics', Icon: BarChart3 },
];

const systemNav: NavItem[] = [
  { screen: 'settings', href: '/settings', label: 'Settings', Icon: Settings },
  { screen: 'trash', href: '/trash', label: 'Trash', Icon: ArchiveRestore },
];

const pageCopy: Record<TradeFlowKitScreen, { eyebrow: string; title: string; description: string }> = {
  dashboard: {
    eyebrow: 'Service management overview',
    title: 'Dashboard',
    description: 'See the real lead, job, task, invoice, and collection state for this organization.',
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
};

function resolveRoute(routePath?: string): RouteState {
  const clean = (routePath || '/dashboard').split('?')[0].replace(/^\/modules\/tradeflowkit/, '') || '/dashboard';
  const segments = clean.split('/').filter(Boolean);
  const resource = segments[0] || 'dashboard';
  const recordId = segments.length > 1 && segments[1] !== 'new' ? segments[1] : undefined;
  const intent = segments[1] === 'new' ? 'new' : undefined;
  if (resource === 'leads') return { screen: 'leads', recordId };
  if (resource === 'customers') return { screen: 'customers', recordId };
  if (resource === 'jobs' || resource === 'tasks') return { screen: 'jobs', recordId };
  if (resource === 'quotes') return { screen: 'quotes', recordId, intent };
  if (resource === 'invoices') return { screen: 'invoices', recordId, intent };
  if (resource === 'payments') return { screen: 'payments', recordId };
  if (resource === 'analytics') return { screen: 'analytics' };
  if (['directory', 'contacts', 'sites'].includes(resource)) return { screen: 'directory', recordId };
  if (resource === 'trash') return { screen: 'trash' };
  if (resource === 'settings') return { screen: 'settings' };
  return { screen: 'dashboard' };
}

export default function TradeFlowKitShell({ routePath }: TradeFlowKitShellProps) {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const pathname = usePathname();
  const [routePrefix, setRoutePrefix] = useState('');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [systemDark, setSystemDark] = useState(false);
  const fallbackTenantId = user?.currentTenantId ?? getActiveTenantId();
  const tenantId = activeTenant?.id ?? fallbackTenantId;
  const platformAdmin = hasPlatformAdminAuthority(user);
  const adapterRole = platformAdmin ? 'admin' : activeRole ?? 'member';
  const route = resolveRoute(routePath || pathname);

  useEffect(() => {
    setRoutePrefix(window.location.pathname.startsWith('/modules/tradeflowkit') ? '/modules/tradeflowkit' : '');
    const stored = window.localStorage.getItem('tradeflowkit-theme-v1');
    if (stored === 'light' || stored === 'dark') setTheme(stored);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemDark(media.matches);
    updateSystemTheme();
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

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
    <main className={styles.shell} data-theme={theme} data-testid="tradeflowkit-module-shell" data-tradeflowkit-screen={route.screen}>
      <div className={styles.workspace}>
        <aside className={styles.sidebar} data-testid="tradeflowkit-module-sidebar">
          <Link className={styles.brand} href={hrefFor('/dashboard')} aria-label="TradeFlowKit dashboard">
            <Image src="/brand/tradeflowkit-logo.png" alt="TradeFlowKit" width={46} height={46} priority />
            <span className={styles.brandText}><strong>TradeFlow</strong><span>Service management</span></span>
          </Link>

          <div className={styles.tenantCard} data-testid="tradeflowkit-tenant-badge">
            <span>Organization</span><strong title={tenantLabel}>{tenantLabel}</strong>
          </div>

          <nav className={styles.navGroup} aria-label="TradeFlowKit primary navigation">
            <span className={styles.navLabel}>Main</span>
            {primaryNav.map(item => <DesktopNavLink key={item.screen} item={item} active={route.screen === item.screen} href={hrefFor(item.href)} />)}
          </nav>

          <nav className={styles.navGroup} aria-label="TradeFlowKit system navigation">
            <span className={styles.navLabel}>System</span>
            {systemNav.map(item => <DesktopNavLink key={item.screen} item={item} active={route.screen === item.screen} href={hrefFor(item.href)} />)}
          </nav>

          <div className={styles.sidebarFoot}>
            <div className={styles.tenantCard} data-testid="tradeflowkit-role-badge"><span>Access</span><strong>{roleLabel}</strong></div>
          </div>
        </aside>

        <div className={styles.content}>
          <div className={styles.topbar}>
            <div className={styles.crumbs}>TradeFlowKit / <strong>{pageCopy[route.screen].title}</strong></div>
            <div className={styles.topActions}>
              <Link className={styles.iconButton} href={`${hrefFor('/dashboard')}#tradeflowkit-global-search-input`} aria-label="Open TradeFlowKit search"><Search size={17} /></Link>
              <Link className={styles.iconButton} href={hrefFor('/settings')} aria-label="TradeFlowKit settings"><Settings size={17} /></Link>
              <button className={styles.iconButton} type="button" onClick={toggleTheme} aria-label={`Use ${darkThemeActive ? 'light' : 'dark'} TradeFlowKit theme`} title={`Use ${darkThemeActive ? 'light' : 'dark'} TradeFlowKit theme`}>{darkThemeActive ? <Sun size={17} /> : <Moon size={17} />}</button>
              <span className={styles.iconButton} aria-label="OperatorOS session protected" title="OperatorOS session protected"><ShieldCheck size={17} /></span>
              <span className={styles.iconButton} aria-label="Notifications are delivered by OperatorOS" title="Notifications are delivered by OperatorOS"><Bell size={17} /></span>
            </div>
          </div>

          <section className={styles.page}>
            <header id="tradeflowkit-overview" className={styles.pageHeader} data-testid="tradeflowkit-module-header" tabIndex={-1}>
              <div>
                <div className={styles.eyebrow}>{pageCopy[route.screen].eyebrow}</div>
                <h1>{route.recordId ? `${pageCopy[route.screen].title} detail` : pageCopy[route.screen].title}</h1>
                <p>{pageCopy[route.screen].description}</p>
              </div>
              {route.screen === 'dashboard' && <Link className={styles.primaryLink} href={hrefFor('/leads')} data-testid="tradeflowkit-start-with-lead"><ClipboardList size={15} /> Add a lead</Link>}
              {route.screen === 'quotes' && canManageModule && <Link className={styles.primaryLink} href={hrefFor('/quotes/new')}><FileText size={15} /> New quote</Link>}
              {route.screen === 'invoices' && canManageModule && <Link className={styles.primaryLink} href={hrefFor('/invoices/new')}><Receipt size={15} /> New invoice</Link>}
            </header>

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
          </section>
        </div>
      </div>

      <nav className={styles.mobileNav} aria-label="TradeFlowKit mobile navigation" data-testid="tradeflowkit-mobile-nav">
        {[primaryNav[0], primaryNav[1], primaryNav[3], systemNav[0]].map(item => {
          const active = route.screen === item.screen;
          return <Link key={item.screen} href={hrefFor(item.href)} className={active ? styles.navLinkActive : undefined} aria-current={active ? 'page' : undefined}><item.Icon size={19} /><span>{item.label === 'Settings' ? 'More' : item.label}</span></Link>;
        })}
      </nav>
    </main>
  );
}

function DesktopNavLink({ item, active, href }: { item: NavItem; active: boolean; href: string }) {
  return (
    <Link
      className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
      href={href}
      aria-current={active ? 'page' : undefined}
      data-testid={`tradeflowkit-sidebar-${item.screen}`}
    >
      <item.Icon size={17} /><span>{item.label}</span>
    </Link>
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
        <QuickLink href={hrefFor('/quotes')} Icon={FileText} title="Quotes" body="Prepare customer quotes and track responses." />
        <QuickLink href={hrefFor('/invoices')} Icon={Receipt} title="Invoices" body="Issue invoices and record payment history." />
        <QuickLink href={hrefFor('/analytics')} Icon={BarChart3} title="Analytics" body="Review metrics calculated from persisted records." />
      </div>
    </>;
  }
  if (screen === 'leads') return <section id="tradeflowkit-lead-center" data-testid="tradeflowkit-lead-center-panel" tabIndex={-1}><TradeFlowKitLeadCenter tenantKey={tenantKey} canManage={canManage} view="leads" routePrefix={hrefFor('')} /></section>;
  if (screen === 'customers' || screen === 'quotes' || screen === 'invoices' || screen === 'payments') {
    const view: TradeFlowKitRevenueView = screen;
    return <TradeFlowKitRevenueFlow tenantKey={tenantKey} canManage={canManage} view={view} recordId={recordId} intent={intent} routePrefix={hrefFor('')} />;
  }
  if (screen === 'jobs') return <><TradeFlowKitOperations tenantKey={tenantKey} canManage={canManage} view="jobs" recordId={recordId} routePrefix={hrefFor('')} /><TradeFlowKitWorkManagement tenantKey={tenantKey} canManage={canManage} /></>;
  if (screen === 'analytics') return <TradeFlowKitOperations tenantKey={tenantKey} canManage={canManage} view="analytics" routePrefix={hrefFor('')} />;
  if (screen === 'directory') return <section id="tradeflowkit-directory" tabIndex={-1}><BusinessDirectory moduleSlug="tradeflowkit" tenantKey={tenantKey} canArchive={canManage} /></section>;
  if (screen === 'trash') return <TradeFlowKitTrash tenantKey={tenantKey} canManage={canManage} />;
  if (screen === 'settings') {
    const operationsView: TradeFlowKitOperationsView = 'settings';
    return <section id="tradeflowkit-settings" data-testid="tradeflowkit-settings-panel" tabIndex={-1}><TradeFlowKitOperations tenantKey={tenantKey} canManage={canManage} view={operationsView} routePrefix={hrefFor('')} /><TradeFlowKitLeadCenter tenantKey={tenantKey} canManage={canManage} view="settings" routePrefix={hrefFor('')} /></section>;
  }
  return null;
}

function QuickLink({ href, Icon, title, body }: { href: string; Icon: LucideIcon; title: string; body: string }) {
  return <Link className={styles.quickLink} href={href}><span className={styles.quickIcon}><Icon size={18} /></span><strong>{title}</strong><span>{body}</span></Link>;
}
