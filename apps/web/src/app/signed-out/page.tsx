import Link from 'next/link';
import { brand } from '@/lib/brand';

interface SignedOutPageProps {
  searchParams?: {
    signed_out?: string;
  };
}

export default function SignedOutPage({ searchParams }: SignedOutPageProps) {
  const wasLocalLogout = searchParams?.signed_out === 'local';
  const wasGlobalLogout = searchParams?.signed_out === 'global';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: brand.bgPrimary,
        color: brand.textPrimary,
      }}
    >
      <section
        style={{
          width: 'min(560px, 100%)',
          padding: 28,
          borderRadius: 16,
          border: `1px solid ${brand.borderSoft}`,
          background: brand.bgSecondary,
        }}
      >
        <p style={{ margin: '0 0 8px', color: brand.accentCyan, fontWeight: 700 }}>
          SESSION CLOSED
        </p>
        <h1 style={{ margin: '0 0 12px' }}>
          {wasGlobalLogout ? 'You are signed out everywhere.' : 'You are signed out here.'}
        </h1>
        <p style={{ margin: '0 0 22px', color: brand.textSecondary, lineHeight: 1.6 }}>
          {wasGlobalLogout
            ? 'All OperatorOS sessions were revoked. Any remaining host cookies are invalid and must authenticate again.'
            : wasLocalLogout
              ? 'This application session was cleared. Sessions on other OperatorOS subdomains remain active until you sign out everywhere.'
              : 'This OperatorOS application session is no longer active.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Link
            href="/"
            style={{
              padding: '10px 15px',
              borderRadius: 9,
              background: brand.accentCyan,
              color: brand.accentInk,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Return to OperatorOS
          </Link>
          <a
            href="https://auth.operatoros.net/login"
            style={{
              padding: '10px 15px',
              borderRadius: 9,
              border: `1px solid ${brand.borderSoft}`,
              color: brand.textPrimary,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Continue with an account
          </a>
        </div>
      </section>
    </main>
  );
}
