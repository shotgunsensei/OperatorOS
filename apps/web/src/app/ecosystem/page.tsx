'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import FinalCta from '@/components/marketing/sections/FinalCta';
import ModuleLaunchLink from '@/components/ModuleLaunchLink';
import { brand } from '@/lib/brand';
import {
  getAllModules,
  getCompanionApplications,
  getMainModules,
  type EcosystemModule,
  type EcosystemModuleStatus,
} from '@operatoros/sdk';

/**
 * Ecosystem launcher — Task #125.
 *
 * Positions OperatorOS as the central command layer for the whole
 * product ecosystem and renders every registry module as a launch
 * card. All module data is consumed from the foundation's shared SDK
 * helpers (`getAllModules`/`getMainModules`/`getCompanionApplications`) —
 * there is deliberately no second module list defined here so the two
 * surfaces can never drift. Nothing here embeds or implements any module
 * app, and every launch uses the canonical OperatorOS subdomain.
 */
export default function EcosystemPage() {
  const mainModules = getMainModules();
  const companions = getCompanionApplications();
  const activeCompanions = companions.filter((module) => module.status === 'active');
  const plannedCompanions = companions.filter((module) => module.status === 'planned');

  // Anything the registry surfaces that is neither active nor planned
  // (e.g. a future `beta` status) is preserved under "Additional
  // Modules" with its own badge rather than being hidden.
  const accountedFor = new Set<string>([
    ...mainModules.map((m) => m.slug),
    ...activeCompanions.map((m) => m.slug),
    ...plannedCompanions.map((m) => m.slug),
  ]);
  const additional = getAllModules().filter((m) => !accountedFor.has(m.slug));

  return (
    <MarketingLayout testId="page-ecosystem">
      <EcosystemHeader />
      <ModuleSection
        id="main-modules"
        eyebrow="Main Modules"
        title="The three flagship products beneath OperatorOS"
        subtitle="TradeFlowKit, PulseDesk, and TechDeck receive the strongest visual priority while sharing OperatorOS identity, tenant, billing, entitlement, and launch authority."
        modules={mainModules}
        testId="ecosystem-section-main-modules"
        prominent
      />
      <ModuleSection
        id="companion-applications"
        eyebrow="Companion Applications"
        title="Active specialist applications"
        subtitle="Every active companion application is listed here after the main modules and launches through its canonical operatoros.net host."
        modules={activeCompanions}
        testId="ecosystem-section-companion-applications"
      />
      {plannedCompanions.length > 0 && (
        <ModuleSection
          id="planned"
          eyebrow="Planned Companion Applications"
          title="On the roadmap"
          subtitle="Reserved product identities that remain visibly unavailable until their activation gates pass."
          modules={plannedCompanions}
          testId="ecosystem-section-planned"
        />
      )}
      {additional.length > 0 && (
        <ModuleSection
          id="additional"
          eyebrow="Additional Applications"
          title="Also in the ecosystem"
          subtitle="Applications in other lifecycle states, shown with their current status."
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
        One platform, one sign-on, one bill. OperatorOS is the parent command layer. TradeFlowKit,
        PulseDesk, and TechDeck are its{' '}
        <strong style={{ color: brand.textPrimary }}>Main Modules</strong>; every other product
        follows beneath them as a{' '}
        <strong style={{ color: brand.textPrimary }}>Companion Application</strong>.
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
  prominent = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  modules: EcosystemModule[];
  testId: string;
  prominent?: boolean;
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
          gap: prominent ? 22 : 16,
          gridTemplateColumns: prominent
            ? 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))'
            : 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        }}
      >
        {modules.map((m) => (
          <ModuleCard key={m.slug} module={m} prominent={prominent} />
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

function ModuleCard({ module: m, prominent }: { module: EcosystemModule; prominent: boolean }) {
  const badge = statusBadge(m.status);
  const launchable = m.status === 'active';

  return (
    <div
      data-testid={`ecosystem-card-${m.slug}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: prominent ? 16 : 12,
        padding: prominent ? 28 : 22,
        minHeight: prominent ? 300 : 240,
        borderRadius: prominent ? 20 : 14,
        background: prominent
          ? 'linear-gradient(145deg, rgba(0,229,255,0.09), rgba(18,24,38,0.98) 48%, rgba(8,11,18,0.98))'
          : brand.bgElevated,
        border: `1px solid ${prominent ? brand.borderStrong : brand.borderSoft}`,
        boxShadow: prominent ? '0 28px 84px rgba(0,229,255,0.08)' : undefined,
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
            fontSize: prominent ? 24 : 18,
            fontWeight: prominent ? 800 : 600,
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
          {m.category === 'ai'
            ? 'AI operations'
            : m.category === 'support'
              ? 'Service operations'
              : 'Business operations'}
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
          {m.applicationType === 'main-module' ? 'Main Module' : 'Companion Application'}
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

      <ModuleLaunchLink
        href={m.ecosystemUrl}
        data-testid={`ecosystem-launch-${m.slug}`}
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
      </ModuleLaunchLink>
    </div>
  );
}
