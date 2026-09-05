import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { establishParitySession } from './parity-auth';

const WEB = process.env.E2E_PRODUCTION_HOSTS === '1'
  ? 'https://127.0.0.1'
  : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000');
const contracts = JSON.parse(readFileSync(resolve(process.cwd(), '../../docs/parity/visual-contracts.json'), 'utf8'));

test('module-owned source-faithful visual contracts', async ({ page }) => {
  test.setTimeout(600_000);
  await establishParitySession(page.request);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      const location = message.location();
      consoleErrors.push(`${message.text()}${location.url ? ` (${location.url}:${location.lineNumber})` : ''}`);
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    const detail = request.failure()?.errorText ?? '';
    if (!detail.includes('ERR_ABORTED')) failedRequests.push(`${request.method()} ${request.url()} ${detail}`);
  });

  const requestedModule = process.env.PARITY_MODULE_FILTER;
  const selectedContracts = requestedModule
    ? contracts.modules.filter((contract: { moduleSlug: string }) => contract.moduleSlug === requestedModule)
    : contracts.modules;
  expect(selectedContracts.length, `visual contract for ${requestedModule || 'all modules'}`).toBeGreaterThan(0);
  for (const contract of selectedContracts) {
    for (const viewport of contract.viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(`${WEB}${contract.criticalRoute}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      expect(response?.status(), `${contract.moduleSlug}/${viewport.name}`).toBeLessThan(400);
      await expect(page.locator('body')).toContainText(contract.moduleName);
      if (contract.moduleSlug === 'outcall') {
        await expect(
          page.locator('body'),
          'OutCall remains source-recovery locked and must fail closed',
        ).toContainText('OutCall is not available for this organization');
      } else {
        await expect(
          page.locator('body'),
          `${contract.moduleSlug}/${viewport.name} must render an entitled module workspace`,
        ).not.toContainText(/is not available for this organization/i);
      }
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        const productWorkspaceLoading = /(?:loading|preparing)\s+(?:your\s+)?[\w -]+(?:workspace|dashboard|operations|garage|data)(?:\.{3}|…)?/i;
        return !document.querySelector('[aria-busy="true"]') && !productWorkspaceLoading.test(text);
      }, undefined, { timeout: 45_000 });
      await page.waitForTimeout(750);
      const audit = await page.evaluate(() => {
        const unnamedControls = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"]')).filter(element => {
          const html = element as HTMLElement;
          const style = getComputedStyle(html);
          if (style.display === 'none' || style.visibility === 'hidden' || html.getBoundingClientRect().width === 0) return false;
          const explicitLabel = html.id ? document.querySelector(`label[for="${CSS.escape(html.id)}"]`) : null;
          return !(
            html.getAttribute('aria-label')
            || html.getAttribute('aria-labelledby')
            || html.getAttribute('title')
            || html.textContent?.trim()
            || (element as HTMLInputElement).placeholder
            || html.closest('label')
            || explicitLabel
          );
        }).length;
        return {
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          unnamedControls,
        };
      });
      expect(audit.horizontalOverflow, `${contract.moduleSlug}/${viewport.name} horizontal overflow`).toBeLessThanOrEqual(1);
      expect(audit.unnamedControls, `${contract.moduleSlug}/${viewport.name} unnamed controls`).toBe(0);
      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();
      expect(
        accessibility.violations.map(violation => `${violation.id}: ${violation.nodes.length}`),
        `${contract.moduleSlug}/${viewport.name} WCAG violations`,
      ).toEqual([]);
      await expect(page).toHaveScreenshot(`${contract.moduleSlug}-${viewport.name}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.005,
      });
      if (process.env.PHASE48_CAPTURE_TRADEFLOWKIT === '1' && contract.moduleSlug === 'tradeflowkit') {
        const evidenceRoot = resolve(process.cwd(), '../../docs/phase-48/screenshots');
        mkdirSync(evidenceRoot, { recursive: true });
        await page.screenshot({
          path: resolve(evidenceRoot, `tradeflowkit-after-${viewport.name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
      if (process.env.PHASE48_CAPTURE_TRADEFLOWKIT === '1' && contract.moduleSlug === 'tradeflowkit' && viewport.name === 'desktop') {
        await expect(page.getByTestId('tradeflowkit-sidebar-dashboard')).toHaveAttribute('aria-current', 'page');
        const leadsLink = page.getByTestId('tradeflowkit-sidebar-leads');
        await leadsLink.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('tradeflowkit-module-shell')).toHaveAttribute('data-tradeflowkit-screen', 'leads');
        await expect(page.getByRole('navigation', { name: 'TradeFlowKit breadcrumb' })).toContainText('Leads');
        await expect(page.locator('#tradeflowkit-overview')).toBeFocused();
        await page.reload();
        await expect(page.getByTestId('tradeflowkit-sidebar-leads')).toHaveAttribute('aria-current', 'page');
        await page.goBack();
        await expect(page.getByTestId('tradeflowkit-sidebar-dashboard')).toHaveAttribute('aria-current', 'page');
      }
    }
  }
  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'browser page errors').toEqual([]);
  expect(failedResponses, 'failed browser responses').toEqual([]);
  expect(failedRequests, 'failed browser network requests').toEqual([]);
});
