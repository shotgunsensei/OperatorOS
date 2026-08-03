'use client';

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  ArchiveRestore,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  CreditCard,
  ExternalLink,
  FileText,
  GitBranch,
  Receipt,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { hasPlatformAdminAuthority } from '../../../../../packages/auth/index.js';
import { createTradeFlowKitAdapterContext } from '../../../../../apps/modules/tradeflowkit/adapter.js';
import TradeFlowKitLeadCenter from './TradeFlowKitLeadCenter';
import TradeFlowKitRevenueFlow from './TradeFlowKitRevenueFlow';
import TradeFlowKitOperations from './TradeFlowKitOperations';
import TradeFlowKitWorkManagement from './TradeFlowKitWorkManagement';
import TradeFlowKitGlobalSearch from './TradeFlowKitGlobalSearch';
import TradeFlowKitTrash from './TradeFlowKitTrash';
import BusinessDirectory from './BusinessDirectory';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

interface TradeFlowKitShellProps {
  baseUrl?: string;
}

const colors = {
  bg: '#07110e',
  ink: '#eaf7f0',
  muted: '#9ab6aa',
  dim: '#6f8b80',
  panel: '#0f1b17',
  panelSoft: '#14241e',
  border: 'rgba(134, 239, 172, 0.16)',
  borderStrong: 'rgba(52, 211, 153, 0.38)',
  green: '#34d399',
  blue: '#38bdf8',
  gold: '#fbbf24',
  red: '#fb7185',
  violet: '#c4b5fd',
};

const workflowShortcuts = [
  {
    id: 'leads',
    label: 'Leads',
    summary: 'Add a lead, record follow-up, and turn qualified work into a customer and job.',
    Icon: ClipboardList,
    tone: colors.green,
  },
  {
    id: 'customers',
    label: 'Customers',
    summary: 'Customer history, contact context, job history, invoice history, and service notes.',
    Icon: Users,
    tone: colors.blue,
  },
  {
    id: 'jobs',
    label: 'Jobs',
    summary: 'Schedule field work, assign it, track tasks, and mark the job complete.',
    Icon: BriefcaseBusiness,
    tone: colors.green,
  },
  {
    id: 'quotes',
    label: 'Quotes',
    summary: 'Send a quote for customer approval, track its expiration, and turn an accepted quote into an invoice.',
    Icon: FileText,
    tone: colors.gold,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    summary: 'Create invoices, record partial or full payments, and share customer documents.',
    Icon: Receipt,
    tone: colors.blue,
  },
  {
    id: 'payments',
    label: 'Payments',
    summary: 'Record payments safely. Online payment processing appears only after an administrator finishes setup.',
    Icon: CreditCard,
    tone: colors.gold,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    summary: 'Quote acceptance, collection timing, source mix, conversion rate, and operational performance.',
    Icon: BarChart3,
    tone: colors.green,
  },
];

const readinessRows = [
  ['Sign-in', 'Protected', colors.green],
  ['Business records', 'Organization-only', colors.blue],
  ['Team access', 'Based on role', colors.green],
  ['Online payments', 'Requires setup', colors.gold],
];

const shellCss = `
  .tfk-shell {
    min-height: 100vh;
    color-scheme: dark;
    color: ${colors.ink};
    background:
      radial-gradient(circle at 10% -4%, rgba(52, 211, 153, 0.18), transparent 31%),
      radial-gradient(circle at 92% 4%, rgba(56, 189, 248, 0.11), transparent 28%),
      linear-gradient(180deg, #091612 0%, ${colors.bg} 58%, #050b09 100%),
      ${colors.bg};
    padding: 24px;
  }
  .tfk-wrap {
    max-width: 1240px;
    margin: 0 auto;
    display: grid;
    gap: 16px;
  }
  .tfk-header {
    border: 1px solid ${colors.borderStrong};
    background: linear-gradient(135deg, rgba(15, 27, 23, 0.97), rgba(8, 18, 14, 0.98));
    border-radius: 8px;
    padding: 22px;
    display: grid;
    gap: 18px;
    box-shadow: 0 22px 58px rgba(0, 0, 0, 0.30);
  }
  .tfk-header-top,
  .tfk-actions,
  .tfk-chip-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .tfk-body {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .tfk-rail,
  .tfk-panel {
    border: 1px solid ${colors.border};
    background: rgba(15, 27, 23, 0.94);
    border-radius: 8px;
  }
  .tfk-rail {
    position: sticky;
    top: 18px;
    padding: 12px;
    display: grid;
    gap: 8px;
  }
  .tfk-main {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .tfk-shell .directory-tradeflowkit {
    --d-bg: #0b1512;
    --d-panel: #14241e;
    --d-text: #eaf7f0;
    --d-muted: #9ab6aa;
    --d-border: rgba(134, 239, 172, 0.18);
    --d-accent: #34d399;
    --d-danger: #fb7185;
  }
  .tfk-shell :is(input, select, textarea) {
    color-scheme: dark;
  }
  .tfk-shell :is(input, select, textarea)::placeholder {
    color: #6f8b80;
  }
  .tfk-shell :is(.tfk-lead-center, .tfk-ops, .tfk-work, .tfk-trash, .directory-root) {
    color: ${colors.ink};
  }
  .tfk-shell :is(.tfk-lead-center, .tfk-ops, .tfk-work, .tfk-trash, .directory-root)
    :is(h2, h3, h4, strong, summary) {
    color: ${colors.ink};
  }
  .tfk-shell :is(input, select, textarea) {
    background: #0b1512 !important;
    color: ${colors.ink} !important;
    border-color: ${colors.border} !important;
  }
  .tfk-shell :is(
    .tfk-lead-form,
    .tfk-work-form,
    .tfk-work-state,
    .tfk-work-metrics > div,
    .tfk-saved-views,
    .tfk-accounting-exports,
    .tfk-bulk-bar,
    .tfk-task-board,
    .tfk-trash-state,
    .tfk-trash-groups > section,
    .tfk-global-search form,
    .tfk-global-search-empty
  ) {
    background: ${colors.panelSoft} !important;
    border-color: ${colors.border} !important;
  }
  .tfk-shell :is(
    .tfk-lead-metrics > div,
    .tfk-lead-row,
    .tfk-workflow-card,
    .tfk-job-workflow-list > div,
    .tfk-team-tasks article,
    .tfk-ops-metrics > div,
    .tfk-ops-layout aside button,
    .tfk-task,
    .tfk-record-editor,
    .tfk-global-search-results section,
    .tfk-trash,
    .tfk-trash article
  ) {
    background: ${colors.panel} !important;
    border-color: ${colors.border} !important;
  }
  .tfk-shell :is(.tfk-lead-row.selected, .tfk-ops-layout aside button.active, .tfk-task.selected, .tfk-record-editor.selected) {
    background: rgba(52, 211, 153, 0.10) !important;
    border-color: ${colors.green} !important;
  }
  .tfk-shell :is(.tfk-work button, .tfk-trash button, .tfk-lead-delete button, .tfk-ops-actions a, .tfk-accounting-exports a) {
    background: ${colors.panelSoft};
    color: ${colors.ink};
    border-color: ${colors.border};
  }
  .tfk-shell :is(.tfk-lead-heading p, .tfk-work p, .tfk-ops-head p, .tfk-task-title p, .tfk-trash small, .tfk-trash .empty, .tfk-trash .bounded) {
    color: ${colors.muted};
  }
  .tfk-shell :is(.tfk-lead-notice, .tfk-lead-read-only) {
    background: rgba(52, 211, 153, 0.10);
    color: #a7f3d0;
  }
  .tfk-card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .tfk-workflow-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 920px) {
    .tfk-body {
      grid-template-columns: 1fr;
    }
    .tfk-rail {
      position: static;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tfk-card-grid,
    .tfk-workflow-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 620px) {
    .tfk-shell {
      padding: 14px;
    }
    .tfk-header {
      padding: 16px;
    }
    .tfk-rail,
    .tfk-card-grid,
    .tfk-workflow-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export default function TradeFlowKitShell({ baseUrl }: TradeFlowKitShellProps) {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const fallbackTenantId = user?.currentTenantId ?? getActiveTenantId();
  const tenantId = activeTenant?.id ?? fallbackTenantId;
  const platformAdmin = hasPlatformAdminAuthority(user);
  const adapterRole = platformAdmin ? 'admin' : activeRole ?? 'member';

  const adapter = useMemo(() => createTradeFlowKitAdapterContext({
    currentUser: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole,
        }
      : null,
    tenantId,
    role: adapterRole,
    entitlements: { modules: [{ slug: 'tradeflowkit', enabled: true }] },
    platformAdmin,
  }), [adapterRole, platformAdmin, tenantId, user]);

  const isLoading = authLoading || tenantLoading;
  const hasTenantContext = !!adapter.tenantId || platformAdmin;
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
  const canManageModule = platformAdmin || activeRole === 'owner' || activeRole === 'admin';
  const externalLaunchUrl = baseUrl && /^https?:\/\//i.test(baseUrl) ? baseUrl.replace(/\/+$/, '') : null;

  if (isLoading) {
    return (
      <main className="tfk-shell" data-testid="tradeflowkit-module-shell">
        <style>{shellCss}</style>
        <section className="tfk-wrap">
          <div style={loadingPanelStyle} data-testid="tradeflowkit-loading-state" aria-busy="true">
            <Activity size={18} color={colors.green} />
            <div>
              <div style={{ fontWeight: 800 }}>Loading TradeFlowKit</div>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                Preparing your leads, customers, jobs, invoices, and team access.
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="tfk-shell" data-testid="tradeflowkit-module-shell">
      <style>{shellCss}</style>
      <section className="tfk-wrap">
        <header
          id="tradeflowkit-overview"
          className="tfk-header"
          data-testid="tradeflowkit-module-header"
          tabIndex={-1}
        >
          <div className="tfk-header-top">
            <div style={{ minWidth: 0 }}>
              <div style={eyebrowStyle}>Field service and revenue</div>
              <h1 style={titleStyle}>TradeFlowKit</h1>
              <p style={ledeStyle}>
                Move leads into customers, jobs, quotes, invoices, payments, and clear revenue visibility from one workspace.
              </p>
            </div>
            <div className="tfk-actions">
              <HeaderLink href="#tradeflowkit-lead-center" testId="tradeflowkit-start-with-lead" Icon={ClipboardList}>
                Start with a lead
              </HeaderLink>
              {canManageModule && (
                <HeaderLink href="#tradeflowkit-settings" testId="tradeflowkit-module-settings-link" Icon={Settings}>
                  Manage TradeFlowKit
                </HeaderLink>
              )}
              {platformAdmin && (
                <HeaderLink href={`${DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}app/platform/modules/tradeflowkit`} testId="tradeflowkit-platform-manage-link" Icon={ShieldCheck}>
                  Platform settings
                </HeaderLink>
              )}
              {externalLaunchUrl && (
                <HeaderLink href={externalLaunchUrl} testId="tradeflowkit-external-launch-link" Icon={ExternalLink}>
                  Open standalone app
                </HeaderLink>
              )}
            </div>
          </div>

          <div className="tfk-chip-row">
            <ContextChip label="Organization" value={tenantLabel} tone={hasTenantContext ? colors.blue : colors.red} testId="tradeflowkit-tenant-badge" />
            <ContextChip label="Role" value={roleLabel} tone={platformAdmin ? colors.violet : colors.green} testId="tradeflowkit-role-badge" />
            <ContextChip label="Sign-in" value="Protected by OperatorOS" tone={colors.green} testId="tradeflowkit-session-badge" />
            {platformAdmin && <ContextChip label="Module address" value={adapter.hostnames.production} tone={colors.gold} testId="tradeflowkit-host-badge" />}
          </div>

          {hasTenantContext && adapter.tenantId && (
            <TradeFlowKitGlobalSearch key={`search-${adapter.tenantId}`} tenantKey={adapter.tenantId} />
          )}
        </header>

        {!hasTenantContext && (
          <StatePanel
            testId="tradeflowkit-no-tenant-state"
            tone={colors.red}
            Icon={AlertTriangle}
            title="Choose an organization"
            body="Return to My Apps and choose the organization whose leads, jobs, quotes, invoices, and payments you want to manage."
          />
        )}

        <div className="tfk-body">
          <nav className="tfk-rail" aria-label="TradeFlowKit sections" data-testid="tradeflowkit-module-sidebar">
            {workflowShortcuts.map(({ id, label, Icon, tone }) => (
              <a
                key={id}
                href={id === 'leads' ? '#tradeflowkit-lead-center' : id === 'tasks' ? '#tradeflowkit-work-management' : `#tradeflowkit-${id}`}
                style={railLinkStyle}
                data-testid={`tradeflowkit-sidebar-${id}`}
              >
                <Icon size={15} color={tone} />
                <span>{label}</span>
              </a>
            ))}
            <a href="#tradeflowkit-work-management" style={railLinkStyle} data-testid="tradeflowkit-sidebar-workflows">
              <GitBranch size={15} color={colors.violet} />
              <span>Workflow Studio</span>
            </a>
            <a href="#tradeflowkit-trash" style={railLinkStyle} data-testid="tradeflowkit-sidebar-trash">
              <ArchiveRestore size={15} color={colors.blue} />
              <span>Archived Records</span>
            </a>
            <a href="#tradeflowkit-settings" style={railLinkStyle} data-testid="tradeflowkit-sidebar-settings">
              <Settings size={15} color={colors.gold} />
              <span>Settings</span>
            </a>
          </nav>

          <section className="tfk-main">
            <section className="tfk-card-grid" aria-label="TradeFlowKit readiness">
              {readinessRows.map(([label, value, tone]) => (
                <MetricTile key={label} label={label} value={value} tone={tone} />
              ))}
            </section>

            <section
              id="tradeflowkit-lead-center"
              data-testid="tradeflowkit-lead-center-panel"
              tabIndex={-1}
            >
              {hasTenantContext && adapter.tenantId && (
                <TradeFlowKitLeadCenter key={adapter.tenantId} tenantKey={adapter.tenantId} canManage={canManageModule} />
              )}
            </section>

            {hasTenantContext && adapter.tenantId && (
              <TradeFlowKitOperations key={`operations-${adapter.tenantId}`} tenantKey={adapter.tenantId} canManage={canManageModule} />
            )}

            {hasTenantContext && adapter.tenantId && (
              <TradeFlowKitWorkManagement key={`work-${adapter.tenantId}`} tenantKey={adapter.tenantId} canManage={canManageModule} />
            )}

            {hasTenantContext && adapter.tenantId && (
              <TradeFlowKitRevenueFlow key={`revenue-${adapter.tenantId}`} tenantKey={adapter.tenantId} canManage={canManageModule} />
            )}

            {hasTenantContext && adapter.tenantId && (
              <section id="tradeflowkit-directory" tabIndex={-1}>
                <BusinessDirectory moduleSlug="tradeflowkit" tenantKey={adapter.tenantId} canArchive={canManageModule} />
              </section>
            )}

            {hasTenantContext && adapter.tenantId && (
              <TradeFlowKitTrash key={`trash-${adapter.tenantId}`} tenantKey={adapter.tenantId} canManage={canManageModule} />
            )}

            <section className="tfk-panel" style={{ padding: 18 }} data-testid="tradeflowkit-workflows-panel">
              <SectionHeading
                Icon={Truck}
                title="What you can do"
                subtitle="Move from a new lead to completed work and payment without losing the customer history."
              />
              <div className="tfk-workflow-grid" style={{ marginTop: 14 }}>
                {workflowShortcuts.map(({ id, label, summary, Icon, tone }) => (
                  <WorkflowPanel key={id} id={id} label={label} summary={summary} Icon={Icon} tone={tone} />
                ))}
              </div>
            </section>

            <section
              id="tradeflowkit-settings"
              className="tfk-panel"
              style={{ padding: 18 }}
              data-testid="tradeflowkit-settings-panel"
              tabIndex={-1}
            >
              <SectionHeading
                Icon={ShieldCheck}
                title="Access and settings"
                subtitle={canManageModule ? 'You can manage this tool because you are an organization administrator.' : 'Your administrator controls team and billing access.'}
              />
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                <AdminRow
                  label="Account and access"
                  value="OperatorOS manages sign-in, subscription access, and workspace membership."
                  tone={colors.green}
                />
                <AdminRow
                  label="Business operations"
                  value="TradeFlowKit keeps field-service work, customer activity, and revenue flow together."
                  tone={colors.blue}
                />
                <AdminRow
                  label="Current access"
                  value={canManageModule ? 'You can manage team access and settings.' : 'You can use the field-service workflows assigned to you.'}
                  tone={canManageModule ? colors.gold : colors.muted}
                />
              </div>
            </section>

            <StatePanel
              testId="tradeflowkit-error-state"
              tone={colors.gold}
              Icon={AlertTriangle}
              title="Need help?"
              body="Try the action again. If you still cannot open work or record a payment, contact your organization administrator. Your existing records will not be changed by a failed attempt."
            />
          </section>
        </div>
      </section>
    </main>
  );
}

function HeaderLink({
  href,
  testId,
  Icon,
  children,
}: {
  href: string;
  testId: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <a href={href} data-testid={testId} style={headerLinkStyle}>
      <Icon size={14} />
      {children}
    </a>
  );
}

function ContextChip({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone: string;
  testId: string;
}) {
  return (
    <div style={{ ...chipStyle, borderColor: `${tone}66` }} data-testid={testId}>
      <span style={{ color: colors.dim }}>{label}</span>
      <strong style={{ color: tone, overflowWrap: 'anywhere' }}>{value}</strong>
    </div>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={metricTileStyle} data-testid={`tradeflowkit-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: tone }} />
      <div style={{ color: colors.muted, fontSize: 12, marginTop: 12 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 17, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function SectionHeading({
  Icon,
  title,
  subtitle,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={sectionIconStyle}>
        <Icon size={17} color={colors.green} />
      </span>
      <div>
        <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
        <p style={{ margin: '4px 0 0', color: colors.muted, fontSize: 13, lineHeight: 1.45 }}>{subtitle}</p>
      </div>
    </div>
  );
}

function WorkflowPanel({
  id,
  label,
  summary,
  Icon,
  tone,
}: {
  id: string;
  label: string;
  summary: string;
  Icon: LucideIcon;
  tone: string;
}) {
  return (
    <article id={`tradeflowkit-${id}`} style={workflowPanelStyle} data-testid={`tradeflowkit-workflow-${id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...smallIconStyle, borderColor: `${tone}66` }}>
          <Icon size={16} color={tone} />
        </span>
        <h3 style={{ margin: 0, fontSize: 15 }}>{label}</h3>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.45, margin: '10px 0 0' }}>{summary}</p>
      <div style={{ marginTop: 12, color: colors.green, fontSize: 12, fontWeight: 800 }}>
        {id === 'payments' ? 'Manual payments available · online processing requires setup' : 'Ready to use'}
      </div>
    </article>
  );
}

function AdminRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={adminRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: colors.ink, fontSize: 13, fontWeight: 800 }}>{label}</div>
        <div style={{ color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>{value}</div>
      </div>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flex: '0 0 auto' }} />
    </div>
  );
}

function StatePanel({
  testId,
  tone,
  Icon,
  title,
  body,
}: {
  testId: string;
  tone: string;
  Icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <section
      className="tfk-panel"
      data-testid={testId}
      style={{ padding: 16, borderColor: `${tone}66`, background: `${colors.panel}` }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon size={18} color={tone} />
        <div>
          <div style={{ fontWeight: 800 }}>{title}</div>
          <div style={{ color: colors.muted, fontSize: 13, lineHeight: 1.45, marginTop: 4 }}>{body}</div>
        </div>
      </div>
    </section>
  );
}

const eyebrowStyle: CSSProperties = {
  color: colors.green,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: 'uppercase',
};

const titleStyle: CSSProperties = {
  margin: '7px 0 0',
  fontSize: 34,
  lineHeight: 1.05,
};

const ledeStyle: CSSProperties = {
  margin: '9px 0 0',
  color: colors.muted,
  maxWidth: 780,
  lineHeight: 1.5,
};

const headerLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '9px 12px',
  color: colors.ink,
  background: 'rgba(20, 36, 30, 0.92)',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 800,
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '7px 10px',
  background: colors.panelSoft,
  fontSize: 12,
  minWidth: 0,
};

const railLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '10px 11px',
  borderRadius: 8,
  color: colors.ink,
  background: colors.panelSoft,
  border: `1px solid ${colors.border}`,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 800,
};

const metricTileStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: 'rgba(15, 27, 23, 0.96)',
  padding: 14,
  minHeight: 96,
};

const sectionIconStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: 'rgba(5, 150, 105, 0.10)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
};

const smallIconStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: colors.panelSoft,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
};

const workflowPanelStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: 14,
  background: 'rgba(15, 27, 23, 0.86)',
  minWidth: 0,
};

const adminRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: colors.panelSoft,
  padding: 12,
};

const loadingPanelStyle: CSSProperties = {
  border: `1px solid ${colors.borderStrong}`,
  background: 'rgba(15, 27, 23, 0.96)',
  borderRadius: 8,
  padding: 18,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
};
