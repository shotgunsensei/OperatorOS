import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { establishParitySession } from './parity-auth';

const WEB = process.env.E2E_PRODUCTION_HOSTS === '1'
  ? 'https://127.0.0.1'
  : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000');
const API = process.env.E2E_PRODUCTION_HOSTS === '1'
  ? 'https://127.0.0.1/api'
  : `${process.env.E2E_API_URL ?? 'http://127.0.0.1:5001'}/v1`;
const activeRoutes = [
  ['/modules/tradeflowkit/dashboard', 'Dashboard'],
  ['/modules/tradeflowkit/leads', 'Leads'],
  ['/modules/tradeflowkit/customers', 'Customers'],
  ['/modules/tradeflowkit/jobs', 'Jobs'],
  ['/modules/tradeflowkit/quotes', 'Quotes'],
  ['/modules/tradeflowkit/invoices', 'Invoices'],
  ['/modules/tradeflowkit/analytics', 'Analytics'],
  ['/modules/tradeflowkit/settings', 'Settings'],
] as const;
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 1024, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function assertNoUnlabelledFormControls(page: Page) {
  const failures = await page.locator('input,select,textarea').evaluateAll(controls => controls.flatMap(control => {
    const html = control as HTMLInputElement;
    const rect = html.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || getComputedStyle(html).visibility === 'hidden') return [];
    const labelled = html.getAttribute('aria-label') || html.getAttribute('aria-labelledby') ||
      (html.id && document.querySelector(`label[for="${CSS.escape(html.id)}"]`)) || html.closest('label');
    return labelled ? [] : [html.outerHTML.slice(0, 160)];
  }));
  expect(failures, 'every visible form control must have a programmatic label').toEqual([]);
}

async function assertTradeFlowKitShell(page: Page, route: string) {
  await expect(
    page.getByTestId('tradeflowkit-module-shell'),
    `${route} must render the entitled TradeFlowKit shell`,
  ).toBeVisible();
}

async function createPublicInvoice(request: APIRequestContext) {
  const customerResponse = await request.post(`${API}/modules/tradeflowkit/customers`, {
    data: { name: 'Phase 23 Visual Customer', email: 'visual@example.com' },
  });
  expect(customerResponse.ok(), await customerResponse.text()).toBeTruthy();
  const customer = await customerResponse.json();
  const invoiceResponse = await request.post(`${API}/modules/tradeflowkit/invoices`, {
    data: {
      customerId: customer.id,
      lineItems: [{ description: 'Source-faithful visual audit', quantity: 1, unitPriceCents: 27500 }],
      taxRateBps: 0,
      discountCents: 0,
    },
  });
  expect(invoiceResponse.ok(), await invoiceResponse.text()).toBeTruthy();
  const invoice = await invoiceResponse.json();
  const linkResponse = await request.post(`${API}/modules/tradeflowkit/invoices/${invoice.id}/public-link`);
  expect(linkResponse.ok(), await linkResponse.text()).toBeTruthy();
  return (await linkResponse.json()).path as string;
}

test.describe('Phase 23 TradeFlowKit visual identity and route restoration', () => {
  test.setTimeout(600_000);

  test('active routes are real, source-branded, labelled, and history-safe', async ({ page }) => {
    await establishParitySession(page.request);
    await page.addInitScript(() => localStorage.setItem('tradeflowkit-theme-v1', 'light'));
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
      const detail = request.failure()?.errorText ?? '';
      if (!detail.includes('ERR_ABORTED')) failedRequests.push(`${request.method()} ${request.url()} ${detail}`);
    });

    for (const [route, heading] of activeRoutes) {
      const response = await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), route).toBeLessThan(400);
      await assertTradeFlowKitShell(page, route);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.locator('[data-testid="tradeflowkit-module-shell"]')).toHaveCSS('--tfk-primary', 'hsl(25 95% 36%)');
      await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|todo-only/i);
      await assertNoUnlabelledFormControls(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${route} overflow`).toBeLessThanOrEqual(1);
    }

    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/analytics$/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();
    expect(consoleErrors, 'browser console errors').toEqual([]);
    expect(pageErrors, 'browser page errors').toEqual([]);
    expect(failedRequests, 'failed browser network requests').toEqual([]);
  });

  test('dashboard visual contract holds at desktop, tablet, and mobile widths', async ({ page }) => {
    await establishParitySession(page.request);
    await page.addInitScript(() => localStorage.setItem('tradeflowkit-theme-v1', 'light'));
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${WEB}/modules/tradeflowkit/dashboard`, { waitUntil: 'domcontentloaded' });
      await assertTradeFlowKitShell(page, `/modules/tradeflowkit/dashboard (${viewport.name})`);
      if (viewport.name === 'desktop') {
        await expect(page.locator('img[alt="TradeFlowKit"]')).toBeVisible();
      } else {
        await expect(page.locator('body')).toContainText('TradeFlowKit');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${viewport.name} overflow`).toBeLessThanOrEqual(1);
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement !== document.body), `${viewport.name} keyboard focus`).toBeTruthy();
      if (viewport.name === 'mobile') {
        const undersized = await page.locator('[data-testid="tradeflowkit-mobile-nav"] a').evaluateAll(links => links.flatMap(link => {
          const rect = link.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44 ? [] : [`${link.textContent?.trim()}:${rect.width}x${rect.height}`];
        }));
        expect(undersized, 'mobile navigation touch targets').toEqual([]);
      }
      await expect(page).toHaveScreenshot(`tradeflowkit-${viewport.name}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.005 });
    }
  });

  test('dark mode and public invoice preserve TradeFlowKit identity without fake delivery', async ({ page }) => {
    await establishParitySession(page.request);
    const publicPath = await createPublicInvoice(page.request);
    await page.addInitScript(() => localStorage.setItem('tradeflowkit-theme-v1', 'dark'));
    await page.goto(`${WEB}/modules/tradeflowkit/dashboard`, { waitUntil: 'domcontentloaded' });
    await assertTradeFlowKitShell(page, '/modules/tradeflowkit/dashboard (dark)');
    await expect(page.locator('[data-testid="tradeflowkit-module-shell"]')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('[data-testid="tradeflowkit-module-shell"]')).toHaveCSS('--tfk-primary', 'hsl(25 95% 52%)');
    const response = await page.goto(`${WEB}${publicPath}`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('img[alt="TradeFlowKit"]')).toBeVisible();
    await expect(page.getByText('$275.00').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/delivered successfully|payment succeeded/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'public invoice overflow').toBeLessThanOrEqual(1);
    await assertNoUnlabelledFormControls(page);
  });
});
