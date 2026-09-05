import React from 'react';
import type { Metadata } from 'next';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import PricingSection from '@/components/marketing/sections/PricingSection';
import PricingFaq from '@/components/marketing/sections/PricingFaq';
import TrustSection from '@/components/marketing/sections/TrustSection';
import FinalCta from '@/components/marketing/sections/FinalCta';
import { marketingPricingFaqs } from '@/lib/marketing-pricing';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'OperatorOS Application Stack Pricing',
  description:
    'Build one monthly Application Stack with a flagship application, five included seats, one organization-wide companion, and clearly priced additional capacity.',
  path: '/pricing',
});

const pricingFaqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: marketingPricingFaqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
} as const;

/**
 * Public pricing and stack configurator.
 */
export default function MarketingPricingPage() {
  return (
    <MarketingLayout testId="page-marketing-pricing">
      <script
        id="operatoros-pricing-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(pricingFaqJsonLd) }}
      />
      <style>{`.pricing-page-root, .pricing-page-root * { box-sizing: border-box; }`}</style>
      <div className="pricing-page-root">
        <PricingSection />
        <PricingFaq />
        <TrustSection
          heading="Operators trust OperatorOS with the work that has to stay running."
          subheading="Designed for teams that need role-aware access, organization-scoped data, and an audit trail they can share with customers."
        />
        <FinalCta />
      </div>
    </MarketingLayout>
  );
}
