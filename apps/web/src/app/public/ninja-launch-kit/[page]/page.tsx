import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Layers3,
  Rocket,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';

const applicationStackFeatures = [
  'Complete campaign packages with built-in or AI-assisted creation',
  'All business templates and nine visual-production directions',
  'Unlimited brand profiles and unwatermarked team-ready exports',
  'Human review, campaign readiness checks, and saved delivery history',
];

const shell: React.CSSProperties = {
  minHeight: '100vh',
  color: '#f8fafc',
  colorScheme: 'dark',
  background:
    'radial-gradient(circle at 18% 0%,rgba(14,165,233,.25),transparent 38%),radial-gradient(circle at 86% 18%,rgba(139,92,246,.18),transparent 32%),#020617',
};
const card: React.CSSProperties = {
  border: '1px solid rgba(103,232,249,.2)',
  borderRadius: 20,
  background: 'linear-gradient(145deg,rgba(8,24,43,.96),rgba(7,9,24,.98))',
  padding: 22,
  boxShadow: '0 20px 60px rgba(0,0,0,.24)',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  const title =
    page === 'pricing' ? 'Deploy Ops Application Stack Access | OperatorOS' : 'Deploy Ops | Campaign Launch Packages';
  const description =
    'Turn one business brief into campaign copy, visual directions, launch tasks, approvals, and a team-ready export.';
  const path = page === 'home' ? '/' : `/${page}`;
  return {
    title,
    description,
    alternates: { canonical: `https://deployops.operatoros.net${path}` },
    openGraph: {
      title,
      description,
      url: `https://deployops.operatoros.net${path}`,
      siteName: 'Deploy Ops',
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
            width: 42,
            height: 42,
            borderRadius: 13,
            display: 'grid',
            placeItems: 'center',
            background: 'linear-gradient(145deg,#0ea5e9,#6d28d9)',
          }}
        >
          <Rocket size={22} />
        </div>
        <Link
          href="/"
          style={{ color: '#fff', textDecoration: 'none', fontWeight: 950, fontSize: 20 }}
        >
          DEPLOY OPS
        </Link>
        <nav
          aria-label="Deploy Ops public navigation"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 15,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link href="/pricing" style={{ color: '#cbd5e1' }}>
            Application Stack
          </Link>
          <Link href="/contact" style={{ color: '#cbd5e1' }}>
            Contact
          </Link>
          <Link
            href="/login"
            style={{
              color: '#fff',
              textDecoration: 'none',
              padding: '9px 13px',
              borderRadius: 10,
              background: 'linear-gradient(135deg,#0284c7,#6d28d9)',
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
          color: '#94a3b8',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <a href="https://shotgunninjas.com" style={{ color: '#cbd5e1' }}>
          Shotgun Ninjas Productions
        </a>
        <Link href="/terms" style={{ color: '#cbd5e1' }}>
          Terms
        </Link>
        <Link href="/privacy" style={{ color: '#cbd5e1' }}>
          Privacy
        </Link>
      </footer>
    </div>
  );
}

function Home() {
  const capabilities = [
    [
      Layers3,
      'Complete campaign packages',
      'Keep the brief, copy, visual directions, tasks, files, and approvals together from start to launch.',
    ],
    [
      ClipboardCheck,
      'Launch review',
      'Catch missing claims, links, prices, dates, files, and approvals before the campaign leaves your team.',
    ],
    [
      RotateCcw,
      'Team-ready exports',
      'Download the approved package for your designer, client, ad platform, email tool, or publishing team.',
    ],
    [
      ShieldCheck,
      'Connected to OperatorOS',
      'Use one sign-in, one team, one subscription, and a shared activity history across your business applications.',
    ],
  ] as const;
  return (
    <Chrome>
      <main>
        <section
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '76px clamp(18px,4vw,44px) 54px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))',
            gap: 34,
            alignItems: 'center',
          }}
        >
          <div>
            <span
              style={{ color: '#67e8f9', letterSpacing: '.2em', fontWeight: 900, fontSize: 12 }}
            >
              BRIEF. BUILD. REVIEW. LAUNCH.
            </span>
            <h1
              style={{
                fontSize: 'clamp(42px,7vw,82px)',
                lineHeight: 0.95,
                margin: '14px 0 22px',
                maxWidth: 850,
              }}
            >
              Turn one business brief into a{' '}
              <span style={{ color: '#38bdf8' }}>campaign your team can launch.</span>
            </h1>
            <p style={{ color: '#cbd5e1', fontSize: 19, lineHeight: 1.65, maxWidth: 760 }}>
              Build landing-page copy, ads, email and SMS, social posts, FAQs, calls to action,
              flyer copy, a launch checklist, and visual-production directions—then review and
              export the whole package without rebuilding the campaign in five different tools.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
              <Link
                href="/signup"
                style={{
                  color: '#fff',
                  textDecoration: 'none',
                  background: 'linear-gradient(135deg,#0284c7,#6d28d9)',
                  padding: '13px 18px',
                  borderRadius: 11,
                  fontWeight: 900,
                  display: 'inline-flex',
                  gap: 8,
                }}
              >
                Open Deploy Ops <ArrowRight size={18} />
              </Link>
              <Link
                href="/pricing"
                style={{
                  color: '#fff',
                  textDecoration: 'none',
                  border: '1px solid rgba(103,232,249,.32)',
                  padding: '13px 18px',
                  borderRadius: 11,
                }}
              >
                See Application Stack
              </Link>
            </div>
          </div>
          <aside style={{ ...card, transform: 'rotate(.6deg)' }}>
            <Rocket color="#67e8f9" />
            <h2>Everything the campaign team needs</h2>
            {[
              'Audience, offer, message, and desired action',
              'Copy for landing pages, ads, email, SMS, and social',
              'Nine visual-production directions',
              'Owners, deadlines, files, and launch checks',
              'Human review and approval history',
              'TXT, Markdown, JSON, and CSV exports',
            ].map((item) => (
              <p key={item} style={{ display: 'flex', gap: 8, color: '#dbeafe' }}>
                <Check size={17} color="#4ade80" />
                {item}
              </p>
            ))}
          </aside>
        </section>
        <section
          aria-label="Deploy Ops capabilities"
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '24px clamp(18px,4vw,44px) 70px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))',
            gap: 14,
          }}
        >
          {capabilities.map(([Icon, title, copy]) => (
            <article key={title} style={card}>
              <Icon color="#67e8f9" />
              <h2>{title}</h2>
              <p style={{ color: '#94a3b8', lineHeight: 1.6 }}>{copy}</p>
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
        <span style={{ color: '#67e8f9', letterSpacing: '.2em', fontWeight: 900 }}>
          DEPLOY OPS ACCESS
        </span>
        <h1 style={{ fontSize: 'clamp(40px,6vw,68px)', margin: '10px 0' }}>
          Complete Deploy Ops access through Application Stack.
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 18 }}>
          Choose Deploy Ops as the included companion in your organization’s Application Stack, or
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
          <article style={{ ...card, borderColor: '#38bdf8', maxWidth: 620 }}>
              <h2 style={{ fontSize: 30 }}>Complete application access</h2>
              <p style={{ color: '#cbd5e1', minHeight: 72 }}>
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
                  background: 'linear-gradient(135deg,#0284c7,#6d28d9)',
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

function Legal({ privacy = false }: { privacy?: boolean }) {
  return (
    <Chrome>
      <main style={{ maxWidth: 850, margin: '0 auto', padding: '66px clamp(18px,4vw,44px)' }}>
        <h1>{privacy ? 'Privacy' : 'Terms of service'}</h1>
        <p style={{ color: '#94a3b8' }}>Last updated August 22, 2026</p>
        <div style={{ ...card, lineHeight: 1.75, color: '#cbd5e1' }}>
          {privacy ? (
            <>
              <h2>What Deploy Ops stores</h2>
              <p>
                Deploy Ops stores campaign briefs, draft materials, visual directions, tasks,
                approvals, saved versions, launch checks, and export history for your organization.
                OperatorOS manages your sign-in, team access, plan, and billing.
              </p>
              <h2>AI and connected services</h2>
              <p>
                Campaign material is sent to an AI service only when your organization enables and
                uses AI refinement. Do not include passwords, regulated data, confidential customer
                records, or unnecessary personal information in a campaign brief.
              </p>
              <h2>Retention and access</h2>
              <p>
                Deleted campaign items may remain recoverable for the stated retention period. Your
                organization and role determine which records and downloads you can access.
              </p>
            </>
          ) : (
            <>
              <h2>Product use</h2>
              <p>
                You are responsible for reviewing campaign claims, prices, dates, links, audiences,
                approvals, licensing, and legal disclosures before publishing. Deploy Ops prepares
                the package; it does not publish ads, send messages, buy media, or deploy a website.
              </p>
              <h2>Plans and billing</h2>
              <p>
                Application Stack access and billing are managed in OperatorOS. Legacy Deploy Ops
                tiers are retained only for organizations with an existing grandfathered contract.
              </p>
              <h2>Acceptable use</h2>
              <p>
                Do not use the service for deceptive claims, unlawful offers, unauthorized account
                access, or attempts to view another organization’s work.
              </p>
            </>
          )}
        </div>
      </main>
    </Chrome>
  );
}

function Contact() {
  return (
    <Chrome>
      <main style={{ maxWidth: 850, margin: '0 auto', padding: '70px clamp(18px,4vw,44px)' }}>
        <span style={{ color: '#67e8f9', letterSpacing: '.2em', fontWeight: 900 }}>
          CAMPAIGN SUPPORT
        </span>
        <h1 style={{ fontSize: 'clamp(40px,6vw,66px)' }}>Talk to the OperatorOS team.</h1>
        <div style={card}>
          <p style={{ color: '#cbd5e1', lineHeight: 1.7 }}>
            For product, plan, account, or campaign-workflow help, contact Shotgun Ninjas
            Productions. Do not send secrets, payment credentials, or sensitive customer data by
            email.
          </p>
          <a
            href="mailto:support@shotgunninjas.com?subject=Deploy%20Ops%20support"
            style={{
              display: 'inline-flex',
              color: '#fff',
              background: 'linear-gradient(135deg,#0284c7,#6d28d9)',
              padding: '12px 16px',
              borderRadius: 10,
              textDecoration: 'none',
              fontWeight: 900,
            }}
          >
            support@shotgunninjas.com
          </a>
        </div>
      </main>
    </Chrome>
  );
}

export default async function NinjaLaunchKitPublicPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (page === 'pricing') return <Pricing />;
  if (page === 'contact') return <Contact />;
  if (page === 'terms') return <Legal />;
  if (page === 'privacy') return <Legal privacy />;
  return <Home />;
}
