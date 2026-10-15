import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

// Mount the actual component with an explicitly synthetic API boundary. This
// proves UI behavior only; exact-host SSO and live delivery remain separate.
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'package.json'));
let bundle: string;
test.beforeAll(async () => {
  const palette = readFileSync(resolve(root, 'src/components/SaasLayout.tsx'), 'utf8').match(/const colors = \{[\s\S]*?\n\};/)?.[0];
  if (!palette) throw new Error('The canonical palette could not be read');
  const result = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Workspace from './src/components/module-shells/OutCallWorkspace'; createRoot(document.getElementById('root')).render(React.createElement(Workspace,{view:window.fixtureView,canWrite:true}));`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    alias: { '@': resolve(root, 'src'), 'react': dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'synthetic-outcall-boundaries', setup(plugin) {
      // Use the real palette without mounting unrelated platform chrome.
      plugin.onResolve({ filter: /components[\\/]SaasLayout(?:\.tsx)?$/ }, () => ({ path: 'palette', namespace: 'palette' }));
      plugin.onLoad({ filter: /.*/, namespace: 'palette' }, () => ({ contents: `export ${palette}`, loader: 'js' }));
      plugin.onResolve({ filter: /(?:[\\/]lib[\\/]auth(?:\.ts)?$|^@\/lib\/auth$|^next\/navigation$)/ }, args => ({ path: args.path, namespace: 'synthetic' }));
      plugin.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => ({ contents: args.path === 'next/navigation'
        ? 'export const useRouter=()=>({push:path=>window.navigation.push(path)});'
        : 'export const moduleShellApi={outcall:window.outcallApi};', loader: 'js' }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function mount(page: Page, view: string, configured = true, ready = true, initialFailure = false) {
  // Loopback is a secure context for the real Web Crypto request identity.
  // Fulfill locally so no server, external hostname or account is contacted.
  await page.unroute('http://localhost:55499/**');
  await page.route('http://localhost:55499/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#10101b"><div id="root"></div></body></html>' }));
  await page.goto('http://localhost:55499/');
  await page.evaluate(({ view, configured, ready, initialFailure }) => {
    const fixture = window as any;
    fixture.fixtureView = view; fixture.navigation = []; fixture.scheduleKeys = []; fixture.reads = 0;
    fixture.failSchedule = false; fixture.failLoad = initialFailure;
    fixture.workspace = {
      settings: { disclaimerAcceptedAt: new Date().toISOString(), phoneVerifiedAt: view === 'verification' ? null : new Date().toISOString(), phoneMasked: '+1••••4321' },
      profiles: [{ id: 'profile-1', name: 'Neutral callback', language: 'en-US' }], triggers: [], usage: [],
      calls: Array.from({ length: 6 }, (_, i) => ({ id: `call-${i}`, destinationMasked: '+1••••4321', status: 'scheduled', scheduledAt: new Date().toISOString() })),
      callsHasMore: true, provider: { name: configured ? 'twilio' : 'disabled', configured, ready, reason: null }, safety: {},
    };
    fixture.outcallApi = {
      workspace: async () => { fixture.reads++; if (fixture.failLoad) throw new Error('Temporary workspace failure'); return structuredClone(fixture.workspace); },
      schedule: async (payload: any) => { fixture.scheduleKeys.push(payload.idempotencyKey); if (fixture.failSchedule && fixture.scheduleKeys.length === 1) throw fixture.failSchedule === 'validation' ? { status: 400, error: 'Choose a future time' } : new Error('Response lost'); return { call: { id: 'scheduled-once' }, replayed: fixture.scheduleKeys.length > 1 }; },
      cancel: async (id: string) => { fixture.canceled = id; fixture.workspace.calls = fixture.workspace.calls.map((row: any) => row.id === id ? { ...row, status: 'canceled' } : row); return {}; },
      callsPage: async () => ({ calls: [{ id: 'older-call', destinationMasked: '+1••••9876', status: 'scheduled', scheduledAt: new Date().toISOString() }], hasMore: false }),
    };
  }, { view, configured, ready, initialFailure });
  await page.addScriptTag({ content: bundle });
}

for (const width of [1280, 390]) {
  test(`all pending rows and older cancellation remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mount(page, 'schedules');
    await expect(page.getByRole('button', { name: 'Cancel call', exact: true })).toHaveCount(6);
    await page.getByRole('button', { name: 'Load older calls' }).click();
    await expect(page.getByRole('button', { name: 'Cancel call', exact: true })).toHaveCount(7);
    await page.getByRole('button', { name: 'Cancel call', exact: true }).last().click();
    await expect(page.getByText('Scheduled call canceled.')).toBeVisible();
    expect(await page.evaluate(() => (window as any).canceled)).toBe('older-call');
    await expect(page.getByRole('button', { name: 'Cancel call', exact: true })).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('lost schedule responses retry the same request and asynchronous outcomes refresh', async ({ page }) => {
  await page.clock.install();
  await mount(page, 'schedules');
  await page.evaluate(() => { (window as any).failSchedule = true; });
  await page.getByTestId('button-outcall-schedule').click();
  await expect(page.getByRole('button', { name: 'Retry same call request' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same call request' }).click();
  await expect(page.getByText('Durable call request scheduled.')).toBeVisible();
  const keys = await page.evaluate(() => (window as any).scheduleKeys);
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  await page.evaluate(() => { (window as any).workspace.calls[0].status = 'completed'; });
  await page.clock.runFor(16_000);
  await expect(page.getByRole('button', { name: 'Cancel call', exact: true })).toHaveCount(5);
});

test('provider activation and load recovery are presented honestly', async ({ page }) => {
  await mount(page, 'verification', true, false);
  await expect(page.getByText('Calling awaits activation')).toBeVisible();
  await expect(page.getByTestId('button-outcall-start-verification')).toBeDisabled();
  await mount(page, 'verification', true, true, true);
  await expect(page.getByText('Temporary workspace failure')).toBeVisible();
  await page.evaluate(() => { (window as any).failLoad = false; });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Calling service connected')).toBeVisible();
});

test('an initial validation rejection allows correction without replacing an uncertain intent', async ({ page }) => {
  await mount(page, 'schedules');
  await page.evaluate(() => { (window as any).failSchedule = 'validation'; });
  await page.getByTestId('button-outcall-schedule').click();
  await expect(page.getByText('Choose a future time')).toBeVisible();
  await expect(page.getByLabel('When to call (optional)')).toBeEnabled();
  await page.getByTestId('button-outcall-schedule').click();
  await expect(page.getByText('Durable call request scheduled.')).toBeVisible();
  const keys = await page.evaluate(() => (window as any).scheduleKeys);
  expect(keys).toHaveLength(2); expect(keys[0]).not.toBe(keys[1]);
});
