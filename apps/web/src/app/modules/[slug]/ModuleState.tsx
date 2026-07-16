import Link from 'next/link';
import ContactLink from '@/components/ContactLink';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../../packages/modules/navigation.js';

interface ModuleStateProps {
  testId: string;
  eyebrow: string;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}

export default function ModuleState({
  testId,
  eyebrow,
  title,
  body,
  actionHref = DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl,
  actionLabel = 'Return to Command Center',
}: ModuleStateProps) {
  return (
    <main
      data-testid={testId}
      style={{
        minHeight: '100vh',
        background: '#070a12',
        color: '#f8fafc',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 680,
          border: '1px solid rgba(148, 163, 184, 0.22)',
          borderRadius: 8,
          background: 'rgba(15, 23, 42, 0.82)',
          padding: 28,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.34)',
        }}
      >
        <p
          style={{
            margin: '0 0 10px',
            color: '#7dd3fc',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </p>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15 }}>{title}</h1>
        <p style={{ margin: '12px 0 24px', color: '#cbd5e1', lineHeight: 1.6 }}>{body}</p>
        <Link
          href={actionHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 40,
            padding: '0 16px',
            borderRadius: 6,
            background: '#38bdf8',
            color: '#020617',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {actionLabel}
        </Link>
      </section>
      <ContactLink />
    </main>
  );
}
