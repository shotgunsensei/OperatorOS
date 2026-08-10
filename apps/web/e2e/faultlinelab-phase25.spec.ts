import { expect, test, type Page } from '@playwright/test';
import { establishParitySession } from './parity-auth';

const WEB = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function completeFirstCaseInCategory(page: Page, category: string) {
  await page.goto(`${WEB}/modules/faultlinelab/challenges`, { waitUntil: 'networkidle' });
  const categorySelect = page.getByLabel('Category');
  await categorySelect.selectOption(category);
  const card = page.getByTestId('faultlinelab-challenge-card').first();
  await expect(card, `${category} must expose a playable card`).toBeVisible();
  const challengeId = await card.getAttribute('data-challenge-id');
  expect(challengeId, `${category} card must expose its persisted challenge id`).toBeTruthy();

  const authored = await page.request.get(`${API}/v1/modules/faultlinelab/authoring/challenges/${challengeId}`);
  expect(authored.ok(), `${category} authoring projection: ${authored.status()} ${await authored.text()}`).toBeTruthy();
  const definition = await authored.json();
  const evidenceAction = definition.content.commands.find((item: any) => item.revealsEvidence.length > 0);
  expect(evidenceAction, `${category} case must have a compiler-validated evidence action`).toBeTruthy();

  await card.getByRole('button', { name: /^(Start|Retry)$/ }).click();
  await expect(page.getByTestId('faultlinelab-session')).toBeVisible();
  await page.getByPlaceholder(/diagnostic command/i).fill(evidenceAction.command);
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect(page.locator('input[name="evidence"]').first()).toBeVisible();
  await page.getByLabel('Working hypothesis').fill(definition.content.rootCause.description);
  await page.getByLabel('Root cause').selectOption(definition.content.rootCause.id);
  const evidenceChecks = page.locator('input[name="evidence"]');
  for (let index = 0; index < await evidenceChecks.count(); index += 1) {
    await evidenceChecks.nth(index).check();
  }
  await page.getByLabel('Remediation plan').fill(definition.content.remediation);
  await page.getByLabel('Proof note').fill(`Phase 25 ${category} browser completion`);
  await page.getByRole('button', { name: 'Submit for scoring' }).click();
  await expect(page.getByTestId('faultlinelab-server-score')).toContainText('Passed');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('faultlinelab-server-score')).toContainText('Passed');
}

test.describe('Phase 25 FaultlineLab full catalog browser contract', () => {
  test.setTimeout(900_000);

  for (const viewport of viewports) {
    test(`completes a persisted case from every compiler category at ${viewport.name} width`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await establishParitySession(page.request);
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

      const catalogResponse = await page.request.get(`${API}/v1/modules/faultlinelab/challenges`);
      expect(catalogResponse.ok(), await catalogResponse.text()).toBeTruthy();
      const catalog = await catalogResponse.json();
      const categories = Object.keys(catalog.facets.categories).sort();
      expect(categories.length).toBeGreaterThan(1);
      expect(catalog.facets.total).toBe(catalog.challenges.filter((item: any) => item.status === 'published').length);

      for (const category of categories) {
        await completeFirstCaseInCategory(page, category);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
          `${viewport.name}/${category} horizontal overflow`,
        ).toBeLessThanOrEqual(1);
      }

      await page.goto(`${WEB}/modules/faultlinelab/challenges`, { waitUntil: 'networkidle' });
      await page.getByLabel('Search cases').fill('vpn');
      await expect(page.getByTestId('faultlinelab-challenge-card').first()).toBeVisible();
      await page.getByLabel('Sort').selectOption('title');
      if (viewport.name === 'mobile') {
        const undersized = await page.locator('.fl-tabs button:visible').evaluateAll(buttons =>
          buttons.flatMap(button => {
            const rect = button.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44 ? [] : [`${button.textContent?.trim()}:${rect.width}x${rect.height}`];
          }),
        );
        expect(undersized, 'mobile tab touch targets').toEqual([]);
      }
      expect(consoleErrors, 'browser console errors').toEqual([]);
      expect(pageErrors, 'browser page errors').toEqual([]);
      expect(failedRequests, 'failed browser network requests').toEqual([]);
    });
  }
});
