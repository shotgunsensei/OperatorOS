import { CORE_PRODUCTS, type CoreProductKey } from '@operatoros/sdk';

/** Public catalog only. Checkout and entitlement authority remain on the API. */
export interface BillingCatalog {
  billingInterval: 'month';
  includedSeats: 5;
  includedCompanionCount: 1;
  coreProducts: Array<{ key: CoreProductKey; monthlyPriceCents: number }>;
  companionModuleMonthlyPriceCents: number;
  additionalSeatMonthlyPriceCents: number;
  stripeConfigured: Partial<Record<CoreProductKey | 'companionModule' | 'additionalSeat', boolean>>;
}

export function readBillingCatalog(value: unknown): BillingCatalog | null {
  if (!value || typeof value !== 'object') return null;
  const catalog = value as Record<string, unknown>;
  const cents = (amount: unknown): amount is number => Number.isSafeInteger(amount) && (amount as number) > 0;
  if (catalog.billingInterval !== 'month' || catalog.includedSeats !== 5 || catalog.includedCompanionCount !== 1
    || !cents(catalog.companionModuleMonthlyPriceCents) || !cents(catalog.additionalSeatMonthlyPriceCents)
    || !Array.isArray(catalog.coreProducts)) return null;
  const coreProducts: BillingCatalog['coreProducts'] = [];
  for (const product of CORE_PRODUCTS) {
    const matches = catalog.coreProducts.filter(row => row && row.key === product.key);
    if (matches.length !== 1 || !cents(matches[0].monthlyPriceCents)) return null;
    coreProducts.push({ key: product.key, monthlyPriceCents: matches[0].monthlyPriceCents });
  }
  const configured = catalog.stripeConfigured && typeof catalog.stripeConfigured === 'object'
    ? catalog.stripeConfigured as Record<string, unknown> : {};
  return {
    billingInterval: 'month', includedSeats: 5, includedCompanionCount: 1, coreProducts,
    companionModuleMonthlyPriceCents: catalog.companionModuleMonthlyPriceCents,
    additionalSeatMonthlyPriceCents: catalog.additionalSeatMonthlyPriceCents,
    stripeConfigured: Object.fromEntries(['tradeflowkit', 'pulsedesk', 'techdeck', 'companionModule', 'additionalSeat']
      .map(key => [key, configured[key] === true])),
  };
}

export const catalogMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
