'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { brand } from '@/lib/design-tokens';

interface MarketingPlaceholderProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  ctaHref?: string;
  ctaLabel?: string;
  testId?: string;
}

/**
 * MarketingPlaceholder — Phase 1 body for the four public routes.
 *
 * Renders a centered hero with eyebrow chip, large display title,
 * supporting copy, and a single primary CTA. Phase 2 and Phase 3
 * replace this with real home / modules / pricing / how-it-works
 * content (tasks #86, #87).
 */
export default function MarketingPlaceholder({
  eyebrow = 'Coming soon',
  title,
  subtitle,
  ctaHref = '/app',
  ctaLabel = 'Launch console',
  testId = 'marketing-placeholder',
}: MarketingPlaceholderProps) {
  return (
    <section
      data-testid={testId}
      style={{
        position: 'relative',
        padding: '80px 24px 96px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Soft accent glow behind the headline — purely decorative. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(60% 50% at 50% 30%, rgba(0, 229, 255, 0.12) 0%, rgba(124, 58, 237, 0.08) 45%, transparent 70%)',
        }}
      />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <span
          data-testid={`${testId}-eyebrow`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            border: `1px solid ${brand.borderSoft}`,
            background: brand.bgGlass,
            fontFamily: brand.fontDisplay,
            fontSize: 12,
            fontWeight: 600,
            color: brand.textSecondary,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <Sparkles size={12} color={brand.accentCyan} /> {eyebrow}
        </span>
        <h1
          data-testid={`${testId}-title`}
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(36px, 6vw, 64px)',
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            color: brand.textPrimary,
            margin: '20px auto 16px',
            maxWidth: 880,
          }}
        >
          {title}
        </h1>
        <p
          data-testid={`${testId}-subtitle`}
          style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: brand.textSecondary,
            margin: '0 auto 28px',
            maxWidth: 640,
          }}
        >
          {subtitle}
        </p>
        <Link
          href={ctaHref}
          data-testid={`${testId}-cta`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 22px',
            borderRadius: 10,
            background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
            color: '#0B0B12',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
            boxShadow:
              '0 0 0 1px rgba(0, 229, 255, 0.22), 0 18px 48px -16px rgba(124, 58, 237, 0.7)',
          }}
        >
          {ctaLabel} <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
