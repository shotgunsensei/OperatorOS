import { databasePool } from '../db.js';

/** Additive, unseeded tool-purchase ledger. Registered by the root release manifest. */
export async function ensureToolPurchaseTables(): Promise<void> {
  const client = await databasePool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tool_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
        user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        tool_slug VARCHAR(32) NOT NULL CHECK (tool_slug IN ('officeexit','vendortrust365')),
        request_key VARCHAR(128) NOT NULL,
        offer_snapshot JSONB NOT NULL,
        snapshot_sha256 CHAR(64) NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
        provider_mode VARCHAR(8) NOT NULL CHECK (provider_mode IN ('test','live')),
        provider_account_id VARCHAR(200) NOT NULL CHECK (provider_account_id ~ '^acct_[A-Za-z0-9_]+$'),
        status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','disputed','cancelled')),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        customer_id VARCHAR(200),
        checkout_session_id VARCHAR(200),
        payment_intent_id VARCHAR(200),
        charge_id VARCHAR(200),
        policy_review_required BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT tool_purchases_tenant_id_unique UNIQUE (tenant_id,id),
        CONSTRAINT tool_purchases_request_unique UNIQUE (tenant_id,request_key),
        CONSTRAINT tool_purchases_snapshot_check CHECK (COALESCE((
          jsonb_typeof(offer_snapshot)='object' AND
          offer_snapshot ?& ARRAY['offerVersion','providerPriceId','providerProductId','amountMinor','currency','licenseTermsVersion','licenseUnit','licenseAllowance','coverage','officeexitGrant'] AND
          offer_snapshot - ARRAY['offerVersion','providerPriceId','providerProductId','amountMinor','currency','licenseTermsVersion','licenseUnit','licenseAllowance','coverage','officeexitGrant']='{}'::jsonb AND
          jsonb_typeof(offer_snapshot->'amountMinor')='number' AND
          jsonb_typeof(offer_snapshot->'licenseAllowance')='number' AND
          offer_snapshot->>'amountMinor'='9900' AND
          offer_snapshot->>'licenseAllowance'='1' AND
          offer_snapshot->>'licenseUnit'='tenant' AND
          offer_snapshot->>'coverage'='entire_tenant' AND
          offer_snapshot->>'currency'='usd' AND
          jsonb_typeof(offer_snapshot->'offerVersion')='string' AND offer_snapshot->>'offerVersion' ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' AND
          jsonb_typeof(offer_snapshot->'providerPriceId')='string' AND offer_snapshot->>'providerPriceId' ~ '^price_[A-Za-z0-9_]+$' AND
          jsonb_typeof(offer_snapshot->'providerProductId')='string' AND offer_snapshot->>'providerProductId' ~ '^prod_[A-Za-z0-9_]+$' AND
          jsonb_typeof(offer_snapshot->'licenseTermsVersion')='string' AND offer_snapshot->>'licenseTermsVersion' ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' AND
          ((tool_slug='vendortrust365' AND offer_snapshot->'officeexitGrant'='null'::jsonb) OR
           (tool_slug='officeexit' AND jsonb_typeof(offer_snapshot->'officeexitGrant')='object' AND
            (offer_snapshot->'officeexitGrant') ?& ARRAY['edition','coverage','capabilities'] AND
            offer_snapshot->'officeexitGrant'->>'coverage'='entire_tenant' AND
            jsonb_typeof(offer_snapshot->'officeexitGrant'->'edition')='string' AND
            offer_snapshot->'officeexitGrant'->>'edition' IN ('Technician','Professional','MSP','MSP Pro','Consultant') AND
            jsonb_typeof(offer_snapshot->'officeexitGrant'->'capabilities')='array' AND
            (offer_snapshot->'officeexitGrant') - ARRAY['edition','coverage','capabilities']='{}'::jsonb))
        ),false))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS tool_purchases_one_pending
        ON tool_purchases(tenant_id,tool_slug) WHERE status='pending';
      CREATE UNIQUE INDEX IF NOT EXISTS tool_purchases_one_current
        ON tool_purchases(tenant_id,tool_slug) WHERE status IN ('pending','paid');
      CREATE UNIQUE INDEX IF NOT EXISTS tool_purchases_session_unique
        ON tool_purchases(provider_mode,provider_account_id,checkout_session_id) WHERE checkout_session_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS tool_purchases_payment_unique
        ON tool_purchases(provider_mode,provider_account_id,payment_intent_id) WHERE payment_intent_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS tool_purchases_charge_unique
        ON tool_purchases(provider_mode,provider_account_id,charge_id) WHERE charge_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS tool_purchases_tenant_status ON tool_purchases(tenant_id,status,created_at DESC);

      CREATE TABLE IF NOT EXISTS tool_purchase_events (
        provider_mode VARCHAR(8) NOT NULL,
        provider_account_id VARCHAR(200) NOT NULL,
        event_id VARCHAR(200) NOT NULL,
        tenant_id VARCHAR(36) NOT NULL,
        purchase_id UUID NOT NULL,
        event_type VARCHAR(120) NOT NULL,
        action VARCHAR(16) NOT NULL CHECK (action IN ('paid','refunded','disputed','cancelled')),
        payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
        raw_payload_sha256 CHAR(64) NOT NULL CHECK (raw_payload_sha256 ~ '^[a-f0-9]{64}$'),
        binding_sha256 CHAR(64) NOT NULL CHECK (binding_sha256 ~ '^[a-f0-9]{64}$'),
        ignored BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (provider_mode,provider_account_id,event_id),
        CONSTRAINT tool_purchase_events_purchase_fk FOREIGN KEY (tenant_id,purchase_id) REFERENCES tool_purchases(tenant_id,id)
      );

      CREATE TABLE IF NOT EXISTS tool_fulfillment_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(36) NOT NULL,
        purchase_id UUID NOT NULL UNIQUE,
        tool_slug VARCHAR(32) NOT NULL CHECK (tool_slug IN ('officeexit','vendortrust365')),
        revision INTEGER NOT NULL CHECK (revision > 0),
        payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
        status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','delivered','dead')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lease_token UUID,
        worker_id VARCHAR(100),
        lease_expires_at TIMESTAMPTZ,
        last_error_code VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT tool_fulfillment_purchase_fk FOREIGN KEY (tenant_id,purchase_id) REFERENCES tool_purchases(tenant_id,id),
        CONSTRAINT tool_fulfillment_lease_check CHECK (
          (status='leased' AND lease_token IS NOT NULL AND worker_id IS NOT NULL AND lease_expires_at IS NOT NULL)
          OR (status<>'leased' AND lease_token IS NULL AND worker_id IS NULL AND lease_expires_at IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS tool_fulfillment_ready ON tool_fulfillment_outbox(status,available_at,lease_expires_at);

      CREATE OR REPLACE FUNCTION enforce_tool_purchase_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF ROW(NEW.id,NEW.tenant_id,NEW.user_id,NEW.tool_slug,NEW.request_key,NEW.offer_snapshot,NEW.snapshot_sha256,NEW.provider_mode,NEW.provider_account_id,NEW.created_at)
           IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.user_id,OLD.tool_slug,OLD.request_key,OLD.offer_snapshot,OLD.snapshot_sha256,OLD.provider_mode,OLD.provider_account_id,OLD.created_at)
        THEN RAISE EXCEPTION 'tool purchase provenance is immutable' USING ERRCODE='23514'; END IF;
        IF (OLD.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id)
          OR (OLD.checkout_session_id IS NOT NULL AND NEW.checkout_session_id IS DISTINCT FROM OLD.checkout_session_id)
          OR (OLD.payment_intent_id IS NOT NULL AND NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id)
          OR (OLD.charge_id IS NOT NULL AND NEW.charge_id IS DISTINCT FROM OLD.charge_id)
        THEN RAISE EXCEPTION 'tool payment binding is immutable' USING ERRCODE='23514'; END IF;
        IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.revision<>OLD.revision+1)
          OR (NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.revision<>OLD.revision)
          OR (OLD.status IN ('refunded','disputed','cancelled') AND NEW.status IN ('pending','paid'))
          OR (OLD.status='paid' AND NEW.status='pending')
          OR (OLD.policy_review_required AND NOT NEW.policy_review_required)
        THEN RAISE EXCEPTION 'invalid tool purchase transition' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END $$;
      DROP TRIGGER IF EXISTS tool_purchase_immutability ON tool_purchases;
      CREATE TRIGGER tool_purchase_immutability BEFORE UPDATE ON tool_purchases FOR EACH ROW EXECUTE FUNCTION enforce_tool_purchase_immutability();
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Read-only convergence check: an incompatible partial schema fails closed. */
export async function verifyToolPurchaseTables(): Promise<void> {
  const columns: Record<string, Record<string, string>> = {
    tool_purchases: { id: 'uuid', tenant_id: 'character varying(36)', user_id: 'character varying(36)', tool_slug: 'character varying(32)', request_key: 'character varying(128)', offer_snapshot: 'jsonb', snapshot_sha256: 'character(64)', provider_mode: 'character varying(8)', provider_account_id: 'character varying(200)', status: 'character varying(16)', revision: 'integer', customer_id: '?character varying(200)', checkout_session_id: '?character varying(200)', payment_intent_id: '?character varying(200)', charge_id: '?character varying(200)', policy_review_required: 'boolean', created_at: 'timestamp with time zone', updated_at: 'timestamp with time zone' },
    tool_purchase_events: { provider_mode: 'character varying(8)', provider_account_id: 'character varying(200)', event_id: 'character varying(200)', tenant_id: 'character varying(36)', purchase_id: 'uuid', event_type: 'character varying(120)', action: 'character varying(16)', payload_sha256: 'character(64)', raw_payload_sha256: 'character(64)', binding_sha256: 'character(64)', ignored: 'boolean', created_at: 'timestamp with time zone' },
    tool_fulfillment_outbox: { id: 'uuid', tenant_id: 'character varying(36)', purchase_id: 'uuid', tool_slug: 'character varying(32)', revision: 'integer', payload: 'jsonb', status: 'character varying(16)', attempts: 'integer', available_at: 'timestamp with time zone', lease_token: '?uuid', worker_id: '?character varying(100)', lease_expires_at: '?timestamp with time zone', last_error_code: '?character varying(64)', created_at: 'timestamp with time zone', updated_at: 'timestamp with time zone' },
  };
  const actual = await databasePool.query<{ table_name: string; column_name: string; data_type: string; required: boolean }>(`SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull AS required
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`, [Object.keys(columns)]);
  for (const [table, expected] of Object.entries(columns)) for (const [name, type] of Object.entries(expected)) {
    const found = actual.rows.find(row => row.table_name === table && row.column_name === name);
    if (!found || found.data_type !== type.replace(/^\?/, '') || found.required !== !type.startsWith('?')) throw new Error('TOOL_PURCHASE_SCHEMA_NOT_READY');
  }
  const { rows } = await databasePool.query<{ tables: number; constraints: number; indexes: number; triggers: number }>(`
    SELECT
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('tool_purchases','tool_purchase_events','tool_fulfillment_outbox')) AS tables,
      (SELECT count(*)::int FROM pg_constraint WHERE connamespace='public'::regnamespace AND convalidated AND conname IN ('tool_purchases_tenant_id_unique','tool_purchases_request_unique','tool_purchases_snapshot_check','tool_purchase_events_purchase_fk','tool_fulfillment_purchase_fk','tool_fulfillment_lease_check')) AS constraints,
      (SELECT count(*)::int FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace AND i.indisvalid AND i.indisready AND c.relname IN ('tool_purchases_one_pending','tool_purchases_one_current','tool_purchases_session_unique','tool_purchases_payment_unique','tool_purchases_charge_unique','tool_purchases_tenant_status','tool_fulfillment_ready')) AS indexes,
      (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='public.tool_purchases'::regclass AND tgname='tool_purchase_immutability' AND tgfoid='public.enforce_tool_purchase_immutability()'::regprocedure AND NOT tgisinternal AND tgenabled='O') AS triggers
  `);
  const result = rows[0];
  if (!result || result.tables !== 3 || result.constraints !== 6 || result.indexes !== 7 || result.triggers !== 1) {
    throw new Error('TOOL_PURCHASE_SCHEMA_NOT_READY');
  }
}
