'use client';

import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import ModuleGatewayGrid from '@/components/marketing/sections/ModuleGatewayGrid';
import FinalCta from '@/components/marketing/sections/FinalCta';

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
      <ModuleGatewayGrid
        heading="Choose the operating lane you need now."
        subheading="Start with one main module, then expand with companion applications that already share your team, billing, tenant, and access authority."
        testId="page-modules-grid"
        headingLevel="h1"
      />
      <FinalCta />
    </MarketingLayout>
  );
}
