import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

const WEB = 'https://outcall.operatoros.net';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase50-OutCall-Disposable-9!';

async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase50-outcall-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net', 'x-forwarded-host': 'auth.operatoros.net', 'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.95.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 50 OutCall Operator' },
  });
  expect(registration.status(), await registration.text()).toBe(202);

  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    const identity = await pg.query<{ user_id: string; tenant_id: string }>('select id as user_id,current_tenant_id as tenant_id from users where email=$1 limit 1', [email]);
    expect(identity.rows).toHaveLength(1);
    const elite = await pg.query<{ id: string }>("select id from subscription_plans where slug='elite' and is_active=true limit 1");
    expect(elite.rows).toHaveLength(1);
    // OutCall intentionally remains coming_soon in the production catalog until
    // live-provider acceptance. Promote only this disposable test database so
    // the exact-host route surface can be exercised with OUTCALL_TEST_ADAPTER.
    await pg.query("update modules set status='beta' where slug='outcall' and status='coming_soon'");
    await pg.query("insert into subscriptions (user_id,plan_id,status,current_period_start,current_period_end,tenant_id,scope_type) values ($1,$2,'active',now(),now()+interval '30 days',$3,'tenant')", [identity.rows[0].user_id, elite.rows[0].id, identity.rows[0].tenant_id]);
    await pg.query("insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug='outcall' on conflict do nothing", [identity.rows[0].tenant_id]);
  } finally {
    await pg.end();
  }

  await page.goto(WEB);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/u);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/outcall\.operatoros\.net\/(?:[?#].*)?$/u, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('outcall-module-shell')).toBeVisible({ timeout: 30_000 });
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

test.describe('Phase 50 OutCall route application', () => {
  test.setTimeout(360_000);

  test('owner routes, verified-self test-adapter journey, history, and accessibility pass', async ({ page }) => {
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
    await establishExactHostSession(page);
    consoleErrors.length = 0;
    serverErrors.length = 0;
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

    await page.getByTestId('button-outcall-accept-safety').click();
    await expect(page.getByText('Safety acknowledgement saved.')).toBeVisible({ timeout: 30_000 });
    await page.goto(`${WEB}/verification`, { waitUntil: 'networkidle' });
    const testPhone = `+1555${String(Date.now()).slice(-7)}`;
    await page.getByTestId('input-outcall-phone').fill(testPhone);
    await page.getByTestId('button-outcall-verify-phone').click();
    await expect(page.getByText('Phone ownership verified.')).toBeVisible({ timeout: 30_000 });

    await page.goto(`${WEB}/contacts`, { waitUntil: 'networkidle' });
    await page.getByLabel('Rescue profile name').fill('Quiet professional callback');
    await page.getByLabel('Neutral assistance message').fill('Your requested callback is ready. Please step away when convenient.');
    await page.getByTestId('button-outcall-create-profile').click();
    await expect(page.getByText(/Quiet professional callback/u)).toBeVisible({ timeout: 30_000 });

    await page.goto(`${WEB}/schedules`, { waitUntil: 'networkidle' });
    await page.getByTestId('button-outcall-schedule').click();
    await expect(page.getByText('Durable call request scheduled.')).toBeVisible({ timeout: 30_000 });
    const openRecord = page.getByRole('button', { name: 'Open call record' }).first();
    await expect(openRecord).toBeVisible();
    await openRecord.click();
    await expect(page).toHaveURL(/^https:\/\/outcall\.operatoros\.net\/calls\/[a-f0-9-]+$/u);
    const callPath = new URL(page.url()).pathname;
    await expect(page.getByTestId('outcall-call-record')).toBeVisible();

    const routes: Array<[string, string, string]> = [
      ['/', 'outcall-overview-route', 'OutCall overview'],
      ['/contacts', 'outcall-contacts-route', 'Verified destination and rescue profiles'],
      ['/schedules', 'outcall-schedules-route', 'Schedules'],
      ['/campaigns', 'outcall-campaigns-route', 'Private triggers'],
      [callPath, 'outcall-calls-route', 'Calls'],
      ['/reminders', 'outcall-reminders-route', 'Reminders'],
      ['/verification', 'outcall-verification-route', 'Verification'],
      ['/delivery', 'outcall-delivery-route', 'Delivery readiness'],
      ['/history', 'outcall-history-route', 'History'],
      ['/compliance', 'outcall-compliance-route', 'Privacy and safety'],
      ['/settings', 'outcall-settings-route', 'OutCall settings'],
    ];
    for (const [path, testId, heading] of routes) {
      const response = await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('outcall-module-header').getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/iu);
      await expectNoOverflow(page, path);
      await noUnlabelledControls(page);
    }

    for (const [legacy, canonical] of [
      ['/dashboard', '/'], ['/readiness', '/'], ['/profiles', '/contacts'], ['/triggers', '/campaigns'],
      ['/setup', '/verification'], ['/privacy', '/compliance'],
    ]) {
      await page.goto(`${WEB}${legacy}`);
      await expect(page).toHaveURL(`${WEB}${canonical}`);
    }

    await page.getByTestId('outcall-sidebar-calls').click();
    await expect(page).toHaveURL(`${WEB}/calls`);
    await page.goBack();
    await expect(page).toHaveURL(`${WEB}/compliance`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('outcall-sidebar-compliance')).toHaveAttribute('aria-current', 'page');

    const routeCalls: string[] = [];
    const capture = (response: { url(): string }) => {
      const path = new URL(response.url()).pathname;
      if (path.includes('/api/modules/outcall/')) routeCalls.push(path);
    };
    page.on('response', capture);
    await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
    page.off('response', capture);
    expect(routeCalls).toEqual(['/api/modules/outcall/workspace']);

    for (const path of ['/', '/contacts', '/schedules', '/campaigns', '/compliance', '/settings']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations, `${path} accessibility`).toEqual([]);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${WEB}/schedules`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '../../docs/phase-50/evidence/outcall-schedules-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${WEB}/contacts`, { waitUntil: 'networkidle' });
    await expectNoOverflow(page, '/contacts tablet');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/compliance`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open OutCall navigation' }).click();
    await expect(page.getByTestId('outcall-module-sidebar')).toBeVisible();
    await expectNoOverflow(page, '/compliance mobile');
    await page.screenshot({ path: '../../docs/phase-50/evidence/outcall-compliance-mobile.png', fullPage: true, animations: 'disabled' });

    expect(serverErrors).toEqual([]);
    expect(consoleErrors.filter(error => !/favicon|Download the React DevTools/iu.test(error))).toEqual([]);
  });
});
