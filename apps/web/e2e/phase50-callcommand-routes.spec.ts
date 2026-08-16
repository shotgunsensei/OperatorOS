import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

const WEB = 'https://callcommand-ai.operatoros.net';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase50-CallCommand-Disposable-9!';

async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase50-callcommand-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net', 'x-forwarded-host': 'auth.operatoros.net', 'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.94.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 50 CallCommand Operator' },
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
    await pg.query("insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug='callcommand-ai' on conflict do nothing", [identity.rows[0].tenant_id]);
  } finally {
    await pg.end();
  }

  await page.goto(`${WEB}/automations`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/u);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/callcommand-ai\.operatoros\.net\/automations(?:[?#].*)?$/u, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('callcommand-module-shell')).toBeVisible({ timeout: 30_000 });
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

test.describe('Phase 50 CallCommand AI route application', () => {
  test.setTimeout(360_000);

  test('owner routes, deterministic call journey, focused workspaces, history, and accessibility pass', async ({ page }) => {
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
    await establishExactHostSession(page);
    consoleErrors.length = 0;
    serverErrors.length = 0;
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

    await page.getByRole('button', { name: 'Create receptionist' }).click();
    await expect(page.getByText('Operations receptionist').last()).toBeVisible({ timeout: 30_000 });
    await page.goto(`${WEB}/numbers`, { waitUntil: 'networkidle' });
    const testPhone = `+1555${String(Date.now()).slice(-7)}`;
    await page.getByTestId('input-callcommand-channel-phone').fill(testPhone);
    await page.getByTestId('button-callcommand-create-channel').click();
    await expect(page.getByText(/Primary operations line/u).last()).toBeVisible({ timeout: 30_000 });
    await page.goto(`${WEB}/calls`, { waitUntil: 'networkidle' });
    await page.getByTestId('button-callcommand-place-test-call').click();
    await expect(page.getByText('Acceptance caller').first()).toBeVisible({ timeout: 30_000 });
    const firstCall = page.locator('[data-call-id]').first();
    const callId = await firstCall.getAttribute('data-call-id');
    expect(callId).toBeTruthy();
    await firstCall.click();
    await expect(page).toHaveURL(`${WEB}/calls/${callId}`);
    const callPath = new URL(page.url()).pathname;

    const routes: Array<[string, string, string]> = [
      ['/', 'callcommand-overview-route', 'Switchboard'],
      [callPath, 'callcommand-calls-route', 'Calls'],
      ['/recordings', 'callcommand-recordings-route', 'Recordings'],
      ['/transcripts', 'callcommand-transcripts-route', 'Transcripts'],
      ['/analysis', 'callcommand-analysis-route', 'Analysis'],
      ['/actions', 'callcommand-actions-route', 'Actions'],
      ['/automations', 'callcommand-automations-route', 'Automations'],
      ['/numbers', 'callcommand-numbers-route', 'Numbers and channels'],
      ['/providers', 'callcommand-providers-route', 'Providers'],
      ['/organizations', 'callcommand-organizations-route', 'Organizations and support contacts'],
      ['/compliance', 'callcommand-compliance-route', 'Compliance and call evidence'],
      ['/settings', 'callcommand-settings-route', 'CallCommand AI settings'],
    ];
    for (const [path, testId, heading] of routes) {
      const response = await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('callcommand-module-header').getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/iu);
      await expectNoOverflow(page, path);
      await noUnlabelledControls(page);
    }

    for (const [legacy, canonical] of [
      ['/dashboard', '/'], ['/switchboard', '/'], ['/tickets', '/actions'], ['/profiles', '/automations'],
      ['/flows', '/automations'], ['/setup/telephony', '/providers'], ['/msp/organizations', '/organizations'],
      ['/msp/audit', '/compliance'], ['/billing', '/settings'],
    ]) {
      await page.goto(`${WEB}${legacy}`);
      await expect(page).toHaveURL(`${WEB}${canonical}`);
    }

    await page.getByTestId('callcommand-sidebar-calls').click();
    await expect(page).toHaveURL(`${WEB}/calls`);
    await page.goBack();
    await expect(page).toHaveURL(`${WEB}/settings`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('callcommand-sidebar-settings')).toHaveAttribute('aria-current', 'page');

    const callData: string[] = [];
    const callCapture = (response: { url(): string }) => {
      const path = new URL(response.url()).pathname;
      if (path.includes('/api/modules/callcommand-ai/product/')) callData.push(path);
    };
    page.on('response', callCapture);
    await page.goto(`${WEB}/calls`, { waitUntil: 'networkidle' });
    page.off('response', callCapture);
    expect(callData.some(path => path.endsWith('/product/workspace'))).toBe(true);
    expect(callData.some(path => path.endsWith('/product/msp/workspace'))).toBe(false);

    const organizationData: string[] = [];
    const organizationCapture = (response: { url(): string }) => {
      const path = new URL(response.url()).pathname;
      if (path.includes('/api/modules/callcommand-ai/product/')) organizationData.push(path);
    };
    page.on('response', organizationCapture);
    await page.goto(`${WEB}/organizations`, { waitUntil: 'networkidle' });
    page.off('response', organizationCapture);
    expect(organizationData.some(path => path.endsWith('/product/msp/workspace'))).toBe(true);
    expect(organizationData.some(path => path.endsWith('/product/workspace'))).toBe(false);

    for (const path of ['/', '/calls', '/automations', '/providers', '/compliance', '/settings']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations, `${path} accessibility`).toEqual([]);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${WEB}/calls`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '../../docs/phase-50/evidence/callcommand-calls-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${WEB}/organizations`, { waitUntil: 'networkidle' });
    await expectNoOverflow(page, '/organizations tablet');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/compliance`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open CallCommand AI navigation' }).click();
    await expect(page.getByTestId('callcommand-module-sidebar')).toBeVisible();
    await expectNoOverflow(page, '/compliance mobile');
    await page.screenshot({ path: '../../docs/phase-50/evidence/callcommand-compliance-mobile.png', fullPage: true, animations: 'disabled' });

    expect(serverErrors).toEqual([]);
    expect(consoleErrors.filter(error => !/favicon|Download the React DevTools/iu.test(error))).toEqual([]);
  });
});
