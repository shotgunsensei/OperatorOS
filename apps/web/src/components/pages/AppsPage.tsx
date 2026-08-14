'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, Settings as SettingsIcon, Lock } from 'lucide-react';
import { modulesApi, meApi } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/AuthProvider';
import { colors } from '@/lib/design-tokens';
import { MARKETING_MODULES } from '@/lib/marketing-catalog';
import { friendlyModuleLaunchError, launchModuleViaSso } from '@/lib/module-launch';
import { EmptyState, ErrorState, PageHeader } from '@/components/ExperiencePrimitives';

type AccessSource = 'plan' | 'addon' | 'override' | 'admin_role' | null;
type ModuleCta = 'open' | 'upgrade' | 'buy_addon' | 'coming_soon' | 'disabled';

interface ModuleComponentRef {
  slug: string;
  name: string;
  ord: number;
}

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
    component?: ModuleComponentRef | null;
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
  override:   { label: 'Access granted', color: '#58a6ff', bg: 'rgba(88,166,255,0.15)' },
  admin_role: { label: 'Administrator', color: '#f0b400', bg: 'rgba(240,180,0,0.15)' },
  locked:     { label: 'Not included', color: '#8b949e', bg: 'rgba(139,148,158,0.15)' },
};

const statusLabel: Record<string, { label: string; color: string }> = {
  live:        { label: 'Ready',       color: '#3fb950' },
  beta:        { label: 'Beta',        color: '#d29922' },
  coming_soon: { label: 'Planned',     color: '#8b949e' },
  disabled:    { label: 'Unavailable', color: '#f85149' },
};

const marketingBySlug = new Map(MARKETING_MODULES.map((m) => [m.slug, m]));

function priceLabel(cents: number | null): string {
  if (!cents || cents <= 0) return '';
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}/mo` : `$${dollars.toFixed(2)}/mo`;
}

function accessReason(reason?: string): string {
  const messages: Record<string, string> = {
    addon_required: 'Available as an add-on',
    module_access_denied: 'Ask an organization admin for access',
    module_disabled: 'Temporarily unavailable',
    module_not_seeded: 'Not available in this workspace',
    module_planned: 'Planned for a future release',
    tenant_required: 'Choose an organization first',
    upgrade_required: 'Another workspace plan is required',
  };
  return reason ? (messages[reason] ?? 'Access is not available for this organization') : '';
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function AppsPage({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
      const data = (await modulesApi.list()) as ModuleListResponse;
      setModules(data.modules);
      if (data.ssoFallback && data.warning && !warningShown) {
        toast(data.warning, 'error');
        setWarningShown(true);
      }
    } catch (err: any) {
      setModules([]);
      setLoadError(true);
      toast('We could not load the tool catalog. Your access has not changed. Try again in a moment.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const launch = async (slug: string) => {
    setLaunching(slug);
    try {
      await launchModuleViaSso(slug);
      toast('Opening your tool securely', 'success');
    } catch (err: any) {
      toast(friendlyModuleLaunchError(err), 'error');
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
      toast('We could not start the add-on purchase. Nothing was charged. Check your billing access and try again.', 'error');
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

  // Task #115: group the (already filtered) cards under their platform
  // component heading, ordered by component `ord`. The component metadata
  // is server-provided (no hardcoded slug→component map here). Sections
  // with no matching modules are dropped, so empty components (e.g. Command
  // Center, which has no live modules) never render a header. Modules with
  // no component fall into a trailing "Other" bucket.
  const groupedSections = useMemo(() => {
    const bySlug = new Map<string, { component: ModuleComponentRef; modules: ModuleSummary[] }>();
    const ungrouped: ModuleSummary[] = [];
    for (const s of filtered) {
      const c = s.module.component;
      if (!c) { ungrouped.push(s); continue; }
      let bucket = bySlug.get(c.slug);
      if (!bucket) { bucket = { component: c, modules: [] }; bySlug.set(c.slug, bucket); }
      bucket.modules.push(s);
    }
    const sections = Array.from(bySlug.values())
      .sort((a, b) => a.component.ord - b.component.ord)
      .map(b => ({ slug: b.component.slug, name: b.component.name, modules: b.modules }));
    if (ungrouped.length > 0) {
      sections.push({ slug: 'other', name: 'Other', modules: ungrouped });
    }
    return sections;
  }, [filtered]);

  const renderCard = ({ module: m, unlocked, access_source, cta, addon_price_cents, reason }: ModuleSummary) => {
    const srcKey = unlocked && access_source ? access_source : 'locked';
    const src = sourceLabel[srcKey] || sourceLabel.locked;
    const status = statusLabel[m.status] || statusLabel.coming_soon;
    const marketing = marketingBySlug.get(m.slug);

    return (
      <div
        key={m.slug}
        data-testid={`module-card-${m.slug}`}
        style={{
          background: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflow: 'hidden',
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
        {marketing?.imageSrc && (
          <img
            src={marketing.imageSrc}
            alt={`${m.name} illustration.`}
            loading="lazy"
            style={{ width: '100%', height: 128, objectFit: 'cover', display: 'block' }}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: marketing?.imageSrc ? '0 20px' : '20px 20px 0' }}>
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

        <div style={{ fontSize: 13, color: colors.textMuted, minHeight: 36, padding: '0 20px' }}>
          {marketing?.outcome || m.description || 'A business tool available through OperatorOS.'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: colors.textDim, padding: '0 20px' }}>
          <span>
            <strong style={{ color: colors.text }}>{marketing?.packageLabel ?? 'OperatorOS tool'}</strong>
          </span>
          {!unlocked && reason && (
            <span data-testid={`module-reason-${m.slug}`} style={{ fontStyle: 'italic' }}>
              {accessReason(reason)}
            </span>
          )}
        </div>

        {requested[m.slug] && (
          <div role="status" style={{ margin: '0 20px', padding: '9px 10px', borderRadius: 8, border: `1px solid ${colors.accentPurple}55`, background: `${colors.accentPurple}12`, color: colors.text, fontSize: 12, lineHeight: 1.45 }}>
            Ask your organization owner or administrator to open Tool access and add {m.name} for you.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', padding: '0 20px 20px' }}>
          {cta === 'open' && (
            <button
              data-testid={`button-launch-${m.slug}`}
              onClick={() => launch(m.slug)}
              disabled={launching === m.slug}
              style={{
                flex: 1, minHeight: 40, padding: '8px 14px', borderRadius: 8, border: 'none',
                background: colors.accent, color: '#fff', fontWeight: 600,
                fontSize: 13, cursor: launching === m.slug ? 'wait' : 'pointer',
              }}
            >
              {launching === m.slug ? `Opening ${m.name}…` : `Open ${m.name}`}
            </button>
          )}
          {isTenantAdmin && (
            <button
              data-testid={`button-manage-${m.slug}`}
              onClick={() => onNavigate ? onNavigate('tenant-modules') : null}
              title={`Manage ${m.name} access for this organization`}
              style={{
                minHeight: 40, padding: '8px 12px', borderRadius: 8,
                border: `1px solid ${colors.border}`, background: 'transparent',
                color: colors.textMuted, fontSize: 12, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <SettingsIcon size={12} aria-hidden="true" /> Manage access
            </button>
          )}
          {cta === 'coming_soon' && (
            <button
              data-testid={`button-comingsoon-${m.slug}`}
              disabled
              title={reason ? reason.replace(/_/g, ' ') : 'This module is not available yet'}
              style={{
                flex: 1, minHeight: 40, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
                background: 'transparent', color: colors.textMuted, fontSize: 13, cursor: 'not-allowed',
              }}
            >Not available yet</button>
          )}
          {cta === 'buy_addon' && (
            <button
              data-testid={`button-subscribe-${m.slug}`}
              onClick={() => subscribe(m.slug)}
              style={{
                flex: 1, minHeight: 40, padding: '8px 14px', borderRadius: 8,
                border: `1px solid ${colors.accent}`, background: 'transparent',
                color: colors.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {priceLabel(addon_price_cents) ? `Add ${m.name} — ${priceLabel(addon_price_cents)}` : `Add ${m.name}`}
            </button>
          )}
          {cta === 'upgrade' && (
            <button
              data-testid={`button-upgrade-${m.slug}`}
              onClick={() => onNavigate ? onNavigate('billing') : (window.location.href = '/')}
              style={{
                flex: 1, minHeight: 40, padding: '8px 14px', borderRadius: 8,
                border: `1px solid ${colors.accent}`, background: 'transparent',
                color: colors.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              View plan options
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
                    toast('Ask your organization owner or administrator to add this tool under Tool access.', 'success');
                  }}
                  style={{
                    flex: 1, minHeight: 40, padding: '8px 14px', borderRadius: 8,
                    border: `1px solid ${colors.accentPurple}`, background: 'transparent',
                    color: colors.accentPurple, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Lock size={12} aria-hidden="true" /> {sent ? 'Access instructions shown' : 'How to get access'}
                </button>
              );
            }
            return (
              <button
                data-testid={`button-disabled-${m.slug}`}
                disabled
                title={
                  stripeMissing
                    ? 'A purchase cannot be started right now. Nothing will be charged. Contact support for help.'
                    : (reason ? reason.replace(/_/g, ' ') : 'This app is currently unavailable')
                }
                style={{
                  flex: 1, minHeight: 40, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
                  background: 'transparent', color: colors.textMuted, fontSize: 13, cursor: 'not-allowed',
                }}
              >{stripeMissing ? 'Purchase temporarily unavailable' : 'Unavailable'}</button>
            );
          })()}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 32, color: colors.textMuted, fontSize: 14 }} data-testid="apps-loading">
        Loading the tool catalog…
      </div>
    );
  }

  return (
    <div className="ops-page" style={{ maxWidth: 1200 }} data-testid="apps-page">
      <PageHeader
        eyebrow="Workspace"
        title="Browse tools"
        description="Find the OperatorOS tool that matches the work you need to complete. Each card shows availability and the exact next step for this organization."
      />

      {loadError && (
        <div style={{ marginBottom: 24 }}>
          <ErrorState
            title="Tools could not be loaded"
            description="Your access has not changed. Check your connection, then try loading the list again."
            action={<button type="button" onClick={() => void load()} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bgHover, color: colors.text, cursor: 'pointer', fontWeight: 700 }}>Reload tools</button>}
          />
        </div>
      )}

      {/* Search + category pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '6px 10px', flex: '1 1 240px', maxWidth: 360, minWidth: 0 }}>
          <Search size={16} color={colors.textDim} aria-hidden="true" />
          <label className="ops-visually-hidden" htmlFor="marketplace-search">Search tools</label>
          <input
            id="marketplace-search"
            type="search"
            data-testid="input-marketplace-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by tool or outcome"
            style={{ flex: 1, background: 'transparent', border: 'none', color: colors.text, fontSize: 13, outline: 'none' }}
          />
        </div>
        <div role="group" aria-label="Tool category" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minWidth: 0 }}>
          <Filter size={14} color={colors.textDim} aria-hidden="true" />
          {categories.map(c => {
            const isActive = activeCategory === c;
            return (
              <button
                key={c}
                data-testid={`pill-category-${c}`}
                onClick={() => setActiveCategory(c)}
                aria-pressed={isActive}
                style={{
                  minHeight: 40, padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${isActive ? colors.accent : colors.border}`,
                  background: isActive ? `${colors.accent}22` : 'transparent',
                  color: isActive ? colors.accent : colors.textMuted, fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >{c === 'all' ? 'All categories' : humanize(c)}</button>
            );
          })}
        </div>
      </div>

      {/* Availability / status filter chips */}
      <div role="group" aria-label="Tool availability" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 20 }}>
        {statusFilters.map(f => {
          const isActive = statusFilter === f;
          const labels: Record<StatusFilter, string> = {
            all: 'All', installed: 'Installed', available: 'Available',
            addons: 'Add-ons', beta: 'Beta', coming_soon: 'Planned',
          };
          return (
            <button
              key={f}
              data-testid={`pill-status-${f}`}
              onClick={() => setStatusFilter(f)}
              aria-pressed={isActive}
              style={{
                minHeight: 40, padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${isActive ? colors.accentPurple : colors.border}`,
                background: isActive ? `${colors.accentPurple}22` : 'transparent',
                color: isActive ? colors.accentPurple : colors.textMuted, fontWeight: 600,
              }}
            >{labels[f]}</button>
          );
        })}
      </div>

      <p role="status" aria-live="polite" style={{ margin: '-8px 0 18px', color: colors.textDim, fontSize: 12 }}>
        {filtered.length} {filtered.length === 1 ? 'tool' : 'tools'} shown
      </p>

      {filtered.length === 0 && (
        <div data-testid="marketplace-empty">
          <EmptyState
            title="No tools match your filters"
            description="Try a broader search, choose another category, or show all availability states. Your current tool access has not changed."
            action={(
              <button
                type="button"
                onClick={() => { setSearch(''); setActiveCategory('all'); setStatusFilter('all'); }}
                style={{ minHeight: 40, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bgHover, color: colors.text, cursor: 'pointer', fontWeight: 700 }}
              >
                Clear all filters
              </button>
            )}
          />
        </div>
      )}

      {/* Task #115: cards grouped under platform component headings,
          ordered by component `ord`. */}
      {groupedSections.map(section => (
        <section key={section.slug} data-testid={`component-section-${section.slug}`} style={{ marginBottom: 32 }}>
          <h2
            data-testid={`component-heading-${section.slug}`}
            style={{
              fontSize: 13, fontWeight: 700, color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              margin: '0 0 14px',
            }}
          >
            {section.name}
          </h2>
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
          }}>
            {section.modules.map(renderCard)}
          </div>
        </section>
      ))}
    </div>
  );
}
