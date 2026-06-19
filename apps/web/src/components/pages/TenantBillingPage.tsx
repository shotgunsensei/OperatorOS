'use client';

import React, { useEffect, useState } from 'react';
import { Receipt, CreditCard, Package, ExternalLink, ShieldAlert } from 'lucide-react';
import {
  colors, cardStyle, panelStyle, badgeStyles, buttonStyles,
  semantic, space, fontSize,
} from '@/lib/design-tokens';
import { billingApi, meApi, modulesApi } from '@/lib/auth';

interface AddonRow {
  module: { slug: string; name: string };
  cta: string;
  access_source: string | null;
  addon_price_cents: number | null;
  unlocked: boolean;
}

export default function TenantBillingPage() {
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantRole, setTenantRole] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [usage, setUsage] = useState<any | null>(null);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    const me = await meApi.tenants();
    const current = me.current ?? me.tenants?.[0]?.id ?? null;
    const t = current ? me.tenants.find((x: any) => x.id === current) : null;
    if (t) { setTenantName(t.name); setTenantRole(t.role ?? null); }
    const [sub, use, mods] = await Promise.all([
      billingApi.getSubscription().catch(() => null),
      billingApi.getUsage().catch(() => null),
      modulesApi.list().catch(() => ({ modules: [] })),
    ]);
    setSubscription(sub);
    setUsage(use);
    const all: AddonRow[] = (mods.modules ?? []) as any;
    setAddons(all.filter(m =>
      m.access_source === 'addon' || m.cta === 'buy_addon',
    ));
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try { await refresh(); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const isOwner = tenantRole === 'owner';

  const openPortal = async () => {
    setErr(null); setBusy('portal');
    try {
      const r = await billingApi.createPortalSession();
      if (r?.url) {
        const { openExternal } = await import('@/lib/launch');
        await openExternal(r.url);
      } else setErr('Billing portal not configured');
    } catch (e: any) {
      setErr(e?.error || 'Could not open billing portal');
    } finally { setBusy(null); }
  };

  const cancelAddon = async (slug: string) => {
    if (!confirm(`Cancel the ${slug} add-on at end of period?`)) return;
    setErr(null); setBusy(slug);
    try {
      await modulesApi.cancelAddon(slug);
      await refresh();
    } catch (e: any) {
      setErr(e?.error || 'Could not cancel add-on');
    } finally { setBusy(null); }
  };

  const planSlug = subscription?.subscription?.planSlug
    ?? subscription?.plan?.slug
    ?? subscription?.planSlug
    ?? 'starter';
  const status = subscription?.subscription?.status
    ?? subscription?.status
    ?? 'unknown';

  const statusBadge =
    status === 'active'   ? badgeStyles.success
    : status === 'trialing' ? badgeStyles.info
    : status === 'past_due' ? badgeStyles.warning
    : status === 'canceled' || status === 'unpaid' ? badgeStyles.danger
    : badgeStyles.neutral;

  return (
    <div style={{ padding: space.xxl, maxWidth: 1100, margin: '0 auto' }} data-testid="page-tenant-billing">
      <header style={{ marginBottom: space.xl, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Receipt size={24} color={semantic.accent} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#fff' }}>Tenant Billing</h1>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            Subscription, usage, and add-ons for {tenantName ? <strong>{tenantName}</strong> : 'the active tenant'}.
            {!isOwner && <span style={{ marginLeft: 8, color: semantic.accentWarning }}>Read-only \u2014 only owners can manage billing.</span>}
          </p>
        </div>
      </header>

      {loading ? (
        <div style={{ color: semantic.textMuted, padding: space.xl }} data-testid="tenant-billing-loading">Loading tenant billing...</div>
      ) : (
        <>
          <div
            data-testid="tenant-billing-summary"
            style={{
              display: 'grid', gap: space.lg,
              gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
              marginBottom: space.xl,
            }}
          >
            <div style={cardStyle} data-testid="tenant-billing-plan">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: semantic.textMuted, fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <CreditCard size={14} /> Plan
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginTop: space.sm, textTransform: 'capitalize' }}>{planSlug}</div>
              <div style={{ marginTop: space.sm }}><span style={statusBadge}>{status}</span></div>
            </div>
            <div style={cardStyle} data-testid="tenant-billing-usage">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: semantic.textMuted, fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Package size={14} /> Add-ons active
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginTop: space.sm }}>
                {addons.filter(a => a.unlocked).length}
              </div>
              {usage?.aiCallsThisMonth != null && (
                <div style={{ marginTop: space.sm, fontSize: fontSize.sm, color: semantic.textMuted }}>
                  AI calls this month: {usage.aiCallsThisMonth}
                </div>
              )}
            </div>
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: semantic.textMuted, fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Manage</div>
                <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, margin: `${space.sm}px 0 0` }}>
                  Open the Stripe customer portal to update card, download invoices, or change plan.
                </p>
              </div>
              <button
                data-testid="button-open-portal"
                onClick={openPortal}
                disabled={!isOwner || busy === 'portal'}
                title={!isOwner ? 'Only tenant owners can open the billing portal' : undefined}
                style={{
                  ...buttonStyles.primary, marginTop: space.md, opacity: !isOwner ? 0.5 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  cursor: !isOwner ? 'not-allowed' : 'pointer',
                }}
              >
                <ExternalLink size={14} /> {busy === 'portal' ? 'Opening\u2026' : 'Open billing portal'}
              </button>
            </div>
          </div>

          {err && (
            <div data-testid="tenant-billing-error" style={{ color: semantic.accentDanger, fontSize: fontSize.sm, marginBottom: space.md, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={12} /> {err}
            </div>
          )}

          <section style={{ ...panelStyle, marginBottom: space.xl }} data-testid="tenant-billing-addons">
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${semantic.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={14} color={semantic.accentInfo} />
              <h2 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>Add-on subscriptions</h2>
            </div>
            {addons.length === 0 ? (
              <div data-testid="tenant-addons-empty" style={{ padding: space.lg, color: semantic.textMuted, fontSize: fontSize.body }}>
                No add-ons are active for this tenant. Browse the Module Marketplace to review available upgrades.
              </div>
            ) : addons.map(a => (
              <div
                key={a.module.slug}
                data-testid={`addon-row-${a.module.slug}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: `1px solid ${semantic.border}` }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: fontSize.body, color: '#fff' }}>{a.module.name}</div>
                  <div style={{ fontSize: fontSize.xs, color: semantic.textMuted }}>
                    {a.addon_price_cents != null ? `$${(a.addon_price_cents / 100).toFixed(2)} / mo` : 'Add-on'}
                  </div>
                </div>
                <span style={a.unlocked ? badgeStyles.success : badgeStyles.warning}>
                  {a.unlocked ? 'active' : 'available'}
                </span>
                {a.unlocked && (
                  <button
                    data-testid={`button-cancel-addon-${a.module.slug}`}
                    onClick={() => cancelAddon(a.module.slug)}
                    disabled={!isOwner || busy === a.module.slug}
                    title={!isOwner ? 'Only tenant owners can cancel add-ons' : undefined}
                    style={{
                      ...buttonStyles.danger, padding: '6px 10px', fontSize: fontSize.sm,
                      cursor: !isOwner ? 'not-allowed' : 'pointer', opacity: !isOwner ? 0.5 : 1,
                    }}
                  >
                    {busy === a.module.slug ? 'Canceling\u2026' : 'Cancel'}
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
