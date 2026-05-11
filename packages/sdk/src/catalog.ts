/**
 * Shotgun Ninjas module catalog — single source of truth for the
 * 11-module ecosystem. Both the API seed (`saas-db-init.ts`) and the
 * web app (`/apps/[slug]` route + module shells) consume this so the
 * slug list, env-key chain, and plan tiers can never drift between
 * surfaces.
 *
 * `envUrlKeys` and `stripeAddonEnvKeys` are ordered lists — the first
 * non-empty `process.env` value wins. Aliases (e.g. `BF_OS_URL` after
 * the `bf-os → brandforgeos` rename) live at the tail so legacy secrets
 * keep working until ops swaps them in the dashboard.
 */

export type ModuleCategory = 'ops' | 'support' | 'ai';
export type ModulePlanTier = 'starter' | 'pro' | 'elite';
export type ModuleStatus = 'live' | 'coming_soon' | 'beta';

export interface ModuleCatalogEntry {
  slug: string;
  name: string;
  description: string;
  category: ModuleCategory;
  envUrlKeys: string[];
  stripeAddonEnvKeys: string[];
  planMin: ModulePlanTier;
  ord: number;
  /** Internal MVP shell available at `/apps/<slug>` even without an env URL. */
  internal: boolean;
  defaultStatus: ModuleStatus;
}

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  {
    slug: 'tradeflowkit', name: 'TradeFlowKit',
    description: 'Job tracker for trade & service businesses',
    category: 'ops', planMin: 'starter', ord: 1,
    envUrlKeys: ['TRADEFLOWKIT_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_TRADEFLOWKIT'],
    internal: false, defaultStatus: 'live',
  },
  {
    slug: 'torqueshed', name: 'TorqueShed',
    description: 'Mechanic shop dashboard & invoicing',
    category: 'ops', planMin: 'starter', ord: 2,
    envUrlKeys: ['TORQUESHED_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_TORQUESHED'],
    internal: false, defaultStatus: 'live',
  },
  {
    slug: 'techdeck', name: 'TechDeck',
    description: 'Onsite tech command center',
    category: 'ops', planMin: 'starter', ord: 3,
    envUrlKeys: ['TECHDECK_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_TECHDECK'],
    internal: false, defaultStatus: 'live',
  },
  {
    slug: 'pulsedesk', name: 'PulseDesk',
    description: 'Lightweight ticketing for small teams',
    category: 'support', planMin: 'pro', ord: 4,
    envUrlKeys: ['PULSEDESK_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_PULSEDESK'],
    internal: false, defaultStatus: 'live',
  },
  {
    slug: 'faultlinelab', name: 'FaultlineLab',
    description: 'Diagnostic + RCA workflow',
    category: 'support', planMin: 'pro', ord: 5,
    envUrlKeys: ['FAULTLINELAB_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_FAULTLINELAB'],
    internal: false, defaultStatus: 'live',
  },
  {
    // Renamed from `bf-os` in Task #66. BF_OS_URL / STRIPE_PRICE_ADDON_BF_OS
    // remain as fallbacks so live secrets keep working pre-cutover.
    slug: 'brandforgeos', name: 'BrandForgeOS',
    description: 'Body shop / collision OS',
    category: 'ops', planMin: 'pro', ord: 6,
    envUrlKeys: ['BRANDFORGEOS_URL', 'BF_OS_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_BRANDFORGEOS', 'STRIPE_PRICE_ADDON_BF_OS'],
    internal: false, defaultStatus: 'live',
  },
  {
    slug: 'snapproofos', name: 'SnapProofOS',
    description: 'Photo-based proof of work',
    category: 'ops', planMin: 'elite', ord: 7,
    envUrlKeys: ['SNAPPROOFOS_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_SNAPPROOFOS'],
    internal: false, defaultStatus: 'live',
  },
  {
    slug: 'studyforge-ai', name: 'StudyForge AI',
    description: 'AI study & training partner',
    category: 'ai', planMin: 'elite', ord: 8,
    envUrlKeys: ['STUDYFORGE_AI_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_STUDYFORGE_AI'],
    internal: true, defaultStatus: 'live',
  },
  {
    slug: 'ninja-launch-kit', name: 'Ninja Launch Kit',
    description: 'Build & ship internal tools fast',
    category: 'ai', planMin: 'elite', ord: 9,
    envUrlKeys: ['NINJA_LAUNCH_KIT_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_NINJA_LAUNCH_KIT'],
    internal: true, defaultStatus: 'live',
  },
  {
    slug: 'callcommand-ai', name: 'CallCommand AI',
    description: 'AI phone agent + call automation',
    category: 'ai', planMin: 'elite', ord: 10,
    envUrlKeys: ['CALLCOMMAND_AI_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_CALLCOMMAND_AI'],
    internal: true, defaultStatus: 'live',
  },
  {
    slug: 'ninjamation', name: 'Ninjamation',
    description: 'Cross-app workflow automation',
    category: 'ai', planMin: 'elite', ord: 11,
    envUrlKeys: ['NINJAMATION_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_NINJAMATION'],
    internal: true, defaultStatus: 'live',
  },
] as const;

export const MODULE_CATALOG_BY_SLUG: Readonly<Record<string, ModuleCatalogEntry>> =
  Object.freeze(Object.fromEntries(MODULE_CATALOG.map(m => [m.slug, m])));

/**
 * Resolve the first non-empty `process.env` value across an env-key
 * chain. Used by both the seed (server-side) and the catalog helpers.
 */
export function pickEnv(keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim().length > 0) return v;
  }
  return undefined;
}

/**
 * Plans → tier rank. Mirrors `saas-db-init.ts::tierRank` so the catalog
 * stays self-contained.
 */
export const PLAN_TIER_RANK: Readonly<Record<ModulePlanTier, number>> =
  Object.freeze({ starter: 1, pro: 2, elite: 3 });

/** Modules included in a plan (plan tier ≥ module.planMin). */
export function modulesIncludedInPlan(planSlug: string): ModuleCatalogEntry[] {
  const r = PLAN_TIER_RANK[planSlug as ModulePlanTier] ?? 0;
  if (!r) return [];
  return MODULE_CATALOG.filter(m => PLAN_TIER_RANK[m.planMin] <= r);
}

// ---------------------------------------------------------------------------
// Plan catalog — single source of truth for plan slugs, display info,
// and Stripe price-ID env-key chains. Both `apps/api/src/lib/plans.ts`
// and the web BillingPage consume this so launch pricing can never
// drift between surfaces.
//
// Per-interval Stripe price IDs follow:
//   monthly: STRIPE_PRICE_<SLUG>_MONTHLY  (falls back to bare STRIPE_PRICE_<SLUG>)
//   annual : STRIPE_PRICE_<SLUG>_ANNUAL
// `monthlyPriceCents` / `annualPriceCents` are display values (USD cents).
// `annualPriceCents` is null for the free Starter tier.
// ---------------------------------------------------------------------------

export interface PlanCatalogEntry {
  slug: ModulePlanTier;
  name: string;
  description: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  highlight: boolean;
  stripeMonthlyEnvKeys: string[];
  stripeAnnualEnvKeys: string[];
}

export const PLAN_CATALOG: readonly PlanCatalogEntry[] = [
  {
    slug: 'starter', name: 'Starter',
    description: 'For individuals getting started',
    monthlyPriceCents: 4900, annualPriceCents: 49000,
    highlight: false,
    stripeMonthlyEnvKeys: ['STRIPE_PRICE_STARTER_MONTHLY', 'STRIPE_PRICE_STARTER'],
    stripeAnnualEnvKeys:  ['STRIPE_PRICE_STARTER_ANNUAL'],
  },
  {
    slug: 'pro', name: 'Pro',
    description: 'For growing teams and power users',
    monthlyPriceCents: 14900, annualPriceCents: 149000,
    highlight: true,
    stripeMonthlyEnvKeys: ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO'],
    stripeAnnualEnvKeys:  ['STRIPE_PRICE_PRO_ANNUAL'],
  },
  {
    slug: 'elite', name: 'Elite',
    description: 'For enterprises and large teams',
    monthlyPriceCents: 29900, annualPriceCents: 299000,
    highlight: false,
    stripeMonthlyEnvKeys: ['STRIPE_PRICE_ELITE_MONTHLY', 'STRIPE_PRICE_ELITE'],
    stripeAnnualEnvKeys:  ['STRIPE_PRICE_ELITE_ANNUAL'],
  },
] as const;

export const PLAN_CATALOG_BY_SLUG: Readonly<Record<string, PlanCatalogEntry>> =
  Object.freeze(Object.fromEntries(PLAN_CATALOG.map(p => [p.slug, p])));
