import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { establishParitySession } from './parity-auth';
import { HELP_GUIDES, MODULE_HELP_GUIDE_IDS } from '../src/lib/help';

// Axe creates temporary pages for each scan. Keep the explicit screenshots,
// per-route findings and failure traces without recording hundreds of videos.
test.use({ video: 'off' });

const WEB = process.env.E2E_PRODUCTION_HOSTS === '1' ? 'https://127.0.0.1' : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000');
const contracts = JSON.parse(readFileSync(resolve(process.cwd(), '../../docs/parity/visual-contracts.json'), 'utf8')) as { modules: Array<{ moduleSlug: string; moduleName: string; criticalRoute: string }> };
const artifacts = resolve(process.cwd(), '../../build/module-polish');

async function waitForModuleContent(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const visible = (element: Element) => element.getClientRects().length > 0;
    return ![...document.querySelectorAll('[aria-busy="true"], [data-testid="app-shell-loading"]')].some(visible)
      && !document.body.innerText.split('\n').some(line => /^(?:Loading|Preparing)\s+(?:your\s+)?[\w -]*(?:workspace|dashboard|operations|garage|data)\s*(?:\.{3}|…)?$/i.test(line.trim()));
  });
}

for (const module of contracts.modules) {
  test(`${module.moduleName}: clear guidance, keyboard controls, desktop, tablet and phone`, async ({ page }) => {
    test.setTimeout(150_000);
    mkdirSync(artifacts, { recursive: true });
    await establishParitySession(page.request);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const findings: unknown[] = [];
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 960 });
      const response = await page.goto(`${WEB}${module.criticalRoute}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);
      if (module.moduleSlug === 'outcall') {
        await expect(page.getByTestId('app-shell-not-accessible')).toBeVisible();
        await expect(page.getByTestId('module-page-guide')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'OutCall is not available yet' })).toBeVisible();
        await expect(page.getByTestId('app-shell-not-accessible')).toContainText('Organization administrators cannot enable it.');
      } else {
        const guide = page.getByTestId('module-page-guide');
        await expect(guide).toBeVisible();
        await expect(guide.locator('ol')).toBeHidden();
      }
      await waitForModuleContent(page);
      await page.screenshot({ path: resolve(artifacts, `${module.moduleSlug}-${width}.png`), fullPage: true });
      if (module.moduleSlug !== 'outcall') {
        const guide = page.getByTestId('module-page-guide');
        const summary = guide.locator('summary');
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(guide.locator('details')).toHaveAttribute('open', '');
        expect(await guide.locator('ol li').count()).toBeGreaterThanOrEqual(3);
        await expect(guide.getByRole('link', { name: 'Open full guide' })).toHaveAttribute('href', /\/help\?/);
      }
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const issues = axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
      findings.push({ width, issues: issues.map(issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (module.moduleSlug !== 'outcall') await page.getByTestId('module-page-guide').screenshot({ path: resolve(artifacts, `${module.moduleSlug}-${width}-help.png`) });
      expect.soft(overflow, `${module.moduleName} at ${width}px horizontal overflow`).toBeLessThanOrEqual(1);
      expect.soft(issues.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' ')).join(', ')}`), `${module.moduleName} at ${width}px accessibility`).toEqual([]);
      if (module.moduleSlug !== 'outcall') {
        await page.getByTestId('module-page-guide').locator('summary').click();
        await expect(page.getByTestId('module-page-guide').locator('details')).not.toHaveAttribute('open');
        if (width === 390) {
          const menu = page.getByRole('button', { name: `Open ${module.moduleName} navigation`, exact: true });
          if (await menu.isVisible()) {
            await menu.click();
            const dialog = page.getByRole('dialog');
            await expect(dialog).toBeVisible();
            await expect(dialog.getByRole('button', { name: 'Close menu' })).toBeFocused();
            await page.keyboard.press('Shift+Tab');
            expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
            await page.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);
            await expect(menu).toBeFocused();
          }
        }
      }
    }
    writeFileSync(resolve(artifacts, `${module.moduleSlug}-audit.json`), JSON.stringify({ module: module.moduleSlug, errors, findings }, null, 2));
    expect(errors).toEqual([]);
  });
}

test('a missing access decision cannot open a module', async ({ page }) => {
  await establishParitySession(page.request);
  await page.route('**/api/modules/tradeflowkit', route => route.fulfill({ json: { module: { slug: 'tradeflowkit', name: 'TradeFlowKit', status: 'live' }, module_access_level: 'manager' } }));
  await page.goto(`${WEB}/app/apps/tradeflowkit`);
  await expect(page.getByTestId('app-shell-not-accessible')).toBeVisible();
  await expect(page.getByTestId('module-page-guide')).toHaveCount(0);
  await page.unroute('**/api/modules/tradeflowkit');
  await page.route('**/api/modules/tradeflowkit', route => route.fulfill({ json: { module: { slug: 'tradeflowkit', name: 'TradeFlowKit', status: 'disabled' }, unlocked: false, cta: 'disabled', module_access_level: 'none' } }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'TradeFlowKit is currently disabled' })).toBeVisible();
  await expect(page.getByTestId('module-page-guide')).toHaveCount(0);
});

test('documented module sections open with page guidance or a clear access explanation', async ({ page }) => {
  test.setTimeout(900_000);
  await establishParitySession(page.request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  mkdirSync(artifacts, { recursive: true });
  const visits: Array<{ module: string; path: string; status: number | undefined; heading: string; guidance: boolean; state: string | null; issues: unknown[]; overflow: number; mobileOverflow: number }> = [];
  for (const guide of HELP_GUIDES.filter(item => MODULE_HELP_GUIDE_IDS.some(id => id === item.id) && item.id !== 'outcall')) {
    for (const section of guide.pages) {
      const response = await page.goto(`${WEB}/modules/${guide.id}${section.path === '/' ? '' : section.path}`, { waitUntil: 'domcontentloaded' });
      await waitForModuleContent(page);
      await expect(page.locator('h1').first()).toBeVisible();
      const guidance = await page.getByTestId('module-page-guide').isVisible();
      const statePanel = page.locator('[data-module-state]').first();
      const state = await statePanel.count() ? await statePanel.getAttribute('data-module-state') : null;
      const heading = await page.locator('h1').first().innerText();
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const issues = audit.violations.filter(item => item.impact === 'serious' || item.impact === 'critical').map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.setViewportSize({ width: 390, height: 960 });
      const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.setViewportSize({ width: 1440, height: 1000 });
      visits.push({ module: guide.id, path: section.path, status: response?.status(), heading, guidance, state, issues, overflow, mobileOverflow });
      writeFileSync(resolve(artifacts, 'documented-routes.json'), JSON.stringify(visits, null, 2));
      expect.soft(response?.status(), `${guide.id}${section.path}`).toBeLessThan(400);
      expect.soft(guidance || state === 'forbidden' || state === 'provider-disabled', `${guide.id}${section.path}: ${heading} (${state})`).toBe(true);
      expect.soft(issues, `${guide.id}${section.path}: accessibility`).toEqual([]);
      expect.soft(overflow, `${guide.id}${section.path}: horizontal overflow`).toBeLessThanOrEqual(1);
      expect.soft(mobileOverflow, `${guide.id}${section.path}: phone horizontal overflow`).toBeLessThanOrEqual(1);
    }
  }
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(resolve(artifacts, 'documented-routes.json'), JSON.stringify(visits, null, 2));
});
