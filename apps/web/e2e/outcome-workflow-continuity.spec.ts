import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const root = resolve(process.env.OPERATOROS_TEST_SOURCE_ROOT ?? resolve(import.meta.dirname, '../../..'));
const assets = resolve(process.env.OPERATOROS_TEST_ASSET_ROOT ?? root);
const require = createRequire(resolve(assets, 'apps/web/package.json'));
const { build } = require('esbuild') as typeof import('esbuild');
let script: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: resolve(root, 'apps/web'), loader: 'tsx', contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import Action from './src/components/module-shells/OutcomeWorkflowAction';
      window.root = createRoot(document.getElementById('root'));
      window.renderFixture = () => window.root.render(window.hidden ? null : React.createElement(Action,window.props));
    ` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    nodePaths: [resolve(assets, 'apps/web/node_modules'), resolve(assets, 'node_modules')],
    alias: { react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'synthetic-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /^@\/|^next\/link$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', contents:
        args.path.endsWith('AuthProvider') ? 'export const useAuth=()=>({user:window.user,loading:false});'
        : args.path.endsWith('TenantProvider') ? 'export const useTenant=()=>({activeTenant:{id:window.tenant}});'
        : args.path === 'next/link' ? 'import React from "react"; export default props => <a {...props}/>;'
        : 'export const getActiveTenantId=()=>window.tenant; export const sharedPlatformApi={dataFabricWorkflowReadiness:(...args)=>window.api("ready",args),startDataFabricWorkflow:(...args)=>window.api("start",args),dataFabricRun:(...args)=>window.api("poll",args)};',
      }));
    } }],
  });
  script = result.outputFiles[0]!.text;
});

async function setup(page: Page) {
  await page.route('**/*', route => route.request().url() === 'https://fixture.invalid/'
    ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
  await page.goto('https://fixture.invalid/');
  await page.evaluate(() => {
    const w = window as any;
    w.user = { id: 'actor-a' }; w.tenant = 'tenant-a'; w.calls = []; w.pending = [];
    w.mode = {}; w.hidden = false;
    w.props = { workflowKey: 'tradeflowkit.job_to_snapproof', aggregateId: 'job-a', sourceVersion: 1,
      sourceDeepLink: '/modules/tradeflowkit/jobs/job-a', title: 'Create field proof', description: 'Prepare proof.',
      destinationLabel: 'SnapProofOS', confirmationText: 'Create a draft only.', previewItems: [{ label: 'Field job' }] };
    w.api = (kind: string, args: unknown[]) => {
      w.calls.push({ kind, args });
      if (w.mode[kind] === 'hold') return new Promise((resolve, reject) => w.pending.push({ kind, resolve, reject }));
      if (w.mode[kind] === 'deny') return Promise.reject({ status: 403 });
      if (w.mode[kind] === 'fail') return Promise.reject({ status: 503 });
      if (kind === 'ready') return Promise.resolve({ readiness: { available: w.mode.ready !== 'blocked', blocker: 'destination_unavailable' } });
      if (kind === 'start') return Promise.resolve({ run: { id: 'run-a' } });
      return Promise.resolve({ run: { id: 'run-a', status: 'completed', workflow_key: w.props.workflowKey, source_resource_id: w.props.aggregateId, source_module_slug: w.props.sourceModuleSlug, ...(w.runOverride ?? {}) }, links: w.links ?? [{ destination_deep_link: '/modules/snapproofos/jobs/proof-a' }] });
    };
  });
  await page.addScriptTag({ content: script });
  await page.evaluate(() => (window as any).renderFixture());
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: 'Review what will be created' }).click();
  await expect(page.getByRole('button', { name: 'Confirm and create' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm and create' }).click();
}
async function revisit(page: Page) {
  await page.evaluate(() => { const w = window as any; w.hidden = true; w.renderFixture(); });
  await expect(page.getByRole('heading')).toHaveCount(0);
  await page.evaluate(() => { const w = window as any; w.hidden = false; w.renderFixture(); });
}
async function count(page: Page, kind: string) {
  return page.evaluate(kind => (window as any).calls.filter((c: any) => c.kind === kind).length, kind);
}

test('confirmed creation and revisit reopen results using reads only', async ({ page }) => {
  await setup(page); await confirm(page);
  await expect(page.getByRole('link', { name: 'Open SnapProofOS' })).toHaveAttribute('href', '/modules/snapproofos/jobs/proof-a');
  await revisit(page); await page.getByRole('button', { name: 'Check status' }).click();
  await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  expect(await count(page, 'start')).toBe(1); expect(await count(page, 'poll')).toBe(2);
});
for (const change of ['actor', 'tenant', 'record', 'version', 'intent', 'action']) {
  test(`${change} changes reset results and never adopt the prior receipt`, async ({ page }) => {
    await setup(page); await confirm(page); await expect(page.getByText('Items created', { exact: true })).toBeVisible();
    await page.evaluate(change => {
      const w = window as any;
      if (change === 'actor') w.user = { id: 'actor-b' };
      if (change === 'tenant') w.tenant = 'tenant-b';
      if (change === 'record') { w.props.aggregateId = 'job-b'; w.props.sourceDeepLink = '/modules/tradeflowkit/jobs/job-b'; }
      if (change === 'version') w.props.sourceVersion = 2;
      if (change === 'intent') w.props.payload = { destinationType: 'different' };
      if (change === 'action') w.props.workflowKey = 'callcommand.analysis_to_tradeflowkit';
      w.renderFixture();
    }, change);
    await expect(page.getByRole('button', { name: 'Review what will be created' })).toBeEnabled();
    await expect(page.getByText('Items created', { exact: true })).toHaveCount(0);
    expect(await count(page, 'start')).toBe(1);
    expect(await count(page, 'poll')).toBe(1);
  });
}
for (const kind of ['start', 'poll', 'ready']) for (const outcome of ['resolve', 'reject']) {
  test(`stale ${kind} ${outcome} is ignored after account change`, async ({ page }) => {
    await setup(page);
    await page.evaluate(kind => { const w = window as any; w.mode[kind] = 'hold'; }, kind);
    if (kind === 'ready') await revisit(page); else await confirm(page);
    await expect.poll(() => page.evaluate(kind => (window as any).pending.some((p: any) => p.kind === kind), kind)).toBe(true);
    await page.evaluate(({ kind, outcome }) => {
      const w = window as any; w.user = { id: 'actor-b' }; w.mode[kind] = undefined; w.renderFixture();
      setTimeout(() => w.pending.filter((p: any) => p.kind === kind).forEach((p: any) => p[outcome](outcome === 'reject' ? { status: 403 } : { readiness: { available: true }, run: { id: 'old-run', status: 'completed' }, links: [{ destination_deep_link: '/modules/snapproofos/jobs/old-proof' }] })), 50);
    }, { kind, outcome });
    await expect(page.getByRole('button', { name: 'Review what will be created' })).toBeEnabled();
    await page.waitForTimeout(150);
    await expect(page.getByText('Items created', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
test('uncertain submit retains key across review and revisit', async ({ page }) => {
  await setup(page); await page.evaluate(() => { (window as any).mode.start = 'fail'; });
  await confirm(page); await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Review again' }).click(); await confirm(page); await expect(page.getByRole('alert')).toBeVisible();
  await revisit(page); await confirm(page); await expect(page.getByRole('alert')).toBeVisible();
  const keys = await page.evaluate(() => (window as any).calls.filter((c: any) => c.kind === 'start').map((c: any) => c.args[2].idempotencyKey));
  expect(keys).toHaveLength(3); expect(keys[0]).toBe(keys[1]); expect(keys[1]).toBe(keys[2]);
});
test('storage denial preserves in-instance retry key', async ({ page }) => {
  await setup(page); await page.evaluate(() => { Storage.prototype.setItem = () => { throw Error('denied'); }; (window as any).mode.start = 'fail'; });
  await confirm(page); await expect(page.getByText('This browser cannot save the workflow receipt.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Review again' }).click(); await confirm(page);
  const keys = await page.evaluate(() => (window as any).calls.filter((c: any) => c.kind === 'start').map((c: any) => c.args[2].idempotencyKey));
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});
test('access denial cannot start or recover a receipt', async ({ page }) => {
  await setup(page); await confirm(page); await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).mode.ready = 'blocked'; }); await revisit(page);
  await expect(page.getByRole('button', { name: 'Review what will be created' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Check status' })).toHaveCount(0);
  expect(await count(page, 'start')).toBe(1);
});
test('unsafe destination paths are not rendered', async ({ page }) => {
  await setup(page); await page.evaluate(() => { (window as any).links = ['//evil.test', '/\\evil.test', '/modules/x/jobs/%2e%2e', '/modules/x/jobs/id?redirect=https://evil.test', 'https://evil.test', '/modules/snapproofos/jobs/proof-a'].map(destination_deep_link => ({ destination_deep_link })); });
  await confirm(page); await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  await expect(page.locator('a')).toHaveCount(1);
});
test('repeated synchronous confirm clicks submit only once', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Review what will be created' }).click(); await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm and create' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText('Items created', { exact: true })).toBeVisible(); expect(await count(page, 'start')).toBe(1);
});
test('legacy unbound receipt is retained but never adopted', async ({ page }) => {
  await setup(page); await page.evaluate(() => sessionStorage.setItem('operatoros:outcome-handoff:tenant-a:tradeflowkit.job_to_snapproof:contract:job-a:1:default', JSON.stringify({ idempotencyKey: 'old', runId: 'old-run' })));
  await revisit(page); await expect(page.getByRole('button', { name: 'Review what will be created' })).toBeEnabled();
  expect(await count(page, 'poll')).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(1);
});


test('navigation reload recovers status without another POST', async ({ page }) => {
  await setup(page); await confirm(page); await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  await setup(page); // Real same-origin document navigation retains only sessionStorage.
  await page.getByRole('button', { name: 'Check status' }).click();
  await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  expect(await count(page, 'start')).toBe(0);
});
test('browser back and forward restore the matching record receipt', async ({ page }) => {
  await setup(page); await confirm(page); await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const w = window as any;
    history.replaceState({ record: 'job-a' }, '', '/');
    const select = (id: string) => { w.props.aggregateId = id; w.props.sourceDeepLink = '/modules/tradeflowkit/jobs/' + id; w.renderFixture(); };
    window.addEventListener('popstate', event => select(event.state.record));
    history.pushState({ record: 'job-b' }, '', '/?record=job-b'); select('job-b');
  });
  await expect(page.getByRole('button', { name: 'Review what will be created' })).toBeEnabled();
  await page.goBack(); await expect(page.getByRole('button', { name: 'Check status' })).toBeVisible();
  await page.goForward(); await expect(page.getByRole('button', { name: 'Review what will be created' })).toBeEnabled();
  expect(await count(page, 'start')).toBe(1); expect(await count(page, 'poll')).toBe(1);
});
test('mismatched explicit tenant blocks stale source action', async ({ page }) => {
  await setup(page); await page.evaluate(() => { const w = window as any; w.props.tenantId = 'tenant-other'; w.renderFixture(); });
  await expect(page.getByRole('button')).toHaveCount(0); expect(await count(page, 'start')).toBe(0);
});
test('cancelled review never submits and clears confirmation', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Review what will be created' }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Review what will be created' }).click();
  await expect(page.getByRole('button', { name: 'Confirm and create' })).toBeDisabled(); expect(await count(page, 'start')).toBe(0);
});
test('approved proof attachment query remains navigable', async ({ page }) => {
  await setup(page); await page.evaluate(() => { (window as any).links = [{ destination_deep_link: '/modules/tradeflowkit/jobs/job-a?attachment=proof-a' }]; });
  await confirm(page); await expect(page.getByRole('link', { name: 'Open SnapProofOS' })).toHaveAttribute('href', '/modules/tradeflowkit/jobs/job-a?attachment=proof-a');
});
test('failed receipt hashing blocks creation rather than proceeding unbound', async ({ page }) => {
  await setup(page); await page.evaluate(() => { const w = window as any; crypto.subtle.digest = async () => { throw Error('unavailable'); }; w.props.sourceVersion = 2; w.renderFixture(); });
  await expect(page.getByRole('alert')).toContainText('could not be prepared safely'); expect(await count(page, 'start')).toBe(0);
});

test('equivalent object intent reuses receipt while array order remains meaningful', async ({ page }) => {
  await setup(page); await page.evaluate(() => { const w = window as any; w.props.payload = { flags: { a: true, b: false }, steps: ['a','b'] }; w.renderFixture(); });
  await confirm(page); await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  await page.evaluate(() => { const w = window as any; w.props.payload = { steps: ['a','b'], flags: { b: false, a: true } }; w.renderFixture(); });
  await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  await revisit(page); await expect(page.getByRole('button', { name: 'Check status' })).toBeVisible();
  await page.evaluate(() => { const w = window as any; w.props.payload.steps.reverse(); w.renderFixture(); });
  await expect(page.getByRole('button', { name: 'Review what will be created' })).toBeEnabled(); expect(await count(page, 'start')).toBe(1);
});
test('receipt persists no private intent content', async ({ page }) => {
  await setup(page); await page.evaluate(() => { const w = window as any; w.props.payload = { privateNote: 'SYNTHETIC-PRIVATE-CONTENT' }; w.renderFixture(); });
  await confirm(page); await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  const storage = await page.evaluate(() => Object.entries(sessionStorage));
  expect(storage).toHaveLength(1); expect(storage[0]![0]).toMatch(/^operatoros:outcome-handoff:v2:[a-f0-9]{64}$/);
  expect(JSON.stringify(storage)).not.toContain('SYNTHETIC-PRIVATE-CONTENT');
  expect(Object.keys(JSON.parse(storage[0]![1])).sort()).toEqual(['idempotencyKey','runId']);
});
test('denied saved run read never falls through into a POST', async ({ page }) => {
  await setup(page); await confirm(page); await expect(page.getByText('Items created', { exact: true })).toBeVisible();
  await revisit(page); await page.evaluate(() => { (window as any).mode.poll = 'deny'; });
  await page.getByRole('button', { name: 'Check status' }).click(); await expect(page.getByRole('alert')).toBeVisible();
  expect(await count(page, 'start')).toBe(1);
  await page.getByRole('button', { name: 'Review again' }).click(); await confirm(page);
  await expect(page.getByRole('alert')).toBeVisible(); expect(await count(page, 'start')).toBe(1);
});
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`synthetic review and recovery fit ${viewport.width}px viewport`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    await page.getByRole('button', { name: 'Review what will be created' }).click();
    await page.screenshot({ path: resolve(root, `build/lateral-check/review-${viewport.width}.png`) });
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Confirm and create' }).click();
    await expect(page.getByText('Items created', { exact: true })).toBeVisible(); await revisit(page);
    await expect(page.getByRole('button', { name: 'Check status' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(root, `build/lateral-check/recovery-${viewport.width}.png`) });
  });
}

for (const field of ['id', 'workflow_key', 'source_resource_id', 'source_module_slug']) {
  test(`mismatched returned ${field} never exposes another record result`, async ({ page }) => {
    await setup(page); await page.evaluate(field => { const w = window as any; w.props.sourceModuleSlug = 'tradeflowkit'; w.runOverride = { [field]: 'unrelated' }; w.renderFixture(); }, field);
    await confirm(page); await expect(page.getByRole('alert')).toContainText('does not match this record');
    await expect(page.getByRole('link')).toHaveCount(0); expect(await count(page, 'start')).toBe(1);
  });
}
