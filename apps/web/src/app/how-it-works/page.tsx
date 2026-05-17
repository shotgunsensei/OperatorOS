'use client';

import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import HowItWorks from '@/components/marketing/sections/HowItWorks';
import FinalCta from '@/components/marketing/sections/FinalCta';
import { brand } from '@/lib/brand';

/**
 * How It Works marketing page — Phase 2.
 *
 * Renders the 4-step command-line flow as the primary content with a
 * dedicated page header and a final CTA to convert.
 */
export default function MarketingHowItWorksPage() {
  return (
    <MarketingLayout testId="page-marketing-how-it-works">
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
          How it works
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
          Pick a plan, light up your modules, run your business from one console.
        </h1>
        <p style={{ fontSize: 17, color: brand.textSecondary, margin: '0 auto', maxWidth: 620 }}>
          Auth, billing, tenants, and entitlements are already wired together.
          Modules just plug in.
        </p>
      </header>
      <HowItWorks />
      <FinalCta />
    </MarketingLayout>
  );
}
