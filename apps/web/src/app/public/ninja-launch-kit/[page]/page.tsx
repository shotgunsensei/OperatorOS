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

const plans = [
  {
    name: 'Free',
    detail: '2 release packages per month, TXT export, watermark, and one unlocked evidence brief.',
    features: [
      'Reviewed template previews',
      'Deterministic package generation',
      'Readiness checklist',
    ],
  },
  {
    name: 'Pro',
    detail:
      'Unlimited packages, five configurations, all export formats, and complete evidence briefs.',
    features: [
      'Shared AI refinement + fallback',
      'Release communications',
      'Unwatermarked exports',
    ],
  },
  {
    name: 'Agency',
    detail: 'Unlimited configurations, white-label delivery, and client-ready release workflows.',
    features: ['White-label exports', 'Client workspace entitlement', 'All premium templates'],
  },
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
    page === 'pricing' ? 'Deploy Ops Plans | OperatorOS' : 'Deploy Ops | Release Readiness';
  const description =
    'Coordinate release readiness, approvals, promotion evidence, rollback planning, and audited exports under OperatorOS authority.';
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
            Pricing
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
      'Release packages',
      'Persist readiness tasks, communications, artifacts, and tenant-scoped release context.',
    ],
    [
      ClipboardCheck,
      'Promotion evidence',
      'Review approvals, evidence, checksums, and release gates before a human promotes.',
    ],
    [
      RotateCcw,
      'Rollback planning',
      'Keep rollback notes and decision context alongside the release evidence.',
    ],
    [
      ShieldCheck,
      'OperatorOS controlled',
      'Central identity, tenant, entitlement, billing, audit, and provider authority.',
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
              RELEASE WITH EVIDENCE
            </span>
            <h1
              style={{
                fontSize: 'clamp(42px,7vw,82px)',
                lineHeight: 0.95,
                margin: '14px 0 22px',
                maxWidth: 850,
              }}
            >
              Control every release gate. <span style={{ color: '#38bdf8' }}>Ship with proof.</span>
            </h1>
            <p style={{ color: '#cbd5e1', fontSize: 19, lineHeight: 1.65, maxWidth: 760 }}>
              Bring readiness tasks, artifacts, approvals, promotion evidence, rollback notes, and
              export history into one tenant-scoped release workspace. Deploy Ops records decisions;
              it does not fake provider deployment success.
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
                Compare plans
              </Link>
            </div>
          </div>
          <aside style={{ ...card, transform: 'rotate(.6deg)' }}>
            <Rocket color="#67e8f9" />
            <h2>One controlled release record</h2>
            {[
              'Readiness tasks and owners',
              'Artifacts and checksum evidence',
              'Human approvals and decision trail',
              'Promotion notes by environment',
              'Rollback plan and recovery context',
              'Audited TXT / Markdown / JSON exports',
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
          OPERATOROS ENTITLEMENTS
        </span>
        <h1 style={{ fontSize: 'clamp(40px,6vw,68px)', margin: '10px 0' }}>
          Choose your release capability.
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 18 }}>
          OperatorOS remains the billing source of truth. Checkout and plan changes happen in the
          parent platform.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))',
            gap: 16,
            marginTop: 30,
          }}
        >
          {plans.map((plan) => (
            <article
              key={plan.name}
              style={{
                ...card,
                borderColor: plan.name === 'Pro' ? '#38bdf8' : 'rgba(103,232,249,.2)',
              }}
            >
              <h2 style={{ fontSize: 30 }}>{plan.name}</h2>
              <p style={{ color: '#cbd5e1', minHeight: 72 }}>{plan.detail}</p>
              {plan.features.map((feature) => (
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
                Continue in OperatorOS
              </Link>
            </article>
          ))}
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
              <h2>Data and authority</h2>
              <p>
                Deploy Ops stores tenant-scoped release briefs, artifacts, approvals, revisions,
                readiness evidence, rollback notes, and export history. OperatorOS controls
                identity, membership, roles, entitlements, billing, provider configuration, and
                security audit events.
              </p>
              <h2>Provider privacy</h2>
              <p>
                Generation prompts exclude platform secrets and should not contain regulated,
                confidential, or unnecessary personal data. Provider use is recorded by provenance
                without exposing secret values.
              </p>
              <h2>Retention and access</h2>
              <p>
                Soft-deleted product records remain recoverable according to OperatorOS retention
                policy. Tenant and user boundaries apply to every authenticated record and download.
              </p>
            </>
          ) : (
            <>
              <h2>Product use</h2>
              <p>
                You are responsible for reviewing release material, claims, destination links,
                approvals, configuration intent, rollback steps, licensing, and legal disclosures
                before promotion. Stored readiness is evidence, not proof that an external provider
                deployed successfully.
              </p>
              <h2>Plans and billing</h2>
              <p>
                Plan limits, upgrades, credits, and billing are governed by OperatorOS. Locked
                content is unavailable until the required entitlement is active.
              </p>
              <h2>Acceptable use</h2>
              <p>
                Do not use the service for deceptive claims, unauthorized system changes, unlawful
                offers, or attempts to cross tenant boundaries.
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
          RELEASE SUPPORT
        </span>
        <h1 style={{ fontSize: 'clamp(40px,6vw,66px)' }}>Talk to the OperatorOS team.</h1>
        <div style={card}>
          <p style={{ color: '#cbd5e1', lineHeight: 1.7 }}>
            For product, plan, account, or release-workflow help, contact Shotgun Ninjas
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
