'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import Hero from '@/components/marketing/sections/Hero';
import CommandOrbit from '@/components/marketing/sections/CommandOrbit';
import PlatformPositioning from '@/components/marketing/sections/PlatformPositioning';
import ModuleGatewayGrid from '@/components/marketing/sections/ModuleGatewayGrid';
import HowItWorks from '@/components/marketing/sections/HowItWorks';
import PricingTeaser from '@/components/marketing/sections/PricingTeaser';
import TrustSection from '@/components/marketing/sections/TrustSection';
import FinalCta from '@/components/marketing/sections/FinalCta';
import { useAuth } from '@/components/AuthProvider';

/**
 * Marketing home — Phase 2.
 *
 * Renders the full public homepage in section order:
 *   Hero → Command Orbit → Platform Positioning → Module Gateway Grid
 *   → How It Works → Final CTA.
 *
 * Signed-in visitors are auto-redirected to `/app` so the home URL
 * behaves like a "land me in my workspace" entry point for returning
 * users while staying fully public for anonymous traffic.
 */
function HomeBody() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace('/app');
  }, [loading, user, router]);

  return (
    <>
      <Hero />
      <CommandOrbit />
      <PlatformPositioning />
      <ModuleGatewayGrid />
      <HowItWorks />
      <PricingTeaser />
      <TrustSection />
      <FinalCta />
    </>
  );
}

export default function MarketingHomePage() {
  return (
    <MarketingLayout testId="page-marketing-home">
      <HomeBody />
    </MarketingLayout>
  );
}
