import { expect, test, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

const ROOT = process.env.E2E_ROOT_URL ?? 'https://operatoros.net';
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
  const email = `tradeflowkit-import-${suffix}@example.com`;
  const registration = await request.post(`${API}/v1/auth/register`, {
    headers: PUBLIC_AUTH_HEADERS,
    data: { email, password: PASSWORD, name: 'TradeFlowKit Import Gate' },
  });
  expect(registration.status(), `register: ${await registration.text()}`).toBe(202);

  const identity = await pg.query<{ user_id: string; tenant_id: string }>(
    `select id as user_id, current_tenant_id as tenant_id
       from users
      where email = $1
      limit 1`,
    [email],
  );
  expect(identity.rows).toHaveLength(1);
  const { user_id: userId, tenant_id: tenantId } = identity.rows[0];

  const plan = await pg.query<{ id: string }>(
    `select id from subscription_plans where slug = 'elite' and is_active = true limit 1`,
  );
  const module = await pg.query<{ id: string }>(
    `select id from modules where slug = 'tradeflowkit' limit 1`,
  );
  expect(plan.rows).toHaveLength(1);
  expect(module.rows).toHaveLength(1);
  await pg.query(
    `insert into subscriptions
       (user_id, plan_id, status, current_period_start, current_period_end, tenant_id, scope_type)
     values ($1, $2, 'active', now(), now() + interval '30 days', $3, 'tenant')`,
    [userId, plan.rows[0].id, tenantId],
  );
  await pg.query(
    `insert into tenant_modules
       (tenant_id, module_id, status, source, allow_all_members)
     values ($1, $2, 'enabled', 'included', true)
     on conflict (tenant_id, module_id) do update
       set status = 'enabled', allow_all_members = true`,
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
    for (const table of [
      'tradeflowkit_customers',
      'tradeflowkit_settings',
      'tradeflowkit_sequences',
      'directory_organization_contacts',
      'directory_contacts',
      'directory_organizations',
      'shared_idempotency_keys',
      'tenant_user_module_access',
      'tenant_modules',
      'tenant_users',
    ]) {
      await pg.query(`delete from ${table} where tenant_id = $1`, [tenantId]);
    }
    await pg.query(
      `delete from activity_feed where tenant_id = $1 or user_id = $2`,
      [tenantId, userId],
    );
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

test('TradeFlowKit customer CSV import persists through exact-host SSO, refresh, and duplicate replay', async ({ page, request }) => {
  test.setTimeout(120_000);
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  let identity: Identity | null = null;
  const suffix = Date.now().toString(36);
  const alpha = `Phase 16 Import Alpha ${suffix}`;
  const beta = `Phase 16 Import Beta ${suffix}`;
  const csv = Buffer.from([
    'name,email,phone,address,notes',
    `"${alpha}",alpha-${suffix}@example.com,(555) 010-1000,100 Alpha Avenue,"Priority, quoted note"`,
    `Invalid Email,not-an-email,,,`,
    `${beta},beta-${suffix}@example.com,555-010-2000,200 Beta Avenue,`,
  ].join('\n'));

  try {
    identity = await registerAndSeed(request, pg);
    await page.goto('https://tradeflowkit.operatoros.net/quotes');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    const authorizationUrl = new URL(page.url());
    expect(authorizationUrl.searchParams.get('next')).toBe('https://tradeflowkit.operatoros.net/quotes');
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');

    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL('https://tradeflowkit.operatoros.net/quotes', { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await expect(page.getByTestId('tradeflowkit-module-shell')).toBeVisible();
    const importForm = page.getByTestId('tradeflowkit-customer-import');
    await expect(importForm).toBeVisible();

    await importForm.getByLabel('Customer CSV file').setInputFiles({
      name: 'phase16-customers.csv',
      mimeType: 'text/csv',
      buffer: csv,
    });
    await expect(importForm.getByText('3 rows ready for server validation.')).toBeVisible();
    await importForm.getByRole('button', { name: 'Import validated rows' }).click();
    const firstResult = importForm.getByTestId('tradeflowkit-customer-import-result');
    await expect(firstResult).toContainText('Imported 2; skipped 0; errors 1.');
    await expect(firstResult).toContainText('Row 3: EMAIL_INVALID (email)');

    const persisted = await pg.query<{ customer_count: string; organization_count: string; contact_count: string }>(
      `select
         (select count(*) from tradeflowkit_customers where tenant_id = $1)::text as customer_count,
         (select count(*) from directory_organizations where tenant_id = $1)::text as organization_count,
         (select count(*) from directory_contacts where tenant_id = $1)::text as contact_count`,
      [identity.tenantId],
    );
    expect(persisted.rows[0]).toEqual({
      customer_count: '2',
      organization_count: '2',
      contact_count: '2',
    });

    await page.reload();
    await expect(page).toHaveURL('https://tradeflowkit.operatoros.net/quotes');
    await expect.poll(() => page.locator('option').filter({ hasText: alpha }).count())
      .toBeGreaterThan(0);
    await expect.poll(() => page.locator('option').filter({ hasText: beta }).count())
      .toBeGreaterThan(0);

    const replayForm = page.getByTestId('tradeflowkit-customer-import');
    await replayForm.getByLabel('Customer CSV file').setInputFiles({
      name: 'phase16-customers-retry.csv',
      mimeType: 'text/csv',
      buffer: csv,
    });
    await replayForm.getByRole('button', { name: 'Import validated rows' }).click();
    await expect(replayForm.getByTestId('tradeflowkit-customer-import-result'))
      .toContainText('Imported 0; skipped 2; errors 1.');

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(page.getByTestId('page-my-apps')).toBeVisible();
    expect([...new URL(page.url()).searchParams.keys()])
      .not.toEqual(expect.arrayContaining(['token', 'jwt', 'access_token', 'session']));
  } finally {
    await cleanupIdentity(pg, identity);
    await pg.end();
  }
});
