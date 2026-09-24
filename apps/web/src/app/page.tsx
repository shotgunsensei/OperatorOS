import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import AudienceHome from '@/components/marketing/AudienceHome';
import { serializeJsonLd, softwareApplicationJsonLd } from '@/lib/seo';

export default function MarketingHomePage() {
  return (
    <MarketingLayout testId="page-marketing-home">
      <script
        id="operatoros-software-application-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationJsonLd) }}
      />
      <AudienceHome />
    </MarketingLayout>
  );
}
