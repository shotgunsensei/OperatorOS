/**
 * Marketing-side module catalog.
 *
 * A public-safe mirror of the Shotgun Ninjas module ecosystem used
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
export type MarketingPackageType = 'core' | 'included' | 'companion';

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
  { slug: 'pulsedesk',        name: 'PulseDesk',        description: 'Healthcare operations coordination',         planMin: 'pro',     ord: 4,  defaultStatus: 'live' },
  { slug: 'faultlinelab',     name: 'FaultlineLab',     description: 'Diagnostic + RCA workflow',                  planMin: 'pro',     ord: 5,  defaultStatus: 'live' },
  { slug: 'ninja-pool-hall',  name: 'Ninja Pool Hall',  description: 'Companion engagement experience',            planMin: 'starter', ord: 6,  defaultStatus: 'coming_soon' },
  { slug: 'brandforgeos',     name: 'BrandForgeOS',     description: 'Brand and marketing command system',         planMin: 'pro',     ord: 7,  defaultStatus: 'live' },
  { slug: 'snapproofos',      name: 'SnapProofOS',      description: 'Photo-based proof of work',                  planMin: 'elite',   ord: 8,  defaultStatus: 'live' },
  { slug: 'studyforge-ai',    name: 'StudyForge AI',    description: 'AI study & training partner',                planMin: 'elite',   ord: 9,  defaultStatus: 'live' },
  { slug: 'ninja-launch-kit', name: 'Ninja Launch Kit', description: 'Build & ship internal tools fast',           planMin: 'elite',   ord: 10, defaultStatus: 'live' },
  { slug: 'callcommand-ai',   name: 'CallCommand AI',   description: 'AI phone agent + call automation',           planMin: 'elite',   ord: 11, defaultStatus: 'live' },
  { slug: 'ninjamation',      name: 'Ninjamation',      description: 'Cross-app workflow automation',              planMin: 'elite',   ord: 12, defaultStatus: 'live' },
];

export type MarketingStatus = 'Available' | 'Coming Soon' | 'Beta' | 'Locked';

export interface MarketingModule {
  slug: string;
  name: string;
  /** Current OperatorOS product-packaging lane. */
  packageType: MarketingPackageType;
  /** Public packaging label used on marketing cards. */
  packageLabel: string;
  /** One-sentence outcome (not feature). */
  outcome: string;
  /** Primary user or buyer the module is built for. */
  audience: string;
  /** Plain-language problem the module solves. */
  solves: string;
  /** Optional curated public media asset for card thumbnails. */
  imageSrc?: string;
  /** Default public-facing status — overlaid with entitlement data when signed in. */
  status: MarketingStatus;
  /** Source-of-truth entry for plan tier / ord. */
  source: MarketingCatalogSource;
}

const OUTCOMES: Record<string, string> = {
  'tradeflowkit':     'Run quotes, jobs, invoices, and payments from one operating lane.',
  'torqueshed':       'Move vehicles through diagnostics, repair, proof, and closeout.',
  'techdeck':         'Give technicians a dense MSP command surface for daily work.',
  'pulsedesk':        'Coordinate clinical and support workflows without losing escalations.',
  'faultlinelab':     'Turn hard failures into documented diagnostic evidence trails.',
  'ninja-pool-hall':  'Give the organization an included companion engagement experience.',
  'brandforgeos':     'Plan, generate, and ship brand assets from one creative console.',
  'snapproofos':      'Capture proof, screenshots, and work evidence before trust breaks.',
  'studyforge-ai':    'Turn operational knowledge into repeatable training sessions.',
  'ninja-launch-kit': 'Stand up launch assets and internal tools without rebuilding the stack.',
  'callcommand-ai':   'Route phone work through an AI-assisted call operations layer.',
  'ninjamation':      'Connect modules and automate cross-app handoffs.',
};

const AUDIENCES: Record<string, string> = {
  'tradeflowkit':     'Service businesses and operators',
  'torqueshed':       'Mechanics and repair shops',
  'techdeck':         'MSP teams and field technicians',
  'pulsedesk':        'Healthcare operations teams',
  'faultlinelab':     'Troubleshooters and technical leads',
  'ninja-pool-hall':  'Operator teams and communities',
  'brandforgeos':     'Founders, marketers, and creators',
  'snapproofos':      'Teams that need proof and verification',
  'studyforge-ai':    'Training teams and operators',
  'ninja-launch-kit': 'Operators shipping internal tools',
  'callcommand-ai':   'Teams with high-volume calls',
  'ninjamation':      'Automation-heavy operators',
};

const SOLVES: Record<string, string> = {
  'tradeflowkit':     'Revenue work scattered across quotes, invoices, and status updates.',
  'torqueshed':       'Repair knowledge trapped in conversations and disconnected tickets.',
  'techdeck':         'Technicians jumping between notes, scripts, tickets, and tools.',
  'pulsedesk':        'Escalations and handoffs disappearing between busy departments.',
  'faultlinelab':     'Root-cause analysis that never becomes reusable knowledge.',
  'ninja-pool-hall':  'Teams lacking a lightweight shared engagement space.',
  'brandforgeos':     'Campaign assets and positioning spread across disconnected docs.',
  'snapproofos':      'Missing evidence when customers, auditors, or teams ask what happened.',
  'studyforge-ai':    'Training material that is hard to reuse, test, or operationalize.',
  'ninja-launch-kit': 'Slow setup work before a new product or internal tool can ship.',
  'callcommand-ai':   'Missed calls and repetitive phone workflows draining operator time.',
  'ninjamation':      'Manual handoffs between tools that should already know what changed.',
};

export const PACKAGE_LABELS: Record<MarketingPackageType, string> = {
  core: 'Core Product',
  included: 'Included With Any Core',
  companion: 'Companion Module',
};

export const PACKAGE_DESCRIPTIONS: Record<MarketingPackageType, string> = {
  core: 'Fully unlocked flagship products that anchor the OperatorOS stack.',
  included: 'Utility and diagnostic modules bundled with every paid core product.',
  companion: 'One companion can be selected free; additional companions can be added as paid modules.',
};

const PACKAGE_BY_SLUG: Record<string, MarketingPackageType> = {
  'tradeflowkit': 'core',
  'pulsedesk': 'core',
  'techdeck': 'core',
  'torqueshed': 'included',
  'faultlinelab': 'included',
  'ninja-pool-hall': 'included',
  'snapproofos': 'companion',
  'brandforgeos': 'companion',
  'studyforge-ai': 'companion',
  'ninja-launch-kit': 'companion',
  'callcommand-ai': 'companion',
  'ninjamation': 'companion',
};

const IMAGE_SRC: Record<string, string> = {
  'tradeflowkit': '/media/operatoros/module-tradeflowkit.png',
  'torqueshed': '/media/operatoros/module-torqueshed.png',
  'techdeck': '/media/operatoros/module-techdeck.png',
  'pulsedesk': '/media/operatoros/module-pulsedesk.png',
  'faultlinelab': '/media/operatoros/module-faultlinelab.png',
  'ninja-pool-hall': '/media/operatoros/module-ninja-pool-hall.png',
  'brandforgeos': '/media/operatoros/module-brandforgeos.png',
  'snapproofos': '/media/operatoros/module-snapproofos.png',
  'studyforge-ai': '/media/operatoros/module-studyforge-ai.png',
  'ninja-launch-kit': '/media/operatoros/module-ninja-launch-kit.png',
  'callcommand-ai': '/media/operatoros/module-callcommand-ai.png',
  'ninjamation': '/media/operatoros/module-ninjamation.png',
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
    packageType: PACKAGE_BY_SLUG[entry.slug] ?? 'companion',
    packageLabel: PACKAGE_LABELS[PACKAGE_BY_SLUG[entry.slug] ?? 'companion'],
    outcome: OUTCOMES[entry.slug] ?? entry.description,
    audience: AUDIENCES[entry.slug] ?? 'Operations teams',
    solves: SOLVES[entry.slug] ?? entry.description,
    imageSrc: IMAGE_SRC[entry.slug],
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
