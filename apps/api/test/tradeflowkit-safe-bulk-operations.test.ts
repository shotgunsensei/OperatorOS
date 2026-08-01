process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-safe-bulk-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tradeflowkitCustomers,
  tradeflowkitInvoices,
  tradeflowkitJobs,
  tradeflowkitPayments,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let member: any;
let moduleRow: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any, tenantId: string, key?: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id, email: user.email, role: user.role,
      tokenVersion: user.tokenVersion, sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
    ...(key ? { 'idempotency-key': key } : {}),
  };
}

async function createCustomer(user: any, tenantId: string, name: string) {
  const response = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(user, tenantId),
    payload: { name, email: `${name.toLowerCase().replaceAll(' ', '-')}@example.test` },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

async function createJob(user: any, tenantId: string, customerId: string, title: string) {
  const response = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs', headers: headers(user, tenantId),
    payload: { customerId, title, priority: 'normal' },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

async function createInvoice(user: any, tenantId: string, customerId: string, jobId: string, amountCents: number) {
  const response = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices', headers: headers(user, tenantId),
    payload: { customerId, jobId, lineItems: [{ description: 'Batch-tested service', quantity: 1, unitPriceCents: amountCents }] },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

async function currentJob(user: any, tenantId: string, id: string) {
  const response = await app.inject({ method: 'GET', url: `/v1/modules/tradeflowkit/jobs/${id}`, headers: headers(user, tenantId) });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().job;
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser(); member = await createTestUser();
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: member.id, role: 'member' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: member.id, moduleId: moduleRow.id, accessLevel: 'user',
  });
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerModuleShellRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  for (const user of [member, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('bulk routes reject non-admins, missing replay keys, duplicate IDs, and oversized requests', async () => {
  const tenant = ownerA.currentTenantId;
  const customer = await createCustomer(ownerA, tenant, 'Bulk Guard Customer');
  const job = await createJob(ownerA, tenant, customer.id, 'Bulk Guard Job');
  const payload = { records: [{ id: job.id, expectedVersion: job.version }], status: 'scheduled' };

  const anonymous = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status', payload });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const memberDenied = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(member, tenant, 'bulk-guard:member-denied'), payload,
  });
  assert.equal(memberDenied.statusCode, 403, memberDenied.body);
  const missingKey = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status', headers: headers(ownerA, tenant), payload });
  assert.equal(missingKey.statusCode, 400, missingKey.body);
  assert.equal(missingKey.json().code, 'IDEMPOTENCY_KEY_REQUIRED');
  const duplicate = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerA, tenant, 'bulk-guard:duplicate'),
    payload: { records: [payload.records[0], payload.records[0]], status: 'scheduled' },
  });
  assert.equal(duplicate.statusCode, 400, duplicate.body);
  assert.equal(duplicate.json().code, 'BULK_DUPLICATE_ID');
  const oversized = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerA, tenant, 'bulk-guard:oversized'),
    payload: { records: Array.from({ length: 26 }, (_, index) => ({ id: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`, expectedVersion: 1 })), status: 'scheduled' },
  });
  assert.equal(oversized.statusCode, 400, oversized.body);
  assert.equal(oversized.json().code, 'BULK_RECORDS_INVALID');
});

test('job bulk status is tenant-isolated, atomic, audited, replay-safe, and body-drift safe', async () => {
  const tenantA = ownerA.currentTenantId;
  const tenantB = ownerB.currentTenantId;
  const customerA = await createCustomer(ownerA, tenantA, 'Bulk Status A');
  const customerB = await createCustomer(ownerB, tenantB, 'Bulk Status B');
  const jobsA = [
    await createJob(ownerA, tenantA, customerA.id, 'Bulk Status A1'),
    await createJob(ownerA, tenantA, customerA.id, 'Bulk Status A2'),
  ];
  const foreign = await createJob(ownerB, tenantB, customerB.id, 'Bulk Status Foreign');

  const isolated = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerA, tenantA, 'bulk-status:foreign-atomic'),
    payload: { records: [{ id: jobsA[0].id, expectedVersion: jobsA[0].version }, { id: foreign.id, expectedVersion: foreign.version }], status: 'done' },
  });
  assert.equal(isolated.statusCode, 409, isolated.body);
  assert.equal(isolated.json().code, 'BULK_RECORD_CONFLICT');
  assert.equal((await currentJob(ownerA, tenantA, jobsA[0].id)).status, 'lead');

  const payload = { records: jobsA.map(job => ({ id: job.id, expectedVersion: job.version })), status: 'in_progress' };
  const updated = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerA, tenantA, 'bulk-status:replay-v1'), payload,
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().count, 2);
  assert.equal(updated.json().replay, false);
  const updatedRows = await db.select().from(tradeflowkitJobs).where(and(
    eq(tradeflowkitJobs.tenantId, tenantA), inArray(tradeflowkitJobs.id, jobsA.map(job => job.id)),
  ));
  assert.ok(updatedRows.every(row => row.status === 'in_progress' && row.version === 2));

  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerA, tenantA, 'bulk-status:replay-v1'), payload,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().replay, true);
  assert.ok((await db.select().from(tradeflowkitJobs).where(and(
    eq(tradeflowkitJobs.tenantId, tenantA), inArray(tradeflowkitJobs.id, jobsA.map(job => job.id)),
  ))).every(row => row.version === 2));

  const drift = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerA, tenantA, 'bulk-status:replay-v1'), payload: { ...payload, status: 'done' },
  });
  assert.equal(drift.statusCode, 409, drift.body);
  assert.equal(drift.json().code, 'IDEMPOTENCY_KEY_REUSE');

  const stale = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs/bulk-status',
    headers: headers(ownerA, tenantA, 'bulk-status:stale-atomic'),
    payload: { records: [{ id: jobsA[0].id, expectedVersion: 2 }, { id: jobsA[1].id, expectedVersion: 1 }], status: 'done' },
  });
  assert.equal(stale.statusCode, 409, stale.body);
  assert.ok((await db.select().from(tradeflowkitJobs).where(and(
    eq(tradeflowkitJobs.tenantId, tenantA), inArray(tradeflowkitJobs.id, jobsA.map(job => job.id)),
  ))).every(row => row.status === 'in_progress'));
  const events = await db.select().from(activityFeed).where(and(
    eq(activityFeed.tenantId, tenantA), eq(activityFeed.action, 'bulk_status_updated'),
  ));
  assert.equal(events.filter(event => jobsA.some(job => job.id === event.entityId)).length, 2);
});

test('bulk restore validates every dependency and bulk payment records exact durable balances once', async () => {
  const tenant = ownerA.currentTenantId;
  const customer = await createCustomer(ownerA, tenant, 'Bulk Restore Customer');
  const restoreJobs = [
    await createJob(ownerA, tenant, customer.id, 'Restore Job One'),
    await createJob(ownerA, tenant, customer.id, 'Restore Job Two'),
  ];
  const restoreInvoices = [
    await createInvoice(ownerA, tenant, customer.id, restoreJobs[0].id, 15_000),
    await createInvoice(ownerA, tenant, customer.id, restoreJobs[1].id, 25_000),
  ];
  await db.update(tradeflowkitInvoices).set({ deletedAt: new Date(), version: sql`${tradeflowkitInvoices.version} + 1` }).where(inArray(tradeflowkitInvoices.id, restoreInvoices.map(invoice => invoice.id)));
  await db.update(tradeflowkitJobs).set({ deletedAt: new Date(), version: sql`${tradeflowkitJobs.version} + 1` }).where(inArray(tradeflowkitJobs.id, restoreJobs.map(job => job.id)));
  const archivedJobs = await db.select().from(tradeflowkitJobs).where(inArray(tradeflowkitJobs.id, restoreJobs.map(job => job.id)));
  const archivedInvoices = await db.select().from(tradeflowkitInvoices).where(inArray(tradeflowkitInvoices.id, restoreInvoices.map(invoice => invoice.id)));

  await db.update(tradeflowkitCustomers).set({ deletedAt: new Date() }).where(eq(tradeflowkitCustomers.id, customer.id));
  const blocked = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/trash/jobs/bulk-restore',
    headers: headers(ownerA, tenant, 'bulk-restore:dependency-block'),
    payload: { records: archivedJobs.map(job => ({ id: job.id, expectedVersion: job.version })) },
  });
  assert.equal(blocked.statusCode, 409, blocked.body);
  assert.equal(blocked.json().code, 'BULK_DEPENDENCY_CONFLICT');
  assert.equal((await db.select().from(tradeflowkitJobs).where(and(
    inArray(tradeflowkitJobs.id, restoreJobs.map(job => job.id)), isNotNull(tradeflowkitJobs.deletedAt),
  ))).length, 2);
  await db.update(tradeflowkitCustomers).set({ deletedAt: null }).where(eq(tradeflowkitCustomers.id, customer.id));

  const jobsRestored = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/trash/jobs/bulk-restore',
    headers: headers(ownerA, tenant, 'bulk-restore:jobs-v1'),
    payload: { records: archivedJobs.map(job => ({ id: job.id, expectedVersion: job.version })) },
  });
  assert.equal(jobsRestored.statusCode, 200, jobsRestored.body);
  assert.equal(jobsRestored.json().count, 2);
  const invoicesRestored = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/trash/invoices/bulk-restore',
    headers: headers(ownerA, tenant, 'bulk-restore:invoices-v1'),
    payload: { records: archivedInvoices.map(invoice => ({ id: invoice.id, expectedVersion: invoice.version })) },
  });
  assert.equal(invoicesRestored.statusCode, 200, invoicesRestored.body);
  assert.equal(invoicesRestored.json().count, 2);
  assert.equal((await db.select().from(tradeflowkitInvoices).where(and(
    inArray(tradeflowkitInvoices.id, restoreInvoices.map(invoice => invoice.id)), isNull(tradeflowkitInvoices.deletedAt),
  ))).length, 2);

  const paymentCustomer = await createCustomer(ownerA, tenant, 'Bulk Payment Customer');
  const paymentJobs = [
    await createJob(ownerA, tenant, paymentCustomer.id, 'Payment Job One'),
    await createJob(ownerA, tenant, paymentCustomer.id, 'Payment Job Two'),
  ];
  const draftInvoices = [
    await createInvoice(ownerA, tenant, paymentCustomer.id, paymentJobs[0].id, 31_250),
    await createInvoice(ownerA, tenant, paymentCustomer.id, paymentJobs[1].id, 47_500),
  ];
  const payableInvoices = [];
  for (const invoice of draftInvoices) {
    const sent = await app.inject({
      method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}/transition`,
      headers: headers(ownerA, tenant), payload: { expectedVersion: invoice.version, status: 'sent' },
    });
    assert.equal(sent.statusCode, 200, sent.body);
    payableInvoices.push(sent.json());
  }
  const paymentPayload = {
    records: payableInvoices.map(invoice => ({ id: invoice.id, expectedVersion: invoice.version })),
    method: 'check', reference: 'BATCH-CHECK-1001', notes: 'Verified offline receipt',
  };
  const paid = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices/bulk-mark-paid',
    headers: headers(ownerA, tenant, 'bulk-payment:exact-v1'), payload: paymentPayload,
  });
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal(paid.json().count, 2);
  assert.equal(paid.json().totalCents, 78_750);
  const persistedInvoices = await db.select().from(tradeflowkitInvoices).where(inArray(tradeflowkitInvoices.id, payableInvoices.map(invoice => invoice.id)));
  assert.ok(persistedInvoices.every(invoice => invoice.status === 'paid' && invoice.balanceCents === 0 && invoice.paidCents === invoice.totalCents));
  const payments = await db.select().from(tradeflowkitPayments).where(and(
    eq(tradeflowkitPayments.tenantId, tenant), inArray(tradeflowkitPayments.invoiceId, payableInvoices.map(invoice => invoice.id)),
  ));
  assert.deepEqual(payments.map(payment => payment.amountCents).sort((a, b) => a - b), [31_250, 47_500]);
  assert.ok(payments.every(payment => payment.status === 'succeeded' && payment.reference === 'BATCH-CHECK-1001'));

  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices/bulk-mark-paid',
    headers: headers(ownerA, tenant, 'bulk-payment:exact-v1'), payload: paymentPayload,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().replay, true);
  assert.equal((await db.select().from(tradeflowkitPayments).where(and(
    eq(tradeflowkitPayments.tenantId, tenant), inArray(tradeflowkitPayments.invoiceId, payableInvoices.map(invoice => invoice.id)),
  ))).length, 2);
});
