import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v54: identity onboarding and removal integrity.
 *
 * Platform audit history must survive a user's privacy purge. The legacy
 * admin_audit_logs.admin_id foreign key made that impossible because every
 * registered user authors at least their own registration/login events. This
 * release preserves an actor-email snapshot and changes only that FK to
 * ON DELETE SET NULL. No audit rows are removed.
 */
export async function ensureIdentityOnboardingIntegrity(): Promise<void> {
  await db.execute(sql.raw(`
    ALTER TABLE admin_audit_logs
      ADD COLUMN IF NOT EXISTS actor_email_snapshot TEXT;

    UPDATE admin_audit_logs AS audit
    SET actor_email_snapshot = app_user.email
    FROM users AS app_user
    WHERE audit.admin_id = app_user.id
      AND audit.actor_email_snapshot IS NULL;

    DO $$
    DECLARE fk_name TEXT;
    BEGIN
      SELECT constraint_name INTO fk_name
      FROM information_schema.key_column_usage
      WHERE table_schema = current_schema()
        AND table_name = 'admin_audit_logs'
        AND column_name = 'admin_id'
        AND position_in_unique_constraint IS NOT NULL
      LIMIT 1;

      IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE admin_audit_logs DROP CONSTRAINT %I', fk_name);
      END IF;

      ALTER TABLE admin_audit_logs ALTER COLUMN admin_id DROP NOT NULL;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'admin_audit_logs'::regclass
          AND conname = 'admin_audit_logs_admin_id_users_id_fk'
      ) THEN
        ALTER TABLE admin_audit_logs
          ADD CONSTRAINT admin_audit_logs_admin_id_users_id_fk
          FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_email_snapshot
      ON admin_audit_logs(actor_email_snapshot)
      WHERE actor_email_snapshot IS NOT NULL;
  `));
}

