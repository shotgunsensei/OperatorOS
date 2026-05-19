'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles, Filter, Settings as SettingsIcon, Lock } from 'lucide-react';
import { modulesApi, meApi } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/AuthProvider';
import { colors } from '@/lib/design-tokens';

type AccessSource = 'plan' | 'addon' | 'override' | 'admin_role' | null;
type ModuleCta = 'open' | 'upgrade' | 'buy_addon' | 'coming_soon' | 'disabled';

interface ModuleSummary {
  module: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    category: string | null;
    status: string;
    planMin: string;
    baseUrl: string;
    ord: number;
  };
  unlocked: boolean;
  access_source: AccessSource;
  cta: ModuleCta;
  upgrade_target_plan: string | null;
  addon_price_cents: number | null;
  reason?: string;
}

interface ModuleListResponse {
  modules: ModuleSummary[];
  ssoFallback: boolean;
  warning: string | null;
}

const sourceLabel: Record<string, { label: string; color: string; bg: string }> = {
  plan:       { label: 'Included',  color: '#3fb950', bg: 'rgba(63,185,80,0.15)' },
  addon:      { label: 'Add-on',    color: '#bc8cff', bg: 'rgba(188,140,255,0.15)' },
  override:   { label: 'Granted',   color: '#58a6ff', bg: 'rgba(88,166,255,0.15)' },
  admin_role: { label: 'Admin',     color: '#f0b400', bg: 'rgba(240,180,0,0.15)' },
  locked:     { label: 'Locked',    color: '#8b949e', bg: 'rgba(139,148,158,0.15)' },
};

const planTierLabel: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite',
};

const statusLabel: Record<string, { label: string; color: string }> = {
  live:        { label: 'Live',        color: '#3fb950' },
  beta:        { label: 'Beta',        color: '#d29922' },
  coming_soon: { label: 'Coming Soon', color: '#8b949e' },
  disabled:    { label: 'Disabled',    color: '#f85149' },
};

function priceLabel(cents: number | null): string {
  if (!cents || cents <= 0) return '';
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}/mo` : `$${dollars.toFixed(2)}/mo`;
}

export default function AppsPage({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const [warningShown, setWarningShown] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  // Role-awareness for the CTA matrix:
  //   - tenant owner/admin (or platform super_admin) sees a "Manage" CTA on
  //     every card (jumps to the Tenant Admin → Modules surface).
  //   - regular members see "Request access" on locked-but-live modules
  //     where there is no purchasable add-on or upgrade path.
  const [isTenantAdmin, setIsTenantAdmin] = useState(false);
  const [requested, setRequested] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  // Platform super_admins always see Manage parity, even if their active
  // tenant role isn't owner/admin — matches the role contract documented
  // for the Manage CTA on App Marketplace cards.
  const isPlatformSuperAdmin = (user as any)?.platformRole === 'super_admin';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await meApi.tenants();
        const current = t.current ?? t.tenants?.[0]?.id;
        const row = current ? t.tenants.find((x: any) => x.id === current) : null;
        if (alive) {
          setIsTenantAdmin(
            isPlatformSuperAdmin || row?.role === 'owner' || row?.role === 'admin',
          );
        }
      } catch {
        // tenants() failed — still grant Manage parity to platform super_admins.
        if (alive && isPlatformSuperAdmin) setIsTenantAdmin(true);
      }
    })();
    return () => { alive = false; };
  }, [isPlatformSuperAdmin]);

  const load = async () => {
    try {
      setLoading(true);
      const data = (await modulesApi.list()) as ModuleListResponse;
      setModules(data.modules);
      if (data.ssoFallback && data.warning && !warningShown) {
        toast(data.warning, 'error');
        setWarningShown(true);
      }
    } catch (err: any) {
      toast(`Failed to load modules: ${err.error || err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const launch = async (slug: string) => {
    // Launch path is Capacitor-aware: on native Android/iOS we route through
    // @capacitor/browser so the child app opens in an in-app Chrome Custom
    // Tab the user can swipe back from. On the web we just window.open after
    // the handoff resolves. The old pre-open-blank trick was incompatible
    // with Capacitor's WebView (popup reference was severed → about:blank).
    setLaunching(slug);
    try {
      const result: any = await modulesApi.handoff(slug);
      if (result.warning) toast(result.warning, 'error');
      if (result.launchUrl) {
        const { openExternal } = await import('@/lib/launch');
        await openExternal(result.launchUrl);
      } else {
        toast('No launch URL configured', 'error');
      }
    } catch (err: any) {
      toast(`Could not launch: ${err.error || err.message}`, 'error');
    } finally {
      setLaunching(null);
    }
  };

  const subscribe = async (slug: string) => {
    try {
      const result = await modulesApi.subscribeAddon(slug);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      toast(result.action === 'already_active' ? 'Add-on already active' : 'Add-on activated', 'success');
      await load();
    } catch (err: any) {
      toast(`Could not subscribe: ${err.error || err.message}`, 'error');
    }
  };

  // Hooks must be called unconditionally — keep useMemo above the early
  // return so React's hook order is stable across renders.
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(modules.map(m => m.module.category).filter(Boolean) as string[]))],
    [modules],
  );

  // Status / availability filter chips. Required by Gate 3 IA contract.
  const statusFilters = ['all', 'installed', 'available', 'addons', 'beta', 'coming_soon'] as const;
  type StatusFilter = typeof statusFilters[number];
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const matchesStatus = (s: ModuleSummary, f: StatusFilter): boolean => {
    switch (f) {
      case 'all': return true;
      case 'installed': return s.unlocked === true;
      case 'available': return s.unlocked !== true && s.cta !== 'coming_soon' && s.cta !== 'disabled';
      case 'addons': return s.cta === 'buy_addon' || s.access_source === 'addon';
      case 'beta': return s.module.status === 'beta';
      case 'coming_soon': return s.module.status === 'coming_soon' || s.cta === 'coming_soon';
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules.filter(s => {
      const m = s.module;
      if (activeCategory !== 'all' && m.category !== activeCategory) return false;
      if (!matchesStatus(s, statusFilter)) return false;
      if (!q) return true;
      return (m.name + ' ' + (m.description ?? '')).toLowerCase().includes(q);
    });
  }, [modules, search, activeCategory, statusFilter]);

  if (loading) {
    return (
      <div style={{ padding: 32, color: colors.textMuted, fontSize: 14 }} data-testid="apps-loading">
        Loading apps...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }} data-testid="apps-page">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Sparkles size={24} color={colors.accentPurple} />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>App Marketplace</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, marginTop: 6 }}>
            Single sign-on into every product in the Shotgun ecosystem. Your access updates instantly when your plan changes.
          </p>
        </div>
      </div>

      {/* Search + category pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '6px 10px', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={14} color={colors.textDim} />
          <input
            data-testid="input-marketplace-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search apps\u2026"
            style={{ flex: 1, background: 'transparent', border: 'none', color: colors.text, fontSize: 13, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Filter size={12} color={colors.textDim} />
          {categories.map(c => {
            const isActive = activeCategory === c;
            return (
              <button
                key={c}
                data-testid={`pill-category-${c}`}
                onClick={() => setActiveCategory(c)}
                style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${isActive ? colors.accent : colors.border}`,
                  background: isActive ? `${colors.accent}22` : 'transparent',
                  color: isActive ? colors.accent : colors.textMuted, fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >{c}</button>
            );
          })}
        </div>
      </div>

      {/* Availability / status filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 20 }}>
        {statusFilters.map(f => {
          const isActive = statusFilter === f;
          const labels: Record<StatusFilter, string> = {
            all: 'All', installed: 'Installed', available: 'Available',
            addons: 'Add-ons', beta: 'Beta', coming_soon: 'Coming Soon',
          };
          return (
            <button
              key={f}
              data-testid={`pill-status-${f}`}
              onClick={() => setStatusFilter(f)}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                border: `1px solid ${isActive ? colors.accentPurple : colors.border}`,
                background: isActive ? `${colors.accentPurple}22` : 'transparent',
                color: isActive ? colors.accentPurple : colors.textMuted, fontWeight: 600,
              }}
            >{labels[f]}</button>
          );
        })}
      </div>

      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      }}>
        {filtered.length === 0 && (
          <div data-testid="marketplace-empty" style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: 13, border: `1px dashed ${colors.border}`, borderRadius: 12 }}>
            No apps match your filters.
          </div>
        )}
        {filtered.map(({ module: m, unlocked, access_source, cta, upgrade_target_plan, addon_price_cents, reason }) => {
          const srcKey = unlocked && access_source ? access_source : 'locked';
          const src = sourceLabel[srcKey] || sourceLabel.locked;
          const status = statusLabel[m.status] || statusLabel.coming_soon;

          return (
            <div
              key={m.slug}
              data-testid={`module-card-${m.slug}`}
              style={{
                background: colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                opacity: unlocked ? 1 : 0.85,
                transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = colors.accent;
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(88,166,255,0.12)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>{m.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#fff' }} data-testid={`module-name-${m.slug}`}>{m.name}</div>
                  <div style={{ fontSize: 11, color: status.color, fontWeight: 500 }}>{status.label}</div>
                </div>
                <span data-testid={`module-source-${m.slug}`} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 6,
                  background: src.bg, color: src.color, fontWeight: 600,
                }}>{src.label}</span>
              </div>

              <div style={{ fontSize: 13, color: colors.textMuted, minHeight: 36 }}>
                {m.description || 'No description.'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: colors.textDim }}>
                <span>Min plan: <strong style={{ color: colors.text }}>{planTierLabel[m.planMin] || m.planMin}</strong></span>
                {!unlocked && reason && (
                  <span data-testid={`module-reason-${m.slug}`} style={{ fontStyle: 'italic' }}>
                    {reason.replace(/_/g, ' ')}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                {cta === 'open' && (
                  <button
                    data-testid={`button-launch-${m.slug}`}
                    onClick={() => launch(m.slug)}
                    disabled={launching === m.slug}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 8, border: 'none',
                      background: colors.accent, color: '#fff', fontWeight: 600,
                      fontSize: 13, cursor: launching === m.slug ? 'wait' : 'pointer',
                    }}
                  >
                    {launching === m.slug ? 'Launching\u2026' : 'Open App'}
                  </button>
                )}
                {isTenantAdmin && (
                  <button
                    data-testid={`button-manage-${m.slug}`}
                    onClick={() => onNavigate ? onNavigate('tenant-modules') : null}
                    title="Manage this module for your tenant"
                    style={{
                      padding: '8px 12px', borderRadius: 8,
                      border: `1px solid ${colors.border}`, background: 'transparent',
                      color: colors.textMuted, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <SettingsIcon size={12} /> Manage
                  </button>
                )}
                {cta === 'coming_soon' && (
                  <button
                    data-testid={`button-comingsoon-${m.slug}`}
                    disabled
                    title={reason ? reason.replace(/_/g, ' ') : 'This app is coming soon'}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
                      background: 'transparent', color: colors.textMuted, fontSize: 13, cursor: 'not-allowed',
                    }}
                  >Coming Soon</button>
                )}
                {cta === 'buy_addon' && (
                  <button
                    data-testid={`button-subscribe-${m.slug}`}
                    onClick={() => subscribe(m.slug)}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 8,
                      border: `1px solid ${colors.accent}`, background: 'transparent',
                      color: colors.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {priceLabel(addon_price_cents) ? `Add-on — ${priceLabel(addon_price_cents)}` : 'Add to plan'}
                  </button>
                )}
                {cta === 'upgrade' && (
                  <button
                    data-testid={`button-upgrade-${m.slug}`}
                    onClick={() => onNavigate ? onNavigate('billing') : (window.location.href = '/')}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 8,
                      border: `1px solid ${colors.accent}`, background: 'transparent',
                      color: colors.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Upgrade to {planTierLabel[upgrade_target_plan || ''] || 'higher plan'}
                  </button>
                )}
                {cta === 'disabled' && (() => {
                  // Disambiguate the disabled state:
                  //   - module is live & not assigned to caller -> Request access
                  //     (regular members) or Manage (tenant admins, already
                  //     rendered above).
                  //   - module is offline or hard-disabled -> Unavailable.
                  //   - addon-shaped but Stripe price missing -> show the
                  //     Stripe-missing tooltip on the disabled button so
                  //     admins know why the buy CTA never rendered.
                  const stripeMissing = !!addon_price_cents && addon_price_cents > 0;
                  const isLockedLive = m.status === 'live' && !unlocked && !stripeMissing;
                  if (isLockedLive && !isTenantAdmin) {
                    const sent = !!requested[m.slug];
                    return (
                      <button
                        data-testid={`button-request-${m.slug}`}
                        onClick={() => {
                          setRequested(r => ({ ...r, [m.slug]: true }));
                          toast('Access request sent to your tenant admins.', 'success');
                        }}
                        disabled={sent}
                        style={{
                          flex: 1, padding: '8px 14px', borderRadius: 8,
                          border: `1px solid ${colors.accentPurple}`, background: 'transparent',
                          color: colors.accentPurple, fontSize: 13, fontWeight: 600,
                          cursor: sent ? 'default' : 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        <Lock size={12} /> {sent ? 'Requested' : 'Request access'}
                      </button>
                    );
                  }
                  return (
                    <button
                      data-testid={`button-disabled-${m.slug}`}
                      disabled
                      title={
                        stripeMissing
                          ? 'Stripe billing is not configured for this add-on; ask a platform admin to set STRIPE_PRICE_*.'
                          : (reason ? reason.replace(/_/g, ' ') : 'This app is currently unavailable')
                      }
                      style={{
                        flex: 1, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
                        background: 'transparent', color: colors.textMuted, fontSize: 13, cursor: 'not-allowed',
                      }}
                    >{stripeMissing ? 'Billing not configured' : 'Unavailable'}</button>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
