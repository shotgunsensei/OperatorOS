'use client';

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
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
import PulseDeskServiceDeskWorkspace from './PulseDeskServiceDeskWorkspace';
import BusinessDirectory from './BusinessDirectory';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

interface PulseDeskShellProps {
  baseUrl?: string;
}

const colors = {
  bg: '#07111b',
  ink: '#eaf4ff',
  muted: '#9bb0c6',
  dim: '#6e849b',
  panel: '#0e1a27',
  panelSoft: '#132536',
  border: 'rgba(125, 211, 252, 0.16)',
  borderStrong: 'rgba(56, 189, 248, 0.38)',
  blue: '#38bdf8',
  cyan: '#22d3ee',
  green: '#4ade80',
  amber: '#fbbf24',
  red: '#fb7185',
  violet: '#c4b5fd',
};

const workflowShortcuts = [
  {
    id: 'tickets',
    label: 'Tickets',
    summary: 'Healthcare operations requests, escalations, assignments, replies, time, and SLA tracking.',
    Icon: ClipboardList,
    tone: colors.blue,
  },
  {
    id: 'departments',
    label: 'Departments',
    summary: 'Facility-linked department routing for imaging operations, administration, and facility teams.',
    Icon: Building2,
    tone: colors.cyan,
  },
  {
    id: 'assets',
    label: 'Assets',
    summary: 'Operational equipment and maintenance context; network and configuration authority stays in TechDeck.',
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
    id: 'notifications',
    label: 'Notifications',
    summary: 'Notify the right team without copying sensitive request details into the alert.',
    Icon: Inbox,
    tone: colors.green,
  },
];

const readinessRows = [
  ['Sign-in', 'One account', colors.green],
  ['Operational data', 'Organization-only', colors.blue],
  ['Patient charts', 'Not stored here', colors.amber],
  ['Team access', 'Based on role', colors.cyan],
];

const shellCss = `
  .pulsedesk-shell {
    min-height: 100vh;
    color-scheme: dark;
    color: ${colors.ink};
    background:
      radial-gradient(circle at 10% -4%, rgba(56, 189, 248, 0.20), transparent 31%),
      radial-gradient(circle at 90% 4%, rgba(74, 222, 128, 0.08), transparent 28%),
      linear-gradient(180deg, #0a1825 0%, ${colors.bg} 58%, #050b12 100%),
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
    background: linear-gradient(135deg, rgba(14, 26, 39, 0.97), rgba(7, 17, 27, 0.98));
    border-radius: 8px;
    padding: 22px;
    display: grid;
    gap: 18px;
    box-shadow: 0 22px 58px rgba(0, 0, 0, 0.30);
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
    grid-template-columns: minmax(180px, 236px) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .pulsedesk-rail,
  .pulsedesk-panel {
    border: 1px solid ${colors.border};
    background: rgba(14, 26, 39, 0.94);
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
  .pulsedesk-shell .directory-pulsedesk {
    --d-bg: #0a1520;
    --d-panel: #132536;
    --d-text: #eaf4ff;
    --d-muted: #9bb0c6;
    --d-border: rgba(125, 211, 252, 0.18);
    --d-accent: #38bdf8;
    --d-danger: #fb7185;
  }
  .pulsedesk-shell :is(input, select, textarea) {
    color-scheme: dark;
  }
  .pulsedesk-shell :is(input, select, textarea)::placeholder {
    color: #6e849b;
  }
  .pulsedesk-shell :is(.pds, .pdq-root, .directory-root) {
    color: ${colors.ink};
  }
  .pulsedesk-shell :is(.pds, .pdq-root, .directory-root) :is(h2, h3, h4, strong, summary) {
    color: ${colors.ink};
  }
  .pulsedesk-shell :is(input, select, textarea) {
    background: #0a1520 !important;
    color: ${colors.ink} !important;
    border-color: ${colors.border} !important;
  }
  .pulsedesk-shell :is(
    .pds-card,
    .pds-metrics article,
    .pds-ticket,
    .pds-row-button,
    .pdq-intake,
    .pdq-departments,
    .pdq-list,
    .pdq-detail,
    .pdq-card,
    .pdq-manager-controls,
    .pdq-timeline,
    .directory-root
  ) {
    background: ${colors.panel} !important;
    color: ${colors.ink} !important;
    border-color: ${colors.border} !important;
  }
  .pulsedesk-shell :is(
    .pds-form,
    .pds-empty,
    .pds-config div,
    .pds-message,
    .pds-chips span,
    .pds-route-context,
    .pdq-filters,
    .pdq-empty,
    .pdq-detail-empty,
    .pdq-department-body,
    .pdq-timeline-empty
  ) {
    background: ${colors.panelSoft} !important;
    color: ${colors.muted} !important;
    border-color: ${colors.border} !important;
  }
  .pulsedesk-shell :is(.pds-ticket.selected, .pdq-card[aria-pressed='true']) {
    background: rgba(56, 189, 248, 0.10) !important;
    border-color: ${colors.blue} !important;
  }
  .pulsedesk-shell :is(.pds-secondary, .pdq-secondary) {
    background: ${colors.panelSoft} !important;
    color: ${colors.ink} !important;
    border-color: ${colors.border} !important;
  }
  .pulsedesk-shell :is(.pds-heading p, .pds-row small, .pds-ticket small, .pds-description, .pds-config span, .pdq-heading p, .pdq-card-context, .pdq-card-footer) {
    color: ${colors.muted} !important;
  }
  .pulsedesk-shell .pds-ack {
    background: rgba(251, 191, 36, 0.10);
    color: ${colors.amber};
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

export default function PulseDeskShell(_props: PulseDeskShellProps) {
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

  if (isLoading) {
    return (
      <main className="pulsedesk-shell" data-testid="pulsedesk-module-shell">
        <style>{shellCss}</style>
        <section className="pulsedesk-wrap">
          <div style={loadingPanelStyle} data-testid="pulsedesk-loading-state" aria-busy="true">
            <Activity size={18} color={colors.blue} />
            <div>
              <div style={{ fontWeight: 800 }}>Loading PulseDesk</div>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                Preparing your departments, escalations, equipment, and team access.
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
              <div style={eyebrowStyle}>Healthcare operations coordination</div>
              <h1 style={titleStyle}>PulseDesk</h1>
              <p style={ledeStyle}>
                Coordinate requests, departments, assets, supplies, facilities, vendors, and reporting from one clinical operations workspace.
              </p>
            </div>
            <div className="pulsedesk-actions">
              <HeaderLink href="#pulsedesk-operations" testId="pulsedesk-open-request-queue" Icon={ClipboardList}>
                Open request queue
              </HeaderLink>
              {canManageModule && (
                <HeaderLink href="#pulsedesk-settings" testId="pulsedesk-module-settings-link" Icon={Settings}>
                  Manage PulseDesk
                </HeaderLink>
              )}
              {platformAdmin && (
                <HeaderLink href={`${DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}app/platform/modules/pulsedesk`} testId="pulsedesk-platform-manage-link" Icon={ShieldCheck}>
                  Platform settings
                </HeaderLink>
              )}
              <HeaderLink href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl} testId="pulsedesk-return-command-center" Icon={ExternalLink}>
                Return to My Apps
              </HeaderLink>
            </div>
          </div>

          <div className="pulsedesk-chip-row">
            <ContextChip label="Organization" value={tenantLabel} tone={hasTenantContext ? colors.blue : colors.red} testId="pulsedesk-tenant-badge" />
            <ContextChip label="Role" value={roleLabel} tone={platformAdmin ? colors.violet : colors.green} testId="pulsedesk-role-badge" />
            <ContextChip label="Sign-in" value="Protected by OperatorOS" tone={colors.green} testId="pulsedesk-session-badge" />
            {platformAdmin && <ContextChip label="Module address" value={adapter.hostnames.production} tone={colors.amber} testId="pulsedesk-host-badge" />}
          </div>
        </header>

        {!hasTenantContext && (
          <StatePanel
            testId="pulsedesk-empty-state"
            tone={colors.red}
            Icon={AlertTriangle}
            title="Choose an organization"
            body="Return to My Apps and choose the organization whose operational requests you want to manage."
          />
        )}

        <div className="pulsedesk-body">
          <nav className="pulsedesk-rail" aria-label="PulseDesk sections" data-testid="pulsedesk-module-sidebar">
            {workflowShortcuts.map(({ id, label, Icon, tone }) => (
              <a
                key={id}
                href={id === 'tickets' || id === 'departments'
                  ? '#pulsedesk-operations'
                  : id === 'vendors' || id === 'facilities'
                    ? '#pulsedesk-directory'
                    : `#pulsedesk-${id}`}
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
                <div style={{ display: 'grid', gap: 16 }}>
                  <PulseDeskServiceDeskWorkspace
                    key={`service-desk-${adapter.tenantId}`}
                    tenantKey={adapter.tenantId}
                    canManageModule={canManageModule}
                  />
                  <details style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Department escalation intake and routing</summary>
                    <div style={{ marginTop: 12 }}>
                      <PulseDeskDepartmentEscalationQueue
                        key={`department-queue-${adapter.tenantId}`}
                        tenantKey={adapter.tenantId}
                      />
                    </div>
                  </details>
                </div>
              ) : (
                <StatePanel
                  testId="pulsedesk-operations-no-tenant"
                  tone={colors.red}
                  Icon={AlertTriangle}
                  title="Select an organization to open the operations queue"
                  body="Choose the organization whose departments, tickets, and escalations you want to manage."
                />
              )}
            </section>

            {adapter.tenantId && (
              <section id="pulsedesk-directory" tabIndex={-1}>
                <BusinessDirectory moduleSlug="pulsedesk" tenantKey={adapter.tenantId} canArchive={canManageModule} />
              </section>
            )}

            <section className="pulsedesk-panel" style={{ padding: 18 }} data-testid="pulsedesk-workflow-map">
              <SectionHeading
                Icon={HeartPulse}
                title="Healthcare operations map"
                subtitle="Move operational work between departments while keeping patient and clinical records out of PulseDesk."
              />
              <div className="pulsedesk-workflow-grid" style={{ marginTop: 14 }}>
                {workflowShortcuts.filter(({ id }) => id !== 'tickets').map(({ id, label, summary, Icon, tone }) => (
                  <WorkflowPanel key={id} id={id} label={label} summary={summary} Icon={Icon} tone={tone} />
                ))}
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
                title="Access and settings"
                subtitle={canManageModule ? 'You can manage this tool because you are an organization administrator.' : 'Your administrator controls team access and settings.'}
              />
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                <AdminRow
                  label="Account and access"
                  value="OperatorOS manages sign-in, subscription access, and workspace membership."
                  tone={colors.green}
                />
                <AdminRow
                  label="Data boundary"
                  value="PulseDesk is for operational coordination, not patient charts or clinical records."
                  tone={colors.blue}
                />
                <AdminRow
                  label="Current access"
                  value={canManageModule ? 'You can manage team access and settings.' : 'You can use the healthcare operations workflows assigned to you.'}
                  tone={canManageModule ? colors.amber : colors.muted}
                />
              </div>
            </section>

            <StatePanel
              testId="pulsedesk-error-state"
              tone={colors.amber}
              Icon={AlertTriangle}
              title="Need help?"
              body="Try the action again. If you still cannot open a request, contact your organization administrator. A failed attempt will not change existing requests."
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
      <div style={{ marginTop: 12, color: colors.amber, fontSize: 12, fontWeight: 800 }}>
        Available in PulseDesk
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
  background: 'rgba(19, 37, 54, 0.92)',
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
  background: 'rgba(14, 26, 39, 0.96)',
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
  background: 'rgba(14, 26, 39, 0.86)',
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
  background: 'rgba(14, 26, 39, 0.96)',
  borderRadius: 8,
  padding: 18,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
};
