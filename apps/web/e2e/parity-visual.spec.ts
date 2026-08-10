import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { establishParitySession } from './parity-auth';

const WEB = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000';
const contracts = JSON.parse(readFileSync(resolve(process.cwd(), '../../docs/parity/visual-contracts.json'), 'utf8'));

test('module-owned source-faithful visual contracts', async ({ page }) => {
  test.setTimeout(600_000);
  await establishParitySession(page.request);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

  for (const contract of contracts.modules) {
    for (const viewport of contract.viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(`${WEB}${contract.criticalRoute}`, { waitUntil: 'networkidle' });
      expect(response?.status(), `${contract.moduleSlug}/${viewport.name}`).toBeLessThan(400);
      await expect(page.locator('body')).toContainText(contract.moduleName);
      const audit = await page.evaluate(() => {
        const parse = (value: string) => {
          const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
          return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
        };
        const luminance = (rgb: number[]) => {
          const values = rgb.map(value => {
            const normalized = value / 255;
            return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
        };
        const contrast = (left: number[], right: number[]) => {
          const a = luminance(left);
          const b = luminance(right);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const contrastFailures: string[] = [];
        for (const element of Array.from(document.querySelectorAll('p,span,label,a,button,h1,h2,h3,h4')).slice(0, 500)) {
          const html = element as HTMLElement;
          if (!html.textContent?.trim() || html.getBoundingClientRect().width === 0) continue;
          const style = getComputedStyle(html);
          const foreground = parse(style.color);
          let parent: HTMLElement | null = html;
          let background: number[] | null = null;
          while (parent && !background) {
            const candidate = parse(getComputedStyle(parent).backgroundColor);
            if (candidate && getComputedStyle(parent).backgroundColor !== 'rgba(0, 0, 0, 0)') background = candidate;
            parent = parent.parentElement;
          }
          if (foreground && background && contrast(foreground, background) < 3) contrastFailures.push(html.textContent.trim().slice(0, 80));
        }
        const unnamedControls = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"]')).filter(element => {
          const html = element as HTMLElement;
          const style = getComputedStyle(html);
          if (style.display === 'none' || style.visibility === 'hidden' || html.getBoundingClientRect().width === 0) return false;
          return !(html.getAttribute('aria-label') || html.getAttribute('title') || html.textContent?.trim() || (element as HTMLInputElement).placeholder);
        }).length;
        return {
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          unnamedControls,
          contrastFailures,
        };
      });
      expect(audit.horizontalOverflow, `${contract.moduleSlug}/${viewport.name} horizontal overflow`).toBeLessThanOrEqual(1);
      expect(audit.unnamedControls, `${contract.moduleSlug}/${viewport.name} unnamed controls`).toBe(0);
      expect(audit.contrastFailures, `${contract.moduleSlug}/${viewport.name} contrast`).toEqual([]);
      await expect(page).toHaveScreenshot(`${contract.moduleSlug}-${viewport.name}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.005,
      });
    }
  }
  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'browser page errors').toEqual([]);
  expect(failedRequests, 'failed browser network requests').toEqual([]);
});
