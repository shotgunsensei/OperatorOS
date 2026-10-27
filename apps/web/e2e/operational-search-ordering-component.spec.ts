import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

// Actual components and delayed synthetic read promises. This suite does not
// establish server authentication, database isolation or provider acceptance.
const web = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(web, 'package.json'));
let script: string;
let styles: string;

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import Search from './src/components/module-shells/TradeFlowKitGlobalSearch';
      import Garage from './src/components/module-shells/TorqueShedWorkspace';
      import {moduleShellApi} from './src/lib/auth';
      Object.assign(moduleShellApi,window.fixtureApi);
      const root=createRoot(document.getElementById('root'));
      window.renderFixture=(view,tenant='fixture-tenant')=>{
        window.fixturePath=view==='search'?'/modules/tradeflowkit/dashboard':'/modules/torqueshed/garage';
        root.render(React.createElement(view==='search'?Search:Garage,{tenantKey:tenant,routePath:'/garage',hrefFor:path=>'/modules/tradeflowkit'+path}));
      };
      window.renderFixture(window.fixtureView);
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: 'operational-fixture.js', define: { 'process.env.NODE_ENV': '"test"' },
    alias: { '@': resolve(web, 'src'), react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'synthetic-context-only', setup(plugin) {
      plugin.onResolve({ filter: /^(next\/(navigation|link|image|dynamic)|@\/components\/(AuthProvider|TenantProvider|ModuleAccessContext))$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
        const contents = args.path === 'next/navigation'
          ? `export const usePathname=()=>window.fixturePath;export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{}});`
          : args.path === 'next/link'
            ? `import React from 'react';export default React.forwardRef(function Link({href,children,prefetch,replace,scroll,...props},ref){return <a {...props} ref={ref} href={typeof href==='string'?href:href.pathname}>{children}</a>});`
            : args.path === 'next/image'
              ? `import React from 'react';export default function Image({priority,fill,unoptimized,quality,...props}){return <img {...props}/>};`
              : args.path === 'next/dynamic'
                ? `import React from 'react';export default(loader,options={})=>{const Lazy=React.lazy(loader);return props=><React.Suspense fallback={options.loading?React.createElement(options.loading):null}><Lazy {...props}/></React.Suspense>};`
                : args.path.includes('AuthProvider')
                  ? `export const useAuth=()=>({user:{id:'fixture-user',name:'Review Owner',email:'owner@example.invalid',currentTenantId:'fixture-tenant',platformRole:'user'},loading:false});`
                  : args.path.includes('TenantProvider')
                    ? `export const useTenant=()=>({activeTenant:{id:'fixture-tenant',name:'Isolated review organization'},activeRole:'owner',loading:false});`
                    : `export const useModuleAccessLevel=()=>'manager';`;
        return { contents, loader: 'tsx' };
      });
    } }],
  });
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  styles = readFileSync(resolve(web, 'src/app/globals.css'), 'utf8') + '\n' + result.outputFiles.find(file => file.path.endsWith('.css'))!.text;
});

async function mount(page: Page, view: 'search' | 'garage') {
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== 'localhost') return route.abort();
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>' });
  });
  await page.addInitScript(() => Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => ({}) } }));
  await page.goto('http://localhost:55497/');
  await page.evaluate(view => {
    const fixture = window as any;
    fixture.fixtureView = view; fixture.pendingSearch = []; fixture.pendingVehicles = [];
    fixture.fixtureApi = {
      tradeflowkit: { search: (query: string) => new Promise((resolve, reject) => fixture.pendingSearch.push({ query, resolve, reject })) },
      torqueshed: {
        listVehicles: (query: string) => new Promise((resolve, reject) => fixture.pendingVehicles.push({ query, resolve, reject })),
        listBuilds: async () => ({ builds: [] }), listDiagnostics: async () => ({ diagnostics: [] }), getTokenLedger: async () => ({ availableBalance: 0 }),
      },
    };
  }, view);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
}

async function resolveSearch(page: Page, index: number, name: string) {
  await page.evaluate(({ index, name }) => {
    const request = (window as any).pendingSearch[index];
    request.resolve({ query: request.query, total: 1, leads: [], customers: [{ id: `fixture-${index}`, name }], jobs: [], tasks: [], organizations: [], contacts: [], quotes: [], invoices: [] });
  }, { index, name });
}

test('clearing a pending search suppresses both late results and late errors', async ({ page }) => {
  await mount(page, 'search');
  const input = page.getByRole('textbox', { name: 'Search TradeFlowKit records', exact: true });
  await input.fill('first'); await page.getByTestId('tradeflowkit-global-search-submit').click();
  await page.getByRole('button', { name: 'Clear TradeFlowKit search' }).click();
  await resolveSearch(page, 0, 'Cleared record');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('tradeflowkit-global-search-results')).toHaveCount(0);
  await input.fill('second'); await input.press('Enter');
  await page.getByRole('button', { name: 'Clear TradeFlowKit search' }).click();
  await page.evaluate(() => (window as any).pendingSearch[1].reject(new Error('Obsolete request')));
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('new search wins over an older response and tenant replacement discards pending data', async ({ page }) => {
  await mount(page, 'search');
  const input = page.getByRole('textbox', { name: 'Search TradeFlowKit records', exact: true });
  await input.fill('old'); await input.press('Enter');
  await input.fill('new'); await input.press('Enter');
  await resolveSearch(page, 1, 'Current record'); await resolveSearch(page, 0, 'Obsolete record');
  await expect(page.getByText('Current record', { exact: true })).toBeVisible();
  await expect(page.getByText('Obsolete record', { exact: true })).toHaveCount(0);
  await input.fill('prior tenant'); await input.press('Enter');
  await page.evaluate(() => (window as any).renderFixture('search', 'another-fixture-tenant'));
  await expect(input).toHaveValue(''); await resolveSearch(page, 2, 'Prior tenant record');
  await expect(page.getByTestId('tradeflowkit-global-search-results')).toHaveCount(0);
});

test('garage keeps the newest result when an earlier read succeeds or fails later', async ({ page }) => {
  await mount(page, 'garage');
  const input = page.getByRole('textbox', { name: 'Search garage' });
  await input.waitFor(); await page.evaluate(() => (window as any).pendingVehicles[0].resolve({ vehicles: [] }));
  await input.fill('old'); await page.waitForFunction(() => (window as any).pendingVehicles.length === 2);
  await input.fill('new'); await page.waitForFunction(() => (window as any).pendingVehicles.length === 3);
  await page.evaluate(() => (window as any).pendingVehicles[2].resolve({ vehicles: [{ id: 'new', nickname: 'Current vehicle', year: 2024, make: 'Fixture', model: 'New' }] }));
  await expect(page.getByText('Current vehicle', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).pendingVehicles[1].resolve({ vehicles: [{ id: 'old', nickname: 'Obsolete vehicle', year: 2023, make: 'Fixture', model: 'Old' }] }));
  await expect(page.getByText('Current vehicle', { exact: true })).toBeVisible();
  await expect(page.getByText('Obsolete vehicle', { exact: true })).toHaveCount(0);
  await input.fill('older failure'); await page.waitForFunction(() => (window as any).pendingVehicles.length === 4);
  await input.fill('latest'); await page.waitForFunction(() => (window as any).pendingVehicles.length === 5);
  await page.evaluate(() => (window as any).pendingVehicles[4].resolve({ vehicles: [{ id: 'latest', nickname: 'Latest vehicle', year: 2024, make: 'Fixture', model: 'Latest' }] }));
  await expect(page.getByText('Latest vehicle', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).pendingVehicles[3].reject(new Error('Obsolete garage failure')));
  await expect(page.getByText(/Obsolete garage failure/)).toHaveCount(0);
});

test('search results preserve the owning module route in an embedded workspace', async ({ page }) => {
  await mount(page, 'search');
  await page.getByRole('textbox', { name: 'Search TradeFlowKit records', exact: true }).fill('customer');
  await page.getByTestId('tradeflowkit-global-search-submit').click();
  await resolveSearch(page, 0, 'Module-bound result');
  await expect(page.getByRole('link', { name: 'Module-bound result' })).toHaveAttribute('href', '/modules/tradeflowkit/customers/fixture-0');
});
