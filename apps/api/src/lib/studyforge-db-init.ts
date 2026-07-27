import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Additive, idempotent Phase 11C StudyForge schema.
 *
 * Every relationship carries tenant_id so PostgreSQL, not just application
 * code, rejects cross-tenant references. Generated material is always born in
 * draft and cannot be presented as reviewed/published without an explicit
 * server-side lifecycle transition.
 */
export async function ensureStudyForgeTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS studyforge_subjects (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(160) NOT NULL,
      course_code VARCHAR(80),
      description TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_subject_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT studyforge_subject_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
      CONSTRAINT studyforge_subject_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_studyforge_subject_active_name
      ON studyforge_subjects(tenant_id,lower(name),lower(COALESCE(course_code,'')))
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_studyforge_subject_tenant_updated
      ON studyforge_subjects(tenant_id,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_sources (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      subject_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      source_type VARCHAR(20) NOT NULL DEFAULT 'note',
      body TEXT,
      attachment_id VARCHAR(36),
      content_sha256 CHAR(64) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_source_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT studyforge_source_subject_fk FOREIGN KEY (tenant_id,subject_id)
        REFERENCES studyforge_subjects(tenant_id,id),
      CONSTRAINT studyforge_source_attachment_fk FOREIGN KEY (tenant_id,attachment_id)
        REFERENCES shared_attachments(tenant_id,id),
      CONSTRAINT studyforge_source_type_check CHECK (source_type IN ('note','document')),
      CONSTRAINT studyforge_source_content_check CHECK (
        (source_type='note' AND body IS NOT NULL AND char_length(btrim(body)) BETWEEN 8 AND 100000 AND attachment_id IS NULL) OR
        (source_type='document' AND attachment_id IS NOT NULL)
      ),
      CONSTRAINT studyforge_source_hash_check CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT studyforge_source_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_source_tenant_subject
      ON studyforge_sources(tenant_id,subject_id,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_studyforge_source_tenant_hash
      ON studyforge_sources(tenant_id,content_sha256) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_generations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      source_id VARCHAR(36) NOT NULL,
      generation_type VARCHAR(20) NOT NULL,
      idempotency_key VARCHAR(160) NOT NULL,
      input_sha256 CHAR(64) NOT NULL,
      output_json JSONB NOT NULL,
      source_references JSONB NOT NULL,
      provider VARCHAR(40) NOT NULL,
      model VARCHAR(120) NOT NULL,
      provider_version VARCHAR(80) NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_generation_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_studyforge_generation_key UNIQUE (tenant_id,user_id,idempotency_key),
      CONSTRAINT studyforge_generation_source_fk FOREIGN KEY (tenant_id,source_id)
        REFERENCES studyforge_sources(tenant_id,id),
      CONSTRAINT studyforge_generation_type_check CHECK (generation_type IN ('deck','quiz','study_plan')),
      CONSTRAINT studyforge_generation_hash_check CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT studyforge_generation_json_check CHECK (
        jsonb_typeof(output_json)='object' AND jsonb_typeof(source_references)='array'
      ),
      CONSTRAINT studyforge_generation_usage_check CHECK (token_count >= 0 AND duration_ms >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_generation_tenant_created
      ON studyforge_generations(tenant_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS studyforge_decks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      subject_id VARCHAR(36),
      source_id VARCHAR(36),
      generation_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_deck_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT studyforge_deck_subject_fk FOREIGN KEY (tenant_id,subject_id)
        REFERENCES studyforge_subjects(tenant_id,id),
      CONSTRAINT studyforge_deck_source_fk FOREIGN KEY (tenant_id,source_id)
        REFERENCES studyforge_sources(tenant_id,id),
      CONSTRAINT studyforge_deck_generation_fk FOREIGN KEY (tenant_id,generation_id)
        REFERENCES studyforge_generations(tenant_id,id),
      CONSTRAINT studyforge_deck_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
      CONSTRAINT studyforge_deck_status_check CHECK (status IN ('draft','review','published','archived')),
      CONSTRAINT studyforge_deck_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_deck_tenant_status
      ON studyforge_decks(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_studyforge_deck_tenant_subject
      ON studyforge_decks(tenant_id,subject_id) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_cards (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      deck_id VARCHAR(36) NOT NULL,
      source_id VARCHAR(36),
      position INTEGER NOT NULL DEFAULT 0,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source_excerpt TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_card_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_studyforge_card_position UNIQUE (tenant_id,deck_id,position),
      CONSTRAINT studyforge_card_deck_fk FOREIGN KEY (tenant_id,deck_id)
        REFERENCES studyforge_decks(tenant_id,id),
      CONSTRAINT studyforge_card_source_fk FOREIGN KEY (tenant_id,source_id)
        REFERENCES studyforge_sources(tenant_id,id),
      CONSTRAINT studyforge_card_text_check CHECK (
        char_length(btrim(question)) BETWEEN 1 AND 2000 AND
        char_length(btrim(answer)) BETWEEN 1 AND 8000
      ),
      CONSTRAINT studyforge_card_citation_check CHECK (
        source_excerpt IS NULL OR (source_id IS NOT NULL AND char_length(source_excerpt) BETWEEN 1 AND 1000)
      ),
      CONSTRAINT studyforge_card_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_card_deck
      ON studyforge_cards(tenant_id,deck_id,position) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_quizzes (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      subject_id VARCHAR(36),
      source_id VARCHAR(36),
      generation_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_quiz_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT studyforge_quiz_subject_fk FOREIGN KEY (tenant_id,subject_id)
        REFERENCES studyforge_subjects(tenant_id,id),
      CONSTRAINT studyforge_quiz_source_fk FOREIGN KEY (tenant_id,source_id)
        REFERENCES studyforge_sources(tenant_id,id),
      CONSTRAINT studyforge_quiz_generation_fk FOREIGN KEY (tenant_id,generation_id)
        REFERENCES studyforge_generations(tenant_id,id),
      CONSTRAINT studyforge_quiz_status_check CHECK (status IN ('draft','review','published','archived')),
      CONSTRAINT studyforge_quiz_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_quiz_tenant_status
      ON studyforge_quizzes(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_questions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      quiz_id VARCHAR(36) NOT NULL,
      source_id VARCHAR(36),
      position INTEGER NOT NULL DEFAULT 0,
      question TEXT NOT NULL,
      choices JSONB NOT NULL DEFAULT '[]'::jsonb,
      correct_index INTEGER NOT NULL,
      explanation TEXT NOT NULL,
      source_excerpt TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_question_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_studyforge_question_position UNIQUE (tenant_id,quiz_id,position),
      CONSTRAINT studyforge_question_quiz_fk FOREIGN KEY (tenant_id,quiz_id)
        REFERENCES studyforge_quizzes(tenant_id,id),
      CONSTRAINT studyforge_question_source_fk FOREIGN KEY (tenant_id,source_id)
        REFERENCES studyforge_sources(tenant_id,id),
      CONSTRAINT studyforge_question_choices_check CHECK (
        jsonb_typeof(choices)='array' AND jsonb_array_length(choices) BETWEEN 2 AND 6
      ),
      CONSTRAINT studyforge_question_correct_check CHECK (
        correct_index >= 0 AND correct_index < jsonb_array_length(choices)
      ),
      CONSTRAINT studyforge_question_citation_check CHECK (
        source_excerpt IS NULL OR (source_id IS NOT NULL AND char_length(source_excerpt) BETWEEN 1 AND 1000)
      ),
      CONSTRAINT studyforge_question_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_question_quiz
      ON studyforge_questions(tenant_id,quiz_id,position) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_quiz_attempts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      quiz_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      answers JSONB NOT NULL,
      correct_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      score_percent INTEGER NOT NULL,
      completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_attempt_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT studyforge_attempt_quiz_fk FOREIGN KEY (tenant_id,quiz_id)
        REFERENCES studyforge_quizzes(tenant_id,id),
      CONSTRAINT studyforge_attempt_answers_check CHECK (jsonb_typeof(answers)='array'),
      CONSTRAINT studyforge_attempt_score_check CHECK (
        total_count > 0 AND correct_count BETWEEN 0 AND total_count AND score_percent BETWEEN 0 AND 100
      )
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_attempt_user_completed
      ON studyforge_quiz_attempts(tenant_id,user_id,completed_at DESC);

    CREATE TABLE IF NOT EXISTS studyforge_plans (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      subject_id VARCHAR(36),
      source_id VARCHAR(36),
      generation_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      target_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_plan_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT studyforge_plan_subject_fk FOREIGN KEY (tenant_id,subject_id)
        REFERENCES studyforge_subjects(tenant_id,id),
      CONSTRAINT studyforge_plan_source_fk FOREIGN KEY (tenant_id,source_id)
        REFERENCES studyforge_sources(tenant_id,id),
      CONSTRAINT studyforge_plan_generation_fk FOREIGN KEY (tenant_id,generation_id)
        REFERENCES studyforge_generations(tenant_id,id),
      CONSTRAINT studyforge_plan_status_check CHECK (status IN ('draft','review','published','completed','archived')),
      CONSTRAINT studyforge_plan_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_plan_tenant_status
      ON studyforge_plans(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS studyforge_plan_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      plan_id VARCHAR(36) NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      title VARCHAR(200) NOT NULL,
      focus TEXT,
      scheduled_for DATE,
      estimated_minutes INTEGER NOT NULL DEFAULT 30,
      completed_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      completed_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_plan_session_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_studyforge_plan_session_position UNIQUE (tenant_id,plan_id,position),
      CONSTRAINT studyforge_plan_session_plan_fk FOREIGN KEY (tenant_id,plan_id)
        REFERENCES studyforge_plans(tenant_id,id),
      CONSTRAINT studyforge_plan_session_minutes_check CHECK (estimated_minutes BETWEEN 5 AND 480),
      CONSTRAINT studyforge_plan_session_complete_check CHECK (
        completed_at IS NOT NULL OR completed_by_user_id IS NULL
      ),
      CONSTRAINT studyforge_plan_session_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_plan_session_due
      ON studyforge_plan_sessions(tenant_id,scheduled_for,completed_at);

    CREATE TABLE IF NOT EXISTS studyforge_card_progress (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      card_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      repetitions INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      interval_days INTEGER NOT NULL DEFAULT 0,
      ease_milli INTEGER NOT NULL DEFAULT 2500,
      due_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_rating VARCHAR(12),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_studyforge_progress_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_studyforge_progress_user_card UNIQUE (tenant_id,user_id,card_id),
      CONSTRAINT studyforge_progress_card_fk FOREIGN KEY (tenant_id,card_id)
        REFERENCES studyforge_cards(tenant_id,id),
      CONSTRAINT studyforge_progress_values_check CHECK (
        repetitions >= 0 AND lapses >= 0 AND interval_days BETWEEN 0 AND 3650 AND
        ease_milli BETWEEN 1300 AND 3000
      ),
      CONSTRAINT studyforge_progress_rating_check CHECK (
        last_rating IS NULL OR last_rating IN ('again','hard','good','easy')
      ),
      CONSTRAINT studyforge_progress_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_studyforge_progress_due
      ON studyforge_card_progress(tenant_id,user_id,due_at);
  `));
}
