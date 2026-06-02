'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import FinalCta from '@/components/marketing/sections/FinalCta';
import { brand } from '@/lib/brand';
import {
  getAllModules,
  getActiveModules,
  getPlannedModules,
  type EcosystemModule,
  type EcosystemModuleStatus,
} from '@operatoros/sdk';

/**
 * Ecosystem launcher — Task #125.
 *
 * Positions OperatorOS as the central command layer for the whole
 * product ecosystem and renders every registry module as a launch
 * card. All module data is consumed from the foundation's shared SDK
 * helpers (`getAllModules`/`getActiveModules`/`getPlannedModules`) —
 * there is deliberately no second module list defined here so the two
 * surfaces can never drift. Tech Deck leads (its `ord`/`first` flag is
 * resolved inside the SDK), with a visible legacy `techdeck.app`
 * reference. Nothing here embeds or implements any module app.
 */
export default function EcosystemPage() {
  const active = getActiveModules();
  const planned = getPlannedModules();

  // Anything the registry surfaces that is neither active nor planned
  // (e.g. a future `beta` status) is preserved under "Additional
  // Modules" with its own badge rather than being hidden.
  const accountedFor = new Set<string>([
    ...active.map((m) => m.slug),
    ...planned.map((m) => m.slug),
  ]);
  const additional = getAllModules().filter((m) => !accountedFor.has(m.slug));

  return (
    <MarketingLayout testId="page-ecosystem">
      <EcosystemHeader />
      <ModuleSection
        id="active"
        eyebrow="Active Modules"
        title="Live and ready to launch"
        subtitle="Each module runs on its own operatoros.net subdomain with shared sign-on, billing, and admin — launch straight from the command layer."
        modules={active}
        testId="ecosystem-section-active"
      />
      {planned.length > 0 && (
        <ModuleSection
          id="planned"
          eyebrow="Planned / Upcoming Modules"
          title="On the roadmap"
          subtitle="Reserved subdomains for modules joining the ecosystem next."
          modules={planned}
          testId="ecosystem-section-planned"
        />
      )}
      {additional.length > 0 && (
        <ModuleSection
          id="additional"
          eyebrow="Additional Modules"
          title="Also in the ecosystem"
          subtitle="Modules in other lifecycle states, shown with their current status."
          modules={additional}
          testId="ecosystem-section-additional"
        />
      )}
      <FinalCta />
    </MarketingLayout>
  );
}

function EcosystemHeader() {
  return (
    <header
      data-testid="ecosystem-header"
      style={{
        padding: '88px 24px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
        textAlign: 'center',
        backgroundImage: brand.heroRadial,
      }}
    >
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
        The OperatorOS Ecosystem
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
        OperatorOS is the central command layer for your entire product ecosystem.
      </h1>
      <p
        style={{
          fontSize: 17,
          lineHeight: 1.6,
          color: brand.textSecondary,
          margin: '0 auto 24px',
          maxWidth: 680,
        }}
      >
        One platform, one sign-on, one bill. OperatorOS runs the{' '}
        <strong style={{ color: brand.textPrimary }}>platform components</strong> — the
        top-level system areas like app, api, admin, auth, docs, and status — while every
        unlockable product is a <strong style={{ color: brand.textPrimary }}>module</strong>{' '}
        that launches from this command layer on its own operatoros.net subdomain.
      </p>
    </header>
  );
}

function ModuleSection({
  id,
  eyebrow,
  title,
  subtitle,
  modules,
  testId,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  modules: EcosystemModule[];
  testId: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      style={{
        padding: '40px 24px',
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
          {eyebrow}
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
          {title}
        </h2>
        <p style={{ fontSize: 15, color: brand.textSecondary, margin: 0, maxWidth: 640 }}>
          {subtitle}
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
          <ModuleCard key={m.slug} module={m} />
        ))}
      </div>
    </section>
  );
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

function ModuleCard({ module: m }: { module: EcosystemModule }) {
  const badge = statusBadge(m.status);
  const launchable = m.status === 'active';

  return (
    <div
      data-testid={`ecosystem-card-${m.slug}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 22,
        borderRadius: 14,
        background: brand.bgElevated,
        border: `1px solid ${brand.borderSoft}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h3
          data-testid={`ecosystem-name-${m.slug}`}
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 18,
            fontWeight: 600,
            color: brand.textPrimary,
            margin: 0,
          }}
        >
          {m.name}
        </h3>
        <span
          data-testid={`ecosystem-status-${m.slug}`}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 999,
            color: badge.text,
            background: badge.bg,
            border: `1px solid ${badge.border}`,
            whiteSpace: 'nowrap',
          }}
        >
          {badge.label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span
          data-testid={`ecosystem-category-${m.slug}`}
          style={{
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
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: 6,
            color: brand.accentCyan,
            background: brand.bgGlass,
            border: `1px solid ${brand.borderSoft}`,
            letterSpacing: '0.02em',
          }}
        >
          Ecosystem module
        </span>
      </div>

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

      {m.legacyUrl && (
        <p
          data-testid={`ecosystem-legacy-${m.slug}`}
          style={{ fontSize: 12, color: brand.textMuted, margin: 0 }}
        >
          Legacy:{' '}
          <a
            href={m.legacyUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: brand.textMuted, textDecoration: 'underline' }}
          >
            {m.legacyUrl.replace(/^https?:\/\//, '')}
          </a>
        </p>
      )}

      <a
        href={launchable ? m.ecosystemUrl : undefined}
        data-testid={`ecosystem-launch-${m.slug}`}
        target={launchable ? '_blank' : undefined}
        rel={launchable ? 'noreferrer' : undefined}
        aria-disabled={!launchable}
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
          color: launchable ? brand.textPrimary : brand.textMuted,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          border: `1px solid ${launchable ? brand.borderStrong : brand.borderSoft}`,
          cursor: launchable ? 'pointer' : 'default',
          pointerEvents: launchable ? 'auto' : 'none',
        }}
      >
        <span>
          {launchable ? 'Launch' : 'Coming soon'}{' '}
          <span style={{ color: brand.textMuted, fontWeight: 500 }}>
            {m.ecosystemUrl.replace(/^https?:\/\//, '')}
          </span>
        </span>
        <ArrowUpRight size={14} />
      </a>
    </div>
  );
}
