import { db } from '../db.js';

/** Phase 44 additive provider evidence and refund/dispute policy state. */
export async function ensureTorqueShedSettlementContract(): Promise<void> {
  await db.execute(`
    ALTER TABLE operatoros_token_purchase_intents
      ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(200),
      ADD COLUMN IF NOT EXISTS provider_charge_id VARCHAR(200),
      ADD COLUMN IF NOT EXISTS settled_provider_event_id VARCHAR(200),
      ADD COLUMN IF NOT EXISTS settlement_policy_state VARCHAR(40) NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS settlement_policy_units BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_provider_event_at TIMESTAMPTZ;

    ALTER TABLE operatoros_token_purchase_intents
      DROP CONSTRAINT IF EXISTS operatoros_token_purchase_policy_state_check;
    ALTER TABLE operatoros_token_purchase_intents
      ADD CONSTRAINT operatoros_token_purchase_policy_state_check CHECK (
        settlement_policy_state IN ('none','refund_review','dispute_frozen','dispute_lost')
      );
    ALTER TABLE operatoros_token_purchase_intents
      DROP CONSTRAINT IF EXISTS operatoros_token_purchase_policy_units_check;
    ALTER TABLE operatoros_token_purchase_intents
      ADD CONSTRAINT operatoros_token_purchase_policy_units_check CHECK (settlement_policy_units >= 0);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_operatoros_token_purchase_payment_intent
      ON operatoros_token_purchase_intents(provider,provider_mode,payment_intent_id)
      WHERE payment_intent_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS torqueshed_credit_policy_holds (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      purchase_intent_id VARCHAR(36) NOT NULL,
      hold_kind VARCHAR(30) NOT NULL,
      units BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      reason_code VARCHAR(120) NOT NULL,
      provider_event_id VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      CONSTRAINT uq_torqueshed_credit_policy_hold UNIQUE (tenant_id,purchase_intent_id,hold_kind),
      CONSTRAINT torqueshed_credit_policy_hold_purchase_fk
        FOREIGN KEY (tenant_id,purchase_intent_id)
        REFERENCES operatoros_token_purchase_intents(tenant_id,id),
      CONSTRAINT torqueshed_credit_policy_hold_kind_check
        CHECK (hold_kind IN ('refund_debt','dispute_freeze')),
      CONSTRAINT torqueshed_credit_policy_hold_status_check
        CHECK (status IN ('open','resolved')),
      CONSTRAINT torqueshed_credit_policy_hold_units_check CHECK (units >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_credit_policy_holds_open
      ON torqueshed_credit_policy_holds(tenant_id,user_id,module_id,updated_at DESC)
      WHERE status='open';
  `);
}
