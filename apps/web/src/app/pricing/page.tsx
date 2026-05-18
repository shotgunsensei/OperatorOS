import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import PricingSection from '@/components/marketing/sections/PricingSection';
import AddOnPriceTable from '@/components/marketing/sections/AddOnPriceTable';
import PricingFaq from '@/components/marketing/sections/PricingFaq';
import TrustSection from '@/components/marketing/sections/TrustSection';
import FinalCta from '@/components/marketing/sections/FinalCta';
import { brand } from '@/lib/brand';

/**
 * Marketing pricing page — Phase 3.
 *
 * Composes the full pricing tier grid plus the trust section so
 * visitors comparing tiers can also see the security posture before
 * deciding. Keeps the marketing shell (navbar + footer) consistent
 * with /, /modules, /how-it-works.
 */
export default function MarketingPricingPage() {
  return (
    <MarketingLayout testId="page-marketing-pricing">
      <section
        aria-labelledby="pricing-page-heading"
        style={{
          padding: '88px 24px 32px',
          maxWidth: brand.contentMaxWidth,
          margin: '0 auto',
          textAlign: 'center',
          width: '100%',
        }}
      >
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: brand.accentCyan,
          margin: '0 0 12px',
        }}>
          Pricing
        </p>
        <h1
          id="pricing-page-heading"
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 800,
            color: brand.textPrimary,
            margin: '0 0 16px',
            letterSpacing: '-0.02em',
          }}
        >
          Pay for what you operate.
        </h1>
        <p style={{
          fontSize: 17,
          lineHeight: 1.55,
          color: brand.textSecondary,
          maxWidth: 640,
          margin: '0 auto',
        }}>
          Start free, layer on modules as you grow, and only pay for the operators who actually use the console.
        </p>
      </section>
      <PricingSection />
      <AddOnPriceTable />
      <PricingFaq />
      <TrustSection
        heading="Operators trust OperatorOS with the work that has to stay running."
        subheading="Designed for teams that need role-aware access, tenant-scoped data, and an audit trail they can show their customers."
      />
      <FinalCta />
    </MarketingLayout>
  );
}
