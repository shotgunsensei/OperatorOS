import { db } from '../db.js';

/** Phase 43 additive purchase snapshot and truthful checkout state contract. */
export async function ensureTorqueShedCheckoutContract(): Promise<void> {
  await db.execute(`
    ALTER TABLE operatoros_token_purchase_intents
      ADD COLUMN IF NOT EXISTS diagnostic_session_id VARCHAR(36),
      ADD COLUMN IF NOT EXISTS catalog_version VARCHAR(80),
      ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(128),
      ADD COLUMN IF NOT EXISTS provider_product_id VARCHAR(128),
      ADD COLUMN IF NOT EXISTS provider_price_id VARCHAR(128),
      ADD COLUMN IF NOT EXISTS success_return_url TEXT,
      ADD COLUMN IF NOT EXISTS cancel_return_url TEXT,
      ADD COLUMN IF NOT EXISTS checkout_created_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

    ALTER TABLE operatoros_token_purchase_intents
      DROP CONSTRAINT IF EXISTS operatoros_token_purchase_status_check;
    ALTER TABLE operatoros_token_purchase_intents
      ADD CONSTRAINT operatoros_token_purchase_status_check CHECK (status IN (
        'pending','creating_checkout','checkout_open','payment_pending','checkout_created',
        'paid_pending_credit','credited','cancelled','expired','failed',
        'partially_refunded','refunded','disputed'
      ));

    DO $$ BEGIN
      ALTER TABLE operatoros_token_purchase_intents
        ADD CONSTRAINT operatoros_token_purchase_diagnostic_fk
        FOREIGN KEY (tenant_id,diagnostic_session_id)
        REFERENCES torqueshed_diagnostic_sessions(tenant_id,id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE INDEX IF NOT EXISTS idx_operatoros_token_purchase_diagnostic
      ON operatoros_token_purchase_intents(tenant_id,diagnostic_session_id,created_at DESC)
      WHERE diagnostic_session_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_operatoros_token_purchase_state
      ON operatoros_token_purchase_intents(tenant_id,status,updated_at DESC);
  `);
}
