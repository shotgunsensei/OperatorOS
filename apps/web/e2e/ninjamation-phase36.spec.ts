import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';

const exactHost = process.env.E2E_PRODUCTION_HOSTS === '1';
const WEB = exactHost ? 'https://scriptops.operatoros.net' : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000');
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';

async function grantPro(tenantId: string) {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    await pg.query(`insert into tenant_entitlements(tenant_id,entitlement_key,entitlement_type,source,active)
      values($1,'ninjamation.pro','companion_module','admin',true)`, [tenantId]);
  } finally { await pg.end(); }
}

async function exactHostSession(page: Page) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for exact-host acceptance');
  const email = `phase36-${Date.now()}@example.com`; const password = 'Phase36-Disposable-Only-9!';
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: { host: 'auth.operatoros.net', 'x-forwarded-host': 'auth.operatoros.net', 'x-forwarded-proto': 'https' },
    data: { email, password, name: 'Phase 36 Exact Host' },
  });
  expect(registration.status(), await registration.text()).toBe(202);
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect();
  try {
    const identity = await pg.query<{ tenant_id: string }>('select current_tenant_id as tenant_id from users where email=$1', [email]);
    await pg.query(`insert into tenant_modules(tenant_id,module_id,status,source,allow_all_members)
      select $1,id,'enabled','admin',true from modules where slug='ninjamation'
      on conflict(tenant_id,module_id) do update set status='enabled',allow_all_members=true`, [identity.rows[0]!.tenant_id]);
    await pg.query(`insert into tenant_entitlements(tenant_id,entitlement_key,entitlement_type,source,active)
      values($1,'ninjamation.pro','companion_module','admin',true)`, [identity.rows[0]!.tenant_id]);
  } finally { await pg.end(); }
  await page.goto(`${WEB}/library`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(email); await page.getByTestId('input-password').fill(password);
  await Promise.all([page.waitForURL(/^https:\/\/scriptops\.operatoros\.net\/library/), page.getByTestId('button-login').click()]);
}

test.describe('Script Ops complete product (stable Phase 36 API contract)', () => {
  test.setTimeout(180_000);
  test.beforeEach(async ({ page }) => {
    if (exactHost) await exactHostSession(page);
    else { const session = await establishParitySession(page.request); await grantPro(session.tenantId); }
  });

  test('creates, reviews, approves, downloads, generates, deep-links, and stays mobile-safe', async ({ page }) => {
    const prefix = exactHost ? '' : '/modules/ninjamation';
    await page.goto(`${WEB}${prefix}/library`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('shell-ninjamation')).toBeVisible();
    await expect(page.getByTestId('notice-ninjamation-no-execution')).toContainText('never executes script source');

    await page.getByTestId('nav-ninjamation-admin').click();
    const name = `Phase 36 browser ${Date.now()}`;
    await page.getByTestId('input-ninjamation-name').fill(name);
    await page.getByTestId('select-ninjamation-language').selectOption('powershell');
    await page.getByTestId('select-ninjamation-risk').selectOption('low');
    await page.getByTestId('textarea-ninjamation-content').fill('param([string]$Path)\nGet-Item -LiteralPath $Path -ErrorAction Stop');
    await page.getByTestId('button-ninjamation-save').click();
    await expect(page.getByTestId('text-ninjamation-notice')).toContainText(/draft created/i);
    await expect(page.locator('#ninjamation-editor')).toContainText(name);
    await page.getByTestId('button-ninjamation-submit-review').click();
    await expect(page.getByTestId('button-ninjamation-approve')).toBeEnabled();
    await page.getByTestId('button-ninjamation-approve').click();
    await expect(page.getByTestId('button-ninjamation-download')).toBeEnabled();
    const downloadEvent = page.waitForEvent('download');
    await page.getByTestId('button-ninjamation-download').click();
    expect((await downloadEvent).suggestedFilename()).toMatch(/\.ps1$/);

    await expect(page.getByTestId('shell-ninjamation')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('nav-ninjamation-generate')).toBeEnabled();
    await page.getByTestId('nav-ninjamation-generate').click();
    const generatedName = `Generated ${Date.now()}`;
    await page.getByLabel('Generated script name').fill(generatedName);
    await page.getByLabel('AI script format').selectOption('bash');
    await page.getByTestId('textarea-ninjamation-prompt').fill('Inspect a supplied local path without modifying files or configuration.');
    await page.getByTestId('button-ninjamation-generate').click();
    await expect(page.getByTestId('text-ninjamation-notice')).toContainText(/AI draft created/i);
    await expect(page.locator('#ninjamation-editor')).toContainText(generatedName);

    for (const route of ['/dashboard','/scripts','/library','/generate','/generations','/downloads','/sync','/account','/billing','/checkout/success','/checkout/cancel','/admin']) {
      await page.goto(`${WEB}${prefix}${route}`, { waitUntil: 'networkidle' });
      await expect(page.getByTestId('shell-ninjamation')).toBeVisible();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}${prefix}/library`, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const unlabelled = await page.locator('input,select,textarea').evaluateAll((controls) => controls.flatMap((control) => {
      const node = control as HTMLElement; const box = node.getBoundingClientRect();
      return box.width && box.height && !node.closest('label') && !node.getAttribute('aria-label') ? [node.outerHTML.slice(0, 100)] : [];
    }));
    expect(unlabelled).toEqual([]);
  });

  test('public landing and pricing remain anonymous on the exact Script Ops host', async ({ page }) => {
    test.skip(!exactHost, 'Public marketing paths are owned by the exact Script Ops host.');
    for (const route of ['/', '/pricing']) {
      await page.context().clearCookies();
      await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
      await expect(page.getByText('SCRIPT OPS', { exact: true }).first()).toBeVisible();
    }
  });
});
