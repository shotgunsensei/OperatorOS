import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

const WEB = 'https://pulsedesk.operatoros.net';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase50-PulseDesk-Disposable-9!';

async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase50-pulsedesk-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net', 'x-forwarded-host': 'auth.operatoros.net', 'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.91.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 50 PulseDesk Operator' },
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
    await pg.query("insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug='pulsedesk' on conflict do nothing", [identity.rows[0].tenant_id]);
  } finally {
    await pg.end();
  }

  await page.goto(`${WEB}/requests`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/u);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/pulsedesk\.operatoros\.net\/requests(?:[?#].*)?$/u, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('pulsedesk-module-shell')).toBeVisible({ timeout: 30_000 });
}

async function noUnlabelledControls(page: Page) {
  const failures = await page.locator('input,select,textarea').evaluateAll(controls => controls.flatMap(control => {
    const node = control as HTMLInputElement;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden') return [];
    return node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') ||
      (node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`)) || node.closest('label')
      ? [] : [node.outerHTML.slice(0, 160)];
  }));
  expect(failures).toEqual([]);
}

test.describe('Phase 50 PulseDesk route application', () => {
  test.setTimeout(300_000);

  test('healthcare owner routes, request journey, focused loaders, history, and accessibility pass', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await establishExactHostSession(page);
    consoleErrors.length = 0;
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

    const summary = `Phase 50 operations request ${Date.now()}`;
    const create = page.getByTestId('pulsedesk-service-ticket-create');
    await create.getByLabel('Operational request summary').fill(summary);
    await create.getByText(/I confirm this contains operational information only/iu).click();
    await create.getByRole('button', { name: 'Create ticket' }).click();
    await expect(page.locator('.pds-success')).toContainText('Ticket creation completed', { timeout: 20_000 });
    const created = await page.evaluate(async (summaryValue) => {
      const response = await fetch(`/api/modules/pulsedesk/tickets?search=${encodeURIComponent(summaryValue)}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Ticket lookup failed: ${response.status}`);
      return (await response.json()).tickets[0] as { id: string; summary: string };
    }, summary);
    expect(created.summary).toBe(summary);

    const routes: Array<[string, string, string]> = [
      ['/', 'pulsedesk-overview-route', 'Operations overview'],
      ['/requests', 'pulsedesk-requests-route', 'Requests and work queues'],
      [`/requests/${created.id}`, 'pulsedesk-ticket-workspace', 'Requests and work queues'],
      ['/assignments', 'pulsedesk-assignments-route', 'Assignments and escalation'],
      ['/contacts', 'pulsedesk-contacts-route', 'Facilities and contacts'],
      ['/operations', 'pulsedesk-operations-route', 'Equipment, supplies, and facilities'],
      ['/inbound', 'pulsedesk-inbound-route', 'Inbound communication'],
      ['/analytics', 'pulsedesk-analytics-route', 'Analytics'],
      ['/knowledge', 'pulsedesk-knowledge-route', 'Knowledge'],
      ['/integrations', 'pulsedesk-integrations-route', 'Integrations'],
      ['/settings', 'pulsedesk-settings-panel', 'PulseDesk settings'],
    ];
    for (const [path, testId, heading] of routes) {
      const response = await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('pulsedesk-module-header').getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('body')).toContainText(/no patient|PHI|minimized|operational/iu);
      await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/iu);
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
      await noUnlabelledControls(page);
    }

    await page.goto(`${WEB}/tickets`);
    await expect(page).toHaveURL(`${WEB}/requests`);
    await page.goto(`${WEB}/requests/new`);
    await expect(page).toHaveURL(`${WEB}/requests`);
    await page.goto(`${WEB}/departments`);
    await expect(page).toHaveURL(`${WEB}/assignments`);
    await page.goto(`${WEB}/assets`);
    await expect(page).toHaveURL(`${WEB}/operations`);

    await page.getByTestId('pulsedesk-sidebar-knowledge').click();
    await expect(page).toHaveURL(`${WEB}/knowledge`);
    await page.goBack();
    await expect(page).toHaveURL(`${WEB}/operations`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('pulsedesk-sidebar-operations')).toHaveAttribute('aria-current', 'page');

    const apiCalls: string[] = [];
    const capture = (response: { url(): string }) => {
      const url = response.url();
      if (url.includes('/api/modules/pulsedesk/')) apiCalls.push(new URL(url).pathname);
    };
    page.on('response', capture);
    await page.goto(`${WEB}/knowledge`, { waitUntil: 'networkidle' });
    page.off('response', capture);
    expect(apiCalls.some(path => path.endsWith('/knowledge'))).toBeTruthy();
    expect(apiCalls.some(path => /\/dashboard|\/tickets|\/assets|\/supply-requests|\/facility-requests/u.test(path))).toBeFalsy();

    for (const path of ['/', '/requests', '/assignments', '/contacts', '/integrations', '/settings']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations, `${path} accessibility`).toEqual([]);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${WEB}/requests`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '../../docs/phase-50/evidence/pulsedesk-requests-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/assignments`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open PulseDesk navigation' }).click();
    await expect(page.getByTestId('pulsedesk-module-sidebar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: '../../docs/phase-50/evidence/pulsedesk-assignments-mobile.png', fullPage: true, animations: 'disabled' });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${WEB}/contacts`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('pulsedesk-contacts-route')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await noUnlabelledControls(page);

    expect(consoleErrors.filter(error => !/favicon|Download the React DevTools/iu.test(error))).toEqual([]);
  });
});
