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
const oldCustomer = id(1), oldJob = id(201), oldQuote = id(301), oldInvoice = id(401);
type Row = Record<string, any>;
type Kind = 'customers' | 'jobs' | 'quotes' | 'invoices';
const emptyRelated = { customers: [], jobs: [], invoicedQuoteIds: [] };

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import Workspace from './src/components/module-shells/TradeFlowKitRevenueFlow';
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

function fixture() {
  const customers = Array.from({ length: 125 }, (_, index) => ({
    id: id(125 - index), name: index === 124 ? 'Historic customer' : `Recent customer ${125 - index}`, email: null,
    phone: null, address: null, notes: null, version: 1, deletedAt: null,
  }));
  const jobs = Array.from({ length: 125 }, (_, index) => ({
    id: id(325 - index), customerId: oldCustomer, title: index === 124 ? 'Historic job' : `Recent job ${125 - index}`,
    status: 'scheduled', version: 1, deletedAt: null,
  }));
  const document = { customerId: oldCustomer, jobId: oldJob, status: 'draft', lineItems: [{ description: 'Service', quantity: 1, unitPriceCents: 500 }], subtotalCents: 500, taxRateBps: 0, taxCents: 0, discountCents: 0, totalCents: 500, notes: null, expiresAt: null, version: 7 };
  const quotes = Array.from({ length: 125 }, (_, index) => ({ ...document, id: id(425 - index), number: 125 - index }));
  const invoices = Array.from({ length: 125 }, (_, index) => ({ ...document, id: id(525 - index), number: 125 - index, sourceQuoteId: null, dueDate: null, paidAt: null, paidCents: 0, balanceCents: 500, paymentMethod: null, paymentReference: null }));
  return { customers, jobs, quotes, invoices } as Record<Kind, Row[]>;
}

async function setup(page: Page, props: Record<string, unknown> = {}) {
  const rows = fixture();
  const calls: Array<{ kind: string; id: string; q: string; cursor: string; customerId: string; tenant: string }> = [];
  const mutations: Array<{ path: string; body: any }> = [];
  let fail = false;
  let hold: ((kind: string, recordId: string, q: string, tenant: string) => Promise<void>) | null = null;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:55498') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' });
    if (url.pathname === '/api/modules/tradeflowkit/payments/provider') return route.fulfill({ json: { configured: false, ready: false } });
    const match = url.pathname.match(/^\/api\/modules\/tradeflowkit\/revenue\/(customers|jobs|quotes|invoices)(?:\/([^/]+))?$/);
    if (!match) {
      if (route.request().method() !== 'GET') {
        mutations.push({ path: url.pathname, body: route.request().postDataJSON() });
        return route.fulfill({ json: {} });
      }
      return route.abort();
    }
    const kind = match[1] as Kind, recordId = match[2] ?? '', q = url.searchParams.get('q') ?? '';
    const tenant = route.request().headers()['x-tenant-id'];
    calls.push({ kind, id: recordId, q, cursor: url.searchParams.get('cursor') ?? '', customerId: url.searchParams.get('customerId') ?? '', tenant });
    if (hold) await hold(kind, recordId, q, tenant);
    if (fail) return route.fulfill({ status: 503, json: { error: 'Synthetic read failure' } }).catch(() => {});
    const related = kind === 'customers' ? emptyRelated : { customers: rows.customers.filter(row => row.id === oldCustomer), jobs: rows.jobs.filter(row => row.id === oldJob), invoicedQuoteIds: [oldQuote] };
    if (recordId) {
      const item = rows[kind].find(row => row.id === recordId && !row.deletedAt);
      return route.fulfill(item ? { json: { item, related } } : { status: 404, json: { error: 'Record not found' } }).catch(() => {});
    }
    const selected = rows[kind].filter(row => !row.deletedAt && (!url.searchParams.has('customerId') || row.customerId === url.searchParams.get('customerId')) &&
      (!q || `${row.name ?? row.title ?? row.number}`.toLowerCase().includes(q.toLowerCase())));
    const offset = Number(url.searchParams.get('cursor') ?? 0), limit = Number(url.searchParams.get('limit') ?? 25);
    return route.fulfill({ json: { items: selected.slice(offset, offset + limit), nextCursor: selected.length > offset + limit ? String(offset + limit) : null, related } }).catch(() => {});
  });
  await page.goto('http://localhost:55498/');
  await page.evaluate(props => {
    const w = window as any;
    w.user = { id: 'user-a', currentTenantId: 'tenant-a' };
    w.captureIdentity = (user: any) => () => w.user === user;
    w.props = { tenantKey: 'tenant-a', view: 'all', canWrite: true, canManage: true, ...props };
    localStorage.setItem('activeTenantId', 'tenant-a');
  }, props);
  await page.addScriptTag({ content: script });
  await page.addStyleTag({ content: styles });
  return { rows, calls, mutations, render: () => page.evaluate(() => (window as any).renderFixture()), setFail: (value: boolean) => { fail = value; }, setHold: (fn: typeof hold) => { hold = fn; } };
}

for (const [kind, recordId, name] of [['customers', oldCustomer, 'Historic customer'], ['quotes', oldQuote, 'Quote #1'], ['invoices', oldInvoice, 'Invoice #1']] as const) {
  test(`direct old ${kind} link fetches exact record with historical labels`, async ({ page }) => {
    const f = await setup(page, { view: kind, recordId, canWrite: false, canManage: false });
    await f.render();
    const singular = kind === 'customers' ? 'customer' : kind === 'quotes' ? 'quote' : 'invoice';
    await expect(page.getByTestId(`tradeflowkit-${singular}-${recordId}`)).toContainText(name);
    expect(f.calls.some(call => call.kind === kind && call.id === recordId)).toBe(true);
    expect(f.calls.some(call => call.kind === kind && !call.id)).toBe(false);
    if (kind !== 'customers') await expect(page.getByTestId(`tradeflowkit-${singular}-${recordId}`)).toContainText('Historic customer');
    await expect(page.getByTestId('tradeflowkit-document-create-form')).toHaveCount(0);
  });
}

test('deep customer stays pending without fallback, then selects exact older customer', async ({ page }) => {
  const f = await setup(page, { view: 'customers', recordId: oldCustomer });
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  f.setHold(async (kind, recordId) => { if (kind === 'customers' && recordId === oldCustomer) await barrier; });
  await f.render();
  await expect(page.getByText('Loading revenue records.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Job customer', { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByLabel('Job customer', { exact: true })).toHaveValue(oldCustomer);
  await expect(page.getByLabel('Document customer', { exact: true })).toHaveValue(oldCustomer);
});

test('customer and customer-filtered job selectors search beyond 100 and keep selections off-page', async ({ page }) => {
  const f = await setup(page);
  await f.render();
  await page.getByLabel('Find document customer', { exact: true }).fill('Historic');
  await expect(page.getByLabel('Document customer', { exact: true })).toBeEnabled();
  await page.getByLabel('Document customer', { exact: true }).selectOption(oldCustomer);
  await page.getByLabel('Find linked job', { exact: true }).fill('Historic');
  await expect(page.getByLabel('Linked job', { exact: true })).toBeEnabled();
  await page.getByLabel('Linked job', { exact: true }).selectOption(oldJob);
  await page.getByLabel('Find document customer', { exact: true }).fill('Recent');
  await expect(page.getByLabel('Document customer', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Document customer', { exact: true })).toHaveValue(oldCustomer);
  await expect(page.getByLabel('Linked job', { exact: true })).toHaveValue(oldJob);
  expect(f.calls.some(call => call.kind === 'jobs' && call.q === 'Historic' && call.customerId === oldCustomer)).toBe(true);
});

test('paged customer list reaches record 125 without accumulating prior pages and returns back', async ({ page }) => {
  const f = await setup(page, { canWrite: false, canManage: false });
  await f.render();
  const records = page.getByTestId('tradeflowkit-customer-records');
  for (let index = 0; index < 4; index++) {
    await expect(page.getByRole('button', { name: 'More customers', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'More customers', exact: true }).click();
  }
  await expect(records).toContainText('Historic customer');
  await expect(records.locator('article')).toHaveCount(25);
  await expect(records).not.toContainText('Recent customer 125');
  await page.getByRole('button', { name: 'Previous customers', exact: true }).click();
  await expect(records).not.toContainText('Historic customer');
});

test('list search finds old quote and detects an invoice outside latest invoice page', async ({ page }) => {
  const f = await setup(page);
  await f.render();
  await page.getByLabel('Search quotes', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Search quotes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'More quotes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'More quotes', exact: true }).click();
  const quote = page.getByTestId(`tradeflowkit-quote-${oldQuote}`);
  await expect(quote).toContainText('Invoiced');
  await expect(quote.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0);
});

test('old document editor uses exact selected references and searchable new selections; keeps optimistic version', async ({ page }) => {
  const f = await setup(page, { view: 'invoices', recordId: oldInvoice });
  await f.render();
  await page.getByTestId(`tradeflowkit-invoice-${oldInvoice}`).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByTestId('tradeflowkit-invoice-editor');
  await expect(editor.getByLabel('Document customer', { exact: true })).toHaveValue(oldCustomer);
  await expect(editor.getByLabel('Document job', { exact: true })).toHaveValue(oldJob);
  await editor.getByLabel('Find document customer', { exact: true }).fill('Recent customer 125');
  await expect(editor.getByLabel('Document customer', { exact: true })).toBeEnabled();
  await editor.getByLabel('Document customer', { exact: true }).selectOption(id(125));
  await expect(editor.getByLabel('Document job', { exact: true })).toHaveValue('');
  await editor.getByRole('button', { name: 'Save invoice', exact: true }).click();
  await expect.poll(() => f.mutations.length).toBe(1);
  expect(f.mutations[0].body).toMatchObject({ expectedVersion: 7, customerId: id(125) });
});

test('unavailable deep link reports honestly with no recent-row substitute', async ({ page }) => {
  const f = await setup(page, { view: 'invoices', recordId: id(9999) });
  await f.render();
  await expect(page.getByRole('alert')).toContainText('unavailable in the current workspace');
  await expect(page.locator('[data-testid^="tradeflowkit-invoice-000"]')).toHaveCount(0);
  await expect(page.getByTestId('tradeflowkit-document-create-form')).toHaveCount(0);
});

test('load failure retries successfully without claiming empty records', async ({ page }) => {
  const f = await setup(page, { canWrite: false, canManage: false });
  f.setFail(true); await f.render();
  await expect(page.getByRole('alert')).toContainText('Synthetic read failure');
  await expect(page.getByText('No matching active customers.')).toHaveCount(0);
  f.setFail(false);
  await page.getByRole('button', { name: 'Retry revenue records' }).click();
  await expect(page.getByTestId('tradeflowkit-customer-records')).toContainText('Recent customer 125');
});

for (const change of ['record', 'view', 'tenant', 'account', 'logout'] as const) {
  test(`late exact response cannot overwrite a newer ${change}`, async ({ page }) => {
    const f = await setup(page, { view: 'invoices', recordId: oldInvoice, canWrite: false, canManage: false });
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    f.setHold(async (kind, recordId, _q, tenant) => { if (kind === 'invoices' && recordId === oldInvoice && tenant === 'tenant-a') await barrier; });
    await f.render();
    await expect.poll(() => f.calls.some(call => call.id === oldInvoice)).toBe(true);
    await page.evaluate(({ change, nextId }) => {
      const w = window as any;
      if (change === 'record') w.props.recordId = nextId;
      if (change === 'view') { w.props.view = 'customers'; w.props.recordId = undefined; }
      if (change === 'tenant') { w.props.tenantKey = 'tenant-b'; w.props.recordId = nextId; localStorage.setItem('activeTenantId', 'tenant-b'); }
      if (change === 'account') { w.user = { id: 'user-b', currentTenantId: 'tenant-a' }; w.props.recordId = nextId; }
      if (change === 'logout') { w.user = null; localStorage.removeItem('activeTenantId'); }
      w.renderFixture();
    }, { change, nextId: id(525) });
    release();
    if (change === 'logout') await expect(page.getByText('Waiting for the current account and workspace.')).toBeVisible();
    else if (change === 'view') await expect(page.getByTestId('tradeflowkit-customer-records')).toContainText('Recent customer 125');
    else await expect(page.getByTestId(`tradeflowkit-invoice-${id(525)}`)).toBeVisible();
    await expect(page.getByTestId(`tradeflowkit-invoice-${oldInvoice}`)).toHaveCount(0);
  });
}

test('older search response cannot replace newer picker results', async ({ page }) => {
  const f = await setup(page);
  await f.render();
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  f.setHold(async (kind, _id, q) => { if (kind === 'customers' && q === 'Historic') await barrier; });
  await page.getByLabel('Find document customer', { exact: true }).fill('Historic');
  await expect.poll(() => f.calls.some(call => call.q === 'Historic')).toBe(true);
  await page.getByLabel('Find document customer', { exact: true }).fill('Recent customer 125');
  await expect(page.getByLabel('Document customer', { exact: true })).toBeEnabled();
  release();
  await expect(page.getByLabel('Document customer', { exact: true }).locator('option')).toHaveText(['Select customer', 'Recent customer 125']);
});

test('picker pages reach older customers while keeping each response bounded', async ({ page }) => {
  const f = await setup(page);
  await f.render();
  for (let index = 0; index < 4; index++) {
    await expect(page.getByRole('button', { name: 'More document customer', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'More document customer', exact: true }).click();
  }
  const select = page.getByLabel('Document customer', { exact: true });
  await expect(select).toBeEnabled();
  await expect(select.locator('option')).toHaveCount(26);
  await select.selectOption(oldCustomer);
  await expect(select).toHaveValue(oldCustomer);
  expect(f.calls.some(call => call.kind === 'customers' && call.cursor === '100')).toBe(true);
});

test('picker read errors remain visible and retry without overwriting selection', async ({ page }) => {
  const f = await setup(page);
  await f.render();
  await expect(page.getByLabel('Document customer', { exact: true })).toBeEnabled();
  f.setFail(true);
  await page.getByLabel('Find document customer', { exact: true }).fill('Historic');
  await expect(page.getByText('Unable to load customers. Try again.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Document customer', { exact: true })).toBeDisabled();
  f.setFail(false);
  await page.getByRole('button', { name: 'Retry document customer', exact: true }).click();
  await expect(page.getByLabel('Document customer', { exact: true })).toBeEnabled();
  await page.getByLabel('Document customer', { exact: true }).selectOption(oldCustomer);
  await expect(page.getByLabel('Document customer', { exact: true })).toHaveValue(oldCustomer);
});

test('unavailable historical job is not silently cleared or accepted by the editor', async ({ page }) => {
  const f = await setup(page, { view: 'invoices', recordId: oldInvoice });
  f.rows.jobs = f.rows.jobs.filter(row => row.id !== oldJob);
  await f.render();
  await page.getByTestId(`tradeflowkit-invoice-${oldInvoice}`).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByTestId('tradeflowkit-invoice-editor');
  await expect(editor.getByRole('alert')).toContainText('selected record is unavailable');
  await expect(editor.getByLabel('Document job', { exact: true })).toHaveValue(oldJob);
  await expect(editor.getByRole('button', { name: 'Save invoice', exact: true })).toBeDisabled();
  await editor.getByLabel('Document job', { exact: true }).selectOption('');
  await expect(editor.getByRole('button', { name: 'Save invoice', exact: true })).toBeEnabled();
  expect(f.mutations).toHaveLength(0);
});

test('selecting a customer card clears a job from a different customer', async ({ page }) => {
  const f = await setup(page);
  await f.render();
  await page.getByLabel('Find document customer', { exact: true }).fill('Historic');
  await expect(page.getByLabel('Document customer', { exact: true })).toBeEnabled();
  await page.getByLabel('Document customer', { exact: true }).selectOption(oldCustomer);
  await page.getByLabel('Find linked job', { exact: true }).fill('Historic');
  await expect(page.getByLabel('Linked job', { exact: true })).toBeEnabled();
  await page.getByLabel('Linked job', { exact: true }).selectOption(oldJob);
  await page.getByTestId(`tradeflowkit-customer-${id(125)}`).getByText('Recent customer 125', { exact: true }).click();
  await expect(page.getByLabel('Document customer', { exact: true })).toHaveValue(id(125));
  await expect(page.getByLabel('Linked job', { exact: true })).toHaveValue('');
});

test('loss of write access hides an open document editor', async ({ page }) => {
  const f = await setup(page, { view: 'invoices', recordId: oldInvoice });
  await f.render();
  await page.getByTestId(`tradeflowkit-invoice-${oldInvoice}`).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByTestId('tradeflowkit-invoice-editor')).toBeVisible();
  await page.evaluate(() => { const w = window as any; w.props.canWrite = false; w.props.canManage = false; w.renderFixture(); });
  await expect(page.getByTestId('tradeflowkit-invoice-editor')).toHaveCount(0);
  await expect(page.getByTestId('tradeflowkit-revenue-readonly')).toBeVisible();
  expect(f.mutations).toHaveLength(0);
});

test('invoice page changes clear batch-payment selections without making payment requests', async ({ page }) => {
  const f = await setup(page);
  f.rows.invoices.forEach(row => { row.status = 'sent'; });
  await f.render();
  await page.getByLabel('Select invoice 125 for batch payment', { exact: true }).check();
  await expect(page.getByText('1 payable invoices selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More invoices', exact: true }).click();
  await expect(page.getByText('0 payable invoices selected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record selected balances', exact: true })).toBeDisabled();
  expect(f.mutations).toHaveLength(0);
});

test('archived relationship labels remain visible in the editor without becoming active choices', async ({ page }) => {
  const f = await setup(page, { view: 'invoices', recordId: oldInvoice });
  f.rows.customers.find(row => row.id === oldCustomer)!.deletedAt = '2026-11-01T00:00:00.000Z';
  f.rows.jobs.find(row => row.id === oldJob)!.deletedAt = '2026-11-01T00:00:00.000Z';
  await f.render();
  await page.getByTestId(`tradeflowkit-invoice-${oldInvoice}`).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByTestId('tradeflowkit-invoice-editor');
  await expect(editor.getByRole('alert')).toHaveCount(2);
  await expect(editor.getByLabel('Document customer', { exact: true }).locator('option:checked')).toHaveText('Historic customer');
  await expect(editor.getByLabel('Document job', { exact: true }).locator('option:checked')).toHaveText('Historic job');
  await expect(editor.getByLabel('Document customer', { exact: true }).locator('option:checked')).toBeDisabled();
  await expect(editor.getByLabel('Document job', { exact: true }).locator('option:checked')).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Save invoice', exact: true })).toBeDisabled();
  expect(f.mutations).toHaveLength(0);
});

test('chosen customer survives a mutation reload on another customer detail route', async ({ page }) => {
  const f = await setup(page, { view: 'customers', recordId: oldCustomer });
  await page.route('**/api/modules/tradeflowkit/jobs', route => route.fulfill({ json: { id: id(325) } }));
  f.rows.jobs[0].customerId = id(125);
  await f.render();
  await expect(page.getByLabel('Document customer', { exact: true })).toBeEnabled();
  await page.getByLabel('Document customer', { exact: true }).selectOption(id(125));
  await page.getByLabel('Job title', { exact: true }).fill('New job');
  await page.getByRole('button', { name: 'Add job', exact: true }).click();
  await expect(page.getByLabel('Linked job', { exact: true })).toHaveValue(id(325));
  await expect(page.getByLabel('Document customer', { exact: true })).toHaveValue(id(125));
});

for (const action of ['provider', 'payment-link'] as const) {
  test(`pending ${action} redirect cannot navigate after an account switch`, async ({ page }) => {
    const f = await setup(page, { view: 'invoices', recordId: oldInvoice });
    f.rows.invoices.find(row => row.id === oldInvoice)!.status = 'sent';
    await page.route('**/api/modules/tradeflowkit/payments/provider', route => route.fulfill({ json: { configured: true, ready: false } }));
    let release!: () => void, issued = false, redirects = 0;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    await page.route(action === 'provider' ? '**/api/modules/tradeflowkit/payments/connect/authorize' : '**/api/modules/tradeflowkit/invoices/*/payment-link', async route => {
      issued = true; await barrier;
      await route.fulfill({ json: action === 'provider' ? { authorizeUrl: 'https://connect.stripe.com/synthetic' } : { checkoutUrl: 'https://checkout.stripe.test/synthetic' } }).catch(() => {});
    });
    await page.route(/^https:\/\/(?:connect\.stripe\.com|checkout\.stripe\.test)\//, route => { redirects++; return route.abort(); });
    await f.render();
    await page.getByRole('button', { name: action === 'provider' ? 'Connect Stripe' : 'Stripe payment link', exact: true }).click();
    await expect.poll(() => issued).toBe(true);
    await page.evaluate(() => { const w = window as any; w.user = { id: 'user-b', currentTenantId: 'tenant-a' }; w.renderFixture(); });
    release();
    await expect(page.getByTestId(`tradeflowkit-invoice-${oldInvoice}`)).toBeVisible();
    // Let the fulfilled promise and any navigation handlers drain.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(redirects).toBe(0);
    expect(page.url()).toBe('http://localhost:55498/');
  });
}
