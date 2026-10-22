import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { TOOL_MODULE_CATALOG } from '@operatoros/sdk';

const web = resolve(import.meta.dirname, '..');
const root = resolve(web, '../..');
const require = createRequire(resolve(web, 'package.json'));
let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React,{useEffect}from'react';import{createRoot}from'react-dom/client';
      import AuthProvider,{useAuth}from'./src/components/AuthProvider';
      import TenantProvider,{useTenant}from'./src/components/TenantProvider';
      import IndependentToolsCatalog from'./src/components/IndependentToolsCatalog';
      function Probe(){const a=useAuth(),t=useTenant();useEffect(()=>{window.toolsInvoke=async action=>{
        if(action==='tenant-refresh')return t.refresh();if(action==='auth-refresh')return a.refresh();
        if(action==='logout')return a.logout();if(action==='login')return a.login('fixture@example.test','synthetic-only');
      };});return <main><h1>Isolated product catalog fixture</h1><IndependentToolsCatalog/></main>;}
      createRoot(document.getElementById('root')).render(<AuthProvider><TenantProvider><Probe/></TenantProvider></AuthProvider>);` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', outdir: 'synthetic-bundle',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    alias: { '@': resolve(web, 'src'), '@operatoros/sdk': resolve(root, 'packages/sdk/src/index.ts'),
      react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'next-presentation-only', setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|image|link)$/ }, args => ({ path: args.path, namespace: 'presentation' }));
      builder.onLoad({ filter: /.*/, namespace: 'presentation' }, args => ({ loader: 'js', contents: args.path === 'next/navigation'
        ? 'export const usePathname=()=>"/component-probe";export const useRouter=()=>({replace(){},push(){}});'
        : 'export default function Presentation(){return null;}' }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function fixture(page: Page, options: { built?: boolean; owner?: boolean; paid?: boolean; holdFirst?: boolean; wrongTenant?: boolean } = {}) {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  // Only satisfy the local middleware's cookie-presence check; the fixture
  // still replaces auth/API responses and grants no real authenticated access.
  if (options.built) await page.context().addCookies([
    { name: 'operatoros_session', value: 'synthetic-ui-only-never-verified', url: origin },
  ]);
  const requests: Array<{ path: string; method: string; tenant: string | undefined }> = [];
  const errors: string[] = [];
  const external: string[] = [];
  let signedIn = true;
  let selected = 'tenant-A';
  let owner = options.owner !== false;
  let hold = options.holdFirst === true;
  let wrong = options.wrongTenant === true;
  let pending: { route: Route; body: unknown } | null = null;
  const readiness = () => ({
    contractVersion: 1, tenantId: wrong ? 'foreign-tenant' : selected,
    purchaseEligibility: { eligible: owner, reason: owner ? 'eligible' : 'owner_required' },
    checkoutAvailable: false, tools: TOOL_MODULE_CATALOG, pendingDecisions: ['edition_release_compatibility'],
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.context().routeWebSocket('**/*', socket => socket.close());
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(request.url()); return route.abort(); }
    if (!options.built && url.pathname === '/bundle.js') return route.fulfill({ contentType: 'application/javascript', body: bundle });
    if (!options.built && request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Synthetic catalog</title></head><body style="margin:0;background:#0b0f14;padding:16px;color:#f1f5f9;font-family:Arial"><div id="root"></div><script src="/bundle.js"></script></body></html>' });
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.slice(4);
    requests.push({ path, method: request.method(), tenant: request.headers()['x-tenant-id'] });
    let body: unknown;
    let status = 200;
    if (path === '/auth/me' || path === '/auth/login') {
      if (path === '/auth/login') signedIn = true;
      status = signedIn ? 200 : 401;
      body = signedIn ? { user: { id: 'user-A', email: 'fixture@example.test', name: 'Synthetic owner', role: 'user', platformRole: 'user', status: 'active', currentTenantId: selected }, mfaRequired: false } : { code: 'UNAUTHENTICATED' };
    } else if (path === '/auth/logout') { signedIn = false; body = { ok: true }; }
    else if (path === '/me/tenants') body = { current: selected, tenants: [{ id: selected, name: 'Synthetic organization', slug: 'synthetic', role: owner ? 'owner' : 'member', status: 'active' }] };
    else if (path === '/tools/catalog') {
      body = readiness();
      if (hold) { hold = false; pending = { route, body }; return; }
    } else if (path === '/modules' || path === '/me/modules') body = { modules: [{ module: { id: 'pool', slug: 'ninja-pool-hall', name: 'Operator Pool Hall', status: 'live', category: 'support', ord: 1 }, unlocked: true, cta: 'open', access_source: 'plan' }] };
    else if (path.includes('trial')) body = { trial: null };
    else if (path.includes('subscription')) body = { subscription: options.paid ? { status: 'active' } : null };
    else { status = 404; body = { error: 'No synthetic fixture for endpoint' }; }
    return route.fulfill({ status, json: body });
  });
  await page.goto(options.built ? '/app?page=apps' : '/component-probe');
  await expect(page.getByTestId('independent-tools-catalog')).toBeVisible();
  return {
    requests,
    async invoke(action: string) { await page.evaluate(async action => { await (window as any).toolsInvoke(action); }, action); },
    changeTenant() { selected = 'tenant-B'; owner = false; },
    changeRole() { owner = false; },
    correctResponse() { wrong = false; },
    async waitHeld() { await expect.poll(() => Boolean(pending)).toBe(true); },
    async release() { expect(pending).toBeTruthy(); const saved = pending!; pending = null;
      // Old requests may have been aborted by the real effect cleanup.
      await saved.route.fulfill({ json: saved.body }).catch(() => {});
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))); },
    clean() { expect(errors).toEqual([]); expect(external).toEqual([]);
      expect(requests.filter(request => request.method !== 'GET' && !['/auth/login', '/auth/logout'].includes(request.path))).toEqual([]); },
  };
}

for (const paid of [false, true]) {
  test(`built Browse tools shows independent one-time products for ${paid ? 'paid' : 'free'} owner`, async ({ page }) => {
    const h = await fixture(page, { built: true, paid });
    const catalog = page.getByTestId('independent-tools-catalog');
    await expect(catalog).toContainText('owner can purchase either tool once sales open');
    await expect(catalog.getByRole('article')).toHaveCount(2);
    await expect(catalog).toContainText('no subscription renewal');
    await expect(catalog.getByText('$99 USD once for your entire tenant.', { exact: true })).toHaveCount(2);
    await expect(page.getByTestId('independent-tool-officeexit')).toContainText('All ten current OfficeExit 2026 features, including Publisher Rescue');
    await expect(page.getByTestId('independent-tool-officeexit')).toContainText('No per-user, device or site limits');
    await expect(catalog).toContainText('Future major-version coverage has not been decided');
    await expect(catalog.getByRole('button')).toHaveCount(0);
    await expect(catalog.getByRole('link')).toHaveCount(0);
    await expect(page.getByTestId('lunch-break-entry')).toBeVisible();
    await expect(page.getByTestId('module-card-ninja-pool-hall')).toBeVisible();
    expect(h.requests.filter(request => request.path === '/tools/catalog').every(request => request.tenant === 'tenant-A')).toBe(true);
    h.clean();
  });
}

test('member sees product scope and owner requirement without a subscription upsell', async ({ page }) => {
  const h = await fixture(page, { owner: false });
  await expect(page.getByTestId('independent-tool-eligibility')).toContainText('Only the current organization owner');
  await expect(page.getByTestId('independent-tool-officeexit')).toContainText('All ten current OfficeExit 2026 features, including Publisher Rescue');
  await expect(page.getByTestId('independent-tools-catalog').getByRole('link')).toHaveCount(0);
  h.clean();
});

test('foreign catalog context is rejected and retry is a read only request', async ({ page }) => {
  const h = await fixture(page, { wrongTenant: true });
  await expect(page.getByTestId('independent-tool-eligibility')).toContainText('could not be checked');
  h.correctResponse();
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByTestId('independent-tool-eligibility')).toContainText('once sales open');
  expect(h.requests.filter(request => request.path === '/tools/catalog')).toHaveLength(2);
  h.clean();
});

test('late owner response cannot overwrite the next tenant member context', async ({ page }) => {
  const h = await fixture(page, { holdFirst: true });
  await h.waitHeld(); h.changeTenant(); await h.invoke('tenant-refresh');
  await expect(page.getByTestId('independent-tool-eligibility')).toContainText('Only the current organization owner');
  await h.release();
  await expect(page.getByTestId('independent-tool-eligibility')).toContainText('Only the current organization owner');
  expect(h.requests.filter(request => request.path === '/tools/catalog').at(-1)?.tenant).toBe('tenant-B');
  h.clean();
});

test('same-user signout and login cannot revive an old owner response', async ({ page }) => {
  const h = await fixture(page, { holdFirst: true }); await h.waitHeld();
  await h.invoke('logout');
  await expect(page.getByTestId('independent-tool-eligibility')).toContainText('Choose an organization');
  h.changeRole(); await h.invoke('login');
  await expect(page.getByTestId('independent-tool-eligibility')).toContainText('Only the current organization owner');
  await h.release();
  await expect(page.getByTestId('independent-tool-eligibility')).toContainText('Only the current organization owner');
  h.clean();
});

for (const width of [390, 1440]) {
  test(`catalog is readable and accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const h = await fixture(page);
    await expect(page.getByTestId('independent-tool-eligibility')).toContainText('once sales open');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]); h.clean();
  });
}
