'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2, Users as UsersIcon, Boxes, Activity,
  CreditCard, UserPlus, Store, Receipt, AlertTriangle,
} from 'lucide-react';
import {
  cardStyle, panelStyle, buttonStyles, badgeStyles,
  semantic, space, fontSize,
} from '@/lib/design-tokens';
import { tenantApi, meApi, billingApi, adminApi } from '@/lib/auth';

interface Props {
  onNavigate: (page: string) => void;
}

interface ActivityRow { id: string; action: string; createdAt: string; }

export default function TenantCommandCenterPage({ onNavigate }: Props) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantStatus, setTenantStatus] = useState<string>('');
  const [memberCount, setMemberCount] = useState<number>(0);
  const [pendingInvites, setPendingInvites] = useState<number>(0);
  const [moduleCount, setModuleCount] = useState<number>(0);
  const [planSlug, setPlanSlug] = useState<string>('starter');
  const [planStatus, setPlanStatus] = useState<string>('unknown');
  const [aiCalls, setAiCalls] = useState<number | null>(null);
  const [recent, setRecent] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await meApi.tenants();
        const current = me.current ?? me.tenants?.[0]?.id;
        if (!current) { if (alive) setLoading(false); return; }
        const t = me.tenants.find((x: any) => x.id === current);
        if (alive && t) {
          setTenantId(t.id);
          setTenantName(t.name);
          setTenantStatus(t.status ?? 'active');
        }
        const [users, mods, invites, sub, usage, audit] = await Promise.all([
          tenantApi.listUsers(current).catch(() => ({ users: [] })),
          tenantApi.listModules(current).catch(() => ({ modules: [] })),
          tenantApi.listInvites(current).catch(() => ({ invites: [] })),
          billingApi.getSubscription().catch(() => null),
          billingApi.getUsage().catch(() => null),
          adminApi.getAuditLog({ page: 1 }).catch(() => ({ entries: [] })),
        ]);
        if (!alive) return;
        setMemberCount(users.users?.length ?? 0);
        setPendingInvites(invites.invites?.length ?? 0);
        setModuleCount(
          (mods.modules ?? []).filter((m: any) => m.status !== 'archived' && m.status !== 'disabled').length,
        );
        setPlanSlug(sub?.subscription?.planSlug ?? sub?.plan?.slug ?? sub?.planSlug ?? 'starter');
        setPlanStatus(sub?.subscription?.status ?? sub?.status ?? 'unknown');
        setAiCalls(usage?.aiCallsThisMonth ?? null);
        const entries = (audit?.entries ?? audit?.auditLog ?? []) as any[];
        setRecent(
          entries.slice(0, 5).map((row: any) => ({
            id: row.id, action: row.action, createdAt: row.createdAt,
          })),
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const planBadge =
    planStatus === 'active'   ? badgeStyles.success
    : planStatus === 'trialing' ? badgeStyles.info
    : planStatus === 'past_due' ? badgeStyles.warning
    : planStatus === 'canceled' || planStatus === 'unpaid' ? badgeStyles.danger
    : badgeStyles.neutral;

  const stat = (label: string, value: React.ReactNode, Icon: any, action?: { page: string; label: string }) => (
    <div
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: space.md }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={18} color={semantic.accent} />
        <div style={{ fontSize: fontSize.sm, color: semantic.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{value}</div>
      {action && (
        <button
          data-testid={`button-go-${action.page}`}
          onClick={() => onNavigate(action.page)}
          style={{ ...buttonStyles.ghost, alignSelf: 'flex-start' }}
        >{action.label} \u2192</button>
      )}
    </div>
  );

  return (
    <div style={{ padding: space.xxl, maxWidth: 1200, margin: '0 auto' }} data-testid="page-command-center">
      <header style={{ marginBottom: space.xl, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Building2 size={28} color={semantic.accent} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#fff' }}>{tenantName || 'Tenant Command Center'}</h1>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            Operational overview for the active tenant.
          </p>
        </div>
        {tenantStatus && tenantStatus !== 'active' && (
          <span data-testid="tenant-status-badge" style={badgeStyles.warning}>
            <AlertTriangle size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {tenantStatus}
          </span>
        )}
      </header>

      {/* Primary CTAs */}
      <section
        data-testid="cc-primary-ctas"
        style={{
          display: 'grid', gap: space.sm, marginBottom: space.xl,
          gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
        }}
      >
        <button
          data-testid="cta-invite-member"
          onClick={() => onNavigate('tenant-users')}
          style={{ ...buttonStyles.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <UserPlus size={14} /> Invite member
        </button>
        <button
          data-testid="cta-browse-marketplace"
          onClick={() => onNavigate('apps')}
          style={{ ...buttonStyles.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Store size={14} /> Browse marketplace
        </button>
        <button
          data-testid="cta-manage-billing"
          onClick={() => onNavigate('tenant-billing')}
          style={{ ...buttonStyles.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Receipt size={14} /> Manage billing
        </button>
      </section>

      {loading ? (
        <div style={{ color: semantic.textMuted, padding: space.xl }} data-testid="cc-loading">Loading\u2026</div>
      ) : !tenantId ? (
        <div style={{ color: semantic.textMuted, padding: space.xl }} data-testid="cc-no-tenant">
          No active tenant. Switch tenant from the user menu.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: space.lg, marginBottom: space.xl }}>
            {stat('Members', memberCount, UsersIcon, { page: 'tenant-users', label: 'Manage members' })}
            {stat('Pending invites', pendingInvites, UserPlus, { page: 'tenant-users', label: 'Review invites' })}
            {stat('Active modules', moduleCount, Boxes, { page: 'tenant-modules', label: 'Manage modules' })}
            <div data-testid="stat-billing" style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: space.md }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CreditCard size={18} color={semantic.accent} />
                <div style={{ fontSize: fontSize.sm, color: semantic.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Plan</div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{planSlug}</div>
              <div><span style={planBadge}>{planStatus}</span></div>
              <button
                data-testid="button-go-tenant-billing"
                onClick={() => onNavigate('tenant-billing')}
                style={{ ...buttonStyles.ghost, alignSelf: 'flex-start' }}
              >Manage billing \u2192</button>
            </div>
            {aiCalls != null && stat('AI calls (mo)', aiCalls, Activity)}
          </div>

          {/* Recent activity */}
          <section data-testid="cc-recent-activity" style={panelStyle}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${semantic.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} color={semantic.accent} />
              <h2 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>Recent activity</h2>
            </div>
            {recent.length === 0 ? (
              <div data-testid="cc-activity-empty" style={{ padding: space.lg, color: semantic.textMuted, fontSize: fontSize.body }}>
                No recent audit events visible to your role.
              </div>
            ) : recent.map(r => (
              <div
                key={r.id}
                data-testid={`activity-${r.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: `1px solid ${semantic.border}` }}
              >
                <div style={{ flex: 1, fontSize: fontSize.body, color: semantic.text }}>{r.action.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: fontSize.xs, color: semantic.textMuted }}>
                  {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
