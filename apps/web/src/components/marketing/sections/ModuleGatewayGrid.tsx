'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { brand } from '@/lib/brand';
import {
  MARKETING_MODULES,
  statusBadgeColor,
  type MarketingModule,
} from '@/lib/marketing-catalog';
import { moduleCtaTarget } from '@/lib/marketing-cta';
import { useAuth } from '../../AuthProvider';

interface ModuleGatewayGridProps {
  /** Optional heading override for use on `/modules` vs. the homepage. */
  heading?: string;
  subheading?: string;
  testId?: string;
}

/**
 * Module Gateway Grid — every Shotgun Ninjas module on a single card
 * grid, each card showing the outcome, a status badge, and an
 * auth-aware CTA. The same grid is reused as the primary content of
 * the `/modules` page.
 */
export default function ModuleGatewayGrid({
  heading = 'Modules that unlock as your operation grows.',
  subheading = 'Every module ships with the same single sign-on, billing, and admin surface — turn one on and it joins your console.',
  testId = 'marketing-module-grid',
}: ModuleGatewayGridProps) {
  const { user } = useAuth();

  return (
    <section
      data-testid={testId}
      style={{
        padding: '64px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2
          data-testid={`${testId}-title`}
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
          }}
        >
          {heading}
        </h2>
        <p style={{ fontSize: 16, color: brand.textSecondary, margin: '0 auto', maxWidth: 640 }}>
          {subheading}
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {MARKETING_MODULES.map((m) => (
          <ModuleCard key={m.slug} module={m} signedIn={!!user} />
        ))}
      </div>
    </section>
  );
}

function ModuleCard({ module: m, signedIn }: { module: MarketingModule; signedIn: boolean }) {
  const badge = statusBadgeColor(m.status);
  const cta = moduleCtaTarget(m.status, signedIn);

  return (
    <div
      data-testid={`module-gateway-card-${m.slug}`}
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <h3
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
          data-testid={`module-gateway-status-${m.slug}`}
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
          {m.status}
        </span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: brand.textSecondary, margin: 0, minHeight: 44 }}>
        {m.outcome}
      </p>
      <Link
        href={cta.href}
        data-testid={`module-gateway-cta-${m.slug}`}
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
          color: brand.textPrimary,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          border: `1px solid ${brand.borderStrong}`,
        }}
      >
        <span>{cta.label}</span>
        <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}
