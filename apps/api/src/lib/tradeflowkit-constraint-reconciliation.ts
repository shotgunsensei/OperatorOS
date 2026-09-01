import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Reconcile the tenant-composite constraints that pre-date the declarative
 * Drizzle schema. Replit publishes a development-to-production schema diff;
 * keeping both environments on this additive contract prevents the provider
 * from proposing destructive drops of production tenant boundaries.
 */
export async function reconcileTradeFlowKitTenantConstraints(): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_customers_tenant_id
      ON tradeflowkit_customers(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_jobs_tenant_id
      ON tradeflowkit_jobs(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_quotes_tenant_id
      ON tradeflowkit_quotes(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_invoices_tenant_id
      ON tradeflowkit_invoices(tenant_id, id);

    DO $reconcile$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_tfk_workflows_tenant_id'
          AND conrelid = 'public.tradeflowkit_workflows'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_workflows
          ADD CONSTRAINT uq_tfk_workflows_tenant_id UNIQUE (tenant_id, id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_tfk_workflow_stages_tenant_id'
          AND conrelid = 'public.tradeflowkit_workflow_stages'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_workflow_stages
          ADD CONSTRAINT uq_tfk_workflow_stages_tenant_id UNIQUE (tenant_id, id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_workflow_stages_workflow_fk'
          AND conrelid = 'public.tradeflowkit_workflow_stages'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_workflow_stages
          ADD CONSTRAINT tfk_workflow_stages_workflow_fk
          FOREIGN KEY (tenant_id, workflow_id)
          REFERENCES tradeflowkit_workflows(tenant_id, id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_tfk_tasks_tenant_id'
          AND conrelid = 'public.tradeflowkit_tasks'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_tasks
          ADD CONSTRAINT uq_tfk_tasks_tenant_id UNIQUE (tenant_id, id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_tasks_job_tenant_fk'
          AND conrelid = 'public.tradeflowkit_tasks'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_tasks
          ADD CONSTRAINT tfk_tasks_job_tenant_fk
          FOREIGN KEY (tenant_id, job_id)
          REFERENCES tradeflowkit_jobs(tenant_id, id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_tasks_workflow_stage_tenant_fk'
          AND conrelid = 'public.tradeflowkit_tasks'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_tasks
          ADD CONSTRAINT tfk_tasks_workflow_stage_tenant_fk
          FOREIGN KEY (tenant_id, workflow_stage_id)
          REFERENCES tradeflowkit_workflow_stages(tenant_id, id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_task_dependencies_task_fk'
          AND conrelid = 'public.tradeflowkit_task_dependencies'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_task_dependencies
          ADD CONSTRAINT tfk_task_dependencies_task_fk
          FOREIGN KEY (tenant_id, task_id)
          REFERENCES tradeflowkit_tasks(tenant_id, id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_task_dependencies_parent_fk'
          AND conrelid = 'public.tradeflowkit_task_dependencies'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_task_dependencies
          ADD CONSTRAINT tfk_task_dependencies_parent_fk
          FOREIGN KEY (tenant_id, depends_on_task_id)
          REFERENCES tradeflowkit_tasks(tenant_id, id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_quote_items_quote_fk'
          AND conrelid = 'public.tradeflowkit_quote_items'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_quote_items
          ADD CONSTRAINT tfk_quote_items_quote_fk
          FOREIGN KEY (tenant_id, quote_id)
          REFERENCES tradeflowkit_quotes(tenant_id, id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_invoice_items_invoice_fk'
          AND conrelid = 'public.tradeflowkit_invoice_items'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_invoice_items
          ADD CONSTRAINT tfk_invoice_items_invoice_fk
          FOREIGN KEY (tenant_id, invoice_id)
          REFERENCES tradeflowkit_invoices(tenant_id, id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_payments_invoice_fk'
          AND conrelid = 'public.tradeflowkit_payments'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_payments
          ADD CONSTRAINT tfk_payments_invoice_fk
          FOREIGN KEY (tenant_id, invoice_id)
          REFERENCES tradeflowkit_invoices(tenant_id, id) ON DELETE RESTRICT;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_tfk_tags_tenant_id'
          AND conrelid = 'public.tradeflowkit_tags'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_tags
          ADD CONSTRAINT uq_tfk_tags_tenant_id UNIQUE (tenant_id, id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tfk_tag_assignments_tag_fk'
          AND conrelid = 'public.tradeflowkit_tag_assignments'::regclass
      ) THEN
        ALTER TABLE tradeflowkit_tag_assignments
          ADD CONSTRAINT tfk_tag_assignments_tag_fk
          FOREIGN KEY (tenant_id, tag_id)
          REFERENCES tradeflowkit_tags(tenant_id, id) ON DELETE CASCADE;
      END IF;
    END
    $reconcile$;
  `);
}
