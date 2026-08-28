import { expect, test } from '@playwright/test';

const baseUrl = process.env.BRAND_E2E_BASE_URL ?? 'http://127.0.0.1:5000';

test.describe('OperatorOS canonical branding', () => {
  test('desktop marketing, icon metadata, and social artwork use the intended variants', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('marketing-navbar').locator('[data-brand-asset="operatoros-lockup"]')).toBeVisible();
    await expect(page.getByTestId('marketing-hero').getByAltText('OperatorOS.net')).toBeVisible();
    await expect(page.locator('[data-brand-asset="operatoros-mark"]').first()).toBeVisible();
    await expect(page.locator('link[rel="icon"][href*="operatoros-mark.png"]')).toHaveCount(1);

    const manifestResponse = await request.get(`${baseUrl}/manifest.json`);
    expect(manifestResponse.ok()).toBe(true);
    expect(await manifestResponse.json()).toMatchObject({
      icons: [{
        src: '/brand/operatoros-mark.png',
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'any',
      }],
    });

    const faviconResponse = await request.get(`${baseUrl}/favicon.ico`);
    expect(faviconResponse.status()).toBe(200);
    expect(faviconResponse.headers()['content-type']).toContain('image/png');

    const socialResponse = await request.get(`${baseUrl}/opengraph-image`);
    expect(socialResponse.status()).toBe(200);
    expect(socialResponse.headers()['content-type']).toContain('image/png');
    expect((await socialResponse.body()).byteLength).toBeGreaterThan(100_000);
  });

  test('mobile and auth surfaces keep the brand readable without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('marketing-navbar').locator('[data-brand-asset="operatoros-lockup"]')).toBeVisible();
    await expect(page.getByTestId('marketing-hero-title')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-brand-asset="operatoros-lockup"]').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enter your command center.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
