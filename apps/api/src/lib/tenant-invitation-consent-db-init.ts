import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v55: invitations require an explicit recipient decision.
 *
 * A separate declined timestamp preserves an auditable terminal state without
 * misrepresenting a refusal as acceptance or deleting the invitation record.
 */
export async function ensureTenantInvitationConsent(): Promise<void> {
  await db.execute(sql.raw(`
    ALTER TABLE tenant_invites
      ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP;

    DO $$ BEGIN
      ALTER TABLE tenant_invites
        ADD CONSTRAINT tenant_invites_single_decision_check
        CHECK (accepted_at IS NULL OR declined_at IS NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE INDEX IF NOT EXISTS idx_tenant_invites_pending
      ON tenant_invites(tenant_id, created_at DESC)
      WHERE accepted_at IS NULL AND declined_at IS NULL;
  `));
}
