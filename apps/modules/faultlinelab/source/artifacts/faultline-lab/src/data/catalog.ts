export type EntitlementType = 'base' | 'subscription' | 'content-pack' | 'feature-upgrade' | 'bundle' | 'promo';
export type PricingType = 'free' | 'one-time' | 'subscription-monthly' | 'subscription-yearly';
export type ProductStatus = 'available' | 'coming-soon' | 'disabled';
export type ProductSection =
  | 'plan'
  | 'content-pack'
  | 'feature-upgrade'
  | 'bundle'
  | 'specialty';

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  valueProposition?: string;
  category: string;
  section: ProductSection;
  entitlementType: EntitlementType;
  pricingType: PricingType;
  priceAmountCents: number;
  yearlyPriceAmountCents?: number;
  caseCount?: number;
  includedCaseIds?: string[];
  includedFeatures?: string[];
  bundledProductIds?: string[];
  relatedProductIds?: string[];
  tags: string[];
  status: ProductStatus;
  featured?: boolean;
  artworkSlot?: string;
  sortOrder: number;
  stripePriceId?: string;
  stripeYearlyPriceId?: string;
}

/**
 * Cases that are always free, regardless of entitlements. These are the
 * hand-built starter scenarios that ship with every install.
 *
 * Source of truth is the case catalog registry — `isStarter: true` entries.
 * This list is kept in sync at module load and asserted by the catalog
 * validator at startup.
 */
export const FREE_CASE_IDS = [
  'case-windows-ad-001',
  'case-networking-vpn-001',
  'case-automotive-001',
  'case-electronics-001',
];

export const PRO_FEATURES = [
  'cloud-sync',
  'daily-challenge',
  'full-archive',
  'advanced-stats',
  'priority-access',
];

export const FREE_FEATURES = ['standard-tools', 'local-progress', 'guest-mode'];

export const CATALOG: CatalogProduct[] = [
  {
    id: 'base-free',
    name: 'Free Tier',
    slug: 'free',
    shortDescription: 'Get started with 2 starter cases and standard tools.',
    longDescription:
      'Begin your investigation career with access to two hand-crafted diagnostic scenarios, standard terminal tools, and local progress tracking. No account required.',
    category: 'tier',
    section: 'plan',
    entitlementType: 'base',
    pricingType: 'free',
    priceAmountCents: 0,
    includedCaseIds: FREE_CASE_IDS,
    includedFeatures: FREE_FEATURES,
    tags: [],
    status: 'available',
    sortOrder: 0,
  },
  {
    id: 'pro-subscription',
    name: 'Pro Investigator',
    slug: 'pro',
    shortDescription: 'Full access with cloud sync, daily challenges, and advanced analytics.',
    longDescription:
      'Unlock the complete Faultline Lab experience. Cloud-synced progress across devices, daily challenge rotations, full case archive access, advanced investigator statistics, and priority access to new scenario packs as they release.',
    valueProposition: 'Most flexible way to access everything Pro-only. Cancel anytime.',
    category: 'tier',
    section: 'plan',
    entitlementType: 'subscription',
    pricingType: 'subscription-monthly',
    priceAmountCents: 899,
    yearlyPriceAmountCents: 7900,
    includedFeatures: PRO_FEATURES,
    tags: ['popular'],
    status: 'available',
    featured: true,
    sortOrder: 1,
  },

  {
    id: 'pack-network-ops',
    name: 'Network Ops Pack',
    slug: 'network-ops',
    shortDescription: '8 networking and infrastructure diagnostic scenarios.',
    longDescription:
      'Dive into complex networking failures spanning BGP route leaks, recursive DNS poisoning, IPSec MTU black holes, load-balancer sticky-session drift, firewall rule cascades, anycast asymmetry, TCP keepalive storms, and TLS handshake bottlenecks. Every case features realistic captures, command output, and an event timeline.',
    valueProposition: 'Built for network engineers and SREs sharpening packet-level instincts.',
    category: 'content-pack',
    section: 'content-pack',
    entitlementType: 'content-pack',
    pricingType: 'one-time',
    priceAmountCents: 999,
    relatedProductIds: ['upgrade-advanced-tools', 'pro-subscription', 'bundle-master-investigator'],
    tags: ['new', 'available'],
    status: 'available',
    featured: true,
    sortOrder: 10,
  },
  {
    id: 'pack-server-graveyard',
    name: 'Server Graveyard Pack',
    slug: 'server-graveyard',
    shortDescription: '5 server and service failure investigations.',
    longDescription:
      'Investigate critical server failures including runaway processes, disk corruption, memory leaks, certificate expiration chains, and cascading microservice outages.',
    valueProposition: 'Pairs well with Deep Telemetry to spot anomalies before they cascade.',
    category: 'content-pack',
    section: 'content-pack',
    entitlementType: 'content-pack',
    pricingType: 'one-time',
    priceAmountCents: 999,
    relatedProductIds: ['upgrade-deep-telemetry', 'pro-subscription'],
    tags: [],
    status: 'coming-soon',
    sortOrder: 11,
  },
  {
    id: 'pack-garage-diagnostics',
    name: 'Garage Diagnostics Pack',
    slug: 'garage-diagnostics',
    shortDescription: '5 automotive diagnostic puzzles.',
    longDescription:
      'Troubleshoot automotive systems from OBD-II codes to oscilloscope readings. Cases include intermittent misfires, CAN bus interference, hybrid battery degradation, and transmission solenoid failures.',
    valueProposition: 'Great for techs who like hands-on hardware-level diagnostics.',
    category: 'content-pack',
    section: 'content-pack',
    entitlementType: 'content-pack',
    pricingType: 'one-time',
    priceAmountCents: 1299,
    relatedProductIds: ['pack-sensor-mesh', 'upgrade-advanced-tools'],
    tags: [],
    status: 'coming-soon',
    sortOrder: 12,
  },
  {
    id: 'pack-sensor-mesh',
    name: 'Sensor Mesh Pack',
    slug: 'sensor-mesh',
    shortDescription: '5 IoT and embedded systems investigations.',
    longDescription:
      'Debug sensor networks, firmware glitches, and embedded systems failures. Cases span smart building HVAC loops, industrial PLC faults, mesh radio interference, and edge compute anomalies.',
    valueProposition: 'Perfect for embedded engineers and IoT operators.',
    category: 'content-pack',
    section: 'content-pack',
    entitlementType: 'content-pack',
    pricingType: 'one-time',
    priceAmountCents: 899,
    relatedProductIds: ['upgrade-deep-telemetry'],
    tags: [],
    status: 'coming-soon',
    sortOrder: 13,
  },
  {
    id: 'pack-mixed-cascades',
    name: 'Mixed Cascades Pack',
    slug: 'mixed-cascades',
    shortDescription: '5 cross-domain multi-system failure scenarios.',
    longDescription:
      'The most challenging scenarios in Faultline Lab. Each case spans multiple technical domains where failures in one system cascade into another. Requires broad diagnostic skills and lateral thinking.',
    valueProposition: 'For senior investigators who want chaos and complexity.',
    category: 'content-pack',
    section: 'content-pack',
    entitlementType: 'content-pack',
    pricingType: 'one-time',
    priceAmountCents: 1099,
    relatedProductIds: ['upgrade-chaos-mode', 'bundle-master-investigator'],
    tags: ['advanced'],
    status: 'coming-soon',
    sortOrder: 14,
  },
  {
    id: 'pack-healthcare-imaging',
    name: 'Healthcare Imaging Pack',
    slug: 'healthcare-imaging',
    shortDescription: '5 medical imaging system diagnostic cases.',
    longDescription:
      'Investigate failures in medical imaging systems including DICOM routing errors, PACS connectivity issues, modality calibration drift, and HL7 integration breakdowns.',
    valueProposition: 'Specialty pack for clinical IT and biomed engineers.',
    category: 'content-pack',
    section: 'specialty',
    entitlementType: 'content-pack',
    pricingType: 'one-time',
    priceAmountCents: 1499,
    relatedProductIds: ['bundle-clinical-systems', 'upgrade-advanced-tools'],
    tags: ['specialty'],
    status: 'coming-soon',
    sortOrder: 15,
  },

  {
    id: 'upgrade-advanced-tools',
    name: 'Advanced Tool Suite',
    slug: 'advanced-tools',
    shortDescription: 'Unlock Wireshark views, packet analysis, and advanced diagnostic panels.',
    longDescription:
      'Expand your investigation toolkit with advanced diagnostic panels including packet capture analysis, registry deep-dive, service dependency graphs, and real-time metric overlays.',
    valueProposition: 'Unlocks every premium tool tab across all cases — buy once, use forever.',
    category: 'feature-upgrade',
    section: 'feature-upgrade',
    entitlementType: 'feature-upgrade',
    pricingType: 'one-time',
    priceAmountCents: 799,
    includedFeatures: ['wireshark-panel', 'registry-deep-dive', 'service-graph', 'metric-overlay'],
    relatedProductIds: ['pack-network-ops', 'pack-server-graveyard', 'pro-subscription'],
    tags: [],
    status: 'available',
    sortOrder: 20,
  },
  {
    id: 'upgrade-chaos-mode',
    name: 'Chaos Mode',
    slug: 'chaos-mode',
    shortDescription: 'Randomized evidence order, red herring injection, time pressure.',
    longDescription:
      'For seasoned investigators who want more challenge. Chaos Mode randomizes evidence availability, injects additional red herrings, adds time pressure, and reduces hint availability.',
    valueProposition: 'Replay every case with fresh chaos for endless replay value.',
    category: 'feature-upgrade',
    section: 'feature-upgrade',
    entitlementType: 'feature-upgrade',
    pricingType: 'one-time',
    priceAmountCents: 499,
    includedFeatures: ['chaos-mode'],
    relatedProductIds: ['pack-mixed-cascades'],
    tags: [],
    status: 'available',
    sortOrder: 21,
  },
  {
    id: 'upgrade-deep-telemetry',
    name: 'Deep Telemetry Pack',
    slug: 'deep-telemetry',
    shortDescription: 'Detailed performance metrics and investigation analytics.',
    longDescription:
      'Track your diagnostic performance over time with detailed charts, heatmaps of your investigation patterns, efficiency metrics across categories, and comparative analytics against your own history.',
    valueProposition: 'See exactly where you lose points and how to level up.',
    category: 'feature-upgrade',
    section: 'feature-upgrade',
    entitlementType: 'feature-upgrade',
    pricingType: 'one-time',
    priceAmountCents: 699,
    includedFeatures: ['deep-telemetry'],
    relatedProductIds: ['upgrade-pro-analytics', 'pack-server-graveyard'],
    tags: [],
    status: 'available',
    sortOrder: 22,
  },
  {
    id: 'upgrade-sandbox-pro',
    name: 'Sandbox Pro',
    slug: 'sandbox-pro',
    shortDescription: 'Custom sandbox slots for creating your own diagnostic scenarios.',
    longDescription:
      'Build and share your own troubleshooting scenarios with Sandbox Pro. Create custom cases with your own terminal commands, event logs, and evidence chains.',
    valueProposition: 'Author your own cases for training your team.',
    category: 'feature-upgrade',
    section: 'feature-upgrade',
    entitlementType: 'feature-upgrade',
    pricingType: 'one-time',
    priceAmountCents: 999,
    includedFeatures: ['sandbox-pro'],
    relatedProductIds: ['upgrade-advanced-tools', 'pro-subscription'],
    tags: [],
    status: 'available',
    sortOrder: 23,
  },
  {
    id: 'upgrade-pro-analytics',
    name: 'Pro Investigator Analytics',
    slug: 'pro-analytics',
    shortDescription: 'Career dashboards, skill heatmaps, and exportable reports.',
    longDescription:
      'A polished analytics suite layered on top of Deep Telemetry: per-category mastery scores, time-to-diagnosis trends, hint dependency tracking, and exportable case reports for portfolio or training records.',
    valueProposition: 'Quantify your investigator career and showcase progress.',
    category: 'feature-upgrade',
    section: 'feature-upgrade',
    entitlementType: 'feature-upgrade',
    pricingType: 'one-time',
    priceAmountCents: 599,
    includedFeatures: ['pro-analytics'],
    relatedProductIds: ['upgrade-deep-telemetry', 'pro-subscription'],
    tags: [],
    status: 'available',
    sortOrder: 24,
  },

  {
    id: 'bundle-clinical-systems',
    name: 'Clinical Systems Bundle',
    slug: 'clinical-systems',
    shortDescription: 'Healthcare Imaging Pack + Advanced Tool Suite + Deep Telemetry.',
    longDescription:
      'A specialty bundle built for clinical IT and biomed engineers. Includes the Healthcare Imaging Pack, the Advanced Tool Suite (DICOM, registry, service graph), and Deep Telemetry for catching modality drift before it impacts patients.',
    valueProposition: 'Save vs. buying these three separately — built for healthcare professionals.',
    category: 'bundle',
    section: 'specialty',
    entitlementType: 'bundle',
    pricingType: 'one-time',
    priceAmountCents: 1999,
    bundledProductIds: [
      'pack-healthcare-imaging',
      'upgrade-advanced-tools',
      'upgrade-deep-telemetry',
    ],
    relatedProductIds: ['pack-healthcare-imaging', 'bundle-master-investigator'],
    tags: ['specialty', 'best-value'],
    status: 'coming-soon',
    sortOrder: 29,
  },
  {
    id: 'bundle-master-investigator',
    name: 'Master Investigator Bundle',
    slug: 'master-investigator',
    shortDescription: 'Pro subscription, all general packs, every feature upgrade.',
    longDescription:
      'The ultimate package. Includes Pro Investigator subscription, all general content packs, every feature upgrade, and an exclusive Master Investigator badge. Healthcare Imaging is sold separately as a specialty pack — see Clinical Systems Bundle.',
    valueProposition: 'Best overall value — every general pack and upgrade plus Pro for one price.',
    category: 'bundle',
    section: 'bundle',
    entitlementType: 'bundle',
    pricingType: 'one-time',
    priceAmountCents: 4999,
    bundledProductIds: [
      'pro-subscription',
      'pack-network-ops',
      'pack-server-graveyard',
      'pack-garage-diagnostics',
      'pack-sensor-mesh',
      'pack-mixed-cascades',
      'upgrade-advanced-tools',
      'upgrade-chaos-mode',
      'upgrade-deep-telemetry',
      'upgrade-sandbox-pro',
      'upgrade-pro-analytics',
    ],
    relatedProductIds: ['bundle-clinical-systems', 'pro-subscription'],
    tags: ['best-value'],
    status: 'coming-soon',
    featured: true,
    sortOrder: 30,
  },
];

/**
 * Hydrates each product with derived fields (`includedCaseIds`,
 * `caseCount`, `featuredCaseIds`) computed from the case catalog
 * registry. This runs once at module load so the rest of the app can
 * read product.includedCaseIds directly without going through the
 * registry, while the registry remains the single source of truth.
 *
 * Imported lazily via `await import` to avoid a hard dependency cycle —
 * the case catalog selectors import CATALOG, but its entries module is
 * dependency-free, so we only need the entries here.
 */
import { CASE_CATALOG_ENTRIES as _CASE_ENTRIES } from './caseCatalog/entries';

(function hydrateProductCaseFields() {
  const directByProduct = new Map<string, string[]>();
  for (const entry of _CASE_ENTRIES) {
    const list = directByProduct.get(entry.sourceProductId) || [];
    list.push(entry.id);
    directByProduct.set(entry.sourceProductId, list);
  }

  for (const product of CATALOG) {
    let ids = directByProduct.get(product.id) || [];
    if (ids.length === 0 && product.bundledProductIds) {
      const seen = new Set<string>();
      for (const inner of product.bundledProductIds) {
        for (const id of directByProduct.get(inner) || []) {
          if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
      }
    }
    if (ids.length > 0) {
      product.includedCaseIds = ids;
      product.caseCount = ids.length;
    }
  }
})();

export function getProduct(id: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.id === id);
}

export function getProductsByCategory(category: string): CatalogProduct[] {
  return CATALOG.filter((p) => p.category === category).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getProductsBySection(section: ProductSection): CatalogProduct[] {
  return CATALOG.filter((p) => p.section === section && p.status !== 'disabled').sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getAvailableProducts(): CatalogProduct[] {
  return CATALOG.filter((p) => p.status !== 'disabled').sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getFeaturedProducts(): CatalogProduct[] {
  return CATALOG.filter((p) => p.featured && p.status !== 'disabled').sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export type CatalogOverride = {
  productId: string;
  status?: ProductStatus;
  featured?: boolean;
  shortDescription?: string;
  longDescription?: string;
  tags?: string[];
};

const catalogOverrideListeners = new Set<() => void>();

const ORIGINAL_CATALOG_SNAPSHOT: Record<
  string,
  Pick<CatalogProduct, 'status' | 'featured' | 'shortDescription' | 'longDescription' | 'tags'>
> = Object.fromEntries(
  CATALOG.map((p) => [
    p.id,
    {
      status: p.status,
      featured: p.featured,
      shortDescription: p.shortDescription,
      longDescription: p.longDescription,
      tags: [...p.tags],
    },
  ])
);

export function applyCatalogOverrides(overrides: CatalogOverride[]) {
  for (const o of overrides) {
    const product = CATALOG.find((p) => p.id === o.productId);
    if (!product) continue;
    if (o.status !== undefined) product.status = o.status;
    if (o.featured !== undefined) product.featured = o.featured;
    if (o.shortDescription !== undefined) product.shortDescription = o.shortDescription;
    if (o.longDescription !== undefined) product.longDescription = o.longDescription;
    if (o.tags !== undefined) product.tags = o.tags;
  }
  catalogOverrideListeners.forEach((cb) => cb());
}

export function revertCatalogProduct(productId: string): boolean {
  const product = CATALOG.find((p) => p.id === productId);
  const original = ORIGINAL_CATALOG_SNAPSHOT[productId];
  if (!product || !original) return false;
  product.status = original.status;
  product.featured = original.featured;
  product.shortDescription = original.shortDescription;
  product.longDescription = original.longDescription;
  product.tags = [...original.tags];
  catalogOverrideListeners.forEach((cb) => cb());
  return true;
}

export function subscribeCatalog(cb: () => void): () => void {
  catalogOverrideListeners.add(cb);
  return () => catalogOverrideListeners.delete(cb);
}

export function getCatalogVersion(): number {
  return catalogOverrideListeners.size === 0 ? 0 : Date.now();
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
