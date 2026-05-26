import React from 'react';
import type { Metadata } from 'next';
import PortfolioPage from '@/components/portfolio/PortfolioPage';
import { getResumesAvailability } from '@/lib/portfolio-resumes';

const PAGE_TITLE =
  'John Travis Williams Jr. — Senior Infrastructure & Security Engineer';
const PAGE_DESC =
  'Infrastructure • Security • Automation • Healthcare IT • Cloud / Solutions Architecture. Twenty-plus years of hands-on IT, MSP escalation, and operator-grade product engineering.';
const SITE_ORIGIN = 'https://operatoros.net';

// Task #113 + refinement pass — short-alias route for the portfolio.
// Renders the exact same component as /portfolio. Kept as a separate
// route (not a redirect) so the URL the user shares in person stays
// exactly what they typed. Canonical points back to /portfolio so
// search engines treat them as one document.
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
    url: `${SITE_ORIGIN}/john`,
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
