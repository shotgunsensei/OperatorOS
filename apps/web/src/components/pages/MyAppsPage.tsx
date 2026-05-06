'use client';

import React, { useEffect, useState } from 'react';
import { Rocket, Store, Sparkles, ExternalLink } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { meApi, modulesApi } from '@/lib/auth';

interface MyAppsPageProps {
  onNavigate: (page: string) => void;
}

interface UnlockedModule {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  iconUrl: string | null;
  baseUrl: string | null;
}

export default function MyAppsPage({ onNavigate }: MyAppsPageProps) {
  const [modules, setModules] = useState<UnlockedModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await meApi.modules();
        if (alive) setModules(data.modules ?? []);
      } catch {
        if (alive) setModules([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const launch = async (slug: string) => {
    setLaunching(slug);
    try {
      const r = await modulesApi.handoff(slug);
      if (r?.launchUrl) window.open(r.launchUrl, '_blank', 'noopener');
    } catch (e: any) {
      // Surface launch errors inline; the marketplace also lets users
      // resolve entitlement / status issues.
      window.alert(e?.error || 'Launch failed');
    } finally {
      setLaunching(null);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }} data-testid="page-my-apps">
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#fff', letterSpacing: '-0.02em' }}>
          My Apps
        </h1>
        <p style={{ color: colors.textMuted, margin: '6px 0 0', fontSize: 14 }}>
          Launchpad for every module you have access to.
        </p>
      </header>

      {loading ? (
        <div style={{ color: colors.textMuted, padding: 24 }} data-testid="my-apps-loading">Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
          {modules.map(m => (
            <button
              key={m.slug}
              data-testid={`card-app-${m.slug}`}
              onClick={() => launch(m.slug)}
              disabled={launching === m.slug}
              style={{
                textAlign: 'left',
                background: colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: 16,
                cursor: launching === m.slug ? 'wait' : 'pointer',
                color: colors.text,
                transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = colors.accent;
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(88,166,255,0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'linear-gradient(135deg, #58a6ff22, #bc8cff22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${colors.border}`,
                }}>
                  <Rocket size={20} color={colors.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {m.category || 'app'}
                  </div>
                </div>
                <ExternalLink size={14} color={colors.textDim} />
              </div>
              <p style={{ fontSize: 13, color: colors.textMuted, margin: 0, minHeight: 36 }}>
                {m.description || 'Open this app.'}
              </p>
            </button>
          ))}

          <button
            data-testid="card-marketplace-cta"
            onClick={() => onNavigate('apps')}
            style={{
              textAlign: 'left',
              background: 'linear-gradient(135deg, #58a6ff15, #bc8cff15)',
              border: `1px dashed ${colors.accent}`,
              borderRadius: 12,
              padding: 16,
              cursor: 'pointer',
              color: colors.text,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: colors.bgHover, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Store size={20} color={colors.accentPurple} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>Browse the Marketplace</div>
                <div style={{ fontSize: 11, color: colors.textMuted }}>Discover more apps</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
              Need more capability? Activate trials or purchase add-ons.
            </p>
          </button>

          {modules.length === 0 && (
            <div
              data-testid="my-apps-empty"
              style={{
                gridColumn: '1 / -1',
                padding: 32, textAlign: 'center',
                color: colors.textMuted, fontSize: 14,
                background: colors.bgSecondary, border: `1px dashed ${colors.border}`,
                borderRadius: 12,
              }}
            >
              <Sparkles size={32} color={colors.accentPurple} style={{ marginBottom: 12 }} />
              <div>You don’t have any apps yet — head to the marketplace to activate one.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
