import React from 'react';
import type { Metadata } from 'next';
import PortfolioPage from '@/components/portfolio/PortfolioPage';

// Task #113 — hidden, share-by-link portfolio page.
// `robots: noindex, nofollow` keeps the URL out of search results
// while still letting the public navbar + footer chrome render
// through MarketingLayout. The canonical URL is /portfolio; /john is
// a short-alias route that renders the same component.
export const metadata: Metadata = {
  title: 'John Travis Williams Jr. — Senior Infrastructure & Security Engineer',
  description:
    'Senior infrastructure, security, automation, healthcare IT, and cloud / solutions architecture portfolio for John Travis Williams Jr.',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  openGraph: {
    title: 'John Travis Williams Jr. — Senior Infrastructure & Security Engineer',
    description:
      'Infrastructure • Security • Automation • Healthcare IT • Systems Architecture. Twenty-plus years of hands-on IT and product engineering.',
    siteName: 'OperatorOS',
    type: 'profile',
  },
};

export default function Page() {
  return <PortfolioPage />;
}
