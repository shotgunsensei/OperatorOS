import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export const TORQUESHED_CREDIT_CATALOG_VERSION = 'torqueshed-credit-v1';

export const TORQUESHED_CREDIT_CATALOG = Object.freeze([
  {
    key: 'roadside-25000', sku: 'TORQUESHED-ROADSIDE-25000-V1',
    lookupKey: 'operatoros_torqueshed_roadside_25000_v1',
    name: 'Roadside', units: 25_000, amountMinor: 500, currency: 'USD',
  },
  {
    key: 'workshop-100000', sku: 'TORQUESHED-WORKSHOP-100000-V1',
    lookupKey: 'operatoros_torqueshed_workshop_100000_v1',
    name: 'Workshop', units: 100_000, amountMinor: 1_500, currency: 'USD',
  },
  {
    key: 'fleet-500000', sku: 'TORQUESHED-FLEET-500000-V1',
    lookupKey: 'operatoros_torqueshed_fleet_500000_v1',
    name: 'Fleet', units: 500_000, amountMinor: 5_000, currency: 'USD',
  },
] as const);

export type TorqueShedCreditPackage = (typeof TORQUESHED_CREDIT_CATALOG)[number];
export type TorqueShedStripeMode = 'test' | 'live';

export function torqueShedCreditPackage(packageKey: unknown): TorqueShedCreditPackage {
  if (typeof packageKey !== 'string' || !packageKey.trim()) {
    throw Object.assign(new Error('A valid TorqueShed package key is required'), { code: 'TORQUE_PACKAGE_INVALID' });
  }
  const found = TORQUESHED_CREDIT_CATALOG.find((item) => item.key === packageKey.trim());
  if (!found) throw Object.assign(new Error('Unknown TorqueShed package key'), { code: 'TORQUE_PACKAGE_INVALID' });
  return found;
}

export function torqueShedStripeMetadata(
  item: TorqueShedCreditPackage,
  environment: TorqueShedStripeMode,
): Record<string, string> {
  return {
    operatoros_product: 'torqueshed_ai_credits', module_slug: 'torqueshed',
    package_key: item.key, units: String(item.units), currency: item.currency,
    catalog_version: TORQUESHED_CREDIT_CATALOG_VERSION, environment, sku: item.sku,
  };
}

export type TorqueShedCatalogMapping = {
  environment: TorqueShedStripeMode;
  packageKey: string;
  catalogVersion: string;
  lookupKey: string;
  units: number;
  amountMinor: number;
  currency: string;
  stripeAccountId: string;
  stripeProductId: string;
  stripePriceId: string;
  active: boolean;
  validationStatus: 'validated' | 'drift' | 'stale' | 'unavailable';
  driftCode: string | null;
  validatedAt: Date | string | null;
};

function camel(row: Record<string, unknown>): TorqueShedCatalogMapping {
  return {
    environment: String(row.environment) as TorqueShedStripeMode,
    packageKey: String(row.package_key), catalogVersion: String(row.catalog_version),
    lookupKey: String(row.lookup_key), units: Number(row.units), amountMinor: Number(row.amount_minor),
    currency: String(row.currency), stripeAccountId: String(row.stripe_account_id),
    stripeProductId: String(row.stripe_product_id), stripePriceId: String(row.stripe_price_id),
    active: row.active === true,
    validationStatus: String(row.validation_status) as TorqueShedCatalogMapping['validationStatus'],
    driftCode: row.drift_code == null ? null : String(row.drift_code),
    validatedAt: row.validated_at as Date | string | null,
  };
}

export async function listTorqueShedCatalogMappings(environment?: TorqueShedStripeMode): Promise<TorqueShedCatalogMapping[]> {
  const result = environment
    ? await db.execute(sql`SELECT * FROM torqueshed_stripe_credit_catalog WHERE environment=${environment} ORDER BY package_key`)
    : await db.execute(sql`SELECT * FROM torqueshed_stripe_credit_catalog ORDER BY environment,package_key`);
  return result.rows.map((row) => camel(row as Record<string, unknown>));
}

export async function getValidatedTorqueShedPrice(input: {
  environment: TorqueShedStripeMode;
  packageKey: string;
}): Promise<TorqueShedCatalogMapping> {
  const result = await db.execute(sql`
    SELECT * FROM torqueshed_stripe_credit_catalog
    WHERE environment=${input.environment} AND package_key=${input.packageKey}
      AND catalog_version=${TORQUESHED_CREDIT_CATALOG_VERSION}
      AND active=TRUE AND validation_status='validated' AND drift_code IS NULL
    LIMIT 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw Object.assign(new Error('The selected TorqueShed Price is not validated'), { code: 'TORQUE_CATALOG_UNAVAILABLE' });
  const mapping = camel(row);
  const item = torqueShedCreditPackage(input.packageKey);
  if (mapping.lookupKey !== item.lookupKey || mapping.units !== item.units
    || mapping.amountMinor !== item.amountMinor || mapping.currency !== item.currency) {
    throw Object.assign(new Error('The selected TorqueShed Price snapshot has drifted'), { code: 'TORQUE_CATALOG_UNAVAILABLE' });
  }
  return mapping;
}

export async function torqueShedCatalogReadiness(
  environment: TorqueShedStripeMode,
): Promise<{ state: 'validated' | 'stale' | 'unavailable'; version: string | null; mode: TorqueShedStripeMode }> {
  try {
    const mappings = await listTorqueShedCatalogMappings(environment);
    const expected = new Set<string>(TORQUESHED_CREDIT_CATALOG.map((item) => item.key));
    const current = mappings.filter((row) => row.catalogVersion === TORQUESHED_CREDIT_CATALOG_VERSION);
    const complete = current.length === expected.size && current.every((row) => {
      const item = TORQUESHED_CREDIT_CATALOG.find((candidate) => candidate.key === row.packageKey);
      return expected.has(row.packageKey) && item != null && row.active
        && row.validationStatus === 'validated' && !row.driftCode
        && row.lookupKey === item.lookupKey && row.units === item.units
        && row.amountMinor === item.amountMinor && row.currency === item.currency;
    });
    if (complete) return { state: 'validated', version: TORQUESHED_CREDIT_CATALOG_VERSION, mode: environment };
    if (mappings.length > 0) return { state: 'stale', version: TORQUESHED_CREDIT_CATALOG_VERSION, mode: environment };
    return { state: 'unavailable', version: TORQUESHED_CREDIT_CATALOG_VERSION, mode: environment };
  } catch {
    return { state: 'unavailable', version: TORQUESHED_CREDIT_CATALOG_VERSION, mode: environment };
  }
}

export async function persistTorqueShedCatalogMapping(mapping: TorqueShedCatalogMapping): Promise<void> {
  await db.execute(sql`
    INSERT INTO torqueshed_stripe_credit_catalog (
      environment,package_key,catalog_version,lookup_key,units,amount_minor,currency,stripe_account_id,
      stripe_product_id,stripe_price_id,active,validation_status,drift_code,validated_at
    ) VALUES (
      ${mapping.environment},${mapping.packageKey},${mapping.catalogVersion},${mapping.lookupKey},
      ${mapping.units},${mapping.amountMinor},${mapping.currency},
      ${mapping.stripeAccountId},${mapping.stripeProductId},${mapping.stripePriceId},${mapping.active},
      ${mapping.validationStatus},${mapping.driftCode},${mapping.validatedAt}
    )
    ON CONFLICT (environment,package_key,catalog_version) DO UPDATE SET
      lookup_key=EXCLUDED.lookup_key,units=EXCLUDED.units,amount_minor=EXCLUDED.amount_minor,currency=EXCLUDED.currency,
      stripe_account_id=EXCLUDED.stripe_account_id,
      stripe_product_id=EXCLUDED.stripe_product_id,stripe_price_id=EXCLUDED.stripe_price_id,
      active=EXCLUDED.active,validation_status=EXCLUDED.validation_status,
      drift_code=EXCLUDED.drift_code,validated_at=EXCLUDED.validated_at,updated_at=NOW()
  `);
}
