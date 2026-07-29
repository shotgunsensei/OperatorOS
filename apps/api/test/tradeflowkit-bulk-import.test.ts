process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-bulk-import-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed,
  directoryContacts,
  directoryOrganizationContacts,
  directoryOrganizations,
  modules,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tradeflowkitCustomers,
  tradeflowkitInvoiceItems,
  tradeflowkitInvoices,
  tradeflowkitJobs,
  tradeflowkitPayments,
  tradeflowkitSequences,
} from '../src/schema.js';
import {
  cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady,
} from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let moduleRow: any;
let moduleCreated = false;
let customer: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

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
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!moduleRow) {
    moduleRow = await createTestModule('tradeflowkit');
    moduleCreated = true;
  }
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer',
  });
  app = await createApp();
  const created = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Bulk Import Customer', email: 'bulk-import@example.test' },
  });
  assert.equal(created.statusCode, 201, created.body);
  customer = created.json();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  for (const tenantId of [ownerA?.currentTenantId, ownerB?.currentTenantId].filter(Boolean)) {
    try { await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id = ${tenantId}`); } catch {}
    try { await db.delete(tradeflowkitPayments).where(eq(tradeflowkitPayments.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitInvoiceItems).where(eq(tradeflowkitInvoiceItems.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitJobs).where(eq(tradeflowkitJobs.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitSequences).where(eq(tradeflowkitSequences.tenantId, tenantId)); } catch {}
    try { await db.delete(activityFeed).where(eq(activityFeed.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryOrganizationContacts).where(eq(directoryOrganizationContacts.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryContacts).where(eq(directoryContacts.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryOrganizations).where(eq(directoryOrganizations.tenantId, tenantId)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow && moduleCreated) await cleanupModule(moduleRow.id);
});

test('bounded job and invoice imports plus non-destructive bulk actions are replay safe and tenant scoped', async () => {
  const jobPayload = {
    jobs: [
      { customerName: 'Bulk Import Customer', title: 'Imported Service Visit', status: 'scheduled', priority: 'urgent' },
      { customerName: 'Missing Customer', title: 'Rejected Job' },
      { customerName: 'Bulk Import Customer', title: 'Invalid Status Job', status: 'unknown' },
    ],
  };
  const importedJobs = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/jobs/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'job-import:bounded-v1'),
    payload: jobPayload,
  });
  assert.equal(importedJobs.statusCode, 200, importedJobs.body);
  assert.equal(importedJobs.json().imported, 1);
  assert.deepEqual(importedJobs.json().errors, [
    { row: 4, code: 'STATUS_INVALID', field: 'status' },
    { row: 3, code: 'CUSTOMER_NOT_FOUND', field: 'customerName' },
  ]);
  const jobId = importedJobs.json().jobs[0].id;
  const [job] = await db.select().from(tradeflowkitJobs).where(eq(tradeflowkitJobs.id, jobId));
  assert.equal(job.customerId, customer.id);
  assert.match(job.sourceId ?? '', /^job-import:[0-9a-f]{64}$/);

  const replayJobs = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/jobs/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'job-import:bounded-v1'),
    payload: jobPayload,
  });
  assert.equal(replayJobs.statusCode, 200, replayJobs.body);
  assert.equal(replayJobs.json().jobs[0].id, jobId);

  const duplicateJobs = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/jobs/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'job-import:bounded-v2'),
    payload: { jobs: [jobPayload.jobs[0]] },
  });
  assert.equal(duplicateJobs.statusCode, 200, duplicateJobs.body);
  assert.equal(duplicateJobs.json().imported, 0);
  assert.equal(duplicateJobs.json().skipped, 1);

  const bulkJob = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerA, ownerA.currentTenantId, 'job-bulk-status:done-v1'),
    payload: { items: [{ id: job.id, expectedVersion: job.version }], status: 'done' },
  });
  assert.equal(bulkJob.statusCode, 200, bulkJob.body);
  assert.equal(bulkJob.json().updated, 1);
  const [doneJob] = await db.select().from(tradeflowkitJobs).where(eq(tradeflowkitJobs.id, jobId));
  assert.equal(doneJob.status, 'done');
  assert.ok(doneJob.completedAt);

  const foreignBulk = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerB, ownerB.currentTenantId, 'job-bulk-status:foreign-v1'),
    payload: { items: [{ id: job.id, expectedVersion: doneJob.version }], status: 'paid' },
  });
  assert.equal(foreignBulk.statusCode, 404, foreignBulk.body);

  const viewerImport = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/invoices/import',
    headers: headers(viewer, ownerA.currentTenantId, 'invoice-import:viewer-v1'),
    payload: { invoices: [{ customerName: 'Bulk Import Customer', itemDescription: 'Denied', itemUnitPriceCents: 100, itemQuantity: 1 }] },
  });
  assert.equal(viewerImport.statusCode, 403, viewerImport.body);

  const invoicePayload = {
    invoices: [
      { invoiceRef: 'EXT-100', customerName: 'Bulk Import Customer', status: 'sent', taxRateBps: 500, itemDescription: 'Labor', itemQuantity: 2, itemUnitPriceCents: 15000 },
      { invoiceRef: 'EXT-100', customerName: 'Bulk Import Customer', status: 'sent', taxRateBps: 500, itemDescription: 'Parts', itemQuantity: 1, itemUnitPriceCents: 5000 },
      { invoiceRef: 'EXT-200', customerName: 'Missing Customer', itemDescription: 'Rejected', itemQuantity: 1, itemUnitPriceCents: 1000 },
    ],
  };
  const importedInvoices = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/invoices/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'invoice-import:bounded-v1'),
    payload: invoicePayload,
  });
  assert.equal(importedInvoices.statusCode, 200, importedInvoices.body);
  assert.equal(importedInvoices.json().imported, 1);
  assert.deepEqual(importedInvoices.json().errors, [{ row: 4, code: 'CUSTOMER_NOT_FOUND', field: 'customerName' }]);
  const invoiceId = importedInvoices.json().invoices[0].id;
  const [invoice] = await db.select().from(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.id, invoiceId));
  assert.equal(invoice.status, 'sent');
  assert.equal(invoice.subtotalCents, 35000);
  assert.equal(invoice.taxCents, 1750);
  assert.equal(invoice.totalCents, 36750);
  assert.equal((await db.select().from(tradeflowkitInvoiceItems).where(eq(tradeflowkitInvoiceItems.invoiceId, invoiceId))).length, 2);

  const bulkPaid = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/invoices/bulk-mark-paid',
    headers: headers(ownerA, ownerA.currentTenantId, 'invoice-bulk-paid:bounded-v1'),
    payload: { items: [{ id: invoice.id, expectedVersion: invoice.version }], paymentMethod: 'check', paymentReference: 'CHECK-100' },
  });
  assert.equal(bulkPaid.statusCode, 200, bulkPaid.body);
  assert.equal(bulkPaid.json().updated, 1);
  const [paid] = await db.select().from(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.id, invoiceId));
  assert.equal(paid.status, 'paid');
  assert.equal(paid.balanceCents, 0);
  assert.equal(paid.paidCents, 36750);
  const payments = await db.select().from(tradeflowkitPayments).where(eq(tradeflowkitPayments.invoiceId, invoiceId));
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amountCents, 36750);

  const replayPaid = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/invoices/bulk-mark-paid',
    headers: headers(ownerA, ownerA.currentTenantId, 'invoice-bulk-paid:bounded-v1'),
    payload: { items: [{ id: invoice.id, expectedVersion: invoice.version }], paymentMethod: 'check', paymentReference: 'CHECK-100' },
  });
  assert.equal(replayPaid.statusCode, 200, replayPaid.body);
  assert.equal((await db.select().from(tradeflowkitPayments).where(eq(tradeflowkitPayments.invoiceId, invoiceId))).length, 1);
});
