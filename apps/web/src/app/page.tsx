'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MarketingPlaceholder from '@/components/marketing/MarketingPlaceholder';
import { useAuth } from '@/components/AuthProvider';

/**
 * Marketing home — Phase 1 foundation shell.
 *
 * Phase 1 ships the public layout (glass navbar + footer + brand
 * tokens) wrapped around a placeholder hero. Phase 2 (task #86)
 * replaces this body with the full hero, value proposition, module
 * grid, and social-proof sections.
 *
 * Behavior:
 *   - Signed-out visitors see the marketing surface (public).
 *   - Signed-in visitors get auto-redirected to `/app` so the home
 *     URL acts as a "land me in my workspace" entry point. The
 *     auth check happens client-side after the AuthProvider hydrates;
 *     during that hydration the marketing chrome renders as the
 *     fallback. This preserves SEO/public access for anonymous bots
 *     while still delivering the expected "open the console" feel
 *     for returning users.
 */
function HomeBody() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace('/app');
  }, [loading, user, router]);

  return (
    <MarketingPlaceholder
      eyebrow="Marketing redesign · Phase 1"
      title="The command layer for modern operations is taking shape."
      subtitle="One console, every tool your team launches. The full home experience is shipping in the next phase — sign in any time to jump to your workspace."
      ctaHref="/app"
      ctaLabel="Open the console"
      testId="marketing-home"
    />
  );
}

export default function MarketingHomePage() {
  return (
    <MarketingLayout testId="page-marketing-home">
      <HomeBody />
    </MarketingLayout>
  );
}
