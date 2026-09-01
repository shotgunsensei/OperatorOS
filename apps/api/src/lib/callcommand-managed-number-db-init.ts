import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v58: durable, additive managed-number provisioning authority.
 *
 * Provider acquisition and release are external side effects.  These columns
 * and tables intentionally keep the requested operation, provider evidence,
 * billing projection, and reconciliation findings separate so a timeout or
 * process crash cannot be mistaken for either success or failure.
 */
export async function ensureCallCommandManagedNumberTables(): Promise<void> {
  await db.execute(sql.raw(`
    ALTER TABLE callcommand_telephony_accounts
      ADD COLUMN IF NOT EXISTS provisioning_status VARCHAR(32) NOT NULL DEFAULT 'unconfigured',
      ADD COLUMN IF NOT EXISTS compliance_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;
    ALTER TABLE callcommand_telephony_accounts
      DROP CONSTRAINT IF EXISTS callcommand_telephony_provisioning_status_check;
    ALTER TABLE callcommand_telephony_accounts
      ADD CONSTRAINT callcommand_telephony_provisioning_status_check CHECK (
        provisioning_status IN ('unconfigured','requested','provisioning','active','action_required','failed','suspended')
      );
    ALTER TABLE callcommand_telephony_accounts
      DROP CONSTRAINT IF EXISTS callcommand_telephony_compliance_status_check;
    ALTER TABLE callcommand_telephony_accounts
      ADD CONSTRAINT callcommand_telephony_compliance_status_check CHECK (
        compliance_status IN ('unknown','clear','action_required','restricted','suspended')
      );

    ALTER TABLE callcommand_channels
      ADD COLUMN IF NOT EXISTS number_type VARCHAR(24) NOT NULL DEFAULT 'external',
      ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'US',
      ADD COLUMN IF NOT EXISTS provider_region VARCHAR(80),
      ADD COLUMN IF NOT EXISTS provider_locality VARCHAR(120),
      ADD COLUMN IF NOT EXISTS provider_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(40) NOT NULL DEFAULT 'ACTION_REQUIRED',
      ADD COLUMN IF NOT EXISTS billing_status VARCHAR(24) NOT NULL DEFAULT 'inactive',
      ADD COLUMN IF NOT EXISTS billing_grace_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS provider_config_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS release_scheduled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS release_requested_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;
    ALTER TABLE callcommand_channels
      DROP CONSTRAINT IF EXISTS callcommand_channel_number_type_check;
    ALTER TABLE callcommand_channels
      ADD CONSTRAINT callcommand_channel_number_type_check
        CHECK (number_type IN ('local','toll_free','external'));
    ALTER TABLE callcommand_channels
      DROP CONSTRAINT IF EXISTS callcommand_channel_country_code_check;
    ALTER TABLE callcommand_channels
      ADD CONSTRAINT callcommand_channel_country_code_check CHECK (country_code ~ '^[A-Z]{2}$');
    ALTER TABLE callcommand_channels
      DROP CONSTRAINT IF EXISTS callcommand_channel_provider_capabilities_check;
    ALTER TABLE callcommand_channels
      ADD CONSTRAINT callcommand_channel_provider_capabilities_check
        CHECK (jsonb_typeof(provider_capabilities)='object');
    ALTER TABLE callcommand_channels
      DROP CONSTRAINT IF EXISTS callcommand_channel_lifecycle_state_check;
    ALTER TABLE callcommand_channels
      ADD CONSTRAINT callcommand_channel_lifecycle_state_check CHECK (lifecycle_state IN (
        'REQUESTED','PROVISIONING','PROVIDER_PROVISIONED','CONFIGURING_ROUTING',
        'CONFIGURING_BILLING','TESTING','ACTIVE','PROVISION_FAILED','ROUTING_FAILED',
        'BILLING_FAILED','ACTION_REQUIRED','SUSPENDED','RELEASE_PENDING','RELEASED',
        'RECONCILIATION_REQUIRED'
      ));
    ALTER TABLE callcommand_channels
      DROP CONSTRAINT IF EXISTS callcommand_channel_billing_status_check;
    ALTER TABLE callcommand_channels
      ADD CONSTRAINT callcommand_channel_billing_status_check CHECK (billing_status IN (
        'inactive','included','pending','active','past_due','grace_period','suspended','failed','released'
      ));
    ALTER TABLE callcommand_channels
      DROP CONSTRAINT IF EXISTS callcommand_channel_managed_number_consistency_check;
    ALTER TABLE callcommand_channels
      ADD CONSTRAINT callcommand_channel_managed_number_consistency_check CHECK (
        acquisition_mode <> 'platform_provisioned'
        OR (telephony_account_id IS NOT NULL AND number_type IN ('local','toll_free'))
      ) NOT VALID;
    CREATE INDEX IF NOT EXISTS idx_callcommand_channel_lifecycle
      ON callcommand_channels(tenant_id,lifecycle_state,billing_status,updated_at DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_callcommand_channel_release_schedule
      ON callcommand_channels(release_scheduled_at)
      WHERE lifecycle_state='RELEASE_PENDING' AND deleted_at IS NULL;

    ALTER TABLE callcommand_number_orders
      ADD COLUMN IF NOT EXISTS operation_type VARCHAR(24) NOT NULL DEFAULT 'provision',
      ADD COLUMN IF NOT EXISTS number_type VARCHAR(24) NOT NULL DEFAULT 'local',
      ADD COLUMN IF NOT EXISTS requested_phone_e164 VARCHAR(16),
      ADD COLUMN IF NOT EXISTS requested_profile_id VARCHAR(36),
      ADD COLUMN IF NOT EXISTS requested_flow_id VARCHAR(36),
      ADD COLUMN IF NOT EXISTS request_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS provisioning_state VARCHAR(40) NOT NULL DEFAULT 'REQUESTED',
      ADD COLUMN IF NOT EXISTS provider_operation_reference VARCHAR(160),
      ADD COLUMN IF NOT EXISTS error_message_safe VARCHAR(500),
      ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS compensation_status VARCHAR(32) NOT NULL DEFAULT 'not_required',
      ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'not_required',
      ADD COLUMN IF NOT EXISTS expected_billable_local_quantity INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS expected_billable_toll_free_quantity INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(160),
      ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
    ALTER TABLE callcommand_number_orders
      DROP CONSTRAINT IF EXISTS callcommand_number_order_operation_type_check;
    ALTER TABLE callcommand_number_orders
      ADD CONSTRAINT callcommand_number_order_operation_type_check
        CHECK (operation_type IN ('provision','release','repair','reconcile'));
    ALTER TABLE callcommand_number_orders
      DROP CONSTRAINT IF EXISTS callcommand_number_order_number_type_check;
    ALTER TABLE callcommand_number_orders
      ADD CONSTRAINT callcommand_number_order_number_type_check
        CHECK (number_type IN ('local','toll_free','external'));
    ALTER TABLE callcommand_number_orders
      DROP CONSTRAINT IF EXISTS callcommand_number_order_provisioning_state_check;
    ALTER TABLE callcommand_number_orders
      ADD CONSTRAINT callcommand_number_order_provisioning_state_check CHECK (provisioning_state IN (
        'REQUESTED','PROVISIONING','PROVIDER_PROVISIONED','CONFIGURING_ROUTING',
        'CONFIGURING_BILLING','TESTING','ACTIVE','PROVISION_FAILED','ROUTING_FAILED',
        'BILLING_FAILED','ACTION_REQUIRED','SUSPENDED','RELEASE_PENDING','RELEASED',
        'RECONCILIATION_REQUIRED'
      ));
    ALTER TABLE callcommand_number_orders
      DROP CONSTRAINT IF EXISTS callcommand_number_order_compensation_check;
    ALTER TABLE callcommand_number_orders
      ADD CONSTRAINT callcommand_number_order_compensation_check CHECK (
        compensation_status IN ('not_required','pending','completed','failed','manual_review')
      );
    ALTER TABLE callcommand_number_orders
      DROP CONSTRAINT IF EXISTS callcommand_number_order_reconciliation_check;
    ALTER TABLE callcommand_number_orders
      ADD CONSTRAINT callcommand_number_order_reconciliation_check CHECK (
        reconciliation_status IN ('not_required','pending','reconciled','manual_review','failed')
      );
    ALTER TABLE callcommand_number_orders
      DROP CONSTRAINT IF EXISTS callcommand_number_order_retry_check;
    ALTER TABLE callcommand_number_orders
      ADD CONSTRAINT callcommand_number_order_retry_check CHECK (
        retry_count BETWEEN 0 AND 100
        AND expected_billable_local_quantity BETWEEN 0 AND 1000
        AND expected_billable_toll_free_quantity BETWEEN 0 AND 1000
      );
    ALTER TABLE callcommand_number_orders
      DROP CONSTRAINT IF EXISTS callcommand_number_order_profile_fk;
    ALTER TABLE callcommand_number_orders
      ADD CONSTRAINT callcommand_number_order_profile_fk
        FOREIGN KEY (tenant_id,requested_profile_id) REFERENCES callcommand_profiles(tenant_id,id);
    ALTER TABLE callcommand_number_orders
      DROP CONSTRAINT IF EXISTS callcommand_number_order_flow_fk;
    ALTER TABLE callcommand_number_orders
      ADD CONSTRAINT callcommand_number_order_flow_fk
        FOREIGN KEY (tenant_id,requested_flow_id) REFERENCES callcommand_flows(tenant_id,id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_number_order_provider_number_provision
      ON callcommand_number_orders(telephony_account_id,provider_number_sid)
      WHERE operation_type='provision' AND provider_number_sid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_callcommand_number_order_recovery
      ON callcommand_number_orders(provisioning_state,next_retry_at,updated_at)
      WHERE provisioning_state NOT IN ('ACTIVE','RELEASED');

    CREATE TABLE IF NOT EXISTS callcommand_number_billing_entitlements (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      included_local_numbers INTEGER NOT NULL DEFAULT 1,
      active_local_numbers INTEGER NOT NULL DEFAULT 0,
      active_toll_free_numbers INTEGER NOT NULL DEFAULT 0,
      licensed_billable_local_quantity INTEGER NOT NULL DEFAULT 0,
      licensed_billable_toll_free_quantity INTEGER NOT NULL DEFAULT 0,
      pending_billable_local_quantity INTEGER NOT NULL DEFAULT 0,
      pending_billable_toll_free_quantity INTEGER NOT NULL DEFAULT 0,
      effective_billable_local_quantity INTEGER GENERATED ALWAYS AS (
        GREATEST(active_local_numbers-included_local_numbers,0)
      ) STORED,
      effective_billable_toll_free_quantity INTEGER GENERATED ALWAYS AS (active_toll_free_numbers) STORED,
      billing_status VARCHAR(24) NOT NULL DEFAULT 'inactive',
      grace_expires_at TIMESTAMPTZ,
      stripe_customer_id VARCHAR(160),
      stripe_subscription_id VARCHAR(160),
      stripe_local_subscription_item_id VARCHAR(160),
      stripe_toll_free_subscription_item_id VARCHAR(160),
      stripe_local_price_id VARCHAR(160),
      stripe_toll_free_price_id VARCHAR(160),
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      last_stripe_event_created BIGINT NOT NULL DEFAULT 0,
      last_billing_event_id VARCHAR(160),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_number_billing_quantity_check CHECK (
        included_local_numbers BETWEEN 0 AND 10
        AND active_local_numbers BETWEEN 0 AND 1000
        AND active_toll_free_numbers BETWEEN 0 AND 1000
        AND licensed_billable_local_quantity BETWEEN 0 AND 1000
        AND licensed_billable_toll_free_quantity BETWEEN 0 AND 1000
        AND pending_billable_local_quantity BETWEEN 0 AND 1000
        AND pending_billable_toll_free_quantity BETWEEN 0 AND 1000
      ),
      CONSTRAINT callcommand_number_billing_status_check CHECK (billing_status IN (
        'inactive','included','pending','active','past_due','grace_period','suspended','failed','released'
      )),
      CONSTRAINT callcommand_number_billing_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_number_billing_status
      ON callcommand_number_billing_entitlements(billing_status,updated_at DESC);

    CREATE TABLE IF NOT EXISTS callcommand_number_reconciliation_issues (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      telephony_account_id VARCHAR(36),
      channel_id VARCHAR(36),
      order_id VARCHAR(36),
      issue_type VARCHAR(64) NOT NULL,
      resource_key VARCHAR(200) NOT NULL,
      expected_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      actual_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      safe_auto_repair BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error_code VARCHAR(120),
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_attempt_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_number_reconciliation_issue_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_number_issue_account_fk FOREIGN KEY (tenant_id,telephony_account_id)
        REFERENCES callcommand_telephony_accounts(tenant_id,id),
      CONSTRAINT callcommand_number_issue_channel_fk FOREIGN KEY (tenant_id,channel_id)
        REFERENCES callcommand_channels(tenant_id,id),
      CONSTRAINT callcommand_number_issue_order_fk FOREIGN KEY (tenant_id,order_id)
        REFERENCES callcommand_number_orders(tenant_id,id),
      CONSTRAINT callcommand_number_issue_status_check
        CHECK (status IN ('open','repairing','resolved','ignored','manual_review','failed')),
      CONSTRAINT callcommand_number_issue_json_check
        CHECK (jsonb_typeof(expected_json)='object' AND jsonb_typeof(actual_json)='object'),
      CONSTRAINT callcommand_number_issue_retry_check CHECK (retry_count BETWEEN 0 AND 100)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_number_issue_active
      ON callcommand_number_reconciliation_issues(tenant_id,issue_type,resource_key)
      WHERE status IN ('open','repairing','manual_review','failed');
    CREATE INDEX IF NOT EXISTS idx_callcommand_number_issue_queue
      ON callcommand_number_reconciliation_issues(status,safe_auto_repair,detected_at);

    UPDATE callcommand_channels
    SET
      number_type = CASE
        WHEN acquisition_mode='platform_provisioned' AND phone_e164 ~ '^\\+1(800|833|844|855|866|877|888)' THEN 'toll_free'
        WHEN acquisition_mode='platform_provisioned' THEN 'local'
        ELSE 'external'
      END,
      lifecycle_state = CASE
        WHEN provider_number_status='released' OR provisioning_status='released' THEN 'RELEASED'
        WHEN acquisition_mode='platform_provisioned' AND provider_number_status='active' AND provisioning_status='configured' THEN 'ACTIVE'
        WHEN acquisition_mode='platform_provisioned' AND provisioning_status='failed' THEN 'PROVISION_FAILED'
        ELSE 'ACTION_REQUIRED'
      END,
      provisioned_at = CASE
        WHEN acquisition_mode='platform_provisioned' THEN COALESCE(provisioned_at,provider_verified_at,created_at)
        ELSE provisioned_at
      END,
      activated_at = CASE
        WHEN acquisition_mode='platform_provisioned' AND provider_number_status='active' AND provisioning_status='configured'
          THEN COALESCE(activated_at,provider_verified_at,updated_at)
        ELSE activated_at
      END
    WHERE lifecycle_state='ACTION_REQUIRED' OR number_type='external';

    WITH ranked AS (
      SELECT id,tenant_id,number_type,
        ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY COALESCE(activated_at,created_at),id) AS local_position
      FROM callcommand_channels
      WHERE acquisition_mode='platform_provisioned'
        AND lifecycle_state='ACTIVE' AND deleted_at IS NULL
        AND number_type='local'
    )
    UPDATE callcommand_channels AS channel
    SET billing_status = CASE WHEN ranked.local_position=1 THEN 'included' ELSE 'pending' END
    FROM ranked WHERE channel.id=ranked.id AND channel.billing_status='inactive';
    UPDATE callcommand_channels
    SET billing_status='pending'
    WHERE acquisition_mode='platform_provisioned' AND lifecycle_state='ACTIVE'
      AND number_type='toll_free' AND billing_status='inactive';

    INSERT INTO callcommand_number_billing_entitlements(
      tenant_id,active_local_numbers,active_toll_free_numbers,billing_status
    )
    SELECT tenant_id,
      COUNT(*) FILTER (WHERE number_type='local'),
      COUNT(*) FILTER (WHERE number_type='toll_free'),
      CASE
        WHEN COUNT(*) FILTER (WHERE number_type='local') <= 1
          AND COUNT(*) FILTER (WHERE number_type='toll_free') = 0 THEN 'included'
        ELSE 'pending'
      END
    FROM callcommand_channels
    WHERE acquisition_mode='platform_provisioned'
      AND lifecycle_state='ACTIVE' AND deleted_at IS NULL
    GROUP BY tenant_id
    ON CONFLICT (tenant_id) DO UPDATE SET
      active_local_numbers=EXCLUDED.active_local_numbers,
      active_toll_free_numbers=EXCLUDED.active_toll_free_numbers,
      billing_status=CASE
        WHEN callcommand_number_billing_entitlements.billing_status IN ('active','grace_period','past_due','suspended')
          THEN callcommand_number_billing_entitlements.billing_status
        ELSE EXCLUDED.billing_status
      END,
      version=callcommand_number_billing_entitlements.version+1,
      updated_at=NOW();
  `));
}
