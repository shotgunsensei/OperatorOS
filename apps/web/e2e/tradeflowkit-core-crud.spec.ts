import { expect, test, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'OperatorOS-E2E-Only-94!';
const PUBLIC_AUTH_HEADERS = {
  host: 'auth.operatoros.net',
  'x-forwarded-host': 'auth.operatoros.net',
  'x-forwarded-proto': 'https',
};

type Identity = { userId: string; tenantId: string; email: string };

async function registerAndSeed(request: APIRequestContext, pg: Client): Promise<Identity> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `tradeflowkit-crud-${suffix}@example.com`;
  const registration = await request.post(`${API}/v1/auth/register`, {
    headers: PUBLIC_AUTH_HEADERS,
    data: { email, password: PASSWORD, name: 'TradeFlowKit Core CRUD Gate' },
  });
  expect(registration.status(), `register: ${await registration.text()}`).toBe(202);

  const identity = await pg.query<{ user_id: string; tenant_id: string }>(
    `select id as user_id, current_tenant_id as tenant_id from users where email = $1 limit 1`,
    [email],
  );
  expect(identity.rows).toHaveLength(1);
  const { user_id: userId, tenant_id: tenantId } = identity.rows[0];
  const plan = await pg.query<{ id: string }>(`select id from subscription_plans where slug = 'elite' and is_active = true limit 1`);
  const module = await pg.query<{ id: string }>(`select id from modules where slug = 'tradeflowkit' limit 1`);
  expect(plan.rows).toHaveLength(1);
  expect(module.rows).toHaveLength(1);
  await pg.query(
    `insert into subscriptions
       (user_id, plan_id, status, current_period_start, current_period_end, tenant_id, scope_type)
     values ($1, $2, 'active', now(), now() + interval '30 days', $3, 'tenant')`,
    [userId, plan.rows[0].id, tenantId],
  );
  await pg.query(
    `insert into tenant_modules (tenant_id, module_id, status, source, allow_all_members)
     values ($1, $2, 'enabled', 'included', true)
     on conflict (tenant_id, module_id) do update set status = 'enabled', allow_all_members = true`,
    [tenantId, module.rows[0].id],
  );
  return { userId, tenantId, email };
}

async function cleanupIdentity(pg: Client, identity: Identity | null) {
  if (!identity) return;
  const { userId, tenantId } = identity;
  await pg.query('begin');
  try {
    await pg.query(`set local operatoros.tenant_hard_delete = 'on'`);
    await pg.query(
      `delete from directory_site_contacts
        where tenant_id = $1
           or contact_id in (select id from directory_contacts where tenant_id = $1)
           or site_id in (select id from directory_sites where tenant_id = $1)`,
      [tenantId],
    );
    await pg.query(
      `delete from directory_organization_contacts
        where tenant_id = $1
           or contact_id in (select id from directory_contacts where tenant_id = $1)
           or organization_id in (select id from directory_organizations where tenant_id = $1)`,
      [tenantId],
    );
    for (const table of [
      'tradeflowkit_task_dependencies',
      'tradeflowkit_comments',
      'tradeflowkit_saved_views',
      'tradeflowkit_tasks',
      'tradeflowkit_payments',
      'tradeflowkit_invoice_items',
      'tradeflowkit_invoices',
      'tradeflowkit_quote_items',
      'tradeflowkit_quotes',
      'tradeflowkit_jobs',
      'tradeflowkit_customers',
      'tradeflowkit_settings',
      'tradeflowkit_sequences',
      'directory_relationships',
      'directory_sites',
      'directory_addresses',
      'directory_contacts',
      'directory_organizations',
      'shared_idempotency_keys',
      'tenant_user_module_access',
      'tenant_modules',
      'tenant_users',
    ]) {
      await pg.query(`delete from ${table} where tenant_id = $1`, [tenantId]);
    }
    await pg.query(`delete from activity_feed where tenant_id = $1 or user_id = $2`, [tenantId, userId]);
    await pg.query('commit');
  } catch (error) {
    await pg.query('rollback').catch(() => undefined);
    throw error;
  }
  for (const [sql, params] of [
    [`delete from sso_handoff_tokens where user_id = $1`, [userId]],
    [`delete from subscriptions where user_id = $1`, [userId]],
    [`delete from admin_audit_logs where admin_id = $1 or target_user_id = $1`, [userId]],
    [`delete from tenants where id = $1`, [tenantId]],
    [`delete from users where id = $1`, [userId]],
  ] as Array<[string, string[]]>) {
    await pg.query(sql, params);
  }
}

test('TradeFlowKit customer to job to task CRUD persists across exact-host deep links and archives safely', async ({ page, request }) => {
  test.setTimeout(120_000);
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  let identity: Identity | null = null;
  const suffix = Date.now().toString(36);
  const customerName = `Functional Parity Test Client ${suffix}`;
  const updatedCustomerName = `${customerName} Updated`;
  const jobTitle = `Functional parity project ${suffix}`;
  const updatedJobTitle = `${jobTitle} Updated`;
  const taskTitle = `Initial work step ${suffix}`;
  const updatedTaskTitle = `${taskTitle} Updated`;
  const bulkCustomerName = `Bulk workflow customer ${suffix}`;
  const importedJobTitle = `Imported scheduled work ${suffix}`;
  const importedInvoiceRef = `BULK-${suffix}`;

  try {
    identity = await registerAndSeed(request, pg);
    await page.goto('https://tradeflowkit.operatoros.net/customers');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL('https://tradeflowkit.operatoros.net/customers', { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);

    const customerCreate = page.getByTestId('tradeflowkit-customer-create');
    await customerCreate.getByPlaceholder('Customer name').fill(customerName);
    await customerCreate.getByPlaceholder('Email (optional)').fill(`dispatch-${suffix}@example.com`);
    await customerCreate.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByTestId('tradeflowkit-customer-records')).toContainText(customerName);
    const customerResult = await pg.query<{ id: string }>(
      `select id from tradeflowkit_customers where tenant_id = $1 and name = $2 and deleted_at is null`,
      [identity.tenantId, customerName],
    );
    expect(customerResult.rows).toHaveLength(1);
    const customerId = customerResult.rows[0].id;

    await page.goto(`https://tradeflowkit.operatoros.net/customers/${customerId}`);
    const customerRow = page.getByTestId(`tradeflowkit-customer-${customerId}`);
    await expect(customerRow).toBeVisible();
    await customerRow.getByRole('button', { name: 'Edit' }).click();
    const customerEditor = page.getByTestId(`tradeflowkit-customer-editor-${customerId}`);
    await customerEditor.getByLabel('Customer name').fill(updatedCustomerName);
    await customerEditor.getByLabel('Customer email').fill(`service-${suffix}@example.com`);
    await customerEditor.getByLabel('Customer phone').fill('+15555550300');
    await customerEditor.getByLabel('Customer address').fill('300 Functional Way');
    await customerEditor.getByLabel('Customer notes').fill('Edited through exact-host browser flow.');
    await customerEditor.getByRole('button', { name: /^Save customer/ }).click();
    await expect(page.getByTestId(`tradeflowkit-customer-${customerId}`)).toContainText(updatedCustomerName);

    const jobCreate = page.getByTestId('tradeflowkit-job-create');
    await jobCreate.getByRole('combobox').selectOption(customerId);
    await jobCreate.getByPlaceholder('Job title').fill(jobTitle);
    await jobCreate.getByRole('button', { name: 'Add job' }).click();
    await expect.poll(async () => {
      const result = await pg.query<{ count: string }>(
        `select count(*)::text as count from tradeflowkit_jobs where tenant_id = $1 and title = $2 and deleted_at is null`,
        [identity!.tenantId, jobTitle],
      );
      return Number(result.rows[0].count);
    }).toBe(1);
    const jobResult = await pg.query<{ id: string }>(
      `select id from tradeflowkit_jobs where tenant_id = $1 and title = $2 and deleted_at is null`,
      [identity.tenantId, jobTitle],
    );
    expect(jobResult.rows).toHaveLength(1);
    const jobId = jobResult.rows[0].id;

    await page.goto(`https://tradeflowkit.operatoros.net/jobs/${jobId}`);
    const jobRecord = page.getByTestId(`tradeflowkit-job-${jobId}`);
    await expect(jobRecord).toBeVisible();
    await jobRecord.getByRole('button', { name: 'Edit' }).click();
    const jobEditor = page.getByTestId(`tradeflowkit-job-editor-${jobId}`);
    await jobEditor.getByLabel('Job title').fill(updatedJobTitle);
    await jobEditor.getByLabel('Status').selectOption('scheduled');
    await jobEditor.getByLabel('Priority').selectOption('high');
    await jobEditor.getByLabel('Description').fill('Edited project scope through the module UI.');
    await jobEditor.getByRole('button', { name: /^Save job/ }).click();
    await expect(page.getByTestId(`tradeflowkit-job-${jobId}`)).toContainText(updatedJobTitle);

    await page.getByLabel('New task title').fill(taskTitle);
    await page.getByLabel('Task priority').selectOption('normal');
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByTestId('tradeflowkit-operations')).toContainText(taskTitle);
    const taskResult = await pg.query<{ id: string }>(
      `select id from tradeflowkit_tasks where tenant_id = $1 and job_id = $2 and title = $3 and deleted_at is null`,
      [identity.tenantId, jobId, taskTitle],
    );
    expect(taskResult.rows).toHaveLength(1);
    const taskId = taskResult.rows[0].id;

    await page.goto(`https://tradeflowkit.operatoros.net/tasks/${taskId}`);
    const taskRecord = page.getByTestId(`tradeflowkit-task-${taskId}`);
    await expect(taskRecord).toBeVisible();
    await taskRecord.getByRole('button', { name: 'Edit' }).click();
    const taskEditor = page.getByTestId(`tradeflowkit-task-editor-${taskId}`);
    await taskEditor.getByLabel('Task title').fill(updatedTaskTitle);
    await taskEditor.getByLabel('Status').selectOption('in_progress');
    await taskEditor.getByLabel('Priority').selectOption('urgent');
    await taskEditor.getByLabel('Due date').fill('2030-01-15');
    await taskEditor.getByLabel('Description').fill('Edited task scope through the module UI.');
    await taskEditor.getByRole('button', { name: /^Save task/ }).click();
    await page.reload();
    await expect(page.getByTestId(`tradeflowkit-task-${taskId}`)).toContainText(updatedTaskTitle);
    const globalSearch = page.getByTestId('tradeflowkit-global-search');
    await globalSearch.getByLabel('Search the entire workspace').fill(updatedTaskTitle);
    await globalSearch.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByTestId(`tradeflowkit-search-task-${taskId}`)).toContainText(updatedTaskTitle);
    await globalSearch.getByLabel('Saved view name').fill(`Urgent task ${suffix}`);
    await globalSearch.getByRole('button', { name: 'Save view' }).click();
    await expect(page.getByTestId('tradeflowkit-saved-views')).toContainText(`Urgent task ${suffix}`);
    await page.reload();
    await page.getByTestId('tradeflowkit-saved-views').getByRole('button', { name: `Urgent task ${suffix}`, exact: true }).click();
    await expect(page.getByTestId(`tradeflowkit-search-task-${taskId}`)).toContainText(updatedTaskTitle);

    await customerCreate.getByPlaceholder('Customer name').fill(bulkCustomerName);
    await customerCreate.getByPlaceholder('Email (optional)').fill(`bulk-${suffix}@example.com`);
    await customerCreate.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByTestId('tradeflowkit-customer-records')).toContainText(bulkCustomerName);

    const jobImport = page.getByTestId('tradeflowkit-job-import');
    await jobImport.getByLabel('Job CSV file').setInputFiles({
      name: 'jobs.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`customerName,title,status,priority\n"${bulkCustomerName}","${importedJobTitle}",scheduled,urgent\n`),
    });
    await jobImport.getByRole('button', { name: 'Import jobs' }).click();
    await expect(jobImport).toContainText('Imported 1; skipped 0; errors 0.');
    const importedJob = await pg.query<{ id: string }>(
      `select id from tradeflowkit_jobs where tenant_id = $1 and title = $2 and deleted_at is null`,
      [identity.tenantId, importedJobTitle],
    );
    expect(importedJob.rows).toHaveLength(1);

    const invoiceImport = page.getByTestId('tradeflowkit-invoice-import');
    await invoiceImport.getByLabel('Invoice CSV file').setInputFiles({
      name: 'invoices.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`invoiceRef,customerName,status,taxPercent,itemDescription,itemQuantity,itemUnitPrice\n"${importedInvoiceRef}","${bulkCustomerName}",sent,5,Labor,2,125.00\n"${importedInvoiceRef}","${bulkCustomerName}",sent,5,Parts,1,50.00\n`),
    });
    await invoiceImport.getByRole('button', { name: 'Import invoices' }).click();
    await expect(invoiceImport).toContainText('Imported 1; skipped 0; errors 0.');
    const importedInvoice = await pg.query<{ id: string; number: number; version: number }>(
      `select id, number, version from tradeflowkit_invoices where tenant_id = $1 and payment_reference is null and source_id is not null and deleted_at is null order by created_at desc limit 1`,
      [identity.tenantId],
    );
    expect(importedInvoice.rows).toHaveLength(1);

    await page.getByTestId('tradeflowkit-operations').getByRole('button', { name: 'Refresh' }).click();
    await page.getByLabel(`Select job ${importedJobTitle}`).check();
    await page.getByLabel('Bulk job status').selectOption('in_progress');
    await page.getByTestId('tradeflowkit-job-bulk-toolbar').getByRole('button', { name: 'Update selected' }).click();
    await expect.poll(async () => (await pg.query<{ status: string }>(
      `select status from tradeflowkit_jobs where tenant_id = $1 and id = $2`,
      [identity!.tenantId, importedJob.rows[0].id],
    )).rows[0].status).toBe('in_progress');

    await page.getByLabel(`Select invoice ${importedInvoice.rows[0].number}`).check();
    page.once('dialog', dialog => void dialog.accept(`E2E-${suffix}`));
    await page.getByTestId('tradeflowkit-invoice-bulk-toolbar').getByRole('button', { name: 'Mark selected paid' }).click();
    await expect.poll(async () => (await pg.query<{ status: string; balance_cents: number }>(
      `select status, balance_cents from tradeflowkit_invoices where tenant_id = $1 and id = $2`,
      [identity!.tenantId, importedInvoice.rows[0].id],
    )).rows[0]).toEqual({ status: 'paid', balance_cents: 0 });

    const persisted = await pg.query<{
      customer_name: string; organization_name: string; job_title: string; job_status: string;
      task_title: string; task_status: string;
    }>(
      `select c.name as customer_name, o.name as organization_name,
              j.title as job_title, j.status as job_status,
              t.title as task_title, t.status as task_status
         from tradeflowkit_customers c
         join directory_organizations o on o.id = c.organization_id and o.tenant_id = c.tenant_id
         join tradeflowkit_jobs j on j.customer_id = c.id and j.tenant_id = c.tenant_id
         join tradeflowkit_tasks t on t.job_id = j.id and t.tenant_id = j.tenant_id
        where c.tenant_id = $1 and c.id = $2 and j.id = $3 and t.id = $4`,
      [identity.tenantId, customerId, jobId, taskId],
    );
    expect(persisted.rows[0]).toMatchObject({
      customer_name: updatedCustomerName,
      organization_name: updatedCustomerName,
      job_title: updatedJobTitle,
      job_status: 'scheduled',
      task_title: updatedTaskTitle,
      task_status: 'in_progress',
    });

    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(page.getByTestId('page-my-apps')).toBeVisible();
    await page.goto(`https://tradeflowkit.operatoros.net/tasks/${taskId}`);
    await expect(page.getByTestId(`tradeflowkit-task-${taskId}`)).toContainText(updatedTaskTitle);

    page.once('dialog', dialog => void dialog.accept());
    await page.getByTestId(`tradeflowkit-task-${taskId}`).getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByTestId(`tradeflowkit-task-${taskId}`)).toHaveCount(0);
    page.once('dialog', dialog => void dialog.accept());
    await page.getByTestId(`tradeflowkit-job-${jobId}`).getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByTestId(`tradeflowkit-job-${jobId}`)).toHaveCount(0);
    await page.goto(`https://tradeflowkit.operatoros.net/customers/${customerId}`);
    page.once('dialog', dialog => void dialog.accept());
    await page.getByTestId(`tradeflowkit-customer-${customerId}`).getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByTestId(`tradeflowkit-customer-${customerId}`)).toHaveCount(0);

    const archived = await pg.query<{ customer_deleted: boolean; organization_archived: boolean; job_deleted: boolean; task_deleted: boolean }>(
      `select c.deleted_at is not null as customer_deleted,
              o.archived_at is not null as organization_archived,
              j.deleted_at is not null as job_deleted,
              t.deleted_at is not null as task_deleted
         from tradeflowkit_customers c
         join directory_organizations o on o.id = c.organization_id and o.tenant_id = c.tenant_id
         join tradeflowkit_jobs j on j.customer_id = c.id and j.tenant_id = c.tenant_id
         join tradeflowkit_tasks t on t.job_id = j.id and t.tenant_id = j.tenant_id
        where c.tenant_id = $1 and c.id = $2 and j.id = $3 and t.id = $4`,
      [identity.tenantId, customerId, jobId, taskId],
    );
    expect(archived.rows[0]).toEqual({
      customer_deleted: true,
      organization_archived: false,
      job_deleted: true,
      task_deleted: true,
    });

    await page.goto('https://tradeflowkit.operatoros.net/trash');
    await expect(page.getByTestId('tradeflowkit-retention')).toBeVisible();
    const retainedCustomer = page.getByTestId(`tradeflowkit-retained-customer-${customerId}`);
    const retainedJob = page.getByTestId(`tradeflowkit-retained-job-${jobId}`);
    const retainedTask = page.getByTestId(`tradeflowkit-retained-task-${taskId}`);
    await expect(retainedCustomer).toBeVisible();
    await expect(retainedJob.getByRole('button', { name: 'Restore' })).toBeDisabled();
    await expect(retainedTask.getByRole('button', { name: 'Restore' })).toBeDisabled();

    await retainedCustomer.getByRole('button', { name: 'Restore' }).click();
    await expect(retainedCustomer).toHaveCount(0);
    await page.getByTestId(`tradeflowkit-retained-job-${jobId}`).getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByTestId(`tradeflowkit-retained-job-${jobId}`)).toHaveCount(0);
    await page.getByTestId(`tradeflowkit-retained-task-${taskId}`).getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByTestId(`tradeflowkit-retained-task-${taskId}`)).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId(`tradeflowkit-retained-customer-${customerId}`)).toHaveCount(0);
    const restored = await pg.query<{ customer_active: boolean; job_active: boolean; task_active: boolean }>(
      `select c.deleted_at is null as customer_active,
              j.deleted_at is null as job_active,
              t.deleted_at is null as task_active
         from tradeflowkit_customers c
         join tradeflowkit_jobs j on j.customer_id = c.id and j.tenant_id = c.tenant_id
         join tradeflowkit_tasks t on t.job_id = j.id and t.tenant_id = j.tenant_id
        where c.tenant_id = $1 and c.id = $2 and j.id = $3 and t.id = $4`,
      [identity.tenantId, customerId, jobId, taskId],
    );
    expect(restored.rows[0]).toEqual({ customer_active: true, job_active: true, task_active: true });
    await page.goto(`https://tradeflowkit.operatoros.net/tasks/${taskId}`);
    await expect(page.getByTestId(`tradeflowkit-task-${taskId}`)).toContainText(updatedTaskTitle);
  } finally {
    await cleanupIdentity(pg, identity);
    await pg.end();
  }
});
