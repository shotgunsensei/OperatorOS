import {
  isEligibleCompanionModuleKey,
  normalizeStackSelection,
  type CompanionModuleKey,
  type CoreProductKey,
} from '@operatoros/sdk';
import { selectedCoreProduct } from './audience-lanes';

export interface PricingSelection {
  coreProduct: CoreProductKey;
  freeCompanionModule: CompanionModuleKey;
  additionalModules: CompanionModuleKey[];
  additionalSeats: number;
}

export type PricingSelectionQuery = {
  product?: string | string[];
  companion?: string | string[];
  additional?: string | string[];
  seats?: string | string[];
};

/** Public preferences only. Catalog prices, billing authority and access stay server-owned. */
export function readPricingSelection(query: PricingSelectionQuery): PricingSelection {
  const freeCompanionModule = typeof query.companion === 'string' && isEligibleCompanionModuleKey(query.companion)
    ? query.companion
    : 'snapproofos';
  const additionalModules = typeof query.additional === 'string'
    ? query.additional.split(',').filter(isEligibleCompanionModuleKey)
    : [];
  const requestedSeats = typeof query.seats === 'string' && /^(0|[1-9]\d*)$/.test(query.seats)
    ? Number(query.seats)
    : 0;
  const normalized = normalizeStackSelection({
    coreProduct: selectedCoreProduct(query.product),
    freeCompanionModule,
    additionalModules,
    additionalSeats: Number.isSafeInteger(requestedSeats) ? requestedSeats : 0,
  });
  return {
    coreProduct: normalized.coreProduct,
    freeCompanionModule: normalized.freeCompanionModule,
    additionalModules: [...(normalized.additionalModules ?? [])],
    additionalSeats: normalized.additionalSeats ?? 0,
  };
}

export function pricingSelectionPath(selection: PricingSelection): string {
  const normalized = normalizeStackSelection(selection);
  const query = new URLSearchParams({ product: normalized.coreProduct });
  if (normalized.freeCompanionModule !== 'snapproofos') query.set('companion', normalized.freeCompanionModule);
  if (normalized.additionalModules?.length) query.set('additional', normalized.additionalModules.join(','));
  if (normalized.additionalSeats) query.set('seats', String(normalized.additionalSeats));
  return `/pricing?${query.toString()}#build-stack`;
}

export function pricingAccountPath(selection: PricingSelection, mode: 'login' | 'register' = 'login'): string {
  const query = new URLSearchParams();
  if (mode === 'register') query.set('mode', 'register');
  query.set('next', pricingSelectionPath(selection));
  return `/login?${query.toString()}`;
}
