import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { brand, brandCssVariables } from '@/lib/brand';

// Brand typography loaded via next/font so Next self-hosts the files and
// fully manages the document <head>. Hand-writing <link> tags for Google
// Fonts in a manual <head> conflicts with the <link>s the Metadata API
// injects (favicon/manifest/apple-icon), which broke hydration and caused
// sections to overlap on first paint. next/font removes that conflict and
// exposes a CSS variable each font is bound to.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--brand-font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--brand-font-space-grotesk',
});

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
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      {/* No manual <head>: in the App Router Next.js owns the document head
          (metadata, fonts, icons). Authoring our own <head> here interleaved
          with Next's injected tags and broke hydration, which made sections
          paint on top of each other. Brand CSS custom properties are emitted
          as a <style> at the top of <body> instead — :root variables cascade
          regardless of where the style tag lives. */}
      <body
        style={{
          margin: 0,
          fontFamily: brand.fontBody,
          background: brand.bgPrimary,
          color: brand.textPrimary,
        }}
        suppressHydrationWarning
      >
        <style dangerouslySetInnerHTML={{ __html: `:root { ${brandCssVariables} }` }} />
        {children}
      </body>
    </html>
  );
}
