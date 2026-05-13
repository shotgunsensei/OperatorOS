import React from 'react';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'OperatorOS — Premium Operations Platform',
  description: 'Command center for running your business — Powered by Shotgun Ninjas',
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
  // Authenticated admin/platform/apps routes are still excluded via
  // /robots.txt (apps/web/src/app/robots.ts).
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', background: '#010409', color: '#c9d1d9' }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
