import React from 'react';
import type { Metadata } from 'next';
import PortfolioPage from '@/components/portfolio/PortfolioPage';

// Task #113 — short-alias route for the portfolio page.
// Renders the exact same component as /portfolio. Kept as a separate
// route (not a redirect) so the URL the user shares in person stays
// exactly what they typed.
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
