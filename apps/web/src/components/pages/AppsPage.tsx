'use client';

import { useEffect, useState } from 'react';
import { modulesApi } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { colors } from '../SaasLayout';

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
  hasAccess: boolean;
  source: 'plan' | 'addon' | 'override_grant' | 'override_revoke' | 'denied';
  reason?: string;
}

const sourceLabel: Record<string, { label: string; color: string; bg: string }> = {
  plan:           { label: 'Included',     color: '#3fb950', bg: 'rgba(63,185,80,0.15)' },
  addon:          { label: 'Add-on',       color: '#bc8cff', bg: 'rgba(188,140,255,0.15)' },
  override_grant: { label: 'Granted',      color: '#58a6ff', bg: 'rgba(88,166,255,0.15)' },
  override_revoke:{ label: 'Revoked',      color: '#f85149', bg: 'rgba(248,81,73,0.15)' },
  denied:         { label: 'Locked',       color: '#8b949e', bg: 'rgba(139,148,158,0.15)' },
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

export default function AppsPage() {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    try {
      setLoading(true);
      const data = await modulesApi.list();
      setModules(data.modules);
    } catch (err: any) {
      toast(`Failed to load modules: ${err.error || err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const launch = (slug: string) => {
    // Open the popup synchronously (inside the click handler) so browsers
    // do not flag it as a popup. We then navigate it once the handoff
    // token is back. This avoids the "window.open after await" pop-up
    // blocker that all major browsers enforce.
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!popup) {
      toast('Popup blocked — please allow popups for OperatorOS', 'error');
      return;
    }
    setLaunching(slug);
    modulesApi.handoff(slug)
      .then(result => {
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
        {modules.map(({ module: m, hasAccess, source, reason }) => {
          const src = sourceLabel[source] || sourceLabel.denied;
          const status = statusLabel[m.status] || statusLabel.coming_soon;
          const isComingSoon = m.status === 'coming_soon';
          const isLaunchable = hasAccess && m.status === 'live' && !!m.baseUrl;

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
                opacity: hasAccess ? 1 : 0.85,
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
                {!hasAccess && reason && (
                  <span data-testid={`module-reason-${m.slug}`} style={{ fontStyle: 'italic' }}>
                    {reason.replace(/_/g, ' ')}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                {isLaunchable && (
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
                    {launching === m.slug ? 'Launching…' : 'Launch'}
                  </button>
                )}
                {!isLaunchable && isComingSoon && (
                  <button
                    data-testid={`button-comingsoon-${m.slug}`}
                    disabled
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
                      background: 'transparent', color: colors.textMuted, fontSize: 13, cursor: 'not-allowed',
                    }}
                  >Coming Soon</button>
                )}
                {!isLaunchable && !isComingSoon && !hasAccess && (
                  <button
                    data-testid={`button-subscribe-${m.slug}`}
                    onClick={() => subscribe(m.slug)}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 8,
                      border: `1px solid ${colors.accent}`, background: 'transparent',
                      color: colors.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >Add to plan</button>
                )}
                {!isLaunchable && !isComingSoon && hasAccess && (
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
