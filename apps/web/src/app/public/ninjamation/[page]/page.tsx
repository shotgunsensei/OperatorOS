import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  Code2,
  Download,
  GitBranch,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';

const shell: React.CSSProperties = {
  minHeight: '100vh',
  color: '#e8f4ff',
  colorScheme: 'dark',
  background:
    'radial-gradient(circle at 18% 0%,rgba(14,116,255,.25),transparent 38%),radial-gradient(circle at 86% 18%,rgba(139,92,246,.18),transparent 32%),#020711',
  fontFamily: '"Inter Variable",ui-sans-serif,system-ui,sans-serif',
};
const card: React.CSSProperties = {
  border: '1px solid rgba(56,189,248,.19)',
  borderRadius: 20,
  background: 'linear-gradient(145deg,rgba(8,22,43,.96),rgba(3,9,20,.98))',
  padding: 22,
  boxShadow: '0 20px 60px rgba(0,0,0,.26)',
};
const applicationStackFeatures = [
  'Private reviewed PowerShell, Python, Batch, and Bash library',
  'Unlimited downloads and AI-assisted defensive drafts',
  'Exact versions, safety findings, approval, and download history',
  'Team administration and OperatorOS API access',
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  const title =
    page === 'pricing' ? 'Script Ops Application Stack Access | OperatorOS' : 'Script Ops | Reviewed IT Automation';
  const description =
    'Find, review, version, approve, and download reusable IT automation without running scripts from the web application.';
  const path = page === 'home' ? '/' : `/${page}`;
  return {
    title,
    description,
    alternates: { canonical: `https://scriptops.operatoros.net${path}` },
    openGraph: {
      title,
      description,
      url: `https://scriptops.operatoros.net${path}`,
      siteName: 'Script Ops',
      type: 'website',
    },
  };
}

function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div style={shell}>
      <header
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '22px clamp(18px,4vw,44px)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            display: 'grid',
            placeItems: 'center',
            background: 'linear-gradient(145deg,#1688ff,#5b21b6)',
            border: '1px solid #38bdf866',
            boxShadow: '0 0 30px #1688ff33',
          }}
        >
          <TerminalSquare size={23} />
        </div>
        <Link
          href="/"
          style={{
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 950,
            fontSize: 21,
            letterSpacing: '-.03em',
          }}
        >
          SCRIPT OPS
        </Link>
        <span style={{ color: '#a78bfa', fontSize: 11, fontWeight: 900, letterSpacing: '.16em' }}>
          REVIEWED SCRIPT LIBRARY
        </span>
        <nav
          aria-label="Script Ops public navigation"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 15,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link href="/pricing" style={{ color: '#bfdbfe' }}>
            Application Stack
          </Link>
          <Link
            href="/login"
            style={{
              color: '#fff',
              textDecoration: 'none',
              padding: '9px 14px',
              borderRadius: 10,
              background: 'linear-gradient(135deg,#0f72e5,#6d28d9)',
              fontWeight: 850,
            }}
          >
            Sign in
          </Link>
        </nav>
      </header>
      {children}
      <footer
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '36px clamp(18px,4vw,44px)',
          color: '#7890aa',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <a href="https://shotgunninjas.com" style={{ color: '#a8bed6' }}>
          Shotgun Ninjas Productions
        </a>
        <span>One OperatorOS account for sign-in, team access, subscriptions, and activity history</span>
      </footer>
    </div>
  );
}

function Home() {
  const capabilities = [
    [
      Code2,
      'Find the right script',
      'Search by platform, task, category, risk, approval, or team favorite instead of starting from scratch.',
    ],
    [
      Bot,
      'Draft and review safely',
      'Create a defensive first draft, inspect safety findings, and require a person to approve the exact version.',
    ],
    [
      Download,
      'Download the version you approved',
      'Every download stays tied to the reviewed script version, filename, and file-verification record.',
    ],
    [
      ShieldCheck,
      'Execution stays in your tools',
      'Script Ops prepares and delivers scripts; it never runs them in the browser, web server, or customer environment.',
    ],
  ] as const;
  return (
    <Chrome>
      <main>
        <section
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '76px clamp(18px,4vw,44px) 52px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))',
            gap: 34,
            alignItems: 'center',
          }}
        >
          <div>
            <span
              style={{ color: '#7dd3fc', letterSpacing: '.2em', fontWeight: 900, fontSize: 12 }}
            >
              FIND IT. REVIEW IT. USE IT DELIBERATELY.
            </span>
            <h1
              style={{
                fontSize: 'clamp(44px,7vw,82px)',
                lineHeight: 0.95,
                margin: '14px 0 22px',
                letterSpacing: '-.055em',
              }}
            >
              Reusable IT automation your team can{' '}
              <span style={{ color: '#60a5fa' }}>trust before it runs.</span>
            </h1>
            <p style={{ color: '#b7c8dc', fontSize: 19, lineHeight: 1.65, maxWidth: 760 }}>
              Search reviewed PowerShell, Python, Batch, and Bash automation, create what is missing,
              inspect the risks, approve an exact version, and give technicians the context they need
              to run it through your normal authorized tools.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
              <Link
                href="/signup"
                style={{
                  color: '#fff',
                  textDecoration: 'none',
                  background: 'linear-gradient(135deg,#137ee8,#6d28d9)',
                  padding: '13px 18px',
                  borderRadius: 11,
                  fontWeight: 900,
                  display: 'inline-flex',
                  gap: 8,
                }}
              >
                Open Script Ops <ArrowRight size={18} />
              </Link>
              <Link
                href="/pricing"
                style={{
                  color: '#fff',
                  textDecoration: 'none',
                  border: '1px solid rgba(56,189,248,.3)',
                  padding: '13px 18px',
                  borderRadius: 11,
                }}
              >
                See Application Stack
              </Link>
            </div>
          </div>
          <aside style={{ ...card, transform: 'rotate(.6deg)' }}>
            <GitBranch color="#38bdf8" />
            <h2>Every script arrives with context.</h2>
            {[
              'Purpose, prerequisites, inputs, and expected result',
              'Exact saved versions and change history',
              'Risk level and safety findings',
              'Validation and rollback guidance',
              'Human approval and download history',
              'No automatic execution in your environment',
            ].map((item) => (
              <p key={item} style={{ display: 'flex', gap: 8, color: '#cbdaf0' }}>
                <Check size={17} color="#4ade80" />
                {item}
              </p>
            ))}
          </aside>
        </section>
        <section
          aria-label="Script Ops capabilities"
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '20px clamp(18px,4vw,44px) 72px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))',
            gap: 14,
          }}
        >
          {capabilities.map(([Icon, title, copy]) => (
            <article key={title} style={card}>
              <Icon color="#38bdf8" />
              <h2>{title}</h2>
              <p style={{ color: '#91a8c2', lineHeight: 1.6 }}>{copy}</p>
            </article>
          ))}
        </section>
      </main>
    </Chrome>
  );
}

function Pricing() {
  return (
    <Chrome>
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '70px clamp(18px,4vw,44px)' }}>
        <span style={{ color: '#7dd3fc', letterSpacing: '.2em', fontWeight: 900 }}>
          SCRIPT OPS ACCESS
        </span>
        <h1 style={{ fontSize: 'clamp(40px,6vw,68px)', margin: '10px 0', letterSpacing: '-.04em' }}>
          Complete Script Ops access through Application Stack.
        </h1>
        <p style={{ color: '#91a8c2', fontSize: 18 }}>
          Choose Script Ops as the included companion in your organization’s Application Stack, or
          add it as an additional companion for $29 per month. Either path unlocks the complete application.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))',
            gap: 16,
            marginTop: 30,
          }}
        >
          <article style={{ ...card, borderColor: '#2997ff', maxWidth: 620 }}>
              <h2 style={{ fontSize: 30 }}>Complete application access</h2>
              <p style={{ color: '#cbdaf0', minHeight: 72 }}>
                One eligible companion is included with Application Stack. Additional companions are $29 per month for the organization—not per user.
              </p>
              {applicationStackFeatures.map((feature) => (
                <p key={feature} style={{ display: 'flex', gap: 8 }}>
                  <Check size={16} color="#4ade80" />
                  {feature}
                </p>
              ))}
              <Link
                href="/signup"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  color: '#fff',
                  textDecoration: 'none',
                  background: 'linear-gradient(135deg,#0f72e5,#6d28d9)',
                  padding: 12,
                  borderRadius: 10,
                  fontWeight: 900,
                  marginTop: 20,
                }}
              >
                Configure Application Stack
              </Link>
            </article>
        </div>
      </main>
    </Chrome>
  );
}

export default async function NinjamationPublicPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  return page === 'pricing' ? <Pricing /> : <Home />;
}
