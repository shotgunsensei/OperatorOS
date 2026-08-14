import { db } from '../db.js';

/**
 * Phase 38 additive cross-module data fabric.
 *
 * These tables coordinate module-owned records; they never become a second
 * owner of those records. Every row is tenant-bound, every destination is a
 * registered OperatorOS module, and immutable events retain signed provenance.
 */
export async function ensureCrossModuleDataFabricTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shared_resource_references (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      resource_kind VARCHAR(32) NOT NULL,
      resource_type VARCHAR(100) NOT NULL,
      resource_id VARCHAR(160) NOT NULL,
      canonical_type VARCHAR(80),
      canonical_id VARCHAR(160),
      deep_link VARCHAR(1000) NOT NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT uq_shared_resource_reference_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_shared_resource_reference_native UNIQUE (tenant_id,module_id,resource_type,resource_id),
      CONSTRAINT shared_resource_reference_kind_check CHECK (resource_kind IN (
        'organization','site','contact','requester','user','team','vehicle','asset','configuration_item',
        'attachment','evidence','ticket','job','case','report','content','provider','account','lead','campaign','script','runbook'
      )),
      CONSTRAINT shared_resource_reference_status_check CHECK (status IN ('active','archived','revoked')),
      CONSTRAINT shared_resource_reference_deep_link_check CHECK (deep_link ~ '^/[A-Za-z0-9_?=&%./:#-]+$' AND deep_link !~ '^//'),
      CONSTRAINT shared_resource_reference_metadata_check CHECK (jsonb_typeof(metadata_json)='object'),
      CONSTRAINT shared_resource_reference_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_resource_reference_lookup
      ON shared_resource_references(tenant_id,module_id,resource_kind,status);
    CREATE INDEX IF NOT EXISTS idx_shared_resource_reference_canonical
      ON shared_resource_references(tenant_id,canonical_type,canonical_id) WHERE canonical_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS shared_workflow_rules (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      source_module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      destination_module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      source_event_type VARCHAR(120) NOT NULL,
      workflow_key VARCHAR(120) NOT NULL,
      conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      priority INTEGER NOT NULL DEFAULT 100,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT uq_shared_workflow_rule_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_shared_workflow_rule_name UNIQUE (tenant_id,name),
      CONSTRAINT shared_workflow_rule_modules_check CHECK (source_module_id <> destination_module_id),
      CONSTRAINT shared_workflow_rule_json_check CHECK (jsonb_typeof(conditions_json)='object' AND jsonb_typeof(configuration_json)='object'),
      CONSTRAINT shared_workflow_rule_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_workflow_rule_event
      ON shared_workflow_rules(tenant_id,source_module_id,source_event_type,priority) WHERE enabled=TRUE AND archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS shared_workflow_runs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_key VARCHAR(120) NOT NULL,
      source_module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      destination_module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      actor_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      source_reference_id VARCHAR(36),
      destination_reference_id VARCHAR(36),
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      idempotency_key VARCHAR(180) NOT NULL,
      correlation_id VARCHAR(120) NOT NULL,
      causation_id VARCHAR(120),
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error_code VARCHAR(100),
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_shared_workflow_run_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_shared_workflow_run_key UNIQUE (tenant_id,workflow_key,idempotency_key),
      CONSTRAINT shared_workflow_run_source_fk FOREIGN KEY (tenant_id,source_reference_id) REFERENCES shared_resource_references(tenant_id,id),
      CONSTRAINT shared_workflow_run_destination_fk FOREIGN KEY (tenant_id,destination_reference_id) REFERENCES shared_resource_references(tenant_id,id),
      CONSTRAINT shared_workflow_run_modules_check CHECK (source_module_id <> destination_module_id),
      CONSTRAINT shared_workflow_run_status_check CHECK (status IN ('queued','running','completed','partial','compensated','dead_letter','cancelled')),
      CONSTRAINT shared_workflow_run_retry_check CHECK (retry_count >= 0),
      CONSTRAINT shared_workflow_run_details_check CHECK (jsonb_typeof(details_json)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_shared_workflow_run_activity
      ON shared_workflow_runs(tenant_id,updated_at DESC,id DESC);

    CREATE TABLE IF NOT EXISTS shared_domain_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_run_id VARCHAR(36) NOT NULL,
      source_module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      event_type VARCHAR(120) NOT NULL,
      event_version INTEGER NOT NULL DEFAULT 1,
      aggregate_type VARCHAR(100) NOT NULL,
      aggregate_id VARCHAR(160) NOT NULL,
      aggregate_sequence INTEGER NOT NULL,
      source_deep_link VARCHAR(1000) NOT NULL,
      actor_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      payload_json JSONB NOT NULL,
      payload_sha256 CHAR(64) NOT NULL,
      signature_hmac_sha256 CHAR(64) NOT NULL,
      signing_key_version VARCHAR(80) NOT NULL,
      idempotency_key VARCHAR(180) NOT NULL,
      correlation_id VARCHAR(120) NOT NULL,
      causation_id VARCHAR(120),
      root_event_id VARCHAR(36),
      propagation_depth INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dispatched_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      CONSTRAINT uq_shared_domain_event_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT shared_domain_event_run_fk FOREIGN KEY (tenant_id,workflow_run_id) REFERENCES shared_workflow_runs(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT shared_domain_event_root_fk FOREIGN KEY (tenant_id,root_event_id) REFERENCES shared_domain_events(tenant_id,id),
      CONSTRAINT uq_shared_domain_event_idempotency UNIQUE (tenant_id,source_module_id,event_type,idempotency_key),
      CONSTRAINT uq_shared_domain_event_sequence UNIQUE (tenant_id,source_module_id,aggregate_type,aggregate_id,aggregate_sequence),
      CONSTRAINT shared_domain_event_version_check CHECK (event_version >= 1 AND aggregate_sequence >= 1),
      CONSTRAINT shared_domain_event_depth_check CHECK (propagation_depth BETWEEN 0 AND 12),
      CONSTRAINT shared_domain_event_payload_check CHECK (jsonb_typeof(payload_json)='object'),
      CONSTRAINT shared_domain_event_hash_check CHECK (payload_sha256 ~ '^[0-9a-f]{64}$' AND signature_hmac_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT shared_domain_event_link_check CHECK (source_deep_link ~ '^/[A-Za-z0-9_?=&%./:#-]+$' AND source_deep_link !~ '^//'),
      CONSTRAINT shared_domain_event_status_check CHECK (status IN ('pending','dispatching','delivered','partial','dead_letter','cancelled'))
    );
    CREATE INDEX IF NOT EXISTS idx_shared_domain_event_outbox
      ON shared_domain_events(status,occurred_at,id);

    CREATE TABLE IF NOT EXISTS shared_event_inbox (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      event_id VARCHAR(36) NOT NULL,
      workflow_run_id VARCHAR(36) NOT NULL,
      destination_module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      consumer_key VARCHAR(120) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      replay_count INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_owner VARCHAR(160),
      lease_expires_at TIMESTAMPTZ,
      last_error_code VARCHAR(100),
      result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      CONSTRAINT uq_shared_event_inbox_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT shared_event_inbox_event_fk FOREIGN KEY (tenant_id,event_id) REFERENCES shared_domain_events(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT shared_event_inbox_run_fk FOREIGN KEY (tenant_id,workflow_run_id) REFERENCES shared_workflow_runs(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT uq_shared_event_inbox_consumer UNIQUE (tenant_id,event_id,destination_module_id,consumer_key),
      CONSTRAINT shared_event_inbox_status_check CHECK (status IN ('pending','processing','retry','completed','dead_letter','cancelled')),
      CONSTRAINT shared_event_inbox_attempt_check CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 20 AND replay_count >= 0),
      CONSTRAINT shared_event_inbox_result_check CHECK (jsonb_typeof(result_json)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_shared_event_inbox_delivery
      ON shared_event_inbox(status,available_at,id);

    CREATE TABLE IF NOT EXISTS shared_resource_links (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_run_id VARCHAR(36) NOT NULL,
      event_id VARCHAR(36) NOT NULL,
      source_reference_id VARCHAR(36) NOT NULL,
      destination_reference_id VARCHAR(36) NOT NULL,
      relationship VARCHAR(100) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_resource_link_run_fk FOREIGN KEY (tenant_id,workflow_run_id) REFERENCES shared_workflow_runs(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT shared_resource_link_event_fk FOREIGN KEY (tenant_id,event_id) REFERENCES shared_domain_events(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT shared_resource_link_source_fk FOREIGN KEY (tenant_id,source_reference_id) REFERENCES shared_resource_references(tenant_id,id),
      CONSTRAINT shared_resource_link_destination_fk FOREIGN KEY (tenant_id,destination_reference_id) REFERENCES shared_resource_references(tenant_id,id),
      CONSTRAINT uq_shared_resource_link UNIQUE (tenant_id,source_reference_id,destination_reference_id,relationship),
      CONSTRAINT shared_resource_link_not_self CHECK (source_reference_id <> destination_reference_id),
      CONSTRAINT shared_resource_link_metadata_check CHECK (jsonb_typeof(metadata_json)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_shared_resource_link_source ON shared_resource_links(tenant_id,source_reference_id);
    CREATE INDEX IF NOT EXISTS idx_shared_resource_link_destination ON shared_resource_links(tenant_id,destination_reference_id);

    CREATE TABLE IF NOT EXISTS shared_workflow_compensations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_run_id VARCHAR(36) NOT NULL,
      reason_code VARCHAR(100) NOT NULL,
      action VARCHAR(80) NOT NULL,
      state VARCHAR(24) NOT NULL DEFAULT 'completed',
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_workflow_compensation_run_fk FOREIGN KEY (tenant_id,workflow_run_id) REFERENCES shared_workflow_runs(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT shared_workflow_compensation_action_check CHECK (action IN ('source_unchanged','partial_artifact_not_linked','destination_reference_revoked','manual_review_required')),
      CONSTRAINT shared_workflow_compensation_state_check CHECK (state IN ('completed','manual_review')),
      CONSTRAINT shared_workflow_compensation_details_check CHECK (jsonb_typeof(details_json)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_shared_workflow_compensation_run ON shared_workflow_compensations(tenant_id,workflow_run_id,created_at);

    ALTER TABLE snapproof_customers ADD COLUMN IF NOT EXISTS directory_organization_id VARCHAR(36);
    ALTER TABLE snapproof_customers ADD COLUMN IF NOT EXISTS directory_site_id VARCHAR(36);
    ALTER TABLE snapproof_customers ADD COLUMN IF NOT EXISTS directory_contact_id VARCHAR(36);
    DO $$ BEGIN
      ALTER TABLE snapproof_customers ADD CONSTRAINT snapproof_customer_directory_org_fk
        FOREIGN KEY (tenant_id,directory_organization_id) REFERENCES directory_organizations(tenant_id,id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE snapproof_customers ADD CONSTRAINT snapproof_customer_directory_site_fk
        FOREIGN KEY (tenant_id,directory_site_id) REFERENCES directory_sites(tenant_id,id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE snapproof_customers ADD CONSTRAINT snapproof_customer_directory_contact_fk
        FOREIGN KEY (tenant_id,directory_contact_id) REFERENCES directory_contacts(tenant_id,id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE snapproof_customers ADD CONSTRAINT snapproof_customer_directory_site_org_fk
        FOREIGN KEY (tenant_id,directory_organization_id,directory_site_id) REFERENCES directory_sites(tenant_id,organization_id,id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE snapproof_customers ADD CONSTRAINT snapproof_customer_directory_site_org_check
        CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS idx_snapproof_customer_directory
      ON snapproof_customers(tenant_id,directory_organization_id,directory_site_id) WHERE archived_at IS NULL;
  `);
}
