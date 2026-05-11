'use client';

/**
 * Task #66 — /admin/health
 *
 * Super-admin-only launch-readiness dashboard. Fetches
 * `GET /v1/platform/health` and renders every probe as a red/green dot.
 * Booleans only by design — secret values and PII never reach the DOM,
 * so a screenshot of this page is always safe to share.
 *
 * Non-super-admin visitors get a friendly 403; the underlying API
 * endpoint enforces `requireSuperAdmin`, so this page is a UI affordance
 * rather than a security boundary.
 */

import { useEffect, useState } from 'react';
import AuthProvider, { useAuth } from '@/components/AuthProvider';

// Local fetch helper — mirrors the apiCall pattern used in PlatformPage so
// /admin/health doesn't take a dependency on the private auth.ts internals.
const API = '/api';
async function apiCall(path: string): Promise<unknown> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface HealthResponse {
  ok: boolean;
  db: { ok: boolean };
  stripe: { mode: string; secretConfigured: boolean; webhookConfigured: boolean; live: boolean; lastSuccessfulWebhookAt: string | null };
  auth: { sessionSecretConfigured: boolean };
  ai: { openaiKeyConfigured: boolean };
  emailFrom: { configured: boolean };
  emailProvider: { configured: boolean; provider: 'resend' | 'log' };
  baseUrl: { configured: boolean };
  plans: {
    seeded: boolean;
    pricesMatchConfig: boolean;
    priceIds: Record<string, { monthly: boolean; annual: boolean }>;
    allMonthlyPriceIdsConfigured: boolean;
    allAnnualPriceIdsConfigured: boolean;
  };
  modules: {
    seeded: boolean;
    hasLive: boolean;
    allLive: boolean;
    brandForgeOsRenamed: boolean;
    addonPriceIds: Record<string, boolean>;
    allAddonPriceIdsConfigured: boolean;
  };
  shotgunTenant: { configured: boolean };
  bootstrapSuperAdmin: { emailConfigured: boolean };
  ssoCleanup: { running?: boolean; lastRunAt?: string | null } | null;
  diagnostics: {
    modulesRegistered: number;
    modulesLive: number;
    modulesComingSoon: number;
    plansSeeded: number;
    pendingInvites: number;
  };
  lastWebhookAt: string | null;
  lastAuditAt: string | null;
  now: string;
}

const dot = (ok: boolean) => (
  <span
    aria-label={ok ? 'ok' : 'missing'}
    style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? '#3fb950' : '#f85149', marginRight: 8, verticalAlign: 'middle',
    }}
  />
);

function Row({ label, ok, sub }: { label: string; ok: boolean; sub?: string }) {
  return (
    <div data-testid={`health-row-${label.replace(/\s+/g, '-').toLowerCase()}`}
         style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #21262d' }}>
      {dot(ok)}
      <span style={{ color: '#c9d1d9', flex: 1 }}>{label}</span>
      {sub && <span style={{ color: '#8b949e', fontSize: 12 }}>{sub}</span>}
    </div>
  );
}

function HealthDashboard() {
  const { user, loading } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || (user as { platformRole?: string }).platformRole !== 'super_admin') {
      setError('forbidden');
      setLoadingHealth(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = (await apiCall('/v1/platform/health')) as HealthResponse;
        if (alive) setHealth(res);
      } catch (e) {
        const msg = (e as { error?: string; message?: string })?.error
                 ?? (e as { message?: string })?.message
                 ?? 'Failed to load health';
        if (alive) setError(msg);
      } finally {
        if (alive) setLoadingHealth(false);
      }
    })();
    return () => { alive = false; };
  }, [user, loading]);

  if (loading || loadingHealth) {
    return <div style={{ padding: 48, color: '#8b949e' }}>Loading health…</div>;
  }
  if (error === 'forbidden') {
    return (
      <div style={{ padding: 48, color: '#8b949e', textAlign: 'center' }}>
        <div style={{ color: '#f85149', fontSize: 18, marginBottom: 12 }}>403 — Super admin only</div>
        <div>This page is restricted to platform super admins.</div>
      </div>
    );
  }
  if (error || !health) {
    return <div style={{ padding: 48, color: '#f85149' }}>Failed to load: {error}</div>;
  }

  const planEntries = Object.entries(health.plans.priceIds);
  const addonEntries = Object.entries(health.modules.addonPriceIds);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 32, color: '#c9d1d9', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 data-testid="text-admin-health-title" style={{ fontSize: 24, marginBottom: 4 }}>Platform Health</h1>
      <div style={{ color: '#8b949e', marginBottom: 24, fontSize: 13 }}>
        Probed at {new Date(health.now).toLocaleString()}
      </div>

      <Section title="Viewer Context">
        <Row label="Your platform role" ok={true} sub={(user as { platformRole?: string })?.platformRole ?? 'user'} />
        <Row label="Active tenant id"
             ok={!!(user as { currentTenantId?: string | null })?.currentTenantId}
             sub={(user as { currentTenantId?: string | null })?.currentTenantId ?? 'none'} />
      </Section>

      <Section title="Core">
        <Row label="Database reachable" ok={health.db.ok} />
        <Row label="Session secret configured" ok={health.auth.sessionSecretConfigured} />
        <Row label="OpenAI key configured" ok={health.ai.openaiKeyConfigured} />
        <Row label="EMAIL_FROM configured" ok={health.emailFrom.configured} />
        <Row label="Email provider configured"
             ok={health.emailProvider?.configured ?? false}
             sub={health.emailProvider?.provider ?? 'log'} />
        <Row label="OPERATOROS_BASE_URL configured" ok={health.baseUrl.configured} />
        <Row label="Bootstrap super-admin email set" ok={health.bootstrapSuperAdmin.emailConfigured} />
        <Row label="Shotgun tenant configured" ok={health.shotgunTenant.configured} />
      </Section>

      <Section title="Stripe">
        <Row label="STRIPE_SECRET_KEY configured" ok={health.stripe.secretConfigured} />
        <Row label="STRIPE_WEBHOOK_SECRET configured" ok={health.stripe.webhookConfigured} />
        <Row label="Stripe mode = live" ok={health.stripe.live} sub={health.stripe.mode} />
        <Row label="Last verified webhook seen" ok={!!health.stripe.lastSuccessfulWebhookAt}
             sub={health.stripe.lastSuccessfulWebhookAt ?? 'never'} />
      </Section>

      <Section title="Plans">
        <Row label="Plans seeded" ok={health.plans.seeded} />
        <Row label="DB prices match PLAN_CONFIGS" ok={health.plans.pricesMatchConfig} />
        <Row label="All monthly Stripe price IDs configured" ok={health.plans.allMonthlyPriceIdsConfigured} />
        <Row label="All annual Stripe price IDs configured" ok={health.plans.allAnnualPriceIdsConfigured} />
        {planEntries.map(([slug, ids]) => (
          <div key={slug} style={{ display: 'flex', gap: 16, padding: '6px 0 6px 20px', fontSize: 13 }}>
            <span style={{ width: 90, color: '#8b949e' }}>{slug}</span>
            <span>{dot(ids.monthly)} monthly</span>
            <span>{dot(ids.annual)} annual</span>
          </div>
        ))}
      </Section>

      <Section title="Modules">
        <Row label="Modules seeded" ok={health.modules.seeded} />
        <Row label="At least one live module" ok={health.modules.hasLive} />
        <Row label="All modules live (none coming-soon)" ok={health.modules.allLive} />
        <Row label="BrandForgeOS slug renamed" ok={health.modules.brandForgeOsRenamed} />
        <Row label="All addon Stripe price IDs configured" ok={health.modules.allAddonPriceIdsConfigured} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, padding: '6px 0 6px 20px', fontSize: 13 }}>
          {addonEntries.map(([slug, ok]) => (
            <div key={slug}>{dot(ok)}<span style={{ color: '#8b949e' }}>{slug}</span></div>
          ))}
        </div>
      </Section>

      <Section title="Diagnostics">
        <Counter label="Modules registered" value={health.diagnostics.modulesRegistered} />
        <Counter label="Modules live" value={health.diagnostics.modulesLive} />
        <Counter label="Modules coming soon" value={health.diagnostics.modulesComingSoon} />
        <Counter label="Plans seeded" value={health.diagnostics.plansSeeded} />
        <Counter label="Pending invites" value={health.diagnostics.pendingInvites} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</h2>
      <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: '4px 16px' }}>
        {children}
      </div>
    </section>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div data-testid={`health-counter-${label.replace(/\s+/g, '-').toLowerCase()}`}
         style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #21262d' }}>
      <span style={{ color: '#c9d1d9' }}>{label}</span>
      <span style={{ color: '#58a6ff', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export default function AdminHealthRoute() {
  return (
    <AuthProvider>
      <HealthDashboard />
    </AuthProvider>
  );
}
