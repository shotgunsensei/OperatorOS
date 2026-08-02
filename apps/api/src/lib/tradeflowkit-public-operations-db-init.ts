import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v32: public lead intake and tenant-owned business-payment state.
 *
 * OperatorOS remains the identity, entitlement, and subscription-billing
 * authority. This release stores only public-intake controls and Stripe
 * connected-account identifiers; provider credentials remain environment
 * secrets. Rollback follows the repository restore-to-new-database contract.
 */
export async function ensureTradeFlowKitPublicOperationsTables(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE tradeflowkit_leads ALTER COLUMN created_by_user_id DROP NOT NULL;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS capture_form_id VARCHAR(36);
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS intake_consent_version VARCHAR(40);
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS intake_consent_at TIMESTAMP;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_leads ADD CONSTRAINT tfk_leads_capture_form_tenant_fk
        FOREIGN KEY (tenant_id, capture_form_id)
        REFERENCES tradeflowkit_lead_capture_forms(tenant_id, id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS idx_tfk_leads_capture_form
      ON tradeflowkit_leads(tenant_id, capture_form_id, created_at DESC);

    ALTER TABLE tradeflowkit_lead_capture_forms
      DROP CONSTRAINT IF EXISTS tfk_lead_capture_public_check;
    ALTER TABLE tradeflowkit_lead_capture_forms ADD COLUMN IF NOT EXISTS public_token_hash VARCHAR(64);
    ALTER TABLE tradeflowkit_lead_capture_forms ADD COLUMN IF NOT EXISTS privacy_notice_url VARCHAR(500);
    ALTER TABLE tradeflowkit_lead_capture_forms ADD COLUMN IF NOT EXISTS consent_text VARCHAR(1000);
    ALTER TABLE tradeflowkit_lead_capture_forms ADD COLUMN IF NOT EXISTS consent_version VARCHAR(40);
    ALTER TABLE tradeflowkit_lead_capture_forms
      ADD COLUMN IF NOT EXISTS allowed_adapter_keys JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE tradeflowkit_lead_capture_forms ADD COLUMN IF NOT EXISTS token_rotated_at TIMESTAMP;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_lead_capture_public_token
      ON tradeflowkit_lead_capture_forms(public_token_hash)
      WHERE public_token_hash IS NOT NULL;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_lead_capture_forms ADD CONSTRAINT tfk_lead_capture_token_check
        CHECK (public_token_hash IS NULL OR public_token_hash ~ '^[0-9a-f]{64}$');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_lead_capture_forms ADD CONSTRAINT tfk_lead_capture_privacy_check
        CHECK (privacy_notice_url IS NULL OR char_length(privacy_notice_url) BETWEEN 8 AND 500);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_lead_capture_forms ADD CONSTRAINT tfk_lead_capture_consent_check
        CHECK (
          (public_intake_enabled = FALSE) OR
          (public_token_hash IS NOT NULL AND privacy_notice_url IS NOT NULL
            AND consent_text IS NOT NULL AND consent_version IS NOT NULL)
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_lead_capture_forms ADD CONSTRAINT tfk_lead_capture_adapters_check
        CHECK (jsonb_typeof(allowed_adapter_keys) = 'array' AND pg_column_size(allowed_adapter_keys) <= 2048);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE tradeflowkit_lead_source_events DROP CONSTRAINT IF EXISTS tfk_lead_source_events_type_check;
    ALTER TABLE tradeflowkit_lead_source_events DROP CONSTRAINT IF EXISTS tfk_lead_source_events_status_check;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_lead_source_events ADD CONSTRAINT tfk_lead_source_events_type_check
        CHECK (event_type IN ('validation','configuration','intake'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_lead_source_events ADD CONSTRAINT tfk_lead_source_events_status_check
        CHECK (status IN ('validated','configured','accepted','rejected','rate_limited'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS tradeflowkit_public_intake_rate_limits (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      capture_form_id VARCHAR(36) NOT NULL,
      bucket_hash VARCHAR(64) NOT NULL,
      window_start TIMESTAMP NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1,
      expires_at TIMESTAMP NOT NULL,
      CONSTRAINT tfk_public_rate_capture_fk FOREIGN KEY (tenant_id, capture_form_id)
        REFERENCES tradeflowkit_lead_capture_forms(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT uq_tfk_public_rate_bucket UNIQUE (tenant_id, capture_form_id, bucket_hash, window_start),
      CONSTRAINT tfk_public_rate_count_check CHECK (request_count BETWEEN 1 AND 100000)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_public_rate_expiry
      ON tradeflowkit_public_intake_rate_limits(expires_at);

    CREATE TABLE IF NOT EXISTS tradeflowkit_payment_provider_accounts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider VARCHAR(40) NOT NULL DEFAULT 'stripe_connect',
      provider_account_id VARCHAR(255) NOT NULL,
      livemode BOOLEAN NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'connected',
      charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      version INTEGER NOT NULL DEFAULT 1,
      connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
      disconnected_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_tfk_payment_provider_tenant UNIQUE (tenant_id, provider),
      CONSTRAINT uq_tfk_payment_provider_account UNIQUE (provider, provider_account_id),
      CONSTRAINT uq_tfk_payment_provider_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT tfk_payment_provider_check CHECK (provider = 'stripe_connect'),
      CONSTRAINT tfk_payment_provider_status_check CHECK (status IN ('connected','restricted','disconnected')),
      CONSTRAINT tfk_payment_provider_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_payment_provider_status
      ON tradeflowkit_payment_provider_accounts(tenant_id, status);

    CREATE TABLE IF NOT EXISTS tradeflowkit_payment_oauth_states (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state_hash VARCHAR(64) NOT NULL UNIQUE,
      redirect_uri VARCHAR(1000) NOT NULL,
      return_path VARCHAR(500) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT tfk_payment_oauth_return_check CHECK (return_path ~ '^/' AND return_path !~ '^//'),
      CONSTRAINT tfk_payment_oauth_state_check CHECK (state_hash ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_payment_oauth_expiry
      ON tradeflowkit_payment_oauth_states(expires_at);

    ALTER TABLE tradeflowkit_payments ADD COLUMN IF NOT EXISTS provider_account_id VARCHAR(255);
    ALTER TABLE tradeflowkit_payments ADD COLUMN IF NOT EXISTS provider_event_id VARCHAR(255);
    ALTER TABLE tradeflowkit_payments ADD COLUMN IF NOT EXISTS failure_code VARCHAR(120);
    ALTER TABLE tradeflowkit_payments ALTER COLUMN paid_at DROP NOT NULL;
    ALTER TABLE tradeflowkit_payments ALTER COLUMN paid_at DROP DEFAULT;
    UPDATE tradeflowkit_payments SET paid_at = NULL WHERE status = 'pending' AND paid_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tfk_payments_provider_account
      ON tradeflowkit_payments(tenant_id, provider_account_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_payments_provider_event
      ON tradeflowkit_payments(provider, provider_event_id)
      WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
  `);
}
