'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { brand } from '@/lib/brand';

/**
 * PricingTeaser — homepage strip that summarizes pricing in 3 lines
 * and routes visitors to /pricing for the full tier grid. Keeps the
 * homepage from sending the visitor on a hunt for prices, without
 * duplicating the pricing UI inline.
 */
export default function PricingTeaser() {
  return (
    <section
      data-testid="marketing-pricing-teaser"
      aria-labelledby="pricing-teaser-heading"
      style={{
        padding: '64px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: 24,
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          padding: '32px clamp(20px, 4vw, 40px)',
          borderRadius: 16,
          background: brand.bgSecondary,
          border: `1px solid ${brand.borderSoft}`,
        }}
      >
        <div>
          <p style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: brand.accentCyan,
            margin: '0 0 8px',
          }}>
            Pricing
          </p>
          <h2
            id="pricing-teaser-heading"
            style={{
              fontFamily: brand.fontDisplay,
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 700,
              color: brand.textPrimary,
              margin: '0 0 6px',
              letterSpacing: '-0.01em',
            }}
          >
            OperatorOS is free. Build the paid app stack you need.
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
            Choose TradeFlowKit, PulseDesk, or TechDeck with 5 seats, included apps, and one free companion module.
          </p>
        </div>
        <style>{`
          .pricing-teaser-cta:focus-visible {
            outline: 2px solid ${brand.accentCyan};
            outline-offset: 2px;
          }
        `}</style>
        <Link
          href="/pricing"
          data-testid="pricing-teaser-cta"
          className="pricing-teaser-cta"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            minHeight: 44,
            padding: '12px 20px',
            borderRadius: 10,
            background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
            color: brand.accentInk,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
            boxShadow: brand.ctaGlowSoft,
            whiteSpace: 'nowrap',
          }}
        >
          Build Your Stack <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
