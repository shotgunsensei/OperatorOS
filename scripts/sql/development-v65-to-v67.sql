-- One-time, explicitly approved development repair. Never run in production.
-- Definitions match the existing v66/v67 initializers; no seeds or backfills.
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';
SET LOCAL search_path = public, pg_catalog;

DO $guard$
BEGIN
  IF current_database() IS DISTINCT FROM 'heliumdb'
     OR current_user IS DISTINCT FROM 'postgres'
     OR inet_server_addr() IS NOT NULL
     OR inet_server_port() IS NOT NULL
     OR pg_is_in_recovery()
  THEN
    RAISE EXCEPTION 'Refusing upgrade: not the approved local development database';
  END IF;
  IF to_regclass('public.shared_ai_budget_policies') IS NOT NULL
     OR to_regclass('public.shared_ai_requests') IS NOT NULL
     OR to_regclass('public.outcall_account_approvals') IS NOT NULL
     OR to_regclass('public.outcall_resource_reservations') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Baseline changed: review existing target tables before upgrading';
  END IF;
END
$guard$;

LOCK TABLE public.users, public.tenants, public.modules,
  public.outcall_call_requests IN SHARE MODE;
CREATE TEMP TABLE upgrade_row_baseline ON COMMIT DROP AS
SELECT 'users' AS name, count(*) AS total FROM public.users
UNION ALL SELECT 'tenants', count(*) FROM public.tenants
UNION ALL SELECT 'modules', count(*) FROM public.modules
UNION ALL SELECT 'outcall_call_requests', count(*) FROM public.outcall_call_requests;
CREATE TEMP TABLE upgrade_constraint_baseline ON COMMIT DROP AS
SELECT oid, conrelid, conname, contype, condeferrable, condeferred,
  convalidated, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE connamespace = 'public'::regnamespace;

CREATE TABLE shared_ai_budget_policies (
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
CREATE TABLE shared_ai_requests (
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
CREATE INDEX idx_shared_ai_requests_budget ON shared_ai_requests(tenant_id,module_id,status,settled_at);

CREATE TABLE outcall_account_approvals (
  account_key char(64) PRIMARY KEY CHECK (account_key ~ '^[0-9a-f]{64}$'),
  policy_hash char(64) NOT NULL CHECK (policy_hash ~ '^[0-9a-f]{64}$'),
  approval_reference text NOT NULL CHECK (length(approval_reference) BETWEEN 1 AND 200),
  approved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > approved_at),
  revoked_at timestamptz
);
CREATE TABLE outcall_resource_reservations (
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
CREATE UNIQUE INDEX uq_outcall_resource_call ON outcall_resource_reservations(call_request_id) WHERE call_request_id IS NOT NULL;
CREATE INDEX idx_outcall_resource_account ON outcall_resource_reservations(account_key,state,settled_at);
CREATE INDEX idx_outcall_resource_recovery ON outcall_resource_reservations(state,expires_at,lease_expires_at);

DO $verification$
DECLARE
  expected record;
  actual bigint;
BEGIN
  FOR expected IN SELECT * FROM upgrade_row_baseline LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', expected.name) INTO actual;
    IF actual IS DISTINCT FROM expected.total THEN
      RAISE EXCEPTION 'Existing row count changed: %', expected.name;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM upgrade_constraint_baseline b
    LEFT JOIN pg_constraint c ON c.oid=b.oid
    WHERE c.oid IS NULL
      OR ROW(c.conrelid,c.conname,c.contype,c.condeferrable,c.condeferred,
             c.convalidated,pg_get_constraintdef(c.oid))
         IS DISTINCT FROM
         ROW(b.conrelid,b.conname,b.contype,b.condeferrable,b.condeferred,
             b.convalidated,b.definition)
  ) THEN
    RAISE EXCEPTION 'Existing constraint metadata changed';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('shared_ai_budget_policies',3,4),
    ('shared_ai_requests',2,11),
    ('outcall_account_approvals',1,4),
    ('outcall_resource_reservations',4,8)
  ) AS targets(name,fks,checks) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', expected.name) INTO actual;
    IF actual <> 0 THEN
      RAISE EXCEPTION 'New table is not empty: %', expected.name;
    END IF;
    IF (SELECT count(*) FROM pg_constraint
        WHERE conrelid=to_regclass('public.' || expected.name)
          AND contype='f' AND convalidated) <> expected.fks
       OR (SELECT count(*) FROM pg_constraint
        WHERE conrelid=to_regclass('public.' || expected.name)
          AND contype='c' AND convalidated) <> expected.checks
    THEN
      RAISE EXCEPTION 'New constraint catalog mismatch: %', expected.name;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_index WHERE indisvalid AND indisready
      AND indexrelid IN (
        to_regclass('public.idx_shared_ai_requests_budget'),
        to_regclass('public.uq_outcall_resource_call'),
        to_regclass('public.idx_outcall_resource_account'),
        to_regclass('public.idx_outcall_resource_recovery')
      )) <> 4
  THEN
    RAISE EXCEPTION 'New indexes are missing or not ready';
  END IF;
END
$verification$;
COMMIT;
