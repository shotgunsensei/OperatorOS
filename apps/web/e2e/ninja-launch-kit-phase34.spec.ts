import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';

const exactHost = process.env.E2E_PRODUCTION_HOSTS === '1';
const WEB = exactHost ? 'https://ninjalaunchkit.operatoros.net' : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000');
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';

async function setAgency(tenantId: string) {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    await pg.query(`update tenant_modules set metadata='{"features":{"ninjaLaunchKitPlan":"agency"}}'::jsonb where tenant_id=$1 and module_id=(select id from modules where slug='ninja-launch-kit')`, [tenantId]);
  } finally { await pg.end(); }
}

async function exactHostSession(page: Page) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for exact-host acceptance');
  const email = `phase34-${Date.now()}@example.com`; const password = 'Phase34-Disposable-Only-9!';
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: { host: 'auth.operatoros.net', 'x-forwarded-host': 'auth.operatoros.net', 'x-forwarded-proto': 'https' },
    data: { email, password, name: 'Phase 34 Exact Host' },
  });
  expect(registration.status(), await registration.text()).toBe(202);
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect();
  try {
    const identity = await pg.query<{ user_id: string; tenant_id: string }>('select id as user_id,current_tenant_id as tenant_id from users where email=$1', [email]);
    const elite = await pg.query<{ id: string }>("select id from subscription_plans where slug='elite' and is_active=true limit 1");
    await pg.query("insert into subscriptions(user_id,plan_id,status,current_period_start,current_period_end,tenant_id,scope_type) values($1,$2,'active',now(),now()+interval '30 days',$3,'tenant')", [identity.rows[0]!.user_id, elite.rows[0]!.id, identity.rows[0]!.tenant_id]);
    await pg.query(`insert into tenant_modules(tenant_id,module_id,status,source,allow_all_members,metadata) select $1,id,'enabled','included',true,'{"features":{"ninjaLaunchKitPlan":"agency"}}'::jsonb from modules where slug='ninja-launch-kit' on conflict(tenant_id,module_id) do update set status='enabled',allow_all_members=true,metadata=excluded.metadata`, [identity.rows[0]!.tenant_id]);
  } finally { await pg.end(); }
  await page.goto(`${WEB}/dashboard`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(email); await page.getByTestId('input-password').fill(password);
  await Promise.all([page.waitForURL(/^https:\/\/ninjalaunchkit\.operatoros\.net\/dashboard/), page.getByTestId('button-login').click()]);
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

test.describe('Phase 34 Ninja Launch Kit exact-host product', () => {
  test.setTimeout(240_000);
  test.beforeEach(async ({ page }) => {
    if (exactHost) await exactHostSession(page);
    else {
      const session = await establishParitySession(page.request);
      await setAgency(session.tenantId);
    }
  });

  test('runs template to complete kit to export and preserves responsive source routes', async ({ page }) => {
    const prefix = exactHost ? '' : '/modules/ninja-launch-kit';
    await page.goto(`${WEB}${prefix}/templates`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('shell-ninja-launch-kit-complete')).toBeVisible();
    await expect(page.getByText('All 20 niche templates')).toBeVisible();
    await expect(page.getByText('Complete launch builder')).toBeVisible();
    await page.getByRole('button', { name: 'Use in builder' }).first().click();
    await page.getByLabel('Generation policy').selectOption('deterministic');
    await page.getByRole('button', { name: 'Preview without usage' }).click();
    await expect(page.getByText(/9 visual brief\(s\) unlocked/)).toBeVisible();
    await page.getByRole('button', { name: 'Generate and persist full kit' }).click();
    await expect(page.getByText('Generated campaign assets')).toBeVisible();
    await expect(page.locator('#launchkit-visual-promos article')).toHaveCount(9);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON' }).click();
    expect((await download).suggestedFilename()).toMatch(/ninja-launch-kit-.*\.json/);
    await expect(page.locator('#launchkit-exports')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#launchkit-builder')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const overflowElements = await page.locator('body *').evaluateAll((elements) => elements.flatMap((element) => {
      const box = element.getBoundingClientRect();
      return box.right > document.documentElement.clientWidth + 1 || box.left < -1
        ? [{ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 100), left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) }]
        : [];
    }).slice(0, 12));
    expect(overflow, JSON.stringify(overflowElements)).toBeLessThanOrEqual(1);
    await noUnlabelledControls(page);
    for (const route of ['/kits','/brands','/exports','/account','/admin','/launches','/plan','/artifacts','/readiness']) {
      await page.goto(`${WEB}${prefix}${route}`, { waitUntil: 'networkidle' });
      await expect(page.getByTestId('shell-ninja-launch-kit-complete')).toBeVisible();
      if (['/launches','/plan','/artifacts','/readiness'].includes(route)) await expect(page.locator('#launchkit-execution')).toHaveAttribute('open', '');
    }
  });

  test('public exact-host pricing, contact, legal, and landing routes remain anonymous', async ({ page }) => {
    test.skip(!exactHost, 'Public marketing paths are owned by the exact Ninja Launch Kit host.');
    for (const route of ['/', '/pricing', '/contact', '/terms', '/privacy']) {
      await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
      await expect(page.getByText('Ninja Launch Kit', { exact: true }).first()).toBeVisible();
    }
  });
});
