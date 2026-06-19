'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, ArrowLeft, AlertTriangle } from 'lucide-react';
import { semantic, space, fontSize, radius, cardStyle } from '@/lib/design-tokens';
import { moduleApi } from '@/lib/auth';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import LoginPage from '@/components/pages/LoginPage';
import OperatorLoader from '@/components/brand/OperatorLoader';
import StudyForgeShell from '@/components/module-shells/StudyForgeShell';
import NinjaLaunchKitShell from '@/components/module-shells/NinjaLaunchKitShell';
import CallCommandShell from '@/components/module-shells/CallCommandShell';
import NinjamationShell from '@/components/module-shells/NinjamationShell';

// Mirrors the server's UserModuleSummary shape returned by
// GET /v1/modules/:slug. Defined inline (rather than imported from the
// API package) because the web app is a separate workspace and this is
// the only consumer; if a third surface ever needs it, promote to SDK.
interface UserModuleSummary {
  module: {
    slug: string;
    name: string;
    description?: string | null;
    baseUrl: string;
    status: string;
  };
  unlocked: boolean;
  cta: 'open' | 'launch' | 'upgrade' | 'buy_addon' | 'coming_soon' | string;
  reason?: string;
}

const POLISHED_SHELLS: Record<string, React.ComponentType<{ baseUrl?: string }>> = {
  'studyforge-ai':    StudyForgeShell,
  'ninja-launch-kit': NinjaLaunchKitShell,
  'callcommand-ai':   CallCommandShell,
  'ninjamation':      NinjamationShell,
};

function InternalAppContent() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [mod, setMod] = useState<UserModuleSummary['module'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!slug) return;
      try {
        // Task #66 round 3 fix: tenant-scoped entitlement check.
        // GET /v1/modules/:slug is gated by `requireTenantMember` and
        // returns `getModuleForUser(user.id, ctx.tenantId, slug)` —
        // i.e. the entitlement is evaluated for the *active* tenant
        // only, never the union of every tenant the user belongs to.
        // The active tenant is sourced from apiFetch's X-Tenant-Id
        // header (driven by users.current_tenant_id in AuthProvider).
        // hasAccess===false is treated as "not enabled for this
        // tenant" so we surface the same not-accessible card we used
        // to render when the slug was missing from the union list.
        // GET /v1/modules/:slug returns UserModuleSummary, with the
        // authoritative entitlement signal in `unlocked` and module
        // metadata nested under `.module`. The UI MUST NOT recompute
        // unlocked from any other field — server is source of truth.
        const summary = (await moduleApi.get(slug)) as UserModuleSummary | null;
        if (!alive) return;
        if (!summary || summary.unlocked === false) {
          setMod(null);
        } else {
          setMod(summary.module);
        }
      } catch (e) {
        const errObj = e as { status?: number; error?: string; code?: string; message?: string };
        // 403 / 404 from the tenant-scoped check both mean "not
        // entitled in the active tenant" — render the friendly
        // not-accessible card instead of a raw error toast.
        if (errObj?.status === 403 || errObj?.status === 404) {
          if (alive) { setMod(null); setErr(null); }
        } else {
          const msg = errObj?.error ?? errObj?.message ?? 'Failed to load module';
          if (alive) setErr(msg);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (!slug) return null;

  if (loading) {
    return (
      <div style={{ padding: space.xxl, color: semantic.textMuted }} data-testid="app-shell-loading">
        Loading module access...
      </div>
    );
  }

  if (err || !mod) {
    return (
      <div style={{ padding: space.xxl, maxWidth: 720, margin: '0 auto' }}>
        <BackLink />
        <div
          data-testid="app-shell-not-accessible"
          style={{
            ...cardStyle,
            borderColor: semantic.accentDanger,
            background: `${semantic.accentDanger}15`,
            display: 'flex', alignItems: 'center', gap: space.md,
          }}
        >
          <AlertTriangle size={18} color={semantic.accentDanger} />
          <div>
            <div style={{ color: semantic.accentDanger, fontWeight: 600 }}>
              {err ? 'Could not load this module' : `${slug} is not enabled for this tenant`}
            </div>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>
              {err ?? 'Open the Module Marketplace or ask a tenant admin to grant access. OperatorOS will enforce entitlement before launch.'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const Shell = POLISHED_SHELLS[mod.slug];
  if (Shell) {
    return (
      <div>
        <div style={{ padding: `${space.lg}px ${space.xxl}px 0` }}>
          <BackLink />
        </div>
        <Shell baseUrl={mod.baseUrl ?? undefined} />
      </div>
    );
  }

  // Generic launcher card for the remaining 7 external modules.
  const isExternal = mod.baseUrl && /^https?:\/\//i.test(mod.baseUrl);
  return (
    <div style={{ padding: space.xxl, maxWidth: 720, margin: '0 auto' }} data-testid={`app-shell-${mod.slug}`}>
      <BackLink />
      <div style={{ ...cardStyle }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#fff' }}>{mod.name}</h1>
        {mod.description && (
          <p style={{ color: semantic.textMuted, margin: `${space.sm}px 0 0`, fontSize: fontSize.body }}>
            {mod.description}
          </p>
        )}
        <div style={{ marginTop: space.lg, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isExternal ? (
            <a
              href={mod.baseUrl!}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`link-launch-${mod.slug}`}
              onClick={(e) => {
                e.preventDefault();
                import('@/lib/launch').then(({ openExternal }) => openExternal(mod.baseUrl!));
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: radius.sm,
                background: semantic.accent, color: '#fff', textDecoration: 'none',
                fontWeight: 600, fontSize: fontSize.body,
              }}
            >
              Launch {mod.name} <ExternalLink size={14} />
            </a>
          ) : (
            <span
              data-testid={`text-no-baseurl-${mod.slug}`}
              style={{ color: semantic.textMuted, fontSize: fontSize.sm }}
            >
              This module is enabled, but no external launch URL is configured yet.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Auth gate for the per-module surface.
 *
 * Wrapping the route in AuthProvider + ToastProvider mirrors /app:
 * unauthenticated visitors see the inline LoginPage (which posts to
 * /v1/auth/login and updates AuthProvider state without leaving the
 * page), loading visitors see the branded loader, and signed-in users
 * land in the module shell. This closes the gap where direct hits to
 * /app/apps/:slug without a session would fall through to API 401s
 * instead of the standard sign-in experience.
 *
 * Server-side middleware (apps/web/src/middleware.ts) additionally
 * 307-redirects cookie-less requests to `/`, so anonymous traffic
 * never reaches this code in normal use — the gate below is the
 * defense-in-depth client-side equivalent.
 */
function InternalAppGate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: semantic.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <OperatorLoader />
      </div>
    );
  }
  if (!user) return <LoginPage onSwitch={() => { /* no register flow from module route */ }} />;
  return <InternalAppContent />;
}

export default function InternalAppPage() {
  return (
    <AuthProvider>
      <ToastProvider>
        <InternalAppGate />
      </ToastProvider>
    </AuthProvider>
  );
}

function BackLink() {
  return (
    <Link
      href="/app"
      data-testid="link-back-to-apps"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: semantic.textMuted, textDecoration: 'none',
        fontSize: fontSize.sm, marginBottom: space.md,
      }}
    >
      <ArrowLeft size={14} /> Back to My Apps
    </Link>
  );
}
