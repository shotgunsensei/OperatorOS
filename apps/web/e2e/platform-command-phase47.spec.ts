import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:5001';
const APP = 'https://app.operatoros.net';
const PASSWORD = 'Phase47-Only-Command-94!';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const screenshotRoot = resolve(repoRoot, 'docs/phase-47/screenshots');
let ipSequence = 81;

type Identity = { id: string; tenantId: string; email: string };

async function registerIdentity(request: APIRequestContext, superAdmin: boolean): Promise<Identity> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `phase47-${superAdmin ? 'admin' : 'user'}-${suffix}@example.com`;
  const response = await request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net',
      'x-forwarded-host': 'auth.operatoros.net',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.47.0.${ipSequence++}`,
    },
    data: { email, password: PASSWORD, name: superAdmin ? 'Phase 47 Admin' : 'Phase 47 User' },
  });
  expect(response.status(), await response.text()).toBe(202);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for Phase 47 browser acceptance');
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    const result = await pg.query<{ id: string; tenant_id: string }>(
      `select id, current_tenant_id as tenant_id from users where email = $1 limit 1`,
      [email],
    );
    expect(result.rows).toHaveLength(1);
    if (superAdmin) {
      await pg.query(`update users set platform_role = 'super_admin', updated_at = now() where id = $1`, [result.rows[0].id]);
    }
    return { id: result.rows[0].id, tenantId: result.rows[0].tenant_id, email };
  } finally {
    await pg.end();
  }
}

async function authenticate(page: Page, identity: Identity, returnPath = '/app/platform') {
  await page.goto(`${APP}${returnPath}`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(identity.email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(new RegExp(`^https:\\/\\/app\\.operatoros\\.net${returnPath.replaceAll('/', '\\/')}(?:[?#].*)?$`), { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
}

async function assertShell(page: Page, activeLabel: string) {
  await expect(page.getByTestId('platform-command-shell')).toBeVisible();
  await expect(page.getByTestId('platform-my-apps')).toBeVisible();
  await expect(page.getByText(`Active: ${activeLabel}`, { exact: true })).toBeVisible();
  await expect(page.getByTestId('platform-environment')).toHaveText('PRODUCTION');
  await expect(page.getByTestId('platform-release')).toContainText('RELEASE');
}

test('super admin retains persistent command navigation, route history, responsive access, and accessibility', async ({ page, context }) => {
  const identity = await registerIdentity(context.request, true);
  await authenticate(page, identity);
  await assertShell(page, 'Overview');

  const destinations = [
    ['tenants', 'Tenants'], ['users', 'Users'], ['modules', 'Modules'],
    ['billing', 'Billing Events'], ['pricing', 'Pricing'], ['credit-catalog', 'Credit Catalog'],
    ['health', 'Health'], ['audit', 'Audit'], ['sso', 'SSO'],
  ] as const;
  for (const [path, label] of destinations) {
    await page.getByTestId(`platform-nav-${path}`).click();
    await expect(page).toHaveURL(`${APP}/app/platform/${path}`);
    await assertShell(page, label);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(label);
  }

  await page.goto(`${APP}/app/platform/tenants/${identity.tenantId}`);
  await expect(page.getByTestId('button-tenant-back')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(identity.tenantId);
  await page.getByTestId('button-tenant-back').click();
  await expect(page).toHaveURL(`${APP}/app/platform/tenants`);
  await page.goBack();
  await expect(page).toHaveURL(`${APP}/app/platform/tenants/${identity.tenantId}`);
  await page.reload();
  await expect(page.getByTestId('button-tenant-back')).toBeVisible();

  await page.goto(`${APP}/app/platform/modules/torqueshed`);
  await expect(page.getByTestId('text-module-name')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('torqueshed');
  await page.goto(`${APP}/app/platform/users/${identity.id}`);
  await expect(page.getByTestId('button-user-back')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(identity.id);

  const pagesBefore = context.pages().length;
  await page.getByTestId('platform-my-apps').click();
  // The exact app host canonicalizes the source-compatible `/app` route to
  // its workspace root. The click must still replace the current tab.
  await expect(page).toHaveURL(`${APP}/`);
  expect(context.pages()).toHaveLength(pagesBefore);
  await page.goBack();
  await expect(page).toHaveURL(`${APP}/app/platform/users/${identity.id}`);

  const axe = await new AxeBuilder({ page })
    .include('[data-testid="platform-command-shell"]')
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact || ''))).toEqual([]);

  if (process.env.PHASE47_CAPTURE_SCREENSHOTS === '1') {
    mkdirSync(screenshotRoot, { recursive: true });
    await page.screenshot({ path: resolve(screenshotRoot, 'platform-command-desktop.png'), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const drawer = page.getByTestId('platform-drawer-toggle');
  await expect(drawer).toBeVisible();
  await drawer.focus();
  await page.keyboard.press('Enter');
  await expect(drawer).toHaveAttribute('aria-expanded', 'true');
  const mobileNavigation = page.getByRole('navigation', { name: 'Platform Command sections' });
  await expect(mobileNavigation).toBeVisible();
  await expect.poll(async () => (await mobileNavigation.boundingBox())?.x ?? -999).toBeGreaterThanOrEqual(0);
  expect((await mobileNavigation.boundingBox())?.width).toBeGreaterThan(250);
  await page.getByTestId('platform-nav-health').click();
  await expect(page).toHaveURL(`${APP}/app/platform/health`);
  await expect(page.getByTestId('platform-drawer-toggle')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  if (process.env.PHASE47_CAPTURE_SCREENSHOTS === '1') {
    await page.getByTestId('platform-drawer-toggle').click();
    await expect(page.getByTestId('platform-drawer-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => (await mobileNavigation.boundingBox())?.x ?? -999).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: resolve(screenshotRoot, 'platform-command-mobile-drawer.png'), fullPage: false });
  }
});

test('ordinary authenticated user receives page and API 403 without platform record leakage', async ({ browser, request }) => {
  const identity = await registerIdentity(request, false);
  const context: BrowserContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await authenticate(page, identity);
    await expect(page.getByTestId('platform-denied')).toBeVisible();
    await expect(page.getByTestId('platform-my-apps')).toBeVisible();
    await expect(page.getByText('No platform records were loaded.')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Platform Command sections' })).toHaveCount(0);
    await expect(page.getByText(identity.tenantId)).toHaveCount(0);
    const apiProbe = await page.evaluate(async () => {
      const response = await fetch('/api/platform/stats', { credentials: 'same-origin' });
      return { status: response.status, body: await response.text() };
    });
    expect(apiProbe.status).toBe(403);
    expect(apiProbe.body).not.toContain(identity.tenantId);
    expect(apiProbe.body).not.toContain('tenants');
  } finally {
    await context.close();
  }
});
