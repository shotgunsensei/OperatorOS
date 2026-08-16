'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  Rocket,
  Settings,
  ShieldCheck,
  Store,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ModuleLaunchLink from '@/components/ModuleLaunchLink';
import { useAuth } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { useToast } from '@/components/Toast';
import {
  badgeStyles,
  buttonStyles,
  cardStyle,
  fontSize,
  radius,
  semantic,
  space,
} from '@/lib/design-tokens';
import { isSuperAdmin, isTenantAdmin as hasTenantAdminRole } from '@/lib/rbac';
import { modulesApi, tenantApi } from '@/lib/auth';
import {
  COMMAND_CENTER_MODULES,
  type OperatorOSModuleRegistryEntry,
} from '@/lib/operatoros-registry';
import { MARKETING_MODULES } from '@/lib/marketing-catalog';

interface MyAppsPageProps {
  onNavigate: (page: string) => void;
}

type AccessSource = 'plan' | 'addon' | 'override' | 'admin_role' | null;
type ModuleCta = 'open' | 'upgrade' | 'buy_addon' | 'coming_soon' | 'disabled';

interface ModuleComponentRef {
  slug: string;
  name: string;
  ord: number;
}

interface ModuleSummary {
  module: {
    id?: string;
    slug: string;
    name: string;
    description: string | null;
    iconUrl?: string | null;
    category?: string | null;
    status: string;
    planMin?: string;
    baseUrl?: string | null;
    ord?: number;
    component?: ModuleComponentRef | null;
  };
  unlocked: boolean;
  access_source: AccessSource;
  cta: ModuleCta;
  upgrade_target_plan?: string | null;
  addon_price_cents?: number | null;
  reason?: string;
}

interface ModuleListResponse {
  modules: ModuleSummary[];
  ssoFallback?: boolean;
  warning?: string | null;
}

interface LaunchpadModule {
  registry: OperatorOSModuleRegistryEntry;
  summary: ModuleSummary | null;
  name: string;
  description: string;
  category: string;
  statusLabel: string;
  statusTone: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  entitlementLabel: string;
  entitlementTone: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  action: 'launch' | 'upgrade' | 'addon' | 'planned' | 'disabled' | 'unavailable' | 'tenant_required';
  unlocked: boolean;
  planned: boolean;
  disabled: boolean;
  reason: string | null;
}

const RECENT_KEY = 'operatoros.recentApps';
const RECENT_MAX = 4;
const marketingBySlug = new Map(MARKETING_MODULES.map((m) => [m.slug, m]));

function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(slug: string) {
  if (typeof window === 'undefined') return;
  const cur = readRecent().filter((s) => s !== slug);
  cur.unshift(slug);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)));
  } catch {}
}

function titleCase(input: string): string {
  return input
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(cents: number | null | undefined): string | null {
  if (!cents || cents <= 0) return null;
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}/mo` : `$${dollars.toFixed(2)}/mo`;
}

function buildLaunchpadModule(
  registry: OperatorOSModuleRegistryEntry,
  summary: ModuleSummary | null,
  hasActiveTenant: boolean,
): LaunchpadModule {
  const dbStatus = summary?.module.status;
  const planned = registry.status === 'planned' || dbStatus === 'coming_soon';
  const disabled = registry.status === 'disabled' || dbStatus === 'disabled';
  const unlocked = summary?.unlocked === true && summary.cta === 'open' && registry.status === 'active';
  const description =
    marketingBySlug.get(registry.slug)?.outcome ||
    summary?.module.description ||
    registry.description;

  if (registry.requiresTenant && !hasActiveTenant) {
    return {
      registry,
      summary,
      name: registry.name,
      description,
      category: registry.category,
      statusLabel: 'Organization needed',
      statusTone: 'warning',
      entitlementLabel: 'Setup incomplete',
      entitlementTone: 'warning',
      action: 'tenant_required',
      unlocked: false,
      planned,
      disabled,
      reason: 'tenant_required',
    };
  }

  if (planned) {
    return {
      registry,
      summary,
      name: registry.name,
      description,
      category: registry.category,
      statusLabel: 'Planned',
      statusTone: 'neutral',
      entitlementLabel: 'Not available yet',
      entitlementTone: 'neutral',
      action: 'planned',
      unlocked: false,
      planned: true,
      disabled,
      reason: summary?.reason ?? 'module_planned',
    };
  }

  if (disabled) {
    return {
      registry,
      summary,
      name: registry.name,
      description,
      category: registry.category,
      statusLabel: 'Unavailable',
      statusTone: 'danger',
      entitlementLabel: 'Unavailable',
      entitlementTone: 'danger',
      action: 'disabled',
      unlocked: false,
      planned,
      disabled: true,
      reason: summary?.reason ?? 'module_disabled',
    };
  }

  if (unlocked) {
    const source = summary?.access_source ?? null;
    const sourceLabel =
      source === 'admin_role' ? 'Administrator access'
      : source === 'addon' ? 'Add-on active'
      : source === 'override' ? 'Access granted'
      : 'Included in your plan';
    return {
      registry,
      summary,
      name: summary?.module.name ?? registry.name,
      description,
      category: summary?.module.category ?? registry.category,
      statusLabel: dbStatus === 'beta' ? 'Beta' : 'Ready to use',
      statusTone: dbStatus === 'beta' ? 'warning' : 'success',
      entitlementLabel: sourceLabel,
      entitlementTone: source === 'admin_role' ? 'info' : 'success',
      action: 'launch',
      unlocked: true,
      planned: false,
      disabled: false,
      reason: null,
    };
  }

  if (!summary) {
    return {
      registry,
      summary,
      name: registry.name,
      description,
      category: registry.category,
      statusLabel: 'Unavailable',
      statusTone: 'danger',
      entitlementLabel: 'Contact support',
      entitlementTone: 'danger',
      action: 'unavailable',
      unlocked: false,
      planned: false,
      disabled: false,
      reason: 'module_not_seeded',
    };
  }

  if (summary.cta === 'buy_addon') {
    return {
      registry,
      summary,
      name: summary.module.name,
      description,
      category: summary.module.category ?? registry.category,
      statusLabel: 'Available to add',
      statusTone: 'info',
      entitlementLabel: money(summary.addon_price_cents) ?? 'Add-on required',
      entitlementTone: 'warning',
      action: 'addon',
      unlocked: false,
      planned: false,
      disabled: false,
      reason: summary.reason ?? 'addon_required',
    };
  }

  if (summary.cta === 'upgrade') {
    return {
      registry,
      summary,
      name: summary.module.name,
      description,
      category: summary.module.category ?? registry.category,
      statusLabel: 'Another plan needed',
      statusTone: 'warning',
      entitlementLabel: 'Compare plans',
      entitlementTone: 'warning',
      action: 'upgrade',
      unlocked: false,
      planned: false,
      disabled: false,
      reason: summary.reason ?? 'upgrade_required',
    };
  }

  return {
    registry,
    summary,
    name: summary.module.name,
    description,
    category: summary.module.category ?? registry.category,
    statusLabel: 'Access needed',
    statusTone: 'warning',
    entitlementLabel: 'Ask your administrator',
    entitlementTone: 'warning',
    action: 'unavailable',
    unlocked: false,
    planned: false,
    disabled: false,
    reason: summary.reason ?? 'module_access_denied',
  };
}

function toneBadge(tone: LaunchpadModule['statusTone']) {
  if (tone === 'success') return badgeStyles.success;
  if (tone === 'info') return badgeStyles.info;
  if (tone === 'warning') return badgeStyles.warning;
  if (tone === 'danger') return badgeStyles.danger;
  return badgeStyles.neutral;
}

export default function MyAppsPage({ onNavigate }: MyAppsPageProps) {
  const { user } = useAuth();
  const { activeTenant, activeRole, tenants, allTenants, switchTenant, loading: tenantLoading } = useTenant();
  const { toast } = useToast();
  const [summaries, setSummaries] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [repairingTenant, setRepairingTenant] = useState(false);

  const userIsPlatformAdmin = isSuperAdmin((user as any)?.platformRole);
  const userIsTenantAdmin = hasTenantAdminRole(activeRole, (user as any)?.platformRole);
  const visibleTenants = userIsPlatformAdmin
    ? mergeTenantListsForSelector(tenants, allTenants)
    : tenants;

  const load = async () => {
    setLoadError(null);
    if (!activeTenant?.id) {
      setSummaries([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = (await modulesApi.list()) as ModuleListResponse;
      setSummaries(data.modules ?? []);
      if (data.ssoFallback && data.warning) toast(data.warning, 'error');
    } catch (err: any) {
      setSummaries([]);
      setLoadError('Your tool access could not be loaded. Nothing changed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setRecentSlugs(readRecent());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (!alive) return;
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant?.id]);

  const cards = useMemo(() => {
    const bySlug = new Map(summaries.map((summary) => [summary.module.slug, summary]));
    return COMMAND_CENTER_MODULES
      .map((entry) => buildLaunchpadModule(entry, bySlug.get(entry.slug) ?? null, !!activeTenant?.id))
      .filter((card) => card.registry.status !== 'hidden');
  }, [summaries, activeTenant?.id]);

  const activeCards = cards.filter((card) => card.action === 'launch');
  const addableCards = cards.filter((card) =>
    !card.unlocked && !card.planned && card.action !== 'disabled' && card.action !== 'tenant_required'
  );

  const recentCards = useMemo(() => {
    const bySlug = new Map(cards.map((card) => [card.registry.slug, card]));
    return recentSlugs.map((slug) => bySlug.get(slug)).filter((card): card is LaunchpadModule => !!card && card.action === 'launch');
  }, [recentSlugs, cards]);

  const activationSteps = [
    { label: 'Organization selected', complete: !!activeTenant?.id },
    { label: 'At least one tool is ready', complete: activeCards.length > 0 },
    { label: 'First tool opened', complete: recentCards.length > 0 },
  ];
  const activationComplete = activationSteps.filter((step) => step.complete).length;
  const nextActivationAction = !activeTenant?.id
    ? { label: 'Finish organization setup', setup: true as const }
    : activeCards.length === 0
      ? { label: 'Compare plans and tools', page: 'billing' }
      : recentCards.length === 0
        ? { label: 'Choose your first tool', page: 'apps' }
        : { label: 'Browse more tools', page: 'apps' };
  const showSetup = activationComplete < activationSteps.length;

  const repairOrganization = async () => {
    setRepairingTenant(true);
    try {
      const response = await tenantApi.ensurePersonal();
      const tenantId = response?.tenant?.id;
      if (!tenantId) throw new Error('Organization setup did not return an organization.');
      toast(response.created ? 'Your organization is ready.' : 'Your organization access was restored.', 'success');
      await switchTenant(tenantId);
    } catch {
      toast('Organization setup could not be completed. Nothing changed. Retry in a moment or open Help and support.', 'error');
    } finally {
      setRepairingTenant(false);
    }
  };

  const recordLaunch = (card: LaunchpadModule) => {
    pushRecent(card.registry.slug);
    setRecentSlugs(readRecent());
  };

  const handleTenantChange = async (tenantId: string) => {
    if (!tenantId || tenantId === activeTenant?.id) return;
    setSwitchingTenant(true);
    try {
      await switchTenant(tenantId);
    } catch (err: any) {
      setSwitchingTenant(false);
      toast('We could not switch organizations. Your current organization is still active. Try again in a moment.', 'error');
    }
  };

  return (
    <div className="ops-page" data-testid="page-my-apps">
      <header
        style={{
          marginBottom: space.xl,
          borderRadius: radius.md,
          border: `1px solid ${semantic.border}`,
          background: 'linear-gradient(135deg, rgba(79,140,255,0.11), rgba(75,194,107,0.06)), #121820',
          padding: '22px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          gap: space.lg,
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: fontSize.xs, color: semantic.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Workspace home
          </div>
          <h1 style={{ fontSize: 30, lineHeight: 1.1, fontWeight: 800, margin: 0, color: '#fff', letterSpacing: 0 }}>
            Choose what you want to work on
          </h1>
          <p style={{ color: semantic.textMuted, margin: '10px 0 0', fontSize: fontSize.md, lineHeight: 1.55, maxWidth: 680 }}>
            Pick a tool and continue your work. OperatorOS keeps access, team membership, and billing together.
          </p>
        </div>

        <div style={{ display: 'grid', gap: space.sm }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <Metric label="Your tools" value={activeCards.length} tone="success" />
            <Metric label="More tools" value={addableCards.length} tone="info" />
          </div>
          {visibleTenants.length > 1 && (
            <label
              data-testid="command-center-tenant-selector"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: radius.md,
                border: `1px solid ${semantic.border}`,
                background: 'rgba(1,4,9,0.45)',
                color: semantic.textMuted,
                fontSize: fontSize.sm,
              }}
            >
              <Building2 size={14} color={semantic.accent} aria-hidden="true" />
              <span className="ops-visually-hidden">Organization</span>
              <select
                value={activeTenant?.id ?? ''}
                disabled={tenantLoading || switchingTenant}
                onChange={(event) => handleTenantChange(event.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: semantic.text,
                  fontSize: fontSize.body,
                }}
              >
                {visibleTenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}{tenant.role ? ` (${tenant.role})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {userIsTenantAdmin && (
              <button
                data-testid="button-command-center-manage-modules"
                onClick={() => onNavigate('tenant-modules')}
                style={{ ...buttonStyles.secondary, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px' }}
              >
                <Settings size={13} aria-hidden="true" /> Manage tool access
              </button>
            )}
            {userIsPlatformAdmin && (
              <button
                data-testid="button-command-center-platform"
                onClick={() => onNavigate('platform')}
                style={{ ...buttonStyles.secondary, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px' }}
              >
                <ShieldCheck size={13} aria-hidden="true" /> Platform administration
              </button>
            )}
          </div>
        </div>
      </header>

      {showSetup && <section
        data-testid="ecosystem-activation-path"
        aria-label="Workspace setup progress"
        style={{
          marginBottom: space.xl,
          padding: '16px 18px',
          borderRadius: radius.lg,
          border: `1px solid ${semantic.border}`,
          background: '#121820',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: space.lg,
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, color: '#fff', fontSize: fontSize.lg, fontWeight: 750 }}>
              Workspace setup
            </h2>
            <span style={{ fontSize: fontSize.xs, color: semantic.textMuted }}>
              {activationComplete} of {activationSteps.length} ready
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
            {activationSteps.map((step, index) => (
              <div
                key={step.label}
                data-testid={`activation-step-${index + 1}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  minHeight: 34, padding: '6px 10px', borderRadius: radius.pill,
                  color: step.complete ? semantic.text : semantic.textMuted,
                  border: `1px solid ${step.complete ? semantic.accentSuccess + '66' : semantic.border}`,
                  background: step.complete ? 'rgba(63,185,80,0.08)' : 'rgba(1,4,9,0.36)',
                  fontSize: fontSize.sm, fontWeight: 650,
                }}
              >
                {step.complete
                  ? <CheckCircle2 size={14} color={semantic.accentSuccess} />
                  : <Circle size={14} color={semantic.textDim} />}
                <span>{index + 1}. {step.label}</span>
              </div>
            ))}
          </div>
        </div>
        {'setup' in nextActivationAction ? (
          <button
            type="button"
            data-testid="button-finish-organization-setup"
            disabled={repairingTenant}
            onClick={() => void repairOrganization()}
            style={{
              ...buttonStyles.primary,
              minHeight: 40,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: 'linear-gradient(135deg, #58a6ff, #bc8cff)',
              whiteSpace: 'nowrap',
            }}
          >
            {repairingTenant ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
            {repairingTenant ? 'Finishing setup…' : nextActivationAction.label}
          </button>
        ) : (
          <button
            data-testid="button-ecosystem-next-action"
            onClick={() => onNavigate(nextActivationAction.page)}
            style={{
              ...buttonStyles.primary,
              minHeight: 40,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: 'linear-gradient(135deg, #58a6ff, #bc8cff)',
              whiteSpace: 'nowrap',
            }}
          >
            {nextActivationAction.label} <ArrowRight size={14} />
          </button>
        )}
      </section>}

      {recentCards.length > 0 && (
        <section style={{ marginBottom: space.xl }} data-testid="my-apps-recent">
          <SectionTitle icon={<Clock size={13} />} title="Recently used" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
            {recentCards.map((card) => (
              <ModuleLaunchLink
                key={card.registry.slug}
                moduleId={card.registry.id}
                data-testid={`recent-app-${card.registry.slug}`}
                onLaunch={() => recordLaunch(card)}
                style={{ ...buttonStyles.secondary, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', textDecoration: 'none' }}
              >
                <Rocket size={13} />
                {card.name}
              </ModuleLaunchLink>
            ))}
          </div>
        </section>
      )}

      {loadError && (
        <div
          data-testid="command-center-load-error"
          style={{
            marginBottom: space.lg,
            padding: space.lg,
            borderRadius: radius.md,
            border: `1px solid ${semantic.accentDanger}66`,
            background: 'rgba(248,81,73,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: space.md,
            color: semantic.text,
          }}
        >
          <AlertTriangle size={18} color={semantic.accentDanger} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#fff' }}>Tool access could not be loaded</div>
            <div style={{ fontSize: fontSize.body, color: semantic.textMuted }}>{loadError}</div>
          </div>
          <button onClick={load} style={buttonStyles.secondary}>Reload tool access</button>
        </div>
      )}

      {loading ? (
        <LoadingGrid />
      ) : (
        <>
          <ModuleSection
            title="Your tools"
            icon={<Rocket size={13} />}
            empty="No tools are ready for this organization yet. An organization administrator can add tool access, or you can review available tools."
            cards={activeCards}
            onLaunch={recordLaunch}
            onNavigate={onNavigate}
            canManage={userIsTenantAdmin}
          />

          <ModuleSection
            title="More tools you can add"
            icon={<Lock size={13} />}
            empty="Every active tool is already available to this organization."
            cards={addableCards}
            onLaunch={recordLaunch}
            onNavigate={onNavigate}
            canManage={userIsTenantAdmin}
          />

        </>
      )}

      <section
        data-testid="command-center-footer-actions"
        style={{
          marginTop: space.xl,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          gap: space.lg,
        }}
      >
        <button
          onClick={() => onNavigate('apps')}
          style={{
            ...cardStyle,
            borderRadius: radius.md,
            textAlign: 'left',
            cursor: 'pointer',
            color: semantic.text,
            border: `1px dashed ${semantic.accent}`,
            display: 'flex',
            alignItems: 'center',
            gap: space.md,
          }}
        >
          <Store size={20} color={semantic.accent} />
          <span>
            <span style={{ display: 'block', color: '#fff', fontWeight: 700, marginBottom: 3 }}>Browse all tools</span>
            <span style={{ display: 'block', color: semantic.textMuted, fontSize: fontSize.body }}>See what each tool does, what is included, and how to add access.</span>
          </span>
        </button>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: LaunchpadModule['statusTone'] }) {
  return (
    <div
      data-testid={`metric-${label.toLowerCase()}`}
      style={{
        border: `1px solid ${semantic.border}`,
        borderRadius: radius.md,
        background: 'rgba(1,4,9,0.42)',
        padding: '9px 10px',
        minWidth: 0,
      }}
    >
      <div style={{ ...toneBadge(tone), display: 'inline-flex', marginBottom: 6 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: fontSize.sm,
        color: semantic.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin: `0 0 ${space.md}px`,
      }}
    >
      {icon}
      {title}
    </h2>
  );
}

function ModuleSection({
  title,
  icon,
  empty,
  cards,
  onLaunch,
  onNavigate,
  canManage,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  cards: LaunchpadModule[];
  onLaunch: (card: LaunchpadModule) => void;
  onNavigate: (page: string) => void;
  canManage: boolean;
}) {
  return (
    <section style={{ marginBottom: space.xl }} data-testid={`command-center-section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <SectionTitle icon={icon} title={title} />
      {cards.length === 0 ? (
        empty ? (
          <div
            style={{
              padding: space.xl,
              borderRadius: radius.md,
              border: `1px dashed ${semantic.border}`,
              color: semantic.textMuted,
              background: semantic.bgPanel,
            }}
          >
            {empty}
          </div>
        ) : null
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: space.lg }}>
          {cards.map((card) => (
            <ModuleCard
              key={card.registry.slug}
              card={card}
              onLaunch={() => onLaunch(card)}
              onNavigate={onNavigate}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ModuleCard({
  card,
  onLaunch,
  onNavigate,
  canManage,
}: {
  card: LaunchpadModule;
  onLaunch: () => void;
  onNavigate: (page: string) => void;
  canManage: boolean;
}) {
  const image = marketingBySlug.get(card.registry.slug)?.imageSrc;
  const actionButton = renderActionButton({ card, onLaunch, onNavigate });

  return (
    <article
      data-testid={`command-module-card-${card.registry.slug}`}
      style={{
        ...cardStyle,
        borderRadius: radius.md,
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 328,
        opacity: card.action === 'disabled' ? 0.78 : 1,
      }}
    >
      {image && (
        <img
          src={image}
          alt={`${card.name} illustration.`}
          loading="lazy"
          style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: space.lg, display: 'flex', flexDirection: 'column', gap: space.md, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
          <AppLogo name={card.name} slug={card.registry.slug} iconKey={card.registry.iconName} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, color: '#fff', fontSize: fontSize.lg, fontWeight: 750, lineHeight: 1.2 }}>
              {card.name}
            </h3>
            <div style={{ fontSize: fontSize.xs, color: semantic.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>
              {titleCase(card.category)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span data-testid={`module-status-${card.registry.slug}`} style={toneBadge(card.statusTone)}>{card.statusLabel}</span>
          <span data-testid={`module-entitlement-${card.registry.slug}`} style={toneBadge(card.entitlementTone)}>{card.entitlementLabel}</span>
        </div>

        <p style={{ color: semantic.textMuted, fontSize: fontSize.body, lineHeight: 1.45, margin: 0, minHeight: 56 }}>
          {card.description}
        </p>

        <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {actionButton}
          {canManage && (
            <button
              data-testid={`button-manage-${card.registry.slug}`}
              onClick={() => onNavigate('tenant-modules')}
              style={{ ...buttonStyles.secondary, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 11px' }}
              title={`Manage ${card.name} access for this organization`}
            >
              <Settings size={13} /> Manage
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function renderActionButton({
  card,
  onLaunch,
  onNavigate,
}: {
  card: LaunchpadModule;
  onLaunch: () => void;
  onNavigate: (page: string) => void;
}) {
  if (card.action === 'launch') {
    return (
      <>
        <ModuleLaunchLink
          moduleId={card.registry.id}
          data-testid={`button-launch-${card.registry.slug}`}
          onLaunch={onLaunch}
          style={{ ...buttonStyles.primary, display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center', flex: 1, textDecoration: 'none' }}
        >
          <Rocket size={14} /> Open {card.name}
        </ModuleLaunchLink>
        <ModuleLaunchLink
          moduleId={card.registry.id}
          openInNewTab
          data-testid={`button-launch-new-tab-${card.registry.slug}`}
          aria-label={`Open ${card.name} in new tab`}
          title={`Open ${card.name} in new tab`}
          onLaunch={onLaunch}
          style={{ ...buttonStyles.secondary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 10px', textDecoration: 'none' }}
        >
          <ExternalLink size={14} />
        </ModuleLaunchLink>
      </>
    );
  }

  if (card.action === 'upgrade') {
    return (
      <button
        data-testid={`button-upgrade-${card.registry.slug}`}
        onClick={() => onNavigate('billing')}
        style={{ ...buttonStyles.secondary, display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center', flex: 1 }}
      >
        <Lock size={13} /> View plan options
      </button>
    );
  }

  if (card.action === 'addon') {
    return (
      <button
        data-testid={`button-addon-${card.registry.slug}`}
        onClick={() => onNavigate('apps')}
        style={{ ...buttonStyles.secondary, display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center', flex: 1 }}
      >
        <Store size={13} /> View add-on options
      </button>
    );
  }

  const disabledLabel =
    card.action === 'planned' ? 'Planned'
    : card.action === 'tenant_required' ? 'Tenant required'
    : 'Unavailable';
  const Icon =
    card.action === 'planned' ? Clock
    : card.action === 'tenant_required' ? Building2
    : Ban;

  return (
    <button
      data-testid={`button-unavailable-${card.registry.slug}`}
      disabled
      title={card.reason ? titleCase(card.reason) : disabledLabel}
      style={{
        ...buttonStyles.secondary,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        justifyContent: 'center',
        flex: 1,
        cursor: 'not-allowed',
        color: semantic.textMuted,
      }}
    >
      <Icon size={13} /> {disabledLabel}
    </button>
  );
}

function LoadingGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: space.lg }} data-testid="my-apps-loading">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            ...cardStyle,
            borderRadius: radius.md,
            minHeight: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: semantic.textMuted,
            gap: 8,
          }}
        >
          <Loader2 size={16} />
          Loading tool access
        </div>
      ))}
    </div>
  );
}

function mergeTenantListsForSelector<T extends { id: string }>(member: T[], all: T[]): T[] {
  const byId = new Map<string, T>();
  for (const t of all) byId.set(t.id, t);
  for (const t of member) byId.set(t.id, { ...byId.get(t.id), ...t });
  return Array.from(byId.values());
}
