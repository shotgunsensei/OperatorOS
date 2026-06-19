'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  Rocket, Store, Sparkles, ExternalLink, Clock, Megaphone,
  LifeBuoy, Lock, Mail,
} from 'lucide-react';
import {
  colors, cardStyle, panelStyle, buttonStyles, badgeStyles,
  semantic, space, radius, fontSize,
} from '@/lib/design-tokens';
import { meApi, modulesApi } from '@/lib/auth';
import { MARKETING_MODULES } from '@/lib/marketing-catalog';

interface MyAppsPageProps {
  onNavigate: (page: string) => void;
}

interface ModuleComponentRef {
  slug: string;
  name: string;
  ord: number;
}

interface UnlockedModule {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  iconUrl: string | null;
  baseUrl: string | null;
  component?: ModuleComponentRef | null;
}

interface CatalogModule {
  module: { slug: string; name: string; description: string | null; status: string };
  unlocked: boolean;
  cta: string;
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
  } catch { return []; }
}
function pushRecent(slug: string) {
  if (typeof window === 'undefined') return;
  const cur = readRecent().filter(s => s !== slug);
  cur.unshift(slug);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)));
  } catch {}
}

export default function MyAppsPage({ onNavigate }: MyAppsPageProps) {
  const [modules, setModules] = useState<UnlockedModule[]>([]);
  const [locked, setLocked] = useState<CatalogModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const [requestSent, setRequestSent] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRecentSlugs(readRecent());
    (async () => {
      try {
        const [mineRes, catalogRes] = await Promise.all([
          meApi.modules().catch(() => ({ modules: [] })),
          modulesApi.list().catch(() => ({ modules: [] })),
        ]);
        if (!alive) return;
        setModules(mineRes.modules ?? []);
        // Pluck the locked-but-actionable items (not "live" for the user yet)
        // so we can offer a Request Access path inline.
        const lockedRows: CatalogModule[] = (catalogRes.modules ?? [])
          .filter((m: any) => !m.unlocked && m.cta !== 'coming_soon' && m.cta !== 'disabled');
        setLocked(lockedRows.slice(0, 4));
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
      pushRecent(slug);
      setRecentSlugs(readRecent());
      if (r?.launchUrl) {
        const { openExternal } = await import('@/lib/launch');
        await openExternal(r.launchUrl);
      }
    } catch (e: any) {
      window.alert(e?.error || 'Launch failed');
    } finally {
      setLaunching(null);
    }
  };

  const requestAccess = (slug: string) => {
    // There is no backend "request access" route yet. Route the user to
    // the Marketplace instead of pretending a request was sent.
    setRequestSent(slug);
    onNavigate('apps');
    window.setTimeout(() => setRequestSent(null), 3500);
  };

  const recentApps = useMemo(() => {
    if (recentSlugs.length === 0) return [];
    const bySlug = new Map(modules.map(m => [m.slug, m]));
    return recentSlugs.map(s => bySlug.get(s)).filter(Boolean) as UnlockedModule[];
  }, [recentSlugs, modules]);

  // Task #115: group the launchpad apps under their platform component
  // heading, ordered by component `ord`. Component metadata is server-
  // provided (no hardcoded slug→component map). Apps with no component fall
  // into a trailing "Other" bucket. Empty components never render a header.
  const groupedModules = useMemo(() => {
    const bySlug = new Map<string, { component: ModuleComponentRef; modules: UnlockedModule[] }>();
    const ungrouped: UnlockedModule[] = [];
    for (const m of modules) {
      const c = m.component;
      if (!c) { ungrouped.push(m); continue; }
      let bucket = bySlug.get(c.slug);
      if (!bucket) { bucket = { component: c, modules: [] }; bySlug.set(c.slug, bucket); }
      bucket.modules.push(m);
    }
    const sections = Array.from(bySlug.values())
      .sort((a, b) => a.component.ord - b.component.ord)
      .map(b => ({ slug: b.component.slug, name: b.component.name, modules: b.modules }));
    if (ungrouped.length > 0) {
      sections.push({ slug: 'other', name: 'Other', modules: ungrouped });
    }
    return sections;
  }, [modules]);

  const renderAppCard = (m: UnlockedModule) => (
    <button
      key={m.slug}
      data-testid={`card-app-${m.slug}`}
      onClick={() => launch(m.slug)}
      disabled={launching === m.slug}
      style={{
        ...cardStyle,
        padding: 0,
        overflow: 'hidden',
        textAlign: 'left',
        cursor: launching === m.slug ? 'wait' : 'pointer',
        color: semantic.text,
        transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = semantic.accent;
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(88,166,255,0.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.borderColor = semantic.border;
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {marketingBySlug.get(m.slug)?.imageSrc && (
        <img
          src={marketingBySlug.get(m.slug)?.imageSrc}
          alt={`${m.name} application launch card visual.`}
          loading="lazy"
          style={{ width: '100%', height: 118, objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: space.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
          <div style={{
            width: 40, height: 40, borderRadius: radius.md,
            background: 'linear-gradient(135deg, #58a6ff22, #bc8cff22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${semantic.border}`,
          }}>
            <Rocket size={20} color={semantic.accent} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: fontSize.md, color: '#fff' }}>{m.name}</div>
            <div style={{ fontSize: fontSize.xs, color: semantic.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {m.category || 'app'}
            </div>
          </div>
          <ExternalLink size={14} color={semantic.textDim} />
        </div>
        <p style={{ fontSize: fontSize.body, color: semantic.textMuted, margin: 0, minHeight: 36 }}>
          {marketingBySlug.get(m.slug)?.outcome || m.description || 'Open this app.'}
        </p>
      </div>
    </button>
  );

  return (
    <div style={{ padding: space.xxl, maxWidth: 1200, margin: '0 auto' }} data-testid="page-my-apps">
      <header
        style={{
          marginBottom: space.xl,
          padding: '24px 24px 22px',
          borderRadius: 16,
          border: `1px solid ${semantic.border}`,
          background:
            'linear-gradient(135deg, rgba(88,166,255,0.13), rgba(188,140,255,0.08)), linear-gradient(180deg, #0d1117, #010409)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 18,
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: fontSize.xs, color: semantic.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Operator launchpad
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, color: '#fff', letterSpacing: 0 }}>
            One login. Every operation.
          </h1>
          <p style={{ color: semantic.textMuted, margin: '8px 0 0', fontSize: fontSize.md, maxWidth: 620, lineHeight: 1.55 }}>
            Launch unlocked modules, review access options, and keep recent work one click away.
          </p>
        </div>
        <div
          aria-hidden
          style={{
            display: 'grid',
            gap: 8,
            minWidth: 170,
          }}
        >
          <span style={{ ...badgeStyles.success, textAlign: 'center' }}>Auth active</span>
          <span style={{ ...badgeStyles.info, textAlign: 'center' }}>Entitlements synced</span>
          <span style={{ ...badgeStyles.neutral, textAlign: 'center' }}>Module handoff ready</span>
        </div>
      </header>

      {/* Recent apps strip */}
      {recentApps.length > 0 && (
        <section style={{ marginBottom: space.xl }} data-testid="my-apps-recent">
          <h2 style={{ fontSize: fontSize.sm, color: semantic.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: `0 0 ${space.md}px`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={12} /> Recently launched
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
            {recentApps.map(m => (
              <button
                key={m.slug}
                data-testid={`recent-app-${m.slug}`}
                onClick={() => launch(m.slug)}
                disabled={launching === m.slug}
                style={{
                  ...buttonStyles.secondary,
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: fontSize.sm, padding: '6px 12px',
                }}
              >
                <Rocket size={12} color={semantic.accent} /> {m.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div style={{ color: semantic.textMuted, padding: space.xl }} data-testid="my-apps-loading">Loading module access...</div>
      ) : (
        <>
          {/* Task #115: apps grouped under their platform component heading,
              ordered by component `ord`. */}
          {groupedModules.map(section => (
            <section key={section.slug} data-testid={`component-section-${section.slug}`} style={{ marginBottom: space.xl }}>
              <h2
                data-testid={`component-heading-${section.slug}`}
                style={{
                  fontSize: fontSize.sm, color: semantic.textDim,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  margin: `0 0 ${space.md}px`,
                }}
              >
                {section.name}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,260px),1fr))', gap: space.lg }}>
                {section.modules.map(renderAppCard)}
              </div>
            </section>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: space.lg }}>
            <button
              data-testid="card-marketplace-cta"
              onClick={() => onNavigate('apps')}
              style={{
                ...cardStyle,
                textAlign: 'left',
                background: 'linear-gradient(135deg, #58a6ff15, #bc8cff15)',
                border: `1px dashed ${semantic.accent}`,
                cursor: 'pointer',
                color: semantic.text,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
                <div style={{
                  width: 40, height: 40, borderRadius: radius.md,
                  background: semantic.bgHover, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Store size={20} color={semantic.accentInfo} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: fontSize.md, color: '#fff' }}>Browse the Marketplace</div>
                  <div style={{ fontSize: fontSize.xs, color: semantic.textMuted }}>Discover more apps</div>
                </div>
              </div>
              <p style={{ fontSize: fontSize.body, color: semantic.textMuted, margin: 0 }}>
                Need more capability? Activate trials or purchase add-ons.
              </p>
            </button>

            {modules.length === 0 && (
              <div
                data-testid="my-apps-empty"
                style={{
                  gridColumn: '1 / -1',
                  padding: space.xxl, textAlign: 'center',
                  color: semantic.textMuted, fontSize: fontSize.md,
                  background: semantic.bgPanel, border: `1px dashed ${semantic.border}`,
                  borderRadius: radius.lg,
                }}
              >
                <Sparkles size={32} color={semantic.accentInfo} style={{ marginBottom: 12 }} />
                <div>No modules are unlocked for this tenant yet. Open the Marketplace to review plan and add-on options.</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Request access strip */}
      {locked.length > 0 && (
        <section
          data-testid="my-apps-request-access"
          style={{ marginTop: space.xxl, ...panelStyle, padding: space.lg }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.md }}>
            <Lock size={14} color={semantic.accentWarning} />
            <h2 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>Access options</h2>
          </div>
          <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, margin: `0 0 ${space.md}px` }}>
            These modules require a higher plan, add-on purchase, or tenant admin grant. OperatorOS will not unlock them from this screen.
          </p>
          <div style={{ display: 'grid', gap: space.sm }}>
            {locked.map(l => (
              <div
                key={l.module.slug}
                data-testid={`request-row-${l.module.slug}`}
                style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space.md,
                  padding: '10px 12px', borderRadius: radius.md,
                  background: semantic.bg, border: `1px solid ${semantic.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: fontSize.body, color: '#fff' }}>{l.module.name}</div>
                  <div style={{ fontSize: fontSize.xs, color: semantic.textMuted }}>{l.module.description}</div>
                </div>
                <span style={badgeStyles.warning}>{l.cta.replace('_', ' ')}</span>
                <button
                  data-testid={`button-request-${l.module.slug}`}
                  onClick={() => requestAccess(l.module.slug)}
                  style={{ ...buttonStyles.secondary, padding: '6px 12px', fontSize: fontSize.sm, whiteSpace: 'nowrap' }}
                >
                  {requestSent === l.module.slug ? 'Opening Marketplace' : 'View access options'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Announcements + support footer */}
      <section
        data-testid="my-apps-footer"
        style={{
          marginTop: space.xxl,
          display: 'grid', gap: space.lg,
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))',
        }}
      >
        <div data-testid="my-apps-announcements" style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.sm }}>
            <Megaphone size={14} color={semantic.accentInfo} />
            <h3 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>Announcements</h3>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            <li style={{ fontSize: fontSize.body, color: semantic.textMuted }}>
              <span style={badgeStyles.info}>new</span> Tenant admins can manage per-user module access.
            </li>
            <li style={{ fontSize: fontSize.body, color: semantic.textMuted }}>
              <span style={badgeStyles.success}>shipped</span> Marketplace status filters and add-on CTAs.
            </li>
          </ul>
        </div>
        <div data-testid="my-apps-support" style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.sm }}>
            <LifeBuoy size={14} color={semantic.accentSuccess} />
            <h3 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>Need help?</h3>
          </div>
          <p style={{ color: semantic.textMuted, fontSize: fontSize.body, margin: `0 0 ${space.md}px` }}>
            Reach the OperatorOS team for setup help, integrations, or onboarding questions.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
            <a
              data-testid="link-support-email"
              href="mailto:support@operatoros.app"
              style={{ ...buttonStyles.secondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Mail size={12} /> Email support
            </a>
            <button
              data-testid="link-support-docs"
              onClick={() => onNavigate('settings')}
              style={{ ...buttonStyles.ghost, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ExternalLink size={12} /> Account settings
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
