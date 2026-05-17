'use client';

import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import ModuleGatewayGrid from '@/components/marketing/sections/ModuleGatewayGrid';
import FinalCta from '@/components/marketing/sections/FinalCta';
import { brand } from '@/lib/brand';

/**
 * Modules marketing page — Phase 2.
 *
 * The same Module Gateway Grid that appears on the homepage, served
 * as the primary content here with a dedicated page header. Adds the
 * final CTA so visitors who land here directly still have a way to
 * convert.
 */
export default function MarketingModulesPage() {
  return (
    <MarketingLayout testId="page-marketing-modules">
      <header
        style={{
          padding: '72px 24px 16px',
          maxWidth: brand.contentMaxWidth,
          margin: '0 auto',
          width: '100%',
          textAlign: 'center',
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
          Modules
        </span>
        <h1
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '18px auto 12px',
            letterSpacing: '-0.025em',
            maxWidth: 840,
          }}
        >
          Every Shotgun Ninjas module, one operator console.
        </h1>
        <p style={{ fontSize: 17, color: brand.textSecondary, margin: '0 auto', maxWidth: 620 }}>
          Browse the full arsenal. Status badges reflect availability today —
          unlock more as your plan grows.
        </p>
      </header>
      <ModuleGatewayGrid
        heading="The full Shotgun Ninjas module arsenal."
        subheading="One sign-in, one bill, one admin surface. Turn on what you need, when you need it."
        testId="page-modules-grid"
      />
      <FinalCta />
    </MarketingLayout>
  );
}
