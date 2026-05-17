import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MarketingPlaceholder from '@/components/marketing/MarketingPlaceholder';

/**
 * Pricing marketing page — Phase 1 placeholder.
 *
 * Phase 3 (task #87) replaces this with the live Starter / Pro / Elite
 * tier matrix, add-on prices, and FAQ.
 */
export default function MarketingPricingPage() {
  return (
    <MarketingLayout testId="page-marketing-pricing">
      <MarketingPlaceholder
        eyebrow="Pricing"
        title="Straightforward tiers. Every module included as you scale."
        subtitle="Starter, Pro, and Elite plans cover the full operator stack. Detailed pricing and the add-on matrix arrive in the next iteration."
        ctaHref="/app"
        ctaLabel="Start in the console"
        testId="marketing-pricing"
      />
    </MarketingLayout>
  );
}
