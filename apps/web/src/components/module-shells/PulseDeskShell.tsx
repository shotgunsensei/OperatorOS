'use client';

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  HeartPulse,
  Inbox,
  PackageCheck,
  Settings,
  ShieldCheck,
  Stethoscope,
  Truck,
  type LucideIcon,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { hasPlatformAdminAuthority } from '../../../../../packages/auth/index.js';
import { createPulseDeskAdapterContext } from '../../../../../apps/modules/pulsedesk/adapter.js';
import PulseDeskDepartmentEscalationQueue from './PulseDeskDepartmentEscalationQueue';

interface PulseDeskShellProps {
  baseUrl?: string;
}

const colors = {
  bg: '#f5f9fc',
  ink: '#102033',
  muted: '#5b7087',
  dim: '#7f91a6',
  panel: '#ffffff',
  panelSoft: '#eef6fb',
  border: 'rgba(34, 86, 120, 0.16)',
  borderStrong: 'rgba(14, 116, 144, 0.34)',
  blue: '#0ea5e9',
  cyan: '#0891b2',
  green: '#16a34a',
  amber: '#d97706',
  red: '#dc2626',
  violet: '#7c3aed',
};

const workflowShortcuts = [
  {
    id: 'tickets',
    label: 'Tickets',
    summary: 'Clinical operations requests, escalations, assignments, and status tracking.',
    Icon: ClipboardList,
    tone: colors.blue,
  },
  {
    id: 'departments',
    label: 'Departments',
    summary: 'Department-level visibility for imaging, clinical, administrative, and facility teams.',
    Icon: Building2,
    tone: colors.cyan,
  },
  {
    id: 'assets',
    label: 'Assets',
    summary: 'Equipment, workstation, facility asset, and maintenance context for each tenant.',
    Icon: Stethoscope,
    tone: colors.green,
  },
  {
    id: 'supplies',
    label: 'Supplies',
    summary: 'Supply requests and operational restock coordination without billing ownership.',
    Icon: PackageCheck,
    tone: colors.amber,
  },
  {
    id: 'facilities',
    label: 'Facilities',
    summary: 'Facility repair, room readiness, and physical operations request queues.',
    Icon: Wrench,
    tone: colors.violet,
  },
  {
    id: 'vendors',
    label: 'Vendors',
    summary: 'Vendor follow-up, service coordination, and external escalation tracking.',
    Icon: Truck,
    tone: colors.cyan,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    summary: 'Department demand, response trends, and operational health reporting.',
    Icon: BarChart3,
    tone: colors.blue,
  },
  {
    id: 'inboxes',
    label: 'Inboxes',
    summary: 'Email intake and notification routing that stays tied to tenant context.',
    Icon: Inbox,
    tone: colors.green,
  },
];

const readinessRows = [
  ['SSO', 'OperatorOS managed', colors.green],
  ['Tenant', 'Scoped at launch', colors.blue],
  ['Billing', 'Centralized', colors.amber],
  ['Standalone login', 'Removed', colors.cyan],
];

const shellCss = `
  .pulsedesk-shell {
    min-height: 100vh;
    color: ${colors.ink};
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(245, 249, 252, 0.96)),
      radial-gradient(circle at 12% 0%, rgba(14, 165, 233, 0.18), transparent 30%),
      radial-gradient(circle at 88% 4%, rgba(22, 163, 74, 0.10), transparent 28%),
      ${colors.bg};
    padding: 24px;
  }
  .pulsedesk-wrap {
    max-width: 1240px;
    margin: 0 auto;
    display: grid;
    gap: 16px;
  }
  .pulsedesk-header {
    border: 1px solid ${colors.borderStrong};
    background: rgba(255, 255, 255, 0.92);
    border-radius: 8px;
    padding: 22px;
    display: grid;
    gap: 18px;
    box-shadow: 0 20px 54px rgba(15, 54, 77, 0.10);
  }
  .pulsedesk-header-top,
  .pulsedesk-actions,
  .pulsedesk-chip-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .pulsedesk-body {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .pulsedesk-rail,
  .pulsedesk-panel {
    border: 1px solid ${colors.border};
    background: rgba(255, 255, 255, 0.90);
    border-radius: 8px;
  }
  .pulsedesk-rail {
    position: sticky;
    top: 18px;
    padding: 12px;
    display: grid;
    gap: 8px;
  }
  .pulsedesk-main {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .pulsedesk-card-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .pulsedesk-workflow-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 920px) {
    .pulsedesk-body {
      grid-template-columns: 1fr;
    }
    .pulsedesk-rail {
      position: static;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pulsedesk-card-grid,
    .pulsedesk-workflow-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 620px) {
    .pulsedesk-shell {
      padding: 14px;
    }
    .pulsedesk-header {
      padding: 16px;
    }
    .pulsedesk-rail,
    .pulsedesk-card-grid,
    .pulsedesk-workflow-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export default function PulseDeskShell({ baseUrl }: PulseDeskShellProps) {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const fallbackTenantId = user?.currentTenantId ?? getActiveTenantId();
  const tenantId = activeTenant?.id ?? fallbackTenantId;
  const platformAdmin = hasPlatformAdminAuthority(user);
  const adapterRole = platformAdmin ? 'admin' : activeRole ?? 'member';

  const adapter = useMemo(() => createPulseDeskAdapterContext({
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
    entitlements: { modules: [{ slug: 'pulsedesk', enabled: true }] },
    platformAdmin,
  }), [adapterRole, platformAdmin, tenantId, user]);

  const isLoading = authLoading || tenantLoading;
  const hasTenantContext = !!adapter.tenantId;
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
      <main className="pulsedesk-shell" data-testid="pulsedesk-module-shell">
        <style>{shellCss}</style>
        <section className="pulsedesk-wrap">
          <div style={loadingPanelStyle} data-testid="pulsedesk-loading-state" aria-busy="true">
            <Activity size={18} color={colors.blue} />
            <div>
              <div style={{ fontWeight: 800 }}>Loading PulseDesk context</div>
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
    <main className="pulsedesk-shell" data-testid="pulsedesk-module-shell">
      <style>{shellCss}</style>
      <section className="pulsedesk-wrap">
        <header
          id="pulsedesk-overview"
          className="pulsedesk-header"
          data-testid="pulsedesk-module-header"
          tabIndex={-1}
        >
          <div className="pulsedesk-header-top">
            <div style={{ minWidth: 0 }}>
              <div style={eyebrowStyle}>Healthcare operations command layer</div>
              <h1 style={titleStyle}>PulseDesk</h1>
              <p style={ledeStyle}>
                Tenant-scoped clinical operations workspace for requests, departments, assets, supplies, facilities, vendors, and reporting.
              </p>
            </div>
            <div className="pulsedesk-actions">
              <HeaderLink href="/app" testId="pulsedesk-return-command-center" Icon={ArrowLeft}>
                Command Center
              </HeaderLink>
              {canManageModule && (
                <HeaderLink href="#pulsedesk-settings" testId="pulsedesk-module-settings-link" Icon={Settings}>
                  Module Settings
                </HeaderLink>
              )}
              {platformAdmin && (
                <HeaderLink href="/app/platform/modules/pulsedesk" testId="pulsedesk-platform-manage-link" Icon={ShieldCheck}>
                  Platform Command
                </HeaderLink>
              )}
              {externalLaunchUrl && (
                <HeaderLink href={externalLaunchUrl} testId="pulsedesk-external-launch-link" Icon={ExternalLink}>
                  External Module
                </HeaderLink>
              )}
            </div>
          </div>

          <div className="pulsedesk-chip-row">
            <ContextChip label="Tenant" value={tenantLabel} tone={hasTenantContext ? colors.blue : colors.red} testId="pulsedesk-tenant-badge" />
            <ContextChip label="Role" value={roleLabel} tone={platformAdmin ? colors.violet : colors.green} testId="pulsedesk-role-badge" />
            <ContextChip label="Session" value="OperatorOS SSO" tone={colors.green} testId="pulsedesk-session-badge" />
            <ContextChip label="Host" value={adapter.hostnames.production} tone={colors.amber} testId="pulsedesk-host-badge" />
          </div>
        </header>

        {!hasTenantContext && (
          <StatePanel
            testId="pulsedesk-no-tenant-state"
            tone={colors.red}
            Icon={AlertTriangle}
            title="No active tenant context"
            body="PulseDesk requires an OperatorOS tenant context before healthcare operations workflows can open. Return to the Command Center and select a tenant."
          />
        )}

        <div className="pulsedesk-body">
          <nav className="pulsedesk-rail" aria-label="PulseDesk sections" data-testid="pulsedesk-module-sidebar">
            {workflowShortcuts.map(({ id, label, Icon, tone }) => (
              <a
                key={id}
                href={id === 'tickets' || id === 'departments' ? '#pulsedesk-operations' : `#pulsedesk-${id}`}
                style={railLinkStyle}
                data-testid={`pulsedesk-sidebar-${id}`}
              >
                <Icon size={15} color={tone} />
                <span>{label}</span>
              </a>
            ))}
            <a href="#pulsedesk-settings" style={railLinkStyle} data-testid="pulsedesk-sidebar-settings">
              <Settings size={15} color={colors.amber} />
              <span>Settings</span>
            </a>
          </nav>

          <section className="pulsedesk-main">
            <section className="pulsedesk-card-grid" aria-label="PulseDesk readiness">
              {readinessRows.map(([label, value, tone]) => (
                <MetricTile key={label} label={label} value={value} tone={tone} />
              ))}
            </section>

            <section
              id="pulsedesk-operations"
              className="pulsedesk-panel"
              style={{ padding: 18 }}
              data-testid="pulsedesk-operations-panel"
              tabIndex={-1}
            >
              {adapter.tenantId ? (
                <PulseDeskDepartmentEscalationQueue
                  key={adapter.tenantId}
                  tenantKey={adapter.tenantId}
                />
              ) : (
                <StatePanel
                  testId="pulsedesk-operations-no-tenant"
                  tone={colors.red}
                  Icon={AlertTriangle}
                  title="Select a tenant to open the operations queue"
                  body="The live PulseDesk queue never loads without an explicit OperatorOS tenant context, including for platform administrators."
                />
              )}
            </section>

            <section className="pulsedesk-panel" style={{ padding: 18 }} data-testid="pulsedesk-workflow-map">
              <SectionHeading
                Icon={HeartPulse}
                title="Clinical operations map"
                subtitle="The department escalation queue is live; remaining workflow surfaces stay gated until their controlled migration."
              />
              <div className="pulsedesk-workflow-grid" style={{ marginTop: 14 }}>
                {workflowShortcuts.filter(({ id }) => id !== 'tickets').map(({ id, label, summary, Icon, tone }) => (
                  <WorkflowPanel key={id} id={id} label={label} summary={summary} Icon={Icon} tone={tone} />
                ))}
              </div>
            </section>

            <section className="pulsedesk-panel" style={{ padding: 18 }} data-testid="pulsedesk-empty-state-panel">
              <SectionHeading
                Icon={CheckCircle2}
                title="Current State"
                subtitle="No critical operations blockers are surfaced by the OperatorOS adapter."
              />
              <div style={emptyStateStyle} data-testid="pulsedesk-empty-state">
                <HeartPulse size={18} color={colors.green} />
                <div>
                  <div style={{ fontWeight: 800 }}>PHI-minimized department coordination is active</div>
                  <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                    OperatorOS owns the session, tenant, entitlement, and manager capability. PulseDesk stores structured operational workflow data only.
                  </div>
                </div>
              </div>
            </section>

            <section
              id="pulsedesk-settings"
              className="pulsedesk-panel"
              style={{ padding: 18 }}
              data-testid="pulsedesk-settings-panel"
              tabIndex={-1}
            >
              <SectionHeading
                Icon={ShieldCheck}
                title="Settings and Admin"
                subtitle={canManageModule ? 'Management actions are available for authorized operators.' : 'Management actions are hidden for normal module users.'}
              />
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                <AdminRow
                  label="OperatorOS authority"
                  value="Identity, billing, tenant membership, module entitlement, and root admin checks stay centralized."
                  tone={colors.green}
                />
                <AdminRow
                  label="Module-local scope"
                  value="PulseDesk owns healthcare operations workflows, feature UI, and tenant-scoped module data only."
                  tone={colors.blue}
                />
                <AdminRow
                  label="Current access"
                  value={canManageModule ? 'Administrative controls visible.' : 'Normal clinical operations view.'}
                  tone={canManageModule ? colors.amber : colors.muted}
                />
              </div>
            </section>

            <StatePanel
              testId="pulsedesk-error-state"
              tone={colors.amber}
              Icon={AlertTriangle}
              title="If a feature route fails"
              body="Keep the user in the OperatorOS shell, show the access problem plainly, and route admin fixes through Platform Command."
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
    <div style={metricTileStyle} data-testid={`pulsedesk-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
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
        <Icon size={17} color={colors.blue} />
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
    <article id={`pulsedesk-${id}`} style={workflowPanelStyle} data-testid={`pulsedesk-workflow-${id}`}>
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
      className="pulsedesk-panel"
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
  color: colors.cyan,
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
  maxWidth: 760,
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
  background: 'rgba(255, 255, 255, 0.82)',
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
  background: 'rgba(14, 165, 233, 0.10)',
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
  border: `1px solid rgba(22, 163, 74, 0.35)`,
  borderRadius: 8,
  background: 'rgba(22, 163, 74, 0.08)',
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
