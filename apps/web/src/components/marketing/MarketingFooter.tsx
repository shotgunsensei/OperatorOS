'use client';

import React from 'react';
import Link from 'next/link';
import OperatorLogo from '../brand/OperatorLogo';
import { brand } from '@/lib/design-tokens';

const COL_PRODUCT = [
  { href: '/modules', label: 'Modules' },
  { href: '/ecosystem', label: 'Ecosystem' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/how-it-works', label: 'How It Works' },
];

const COL_MODULES = [
  { href: '/modules', label: 'TradeFlowKit' },
  { href: '/modules', label: 'TechDeck' },
  { href: '/modules', label: 'PulseDesk' },
  { href: '/modules', label: 'Ninjamation' },
];

const COL_ACTIONS = [
  { href: '/login', label: 'Login' },
  { href: '/app', label: 'Operator Console' },
  { href: '/modules', label: 'View Modules' },
];

/**
 * MarketingFooter — closes the public layout with brand identity,
 * link columns, and the "Powered by Shotgun Ninjas Productions" attribution.
 */
export default function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      data-testid="marketing-footer"
      style={{
        marginTop: 64,
        borderTop: `1px solid ${brand.borderSoft}`,
        background: brand.bgPrimary,
        color: brand.textSecondary,
      }}
    >
      <div
        style={{
          maxWidth: brand.contentMaxWidth,
          margin: '0 auto',
          padding: '48px 24px 24px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) repeat(3, minmax(0, 1fr))',
          gap: 32,
        }}
      >
        <div>
          <OperatorLogo size={32} wordmarkSize={16} />
          <p
            style={{
              marginTop: 14,
              fontSize: 13,
              lineHeight: 1.6,
              color: brand.textMuted,
              maxWidth: 320,
            }}
          >
            Parent command layer for a modular business operating system.
            One login. Every operation.
          </p>
        </div>

        <FooterColumn title="Product" links={COL_PRODUCT} />
        <FooterColumn title="Modules" links={COL_MODULES} />
        <FooterColumn title="Actions" links={COL_ACTIONS} />
      </div>

      <div
        style={{
          maxWidth: brand.contentMaxWidth,
          margin: '0 auto',
          padding: '16px 24px',
          borderTop: `1px solid ${brand.borderSoft}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 12,
          color: brand.textMuted,
        }}
      >
        <span>© {year} OperatorOS. All rights reserved.</span>
        <span data-testid="footer-attribution">
          Powered by{' '}
          <span style={{ color: brand.textSecondary, fontWeight: 600 }}>
            Shotgun Ninjas Productions
          </span>
        </span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 767px) {
          [data-testid="marketing-footer"] > div:first-child {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 480px) {
          [data-testid="marketing-footer"] > div:first-child {
            grid-template-columns: 1fr !important;
          }
        }
      ` }} />
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: brand.fontDisplay,
          fontSize: 12,
          fontWeight: 600,
          color: brand.textPrimary,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {links.map((l) => (
          <li key={`${title}-${l.label}`}>
            <Link
              href={l.href}
              style={{
                color: brand.textSecondary,
                textDecoration: 'none',
                fontSize: 13,
                transition: 'color 0.15s ease',
              }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
