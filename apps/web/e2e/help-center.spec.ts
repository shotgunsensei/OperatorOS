import { expect, test } from '@playwright/test';

const baseUrl = process.env.HELP_CENTER_E2E_URL ?? 'http://127.0.0.1:5000';

test('Help Center searches every product guide and opens the matching page guide', async ({ page }) => {
  await page.goto(`${baseUrl}/help`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Find the exact page or function you need.' })).toBeVisible();
  await page.getByLabel('Search all help').fill('TechDeck ticket queue');
  const result = page.getByRole('button', { name: /TechDeck.*Tickets.*Triage, assign/u });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.getByRole('heading', { name: 'TechDeck', exact: true })).toBeVisible();
  const guide = page.locator('#guide-techdeck-tech-tickets');
  await expect(guide).toHaveAttribute('open', '');
  await expect(guide.getByText('What you can do')).toBeVisible();
  await expect(guide.getByText('Normal workflow')).toBeVisible();
  await expect(guide.getByRole('link', { name: 'Open this page' })).toHaveAttribute('href', 'https://techdeck.operatoros.net/tickets');
});

test('page-aware module Help URL selects the correct mobile guide without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/help?module=techdeck&page=%2Ftickets`, { waitUntil: 'networkidle' });

  const guide = page.locator('#guide-techdeck-tech-tickets');
  await expect(guide).toHaveAttribute('open', '');
  await expect(guide.getByText('Triage, assign, progress, and close tenant-scoped support work with SLA context.')).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
