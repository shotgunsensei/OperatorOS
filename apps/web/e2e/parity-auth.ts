import { expect, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';

export interface ParitySession {
  userId: string;
  tenantId: string;
  email: string;
  password: string;
}

export async function establishParitySession(request: APIRequestContext): Promise<ParitySession> {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `phase21-parity-${nonce}@example.com`;
  const password = 'Phase21-Disposable-Only-9!';
  const registration = await request.post(`${API}/v1/auth/register`, {
    data: { email, password, name: 'Phase 21 Parity' },
  });
  expect(registration.ok(), `register: ${registration.status()} ${await registration.text()}`).toBeTruthy();
  const login = await request.post(`${API}/v1/auth/login`, { data: { email, password } });
  expect(login.ok(), `login: ${login.status()} ${await login.text()}`).toBeTruthy();
  const loginBody = await login.json();
  const tenantsResponse = await request.get(`${API}/v1/me/tenants`);
  expect(tenantsResponse.ok(), `tenants: ${tenantsResponse.status()} ${await tenantsResponse.text()}`).toBeTruthy();
  const tenants = await tenantsResponse.json();
  const tenantId = tenants.current ?? tenants.tenants?.[0]?.id;
  expect(tenantId, 'registration must provision a personal tenant').toBeTruthy();
  const switched = await request.post(`${API}/v1/tenants/${tenantId}/switch`);
  expect(switched.ok(), `tenant switch: ${switched.status()} ${await switched.text()}`).toBeTruthy();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for parity browser setup');
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    const plan = await pg.query<{ id: string }>(`select id from subscription_plans where slug = 'elite' limit 1`);
    if (!plan.rows[0]) throw new Error('Elite plan is not seeded');
    await pg.query(
      `insert into subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
       values ($1, $2, 'active', now(), now() + interval '30 days')`,
      [loginBody.user.id, plan.rows[0].id],
    );
    await pg.query(
      `insert into tenant_modules (tenant_id, module_id, status, source, allow_all_members)
       select $1, id, 'enabled', 'included', true from modules where status = 'active'
       on conflict do nothing`,
      [tenantId],
    );
  } finally {
    await pg.end();
  }
  return { userId: loginBody.user.id, tenantId, email, password };
}
