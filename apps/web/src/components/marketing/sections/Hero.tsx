'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { brand } from '@/lib/brand';
import { useAuth } from '../../AuthProvider';
import { primaryCtaTarget } from '@/lib/marketing-cta';

/**
 * Hero — first paint of the Phase 2 homepage.
 *
 * Headline + subhead + two CTAs. The primary CTA is auth-aware (signed-
 * out visitors land on /login first, then bounce to /app). Visuals come
 * from the shared brand tokens — no hardcoded hex.
 */
export default function Hero() {
  const { user, loading } = useAuth();
  const primary = primaryCtaTarget(!!user);

  return (
    <section
      data-testid="marketing-hero"
      style={{
        position: 'relative',
        padding: '88px 24px 64px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: brand.heroRadial,
        }}
      />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <h1
          data-testid="marketing-hero-title"
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(40px, 7vw, 72px)',
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: '-0.03em',
            color: brand.textPrimary,
            margin: '0 auto 20px',
            maxWidth: 920,
          }}
        >
          Command Every Moving Part.
        </h1>
        <p
          data-testid="marketing-hero-subtitle"
          style={{
            fontSize: 'clamp(16px, 1.8vw, 19px)',
            lineHeight: 1.55,
            color: brand.textSecondary,
            margin: '0 auto 32px',
            maxWidth: 680,
          }}
        >
          OperatorOS is the modular command layer for modern business
          operations — one console, every tool your team launches.
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'center',
          }}
        >
          <Link
            href={loading ? '/login' : primary.href}
            data-testid="hero-cta-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 24px',
              borderRadius: 10,
              minHeight: 44,
              background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
              color: brand.accentInk,
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              boxShadow: brand.ctaGlowLarge,
            }}
          >
            Launch OperatorOS <ArrowRight size={16} />
          </Link>
          <Link
            href="/modules"
            data-testid="hero-cta-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 24px',
              borderRadius: 10,
              minHeight: 44,
              background: 'transparent',
              color: brand.textPrimary,
              fontWeight: 500,
              fontSize: 15,
              textDecoration: 'none',
              border: `1px solid ${brand.borderStrong}`,
            }}
          >
            Explore Modules
          </Link>
        </div>
      </div>
    </section>
  );
}
