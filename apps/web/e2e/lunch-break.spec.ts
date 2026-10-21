import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ context }) => {
  // Browser traffic stays local. The external-link test installs a later
  // synthetic destination handler; it never contacts the real game.
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['127.0.0.1', 'localhost', '[::1]'].includes(host) ? route.continue() : route.abort();
  });
  await context.routeWebSocket('**/*', (socket) => socket.close());
});

test('public hub shows five observed game websites, free access and no auth requests', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/(?:api|v1)\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });
  await page.goto('/lunch-break');
  await expect(page.getByRole('heading', { name: 'Good work. Great break.' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(5);
  for (const id of ['scrapshift', 'roaming-garden', 'neon-racer', 'kage']) {
    const card = page.getByTestId(`game-${id}`);
    await expect(card.getByRole('link')).toHaveCount(1);
    await expect(card).toContainText('Game website');
  }
  await expect(page.getByTestId('game-pool-hall').getByRole('link')).toHaveAttribute(
    'href',
    'https://operatorpoolhall.operatoros.net/',
  );
  await expect(page.getByText('Free for everyone.', { exact: false })).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test('keyboard skip and jump navigation reach the selected game and launch link', async ({
  page,
}) => {
  await page.goto('/lunch-break');
  await expect(page.getByRole('heading', { name: 'Good work. Great break.' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to games' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#games')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page
      .getByRole('navigation', { name: 'Jump to a game' })
      .getByRole('link', { name: 'Pool Hall', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('game-pool-hall')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Open Pool Hall/ })).toBeFocused();
  await page
    .getByRole('navigation', { name: 'Jump to a game' })
    .getByRole('link', { name: 'Kage', exact: true })
    .click();
  await expect(page.getByTestId('game-kage')).toBeFocused();
});

for (const width of [320, 390, 768, 1440]) {
  test(`responsive hub has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/lunch-break');
    await expect(page.getByRole('heading', { name: 'Good work. Great break.' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    for (const id of ['pool-hall', 'scrapshift', 'roaming-garden', 'neon-racer', 'kage']) {
      await expect(page.getByTestId(`game-${id}`)).toBeVisible();
    }
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `output/playwright/lunch-break/hub-${width}.png`,
        fullPage: true,
      });
  });
}

test('external launch opens a separate tab without credentials, referrer or opener', async ({
  context,
  page,
}) => {
  let externalHeaders: Record<string, string> = {};
  await context.route('https://operatorpoolhall.operatoros.net/**', async (route) => {
    externalHeaders = await route.request().allHeaders();
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Isolated external destination fixture</title><p>Fixture only</p>',
    });
  });
  await page.goto('/lunch-break?tenant=must-not-forward&code=must-not-forward');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: /Open Pool Hall/ }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toBe('https://operatorpoolhall.operatoros.net/');
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  expect(externalHeaders.referer).toBeUndefined();
  expect(externalHeaders.cookie).toBeUndefined();
  await popup.close();
});

test('public hub passes WCAG A/AA accessibility checks', async ({ page }) => {
  await page.goto('/lunch-break');
  await expect(page.getByRole('heading', { name: 'Good work. Great break.' })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});

test('built Next exact-host routing serves the hub and rejects private routes without issuing cookies', async ({
  request,
}) => {
  for (const host of [
    'lunchbreak.operatoros.net',
    'LUNCHBREAK.OPERATOROS.NET:443',
    'lunchbreak.operatoros.net.',
  ]) {
    const root = await request.get('/', { headers: { host } });
    expect(root.status()).toBe(200);
    expect(await root.text()).toContain('Great break.');
    expect(root.headers()['set-cookie']).toBeUndefined();
    expect(root.headers()['referrer-policy']).toBe('no-referrer');
    for (const path of ['/api/auth/me', '/sso?code=opaque', '/app', '/logout', '/.env']) {
      const response = await request.get(path, {
        headers: { host, 'x-forwarded-host': 'app.operatoros.net' },
        maxRedirects: 0,
      });
      expect(response.status(), host + path).toBe(404);
      expect(response.headers()['set-cookie']).toBeUndefined();
      expect(response.headers().location).toBeUndefined();
    }
  }
});

test('ordinary free-user UI exposes Lunch Break and preserves the independent Pool Hall card', async ({
  context,
  page,
}) => {
  page.on('pageerror', (error) => console.error('SYNTHETIC_UI_PAGE_ERROR', error.message));
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  await context.addCookies([
    { name: 'operatoros_session', value: 'synthetic-ui-only-never-verified', url: origin },
  ]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    let body: unknown;
    if (path === '/auth/me')
      body = {
        user: {
          id: 'local-ui-user',
          name: 'Local browser fixture',
          email: 'fixture@example.test',
          role: 'user',
          platformRole: 'user',
          status: 'active',
          currentTenantId: 'local-ui-tenant',
        },
      };
    else if (path === '/me/tenants')
      body = {
        tenants: [
          {
            id: 'local-ui-tenant',
            slug: 'local-fixture',
            name: 'Local fixture',
            role: 'member',
            status: 'active',
          },
        ],
        activeTenantId: 'local-ui-tenant',
      };
    else if (path === '/modules' || path === '/me/modules')
      body = {
        modules: [
          {
            module: {
              slug: 'ninja-pool-hall',
              name: 'Operator Pool Hall',
              status: 'live',
              category: 'support',
              ord: 1,
            },
            unlocked: true,
            cta: 'open',
            access_source: 'plan',
          },
        ],
      };
    else if (path.includes('trial')) body = { trial: null };
    await route.fulfill(
      body === undefined
        ? { status: 404, json: { error: 'No synthetic fixture for this endpoint' } }
        : { json: body },
    );
  });
  await page.goto('/app');
  await expect(page.getByTestId('page-my-apps')).toBeVisible();
  await expect(page.getByTestId('nav-lunch-break')).toHaveAttribute('href', '/lunch-break');
  await expect(page.getByTestId('lunch-break-entry')).toBeVisible();
  await expect(
    page.getByTestId('page-my-apps').getByText('Operator Pool Hall', { exact: true }),
  ).toBeVisible();
  await page.getByTestId('lunch-break-entry').click();
  await expect(page).toHaveURL(/\/lunch-break$/);
  await expect(page.locator('article')).toHaveCount(5);
});
