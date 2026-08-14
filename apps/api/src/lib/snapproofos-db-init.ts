import { db } from '../db.js';

/**
 * Additive, idempotent Phase 11B SnapProofOS release.
 *
 * This step intentionally runs after shared_service_tables because evidence
 * items use the OperatorOS private attachment service. Identity, tenant,
 * entitlement, and billing authority remain in the platform tables.
 */
export async function ensureSnapProofOsTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS snapproof_settings (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      default_retention_days INTEGER NOT NULL DEFAULT 2555,
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT snapproof_settings_retention_check CHECK (default_retention_days BETWEEN 1 AND 36500),
      CONSTRAINT snapproof_settings_version_check CHECK (version >= 1)
    );

    CREATE TABLE IF NOT EXISTS snapproof_cases (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      assigned_to_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      reference VARCHAR(80) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      case_type VARCHAR(60) NOT NULL DEFAULT 'proof_of_work',
      source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      retention_until TIMESTAMP,
      legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_case_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT snapproof_case_reference_check CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
      CONSTRAINT snapproof_case_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
      CONSTRAINT snapproof_case_description_check CHECK (description IS NULL OR char_length(description) <= 10000),
      CONSTRAINT snapproof_case_context_check CHECK (jsonb_typeof(source_context)='object'),
      CONSTRAINT snapproof_case_status_check CHECK (status IN ('draft','collecting','in_review','approved','rejected','archived')),
      CONSTRAINT snapproof_case_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_snapproof_case_reference_active
      ON snapproof_cases(tenant_id,lower(reference)) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_snapproof_cases_tenant_status_updated
      ON snapproof_cases(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_snapproof_cases_tenant_retention
      ON snapproof_cases(tenant_id,retention_until) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS snapproof_evidence_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      case_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      attachment_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      evidence_type VARCHAR(24) NOT NULL,
      description TEXT,
      captured_at TIMESTAMP NOT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_reference VARCHAR(240),
      capture_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(24) NOT NULL DEFAULT 'captured',
      attachment_sha256 VARCHAR(64),
      verified_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      verified_at TIMESTAMP,
      rejection_reason TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_evidence_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT snapproof_evidence_case_fk FOREIGN KEY (tenant_id,case_id)
        REFERENCES snapproof_cases(tenant_id,id),
      CONSTRAINT snapproof_evidence_attachment_fk FOREIGN KEY (tenant_id,attachment_id)
        REFERENCES shared_attachments(tenant_id,id),
      CONSTRAINT snapproof_evidence_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
      CONSTRAINT snapproof_evidence_type_check CHECK (evidence_type IN ('photo','document','screenshot','log','note')),
      CONSTRAINT snapproof_evidence_description_check CHECK (description IS NULL OR char_length(description) <= 10000),
      CONSTRAINT snapproof_evidence_context_check CHECK (jsonb_typeof(capture_context)='object'),
      CONSTRAINT snapproof_evidence_status_check CHECK (status IN ('captured','in_review','verified','rejected','archived')),
      CONSTRAINT snapproof_evidence_hash_check CHECK (attachment_sha256 IS NULL OR attachment_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT snapproof_evidence_attachment_check CHECK (
        (evidence_type='note' AND attachment_id IS NULL AND attachment_sha256 IS NULL) OR
        (evidence_type<>'note' AND attachment_id IS NOT NULL AND attachment_sha256 IS NOT NULL)
      ),
      CONSTRAINT snapproof_evidence_decision_check CHECK (
        (status='verified' AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL) OR status<>'verified'
      ),
      CONSTRAINT snapproof_evidence_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_evidence_tenant_case
      ON snapproof_evidence_items(tenant_id,case_id,created_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_snapproof_evidence_tenant_status
      ON snapproof_evidence_items(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_snapproof_evidence_attachment
      ON snapproof_evidence_items(tenant_id,attachment_id) WHERE attachment_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS snapproof_findings (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      case_id VARCHAR(36) NOT NULL,
      evidence_id VARCHAR(36),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      resolved_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      recommendation TEXT,
      category VARCHAR(60),
      severity VARCHAR(16) NOT NULL DEFAULT 'medium',
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      resolved_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_finding_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT snapproof_finding_case_fk FOREIGN KEY (tenant_id,case_id)
        REFERENCES snapproof_cases(tenant_id,id),
      CONSTRAINT snapproof_finding_evidence_fk FOREIGN KEY (tenant_id,evidence_id)
        REFERENCES snapproof_evidence_items(tenant_id,id),
      CONSTRAINT snapproof_finding_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
      CONSTRAINT snapproof_finding_description_check CHECK (char_length(btrim(description)) BETWEEN 1 AND 10000),
      CONSTRAINT snapproof_finding_severity_check CHECK (severity IN ('info','low','medium','high','critical')),
      CONSTRAINT snapproof_finding_status_check CHECK (status IN ('open','accepted','resolved','dismissed')),
      CONSTRAINT snapproof_finding_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_findings_tenant_case
      ON snapproof_findings(tenant_id,case_id,status,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS snapproof_comments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      case_id VARCHAR(36) NOT NULL,
      evidence_id VARCHAR(36),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      comment_type VARCHAR(20) NOT NULL DEFAULT 'internal',
      body TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_comment_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT snapproof_comment_case_fk FOREIGN KEY (tenant_id,case_id)
        REFERENCES snapproof_cases(tenant_id,id),
      CONSTRAINT snapproof_comment_evidence_fk FOREIGN KEY (tenant_id,evidence_id)
        REFERENCES snapproof_evidence_items(tenant_id,id),
      CONSTRAINT snapproof_comment_type_check CHECK (comment_type IN ('internal','review','decision')),
      CONSTRAINT snapproof_comment_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000)
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_comments_tenant_case
      ON snapproof_comments(tenant_id,case_id,created_at,id);

    CREATE TABLE IF NOT EXISTS snapproof_custody_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      case_id VARCHAR(36) NOT NULL,
      evidence_id VARCHAR(36),
      actor_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      sequence_number INTEGER NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      previous_hash VARCHAR(64),
      event_hash VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_custody_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_snapproof_custody_sequence UNIQUE (tenant_id,case_id,sequence_number),
      CONSTRAINT snapproof_custody_case_fk FOREIGN KEY (tenant_id,case_id)
        REFERENCES snapproof_cases(tenant_id,id),
      CONSTRAINT snapproof_custody_evidence_fk FOREIGN KEY (tenant_id,evidence_id)
        REFERENCES snapproof_evidence_items(tenant_id,id),
      CONSTRAINT snapproof_custody_sequence_check CHECK (sequence_number >= 1),
      CONSTRAINT snapproof_custody_type_check CHECK (event_type IN (
        'case_created','case_updated','case_submitted','case_approved','case_rejected','case_archived',
        'retention_changed','legal_hold_changed','evidence_captured','evidence_submitted',
        'evidence_verified','evidence_rejected','evidence_downloaded','integrity_checked',
        'finding_added','comment_added','report_created','report_approved','report_rejected','export_generated'
      )),
      CONSTRAINT snapproof_custody_previous_hash_check CHECK (previous_hash IS NULL OR previous_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT snapproof_custody_event_hash_check CHECK (event_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT snapproof_custody_payload_check CHECK (jsonb_typeof(payload)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_custody_tenant_case
      ON snapproof_custody_events(tenant_id,case_id,sequence_number);
    CREATE INDEX IF NOT EXISTS idx_snapproof_custody_evidence
      ON snapproof_custody_events(tenant_id,evidence_id,created_at) WHERE evidence_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS snapproof_reports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      case_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      approved_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      content JSONB NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      approved_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      archived_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_report_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT snapproof_report_case_fk FOREIGN KEY (tenant_id,case_id)
        REFERENCES snapproof_cases(tenant_id,id),
      CONSTRAINT snapproof_report_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
      CONSTRAINT snapproof_report_status_check CHECK (status IN ('draft','in_review','approved','rejected','archived')),
      CONSTRAINT snapproof_report_content_check CHECK (jsonb_typeof(content)='object'),
      CONSTRAINT snapproof_report_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT snapproof_report_approval_check CHECK (
        (status='approved' AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL) OR status<>'approved'
      ),
      CONSTRAINT snapproof_report_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_reports_tenant_case
      ON snapproof_reports(tenant_id,case_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_snapproof_reports_tenant_status
      ON snapproof_reports(tenant_id,status,updated_at DESC);

    CREATE TABLE IF NOT EXISTS snapproof_exports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      case_id VARCHAR(36) NOT NULL,
      report_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      format VARCHAR(12) NOT NULL,
      export_hash VARCHAR(64) NOT NULL,
      provenance JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_snapproof_export_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT snapproof_export_case_fk FOREIGN KEY (tenant_id,case_id)
        REFERENCES snapproof_cases(tenant_id,id),
      CONSTRAINT snapproof_export_report_fk FOREIGN KEY (tenant_id,report_id)
        REFERENCES snapproof_reports(tenant_id,id),
      CONSTRAINT snapproof_export_format_check CHECK (format IN ('json','csv')),
      CONSTRAINT snapproof_export_hash_check CHECK (export_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT snapproof_export_provenance_check CHECK (jsonb_typeof(provenance)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_snapproof_exports_tenant_report
      ON snapproof_exports(tenant_id,report_id,created_at DESC);

    CREATE OR REPLACE FUNCTION snapproof_reject_append_only_mutation()
    RETURNS trigger AS $$
    BEGIN
      IF current_setting('operatoros.tenant_hard_delete', true) = 'on' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'SnapProofOS append-only records cannot be updated or deleted';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS snapproof_comments_append_only ON snapproof_comments;
    CREATE TRIGGER snapproof_comments_append_only
      BEFORE UPDATE OR DELETE ON snapproof_comments
      FOR EACH ROW EXECUTE FUNCTION snapproof_reject_append_only_mutation();

    DROP TRIGGER IF EXISTS snapproof_custody_append_only ON snapproof_custody_events;
    CREATE TRIGGER snapproof_custody_append_only
      BEFORE UPDATE OR DELETE ON snapproof_custody_events
      FOR EACH ROW EXECUTE FUNCTION snapproof_reject_append_only_mutation();

    DROP TRIGGER IF EXISTS snapproof_exports_append_only ON snapproof_exports;
    CREATE TRIGGER snapproof_exports_append_only
      BEFORE UPDATE OR DELETE ON snapproof_exports
      FOR EACH ROW EXECUTE FUNCTION snapproof_reject_append_only_mutation();
  `);
}
