'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import FinalCta from '@/components/marketing/sections/FinalCta';
import { OperatorLogo } from '@/components/brand';
import { brand } from '@/lib/brand';
import { useAuth } from '@/components/AuthProvider';
import { useEntitlements } from '@/lib/use-entitlements';
import {
  getAllModules,
  type EcosystemModule,
  type EcosystemModuleStatus,
} from '@operatoros/sdk';

/**
 * Apps launcher landing page — Task #128.
 *
 * The public "front door" to the OperatorOS application catalog. It
 * consumes the shared ecosystem registry (`getAllModules`) as the single
 * source of truth — there is deliberately no second module list here, so
 * this surface can never drift from `/ecosystem` or the SDK.
 *
 * Per-card click routing is auth- and access-aware (mirrors the
 * `marketing-cta.ts` matrix):
 *
 *   | Viewer state                       | Destination          |
 *   | ---------------------------------- | -------------------- |
 *   | Signed out                         | /pricing (billing)   |
 *   | Signed in, granted access          | /app/apps/<slug>     |
 *   | Signed in, NOT granted access      | /pricing (billing)   |
 *
 * Auth/entitlement hooks must run *inside* MarketingLayout because that
 * is where AuthProvider lives — so the catalog is its own child
 * component rather than being inlined into the page function.
 */
export default function AppsPage() {
  return (
    <MarketingLayout testId="page-apps">
      <AppsHero />
      <AppsCatalog />
      <FinalCta />
    </MarketingLayout>
  );
}

function AppsHero() {
  return (
    <header
      data-testid="apps-header"
      style={{
        padding: '80px 24px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
        textAlign: 'center',
        backgroundImage: brand.heroRadial,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
        <OperatorLogo size={40} wordmarkSize={20} testId="apps-logo" />
      </div>
      <span
        style={{
          display: 'inline-block',
          padding: '6px 12px',
          borderRadius: 999,
          border: `1px solid ${brand.borderSoft}`,
          background: brand.bgGlass,
          fontFamily: brand.fontDisplay,
          fontSize: 12,
          fontWeight: 600,
          color: brand.textSecondary,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        The OperatorOS App Catalog
      </span>
      <h1
        style={{
          fontFamily: brand.fontDisplay,
          fontSize: 'clamp(34px, 5.5vw, 56px)',
          fontWeight: 700,
          color: brand.textPrimary,
          margin: '18px auto 14px',
          letterSpacing: '-0.025em',
          maxWidth: 880,
        }}
      >
        Every application your team operates, launched from one place.
      </h1>
      <p
        style={{
          fontSize: 17,
          lineHeight: 1.6,
          color: brand.textSecondary,
          margin: '0 auto',
          maxWidth: 680,
        }}
      >
        OperatorOS is the central command layer for your product ecosystem — one
        sign-on, one bill, one console. Pick an application below: if you already
        have access it opens straight away, otherwise you can subscribe in a
        couple of clicks.
      </p>
    </header>
  );
}

function AppsCatalog() {
  const { user, loading } = useAuth();
  const entitled = useEntitlements();
  const modules = getAllModules();

  return (
    <section
      data-testid="apps-catalog"
      style={{
        padding: '32px 24px 56px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <span
          style={{
            display: 'inline-block',
            fontFamily: brand.fontDisplay,
            fontSize: 12,
            fontWeight: 600,
            color: brand.accentCyan,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Applications
        </span>
        <h2
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(24px, 3.5vw, 34px)',
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          Browse the catalog
        </h2>
        <p style={{ fontSize: 15, color: brand.textSecondary, margin: 0, maxWidth: 640 }}>
          {user
            ? 'Apps you have access to open in the console. Locked apps take you to pricing to unlock them.'
            : 'Sign in or subscribe to launch any application from your OperatorOS console.'}
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
      >
        {modules.map((m) => (
          <AppCard
            key={m.slug}
            module={m}
            signedIn={!!user}
            authLoading={loading}
            entitled={entitled}
          />
        ))}
      </div>
    </section>
  );
}

interface CardTarget {
  href: string;
  label: string;
  locked: boolean;
  pending: boolean;
}

/**
 * Resolve the click destination for a card from the viewer's auth +
 * entitlement state. `entitled` is `null` while it is still resolving
 * for a signed-in viewer (or always, for anonymous viewers).
 */
function resolveTarget(
  slug: string,
  signedIn: boolean,
  authLoading: boolean,
  entitled: ReadonlySet<string> | null,
): CardTarget {
  if (authLoading) {
    return { href: '/pricing', label: 'Checking access…', locked: false, pending: true };
  }
  if (!signedIn) {
    return { href: '/pricing', label: 'View plans', locked: true, pending: false };
  }
  // Signed in but entitlements still loading.
  if (entitled === null) {
    return { href: '/pricing', label: 'Checking access…', locked: false, pending: true };
  }
  if (entitled.has(slug)) {
    return { href: `/app/apps/${slug}`, label: 'Open app', locked: false, pending: false };
  }
  return { href: '/pricing', label: 'Get access', locked: true, pending: false };
}

function statusBadge(status: EcosystemModuleStatus): {
  label: string;
  text: string;
  bg: string;
  border: string;
} {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        text: brand.statusAvailableText,
        bg: brand.statusAvailableBg,
        border: brand.statusAvailableBorder,
      };
    case 'beta':
      return {
        label: 'Beta',
        text: brand.statusBetaText,
        bg: brand.statusBetaBg,
        border: brand.statusBetaBorder,
      };
    case 'planned':
    default:
      return {
        label: 'Planned',
        text: brand.statusComingSoonText,
        bg: brand.statusComingSoonBg,
        border: brand.statusComingSoonBorder,
      };
  }
}

/** Compact monogram used as a per-app logo stand-in (no logo assets yet). */
function monogram(name: string): string {
  const caps = name.match(/[A-Z]/g) ?? [];
  if (caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  const letters = name.replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 2).toUpperCase() || '?';
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 22,
  borderRadius: 14,
  background: brand.bgElevated,
  border: `1px solid ${brand.borderSoft}`,
  textDecoration: 'none',
  height: '100%',
};

function AppCard({
  module: m,
  signedIn,
  authLoading,
  entitled,
}: {
  module: EcosystemModule;
  signedIn: boolean;
  authLoading: boolean;
  entitled: ReadonlySet<string> | null;
}) {
  const badge = statusBadge(m.status);
  const target = resolveTarget(m.slug, signedIn, authLoading, entitled);

  const inner = (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span
            aria-hidden="true"
            data-testid={`img-app-logo-${m.slug}`}
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              borderRadius: 11,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: brand.fontDisplay,
              fontSize: 16,
              fontWeight: 700,
              color: brand.accentInk,
              background: `linear-gradient(135deg, ${brand.accentCyan}, ${brand.accentViolet})`,
            }}
          >
            {monogram(m.name)}
          </span>
          <h3
            data-testid={`text-app-name-${m.slug}`}
            style={{
              fontFamily: brand.fontDisplay,
              fontSize: 18,
              fontWeight: 600,
              color: brand.textPrimary,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {m.name}
          </h3>
        </div>
        <span
          data-testid={`status-app-${m.slug}`}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 999,
            color: badge.text,
            background: badge.bg,
            border: `1px solid ${badge.border}`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {badge.label}
        </span>
      </div>

      <span
        data-testid={`text-app-category-${m.slug}`}
        style={{
          alignSelf: 'flex-start',
          fontSize: 11,
          fontWeight: 600,
          padding: '3px 8px',
          borderRadius: 6,
          color: brand.textSecondary,
          background: brand.bgGlass,
          border: `1px solid ${brand.borderSoft}`,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {m.category}
      </span>

      <p
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          color: brand.textSecondary,
          margin: 0,
          minHeight: 44,
        }}
      >
        {m.description}
      </p>

      <span
        data-testid={`cta-app-${m.slug}`}
        style={{
          marginTop: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '10px 14px',
          borderRadius: 10,
          minHeight: 44,
          background: 'transparent',
          color: target.pending ? brand.textMuted : brand.textPrimary,
          fontSize: 13,
          fontWeight: 600,
          border: `1px solid ${target.pending ? brand.borderSoft : brand.borderStrong}`,
        }}
      >
        <span>{target.label}</span>
        {target.locked ? <Lock size={14} /> : <ArrowRight size={14} />}
      </span>
    </>
  );

  // While auth/entitlements resolve, render a non-navigating placeholder so
  // a signed-in entitled viewer never gets bounced to /pricing on an early
  // click during the loading window.
  if (target.pending) {
    return (
      <div
        data-testid={`card-app-${m.slug}`}
        aria-busy="true"
        aria-disabled="true"
        style={{ ...cardStyle, cursor: 'default', opacity: 0.85 }}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={target.href}
      data-testid={`card-app-${m.slug}`}
      aria-label={`${m.name} — ${target.label}`}
      style={cardStyle}
    >
      {inner}
    </Link>
  );
}
