'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, ArrowLeft, AlertTriangle } from 'lucide-react';
import { semantic, space, fontSize, radius, cardStyle } from '@/lib/design-tokens';
import { moduleApi } from '@/lib/auth';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import TenantProvider from '@/components/TenantProvider';
import { ToastProvider } from '@/components/Toast';
import ContactLink from '@/components/ContactLink';
import LoginPage from '@/components/pages/LoginPage';
import OperatorLoader from '@/components/brand/OperatorLoader';
import StudyForgeShell from '@/components/module-shells/StudyForgeShell';
import NinjaLaunchKitShell from '@/components/module-shells/NinjaLaunchKitShell';
import CallCommandShell from '@/components/module-shells/CallCommandShell';
import NinjamationShell from '@/components/module-shells/NinjamationShell';
import OutCallShell from '@/components/module-shells/OutCallShell';
import TechDeckShell from '@/components/module-shells/TechDeckShell';
import PulseDeskShell from '@/components/module-shells/PulseDeskShell';
import TradeFlowKitShell from '@/components/module-shells/TradeFlowKitShell';
import NinjaPoolHallShell from '@/components/module-shells/NinjaPoolHallShell';
import WorkflowModuleShell from '@/components/module-shells/WorkflowModuleShell';
import TorqueShedWorkspace from '@/components/module-shells/TorqueShedWorkspace';
import FaultlineLabWorkspace from '@/components/module-shells/FaultlineLabWorkspace';
import BrandForgeWorkspace from '@/components/module-shells/BrandForgeWorkspace';
import SnapProofWorkspace from '@/components/module-shells/SnapProofWorkspace';
import OperatorOSEcosystemHeader from '@/components/module-shells/OperatorOSEcosystemHeader';
import { useModuleDeepLinkTarget } from './ModuleDeepLinkTarget';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../../packages/modules/navigation.js';

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
  'techdeck':         TechDeckShell,
  'pulsedesk':        PulseDeskShell,
  'tradeflowkit':     TradeFlowKitShell,
  'studyforge-ai':    StudyForgeShell,
  'ninja-launch-kit': NinjaLaunchKitShell,
  'callcommand-ai':   CallCommandShell,
  'ninjamation':      NinjamationShell,
  'outcall':          OutCallShell,
  'ninja-pool-hall':  NinjaPoolHallShell,
  'torqueshed':       TorqueShedWorkspace,
  'faultlinelab':     FaultlineLabWorkspace,
  'brandforgeos':     BrandForgeWorkspace,
  'snapproofos':      SnapProofWorkspace,
};

function InternalAppContent() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const initialSectionId = useModuleDeepLinkTarget();
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
        // returns `getModuleForUser(user.id, ctx.tenantId, slug)` -
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
        // unlocked from any other field - server is source of truth.
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
        // entitled in the active tenant" - render the friendly
        // not-accessible card instead of a raw error toast.
        if (errObj?.status === 403 || errObj?.status === 404) {
          if (alive) { setMod(null); setErr(null); }
        } else {
          if (alive) setErr('OperatorOS could not confirm access to this tool. Your account and tool access have not changed. Try again in a moment.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (!initialSectionId || loading || !mod) return;

    let focusFrame: number | null = null;
    let stopWaitingTimer: number | null = null;
    let observer: MutationObserver | null = null;

    const revealTarget = () => {
      const target = document.getElementById(initialSectionId);
      if (!target) return false;

      observer?.disconnect();
      if (stopWaitingTimer !== null) window.clearTimeout(stopWaitingTimer);
      focusFrame = window.requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'start' });
        target.focus({ preventScroll: true });
      });
      return true;
    };

    // The selected shell can briefly render its tenant-loading state. Observe
    // that bounded transition so a valid deep link still reaches its native
    // workflow once the stable section is mounted.
    if (!revealTarget()) {
      observer = new MutationObserver(() => {
        revealTarget();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      stopWaitingTimer = window.setTimeout(() => observer?.disconnect(), 5_000);
    }

    return () => {
      observer?.disconnect();
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      if (stopWaitingTimer !== null) window.clearTimeout(stopWaitingTimer);
    };
  }, [initialSectionId, loading, mod]);

  if (!slug) return null;

  if (loading) {
    return (
      <div style={{ padding: space.xxl, color: semantic.textMuted }} data-testid="app-shell-loading">
        Checking tool access…
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
              {err ? 'This tool could not be opened' : 'This tool is not available for this organization'}
            </div>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>
              {err ?? 'Browse other tools or ask your organization administrator to add access. OperatorOS checks access again every time a tool opens.'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Link href="/app?page=apps" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '8px 13px', borderRadius: radius.sm, background: semantic.accent, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: fontSize.sm }}>
                Browse other tools
              </Link>
              <a href={DEFAULT_OPERATOROS_NAVIGATION_URLS.supportUrl} style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '8px 13px', borderRadius: radius.sm, border: `1px solid ${semantic.border}`, color: semantic.text, textDecoration: 'none', fontWeight: 700, fontSize: fontSize.sm }}>
                Contact support
              </a>
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
        <OperatorOSEcosystemHeader moduleName={mod.name} moduleSlug={mod.slug} />
        <Shell baseUrl={mod.baseUrl ?? undefined} />
      </div>
    );
  }

  // Fallback launcher for any future reserved module without a dedicated shell.
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
              Open {mod.name} <ExternalLink size={14} />
            </a>
          ) : (
            <span
              data-testid={`text-no-baseurl-${mod.slug}`}
              style={{ color: semantic.textMuted, fontSize: fontSize.sm }}
            >
              This module is enabled but cannot be opened right now. Ask a platform administrator to review its launch settings.
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
 * never reaches this code in normal use - the gate below is the
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
  return (
    <TenantProvider>
      <InternalAppContent />
    </TenantProvider>
  );
}

export default function InternalAppPage() {
  return (
    <AuthProvider>
      <ToastProvider>
        <InternalAppGate />
        <ContactLink />
      </ToastProvider>
    </AuthProvider>
  );
}

function BackLink() {
  return (
    <Link
      href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}
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
