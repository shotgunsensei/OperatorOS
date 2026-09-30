import { expect, test } from '@playwright/test';

const WEB = process.env.E2E_WEB_BASE_URL ?? 'http://127.0.0.1:5000';

for (const width of [1440, 390]) test(`selected TradeFlowKit Stack survives account creation and sign-in handoffs at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${WEB}/pricing?product=tradeflowkit#build-stack`);
  const builder = page.locator('#build-stack');
  await builder.getByRole('button', { name: /^BrandForgeOS\s+Select/ }).click();
  await builder.getByRole('button', { name: /^SnapProofOS\s*\+/ }).click();
  await page.getByRole('button', { name: 'Add additional seat', exact: true }).click();
  await page.getByRole('button', { name: 'Add additional seat', exact: true }).click();
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$208/month');

  const registerHref = await page.getByTestId('stack-create-account-cta').getAttribute('href');
  expect(registerHref).toBeTruthy();
  for (const id of ['pricing-create-account', 'pricing-free-apps-cta']) await expect(page.getByTestId(id)).toHaveAttribute('href', registerHref!);
  await page.getByTestId('stack-create-account-cta').click();
  await expect(page.getByRole('heading', { name: 'Create your OperatorOS account' })).toBeVisible();
  const authUrl = new URL(page.url());
  expect(authUrl.searchParams.get('mode')).toBe('register');
  const next = authUrl.searchParams.get('next')!;
  expect(next).toContain('product=tradeflowkit');
  expect(next).toContain('companion=brandforgeos');
  expect(next).toContain('additional=snapproofos');
  expect(next).toContain('seats=2');

  // Exercise the existing auth return destination without creating an account or purchase.
  await page.goto(`${WEB}${next}`);
  await expect(builder.getByRole('button', { name: /^TradeFlowKit/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(builder.getByRole('button', { name: /^BrandForgeOS\s*\$0/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(builder.getByRole('button', { name: /^SnapProofOS\s*\+/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('additional-seat-count')).toHaveText('2');
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$208/month');
  await page.getByTestId('stack-checkout-cta').click();
  await expect(page.getByTestId('button-login')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
});
