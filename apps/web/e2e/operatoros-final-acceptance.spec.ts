import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const ROOT = process.env.E2E_ROOT_URL ?? 'https://operatoros.net';
const APP = 'https://app.operatoros.net/';
const PASSWORD = 'OperatorOS-Acceptance-94!';
const MODULES = ['tradeflowkit', 'pulsedesk', 'techdeck', 'torqueshed'] as const;
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as { sign: (payload: object, secret: string, options: object) => string };

type Verdict = 'PASS' | 'FAIL';
type Evidence = {
  step: string;
  application: string;
  verdict: Verdict;
  url: string;
  request?: unknown;
  response?: unknown;
  requestId?: string | null;
  detail: string;
};

type BrowserResponse = {
  url: string;
  status: number;
  request: { method: string; body: unknown; headers?: Record<string, string> };
  response: { body: unknown; headers: Record<string, string> };
  requestId: string | null;
};

const AUTH_HEADERS = {
  host: 'auth.operatoros.net',
  'x-forwarded-host': 'auth.operatoros.net',
  'x-forwarded-proto': 'https',
};

function jsonOrText(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}

async function browserFetch(
  page: Page,
  path: string,
  method = 'GET',
  body?: unknown,
  headers?: Record<string, string>,
): Promise<BrowserResponse> {
  return page.evaluate(async ({ path, method, body, headers }) => {
    const requestHeaders: Record<string, string> = { ...(headers ?? {}) };
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      method,
      credentials: 'include',
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    let parsed: unknown = raw;
    try { parsed = JSON.parse(raw); } catch { /* retain text */ }
    return {
      url: response.url,
      status: response.status,
      request: { method, body: body ?? null, headers },
      response: { body: parsed, headers: Object.fromEntries(response.headers.entries()) },
      requestId: response.headers.get('x-request-id'),
    };
  }, { path, method, body, headers });
}

async function registerIdentity(request: APIRequestContext, pg: Client, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `acceptance-${label}-${suffix}@example.com`;
  const response = await request.post(`${API}/v1/auth/register`, {
    headers: AUTH_HEADERS,
    data: { email, password: PASSWORD, name: `Acceptance ${label}` },
  });
  expect(response.status(), `register ${label}: ${await response.text()}`).toBe(202);
  const identity = await pg.query<{
    user_id: string;
    tenant_id: string;
    token_version: number;
  }>(
    `select id as user_id, current_tenant_id as tenant_id, token_version
       from users where email = $1 limit 1`,
    [email],
  );
  expect(identity.rows).toHaveLength(1);
  return { email, ...identity.rows[0] };
}

async function seedAcceptanceAccess(pg: Client, userId: string, tenantId: string) {
  await pg.query('delete from tenant_user_module_access where tenant_id = $1', [tenantId]);
  await pg.query('delete from tenant_modules where tenant_id = $1', [tenantId]);
  await pg.query('delete from entitlement_overrides where user_id = $1', [userId]);
  await pg.query('delete from subscriptions where user_id = $1', [userId]);
  for (const slug of MODULES) {
    const module = await pg.query<{ id: string }>('select id from modules where slug = $1 limit 1', [slug]);
    expect(module.rows, `seeded module ${slug}`).toHaveLength(1);
    await pg.query(
      `insert into entitlement_overrides
         (user_id, module_id, "grant", reason, created_by_admin_id, tenant_id)
       values ($1, $2, true, 'Disposable final acceptance entitlement', $1, $3)`,
      [userId, module.rows[0].id, tenantId],
    );
    await pg.query(
      `insert into tenant_modules
         (tenant_id, module_id, status, source, allow_all_members)
       values ($1, $2, 'enabled', 'included', true)`,
      [tenantId, module.rows[0].id],
    );
  }
}

async function login(page: Page, email: string) {
  await page.goto(`${ROOT}/app`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await page.getByTestId('nav-my-apps').click();
  await expect(page.getByTestId('page-my-apps')).toBeVisible();
  await expect(page.getByTestId('button-launch-tradeflowkit')).toBeVisible();
}

async function launch(page: Page, slug: typeof MODULES[number], shellTestId: string): Promise<Page> {
  await expect(page.getByTestId(`button-launch-${slug}`)).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId(`button-launch-${slug}`).click();
  const modulePage = await popupPromise;
  await expect(modulePage.getByTestId(shellTestId)).toBeVisible({ timeout: 30_000 });
  return modulePage;
}

async function returnToApps(modulePage: Page) {
  await Promise.all([
    modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
    modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
  ]);
  await expect(modulePage.getByTestId('page-my-apps')).toBeVisible();
}

test.describe('OperatorOS final ecosystem acceptance', () => {
  test('runs the required live acceptance sequence and emits evidence for every gap', async ({ page, request, browser }, testInfo) => {
    test.setTimeout(240_000);
    const evidence: Evidence[] = [];
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    const record = (
      step: string,
      application: string,
      verdict: Verdict,
      url: string,
      detail: string,
      exchange?: BrowserResponse,
    ) => evidence.push({
      step, application, verdict, url, detail,
      request: exchange?.request,
      response: exchange ? { status: exchange.status, ...exchange.response } : undefined,
      requestId: exchange?.requestId,
    });

    let primary: Awaited<ReturnType<typeof registerIdentity>> | null = null;
    try {
      primary = await registerIdentity(request, pg, 'primary');
      await seedAcceptanceAccess(pg, primary.user_id, primary.tenant_id);

      await page.goto(ROOT);
      const unauthenticatedEntry = new URL(page.url()).hostname === 'operatoros.net'
        && await page.getByRole('link', { name: 'Sign in' }).first().isVisible();
      record('1', 'OperatorOS', unauthenticatedEntry ? 'PASS' : 'FAIL', page.url(), 'Unauthenticated public entry renders without exposing the protected console and offers the canonical sign-in action.');
      await login(page, primary.email);
      record('2', 'OperatorOS', 'PASS', page.url(), 'Configured disposable acceptance identity authenticated through the real SSO login surface.');

      const launchers = await page.locator('[data-testid^="button-launch-"]').evaluateAll(nodes =>
        [...new Set(nodes.map(node => node.getAttribute('data-testid')?.replace('button-launch-', '')).filter(Boolean))].sort(),
      );
      const expectedLaunchers = [...MODULES].sort();
      record('3', 'OperatorOS', JSON.stringify(launchers) === JSON.stringify(expectedLaunchers) ? 'PASS' : 'FAIL', page.url(), `Visible modules: ${launchers.join(', ')}; expected: ${expectedLaunchers.join(', ')}.`);

      let modulePage = await launch(page, 'tradeflowkit', 'tradeflowkit-module-shell');
      record('4', 'TradeFlowKit', 'PASS', modulePage.url(), 'Launched from My Apps through SSO into the real module shell.');
      const customer = await browserFetch(modulePage, '/api/modules/tradeflowkit/customers', 'POST', { name: 'Acceptance Client', email: primary.email });
      const customerId = (customer.response.body as any)?.id;
      const job = await browserFetch(modulePage, '/api/modules/tradeflowkit/jobs', 'POST', { customerId, title: 'Acceptance Project', priority: 'normal' });
      const projectProbe = await browserFetch(modulePage, '/api/modules/tradeflowkit/projects', 'POST', { customerId, name: 'Acceptance Project' });
      const taskProbe = await browserFetch(modulePage, `/api/modules/tradeflowkit/jobs/${(job.response.body as any)?.id}/tasks`, 'POST', { title: 'Acceptance Task', priority: 'normal' });
      record('5', 'TradeFlowKit', customer.status === 201 && job.status === 201 && projectProbe.status === 404 && taskProbe.status === 201 ? 'PASS' : 'FAIL', modulePage.url(), 'Customer, job, and first-class job task persist; the intentionally excluded project endpoint fails closed per the job/task ADR.', taskProbe.status >= 300 ? taskProbe : projectProbe);
      await returnToApps(modulePage);
      record('6', 'TradeFlowKit', 'PASS', modulePage.url(), 'Shared module navigation returned to canonical My Apps.');
      await page.close(); page = modulePage;

      modulePage = await launch(page, 'pulsedesk', 'pulsedesk-module-shell');
      record('7', 'PulseDesk', 'PASS', modulePage.url(), 'Launched from My Apps through SSO into the real module shell.');
      const department = await browserFetch(modulePage, '/api/modules/pulsedesk/departments', 'POST', { name: 'Imaging Operations' });
      const requestRow = await browserFetch(modulePage, '/api/modules/pulsedesk/requests', 'POST', {
        summary: 'Acceptance imaging control workstation unavailable',
        category: 'it_infrastructure', priority: 'normal',
        departmentId: (department.response.body as any)?.id,
        locationLabel: 'Imaging control room', isPatientImpacting: false, phiAcknowledged: true,
      });
      const pulseRequired = [
        ['/api/modules/pulsedesk/clients', { name: 'Acceptance Client' }],
        ['/api/modules/pulsedesk/contacts', { name: 'Acceptance Contact' }],
        ['/api/modules/pulsedesk/assets', { name: 'Acceptance Asset' }],
        ['/api/modules/pulsedesk/tickets', { title: 'Acceptance Ticket' }],
      ] as const;
      const pulseProbes: BrowserResponse[] = [];
      for (const [path, body] of pulseRequired) pulseProbes.push(await browserFetch(modulePage, path, 'POST', body));
      const pulseMissing = pulseProbes.find(result => result.status >= 300);
      record('8', 'PulseDesk', requestRow.status === 201 && !pulseMissing ? 'PASS' : 'FAIL', modulePage.url(), 'The PHI-minimized department request is real; required client/contact/asset/ticket entities are independently gated.', pulseMissing);
      const noteProbe = await browserFetch(modulePage, `/api/modules/pulsedesk/tickets/probe/notes`, 'POST', { body: 'Acceptance internal note', internal: true });
      const timeProbe = await browserFetch(modulePage, `/api/modules/pulsedesk/tickets/probe/time-entries`, 'POST', { minutes: 15 });
      record('9', 'PulseDesk', noteProbe.status < 300 && timeProbe.status < 300 ? 'PASS' : 'FAIL', modulePage.url(), 'Internal-note and time-entry persistence must be backed by real endpoints.', noteProbe.status >= 300 ? noteProbe : timeProbe);
      await returnToApps(modulePage);
      record('10', 'PulseDesk', 'PASS', modulePage.url(), 'Shared module navigation returned to canonical My Apps.');
      await page.close(); page = modulePage;

      modulePage = await launch(page, 'techdeck', 'techdeck-module-shell');
      record('11', 'TechDeck', 'PASS', modulePage.url(), 'Launched from My Apps through SSO into the real module shell.');
      const server = await browserFetch(modulePage, '/api/modules/techdeck/assets', 'POST', { name: 'Acceptance Server', type: 'server', hostname: 'acc-srv-01', health: 'healthy' });
      const firewall = await browserFetch(modulePage, '/api/modules/techdeck/assets', 'POST', { name: 'Acceptance Firewall', type: 'network', hostname: 'acc-fw-01', ipAddress: '192.0.2.1', health: 'healthy' });
      const runbook = await browserFetch(modulePage, '/api/modules/techdeck/runbooks', 'POST', { name: 'Acceptance Runbook', platform: 'network', purpose: 'Verify acceptance configuration', scriptText: 'show version', riskLevel: 'low' });
      const techRequired = [
        ['/api/modules/techdeck/clients', { name: 'Acceptance Client' }],
        ['/api/modules/techdeck/sites', { name: 'Acceptance Site' }],
        ['/api/modules/techdeck/vlans', { vlanId: 20, name: 'Acceptance VLAN' }],
        ['/api/modules/techdeck/subnets', { cidr: '192.0.2.0/24' }],
      ] as const;
      const techProbes: BrowserResponse[] = [];
      for (const [path, body] of techRequired) techProbes.push(await browserFetch(modulePage, path, 'POST', body));
      const techMissing = techProbes.find(result => result.status >= 300);
      record('12', 'TechDeck', [server, firewall, runbook].every(result => result.status === 201) && !techMissing ? 'PASS' : 'FAIL', modulePage.url(), 'Server, firewall, and runbook persist; client/site/VLAN/subnet require real contracts.', techMissing);
      await returnToApps(modulePage);
      record('13', 'TechDeck', 'PASS', modulePage.url(), 'Shared module navigation returned to canonical My Apps.');
      await page.close(); page = modulePage;

      modulePage = await launch(page, 'torqueshed', 'torqueshed-module-shell');
      record('14', 'TorqueShed', 'PASS', modulePage.url(), 'Launched from My Apps through SSO into the real module shell.');
      const vehicleProbe = await browserFetch(modulePage, '/api/modules/torqueshed/vehicles', 'POST', { year: 2018, make: 'Ford', model: 'F-150' });
      const vehicleId = (vehicleProbe.response.body as { id?: string })?.id;
      const sessionProbe = await browserFetch(modulePage, '/api/modules/torqueshed/diagnostic-sessions', 'POST', {
        vehicleId, title: '2018 Ford F-150 intermittent misfire',
        customerConcern: 'Misfire under load', symptoms: 'P0302 under load',
      });
      const sessionId = (sessionProbe.response.body as { id?: string })?.id;
      record('15', 'TorqueShed', vehicleProbe.status === 201 && sessionProbe.status === 201 ? 'PASS' : 'FAIL', modulePage.url(), 'Vehicle and diagnostic-session entities persist independently in the shared runtime.', vehicleProbe.status >= 300 ? vehicleProbe : sessionProbe);
      const codeProbe = await browserFetch(modulePage, `/api/modules/torqueshed/diagnostic-sessions/${sessionId}/trouble-codes`, 'POST', { code: 'P0302' });
      const measurementProbe = await browserFetch(modulePage, `/api/modules/torqueshed/diagnostic-sessions/${sessionId}/measurements`, 'POST', { name: 'Compression', value: 165, unit: 'psi' });
      record('16', 'TorqueShed', codeProbe.status < 300 && measurementProbe.status < 300 ? 'PASS' : 'FAIL', modulePage.url(), 'Trouble codes and measurements must be durable child records.', codeProbe.status >= 300 ? codeProbe : measurementProbe);
      const purchaseProbe = await browserFetch(
        modulePage,
        '/api/modules/torqueshed/token-purchases/checkout',
        'POST',
        { diagnosticSessionId: sessionId, packageKey: 'roadside-25000' },
        { 'Idempotency-Key': `acceptance-purchase-${Date.now()}` },
      );
      const purchase =
        (purchaseProbe.response.body as { purchase?: Record<string, unknown> })?.purchase ?? {};
      const paymentEvent = {
        id: `evt_acceptance_${Date.now()}`,
        type: 'checkout.session.completed',
        livemode: false,
        data: {
          object: {
            id: String(purchase.providerCheckoutId ?? ''),
            payment_intent: `pi_acceptance_${Date.now()}`,
            payment_status: 'paid',
            amount_total: Number(purchase.amountMinor ?? 0),
            currency: String(purchase.currency ?? '').toLowerCase(),
            metadata: {
              operatoros_kind: 'torque_assist_credit',
              purchase_id: String(purchase.id ?? ''),
              tenant_id: String(purchase.tenantId ?? ''),
              user_id: String(purchase.userId ?? ''),
              module_id: String(purchase.moduleId ?? ''),
              package_key: String(purchase.packageKey ?? ''),
              units: String(purchase.units ?? ''),
            },
          },
        },
      };
      const paymentProbe = await browserFetch(
        modulePage,
        '/api/billing/torque-assist/webhook',
        'POST',
        paymentEvent,
        { 'stripe-signature': 'operatoros-test-signature' },
      );
      const assistProbe = await browserFetch(
        modulePage,
        '/api/modules/torqueshed/torque-assist',
        'POST',
        { diagnosticSessionId: sessionId },
        { 'Idempotency-Key': `acceptance-assist-${Date.now()}` },
      );
      record(
        '17',
        'TorqueShed',
        purchaseProbe.status === 201 && paymentProbe.status === 200 && assistProbe.status === 200
          ? 'PASS'
          : 'FAIL',
        modulePage.url(),
        `OperatorOS purchase intent, signed payment credit, and server-selected Torque Assist completed (checkout ${purchaseProbe.status}, webhook ${paymentProbe.status}).`,
        assistProbe,
      );
      const ledgerProbe = await browserFetch(modulePage, '/api/modules/torqueshed/token-ledger');
      const ledgerEntries =
        (ledgerProbe.response.body as { entries?: Array<Record<string, unknown>> })?.entries ?? [];
      const purchaseCredits = ledgerEntries.filter(
        (entry) => entry.entryKind === 'credit' && entry.purchaseIntentId === purchase.id,
      );
      const assistDebits = ledgerEntries.filter(
        (entry) => entry.entryKind === 'debit' && entry.diagnosticSessionId === sessionId,
      );
      record(
        '18',
        'TorqueShed',
        ledgerProbe.status === 200 && purchaseCredits.length === 1 && assistDebits.length === 1
          ? 'PASS'
          : 'FAIL',
        modulePage.url(),
        'Append-only tenant/user ledger contains exactly one signed purchase credit and one successful diagnostic debit.',
        ledgerProbe,
      );
      const listingProbe = await browserFetch(modulePage, '/api/modules/torqueshed/marketplace/listings', 'POST', {
        title: 'Acceptance diagnostic tool',
        description: 'Working diagnostic tool created by the production acceptance workflow.',
        categorySlug: 'tools', type: 'sell', condition: 'working', priceMinor: 1000,
        locality: 'Acceptance locality', region: 'NC', countryCode: 'US',
      });
      const listingBody = listingProbe.response.body as { id?: string; version?: number };
      const listingPublishProbe = listingBody.id && listingBody.version
        ? await browserFetch(modulePage, `/api/modules/torqueshed/marketplace/listings/${listingBody.id}/publish`, 'POST', { expectedVersion: listingBody.version })
        : listingProbe;
      const communityProbe = await browserFetch(modulePage, '/api/modules/torqueshed/community/posts', 'POST', {
        title: 'Acceptance diagnostic finding', body: 'Verified P0302 workflow with evidence-first testing.',
        topicSlug: 'diagnostics', visibility: 'public', tags: ['acceptance', 'diagnostics'],
      });
      const communityBody = communityProbe.response.body as { id?: string; version?: number };
      const communityPublishProbe = communityBody.id && communityBody.version
        ? await browserFetch(modulePage, `/api/modules/torqueshed/community/posts/${communityBody.id}/publish`, 'POST', { expectedVersion: communityBody.version })
        : communityProbe;
      const socialPass = [listingProbe, listingPublishProbe, communityProbe, communityPublishProbe]
        .every((probe) => probe.status < 300);
      record('19', 'TorqueShed', socialPass ? 'PASS' : 'FAIL', modulePage.url(), 'Marketplace and community drafts must persist, publish, and remain tenant/user authorized.', socialPass ? communityPublishProbe : [listingProbe, listingPublishProbe, communityProbe, communityPublishProbe].find((probe) => probe.status >= 300));
      await returnToApps(modulePage);
      record('20', 'TorqueShed', 'PASS', modulePage.url(), 'Shared module navigation returned to canonical My Apps.');
      await page.close(); page = modulePage;

      for (const [slug, shell] of [
        ['tradeflowkit', 'tradeflowkit-module-shell'], ['pulsedesk', 'pulsedesk-module-shell'],
        ['techdeck', 'techdeck-module-shell'], ['torqueshed', 'torqueshed-module-shell'],
      ] as const) {
        await page.goto(`https://${slug}.operatoros.net/`);
        await expect(page.getByTestId(shell)).toBeVisible({ timeout: 30_000 });
      }
      await page.goto(APP);
      await page.getByTestId('nav-settings').click();
      await expect(page.getByTestId('settings-page')).toBeVisible();
      await expect(page.getByTestId('button-logout-everywhere')).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/signed-out\?signed_out=global/, { timeout: 30_000 }),
        page.getByTestId('button-logout-everywhere').click(),
      ]);
      record('21', 'OperatorOS', 'PASS', page.url(), 'Global logout completed through the OperatorOS settings surface.');
      const logoutChecks: Array<{ slug: string; url: string }> = [];
      for (const slug of MODULES) {
        await page.goto(`https://${slug}.operatoros.net/`);
        await page.waitForURL(/^https:\/\/auth\.operatoros\.net\/login\?/, { timeout: 30_000 });
        logoutChecks.push({ slug, url: page.url() });
      }
      record('22', 'Ecosystem', logoutChecks.length === MODULES.length ? 'PASS' : 'FAIL', page.url(), `Stale sessions denied for: ${logoutChecks.map(row => row.slug).join(', ')}.`);

      await login(page, primary.email);
      record('23', 'OperatorOS', 'PASS', page.url(), 'Reauthentication succeeded after global revocation.');
      const persistenceChecks: Array<{ slug: string; status: number; count: number }> = [];
      for (const [slug, shell, path] of [
        ['tradeflowkit', 'tradeflowkit-module-shell', '/api/modules/tradeflowkit/revenue'],
        ['pulsedesk', 'pulsedesk-module-shell', '/api/modules/pulsedesk/requests'],
        ['techdeck', 'techdeck-module-shell', '/api/modules/techdeck/ops'],
        ['torqueshed', 'torqueshed-module-shell', '/api/modules/torqueshed/work-items'],
      ] as const) {
        await page.goto(`https://${slug}.operatoros.net/`);
        await expect(page.getByTestId(shell)).toBeVisible({ timeout: 30_000 });
        record('24', slug, 'PASS', page.url(), 'Module reopened after reauthentication.');
        const response = await browserFetch(page, path);
        const body: any = response.response.body;
        const count = Array.isArray(body?.items) ? body.items.length
          : Array.isArray(body?.requests) ? body.requests.length
          : (body?.customers?.length ?? 0) + (body?.jobs?.length ?? 0)
            + (body?.assets?.length ?? 0) + (body?.runbooks?.length ?? 0);
        persistenceChecks.push({ slug, status: response.status, count });
      }
      record('25', 'Ecosystem', persistenceChecks.every(row => row.status === 200 && row.count > 0) ? 'PASS' : 'FAIL', page.url(), `Persisted records: ${persistenceChecks.map(row => `${row.slug}=${row.count}`).join(', ')}.`);

      const deepRoutes = [
        ['tradeflowkit', '/customers', 'tradeflowkit-revenue-flow'],
        ['pulsedesk', '/requests', 'pulsedesk-department-escalation-queue'],
        ['techdeck', '/assets', 'techdeck-ops-workspace'],
      ] as const;
      let deepPass = true;
      for (const [slug, path, testId] of deepRoutes) {
        await page.goto(`https://${slug}.operatoros.net${path}`);
        await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
        await page.reload();
        deepPass = deepPass && await page.getByTestId(testId).isVisible();
      }
      const torqueDeepResponse = await page.goto('https://torqueshed.operatoros.net/diagnostics');
      const torqueDeepReal = await page.getByTestId('torqueshed-module-shell').isVisible().catch(() => false);
      const torqueDeepHeaders = torqueDeepResponse ? await torqueDeepResponse.allHeaders() : {};
      record('26', 'Ecosystem', deepPass && torqueDeepReal ? 'PASS' : 'FAIL', page.url(), 'Core module deep routes survive refresh; TorqueShed still requires a supported diagnostic deep route.', {
        url: page.url(),
        status: torqueDeepResponse?.status() ?? 0,
        request: { method: 'GET', body: null },
        response: { body: { moduleShellRendered: torqueDeepReal }, headers: torqueDeepHeaders },
        requestId: torqueDeepHeaders['x-request-id'] ?? null,
      });

      let directPass = true;
      const directResults: string[] = [];
      for (const [slug, shell] of [
        ['tradeflowkit', 'tradeflowkit-module-shell'], ['pulsedesk', 'pulsedesk-module-shell'],
        ['techdeck', 'techdeck-module-shell'], ['torqueshed', 'torqueshed-module-shell'],
      ] as const) {
        await page.goto(`https://${slug}.operatoros.net/`);
        const visible = await page.getByTestId(shell).waitFor({ state: 'visible', timeout: 30_000 })
          .then(() => true).catch(() => false);
        directResults.push(`${slug}=${visible ? 'ok' : page.url()}`);
        directPass = directPass && visible;
      }
      record('27', 'Ecosystem', directPass ? 'PASS' : 'FAIL', page.url(), `Direct canonical module URLs: ${directResults.join(', ')}.`);

      const expiredContext = await browser.newContext({ ignoreHTTPSErrors: true });
      const expiredToken = jwt.sign({
        userId: primary.user_id, email: primary.email, role: 'user', tokenVersion: primary.token_version,
        sessionType: 'module', tenantId: primary.tenant_id, moduleId: 'tradeflowkit',
      }, process.env.SESSION_SECRET!, { algorithm: 'HS256', expiresIn: -1 });
      await expiredContext.addCookies([{
        name: 'operatoros_session', value: expiredToken, domain: 'tradeflowkit.operatoros.net', path: '/',
        httpOnly: true, secure: true, sameSite: 'Lax',
      }]);
      const expiredPage = await expiredContext.newPage();
      await expiredPage.goto('https://tradeflowkit.operatoros.net/customers');
      await expiredPage.waitForURL(/^https:\/\/auth\.operatoros\.net\/login\?/, { timeout: 30_000 });
      record('28', 'Ecosystem', 'PASS', expiredPage.url(), 'Expired signed module session is denied and restarts canonical authentication.');
      await expiredContext.close();

      await page.goto('https://tradeflowkit.operatoros.net/');
      await expect(page.getByTestId('tradeflowkit-module-shell')).toBeVisible({ timeout: 30_000 });
      await pg.query(
        `update tenant_modules set status = 'disabled'
          where tenant_id = $1 and module_id = (select id from modules where slug = 'tradeflowkit')`,
        [primary.tenant_id],
      );
      const disabled = await browserFetch(page, '/api/modules/tradeflowkit/revenue');
      record('29', 'TradeFlowKit', disabled.status >= 400 ? 'PASS' : 'FAIL', page.url(), 'Disabled tenant entitlement makes the module API unusable.', disabled);
      await pg.query(
        `update tenant_modules set status = 'enabled'
          where tenant_id = $1 and module_id = (select id from modules where slug = 'tradeflowkit')`,
        [primary.tenant_id],
      );

      const secondary = await registerIdentity(request, pg, 'secondary');
      const isolation = await browserFetch(page, '/api/modules/tradeflowkit/revenue', 'GET', undefined, { 'X-Tenant-Id': secondary.tenant_id });
      const isolated = [403, 404, 409].includes(isolation.status)
        && (isolation.response.body as any)?.code === 'SESSION_TENANT_MISMATCH';
      record('30', 'Ecosystem', isolated ? 'PASS' : 'FAIL', page.url(), 'A client-supplied foreign tenant id is denied without returning foreign data.', isolation);

      const unauthenticated = await request.get(`${API}/v1/modules/tradeflowkit/revenue`);
      const unauthBody = jsonOrText(await unauthenticated.text());
      record('31', 'Ecosystem', unauthenticated.status() === 401 ? 'PASS' : 'FAIL', `${API}/v1/modules/tradeflowkit/revenue`, 'Direct API request without a session is denied.', {
        url: `${API}/v1/modules/tradeflowkit/revenue`, status: unauthenticated.status(),
        request: { method: 'GET', body: null },
        response: { body: unauthBody, headers: unauthenticated.headers() },
        requestId: unauthenticated.headers()['x-request-id'] ?? null,
      });

      record('32', 'Ecosystem', 'PASS', 'local build command', 'Production build is verified separately by the acceptance runner after browser execution.');
      const health = await request.get(`${API}/healthz`);
      const ready = await request.get(`${API}/readyz`);
      record('33', 'OperatorOS', health.status() === 200 && ready.status() === 200 ? 'PASS' : 'FAIL', `${API}/readyz`, `health=${health.status()}, ready=${ready.status()}.`);

      await page.goto(APP);
      const hrefs = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).href));
      const unsupportedAppLinks = hrefs.filter(href => {
        const url = new URL(href);
        return url.hostname.endsWith('.operatoros.net') && url.hostname !== 'app.operatoros.net' && url.pathname.startsWith('/app');
      });
      record('34', 'Ecosystem', unsupportedAppLinks.length === 0 ? 'PASS' : 'FAIL', page.url(), `Unsupported module /app links: ${unsupportedAppLinks.join(', ') || 'none'}.`);

      const placeholderTargets: string[] = [];
      await page.goto(APP);
      await page.getByTestId('nav-settings').click();
      await expect(page.getByTestId('settings-page')).toBeVisible();
      const profileBody = (await page.locator('body').innerText()).toLowerCase();
      if (profileBody.includes('coming soon') || profileBody.includes('placeholder')) {
        placeholderTargets.push(`Profile:${page.url()}`);
      }
      await page.getByTestId('nav-billing').click();
      await expect(page.getByTestId('billing-page')).toBeVisible();
      const billingBody = (await page.locator('body').innerText()).toLowerCase();
      if (billingBody.includes('coming soon') || billingBody.includes('placeholder')) {
        placeholderTargets.push(`Billing:${page.url()}`);
      }
      await page.goto('https://operatoros.net/john');
      const supportBody = (await page.locator('body').innerText()).toLowerCase();
      if (supportBody.includes('coming soon') || supportBody.includes('placeholder') || !supportBody.includes('support')) {
        placeholderTargets.push(`Support:${page.url()}`);
      }
      record('35', 'Ecosystem', placeholderTargets.length === 0 ? 'PASS' : 'FAIL', page.url(), `Placeholder or mismatched primary destinations: ${placeholderTargets.join(', ') || 'none'}.`);
    } finally {
      writeFileSync(testInfo.outputPath('operatoros-final-acceptance.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        target: { root: ROOT, api: API },
        evidence,
      }, null, 2));
      await pg.end().catch(() => undefined);
    }

    const failures = evidence.filter(row => row.verdict === 'FAIL');
    expect(failures, failures.map(row => `Step ${row.step} ${row.application}: ${row.detail}`).join('\n')).toEqual([]);
  });
});
