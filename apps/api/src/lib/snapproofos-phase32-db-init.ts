import { db } from '../db.js';

/**
 * Phase 32 additive field-operations restoration.
 *
 * OperatorOS remains authoritative for users, tenants, memberships, module
 * roles, entitlements, billing, activity, and private object storage. These
 * tables contain only SnapProofOS customer/job/report product data.
 */
export async function ensureSnapProofOsPhase32Tables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS snapproof_customers (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(320),
      phone VARCHAR(40),
      company VARCHAR(200),
      address TEXT,
      notes TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      archived_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_customer_tenant_id UNIQUE (id,tenant_id),
      CONSTRAINT snapproof_customer_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
      CONSTRAINT snapproof_customer_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_customers_tenant_name
      ON snapproof_customers(tenant_id,lower(name)) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS snapproof_templates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      industry VARCHAR(80),
      icon VARCHAR(80),
      default_job_type VARCHAR(80) NOT NULL DEFAULT 'field_service',
      sections JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      version INTEGER NOT NULL DEFAULT 1,
      archived_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT snapproof_template_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
      CONSTRAINT snapproof_template_sections_check CHECK (jsonb_typeof(sections)='array'),
      CONSTRAINT snapproof_template_scope_check CHECK ((is_system AND tenant_id IS NULL) OR (NOT is_system AND tenant_id IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_templates_scope
      ON snapproof_templates(tenant_id,is_system,name) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS snapproof_branding (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      logo_attachment_id VARCHAR(36),
      accent_color VARCHAR(7) NOT NULL DEFAULT '#dc2626',
      company_name VARCHAR(200),
      footer_text VARCHAR(500),
      contact_email VARCHAR(320),
      contact_phone VARCHAR(40),
      website VARCHAR(500),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT snapproof_branding_logo_fk FOREIGN KEY (tenant_id,logo_attachment_id)
        REFERENCES shared_attachments(tenant_id,id),
      CONSTRAINT snapproof_branding_accent_check CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$')
    );

    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36);
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS template_id VARCHAR(36);
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS job_type VARCHAR(80) NOT NULL DEFAULT 'field_service';
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS job_status VARCHAR(24) NOT NULL DEFAULT 'draft';
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS site_address TEXT;
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP;
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
    ALTER TABLE snapproof_cases ADD COLUMN IF NOT EXISTS client_mutation_id VARCHAR(100);
    ALTER TABLE snapproof_cases DROP CONSTRAINT IF EXISTS snapproof_case_customer_fk;
    ALTER TABLE snapproof_cases ADD CONSTRAINT snapproof_case_customer_fk FOREIGN KEY (tenant_id,customer_id)
      REFERENCES snapproof_customers(tenant_id,id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_snapproof_case_client_mutation
      ON snapproof_cases(tenant_id,client_mutation_id) WHERE client_mutation_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_snapproof_cases_customer
      ON snapproof_cases(tenant_id,customer_id,updated_at DESC) WHERE deleted_at IS NULL;
    ALTER TABLE snapproof_cases DROP CONSTRAINT IF EXISTS snapproof_job_status_check;
    ALTER TABLE snapproof_cases ADD CONSTRAINT snapproof_job_status_check CHECK (job_status IN ('draft','in_progress','completed','archived'));

    ALTER TABLE snapproof_findings ADD COLUMN IF NOT EXISTS issue TEXT;
    ALTER TABLE snapproof_findings ADD COLUMN IF NOT EXISTS cause TEXT;
    ALTER TABLE snapproof_findings ADD COLUMN IF NOT EXISTS resolution TEXT;
    ALTER TABLE snapproof_findings ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
    UPDATE snapproof_findings SET issue=COALESCE(issue,title), cause=COALESCE(cause,description) WHERE issue IS NULL OR cause IS NULL;

    ALTER TABLE snapproof_comments ADD COLUMN IF NOT EXISTS note_type VARCHAR(24) NOT NULL DEFAULT 'internal';
    ALTER TABLE snapproof_comments ADD COLUMN IF NOT EXISTS audio_attachment_id VARCHAR(36);
    ALTER TABLE snapproof_comments ADD COLUMN IF NOT EXISTS customer_visible BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE snapproof_comments DROP CONSTRAINT IF EXISTS snapproof_comment_note_type_check;
    ALTER TABLE snapproof_comments ADD CONSTRAINT snapproof_comment_note_type_check
      CHECK (note_type IN ('internal','customer_facing','voice_transcript'));
    ALTER TABLE snapproof_comments DROP CONSTRAINT IF EXISTS snapproof_comment_audio_fk;
    ALTER TABLE snapproof_comments ADD CONSTRAINT snapproof_comment_audio_fk FOREIGN KEY (tenant_id,audio_attachment_id)
      REFERENCES shared_attachments(tenant_id,id);

    ALTER TABLE snapproof_evidence_items ADD COLUMN IF NOT EXISTS caption VARCHAR(500);
    ALTER TABLE snapproof_evidence_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE snapproof_evidence_items ADD COLUMN IF NOT EXISTS privacy_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE snapproof_evidence_items ADD COLUMN IF NOT EXISTS client_mutation_id VARCHAR(100);
    ALTER TABLE snapproof_evidence_items DROP CONSTRAINT IF EXISTS snapproof_evidence_type_check;
    ALTER TABLE snapproof_evidence_items ADD CONSTRAINT snapproof_evidence_type_check
      CHECK (evidence_type IN ('photo','document','screenshot','log','note','audio'));
    CREATE UNIQUE INDEX IF NOT EXISTS uq_snapproof_evidence_client_mutation
      ON snapproof_evidence_items(tenant_id,client_mutation_id) WHERE client_mutation_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS snapproof_parts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      case_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(200) NOT NULL,
      part_number VARCHAR(120),
      quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
      unit_cost_cents INTEGER NOT NULL DEFAULT 0,
      unit_price_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_part_tenant_id UNIQUE (id,tenant_id),
      CONSTRAINT snapproof_part_case_fk FOREIGN KEY (tenant_id,case_id) REFERENCES snapproof_cases(tenant_id,id),
      CONSTRAINT snapproof_part_values_check CHECK (quantity > 0 AND unit_cost_cents >= 0 AND unit_price_cents >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_parts_case ON snapproof_parts(tenant_id,case_id,created_at) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS snapproof_labor (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      case_id VARCHAR(36) NOT NULL,
      technician_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      description VARCHAR(500) NOT NULL,
      hours NUMERIC(10,2) NOT NULL,
      rate_cents INTEGER NOT NULL DEFAULT 0,
      work_date DATE,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_labor_tenant_id UNIQUE (id,tenant_id),
      CONSTRAINT snapproof_labor_case_fk FOREIGN KEY (tenant_id,case_id) REFERENCES snapproof_cases(tenant_id,id),
      CONSTRAINT snapproof_labor_values_check CHECK (hours > 0 AND hours <= 10000 AND rate_cents >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_labor_case ON snapproof_labor(tenant_id,case_id,created_at) WHERE deleted_at IS NULL;

    ALTER TABLE snapproof_reports ADD COLUMN IF NOT EXISTS report_type VARCHAR(40) NOT NULL DEFAULT 'full_report';
    ALTER TABLE snapproof_reports ADD COLUMN IF NOT EXISTS tone VARCHAR(32) NOT NULL DEFAULT 'client_friendly';
    ALTER TABLE snapproof_reports ADD COLUMN IF NOT EXISTS branding_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE snapproof_exports ADD COLUMN IF NOT EXISTS content BYTEA;
    ALTER TABLE snapproof_exports ADD COLUMN IF NOT EXISTS content_type VARCHAR(120);
    ALTER TABLE snapproof_exports ADD COLUMN IF NOT EXISTS filename VARCHAR(240);
    ALTER TABLE snapproof_exports ADD COLUMN IF NOT EXISTS byte_length INTEGER;
    ALTER TABLE snapproof_exports DROP CONSTRAINT IF EXISTS snapproof_export_format_check;
    ALTER TABLE snapproof_exports ADD CONSTRAINT snapproof_export_format_check CHECK (format IN ('json','csv','pdf','docx'));
    ALTER TABLE snapproof_exports DROP CONSTRAINT IF EXISTS snapproof_export_bytes_check;
    ALTER TABLE snapproof_exports ADD CONSTRAINT snapproof_export_bytes_check CHECK (
      (content IS NULL AND byte_length IS NULL) OR (content IS NOT NULL AND byte_length=octet_length(content))
    );

    CREATE TABLE IF NOT EXISTS snapproof_share_links (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      report_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP,
      allow_download BOOLEAN NOT NULL DEFAULT FALSE,
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_share_tenant_id UNIQUE (id,tenant_id),
      CONSTRAINT snapproof_share_report_fk FOREIGN KEY (tenant_id,report_id) REFERENCES snapproof_reports(tenant_id,id),
      CONSTRAINT snapproof_share_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT snapproof_share_expiry_check CHECK (expires_at > created_at)
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_share_report ON snapproof_share_links(tenant_id,report_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS snapproof_public_rate_limits (
      bucket_key VARCHAR(96) PRIMARY KEY,
      request_count INTEGER NOT NULL DEFAULT 0,
      window_started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    INSERT INTO snapproof_templates(name,description,industry,icon,default_job_type,sections,is_system)
    SELECT 'Field Service Proof','Completion photos, findings, parts, labor, and customer-ready closeout.','field_service','camera','field_service',
      '[{"key":"arrival","label":"Arrival condition"},{"key":"work","label":"Work performed"},{"key":"completion","label":"Completion proof"}]'::jsonb,TRUE
    WHERE NOT EXISTS (SELECT 1 FROM snapproof_templates WHERE is_system=TRUE AND name='Field Service Proof');
  `);
}
