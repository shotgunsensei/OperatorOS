import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function ensureOutCallResourceTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS outcall_account_approvals (
      account_key char(64) PRIMARY KEY CHECK (account_key ~ '^[0-9a-f]{64}$'),
      policy_hash char(64) NOT NULL CHECK (policy_hash ~ '^[0-9a-f]{64}$'),
      approval_reference text NOT NULL CHECK (length(approval_reference) BETWEEN 1 AND 200),
      approved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
      approved_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL CHECK (expires_at > approved_at),
      revoked_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS outcall_resource_reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_key char(64) NOT NULL REFERENCES outcall_account_approvals(account_key) ON DELETE RESTRICT,
      policy_hash char(64) NOT NULL,
      tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      user_id text REFERENCES users(id) ON DELETE SET NULL,
      call_request_id text REFERENCES outcall_call_requests(id) ON DELETE SET NULL,
      operation text NOT NULL CHECK (operation IN ('voice','verify_start','verify_check','sms_reply')),
      request_digest char(64) NOT NULL UNIQUE CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','submitting','active','unknown','spent','released')),
      ceiling_micros bigint NOT NULL CHECK (ceiling_micros BETWEEN 1 AND 1000000000000),
      max_call_seconds integer NOT NULL CHECK (max_call_seconds BETWEEN 1 AND 300),
      due_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      lease_expires_at timestamptz,
      settled_at timestamptz,
      failure_code text CHECK (length(failure_code) <= 100),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CHECK ((state IN ('spent','released') AND settled_at IS NOT NULL) OR (state NOT IN ('spent','released') AND settled_at IS NULL)),
      CHECK (operation='voice' OR call_request_id IS NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_outcall_resource_call ON outcall_resource_reservations(call_request_id) WHERE call_request_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_outcall_resource_account ON outcall_resource_reservations(account_key,state,settled_at);
    CREATE INDEX IF NOT EXISTS idx_outcall_resource_recovery ON outcall_resource_reservations(state,expires_at,lease_expires_at);
  `);
  // No approval seed and no spending grant/backfill. Existing call records stay intact.
}

export async function verifyOutCallResourceTables(): Promise<void> {
  const result = await db.execute(sql`SELECT
    to_regclass('public.outcall_account_approvals') IS NOT NULL
    AND to_regclass('public.outcall_resource_reservations') IS NOT NULL
    AND to_regclass('public.uq_outcall_resource_call') IS NOT NULL
    AND to_regclass('public.idx_outcall_resource_account') IS NOT NULL
    AND to_regclass('public.idx_outcall_resource_recovery') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
        ('account_key','NO'),('policy_hash','NO'),('tenant_id','NO'),('operation','NO'),
        ('request_digest','NO'),('state','NO'),('ceiling_micros','NO'),
        ('max_call_seconds','NO'),('due_at','NO'),('expires_at','NO'),
        ('lease_expires_at','YES'),('settled_at','YES')) required(column_name,is_nullable)
      LEFT JOIN information_schema.columns actual ON actual.table_schema='public'
        AND actual.table_name='outcall_resource_reservations' AND actual.column_name=required.column_name
      WHERE actual.column_name IS NULL OR actual.is_nullable<>required.is_nullable
    )
    AND (SELECT COUNT(*) FROM pg_constraint WHERE conrelid=to_regclass('public.outcall_resource_reservations')
      AND contype='f' AND convalidated)=4
    AND (SELECT COUNT(*) FROM pg_constraint WHERE conrelid=to_regclass('public.outcall_resource_reservations')
      AND contype='c' AND convalidated)=8
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.outcall_resource_reservations')
      AND contype='u' AND convalidated AND pg_get_constraintdef(oid)='UNIQUE (request_digest)')
    AS ready`);
  if (result.rows[0]?.ready !== true) throw new Error('OutCall resource schema is incomplete');
}
