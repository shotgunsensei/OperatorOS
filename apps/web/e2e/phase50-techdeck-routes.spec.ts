import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

const WEB = 'https://techdeck.operatoros.net';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase50-TechDeck-Disposable-9!';

async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase50-techdeck-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net',
      'x-forwarded-host': 'auth.operatoros.net',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.90.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 50 TechDeck Operator' },
  });
  expect(registration.status(), await registration.text()).toBe(202);

  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    const identity = await pg.query<{ user_id: string; tenant_id: string }>(
      'select id as user_id,current_tenant_id as tenant_id from users where email=$1 limit 1',
      [email],
    );
    expect(identity.rows).toHaveLength(1);
    const elite = await pg.query<{ id: string }>("select id from subscription_plans where slug='elite' and is_active=true limit 1");
    expect(elite.rows).toHaveLength(1);
    await pg.query(
      "insert into subscriptions (user_id,plan_id,status,current_period_start,current_period_end,tenant_id,scope_type) values ($1,$2,'active',now(),now()+interval '30 days',$3,'tenant')",
      [identity.rows[0].user_id, elite.rows[0].id, identity.rows[0].tenant_id],
    );
    await pg.query(
      "insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug='techdeck' on conflict do nothing",
      [identity.rows[0].tenant_id],
    );
  } finally {
    await pg.end();
  }

  await page.goto(`${WEB}/tickets`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/u);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/techdeck\.operatoros\.net\/tickets(?:[?#].*)?$/u, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('techdeck-module-shell')).toBeVisible({ timeout: 30_000 });
}

async function noUnlabelledControls(page: Page) {
  const failures = await page.locator('input,select,textarea').evaluateAll(controls => controls.flatMap(control => {
    const node = control as HTMLInputElement;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden') return [];
    return node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') ||
      (node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`)) || node.closest('label')
      ? [] : [node.outerHTML.slice(0, 140)];
  }));
  expect(failures).toEqual([]);
}

test.describe('Phase 50 TechDeck route application', () => {
  test.setTimeout(300_000);

  test('owner routes, compatibility aliases, focused loading, history, and responsive accessibility pass', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await establishExactHostSession(page);
    consoleErrors.length = 0;
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

    const routes: Array<[string, string, string]> = [
      ['/', 'techdeck-overview-route', 'Operations overview'],
      ['/tickets', 'techdeck-ticket-queue-panel', 'Ticket queue'],
      ['/clients', 'techdeck-directory-route', 'Clients and sites'],
      ['/assets', 'techdeck-inventory', 'Configuration inventory'],
      ['/network', 'techdeck-network', 'Network and IPAM'],
      ['/lifecycle', 'techdeck-lifecycle', 'Lifecycle and posture'],
      ['/documentation', 'techdeck-documentation', 'Documentation'],
      ['/runbooks', 'techdeck-runbooks', 'Runbooks'],
      ['/evidence', 'techdeck-evidence', 'Evidence register'],
      ['/reports', 'techdeck-reports', 'Snapshot reports'],
      ['/time', 'techdeck-time', 'Technician time'],
      ['/calendar', 'techdeck-calendar', 'Calendar and recurrence'],
      ['/portal', 'techdeck-portal', 'Client portal'],
      ['/licenses', 'techdeck-licenses', 'License server'],
      ['/status', 'techdeck-status', 'Public status'],
      ['/compliance', 'techdeck-compliance', 'Compliance and secure intake'],
      ['/webhooks', 'techdeck-webhooks', 'Signed webhooks'],
      ['/api-tokens', 'techdeck-api-tokens', 'Scoped API tokens'],
      ['/settings', 'techdeck-settings-panel', 'TechDeck settings'],
    ];

    for (const [path, testId, heading] of routes) {
      const response = await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByTestId(testId).or(page.locator(`#${testId}`))).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('techdeck-module-header').getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/iu);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path} overflow`).toBeLessThanOrEqual(1);
      await noUnlabelledControls(page);
    }

    await page.goto(`${WEB}/inventory`);
    await expect(page).toHaveURL(`${WEB}/assets`);
    await page.goto(`${WEB}/status-admin`);
    await expect(page).toHaveURL(`${WEB}/status`);
    await page.goto(`${WEB}/compliance-packets`);
    await expect(page).toHaveURL(`${WEB}/compliance`);

    await page.goto(`${WEB}/assets`);
    await page.getByTestId('techdeck-sidebar-evidence').click();
    await expect(page).toHaveURL(`${WEB}/evidence`);
    await page.goBack();
    await expect(page).toHaveURL(`${WEB}/assets`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('techdeck-sidebar-assets')).toHaveAttribute('aria-current', 'page');

    const apiCalls: string[] = [];
    const capture = (response: { url(): string }) => {
      const url = response.url();
      if (url.includes('/api/modules/techdeck/')) apiCalls.push(new URL(url).pathname);
    };
    page.on('response', capture);
    await page.goto(`${WEB}/licenses`, { waitUntil: 'networkidle' });
    page.off('response', capture);
    expect(apiCalls.some(path => path.endsWith('/literal-workspace'))).toBeTruthy();
    expect(apiCalls.some(path => path.endsWith('/workspace') && !path.endsWith('/literal-workspace'))).toBeFalsy();
    expect(apiCalls.some(path => path.includes('/tickets'))).toBeFalsy();

    for (const path of ['/', '/tickets', '/assets', '/licenses', '/settings']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations, `${path} accessibility`).toEqual([]);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${WEB}/assets`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '../../docs/phase-50/evidence/techdeck-assets-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/tickets`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open TechDeck navigation' }).click();
    await expect(page.getByTestId('techdeck-module-sidebar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: '../../docs/phase-50/evidence/techdeck-tickets-mobile.png', fullPage: true, animations: 'disabled' });

    expect(consoleErrors.filter(error => !/favicon|Download the React DevTools/iu.test(error))).toEqual([]);
  });
});
