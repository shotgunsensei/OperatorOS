/**
 * Marketing-side pricing tier catalog.
 *
 * Drives the Phase 3 `/pricing` section and the homepage teaser strip.
 * This is intentionally a **static UI shell**: it carries the public-
 * facing copy for the four tiers without ever touching live billing
 * data. The field shape mirrors what `/v1/billing/plans` would return
 * so we can swap the source in a follow-up task with no UI rework.
 *
 * Constraints (Phase 3 brief):
 *   - No Stripe price IDs, secret keys, or live prices.
 *   - Public copy uses "Starting at", "Coming soon", or "See plans"
 *     where exact prices are not public-safe yet.
 *   - One tier carries `isFeatured: true` so the UI can render a
 *     "Most popular" badge without sprinkling marketing decisions
 *     into the component.
 */

export interface MarketingPricingTier {
  /** Stable slug used by tests and for keying React lists. */
  slug: string;
  /** Display name shown on the card. */
  tierName: string;
  /** One-sentence elevator pitch — what this tier *is*. */
  description: string;
  /** Who this tier is *for* — surfaces under the description. */
  idealFor: string;
  /** Public-safe price label (no exact figures). */
  priceLabel: string;
  /** Optional sub-label under the price (e.g. "per operator / month"). */
  priceCadence?: string;
  /** Module bundle the tier includes — short outcome phrases. */
  includedModules: readonly string[];
  /** 3-5 outcome-led feature bullets. */
  highlightedFeatures: readonly string[];
  /** CTA text. */
  ctaLabel: string;
  /** CTA target. Marketing CTAs only ever point at /login, /pricing, or /app. */
  ctaHref: '/login' | '/app' | '/pricing' | '/app/billing';
  /** Visually featured ("Most popular") card. Exactly one tier should set this. */
  isFeatured: boolean;
  /** Optional footnote under the card (e.g. "Add-ons billed separately"). */
  footnote?: string;
}

/**
 * Resolve a pricing card's CTA target for the viewer's auth state.
 *
 * Extracted as a pure function (no React dependency) so unit tests
 * can lock down the auth-aware routing rule without rendering the
 * component:
 *
 *   - Tiers configured with `/app` or `/app/billing` are
 *     console-routing CTAs. Signed-out viewers are sent to `/login`
 *     first; signed-in viewers go straight to the console route.
 *     Signed-in viewers see the helper's label too (e.g. "Launch
 *     OperatorOS", "Manage billing") so the copy matches the
 *     destination they're actually about to hit.
 *   - Any other `ctaHref` value is used as-is (no current tier ships
 *     this branch, but the fallback keeps the function honest if a
 *     future tier links to, say, a partner microsite).
 */
export function resolvePricingCta(
  tier: Pick<MarketingPricingTier, 'ctaHref' | 'ctaLabel'>,
  signedIn: boolean,
): { href: string; label: string } {
  if (tier.ctaHref === '/app/billing') {
    return signedIn
      ? { href: '/app/billing', label: 'Manage billing' }
      : { href: '/login',       label: tier.ctaLabel };
  }
  if (tier.ctaHref === '/app') {
    return signedIn
      ? { href: '/app',   label: 'Launch OperatorOS' }
      : { href: '/login', label: tier.ctaLabel };
  }
  return { href: tier.ctaHref, label: tier.ctaLabel };
}

export const marketingPricingTiers: readonly MarketingPricingTier[] = [
  {
    slug: 'starter',
    tierName: 'Starter',
    description: 'The smallest console that still feels like a command layer.',
    idealFor: 'Solo operators and 1–2 person teams running a single trade.',
    priceLabel: 'Free during beta',
    priceCadence: 'one operator seat included',
    includedModules: ['TradeFlowKit', 'TorqueShed', 'TechDeck'],
    highlightedFeatures: [
      'One operator seat',
      'Three starter modules unlocked',
      'Single sign-on across every module',
      'Email support',
    ],
    ctaLabel: 'Start free',
    ctaHref: '/app',
    isFeatured: false,
    footnote: 'No card required. Upgrade any time.',
  },
  {
    slug: 'pro',
    tierName: 'Pro Operator',
    description: 'The full operator stack for growing service businesses.',
    idealFor: 'Teams of 3–15 running multiple trades or service lines.',
    priceLabel: 'See plans',
    priceCadence: 'per operator, per month',
    includedModules: ['Everything in Starter', 'PulseDesk', 'FaultlineLab', 'BrandForgeOS'],
    highlightedFeatures: [
      'Up to 15 operator seats',
      'Six modules unlocked, more as add-ons',
      'Role-based access for owners, admins, members',
      'Priority support',
    ],
    ctaLabel: 'See plans',
    ctaHref: '/app/billing',
    isFeatured: true,
    footnote: 'Add-on modules billed per-module, per-month.',
  },
  {
    slug: 'business-command',
    tierName: 'Business Command',
    description: 'Multi-team coordination with audit-friendly workflows.',
    idealFor: 'Operations leaders running multiple sites or service lines.',
    priceLabel: 'See plans',
    priceCadence: 'tailored to seats + modules',
    includedModules: [
      'Everything in Pro',
      'SnapProofOS',
      'StudyForge AI',
      'Ninja Launch Kit',
    ],
    highlightedFeatures: [
      'Unlimited operator seats per tenant',
      'Nine modules unlocked',
      'Tenant-aware admin surface',
      'Centralized audit trail',
    ],
    ctaLabel: 'See plans',
    ctaHref: '/app/billing',
    isFeatured: false,
  },
  {
    slug: 'elite',
    tierName: 'Elite — Full Arsenal',
    description: 'Every Shotgun Ninjas module, with the AI-native command layer.',
    idealFor: 'MSPs, multi-brand operators, and AI-forward teams.',
    priceLabel: 'Coming soon',
    priceCadence: 'talk to us about early access',
    includedModules: [
      'Every module included',
      'CallCommand AI',
      'Ninjamation',
    ],
    highlightedFeatures: [
      'All 11 modules unlocked by default',
      'AI Operations Assistant included',
      'Cross-app workflow automation',
      'Dedicated success contact',
    ],
    ctaLabel: 'Join the waitlist',
    ctaHref: '/app',
    isFeatured: false,
    footnote: 'Early access opens through the console once you sign in.',
  },
];
