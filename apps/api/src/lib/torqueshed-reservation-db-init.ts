import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Phase 45 additive reservation contract.
 *
 * A reservation is mutable coordination state; the token ledger remains the
 * immutable financial/usage record. Only a settled reservation may have a
 * debit, and the existing unique assist-request debit index makes settlement
 * exactly once.
 */
export async function ensureTorqueShedReservationContract(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE torqueshed_assist_requests
      ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS provider_receipt_json JSONB,
      ADD COLUMN IF NOT EXISTS failure_details_json JSONB;

    ALTER TABLE torqueshed_assist_requests
      DROP CONSTRAINT IF EXISTS torqueshed_assist_status_check;
    ALTER TABLE torqueshed_assist_requests
      ADD CONSTRAINT torqueshed_assist_status_check CHECK (status IN (
        'reserved','processing','follow_up','complete','provider_failed',
        'response_invalid','insufficient_balance','expired','cancelled'
      ));
    ALTER TABLE torqueshed_assist_requests
      DROP CONSTRAINT IF EXISTS torqueshed_assist_provider_receipt_check;
    ALTER TABLE torqueshed_assist_requests
      ADD CONSTRAINT torqueshed_assist_provider_receipt_check CHECK (
        provider_receipt_json IS NULL OR jsonb_typeof(provider_receipt_json)='object'
      );
    ALTER TABLE torqueshed_assist_requests
      DROP CONSTRAINT IF EXISTS torqueshed_assist_failure_details_check;
    ALTER TABLE torqueshed_assist_requests
      ADD CONSTRAINT torqueshed_assist_failure_details_check CHECK (
        failure_details_json IS NULL OR jsonb_typeof(failure_details_json)='object'
      );

    CREATE TABLE IF NOT EXISTS torqueshed_token_reservations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      diagnostic_session_id VARCHAR(36) NOT NULL,
      assist_request_id VARCHAR(36) NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      reserved_units BIGINT NOT NULL,
      consumed_units BIGINT NOT NULL DEFAULT 0,
      released_units BIGINT NOT NULL DEFAULT 0,
      release_reason VARCHAR(120),
      correlation_id VARCHAR(120) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      settled_at TIMESTAMP,
      released_at TIMESTAMP,
      expired_at TIMESTAMP,
      CONSTRAINT uq_torqueshed_token_reservation_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_torqueshed_token_reservation_request UNIQUE (tenant_id,assist_request_id),
      CONSTRAINT uq_torqueshed_token_reservation_idempotency UNIQUE (tenant_id,user_id,idempotency_key),
      CONSTRAINT torqueshed_token_reservation_session_fk
        FOREIGN KEY (tenant_id,diagnostic_session_id)
        REFERENCES torqueshed_diagnostic_sessions(tenant_id,id),
      CONSTRAINT torqueshed_token_reservation_request_fk
        FOREIGN KEY (tenant_id,assist_request_id)
        REFERENCES torqueshed_assist_requests(tenant_id,id),
      CONSTRAINT torqueshed_token_reservation_status_check
        CHECK (status IN ('active','settled','released','expired')),
      CONSTRAINT torqueshed_token_reservation_units_check CHECK (
        reserved_units > 0 AND consumed_units >= 0 AND released_units >= 0
        AND consumed_units + released_units <= reserved_units
      ),
      CONSTRAINT torqueshed_token_reservation_terminal_check CHECK (
        (status='active' AND settled_at IS NULL AND released_at IS NULL AND expired_at IS NULL)
        OR (status='settled' AND settled_at IS NOT NULL AND consumed_units > 0
          AND consumed_units + released_units = reserved_units)
        OR (status='released' AND released_at IS NOT NULL AND consumed_units = 0
          AND released_units = reserved_units)
        OR (status='expired' AND expired_at IS NOT NULL AND consumed_units = 0
          AND released_units = reserved_units)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_token_reservation_available
      ON torqueshed_token_reservations(tenant_id,module_id,user_id,expires_at)
      WHERE status='active';
    CREATE INDEX IF NOT EXISTS idx_torqueshed_token_reservation_reaper
      ON torqueshed_token_reservations(status,expires_at)
      WHERE status='active';
  `);
}
