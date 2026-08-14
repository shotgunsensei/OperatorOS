import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Additive CallCommand MSP intake and shared MSP Automation Fabric schema.
 *
 * Directory organizations, contacts, sites, OperatorOS tenants/users/modules,
 * shared secret references, shared jobs/outbox, usage and platform audit remain
 * authoritative. These tables hold only CallCommand relationship, policy and
 * evidence records, with tenant-bearing composite foreign keys throughout.
 */
export async function ensureCallCommandMspTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS callcommand_msp_settings (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      automation_mode TEXT NOT NULL DEFAULT 'TICKET_ONLY',
      incident_mode BOOLEAN NOT NULL DEFAULT FALSE,
      password_reset_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      datto_actions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      recording_default TEXT NOT NULL DEFAULT 'OFF',
      transcript_retention_hours INTEGER NOT NULL DEFAULT 24,
      allowed_challenge_methods JSONB NOT NULL DEFAULT '["PASSKEY","TOTP","PUSH","SMS"]'::jsonb,
      policy_version VARCHAR(80) NOT NULL DEFAULT 'callcommand-msp-strict-1.0.0',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_msp_automation_mode_check CHECK (automation_mode IN ('TICKET_ONLY','READ_ONLY','STANDARD','MANUAL_ONLY')),
      CONSTRAINT callcommand_msp_recording_default_check CHECK (recording_default IN ('OFF','CONSENT_REQUIRED')),
      CONSTRAINT callcommand_msp_retention_check CHECK (transcript_retention_hours BETWEEN 0 AND 720),
      CONSTRAINT callcommand_msp_challenge_methods_check CHECK (jsonb_typeof(allowed_challenge_methods)='array')
    );

    CREATE TABLE IF NOT EXISTS callcommand_organization_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36) NOT NULL,
      support_tier VARCHAR(80),
      support_contract_status TEXT NOT NULL DEFAULT 'ACTIVE',
      automation_mode TEXT NOT NULL DEFAULT 'TICKET_ONLY',
      incident_mode BOOLEAN NOT NULL DEFAULT FALSE,
      after_hours_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
      bms_account_external_id VARCHAR(200),
      policy_template VARCHAR(80) NOT NULL DEFAULT 'STANDARD',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_org_profile_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT uq_callcommand_org_profile UNIQUE (tenant_id,organization_id),
      CONSTRAINT uq_callcommand_org_profile_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_org_profile_contract_check CHECK (support_contract_status IN ('ACTIVE','SUSPENDED','EXPIRED')),
      CONSTRAINT callcommand_org_profile_mode_check CHECK (automation_mode IN ('TICKET_ONLY','READ_ONLY','STANDARD','MANUAL_ONLY')),
      CONSTRAINT callcommand_org_profile_policy_check CHECK (policy_template IN ('STANDARD','HEALTHCARE_STRICT','CUSTOM')),
      CONSTRAINT callcommand_org_profile_status_check CHECK (status IN ('ACTIVE','INACTIVE','PILOT')),
      CONSTRAINT callcommand_org_profile_after_hours_check CHECK (jsonb_typeof(after_hours_policy)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_org_profile_status ON callcommand_organization_profiles(tenant_id,status,updated_at DESC);

    CREATE TABLE IF NOT EXISTS automation_fabric_integrations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36),
      provider_type TEXT NOT NULL,
      label VARCHAR(160) NOT NULL,
      mode TEXT NOT NULL DEFAULT 'DISABLED',
      public_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      secret_reference_id VARCHAR(36),
      secret_version VARCHAR(40),
      schema_fingerprint CHAR(64),
      status TEXT NOT NULL DEFAULT 'BLOCKED',
      health_reason_code VARCHAR(120) NOT NULL DEFAULT 'PROVIDER_DISABLED',
      last_health_at TIMESTAMPTZ,
      last_rotated_at TIMESTAMPTZ,
      circuit_open_until TIMESTAMPTZ,
      kill_switch BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT automation_fabric_integration_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT automation_fabric_integration_secret_fk FOREIGN KEY (tenant_id,secret_reference_id) REFERENCES shared_secret_references(tenant_id,id),
      CONSTRAINT uq_automation_fabric_integration UNIQUE NULLS NOT DISTINCT (tenant_id,organization_id,provider_type),
      CONSTRAINT uq_automation_fabric_integration_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT automation_fabric_provider_type_check CHECK (provider_type IN ('BMS','DATTO_RMM','MICROSOFT_GRAPH','AD_BROKER','TWILIO_VERIFY')),
      CONSTRAINT automation_fabric_mode_check CHECK (mode IN ('DISABLED','TEST','LIVE')),
      CONSTRAINT automation_fabric_status_check CHECK (status IN ('READY','DEGRADED','BLOCKED','CIRCUIT_OPEN')),
      CONSTRAINT automation_fabric_public_config_check CHECK (jsonb_typeof(public_config)='object'),
      CONSTRAINT automation_fabric_schema_hash_check CHECK (schema_fingerprint IS NULL OR schema_fingerprint ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX IF NOT EXISTS idx_automation_fabric_integration_health ON automation_fabric_integrations(tenant_id,provider_type,status,updated_at DESC);

    CREATE TABLE IF NOT EXISTS callcommand_trusted_originating_lines (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36) NOT NULL,
      site_id VARCHAR(36),
      phone_secret_reference_id VARCHAR(36) NOT NULL,
      lookup_hmac CHAR(64) NOT NULL,
      display_last4 CHAR(4) NOT NULL,
      line_type TEXT NOT NULL,
      trust_mode TEXT NOT NULL DEFAULT 'STRICT',
      allows_automation BOOLEAN NOT NULL DEFAULT FALSE,
      verification_method VARCHAR(120),
      verification_evidence TEXT,
      verified_at TIMESTAMPTZ,
      verified_by_user_id VARCHAR(36) REFERENCES users(id),
      cooldown_until TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'PENDING',
      risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_trusted_line_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT callcommand_trusted_line_site_fk FOREIGN KEY (tenant_id,site_id) REFERENCES directory_sites(tenant_id,id),
      CONSTRAINT callcommand_trusted_line_secret_fk FOREIGN KEY (tenant_id,phone_secret_reference_id) REFERENCES shared_secret_references(tenant_id,id),
      CONSTRAINT uq_callcommand_trusted_line_lookup UNIQUE (tenant_id,lookup_hmac),
      CONSTRAINT uq_callcommand_trusted_line_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_trusted_line_hash_check CHECK (lookup_hmac ~ '^[0-9a-f]{64}$'),
      CONSTRAINT callcommand_trusted_line_last4_check CHECK (display_last4 ~ '^\\d{4}$'),
      CONSTRAINT callcommand_trusted_line_type_check CHECK (line_type IN ('MAIN','BRANCH','PBX_OUTBOUND','DIRECT_DID','SIP_TRUNK')),
      CONSTRAINT callcommand_trusted_line_mode_check CHECK (trust_mode IN ('STRICT','RISK_SIGNAL','CALLBACK_ONLY')),
      CONSTRAINT callcommand_trusted_line_status_check CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','REVOKED')),
      CONSTRAINT callcommand_trusted_line_risk_check CHECK (jsonb_typeof(risk_flags)='array')
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_trusted_line_org ON callcommand_trusted_originating_lines(tenant_id,organization_id,status,updated_at DESC);

    CREATE TABLE IF NOT EXISTS callcommand_contact_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL,
      bms_contact_external_id VARCHAR(200),
      support_eligible BOOLEAN NOT NULL DEFAULT TRUE,
      eligible_for_phone_reset BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      last_failed_at TIMESTAMPTZ,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_contact_profile_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT callcommand_contact_profile_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT uq_callcommand_contact_profile UNIQUE (tenant_id,organization_id,contact_id),
      CONSTRAINT uq_callcommand_contact_profile_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_contact_profile_status_check CHECK (status IN ('ACTIVE','INACTIVE','TERMINATED')),
      CONSTRAINT callcommand_contact_failed_check CHECK (failed_attempts >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_contact_profile_org ON callcommand_contact_profiles(tenant_id,organization_id,status);

    CREATE TABLE IF NOT EXISTS callcommand_support_links (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL,
      secret_reference_id VARCHAR(36) NOT NULL,
      lookup_hmac CHAR(64) NOT NULL,
      last4 CHAR(4) NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_ISSUANCE',
      issued_at TIMESTAMPTZ,
      activated_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      locked_until TIMESTAMPTZ,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      replaced_by_id VARCHAR(36),
      revoked_at TIMESTAMPTZ,
      revoke_reason TEXT,
      issued_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_support_link_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT callcommand_support_link_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT callcommand_support_link_secret_fk FOREIGN KEY (tenant_id,secret_reference_id) REFERENCES shared_secret_references(tenant_id,id),
      CONSTRAINT callcommand_support_link_replacement_fk FOREIGN KEY (tenant_id,replaced_by_id) REFERENCES callcommand_support_links(tenant_id,id),
      CONSTRAINT uq_callcommand_support_link_lookup UNIQUE (tenant_id,lookup_hmac),
      CONSTRAINT uq_callcommand_support_link_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_callcommand_support_link_contact_active UNIQUE NULLS NOT DISTINCT (tenant_id,contact_id,revoked_at),
      CONSTRAINT callcommand_support_link_hash_check CHECK (lookup_hmac ~ '^[0-9a-f]{64}$'),
      CONSTRAINT callcommand_support_link_last4_check CHECK (last4 ~ '^\\d{4}$'),
      CONSTRAINT callcommand_support_link_status_check CHECK (status IN ('PENDING_ISSUANCE','ACTIVE','TEMPORARILY_LOCKED','SUSPENDED','REVOKED','REPLACED','EXPIRED')),
      CONSTRAINT callcommand_support_link_attempt_check CHECK (failed_attempts >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_support_link_contact ON callcommand_support_links(tenant_id,organization_id,contact_id,status);

    CREATE TABLE IF NOT EXISTS callcommand_verification_methods (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      contact_id VARCHAR(36) NOT NULL,
      method_type TEXT NOT NULL,
      destination_secret_reference_id VARCHAR(36),
      destination_last4 VARCHAR(8),
      provider_reference VARCHAR(200),
      verified_at TIMESTAMPTZ NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cooldown_until TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_verification_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT callcommand_verification_secret_fk FOREIGN KEY (tenant_id,destination_secret_reference_id) REFERENCES shared_secret_references(tenant_id,id),
      CONSTRAINT uq_callcommand_verification_method UNIQUE (tenant_id,contact_id,method_type),
      CONSTRAINT uq_callcommand_verification_method_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_verification_type_check CHECK (method_type IN ('PASSKEY','TOTP','PUSH','SMS','EMAIL','MANAGER_APPROVAL')),
      CONSTRAINT callcommand_verification_status_check CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED'))
    );

    CREATE TABLE IF NOT EXISTS automation_fabric_datto_sites (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36) NOT NULL,
      integration_id VARCHAR(36) NOT NULL,
      external_site_uid VARCHAR(200) NOT NULL,
      name VARCHAR(200) NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT automation_fabric_site_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT automation_fabric_site_integration_fk FOREIGN KEY (tenant_id,integration_id) REFERENCES automation_fabric_integrations(tenant_id,id),
      CONSTRAINT uq_automation_fabric_site UNIQUE (tenant_id,integration_id,external_site_uid),
      CONSTRAINT uq_automation_fabric_site_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT automation_fabric_site_status_check CHECK (status IN ('ACTIVE','INACTIVE','DELETED'))
    );

    CREATE TABLE IF NOT EXISTS automation_fabric_devices (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36) NOT NULL,
      datto_site_id VARCHAR(36) NOT NULL,
      external_device_uid VARCHAR(200) NOT NULL,
      hostname_secret_reference_id VARCHAR(36),
      hostname_last4 VARCHAR(8),
      asset_last4 VARCHAR(8),
      device_class VARCHAR(40) NOT NULL,
      operating_system VARCHAR(80) NOT NULL,
      last_seen_at TIMESTAMPTZ,
      online BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT automation_fabric_device_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT automation_fabric_device_site_fk FOREIGN KEY (tenant_id,datto_site_id) REFERENCES automation_fabric_datto_sites(tenant_id,id),
      CONSTRAINT automation_fabric_device_hostname_fk FOREIGN KEY (tenant_id,hostname_secret_reference_id) REFERENCES shared_secret_references(tenant_id,id),
      CONSTRAINT uq_automation_fabric_device UNIQUE (tenant_id,datto_site_id,external_device_uid),
      CONSTRAINT uq_automation_fabric_device_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT automation_fabric_device_class_check CHECK (device_class IN ('desktop','laptop','server','other')),
      CONSTRAINT automation_fabric_device_status_check CHECK (status IN ('ACTIVE','INACTIVE','DELETED'))
    );
    CREATE INDEX IF NOT EXISTS idx_automation_fabric_device_org ON automation_fabric_devices(tenant_id,organization_id,status,last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS automation_fabric_directory_accounts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL,
      integration_id VARCHAR(36) NOT NULL,
      external_object_id VARCHAR(200) NOT NULL,
      upn_secret_reference_id VARCHAR(36),
      upn_last_domain VARCHAR(200),
      account_class TEXT NOT NULL DEFAULT 'UNKNOWN',
      eligible_for_reset BOOLEAN NOT NULL DEFAULT FALSE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      protected_group_evidence BOOLEAN NOT NULL DEFAULT FALSE,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT automation_fabric_account_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT automation_fabric_account_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT automation_fabric_account_integration_fk FOREIGN KEY (tenant_id,integration_id) REFERENCES automation_fabric_integrations(tenant_id,id),
      CONSTRAINT automation_fabric_account_upn_fk FOREIGN KEY (tenant_id,upn_secret_reference_id) REFERENCES shared_secret_references(tenant_id,id),
      CONSTRAINT uq_automation_fabric_account UNIQUE (tenant_id,integration_id,external_object_id),
      CONSTRAINT uq_automation_fabric_account_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT automation_fabric_account_class_check CHECK (account_class IN ('STANDARD','PRIVILEGED','SERVICE','SHARED','BREAK_GLASS','UNKNOWN','TERMINATED'))
    );

    CREATE TABLE IF NOT EXISTS automation_fabric_device_affinities (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL,
      device_id VARCHAR(36) NOT NULL,
      confidence TEXT NOT NULL,
      evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_confirmed_at TIMESTAMPTZ,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_user_id VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT automation_fabric_affinity_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT automation_fabric_affinity_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT automation_fabric_affinity_device_fk FOREIGN KEY (tenant_id,device_id) REFERENCES automation_fabric_devices(tenant_id,id),
      CONSTRAINT uq_automation_fabric_affinity UNIQUE (tenant_id,contact_id,device_id),
      CONSTRAINT uq_automation_fabric_affinity_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT automation_fabric_affinity_confidence_check CHECK (confidence IN ('NONE','LOW','MEDIUM','HIGH')),
      CONSTRAINT automation_fabric_affinity_evidence_check CHECK (jsonb_typeof(evidence)='array')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_fabric_primary_device ON automation_fabric_device_affinities(tenant_id,contact_id) WHERE is_primary=TRUE;

    CREATE TABLE IF NOT EXISTS automation_fabric_action_catalog (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      action_key VARCHAR(120) NOT NULL,
      display_name VARCHAR(160) NOT NULL,
      provider TEXT NOT NULL,
      component_uid VARCHAR(200),
      component_version VARCHAR(40) NOT NULL,
      source_commit VARCHAR(64) NOT NULL,
      risk_class TEXT NOT NULL,
      allowed_device_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
      allowed_operating_systems JSONB NOT NULL DEFAULT '[]'::jsonb,
      minimum_assurance TEXT NOT NULL,
      requires_caller_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
      requires_technician_approval BOOLEAN NOT NULL DEFAULT FALSE,
      must_be_online BOOLEAN NOT NULL DEFAULT TRUE,
      allow_offline_queue BOOLEAN NOT NULL DEFAULT FALSE,
      expires_after_seconds INTEGER NOT NULL,
      maximum_runtime_seconds INTEGER NOT NULL,
      parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
      result_schema VARCHAR(120) NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      approved_by_user_id VARCHAR(36) REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_automation_fabric_action_key UNIQUE (tenant_id,action_key),
      CONSTRAINT uq_automation_fabric_action_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT automation_fabric_action_provider_check CHECK (provider IN ('DATTO_RMM','MICROSOFT_GRAPH','AD_BROKER','BMS')),
      CONSTRAINT automation_fabric_action_risk_check CHECK (risk_class IN ('R0_READ_ONLY','R1_REVERSIBLE_WORKSTATION','R2_DISRUPTIVE_WORKSTATION','R3_INFRASTRUCTURE_SECURITY','R4_DESTRUCTIVE_PRIVILEGE')),
      CONSTRAINT automation_fabric_action_assurance_check CHECK (minimum_assurance IN ('A0','A1','A2','A3','A4')),
      CONSTRAINT automation_fabric_action_status_check CHECK (status IN ('DRAFT','ACTIVE','DISABLED','RETIRED')),
      CONSTRAINT automation_fabric_action_duration_check CHECK (expires_after_seconds BETWEEN 60 AND 3600 AND maximum_runtime_seconds BETWEEN 10 AND 1800),
      CONSTRAINT automation_fabric_action_json_check CHECK (jsonb_typeof(allowed_device_classes)='array' AND jsonb_typeof(allowed_operating_systems)='array' AND jsonb_typeof(parameter_schema)='object')
    );

    CREATE TABLE IF NOT EXISTS callcommand_tenant_action_policies (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      organization_id VARCHAR(36),
      action_key VARCHAR(120) NOT NULL,
      policy_version VARCHAR(80) NOT NULL,
      rule_document JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_action_policy_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT callcommand_action_policy_catalog_fk FOREIGN KEY (tenant_id,action_key) REFERENCES automation_fabric_action_catalog(tenant_id,action_key),
      CONSTRAINT uq_callcommand_action_policy UNIQUE NULLS NOT DISTINCT (tenant_id,organization_id,action_key),
      CONSTRAINT uq_callcommand_action_policy_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_action_policy_status_check CHECK (status IN ('ACTIVE','DISABLED','RETIRED')),
      CONSTRAINT callcommand_action_policy_json_check CHECK (jsonb_typeof(rule_document)='object')
    );

    CREATE TABLE IF NOT EXISTS callcommand_msp_call_contexts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL,
      organization_id VARCHAR(36),
      contact_id VARCHAR(36),
      originating_line_id VARCHAR(36),
      provider_call_id VARCHAR(100) NOT NULL,
      state TEXT NOT NULL DEFAULT 'RECEIVED',
      assurance_level TEXT NOT NULL DEFAULT 'A0',
      support_link_attempts INTEGER NOT NULL DEFAULT 0,
      risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
      intent TEXT,
      intent_confidence NUMERIC(5,4),
      requested_action_hint VARCHAR(120),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_msp_context_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_msp_context_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT callcommand_msp_context_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT callcommand_msp_context_line_fk FOREIGN KEY (tenant_id,originating_line_id) REFERENCES callcommand_trusted_originating_lines(tenant_id,id),
      CONSTRAINT uq_callcommand_msp_context_call UNIQUE (tenant_id,call_id),
      CONSTRAINT uq_callcommand_msp_context_provider UNIQUE (tenant_id,provider_call_id),
      CONSTRAINT uq_callcommand_msp_context_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_msp_context_state_check CHECK (state IN ('RECEIVED','PROVIDER_VERIFIED','TENANT_RESOLVED','ORIGINATING_LINE_EVALUATED','UNRECOGNIZED_LINE','CALLBACK_REQUESTED','ORGANIZATION_MATCHED','SUPPORT_ID_REQUESTED','SUPPORT_ID_INVALID','CONTACT_ASSOCIATED','INTENT_CAPTURED','LOCAL_CASE_CREATED','BMS_TICKET_QUEUED','POLICY_EVALUATED','MANUAL_REVIEW','CHALLENGE_REQUIRED','CHALLENGE_FAILED','VERIFIED','ALLOWED','TARGET_RESOLVED','USER_CONFIRMED','ACTION_AUTHORIZED','ACTION_QUEUED','ACTION_RUNNING','SUCCEEDED','EXPIRED','UNKNOWN_RESULT','TICKET_SYNCHRONIZED','CUSTOMER_CONFIRMATION','RESOLVED','PENDING','COMPLETED','ABANDONED','TRANSFERRED','DENIED','LOCKED','FAILED')),
      CONSTRAINT callcommand_msp_context_assurance_check CHECK (assurance_level IN ('A0','A1','A2','A3','A4')),
      CONSTRAINT callcommand_msp_context_attempt_check CHECK (support_link_attempts BETWEEN 0 AND 20),
      CONSTRAINT callcommand_msp_context_risk_check CHECK (jsonb_typeof(risk_flags)='array')
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_msp_context_live ON callcommand_msp_call_contexts(tenant_id,state,updated_at DESC) WHERE ended_at IS NULL;

    CREATE TABLE IF NOT EXISTS callcommand_msp_call_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_context_id VARCHAR(36) NOT NULL,
      sequence INTEGER NOT NULL,
      event_type VARCHAR(160) NOT NULL,
      actor_type VARCHAR(40) NOT NULL,
      actor_id VARCHAR(120),
      outcome VARCHAR(80) NOT NULL,
      policy_version VARCHAR(80),
      evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      correlation_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
      previous_event_hash CHAR(64),
      event_hash CHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_msp_event_context_fk FOREIGN KEY (tenant_id,call_context_id) REFERENCES callcommand_msp_call_contexts(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT uq_callcommand_msp_event_sequence UNIQUE (tenant_id,call_context_id,sequence),
      CONSTRAINT uq_callcommand_msp_event_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_msp_event_hash_check CHECK ((previous_event_hash IS NULL OR previous_event_hash ~ '^[0-9a-f]{64}$') AND event_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT callcommand_msp_event_json_check CHECK (jsonb_typeof(evidence)='object' AND jsonb_typeof(correlation_ids)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_msp_event_context ON callcommand_msp_call_events(tenant_id,call_context_id,sequence);

    CREATE TABLE IF NOT EXISTS callcommand_local_cases (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_context_id VARCHAR(36) NOT NULL,
      reference VARCHAR(20) NOT NULL,
      organization_id VARCHAR(36),
      contact_id VARCHAR(36),
      status TEXT NOT NULL DEFAULT 'OPEN',
      intent TEXT NOT NULL,
      summary TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      bms_sync_status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_local_case_context_fk FOREIGN KEY (tenant_id,call_context_id) REFERENCES callcommand_msp_call_contexts(tenant_id,id),
      CONSTRAINT callcommand_local_case_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT callcommand_local_case_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT uq_callcommand_local_case_context UNIQUE (tenant_id,call_context_id),
      CONSTRAINT uq_callcommand_local_case_reference UNIQUE (tenant_id,reference),
      CONSTRAINT uq_callcommand_local_case_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_local_case_status_check CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','TRANSFERRED','RESOLVED','CLOSED')),
      CONSTRAINT callcommand_local_case_priority_check CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
      CONSTRAINT callcommand_local_case_sync_check CHECK (bms_sync_status IN ('PENDING','QUEUED','SYNCED','TEST_RECORDED','RETRY','DEAD_LETTER','BLOCKED'))
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_local_case_open ON callcommand_local_cases(tenant_id,status,updated_at DESC);

    CREATE TABLE IF NOT EXISTS callcommand_bms_ticket_links (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      local_case_id VARCHAR(36) NOT NULL,
      integration_id VARCHAR(36) NOT NULL,
      external_ticket_id VARCHAR(200),
      external_ticket_number VARCHAR(120),
      correlation_id VARCHAR(120) NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'PENDING',
      last_error_code VARCHAR(120),
      last_sync_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_bms_link_case_fk FOREIGN KEY (tenant_id,local_case_id) REFERENCES callcommand_local_cases(tenant_id,id),
      CONSTRAINT callcommand_bms_link_integration_fk FOREIGN KEY (tenant_id,integration_id) REFERENCES automation_fabric_integrations(tenant_id,id),
      CONSTRAINT uq_callcommand_bms_link_case UNIQUE (tenant_id,local_case_id),
      CONSTRAINT uq_callcommand_bms_link_correlation UNIQUE (tenant_id,correlation_id),
      CONSTRAINT uq_callcommand_bms_link_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_bms_link_status_check CHECK (sync_status IN ('PENDING','QUEUED','SYNCED','TEST_RECORDED','RETRY','DEAD_LETTER','BLOCKED'))
    );

    CREATE TABLE IF NOT EXISTS callcommand_msp_rate_limits (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      scope VARCHAR(80) NOT NULL,
      subject_hmac CHAR(64) NOT NULL,
      window_started_at TIMESTAMPTZ NOT NULL,
      window_seconds INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      blocked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_msp_rate_scope UNIQUE (tenant_id,scope,subject_hmac),
      CONSTRAINT callcommand_msp_rate_hash_check CHECK (subject_hmac ~ '^[0-9a-f]{64}$'),
      CONSTRAINT callcommand_msp_rate_count_check CHECK (attempt_count >= 0 AND window_seconds BETWEEN 1 AND 86400)
    );

    CREATE TABLE IF NOT EXISTS callcommand_action_requests (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_context_id VARCHAR(36) NOT NULL,
      local_case_id VARCHAR(36),
      organization_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL,
      action_catalog_id VARCHAR(36) NOT NULL,
      action_key VARCHAR(120) NOT NULL,
      target_type TEXT NOT NULL,
      target_id VARCHAR(200) NOT NULL,
      parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
      caller_confirmed_at TIMESTAMPTZ,
      idempotency_key VARCHAR(200) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_POLICY',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_action_request_context_fk FOREIGN KEY (tenant_id,call_context_id) REFERENCES callcommand_msp_call_contexts(tenant_id,id),
      CONSTRAINT callcommand_action_request_case_fk FOREIGN KEY (tenant_id,local_case_id) REFERENCES callcommand_local_cases(tenant_id,id),
      CONSTRAINT callcommand_action_request_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES directory_organizations(tenant_id,id),
      CONSTRAINT callcommand_action_request_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT callcommand_action_request_catalog_fk FOREIGN KEY (tenant_id,action_catalog_id) REFERENCES automation_fabric_action_catalog(tenant_id,id),
      CONSTRAINT uq_callcommand_action_request_idempotency UNIQUE (tenant_id,idempotency_key),
      CONSTRAINT uq_callcommand_action_request_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_action_request_target_check CHECK (target_type IN ('DEVICE','DIRECTORY_ACCOUNT','TICKET')),
      CONSTRAINT callcommand_action_request_status_check CHECK (status IN ('PENDING_POLICY','CHALLENGE_REQUIRED','APPROVAL_REQUIRED','AUTHORIZED','QUEUED','RUNNING','SUCCEEDED','FAILED','EXPIRED','UNKNOWN_RESULT','DENIED','CANCELLED')),
      CONSTRAINT callcommand_action_request_parameters_check CHECK (jsonb_typeof(parameters)='object')
    );

    CREATE TABLE IF NOT EXISTS callcommand_policy_decisions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      action_request_id VARCHAR(36) NOT NULL,
      policy_version VARCHAR(80) NOT NULL,
      decision TEXT NOT NULL,
      required_assurance TEXT NOT NULL,
      reason_codes JSONB NOT NULL,
      evidence_snapshot JSONB NOT NULL,
      decision_hash CHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_policy_decision_request_fk FOREIGN KEY (tenant_id,action_request_id) REFERENCES callcommand_action_requests(tenant_id,id),
      CONSTRAINT uq_callcommand_policy_decision_request UNIQUE (tenant_id,action_request_id),
      CONSTRAINT uq_callcommand_policy_decision_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_policy_decision_value_check CHECK (decision IN ('ALLOW','CHALLENGE','REQUIRE_APPROVAL','MANUAL_ONLY','DENY')),
      CONSTRAINT callcommand_policy_decision_assurance_check CHECK (required_assurance IN ('A0','A1','A2','A3','A4')),
      CONSTRAINT callcommand_policy_decision_hash_check CHECK (decision_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT callcommand_policy_decision_json_check CHECK (jsonb_typeof(reason_codes)='array' AND jsonb_typeof(evidence_snapshot)='object')
    );

    CREATE TABLE IF NOT EXISTS callcommand_verification_challenges (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_context_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL,
      verification_method_id VARCHAR(36) NOT NULL,
      method_type TEXT NOT NULL,
      provider_reference VARCHAR(200),
      status TEXT NOT NULL DEFAULT 'PENDING',
      expires_at TIMESTAMPTZ NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_challenge_context_fk FOREIGN KEY (tenant_id,call_context_id) REFERENCES callcommand_msp_call_contexts(tenant_id,id),
      CONSTRAINT callcommand_challenge_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT callcommand_challenge_method_fk FOREIGN KEY (tenant_id,verification_method_id) REFERENCES callcommand_verification_methods(tenant_id,id),
      CONSTRAINT uq_callcommand_challenge_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_challenge_status_check CHECK (status IN ('PENDING','APPROVED','FAILED','EXPIRED','CANCELLED')),
      CONSTRAINT callcommand_challenge_attempt_check CHECK (attempt_count BETWEEN 0 AND 10)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_challenge_active ON callcommand_verification_challenges(tenant_id,call_context_id,status,expires_at DESC);

    CREATE TABLE IF NOT EXISTS callcommand_action_approvals (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      action_request_id VARCHAR(36) NOT NULL,
      approver_type TEXT NOT NULL,
      approver_user_id VARCHAR(36) REFERENCES users(id),
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_action_approval_request_fk FOREIGN KEY (tenant_id,action_request_id) REFERENCES callcommand_action_requests(tenant_id,id),
      CONSTRAINT uq_callcommand_action_approval UNIQUE NULLS NOT DISTINCT (tenant_id,action_request_id,approver_type,approver_user_id),
      CONSTRAINT callcommand_action_approval_type_check CHECK (approver_type IN ('MANAGER','TECHNICIAN','MSP_ADMIN')),
      CONSTRAINT callcommand_action_approval_decision_check CHECK (decision IN ('APPROVED','DENIED'))
    );

    CREATE TABLE IF NOT EXISTS callcommand_action_executions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      action_request_id VARCHAR(36) NOT NULL,
      provider TEXT NOT NULL,
      provider_job_id VARCHAR(200),
      attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      submitted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      normalized_result JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_code VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_action_execution_request_fk FOREIGN KEY (tenant_id,action_request_id) REFERENCES callcommand_action_requests(tenant_id,id),
      CONSTRAINT uq_callcommand_action_execution_attempt UNIQUE (tenant_id,action_request_id,provider,attempt),
      CONSTRAINT uq_callcommand_action_execution_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_action_execution_status_check CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','EXPIRED','UNKNOWN_RESULT','CANCELLED')),
      CONSTRAINT callcommand_action_execution_result_check CHECK (jsonb_typeof(normalized_result)='object')
    );

    CREATE TABLE IF NOT EXISTS callcommand_reset_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_context_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL,
      directory_account_id VARCHAR(36) NOT NULL,
      action_request_id VARCHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      account_mask VARCHAR(240) NOT NULL,
      verification_completed_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_reset_context_fk FOREIGN KEY (tenant_id,call_context_id) REFERENCES callcommand_msp_call_contexts(tenant_id,id),
      CONSTRAINT callcommand_reset_contact_fk FOREIGN KEY (tenant_id,contact_id) REFERENCES directory_contacts(tenant_id,id),
      CONSTRAINT callcommand_reset_account_fk FOREIGN KEY (tenant_id,directory_account_id) REFERENCES automation_fabric_directory_accounts(tenant_id,id),
      CONSTRAINT callcommand_reset_request_fk FOREIGN KEY (tenant_id,action_request_id) REFERENCES callcommand_action_requests(tenant_id,id),
      CONSTRAINT uq_callcommand_reset_token UNIQUE (token_hash),
      CONSTRAINT uq_callcommand_reset_request UNIQUE (tenant_id,action_request_id),
      CONSTRAINT callcommand_reset_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT callcommand_reset_status_check CHECK (status IN ('PENDING_VERIFICATION','READY','PROCESSING','COMPLETED','FAILED','EXPIRED','CANCELLED'))
    );

    CREATE TABLE IF NOT EXISTS callcommand_integration_outbox (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_context_id VARCHAR(36),
      local_case_id VARCHAR(36),
      action_request_id VARCHAR(36),
      kind TEXT NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL,
      safe_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_owner VARCHAR(120),
      lease_expires_at TIMESTAMPTZ,
      last_error_code VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      CONSTRAINT callcommand_outbox_context_fk FOREIGN KEY (tenant_id,call_context_id) REFERENCES callcommand_msp_call_contexts(tenant_id,id),
      CONSTRAINT callcommand_outbox_case_fk FOREIGN KEY (tenant_id,local_case_id) REFERENCES callcommand_local_cases(tenant_id,id),
      CONSTRAINT callcommand_outbox_request_fk FOREIGN KEY (tenant_id,action_request_id) REFERENCES callcommand_action_requests(tenant_id,id),
      CONSTRAINT uq_callcommand_outbox_idempotency UNIQUE (tenant_id,kind,idempotency_key),
      CONSTRAINT uq_callcommand_outbox_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_outbox_kind_check CHECK (kind IN ('BMS_TICKET_SYNC','BMS_NOTE_SYNC','RMM_RESULT_RECONCILIATION','NOTIFICATION','AUDIT_EXPORT','AD_BROKER_RESPONSE')),
      CONSTRAINT callcommand_outbox_status_check CHECK (status IN ('PENDING','PROCESSING','RETRY','COMPLETED','BLOCKED','DEAD_LETTER','CANCELLED')),
      CONSTRAINT callcommand_outbox_attempt_check CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 20),
      CONSTRAINT callcommand_outbox_payload_check CHECK (jsonb_typeof(safe_payload)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_outbox_claim ON callcommand_integration_outbox(status,next_attempt_at,lease_expires_at);

    ALTER TABLE callcommand_msp_settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE callcommand_organization_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE automation_fabric_integrations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE callcommand_trusted_originating_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE callcommand_contact_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE callcommand_support_links ENABLE ROW LEVEL SECURITY;
    ALTER TABLE callcommand_msp_call_contexts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE callcommand_local_cases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE callcommand_action_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE callcommand_msp_call_events ENABLE ROW LEVEL SECURITY;
  `));
}
