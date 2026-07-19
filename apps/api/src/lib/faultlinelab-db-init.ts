import { db } from '../db.js';

/**
 * Additive, idempotent FaultlineLab release.
 *
 * Challenge versions, attempt actions, submissions, daily outcomes and badge
 * awards are append-only evidence. Mutable projections use optimistic
 * versions. Rollback follows the root restore-to-new-database contract; no
 * destructive child migration or down migration is supported.
 */
export async function ensureFaultlineLabTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS faultlinelab_challenges (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      scope VARCHAR(20) NOT NULL DEFAULT 'personal',
      slug VARCHAR(120) NOT NULL,
      title VARCHAR(200) NOT NULL,
      category VARCHAR(40) NOT NULL,
      difficulty VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      current_version_number INTEGER NOT NULL DEFAULT 1,
      published_version_number INTEGER,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      published_at TIMESTAMP,
      retired_at TIMESTAMP,
      archived_at TIMESTAMP,
      CONSTRAINT uq_faultlinelab_challenges_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT faultlinelab_challenge_scope_check CHECK (scope IN ('personal','tenant')),
      CONSTRAINT faultlinelab_challenge_status_check CHECK (status IN ('draft','published','retired')),
      CONSTRAINT faultlinelab_challenge_category_check CHECK (category IN ('windows-ad','networking','automotive','electronics','servers','mixed','healthcare-imaging')),
      CONSTRAINT faultlinelab_challenge_difficulty_check CHECK (difficulty IN ('beginner','intermediate','advanced','expert')),
      CONSTRAINT faultlinelab_challenge_versions_check CHECK (version >= 1 AND current_version_number >= 1 AND (published_version_number IS NULL OR published_version_number >= 1)),
      CONSTRAINT faultlinelab_challenge_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,119}$')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_faultlinelab_personal_slug ON faultlinelab_challenges(tenant_id, owner_user_id, lower(slug)) WHERE scope='personal' AND archived_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_faultlinelab_tenant_slug ON faultlinelab_challenges(tenant_id, lower(slug)) WHERE scope='tenant' AND archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_faultlinelab_challenges_catalog ON faultlinelab_challenges(tenant_id, scope, status, category, difficulty, updated_at DESC) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS faultlinelab_challenge_versions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      challenge_id VARCHAR(36) NOT NULL,
      version_number INTEGER NOT NULL,
      content JSONB NOT NULL,
      content_sha256 VARCHAR(64) NOT NULL,
      validation JSONB NOT NULL,
      change_note VARCHAR(500),
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT faultlinelab_version_challenge_fk FOREIGN KEY (tenant_id, challenge_id) REFERENCES faultlinelab_challenges(tenant_id, id),
      CONSTRAINT uq_faultlinelab_version_number UNIQUE (tenant_id, challenge_id, version_number),
      CONSTRAINT uq_faultlinelab_versions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT faultlinelab_version_number_check CHECK (version_number >= 1),
      CONSTRAINT faultlinelab_version_hash_check CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX IF NOT EXISTS idx_faultlinelab_versions_challenge ON faultlinelab_challenge_versions(tenant_id, challenge_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS faultlinelab_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      challenge_id VARCHAR(36) NOT NULL,
      challenge_version_number INTEGER NOT NULL,
      assignee_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      assigned_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      title VARCHAR(200),
      instructions TEXT,
      due_at TIMESTAMP,
      status VARCHAR(20) NOT NULL DEFAULT 'assigned',
      completed_session_id VARCHAR(36),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      canceled_at TIMESTAMP,
      archived_at TIMESTAMP,
      CONSTRAINT faultlinelab_assignment_challenge_fk FOREIGN KEY (tenant_id, challenge_id, challenge_version_number) REFERENCES faultlinelab_challenge_versions(tenant_id, challenge_id, version_number),
      CONSTRAINT uq_faultlinelab_assignments_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT faultlinelab_assignment_status_check CHECK (status IN ('assigned','in_progress','completed','canceled')),
      CONSTRAINT faultlinelab_assignment_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_faultlinelab_assignments_assignee ON faultlinelab_assignments(tenant_id, assignee_user_id, status, due_at, created_at DESC) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS faultlinelab_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      challenge_id VARCHAR(36) NOT NULL,
      challenge_version_number INTEGER NOT NULL,
      assignment_id VARCHAR(36),
      mode VARCHAR(20) NOT NULL DEFAULT 'standard',
      state VARCHAR(20) NOT NULL DEFAULT 'active',
      chaos_seed INTEGER,
      chaos_settings JSONB,
      unlocked_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
      hints_used JSONB NOT NULL DEFAULT '[]'::jsonb,
      action_count INTEGER NOT NULL DEFAULT 0,
      risky_action_count INTEGER NOT NULL DEFAULT 0,
      score INTEGER,
      max_score INTEGER,
      score_percentage INTEGER,
      tier VARCHAR(40),
      passed BOOLEAN,
      client_start_key VARCHAR(160),
      version INTEGER NOT NULL DEFAULT 1,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      abandoned_at TIMESTAMP,
      CONSTRAINT faultlinelab_session_challenge_fk FOREIGN KEY (tenant_id, challenge_id, challenge_version_number) REFERENCES faultlinelab_challenge_versions(tenant_id, challenge_id, version_number),
      CONSTRAINT faultlinelab_session_assignment_fk FOREIGN KEY (tenant_id, assignment_id) REFERENCES faultlinelab_assignments(tenant_id, id),
      CONSTRAINT uq_faultlinelab_sessions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT faultlinelab_session_mode_check CHECK (mode IN ('standard','daily','preview','assignment','chaos')),
      CONSTRAINT faultlinelab_session_state_check CHECK (state IN ('active','completed','abandoned')),
      CONSTRAINT faultlinelab_session_count_check CHECK (action_count >= 0 AND risky_action_count >= 0),
      CONSTRAINT faultlinelab_session_score_check CHECK (score IS NULL OR (score >= 0 AND max_score >= 1 AND score <= max_score AND score_percentage BETWEEN 0 AND 100)),
      CONSTRAINT faultlinelab_session_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_faultlinelab_session_start_key ON faultlinelab_sessions(tenant_id, user_id, client_start_key) WHERE client_start_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_faultlinelab_active_session ON faultlinelab_sessions(tenant_id, user_id, challenge_id, mode) WHERE state='active';
    CREATE INDEX IF NOT EXISTS idx_faultlinelab_sessions_user ON faultlinelab_sessions(tenant_id, user_id, state, last_activity_at DESC);
    CREATE INDEX IF NOT EXISTS idx_faultlinelab_sessions_challenge ON faultlinelab_sessions(tenant_id, challenge_id, state, completed_at DESC);

    DO $$ BEGIN
      ALTER TABLE faultlinelab_assignments ADD CONSTRAINT faultlinelab_assignment_session_fk
        FOREIGN KEY (tenant_id, completed_session_id) REFERENCES faultlinelab_sessions(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS faultlinelab_session_actions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      session_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      sequence_number INTEGER NOT NULL,
      client_action_id VARCHAR(160) NOT NULL,
      kind VARCHAR(30) NOT NULL,
      target_key VARCHAR(200),
      output TEXT,
      evidence_unlocked JSONB NOT NULL DEFAULT '[]'::jsonb,
      risky BOOLEAN NOT NULL DEFAULT false,
      hint_penalty INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT faultlinelab_action_session_fk FOREIGN KEY (tenant_id, session_id) REFERENCES faultlinelab_sessions(tenant_id, id),
      CONSTRAINT uq_faultlinelab_action_sequence UNIQUE (tenant_id, session_id, sequence_number),
      CONSTRAINT uq_faultlinelab_action_client UNIQUE (tenant_id, session_id, client_action_id),
      CONSTRAINT uq_faultlinelab_actions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT faultlinelab_action_kind_check CHECK (kind IN ('command','event','ticket','hint')),
      CONSTRAINT faultlinelab_action_sequence_check CHECK (sequence_number >= 1 AND hint_penalty >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_faultlinelab_actions_session ON faultlinelab_session_actions(tenant_id, session_id, sequence_number);

    CREATE TABLE IF NOT EXISTS faultlinelab_submissions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      session_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      client_submission_id VARCHAR(160) NOT NULL,
      hypothesis TEXT NOT NULL,
      selected_root_cause_id VARCHAR(100) NOT NULL,
      evidence_ids JSONB NOT NULL,
      remediation TEXT NOT NULL,
      proof_note TEXT,
      score_breakdown JSONB NOT NULL,
      badges JSONB NOT NULL DEFAULT '[]'::jsonb,
      passed BOOLEAN NOT NULL,
      submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT faultlinelab_submission_session_fk FOREIGN KEY (tenant_id, session_id) REFERENCES faultlinelab_sessions(tenant_id, id),
      CONSTRAINT uq_faultlinelab_submission_session UNIQUE (tenant_id, session_id),
      CONSTRAINT uq_faultlinelab_submission_client UNIQUE (tenant_id, user_id, client_submission_id),
      CONSTRAINT uq_faultlinelab_submissions_tenant_id UNIQUE (tenant_id, id)
    );

    CREATE TABLE IF NOT EXISTS faultlinelab_user_progress (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      attempts_completed INTEGER NOT NULL DEFAULT 0,
      challenges_solved INTEGER NOT NULL DEFAULT 0,
      total_best_score INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      last_outcome_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, user_id),
      CONSTRAINT faultlinelab_progress_counts_check CHECK (attempts_completed >= 0 AND challenges_solved >= 0 AND total_best_score >= 0 AND current_streak >= 0 AND best_streak >= 0 AND version >= 1)
    );

    CREATE TABLE IF NOT EXISTS faultlinelab_user_challenge_progress (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      challenge_id VARCHAR(36) NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      pass_count INTEGER NOT NULL DEFAULT 0,
      best_score INTEGER,
      best_percentage INTEGER,
      best_tier VARCHAR(40),
      first_passed_at TIMESTAMP,
      last_completed_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (tenant_id, user_id, challenge_id),
      CONSTRAINT faultlinelab_challenge_progress_challenge_fk FOREIGN KEY (tenant_id, challenge_id) REFERENCES faultlinelab_challenges(tenant_id, id),
      CONSTRAINT faultlinelab_challenge_progress_counts_check CHECK (attempt_count >= 0 AND pass_count >= 0 AND (best_score IS NULL OR best_score >= 0) AND (best_percentage IS NULL OR best_percentage BETWEEN 0 AND 100) AND version >= 1)
    );

    CREATE TABLE IF NOT EXISTS faultlinelab_badge_awards (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      badge_key VARCHAR(100) NOT NULL,
      session_id VARCHAR(36) NOT NULL,
      awarded_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT faultlinelab_badge_session_fk FOREIGN KEY (tenant_id, session_id) REFERENCES faultlinelab_sessions(tenant_id, id),
      CONSTRAINT uq_faultlinelab_badge_user UNIQUE (tenant_id, user_id, badge_key),
      CONSTRAINT uq_faultlinelab_badges_tenant_id UNIQUE (tenant_id, id)
    );

    CREATE TABLE IF NOT EXISTS faultlinelab_daily_outcomes (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      challenge_date DATE NOT NULL,
      challenge_id VARCHAR(36) NOT NULL,
      session_id VARCHAR(36) NOT NULL,
      passed BOOLEAN NOT NULL,
      score INTEGER NOT NULL,
      recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT faultlinelab_daily_challenge_fk FOREIGN KEY (tenant_id, challenge_id) REFERENCES faultlinelab_challenges(tenant_id, id),
      CONSTRAINT faultlinelab_daily_session_fk FOREIGN KEY (tenant_id, session_id) REFERENCES faultlinelab_sessions(tenant_id, id),
      CONSTRAINT uq_faultlinelab_daily_user_date UNIQUE (tenant_id, user_id, challenge_date),
      CONSTRAINT uq_faultlinelab_daily_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT faultlinelab_daily_score_check CHECK (score >= 0)
    );

    CREATE TABLE IF NOT EXISTS faultlinelab_migration_refs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      source_commit VARCHAR(64) NOT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_id VARCHAR(160) NOT NULL,
      target_type VARCHAR(40) NOT NULL,
      target_id VARCHAR(36) NOT NULL,
      source_fingerprint VARCHAR(64) NOT NULL,
      imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_faultlinelab_migration_source UNIQUE (tenant_id, source_type, source_id),
      CONSTRAINT faultlinelab_migration_hash_check CHECK (source_commit ~ '^[0-9a-f]{40}$' AND source_fingerprint ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX IF NOT EXISTS idx_faultlinelab_migration_target ON faultlinelab_migration_refs(tenant_id, target_type, target_id);

    CREATE OR REPLACE FUNCTION faultlinelab_reject_append_only_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'FaultlineLab evidence table % is append-only', TG_TABLE_NAME USING ERRCODE='55000';
    END $$;

    DROP TRIGGER IF EXISTS faultlinelab_versions_append_only ON faultlinelab_challenge_versions;
    CREATE TRIGGER faultlinelab_versions_append_only BEFORE UPDATE OR DELETE ON faultlinelab_challenge_versions FOR EACH ROW EXECUTE FUNCTION faultlinelab_reject_append_only_mutation();
    DROP TRIGGER IF EXISTS faultlinelab_actions_append_only ON faultlinelab_session_actions;
    CREATE TRIGGER faultlinelab_actions_append_only BEFORE UPDATE OR DELETE ON faultlinelab_session_actions FOR EACH ROW EXECUTE FUNCTION faultlinelab_reject_append_only_mutation();
    DROP TRIGGER IF EXISTS faultlinelab_submissions_append_only ON faultlinelab_submissions;
    CREATE TRIGGER faultlinelab_submissions_append_only BEFORE UPDATE OR DELETE ON faultlinelab_submissions FOR EACH ROW EXECUTE FUNCTION faultlinelab_reject_append_only_mutation();
    DROP TRIGGER IF EXISTS faultlinelab_badges_append_only ON faultlinelab_badge_awards;
    CREATE TRIGGER faultlinelab_badges_append_only BEFORE UPDATE OR DELETE ON faultlinelab_badge_awards FOR EACH ROW EXECUTE FUNCTION faultlinelab_reject_append_only_mutation();
    DROP TRIGGER IF EXISTS faultlinelab_daily_append_only ON faultlinelab_daily_outcomes;
    CREATE TRIGGER faultlinelab_daily_append_only BEFORE UPDATE OR DELETE ON faultlinelab_daily_outcomes FOR EACH ROW EXECUTE FUNCTION faultlinelab_reject_append_only_mutation();
  `);
}
