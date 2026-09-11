import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Isolated browser fixtures exercise presentation and failure recovery only.
// Real membership, persistence and websocket authorization have API coverage.
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5000';
const artifacts = resolve(process.cwd(), '../../build/ecosystem-polish');
const now = '2026-09-11T12:00:00Z';
const participant = (userId: string, name: string) => ({ userId, name, email: `${userId}@example.invalid`, avatarUrl: null, role: 'member', presence: 'offline', lastSeenAt: null });
const message = (conversationId: string, body = 'The synthetic handoff is ready.') => ({ id: `message-${conversationId}`, conversationId, senderUserId: 'ui-user', senderName: 'Synthetic owner', senderAvatarUrl: null, clientMessageId: 'fixture-id', replyTo: null, body, version: 1, editedAt: null, deletedAt: null, createdAt: now, updatedAt: now });

async function fixture(page: Page, options: { admin?: boolean; outage?: boolean; offline?: boolean } = {}) {
  expect(new URL(WEB).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  const state = { tenantId: 'ui-team-a', outage: !!options.outage, failSend: true, failMessages: false, extraMessage: false, mutations: [] as { path: string; method: string; body: any }[], platformReads: [] as string[] };
  let conversations = ['a', 'b'].map((id, index) => ({ id, kind: 'direct', title: null, participants: [participant('ui-user', 'Synthetic owner'), participant(`colleague-${id}`, index ? 'Morgan Review' : 'Avery Handoff')], unreadCount: index ? 0 : 2, muted: false, version: 1, lastMessage: { ...message(id), deleted: false }, lastMessageAt: now, createdAt: now, updatedAt: now }));
  await page.routeWebSocket('**/*', socket => { if (options.offline) socket.close({ code: 1000 }); });
  await page.context().addCookies([{ name: 'operatoros_session', value: 'synthetic-ui-only', url: WEB, httpOnly: true, sameSite: 'Lax' }]);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(WEB).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname, method = route.request().method();
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    const teams = ['a', 'b'].map(id => ({ id: `ui-team-${id}`, name: `Synthetic team ${id.toUpperCase()}`, slug: `ui-team-${id}`, status: 'active', role: 'owner' }));
    if (path === '/api/auth/me') return reply({ user: { id: 'ui-user', name: 'Synthetic owner', email: 'ui-owner@example.invalid', role: 'user', platformRole: options.admin ? 'super_admin' : 'user', status: 'active', currentTenantId: state.tenantId } });
    if (path === '/api/me/tenants' || path === '/api/me/all-tenants') return reply({ current: state.tenantId, tenants: teams });
    if (path === '/api/health') return reply({ release: { status: 'unavailable' } });
    if (method !== 'GET') state.mutations.push({ path, method, body: route.request().postData() ? route.request().postDataJSON() : {} });
    if (path.match(/^\/api\/tenants\/ui-team-[ab]\/switch$/)) { state.tenantId = path.split('/')[3]; return reply({ ok: true }); }
    if (path === '/api/messenger/members') return reply({ members: ['a', 'b'].map((id, index) => ({ ...participant(`colleague-${id}`, index ? 'Morgan Review' : 'Avery Handoff'), id: `colleague-${id}` })) });
    if (path === '/api/messenger/conversations' && method === 'GET') return reply({ conversations, unreadCount: conversations.reduce((n, c) => n + c.unreadCount, 0) });
    if (path.match(/\/messenger\/conversations\/[ab]\/read$/)) {
      const id = path.split('/')[4]; conversations = conversations.map(c => c.id === id ? { ...c, unreadCount: 0 } : c);
      return reply({ read: { conversationId: id, readAt: now } });
    }
    if (path.match(/\/messenger\/conversations\/[ab]\/messages$/)) {
      const id = path.split('/')[4];
      if (method === 'GET') return state.failMessages ? reply({ error: 'Synthetic message outage' }, 503) : reply({ messages: [message(id), ...(state.extraMessage ? [{ ...message(id, 'Recovered through polling'), id: 'polled-message' }] : [])], hasMore: false });
      if (method === 'POST') {
        if (state.failSend) { state.failSend = false; return reply({ error: 'Synthetic acknowledgment lost' }, 503); }
        return reply({ message: { ...message(id, route.request().postDataJSON().body), id: 'confirmed-message', clientMessageId: route.request().postDataJSON().clientMessageId }, duplicate: true });
      }
    }
    if (path.startsWith('/api/platform/')) {
      state.platformReads.push(path);
      if (state.outage) return reply({ error: 'Synthetic platform outage', code: 'UI_TEST_OUTAGE' }, 503);
      if (path === '/api/platform/stats') return reply({ tenants: { total: 3, byStatus: { active: 2 } }, modules: { total: 13, byStatus: { live: 9 } }, users: { total: 8, active: 7 }, billingEvents: { failed: 2, total: 5 }, callCommandInfrastructure: {}, warnings: [] });
      if (path === '/api/platform/health') return reply({ db: { ok: true }, auth: { sessionSecretConfigured: true }, stripe: { live: false, mode: 'disabled' } });
      if (path === '/api/platform/audit') return reply({ logs: [] });
      if (path === '/api/platform/billing/events') return reply({ events: [], total: 0 });
      return reply({ users: [], tenants: [], modules: [], total: 0 });
    }
    if (path === '/api/billing/subscription') return reply({ subscription: { planSlug: 'starter', status: 'active' } });
    if (path.startsWith('/api/tenants/')) {
      if (state.outage) return reply({ error: 'Synthetic organization outage' }, 503);
      if (path.endsWith('/users')) return reply({ users: [{ id: 'ui-user' }] });
      if (path.endsWith('/invites')) return reply({ invites: [] });
      if (path.endsWith('/modules')) return reply({ modules: [] });
      if (path.endsWith('/activity')) return reply({ recentEvents: [], usageByDay: [], usageByModule: [], moduleUsageTotal30d: 0, aiActions30d: 0, billing: { activePlanSubscriptions: 1, activeAddonSubscriptions: 0, nextRenewal: null, addons: [] } });
    }
    return reply({ error: 'Unavailable in synthetic UI verification' }, 503);
  });
  return state;
}

async function screenshotAndAudit(page: Page, name: string, scope: string) {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}

test('messenger: isolated drafts, unread search, retry identity and accessible confirmation', async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`${WEB}/app?page=command-center`);
  const trigger = page.getByTestId('tenant-messenger-toggle');
  await trigger.click();
  const panel = page.getByTestId('tenant-messenger-panel');
  await panel.getByRole('button', { name: 'Unread (2)', exact: true }).click();
  await expect(page.getByTestId('messenger-conversation-b')).toHaveCount(0);
  await panel.getByRole('button', { name: 'All', exact: true }).click();
  await panel.getByLabel('Search conversations').fill('Morgan');
  await expect(page.getByTestId('messenger-conversation-a')).toHaveCount(0);
  await panel.getByLabel('Search conversations').fill('');
  await page.getByTestId('messenger-conversation-a').click();
  await expect(page.getByTestId('messenger-message-message-a')).toBeVisible();
  await panel.getByLabel('Message', { exact: true }).fill('Draft for Avery');
  await page.getByTestId('messenger-conversation-b').click();
  await expect(panel.getByLabel('Message', { exact: true })).toHaveValue('');
  await panel.getByLabel('Message', { exact: true }).fill('Draft for Morgan');
  await page.getByTestId('messenger-conversation-a').click();
  await expect(panel.getByLabel('Message', { exact: true })).toHaveValue('Draft for Avery');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel.getByRole('alert').filter({ hasText: 'Your draft is kept' })).toBeVisible();
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('messenger-message-confirmed-message')).toBeVisible();
  const sends = state.mutations.filter(m => m.path.endsWith('/messages'));
  expect(sends).toHaveLength(2); expect(sends[1].body).toEqual(sends[0].body);
  await expect(panel.getByLabel('Message', { exact: true })).toHaveValue('');
  await panel.getByRole('button', { name: 'Remove conversation from my history' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(panel).toBeVisible();
  expect(state.mutations.some(m => m.method === 'DELETE')).toBe(false);
  await screenshotAndAudit(page, 'messenger-desktop', '[data-testid="tenant-messenger-panel"]');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('messenger: mobile message-load recovery and explicit recipient selection', async ({ page }) => {
  const state = await fixture(page); state.failMessages = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/app?page=command-center`);
  await page.getByTestId('tenant-messenger-toggle').click();
  await page.getByTestId('messenger-conversation-a').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Synthetic message outage' })).toBeVisible();
  await expect(page.getByText('No messages yet. Start the conversation below.', { exact: true })).toHaveCount(0);
  state.failMessages = false;
  await page.getByRole('button', { name: 'Retry messages' }).click();
  await expect(page.getByTestId('messenger-message-message-a')).toBeVisible();
  await screenshotAndAudit(page, 'messenger-mobile', '[data-testid="tenant-messenger-panel"]');
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  await page.getByRole('button', { name: /Avery Handoff Offline/ }).click();
  await expect(page.getByRole('button', { name: /Avery Handoff Offline/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Morgan Review Offline/ }).click();
  await expect(page.getByLabel('Group name', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create group (3)' })).toBeEnabled();
  expect(state.mutations.some(m => m.path === '/api/messenger/conversations')).toBe(false);
  await screenshotAndAudit(page, 'messenger-recipients-mobile', '[data-testid="tenant-messenger-panel"]');
});

test('organization: recover failed overview, open composer and clear tenant drafts on switch', async ({ page }) => {
  const state = await fixture(page, { outage: true });
  await page.goto(`${WEB}/app?page=command-center`);
  await expect(page.getByRole('alert').filter({ hasText: 'organization overview could not load' })).toBeVisible();
  await expect(page.getByText('Organization totals', { exact: true })).toHaveCount(0);
  state.outage = false;
  await page.getByRole('button', { name: 'Refresh overview' }).click();
  await expect(page.getByText('Organization totals', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start team conversation' }).click();
  await expect(page.getByLabel('Find a teammate')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByTestId('messenger-conversation-a').click();
  await page.getByLabel('Message', { exact: true }).fill('Tenant A private draft');
  await page.keyboard.press('Escape');
  await page.getByTestId('button-tenant-switcher').click();
  await page.getByTestId('tenant-switcher-menu').getByRole('button').filter({ hasText: 'Synthetic team B' }).click();
  await expect(page.getByTestId('text-active-tenant')).toHaveText('Synthetic team B');
  await page.getByTestId('tenant-messenger-toggle').click();
  await page.getByTestId('messenger-conversation-a').click();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('');
  expect(state.tenantId).toBe('ui-team-b');
});

test('platform: failure recovery, actionable billing exception, search and keyboard controls', async ({ page }) => {
  const state = await fixture(page, { admin: true, outage: true });
  await page.goto(`${WEB}/platform`);
  await expect(page.getByRole('alert').filter({ hasText: 'Synthetic platform outage' })).toBeVisible();
  await expect(page.getByTestId('card-tenants')).toHaveCount(0);
  state.outage = false;
  await page.getByTestId('button-error-retry').click();
  await expect(page.getByTestId('platform-attention')).toContainText('2 failed billing events');
  await page.getByLabel('Find an admin control').fill('billing');
  await expect(page.getByTestId('platform-nav-billing')).toBeVisible();
  await expect(page.getByTestId('platform-nav-tenants')).toHaveCount(0);
  await page.getByLabel('Find an admin control').fill('');
  await screenshotAndAudit(page, 'platform-desktop', '[data-testid="platform-command-shell"]');
  await page.getByTestId('card-billing-events').focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/platform\/billing/);
  expect(state.mutations).toHaveLength(0);
});

test('platform and OperatorOS: mobile focus restoration, account menu and responsive overview', async ({ page }) => {
  await fixture(page, { admin: true });
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${WEB}/platform`);
    await expect(page.getByTestId('platform-attention')).toBeVisible();
    const trigger = page.getByTestId('platform-drawer-toggle');
    await trigger.click(); await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await screenshotAndAudit(page, `platform-${width}`, '[data-testid="platform-command-shell"]');
  }
  await page.goto(`${WEB}/app?page=command-center`);
  await expect(page.getByTestId('page-command-center')).toBeVisible();
  const trigger = page.getByTestId('button-open-sidebar');
  await trigger.click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Find a workspace page').fill('members');
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  for (const control of await page.getByTestId('topbar').locator('button, a').all()) {
    const box = await control.boundingBox();
    expect(box, 'topbar controls stay visible').not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await screenshotAndAudit(page, 'organization-mobile', '[data-testid="page-command-center"]');
});

test('platform: ordinary member sees denied shell and never fetches platform records', async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`${WEB}/platform`);
  await expect(page.getByTestId('platform-denied')).toBeVisible();
  expect(state.platformReads).toEqual([]);
  await expect(page.getByTestId('platform-attention')).toHaveCount(0);
});

test('messenger: an open thread recovers new messages when realtime is disconnected', async ({ page }) => {
  const state = await fixture(page, { offline: true });
  await page.clock.install();
  await page.goto(`${WEB}/app?page=command-center`);
  await page.getByTestId('tenant-messenger-toggle').click();
  await page.getByTestId('messenger-conversation-a').click();
  await expect(page.getByTestId('messenger-message-message-a')).toBeVisible();
  state.extraMessage = true;
  await page.clock.fastForward(12_100);
  await expect(page.getByTestId('messenger-message-polled-message')).toHaveText(/Recovered through polling/);
  await expect(page.getByTestId('messenger-message-message-a')).toBeVisible();
});

test('messenger: a delayed send cannot appear in another conversation or erase its draft', async ({ page }) => {
  await fixture(page);
  let finishSend: (() => Promise<void>) | undefined;
  await page.route('**/api/messenger/conversations/a/messages', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise<void>(resolveResponse => {
      finishSend = async () => { await route.fulfill({ json: { message: { ...message('a'), id: 'delayed-message' }, duplicate: false } }); resolveResponse(); };
    });
  });
  await page.goto(`${WEB}/app?page=command-center`);
  await page.getByTestId('tenant-messenger-toggle').click();
  await page.getByTestId('messenger-conversation-a').click();
  await page.getByLabel('Message', { exact: true }).fill('Send only to Avery');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => Boolean(finishSend)).toBe(true);
  await page.getByTestId('messenger-conversation-b').click();
  await expect(page.getByTestId('messenger-message-message-b')).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('Keep Morgan draft');
  await finishSend!();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await expect(page.getByTestId('messenger-message-delayed-message')).toHaveCount(0);
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Keep Morgan draft');
});
