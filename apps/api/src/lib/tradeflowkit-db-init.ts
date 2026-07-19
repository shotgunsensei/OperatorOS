import { db } from '../db.js';

/**
 * Additive, idempotent TradeFlowKit state-5 schema release.
 *
 * Existing JSON document line items remain as a compatibility projection;
 * normalized rows are authoritative for new workflows and are backfilled from
 * legacy rows. Rollback is restore-to-new-database per the root release
 * contract; no destructive down migration is attempted in place.
 */
export async function ensureTradeFlowKitTables(): Promise<void> {
  await db.execute(`
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS preferred_contact TEXT;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS consent_to_sms BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS assigned_to_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS directory_organization_id VARCHAR(36) REFERENCES directory_organizations(id) ON DELETE SET NULL;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36);
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS job_id VARCHAR(36);
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS source_id TEXT;
    ALTER TABLE tradeflowkit_leads ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_leads_tenant_id ON tradeflowkit_leads(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_leads_tenant_source ON tradeflowkit_leads(tenant_id, source_id) WHERE source_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tfk_leads_assignee ON tradeflowkit_leads(tenant_id, assigned_to_user_id, status);
    ALTER TABLE tradeflowkit_leads DROP CONSTRAINT IF EXISTS tradeflowkit_leads_source_check;
    ALTER TABLE tradeflowkit_leads DROP CONSTRAINT IF EXISTS tradeflowkit_leads_status_check;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_leads ADD CONSTRAINT tradeflowkit_leads_source_check
        CHECK (source IN ('manual','import','public_form','phone','email','referral','other'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_leads ADD CONSTRAINT tradeflowkit_leads_status_check
        CHECK (status IN ('new','contacted','qualified','follow_up','converted','lost'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_leads ADD CONSTRAINT tfk_leads_version_check CHECK (version >= 1);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE tradeflowkit_customers ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) REFERENCES directory_organizations(id) ON DELETE RESTRICT;
    ALTER TABLE tradeflowkit_customers ADD COLUMN IF NOT EXISTS primary_contact_id VARCHAR(36) REFERENCES directory_contacts(id) ON DELETE SET NULL;
    ALTER TABLE tradeflowkit_customers ADD COLUMN IF NOT EXISTS primary_site_id VARCHAR(36) REFERENCES directory_sites(id) ON DELETE SET NULL;
    ALTER TABLE tradeflowkit_customers ADD COLUMN IF NOT EXISTS portal_token_hash VARCHAR(64);
    ALTER TABLE tradeflowkit_customers ADD COLUMN IF NOT EXISTS source_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_customers_tenant_id ON tradeflowkit_customers(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_customers_tenant_source ON tradeflowkit_customers(tenant_id, source_id) WHERE source_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_customers_portal_token ON tradeflowkit_customers(portal_token_hash) WHERE portal_token_hash IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tfk_customers_tenant_org ON tradeflowkit_customers(tenant_id, organization_id);
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_customers ADD CONSTRAINT tfk_customers_org_tenant_fk
        FOREIGN KEY (tenant_id, organization_id) REFERENCES directory_organizations(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_customers ADD CONSTRAINT tfk_customers_contact_tenant_fk
        FOREIGN KEY (tenant_id, primary_contact_id) REFERENCES directory_contacts(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_customers ADD CONSTRAINT tfk_customers_site_tenant_fk
        FOREIGN KEY (tenant_id, primary_site_id) REFERENCES directory_sites(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE tradeflowkit_jobs ADD COLUMN IF NOT EXISTS number INTEGER;
    ALTER TABLE tradeflowkit_jobs ADD COLUMN IF NOT EXISTS site_id VARCHAR(36) REFERENCES directory_sites(id) ON DELETE SET NULL;
    ALTER TABLE tradeflowkit_jobs ADD COLUMN IF NOT EXISTS assigned_to_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE tradeflowkit_jobs ADD COLUMN IF NOT EXISTS internal_notes TEXT;
    ALTER TABLE tradeflowkit_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    ALTER TABLE tradeflowkit_jobs ADD COLUMN IF NOT EXISTS source_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_jobs_tenant_id ON tradeflowkit_jobs(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_jobs_tenant_number ON tradeflowkit_jobs(tenant_id, number) WHERE number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_jobs_tenant_source ON tradeflowkit_jobs(tenant_id, source_id) WHERE source_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tfk_jobs_tenant_assignee ON tradeflowkit_jobs(tenant_id, assigned_to_user_id, status);
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_jobs ADD CONSTRAINT tfk_jobs_customer_tenant_fk
        FOREIGN KEY (tenant_id, customer_id) REFERENCES tradeflowkit_customers(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_jobs ADD CONSTRAINT tfk_jobs_site_tenant_fk
        FOREIGN KEY (tenant_id, site_id) REFERENCES directory_sites(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_jobs ADD CONSTRAINT tfk_jobs_version_check CHECK (version >= 1);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS tradeflowkit_tasks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      job_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      assigned_to_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'normal',
      due_at TIMESTAMP,
      sort_order INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMP,
      source_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      deleted_at TIMESTAMP,
      CONSTRAINT uq_tfk_tasks_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT tfk_tasks_job_tenant_fk FOREIGN KEY (tenant_id, job_id)
        REFERENCES tradeflowkit_jobs(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT tfk_tasks_status_check CHECK (status IN ('todo','in_progress','blocked','completed','canceled')),
      CONSTRAINT tfk_tasks_priority_check CHECK (priority IN ('low','normal','high','urgent')),
      CONSTRAINT tfk_tasks_version_check CHECK (version >= 1),
      CONSTRAINT tfk_tasks_sort_check CHECK (sort_order >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_tasks_tenant_job ON tradeflowkit_tasks(tenant_id, job_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_tfk_tasks_tenant_assignee ON tradeflowkit_tasks(tenant_id, assigned_to_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_tfk_tasks_tenant_due ON tradeflowkit_tasks(tenant_id, due_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_tasks_tenant_source ON tradeflowkit_tasks(tenant_id, source_id) WHERE source_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS tradeflowkit_task_dependencies (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      task_id VARCHAR(36) NOT NULL,
      depends_on_task_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT tfk_task_dependencies_task_fk FOREIGN KEY (tenant_id, task_id)
        REFERENCES tradeflowkit_tasks(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT tfk_task_dependencies_parent_fk FOREIGN KEY (tenant_id, depends_on_task_id)
        REFERENCES tradeflowkit_tasks(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT tfk_task_dependencies_not_self CHECK (task_id <> depends_on_task_id),
      CONSTRAINT uq_tfk_task_dependency UNIQUE (tenant_id, task_id, depends_on_task_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_task_dependency_parent ON tradeflowkit_task_dependencies(tenant_id, depends_on_task_id);

    ALTER TABLE tradeflowkit_quotes ADD COLUMN IF NOT EXISTS number INTEGER;
    ALTER TABLE tradeflowkit_quotes ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP;
    ALTER TABLE tradeflowkit_quotes ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP;
    ALTER TABLE tradeflowkit_quotes ADD COLUMN IF NOT EXISTS public_token_hash VARCHAR(64);
    ALTER TABLE tradeflowkit_quotes ADD COLUMN IF NOT EXISTS source_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_quotes_tenant_id ON tradeflowkit_quotes(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_quotes_tenant_number ON tradeflowkit_quotes(tenant_id, number) WHERE number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_quotes_tenant_source ON tradeflowkit_quotes(tenant_id, source_id) WHERE source_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_quotes_public_token ON tradeflowkit_quotes(public_token_hash) WHERE public_token_hash IS NOT NULL;
    ALTER TABLE tradeflowkit_quotes DROP CONSTRAINT IF EXISTS tfk_quotes_status_check;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_quotes ADD CONSTRAINT tfk_quotes_status_check
        CHECK (status IN ('draft','sent','accepted','declined','expired','void'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_quotes ADD CONSTRAINT tfk_quotes_customer_tenant_fk
        FOREIGN KEY (tenant_id, customer_id) REFERENCES tradeflowkit_customers(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_quotes ADD CONSTRAINT tfk_quotes_job_tenant_fk
        FOREIGN KEY (tenant_id, job_id) REFERENCES tradeflowkit_jobs(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS tradeflowkit_quote_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      quote_id VARCHAR(36) NOT NULL,
      line_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL,
      source_id TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT tfk_quote_items_quote_fk FOREIGN KEY (tenant_id, quote_id)
        REFERENCES tradeflowkit_quotes(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT uq_tfk_quote_item_line UNIQUE (tenant_id, quote_id, line_number),
      CONSTRAINT tfk_quote_items_money_check CHECK (
        line_number >= 1 AND quantity_milli > 0 AND unit_price_cents >= 0 AND line_total_cents >= 0
      )
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_quote_items_quote ON tradeflowkit_quote_items(tenant_id, quote_id);
    INSERT INTO tradeflowkit_quote_items (
      tenant_id, quote_id, line_number, description, quantity_milli,
      unit_price_cents, line_total_cents
    )
    SELECT q.tenant_id, q.id, item.ordinality::integer,
      LEFT(COALESCE(item.value->>'description', 'Line item'), 500),
      GREATEST(1, COALESCE((item.value->>'quantity')::integer, 1)) * 1000,
      GREATEST(0, COALESCE((item.value->>'unitPriceCents')::integer, 0)),
      GREATEST(1, COALESCE((item.value->>'quantity')::integer, 1)) *
        GREATEST(0, COALESCE((item.value->>'unitPriceCents')::integer, 0))
    FROM tradeflowkit_quotes q
    CROSS JOIN LATERAL jsonb_array_elements(q.line_items) WITH ORDINALITY AS item(value, ordinality)
    ON CONFLICT (tenant_id, quote_id, line_number) DO NOTHING;

    ALTER TABLE tradeflowkit_invoices ADD COLUMN IF NOT EXISTS number INTEGER;
    ALTER TABLE tradeflowkit_invoices ADD COLUMN IF NOT EXISTS paid_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tradeflowkit_invoices ADD COLUMN IF NOT EXISTS balance_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tradeflowkit_invoices ADD COLUMN IF NOT EXISTS public_token_hash VARCHAR(64);
    ALTER TABLE tradeflowkit_invoices ADD COLUMN IF NOT EXISTS source_id TEXT;
    UPDATE tradeflowkit_invoices SET
      paid_cents = CASE WHEN status = 'paid' THEN total_cents ELSE paid_cents END,
      balance_cents = CASE WHEN status = 'paid' THEN 0 ELSE total_cents - paid_cents END
    WHERE balance_cents = 0 AND total_cents > 0;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_invoices_tenant_id ON tradeflowkit_invoices(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_invoices_tenant_number ON tradeflowkit_invoices(tenant_id, number) WHERE number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_invoices_tenant_source ON tradeflowkit_invoices(tenant_id, source_id) WHERE source_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_invoices_public_token ON tradeflowkit_invoices(public_token_hash) WHERE public_token_hash IS NOT NULL;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_invoices ADD CONSTRAINT tfk_invoices_customer_tenant_fk
        FOREIGN KEY (tenant_id, customer_id) REFERENCES tradeflowkit_customers(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_invoices ADD CONSTRAINT tfk_invoices_job_tenant_fk
        FOREIGN KEY (tenant_id, job_id) REFERENCES tradeflowkit_jobs(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_invoices ADD CONSTRAINT tfk_invoices_quote_tenant_fk
        FOREIGN KEY (tenant_id, source_quote_id) REFERENCES tradeflowkit_quotes(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_invoices ADD CONSTRAINT tfk_invoices_balance_check
        CHECK (paid_cents >= 0 AND balance_cents >= 0 AND paid_cents + balance_cents = total_cents);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS tradeflowkit_invoice_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      invoice_id VARCHAR(36) NOT NULL,
      line_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL,
      source_id TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT tfk_invoice_items_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
        REFERENCES tradeflowkit_invoices(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT uq_tfk_invoice_item_line UNIQUE (tenant_id, invoice_id, line_number),
      CONSTRAINT tfk_invoice_items_money_check CHECK (
        line_number >= 1 AND quantity_milli > 0 AND unit_price_cents >= 0 AND line_total_cents >= 0
      )
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_invoice_items_invoice ON tradeflowkit_invoice_items(tenant_id, invoice_id);
    INSERT INTO tradeflowkit_invoice_items (
      tenant_id, invoice_id, line_number, description, quantity_milli,
      unit_price_cents, line_total_cents
    )
    SELECT i.tenant_id, i.id, item.ordinality::integer,
      LEFT(COALESCE(item.value->>'description', 'Line item'), 500),
      GREATEST(1, COALESCE((item.value->>'quantity')::integer, 1)) * 1000,
      GREATEST(0, COALESCE((item.value->>'unitPriceCents')::integer, 0)),
      GREATEST(1, COALESCE((item.value->>'quantity')::integer, 1)) *
        GREATEST(0, COALESCE((item.value->>'unitPriceCents')::integer, 0))
    FROM tradeflowkit_invoices i
    CROSS JOIN LATERAL jsonb_array_elements(i.line_items) WITH ORDINALITY AS item(value, ordinality)
    ON CONFLICT (tenant_id, invoice_id, line_number) DO NOTHING;

    CREATE TABLE IF NOT EXISTS tradeflowkit_payments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      invoice_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      amount_cents INTEGER NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'succeeded',
      provider TEXT,
      provider_reference TEXT,
      reference TEXT,
      notes TEXT,
      idempotency_key VARCHAR(200) NOT NULL,
      paid_at TIMESTAMP DEFAULT NOW() NOT NULL,
      voided_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT tfk_payments_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
        REFERENCES tradeflowkit_invoices(tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT tfk_payments_amount_check CHECK (amount_cents > 0),
      CONSTRAINT tfk_payments_status_check CHECK (status IN ('pending','succeeded','failed','voided','refunded')),
      CONSTRAINT tfk_payments_method_check CHECK (method IN ('cash','check','card_external','bank_transfer','provider','other')),
      CONSTRAINT uq_tfk_payments_idempotency UNIQUE (tenant_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_payments_tenant_invoice ON tradeflowkit_payments(tenant_id, invoice_id, paid_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_payments_provider_ref
      ON tradeflowkit_payments(tenant_id, provider, provider_reference)
      WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;
    INSERT INTO tradeflowkit_payments (
      tenant_id, invoice_id, created_by_user_id, amount_cents, method, status,
      reference, notes, idempotency_key, paid_at
    )
    SELECT tenant_id, id, created_by_user_id, total_cents,
      COALESCE(payment_method, 'other'), 'succeeded', payment_reference,
      payment_notes, 'legacy-invoice:' || id, COALESCE(paid_at, updated_at)
    FROM tradeflowkit_invoices WHERE status = 'paid' AND total_cents > 0
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

    CREATE TABLE IF NOT EXISTS tradeflowkit_comments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      entity_type TEXT NOT NULL,
      entity_id VARCHAR(36) NOT NULL,
      body TEXT NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      deleted_at TIMESTAMP,
      CONSTRAINT tfk_comments_entity_type_check CHECK (entity_type IN ('lead','customer','job','task','quote','invoice','payment')),
      CONSTRAINT tfk_comments_body_check CHECK (char_length(body) BETWEEN 1 AND 10000),
      CONSTRAINT tfk_comments_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_comments_entity ON tradeflowkit_comments(tenant_id, entity_type, entity_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS tradeflowkit_tags (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      color TEXT,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      archived_at TIMESTAMP,
      CONSTRAINT uq_tfk_tags_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_tags_active_name ON tradeflowkit_tags(tenant_id, normalized_name) WHERE archived_at IS NULL;
    CREATE TABLE IF NOT EXISTS tradeflowkit_tag_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      tag_id VARCHAR(36) NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT tfk_tag_assignments_tag_fk FOREIGN KEY (tenant_id, tag_id)
        REFERENCES tradeflowkit_tags(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT tfk_tag_assignments_type_check CHECK (entity_type IN ('lead','customer','job','task','quote','invoice')),
      CONSTRAINT uq_tfk_tag_assignment UNIQUE (tenant_id, tag_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_tag_assignments_entity ON tradeflowkit_tag_assignments(tenant_id, entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS tradeflowkit_settings (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      job_prefix VARCHAR(12) NOT NULL DEFAULT 'JOB',
      quote_prefix VARCHAR(12) NOT NULL DEFAULT 'QTE',
      invoice_prefix VARCHAR(12) NOT NULL DEFAULT 'INV',
      default_tax_rate_bps INTEGER NOT NULL DEFAULT 0,
      default_hourly_rate_cents INTEGER NOT NULL DEFAULT 0,
      payment_terms_days INTEGER NOT NULL DEFAULT 30,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT tfk_settings_prefix_check CHECK (
        job_prefix ~ '^[A-Z0-9-]{1,12}$' AND quote_prefix ~ '^[A-Z0-9-]{1,12}$' AND invoice_prefix ~ '^[A-Z0-9-]{1,12}$'
      ),
      CONSTRAINT tfk_settings_values_check CHECK (
        default_tax_rate_bps BETWEEN 0 AND 10000 AND default_hourly_rate_cents BETWEEN 0 AND 100000000
        AND payment_terms_days BETWEEN 0 AND 365 AND currency ~ '^[A-Z]{3}$' AND version >= 1
      )
    );
    CREATE TABLE IF NOT EXISTS tradeflowkit_sequences (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      kind TEXT NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT tfk_sequences_kind_check CHECK (kind IN ('job','quote','invoice')),
      CONSTRAINT tfk_sequences_number_check CHECK (last_number >= 0),
      CONSTRAINT uq_tfk_sequence_kind UNIQUE (tenant_id, kind)
    );
    INSERT INTO tradeflowkit_sequences (tenant_id, kind, last_number)
      SELECT tenant_id, 'job', COALESCE(MAX(number), 0) FROM tradeflowkit_jobs GROUP BY tenant_id
      ON CONFLICT (tenant_id, kind) DO UPDATE SET last_number = GREATEST(tradeflowkit_sequences.last_number, EXCLUDED.last_number);
    INSERT INTO tradeflowkit_sequences (tenant_id, kind, last_number)
      SELECT tenant_id, 'quote', COALESCE(MAX(number), 0) FROM tradeflowkit_quotes GROUP BY tenant_id
      ON CONFLICT (tenant_id, kind) DO UPDATE SET last_number = GREATEST(tradeflowkit_sequences.last_number, EXCLUDED.last_number);
    INSERT INTO tradeflowkit_sequences (tenant_id, kind, last_number)
      SELECT tenant_id, 'invoice', COALESCE(MAX(number), 0) FROM tradeflowkit_invoices GROUP BY tenant_id
      ON CONFLICT (tenant_id, kind) DO UPDATE SET last_number = GREATEST(tradeflowkit_sequences.last_number, EXCLUDED.last_number);

    CREATE TABLE IF NOT EXISTS tradeflowkit_migration_refs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_table TEXT NOT NULL,
      target_id VARCHAR(36) NOT NULL,
      source_fingerprint VARCHAR(64) NOT NULL,
      imported_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT tfk_migration_fingerprint_check CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_tfk_migration_source UNIQUE (tenant_id, source_table, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_migration_target ON tradeflowkit_migration_refs(tenant_id, target_table, target_id);

    DO $$ BEGIN
      ALTER TABLE tradeflowkit_leads ADD CONSTRAINT tfk_leads_customer_tenant_fk
        FOREIGN KEY (tenant_id, customer_id) REFERENCES tradeflowkit_customers(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tradeflowkit_leads ADD CONSTRAINT tfk_leads_job_tenant_fk
        FOREIGN KEY (tenant_id, job_id) REFERENCES tradeflowkit_jobs(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
}
