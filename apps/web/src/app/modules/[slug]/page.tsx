import Link from 'next/link';
import InternalAppPage from '../../apps/[slug]/page';
import { getModuleBySlug } from '../../../../../../packages/modules/registry.js';

interface ModuleFallbackPageProps {
  params: {
    slug: string;
  };
  searchParams?: {
    host?: string;
  };
}

export default function ModuleFallbackPage({ params, searchParams }: ModuleFallbackPageProps) {
  const module = getModuleBySlug(params.slug);

  if (!module) {
    return (
      <ModuleState
        testId="module-host-unknown"
        eyebrow="Unknown module host"
        title="This OperatorOS module route is not registered."
        body={
          searchParams?.host
            ? `${searchParams.host} is not mapped to an active OperatorOS module.`
            : 'The requested module slug is not mapped to the OperatorOS registry.'
        }
      />
    );
  }

  if (module.status !== 'active') {
    return (
      <ModuleState
        testId="module-host-unavailable"
        eyebrow="Module unavailable"
        title={`${module.name} is not available right now.`}
        body={`OperatorOS knows this module, but its registry status is ${module.status}.`}
      />
    );
  }

  return <InternalAppPage />;
}

function ModuleState({
  testId,
  eyebrow,
  title,
  body,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
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
          href="/app"
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
          Return to Command Center
        </Link>
      </section>
    </main>
  );
}
