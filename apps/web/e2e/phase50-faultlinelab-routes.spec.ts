import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

const WEB = 'https://faultlinelab.operatoros.net';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase50-FaultlineLab-Disposable-9!';

async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase50-faultlinelab-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net', 'x-forwarded-host': 'auth.operatoros.net', 'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.92.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 50 FaultlineLab Operator' },
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
    await pg.query("insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug='faultlinelab' on conflict do nothing", [identity.rows[0].tenant_id]);
  } finally {
    await pg.end();
  }

  await page.goto(`${WEB}/challenges`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/u);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/faultlinelab\.operatoros\.net\/challenges(?:[?#].*)?$/u, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('faultlinelab-module-shell')).toBeVisible({ timeout: 30_000 });
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

test.describe('Phase 50 FaultlineLab route application', () => {
  test.setTimeout(300_000);

  test('owner routes, investigation journey, focused loaders, history, and accessibility pass', async ({ page }) => {
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
    await establishExactHostSession(page);
    consoleErrors.length = 0;
    serverErrors.length = 0;
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

    const firstChallenge = page.getByTestId('faultlinelab-challenge-card').first();
    await expect(firstChallenge).toBeVisible({ timeout: 30_000 });
    const challengeId = await firstChallenge.getAttribute('data-challenge-id');
    expect(challengeId).toBeTruthy();
    await firstChallenge.getByRole('button', { name: 'Inspect' }).click();
    await expect(page).toHaveURL(`${WEB}/challenges/${challengeId}`);
    await expect(page.getByText('CHALLENGE INTEL')).toBeVisible();
    await page.getByTestId('faultlinelab-challenge-card').first().getByRole('button', { name: /^(Start|Retry)$/u }).click();
    await expect(page).toHaveURL(new RegExp(`^${WEB.replaceAll('.', '\\.')}\/sessions\/[a-f0-9-]+$`, 'u'), { timeout: 30_000 });
    await expect(page.getByTestId('faultlinelab-session')).toContainText('Terminal');
    const sessionPath = new URL(page.url()).pathname;
    const action = page.locator('.fl-chip-row button').first();
    if (await action.isVisible()) {
      await action.click();
      await expect(page.locator('.fl-terminal')).toContainText('#1', { timeout: 20_000 });
    }

    const routes: Array<[string, string, string]> = [
      ['/', 'faultlinelab-overview-route', 'Learning operations overview'],
      ['/challenges', 'faultlinelab-challenges-route', 'Challenge library'],
      [sessionPath, 'faultlinelab-session', 'Follow the evidence'],
      ['/assignments', 'faultlinelab-assignments-route', 'Assignments'],
      ['/runs', 'faultlinelab-runs-route', 'Runs and progress'],
      ['/evidence', 'faultlinelab-evidence-route', 'Evidence'],
      ['/authoring', 'faultlinelab-authoring-route', 'Authoring'],
      ['/reports', 'faultlinelab-reports-route', 'Reports'],
      ['/settings', 'faultlinelab-settings-route', 'FaultlineLab settings'],
    ];
    for (const [path, testId, heading] of routes) {
      const response = await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('faultlinelab-module-header').getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/iu);
      await expectNoOverflow(page, path);
      await noUnlabelledControls(page);
    }

    for (const [legacy, canonical] of [['/dashboard', '/'], ['/daily', '/challenges'], ['/progress', '/runs'], ['/analytics', '/reports']]) {
      await page.goto(`${WEB}${legacy}`);
      await expect(page).toHaveURL(`${WEB}${canonical}`);
    }

    await page.getByTestId('faultlinelab-sidebar-evidence').click();
    await expect(page).toHaveURL(`${WEB}/evidence`);
    await page.goBack();
    await expect(page).toHaveURL(`${WEB}/reports`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('faultlinelab-sidebar-reports')).toHaveAttribute('aria-current', 'page');

    const settingsCalls: string[] = [];
    const capture = (response: { url(): string }) => {
      const url = response.url();
      if (url.includes('/api/modules/faultlinelab/')) settingsCalls.push(new URL(url).pathname);
    };
    page.on('response', capture);
    await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
    page.off('response', capture);
    expect(settingsCalls).toEqual([]);

    for (const path of ['/', '/challenges', '/assignments', '/evidence', '/authoring', '/settings']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations, `${path} accessibility`).toEqual([]);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${WEB}/challenges`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '../../docs/phase-50/evidence/faultlinelab-challenges-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${WEB}/authoring`, { waitUntil: 'networkidle' });
    await expectNoOverflow(page, '/authoring tablet');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/evidence`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open FaultlineLab navigation' }).click();
    await expect(page.getByTestId('faultlinelab-module-sidebar')).toBeVisible();
    await expectNoOverflow(page, '/evidence mobile');
    await page.screenshot({ path: '../../docs/phase-50/evidence/faultlinelab-evidence-mobile.png', fullPage: true, animations: 'disabled' });

    expect(serverErrors).toEqual([]);
    expect(consoleErrors.filter(error => !/favicon|Download the React DevTools/iu.test(error))).toEqual([]);
  });
});
