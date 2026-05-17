import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MarketingPlaceholder from '@/components/marketing/MarketingPlaceholder';

/**
 * How It Works marketing page — Phase 1 placeholder.
 *
 * Phase 2/3 fill in the step-by-step explainer, screenshots, and
 * the architectural diagram of the OperatorOS command layer.
 */
export default function MarketingHowItWorksPage() {
  return (
    <MarketingLayout testId="page-marketing-how-it-works">
      <MarketingPlaceholder
        eyebrow="How it works"
        title="Pick a plan, light up your modules, run your business from one console."
        subtitle="Auth, billing, tenants, and entitlements are already wired together — modules just plug in. The full walkthrough is on its way."
        ctaHref="/app"
        ctaLabel="Try it now"
        testId="marketing-how-it-works"
      />
    </MarketingLayout>
  );
}
