import { test, expect, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

// Real providers/API wrapper and invitation UI; every HTTP boundary is synthetic.
// This verifies client ownership, not server authorization or deployed sessions.
const web = resolve(import.meta.dirname, '..');
const root = resolve(web, '../..');
const require = createRequire(resolve(web, 'package.json'));
const origin = 'http://localhost:55499';
const bundles = new Map<string, string>();
type State = { user: string | null; currentTenant: string | null; authLoading: boolean;
  authError: { code: string } | null; tenants: Array<{ id: string; role: string }>;
  allTenants: Array<{ id: string }>; activeTenant: string | null; activeRole: string | null;
  tenantLoading: boolean; cachedTenant: string | null };
declare global {
  interface Window {
    lifetime: { snapshot: () => State; invoke: (action: string) => Promise<unknown>;
      staleTenantRefresh?: () => Promise<void> };
    remountLifetime: () => void;
    syntheticRouterCalls?: string[];
    lifetimeJobs?: Array<Promise<unknown>>;
  }
}

test.beforeAll(async () => {
  for (const view of ['probe', 'invite']) {
    const contents = view === 'invite'
      ? `import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/app/invites/[token]/page';createRoot(document.getElementById('root')).render(<Page/>);`
      : `import React,{useEffect}from'react';import{createRoot}from'react-dom/client';
      import AuthProvider,{useAuth}from'./src/components/AuthProvider';
      import TenantProvider,{useTenant}from'./src/components/TenantProvider';
      import{meApi}from'./src/lib/auth';
      function Probe(){const a=useAuth(),t=useTenant();
        const snapshot=()=>({user:a.user?.id??null,currentTenant:a.user?.currentTenantId??null,authLoading:a.loading,
          authError:a.authError,tenants:t.tenants,allTenants:t.allTenants,activeTenant:t.activeTenant?.id??null,
          activeRole:t.activeRole,tenantLoading:t.loading,cachedTenant:localStorage.getItem('activeTenantId')});
        useEffect(()=>{window.lifetime={snapshot,invoke:async action=>{
          if(action==='auth-refresh')return a.refresh();if(action==='tenant-refresh')return t.refresh();
          if(action==='login')return a.login('B@synthetic.invalid','synthetic-only');
          if(action==='mfa')return a.completeMfaLogin({code:'000000'});
          if(action==='invite')return a.registerWithInvite('synthetic-only','synthetic-only','Synthetic B');
          if(action==='logout')return a.logout();if(action==='logout-all')return a.logoutEverywhere();
          if(action==='switch')return t.switchTenant('tenant-B');if(action==='read')return meApi.tenants();
          if(action==='capture-stale-tenant')window.staleTenantRefresh=t.refresh;
          if(action==='invoke-stale-tenant')return window.staleTenantRefresh?.();
        }};});return <pre>{JSON.stringify(snapshot())}</pre>;}
      let r;function mount(){r=createRoot(document.getElementById('root'));const app=<AuthProvider><TenantProvider><Probe/></TenantProvider></AuthProvider>;
        r.render(location.search.includes('strict')?<React.StrictMode>{app}</React.StrictMode>:app);}
      window.remountLifetime=()=>{r.unmount();mount();};mount();`;
    const result = await build({ stdin: { contents, resolveDir: web, loader: 'tsx' },
      bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
      alias: { '@': resolve(web, 'src'), '@operatoros/sdk': resolve(root, 'packages/sdk/src/index.ts'),
        react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
      plugins: [{ name: 'synthetic-next-presentation', setup(builder) {
        builder.onResolve({ filter: /^next\/(navigation|image)$/ }, args => ({ path: args.path, namespace: 'synthetic-next' }));
        builder.onLoad({ filter: /.*/, namespace: 'synthetic-next' }, args => ({ loader: 'js', contents: args.path === 'next/navigation'
          ? `export const useParams=()=>({token:'synthetic-invite'});export const useRouter=()=>({replace:path=>{window.syntheticRouterCalls??=[];window.syntheticRouterCalls.push(path);}});`
          : `export default function Image(){return null;}` }));
      } }],
    });
    bundles.set(view, result.outputFiles[0].text);
  }
});

type Response = { status?: number; body: unknown };
const user = (id: string, superAdmin = false) => ({ id, email: `${id}@synthetic.invalid`, name: `Synthetic ${id}`,
  role: 'user', platformRole: superAdmin ? 'super_admin' : 'user', status: 'active',
  createdAt: '2026-10-19T00:00:00.000Z', currentTenantId: `tenant-${id}` });
const tenant = (id: string, role = 'owner') => ({ id: `tenant-${id}`, slug: `synthetic-${id}`, name: `Synthetic organization ${id}`, role });

async function fixture(page: Page, options: { anonymous?: boolean; view?: 'probe' | 'invite'; strict?: boolean; superAdmin?: boolean; selected?: string } = {}) {
  const errors: string[] = []; const external: string[] = [];
  const requests: Array<{ path: string; method: string; tenant: string | null; account: string | null }> = [];
  const holds = new Map<string, string>(); const pending = new Map<string, { route: Route; response: Response }>();
  const responses = new Map<string, Response>();
  let account: string | null = options.anonymous ? null : 'A'; let selected: string | null = options.selected ?? null;
  let navigations = 0;
  const reply = (route: Route, response: Response) => route.fulfill({ status: response.status ?? 200,
    contentType: 'application/json', body: JSON.stringify(response.body) });
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.context().route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    if (url.origin !== origin) { external.push(request.url()); return route.abort(); }
    if (path === '/bundle.js') return route.fulfill({ contentType: 'application/javascript', body: bundles.get(options.view ?? 'probe') });
    if (request.isNavigationRequest()) { navigations++; return route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>' }); }
    requests.push({ path, method: request.method(), tenant: request.headers()['x-tenant-id'] ?? null, account });
    let response: Response;
    if (path === '/api/auth/me') response = account ? { body: { user: { ...user(account, options.superAdmin), currentTenantId: selected ?? `tenant-${account}` } } }
      : { status: 401, body: { code: 'UNAUTHENTICATED' } };
    else if (path === '/api/me/tenants') response = { body: { tenants: account ? [tenant(account), ...(account === 'A' ? [tenant('B', 'viewer')] : [])] : [], current: selected ?? (account ? `tenant-${account}` : null) } };
    else if (path === '/api/tenants' && options.superAdmin) response = { body: { tenants: [tenant('A', 'viewer'), tenant('foreign', 'owner')] } };
    else if (path === '/api/auth/login' || path === '/api/auth/login/mfa' || path === '/api/auth/register-with-invite') {
      if (!responses.has(path)) { account = 'B'; selected = null; }
      response = { body: { user: user('B'), mfaRequired: false } };
    } else if (path === '/api/auth/logout' || path === '/api/auth/logout-all') {
      if (!responses.has(path)) { account = null; selected = null; }
      response = { body: { ok: true } };
    } else if (path === '/api/auth/refresh') response = { body: { ok: true } };
    else if (path === '/api/tenants/tenant-B/switch') { if (!responses.has(path)) selected = 'tenant-B'; response = { body: { ok: true, currentTenantId: selected } }; }
    else if (path === '/api/invites/synthetic-invite/peek') response = { body: { email: 'B@synthetic.invalid', role: 'member', tenantName: 'Synthetic trade organization', status: 'pending' } };
    else throw new Error(`Unexpected synthetic API request ${request.method()} ${path}`);
    response = responses.get(path) ?? response;
    if (holds.has(path)) { const name = holds.get(path)!; holds.delete(path); pending.set(name, { route, response }); return; }
    await reply(route, response);
  });
  await page.goto(`${origin}${options.view === 'invite' ? '/app/invites/synthetic-invite' : '/app'}${options.strict ? '?strict=1' : ''}`);
  if (options.view === 'invite') await expect(page.getByTestId('text-invite-error')).toBeVisible();
  else await page.waitForFunction(() => window.lifetime && !window.lifetime.snapshot().authLoading && !window.lifetime.snapshot().tenantLoading);
  return { requests,
    snapshot: () => page.evaluate(() => window.lifetime.snapshot()),
    invoke: (action: string) => page.evaluate(action => window.lifetime.invoke(action), action),
    start: (action: string) => page.evaluate(action => {
      window.lifetimeJobs ??= [];
      return window.lifetimeJobs.push(window.lifetime.invoke(action)) - 1;
    }, action),
    async finished(job: number) {
      await page.evaluate(async job => { await window.lifetimeJobs?.[job]; }, job);
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    },
    hold(path: string, name: string) { holds.set(`/api${path}`, name); },
    respond(path: string, response: Response) { responses.set(`/api${path}`, response); },
    setAccount(id: string | null) { account = id; selected = null; },
    async wait(name: string) { await expect.poll(() => pending.has(name)).toBe(true); },
    async release(name: string, override?: Response, allowReloadCancellation = false) {
      const held = pending.get(name); expect(held).toBeTruthy(); pending.delete(name);
      const response = allowReloadCancellation ? null : page.waitForResponse(response => response.request() === held!.route.request());
      try {
        await reply(held!.route, override ?? held!.response);
        if (response) expect(await (await response).finished()).toBeNull();
        return 'delivered';
      }
      catch (error) {
        if (!allowReloadCancellation) throw error;
        // Only the explicitly asserted hard-reload control can discard its
        // old document's interception. Same-document proofs must deliver.
        return 'discarded-after-reload';
      }
    },
    navigations: () => navigations,
    async settle() { await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))); },
    clean() { expect(errors).toEqual([]); expect(external).toEqual([]); },
  };
}

for (const strict of [false, true]) {
  test(`cold authenticated and signed-out providers work${strict ? ' in StrictMode' : ''}`, async ({ page }) => {
    const h = await fixture(page, { strict });
    expect((await h.snapshot()).activeTenant).toBe('tenant-A');
    await h.invoke('logout');
    await expect.poll(async () => (await h.snapshot()).cachedTenant).toBeNull();
    expect((await h.snapshot()).user).toBeNull(); h.clean();
  });
}
test('anonymous initial 401 clears identity and context', async ({ page }) => {
  const h = await fixture(page, { anonymous: true }); expect((await h.snapshot()).user).toBeNull();
  expect((await h.snapshot()).tenants).toEqual([]); expect((await h.snapshot()).cachedTenant).toBeNull(); h.clean();
});

for (const endpoint of ['auth', 'tenant']) {
  for (const finish of ['logout', 'login', 'mfa', 'invite']) {
    for (const failure of [false, true]) {
      test(`old ${endpoint} ${failure ? 'failure' : 'success'} cannot overwrite ${finish}`, async ({ page }) => {
        const h = await fixture(page);
        h.hold(endpoint === 'auth' ? '/auth/me' : '/me/tenants', 'old');
        const old = await h.start(`${endpoint}-refresh`); await h.wait('old');
        await h.invoke('logout');
        if (finish !== 'logout') await h.invoke(finish);
        await expect.poll(async () => (await h.snapshot()).user).toBe(finish === 'logout' ? null : 'B');
        await page.waitForFunction(() => !window.lifetime.snapshot().tenantLoading);
        await h.release('old', failure ? { status: 401, body: { code: 'ACCOUNT_SUSPENDED' } } : undefined);
        await h.finished(old);
        const state = await h.snapshot();
        expect(state.user).toBe(finish === 'logout' ? null : 'B');
        expect(state.activeTenant).toBe(finish === 'logout' ? null : 'tenant-B');
        expect(state.cachedTenant).toBe(finish === 'logout' ? null : 'tenant-B');
        expect(state.authError).toBeNull(); expect(state.authLoading).toBe(false); expect(state.tenantLoading).toBe(false);
        if (finish !== 'logout') { await h.invoke('read'); expect(h.requests.at(-1)?.tenant).toBe('tenant-B'); }
        expect(h.navigations()).toBe(1); h.clean();
      });
    }
  }
}

for (const endpoint of ['auth', 'tenant']) {
  test(`latest overlapping ${endpoint} read owns success/error/finally`, async ({ page }) => {
    const h = await fixture(page); const path = endpoint === 'auth' ? '/auth/me' : '/me/tenants';
    h.hold(path, 'old'); const old = await h.start(`${endpoint}-refresh`); await h.wait('old');
    h.hold(path, 'new'); const fresh = await h.start(`${endpoint}-refresh`); await h.wait('new');
    await h.release('old', { status: 503, body: { error: 'old unavailable' } }); await h.finished(old);
    if (endpoint === 'tenant') expect((await h.snapshot()).tenantLoading).toBe(true);
    await h.release('new'); await h.finished(fresh); await page.waitForFunction(() => !window.lifetime.snapshot().tenantLoading);
    expect((await h.snapshot()).user).toBe('A'); expect((await h.snapshot()).activeTenant).toBe('tenant-A'); h.clean();
  });
  test(`latest completed ${endpoint} read rejects an older successful response`, async ({ page }) => {
    const h = await fixture(page); h.hold(endpoint === 'auth' ? '/auth/me' : '/me/tenants', 'old');
    const old = await h.start(`${endpoint}-refresh`); await h.wait('old');
    if (endpoint === 'auth') h.setAccount('B');
    else h.respond('/me/tenants', { body: { tenants: [tenant('B', 'viewer')], current: 'tenant-B' } });
    await h.invoke(`${endpoint}-refresh`);
    await expect.poll(async () => (await h.snapshot()).activeTenant).toBe('tenant-B');
    await h.release('old'); await h.finished(old);
    expect((await h.snapshot()).activeTenant).toBe('tenant-B');
    expect((await h.snapshot()).user).toBe(endpoint === 'auth' ? 'B' : 'A'); h.clean();
  });
}

for (const failure of [false, true]) {
  test(`old membership ${failure ? 'failure' : 'success'} cannot expose A or finish B's pending load`, async ({ page }) => {
    const h = await fixture(page); h.hold('/me/tenants', 'old'); const old = await h.start('tenant-refresh'); await h.wait('old');
    await h.invoke('logout'); h.hold('/me/tenants', 'new'); await h.invoke('login'); await h.wait('new');
    await h.release('old', failure ? { status: 503, body: { error: 'old failed' } } : undefined); await h.finished(old);
    const state = await h.snapshot(); expect(state.user).toBe('B'); expect(state.tenants).toEqual([]);
    expect(state.activeRole).toBeNull(); expect(state.tenantLoading).toBe(true); expect(state.cachedTenant).toBe('tenant-B');
    await h.release('new'); await expect.poll(async () => (await h.snapshot()).activeTenant).toBe('tenant-B'); h.clean();
  });
}

for (const transition of ['login', 'logout', 'logout-all']) {
  test(`incidental reads and renewal cannot supersede pending ${transition}`, async ({ page }) => {
    const h = await fixture(page); const path = transition === 'logout-all' ? '/auth/logout-all' : `/auth/${transition}`;
    h.hold(path, 'transition'); const operation = await h.start(transition); await h.wait('transition');
    const count = h.requests.filter(r => r.path === '/api/auth/me' || r.path === '/api/auth/refresh').length;
    await h.invoke('auth-refresh'); await page.clock.fastForward(30 * 60 * 1000);
    expect(h.requests.filter(r => r.path === '/api/auth/me' || r.path === '/api/auth/refresh')).toHaveLength(count);
    await h.release('transition'); await h.finished(operation);
    await expect.poll(async () => (await h.snapshot()).user).toBe(transition === 'login' ? 'B' : null);
    expect((await h.snapshot()).authLoading).toBe(false); h.clean();
  });
}

test('failed global sign-out preserves current identity and pending membership read', async ({ page }) => {
  const h = await fixture(page); h.hold('/me/tenants', 'tenant'); const old = await h.start('tenant-refresh'); await h.wait('tenant');
  h.respond('/auth/logout-all', { status: 503, body: { error: 'synthetic unavailable' } });
  await expect(h.invoke('logout-all')).rejects.toBeTruthy();
  await h.release('tenant'); await h.finished(old); await page.waitForFunction(() => !window.lifetime.snapshot().tenantLoading);
  expect((await h.snapshot()).user).toBe('A'); expect((await h.snapshot()).cachedTenant).toBe('tenant-A'); h.clean();
});
test('MFA challenge does not commit a user; completion does', async ({ page }) => {
  const h = await fixture(page, { anonymous: true }); h.respond('/auth/login', { body: { mfaRequired: true } });
  expect(await h.invoke('login')).toEqual({ mfaRequired: true }); expect((await h.snapshot()).user).toBeNull();
  await h.invoke('mfa'); await expect.poll(async () => (await h.snapshot()).activeTenant).toBe('tenant-B'); h.clean();
});
test('failed sign-in preserves current identity and allows later refresh', async ({ page }) => {
  const h = await fixture(page); h.respond('/auth/login', { status: 401, body: { code: 'INVALID_CREDENTIALS' } });
  await expect(h.invoke('login')).rejects.toBeTruthy(); await h.invoke('auth-refresh');
  await page.waitForFunction(() => !window.lifetime.snapshot().tenantLoading);
  expect((await h.snapshot()).user).toBe('A'); expect((await h.snapshot()).cachedTenant).toBe('tenant-A'); h.clean();
});
test('ordinary same-account refresh completes with current memberships', async ({ page }) => {
  const h = await fixture(page); await h.invoke('auth-refresh');
  await page.waitForFunction(() => !window.lifetime.snapshot().tenantLoading);
  expect((await h.snapshot()).user).toBe('A'); expect((await h.snapshot()).activeRole).toBe('owner');
  expect((await h.snapshot()).cachedTenant).toBe('tenant-A'); h.clean();
});
test('local logout still clears client identity when its API fails', async ({ page }) => {
  const h = await fixture(page); h.respond('/auth/logout', { status: 503, body: { error: 'synthetic unavailable' } });
  await h.invoke('logout'); await expect.poll(async () => (await h.snapshot()).cachedTenant).toBeNull();
  expect((await h.snapshot()).user).toBeNull(); expect((await h.snapshot()).authLoading).toBe(false); h.clean();
});
test('successful login finishes loading despite an unresolved cold auth read', async ({ page }) => {
  const h = await fixture(page); h.hold('/auth/me', 'cold'); await page.evaluate(() => window.remountLifetime()); await h.wait('cold');
  await page.waitForFunction(() => window.lifetime.snapshot().authLoading);
  await h.invoke('login'); await expect.poll(async () => (await h.snapshot()).user).toBe('B');
  expect((await h.snapshot()).authLoading).toBe(false);
  await h.release('cold'); await h.settle(); expect((await h.snapshot()).user).toBe('B'); h.clean();
});
test('invite login retains personal-tenant fallback before membership read completes', async ({ page }) => {
  const h = await fixture(page); h.setAccount('B'); h.hold('/me/tenants', 'tenant');
  h.respond('/auth/register-with-invite', { body: { user: { ...user('B'), currentTenantId: null }, personalTenantId: 'tenant-B' } });
  await h.invoke('invite'); await h.wait('tenant');
  expect((await h.snapshot()).user).toBe('B'); expect((await h.snapshot()).cachedTenant).toBe('tenant-B');
  await h.release('tenant'); await expect.poll(async () => (await h.snapshot()).activeTenant).toBe('tenant-B'); h.clean();
});
test('same-ID fresh login rejects stale membership lifetime and stale callback dispatch', async ({ page }) => {
  const h = await fixture(page); await h.invoke('capture-stale-tenant'); h.hold('/me/tenants', 'old');
  const old = await h.start('tenant-refresh'); await h.wait('old');
  h.respond('/auth/login', { body: { user: user('A') } }); await h.invoke('login');
  await page.waitForFunction(() => !window.lifetime.snapshot().tenantLoading);
  const count = h.requests.length; await h.invoke('invoke-stale-tenant'); expect(h.requests).toHaveLength(count);
  await h.release('old', { body: { tenants: [tenant('foreign')], current: 'tenant-foreign' } }); await h.finished(old);
  expect((await h.snapshot()).activeTenant).toBe('tenant-A'); h.clean();
});
test('unmounted providers cannot overwrite a newly mounted identity', async ({ page }) => {
  const h = await fixture(page); h.hold('/auth/me', 'old-auth'); h.hold('/me/tenants', 'old-tenant');
  const oldAuth = await h.start('auth-refresh'); await h.wait('old-auth'); const oldTenant = await h.start('tenant-refresh'); await h.wait('old-tenant');
  h.setAccount('B'); await page.evaluate(() => window.remountLifetime());
  await page.waitForFunction(() => window.lifetime.snapshot().user === 'B' && !window.lifetime.snapshot().tenantLoading);
  await h.release('old-auth'); await h.release('old-tenant'); await h.finished(oldAuth); await h.finished(oldTenant);
  expect((await h.snapshot()).user).toBe('B'); expect((await h.snapshot()).cachedTenant).toBe('tenant-B'); h.clean();
});
test('late renewal 401 from an earlier identity cannot start a new auth read', async ({ page }) => {
  const h = await fixture(page); h.hold('/auth/refresh', 'renew'); await page.clock.fastForward(30 * 60 * 1000); await h.wait('renew');
  await h.invoke('logout'); await h.invoke('login'); await page.waitForFunction(() => !window.lifetime.snapshot().tenantLoading);
  const count = h.requests.filter(r => r.path === '/api/auth/me').length;
  await h.release('renew', { status: 401, body: { error: 'old renewal' } }); await h.settle();
  expect(h.requests.filter(r => r.path === '/api/auth/me')).toHaveLength(count); expect((await h.snapshot()).user).toBe('B'); h.clean();
});
test('super-admin lists preserve member role precedence', async ({ page }) => {
  const h = await fixture(page, { superAdmin: true }); expect((await h.snapshot()).activeRole).toBe('owner');
  expect((await h.snapshot()).allTenants).toHaveLength(2); h.clean();
});
test('super-admin current non-member organization remains selectable without an invented member role', async ({ page }) => {
  const h = await fixture(page, { superAdmin: true, selected: 'tenant-foreign' });
  expect((await h.snapshot()).activeTenant).toBe('tenant-foreign'); expect((await h.snapshot()).activeRole).toBeNull(); h.clean();
});
test('normal organization switch still reloads and discards held old reads', async ({ page }) => {
  const h = await fixture(page); h.hold('/me/tenants', 'old'); await h.start('tenant-refresh'); await h.wait('old');
  await h.start('switch'); await expect.poll(h.navigations).toBe(2);
  await page.waitForFunction(() => window.lifetime.snapshot().activeTenant === 'tenant-B' && !window.lifetime.snapshot().tenantLoading);
  const delivery = await h.release('old', undefined, true);
  test.info().annotations.push({ type: 'old-route-after-asserted-reload', description: delivery });
  await h.settle(); expect((await h.snapshot()).activeTenant).toBe('tenant-B');
  expect((await h.snapshot()).activeRole).toBe('viewer'); h.clean();
});
test('failed organization switch preserves current context and does not reload', async ({ page }) => {
  const h = await fixture(page); h.respond('/tenants/tenant-B/switch', { status: 404, body: { code: 'TENANT_NOT_FOUND' } });
  await expect(h.invoke('switch')).rejects.toBeTruthy(); expect((await h.snapshot()).activeTenant).toBe('tenant-A');
  expect(h.navigations()).toBe(1); h.clean();
});
test('stale awaited organization switch cannot overwrite a new identity or reload it', async ({ page }) => {
  const h = await fixture(page); h.hold('/tenants/tenant-B/switch', 'switch'); const operation = await h.start('switch'); await h.wait('switch');
  await h.invoke('logout'); await h.invoke('login'); await page.waitForFunction(() => !window.lifetime.snapshot().tenantLoading);
  await h.release('switch'); await h.finished(operation); expect((await h.snapshot()).user).toBe('B');
  expect((await h.snapshot()).cachedTenant).toBe('tenant-B'); expect(h.navigations()).toBe(1); h.clean();
});

test('actual invitation renewal cannot restore the previous account after inline sign-in', async ({ page }) => {
  const h = await fixture(page, { view: 'invite' });
  h.respond('/auth/refresh', { status: 401, body: { error: 'synthetic renewal' } });
  h.hold('/auth/me', 'old-auth'); await page.clock.fastForward(30 * 60 * 1000); await h.wait('old-auth');
  await page.getByRole('button', { name: 'Sign in as B@synthetic.invalid', exact: true }).click();
  await page.getByTestId('form-invite-login').locator('input[type=password]').fill('synthetic-only');
  await page.getByTestId('button-invite-login').click();
  await expect(page.getByTestId('panel-invite-decision')).toContainText('Signed in as B@synthetic.invalid');
  const response = page.waitForResponse(response => response.url() === `${origin}/api/auth/me`);
  await h.release('old-auth'); expect(await (await response).finished()).toBeNull();
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await expect(page.getByTestId('panel-invite-decision')).toContainText('Signed in as B@synthetic.invalid');
  await expect(page.getByTestId('text-invite-error')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('activeTenantId'))).toBe('tenant-B');
  expect(h.navigations()).toBe(1); h.clean();
});
