#!/bin/bash
set -e
npm install
npm run db:push

# Task #12 (OperatorOS entitlement authority): add columns idempotently.
# drizzle-kit push is interactive on uniques, so apply via raw SQL.
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" <<'SQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS operatoros_user_id varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS operatoros_tenant_id varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS local_role varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_entitlement_sync_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS entitlement_snapshot_json jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS revoked_at timestamp;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS users_operatoros_user_id_unique ON users (operatoros_user_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;
SQL
fi
