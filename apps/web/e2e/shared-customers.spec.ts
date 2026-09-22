import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'http://localhost:5000';
const customer = { id: '11111111-1111-4111-8111-111111111111', name: 'Example Workshop', email: 'team@example.test', phone: '+15555550100', address: '101 Example Lane', website: 'https://example.test', contactId: null, version: 1, revision: 'a'.repeat(64) };

async function fixture(page: Page) {
  const state = { fail: false, brands: [] as any[], customers: [] as any[], created: null as any, revoked: false, emailRequest: null as any };
  await page.routeWebSocket('**/*', () => {});
  await page.context().addCookies([{ name: 'operatoros_session', value: 'synthetic-customer-ui', url: WEB, httpOnly: true, sameSite: 'Lax' }]);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== WEB) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname, method = route.request().method();
    const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
    if (path === '/api/auth/me') return reply({ user: { id: 'ui-owner', name: 'Synthetic owner', email: 'owner@example.test', role: 'user', platformRole: 'user', status: 'active', currentTenantId: 'ui-team' } });
    if (path === '/api/me/tenants') return reply({ current: 'ui-team', tenants: [{ id: 'ui-team', name: 'Synthetic team', slug: 'ui-team', role: 'owner', status: 'active' }] });
    if (/^\/api\/modules\/(brandforgeos|snapproofos|tradeflowkit)$/.test(path)) return reply({ module: { slug: path.split('/').at(-1), name: path.split('/').at(-1), status: 'live', baseUrl: '' }, unlocked: true, cta: 'open', module_access_level: 'manager' });
    if (path.endsWith('/shared-customers')) return state.fail ? reply({ error: 'Fixture outage' }, 503) : reply({ customers: [customer], canWrite: true, pagination: { hasMore: false } });
    if (path.includes('/shared-customers/') && method === 'PATCH') return reply({ ...customer, ...route.request().postDataJSON(), revision: 'b'.repeat(64) });
    if (path.endsWith('/brandforgeos/brands')) {
      if (method === 'POST') { state.created = route.request().postDataJSON(); state.brands.push({ ...state.created, id: 'brand-example', sharedCustomer: customer, version: 1 }); return reply(state.brands[0], 201); }
      return reply({ brands: state.brands });
    }
    if (path.endsWith('/snapproofos/customers')) {
      if (method === 'POST') { state.created = route.request().postDataJSON(); state.customers.push({ ...customer, id: 'snap-example', directoryOrganizationId: customer.id, sharedCustomer: customer }); return reply({ customer: state.customers[0] }, 201); }
      return reply({ customers: state.customers });
    }
    if (path.endsWith('/auth/mfa/status')) return reply({ enabled: true, recoveryCodesRemaining: 8 });
    if (path.endsWith('/auth/sessions')) return reply({ sessions: [
      { id: 'current', deviceLabel: 'Chrome on Windows', current: true, lastSeenAt: '2026-09-21T12:00:00Z', moduleSlug: null },
      ...state.revoked ? [] : [{ id: 'other', deviceLabel: 'Firefox on Mac', current: false, lastSeenAt: '2026-09-21T11:00:00Z', moduleSlug: 'brandforgeos' }],
    ] });
    if (path.endsWith('/auth/sessions/other/revoke')) { state.revoked = true; return reply({ revoked: true }); }
    if (path.endsWith('/auth/change-email')) { state.emailRequest = route.request().postDataJSON(); return reply({ pendingVerification: true }, 202); }
    if (path.endsWith('/snapproofos/workspace')) return reply({ counts: {}, cases: [], attachments: {} });
    if (path.includes('/messenger/')) return reply({ conversations: [], members: [], unreadCount: 0 });
    if (path.endsWith('/modules')) return reply({ modules: [] });
    return reply({ error: 'Outside this synthetic presentation test' }, 503);
  });
  return state;
}

test('BrandForge fills a saved customer and preserves its link on desktop and phone', async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`${WEB}/modules/brandforgeos/brands`);
  const picker = page.getByTestId('shared-customer-picker');
  await picker.getByLabel('Use saved customer').selectOption(customer.id);
  await expect(page.getByLabel('Brand name', { exact: true })).toHaveValue(customer.name);
  await expect(picker).toContainText(customer.address);
  await page.getByRole('button', { name: 'Create brand system', exact: true }).click();
  await expect.poll(() => state.created?.directoryOrganizationId).toBe(customer.id);
  await expect(page.getByText(`Shared customer: ${customer.name}`, { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).include('[data-testid="shared-customer-picker"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations.filter(row => ['serious', 'critical'].includes(row.impact ?? ''))).toEqual([]);
  mkdirSync(resolve('../../build/shared-customers'), { recursive: true });
  await picker.getByLabel('Use saved customer').selectOption(customer.id);
  await picker.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve('../../build/shared-customers/brandforge-phone.png') });
});

test('Shared customer editor saves changes with the current revision from the module header', async ({ page }) => {
  await fixture(page);
  await page.goto(`${WEB}/modules/brandforgeos/brands`);
  const header = page.getByTestId('brandforgeos-ecosystem-header');
  await header.locator('summary').click();
  const picker = header.getByTestId('shared-customer-picker');
  await picker.getByLabel('Customer details').selectOption(customer.id);
  await picker.getByRole('button', { name: 'Edit shared details' }).click();
  await picker.getByLabel('Email', { exact: true }).fill('changed@example.test');
  await picker.getByRole('button', { name: 'Save shared details' }).click();
  await expect(picker).toContainText('changed@example.test');
  await expect(picker.getByRole('button', { name: 'Edit shared details' })).toBeVisible();
});

test('SnapProof recovers a failed lookup and uses saved contact details without retyping', async ({ page }) => {
  const state = await fixture(page); state.fail = true;
  await page.goto(`${WEB}/modules/snapproofos/customers`);
  const picker = page.getByTestId('shared-customer-picker');
  await expect(picker.getByRole('alert')).toContainText('Customers could not be loaded');
  state.fail = false; await picker.getByRole('button', { name: 'Try again' }).click();
  await picker.getByLabel('Use saved customer').selectOption(customer.id);
  await page.getByRole('button', { name: 'Use shared customer', exact: true }).click();
  await expect.poll(() => state.created?.directoryOrganizationId).toBe(customer.id);
  await expect(page.getByText('Shared customer: current contact details')).toBeVisible();
});

test('Account settings signs out an individual browser and explains pending email verification', async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`${WEB}/app?page=settings`);
  await expect(page.getByTestId('account-sessions')).toContainText('Firefox on Mac');
  await page.getByRole('button', { name: 'Sign out this browser', exact: true }).click();
  await expect(page.getByTestId('account-sessions')).not.toContainText('Firefox on Mac');
  await page.getByLabel('Authenticator or recovery code', { exact: true }).fill('123456');
  const email = page.getByRole('region', { name: 'Sign-in email' });
  await email.getByLabel('New email', { exact: true }).fill('new@example.test');
  await email.getByLabel('Current password', { exact: true }).fill('synthetic-test-password');
  await email.getByRole('button', { name: 'Confirm new sign-in email' }).click();
  await expect(email).toContainText('Your current sign-in email stays active until you confirm.');
  expect(state.emailRequest.code).toBe('123456');
  await expect(page.getByLabel('Current email', { exact: true })).toHaveValue('owner@example.test');
});
