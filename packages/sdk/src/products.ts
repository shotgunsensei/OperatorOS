import { MODULE_PRODUCT_VALUE_BY_SLUG } from './product-value.js';

export type CoreProductKey = 'tradeflowkit' | 'pulsedesk' | 'techdeck';
export type IncludedAppKey = 'torqueshed' | 'faultlinelab' | 'ninja-pool-hall';
export type CompanionModuleKey =
  | 'snapproofos'
  | 'brandforgeos'
  | 'studyforge-ai'
  | 'ninja-launch-kit'
  | 'callcommand-ai'
  | 'ninjamation';

export type ProductEntitlementType =
  | 'core_product'
  | 'included_app'
  | 'companion_module'
  | 'seat_pack'
  | 'system';

export type ProductEntitlementSource =
  | 'stripe'
  | 'included_with_core'
  | 'selected_free_companion'
  | 'manual'
  | 'admin';

export interface ProductCatalogEntry {
  key: CoreProductKey;
  name: string;
  monthlyPriceCents: number;
  includedSeats: number;
  description: string;
  stripePriceEnvKey: string;
}

export interface ModuleCatalogItem {
  key: IncludedAppKey | CompanionModuleKey;
  name: string;
  description: string;
}

export const INCLUDED_SEATS = 5;
export const COMPANION_MODULE_PRICE_CENTS = 2900;
export const DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS = 1500;

export const CORE_PRODUCTS: readonly ProductCatalogEntry[] = [
  {
    key: 'tradeflowkit',
    name: 'TradeFlowKit',
    monthlyPriceCents: 14900,
    includedSeats: INCLUDED_SEATS,
    description: MODULE_PRODUCT_VALUE_BY_SLUG.tradeflowkit.promise,
    stripePriceEnvKey: 'STRIPE_PRICE_TRADEFLOWKIT_MONTHLY',
  },
  {
    key: 'pulsedesk',
    name: 'PulseDesk',
    monthlyPriceCents: 14900,
    includedSeats: INCLUDED_SEATS,
    description: MODULE_PRODUCT_VALUE_BY_SLUG.pulsedesk.promise,
    stripePriceEnvKey: 'STRIPE_PRICE_PULSEDESK_MONTHLY',
  },
  {
    key: 'techdeck',
    name: 'TechDeck',
    monthlyPriceCents: 9900,
    includedSeats: INCLUDED_SEATS,
    description: MODULE_PRODUCT_VALUE_BY_SLUG.techdeck.promise,
    stripePriceEnvKey: 'STRIPE_PRICE_TECHDECK_MONTHLY',
  },
] as const;

export const CORE_PRODUCTS_BY_KEY: Readonly<Record<CoreProductKey, ProductCatalogEntry>> =
  Object.freeze(Object.fromEntries(CORE_PRODUCTS.map(product => [product.key, product])) as Record<CoreProductKey, ProductCatalogEntry>);

// Task #139: these three apps are free with any OperatorOS account ($0),
// not gated behind a paid core product. Every new free account's personal
// tenant is granted them on signup, and existing tenants are back-filled on
// boot. Paid core products still also include them (harmless overlap).
export const FREE_WITH_ANY_ACCOUNT: readonly ModuleCatalogItem[] = [
  {
    key: 'torqueshed',
    name: 'TorqueShed',
    description: MODULE_PRODUCT_VALUE_BY_SLUG.torqueshed.promise,
  },
  {
    key: 'faultlinelab',
    name: 'FaultlineLab',
    description: MODULE_PRODUCT_VALUE_BY_SLUG.faultlinelab.promise,
  },
  {
    key: 'ninja-pool-hall',
    name: 'Operator Pool Hall',
    description: MODULE_PRODUCT_VALUE_BY_SLUG['ninja-pool-hall'].promise,
  },
] as const;

export const COMPANION_MODULES: readonly ModuleCatalogItem[] = [
  { key: 'snapproofos', name: 'SnapProofOS', description: MODULE_PRODUCT_VALUE_BY_SLUG.snapproofos.promise },
  { key: 'brandforgeos', name: 'BrandForgeOS', description: MODULE_PRODUCT_VALUE_BY_SLUG.brandforgeos.promise },
  { key: 'studyforge-ai', name: 'StudyForge AI', description: MODULE_PRODUCT_VALUE_BY_SLUG['studyforge-ai'].promise },
  { key: 'ninja-launch-kit', name: 'Deploy Ops', description: MODULE_PRODUCT_VALUE_BY_SLUG['ninja-launch-kit'].promise },
  { key: 'callcommand-ai', name: 'CallCommand AI', description: MODULE_PRODUCT_VALUE_BY_SLUG['callcommand-ai'].promise },
  { key: 'ninjamation', name: 'Script Ops', description: MODULE_PRODUCT_VALUE_BY_SLUG.ninjamation.promise },
] as const;

export const COMPANION_MODULE_KEYS = new Set<CompanionModuleKey>(
  COMPANION_MODULES.map(module => module.key as CompanionModuleKey),
);

/**
 * Forward-sale companion catalog. Core applications, free applications, and
 * OutCall are intentionally absent. Keep this set as the shared authority for
 * checkout validation, billing readiness, and price administration.
 */
export const ELIGIBLE_COMPANION_MODULE_KEYS: readonly CompanionModuleKey[] =
  COMPANION_MODULES.map(module => module.key as CompanionModuleKey);

export function isEligibleCompanionModuleKey(value: string): value is CompanionModuleKey {
  return COMPANION_MODULE_KEYS.has(value as CompanionModuleKey);
}

/** Preserve paid companion quantity when the included companion is changed. */
export function swapIncludedCompanion(
  currentIncluded: CompanionModuleKey,
  additionalModules: readonly CompanionModuleKey[],
  nextIncluded: CompanionModuleKey,
): CompanionModuleKey[] {
  if (currentIncluded === nextIncluded) return [...additionalModules];
  return additionalModules.map(module => module === nextIncluded ? currentIncluded : module);
}

export interface StackSelection {
  coreProduct: CoreProductKey;
  freeCompanionModule: CompanionModuleKey;
  additionalModules?: readonly CompanionModuleKey[];
  additionalSeats?: number;
}

export interface StackPriceBreakdown {
  baseProductCents: number;
  includedCompanionCents: 0;
  additionalModulesCents: number;
  additionalSeatsCents: number;
  totalMonthlyCents: number;
}

export function getAdditionalSeatPriceCents(envValue?: string): number {
  // Forward commerce has one published seat price. The optional parameter is
  // retained only as a source-compatible bridge for older callers; runtime
  // environment values may not silently change the public billing contract.
  void envValue;
  return DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS;
}

export function normalizeStackSelection(selection: StackSelection): StackSelection {
  if (!CORE_PRODUCTS_BY_KEY[selection.coreProduct]) {
    throw new Error(`Unknown core product: ${selection.coreProduct}`);
  }
  if (!COMPANION_MODULE_KEYS.has(selection.freeCompanionModule)) {
    throw new Error(`Unknown companion module: ${selection.freeCompanionModule}`);
  }

  const additionalModules = [...new Set(selection.additionalModules ?? [])]
    .filter(module => module !== selection.freeCompanionModule);
  for (const module of additionalModules) {
    if (!COMPANION_MODULE_KEYS.has(module)) throw new Error(`Unknown companion module: ${module}`);
  }

  const additionalSeats = selection.additionalSeats ?? 0;
  if (!Number.isSafeInteger(additionalSeats) || additionalSeats < 0) {
    throw new Error('Additional seats must be a non-negative integer');
  }

  return { ...selection, additionalModules, additionalSeats };
}

export function calculateStackMonthlyPrice(
  selection: StackSelection,
): StackPriceBreakdown {
  const normalized = normalizeStackSelection(selection);
  const baseProductCents = CORE_PRODUCTS_BY_KEY[normalized.coreProduct].monthlyPriceCents;
  const additionalModulesCents =
    (normalized.additionalModules?.length ?? 0) * COMPANION_MODULE_PRICE_CENTS;
  const additionalSeatsCents =
    (normalized.additionalSeats ?? 0) * DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS;

  return {
    baseProductCents,
    includedCompanionCents: 0,
    additionalModulesCents,
    additionalSeatsCents,
    totalMonthlyCents: baseProductCents + additionalModulesCents + additionalSeatsCents,
  };
}
