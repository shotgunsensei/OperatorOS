'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import { brand } from '@/lib/brand';
import {
  marketingPricingTiers,
  resolvePricingCta,
  type MarketingPricingTier,
} from '@/lib/marketing-pricing';
import { useAuth } from '../../AuthProvider';

/**
 * PricingSection — full tier grid used on /pricing.
 *
 * - 4 tiers driven by `marketingPricingTiers`.
 * - One tier marked `isFeatured` gets a "Most popular" ribbon + glow.
 * - "Coming soon" tiers render without a price.
 * - CTAs are auth-aware via `primaryCtaTarget` where the config asks
 *   for `/app`; otherwise the configured href is used as-is.
 */
export default function PricingSection({
  heading = 'Pricing that scales with how much you operate.',
  subheading = 'Four tiers, one console. Start free, layer on modules as your operation grows.',
  testId = 'marketing-pricing-section',
}: {
  heading?: string;
  subheading?: string;
  testId?: string;
} = {}) {
  const { user } = useAuth();
  const signedIn = !!user;

  return (
    <section
      data-testid={testId}
      aria-labelledby="pricing-section-heading"
      style={{
        padding: '88px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: 48 }}>
        <h2
          id="pricing-section-heading"
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

      <div
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          alignItems: 'stretch',
        }}
      >
        {marketingPricingTiers.map((tier) => (
          <PricingCard key={tier.slug} tier={tier} signedIn={signedIn} />
        ))}
      </div>

      <p style={{
        marginTop: 32,
        textAlign: 'center',
        fontSize: 13,
        color: brand.textMuted,
      }}>
        Prices shown are public estimates. Final pricing confirmed inside the console.
      </p>
    </section>
  );
}

function PricingCard({ tier, signedIn }: { tier: MarketingPricingTier; signedIn: boolean }) {
  // `resolvePricingCta` composes the shared marketing-cta helpers
  // (primaryCtaTarget / billingCtaTarget) so this card never reinvents
  // auth-aware routing — see `apps/web/src/lib/marketing-pricing.ts`.
  const { href, label: ctaLabel } = resolvePricingCta(tier, signedIn);

  return (
    <article
      data-testid={`pricing-card-${tier.slug}`}
      aria-labelledby={`pricing-card-${tier.slug}-title`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '28px 24px',
        borderRadius: 16,
        background: tier.isFeatured ? brand.bgElevated : brand.bgSecondary,
        border: `1px solid ${tier.isFeatured ? brand.borderStrong : brand.borderSoft}`,
        boxShadow: tier.isFeatured ? brand.ctaGlowSoft : 'none',
      }}
    >
      {tier.isFeatured && (
        <span
          data-testid={`pricing-card-${tier.slug}-featured`}
          style={{
            position: 'absolute',
            top: -10,
            left: 24,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 999,
            background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
            color: brand.accentInk,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <Sparkles size={12} aria-hidden /> Most popular
        </span>
      )}

      <header>
        <h3
          id={`pricing-card-${tier.slug}-title`}
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 20,
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 6px',
          }}
        >
          {tier.tierName}
        </h3>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: brand.textSecondary, margin: 0 }}>
          {tier.description}
        </p>
        <p style={{ fontSize: 12, color: brand.textMuted, margin: '6px 0 0' }}>
          For {tier.idealFor}
        </p>
      </header>

      <div>
        <div style={{ fontFamily: brand.fontDisplay, fontSize: 26, fontWeight: 700, color: brand.textPrimary }}>
          {tier.priceLabel}
        </div>
        {tier.priceCadence && (
          <div style={{ fontSize: 12, color: brand.textMuted, marginTop: 2 }}>
            {tier.priceCadence}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: brand.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Includes
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tier.includedModules.map((m) => (
            <li key={m} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: brand.textPrimary }}>
              <Check size={14} color={brand.accentGreen} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: brand.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Why operators pick this
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tier.highlightedFeatures.map((f) => (
            <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: brand.textSecondary }}>
              <Check size={14} color={brand.accentCyan} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link
          href={href}
          data-testid={`pricing-cta-${tier.slug}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            minHeight: 44,
            padding: '12px 18px',
            borderRadius: 10,
            background: tier.isFeatured
              ? `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`
              : 'transparent',
            color: tier.isFeatured ? brand.accentInk : brand.textPrimary,
            border: tier.isFeatured ? 'none' : `1px solid ${brand.borderStrong}`,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
            boxShadow: tier.isFeatured ? brand.ctaGlowSoft : 'none',
          }}
        >
          {ctaLabel}
        </Link>
        {tier.footnote && (
          <p style={{ fontSize: 11, color: brand.textMuted, margin: 0, textAlign: 'center' }}>
            {tier.footnote}
          </p>
        )}
      </div>
    </article>
  );
}
