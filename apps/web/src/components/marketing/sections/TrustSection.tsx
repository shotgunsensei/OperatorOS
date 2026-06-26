'use client';

import React from 'react';
import {
  ShieldCheck,
  Users,
  KeyRound,
  LogIn,
  FileSearch,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { brand } from '@/lib/brand';

/**
 * TrustSection — security + trust posture for the marketing surface.
 *
 * Important: no compliance certification claims (SOC 2, HIPAA, ISO,
 * etc.) appear here. The brief explicitly forbids unsupported badges.
 * Copy uses "designed for" / "built with security-conscious workflows"
 * framing so we describe how the product is architected without
 * implying audits we have not completed.
 */

interface TrustItem {
  icon: LucideIcon;
  title: string;
  body: string;
}

const ITEMS: readonly TrustItem[] = [
  {
    icon: ShieldCheck,
    title: 'Role-based access ready',
    body: 'Designed so owners, admins, and members only see the surface they need. Sensitive actions are built to be checked server-side.',
  },
  {
    icon: Users,
    title: 'Tenant-aware by design',
    body: 'Every record, module grant, and audit row is scoped to a tenant. The API is built to keep tenant data separated.',
  },
  {
    icon: KeyRound,
    title: 'Module entitlement model',
    body: 'Module access is granted per tenant and per user. Designed to revoke access when a subscription ends.',
  },
  {
    icon: LogIn,
    title: 'One centralized login',
    body: 'Sign in once and every unlocked module opens through the same session. No per-app password sprawl.',
  },
  {
    icon: FileSearch,
    title: 'Audit-friendly workflows',
    body: 'Sensitive mutations write to a centralized audit trail with actor, target, and tenant context for later review.',
  },
  {
    icon: Target,
    title: 'Built for operators, MSPs, and business owners',
    body: 'OperatorOS is built with security-conscious workflows in mind — every surface assumes you have real customers and real data.',
  },
];

export default function TrustSection({
  heading = 'Built with security-conscious workflows in mind.',
  subheading = 'Multi-tenant from day one. Role-aware on every action. Designed for teams that move fast without losing control.',
  testId = 'marketing-trust-section',
}: {
  heading?: string;
  subheading?: string;
  testId?: string;
} = {}) {
  return (
    <section
      data-testid={testId}
      aria-labelledby="trust-section-heading"
      style={{
        padding: '88px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: 48 }}>
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: brand.accentCyan,
          margin: '0 0 8px',
        }}>
          Trust &amp; Security
        </p>
        <h2
          id="trust-section-heading"
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 14px',
            letterSpacing: '-0.02em',
          }}
        >
          {heading}
        </h2>
        <p style={{
          fontSize: 16,
          lineHeight: 1.55,
          color: brand.textSecondary,
          maxWidth: 640,
          margin: '0 auto',
        }}>
          {subheading}
        </p>
      </header>

      <style>{`
        .trust-card { transition: transform 200ms ease, border-color 200ms ease; }
        .trust-card:hover { transform: translateY(-2px); border-color: ${brand.borderStrong}; }
        @media (prefers-reduced-motion: reduce) {
          .trust-card { transition: none; }
          .trust-card:hover { transform: none; }
        }
      `}</style>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {ITEMS.map((item) => (
          <li
            key={item.title}
            data-testid={`trust-card-${slugify(item.title)}`}
            className="trust-card"
            style={{
              padding: '24px 20px',
              borderRadius: 14,
              background: brand.bgSecondary,
              border: `1px solid ${brand.borderSoft}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 10,
                background: brand.statusAvailableBg,
                color: brand.accentCyan,
              }}
            >
              <item.icon size={20} color={brand.accentCyan} aria-hidden />
            </span>
            <h3 style={{
              fontFamily: brand.fontDisplay,
              fontSize: 16,
              fontWeight: 600,
              color: brand.textPrimary,
              margin: 0,
            }}>
              {item.title}
            </h3>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
