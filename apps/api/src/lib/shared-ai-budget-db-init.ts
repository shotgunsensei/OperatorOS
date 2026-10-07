import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function ensureSharedAiBudgetTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shared_ai_budget_policies (
      tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      module_id text NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
      enabled boolean NOT NULL DEFAULT false,
      per_call_micros bigint NOT NULL DEFAULT 0 CHECK (per_call_micros BETWEEN 0 AND 1000000000000),
      daily_micros bigint NOT NULL DEFAULT 0 CHECK (daily_micros BETWEEN 0 AND 1000000000000),
      monthly_micros bigint NOT NULL DEFAULT 0 CHECK (monthly_micros BETWEEN 0 AND 1000000000000),
      updated_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,module_id),
      CHECK (per_call_micros <= daily_micros AND daily_micros <= monthly_micros)
    );
    CREATE TABLE IF NOT EXISTS shared_ai_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id text NOT NULL,
      module_id text NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      workflow text NOT NULL CHECK (length(workflow) BETWEEN 1 AND 100),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
      request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
      provider text NOT NULL,
      model text NOT NULL,
      pricing_json jsonb NOT NULL,
      status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','unknown','completed','failed','overrun')),
      reserved_micros bigint NOT NULL CHECK (reserved_micros BETWEEN 1 AND 1000000000000),
      measured_micros bigint CHECK (measured_micros BETWEEN 0 AND 1000000000000),
      usage_json jsonb,
      response_json jsonb,
      duration_ms integer CHECK (duration_ms BETWEEN 0 AND 2147483647),
      error_code text CHECK (length(error_code) <= 100),
      correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 200),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      settled_at timestamptz,
      FOREIGN KEY (tenant_id,module_id) REFERENCES shared_ai_budget_policies(tenant_id,module_id) ON DELETE RESTRICT,
      UNIQUE (tenant_id,module_id,workflow,idempotency_key),
      CHECK ((status IN ('reserved','unknown') AND measured_micros IS NULL AND settled_at IS NULL)
        OR (status IN ('completed','failed','overrun') AND measured_micros IS NOT NULL AND usage_json IS NOT NULL AND settled_at IS NOT NULL)),
      CHECK (status='completed' OR response_json IS NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_ai_requests_budget ON shared_ai_requests(tenant_id,module_id,status,settled_at);
  `);
  // No policy seed: no tenant receives provider spending authority by migration.
}

export async function verifySharedAiBudgetTables(): Promise<void> {
  const result = await db.execute(sql`SELECT
    to_regclass('public.shared_ai_budget_policies') IS NOT NULL
    AND to_regclass('public.shared_ai_requests') IS NOT NULL
    AND to_regclass('public.idx_shared_ai_requests_budget') IS NOT NULL AS ready`);
  if (result.rows[0]?.ready !== true) throw new Error('Shared AI budget schema is incomplete');
}
