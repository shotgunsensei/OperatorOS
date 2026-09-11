import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Durable tenant purchase intent, including consent, across Stripe and browser returns. */
export async function ensureCallCommandSetupTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS callcommand_setup_orders (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      profile_id VARCHAR(36) NOT NULL,
      flow_id VARCHAR(36) NOT NULL,
      channel_id VARCHAR(36),
      phone_e164 VARCHAR(16) NOT NULL CHECK (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
      number_type VARCHAR(24) NOT NULL CHECK (number_type IN ('local','toll_free')),
      idempotency_key VARCHAR(160) NOT NULL,
      monthly_amount_cents INTEGER NOT NULL CHECK (monthly_amount_cents BETWEEN 0 AND 100000),
      status VARCHAR(24) NOT NULL DEFAULT 'selected'
        CHECK (status IN ('selected','awaiting_payment','provisioning','ready','attention','canceled')),
      billing_response JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(billing_response)='object'),
      last_error_code VARCHAR(120),
      consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_setup_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_callcommand_setup_key UNIQUE (tenant_id,idempotency_key),
      CONSTRAINT callcommand_setup_profile_fk FOREIGN KEY (tenant_id,profile_id) REFERENCES callcommand_profiles(tenant_id,id),
      CONSTRAINT callcommand_setup_flow_fk FOREIGN KEY (tenant_id,flow_id) REFERENCES callcommand_flows(tenant_id,id),
      CONSTRAINT callcommand_setup_channel_fk FOREIGN KEY (tenant_id,channel_id) REFERENCES callcommand_channels(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_setup_pending ON callcommand_setup_orders(tenant_id,created_at DESC)
      WHERE status NOT IN ('ready','canceled');
  `));
}
