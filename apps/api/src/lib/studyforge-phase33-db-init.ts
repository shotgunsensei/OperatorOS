import { db } from '../db.js';

/**
 * Phase 33 additive StudyForge restoration.
 *
 * Identity, tenants, memberships, roles, subscription, entitlements, billing,
 * AI-provider configuration, usage events, and audit remain OperatorOS-owned.
 * These tables persist only learning preferences and product records.
 */
export async function ensureStudyForgePhase33Tables(): Promise<void> {
  await db.execute(`
    ALTER TABLE studyforge_generations DROP CONSTRAINT IF EXISTS studyforge_generation_type_check;
    ALTER TABLE studyforge_generations ADD CONSTRAINT studyforge_generation_type_check
      CHECK (generation_type IN ('deck','quiz','study_plan','complete_set'));

    ALTER TABLE studyforge_quiz_attempts ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);
    ALTER TABLE studyforge_quiz_attempts ADD COLUMN IF NOT EXISTS review_json JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_studyforge_attempt_idempotency
      ON studyforge_quiz_attempts(tenant_id,user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

    ALTER TABLE studyforge_card_progress ADD COLUMN IF NOT EXISTS learning_state VARCHAR(16) NOT NULL DEFAULT 'learning';
    ALTER TABLE studyforge_card_progress DROP CONSTRAINT IF EXISTS studyforge_progress_learning_state_check;
    ALTER TABLE studyforge_card_progress ADD CONSTRAINT studyforge_progress_learning_state_check
      CHECK (learning_state IN ('new','learning','known'));

    CREATE TABLE IF NOT EXISTS studyforge_preferences (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      time_zone VARCHAR(100) NOT NULL DEFAULT 'UTC',
      onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
      default_difficulty VARCHAR(12) NOT NULL DEFAULT 'medium',
      daily_goal_minutes INTEGER NOT NULL DEFAULT 30,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,user_id),
      CONSTRAINT studyforge_preference_difficulty_check CHECK (default_difficulty IN ('easy','medium','hard')),
      CONSTRAINT studyforge_preference_goal_check CHECK (daily_goal_minutes BETWEEN 5 AND 480),
      CONSTRAINT studyforge_preference_timezone_check CHECK (char_length(btrim(time_zone)) BETWEEN 1 AND 100)
    );

    CREATE TABLE IF NOT EXISTS studyforge_folders (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#7c3aed',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_folder_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT studyforge_folder_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
      CONSTRAINT studyforge_folder_color_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_studyforge_folder_user_name
      ON studyforge_folders(tenant_id,user_id,lower(name)) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_study_sets (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_id VARCHAR(36),
      subject_id VARCHAR(36),
      source_id VARCHAR(36) NOT NULL,
      generation_id VARCHAR(36) NOT NULL,
      deck_id VARCHAR(36) NOT NULL,
      quiz_id VARCHAR(36) NOT NULL,
      plan_id VARCHAR(36) NOT NULL,
      title VARCHAR(200) NOT NULL,
      course VARCHAR(160),
      difficulty VARCHAR(12) NOT NULL DEFAULT 'medium',
      exam_date DATE,
      summary TEXT NOT NULL,
      key_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
      review_sheet JSONB NOT NULL DEFAULT '{}'::jsonb,
      quality_score INTEGER NOT NULL DEFAULT 0,
      generation_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
      idempotency_key VARCHAR(160) NOT NULL,
      source_set_id VARCHAR(36),
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      archived_at TIMESTAMP,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_set_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_studyforge_set_key UNIQUE (tenant_id,user_id,idempotency_key),
      CONSTRAINT studyforge_set_folder_fk FOREIGN KEY (tenant_id,folder_id) REFERENCES studyforge_folders(tenant_id,id),
      CONSTRAINT studyforge_set_subject_fk FOREIGN KEY (tenant_id,subject_id) REFERENCES studyforge_subjects(tenant_id,id),
      CONSTRAINT studyforge_set_source_fk FOREIGN KEY (tenant_id,source_id) REFERENCES studyforge_sources(tenant_id,id),
      CONSTRAINT studyforge_set_generation_fk FOREIGN KEY (tenant_id,generation_id) REFERENCES studyforge_generations(tenant_id,id),
      CONSTRAINT studyforge_set_deck_fk FOREIGN KEY (tenant_id,deck_id) REFERENCES studyforge_decks(tenant_id,id),
      CONSTRAINT studyforge_set_quiz_fk FOREIGN KEY (tenant_id,quiz_id) REFERENCES studyforge_quizzes(tenant_id,id),
      CONSTRAINT studyforge_set_plan_fk FOREIGN KEY (tenant_id,plan_id) REFERENCES studyforge_plans(tenant_id,id),
      CONSTRAINT studyforge_set_source_set_fk FOREIGN KEY (tenant_id,source_set_id) REFERENCES studyforge_study_sets(tenant_id,id),
      CONSTRAINT studyforge_set_status_check CHECK (status IN ('active','archived')),
      CONSTRAINT studyforge_set_difficulty_check CHECK (difficulty IN ('easy','medium','hard')),
      CONSTRAINT studyforge_set_json_check CHECK (jsonb_typeof(key_terms)='array' AND jsonb_typeof(review_sheet)='object' AND jsonb_typeof(generation_provenance)='object'),
      CONSTRAINT studyforge_set_score_check CHECK (quality_score BETWEEN 0 AND 100)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_set_user_updated
      ON studyforge_study_sets(tenant_id,user_id,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_studyforge_set_folder
      ON studyforge_study_sets(tenant_id,user_id,folder_id) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_short_answers (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      study_set_id VARCHAR(36) NOT NULL,
      source_id VARCHAR(36) NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      topic VARCHAR(160) NOT NULL,
      source_excerpt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_short_answer_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_studyforge_short_answer_position UNIQUE (tenant_id,study_set_id,position),
      CONSTRAINT studyforge_short_answer_set_fk FOREIGN KEY (tenant_id,study_set_id) REFERENCES studyforge_study_sets(tenant_id,id),
      CONSTRAINT studyforge_short_answer_source_fk FOREIGN KEY (tenant_id,source_id) REFERENCES studyforge_sources(tenant_id,id),
      CONSTRAINT studyforge_short_answer_text_check CHECK (char_length(btrim(question)) BETWEEN 1 AND 2000 AND char_length(btrim(answer)) BETWEEN 1 AND 8000 AND char_length(btrim(source_excerpt)) BETWEEN 1 AND 1000)
    );

    CREATE TABLE IF NOT EXISTS studyforge_exam_countdowns (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      study_set_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      exam_date DATE NOT NULL,
      time_zone VARCHAR(100) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_countdown_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT studyforge_countdown_set_fk FOREIGN KEY (tenant_id,study_set_id) REFERENCES studyforge_study_sets(tenant_id,id),
      CONSTRAINT studyforge_countdown_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_countdown_user_date
      ON studyforge_exam_countdowns(tenant_id,user_id,exam_date) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_learning_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      study_set_id VARCHAR(36) NOT NULL,
      session_type VARCHAR(20) NOT NULL,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      cards_seen INTEGER NOT NULL DEFAULT 0,
      cards_known INTEGER NOT NULL DEFAULT 0,
      cards_learning INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      activity_counted_at TIMESTAMP,
      client_mutation_id VARCHAR(160) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_learning_session_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_studyforge_learning_session_mutation UNIQUE (tenant_id,user_id,client_mutation_id),
      CONSTRAINT studyforge_learning_session_set_fk FOREIGN KEY (tenant_id,study_set_id) REFERENCES studyforge_study_sets(tenant_id,id),
      CONSTRAINT studyforge_learning_session_type_check CHECK (session_type IN ('flashcards','review','plan')),
      CONSTRAINT studyforge_learning_session_counts_check CHECK (cards_seen >= 0 AND cards_known >= 0 AND cards_learning >= 0 AND duration_seconds >= 0)
    );

    ALTER TABLE studyforge_plan_sessions ADD COLUMN IF NOT EXISTS activity_counted_at TIMESTAMP;

    CREATE TABLE IF NOT EXISTS studyforge_daily_activity (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_date DATE NOT NULL,
      study_seconds INTEGER NOT NULL DEFAULT 0,
      cards_reviewed INTEGER NOT NULL DEFAULT 0,
      quiz_attempts INTEGER NOT NULL DEFAULT 0,
      sessions_completed INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,user_id,activity_date),
      CONSTRAINT studyforge_daily_activity_values_check CHECK (study_seconds >= 0 AND cards_reviewed >= 0 AND quiz_attempts >= 0 AND sessions_completed >= 0)
    );

    CREATE TABLE IF NOT EXISTS studyforge_session_card_reviews (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id VARCHAR(36) NOT NULL,
      card_id VARCHAR(36) NOT NULL,
      learning_state VARCHAR(16) NOT NULL,
      client_mutation_id VARCHAR(160) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_session_review_mutation UNIQUE (tenant_id,user_id,client_mutation_id),
      CONSTRAINT studyforge_session_review_session_fk FOREIGN KEY (tenant_id,session_id) REFERENCES studyforge_learning_sessions(tenant_id,id),
      CONSTRAINT studyforge_session_review_card_fk FOREIGN KEY (tenant_id,card_id) REFERENCES studyforge_cards(tenant_id,id),
      CONSTRAINT studyforge_session_review_state_check CHECK (learning_state IN ('learning','known'))
    );

    CREATE TABLE IF NOT EXISTS studyforge_usage_counters (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      generation_count INTEGER NOT NULL DEFAULT 0,
      quiz_attempt_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,user_id,period_start),
      CONSTRAINT studyforge_usage_counter_values_check CHECK (generation_count >= 0 AND quiz_attempt_count >= 0)
    );

    CREATE TABLE IF NOT EXISTS studyforge_generation_reservations (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(160) NOT NULL,
      period_start DATE NOT NULL,
      reserves_active_set BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,user_id,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_generation_reservations_capacity
      ON studyforge_generation_reservations(tenant_id,user_id,expires_at)
      WHERE reserves_active_set=TRUE;

    INSERT INTO studyforge_usage_counters(
      tenant_id,user_id,period_start,generation_count,quiz_attempt_count
    )
    SELECT usage.tenant_id,usage.user_id,date_trunc('month',usage.occurred_at)::date,
      SUM(usage.units)::integer,0
    FROM shared_usage_events usage
    JOIN modules module ON module.id=usage.module_id AND module.slug='studyforge-ai'
    WHERE usage.user_id IS NOT NULL
      AND usage.operation IN ('studyforge.ai_generation','studyforge.complete_generation')
      AND usage.occurred_at>=date_trunc('month',CURRENT_DATE)
      AND usage.occurred_at<date_trunc('month',CURRENT_DATE)+INTERVAL '1 month'
    GROUP BY usage.tenant_id,usage.user_id,date_trunc('month',usage.occurred_at)::date
    ON CONFLICT (tenant_id,user_id,period_start) DO UPDATE SET
      generation_count=GREATEST(
        studyforge_usage_counters.generation_count,
        EXCLUDED.generation_count
      ),
      updated_at=NOW();
  `);
}
