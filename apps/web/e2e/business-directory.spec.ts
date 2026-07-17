import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { Client } from 'pg';
import {
  E2E_API_URL as API,
  E2E_WEB_URL as WEB,
  expectNoScriptReadableAuth,
  registerAndLogin,
  resolveCurrentTenant,
} from './session-auth';

const MODULES = ['tradeflowkit', 'techdeck', 'pulsedesk'] as const;
const PASSWORD = 'CorrectHorseBattery9!';

async function seedDirectoryAccess(pg: Client, userId: string, tenantId: string) {
  for (const slug of MODULES) {
    const module = await pg.query<{ id: string }>('select id from modules where slug = $1 limit 1', [slug]);
    expect(module.rows, `seeded module ${slug}`).toHaveLength(1);
    await pg.query(
      `insert into entitlement_overrides
         (user_id, module_id, "grant", reason, created_by_admin_id, tenant_id)
       values ($1, $2, true, 'Disposable Phase 2 browser acceptance', $1, $3)`,
      [userId, module.rows[0].id, tenantId],
    );
    await pg.query(
      `insert into tenant_modules
         (tenant_id, module_id, status, source, allow_all_members)
       values ($1, $2, 'enabled', 'included', true)
       on conflict (tenant_id, module_id) do update
         set status = 'enabled', allow_all_members = true`,
      [tenantId, module.rows[0].id],
    );
  }
}

async function cleanupAcceptanceIdentity(pg: Client, userId: string, tenantId: string) {
  const tenantTables = [
    'directory_tag_assignments',
    'tradeflowkit_customer_profiles',
    'techdeck_managed_client_profiles',
    'pulsedesk_service_client_profiles',
    'directory_site_contacts',
    'directory_organization_contacts',
    'directory_relationships',
    'directory_sites',
    'directory_addresses',
    'directory_contacts',
    'directory_tags',
    'directory_organizations',
    'activity_feed',
    'tenant_user_module_access',
    'tenant_modules',
  ];
  for (const table of tenantTables) {
    await pg.query(`delete from ${table} where tenant_id = $1`, [tenantId]);
  }
  // Authentication/session events may intentionally be recorded before a
  // tenant is resolved, so they cannot be removed by tenant_id alone.
  await pg.query('delete from activity_feed where user_id = $1', [userId]);
  await pg.query('delete from admin_audit_logs where admin_id = $1 or target_user_id = $1', [userId]);
  await pg.query('delete from sso_handoff_tokens where user_id = $1', [userId]);
  await pg.query('delete from entitlement_overrides where user_id = $1', [userId]);
  await pg.query('delete from subscriptions where user_id = $1', [userId]);
  await pg.query('delete from tenant_users where tenant_id = $1', [tenantId]);
  await pg.query('delete from tenants where id = $1', [tenantId]);
  await pg.query('delete from users where id = $1', [userId]);
}

async function openDirectory(page: Page, slug: typeof MODULES[number], path: string): Promise<Locator> {
  // In the single-host local runtime these are the physical deep-link routes.
  // Production middleware rewrites the canonical module host to the same page.
  await page.goto(`${WEB}/modules/${slug}/${path}`);
  const directory = page.getByTestId(`${slug}-business-directory`);
  await expect(directory).toBeVisible({ timeout: 20_000 });
  await expect(directory.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
  await expect(directory.getByRole('alert')).toHaveCount(0);
  return directory;
}

async function listOrganizations(api: APIRequestContext, tenantId: string, slug: typeof MODULES[number], name: string) {
  const response = await api.get(`${API}/v1/modules/${slug}/directory/organizations`, {
    headers: { 'X-Tenant-Id': tenantId },
    params: { search: name },
  });
  expect(response.ok(), `${slug} directory list: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<{ organizations: Array<{ id: string; name: string }> }>;
}

test('one persistent organization is reused by TradeFlowKit, TechDeck, and PulseDesk', async ({ page }) => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `phase2-directory-${suffix}@example.com`;
  const organizationName = `Phase 2 Shared Client ${suffix}`;
  let userId = '';
  let tenantId = '';

  try {
    const user = await registerAndLogin(page.context().request, {
      email,
      password: PASSWORD,
      name: 'Phase 2 Directory Owner',
    });
    userId = user.id;
    tenantId = await resolveCurrentTenant(page.context().request);
    await seedDirectoryAccess(pg, userId, tenantId);

    const tradeflowkit = await openDirectory(page, 'tradeflowkit', 'directory');
    await tradeflowkit.getByLabel('Name', { exact: true }).fill(organizationName);
    await tradeflowkit.locator('label').filter({ hasText: /^Type/ }).locator('select').selectOption('customer');
    await tradeflowkit.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(tradeflowkit.getByRole('button', { name: new RegExp(organizationName) })).toBeVisible();
    await tradeflowkit.getByRole('button', { name: /Use in TradeFlowKit customer/ }).click();
    await expect(tradeflowkit.getByRole('button', { name: 'Connected', exact: true })).toBeDisabled();

    await tradeflowkit.getByRole('tab', { name: 'contacts' }).click();
    await tradeflowkit.getByLabel('First name').fill('Jordan');
    await tradeflowkit.getByLabel('Last name').fill('Reed');
    await tradeflowkit.getByLabel('Email', { exact: true }).fill(`jordan-${suffix}@example.com`);
    await tradeflowkit.getByRole('button', { name: 'Create contact' }).click();
    await expect(tradeflowkit.getByText('Jordan Reed', { exact: false }).first()).toBeVisible();

    await tradeflowkit.getByRole('tab', { name: 'sites' }).click();
    await tradeflowkit.getByLabel('Site name').fill('Primary Operations Site');
    await tradeflowkit.getByLabel('Address line').fill('100 Operator Way');
    await tradeflowkit.getByLabel('City').fill('Atlanta');
    await tradeflowkit.getByLabel('State/region').fill('GA');
    await tradeflowkit.getByLabel('Postal code').fill('30303');
    await tradeflowkit.getByRole('button', { name: 'Create site' }).click();
    await expect(tradeflowkit.getByText('Primary Operations Site', { exact: false }).first()).toBeVisible();

    await page.reload();
    const refreshed = page.getByTestId('tradeflowkit-business-directory');
    await expect(refreshed.getByRole('button', { name: new RegExp(organizationName) })).toBeVisible({ timeout: 20_000 });
    await refreshed.getByRole('tab', { name: 'contacts' }).click();
    await expect(refreshed.getByText('Jordan Reed', { exact: false }).first()).toBeVisible();
    await refreshed.getByRole('tab', { name: 'sites' }).click();
    await expect(refreshed.getByText('Primary Operations Site', { exact: false }).first()).toBeVisible();

    for (const [slug, path, profileButton] of [
      ['techdeck', 'clients', /Use in TechDeck managed client/],
      ['pulsedesk', 'clients', /Use in PulseDesk service client/],
    ] as const) {
      const directory = await openDirectory(page, slug, path);
      await expect(directory.getByRole('button', { name: new RegExp(organizationName) })).toBeVisible();
      await directory.getByRole('button', { name: profileButton }).click();
      await expect(directory.getByRole('button', { name: 'Connected', exact: true })).toBeDisabled();
    }

    const results = await Promise.all(MODULES.map(slug => listOrganizations(page.context().request, tenantId, slug, organizationName)));
    expect(results.every(result => result.organizations.length === 1)).toBe(true);
    expect(new Set(results.map(result => result.organizations[0].id)).size).toBe(1);
    expect(results.every(result => result.organizations[0].name === organizationName)).toBe(true);
    await expectNoScriptReadableAuth(page);
  } finally {
    if (userId && tenantId) await cleanupAcceptanceIdentity(pg, userId, tenantId);
    await pg.end();
  }
});
