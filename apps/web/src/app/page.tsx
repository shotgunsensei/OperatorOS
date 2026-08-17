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
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../packages/modules/navigation.js';
import { serializeJsonLd, softwareApplicationJsonLd } from '@/lib/seo';

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
    if (!loading && user) window.location.replace(DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl);
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
      <script
        id="operatoros-software-application-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationJsonLd) }}
      />
      <HomeBody />
    </MarketingLayout>
  );
}
