process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-retention-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed, directoryOrganizations, tenantModules, tenantUserModuleAccess, tenantUsers,
  tradeflowkitCustomers, tradeflowkitInvoices, tradeflowkitJobs,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let moduleRow: any;
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

async function createApp(tradeflowOnly = false) {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const instance = Fastify();
  await instance.register(cookie);
  if (tradeflowOnly) {
    const { registerTradeFlowKitRoutes } = await import('../src/routes/tradeflowkit-routes.js');
    await registerTradeFlowKitRoutes(instance);
  } else {
    const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
    await registerModuleShellRoutes(instance);
  }
  await instance.ready();
  return instance;
}

async function createCustomer(user: any, tenantId: string, name: string) {
  const response = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(user, tenantId),
    payload: { name, email: `${name.toLowerCase().replaceAll(' ', '-')}@example.com` },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser(); viewer = await createTestUser();
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer',
  });
  app = await createApp();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('retention workspace lists and safely restores tenant records in dependency order', async () => {
  const tenantA = ownerA.currentTenantId;
  const tenantB = ownerB.currentTenantId;
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/trash' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const invalidLimit = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/trash?limit=101', headers: headers(ownerA, tenantA) });
  assert.equal(invalidLimit.statusCode, 400, invalidLimit.body);

  const customer = await createCustomer(ownerA, tenantA, 'Retention Atlas Customer');
  const foreignCustomer = await createCustomer(ownerB, tenantB, 'Retention Foreign Customer');
  const jobResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs', headers: headers(ownerA, tenantA),
    payload: { customerId: customer.id, title: 'Retention Atlas Job', priority: 'normal' },
  });
  assert.equal(jobResponse.statusCode, 201, jobResponse.body);
  const job = jobResponse.json();
  const invoiceResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices', headers: headers(ownerA, tenantA),
    payload: { customerId: customer.id, jobId: job.id, lineItems: [{ description: 'Retention work', quantity: 1, unitPriceCents: 42_500 }] },
  });
  assert.equal(invoiceResponse.statusCode, 201, invoiceResponse.body);
  const invoice = invoiceResponse.json();
  const currentJobResponse = await app.inject({
    method: 'GET', url: `/v1/modules/tradeflowkit/jobs/${job.id}`, headers: headers(ownerA, tenantA),
  });
  assert.equal(currentJobResponse.statusCode, 200, currentJobResponse.body);
  const currentJob = currentJobResponse.json().job;

  for (const [url, expectedVersion, user, tenant] of [
    [`/v1/modules/tradeflowkit/invoices/${invoice.id}`, invoice.version, ownerA, tenantA],
    [`/v1/modules/tradeflowkit/jobs/${job.id}`, currentJob.version, ownerA, tenantA],
    [`/v1/modules/tradeflowkit/customers/${customer.id}`, customer.version, ownerA, tenantA],
    [`/v1/modules/tradeflowkit/customers/${foreignCustomer.id}`, foreignCustomer.version, ownerB, tenantB],
  ] as Array<[string, number, any, string]>) {
    const archived = await app.inject({ method: 'DELETE', url, headers: headers(user, tenant), payload: { expectedVersion } });
    assert.equal(archived.statusCode, 200, archived.body);
  }

  const listed = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/trash', headers: headers(viewer, tenantA) });
  assert.equal(listed.statusCode, 200, listed.body);
  const trash = listed.json();
  assert.deepEqual(trash.customers.map((row: any) => row.id), [customer.id]);
  assert.deepEqual(trash.jobs.map((row: any) => row.id), [job.id]);
  assert.deepEqual(trash.invoices.map((row: any) => row.id), [invoice.id]);
  assert.equal(JSON.stringify(trash).includes('TokenHash'), false, 'trash projection must not expose public token hashes');
  assert.equal(trash.customers.some((row: any) => row.id === foreignCustomer.id), false);

  const customerTrash = trash.customers[0];
  const jobTrash = trash.jobs[0];
  const invoiceTrash = trash.invoices[0];
  const viewerRestore = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/trash/customers/${customer.id}/restore`,
    headers: headers(viewer, tenantA), payload: { expectedVersion: customerTrash.version },
  });
  assert.equal(viewerRestore.statusCode, 403, viewerRestore.body);
  const foreignRestore = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/trash/customers/${customer.id}/restore`,
    headers: headers(ownerB, tenantB), payload: { expectedVersion: customerTrash.version },
  });
  assert.equal(foreignRestore.statusCode, 404, foreignRestore.body);
  const staleRestore = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/trash/customers/${customer.id}/restore`,
    headers: headers(ownerA, tenantA), payload: { expectedVersion: customer.version },
  });
  assert.equal(staleRestore.statusCode, 409, staleRestore.body);

  for (const [kind, id, version, code] of [
    ['jobs', job.id, jobTrash.version, 'JOB_CUSTOMER_ARCHIVED'],
    ['invoices', invoice.id, invoiceTrash.version, 'INVOICE_CUSTOMER_ARCHIVED'],
  ] as const) {
    const blocked = await app.inject({
      method: 'POST', url: `/v1/modules/tradeflowkit/trash/${kind}/${id}/restore`,
      headers: headers(ownerA, tenantA), payload: { expectedVersion: version },
    });
    assert.equal(blocked.statusCode, 409, blocked.body);
    assert.equal(blocked.json().code, code);
  }

  const restoreCustomer = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/trash/customers/${customer.id}/restore`,
    headers: headers(ownerA, tenantA), payload: { expectedVersion: customerTrash.version },
  });
  assert.equal(restoreCustomer.statusCode, 200, restoreCustomer.body);
  const invoiceBeforeJob = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/trash/invoices/${invoice.id}/restore`,
    headers: headers(ownerA, tenantA), payload: { expectedVersion: invoiceTrash.version },
  });
  assert.equal(invoiceBeforeJob.statusCode, 409, invoiceBeforeJob.body);
  assert.equal(invoiceBeforeJob.json().code, 'INVOICE_JOB_ARCHIVED');
  const restoreJob = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/trash/jobs/${job.id}/restore`,
    headers: headers(ownerA, tenantA), payload: { expectedVersion: jobTrash.version },
  });
  assert.equal(restoreJob.statusCode, 200, restoreJob.body);
  const restoreInvoice = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/trash/invoices/${invoice.id}/restore`,
    headers: headers(ownerA, tenantA), payload: { expectedVersion: invoiceTrash.version },
  });
  assert.equal(restoreInvoice.statusCode, 200, restoreInvoice.body);

  await app.close(); app = await createApp(true);
  const empty = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/trash', headers: headers(ownerA, tenantA) });
  assert.equal(empty.statusCode, 200, empty.body);
  assert.deepEqual(empty.json().customers, []);
  assert.deepEqual(empty.json().jobs, []);
  assert.deepEqual(empty.json().invoices, []);
  const [persistedCustomer] = await db.select().from(tradeflowkitCustomers).where(and(eq(tradeflowkitCustomers.id, customer.id), eq(tradeflowkitCustomers.tenantId, tenantA), isNull(tradeflowkitCustomers.deletedAt))).limit(1);
  const [persistedJob] = await db.select().from(tradeflowkitJobs).where(and(eq(tradeflowkitJobs.id, job.id), eq(tradeflowkitJobs.tenantId, tenantA), isNull(tradeflowkitJobs.deletedAt))).limit(1);
  const [persistedInvoice] = await db.select().from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.id, invoice.id), eq(tradeflowkitInvoices.tenantId, tenantA), isNull(tradeflowkitInvoices.deletedAt))).limit(1);
  assert.ok(persistedCustomer && persistedJob && persistedInvoice);
  const [organization] = await db.select().from(directoryOrganizations).where(and(eq(directoryOrganizations.id, customer.organizationId), eq(directoryOrganizations.tenantId, tenantA), isNull(directoryOrganizations.archivedAt))).limit(1);
  assert.ok(organization, 'customer restore must retain the active shared Directory identity');
  const restoredActivity = await db.select().from(activityFeed).where(and(
    eq(activityFeed.tenantId, tenantA), eq(activityFeed.action, 'restored'),
  ));
  assert.equal(restoredActivity.filter(row => [customer.id, job.id, invoice.id].includes(row.entityId ?? '')).length, 3);
});
