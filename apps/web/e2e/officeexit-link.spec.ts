import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const web = resolve(import.meta.dirname, '..'), root = resolve(web, '../..');
const require = createRequire(resolve(web, 'package.json'));
const requestId = 'b7d94328-70f2-46d5-ae4b-2da463fd2472';
const consumer = 'https://officeexit.synthetic.test';
const returnUrl = `${consumer}/operatoros/link?request=${requestId}`;
const approveName = 'Approve and continue to OfficeExit';
let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React,{useEffect}from'react';import{createRoot}from'react-dom/client';
      import AuthProvider,{useAuth}from'./src/components/AuthProvider';
      import TenantProvider,{useTenant}from'./src/components/TenantProvider';
      import OfficeExitTenantLink from'./src/components/OfficeExitTenantLink';
      function Probe(){const a=useAuth(),t=useTenant();useEffect(()=>{window.officeexitInvoke=async action=>{
        if(action==='tenant-refresh')return t.refresh();if(action==='auth-refresh')return a.refresh();
        if(action==='logout')return a.logout();if(action==='login')return a.login('fixture@example.test','synthetic-only');
      };});return <OfficeExitTenantLink/>;}
      createRoot(document.getElementById('root')).render(<AuthProvider><TenantProvider><Probe/></TenantProvider></AuthProvider>);` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', outdir: 'synthetic-bundle',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    alias: { '@': resolve(web, 'src'), '@operatoros/sdk': resolve(root, 'packages/sdk/src/index.ts'),
      react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'next-presentation-only', setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|image|link)$/ }, args => ({ path: args.path, namespace: 'presentation' }));
      builder.onLoad({ filter: /.*/, namespace: 'presentation' }, args => ({ loader: 'js', contents: args.path === 'next/navigation'
        ? 'export const usePathname=()=>"/app/tools/officeexit/link";export const useRouter=()=>({replace(){},push(){}});'
        : 'export default function Presentation(){return null;}' }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

type Options = { enabled?: boolean; request?: string; hold?: 'configuration' | 'resolve' | 'approve';
  foreign?: 'configuration' | 'tenant' | 'request'; redirectUrl?: string };
async function fixture(page: Page, options: Options = {}) {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const requests: Array<{ path: string; method: string; tenant?: string; body: unknown }> = [];
  const navigation: string[] = [], external: string[] = [], errors: string[] = [], sockets: string[] = [];
  let signedIn = true, selected = 'tenant-A', enabled = options.enabled ?? true;
  let hold = options.hold;
  let pending: { route: Route; body: unknown } | null = null;
  page.on('pageerror', error => errors.push(error.message));
  await page.context().routeWebSocket('**/*', socket => { sockets.push(socket.url()); socket.close(); });
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === consumer && request.isNavigationRequest() && request.frame() === page.mainFrame()
      && url.pathname === '/operatoros/link' && url.searchParams.size === 1 && url.searchParams.get('request') === requestId
      && !url.hash && !url.username && !url.password) {
      navigation.push(url.href);
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Synthetic OfficeExit consumer</title><main><h1>Synthetic OfficeExit confirmation</h1><p>No live consumer or Supabase was contacted.</p></main></html>' });
    }
    if (url.origin !== origin) { external.push(url.href); return route.abort(); }
    if (url.pathname === '/bundle.js') return route.fulfill({ contentType: 'application/javascript', body: bundle });
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Synthetic OfficeExit linking</title></head><body style="margin:0;background:#0b0f14;color:#f1f5f9;font-family:Arial"><div id="root"></div><script src="/bundle.js"></script></body></html>' });
    if (!url.pathname.startsWith('/api/')) return route.abort();
    const path = url.pathname.slice(4);
    const input = request.postData() ? request.postDataJSON() : null;
    requests.push({ path, method: request.method(), tenant: request.headers()['x-tenant-id'], body: input });
    let body: unknown, status = 200;
    if (path === '/auth/me' || path === '/auth/login') {
      if (path === '/auth/login') signedIn = true;
      status = signedIn ? 200 : 401;
      body = signedIn ? { user: { id: 'user-A', email: 'fixture@example.test', name: 'Synthetic owner', role: 'user',
        platformRole: 'user', status: 'active', currentTenantId: selected }, mfaRequired: false } : { code: 'UNAUTHENTICATED' };
    } else if (path === '/auth/logout') { signedIn = false; body = { ok: true }; }
    else if (path === '/me/tenants') body = { current: selected,
      tenants: [{ id: selected, name: 'Synthetic OperatorOS tenant', slug: 'synthetic', role: 'owner', status: 'active' }] };
    else if (path === '/tools/officeexit/link-configuration') body = {
      enabled, tenantId: options.foreign === 'configuration' ? 'foreign-tenant' : selected,
      ...(enabled ? { officeexitOrigin: consumer } : {}),
    };
    else if (path === '/tools/officeexit/link-requests/resolve') body = {
      requestId: options.foreign === 'request' ? '8cf24f4b-7b7e-4235-aad1-467769bc5727' : requestId,
      tenantId: options.foreign === 'tenant' ? 'foreign-tenant' : selected, tenantName: 'Synthetic OperatorOS tenant',
      officeexitOrganizationId: 'de33a4db-772e-4c15-9298-389c2adb51aa', officeexitUserId: '82d13f3f-0025-41b4-963f-e4b59c108c26',
      officeexitOrganizationName: 'Synthetic OfficeExit organization', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    else if (path === '/tools/officeexit/link-requests/approve') body = { redirectUrl: options.redirectUrl ?? returnUrl };
    else { status = 404; body = { error: 'No fixture for this endpoint' }; }
    const stage = path.endsWith('link-configuration') ? 'configuration' : path.endsWith('/resolve') ? 'resolve' : path.endsWith('/approve') ? 'approve' : null;
    if (hold && stage === hold) { hold = undefined; pending = { route, body }; return; }
    return route.fulfill({ status, json: body });
  });
  await page.goto(`/app/tools/officeexit/link?request=${options.request ?? requestId}`);
  await expect(page.getByRole('heading', { name: 'Connect your OfficeExit organization' })).toBeVisible();
  return {
    requests, navigation,
    approvals() { return requests.filter(r => r.path.endsWith('/approve')); },
    async invoke(action: string) { await page.evaluate(async action => { await (window as any).officeexitInvoke(action); }, action); },
    changeTenant() { selected = 'tenant-B'; enabled = false; },
    disable() { enabled = false; },
    async waitHeld() { await expect.poll(() => Boolean(pending)).toBe(true); },
    async release() { expect(pending).toBeTruthy(); const saved = pending!; pending = null;
      await saved.route.fulfill({ json: saved.body }).catch(() => {});
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))); },
    clean() { expect(errors).toEqual([]); expect(external).toEqual([]); expect(sockets).toEqual([]);
      expect(requests.filter(r => r.method !== 'GET' && !['/auth/login', '/auth/logout',
        '/tools/officeexit/link-requests/resolve', '/tools/officeexit/link-requests/approve'].includes(r.path))).toEqual([]);
      for (const request of requests.filter(r => r.path.endsWith('/resolve') || r.path.endsWith('/approve'))) {
        expect(request.body).toEqual({ requestId }); expect(request.tenant).toBe('tenant-A');
      }
    },
  };
}

test('OfficeExit link default-disabled UI is honest and never resolves or approves', async ({ page }) => {
  const h = await fixture(page, { enabled: false });
  await expect(page.getByRole('alert')).toContainText('not open yet. No connection changed.');
  await expect(page.getByRole('button', { name: approveName })).toHaveCount(0);
  expect(h.requests.filter(r => r.path.endsWith('/resolve') || r.path.endsWith('/approve'))).toEqual([]);
  h.clean();
});

test('OfficeExit link invalid request reference fails before link API requests', async ({ page }) => {
  const h = await fixture(page, { request: 'not-a-reference' });
  await expect(page.getByRole('alert')).toContainText('Start this connection from your OfficeExit organization.');
  expect(h.requests.filter(r => r.path.startsWith('/tools/'))).toEqual([]); h.clean();
});

test('OfficeExit link requires explicit checkbox and keyboard approval, then returns top-level reference only', async ({ page }) => {
  const h = await fixture(page);
  const checkbox = page.getByRole('checkbox'), approve = page.getByRole('button', { name: approveName });
  await expect(approve).toBeDisabled(); expect(h.approvals()).toEqual([]);
  await expect(page.getByText('Synthetic OfficeExit organization', { exact: false })).toBeVisible();
  await page.keyboard.press('Tab'); await expect(checkbox).toBeFocused();
  await page.keyboard.press('Space'); await expect(checkbox).toBeChecked();
  await page.keyboard.press('Tab'); await expect(approve).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Synthetic OfficeExit confirmation' })).toBeVisible();
  expect(h.approvals()).toHaveLength(1); expect(h.navigation).toEqual([returnUrl]);
  expect(page.frames()).toHaveLength(1); expect(page.url()).toBe(returnUrl);
  expect([...new URL(page.url()).searchParams.keys()]).toEqual(['request']);
  expect(page.url()).not.toMatch(/access_token|assertion|jwt|bearer|password|#|token=/i); h.clean();
});

for (const redirectUrl of [
  `https://unexpected.synthetic.test/operatoros/link?request=${requestId}`,
  `${consumer}/unexpected?request=${requestId}`, `${returnUrl}&access_token=synthetic-only`,
  `${returnUrl}#synthetic-token`, `https://synthetic:credential@officeexit.synthetic.test/operatoros/link?request=${requestId}`,
]) {
  test(`OfficeExit link rejects wrong return destination ${redirectUrl}`, async ({ page }) => {
    const h = await fixture(page, { redirectUrl });
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: approveName }).click();
    await expect(page.getByRole('alert')).toContainText('no completed connection is being assumed');
    expect(h.navigation).toEqual([]);
    expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL as string).origin); h.clean();
  });
}

for (const foreign of ['configuration', 'tenant', 'request'] as const) {
  test(`OfficeExit link rejects mismatched ${foreign} context before approval`, async ({ page }) => {
    const h = await fixture(page, { foreign });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0); expect(h.approvals()).toEqual([]); h.clean();
  });
}

for (const hold of ['configuration', 'resolve'] as const) {
  test(`OfficeExit link late ${hold} response cannot revive approval in the next tenant`, async ({ page }) => {
    const h = await fixture(page, { hold }); await h.waitHeld();
    h.changeTenant(); await h.invoke('tenant-refresh');
    await expect(page.getByRole('alert')).toContainText('not open yet'); await h.release();
    await expect(page.getByRole('checkbox')).toHaveCount(0); expect(h.approvals()).toEqual([]); h.clean();
  });
}

test('OfficeExit link same-user logout/login cannot revive a stale review', async ({ page }) => {
  const h = await fixture(page, { hold: 'resolve' }); await h.waitHeld();
  await h.invoke('logout'); h.disable(); await h.invoke('login');
  await expect(page.getByRole('alert')).toContainText('not open yet'); await h.release();
  await expect(page.getByRole('checkbox')).toHaveCount(0); expect(h.approvals()).toEqual([]); h.clean();
});

for (const transition of ['tenant', 'auth'] as const) {
  test(`OfficeExit link stale approval response cannot navigate after ${transition} changes`, async ({ page }) => {
    const h = await fixture(page, { hold: 'approve' });
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: approveName }).click(); await h.waitHeld();
    if (transition === 'tenant') { h.changeTenant(); await h.invoke('tenant-refresh'); }
    else { await h.invoke('logout'); h.disable(); await h.invoke('login'); }
    await expect(page.getByRole('alert')).toContainText('not open yet'); await h.release();
    expect(h.approvals()).toHaveLength(1); expect(h.navigation).toEqual([]); h.clean();
  });
}

for (const width of [390, 1440]) {
  test(`OfficeExit link keyboard/mobile layout and accessibility at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); const h = await fixture(page);
    await expect(page.getByRole('checkbox')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`officeexit-link-${width}-synthetic.png`), fullPage: true }); h.clean();
  });
}
