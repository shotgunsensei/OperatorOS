import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OperatorOS',
  description: 'AI-native Cloud Development Environment — Powered by Shotgun Ninjas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace', background: '#010409', color: '#c9d1d9' }} suppressHydrationWarning>
        <header
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            borderBottom: '1px solid #21262d',
            background: '#0d1117',
            color: '#fff',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
            OperatorOS
          </span>
          <span style={{ fontSize: 11, color: '#484f58' }}>Powered by Shotgun Ninjas</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
