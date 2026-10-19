import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

// Presentation regressions only. These mount the real components and SDK
// catalog but replace API/session/provider boundaries with synthetic fixtures.
// They do not establish authorization, settlement, persistence or live access.
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'package.json'));
const origin = 'http://localhost:55498';
const pages = ['BillingPage', 'TenantBillingPage'] as const;
type BillingView = typeof pages[number];
type ContractStatus = 'free' | 'active' | 'incomplete' | 'canceled' | 'checkout_failed';
const bundles = new Map<BillingView, string>();

test.beforeAll(async () => {
  const palette = readFileSync(resolve(root, 'src/components/SaasLayout.tsx'), 'utf8').match(/const colors = \{[\s\S]*?\n\};/)?.[0];
  if (!palette) throw new Error('Canonical colors unavailable');
  for (const view of pages) {
    const result = await build({
      stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import View from './src/components/pages/${view}'; createRoot(document.getElementById('root')).render(React.createElement(View));`, resolveDir: root, loader: 'tsx' },
      bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"test"' },
      alias: { '@': resolve(root, 'src'), '@operatoros/sdk': resolve(root, '../../packages/sdk/src/index.ts'), react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
      plugins: [{ name: 'private-billing-fixture', setup(plugin) {
        plugin.onResolve({ filter: /(?:^|[\\/])SaasLayout(?:\.tsx)?$/ }, () => ({ path: 'palette', namespace: 'palette' }));
        plugin.onLoad({ filter: /.*/, namespace: 'palette' }, () => ({ contents: `export ${palette}`, loader: 'js' }));
        plugin.onResolve({ filter: /(?:^@\/lib\/(?:auth|launch)$|(?:^|[\\/])TenantProvider(?:\.tsx)?$)/ }, args => ({ path: args.path, namespace: 'fixture' }));
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('/auth')
          ? 'export const billingApi=window.billingFixture.api; export const meApi={tenants:window.billingFixture.tenants};'
          : args.path.endsWith('/launch')
            ? 'export async function openExternalDocument(url){window.billingFixture.opened.push(url);}'
            : 'export const useTenant=()=>({activeRole:window.billingFixture.role,loading:false});', loader: 'js' }));
      } }],
    });
    bundles.set(view, result.outputFiles[0].text);
  }
});

async function mount(page: Page, view: BillingView, options: {
  status?: ContractStatus; role?: 'owner' | 'admin' | 'viewer'; stackFailure?: boolean; usageFailure?: boolean; nullStack?: boolean; legacy?: 'plan' | 'addon';
} = {}) {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket('**/*', () => {});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { externalRequests.push(url.origin); return route.abort(); }
    return route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#0b0f14;color:#f1f5f9"><div id="root"></div></body></html>' });
  });
  await page.goto(origin);
  await page.evaluate(options => {
    const status = options.status ?? 'active';
    const usage = Object.fromEntries(['workspaces', 'projects', 'tasks', 'teamMembers', 'aiActions'].map(key => [key, { used: 1, limit: 5, percentage: 20 }]));
    const fixture: any = {
      role: options.role ?? 'owner', stackFailure: options.stackFailure ?? false, usageFailure: options.usageFailure ?? false,
      stackReads: 0, usageReads: 0, writes: [], opened: [], portalFailure: false,
      stack: {
        tenantId: 'synthetic-tenant', seatLimit: status === 'incomplete' ? 1 : 6, entitlements: [], legacyContract: null, legacyAddonContracts: [],
        applicationSubscription: status === 'free' ? null : { status, coreProduct: 'tradeflowkit', includedCompanionKey: 'snapproofos', additionalModuleKeys: ['brandforgeos'], additionalSeats: 1, cancelAtPeriodEnd: false, currentPeriodEnd: '2026-11-19T12:00:00Z' },
      },
    };
    if (options.legacy) {
      fixture.stack.applicationSubscription = null;
      if (options.legacy === 'plan') fixture.stack.legacyContract = { grandfathered: true, planSlug: 'pro', planName: 'Grandfathered Pro', status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-11-19T12:00:00Z' };
      else fixture.stack.legacyAddonContracts = [{ moduleSlug: 'brandforgeos', status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-11-19T12:00:00Z' }];
    }
    if (options.nullStack) fixture.stack = null;
    fixture.tenants = async () => ({ current: 'synthetic-tenant', tenants: [{ id: 'synthetic-tenant', name: 'Synthetic organization', role: fixture.role }] });
    fixture.api = {
      getStack: async () => { fixture.stackReads++; if (fixture.stackFailure) throw { status: 503, error: 'Synthetic subscription read outage' }; return structuredClone(fixture.stack); },
      getUsage: async () => { fixture.usageReads++; if (fixture.usageFailure) throw { status: 503, error: 'Synthetic usage read outage' }; return { plan: { name: 'Workspace capacity' }, usage, features: {}, aiCallsThisMonth: 2 }; },
      getHistory: async () => ({ events: [] }), getMode: async () => ({ mode: 'stripe' }),
      createPortalSession: async () => { fixture.writes.push('portal'); if (fixture.portalFailure) throw new Error('Synthetic portal failure'); return { url: 'https://billing.example.invalid/synthetic' }; },
      changeFreeCompanion: async (moduleKey: string) => { fixture.writes.push(`companion:${moduleKey}`); fixture.stack.applicationSubscription.includedCompanionKey = moduleKey; return { ok: true }; },
    };
    (window as any).billingFixture = fixture;
  }, options);
  await page.addScriptTag({ content: bundles.get(view)! });
  return { errors, externalRequests };
}

const checkout = (page: Page) => page.getByRole('button', { name: 'Build Application Stack', exact: true }).or(page.getByRole('link', { name: 'Build Application Stack', exact: true }));
const resume = (page: Page) => page.getByRole('button', { name: 'Resume Secure Checkout', exact: true }).or(page.getByRole('link', { name: 'Resume Secure Checkout', exact: true }));
const portal = (page: Page, view: BillingView) => page.getByTestId(view === 'BillingPage' ? 'button-manage-stripe' : 'button-open-portal');

for (const view of pages) {
  test(`${view}: stack outage stays unavailable and retries to the real contract`, async ({ page }) => {
    const { errors, externalRequests } = await mount(page, view, { stackFailure: true });
    await expect(page.getByRole('alert').filter({ hasText: /billing.*could not be loaded/i })).toBeVisible();
    await expect(page.getByText(/Free OperatorOS account|Free account|No paid subscription/, { exact: true })).toHaveCount(0);
    await expect(checkout(page)).toHaveCount(0);
    await expect(resume(page)).toHaveCount(0);
    await expect(portal(page, view)).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).billingFixture.writes)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('unavailable.png'), fullPage: true });
    await page.getByRole('button', { name: 'Reload billing details', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /billing.*could not be loaded/i })).toBeVisible();
    await expect(checkout(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).billingFixture.stackReads)).toBe(2);
    await page.evaluate(() => { (window as any).billingFixture.stackFailure = false; });
    await page.getByRole('button', { name: 'Reload billing details', exact: true }).click();
    await expect(page.getByText('TradeFlowKit', { exact: true }).first()).toBeVisible();
    await expect(portal(page, view)).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('recovered.png'), fullPage: true });
    expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
  });

  test(`${view}: null stack response does not establish a free account`, async ({ page }) => {
    const { errors } = await mount(page, view, { nullStack: true });
    await expect(page.getByRole('alert').filter({ hasText: /billing.*could not be loaded/i })).toBeVisible();
    await expect(checkout(page)).toHaveCount(0);
    await expect(portal(page, view)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  for (const status of ['free', 'active', 'incomplete', 'canceled', 'checkout_failed'] as const) {
    test(`${view}: verified ${status} contract preserves owner controls`, async ({ page }) => {
      const { errors, externalRequests } = await mount(page, view, { status });
      await expect(page.getByTestId(view === 'BillingPage' ? 'billing-page' : 'tenant-billing-summary')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      if (status === 'free') {
        await expect(page.getByText(view === 'BillingPage' ? 'Free OperatorOS account' : 'Free account', { exact: true }).first()).toBeVisible();
        await expect(checkout(page).first()).toBeEnabled();
        if (view === 'TenantBillingPage') await expect(portal(page, view)).toBeDisabled();
        else await expect(portal(page, view)).toHaveCount(0);
      } else {
        await expect(page.getByText('TradeFlowKit', { exact: true }).first()).toBeVisible();
        await expect(portal(page, view)).toBeEnabled();
        if (status === 'active') {
          await expect(checkout(page)).toHaveCount(0);
          if (view === 'TenantBillingPage') await expect(page.getByRole('combobox', { name: /^Included/ })).toBeEnabled();
          else await expect(page.getByRole('button', { name: 'One flagship already active', exact: true })).toBeDisabled();
        } else if (status === 'incomplete') {
          await expect(resume(page).first()).toBeEnabled();
          await expect(page.getByText(/payment pending|Payment is pending/).first()).toBeVisible();
          if (view === 'TenantBillingPage') await expect(page.getByRole('combobox', { name: /^Included/ })).toBeDisabled();
        } else {
          await expect(checkout(page).first()).toBeEnabled();
          await expect(resume(page)).toHaveCount(0);
          if (view === 'TenantBillingPage') await expect(page.getByRole('combobox', { name: /^Included/ })).toHaveCount(0);
        }
      }
      expect(await page.evaluate(() => (window as any).billingFixture.writes)).toEqual([]);
      expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
    });
  }

  test(`${view}: verified active contract remains read-only for administrators`, async ({ page }) => {
    const { errors } = await mount(page, view, { role: 'admin' });
    await expect(portal(page, view)).toBeDisabled();
    if (view === 'TenantBillingPage') await expect(page.getByRole('combobox', { name: /^Included/ })).toBeDisabled();
    expect(await page.evaluate(() => (window as any).billingFixture.writes)).toEqual([]);
    expect(errors).toEqual([]);
  });

  for (const legacy of ['plan', 'addon'] as const) {
    test(`${view}: verified grandfathered ${legacy} remains visible and manageable`, async ({ page }) => {
      const { errors, externalRequests } = await mount(page, view, { legacy });
      await expect(page.getByText(legacy === 'plan' ? 'Grandfathered Pro' : 'Grandfathered individual add-on', { exact: true }).first()).toBeVisible();
      await expect(portal(page, view)).toBeEnabled();
      await expect(checkout(page).first()).toBeEnabled();
      await expect(page.getByRole('combobox', { name: /^Included/ })).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      if (view === 'TenantBillingPage' && legacy === 'addon') await expect(page.getByText('BrandForgeOS', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as any).billingFixture.writes)).toEqual([]);
      expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
    });
  }

  test(`${view}: provider portal rejection leaves the verified contract visible`, async ({ page }) => {
    const { errors } = await mount(page, view);
    await page.evaluate(() => { (window as any).billingFixture.portalFailure = true; });
    await portal(page, view).click();
    await expect(page.getByRole('alert')).toContainText(/could not open secure billing management/);
    await expect(page.getByText('TradeFlowKit', { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as any).billingFixture.opened)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('BillingPage: denied role reads no billing data or mutation controls', async ({ page }) => {
  await mount(page, 'BillingPage', { role: 'viewer' });
  await expect(page.getByRole('alert')).toContainText('Billing is limited to organization administrators');
  expect(await page.evaluate(() => (window as any).billingFixture.stackReads)).toBe(0);
  await expect(checkout(page)).toHaveCount(0);
});

test('TenantBillingPage: usage failure does not erase a verified subscription', async ({ page }) => {
  await mount(page, 'TenantBillingPage', { usageFailure: true });
  await expect(page.getByText('TradeFlowKit', { exact: true }).first()).toBeVisible();
  await expect(portal(page, 'TenantBillingPage')).toBeEnabled();
  await expect(checkout(page)).toHaveCount(0);
});

test('BillingPage: usage failure is unavailable and can be retried', async ({ page }) => {
  await mount(page, 'BillingPage', { usageFailure: true });
  await expect(page.getByRole('alert')).toContainText('Billing details could not be loaded');
  await expect(checkout(page)).toHaveCount(0);
  await page.evaluate(() => { (window as any).billingFixture.usageFailure = false; });
  await page.getByRole('button', { name: 'Reload billing details', exact: true }).click();
  await expect(portal(page, 'BillingPage')).toBeEnabled();
});

test('TenantBillingPage: failed refresh after companion change suppresses stale contract and retries', async ({ page }) => {
  const { errors } = await mount(page, 'TenantBillingPage');
  const select = page.getByRole('combobox', { name: /^Included/ });
  await expect(select).toBeEnabled();
  await page.evaluate(() => { (window as any).billingFixture.stackFailure = true; });
  await select.selectOption('studyforge-ai');
  await expect(page.getByRole('alert').filter({ hasText: /billing.*could not be loaded/i })).toBeVisible();
  await expect(page.getByTestId('tenant-billing-summary')).toHaveCount(0);
  await expect(checkout(page)).toHaveCount(0);
  await page.evaluate(() => { (window as any).billingFixture.stackFailure = false; });
  await page.getByRole('button', { name: 'Reload billing details', exact: true }).click();
  await expect(page.getByRole('combobox', { name: /^Included/ })).toHaveValue('studyforge-ai');
  expect(await page.evaluate(() => (window as any).billingFixture.writes)).toEqual(['companion:studyforge-ai']);
  expect(errors).toEqual([]);
});
