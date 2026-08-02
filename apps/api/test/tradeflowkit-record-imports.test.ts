process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-record-imports-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tradeflowkitCustomers,
  tradeflowkitInvoiceItems,
  tradeflowkitInvoices,
  tradeflowkitJobs,
} from '../src/schema.js';
import {
  cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady,
} from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let moduleRow: any;
let signToken: typeof import('../src/lib/auth.js').signToken;
let customerA: typeof tradeflowkitCustomers.$inferSelect;
let customerB: typeof tradeflowkitCustomers.$inferSelect;

function headers(user: any, tenantId: string, idempotencyKey?: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id, email: user.email, role: user.role,
      tokenVersion: user.tokenVersion, sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
    ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
  };
}

async function createApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  const instance = Fastify();
  await instance.register(cookie);
  await registerModuleShellRoutes(instance);
  await instance.ready();
  return instance;
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer',
  });
  [customerA] = await db.insert(tradeflowkitCustomers).values({
    tenantId: ownerA.currentTenantId, createdByUserId: ownerA.id, name: 'Alpha Service Company',
  }).returning();
  [customerB] = await db.insert(tradeflowkitCustomers).values({
    tenantId: ownerB.currentTenantId, createdByUserId: ownerB.id, name: 'Alpha Service Company',
  }).returning();
  app = await createApp();
});

after(async () => {
  if (app) await app.close();
  for (const tenantId of [ownerA?.currentTenantId, ownerB?.currentTenantId].filter(Boolean)) {
    try { await db.delete(tradeflowkitInvoiceItems).where(eq(tradeflowkitInvoiceItems.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitJobs).where(eq(tradeflowkitJobs.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.tenantId, tenantId)); } catch {}
    try { await db.delete(activityFeed).where(eq(activityFeed.tenantId, tenantId)); } catch {}
    try { await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id = ${tenantId}`); } catch {}
    try { await db.execute(sql`DELETE FROM tradeflowkit_sequences WHERE tenant_id = ${tenantId}`); } catch {}
  }
  if (moduleRow) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('record imports require bounded replay-protected module write access', async () => {
  for (const resource of ['jobs', 'invoices']) {
    const payload = resource === 'jobs'
      ? { jobs: [{ customerName: customerA.name, title: 'Missing key' }] }
      : { invoices: [{ customerName: customerA.name, itemDescription: 'Missing key' }] };
    const missingKey = await app.inject({
      method: 'POST', url: `/v1/modules/tradeflowkit/${resource}/import`,
      headers: headers(ownerA, ownerA.currentTenantId), payload,
    });
    assert.equal(missingKey.statusCode, 400, missingKey.body);
    assert.equal(missingKey.json().code, 'IDEMPOTENCY_KEY_REQUIRED');

    const viewerWrite = await app.inject({
      method: 'POST', url: `/v1/modules/tradeflowkit/${resource}/import`,
      headers: headers(viewer, ownerA.currentTenantId, `${resource}-import:viewer-denied`), payload,
    });
    assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
    assert.equal(viewerWrite.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
  }

  const oversized = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'job-import:oversized'),
    payload: { jobs: Array.from({ length: 101 }, (_, index) => ({ customerName: customerA.name, title: `Job ${index}` })) },
  });
  assert.equal(oversized.statusCode, 400, oversized.body);
  assert.equal(oversized.json().code, 'JOB_IMPORT_ROWS_INVALID');
});

test('job import resolves tenant customers, rejects invalid rows, deduplicates, and replays safely', async () => {
  const payload = {
    jobs: [
      {
        customerName: customerA.name, title: 'Quarterly inspection', description: 'Inspect production line',
        status: 'scheduled', priority: 'urgent', scheduledStart: '2026-08-10T13:00:00.000Z',
        scheduledEnd: '2026-08-10T15:00:00.000Z', internalNotes: 'Restricted operational note',
      },
      {
        customerName: customerA.name, title: 'Quarterly inspection', description: 'Inspect production line',
        status: 'scheduled', priority: 'urgent', scheduledStart: '2026-08-10T13:00:00.000Z',
        scheduledEnd: '2026-08-10T15:00:00.000Z', internalNotes: 'Restricted operational note',
      },
      { customerName: 'Unknown Customer', title: 'Unresolved job' },
      { customerName: customerA.name, title: 'Invalid schedule', scheduledStart: '2026-08-11T15:00:00.000Z', scheduledEnd: '2026-08-11T13:00:00.000Z' },
    ],
  };
  const imported = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'job-import:bounded-v1'), payload,
  });
  assert.equal(imported.statusCode, 200, imported.body);
  const result = imported.json();
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.skippedRows, [{ row: 3, reason: 'duplicate_source' }]);
  assert.deepEqual(result.errors, [
    { row: 5, code: 'SCHEDULE_INVALID', field: 'scheduledEnd' },
    { row: 4, code: 'CUSTOMER_NOT_FOUND', field: 'customerName' },
  ]);
  const [job] = await db.select().from(tradeflowkitJobs).where(and(
    eq(tradeflowkitJobs.tenantId, ownerA.currentTenantId), eq(tradeflowkitJobs.id, result.jobs[0].id),
  ));
  assert.equal(job.customerId, customerA.id);
  assert.equal(job.number, 1);
  assert.match(job.sourceId ?? '', /^job-import:[0-9a-f]{64}$/);

  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'job-import:bounded-v1'), payload,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.deepEqual(replay.json(), result);
  assert.equal((await db.select().from(tradeflowkitJobs).where(eq(tradeflowkitJobs.tenantId, ownerA.currentTenantId))).length, 1);

  const drift = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'job-import:bounded-v1'),
    payload: { jobs: [{ customerName: customerA.name, title: 'Changed request' }] },
  });
  assert.equal(drift.statusCode, 409, drift.body);
  assert.equal(drift.json().code, 'IDEMPOTENCY_KEY_REUSE');

  const tenantB = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/import',
    headers: headers(ownerB, ownerB.currentTenantId, 'job-import:tenant-b'),
    payload: { jobs: [{ customerName: customerB.name, title: 'Tenant B inspection' }] },
  });
  assert.equal(tenantB.statusCode, 200, tenantB.body);
  assert.equal(tenantB.json().imported, 1);

  const events = await db.select().from(activityFeed).where(eq(activityFeed.tenantId, ownerA.currentTenantId));
  const serialized = JSON.stringify(events.filter(event => event.entityType === 'tradeflowkit_job_import'));
  assert.equal(serialized.includes('Restricted operational note'), false);
  assert.equal(serialized.includes(customerA.name), false);
});

test('invoice import groups lines, preserves exact cents, rejects paid history, and deduplicates references', async () => {
  const payload = {
    invoices: [
      {
        invoiceRef: 'legacy-100', customerName: customerA.name, status: 'draft', dueDate: '2026-08-31',
        taxRate: '7.50', discount: '1.00', notes: 'Customer-visible import note',
        itemDescription: 'Inspection labor', itemQty: '2', itemUnitPrice: '12.50',
      },
      {
        invoiceRef: 'legacy-100', customerName: customerA.name, status: 'draft', dueDate: '2026-08-31',
        taxRate: '7.50', discount: '1.00', notes: 'Customer-visible import note',
        itemDescription: 'Report package', itemQty: '1', itemUnitPrice: '5.00',
      },
      { invoiceRef: 'paid-legacy', customerName: customerA.name, status: 'paid', itemDescription: 'Unsafe paid history', itemQty: '1', itemUnitPrice: '50.00' },
      { invoiceRef: 'missing-customer', customerName: 'Unknown Customer', itemDescription: 'Unresolved invoice', itemQty: '1', itemUnitPrice: '10.00' },
    ],
  };
  const imported = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'invoice-import:bounded-v1'), payload,
  });
  assert.equal(imported.statusCode, 200, imported.body);
  const result = imported.json();
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.errors, [
    { row: 4, code: 'FIELD_INVALID', field: 'status' },
    { row: 5, code: 'CUSTOMER_NOT_FOUND', field: 'customerName' },
  ]);
  const [invoice] = await db.select().from(tradeflowkitInvoices).where(and(
    eq(tradeflowkitInvoices.tenantId, ownerA.currentTenantId), eq(tradeflowkitInvoices.id, result.invoices[0].id),
  ));
  assert.equal(invoice.customerId, customerA.id);
  assert.equal(invoice.number, 1);
  assert.equal(invoice.subtotalCents, 3000);
  assert.equal(invoice.taxCents, 225);
  assert.equal(invoice.discountCents, 100);
  assert.equal(invoice.totalCents, 3125);
  assert.equal(invoice.balanceCents, 3125);
  assert.equal(invoice.paidCents, 0);
  assert.match(invoice.sourceId ?? '', /^invoice-import:[0-9a-f]{64}$/);
  const items = await db.select().from(tradeflowkitInvoiceItems).where(and(
    eq(tradeflowkitInvoiceItems.tenantId, ownerA.currentTenantId), eq(tradeflowkitInvoiceItems.invoiceId, invoice.id),
  ));
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => item.lineTotalCents), [2500, 500]);

  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'invoice-import:bounded-v1'), payload,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.deepEqual(replay.json(), result);

  const duplicateReference = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'invoice-import:fresh-key'), payload,
  });
  assert.equal(duplicateReference.statusCode, 200, duplicateReference.body);
  assert.equal(duplicateReference.json().imported, 0);
  assert.equal(duplicateReference.json().skipped, 1);
  assert.deepEqual(duplicateReference.json().skippedRows, [{ row: 2, reason: 'duplicate_source' }]);
  assert.equal((await db.select().from(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.tenantId, ownerA.currentTenantId))).length, 1);

  const importEvent = (await db.select().from(activityFeed).where(and(
    eq(activityFeed.tenantId, ownerA.currentTenantId), eq(activityFeed.entityType, 'tradeflowkit_invoice_import'),
  )))[0];
  const serialized = JSON.stringify(importEvent);
  assert.equal(serialized.includes('Customer-visible import note'), false);
  assert.equal(serialized.includes(customerA.name), false);
});
