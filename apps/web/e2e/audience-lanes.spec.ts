import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { registerAndLogin } from './session-auth';

const WEB = process.env.E2E_WEB_BASE_URL ?? 'http://127.0.0.1:5000';
const lanes = [
  ['trades', 'Trade Companies', 'TradeFlowKit', 'tradeflowkit'],
  ['msps', 'MSPs', 'TechDeck', 'techdeck'],
  ['healthcare-legal', 'Healthcare / Legal', 'PulseDesk', 'pulsedesk'],
] as const;

test('owners can follow each homepage lane into the matching plan without gaining access', async ({ page }) => {
  for (const [slug, audience, product, key] of lanes) {
    await page.goto(`${WEB}/`);
    await expect(page.getByTestId('audience-lanes').getByRole('link')).toHaveCount(3);
    await page.getByRole('link', { name: `Explore ${audience} with ${product}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/for/${slug}$`));
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://operatoros.net/for/${slug}`);
    await expect(page.getByTestId(`audience-page-${slug}`)).toBeVisible();
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute('content', `https://operatoros.net/media/audiences/${slug}-social.png`);
    await page.getByTestId('lane-pricing-cta').click();
    await expect(page).toHaveURL(new RegExp(`/pricing\\?product=${key}#build-stack$`));
    await expect(page.locator('#build-stack').getByRole('button', { name: new RegExp(`^${product}`) })).toHaveAttribute('aria-pressed', 'true');
    // A public plan preference grants no module, organization or billing access.
    await expect(page.getByRole('button', { name: /Sign in.*continue/i })).toBeVisible();
    await page.getByTestId('stack-checkout-cta').click();
    await expect(page).toHaveURL(/\/login\?/);
    const next = new URL(page.url()).searchParams.get('next');
    expect(next).toContain(`/pricing?product=${key}#build-stack`);
  }
});

test('plan selection fails safely for unknown or repeated query values', async ({ page }) => {
  for (const query of ['product=unknown', 'product=techdeck&product=pulsedesk']) {
    await page.goto(`${WEB}/pricing?${query}#build-stack`);
    await expect(page.locator('#build-stack').getByRole('button', { name: /^TradeFlowKit/ })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('an unpaid Stack resumes its saved cart after return while paid and non-owner gates remain closed', async ({ page }) => {
  await registerAndLogin(page.context().request, {
    email: `checkout-recovery-${Date.now()}@example.com`,
    password: 'CorrectHorseBattery9!', name: 'Checkout Recovery Owner',
  });
  // Simulate provider availability and a server-owned pending projection only
  // in the isolated local browser harness. No Stripe call or charge is made.
  let status = 'incomplete';
  let role = 'owner';
  let submitted: unknown = null;
  await page.route('**/api/billing/catalog', async route => {
    const response = await route.fetch();
    const catalog = await response.json();
    await route.fulfill({ json: { ...catalog, stripeConfigured: {
      tradeflowkit: true, pulsedesk: true, techdeck: true,
      companionModule: true, additionalSeat: true,
    } } });
  });
  await page.route('**/api/me/tenants', async route => {
    const response = await route.fetch();
    const tenants = await response.json();
    await route.fulfill({ json: { ...tenants, tenants: tenants.tenants.map((row: Record<string, unknown>) => ({ ...row, role })) } });
  });
  await page.route('**/api/billing/stack', async route => {
    const response = await route.fetch();
    const stack = await response.json();
    await route.fulfill({ json: { ...stack, applicationSubscription: {
      status, coreProduct: 'techdeck', includedCompanionKey: 'snapproofos',
      additionalModuleKeys: ['brandforgeos'], additionalSeats: 1,
    } } });
  });
  await page.route('**/api/billing/stack/checkout', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 409, json: { error: 'Recovery request captured; nothing was charged.' } });
  });
  await page.goto(`${WEB}/pricing?product=pulsedesk&billing=canceled#build-stack`);
  await expect(page.getByRole('button', { name: 'Resume Secure Checkout', exact: true })).toBeEnabled();
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$143/month');
  await expect(page.locator('#build-stack').getByRole('button', { name: /^TechDeck/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#build-stack').getByRole('button', { name: /^PulseDesk/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add additional seat', exact: true })).toBeDisabled();
  await expect(page.getByRole('complementary')).toContainText('Paid access begins only after payment is confirmed');
  await page.getByTestId('stack-checkout-cta').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Recovery request captured' })).toBeVisible();
  expect(submitted).toEqual({ coreProduct: 'techdeck', freeCompanionModule: 'snapproofos', additionalModules: ['brandforgeos'], additionalSeats: 1, interval: 'month' });

  submitted = null;
  status = 'active';
  await page.reload();
  await expect(page.getByRole('button', { name: 'One Flagship Already Active', exact: true })).toBeDisabled();
  status = 'incomplete';
  role = 'admin';
  await page.reload();
  await expect(page.getByRole('button', { name: 'Owner Action Required', exact: true })).toBeDisabled();
  expect(submitted).toBeNull();
});

test('office scope and planned connections are explained before a purchase', async ({ page }) => {
  await page.goto(`${WEB}/for/healthcare-legal`);
  await expect(page.getByRole('heading', { name: 'Legal-office operations' })).toBeVisible();
  await page.locator('summary').filter({ hasText: 'How does PulseDesk fit a legal office?' }).click();
  await expect(page.locator('details[open]')).toContainText('does not provide legal case management');
  await expect(page.getByTestId('audience-page-healthcare-legal')).toContainText('mailbox connections are not available in this release');
  await page.goto(`${WEB}/for/trades`);
  await page.locator('summary').filter({ hasText: 'Is QuickBooks already connected?' }).click();
  await expect(page.locator('details[open]')).toContainText('not included as a live connection today');
});

test('lanes reflow with readable images, working mobile navigation, and accessible controls', async ({ page }) => {
  test.setTimeout(120_000);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ['/', ...lanes.map(([slug]) => `/for/${slug}`)]) {
      await page.goto(`${WEB}${path}`);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const images = page.locator('main img');
      await expect(images.first()).toBeVisible();
      expect(await images.evaluateAll(elements => elements.every(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations).toEqual([]);
    }
  }
  await page.goto(`${WEB}/`);
  await page.getByTestId('marketing-nav-mobile-toggle').click();
  await expect(page.getByTestId('marketing-nav-mobile-drawer')).toBeVisible();
  await page.getByTestId('marketing-nav-mobile-pricing').click();
  await expect(page).toHaveURL(`${WEB}/pricing`);
  await expect(page.getByTestId('marketing-nav-mobile-drawer')).toBeHidden();
});

test('search discovery includes the three public pages and rejects unknown lanes', async ({ page, request }) => {
  // APIRequestContext does not use Chromium's loopback hostname mapping.
  const sitemap = await request.get(`${process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000'}/sitemap.xml`);
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  for (const [slug] of lanes) expect(xml).toContain(`https://operatoros.net/for/${slug}`);
  const missing = await page.goto(`${WEB}/for/unknown-business`);
  expect(missing?.status()).toBe(404);
});
