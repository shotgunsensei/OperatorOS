import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

// Real browser IndexedDB and actual queue/component; synthetic identity/API only.
// Every browser request is intercepted. No application, database or provider runs.
const web = resolve(import.meta.dirname, '..');
const assets = process.env.OPERATOROS_TEST_ASSET_ROOT ? resolve(process.env.OPERATOROS_TEST_ASSET_ROOT, 'apps/web') : web;
const require = createRequire(resolve(assets, 'package.json'));
let script: string;

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import * as queue from './src/lib/snapproof-offline-queue';
      import {snapProofCaptureIdentityStatus} from '../api/src/lib/snapproof-capture-identity';
      import Workspace from './src/components/module-shells/SnapProofFieldWorkspace';
      window.queue = queue;
      window.captureIdentityStatus = snapProofCaptureIdentityStatus;
      window.root = createRoot(document.getElementById('root'));
      window.renderFixture = () => window.root.render(React.createElement(Workspace, {
        tab: 'capture', selectedJobId: 'job-a', onSelectJob: window.selectJob, canWrite: true,
      }));
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    nodePaths: [resolve(assets, 'node_modules'), resolve(assets, '../../node_modules')],
    alias: { '@': resolve(web, 'src'), react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'fixture-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /^@\/lib\/auth$|^@\/components\/(AuthProvider|TenantProvider)$|\.\/(OutcomeWorkflowAction|SharedCustomerPicker)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
        args.path === '@/lib/auth' ? `export const moduleShellApi={snapproofos:window.api}; export const getActiveTenantId=()=>window.scope.tenantId;`
          : args.path.endsWith('AuthProvider') ? `export const useAuth=()=>({user:window.user,loading:false,captureIdentity:window.captureIdentity});`
            : args.path.endsWith('TenantProvider') ? `export const useTenant=()=>({activeTenant:{id:window.scope.tenantId},loading:false});`
              : 'export default function Fixture(){return null;}',
      }));
    } }],
  });
  script = result.outputFiles[0].text;
});

async function setup(page: Page) {
  await page.route('**/*', async route => {
    if (route.request().url() === 'http://localhost:55499/') return route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' });
    if (route.request().url() === 'http://localhost:55499/api/auth/me') {
      const user = await page.evaluate(() => (window as any).serverUser);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user }), headers: { 'cache-control': 'no-store' } });
    }
    return route.abort();
  });
  await page.goto('http://localhost:55499/');
  await page.evaluate(() => {
    const w = window as any;
    w.scope = { tenantId: 'tenant-a', userId: 'user-a' };
    w.user = { id: 'user-a', currentTenantId: 'tenant-a' }; w.serverUser = w.user;
    w.captureIdentity = (user: any) => () => w.user === user;
    w.selectJob = () => {}; w.uploads = []; w.uploadRequests = [];
    w.api = {
      jobs: async () => ({ jobs: [{ id: 'job-a', title: 'Current job', reference: 'A' }] }),
      job: async () => ({ job: { id: 'job-a' }, files: [] }),
      uploadJobFile: async (jobId: string, payload: any) => {
        w.uploadRequests.push({ jobId, payload });
        if (w.switchAtPost) { w.serverUser = { id: 'other', currentTenantId: 'tenant-a' }; w.switchAtPost = false; }
        const identity = w.captureIdentityStatus(payload, { userId: w.serverUser.id, tenantId: w.serverUser.currentTenantId });
        if (identity !== 'match') throw { status: identity === 'mismatch' ? 409 : 400, code: 'SNAPPROOF_CAPTURE_IDENTITY_CHANGED' };
        w.uploads.push({ jobId, payload }); return {};
      },
    };
    w.capture = (id: string) => ({ id, jobId: 'job-a', payload: { title: `Private ${id}`, contentBase64: 'cHJpdmF0ZQ==', clientMutationId: id }, createdAt: '2026-11-09T00:00:00.000Z' });
    w.seedRaw = (item: any) => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('operatoros-snapproofos', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('capture-queue', { keyPath: 'id' });
      open.onsuccess = () => {
        const tx = open.result.transaction('capture-queue', 'readwrite'); tx.objectStore('capture-queue').add(item);
        tx.oncomplete = () => { open.result.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.addScriptTag({ content: script });
}

test.beforeEach(async ({ page }) => setup(page));

test('same owner retries original payload and removes only confirmed uploads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any; const scope = { ...w.scope }; const calls: any[] = [];
    await w.queue.queueSnapProofCapture(w.capture('capture-a'), scope);
    const first = await w.queue.reconcileSnapProofCaptures(scope, () => true, async (item: any) => { calls.push(item); throw Error('response lost'); });
    const second = await w.queue.reconcileSnapProofCaptures(scope, () => true, async (item: any) => calls.push(item));
    return { first, second, calls, remaining: await w.queue.listSnapProofCaptures(scope) };
  });
  expect(result.first).toEqual({ completed: 0, remaining: 1, held: false });
  expect(result.second).toEqual({ completed: 1, remaining: 0, held: false });
  expect(result.calls[0]).toEqual(result.calls[1]);
  expect(result.remaining).toEqual({ items: [], held: false });
});

for (const change of ['account', 'tenant'] as const) {
  test(`${change} switch cannot list or upload previous owner's captures`, async ({ page }) => {
    const result = await page.evaluate(async change => {
      const w = window as any; const original = { ...w.scope };
      await w.queue.queueSnapProofCapture(w.capture('private-capture'), original);
      const other = { ...original, [change === 'account' ? 'userId' : 'tenantId']: 'other' };
      const listed = await w.queue.listSnapProofCaptures(other);
      const sent: any[] = [];
      const flushed = await w.queue.reconcileSnapProofCaptures(other, () => true, async (item: any) => sent.push(item));
      return { listed, flushed, sent, original: await w.queue.listSnapProofCaptures(original) };
    }, change);
    expect(result.listed).toEqual({ items: [], held: true });
    expect(result.sent).toEqual([]);
    expect(result.flushed.completed).toBe(0);
    expect(result.original.items).toHaveLength(1);
  });
}

test('legacy unbound rows are held without exposing or deleting their bytes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any;
    await w.seedRaw({ ...w.capture('legacy'), attempts: 0 });
    const sent: any[] = [];
    const first = await w.queue.listSnapProofCaptures(w.scope);
    await w.queue.reconcileSnapProofCaptures(w.scope, () => true, async (item: any) => sent.push(item));
    return { first, sent, after: await w.queue.listSnapProofCaptures(null) };
  });
  expect(result).toEqual({ first: { items: [], held: true }, sent: [], after: { items: [], held: true } });
  await page.evaluate(() => (window as any).renderFixture());
  await expect(page.getByTestId('snapproof-held-captures')).toBeVisible();
  await expect(page.getByText('Private legacy', { exact: true })).toHaveCount(0);
});

for (const change of ['logout', 'account', 'tenant'] as const) {
  test(`mid-flush ${change} stops before another send and retains uncertain bytes`, async ({ page }) => {
    const result = await page.evaluate(async change => {
      const w = window as any; const original = { ...w.scope };
      await w.queue.queueSnapProofCapture(w.capture('a'), original);
      await w.queue.queueSnapProofCapture(w.capture('b'), original);
      let active: any = { ...original }; const sent: string[] = [];
      const flushed = await w.queue.reconcileSnapProofCaptures(original,
        () => w.queue.sameSnapProofCaptureScope(original, active), async (item: any) => {
          sent.push(item.id); active = change === 'logout' ? null
            : { ...original, [change === 'account' ? 'userId' : 'tenantId']: 'other' };
        });
      return { sent, flushed, retained: (await w.queue.listSnapProofCaptures(original)).items };
    }, change);
    expect(result.sent).toEqual(['a']);
    expect(result.flushed.completed).toBe(0);
    expect(result.retained).toHaveLength(2);
  });
}

test('scope is copied at capture time and duplicate IDs cannot overwrite ownership or bytes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any; const scope = { ...w.scope };
    await w.queue.queueSnapProofCapture(w.capture('a'), scope); scope.userId = 'other';
    let rejected = false;
    try { await w.queue.queueSnapProofCapture({ ...w.capture('a'), payload: { replaced: true } }, scope); } catch { rejected = true; }
    return { rejected, original: await w.queue.listSnapProofCaptures(w.scope), other: await w.queue.listSnapProofCaptures(scope) };
  });
  expect(result.rejected).toBe(true);
  expect(result.original.items[0].payload.title).toBe('Private a');
  expect(result.other).toEqual({ items: [], held: true });
});

test('overlapping reconnect and retry flushes send each same-owner item once', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any;
    await w.queue.queueSnapProofCapture(w.capture('a'), w.scope);
    const sent: string[] = [];
    const upload = async (item: any) => { sent.push(item.id); await new Promise(resolve => setTimeout(resolve, 30)); };
    const results = await Promise.all([
      w.queue.reconcileSnapProofCaptures(w.scope, () => true, upload),
      w.queue.reconcileSnapProofCaptures(w.scope, () => true, upload),
    ]);
    return { sent, results };
  });
  expect(result.sent).toEqual(['a']);
  expect(result.results).toEqual([{ completed: 1, remaining: 0, held: false }, { completed: 1, remaining: 0, held: false }]);
});

test('component fresh server identity blocks a stale signed-in React account', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    await w.queue.queueSnapProofCapture(w.capture('a'), w.scope);
    w.serverUser = { id: 'other', currentTenantId: w.scope.tenantId };
    w.renderFixture();
  });
  await expect(page.getByText('1 capture waiting to upload')).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  expect(await page.evaluate(() => (window as any).uploads)).toEqual([]);
  expect(await page.evaluate(async () => (await (window as any).queue.listSnapProofCaptures((window as any).scope)).items.length)).toBe(1);
});

test('component uploads only the current owner and preserves other-account and legacy rows', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    await w.queue.queueSnapProofCapture(w.capture('current'), w.scope);
    await w.queue.queueSnapProofCapture(w.capture('other'), { ...w.scope, userId: 'other' });
    await w.seedRaw({ ...w.capture('legacy'), attempts: 0 });
    w.renderFixture();
  });
  await expect.poll(() => page.evaluate(() => (window as any).uploads.length)).toBe(1);
  await expect(page.getByTestId('snapproof-held-captures')).toBeVisible();
  expect(await page.evaluate(async () => {
    const w = window as any;
    return { uploaded: w.uploads[0].payload.clientMutationId, current: await w.queue.listSnapProofCaptures(w.scope), other: (await w.queue.listSnapProofCaptures({ ...w.scope, userId: 'other' })).items.length };
  })).toEqual({ uploaded: 'current', current: { items: [], held: true }, other: 1 });
});

test('failed capture storage leaves the original selection visible and sends nothing', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    Object.defineProperty(w, 'indexedDB', { value: undefined, configurable: true });
    w.renderFixture();
  });
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Keep my original');
  await page.getByLabel('Camera, file, or voice note', { exact: true }).setInputFiles({ name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from('private evidence') });
  await page.getByRole('button', { name: 'Secure capture', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Keep the original file and retry');
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Keep my original');
  expect(await page.evaluate(() => (window as any).uploads)).toEqual([]);
});

test('component stores original identity when account changes during file reading', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any; const RealReader = FileReader;
    w.FileReader = class extends RealReader {
      readAsDataURL(file: Blob) { w.finishRead = () => super.readAsDataURL(file); }
    };
    w.renderFixture();
  });
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Captured before switch');
  await page.getByLabel('Camera, file, or voice note', { exact: true }).setInputFiles({ name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from('private evidence') });
  await page.getByRole('button', { name: 'Secure capture', exact: true }).click();
  await page.evaluate(() => {
    const w = window as any;
    w.scope = { tenantId: 'tenant-a', userId: 'user-b' };
    w.user = { id: 'user-b', currentTenantId: 'tenant-a' }; w.serverUser = w.user;
    w.renderFixture(); w.finishRead();
  });
  await expect.poll(() => page.evaluate(async () => (await (window as any).queue.listSnapProofCaptures({ tenantId: 'tenant-a', userId: 'user-a' })).items.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).uploads)).toEqual([]);
  const other = await page.evaluate(async () => (window as any).queue.listSnapProofCaptures((window as any).scope));
  expect(other).toEqual({ items: [], held: true });
});

test('server consistency assertion retains bytes when cookie changes after identity GET but before POST', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    await w.queue.queueSnapProofCapture(w.capture('race-capture'), w.scope);
    w.switchAtPost = true;
    w.renderFixture();
  });
  await expect.poll(() => page.evaluate(() => (window as any).uploadRequests.length)).toBe(1);
  expect(await page.evaluate(async () => {
    const w = window as any;
    return { accepted: w.uploads.length, expected: w.uploadRequests[0].payload.expectedCaptureIdentity, retained: (await w.queue.listSnapProofCaptures(w.scope)).items[0] };
  })).toMatchObject({ accepted: 0, expected: { userId: 'user-a', tenantId: 'tenant-a' }, retained: { id: 'race-capture', payload: { clientMutationId: 'race-capture', contentBase64: 'cHJpdmF0ZQ==' } } });
  await page.evaluate(() => { const w = window as any; w.serverUser = w.user; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).uploads.length)).toBe(1);
  await expect.poll(() => page.evaluate(async () => (await (window as any).queue.listSnapProofCaptures((window as any).scope)).items.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).uploadRequests.map((request: any) => request.payload.clientMutationId))).toEqual(['race-capture', 'race-capture']);
});

test('a capture enqueued mid-flush stays saved and visible for the next retry', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    await w.queue.queueSnapProofCapture(w.capture('first'), w.scope);
    const upload = w.api.uploadJobFile;
    w.api.uploadJobFile = async (jobId: string, payload: any) => {
      const result = await upload(jobId, payload);
      if (payload.clientMutationId === 'first') await w.queue.queueSnapProofCapture(w.capture('new-during-flush'), w.scope);
      return result;
    };
    w.renderFixture();
  });
  await expect.poll(() => page.evaluate(() => (window as any).uploads.length)).toBe(1);
  await expect(page.getByText('1 capture waiting to upload')).toBeVisible();
  expect(await page.evaluate(async () => (await (window as any).queue.listSnapProofCaptures((window as any).scope)).items[0]))
    .toMatchObject({ id: 'new-during-flush', payload: { contentBase64: 'cHJpdmF0ZQ==', clientMutationId: 'new-during-flush' } });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).uploads.length)).toBe(2);
  await expect(page.getByText('1 capture waiting to upload')).toHaveCount(0);
});
