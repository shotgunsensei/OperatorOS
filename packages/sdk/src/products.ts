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
    description: 'Quote-to-payment operations and revenue-flow control.',
    stripePriceEnvKey: 'STRIPE_PRICE_TRADEFLOWKIT_MONTHLY',
  },
  {
    key: 'pulsedesk',
    name: 'PulseDesk',
    monthlyPriceCents: 14900,
    includedSeats: INCLUDED_SEATS,
    description: 'Internal operations, ticketing, inventory, and asset management.',
    stripePriceEnvKey: 'STRIPE_PRICE_PULSEDESK_MONTHLY',
  },
  {
    key: 'techdeck',
    name: 'TechDeck',
    monthlyPriceCents: 9900,
    includedSeats: INCLUDED_SEATS,
    description: 'Engineer-first IT and MSP operations console.',
    stripePriceEnvKey: 'STRIPE_PRICE_TECHDECK_MONTHLY',
  },
] as const;

export const CORE_PRODUCTS_BY_KEY: Readonly<Record<CoreProductKey, ProductCatalogEntry>> =
  Object.freeze(Object.fromEntries(CORE_PRODUCTS.map(product => [product.key, product])) as Record<CoreProductKey, ProductCatalogEntry>);

export const INCLUDED_WITH_ANY_PAID_CORE: readonly ModuleCatalogItem[] = [
  {
    key: 'torqueshed',
    name: 'TorqueShed',
    description: 'Fleet and vehicle maintenance value for every operator team.',
  },
  {
    key: 'faultlinelab',
    name: 'FaultlineLab',
    description: 'Diagnostic challenges and proof-of-skill scenarios.',
  },
  {
    key: 'ninja-pool-hall',
    name: 'Ninja Pool Hall',
    description: 'A companion engagement experience for your organization.',
  },
] as const;

export const COMPANION_MODULES: readonly ModuleCatalogItem[] = [
  { key: 'snapproofos', name: 'SnapProofOS', description: 'Evidence, proof, and validation workflows.' },
  { key: 'brandforgeos', name: 'BrandForgeOS', description: 'Brand and campaign production workspace.' },
  { key: 'studyforge-ai', name: 'StudyForge AI', description: 'AI-assisted study and team training.' },
  { key: 'ninja-launch-kit', name: 'Ninja Launch Kit', description: 'Launch planning and internal tool scaffolding.' },
  { key: 'callcommand-ai', name: 'CallCommand AI', description: 'AI phone operations and call automation.' },
  { key: 'ninjamation', name: 'Ninjamation', description: 'Cross-app workflow automation.' },
] as const;

export const COMPANION_MODULE_KEYS = new Set<CompanionModuleKey>(
  COMPANION_MODULES.map(module => module.key as CompanionModuleKey),
);

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
  if (!envValue) return DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS;
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
  additionalSeatPriceCents = DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
): StackPriceBreakdown {
  const normalized = normalizeStackSelection(selection);
  const baseProductCents = CORE_PRODUCTS_BY_KEY[normalized.coreProduct].monthlyPriceCents;
  const additionalModulesCents =
    (normalized.additionalModules?.length ?? 0) * COMPANION_MODULE_PRICE_CENTS;
  const additionalSeatsCents =
    (normalized.additionalSeats ?? 0) * additionalSeatPriceCents;

  return {
    baseProductCents,
    includedCompanionCents: 0,
    additionalModulesCents,
    additionalSeatsCents,
    totalMonthlyCents: baseProductCents + additionalModulesCents + additionalSeatsCents,
  };
}
