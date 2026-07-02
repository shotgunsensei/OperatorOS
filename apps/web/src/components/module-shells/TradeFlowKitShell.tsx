'use client';

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
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

interface TradeFlowKitShellProps {
  baseUrl?: string;
}

const colors = {
  bg: '#f6fbf8',
  ink: '#10231d',
  muted: '#587067',
  dim: '#789189',
  panel: '#ffffff',
  panelSoft: '#eef8f2',
  border: 'rgba(22, 101, 52, 0.16)',
  borderStrong: 'rgba(5, 150, 105, 0.34)',
  green: '#059669',
  blue: '#0284c7',
  gold: '#b7791f',
  red: '#dc2626',
  violet: '#6d28d9',
};

const workflowShortcuts = [
  {
    id: 'leads',
    label: 'Leads',
    summary: 'Lead Conversion Center for missed calls, forms, follow-ups, and lead-to-cash handoff.',
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
    summary: 'Field-service jobs from scheduling through completion, recurring work, and crew status.',
    Icon: BriefcaseBusiness,
    tone: colors.green,
  },
  {
    id: 'quotes',
    label: 'Quotes',
    summary: 'Quote creation, customer approval, conversion to jobs, and conversion to invoices.',
    Icon: FileText,
    tone: colors.gold,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    summary: 'Invoice creation, payment links, reminders, payment state, exports, and customer portal flow.',
    Icon: Receipt,
    tone: colors.blue,
  },
  {
    id: 'reminders',
    label: 'Reminders',
    summary: 'Overdue invoice, pending quote, SMS, email, and follow-up automation workflow surface.',
    Icon: BellRing,
    tone: colors.violet,
  },
  {
    id: 'payments',
    label: 'Payments',
    summary: 'Stripe Connect and invoice payment paths are legacy local surfaces pending OperatorOS billing cleanup.',
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
  ['SSO', 'OperatorOS handoff', colors.green],
  ['Tenant', 'Org-linked', colors.blue],
  ['Billing', 'OperatorOS boundary', colors.gold],
  ['Mobile', 'Responsive PWA', colors.violet],
  ['Standalone login', 'Not launched', colors.blue],
  ['Stripe local', 'Phase 15 cleanup', colors.gold],
];

const shellCss = `
  .tfk-shell {
    min-height: 100vh;
    color: ${colors.ink};
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(246, 251, 248, 0.96)),
      radial-gradient(circle at 12% 0%, rgba(5, 150, 105, 0.16), transparent 30%),
      radial-gradient(circle at 88% 2%, rgba(2, 132, 199, 0.12), transparent 28%),
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
    background: rgba(255, 255, 255, 0.92);
    border-radius: 8px;
    padding: 22px;
    display: grid;
    gap: 18px;
    box-shadow: 0 20px 54px rgba(17, 76, 57, 0.10);
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
    background: rgba(255, 255, 255, 0.90);
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
    ? 'Platform super admin'
    : activeRole
      ? `Tenant ${activeRole}`
      : adapter.localRole;
  const tenantLabel = activeTenant?.name ?? adapter.tenantId ?? 'No active tenant';
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
              <div style={{ fontWeight: 800 }}>Loading TradeFlowKit context</div>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                OperatorOS is resolving tenant, role, and module entitlement state.
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
        <header className="tfk-header" data-testid="tradeflowkit-module-header">
          <div className="tfk-header-top">
            <div style={{ minWidth: 0 }}>
              <div style={eyebrowStyle}>Field-service revenue command layer</div>
              <h1 style={titleStyle}>TradeFlowKit</h1>
              <p style={ledeStyle}>
                Tenant-scoped lead-to-cash workspace for leads, customers, jobs, quotes, invoices, reminders, payments, and performance visibility.
              </p>
            </div>
            <div className="tfk-actions">
              <HeaderLink href="/app" testId="tradeflowkit-return-command-center" Icon={ArrowLeft}>
                Command Center
              </HeaderLink>
              {canManageModule && (
                <HeaderLink href="#tradeflowkit-settings" testId="tradeflowkit-module-settings-link" Icon={Settings}>
                  Module Settings
                </HeaderLink>
              )}
              {platformAdmin && (
                <HeaderLink href="/app/platform/modules/tradeflowkit" testId="tradeflowkit-platform-manage-link" Icon={ShieldCheck}>
                  Platform Command
                </HeaderLink>
              )}
              {externalLaunchUrl && (
                <HeaderLink href={externalLaunchUrl} testId="tradeflowkit-external-launch-link" Icon={ExternalLink}>
                  External Module
                </HeaderLink>
              )}
            </div>
          </div>

          <div className="tfk-chip-row">
            <ContextChip label="Tenant" value={tenantLabel} tone={hasTenantContext ? colors.blue : colors.red} testId="tradeflowkit-tenant-badge" />
            <ContextChip label="Role" value={roleLabel} tone={platformAdmin ? colors.violet : colors.green} testId="tradeflowkit-role-badge" />
            <ContextChip label="Session" value="OperatorOS SSO" tone={colors.green} testId="tradeflowkit-session-badge" />
            <ContextChip label="Host" value={adapter.hostnames.production} tone={colors.gold} testId="tradeflowkit-host-badge" />
          </div>
        </header>

        {!hasTenantContext && (
          <StatePanel
            testId="tradeflowkit-no-tenant-state"
            tone={colors.red}
            Icon={AlertTriangle}
            title="No active tenant context"
            body="TradeFlowKit requires an OperatorOS tenant context before field-service workflows can open. Return to the Command Center and select a tenant."
          />
        )}

        <div className="tfk-body">
          <nav className="tfk-rail" aria-label="TradeFlowKit sections" data-testid="tradeflowkit-module-sidebar">
            {workflowShortcuts.map(({ id, label, Icon, tone }) => (
              <a key={id} href={`#tradeflowkit-${id}`} style={railLinkStyle} data-testid={`tradeflowkit-sidebar-${id}`}>
                <Icon size={15} color={tone} />
                <span>{label}</span>
              </a>
            ))}
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

            <section className="tfk-panel" style={{ padding: 18 }} data-testid="tradeflowkit-workflows-panel">
              <SectionHeading
                Icon={Truck}
                title="Field-Service Workflows"
                subtitle="Core TradeFlowKit routes stay grouped around lead-to-cash execution."
              />
              <div className="tfk-workflow-grid" style={{ marginTop: 14 }}>
                {workflowShortcuts.map(({ id, label, summary, Icon, tone }) => (
                  <WorkflowPanel key={id} id={id} label={label} summary={summary} Icon={Icon} tone={tone} />
                ))}
              </div>
            </section>

            <section className="tfk-panel" style={{ padding: 18 }} data-testid="tradeflowkit-empty-state-panel">
              <SectionHeading
                Icon={CheckCircle2}
                title="Current State"
                subtitle="No critical workflow blockers are surfaced by the OperatorOS adapter."
              />
              <div style={emptyStateStyle} data-testid="tradeflowkit-empty-state">
                <DollarSign size={18} color={colors.green} />
                <div>
                  <div style={{ fontWeight: 800 }}>Ready for a controlled import smoke pass</div>
                  <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                    The shell is tenant-aware and keeps subscription ownership centralized while preserving the imported workflow map.
                  </div>
                </div>
              </div>
            </section>

            <section id="tradeflowkit-settings" className="tfk-panel" style={{ padding: 18 }} data-testid="tradeflowkit-settings-panel">
              <SectionHeading
                Icon={ShieldCheck}
                title="Settings and Admin"
                subtitle={canManageModule ? 'Management actions are available for authorized operators.' : 'Management actions are hidden for normal module users.'}
              />
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                <AdminRow
                  label="OperatorOS authority"
                  value="Identity, billing, tenant membership, module entitlement, SSO launch, and root admin checks stay centralized."
                  tone={colors.green}
                />
                <AdminRow
                  label="Module-local scope"
                  value="TradeFlowKit owns field-service workflows, revenue-flow UI, and tenant-scoped module data only."
                  tone={colors.blue}
                />
                <AdminRow
                  label="Current access"
                  value={canManageModule ? 'Administrative controls visible.' : 'Normal field-service operations view.'}
                  tone={canManageModule ? colors.gold : colors.muted}
                />
              </div>
            </section>

            <StatePanel
              testId="tradeflowkit-error-state"
              tone={colors.gold}
              Icon={AlertTriangle}
              title="If a feature route fails"
              body="Keep the user in the OperatorOS shell, show the access problem plainly, and route entitlement or billing fixes through Platform Command."
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
      <div style={{ marginTop: 12, color: tone, fontSize: 12, fontWeight: 800 }}>OperatorOS gated</div>
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
  background: 'rgba(255, 255, 255, 0.84)',
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
  background: 'rgba(255, 255, 255, 0.90)',
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
  background: 'rgba(255, 255, 255, 0.78)',
  minWidth: 0,
};

const emptyStateStyle: CSSProperties = {
  marginTop: 14,
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  border: `1px solid rgba(5, 150, 105, 0.35)`,
  borderRadius: 8,
  background: 'rgba(5, 150, 105, 0.08)',
  padding: 14,
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
  background: 'rgba(255, 255, 255, 0.92)',
  borderRadius: 8,
  padding: 18,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
};
