'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { brand } from '@/lib/brand';
import { useAuth } from '../../AuthProvider';

/**
 * Final CTA — closing section that re-issues the primary call to
 * action with a stronger emotional headline. Always points at /app
 * (the console), via /login first for signed-out visitors.
 */
export default function FinalCta() {
  const { user, loading } = useAuth();
  const href = loading ? '/login' : user ? '/app' : '/login';

  return (
    <section
      data-testid="marketing-final-cta"
      style={{
        padding: '88px 24px 96px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: '56px 32px',
          borderRadius: 20,
          background: brand.bgElevated,
          border: `1px solid ${brand.borderStrong}`,
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: brand.heroRadial,
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>
          <h2
            data-testid="final-cta-title"
            style={{
              fontFamily: brand.fontDisplay,
              fontSize: 'clamp(28px, 4.5vw, 44px)',
              fontWeight: 700,
              color: brand.textPrimary,
              margin: '0 0 14px',
              letterSpacing: '-0.02em',
            }}
          >
            Stop juggling tools. Start operating.
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: brand.textSecondary,
              margin: '0 auto 28px',
              maxWidth: 560,
            }}
          >
            OperatorOS gives your whole operation one command layer.
            Sign in once, light up the modules you need, and run.
          </p>
          <Link
            href={href}
            data-testid="final-cta-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 26px',
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
            Enter the Command Layer <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
