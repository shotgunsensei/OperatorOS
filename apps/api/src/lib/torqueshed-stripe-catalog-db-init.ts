import { db } from '../db.js';

/** Platform-owned, environment-specific Stripe Product/Price mappings. */
export async function ensureTorqueShedStripeCatalogTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS torqueshed_stripe_credit_catalog (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      environment VARCHAR(8) NOT NULL,
      package_key VARCHAR(80) NOT NULL,
      catalog_version VARCHAR(80) NOT NULL,
      lookup_key VARCHAR(160) NOT NULL,
      units BIGINT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency CHAR(3) NOT NULL,
      stripe_account_id VARCHAR(128) NOT NULL,
      stripe_product_id VARCHAR(128) NOT NULL,
      stripe_price_id VARCHAR(128) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      validation_status VARCHAR(16) NOT NULL DEFAULT 'unavailable',
      drift_code VARCHAR(100),
      validated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_catalog_package UNIQUE (environment,package_key,catalog_version),
      CONSTRAINT uq_torqueshed_catalog_lookup UNIQUE (stripe_account_id,environment,lookup_key),
      CONSTRAINT uq_torqueshed_catalog_price UNIQUE (stripe_account_id,environment,stripe_price_id),
      CONSTRAINT torqueshed_catalog_environment_check CHECK (environment IN ('test','live')),
      CONSTRAINT torqueshed_catalog_validation_check CHECK (validation_status IN ('validated','drift','stale','unavailable')),
      CONSTRAINT torqueshed_catalog_units_check CHECK (units > 0),
      CONSTRAINT torqueshed_catalog_amount_check CHECK (amount_minor > 0),
      CONSTRAINT torqueshed_catalog_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT torqueshed_catalog_validated_check CHECK (
        validation_status <> 'validated' OR (active=TRUE AND drift_code IS NULL AND validated_at IS NOT NULL)
      )
    );
    ALTER TABLE torqueshed_stripe_credit_catalog ADD COLUMN IF NOT EXISTS units BIGINT;
    ALTER TABLE torqueshed_stripe_credit_catalog ADD COLUMN IF NOT EXISTS amount_minor INTEGER;
    ALTER TABLE torqueshed_stripe_credit_catalog ADD COLUMN IF NOT EXISTS currency CHAR(3);
    ALTER TABLE torqueshed_stripe_credit_catalog ALTER COLUMN units SET NOT NULL;
    ALTER TABLE torqueshed_stripe_credit_catalog ALTER COLUMN amount_minor SET NOT NULL;
    ALTER TABLE torqueshed_stripe_credit_catalog ALTER COLUMN currency SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_torqueshed_catalog_active
      ON torqueshed_stripe_credit_catalog(environment,catalog_version,package_key)
      WHERE active=TRUE AND validation_status='validated';
    CREATE INDEX IF NOT EXISTS idx_torqueshed_catalog_validation
      ON torqueshed_stripe_credit_catalog(environment,validation_status,updated_at DESC);
  `);
}
