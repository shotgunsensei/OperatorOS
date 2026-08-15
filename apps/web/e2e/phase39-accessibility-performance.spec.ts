import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { establishParitySession } from './parity-auth';

const WEB = process.env.E2E_PRODUCTION_HOSTS === '1'
  ? 'https://127.0.0.1'
  : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000');
const repositoryRoot = resolve(process.cwd(), '../..');
const contracts = JSON.parse(readFileSync(resolve(repositoryRoot, 'docs/parity/visual-contracts.json'), 'utf8'));
const budgets = JSON.parse(readFileSync(resolve(repositoryRoot, 'config/production-budgets.json'), 'utf8'));

test('Phase 39 representative module surfaces meet WCAG 2.2 AA and browser budgets', async ({ page }) => {
  test.setTimeout(900_000);
  await establishParitySession(page.request);
  await page.addInitScript(() => {
    const state = { lcp: 0, cls: 0 };
    (window as typeof window & { __phase39Metrics?: typeof state }).__phase39Metrics = state;
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) state.lcp = Math.max(state.lcp, entry.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput) state.cls += Number(entry.value ?? 0);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Chromium in the release harness supports these observers. A missing
      // observer is recorded below as an unavailable metric, not fabricated.
    }
  });

  const results: Array<Record<string, unknown>> = [];
  const failures: string[] = [];
  const output = resolve(repositoryRoot, 'build/phase39/accessibility-performance.json');
  mkdirSync(resolve(repositoryRoot, 'build/phase39'), { recursive: true });
  const persist = () => writeFileSync(output, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    passed: failures.length === 0 && results.length === contracts.modules.length * 2,
    budgets: budgets.browser,
    failures,
    results,
  }, null, 2)}\n`);
  for (const contract of contracts.modules) {
    for (const viewport of contract.viewports.filter((entry: { name: string }) => entry.name !== 'tablet')) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(`${WEB}${contract.criticalRoute}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      const context = `${contract.moduleSlug}/${viewport.name}`;
      const status = response?.status() ?? 0;
      if (status >= 400 || status === 0) failures.push(`${context}: response status ${status}`);
      await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(1_000);
      const bodyText = await page.locator('body').innerText();
      if (!bodyText.includes(contract.moduleName)) failures.push(`${context}: module identity was not rendered`);

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const layout = await page.evaluate((minimumTouchTargetPixels) => {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('button,input,select,textarea,[role="button"],[role="menuitem"],[role="tab"]'));
        const undersized = controls.filter(control => {
          const style = getComputedStyle(control);
          const rect = control.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return false;
          const label = control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)
            ? (control.labels?.item(0) ?? null)
            : null;
          const targetRect = label?.getBoundingClientRect() ?? rect;
          return targetRect.width < minimumTouchTargetPixels || targetRect.height < minimumTouchTargetPixels;
        }).map(control => {
          const rect = control.getBoundingClientRect();
          return {
            element: control.tagName,
            type: control instanceof HTMLInputElement ? control.type : null,
            name: control.getAttribute('aria-label') || control.getAttribute('name') || control.textContent?.trim().slice(0, 60) || null,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          };
        });
        const metrics = (window as typeof window & { __phase39Metrics?: { lcp: number; cls: number } }).__phase39Metrics;
        const javascriptTransferBytes = performance.getEntriesByType('resource')
          .filter(entry => (entry as PerformanceResourceTiming).initiatorType === 'script')
          .reduce((total, entry) => total + Math.max(
            (entry as PerformanceResourceTiming).transferSize || 0,
            (entry as PerformanceResourceTiming).encodedBodySize || 0,
          ), 0);
        return {
          horizontalOverflowPixels: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
          undersized,
          lcpMs: metrics?.lcp ?? null,
          cls: metrics?.cls ?? null,
          javascriptTransferBytes,
        };
      }, budgets.browser.minimumTouchTargetPixels);

      if (axe.violations.length > 0) {
        failures.push(`${context}: axe ${axe.violations.map(violation => `${violation.id} (${violation.nodes.map(node => node.target.join(' ')).join(', ')})`).join('; ')}`);
      }
      if (layout.horizontalOverflowPixels > budgets.browser.horizontalOverflowPixels) {
        failures.push(`${context}: horizontal overflow ${layout.horizontalOverflowPixels}px`);
      }
      if (layout.undersized.length > 0) failures.push(`${context}: undersized targets ${JSON.stringify(layout.undersized)}`);
      if (typeof layout.lcpMs === 'number' && layout.lcpMs > 0) {
        if (layout.lcpMs > budgets.browser.largestContentfulPaintMs) failures.push(`${context}: LCP ${layout.lcpMs}ms`);
      }
      if ((layout.cls ?? 0) > budgets.browser.cumulativeLayoutShift) failures.push(`${context}: CLS ${layout.cls}`);
      if (layout.javascriptTransferBytes > budgets.browser.javascriptTransferBytes) {
        failures.push(`${context}: JavaScript transfer ${layout.javascriptTransferBytes} bytes`);
      }
      results.push({
        moduleSlug: contract.moduleSlug,
        viewport: viewport.name,
        status,
        axeViolations: axe.violations.length,
        ...layout,
      });
      persist();
    }
  }

  expect(results).toHaveLength(contracts.modules.length * 2);
  persist();
  expect(failures, 'Phase 39 accessibility and browser budget failures').toEqual([]);
});
