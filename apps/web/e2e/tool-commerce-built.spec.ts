import { test, expect } from '@playwright/test';

test('built OfficeExit connection route preserves COOP and honestly closed default without token navigation', async ({ page }) => {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const external: string[] = [], errors: string[] = [], mutations: string[] = [];
  const requestId = '11111111-1111-4111-8111-111111111111';
  await page.context().addCookies([{ name: 'operatoros_session', value: 'inert-cookie-presence-only-no-real-session', url: origin }]);
  page.on('pageerror', error => errors.push(error.message));
  await page.context().routeWebSocket('**/*', socket => socket.close());
  await page.context().route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (request.method() !== 'GET') mutations.push(url.pathname);
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { user: {
      id: 'fixture-owner', email: 'fixture@example.test', name: 'Synthetic owner', role: 'user', platformRole: 'user', status: 'active', currentTenantId: 'fixture-tenant',
    } } });
    if (url.pathname === '/api/me/tenants') return route.fulfill({ json: { current: 'fixture-tenant', tenants: [
      { id: 'fixture-tenant', name: 'Synthetic tenant', slug: 'fixture', role: 'owner', status: 'active' },
    ] } });
    if (url.pathname === '/api/tools/officeexit/link-configuration') return route.fulfill({ json: { enabled: false, tenantId: 'fixture-tenant' } });
    return route.fulfill({ status: 404, json: { code: 'NO_SYNTHETIC_FIXTURE' } });
  });
  const response = await page.goto('/app/tools/officeexit/link?request=' + requestId);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
  await expect(page.getByRole('heading', { name: 'Connect your OfficeExit organization' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /^OfficeExit account linking/ })).toHaveText('OfficeExit account linking is not open yet. No connection changed.');
  await expect(page.getByRole('button', { name: 'Approve and continue to OfficeExit' })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('request')).toBe(requestId);
  expect(mutations).toEqual([]); expect(errors).toEqual([]); expect(external).toEqual([]);
});
