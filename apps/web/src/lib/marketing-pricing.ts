/**
 * Marketing-side pricing tier catalog.
 *
 * Drives the `/pricing` section and the homepage teaser strip.
 *
 * As of task #98, this file owns only the *public copy* (tier name,
 * description, included module copy, feature bullets, CTA target,
 * footnote). Live dollar amounts are no longer hardcoded here — the
 * UI hydrates them from `/v1/billing/plans` and maps each tier to a
 * plan slug via the `planSlug` field below. Tiers without a matching
 * billing plan (e.g. `business-command`, which is a tailored offer)
 * still render their public-safe `priceLabel` fallback.
 *
 * Constraints:
 *   - No Stripe price IDs, secret keys, or live prices in this file.
 *   - `priceLabel` is the public-safe fallback shown before the live
 *     fetch completes or for tiers without a matching plan slug.
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
  /**
   * Matching slug in the billing plan catalog (`/v1/billing/plans`).
   * When set, the UI replaces `priceLabel` with the live amount for
   * the viewer's selected interval (monthly | annual). Tiers without
   * a matching plan (e.g. tailored `business-command`) leave this
   * undefined and fall back to `priceLabel`.
   */
  planSlug?: 'starter' | 'pro' | 'elite';
  /** Public-safe price label fallback (shown before hydration or when planSlug is unset). */
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

import { primaryCtaTarget, billingCtaTarget } from './marketing-cta';

/**
 * Resolve a pricing card's CTA target for the viewer's auth state.
 *
 * Single source of truth for pricing CTA routing — it does NOT
 * reinvent auth-aware logic, it composes the Phase 2 marketing-cta
 * helpers so /pricing, the marketplace, and the homepage all share
 * the same contract:
 *
 *   - `ctaHref: '/app/billing'` → `billingCtaTarget(signedIn)`
 *     (signed-out → /login, signed-in → /app with "Manage billing"
 *     copy). Note: there is no top-level `/app/billing` Next route —
 *     Billing lives inside the console shell behind
 *     `activePage='billing'`, so the helper resolves to `/app` and the
 *     in-app sidebar takes the viewer the rest of the way.
 *   - `ctaHref: '/app'`         → `primaryCtaTarget(signedIn)`
 *     (signed-out → /login, signed-in → /app with "Launch OperatorOS").
 *   - Any other `ctaHref`        → returned as-is. No current tier
 *     ships this branch; it keeps the function honest if a future
 *     tier links somewhere outside the marketing/console split.
 *
 * Signed-out viewers see the tier's own copy (e.g. "Start free",
 * "See plans") so the CTA still reads naturally before /login takes
 * over. Signed-in viewers see the helper's destination-aware label
 * (e.g. "Launch OperatorOS", "Manage billing") so the button text
 * matches the page they're actually about to land on.
 */
export function resolvePricingCta(
  tier: Pick<MarketingPricingTier, 'ctaHref' | 'ctaLabel'>,
  signedIn: boolean,
): { href: string; label: string } {
  if (tier.ctaHref === '/app/billing') {
    const t = billingCtaTarget(signedIn);
    return { href: t.href, label: signedIn ? t.label : tier.ctaLabel };
  }
  if (tier.ctaHref === '/app') {
    const t = primaryCtaTarget(signedIn);
    return { href: t.href, label: signedIn ? t.label : tier.ctaLabel };
  }
  return { href: tier.ctaHref, label: tier.ctaLabel };
}

export const marketingPricingTiers: readonly MarketingPricingTier[] = [
  {
    slug: 'starter',
    tierName: 'Starter',
    description: 'The smallest console that still feels like a command layer.',
    idealFor: 'Solo operators and 1–2 person teams running a single trade.',
    planSlug: 'starter',
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
    planSlug: 'pro',
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
    footnote: 'Seat counts and module mix tailored in the console.',
  },
  {
    slug: 'elite',
    tierName: 'Elite — Full Arsenal',
    description: 'Every Shotgun Ninjas module, with the AI-native command layer.',
    idealFor: 'MSPs, multi-brand operators, and AI-forward teams.',
    planSlug: 'elite',
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

/**
 * Public-facing add-on module catalog used by `/pricing`.
 *
 * Mirrors the tier catalog conventions:
 *   - **No exact figures.** Copy stays in the same "Starting at" /
 *     "Included" / "Coming soon" register as the four tier cards so
 *     the page reads as one composed surface.
 *   - **One row per add-on module.** Mirrors the slug shape the API's
 *     `tenant_modules` table uses so the follow-up "real prices" task
 *     can wire each row to live billing without UI rework.
 *   - **Tier inclusion shown alongside add-on cost.** Visitors can see
 *     at a glance whether a module already ships in their tier before
 *     they ever look at the add-on price column.
 */
export interface MarketingAddOn {
  /** Stable slug — keys React lists and lines up with `tenant_modules.slug`. */
  slug: string;
  /** Display name (Title Case, no trailing punctuation). */
  name: string;
  /** One-line description of what the module *does* for the operator. */
  blurb: string;
  /** Public-safe price label (e.g. "Starting at $19 / operator / month"). */
  priceLabel: string;
  /** Sub-label clarifying billing cadence / scope. */
  priceCadence: string;
  /** Lowest tier slug that already includes this module, or `null` if add-on only. */
  includedFromTierSlug: 'starter' | 'pro' | 'business-command' | 'elite' | null;
  /** Optional badge label (e.g. "Beta", "Coming soon"). */
  badge?: 'Beta' | 'Coming soon';
}

export const marketingAddOns: readonly MarketingAddOn[] = [
  {
    slug: 'tradeflowkit',
    name: 'TradeFlowKit',
    blurb: 'Quoting, dispatch, and job tracking for trades operators.',
    priceLabel: 'Included',
    priceCadence: 'in every tier',
    includedFromTierSlug: 'starter',
  },
  {
    slug: 'torqueshed',
    name: 'TorqueShed',
    blurb: 'Fleet, asset, and maintenance log for vehicle-heavy crews.',
    priceLabel: 'Included',
    priceCadence: 'in every tier',
    includedFromTierSlug: 'starter',
  },
  {
    slug: 'techdeck',
    name: 'TechDeck',
    blurb: 'Field tech checklists, photo proof, and shift handoffs.',
    priceLabel: 'Included',
    priceCadence: 'in every tier',
    includedFromTierSlug: 'starter',
  },
  {
    slug: 'pulsedesk',
    name: 'PulseDesk',
    blurb: 'Lightweight customer help desk wired into your operator console.',
    priceLabel: 'Starting at add-on rate',
    priceCadence: 'per tenant / month — included on Pro and above',
    includedFromTierSlug: 'pro',
  },
  {
    slug: 'faultlinelab',
    name: 'FaultlineLab',
    blurb: 'Incident timelines and root-cause notes for service teams.',
    priceLabel: 'Starting at add-on rate',
    priceCadence: 'per tenant / month — included on Pro and above',
    includedFromTierSlug: 'pro',
  },
  {
    slug: 'brandforgeos',
    name: 'BrandForgeOS',
    blurb: 'Centralized brand assets, voice rules, and template library.',
    priceLabel: 'Starting at add-on rate',
    priceCadence: 'per tenant / month — included on Pro and above',
    includedFromTierSlug: 'pro',
  },
  {
    slug: 'snapproofos',
    name: 'SnapProofOS',
    blurb: 'Photo-evidence capture with tamper-resistant audit trail.',
    priceLabel: 'Starting at add-on rate',
    priceCadence: 'per tenant / month — included on Business Command',
    includedFromTierSlug: 'business-command',
  },
  {
    slug: 'studyforge-ai',
    name: 'StudyForge AI',
    blurb: 'AI-assisted training plans and SOP coaching for new hires.',
    priceLabel: 'Starting at add-on rate',
    priceCadence: 'per tenant / month — included on Business Command',
    includedFromTierSlug: 'business-command',
    badge: 'Beta',
  },
  {
    slug: 'ninja-launch-kit',
    name: 'Ninja Launch Kit',
    blurb: 'Launch playbooks and rollout checklists for new service lines.',
    priceLabel: 'Starting at add-on rate',
    priceCadence: 'per tenant / month — included on Business Command',
    includedFromTierSlug: 'business-command',
  },
  {
    slug: 'callcommand-ai',
    name: 'CallCommand AI',
    blurb: 'AI-assisted outbound calling with transcript-aware follow-ups.',
    priceLabel: 'Coming soon',
    priceCadence: 'add-on at launch — included on Elite',
    includedFromTierSlug: 'elite',
    badge: 'Coming soon',
  },
  {
    slug: 'ninjamation',
    name: 'Ninjamation',
    blurb: 'Cross-module workflow automation across the operator console.',
    priceLabel: 'Coming soon',
    priceCadence: 'add-on at launch — included on Elite',
    includedFromTierSlug: 'elite',
    badge: 'Coming soon',
  },
];

/**
 * FAQ entries surfaced on `/pricing`.
 *
 * Sized to the brief (6–8 entries). Copy stays in the same plain-spoken
 * register as the tier cards — no buzzwords, no fake urgency, no
 * promises that aren't already backed by the product surface.
 */
export interface MarketingPricingFaq {
  /** Stable slug used for React keys, anchor ids, and test ids. */
  slug: string;
  /** Question — phrased as a visitor would actually ask it. */
  question: string;
  /** Answer — 1–3 short sentences. */
  answer: string;
}

export const marketingPricingFaqs: readonly MarketingPricingFaq[] = [
  {
    slug: 'seat-counting',
    question: 'How does OperatorOS count operator seats?',
    answer:
      'A seat is one person who signs in to the console. Read-only viewers, customers, and webhook integrations do not consume a seat — only humans who log in and operate the modules do.',
  },
  {
    slug: 'billing-cadence',
    question: 'When am I billed, and how often?',
    answer:
      'Paid tiers and add-ons are billed monthly through Stripe on the day you subscribed. Add or remove seats and modules whenever you like — the next invoice is prorated automatically.',
  },
  {
    slug: 'add-on-modules',
    question: 'Can I buy a single add-on module without upgrading my tier?',
    answer:
      'Yes. Any module that is not already included in your tier can be enabled as a stand-alone add-on from the in-app billing screen. Add-ons activate the moment Stripe confirms the charge.',
  },
  {
    slug: 'switch-tiers',
    question: 'What happens to my data if I change tiers or remove a module?',
    answer:
      'Nothing is deleted when you downgrade or disable an add-on. Access to the affected module pauses, but the data sits ready inside your tenant until you re-enable it.',
  },
  {
    slug: 'refunds',
    question: 'What is the refund policy?',
    answer:
      'If a charge does not look right, email support within 14 days of the invoice and we will work it out one-to-one. We do not offer pro-rated refunds for partial months once a billing period has started.',
  },
  {
    slug: 'free-tier',
    question: 'Is the Starter tier really free?',
    answer:
      'Starter is free during beta with one operator seat and the three starter modules. No card is required to sign up, and we will email you well before that ever changes.',
  },
  {
    slug: 'tenant-isolation',
    question: 'Are my modules and data shared with other tenants?',
    answer:
      'No. Every record in OperatorOS is scoped to your tenant, and the API blocks cross-tenant reads by design. Even our platform admins see your data only through audited, role-gated views.',
  },
  {
    slug: 'support',
    question: 'How do I get help if something goes wrong?',
    answer:
      'Starter includes email support, Pro and above add priority response times, and Business Command and Elite get a named success contact. All tiers can reach the team directly from the in-app help menu.',
  },
];
