'use client';

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileLock2,
  Gauge,
  LifeBuoy,
  LockKeyhole,
  Network,
  ServerCog,
  Settings,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { hasPlatformAdminAuthority } from '../../../../../packages/auth/index.js';
import { createTechDeckAdapterContext } from '../../../../../apps/modules/techdeck/adapter.js';
import TechDeckTicketQueue from './TechDeckTicketQueue';
import TechDeckOperations from './TechDeckOperations';
import BusinessDirectory from './BusinessDirectory';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

interface TechDeckShellProps {
  baseUrl?: string;
}

const colors = {
  bg: '#05070d',
  panel: '#0d1320',
  panelSoft: '#101826',
  panelDeep: '#080d16',
  border: 'rgba(148, 163, 184, 0.18)',
  borderStrong: 'rgba(56, 189, 248, 0.34)',
  text: '#e5eefc',
  muted: '#8fa3bd',
  dim: '#5f7189',
  cyan: '#38bdf8',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  violet: '#a78bfa',
};

const workflowShortcuts = [
  {
    id: 'tickets',
    label: 'Tickets',
    summary: 'Queue triage, assignment, SLA pressure, and technician ownership.',
    Icon: TicketCheck,
    tone: colors.cyan,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    summary: 'Client-linked configuration items, device posture, and support context.',
    Icon: ServerCog,
    tone: colors.green,
  },
  {
    id: 'network',
    label: 'Network / IPAM',
    summary: 'Firewalls, switches, VLANs, subnets, addresses, and configuration relationships.',
    Icon: Network,
    tone: colors.amber,
  },
  {
    id: 'lifecycle',
    label: 'Lifecycle',
    summary: 'Renewal, expiration, warranty, health, and incomplete-record posture.',
    Icon: Activity,
    tone: colors.violet,
  },
  {
    id: 'documentation',
    label: 'Documentation',
    summary: 'Versioned knowledge, procedures, diagrams, and review workflows.',
    Icon: FileLock2,
    tone: colors.cyan,
  },
  { id: 'runbooks', label: 'Runbooks', summary: 'Approval-controlled, documentation-only procedures.', Icon: ShieldCheck, tone: colors.green },
  { id: 'evidence', label: 'Evidence', summary: 'Capture observations, snapshots, tests, and attachments for managed systems.', Icon: FileLock2, tone: colors.amber },
  {
    id: 'reports',
    label: 'Reports',
    summary: 'Checksummed infrastructure, lifecycle, ticket, evidence, and time snapshots.',
    Icon: BarChart3,
    tone: colors.green,
  },
  { id: 'time', label: 'Time', summary: 'Technician work tied to tickets, clients, sites, and configuration items.', Icon: Gauge, tone: colors.violet },
  { id: 'clients', label: 'Clients', summary: 'Shared OperatorOS clients, sites, contacts, and managed-service profiles.', Icon: Network, tone: colors.cyan },
];

const readinessRows = [
  ['Access', 'Secure', colors.green],
  ['Directory', 'Connected', colors.cyan],
  ['Operations', 'Shared', colors.amber],
  ['Sign-in', 'One account', colors.green],
];

const shellCss = `
  .techdeck-shell {
    min-height: 100vh;
    background:
      radial-gradient(circle at 12% 0%, rgba(56, 189, 248, 0.16), transparent 28%),
      radial-gradient(circle at 92% 10%, rgba(34, 197, 94, 0.08), transparent 26%),
      ${colors.bg};
    color: ${colors.text};
    padding: 24px;
  }
  .techdeck-wrap {
    max-width: 1240px;
    margin: 0 auto;
    display: grid;
    gap: 16px;
  }
  .techdeck-header {
    border: 1px solid ${colors.borderStrong};
    background: linear-gradient(135deg, rgba(13, 19, 32, 0.94), rgba(8, 13, 22, 0.98));
    border-radius: 8px;
    padding: 22px;
    display: grid;
    gap: 18px;
  }
  .techdeck-header-top,
  .techdeck-actions,
  .techdeck-chip-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .techdeck-body {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .techdeck-rail,
  .techdeck-panel {
    border: 1px solid ${colors.border};
    background: rgba(13, 19, 32, 0.92);
    border-radius: 8px;
  }
  .techdeck-rail {
    position: sticky;
    top: 18px;
    padding: 12px;
    display: grid;
    gap: 8px;
  }
  .techdeck-main {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .techdeck-card-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .techdeck-workflow-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 920px) {
    .techdeck-body {
      grid-template-columns: 1fr;
    }
    .techdeck-rail {
      position: static;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .techdeck-card-grid,
    .techdeck-workflow-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 620px) {
    .techdeck-shell {
      padding: 14px;
    }
    .techdeck-header {
      padding: 16px;
    }
    .techdeck-rail,
    .techdeck-card-grid,
    .techdeck-workflow-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export default function TechDeckShell({ baseUrl }: TechDeckShellProps) {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const fallbackTenantId = user?.currentTenantId ?? getActiveTenantId();
  const tenantId = activeTenant?.id ?? fallbackTenantId;
  const platformAdmin = hasPlatformAdminAuthority(user);
  const adapterRole = platformAdmin ? 'admin' : activeRole ?? 'member';

  const adapter = useMemo(() => createTechDeckAdapterContext({
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
    entitlements: { modules: [{ slug: 'techdeck', enabled: true }] },
    platformAdmin,
  }), [adapterRole, platformAdmin, tenantId, user]);

  const isLoading = authLoading || tenantLoading;
  const hasTenantContext = !!adapter.tenantId;
  const roleLabel = platformAdmin
    ? 'Platform super admin'
    : activeRole
      ? `Organization ${activeRole}`
      : adapter.localRole;
  const tenantLabel = activeTenant?.name ?? adapter.tenantId ?? 'No organization selected';
  const canManageModule = platformAdmin || activeRole === 'owner' || activeRole === 'admin';
  const canWriteModule = platformAdmin || activeRole !== 'viewer';
  const externalLaunchUrl = baseUrl && /^https?:\/\//i.test(baseUrl) ? baseUrl.replace(/\/+$/, '') : null;

  if (isLoading) {
    return (
      <main className="techdeck-shell" data-testid="techdeck-module-shell">
        <style>{shellCss}</style>
        <section className="techdeck-wrap">
          <div style={loadingPanelStyle} data-testid="techdeck-loading-state" aria-busy="true">
            <Gauge size={18} color={colors.cyan} />
            <div>
              <div style={{ fontWeight: 800 }}>Loading TechDeck</div>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                Preparing your tickets, systems, documentation, and team access.
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="techdeck-shell" data-testid="techdeck-module-shell">
      <style>{shellCss}</style>
      <section className="techdeck-wrap">
        <header
          id="techdeck-overview"
          className="techdeck-header"
          data-testid="techdeck-module-header"
          tabIndex={-1}
        >
          <div className="techdeck-header-top">
            <div style={{ minWidth: 0 }}>
              <div style={eyebrowStyle}>MSP operations command layer</div>
              <h1 style={titleStyle}>TechDeck</h1>
              <p style={ledeStyle}>
                Technician workspace for tickets, configuration inventory, network/IPAM, lifecycle, documentation, evidence, and time.
              </p>
            </div>
            <div className="techdeck-actions">
              <HeaderLink href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl} testId="techdeck-return-command-center" Icon={ArrowLeft}>
                Command Center
              </HeaderLink>
              {canManageModule && (
                <HeaderLink href="#techdeck-settings" testId="techdeck-module-settings-link" Icon={Settings}>
                  Settings
                </HeaderLink>
              )}
              {platformAdmin && (
                <HeaderLink href={`${DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}app/platform/modules/techdeck`} testId="techdeck-platform-manage-link" Icon={ShieldCheck}>
                  Platform Command
                </HeaderLink>
              )}
              {externalLaunchUrl && (
                <HeaderLink href={externalLaunchUrl} testId="techdeck-external-launch-link" Icon={ExternalLink}>
                  External Module
                </HeaderLink>
              )}
            </div>
          </div>

          <div className="techdeck-chip-row">
            <ContextChip label="Organization" value={tenantLabel} tone={hasTenantContext ? colors.cyan : colors.red} testId="techdeck-tenant-badge" />
            <ContextChip label="Role" value={roleLabel} tone={platformAdmin ? colors.violet : colors.green} testId="techdeck-role-badge" />
            <ContextChip label="Session" value="OperatorOS SSO" tone={colors.green} testId="techdeck-session-badge" />
            <ContextChip label="Host" value={adapter.hostnames.production} tone={colors.amber} testId="techdeck-host-badge" />
          </div>
        </header>

        {!hasTenantContext && (
          <StatePanel
            testId="techdeck-no-tenant-state"
            tone={colors.red}
            Icon={AlertTriangle}
            title="Choose an organization"
            body="Select an organization in the Command Center to open its technician workspace."
          />
        )}

        <div className="techdeck-body">
          <nav className="techdeck-rail" aria-label="TechDeck sections" data-testid="techdeck-module-sidebar">
            {workflowShortcuts.map(({ id, label, Icon, tone }) => (
              <a
                key={id}
                href={id === 'tickets'
                  ? '#techdeck-ticket-queue'
                  : id === 'clients'
                    ? '#techdeck-directory'
                    : `#techdeck-${id}`}
                style={railLinkStyle}
                data-testid={`techdeck-sidebar-${id}`}
              >
                <Icon size={15} color={tone} />
                <span>{label}</span>
              </a>
            ))}
            <a href="#techdeck-settings" style={railLinkStyle} data-testid="techdeck-sidebar-settings">
              <Settings size={15} color={colors.amber} />
              <span>Settings</span>
            </a>
          </nav>

          <section className="techdeck-main">
            <section className="techdeck-card-grid" aria-label="TechDeck readiness">
              {readinessRows.map(([label, value, tone]) => (
                <MetricTile key={label} label={label} value={value} tone={tone} />
              ))}
            </section>

            <section
              id="techdeck-ticket-queue"
              data-testid="techdeck-ticket-queue-panel"
              tabIndex={-1}
            >
              {hasTenantContext && adapter.tenantId && user && (
                <TechDeckTicketQueue
                  key={adapter.tenantId}
                  currentUserId={user.id}
                  canManageTickets={canManageModule}
                  tenantKey={adapter.tenantId}
                />
              )}
            </section>

            {hasTenantContext && adapter.tenantId && (
              <TechDeckOperations
                key={`ops-${adapter.tenantId}`}
                tenantKey={adapter.tenantId}
                canWrite={canWriteModule}
                canApprove={canManageModule}
              />
            )}

            {hasTenantContext && adapter.tenantId && (
              <section id="techdeck-directory" tabIndex={-1}>
                <BusinessDirectory moduleSlug="techdeck" tenantKey={adapter.tenantId} canArchive={canManageModule} />
              </section>
            )}

            <section className="techdeck-panel" style={{ padding: 18 }} data-testid="techdeck-empty-state-panel">
              <SectionHeading
                Icon={CheckCircle2}
                title="Consolidation boundary"
                subtitle="Your organization, permissions, contacts, attachments, and activity history carry across the workspace."
              />
              <div style={emptyStateStyle} data-testid="techdeck-empty-state">
                <Sparkles size={18} color={colors.green} />
                <div>
                  <div style={{ fontWeight: 800 }}>Your IT operations workspace is ready</div>
                  <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                    Tickets, infrastructure, networks, documentation, evidence, reports, and technician time are available from one connected console.
                  </div>
                </div>
              </div>
            </section>

            <section
              id="techdeck-settings"
              className="techdeck-panel"
              style={{ padding: 18 }}
              data-testid="techdeck-settings-panel"
              tabIndex={-1}
            >
              <SectionHeading
                Icon={LockKeyhole}
                title="Settings and Admin"
                subtitle={canManageModule ? 'Management actions are available for authorized operators.' : 'Management actions are hidden for normal module users.'}
              />
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                <AdminRow
                  label="Account and access"
                  value="OperatorOS manages sign-in, subscription access, and workspace membership."
                  tone={colors.green}
                />
                <AdminRow
                  label="Managed operations"
                  value="TechDeck keeps your technical documentation, infrastructure records, evidence, and support work together."
                  tone={colors.cyan}
                />
                <AdminRow
                  label="Current access"
                  value={canManageModule ? 'Administrative controls visible.' : 'Normal user view.'}
                  tone={canManageModule ? colors.amber : colors.muted}
                />
              </div>
            </section>

            <StatePanel
              testId="techdeck-error-state"
              tone={colors.amber}
              Icon={LifeBuoy}
              title="Need help?"
              body="Retry the action first. If access is blocked, ask your workspace administrator to review your TechDeck permissions."
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
    <div style={metricTileStyle} data-testid={`techdeck-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
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
        <Icon size={17} color={colors.cyan} />
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
    <article id={`techdeck-${id}`} style={workflowPanelStyle} data-testid={`techdeck-workflow-${id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...smallIconStyle, borderColor: `${tone}66` }}>
          <Icon size={16} color={tone} />
        </span>
        <h3 style={{ margin: 0, fontSize: 15 }}>{label}</h3>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.45, margin: '10px 0 0' }}>{summary}</p>
      <div style={{ marginTop: 12, color: colors.amber, fontSize: 12, fontWeight: 800 }}>
        Available in Operations Workspace
      </div>
    </article>
  );
}

function AdminRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={adminRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: colors.text, fontSize: 13, fontWeight: 800 }}>{label}</div>
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
      className="techdeck-panel"
      data-testid={testId}
      style={{ padding: 16, borderColor: `${tone}66`, background: `${colors.panelDeep}` }}
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
  color: colors.text,
  background: 'rgba(15, 23, 42, 0.78)',
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
  background: 'rgba(8, 13, 22, 0.82)',
  fontSize: 12,
  minWidth: 0,
};

const railLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '10px 11px',
  borderRadius: 8,
  color: colors.text,
  background: 'rgba(8, 13, 22, 0.55)',
  border: `1px solid ${colors.border}`,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 800,
};

const metricTileStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: 'rgba(13, 19, 32, 0.92)',
  padding: 14,
  minHeight: 96,
};

const sectionIconStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: 'rgba(56, 189, 248, 0.1)',
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
  background: 'rgba(8, 13, 22, 0.7)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
};

const workflowPanelStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: 14,
  background: 'rgba(8, 13, 22, 0.62)',
  minWidth: 0,
};

const emptyStateStyle: CSSProperties = {
  marginTop: 14,
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  border: `1px solid rgba(34, 197, 94, 0.35)`,
  borderRadius: 8,
  background: 'rgba(34, 197, 94, 0.08)',
  padding: 14,
};

const adminRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: 'rgba(8, 13, 22, 0.55)',
  padding: 12,
};

const loadingPanelStyle: CSSProperties = {
  border: `1px solid ${colors.borderStrong}`,
  background: 'rgba(13, 19, 32, 0.92)',
  borderRadius: 8,
  padding: 18,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
};
