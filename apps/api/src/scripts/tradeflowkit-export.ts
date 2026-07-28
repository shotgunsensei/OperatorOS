import { writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Pool, type PoolClient } from 'pg';

const TRADEFLOWKIT_V1_SOURCE_COMMIT = '37aa67f1da804fc3ac56f36e50e01362077d7a26';

function option(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) throw new Error(`Missing required option ${name}`);
  return value;
}

function assertExternalOutput(path: string): void {
  const workspace = resolve(process.cwd());
  const target = resolve(path);
  const relation = relative(workspace, target);
  if (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation)) {
    throw new Error('The export output must be outside the OperatorOS repository');
  }
  if (!target.toLowerCase().endsWith('.json')) throw new Error('The export output must use a .json extension');
}

async function query(client: PoolClient, text: string, orgId: string): Promise<Record<string, unknown>[]> {
  const result = await client.query(text, [orgId]);
  return result.rows;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--read-only')) throw new Error('--read-only is required');
  if (process.env.OPERATOROS_TRADEFLOWKIT_EXPORT_MODE !== 'read-only') {
    throw new Error('OPERATOROS_TRADEFLOWKIT_EXPORT_MODE must equal read-only');
  }
  const connectionString = process.env.TRADEFLOWKIT_SOURCE_DATABASE_URL?.trim();
  if (!connectionString) throw new Error('TRADEFLOWKIT_SOURCE_DATABASE_URL is required');
  const sourceOrgId = option(args, '--source-org-id');
  const sourceCommit = option(args, '--source-commit');
  if (sourceCommit !== TRADEFLOWKIT_V1_SOURCE_COMMIT) {
    throw new Error(`Version 1 export requires source commit ${TRADEFLOWKIT_V1_SOURCE_COMMIT}`);
  }
  const output = resolve(option(args, '--output'));
  assertExternalOutput(output);

  const pool = new Pool({
    connectionString,
    max: 1,
    application_name: 'operatoros-tradeflowkit-read-only-export',
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const orgs = await query(client, `
      SELECT id
      FROM orgs
      WHERE id = $1
    `, sourceOrgId);
    if (orgs.length !== 1) throw new Error('Source organization was not found');

    const memberships = await query(client, `
      SELECT id, org_id AS "orgId", user_id AS "userId"
      FROM memberships
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const users = await query(client, `
      SELECT DISTINCT u.id
      FROM users u
      INNER JOIN memberships m ON m.user_id = u.id
      WHERE m.org_id = $1
      ORDER BY u.id
    `, sourceOrgId);
    const customers = await query(client, `
      SELECT id, org_id AS "orgId", name, phone, email, address, notes,
        created_at AS "createdAt", deleted_at AS "deletedAt"
      FROM customers
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const jobs = await query(client, `
      SELECT id, org_id AS "orgId", customer_id AS "customerId", title,
        description, status, scheduled_start AS "scheduledStart",
        scheduled_end AS "scheduledEnd", assigned_user_ids AS "assignedUserIds",
        priority, workflow_stage_id AS "workflowStageId",
        internal_notes AS "internalNotes", is_recurring AS "isRecurring",
        recurring_frequency AS "recurringFrequency", parent_job_id AS "parentJobId",
        recurring_series_id AS "recurringSeriesId", created_by AS "createdBy",
        updated_by AS "updatedBy", created_at AS "createdAt",
        updated_at AS "updatedAt", deleted_at AS "deletedAt"
      FROM jobs
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const jobEvents = await query(client, `
      SELECT id, org_id AS "orgId", job_id AS "jobId", type,
        created_by AS "createdBy", created_at AS "createdAt"
      FROM job_events
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const quotes = await query(client, `
      SELECT id, org_id AS "orgId", customer_id AS "customerId",
        job_id AS "jobId", status, tax_rate AS "taxRate",
        discount, notes, expires_at AS "expiresAt", sent_at AS "sentAt",
        created_by AS "createdBy", created_at AS "createdAt"
      FROM quotes
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const quoteItems = await query(client, `
      SELECT id, org_id AS "orgId", quote_id AS "quoteId",
        description, qty, unit_price AS "unitPrice"
      FROM quote_items
      WHERE org_id = $1
      ORDER BY quote_id, id
    `, sourceOrgId);
    const invoices = await query(client, `
      SELECT id, org_id AS "orgId", customer_id AS "customerId",
        job_id AS "jobId", status, tax_rate AS "taxRate", discount,
        due_date AS "dueDate", sent_at AS "sentAt", paid_at AS "paidAt",
        paid_via_stripe AS "paidViaStripe", notes,
        payment_notes AS "paymentNotes",
        recurring_interval AS "recurringInterval", next_run_at AS "nextRunAt",
        parent_invoice_id AS "parentInvoiceId", created_by AS "createdBy",
        created_at AS "createdAt", deleted_at AS "deletedAt"
      FROM invoices
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const invoiceItems = await query(client, `
      SELECT id, org_id AS "orgId", invoice_id AS "invoiceId",
        description, qty, unit_price AS "unitPrice"
      FROM invoice_items
      WHERE org_id = $1
      ORDER BY invoice_id, id
    `, sourceOrgId);
    const leads = await query(client, `
      SELECT id, org_id AS "orgId", source, status, name, phone, email,
        address, service_type AS "serviceType", description, urgency,
        estimated_value AS "estimatedValue",
        preferred_contact AS "preferredContact",
        consent_to_sms AS "consentToSms",
        assigned_user_id AS "assignedUserId", customer_id AS "customerId",
        job_id AS "jobId", last_contacted_at AS "lastContactedAt",
        next_follow_up_at AS "nextFollowUpAt", converted_at AS "convertedAt",
        lost_reason AS "lostReason", created_by AS "createdBy",
        created_at AS "createdAt", updated_at AS "updatedAt",
        deleted_at AS "deletedAt"
      FROM leads
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const leadActivities = await query(client, `
      SELECT id, org_id AS "orgId", lead_id AS "leadId", type, channel,
        direction, status, created_by AS "createdBy", created_at AS "createdAt"
      FROM lead_activities
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const leadFollowupTasks = await query(client, `
      SELECT id, org_id AS "orgId", lead_id AS "leadId",
        step_number AS "stepNumber", channel, due_at AS "dueAt", status,
        message_template AS "messageTemplate",
        last_attempt_at AS "lastAttemptAt",
        completed_at AS "completedAt", created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM lead_followup_tasks
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);
    const orgAutomations = await query(client, `
      SELECT id, org_id AS "orgId", invoice_reminder AS "invoiceReminder",
        quote_follow_up AS "quoteFollowUp"
      FROM org_automations
      WHERE org_id = $1
        AND (invoice_reminder = true OR quote_follow_up = true)
      ORDER BY id
    `, sourceOrgId);
    const reminderLog = await query(client, `
      SELECT id, org_id AS "orgId", target_type AS "targetType",
        target_id AS "targetId", status, sent_at AS "sentAt"
      FROM reminder_log
      WHERE org_id = $1
      ORDER BY id
    `, sourceOrgId);

    const snapshot = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      sourceCommit,
      orgs,
      users,
      memberships,
      sessions: [],
      subscriptions: [],
      processedStripeEvents: [],
      customers,
      jobs,
      jobEvents,
      quotes,
      quoteItems,
      invoices,
      invoiceItems,
      leads,
      leadActivities,
      leadFollowupTasks,
      orgAutomations,
      reminderLog,
    };
    await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({
      exportVersion: 1,
      sourceCommit,
      sourceOrgId,
      output,
      counts: Object.fromEntries(Object.entries(snapshot)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, (value as unknown[]).length])),
    }, null, 2)}\n`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(`[tradeflowkit-export] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
