import { expect, test } from '@playwright/test';
import { establishParitySession } from './parity-auth';

const WEB = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000';

test.describe('Phase 35 CallCommand complete product', () => {
  test.setTimeout(180_000);
  test.beforeEach(async ({ page }) => { await establishParitySession(page.request); });

  test('creates receptionist, channel, flow, rule, complete call intelligence, work item, and source deep links', async ({ page }) => {
    await page.goto(`${WEB}/modules/callcommand-ai/dashboard`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('shell-callcommand-ai')).toBeVisible();
    await expect(page.getByText('Twilio voice provider unavailable')).toBeVisible();
    await page.getByTestId('button-callcommand-create-profile').click();
    await expect(page.locator('#callcommand-receptionists')).toContainText('Operations receptionist');
    await page.getByTestId('input-callcommand-channel-phone').fill(`+1555${String(Date.now()).slice(-7)}`);
    await page.getByTestId('button-callcommand-create-channel').click();
    await expect(page.locator('#callcommand-configuration')).toContainText('Primary operations line');
    await page.getByRole('button', { name: 'Create flow' }).click();
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.getByRole('button', { name: 'Create urgent rule' }).click();
    await page.getByTestId('button-callcommand-place-test-call').click();
    await expect(page.locator('#callcommand-calls')).toContainText('urgent', { timeout: 20_000 });
    await expect(page.locator('#callcommand-work')).toContainText(/Urgent caller response|Urgent response/);
    for (const route of ['/channels','/receptionist-profiles','/flows','/automation-rules','/switchboard','/setup/telephony','/integrations','/transfer-targets','/simulate/live-call','/calls','/tickets','/leads','/tasks','/billing','/settings']) {
      await page.goto(`${WEB}/modules/callcommand-ai${route}`, { waitUntil: 'networkidle' });
      await expect(page.getByTestId('shell-callcommand-ai')).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const unlabelled = await page.locator('input,select,textarea').evaluateAll(controls => controls.flatMap(control => {
      const node = control as HTMLElement; const box = node.getBoundingClientRect();
      return box.width && box.height && !node.closest('label') && !node.getAttribute('aria-label') ? [node.outerHTML.slice(0,100)] : [];
    }));
    expect(unlabelled).toEqual([]);
  });
});
