/**
 * Marketing-side module catalog.
 *
 * Public marketing projection of the canonical OperatorOS module ecosystem used
 * by Phase 2 marketing surfaces (homepage orbit, gateway grid,
 * /modules page, /how-it-works page). Identity, hierarchy, lifecycle, and order
 * come directly from `@operatoros/sdk`; this file adds outcome-led
 * one-sentence copy plus the four-label status mapping.
 *
 * Colors come from `brand.ts` only — no raw hex/rgba literals live
 * here, which keeps token discipline consistent with Phase 1.
 */

import { brand } from './brand';
import {
  MODULE_CATALOG,
  type ModuleApplicationType,
  type ModuleCatalogEntry,
  type ModuleCommercialType,
} from '@operatoros/sdk';

export type MarketingPackageType = 'core' | 'included' | 'companion';

export type MarketingCatalogSource = Pick<
  ModuleCatalogEntry,
  | 'slug'
  | 'name'
  | 'description'
  | 'planMin'
  | 'ord'
  | 'defaultStatus'
  | 'applicationType'
  | 'commercialType'
>;

const SOURCE: readonly MarketingCatalogSource[] = MODULE_CATALOG;

export type MarketingStatus = 'Available' | 'Coming Soon' | 'Beta' | 'Locked';

export interface MarketingModule {
  slug: string;
  name: string;
  /** Current OperatorOS product-packaging lane. */
  packageType: MarketingPackageType;
  /** Public packaging label used on marketing cards. */
  packageLabel: string;
  /** Commercial access note, independent from the product hierarchy. */
  accessLabel: string;
  applicationType: ModuleApplicationType;
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
  tradeflowkit:
    'Turn a new lead into a scheduled job, approved quote, invoice, and recorded payment.',
  torqueshed:
    'Keep each vehicle’s service history, repair evidence, reminders, and diagnostic work together.',
  techdeck:
    'Triage tickets while keeping client systems, procedures, evidence, and technician time connected.',
  pulsedesk:
    'Route facility and department requests without losing ownership, deadlines, or escalation history.',
  faultlinelab:
    'Practice difficult troubleshooting scenarios and keep a clear evidence trail for every attempt.',
  'ninja-pool-hall':
    'Play deterministic 8-ball in practice, CPU, local hot-seat, or protected online rooms.',
  brandforgeos: 'Build campaigns, review brand assets, and keep approved creative work organized.',
  snapproofos: 'Capture dated proof of work before a customer, auditor, or teammate asks for it.',
  'studyforge-ai':
    'Turn team knowledge into guided study sessions that can be reused and reviewed.',
  'ninja-launch-kit':
    'Coordinate release gates, approvals, promotion evidence, rollback plans, and audited exports.',
  'callcommand-ai':
    'Handle repetitive phone work with reviewed scripts, routing, and call history.',
  ninjamation:
    'Create, review, approve, and download repeatable infrastructure and endpoint automation scripts.',
  outcall:
    'Schedule a discreet safety call with a clear fallback plan and trusted contact details.',
};

const AUDIENCES: Record<string, string> = {
  tradeflowkit: 'Service businesses and operators',
  torqueshed: 'Mechanics and repair shops',
  techdeck: 'MSP teams and field technicians',
  pulsedesk: 'Healthcare operations teams',
  faultlinelab: 'Troubleshooters and technical leads',
  'ninja-pool-hall': 'Pool players and friendly rivals',
  brandforgeos: 'Founders, marketers, and creators',
  snapproofos: 'Teams that need proof and verification',
  'studyforge-ai': 'Training teams and operators',
  'ninja-launch-kit': 'Operators shipping applications and services',
  'callcommand-ai': 'Teams with high-volume calls',
  ninjamation: 'IT operators building repeatable PC automation',
  outcall: 'People who want discreet personal-safety support',
};

const SOLVES: Record<string, string> = {
  tradeflowkit: 'Revenue work scattered across quotes, invoices, and status updates.',
  torqueshed: 'Repair knowledge trapped in conversations and disconnected tickets.',
  techdeck: 'Technicians jumping between notes, scripts, tickets, and tools.',
  pulsedesk: 'Escalations and handoffs disappearing between busy departments.',
  faultlinelab: 'Root-cause analysis that never becomes reusable knowledge.',
  'ninja-pool-hall':
    'Browser pool games that fake gameplay or lose the table when a connection drops.',
  brandforgeos: 'Campaign assets and positioning spread across disconnected docs.',
  snapproofos: 'Missing evidence when customers, auditors, or teams ask what happened.',
  'studyforge-ai': 'Training material that is hard to reuse, test, or operationalize.',
  'ninja-launch-kit':
    'Release decisions scattered across checklists, evidence, approvals, and rollback notes.',
  'callcommand-ai': 'Missed calls and repetitive phone workflows draining operator time.',
  ninjamation: 'Unreviewed one-off scripts with no version, approval, or download trail.',
  outcall: 'Awkward or unsafe situations where a planned check-in can help someone leave.',
};

export const PACKAGE_LABELS: Record<MarketingPackageType, string> = {
  core: 'Main Modules',
  included: 'Included Companion Applications',
  companion: 'Add-on Companion Applications',
};

export const PACKAGE_DESCRIPTIONS: Record<MarketingPackageType, string> = {
  core: 'The three flagship products beneath OperatorOS, with deeper workflows and stronger visual priority.',
  included:
    'Active companion applications included with any OperatorOS account — no paid main module required.',
  companion:
    'Specialized companion applications governed by the same OperatorOS identity, tenant, billing, and entitlement authority.',
};

function packageFor(entry: MarketingCatalogSource): MarketingPackageType {
  if (entry.applicationType === 'main-module') return 'core';
  return entry.commercialType === 'free' ? 'included' : 'companion';
}

function applicationLabel(entry: MarketingCatalogSource): string {
  return entry.applicationType === 'main-module' ? 'Main Module' : 'Companion Application';
}

function accessLabel(commercialType: ModuleCommercialType): string {
  if (commercialType === 'free') return 'Included with account';
  if (commercialType === 'addon') return 'Entitlement-controlled add-on';
  return 'Flagship product';
}

const IMAGE_SRC: Record<string, string> = {
  tradeflowkit: '/media/operatoros/module-tradeflowkit.png',
  torqueshed: '/media/operatoros/module-torqueshed.png',
  techdeck: '/media/operatoros/module-techdeck.png',
  pulsedesk: '/media/operatoros/module-pulsedesk.png',
  faultlinelab: '/media/operatoros/module-faultlinelab.png',
  'ninja-pool-hall': '/media/operatoros/module-operator-pool-hall.png',
  brandforgeos: '/media/operatoros/module-brandforgeos.png',
  snapproofos: '/media/operatoros/module-snapproofos.png',
  'studyforge-ai': '/media/operatoros/module-studyforge-ai.png',
  'ninja-launch-kit': '/media/operatoros/module-deploy-ops.png',
  'callcommand-ai': '/media/operatoros/module-callcommand-ai.png',
  ninjamation: '/media/operatoros/module-script-ops.png',
};

function statusFor(entry: Pick<MarketingCatalogSource, 'defaultStatus'>): MarketingStatus {
  switch (entry.defaultStatus) {
    case 'live':
      return 'Available';
    case 'beta':
      return 'Beta';
    case 'coming_soon':
      return 'Coming Soon';
    default:
      return 'Coming Soon';
  }
}

export const MARKETING_MODULES: readonly MarketingModule[] = SOURCE.slice()
  .sort((a, b) => a.ord - b.ord)
  .map((entry) => {
    const packageType = packageFor(entry);
    return {
      slug: entry.slug,
      name: entry.name,
      packageType,
      packageLabel: applicationLabel(entry),
      accessLabel: accessLabel(entry.commercialType),
      applicationType: entry.applicationType,
      outcome: OUTCOMES[entry.slug] ?? entry.description,
      audience: AUDIENCES[entry.slug] ?? 'Operations teams',
      solves: SOLVES[entry.slug] ?? entry.description,
      imageSrc: IMAGE_SRC[entry.slug],
      status: statusFor(entry),
      source: entry,
    };
  });

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
      return {
        text: brand.statusAvailableText,
        bg: brand.statusAvailableBg,
        border: brand.statusAvailableBorder,
      };
    case 'Beta':
      return { text: brand.statusBetaText, bg: brand.statusBetaBg, border: brand.statusBetaBorder };
    case 'Coming Soon':
      return {
        text: brand.statusComingSoonText,
        bg: brand.statusComingSoonBg,
        border: brand.statusComingSoonBorder,
      };
    case 'Locked':
      return {
        text: brand.statusLockedText,
        bg: brand.statusLockedBg,
        border: brand.statusLockedBorder,
      };
  }
}
