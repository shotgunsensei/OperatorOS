process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-recurring-jobs-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { enqueueDueSchedules } from '../src/lib/shared-schedules-exports.js';
import { processSharedJobBatch } from '../src/lib/shared-background-jobs.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let moduleRow: any;
let insertedModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id, email: user.email, role: user.role,
      tokenVersion: user.tokenVersion, sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('tradeflowkit'); insertedModule = true; }
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]).onConflictDoNothing();
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer',
  }).onConflictDoNothing();
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  app = Fastify();
  await app.register(cookie);
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  await registerModuleShellRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const tenantId of [ownerA?.currentTenantId, ownerB?.currentTenantId].filter(Boolean)) {
    await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id = ${tenantId}`);
    await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id = ${tenantId}`);
    await db.execute(sql`DELETE FROM shared_schedules WHERE tenant_id = ${tenantId}`);
  }
  if (moduleRow) {
    await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id));
    await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id));
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (insertedModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('P24-RECURRING-001: recurring jobs persist, deny viewers and foreign tenants, and replay idempotently', async () => {
  const tenantId = ownerA.currentTenantId;
  const customerResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(ownerA, tenantId),
    payload: { name: 'Recurring Route Customer', email: 'recurring-route@example.test' },
  });
  assert.equal(customerResponse.statusCode, 201, customerResponse.body);
  const customer = customerResponse.json();

  const viewerDenied = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/recurring-jobs', headers: headers(viewer, tenantId),
    payload: { name: 'Denied', customerId: customer.id, title: 'Denied job', intervalDays: 7, nextRunAt: new Date().toISOString() },
  });
  assert.equal(viewerDenied.statusCode, 403, viewerDenied.body);

  const scheduledFor = new Date(Date.now() - 60_000).toISOString();
  const created = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/recurring-jobs', headers: headers(ownerA, tenantId),
    payload: {
      name: 'Weekly service route', customerId: customer.id, title: 'Preventive service visit',
      description: 'Created by the shared scheduler.', priority: 'high', intervalDays: 7,
      durationMinutes: 90, nextRunAt: scheduledFor,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const schedule = created.json().schedule;
  assert.equal(schedule.enabled, true);

  const ownerList = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/recurring-jobs', headers: headers(ownerA, tenantId) });
  assert.equal(ownerList.statusCode, 200, ownerList.body);
  assert.equal(ownerList.json().schedules.length, 1);
  const foreignList = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/recurring-jobs', headers: headers(ownerB, ownerB.currentTenantId) });
  assert.equal(foreignList.statusCode, 200, foreignList.body);
  assert.deepEqual(foreignList.json().schedules, []);

  assert.equal(await enqueueDueSchedules({ limit: 10 }), 1);
  assert.equal(await processSharedJobBatch({ workerId: 'phase24-recurring-worker', limit: 10 }), 1);
  const jobs = await db.execute(sql`
    SELECT id, tenant_id, source_id, status, scheduled_start, scheduled_end
    FROM tradeflowkit_jobs
    WHERE tenant_id = ${tenantId} AND source_id LIKE ${`shared-schedule:${schedule.id}:%`}
  `);
  assert.equal(jobs.rows.length, 1);
  assert.equal(jobs.rows[0].status, 'scheduled');
  assert.equal(new Date(jobs.rows[0].scheduled_end as string).getTime() - new Date(jobs.rows[0].scheduled_start as string).getTime(), 90 * 60_000);

  await db.execute(sql`UPDATE shared_schedules SET next_run_at = ${new Date(scheduledFor)} WHERE tenant_id = ${tenantId} AND id = ${schedule.id}`);
  assert.equal(await enqueueDueSchedules({ limit: 10 }), 1);
  assert.equal(await processSharedJobBatch({ workerId: 'phase24-recurring-replay-worker', limit: 10 }), 0);
  const replayed = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM tradeflowkit_jobs
    WHERE tenant_id = ${tenantId} AND source_id LIKE ${`shared-schedule:${schedule.id}:%`}
  `);
  assert.equal(replayed.rows[0].count, 1);

  const disabled = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/recurring-jobs/${schedule.id}`,
    headers: headers(ownerA, tenantId), payload: { expectedVersion: schedule.version, enabled: false },
  });
  assert.equal(disabled.statusCode, 200, disabled.body);
  assert.equal(disabled.json().schedule.enabled, false);
  const staleMutation = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/recurring-jobs/${schedule.id}`,
    headers: headers(ownerA, tenantId), payload: { expectedVersion: schedule.version, enabled: true },
  });
  assert.equal(staleMutation.statusCode, 409, staleMutation.body);
  const foreignMutation = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/recurring-jobs/${schedule.id}`,
    headers: headers(ownerB, ownerB.currentTenantId), payload: { expectedVersion: disabled.json().schedule.version, enabled: true },
  });
  assert.equal(foreignMutation.statusCode, 409, foreignMutation.body);
});
