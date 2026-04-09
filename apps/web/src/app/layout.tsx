import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'OperatorOS — Premium Operations Platform',
  description: 'Command center for running your business — Powered by Shotgun Ninjas',
  manifest: '/manifest.json',
  icons: [{ rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' }],
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OperatorOS' },
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
