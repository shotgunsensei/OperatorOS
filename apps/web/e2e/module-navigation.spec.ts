import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(process.env.OPERATOROS_TEST_SOURCE_ROOT ?? resolve(import.meta.dirname, '../../..'));
const assets = resolve(process.env.OPERATOROS_TEST_ASSET_ROOT ?? root);
const shellRoot = resolve(process.env.OPERATOROS_TEST_SHELL_ROOT ?? root);
const require = createRequire(resolve(assets, 'apps/web/package.json'));
const { build } = require('esbuild') as typeof import('esbuild');
let script: string;
let css: string;
const routeCss = readFileSync(resolve(root, 'apps/web/src/components/module-shells/TechDeckShell.tsx'), 'utf8')
  .match(/const techDeckRouteCss = `([\s\S]*?)`;/)?.[1];
if (!routeCss || routeCss.includes('${')) throw new Error('TechDeck route CSS must remain static');

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: resolve(root, 'apps/web'), loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import Shell from ${JSON.stringify(resolve(shellRoot, 'apps/web/src/components/module-application-shell/ModuleApplicationShell'))};
      import {TECHDECK_THEME,TECHDECK_NAVIGATION,resolveTechDeckRoute} from './src/components/module-shells/TechDeckRoute.contract';
      import {Grid2X2,ServerCog} from 'lucide-react';
      import {brandCssVariables} from './src/lib/brand';
      import './src/app/globals.css'; import '@fontsource-variable/inter/wght.css';
      document.body.style.margin='0';
      const theme=document.createElement('style');theme.textContent=':root{'+brandCssVariables+'}';document.head.append(theme);
      window.root=createRoot(document.getElementById('root'));
      window.renderFixture=()=>{
        const route=resolveTechDeckRoute(location.pathname);
        const navigation=TECHDECK_NAVIGATION.map(group=>({...group,items:group.items.filter(item=>!window.omitted.includes(item.id)).map(item=>({...item,
          ...(window.gated&&item.id==='settings'?{requiredCapability:'manage'}:{}),
          ...(window.gated&&item.id==='webhooks'?{status:'disabled'}:{})
        }))}));
        window.root.render(<React.StrictMode><Shell key={window.remount?location.pathname:'persistent'} moduleId={window.moduleId} moduleName="TechDeck" theme={TECHDECK_THEME}
          currentPath={location.pathname+location.search+location.hash} navigation={window.small?[{...navigation[0],items:navigation[0].items.slice(0,2)}]:navigation} access={{capabilities:new Set(window.allowed?['manage']:[])}}
          brand={<a className="techdeck-brand" href="/"><span><ServerCog size={21}/></span><strong>TechDeck</strong></a>}
          organization={{label:'Organization',value:'Synthetic workspace'}} accessContext={{label:'Access',value:'Synthetic reviewer'}}
          utilityActions={[{label:'My Apps',href:'/apps',icon:Grid2X2}]} page={{...route}} collapsibleNavigation
          pageHeaderTestId="route-heading" workflow={false}>
          <section aria-label="Fixture boundary"><h2>Navigation preview</h2><p>Synthetic workspace. No account, service records or API is connected.</p><button>Continue in workspace</button></section>
          <style>{${JSON.stringify(routeCss)}}</style>
        </Shell></React.StrictMode>);
      };
      window.navigate=(href)=>{history.pushState({},'',href);window.renderFixture();};
      window.addEventListener('popstate',window.renderFixture);
    ` },
    bundle: true, write: false, outfile: 'fixture.js', platform: 'browser', format: 'iife', jsx: 'automatic',
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    nodePaths: [resolve(assets, 'apps/web/node_modules'), resolve(assets, 'node_modules')],
    alias: { react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'local-router-only', setup(plugin) {
      plugin.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', contents: args.path === 'next/navigation'
        ? 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);'
        : `import React from 'react';export default function Link({href,onClick,...props}){return <a {...props} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();if(!window.interruptNavigation)window.navigate(href);}}}/>;}`
      }));
    } }],
  });
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text;
});

async function setup(page: Page, width = 390, gated = false) {
  await page.setViewportSize({ width, height: 844 });
  await page.route('**/*', route => route.request().url() === 'https://fixture.invalid/tickets'
    ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
  await page.goto('https://fixture.invalid/tickets');
  await page.evaluate(gated => { const w = window as any; w.gated = gated; w.allowed = false; w.omitted = []; w.errors = []; w.moduleId = 'techdeck'; window.addEventListener('error', event => w.errors.push(event.message)); }, gated);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.evaluate(() => (window as any).renderFixture());
  await expect(page.getByTestId('route-heading')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Open TechDeck navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'TechDeck navigation' })).toBeVisible();
}

const sectionFilter = (page: Page) => page.getByRole('searchbox', { name: 'Find a section' });
const sidebar = (page: Page) => page.getByTestId('techdeck-module-sidebar');

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as any).errors ?? [])).toEqual([]);
});

test('mobile current-route selection dismisses the drawer and focuses content', async ({ page }) => {
  await setup(page);
  await openMenu(page);
  await page.getByTestId('techdeck-sidebar-tickets').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('route-heading')).toBeFocused();
  await expect(page).toHaveURL('https://fixture.invalid/tickets');
});

test('mobile destination keeps route content focus after drawer close', async ({ page }) => {
  await setup(page);
  await openMenu(page);
  await page.getByTestId('techdeck-sidebar-assets').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('route-heading')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Configuration inventory', exact: true })).toBeVisible();
});

for (const suffix of ['/', '?view=mine', '#details']) test(`mobile equivalent current route ${suffix} dismisses without waiting on navigation`, async ({ page }) => {
  await setup(page);
  await page.evaluate(suffix => { const w = window as any; history.replaceState({}, '', '/tickets' + suffix); w.interruptNavigation = true; w.renderFixture(); }, suffix);
  await openMenu(page);
  await page.getByTestId('techdeck-sidebar-tickets').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('route-heading')).toBeFocused();
});

test('mobile remounted destination retains content focus after old dialog teardown', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { const w = window as any; w.remount = true; w.renderFixture(); });
  await openMenu(page);
  await page.getByTestId('techdeck-sidebar-assets').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('route-heading')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Configuration inventory', exact: true })).toBeVisible();
  await openMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open TechDeck navigation' })).toBeFocused();
});

for (const width of [390, 1440]) test(`section filter reveals a collapsed destination at ${width}`, async ({ page }) => {
  await setup(page, width);
  if (width < 760) await openMenu(page);
  await expect(page.getByTestId('techdeck-sidebar-resolution')).not.toBeVisible();
  await sectionFilter(page).fill('  RESOLUTION   intelligence ');
  await expect(page.getByTestId('techdeck-sidebar-resolution')).toBeVisible();
  await expect(sidebar(page).getByRole('status')).toHaveText('1 section matches.');
  await expect(sectionFilter(page)).toBeFocused();
  await expect(sidebar(page).locator('nav a')).toHaveCount(1);
  await sectionFilter(page).press('Tab');
  await expect(page.getByRole('button', { name: 'Clear section filter' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('techdeck-sidebar-resolution')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('https://fixture.invalid/resolution-intelligence');
  await expect(page.getByTestId('route-heading')).toBeFocused();
});

test('mobile Escape clears first, then dismisses and restores the trigger', async ({ page }) => {
  await setup(page);
  for (let cycle = 0; cycle < 3; cycle++) {
    await openMenu(page);
    await sectionFilter(page).fill('not a section');
    await expect(sidebar(page).getByRole('status')).toHaveText('0 sections match.');
    await expect(page.getByText('Try a section name or clear the filter to browse all sections.')).toBeVisible();
    await expect(sectionFilter(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(sectionFilter(page)).toHaveValue('');
    await expect(sectionFilter(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open TechDeck navigation' })).toBeFocused();
    await expect(page).toHaveURL('https://fixture.invalid/tickets');
  }
});

test('Escape from filtered destination returns to filter without closing', async ({ page }) => {
  await setup(page); await openMenu(page);
  await sectionFilter(page).fill('resolution');
  await page.getByTestId('techdeck-sidebar-resolution').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(sectionFilter(page)).toHaveValue('');
  await expect(sectionFilter(page)).toBeFocused();
});

for (const kind of ['close', 'outside']) test(`mobile ${kind} dismissal clears query and restores trigger`, async ({ page }) => {
  await setup(page); await openMenu(page);
  await sectionFilter(page).fill('evidence');
  if (kind === 'close') await page.getByRole('button', { name: 'Close menu' }).click();
  else await page.mouse.click(380, 700);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open TechDeck navigation' })).toBeFocused();
  await openMenu(page);
  await expect(sectionFilter(page)).toHaveValue('');
});

test('clear button restores filter focus and native disclosure browsing', async ({ page }) => {
  await setup(page, 1440);
  const disclosure = sidebar(page).locator('summary').filter({ hasText: 'Knowledge and evidence' });
  await disclosure.click();
  await expect(page.getByTestId('techdeck-sidebar-resolution')).toBeVisible();
  await sectionFilter(page).fill('nothing matches');
  await page.getByRole('button', { name: 'Clear section filter' }).click();
  await expect(sectionFilter(page)).toBeFocused();
  await expect(sidebar(page).locator('summary')).toHaveCount(2);
  await expect(sidebar(page).getByRole('status')).toHaveText('20 sections');
  await sectionFilter(page).fill('trust platform');
  await expect(sidebar(page).locator('nav a')).toHaveCount(8);
  await sectionFilter(page).press('Escape');
  await expect(sectionFilter(page)).toHaveValue('');
  await expect(sectionFilter(page)).toBeFocused();
});

test('current manifest, capability and disabled state remain authoritative while filtering', async ({ page }) => {
  await setup(page, 1440, true);
  await sectionFilter(page).fill('settings');
  await expect(page.getByTestId('techdeck-sidebar-settings')).toHaveAttribute('aria-disabled', 'true');
  await expect(sidebar(page).getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await page.evaluate(() => { const w = window as any; w.allowed = true; w.renderFixture(); });
  await expect(sidebar(page).getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings');
  await page.evaluate(() => { const w = window as any; w.allowed = false; w.renderFixture(); });
  await expect(sidebar(page).getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await sectionFilter(page).fill('webhooks');
  await expect(page.getByTestId('techdeck-sidebar-webhooks')).toHaveAttribute('aria-disabled', 'true');
  await expect(sidebar(page).locator('nav a')).toHaveCount(0);
  await page.evaluate(() => { const w = window as any; w.omitted = ['webhooks']; w.renderFixture(); });
  await expect(page.getByTestId('techdeck-sidebar-webhooks')).toHaveCount(0);
  await expect(sidebar(page).getByRole('status')).toHaveText('0 sections match.');
});

test('module changes and a compact manifest discard obsolete filtering', async ({ page }) => {
  await setup(page, 1440);
  await sectionFilter(page).fill('resolution');
  await page.evaluate(() => { const w = window as any; w.moduleId = 'other-module'; w.renderFixture(); });
  await expect(sectionFilter(page)).toHaveValue('');
  await sectionFilter(page).fill('resolution');
  await page.evaluate(() => { const w = window as any; w.small = true; w.renderFixture(); });
  await expect(sectionFilter(page)).toHaveCount(0);
  await expect(page.getByTestId('other-module-sidebar-tickets')).toBeVisible();
  await page.evaluate(() => { const w = window as any; w.small = false; w.renderFixture(); });
  await expect(sectionFilter(page)).toHaveValue('');
});

test('Back and Forward retain route focus without resurrecting a prior filter', async ({ page }) => {
  await setup(page, 1440);
  await sectionFilter(page).fill('resolution');
  await page.getByTestId('techdeck-sidebar-resolution').click();
  await expect(sectionFilter(page)).toHaveValue('');
  await page.goBack();
  await expect(page.getByTestId('route-heading')).toBeFocused();
  await expect(sectionFilter(page)).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Ticket queue', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Resolution Intelligence', exact: true })).toBeVisible();
  await expect(sectionFilter(page)).toHaveValue('');
});

test('interrupted route selection keeps drawer and filtered destination available', async ({ page }) => {
  await setup(page); await openMenu(page);
  await sectionFilter(page).fill('resolution');
  await page.evaluate(() => { (window as any).interruptNavigation = true; });
  await page.getByTestId('techdeck-sidebar-resolution').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(sectionFilter(page)).toHaveValue('resolution');
  await expect(page).toHaveURL('https://fixture.invalid/tickets');
  await page.evaluate(() => { (window as any).interruptNavigation = false; });
  await page.getByTestId('techdeck-sidebar-resolution').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('route-heading')).toBeFocused();
});

for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey', 'middle']) test(`modified ${modifier} current-route click does not dismiss drawer`, async ({ page }) => {
  await setup(page); await openMenu(page);
  const link = page.getByTestId('techdeck-sidebar-tickets');
  await link.focus();
  // Dispatch without a browser default/new window: exercise the real shell's
  // handler while keeping this synthetic fixture isolated from OS/browser tabs.
  await link.evaluate((element, modifier) => {
    window.addEventListener('click', event => event.preventDefault(), { once: true });
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: modifier === 'middle' ? 1 : 0, [modifier]: true }));
  }, modifier);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(link).toBeFocused();
  await expect(page).toHaveURL('https://fixture.invalid/tickets');
});

test('breakpoint change while open releases modal and focuses visible content', async ({ page }) => {
  await setup(page); await openMenu(page);
  await sectionFilter(page).fill('resolution');
  await page.setViewportSize({ width: 1440, height: 844 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('route-heading')).toBeFocused();
  await expect(sectionFilter(page)).toHaveValue('');
  await page.getByRole('button', { name: 'Continue in workspace' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await openMenu(page);
  await expect(sectionFilter(page)).toHaveValue('');
});

for (const width of [320, 390, 1440]) test(`navigation fits and remains scrollable at ${width}`, async ({ page }, testInfo) => {
  await setup(page, width);
  if (width < 760) await openMenu(page);
  await sectionFilter(page).fill('resolution');
  const sizes = await sidebar(page).evaluate(element => {
    const input = element.querySelector('input')!.getBoundingClientRect();
    const clear = element.querySelector('button[aria-label="Clear section filter"]')!.getBoundingClientRect();
    const rail = element.getBoundingClientRect();
    return { inputWidth: input.width, inputHeight: input.height, clearWidth: clear.width, clearHeight: clear.height, railWidth: rail.width, overflow: element.scrollWidth > element.clientWidth, documentWidth: document.documentElement.scrollWidth };
  });
  expect(sizes.inputWidth).toBeGreaterThanOrEqual(120);
  expect(sizes.inputHeight).toBeGreaterThanOrEqual(44);
  expect(sizes.clearWidth).toBeGreaterThanOrEqual(44);
  expect(sizes.clearHeight).toBeGreaterThanOrEqual(44);
  expect(sizes.overflow).toBe(false);
  expect(sizes.documentWidth).toBeLessThanOrEqual(width);
  await testInfo.attach('navigation-measurements', { body: JSON.stringify(sizes), contentType: 'application/json' });
  await page.screenshot({ path: process.env.OPERATOROS_TEST_EVIDENCE_ROOT ? resolve(process.env.OPERATOROS_TEST_EVIDENCE_ROOT, `filtered-navigation-${width}.png`) : testInfo.outputPath(`filtered-navigation-${width}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Clear section filter' }).click();
  for (const summary of await sidebar(page).locator('summary').all()) await summary.click();
  await page.getByTestId('techdeck-sidebar-settings').focus();
  await expect(page.getByTestId('techdeck-sidebar-settings')).toBeInViewport();
  expect(await sidebar(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});

test('composing Escape does not discard a query or dismiss the drawer', async ({ page }) => {
  await setup(page); await openMenu(page); await sectionFilter(page).fill('resolution');
  await sectionFilter(page).dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(sectionFilter(page)).toHaveValue('resolution');
});

for (const width of [390, 1440]) test(`filtered navigation accessibility scan at ${width}`, async ({ page }, testInfo) => {
  await setup(page, width); if (width < 760) await openMenu(page);
  await sectionFilter(page).fill('resolution');
  const AxeBuilder = require('@axe-core/playwright').default as typeof import('@axe-core/playwright').default;
  const result = await new AxeBuilder({ page }).include('[data-testid="techdeck-module-sidebar"]').analyze();
  await testInfo.attach('navigation-axe', { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
  expect(result.violations).toEqual([]);
});

test('mobile navigation has valid dialog semantics', async ({ page }, testInfo) => {
  await setup(page); await openMenu(page);
  const AxeBuilder = require('@axe-core/playwright').default as typeof import('@axe-core/playwright').default;
  const result = await new AxeBuilder({ page }).include('[data-testid="techdeck-module-sidebar"]').analyze();
  await testInfo.attach('navigation-axe', { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
  expect(result.violations).toEqual([]);
});

test('baseline and candidate shell images', async ({ page }, testInfo) => {
  for (const width of [390, 1440]) {
    await setup(page, width);
    if (width < 760) await openMenu(page);
    await page.screenshot({ path: process.env.OPERATOROS_TEST_EVIDENCE_ROOT
      ? resolve(process.env.OPERATOROS_TEST_EVIDENCE_ROOT, `${process.env.OPERATOROS_TEST_BASELINE ? 'before' : 'after'}-navigation-${width}.png`)
      : testInfo.outputPath(`navigation-${width}.png`), fullPage: true });
  }
});
