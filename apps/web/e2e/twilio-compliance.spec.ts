import { test, expect } from '@playwright/test';

const ROOT = process.env.E2E_ROOT_URL ?? 'http://127.0.0.1:5000';

test('public Twilio compliance routes and affirmative SMS consent workflow', async ({ page, request }) => {
  for (const [path, heading] of [
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms and Conditions'],
    ['/sms-consent', 'OperatorOS SMS Communications'],
    ['/messaging', 'OperatorOS Messaging Program'],
  ] as const) {
    const response = await page.goto(`${ROOT}${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page).toHaveURL(`${ROOT}${path}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  }

  await page.goto(`${ROOT}/sms-consent`);
  const checkbox = page.getByTestId('sms-consent-checkbox');
  await expect(checkbox).not.toBeChecked();
  const form = page.getByTestId('sms-consent-form');
  await expect(form.getByRole('link', { name: 'Privacy Policy', exact: true })).toHaveAttribute('href', '/privacy');
  await expect(form.getByRole('link', { name: 'Terms and Conditions', exact: true })).toHaveAttribute('href', '/terms');
  await page.getByLabel('Mobile phone number').fill('123');
  await checkbox.check();
  await page.getByTestId('sms-consent-submit').click();
  await expect(form.locator('.sms-result[role="alert"]')).toContainText('valid US mobile phone number');

  await page.getByLabel('Mobile phone number').fill('(202) 555-0188');
  await page.getByTestId('sms-consent-submit').click();
  await expect(page.getByRole('status')).toContainText('Consent reference: SMS-');
  await expect(checkbox).not.toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ROOT}/sms-consent`);
  await expect(page.getByRole('heading', { level: 1, name: 'OperatorOS SMS Communications' })).toBeVisible();
  await page.getByLabel('Mobile phone number').focus();
  await page.keyboard.press('Tab');
  await expect(checkbox).toBeFocused();

  const api = await request.get(`${process.env.E2E_API_URL ?? 'http://127.0.0.1:5001'}/v1/public/operatoros/sms-consent`);
  expect(api.status()).toBe(200);
  expect(await api.text()).not.toMatch(/TWILIO_AUTH_TOKEN|SESSION_SECRET/);
});
