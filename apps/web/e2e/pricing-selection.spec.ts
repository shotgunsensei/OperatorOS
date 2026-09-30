import { expect, test } from '@playwright/test';

const WEB = process.env.E2E_WEB_BASE_URL ?? 'http://127.0.0.1:5000';

for (const width of [1440, 390]) test(`selected TradeFlowKit Stack survives account creation and sign-in handoffs at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${WEB}/pricing?product=tradeflowkit&utm_source=pilot#build-stack`);
  const builder = page.locator('#build-stack');
  await builder.getByRole('button', { name: /^BrandForgeOS\s+Select/ }).click();
  await builder.getByRole('button', { name: /^SnapProofOS\s*\+/ }).click();
  await page.getByRole('button', { name: 'Add additional seat', exact: true }).click();
  await page.getByRole('button', { name: 'Add additional seat', exact: true }).click();
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$208/month');
  expect(new URL(page.url()).searchParams.get('utm_source')).toBe('pilot');

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

  await page.goBack();
  await page.reload();
  await expect(page.getByTestId('additional-seat-count')).toHaveText('2');
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$208/month');
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Create your OperatorOS account' })).toBeVisible();

  // Exercise the existing auth return destination without creating an account or purchase.
  await page.goto(new URL(next, WEB).toString());
  await expect(builder.getByRole('button', { name: /^TradeFlowKit/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(builder.getByRole('button', { name: /^BrandForgeOS\s*\$0/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(builder.getByRole('button', { name: /^SnapProofOS\s*\+/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('additional-seat-count')).toHaveText('2');
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$208/month');
  await page.getByTestId('stack-checkout-cta').click();
  await expect(page.getByTestId('button-login')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
});

test('manipulated preferences stay local and cannot overflow the seat counter', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const query = new URLSearchParams({
    product: '//outside.example', companion: 'outcall',
    additional: 'snapproofos,brandforgeos,brandforgeos,outcall',
    seats: '9007199254740991', next: 'https://outside.example', role: 'owner', price: '0',
  });
  await page.goto(`${WEB}/pricing?${query}#build-stack`);
  await expect(page.getByTestId('additional-seat-count')).toHaveText('0');
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$178/month');
  const href = await page.getByTestId('stack-create-account-cta').getAttribute('href');
  expect(new URL(href!, WEB).searchParams.get('next')).toBe('/pricing?product=tradeflowkit&additional=brandforgeos#build-stack');
  await page.goto(`${WEB}/pricing?seats=2147483642#build-stack`);
  await expect(page.getByTestId('additional-seat-count')).toHaveText('2147483642');
  await expect(page.getByRole('button', { name: 'Add additional seat', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove additional seat', exact: true }).click();
  await expect(page.getByTestId('additional-seat-count')).toHaveText('2147483641');
  expect(errors).toEqual([]);
});
