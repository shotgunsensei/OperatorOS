import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';

const exactHost = process.env.E2E_PRODUCTION_HOSTS === '1';
const WEB = process.env.E2E_STUDYFORGE_URL ?? (exactHost
  ? 'https://studyforge-ai.operatoros.net'
  : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000'));
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';

async function exactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for exact-host acceptance');
  const email = `phase33-${Date.now()}@example.com`;
  const password = 'Phase33-Disposable-Only-9!';
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: { host: 'auth.operatoros.net', 'x-forwarded-host': 'auth.operatoros.net', 'x-forwarded-proto': 'https' },
    data: { email, password, name: 'Phase 33 Exact Host' },
  });
  expect(registration.status(), await registration.text()).toBe(202);
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    const identity = await pg.query<{ user_id: string; tenant_id: string }>('select id as user_id,current_tenant_id as tenant_id from users where email=$1', [email]);
    const elite = await pg.query<{ id: string }>("select id from subscription_plans where slug='elite' and is_active=true limit 1");
    await pg.query("insert into subscriptions(user_id,plan_id,status,current_period_start,current_period_end,tenant_id,scope_type) values($1,$2,'active',now(),now()+interval '30 days',$3,'tenant')", [identity.rows[0]!.user_id, elite.rows[0]!.id, identity.rows[0]!.tenant_id]);
    await pg.query("insert into tenant_modules(tenant_id,module_id,status,source,allow_all_members,metadata) select $1,id,'enabled','included',true,'{\"features\":{\"studyforgePlan\":\"pro\"}}'::jsonb from modules where slug='studyforge-ai' on conflict do nothing", [identity.rows[0]!.tenant_id]);
  } finally { await pg.end(); }
  await page.goto(`${WEB}/sets/new`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(password);
  await Promise.all([
    page.waitForURL(/^https:\/\/studyforge-ai\.operatoros\.net\/sets\/new/),
    page.getByTestId('button-login').click(),
  ]);
}

async function noUnlabelledControls(page: Page) {
  const failures = await page.locator('input,select,textarea').evaluateAll((controls) => controls.flatMap((control) => {
    const node = control as HTMLInputElement;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(node).visibility === 'hidden') return [];
    return node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') || node.closest('label') ? [] : [node.outerHTML.slice(0, 120)];
  }));
  expect(failures).toEqual([]);
}

test.describe('Phase 33 StudyForge complete learning product', () => {
  test.setTimeout(240_000);

  test('complete deterministic learning journey persists and remains usable on mobile', async ({ page }) => {
    if (exactHost) await exactHostSession(page);
    else await establishParitySession(page.request);
    const prefix = exactHost ? '' : '/modules/studyforge-ai';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.goto(`${WEB}${prefix}/sets/new`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('studyforge-phase33-complete')).toBeVisible();
    if (await page.getByRole('button', { name: 'Activate workspace' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Activate workspace' }).click();
    }
    const title = `Browser Cell Energy ${Date.now()}`;
    await page.getByLabel('Set title').fill(title);
    await page.getByLabel('Course', { exact: true }).fill('BIO-201');
    await page.getByLabel('Raw study notes').fill('Mitochondria generate ATP through oxidative phosphorylation. Cells use ATP as an energy carrier. Glycolysis occurs in the cytoplasm and produces pyruvate. Oxygen accepts electrons at the end of the transport chain.');
    await page.getByLabel('Generator').selectOption('deterministic');
    await page.getByRole('button', { name: 'Generate every artifact' }).click();
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(title) }).click();
    await expect(page.getByText('Key terms', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'flashcards', exact: true }).click();
    await expect(page.getByText(/Card 1 of/)).toBeVisible();
    await page.keyboard.press('Space');
    await page.keyboard.press('2');
    await expect(page.getByRole('button', { name: 'Finish session' })).toBeVisible();
    await page.getByRole('button', { name: 'Finish session' }).click();

    await page.getByRole('button', { name: 'quiz', exact: true }).click();
    const groups = page.locator('fieldset');
    for (let index = 0; index < await groups.count(); index += 1) await groups.nth(index).getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Submit and review' }).click();
    await expect(page.getByText('Attempt history')).toBeVisible();

    await page.getByRole('button', { name: 'review', exact: true }).click();
    await expect(page.getByText('Last-minute cram section')).toBeVisible();
    await page.getByRole('button', { name: 'plan', exact: true }).click();
    await page.getByRole('button', { name: 'Complete' }).first().click();
    await expect(page.getByRole('button', { name: 'Reopen' }).first()).toBeVisible();
    await noUnlabelledControls(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test('source-compatible routes resolve at desktop, tablet, and mobile widths', async ({ page }) => {
    if (exactHost) await exactHostSession(page);
    else await establishParitySession(page.request);
    const prefix = exactHost ? '' : '/modules/studyforge-ai';
    const routes = [
      ['/app', 'studyforge-dashboard'], ['/sets', 'studyforge-sets'],
      ['/sets/new', 'studyforge-new-set'], ['/exams', 'studyforge-exams'],
      ['/account', 'studyforge-account'], ['/pricing', 'studyforge-account'],
    ] as const;
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 900, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const [route, id] of routes) {
        const response = await page.goto(`${WEB}${prefix}${route}`, { waitUntil: 'networkidle' });
        expect(response?.status(), route).toBeLessThan(400);
        await expect(page.locator(`#${id}`)).toBeVisible();
        await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action|fake billing/i);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), route).toBeLessThanOrEqual(1);
      }
    }
  });
});
