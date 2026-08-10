import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { establishParitySession } from './parity-auth';

const WEB = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000';
const contracts = JSON.parse(readFileSync(resolve(process.cwd(), '../../docs/parity/visual-contracts.json'), 'utf8'));

test('every module critical route has live controls and no page, console, network, placeholder, or HTTP failure', async ({ page }) => {
  test.setTimeout(240_000);
  await establishParitySession(page.request);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', response => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });

  for (const contract of contracts.modules) {
    const response = await page.goto(`${WEB}${contract.criticalRoute}`, { waitUntil: 'networkidle' });
    expect(response?.status(), contract.moduleSlug).toBeLessThan(400);
    await expect(page.locator('body')).toContainText(contract.moduleName);
    await expect(page.locator('body')).not.toContainText(/404|500|something went wrong|migration pending|coming soon|not implemented/i);
    const controls = await page.locator('a,button,input,select,textarea,[role="button"],[role="link"]').evaluateAll(elements => elements.map(element => {
      const html = element as HTMLElement;
      const anchor = element as HTMLAnchorElement;
      const style = getComputedStyle(html);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && html.getBoundingClientRect().width > 0 && html.getBoundingClientRect().height > 0;
      const name = html.getAttribute('aria-label') || html.getAttribute('title') || html.textContent?.trim() || (element as HTMLInputElement).placeholder || '';
      return { tag: element.tagName, visible, name, href: anchor.href || null, disabled: (element as HTMLButtonElement).disabled || false };
    }));
    const visibleControls = controls.filter(control => control.visible && !control.disabled);
    expect(visibleControls.length, `${contract.moduleSlug} must expose a visible control`).toBeGreaterThan(0);
    expect(visibleControls.filter(control => !control.name), `${contract.moduleSlug} controls need accessible names`).toEqual([]);
    expect(visibleControls.filter(control => control.tag === 'A' && (!control.href || /#$|javascript:/i.test(control.href))), `${contract.moduleSlug} anchors need valid targets`).toEqual([]);
  }
  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(pageErrors, 'browser page errors').toEqual([]);
  expect(failedRequests, 'failed browser network requests').toEqual([]);
  expect(failedResponses, 'HTTP 4xx/5xx browser responses').toEqual([]);
});
