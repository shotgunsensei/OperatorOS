import { expect, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';
import { assertLocalBrowserTestEnvironment } from '../../../scripts/parity/lib/database.mjs';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';

export interface ParitySession {
  userId: string;
  tenantId: string;
  email: string;
  password: string;
}

export async function establishParitySession(request: APIRequestContext): Promise<ParitySession> {
  const browserSafety = assertLocalBrowserTestEnvironment(process.env);
  const productionHosts = process.env.E2E_PRODUCTION_HOSTS === '1';
  // Production sessions are Secure. Route setup through the local TLS proxy so
  // Playwright stores and reuses that cookie without weakening production
  // cookie policy or contacting a deployed host.
  const apiBase = productionHosts ? 'https://127.0.0.1/api' : `${API}/v1`;
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `phase21-parity-${nonce}@example.com`;
  const password = 'Phase21-Disposable-Only-9!';
  const authHeaders = productionHosts ? {
    host: 'operatoros.net',
    'x-forwarded-host': 'operatoros.net',
    'x-forwarded-proto': 'https',
    'x-forwarded-for': `10.89.0.${10 + Math.floor(Math.random() * 200)}`,
  } : undefined;
  const registration = await request.post(`${apiBase}/auth/register`, {
    headers: authHeaders,
    data: { email, password, name: 'Phase 21 Parity' },
  });
  expect(registration.ok(), `register: ${registration.status()} ${await registration.text()}`).toBeTruthy();
  const login = await request.post(`${apiBase}/auth/login`, { headers: authHeaders, data: { email, password } });
  expect(login.ok(), `login: ${login.status()} ${await login.text()}`).toBeTruthy();
  const loginBody = await login.json();
  const tenantsResponse = await request.get(`${apiBase}/me/tenants`);
  expect(tenantsResponse.ok(), `tenants: ${tenantsResponse.status()} ${await tenantsResponse.text()}`).toBeTruthy();
  const tenants = await tenantsResponse.json();
  const tenantId = tenants.current ?? tenants.tenants?.[0]?.id;
  expect(tenantId, 'registration must provision a personal tenant').toBeTruthy();
  const switched = await request.post(`${apiBase}/tenants/${tenantId}/switch`);
  expect(switched.ok(), `tenant switch: ${switched.status()} ${await switched.text()}`).toBeTruthy();

  const databaseUrl = browserSafety.database.url;
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    // Keep the credential unique while making the customer-visible tenant
    // label deterministic. Random glyph widths can otherwise change line
    // wrapping and invalidate an unrelated visual baseline on narrow screens.
    await pg.query(
      `update tenants set name = 'Phase 21 Parity Tenant' where id = $1`,
      [tenantId],
    );
    const plan = await pg.query<{ id: string }>(`select id from subscription_plans where slug = 'elite' limit 1`);
    if (!plan.rows[0]) throw new Error('Elite plan is not seeded');
    // The parity account intentionally represents a customer whose Elite
    // contract existed before the v60 commerce cutover. New legacy-shaped
    // rows must not gain application access, so the fixture has to carry the
    // explicit one-time grandfather marker and trusted tenant scope.
    await pg.query(
      `insert into subscriptions
         (user_id, plan_id, status, current_period_start, current_period_end,
          tenant_id, scope_type, legacy_access_grandfathered_at)
       values ($1, $2, 'active', now(), now() + interval '30 days',
          $3, 'tenant', clock_timestamp())`,
      [loginBody.user.id, plan.rows[0].id, tenantId],
    );
    await pg.query(
      `insert into tenant_modules (tenant_id, module_id, status, source, allow_all_members)
       select $1, id, 'enabled', 'included', true from modules where status = 'live'
       on conflict (tenant_id, module_id) do update
       set status = 'enabled',
           source = 'included',
           allow_all_members = true,
           updated_at = now()`,
      [tenantId],
    );
  } finally {
    await pg.end();
  }
  const moduleAccess = await request.get(`${apiBase}/me/modules`);
  expect(
    moduleAccess.ok(),
    `parity module access: ${moduleAccess.status()} ${await moduleAccess.text()}`,
  ).toBeTruthy();
  const moduleAccessBody = await moduleAccess.json() as { modules?: Array<{ slug: string }> };
  expect(
    moduleAccessBody.modules?.map(module => module.slug),
    'parity fixture must grant the flagship and companion modules used by visual acceptance',
  ).toEqual(expect.arrayContaining(['brandforgeos', 'tradeflowkit']));
  return { userId: loginBody.user.id, tenantId, email, password };
}
