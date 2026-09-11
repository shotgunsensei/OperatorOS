import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Presentation regression only. Every API response below is synthetic; these
// cases do not establish authentication, persistence, SSO, or provider acceptance.
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5000';
const artifacts = resolve(process.cwd(), '../../build/core-suite-polish');
const modules = { tradeflowkit: 'TradeFlowKit', techdeck: 'TechDeck', pulsedesk: 'PulseDesk' } as const;
type ModuleId = keyof typeof modules;
const tenantId = 'ui-fixture-tenant';
const user = { id: 'ui-fixture-user', name: 'UI Review', email: 'ui-review@example.com', role: 'user', platformRole: 'user', status: 'active', currentTenantId: tenantId };
const pagination = { limit: 50, offset: 0, returned: 0, total: 0 };
const emptyRevenue = { customers: [], jobs: [], quotes: [], invoices: [] };
const emptyOperations = { jobs: [], tasks: [], payments: [], settings: null, pagination, metrics: { leads: 0, jobs: 0, tasks: 0, completed_tasks: 0, invoiced_cents: '0', collected_cents: '0', outstanding_cents: '0' } };
const emptyWorkspace = { configurationItems: [], relationships: [], folders: [], documents: [], evidence: [], reports: [], timeEntries: [], comments: [], alerts: [], lifecycleDue: [], incomplete: [], execution: { enabled: false, reason: 'Documentation only' } };
const dashboard = { metrics: { tickets: 0, openTickets: 0, atRisk: 0, overdue: 0, operationalAssets: 0, pendingSupplyRequests: 0, openFacilityRequests: 0, timeMinutes: 0 }, byStatus: {}, generatedAt: '2026-09-11T12:00:00Z' };
const configuration = { queues: [], teams: [], departments: [], slaPolicies: [], defaults: { categories: ['other', 'equipment'], priorities: ['normal', 'high', 'critical'], types: ['service_request'], statuses: ['open', 'triage', 'resolved'] } };

async function fixture(page: Page, moduleId: ModuleId, options: { viewer?: boolean; denied?: boolean; active?: boolean } = {}) {
  expect(new URL(WEB).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket('**/*', () => {});
  await page.context().addCookies([{ name: 'operatoros_session', value: 'synthetic-ui-only', url: WEB, httpOnly: true, sameSite: 'Lax' }]);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(WEB).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (path === '/api/auth/me') return reply({ user });
    if (path === '/api/me/tenants') return reply({ current: tenantId, tenants: [{ id: tenantId, name: 'Synthetic workspace', slug: 'ui-review', role: options.viewer ? 'viewer' : 'owner' }] });
    if (path === `/api/modules/${moduleId}`) return reply({ module: { slug: moduleId, name: modules[moduleId], status: 'live', baseUrl: '' }, unlocked: !options.denied, cta: options.denied ? 'upgrade' : 'open', module_access_level: options.viewer ? 'viewer' : 'manager' });
    if (route.request().method() !== 'GET') {
      requests.push({ path, body: route.request().postDataJSON() ?? {} });
      // Only emulate the two form responses asserted below, in this private fixture.
      if (path === '/api/modules/techdeck/tickets') return reply({ ...route.request().postDataJSON(), id: 'synthetic-ticket', number: 1, status: 'open', version: 1, createdAt: '2026-09-11T12:00:00Z', updatedAt: '2026-09-11T12:00:00Z' });
      if (path === '/api/modules/pulsedesk/tickets') return reply({ id: 'synthetic-request' });
      return reply({ error: 'No synthetic response for this operation' }, 503);
    }
    if (path.endsWith('/tradeflowkit/operations')) return reply(emptyOperations);
    if (path.endsWith('/tradeflowkit/revenue')) return reply(options.active ? { ...emptyRevenue, invoices: Array.from({ length: 5 }, (_, index) => ({ id: `invoice-${index}`, number: 100 + index, status: 'sent', dueDate: '2020-01-01', balanceCents: 10000, customerId: 'synthetic-customer' })) } : emptyRevenue);
    if (path.endsWith('/techdeck/workspace')) return reply(emptyWorkspace);
    if (path.endsWith('/pulsedesk/dashboard')) return reply(dashboard);
    if (path.endsWith('/pulsedesk/configuration')) return reply(configuration);
    if (path.endsWith('/tickets')) return reply({ tickets: [], pagination });
    if (path.endsWith('/saved-views')) return reply({ savedViews: [] });
    if (path.endsWith('/settings')) return reply({});
    if (path.endsWith('/assets')) return reply({ assets: [] });
    if (path.endsWith('/clients')) return reply({ organizations: [], pagination });
    if (path.endsWith('/facilities')) return reply({ sites: [], pagination });
    if (path.endsWith('/contacts')) return reply({ contacts: [], pagination });
    if (path.endsWith('/assignees')) return reply({ assignees: [], capabilities: { canManageWorkflow: !options.viewer } });
    if (path.endsWith('/search')) return reply({ customers: [], jobs: [], quotes: [], invoices: [] });
    return reply({ error: 'Unavailable in synthetic UI verification' }, 503);
  });
  return { requests, errors };
}

test.use({ video: 'off' });

for (const [moduleId, name] of Object.entries(modules) as [ModuleId, string][]) {
  test(`${name}: synthetic daily view, disclosures, responsive layout and keyboard navigation`, async ({ page }) => {
    const { errors } = await fixture(page, moduleId);
    mkdirSync(artifacts, { recursive: true });
    for (const width of moduleId === 'tradeflowkit' ? [1440, 820, 740, 390] : [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${WEB}/modules/${moduleId}/dashboard`);
      const brief = page.getByTestId(`${moduleId}-workday-brief`);
      await expect(brief).toHaveAttribute('data-state', 'setup');
      await expect(brief.getByLabel('Quick start steps')).toBeVisible();
      const automation = page.getByTestId(`${moduleId}-automation-options`);
      await expect(automation).not.toHaveAttribute('open');
      const summary = automation.locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(automation).toHaveAttribute('open', '');
      await expect(automation.getByRole('link').first()).toHaveAttribute('href', new RegExp(`^/modules/${moduleId}/`));
      await summary.press('Enter');
      await page.getByTestId(`${moduleId}-module-header`).focus();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(artifacts, `${moduleId}-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const axe = await new AxeBuilder({ page }).include(`[data-testid="${moduleId}-module-shell"]`).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical').map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
      if (width === 390) {
        const menu = page.getByRole('button', { name: `Open ${name} navigation`, exact: true });
        await menu.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toBeFocused();
      }
    }
    expect(errors).toEqual([]);
  });

  test(`${name}: synthetic unavailable data never becomes an empty-workspace claim`, async ({ page }) => {
    await fixture(page, moduleId);
    const apiPath = { tradeflowkit: 'operations', techdeck: 'workspace', pulsedesk: 'dashboard' }[moduleId];
    const pattern = `**/api/modules/${moduleId}/${apiPath}`;
    await page.route(pattern, route => route.fulfill({ status: 503, json: { error: 'Synthetic data outage' } }));
    await page.goto(`${WEB}/modules/${moduleId}/dashboard`);
    await expect(page.getByRole('alert').filter({ hasText: /could not load|Synthetic data outage/ }).first()).toBeVisible();
    await expect(page.getByTestId(`${moduleId}-workday-brief`)).toHaveCount(0);
    await page.unroute(pattern);
    await page.getByRole('button', { name: moduleId === 'pulsedesk' ? 'Refresh' : 'Try again', exact: true }).click();
    await expect(page.getByTestId(`${moduleId}-workday-brief`)).toHaveAttribute('data-state', 'setup');
  });
}

test('TradeFlowKit: synthetic ranked priorities preserve every record link and workflow position', async ({ page }) => {
  await fixture(page, 'tradeflowkit', { active: true });
  await page.goto(`${WEB}/modules/tradeflowkit/dashboard`);
  const brief = page.getByTestId('tradeflowkit-workday-brief');
  await expect(brief.getByRole('list', { name: 'Ranked next actions', exact: true }).getByRole('link')).toHaveCount(3);
  await page.getByTestId('tradeflowkit-more-priorities').locator('summary').click();
  await expect(brief.getByRole('list', { name: 'More ranked actions' }).getByRole('link')).toHaveCount(2);
  await expect(brief.getByRole('link', { name: /Invoice #104/ })).toHaveAttribute('href', '/modules/tradeflowkit/invoices/invoice-4');
  await page.goto(`${WEB}/modules/tradeflowkit/quotes`);
  const journey = page.getByTestId('tradeflowkit-journey');
  await expect(journey.locator('[aria-current="step"]')).toContainText('Quote');
  await expect(journey.getByRole('link', { name: 'Job', exact: true })).toHaveAttribute('href', '/modules/tradeflowkit/jobs');
});

test('TechDeck: synthetic form keeps optional deadlines when folded and submits the existing payload', async ({ page }) => {
  const { requests, errors } = await fixture(page, 'techdeck');
  await page.goto(`${WEB}/modules/techdeck/tickets`);
  const form = page.getByTestId('techdeck-ticket-create-form');
  await form.getByLabel('Title *', { exact: true }).fill('Synthetic printer issue');
  await expect(form.getByLabel('Response deadline', { exact: true })).toBeHidden();
  await form.getByText('Response targets (optional)', { exact: true }).click();
  await form.getByLabel('Response deadline', { exact: true }).fill('2026-10-01T12:00');
  await form.getByText('Response targets (optional)', { exact: true }).click();
  await form.getByTestId('techdeck-ticket-create').click();
  await expect.poll(() => requests.find(item => item.path.endsWith('/tickets'))?.body.title).toBe('Synthetic printer issue');
  expect(requests.find(item => item.path.endsWith('/tickets'))?.body.responseDeadline).toMatch(/^2026-10-01T/);
  expect(errors).toEqual([]);
});

test('PulseDesk: synthetic request retains optional routing and requires the privacy acknowledgment', async ({ page }) => {
  const { requests, errors } = await fixture(page, 'pulsedesk');
  await page.goto(`${WEB}/modules/pulsedesk/requests`);
  const form = page.getByTestId('pulsedesk-service-ticket-create');
  await form.getByLabel('Operational request summary').fill('Synthetic supply restock');
  await expect(form.getByLabel('Operational location', { exact: true })).toBeHidden();
  const routing = form.getByText('Location, routing, and response targets', { exact: true });
  await routing.click();
  await form.getByLabel('Operational location', { exact: true }).fill('Supply room');
  await routing.click();
  await form.getByRole('button', { name: 'Create ticket', exact: true }).click();
  expect(requests.filter(item => item.path.endsWith('/tickets'))).toHaveLength(0);
  await form.getByRole('checkbox', { name: /I confirm/ }).check();
  await form.getByRole('button', { name: 'Create ticket', exact: true }).click();
  await expect.poll(() => requests.find(item => item.path.endsWith('/tickets'))?.body.locationLabel).toBe('Supply room');
  expect(requests.find(item => item.path.endsWith('/tickets'))?.body.phiAcknowledged).toBe(true);
  expect(errors).toEqual([]);
});

test('synthetic denied and viewer responses preserve the module access presentation', async ({ page }) => {
  await fixture(page, 'techdeck', { denied: true });
  await page.goto(`${WEB}/modules/techdeck/dashboard`);
  await expect(page.getByTestId('app-shell-not-accessible')).toBeVisible();
  await expect(page.getByTestId('techdeck-workday-brief')).toHaveCount(0);
  await page.unrouteAll();
  await fixture(page, 'pulsedesk', { viewer: true });
  await page.goto(`${WEB}/modules/pulsedesk/requests`);
  await expect(page.getByTestId('pulsedesk-service-read-only')).toBeVisible();
  await expect(page.getByTestId('pulsedesk-service-ticket-create')).toHaveCount(0);
});

test('TradeFlowKit: synthetic dark theme retains contrast in the daily view and phone menu', async ({ page }) => {
  await fixture(page, 'tradeflowkit');
  await page.setViewportSize({ width: 390, height: 960 });
  await page.goto(`${WEB}/modules/tradeflowkit/dashboard`);
  await expect(page.getByTestId('tradeflowkit-workday-brief')).toBeVisible();
  await page.getByRole('button', { name: 'Use dark TradeFlowKit theme' }).click();
  await page.getByTestId('tradeflowkit-automation-options').locator('summary').click();
  const audit = await new AxeBuilder({ page }).include('[data-testid="tradeflowkit-module-shell"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? '')).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).click();
  await page.screenshot({ path: resolve(artifacts, 'tradeflowkit-dark-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open TradeFlowKit navigation', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => getComputedStyle(element).getPropertyValue('--tfk-primary-foreground').trim())).toBe('hsl(220 45% 10%)');
});
