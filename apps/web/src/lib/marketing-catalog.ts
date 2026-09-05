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
  getModuleProductValue,
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
  /** First useful result shown as the card's concrete operator value. */
  solves: string;
  /** Optional curated public media asset for card thumbnails. */
  imageSrc?: string;
  /** Default public-facing status — overlaid with entitlement data when signed in. */
  status: MarketingStatus;
  /** Source-of-truth entry for plan tier / ord. */
  source: MarketingCatalogSource;
}

export const PACKAGE_LABELS: Record<MarketingPackageType, string> = {
  core: 'Flagship Business Applications',
  included: 'Included Applications',
  companion: 'Business Add-ons',
};

export const PACKAGE_DESCRIPTIONS: Record<MarketingPackageType, string> = {
  core: 'Choose from three complete business applications that share one sign-in and home base.',
  included:
    'Useful applications included with every OperatorOS account — no paid subscription required.',
  companion:
    'Specialized business applications that share one sign-in, team access, plan, and billing experience.',
};

function packageFor(entry: MarketingCatalogSource): MarketingPackageType {
  if (entry.applicationType === 'main-module') return 'core';
  return entry.commercialType === 'free' ? 'included' : 'companion';
}

function applicationLabel(entry: MarketingCatalogSource): string {
  return entry.applicationType === 'main-module' ? 'Flagship Application' : 'Specialized Application';
}

function accessLabel(commercialType: ModuleCommercialType): string {
  if (commercialType === 'free') return 'Included with account';
  if (commercialType === 'addon') return 'Available as an add-on';
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
    const productValue = getModuleProductValue(entry.slug);
    if (!productValue) {
      throw new Error(`Missing customer product-value contract for ${entry.slug}`);
    }
    return {
      slug: entry.slug,
      name: entry.name,
      packageType,
      packageLabel: applicationLabel(entry),
      accessLabel: accessLabel(entry.commercialType),
      applicationType: entry.applicationType,
      outcome: productValue.promise,
      audience: productValue.buyer,
      solves: productValue.firstUsefulResult,
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
