import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MODULE_SETUP_GUIDES } from '../src/lib/help/module-setup';

const WEB = 'http://localhost:5000';
const artifacts = resolve(process.cwd(), '../../build/customer-readiness');

async function fixture(page: Page) {
  const state = { fail: true, slow: false, requests: 0, fileStatus: 'unavailable', rescans: 0 };
  await page.routeWebSocket('**/*', () => {});
  await page.context().addCookies([{ name: 'operatoros_session', value: 'synthetic-ui-only', url: WEB, httpOnly: true, sameSite: 'Lax' }]);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== WEB) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
    if (path === '/api/auth/me') return reply({ user: { id: 'ui-owner', name: 'Synthetic owner', email: 'owner@example.invalid', role: 'user', platformRole: 'user', status: 'active', currentTenantId: 'ui-team' } });
    if (path === '/api/me/tenants') return reply({ current: 'ui-team', tenants: [{ id: 'ui-team', name: 'Synthetic team', slug: 'ui-team', role: 'owner', status: 'active' }] });
    if (path === '/api/modules/pulsedesk') return reply({ module: { slug: 'pulsedesk', name: 'PulseDesk', status: 'live', baseUrl: '' }, unlocked: true, cta: 'open', module_access_level: 'manager' });
    if (path.endsWith('/connectors')) {
      state.requests++;
      return state.fail ? reply({ error: 'Synthetic outage' }, 503) : reply({ connectors: [], capabilities: { deterministicTestAdapter: false, liveMailboxAdapters: false } });
    }
    if (path.endsWith('/shared-platform/overview')) {
      state.requests++;
      if (state.slow) await new Promise(resolve => setTimeout(resolve, 1000));
      return state.fail ? reply({ error: 'Synthetic outage' }, 503) : reply({ runtimeProviders: [{ kind: 'email', name: 'resend', state: 'configured' }, { kind: 'sms', name: 'twilio', state: 'disabled' }, { kind: 'ai', name: 'test', state: 'test' }], providers: [], attachments: { storage: { configured: true }, scanner: { configured: true } }, worker: { started: true }, secretVault: { configured: true }, counts: {}, queues: {} });
    }
    if (path.endsWith('/shared-platform/operations')) return reply({ attachments: [{ id: '11111111-1111-4111-8111-111111111111', module_id: 'module-a', original_name: 'Synthetic report.txt', size_bytes: 40, scan_status: state.fileStatus }] });
    if (path.endsWith('/rescan') && route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ moduleSlug: 'snapproofos' });
      state.fileStatus = 'pending'; state.rescans++;
      return reply({ attachmentId: '11111111-1111-4111-8111-111111111111', scanStatus: 'pending' }, 202);
    }
    if (path.endsWith('/webhook-endpoints')) return reply({ endpoints: [] });
    if (path.includes('/data-fabric/')) return reply({ runs: [] });
    if (path.endsWith('/modules')) return reply({ modules: [{ id: 'module-a', slug: 'snapproofos', name: 'SnapProofOS', status: 'active' }] });
    if (path.includes('/messenger/')) return reply({ conversations: [], unreadCount: 0, members: [] });
    if (path === '/api/health') return reply({});
    return reply({ error: 'Not part of this synthetic presentation test' }, 503);
  });
  return state;
}

test('all module setup guides are readable on desktop and phone with working disclosures', async ({ page }) => {
  await fixture(page);
  mkdirSync(artifacts, { recursive: true });
  for (const [slug, guide] of Object.entries(MODULE_SETUP_GUIDES)) {
    await page.goto(`${WEB}/help?guide=${slug}`);
    // Wait for React event handling before testing the native disclosure.
    await page.locator('#help-search').fill('connection');
    await expect(page.getByRole('button', { name: 'Clear help search' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear help search' }).click();
    const setup = page.getByTestId('module-setup-guide');
    await expect(setup).toContainText(guide.firstTask);
    await setup.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(setup.getByRole('link', { name: guide.nextStep })).toHaveAttribute('href', guide.setupHref);
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const audit = await new AxeBuilder({ page }).include('[data-testid="module-setup-guide"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    await setup.screenshot({ path: resolve(artifacts, `${slug}-setup-phone.png`) });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});

test('shared services recovers from failure without showing invented counts or verified delivery', async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`${WEB}/app?page=tenant-shared-services`);
  const screen = page.getByTestId('page-shared-services-admin');
  await expect(screen.getByRole('alert')).toContainText('could not load');
  await expect(screen.getByLabel('Shared service health')).toHaveCount(0);
  await expect(screen.getByTestId('service-readiness')).toHaveCount(0);
  state.fail = false; state.slow = true;
  await screen.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(screen.getByRole('status')).toContainText('Loading');
  await expect(screen.getByTestId('service-readiness')).toHaveCount(0);
  await expect(screen.locator('[data-service="email"]')).toContainText('Configured · test still needed');
  await expect(screen.locator('[data-service="sms"]')).toContainText('Setup needed');
  await expect(screen.locator('[data-service="ai"]')).toContainText('Test mode · no live delivery');
  await expect(screen.locator('[data-service="payments"]')).toContainText('Status unavailable');
  const advanced = screen.locator('details').filter({ has: page.locator('summary', { hasText: 'Advanced connection settings' }) });
  await expect(advanced).not.toHaveAttribute('open');
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await advanced.locator('summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).include('[data-testid="page-shared-services-admin"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? '')).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  mkdirSync(artifacts, { recursive: true });
  await advanced.locator('summary').click();
  await screen.getByRole('heading', { name: 'Shared services', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(artifacts, 'connections-phone.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screen.getByRole('heading', { name: 'Shared services', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(artifacts, 'connections-desktop.png') });
  await screen.getByRole('button', { name: 'Check file again' }).click();
  await expect(screen.getByRole('button', { name: 'Check file again' })).toHaveCount(0);
  await expect(screen.getByTestId('shared-service-operations')).toContainText('Waiting');
  expect(state.rescans).toBe(1);
});

test('PulseDesk connection errors have a retry and do not look like an empty mailbox', async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`${WEB}/modules/pulsedesk/integrations`);
  const screen = page.getByTestId('pulsedesk-connector-console');
  await expect(screen.getByRole('alert')).toContainText('could not load');
  await expect(screen).not.toContainText('No mailbox connections are set up');
  state.fail = false;
  await screen.getByRole('button', { name: 'Try again' }).click();
  await expect(screen).toContainText('Email connections are not available yet');
  await expect(screen).toContainText('No mailbox connections are set up');
  expect(state.requests).toBeGreaterThanOrEqual(2);
});
