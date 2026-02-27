import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VeridianCDE',
  description: 'AI-native Cloud Development Environment',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <header
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            borderBottom: '1px solid #e2e2e2',
            background: '#fafafa',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
            VeridianCDE
          </span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
