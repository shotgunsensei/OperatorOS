import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'OperatorOS',
  description: 'AI-native Cloud Development Environment — Powered by Shotgun Ninjas',
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
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', background: '#010409', color: '#c9d1d9' }} suppressHydrationWarning>
        <header style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #21262d', background: '#0d1117', color: '#fff', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.03em' }}>OperatorOS</div>
            <div style={{ fontSize: 10, color: '#8b949e' }}>Workspace shell · process manager · service console</div>
          </div>
          <span style={{ fontSize: 11, color: '#484f58' }}>Powered by Shotgun Ninjas</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
