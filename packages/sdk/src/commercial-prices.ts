import { CORE_PRODUCTS, COMPANION_MODULE_PRICE_CENTS, DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS } from './products.js';

export const CALLCOMMAND_CAPACITY_PRICES = {
  concurrentLane: { key: 'callcommand-lane', name: 'CallCommand additional concurrent call lane', cents: 4900, envKey: 'STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY', amountEnvKey: 'CALLCOMMAND_LANE_PRICE_CENTS', minimum: 500, lookupKey: 'operatoros_callcommand_concurrent_lane_monthly_v1' },
  localNumber: { key: 'callcommand-local-number', name: 'CallCommand additional local number', cents: 500, envKey: 'STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY', amountEnvKey: 'CALLCOMMAND_LOCAL_NUMBER_PRICE_CENTS', minimum: 100, lookupKey: 'operatoros_callcommand_additional_local_number_monthly_v1' },
  tollFreeNumber: { key: 'callcommand-toll-free-number', name: 'CallCommand toll-free number', cents: 800, envKey: 'STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY', amountEnvKey: 'CALLCOMMAND_TOLL_FREE_NUMBER_PRICE_CENTS', minimum: 100, lookupKey: 'operatoros_callcommand_toll_free_number_monthly_v1' },
} as const;

export const TORQUESHED_CREDIT_CATALOG = Object.freeze([
  { key: 'roadside-25000', sku: 'TORQUESHED-ROADSIDE-25000-V1', lookupKey: 'operatoros_torqueshed_roadside_25000_v1', name: 'Roadside', units: 25000, amountMinor: 500, currency: 'USD' },
  { key: 'workshop-100000', sku: 'TORQUESHED-WORKSHOP-100000-V1', lookupKey: 'operatoros_torqueshed_workshop_100000_v1', name: 'Workshop', units: 100000, amountMinor: 1500, currency: 'USD' },
  { key: 'fleet-500000', sku: 'TORQUESHED-FLEET-500000-V1', lookupKey: 'operatoros_torqueshed_fleet_500000_v1', name: 'Fleet', units: 500000, amountMinor: 5000, currency: 'USD' },
] as const);

export interface RecurringCommercialPrice {
  key: string;
  name: string;
  cents: number;
  envKey: string;
  lookupKey: string;
}

/** Published forward sales only. Grandfathered tiers and OutCall stay closed. */
export function recurringCommercialPrices(env: Record<string, string | undefined> = {}): RecurringCommercialPrice[] {
  const capacity = Object.values(CALLCOMMAND_CAPACITY_PRICES).map(item => {
    const raw = env[item.amountEnvKey]?.trim();
    if (raw && (!/^\d{2,6}$/.test(raw) || Number(raw) < item.minimum || Number(raw) > 100000)) {
      throw new Error(`${item.amountEnvKey} is outside the supported whole USD-cent range`);
    }
    return { key: item.key, name: item.name, cents: raw ? Number(raw) : item.cents, envKey: item.envKey, lookupKey: item.lookupKey };
  });
  return [
    ...CORE_PRODUCTS.map(item => ({ key: item.key, name: item.name, cents: item.monthlyPriceCents, envKey: item.stripePriceEnvKey, lookupKey: `operatoros_${item.key}_monthly_v1` })),
    { key: 'companion-module', name: 'OperatorOS additional companion', cents: COMPANION_MODULE_PRICE_CENTS, envKey: 'STRIPE_PRICE_COMPANION_MODULE_MONTHLY', lookupKey: 'operatoros_companion_module_monthly_v1' },
    { key: 'additional-seat', name: 'OperatorOS additional team seat', cents: DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS, envKey: 'STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY', lookupKey: 'operatoros_additional_seat_monthly_v1' },
    ...capacity,
  ];
}
