/**
 * Shotgun Ninjas module catalog — single source of truth for the
 * OperatorOS module ecosystem. Both the API seed (`saas-db-init.ts`) and the
 * web app (`/apps/[slug]` route + module shells) consume this so the
 * slug list, env-key chain, and plan tiers can never drift between
 * surfaces.
 *
 * `canonicalBaseUrl` is the immutable production launch origin for a
 * first-party catalog module. Legacy `envUrlKeys` remain documented for
 * deployment compatibility, but they must never override that origin.
 * `stripeAddonEnvKeys` are ordered lists — the first non-empty
 * `process.env` value wins. Aliases (e.g. `BF_OS_URL` after the
 * `bf-os → brandforgeos` rename) live at the tail so legacy secrets keep
 * working until ops swaps them in the dashboard.
 */

export type ModuleCategory = 'ops' | 'support' | 'ai';
export type ModulePlanTier = 'starter' | 'pro' | 'elite';
export type ModuleStatus = 'live' | 'coming_soon' | 'beta';
export type ModuleCommercialType = 'core' | 'free' | 'addon';
export type ModuleApplicationType = 'main-module' | 'companion-application';

/**
 * Task #114: OperatorOS "platform components" are the top-level grouping
 * layer above modules. There are exactly four, all under the single
 * OperatorOS brand. `command-center` is reserved for future internal
 * surfaces and has no live modules assigned yet.
 *
 * The DB component slug is `command-center`; this is intentionally the
 * same identifier already used by the tenant nav id + TenantCommandCenterPage.
 * Keep the distinction clear in code between `platformComponentSlug`
 * (this catalog), `activeNavId` (web sidebar), and `moduleSlug`.
 */
export type PlatformComponentSlug =
  | 'command-center'
  | 'operations-deck'
  | 'diagnostic-lab'
  | 'growth-forge';

export interface ModuleCatalogEntry {
  slug: string;
  name: string;
  description: string;
  category: ModuleCategory;
  /** Canonical billing/access classification for this ecosystem module. */
  commercialType: ModuleCommercialType;
  /** Public product hierarchy beneath the OperatorOS parent platform. */
  applicationType: ModuleApplicationType;
  /** Exact immutable HTTPS production origin for SSO and module launch. */
  canonicalBaseUrl: string;
  /** Redirect-only historical origins. Never valid SSO callbacks or cookie authorities. */
  legacyBaseUrls?: readonly string[];
  /** @deprecated URL env vars cannot override `canonicalBaseUrl`. */
  envUrlKeys: string[];
  stripeAddonEnvKeys: string[];
  planMin: ModulePlanTier;
  ord: number;
  /** Internal MVP shell available at `/apps/<slug>` even without an env URL. */
  internal: boolean;
  defaultStatus: ModuleStatus;
  /**
   * Task #114: the platform component this module belongs to. This — not
   * the legacy `category` field — is the source of truth for grouping
   * modules under platform components. Optional so future modules can be
   * added before being assigned a component.
   */
  component?: PlatformComponentSlug;
}

export interface PlatformComponentCatalogEntry {
  slug: PlatformComponentSlug;
  name: string;
  description: string;
  audience: string;
  ord: number;
}

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  {
    slug: 'tradeflowkit',
    name: 'TradeFlowKit',
    description: 'Quote-to-payment revenue and business operations control',
    category: 'ops',
    commercialType: 'core',
    applicationType: 'main-module',
    canonicalBaseUrl: 'https://tradeflowkit.operatoros.net',
    planMin: 'starter',
    ord: 1,
    envUrlKeys: ['TRADEFLOWKIT_URL'],
    stripeAddonEnvKeys: [],
    internal: false,
    defaultStatus: 'live',
    component: 'operations-deck',
  },
  {
    slug: 'pulsedesk',
    name: 'PulseDesk',
    description: 'Healthcare operations coordination and department escalation',
    category: 'support',
    commercialType: 'core',
    applicationType: 'main-module',
    canonicalBaseUrl: 'https://pulsedesk.operatoros.net',
    planMin: 'pro',
    ord: 2,
    envUrlKeys: ['PULSEDESK_URL'],
    stripeAddonEnvKeys: [],
    internal: false,
    defaultStatus: 'live',
    component: 'operations-deck',
  },
  {
    slug: 'techdeck',
    name: 'TechDeck',
    description: 'Engineer-first IT and MSP operations console',
    category: 'ops',
    commercialType: 'core',
    applicationType: 'main-module',
    canonicalBaseUrl: 'https://techdeck.operatoros.net',
    planMin: 'starter',
    ord: 3,
    envUrlKeys: ['TECHDECK_URL'],
    stripeAddonEnvKeys: [],
    internal: false,
    defaultStatus: 'live',
    component: 'diagnostic-lab',
  },
  {
    slug: 'torqueshed',
    name: 'TorqueShed',
    description: 'Automotive diagnostics, repair workflow, and proof-of-knowledge community',
    category: 'ops',
    commercialType: 'free',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://torqueshed.operatoros.net',
    planMin: 'starter',
    ord: 10,
    envUrlKeys: ['TORQUESHED_URL'],
    stripeAddonEnvKeys: [],
    internal: false,
    defaultStatus: 'live',
    component: 'diagnostic-lab',
  },
  {
    slug: 'faultlinelab',
    name: 'FaultlineLab',
    description: 'Cross-discipline diagnostic challenges and proof-of-skill labs',
    category: 'support',
    commercialType: 'free',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://faultlinelab.operatoros.net',
    // Task #139: free with any account — lowered from `pro` to `starter`
    // so it is no longer gated behind a higher plan tier.
    planMin: 'starter',
    ord: 11,
    envUrlKeys: ['FAULTLINELAB_URL'],
    stripeAddonEnvKeys: [],
    internal: false,
    defaultStatus: 'live',
    component: 'diagnostic-lab',
  },
  {
    slug: 'ninja-pool-hall',
    name: 'Operator Pool Hall',
    description: 'Operator-themed digital pool hall with deterministic 8-ball, practice, CPU, local, and protected online play',
    category: 'support',
    commercialType: 'free',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://operatorpoolhall.operatoros.net',
    legacyBaseUrls: ['https://ninja-pool-hall.operatoros.net'],
    planMin: 'starter',
    ord: 12,
    envUrlKeys: ['OPERATOR_POOL_HALL_URL', 'NINJA_POOL_HALL_URL'],
    stripeAddonEnvKeys: [],
    // The stable slug and legacy URL env alias remain for persisted records,
    // entitlements, and deployment compatibility. Public launch authority is
    // the Operator Pool Hall canonical origin above.
    internal: false,
    defaultStatus: 'live',
    component: 'operations-deck',
  },
  {
    // Renamed from `bf-os` in Task #66. BF_OS_URL / STRIPE_PRICE_ADDON_BF_OS
    // remain as fallbacks so live secrets keep working pre-cutover.
    slug: 'brandforgeos',
    name: 'BrandForgeOS',
    description: 'Brand assets, campaigns, positioning, and marketing workflow command center',
    category: 'ops',
    commercialType: 'addon',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://brandforgeos.operatoros.net',
    planMin: 'pro',
    ord: 13,
    envUrlKeys: ['BRANDFORGEOS_URL', 'BF_OS_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_BRANDFORGEOS', 'STRIPE_PRICE_ADDON_BF_OS'],
    internal: false,
    defaultStatus: 'live',
    component: 'growth-forge',
  },
  {
    slug: 'snapproofos',
    name: 'SnapProofOS',
    description: 'Photo-based proof of work',
    category: 'ops',
    commercialType: 'addon',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://snapproofos.operatoros.net',
    planMin: 'elite',
    ord: 14,
    envUrlKeys: ['SNAPPROOFOS_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_SNAPPROOFOS'],
    internal: false,
    defaultStatus: 'live',
    component: 'operations-deck',
  },
  {
    slug: 'studyforge-ai',
    name: 'StudyForge AI',
    description: 'AI study & training partner',
    category: 'ai',
    commercialType: 'addon',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://studyforge-ai.operatoros.net',
    planMin: 'elite',
    ord: 15,
    envUrlKeys: ['STUDYFORGE_AI_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_STUDYFORGE_AI'],
    internal: true,
    defaultStatus: 'live',
    component: 'diagnostic-lab',
  },
  {
    slug: 'ninja-launch-kit',
    name: 'Deploy Ops',
    description: 'Release readiness, promotion evidence, approval gates, and rollback planning',
    category: 'ai',
    commercialType: 'addon',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://deployops.operatoros.net',
    legacyBaseUrls: ['https://ninjalaunchkit.operatoros.net'],
    planMin: 'elite',
    ord: 16,
    envUrlKeys: ['DEPLOY_OPS_URL', 'NINJA_LAUNCH_KIT_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_NINJA_LAUNCH_KIT'],
    internal: true,
    defaultStatus: 'live',
    component: 'growth-forge',
  },
  {
    slug: 'callcommand-ai',
    name: 'CallCommand AI',
    description: 'Secure MSP phone intake, ticket orchestration, and policy-gated automation',
    category: 'ai',
    commercialType: 'addon',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://callcommand-ai.operatoros.net',
    planMin: 'elite',
    ord: 17,
    envUrlKeys: ['CALLCOMMAND_AI_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_CALLCOMMAND_AI'],
    internal: true,
    defaultStatus: 'live',
    component: 'operations-deck',
  },
  {
    slug: 'ninjamation',
    name: 'Script Ops',
    description: 'Reviewed infrastructure and endpoint automation scripts with governed AI drafting',
    category: 'ai',
    commercialType: 'addon',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://scriptops.operatoros.net',
    legacyBaseUrls: ['https://ninjamation.operatoros.net'],
    planMin: 'elite',
    ord: 18,
    envUrlKeys: ['SCRIPT_OPS_URL', 'NINJAMATION_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_NINJAMATION'],
    internal: true,
    defaultStatus: 'live',
    component: 'growth-forge',
  },
  {
    slug: 'outcall',
    name: 'OutCall',
    description: 'Discreet exit-assistance and personal-safety calling',
    category: 'support',
    commercialType: 'addon',
    applicationType: 'companion-application',
    canonicalBaseUrl: 'https://outcall.operatoros.net',
    planMin: 'starter',
    ord: 19,
    envUrlKeys: ['OUTCALL_URL'],
    stripeAddonEnvKeys: ['STRIPE_PRICE_ADDON_OUTCALL'],
    internal: false,
    // Phase 37: source recovery and a real provider lifecycle are hard
    // activation gates. The existing reconstructed workload stays in the
    // tree for evidence, but it must not be sold or launched as source parity.
    defaultStatus: 'coming_soon',
    component: 'operations-deck',
  },
] as const;

export const MODULE_CATALOG_BY_SLUG: Readonly<Record<string, ModuleCatalogEntry>> = Object.freeze(
  Object.fromEntries(MODULE_CATALOG.map((m) => [m.slug, m])),
);

/** Return the immutable production origin for a first-party catalog slug. */
export function getCanonicalModuleBaseUrl(slug: string): string | undefined {
  return MODULE_CATALOG_BY_SLUG[slug]?.canonicalBaseUrl;
}

/**
 * Validate an attempted base-URL mutation. Custom/admin-created slugs have no
 * canonical URL and keep the caller's existing HTTP(S) validation policy.
 */
export function getCanonicalModuleBaseUrlMismatch(
  slug: string,
  candidate: unknown,
): { canonicalBaseUrl: string; receivedBaseUrl: unknown } | null {
  const canonicalBaseUrl = getCanonicalModuleBaseUrl(slug);
  if (!canonicalBaseUrl || candidate === undefined || candidate === canonicalBaseUrl) return null;
  return { canonicalBaseUrl, receivedBaseUrl: candidate };
}

/** Fail-closed commercial boundary used by add-on billing surfaces. */
export function isAddonModuleSlug(slug: string): boolean {
  return MODULE_CATALOG_BY_SLUG[slug]?.commercialType === 'addon';
}

// ---------------------------------------------------------------------------
// Platform component catalog (Task #114) — the top-level grouping layer
// above modules. Exactly four components under the single OperatorOS
// brand. This is the source of truth for grouping; `modules.component_id`
// is back-filled from these slugs via the module `component` field above.
// `command-center` is reserved for future internal surfaces and has no
// live modules assigned yet.
// ---------------------------------------------------------------------------

export const PLATFORM_COMPONENTS: readonly PlatformComponentCatalogEntry[] = [
  {
    slug: 'command-center',
    name: 'Command Center',
    ord: 10,
    description:
      'Central OperatorOS control surface for daily overview, modules, ' +
      'billing, tenants, entitlements, SSO launch, and command history.',
    audience: 'Operators, admins, teams, builders, and business owners.',
  },
  {
    slug: 'operations-deck',
    name: 'Operations Deck',
    ord: 20,
    description:
      'Daily business operations, service workflows, coordination, calls, ' +
      'proof of work, customer flow, and job execution.',
    audience: 'Small businesses, service companies, clinics, contractors, and teams.',
  },
  {
    slug: 'diagnostic-lab',
    name: 'Diagnostic Lab',
    ord: 30,
    description:
      'Technical diagnostics, troubleshooting, repair intelligence, scripts, ' +
      'cases, training, and problem-solving workflows.',
    audience: 'IT professionals, MSPs, mechanics, technicians, troubleshooters, and learners.',
  },
  {
    slug: 'growth-forge',
    name: 'Growth Forge',
    ord: 40,
    description:
      'Brand building, launches, content, campaigns, offers, automation, ' +
      'and monetizable asset creation.',
    audience: 'Creators, founders, freelancers, agencies, and side-hustle builders.',
  },
] as const;

export const PLATFORM_COMPONENTS_BY_SLUG: Readonly<Record<string, PlatformComponentCatalogEntry>> =
  Object.freeze(Object.fromEntries(PLATFORM_COMPONENTS.map((c) => [c.slug, c])));

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
export const PLAN_TIER_RANK: Readonly<Record<ModulePlanTier, number>> = Object.freeze({
  starter: 1,
  pro: 2,
  elite: 3,
});

/** Modules included in a plan (plan tier ≥ module.planMin). */
export function modulesIncludedInPlan(planSlug: string): ModuleCatalogEntry[] {
  const r = PLAN_TIER_RANK[planSlug as ModulePlanTier] ?? 0;
  if (!r) return [];
  return MODULE_CATALOG.filter((m) => PLAN_TIER_RANK[m.planMin] <= r);
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
    slug: 'starter',
    name: 'Starter',
    description: 'For individuals getting started',
    monthlyPriceCents: 4900,
    annualPriceCents: 49000,
    highlight: false,
    stripeMonthlyEnvKeys: ['STRIPE_PRICE_STARTER_MONTHLY', 'STRIPE_PRICE_STARTER'],
    stripeAnnualEnvKeys: ['STRIPE_PRICE_STARTER_ANNUAL'],
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'For growing teams and power users',
    monthlyPriceCents: 14900,
    annualPriceCents: 149000,
    highlight: true,
    stripeMonthlyEnvKeys: ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO'],
    stripeAnnualEnvKeys: ['STRIPE_PRICE_PRO_ANNUAL'],
  },
  {
    slug: 'elite',
    name: 'Elite',
    description: 'For enterprises and large teams',
    monthlyPriceCents: 29900,
    annualPriceCents: 299000,
    highlight: false,
    stripeMonthlyEnvKeys: ['STRIPE_PRICE_ELITE_MONTHLY', 'STRIPE_PRICE_ELITE'],
    stripeAnnualEnvKeys: ['STRIPE_PRICE_ELITE_ANNUAL'],
  },
] as const;

export const PLAN_CATALOG_BY_SLUG: Readonly<Record<string, PlanCatalogEntry>> = Object.freeze(
  Object.fromEntries(PLAN_CATALOG.map((p) => [p.slug, p])),
);
