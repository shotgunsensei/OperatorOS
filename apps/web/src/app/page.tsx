import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MarketingPlaceholder from '@/components/marketing/MarketingPlaceholder';

/**
 * Marketing home — Phase 1 foundation shell.
 *
 * Phase 1 ships the public layout (glass navbar + footer + brand
 * tokens) wrapped around a placeholder hero. Phase 2 (task #86)
 * replaces this body with the full hero, value proposition, module
 * grid, and social-proof sections.
 *
 * Console URLs still work — visiting `/app` lands signed-out users in
 * the existing login flow, and signed-in users in the workspace.
 */
export default function MarketingHomePage() {
  return (
    <MarketingLayout testId="page-marketing-home">
      <MarketingPlaceholder
        eyebrow="Marketing redesign · Phase 1"
        title="The command layer for modern operations is taking shape."
        subtitle="One console, every tool your team launches. The full home experience is shipping in the next phase — sign in any time to jump to your workspace."
        ctaHref="/app"
        ctaLabel="Open the console"
        testId="marketing-home"
      />
    </MarketingLayout>
  );
}
