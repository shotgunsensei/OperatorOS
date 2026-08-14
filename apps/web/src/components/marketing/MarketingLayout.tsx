'use client';

import React from 'react';
import AuthProvider from '../AuthProvider';
import MarketingNavbar from './MarketingNavbar';
import MarketingFooter from './MarketingFooter';
import { brand } from '@/lib/design-tokens';

interface MarketingLayoutProps {
  children: React.ReactNode;
  testId?: string;
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
        <MarketingNavbar />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
        <MarketingFooter />
      </div>
    </AuthProvider>
  );
}
