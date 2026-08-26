import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

const WEB = 'https://snapproofos.operatoros.net';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase50-SnapProofOS-Disposable-9!';

async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase50-snapproofos-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net', 'x-forwarded-host': 'auth.operatoros.net', 'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.93.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 50 SnapProofOS Operator' },
  });
  expect(registration.status(), await registration.text()).toBe(202);

  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    const identity = await pg.query<{ user_id: string; tenant_id: string }>('select id as user_id,current_tenant_id as tenant_id from users where email=$1 limit 1', [email]);
    expect(identity.rows).toHaveLength(1);
    const elite = await pg.query<{ id: string }>("select id from subscription_plans where slug='elite' and is_active=true limit 1");
    expect(elite.rows).toHaveLength(1);
    await pg.query("insert into subscriptions (user_id,plan_id,status,current_period_start,current_period_end,tenant_id,scope_type) values ($1,$2,'active',now(),now()+interval '30 days',$3,'tenant')", [identity.rows[0].user_id, elite.rows[0].id, identity.rows[0].tenant_id]);
    await pg.query("insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug='snapproofos' on conflict do nothing", [identity.rows[0].tenant_id]);
  } finally {
    await pg.end();
  }

  await page.goto(`${WEB}/customers`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/u);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/snapproofos\.operatoros\.net\/customers(?:[?#].*)?$/u, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('snapproofos-module-shell')).toBeVisible({ timeout: 30_000 });
}

async function noUnlabelledControls(page: Page) {
  const failures = await page.locator('input,select,textarea').evaluateAll(controls => controls.flatMap(control => {
    const node = control as HTMLInputElement;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden') return [];
    return node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') ||
      (node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`)) || node.closest('label')
      ? [] : [node.outerHTML.slice(0, 180)];
  }));
  expect(failures).toEqual([]);
}

async function expectNoOverflow(page: Page, path: string) {
  const overflow = await page.evaluate(() => ({
    amount: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    nodes: Array.from(document.querySelectorAll<HTMLElement>('body *')).flatMap(node => {
      const rect = node.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 1
        ? [{ tag: node.tagName, className: node.className, right: Math.round(rect.right), scrollWidth: node.scrollWidth }]
        : [];
    }).slice(0, 8),
  }));
  expect(overflow.amount, `${path} overflow: ${JSON.stringify(overflow.nodes)}`).toBeLessThanOrEqual(1);
}

test.describe('Phase 50 SnapProofOS route application', () => {
  test.setTimeout(360_000);

  test('owner routes, field-to-report journey, focused loaders, history, and accessibility pass', async ({ page }) => {
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
    await establishExactHostSession(page);
    consoleErrors.length = 0;
    serverErrors.length = 0;
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

    const customerName = `Northstar Field Client ${Date.now()}`;
    await page.getByLabel('Customer name').fill(customerName);
    await page.getByLabel('Company').fill('Northstar Property Group');
    await page.getByLabel('Email').fill('field-client@example.com');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByRole('heading', { name: customerName })).toBeVisible({ timeout: 30_000 });

    await page.goto(`${WEB}/jobs`, { waitUntil: 'networkidle' });
    const jobTitle = `Roof inspection ${Date.now()}`;
    await page.getByLabel('Job title').fill(jobTitle);
    await page.getByLabel('Customer').selectOption({ label: customerName });
    await page.getByLabel('Location').fill('100 Evidence Way');
    await page.getByRole('button', { name: 'Create job' }).click();
    await expect(page).toHaveURL(/^https:\/\/snapproofos\.operatoros\.net\/jobs\/[a-f0-9-]+$/u, { timeout: 30_000 });
    const jobPath = new URL(page.url()).pathname;
    const jobId = jobPath.split('/').at(-1)!;
    await expect(page.getByRole('heading', { name: jobTitle })).toBeVisible();

    await page.goto(`${WEB}/reports`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Generate draft report' }).click();
    await expect(page.getByText(/Client Field Report/u).first()).toBeVisible({ timeout: 30_000 });

    const routes: Array<[string, string, string]> = [
      ['/', 'snapproofos-overview-route', 'Evidence operations overview'],
      ['/customers', 'snapproofos-customers-route', 'Customers'],
      ['/projects', 'snapproofos-projects-route', 'Projects'],
      [jobPath, 'snapproofos-jobs-route', 'Jobs'],
      ['/capture', 'snapproofos-capture-route', 'Capture'],
      ['/work', 'snapproofos-work-route', 'Findings and notes'],
      ['/costs', 'snapproofos-costs-route', 'Parts and labor'],
      ['/templates', 'snapproofos-templates-route', 'Job templates'],
      ['/team', 'snapproofos-team-route', 'Team'],
      ['/activity', 'snapproofos-activity-route', 'Activity'],
      ['/cases', 'snapproofos-cases-route', 'Evidence cases'],
      ['/evidence', 'snapproofos-evidence-route', 'Evidence integrity'],
      ['/review', 'snapproofos-review-route', 'Review'],
      ['/findings', 'snapproofos-findings-route', 'Case findings'],
      ['/reports', 'snapproofos-reports-route', 'Reports'],
      ['/share', 'snapproofos-share-route', 'Secure sharing'],
      ['/exports', 'snapproofos-exports-route', 'Exports'],
      ['/custody', 'snapproofos-custody-route', 'Chain of custody'],
      ['/retention', 'snapproofos-retention-route', 'Retention'],
      ['/branding', 'snapproofos-branding-route', 'Branding'],
      ['/settings', 'snapproofos-settings-route', 'SnapProofOS settings'],
    ];
    for (const [path, testId, heading] of routes) {
      const response = await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('snapproofos-module-header').getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/iu);
      await expectNoOverflow(page, path);
      await noUnlabelledControls(page);
    }

    for (const [legacy, canonical] of [
      ['/dashboard', '/'], ['/jobs/new', '/jobs'], ['/files', '/capture'],
      ['/profile', '/settings'], ['/billing', '/settings'],
    ]) {
      await page.goto(`${WEB}${legacy}`);
      await expect(page).toHaveURL(`${WEB}${canonical}`);
    }

    await page.getByTestId('snapproofos-sidebar-evidence').click();
    await expect(page).toHaveURL(`${WEB}/evidence`);
    await page.goBack();
    await expect(page).toHaveURL(`${WEB}${jobPath}`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('snapproofos-sidebar-jobs')).toHaveAttribute('aria-current', 'page');

    const settingsCalls: string[] = [];
    const capture = (response: { url(): string }) => {
      const url = response.url();
      if (url.includes('/api/modules/snapproofos/')) settingsCalls.push(new URL(url).pathname);
    };
    page.on('response', capture);
    await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
    page.off('response', capture);
    expect(settingsCalls).toEqual([]);

    for (const path of ['/', '/customers', '/jobs', '/capture', '/reports', '/settings']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations, `${path} accessibility`).toEqual([]);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${WEB}/reports`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '../../docs/phase-50/evidence/snapproofos-reports-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${WEB}/jobs`, { waitUntil: 'networkidle' });
    await expectNoOverflow(page, '/jobs tablet');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/capture`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open SnapProofOS navigation' }).click();
    await expect(page.getByTestId('snapproofos-module-sidebar')).toBeVisible();
    await expectNoOverflow(page, '/capture mobile');
    await page.screenshot({ path: '../../docs/phase-50/evidence/snapproofos-capture-mobile.png', fullPage: true, animations: 'disabled' });

    expect(serverErrors).toEqual([]);
    expect(consoleErrors.filter(error => !/favicon|Download the React DevTools/iu.test(error))).toEqual([]);
  });
});
