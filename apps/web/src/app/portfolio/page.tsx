import React from 'react';
import type { Metadata } from 'next';
import PortfolioPage from '@/components/portfolio/PortfolioPage';
import { getResumesAvailability } from '@/lib/portfolio-resumes';

const PAGE_TITLE =
  'John Travis Williams Jr. — Senior Infrastructure & Security Engineer';
const PAGE_DESC =
  'Infrastructure • Security • Automation • Healthcare IT • Cloud / Solutions Architecture. Twenty-plus years of hands-on IT, MSP escalation, and operator-grade product engineering.';
const SITE_ORIGIN = 'https://operatoros.net';

// Task #113 + refinement pass — hidden, share-by-link portfolio page.
// `robots: noindex, nofollow` keeps the URL out of search results
// while still letting the public navbar + footer chrome render
// through MarketingLayout. The canonical URL is /portfolio; /john is
// a short-alias route that renders the same component.
//
// The auto-generated `opengraph-image.tsx` sibling supplies the 1200x630
// OG card automatically — no need to declare it here.
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: `${SITE_ORIGIN}/portfolio` },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESC,
    siteName: 'OperatorOS',
    type: 'profile',
    url: `${SITE_ORIGIN}/portfolio`,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESC,
  },
};

export default function Page() {
  const resumesAvailability = getResumesAvailability();
  return <PortfolioPage resumesAvailability={resumesAvailability} />;
}
