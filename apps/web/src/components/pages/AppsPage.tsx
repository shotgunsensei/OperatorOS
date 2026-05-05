'use client';

import { useEffect, useState } from 'react';
import { modulesApi } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { colors } from '../SaasLayout';

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
  const { toast } = useToast();

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

  const launch = (slug: string) => {
    // Open the popup synchronously so browsers don't flag it as a popup,
    // then navigate it once the handoff token is back.
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!popup) {
      toast('Popup blocked — please allow popups for OperatorOS', 'error');
      return;
    }
    setLaunching(slug);
    modulesApi.handoff(slug)
      .then((result: any) => {
        if (result.warning) toast(result.warning, 'error');
        if (result.launchUrl) popup.location.replace(result.launchUrl);
        else { popup.close(); toast('No launch URL configured', 'error'); }
      })
      .catch(err => {
        popup.close();
        toast(`Could not launch: ${err.error || err.message}`, 'error');
      })
      .finally(() => setLaunching(null));
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

  if (loading) {
    return (
      <div style={{ padding: 32, color: colors.textMuted, fontSize: 14 }} data-testid="apps-loading">
        Loading apps...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }} data-testid="apps-page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Shotgun OS Apps</h1>
        <p style={{ fontSize: 14, color: colors.textMuted, marginTop: 6 }}>
          Single sign-on into every product in the Shotgun ecosystem. Your access updates instantly when your plan changes.
        </p>
      </div>

      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      }}>
        {modules.map(({ module: m, unlocked, access_source, cta, upgrade_target_plan, addon_price_cents, reason }) => {
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
                    {launching === m.slug ? 'Launching…' : 'Open App'}
                  </button>
                )}
                {cta === 'coming_soon' && (
                  <button
                    data-testid={`button-comingsoon-${m.slug}`}
                    disabled
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
                {cta === 'disabled' && (
                  <button
                    data-testid={`button-disabled-${m.slug}`}
                    disabled
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
                      background: 'transparent', color: colors.textMuted, fontSize: 13, cursor: 'not-allowed',
                    }}
                  >Unavailable</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
