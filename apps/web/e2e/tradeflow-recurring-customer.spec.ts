import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// Actual component and HTTP client. All network requests are synthetic/intercepted.
// No API server, database, credentials or payment provider is started.
const web = process.env.OPERATOROS_TEST_SOURCE_ROOT ? resolve(process.env.OPERATOROS_TEST_SOURCE_ROOT, 'apps/web') : resolve(import.meta.dirname, '..');
const assets = process.env.OPERATOROS_TEST_ASSET_ROOT ? resolve(process.env.OPERATOROS_TEST_ASSET_ROOT, 'apps/web') : web;
const require = createRequire(resolve(assets, 'package.json'));
const { build } = require('esbuild') as typeof import('esbuild');
let script: string;
let styles: string;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const oldCustomer = id(1);
type Row = Record<string, any>;
const emptyRelated = { customers: [], jobs: [], invoicedQuoteIds: [] };

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import Workspace from './src/components/module-shells/TradeFlowKitWorkManagement';
      window.root = createRoot(document.getElementById('root'));
      window.renderFixture = () => window.root.render(React.createElement(Workspace, window.props));
    ` },
    bundle: true, write: false, outfile: resolve(web, 'fixture.js'), platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    nodePaths: [resolve(assets, 'node_modules'), resolve(assets, '../../node_modules')],
    alias: { '@': resolve(web, 'src'), react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'identity-and-directory-boundary', setup(plugin) {
      plugin.onResolve({ filter: /^@\/components\/AuthProvider$|^\.\/SharedCustomerPicker$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
        args.path.endsWith('AuthProvider') ? `export const useAuth=()=>({user:window.user,loading:false,captureIdentity:window.captureIdentity});`
          : 'export default function Fixture(){return null;}',
      }));
    } }],
  });
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  styles = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
});

async function setup(page: Page, props: Record<string, unknown> = {}) {
  const customers: Row[] = Array.from({ length: 125 }, (_, index) => ({
    id: id(125 - index), name: index === 124 ? 'Historic customer' : `Recent customer ${125 - index}`,
    email: null, phone: null, address: null, notes: null, version: 1, deletedAt: null,
  }));
  const calls: Array<{ path: string; q: string; limit: string; tenant: string; recordId: string }> = [];
  const mutations: Array<{ path: string; body: any }> = [];
  let fail = false;
  let hold: ((recordId: string, tenant: string) => Promise<void>) | null = null;
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== 'http://localhost:55498') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' });
    const path = url.pathname.replace('/api/modules/tradeflowkit/', '');
    if (request.method() !== 'GET') {
      mutations.push({ path, body: request.postDataJSON() });
      return path === 'recurring-jobs' ? route.fulfill({ json: {} }) : route.abort();
    }
    const recordId = path.match(/^revenue\/customers\/([^/]+)$/)?.[1] ?? '';
    const tenant = request.headers()['x-tenant-id'];
    calls.push({ path, q: url.searchParams.get('q') ?? '', limit: url.searchParams.get('limit') ?? '', tenant, recordId });
    if (path === 'workflows') return route.fulfill({ json: [] });
    if (path === 'tasks' || path === 'activity') return route.fulfill({ json: { items: [] } });
    if (path === 'operations') return route.fulfill({ json: { jobs: [] } });
    if (path === 'recurring-jobs') return route.fulfill({ json: { schedules: [] } });
    if (!path.startsWith('revenue/customers')) return route.abort();
    if (hold) await hold(recordId, tenant);
    if (fail) return route.fulfill({ status: 503, json: { error: 'Synthetic read failure' } }).catch(() => {});
    if (recordId) {
      const item = customers.find(row => row.id === recordId && !row.deletedAt);
      return route.fulfill(item ? { json: { item, related: emptyRelated } } : { status: 404, json: { error: 'Unavailable' } }).catch(() => {});
    }
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const rows = customers.filter(row => !row.deletedAt && row.name.toLowerCase().includes(q));
    const offset = Number(url.searchParams.get('cursor') ?? 0), limit = Number(url.searchParams.get('limit') ?? 25);
    return route.fulfill({ json: { items: rows.slice(offset, offset + limit), nextCursor: rows.length > offset + limit ? String(offset + limit) : null, related: emptyRelated } }).catch(() => {});
  });
  await page.goto('http://localhost:55498/');
  await page.evaluate(props => {
    const w = window as any;
    w.user = { id: 'user-a', currentTenantId: 'tenant-a' };
    w.captureIdentity = (user: any) => () => w.user === user;
    w.props = { tenantKey: 'tenant-a', view: 'recurring', canWrite: true, canManage: false, ...props };
    localStorage.setItem('activeTenantId', 'tenant-a');
  }, props);
  await page.addScriptTag({ content: script });
  if (styles) await page.addStyleTag({ content: styles });
  return { customers, calls, mutations, render: () => page.evaluate(() => (window as any).renderFixture()), setFail: (value: boolean) => { fail = value; }, setHold: (fn: typeof hold) => { hold = fn; } };
}

async function chooseOldCustomer(page: Page) {
  await page.getByLabel('Find customer', { exact: true }).fill('Historic');
  await expect(page.getByLabel('Customer', { exact: true }).locator('option', { hasText: 'Historic customer' })).toHaveCount(1);
  await expect(page.getByLabel('Customer', { exact: true })).toBeEnabled();
  await page.getByLabel('Customer', { exact: true }).selectOption(oldCustomer);
}

test('recurring schedule finds customer beyond 100, retains it after refresh, and preserves payload', async ({ page }) => {
  const f = await setup(page); await f.render();
  await chooseOldCustomer(page);
  await expect(page.getByRole('button', { name: 'Save recurring job' })).toBeEnabled();
  await page.getByLabel('Find customer', { exact: true }).fill('Recent');
  await expect(page.getByLabel('Customer', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Customer', { exact: true })).toHaveValue(oldCustomer);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByLabel('Customer', { exact: true })).toHaveValue(oldCustomer);
  await expect(page.getByRole('button', { name: 'Save recurring job' })).toBeEnabled();
  await page.getByLabel('Schedule name', { exact: true }).fill('Legacy service');
  await page.getByLabel('Job title', { exact: true }).fill('Maintenance');
  await page.getByLabel('Description', { exact: true }).last().fill('Annual equipment check');
  await page.getByTestId('tradeflowkit-recurring-job-form').getByRole('combobox', { name: 'Priority', exact: true }).selectOption('high');
  await page.getByTestId('tradeflowkit-recurring-job-form').getByRole('spinbutton', { name: 'Repeat every Days, from 1 to 30', exact: true }).fill('14');
  await page.getByTestId('tradeflowkit-recurring-job-form').getByRole('spinbutton', { name: 'Estimated duration Minutes', exact: true }).fill('90');
  await page.getByLabel('First run').fill('2027-01-02T12:30');
  const nextRunAt = await page.evaluate(() => new Date('2027-01-02T12:30').toISOString());
  await page.getByRole('button', { name: 'Save recurring job' }).click();
  await expect.poll(() => f.mutations.length).toBe(1);
  expect(f.mutations[0]).toEqual({ path: 'recurring-jobs', body: {
    name: 'Legacy service', customerId: oldCustomer, title: 'Maintenance', description: 'Annual equipment check',
    priority: 'high', intervalDays: 14, durationMinutes: 90, nextRunAt,
  } });
  expect(f.calls.some(call => call.path === 'revenue')).toBe(false);
  expect(f.calls.filter(call => call.path === 'revenue/customers').every(call => call.limit === '25')).toBe(true);
  expect(f.calls.some(call => call.path === 'operations' && call.limit === '100')).toBe(true);
});

test('recurring picker paginates beyond 100 without accumulating previous pages', async ({ page }) => {
  const f = await setup(page); await f.render();
  for (let index = 0; index < 4; index++) {
    await expect(page.getByRole('button', { name: 'More customer', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'More customer', exact: true }).click();
  }
  const picker = page.getByLabel('Customer', { exact: true });
  await expect(picker.locator('option', { hasText: 'Historic customer' })).toHaveCount(1);
  await expect(picker.locator('option')).toHaveCount(26);
  await expect(picker.locator('option', { hasText: 'Recent customer 125' })).toHaveCount(0);
  await picker.selectOption(oldCustomer);
  await expect(page.getByRole('button', { name: 'Save recurring job' })).toBeEnabled();
});

test('recurring picker failure retries without claiming no customers', async ({ page }) => {
  const f = await setup(page); f.setFail(true); await f.render();
  await expect(page.getByRole('alert')).toContainText('Unable to load customers');
  await expect(page.getByRole('button', { name: 'Save recurring job' })).toBeDisabled();
  await expect(page.getByText('No matching customers.')).toHaveCount(0);
  f.setFail(false); await page.getByRole('button', { name: 'Retry customer' }).click();
  await chooseOldCustomer(page);
  await expect(page.getByRole('button', { name: 'Save recurring job' })).toBeEnabled();
});

test('recurring save waits for exact selected customer validation and rejects archived customer', async ({ page }) => {
  const f = await setup(page);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  f.setHold(async recordId => { if (recordId) await barrier; });
  await f.render(); await chooseOldCustomer(page);
  await expect(page.getByText('Checking selected customer.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save recurring job' })).toBeDisabled();
  f.customers.find(row => row.id === oldCustomer)!.deletedAt = '2026-11-09T00:00:00Z';
  release();
  await expect(page.getByRole('alert')).toContainText('selected record is unavailable');
  await expect(page.getByRole('button', { name: 'Save recurring job' })).toBeDisabled();
  expect(f.mutations).toHaveLength(0);
});

for (const change of ['account', 'tenant', 'logout'] as const) {
  test(`recurring picker discards pending selection after ${change}`, async ({ page }) => {
    const f = await setup(page);
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    f.setHold(async (recordId, tenant) => { if (recordId && tenant === 'tenant-a') await barrier; });
    await f.render(); await chooseOldCustomer(page);
    await expect.poll(() => f.calls.some(call => call.recordId === oldCustomer)).toBe(true);
    await page.evaluate(change => {
      const w = window as any;
      if (change === 'tenant') { w.props.tenantKey = 'tenant-b'; localStorage.setItem('activeTenantId', 'tenant-b'); }
      if (change === 'account') w.user = { id: 'user-b', currentTenantId: 'tenant-a' };
      if (change === 'logout') w.user = null;
      w.renderFixture();
    }, change);
    release();
    if (change === 'logout') {
      await expect(page.getByText('Waiting for the current account and workspace.')).toBeVisible();
      await expect(page.getByTestId('tradeflowkit-recurring-job-form')).toHaveCount(0);
    } else {
      await expect(page.getByLabel('Customer', { exact: true })).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Save recurring job' })).toBeDisabled();
    }
    expect(f.mutations).toHaveLength(0);
  });
}

test('read-only recurring view does not expose customer picker or schedule creation', async ({ page }) => {
  const f = await setup(page, { canWrite: false }); await f.render();
  await expect(page.getByText('No recurring work is scheduled.')).toBeVisible();
  await expect(page.getByTestId('tradeflowkit-recurring-job-form')).toHaveCount(0);
  expect(f.calls.some(call => call.path.startsWith('revenue'))).toBe(false);
  expect(f.mutations).toHaveLength(0);
});
