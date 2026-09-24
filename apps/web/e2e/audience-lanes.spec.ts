import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
