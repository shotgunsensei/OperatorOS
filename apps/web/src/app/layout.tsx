import React from 'react';
import type { Metadata, Viewport } from 'next';
import { brand, brandCssVariables } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'OperatorOS — The Command Layer for Modern Operations',
  description:
    'The modular command layer for modern business operations. One console, every tool your team launches. Powered by Shotgun Ninjas.',
  manifest: '/manifest.json',
  icons: {
    // Browsers always probe `/favicon.ico` even when an SVG icon is
    // declared. Listing the SVG under both `icon` and `shortcut` keeps
    // modern browsers happy, and `apps/web/src/app/favicon.ico/route.ts`
    // serves a 200 for the legacy probe so Lighthouse / the console no
    // longer report a 404 on every page load.
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: ['/favicon.svg'],
    apple: ['/favicon.svg'],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OperatorOS' },
  // The browser console flagged `apple-mobile-web-app-capable` as
  // deprecated in favour of the standard `mobile-web-app-capable`.
  // Next's metadata API does not expose the standard tag directly, so
  // we add it via `other` alongside the Apple-prefixed version.
  other: {
    'mobile-web-app-capable': 'yes',
  },
  // SEO fix: Lighthouse "Page is blocked from indexing" — explicitly opt
  // the marketing/landing surface in to indexing so neither the host's
  // default robots policy nor Next.js's default behaviour suppresses it.
  // Authenticated /app/* and /platform/* routes are still excluded via
  // /robots.txt (apps/web/src/app/robots.ts).
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: 'OperatorOS — The Command Layer for Modern Operations',
    description:
      'The modular command layer for modern business operations. One console, every tool your team launches.',
    siteName: 'OperatorOS',
    type: 'website',
  },
};

export const viewport: Viewport = {
  // Marketing redesign: deep-near-black brand canvas replaces the prior
  // #0d1117 console grey so mobile address bars / PWA chrome match the
  // new public surface.
  themeColor: brand.bgPrimary,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Brand typography: Space Grotesk drives display/headline text,
            Inter remains the body font. Both loaded with display=swap so
            the first paint is not blocked by font fetch. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Expose brand tokens as CSS custom properties so unstyled HTML,
            SVG fills, and inline animations can pull them without
            re-importing the TS module. */}
        <style dangerouslySetInnerHTML={{ __html: `:root { ${brandCssVariables} }` }} />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: brand.fontBody,
          background: brand.bgPrimary,
          color: brand.textPrimary,
        }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
