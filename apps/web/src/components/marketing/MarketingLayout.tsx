'use client';

import React from 'react';
import AuthProvider from '../AuthProvider';
import MarketingNavbar from './MarketingNavbar';
import MarketingFooter from './MarketingFooter';
import { brand } from '@/lib/design-tokens';

interface MarketingLayoutProps {
  children: React.ReactNode;
  testId?: string;
  conversion?: { label: string; pricingPath: string; signInPath: string };
}

/**
 * MarketingLayout — public-page shell.
 *
 * Wraps content in:
 *   - AuthProvider — so the navbar can show "Open console" when the
 *     visitor is signed in. AuthProvider's /me call is best-effort and
 *     fails silently for anonymous visitors, so this is safe on the
 *     public surface.
 *   - Glass navbar (sticky)
 *   - Footer
 *
 * The console (`/app`) deliberately does NOT use this layout — it has
 * its own SaasLayout sidebar shell.
 */
export default function MarketingLayout({
  children,
  testId = 'marketing-shell',
  conversion,
}: MarketingLayoutProps) {
  return (
    <AuthProvider>
      <div
        data-testid={testId}
        style={{
          minHeight: '100vh',
          background: brand.bgPrimary,
          color: brand.textPrimary,
          fontFamily: brand.fontBody,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <a className="ops-skip-link" href="#marketing-main-content">
          Skip to main content
        </a>
        <React.Suspense fallback={<nav aria-label="Site navigation" style={{ minHeight: 72 }} />}><MarketingNavbar conversion={conversion} /></React.Suspense>
        <main
          id="marketing-main-content"
          tabIndex={-1}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            scrollMarginTop: 80,
          }}
        >
          {children}
        </main>
        <React.Suspense fallback={<footer style={{ minHeight: 80 }} />}><MarketingFooter conversion={conversion} /></React.Suspense>
      </div>
    </AuthProvider>
  );
}
