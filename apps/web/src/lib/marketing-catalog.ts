/**
 * Marketing-side module catalog.
 *
 * A public-safe mirror of the 11-module Shotgun Ninjas ecosystem used
 * by Phase 2 marketing surfaces (homepage orbit, gateway grid,
 * /modules page, /how-it-works page). Mirrors the slug/name/plan/ord
 * from `packages/sdk/src/catalog.ts` and adds the outcome-led
 * one-sentence copy plus the four-label status mapping.
 *
 * Inlined intentionally — the SDK uses explicit `.js` extensions on
 * its ESM imports for Node's bundler resolver, which Next/webpack
 * cannot resolve from a `.ts` source. If a module is added or
 * renamed in `packages/sdk/src/catalog.ts`, mirror it here too.
 *
 * Colors come from `brand.ts` only — no raw hex/rgba literals live
 * here, which keeps token discipline consistent with Phase 1.
 */

import { brand } from './brand';

export type ModulePlanTier = 'starter' | 'pro' | 'elite';
export type ModuleDefaultStatus = 'live' | 'beta' | 'coming_soon';

export interface MarketingCatalogSource {
  slug: string;
  name: string;
  description: string;
  planMin: ModulePlanTier;
  ord: number;
  defaultStatus: ModuleDefaultStatus;
}

const SOURCE: readonly MarketingCatalogSource[] = [
  { slug: 'tradeflowkit',     name: 'TradeFlowKit',     description: 'Job tracker for trade & service businesses', planMin: 'starter', ord: 1,  defaultStatus: 'live' },
  { slug: 'torqueshed',       name: 'TorqueShed',       description: 'Mechanic shop dashboard & invoicing',        planMin: 'starter', ord: 2,  defaultStatus: 'live' },
  { slug: 'techdeck',         name: 'TechDeck',         description: 'Onsite tech command center',                 planMin: 'starter', ord: 3,  defaultStatus: 'live' },
  { slug: 'pulsedesk',        name: 'PulseDesk',        description: 'Lightweight ticketing for small teams',      planMin: 'pro',     ord: 4,  defaultStatus: 'live' },
  { slug: 'faultlinelab',     name: 'FaultlineLab',     description: 'Diagnostic + RCA workflow',                  planMin: 'pro',     ord: 5,  defaultStatus: 'live' },
  { slug: 'brandforgeos',     name: 'BrandForgeOS',     description: 'Body shop / collision OS',                   planMin: 'pro',     ord: 6,  defaultStatus: 'live' },
  { slug: 'snapproofos',      name: 'SnapProofOS',      description: 'Photo-based proof of work',                  planMin: 'elite',   ord: 7,  defaultStatus: 'live' },
  { slug: 'studyforge-ai',    name: 'StudyForge AI',    description: 'AI study & training partner',                planMin: 'elite',   ord: 8,  defaultStatus: 'live' },
  { slug: 'ninja-launch-kit', name: 'Ninja Launch Kit', description: 'Build & ship internal tools fast',           planMin: 'elite',   ord: 9,  defaultStatus: 'live' },
  { slug: 'callcommand-ai',   name: 'CallCommand AI',   description: 'AI phone agent + call automation',           planMin: 'elite',   ord: 10, defaultStatus: 'live' },
  { slug: 'ninjamation',      name: 'Ninjamation',      description: 'Cross-app workflow automation',              planMin: 'elite',   ord: 11, defaultStatus: 'live' },
];

export type MarketingStatus = 'Available' | 'Coming Soon' | 'Beta' | 'Locked';

export interface MarketingModule {
  slug: string;
  name: string;
  /** One-sentence outcome (not feature). */
  outcome: string;
  /** Default public-facing status — overlaid with entitlement data when signed in. */
  status: MarketingStatus;
  /** Source-of-truth entry for plan tier / ord. */
  source: MarketingCatalogSource;
}

const OUTCOMES: Record<string, string> = {
  'tradeflowkit':     'Run every job, quote, and tech from one screen.',
  'torqueshed':       'Move cars through the shop without losing an invoice.',
  'techdeck':         'Give onsite techs a command center in their pocket.',
  'pulsedesk':        'Resolve tickets faster with a lean shared inbox.',
  'faultlinelab':     'Diagnose, document, and learn from every fault.',
  'brandforgeos':     'Run the body shop floor end-to-end with one OS.',
  'snapproofos':      'Prove the work was done with one tap of the camera.',
  'studyforge-ai':    'Turn any document into a personal training plan.',
  'ninja-launch-kit': 'Stand up internal tools in hours, not sprints.',
  'callcommand-ai':   'Let an AI agent handle the calls you cannot.',
  'ninjamation':      'Connect your apps and let the workflows run themselves.',
};

function statusFor(entry: MarketingCatalogSource): MarketingStatus {
  switch (entry.defaultStatus) {
    case 'live':        return 'Available';
    case 'beta':        return 'Beta';
    case 'coming_soon': return 'Coming Soon';
    default:            return 'Coming Soon';
  }
}

export const MARKETING_MODULES: readonly MarketingModule[] = SOURCE
  .slice()
  .sort((a, b) => a.ord - b.ord)
  .map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    outcome: OUTCOMES[entry.slug] ?? entry.description,
    status: statusFor(entry),
    source: entry,
  }));

/**
 * Overlay live entitlement state onto the static marketing catalog.
 *
 * `entitledSlugs` is a Set of module slugs the signed-in viewer has
 * actual access to (sourced from `modulesApi.list()` at the
 * AuthProvider boundary — see `useEntitlements()`). When the viewer
 * is signed in but the module is not in the set, the badge flips to
 * `'Locked'` so the CTA helper routes them to `/pricing` instead of
 * `/app`. Anonymous viewers (entitledSlugs === null) see the static
 * defaults.
 */
export function applyEntitlements(
  modules: readonly MarketingModule[],
  entitledSlugs: ReadonlySet<string> | null,
): MarketingModule[] {
  if (!entitledSlugs) return modules.slice();
  return modules.map((m) => {
    if (m.status === 'Coming Soon' || m.status === 'Beta') return m;
    if (entitledSlugs.has(m.slug)) return { ...m, status: 'Available' as const };
    return { ...m, status: 'Locked' as const };
  });
}

export interface StatusBadgePalette {
  text: string;
  bg: string;
  border: string;
}

export function statusBadgeColor(status: MarketingStatus): StatusBadgePalette {
  switch (status) {
    case 'Available':
      return { text: brand.statusAvailableText, bg: brand.statusAvailableBg, border: brand.statusAvailableBorder };
    case 'Beta':
      return { text: brand.statusBetaText,      bg: brand.statusBetaBg,      border: brand.statusBetaBorder };
    case 'Coming Soon':
      return { text: brand.statusComingSoonText, bg: brand.statusComingSoonBg, border: brand.statusComingSoonBorder };
    case 'Locked':
      return { text: brand.statusLockedText,    bg: brand.statusLockedBg,    border: brand.statusLockedBorder };
  }
}
