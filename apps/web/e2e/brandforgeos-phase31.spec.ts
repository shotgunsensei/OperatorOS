import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';

const exactHost = process.env.E2E_PRODUCTION_HOSTS === '1';
const WEB =
  process.env.E2E_BRANDFORGEOS_URL ??
  (exactHost
    ? 'https://brandforgeos.operatoros.net'
    : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000'));
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase31-Disposable-Only-9!';
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function expectAccessibleFields(page: Page) {
  const failures = await page.locator('input,select,textarea').evaluateAll((controls) =>
    controls.flatMap((control) => {
      const node = control as HTMLInputElement;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden') return [];
      const labelled =
        node.getAttribute('aria-label') ||
        node.getAttribute('aria-labelledby') ||
        (node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`)) ||
        node.closest('label');
      return labelled ? [] : [node.outerHTML.slice(0, 140)];
    }),
  );
  expect(failures).toEqual([]);
}

async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for exact-host setup');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase31-exact-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net',
      'x-forwarded-host': 'auth.operatoros.net',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.81.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 31 Exact Host' },
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
    const elite = await pg.query<{ id: string }>(
      "select id from subscription_plans where slug='elite' and is_active=true limit 1",
    );
    expect(elite.rows).toHaveLength(1);
    await pg.query(
      "insert into subscriptions (user_id,plan_id,status,current_period_start,current_period_end,tenant_id,scope_type) values ($1,$2,'active',now(),now()+interval '30 days',$3,'tenant')",
      [identity.rows[0].user_id, elite.rows[0].id, identity.rows[0].tenant_id],
    );
    await pg.query(
      "insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug='brandforgeos' on conflict do nothing",
      [identity.rows[0].tenant_id],
    );
  } finally {
    await pg.end();
  }
  await page.goto(`${WEB}/offers`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/brandforgeos\.operatoros\.net\/offers(?:[?#].*)?$/, {
      timeout: 30_000,
    }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('brandforgeos-workspace')).toBeVisible({ timeout: 30_000 });
}

test.describe('Phase 31 BrandForgeOS complete product contract', () => {
  test.setTimeout(240_000);

  test('premium campaign, strategy, template, integration, report and admin surfaces are responsive', async ({
    page,
  }) => {
    if (exactHost) await establishExactHostSession(page);
    else await establishParitySession(page.request);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    const prefix = exactHost ? '' : '/modules/brandforgeos';
    const routes = [
      ['/brands', 'brandforgeos-brands'],
      ['/campaigns', 'brandforgeos-campaigns'],
      ['/content', 'brandforgeos-copy'],
      ['/calendar', 'brandforgeos-calendar'],
      ['/approvals', 'brandforgeos-campaigns'],
      ['/ai-workflows', 'brandforgeos-ai'],
      ['/analytics', 'brandforgeos-analytics'],
      ['/integrations', 'brandforge-integrations'],
      ['/reports', 'brandforge-reports'],
      ['/settings', 'brandforgeos-settings'],
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const [route, testId] of routes) {
        const response = await page.goto(`${WEB}${prefix}${route}`, { waitUntil: 'domcontentloaded' });
        expect(response?.status(), route).toBeLessThan(400);
        await expect(page.getByTestId('brandforgeos-workspace')).toBeVisible();
        await expect(page.getByTestId(testId)).toBeVisible();
        await expect(page.locator('body')).not.toContainText(
          /coming soon|not implemented|placeholder action|sample metric/i,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
          `${viewport.name} ${route} horizontal overflow`,
        ).toBeLessThanOrEqual(1);
        await expectAccessibleFields(page);
      }
      await page.goto(`${WEB}${prefix}/dashboard`, { waitUntil: 'networkidle' });
      await page.screenshot({
        path: `test-results/playwright/brandforgeos-phase31-${viewport.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
});
