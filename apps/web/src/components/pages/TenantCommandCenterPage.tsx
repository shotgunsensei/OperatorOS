'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, Users as UsersIcon, Boxes, Activity,
  CreditCard, UserPlus, Store, Receipt, AlertTriangle,
  TrendingUp, Calendar,
} from 'lucide-react';
import {
  cardStyle, panelStyle, buttonStyles, badgeStyles,
  semantic, space, fontSize,
} from '@/lib/design-tokens';
import { tenantApi, meApi, billingApi } from '@/lib/auth';

interface Props {
  onNavigate: (page: string) => void;
}

interface ActivityRow {
  id: string;
  action: string;
  createdAt: string;
  actorName: string;
  targetUserName: string | null;
  targetType: string | null;
}

interface UsageDay { date: string; count: number; byTargetType: Record<string, number>; }

interface ModuleSeries {
  moduleSlug: string;
  moduleName: string | null;
  total: number;
  byAction: Record<string, number>;
  byDay: { date: string; count: number }[];
}

interface AddonRow {
  id: string;
  moduleSlug: string | null;
  moduleName: string | null;
  status: string;
  amount: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface BillingSummary {
  activePlanSubscriptions: number;
  activeAddonSubscriptions: number;
  nextRenewal: string | null;
  addons: AddonRow[];
}

interface ActivityResponse {
  recentEvents: ActivityRow[];
  usageByDay: UsageDay[];
  usageByModule: ModuleSeries[];
  aiActions30d: number;
  billing: BillingSummary;
}

function formatDate(d: string | null): string {
  if (!d) return '\u2014';
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TenantCommandCenterPage({ onNavigate }: Props) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantStatus, setTenantStatus] = useState<string>('');
  const [memberCount, setMemberCount] = useState<number>(0);
  const [pendingInvites, setPendingInvites] = useState<number>(0);
  const [moduleCount, setModuleCount] = useState<number>(0);
  const [planSlug, setPlanSlug] = useState<string>('starter');
  const [planStatus, setPlanStatus] = useState<string>('unknown');
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
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
        const [users, mods, invites, sub, act] = await Promise.all([
          tenantApi.listUsers(current).catch(() => ({ users: [] })),
          tenantApi.listModules(current).catch(() => ({ modules: [] })),
          tenantApi.listInvites(current).catch(() => ({ invites: [] })),
          billingApi.getSubscription().catch(() => null),
          tenantApi.getActivity(current).catch(() => null),
        ]);
        if (!alive) return;
        setMemberCount(users.users?.length ?? 0);
        setPendingInvites(invites.invites?.length ?? 0);
        setModuleCount(
          (mods.modules ?? []).filter((m: any) => m.status !== 'archived' && m.status !== 'disabled').length,
        );
        setPlanSlug(sub?.subscription?.planSlug ?? sub?.plan?.slug ?? sub?.planSlug ?? 'starter');
        setPlanStatus(sub?.subscription?.status ?? sub?.status ?? 'unknown');
        setActivity(act);
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

  const moduleSeriesMax = useMemo(() => {
    let m = 1;
    for (const series of activity?.usageByModule ?? []) {
      for (const d of series.byDay) if (d.count > m) m = d.count;
    }
    return m;
  }, [activity]);

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
            {activity && stat('AI actions (30d)', activity.aiActions30d, Activity)}
          </div>

          {/* Billing summary */}
          {activity && (
            <section data-testid="cc-billing-summary" style={{ ...panelStyle, marginBottom: space.xl }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${semantic.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={14} color={semantic.accent} />
                <h2 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>Billing summary</h2>
              </div>
              <div style={{ padding: space.lg, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: space.lg }}>
                <div data-testid="billing-active-plan-subs">
                  <div style={{ fontSize: fontSize.sm, color: semantic.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active plan subs</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginTop: 4 }}>{activity.billing.activePlanSubscriptions}</div>
                </div>
                <div data-testid="billing-active-addons">
                  <div style={{ fontSize: fontSize.sm, color: semantic.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active add-ons</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginTop: 4 }}>{activity.billing.activeAddonSubscriptions}</div>
                </div>
                <div data-testid="billing-next-renewal">
                  <div style={{ fontSize: fontSize.sm, color: semantic.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Next renewal</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} color={semantic.textMuted} />
                    {formatDate(activity.billing.nextRenewal)}
                  </div>
                </div>
              </div>
              {activity.billing.addons.length > 0 && (
                <div style={{ borderTop: `1px solid ${semantic.border}` }}>
                  {activity.billing.addons.map(a => (
                    <div
                      key={a.id}
                      data-testid={`billing-addon-${a.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: `1px solid ${semantic.border}` }}
                    >
                      <div style={{ flex: 1, fontSize: fontSize.body, color: semantic.text }}>
                        {a.moduleName ?? a.moduleSlug ?? 'Add-on'}
                      </div>
                      <div style={{ fontSize: fontSize.xs, color: semantic.textMuted }}>
                        {formatCurrency(a.amount)} \u00b7 renews {formatDate(a.currentPeriodEnd)}
                        {a.cancelAtPeriodEnd ? ' (cancels)' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Per-module usage chart (last 30 days) */}
          {activity && (
            <section data-testid="cc-usage-chart" style={{ ...panelStyle, marginBottom: space.xl }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${semantic.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={14} color={semantic.accent} />
                <h2 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>
                  Module activity (last 30 days)
                </h2>
                <span
                  title="Counts admin/audit events recorded for each module (enable/disable, access grants, add-on checkouts). Not end-user runtime usage."
                  style={{ marginLeft: 'auto', fontSize: fontSize.xs, color: semantic.textMuted }}
                >
                  Admin events: {activity.usageByDay.reduce((s, d) => s + d.count, 0)}
                </span>
              </div>
              <div
                data-testid="cc-usage-source-note"
                style={{ padding: '0 16px 8px', fontSize: fontSize.xs, color: semantic.textMuted }}
              >
                Based on tenant audit events (module enable/disable, access grants, add-on checkouts), not end-user runtime usage.
              </div>
              {activity.usageByModule.length === 0 ? (
                <div data-testid="cc-usage-empty" style={{ padding: space.lg, color: semantic.textMuted, fontSize: fontSize.body }}>
                  No modules enabled yet for this tenant.
                </div>
              ) : (
                <div style={{ padding: space.lg, display: 'flex', flexDirection: 'column', gap: space.lg }}>
                  {activity.usageByModule.map(series => (
                    <div
                      key={series.moduleSlug}
                      data-testid={`module-usage-${series.moduleSlug}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                        <div style={{ fontSize: fontSize.body, color: semantic.text, fontWeight: 600 }}>
                          {series.moduleName ?? series.moduleSlug}
                        </div>
                        <div style={{ fontSize: fontSize.xs, color: semantic.textMuted }}>
                          {series.total} event{series.total === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div
                        style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}
                        data-testid={`module-bars-${series.moduleSlug}`}
                      >
                        {series.byDay.map(d => {
                          const h = Math.round((d.count / moduleSeriesMax) * 100);
                          return (
                            <div
                              key={d.date}
                              data-testid={`module-bar-${series.moduleSlug}-${d.date}`}
                              title={`${d.date}: ${d.count} event${d.count === 1 ? '' : 's'}`}
                              style={{
                                flex: 1, minWidth: 3,
                                height: `${Math.max(h, 2)}%`,
                                background: d.count > 0 ? semantic.accent : semantic.border,
                                borderRadius: 2,
                                opacity: d.count > 0 ? 1 : 0.4,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fontSize.xs, color: semantic.textMuted }}>
                    <span>{activity.usageByDay[0]?.date ?? ''}</span>
                    <span>{activity.usageByDay[activity.usageByDay.length - 1]?.date ?? ''}</span>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Recent activity */}
          <section data-testid="cc-recent-activity" style={panelStyle}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${semantic.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} color={semantic.accent} />
              <h2 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>Recent activity</h2>
            </div>
            {!activity || activity.recentEvents.length === 0 ? (
              <div data-testid="cc-activity-empty" style={{ padding: space.lg, color: semantic.textMuted, fontSize: fontSize.body }}>
                No recent audit events visible to your role.
              </div>
            ) : activity.recentEvents.map(r => (
              <div
                key={r.id}
                data-testid={`activity-${r.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: `1px solid ${semantic.border}` }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: fontSize.body, color: semantic.text }}>{r.action.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: fontSize.xs, color: semantic.textMuted }}>
                    by {r.actorName}
                    {r.targetUserName ? ` \u2192 ${r.targetUserName}` : ''}
                    {r.targetType && !r.targetUserName ? ` \u00b7 ${r.targetType}` : ''}
                  </div>
                </div>
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
