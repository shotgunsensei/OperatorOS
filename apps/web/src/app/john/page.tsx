import React from 'react';
import type { Metadata } from 'next';
import JohnPortfolioPage from '@/components/portfolio/JohnPortfolioPage';

const PAGE_TITLE =
  'John Williams — Systems Engineering, Automation & Applied AI';
const PAGE_DESC =
  'Senior Support Engineer and software builder. Explore John Williams’s systems experience, AI-assisted engineering projects, source-linked evidence and résumé.';
const SITE_ORIGIN = 'https://operatoros.net';

// Dedicated employment portfolio. Preserve the existing no-index policy;
// /portfolio retains its earlier content and is no longer this page's canonical.
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: `${SITE_ORIGIN}/john` },
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
  return <JohnPortfolioPage />;
}
