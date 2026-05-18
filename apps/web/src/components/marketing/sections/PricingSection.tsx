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
 * Live billing-plans response (task #98) — public-safe subset of
 * `/v1/billing/plans`. Field names mirror the API exactly so the
 * marketing UI never reinterprets billing data.
 */
interface LiveBillingPlan {
  slug: string;
  displayMonthlyPriceCents?: number | null;
  displayAnnualPriceCents?: number | null;
}
interface LiveBillingAddon {
  slug: string;
  name: string;
  addonPriceCents: number | null;
}
interface LiveBillingPlansResponse {
  plans: LiveBillingPlan[];
  addons?: LiveBillingAddon[];
}

type BillingInterval = 'monthly' | 'annual';

/** Format integer USD cents as a "$NN" / "$1,299" label (no decimals). */
function formatUsd(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString('en-US')}`;
}

/**
 * PricingSection — full tier grid used on /pricing.
 *
 * - 4 tiers driven by `marketingPricingTiers` for copy/CTA routing.
 * - Live dollar amounts hydrated from `/v1/billing/plans` per tier
 *   (matched by `tier.planSlug`). Tiers without a planSlug, or before
 *   the fetch resolves, fall back to the public-safe `priceLabel`.
 * - Monthly / annual toggle picks which display amount is rendered.
 * - Add-on price disclosure: the cheapest live add-on price drives the
 *   "Add-ons from $X/mo" line that appears under every card so visitors
 *   can see the marginal cost of expanding the bundle without
 *   signing in.
 * - One tier marked `isFeatured` gets a "Most popular" ribbon + glow.
 * - CTAs are auth-aware via `resolvePricingCta`.
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

  const [interval, setInterval] = React.useState<BillingInterval>('monthly');
  const [livePlans, setLivePlans] = React.useState<Record<string, LiveBillingPlan> | null>(null);
  const [minAddonCents, setMinAddonCents] = React.useState<number | null>(null);

  // Fetch live pricing once on mount. We use the same `/api` proxy
  // pattern as `apps/web/src/lib/api.ts` so the marketing page works
  // both in dev (Next rewrite) and in production builds. Failures are
  // silent — the static `priceLabel` fallback is the safety net.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/billing/plans', { credentials: 'omit' });
        if (!res.ok) return;
        const body = (await res.json()) as LiveBillingPlansResponse;
        if (cancelled) return;
        const byslug: Record<string, LiveBillingPlan> = {};
        for (const p of body.plans ?? []) byslug[p.slug] = p;
        setLivePlans(byslug);
        const addonPrices = (body.addons ?? [])
          .map(a => a.addonPriceCents)
          .filter((c): c is number => typeof c === 'number' && c > 0);
        if (addonPrices.length) {
          setMinAddonCents(Math.min(...addonPrices));
        }
      } catch {
        // Silent — marketing page must never break on a billing fetch failure.
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      <header style={{ textAlign: 'center', marginBottom: 32 }}>
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

      <IntervalToggle value={interval} onChange={setInterval} />

      {/*
        Reduced-motion-aware hover/focus polish. Inline <style> keeps
        the CSS colocated with the component while still letting the
        :hover, :focus-visible, and prefers-reduced-motion selectors
        do work that inline styles can't express.
      */}
      <style>{`
        .pricing-card { transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease; }
        .pricing-card:hover { transform: translateY(-2px); border-color: ${brand.borderStrong}; }
        .pricing-card .pricing-cta:focus-visible {
          outline: 2px solid ${brand.accentCyan};
          outline-offset: 2px;
        }
        .pricing-card .pricing-cta { transition: transform 160ms ease, box-shadow 200ms ease; }
        .pricing-card:hover .pricing-cta { box-shadow: ${brand.ctaGlowHover}; }
        .pricing-interval-toggle button { transition: background 160ms ease, color 160ms ease; }
        @media (prefers-reduced-motion: reduce) {
          .pricing-card, .pricing-card .pricing-cta, .pricing-interval-toggle button { transition: none; }
          .pricing-card:hover { transform: none; }
        }
      `}</style>
      <div
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          alignItems: 'stretch',
        }}
      >
        {marketingPricingTiers.map((tier) => (
          <PricingCard
            key={tier.slug}
            tier={tier}
            signedIn={signedIn}
            interval={interval}
            livePlan={tier.planSlug ? livePlans?.[tier.planSlug] ?? null : null}
            minAddonCents={minAddonCents}
          />
        ))}
      </div>

      <p style={{
        marginTop: 32,
        textAlign: 'center',
        fontSize: 13,
        color: brand.textMuted,
      }}>
        Prices shown in USD. Final pricing confirmed at checkout inside the console.
      </p>
    </section>
  );
}

function IntervalToggle({
  value, onChange,
}: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  const options: { id: BillingInterval; label: string }[] = [
    { id: 'monthly', label: 'Monthly' },
    { id: 'annual', label: 'Annual · save ~17%' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Billing interval"
      className="pricing-interval-toggle"
      data-testid="pricing-interval-toggle"
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        margin: '0 auto 32px',
        borderRadius: 999,
        border: `1px solid ${brand.borderSoft}`,
        background: brand.bgSecondary,
        width: 'fit-content',
        justifyContent: 'center',
      }}
    >
      {options.map(opt => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`pricing-interval-${opt.id}`}
            onClick={() => onChange(opt.id)}
            style={{
              minHeight: 36,
              padding: '6px 16px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: active
                ? `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`
                : 'transparent',
              color: active ? brand.accentInk : brand.textSecondary,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PricingCard({
  tier, signedIn, interval, livePlan, minAddonCents,
}: {
  tier: MarketingPricingTier;
  signedIn: boolean;
  interval: BillingInterval;
  livePlan: LiveBillingPlan | null;
  minAddonCents: number | null;
}) {
  // `resolvePricingCta` composes the shared marketing-cta helpers
  // (primaryCtaTarget / billingCtaTarget) so this card never reinvents
  // auth-aware routing — see `apps/web/src/lib/marketing-pricing.ts`.
  const { href, label: ctaLabel } = resolvePricingCta(tier, signedIn);

  const live = resolveLivePrice(tier, livePlan, interval);

  return (
    <article
      data-testid={`pricing-card-${tier.slug}`}
      aria-labelledby={`pricing-card-${tier.slug}-title`}
      className="pricing-card"
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
        <div
          data-testid={`pricing-card-${tier.slug}-price`}
          style={{ fontFamily: brand.fontDisplay, fontSize: 26, fontWeight: 700, color: brand.textPrimary }}
        >
          {live.priceLabel}
        </div>
        {live.cadenceLabel && (
          <div style={{ fontSize: 12, color: brand.textMuted, marginTop: 2 }}>
            {live.cadenceLabel}
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

      <div
        data-testid={`pricing-card-${tier.slug}-addons`}
        style={{
          fontSize: 12,
          color: brand.textMuted,
          padding: '8px 10px',
          border: `1px dashed ${brand.borderSoft}`,
          borderRadius: 8,
        }}
      >
        {minAddonCents != null
          ? `Add-ons from ${formatUsd(minAddonCents)}/module/month, billed separately.`
          : 'Add-ons billed separately per module, per month.'}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link
          href={href}
          data-testid={`pricing-cta-${tier.slug}`}
          className="pricing-cta"
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

/**
 * Pick the right display label for a card given the live plan response
 * and the selected interval. Falls back to the static `priceLabel`
 * whenever live data is unavailable or the amount is zero (free tier
 * keeps "Free during beta" rather than showing "$0").
 */
function resolveLivePrice(
  tier: MarketingPricingTier,
  livePlan: LiveBillingPlan | null,
  interval: BillingInterval,
): { priceLabel: string; cadenceLabel: string | undefined } {
  if (!livePlan) {
    return { priceLabel: tier.priceLabel, cadenceLabel: tier.priceCadence };
  }
  if (interval === 'annual') {
    const cents = livePlan.displayAnnualPriceCents;
    if (cents == null) {
      return { priceLabel: tier.priceLabel, cadenceLabel: tier.priceCadence };
    }
    if (cents === 0) {
      return { priceLabel: tier.priceLabel, cadenceLabel: 'billed annually' };
    }
    return { priceLabel: `${formatUsd(cents)}/yr`, cadenceLabel: 'per operator, billed annually' };
  }
  const cents = livePlan.displayMonthlyPriceCents;
  if (cents == null) {
    return { priceLabel: tier.priceLabel, cadenceLabel: tier.priceCadence };
  }
  if (cents === 0) {
    return { priceLabel: tier.priceLabel, cadenceLabel: tier.priceCadence };
  }
  return { priceLabel: `${formatUsd(cents)}/mo`, cadenceLabel: 'per operator, per month' };
}
