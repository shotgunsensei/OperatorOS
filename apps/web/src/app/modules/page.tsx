import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MarketingPlaceholder from '@/components/marketing/MarketingPlaceholder';

/**
 * Modules marketing page — Phase 1 placeholder.
 *
 * Phase 2 (task #86) replaces this with the Shotgun Ninjas Arsenal
 * grid, per-module deep links, and tier badges. For now it confirms
 * the route is reachable and consistent with the rest of the public
 * shell.
 */
export default function MarketingModulesPage() {
  return (
    <MarketingLayout testId="page-marketing-modules">
      <MarketingPlaceholder
        eyebrow="Modules"
        title="Every Shotgun Ninjas module, one operator console."
        subtitle="Pick a plan, get the matching modules — TradeFlowKit, PulseDesk, CallCommand AI, and more. The full directory is coming next phase."
        ctaHref="/app"
        ctaLabel="Browse in the console"
        testId="marketing-modules"
      />
    </MarketingLayout>
  );
}
