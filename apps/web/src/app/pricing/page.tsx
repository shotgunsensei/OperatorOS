import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import PricingSection from '@/components/marketing/sections/PricingSection';
import PricingFaq from '@/components/marketing/sections/PricingFaq';
import TrustSection from '@/components/marketing/sections/TrustSection';
import FinalCta from '@/components/marketing/sections/FinalCta';

/**
 * Public pricing and stack configurator.
 */
export default function MarketingPricingPage() {
  return (
    <MarketingLayout testId="page-marketing-pricing">
      <style>{`.pricing-page-root, .pricing-page-root * { box-sizing: border-box; }`}</style>
      <div className="pricing-page-root">
        <PricingSection />
        <PricingFaq />
        <TrustSection
          heading="Operators trust OperatorOS with the work that has to stay running."
          subheading="Designed for teams that need role-aware access, tenant-scoped data, and an audit trail they can show their customers."
        />
        <FinalCta />
      </div>
    </MarketingLayout>
  );
}
