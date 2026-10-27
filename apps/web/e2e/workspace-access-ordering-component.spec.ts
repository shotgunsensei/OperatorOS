import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'package.json'));
let bundle = '';

test.beforeAll(async () => {
  const palette = readFileSync(resolve(root, 'src/components/SaasLayout.tsx'), 'utf8').match(/const colors = \{[\s\S]*?\n\};/)?.[0];
  if (!palette) throw new Error('Canonical palette not found');
  const result = await build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import MyApps from './src/components/pages/MyAppsPage';createRoot(document.getElementById('root')).render(React.createElement(MyApps,{onNavigate:()=>{}}));`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, outdir: 'fixture', platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    alias: { '@': resolve(root, 'src'), react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'synthetic-workspace-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /(?:^|[\\/])(AuthProvider|TenantProvider|Toast|SaasLayout)(?:\.tsx)?$/ }, args => ({ path: args.path.split(/[\\/]/).pop()!.replace(/\.tsx$/, ''), namespace: 'fixture' }));
      plugin.onResolve({ filter: /^(next\/link|next\/image|@\/lib\/auth|@\/lib\/launch)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: {
        SaasLayout: `export ${palette}`,
        AuthProvider: `import{useSyncExternalStore}from'react';export const useAuth=()=>{useSyncExternalStore(window.fixture.subscribe,window.fixture.snapshot);return{user:window.fixture.user,captureIdentity:window.fixture.captureIdentity}};`,
        TenantProvider: `import{useSyncExternalStore}from'react';export const useTenant=()=>{useSyncExternalStore(window.fixture.subscribe,window.fixture.snapshot);return{activeTenant:{id:window.fixture.tenantId,name:'Synthetic workspace'},activeRole:'member',tenants:[],allTenants:[],switchTenant:async tenant=>{window.fixture.switches.push(tenant)},loading:false}};`,
        Toast: `const toast=(...args)=>window.fixture.toasts.push(args);export const useToast=()=>({toast});`,
        'next/link': `import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`,
        'next/image': `import React from'react';export default function Image({src,fill,priority,unoptimized,...props}){return React.createElement('img',{...props,src:typeof src==='string'?src:src.src})}`,
        '@/lib/launch': `export const isNativeLaunchRuntime=()=>false;export const navigateToModuleProgrammatically=async()=>{};`,
        '@/lib/auth': `const pending=(group,kind)=>new Promise((resolve,reject)=>window.fixture[group].push({resolve,reject,kind,user:window.fixture.user}));export const modulesApi={list:()=>pending('requests','modules')};export const trialApi={status:()=>pending('trials','status'),start:()=>pending('actions','start')};export const authApi={requestEmailVerification:()=>pending('actions','verify')};export const tenantApi={};`,
      }[args.path]!, loader: 'js' }));
    } }],
  });
  bundle = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
});

async function mount(page: Page) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === 'localhost'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }) : route.abort());
  await page.goto('http://localhost:55497/app');
  await page.evaluate(() => {
    let revision = 0, identityEpoch = 0;
    const listeners = new Set<() => void>();
    const fixture: any = { user: { id: 'user-a', currentTenantId: 'tenant-a' }, tenantId: 'tenant-a', requests: [], trials: [], actions: [], toasts: [], switches: [],
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      snapshot: () => revision,
      captureIdentity: (candidate: unknown) => { const version = identityEpoch; return () => candidate === fixture.user && version === identityEpoch; },
      change: (tenantId: string, userId = 'user-a') => { fixture.tenantId = tenantId; fixture.user = { id: userId, currentTenantId: tenantId }; identityEpoch++; revision++; listeners.forEach(listener => listener()); },
      changeTenantOnly: (tenantId: string) => { fixture.tenantId = tenantId; revision++; listeners.forEach(listener => listener()); },
      complete: (index: number, slug: string, reject = false) => { const request = fixture.requests[index]; if(reject) request.reject(new Error('Synthetic delayed failure')); else request.resolve({ modules: [{ module: { slug, name: slug, status: 'live' }, unlocked: true, cta: 'open', access_source: 'plan' }] }); },
      trial: (index: number, state: string, personalTenantId: string | null = null, reject = false) => { if(reject)fixture.trials[index].reject(new Error('Synthetic delayed trial failure'));else fixture.trials[index].resolve({trial:{state,personalTenantId}}); },
      action: (index: number, state = 'active', personalTenantId: string | null = null, reject = false) => { if(reject)fixture.actions[index].reject({error:'Synthetic prior-identity failure'});else fixture.actions[index].resolve({trial:{state,personalTenantId}}); },
    };
    (window as any).fixture = fixture;
  });
  await page.addScriptTag({ content: bundle });
  await expect.poll(() => page.evaluate(() => (window as any).fixture.requests.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).fixture.trials.length)).toBe(1);
}

for (const lateFailure of [false, true]) {
  test(`late organization A ${lateFailure ? 'failure' : 'success'} cannot replace organization B access`, async ({ page }) => {
    await mount(page);
    await page.evaluate(() => (window as any).fixture.change('tenant-b'));
    await expect.poll(() => page.evaluate(() => (window as any).fixture.requests.length)).toBe(2);
    await page.evaluate(() => (window as any).fixture.complete(1, 'tradeflowkit'));
    await expect(page.getByTestId('button-launch-tradeflowkit')).toBeVisible();
    await page.evaluate(failed => (window as any).fixture.complete(0, 'techdeck', failed), lateFailure);
    await expect(page.getByTestId('button-launch-tradeflowkit')).toBeVisible();
    await expect(page.getByTestId('button-launch-techdeck')).toHaveCount(0);
    await expect(page.getByTestId('command-center-load-error')).toHaveCount(0);
  });
}

test('new accepted identity in the same organization discards cached launch access', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => (window as any).fixture.complete(0, 'techdeck'));
  await expect(page.getByTestId('button-launch-techdeck')).toBeVisible();
  await page.evaluate(() => (window as any).fixture.change('tenant-a', 'user-b'));
  await expect(page.getByTestId('button-launch-techdeck')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).fixture.requests.length)).toBe(2);
  await page.evaluate(() => (window as any).fixture.complete(1, 'tradeflowkit'));
  await expect(page.getByTestId('button-launch-tradeflowkit')).toBeVisible();
});

test('tenant-only replacement with unchanged accepted user rejects late module data', async ({page}) => {
  await mount(page);
  await page.evaluate(() => (window as any).fixture.changeTenantOnly('tenant-b'));
  await expect.poll(() => page.evaluate(() => (window as any).fixture.requests.length)).toBe(2);
  await page.evaluate(() => (window as any).fixture.complete(1,'tradeflowkit'));
  await expect(page.getByTestId('button-launch-tradeflowkit')).toBeVisible();
  await page.evaluate(() => (window as any).fixture.complete(0,'techdeck'));
  await expect(page.getByTestId('button-launch-tradeflowkit')).toBeVisible();
  await expect(page.getByTestId('button-launch-techdeck')).toHaveCount(0);
});

for(const lateFailure of [false,true])test(`previous identity trial ${lateFailure?'failure':'success'} cannot replace the current offer`,async({page})=>{
  await mount(page);
  await page.evaluate(()=>(window as any).fixture.change('tenant-b','user-b'));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.trials.length)).toBe(2);
  await page.evaluate(()=>(window as any).fixture.trial(1,'eligible'));
  await expect(page.getByText('Try the flagship applications for seven days',{exact:true})).toBeVisible();
  await page.evaluate(failed=>(window as any).fixture.trial(0,'active','prior-personal-tenant',failed),lateFailure);
  await expect(page.getByText('Try the flagship applications for seven days',{exact:true})).toBeVisible();
});

test('same user ID reaccepted as a new identity clears trial state immediately',async({page})=>{
  await mount(page);await page.evaluate(()=>(window as any).fixture.trial(0,'eligible'));
  await expect(page.getByTestId('core-suite-trial-card')).toBeVisible();
  await page.evaluate(()=>(window as any).fixture.change('tenant-a','user-a'));
  await expect(page.getByTestId('core-suite-trial-card')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.trials.length)).toBe(2);
});

for(const kind of ['start','verify'])test(`late ${kind} action cannot notify or switch the replacement identity`,async({page})=>{
  await mount(page);await page.evaluate(state=>(window as any).fixture.trial(0,state),kind==='start'?'eligible':'verification_required');
  await page.getByTestId('button-core-suite-trial-action').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.actions.length)).toBe(1);
  await page.evaluate(()=>(window as any).fixture.change('tenant-b','user-b'));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.trials.length)).toBe(2);
  await page.evaluate(()=>(window as any).fixture.trial(1,'eligible'));
  await page.evaluate(()=>(window as any).fixture.action(0,'active','prior-personal-tenant'));
  await expect(page.getByText('Try the flagship applications for seven days',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.switches.length)).toBe(0);
  expect(await page.evaluate(()=>(window as any).fixture.toasts)).toEqual([]);
});

test('previous action failure cannot clear a new identity action busy state',async({page})=>{
  await mount(page);await page.evaluate(()=>(window as any).fixture.trial(0,'eligible'));
  await page.getByTestId('button-core-suite-trial-action').click();
  await page.evaluate(()=>(window as any).fixture.change('tenant-b','user-b'));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.trials.length)).toBe(2);
  await page.evaluate(()=>(window as any).fixture.trial(1,'eligible'));
  await expect(page.getByTestId('button-core-suite-trial-action')).toBeEnabled();
  await page.getByTestId('button-core-suite-trial-action').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.actions.length)).toBe(2);
  await page.evaluate(()=>(window as any).fixture.action(0,'active',null,true));
  await expect(page.getByTestId('button-core-suite-trial-action')).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).fixture.toasts)).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.action(1,'active','tenant-b'));
  await expect(page.getByText('Your flagship application trial is active',{exact:true})).toBeVisible();
});
