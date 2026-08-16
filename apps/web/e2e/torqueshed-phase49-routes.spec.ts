import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

const WEB = 'https://torqueshed.operatoros.net';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase49-Disposable-Only-9!';

async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase49-exact-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net',
      'x-forwarded-host': 'auth.operatoros.net',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.89.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 49 Route Operator' },
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
      "insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug='torqueshed' on conflict do nothing",
      [identity.rows[0].tenant_id],
    );
  } finally {
    await pg.end();
  }

  await page.goto(`${WEB}/garage`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/u);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/torqueshed\.operatoros\.net\/garage(?:[?#].*)?$/u, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('torqueshed-module-shell')).toBeVisible({ timeout: 30_000 });
}

async function sameOriginApi<T>(page: Page, path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> {
  return page.evaluate(async ({ path, method, body }) => {
    const tenantId = window.localStorage.getItem('activeTenantId');
    const response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        ...(method === 'POST' ? { 'idempotency-key': `phase49:${crypto.randomUUID()}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
    return payload;
  }, { path, method, body }) as Promise<T>;
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

test.describe('Phase 49 TorqueShed route application', () => {
  test.setTimeout(300_000);

  test('canonical pages, records, aliases, history, responsive shell, and focused loading remain honest', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await establishExactHostSession(page);
    // The expected unauthenticated bootstrap can log its 401 before exact-host
    // SSO redirects to login; route assertions begin after the session exists.
    consoleErrors.length = 0;
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

    const vehicle = await sameOriginApi<{ id: string }>(page, '/modules/torqueshed/vehicles', 'POST', {
      nickname: 'Phase 49 Blackbird', year: 2019, make: 'Ford', model: 'Mustang', engine: '5.0L', visibility: 'private',
    });
    const build = await sameOriginApi<{ id: string }>(page, '/modules/torqueshed/builds', 'POST', {
      vehicleId: vehicle.id, title: 'Phase 49 route build', description: 'Route migration proof', visibility: 'private', budgetMinor: 50000,
    });
    const diagnostic = await sameOriginApi<{ id: string }>(page, '/modules/torqueshed/diagnostics', 'POST', {
      vehicleId: vehicle.id, title: 'Phase 49 no-start', customerConcern: 'Intermittent crank with no start', symptoms: 'No fuel pressure', visibility: 'private',
    });
    const bayResult = await sameOriginApi<{ bay: { id: string } }>(page, '/modules/torqueshed/live-bays', 'POST', {
      vehicleId: vehicle.id, title: 'Phase 49 diagnostic bay', visibility: 'private',
    });
    const listing = await sameOriginApi<{ id: string }>(page, '/modules/torqueshed/marketplace/listings', 'POST', {
      title: 'Phase 49 scan tool', description: 'Tenant-scoped route listing', categorySlug: 'tools', type: 'sell', condition: 'working', priceMinor: 500,
    });

    const routes: Array<[string, string, string]> = [
      ['/', 'torqueshed-dashboard', 'Garage overview'],
      ['/garage', 'torqueshed-garage', 'Garage'],
      ['/garage/vehicles/new', 'torqueshed-garage', 'Add vehicle'],
      [`/garage/vehicles/${vehicle.id}`, 'torqueshed-garage', 'Vehicle detail'],
      ['/service', 'torqueshed-service', 'Service'],
      ['/builds', 'torqueshed-builds', 'Builds'],
      [`/builds/${build.id}`, 'torqueshed-builds', 'Build detail'],
      ['/journal', 'torqueshed-journal', 'Journal'],
      ['/diagnostics', 'torqueshed-diagnostics', 'Diagnostics'],
      ['/diagnostics/new', 'torqueshed-diagnostics', 'New diagnostic'],
      [`/diagnostics/${diagnostic.id}`, 'torqueshed-diagnostic-timeline', 'Diagnostic detail'],
      [`/diagnostics/${diagnostic.id}/assist`, 'torqueshed-torque-assist', 'Torque Assist'],
      ['/live-bays', 'torqueshed-live-bay', 'Live bays'],
      [`/live-bays/${bayResult.bay.id}`, 'torqueshed-live-bay', 'Live bay detail'],
      ['/templates', 'torqueshed-templates', 'Templates and vendors'],
      ['/marketplace', 'torqueshed-marketplace', 'Marketplace'],
      [`/marketplace/${listing.id}`, 'torqueshed-marketplace-listing-actions', 'Marketplace listing'],
      ['/community', 'torqueshed-community', 'Community'],
      ['/profile', 'torqueshed-profile-route', 'Profile'],
      ['/billing/credits', 'torqueshed-credits-route', 'Credits and usage'],
      ['/activity', 'torqueshed-activity-route', 'Activity'],
      ['/search', 'torqueshed-search-route', 'Search'],
      ['/exports', 'torqueshed-exports-route', 'Exports'],
      ['/settings', 'torqueshed-settings-route', 'Settings'],
    ];
    for (const [path, testId, heading] of routes) {
      const response = await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('torqueshed-route-header').getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/iu);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path} overflow`).toBeLessThanOrEqual(1);
      await noUnlabelledControls(page);
    }

    await page.goto(`${WEB}/maintenance`);
    await expect(page).toHaveURL(`${WEB}/service`);
    await page.goto(`${WEB}/dashboard`);
    await expect(page).toHaveURL(`${WEB}/`);

    await page.goto(`${WEB}/garage`);
    await page.getByTestId('torqueshed-sidebar-diagnostics').click();
    await expect(page).toHaveURL(`${WEB}/diagnostics`);
    await page.goBack();
    await expect(page).toHaveURL(`${WEB}/garage`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('torqueshed-sidebar-garage')).toHaveAttribute('aria-current', 'page');

    const torqueApiCalls: string[] = [];
    const capture = (response: { url(): string }) => {
      const url = response.url();
      if (url.includes('/api/modules/torqueshed/')) torqueApiCalls.push(new URL(url).pathname);
    };
    page.on('response', capture);
    await page.goto(`${WEB}/billing/credits`, { waitUntil: 'networkidle' });
    page.off('response', capture);
    expect(torqueApiCalls.some(path => path.endsWith('/token-ledger'))).toBeTruthy();
    expect(torqueApiCalls.some(path => path.endsWith('/torque-assist/status'))).toBeTruthy();
    expect(torqueApiCalls.some(path => /\/builds|\/reminders|\/vendors|\/diagnostic-templates/u.test(path))).toBeFalsy();
    await expect(page.getByRole('button', { name: /Roadside 25,000 units · \$5\.00/iu })).toBeEnabled();
    await expect(page.getByTestId('torqueshed-route-header')).toContainText('test-mode credit packs');

    for (const path of ['/', `/diagnostics/${diagnostic.id}/assist`, '/billing/credits', '/settings']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations, `${path} accessibility`).toEqual([]);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${WEB}/billing/credits`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'test-results/playwright/torqueshed-phase49-credits-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/garage`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open TorqueShed navigation' }).click();
    await expect(page.getByTestId('torqueshed-module-sidebar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'test-results/playwright/torqueshed-phase49-garage-mobile.png', fullPage: true, animations: 'disabled' });

    expect(consoleErrors.filter(error => !/favicon|Download the React DevTools/iu.test(error))).toEqual([]);
  });
});
