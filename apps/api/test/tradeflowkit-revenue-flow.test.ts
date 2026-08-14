process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-revenue-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tradeflowkitCustomers,
  tradeflowkitInvoices,
  tradeflowkitJobs,
  tradeflowkitQuotes,
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
  moduleRow = await createTestModule('tradeflowkit');

  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer',
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
  for (const tenantId of [ownerA?.currentTenantId, ownerB?.currentTenantId].filter(Boolean)) {
    try { await db.delete(activityFeed).where(eq(activityFeed.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitQuotes).where(eq(tradeflowkitQuotes.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitJobs).where(eq(tradeflowkitJobs.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.tenantId, tenantId)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('quote-to-invoice-to-payment stays tenant-scoped and updates the linked job', async () => {
  const customerRes = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/customers',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Acme Facilities', email: 'ops@acme.test', phone: '+15555550123' },
  });
  assert.equal(customerRes.statusCode, 201, customerRes.body);
  const customer = customerRes.json();

  const crossTenantJob = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs',
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { customerId: customer.id, title: 'must not cross tenant' },
  });
  assert.equal(crossTenantJob.statusCode, 404);
  assert.equal(crossTenantJob.json().code, 'CUSTOMER_NOT_FOUND');

  const jobRes = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/jobs',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { customerId: customer.id, title: 'Replace rooftop unit', priority: 'urgent' },
  });
  assert.equal(jobRes.statusCode, 201, jobRes.body);
  const job = jobRes.json();

  const quoteRes = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/quotes',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      customerId: customer.id, jobId: job.id, taxRateBps: 750, discountCents: 500,
      lineItems: [{ description: 'Equipment and installation', quantity: 2, unitPriceCents: 10_000 }],
    },
  });
  assert.equal(quoteRes.statusCode, 201, quoteRes.body);
  const quote = quoteRes.json();
  assert.equal(quote.subtotalCents, 20_000);
  assert.equal(quote.taxCents, 1_500);
  assert.equal(quote.totalCents, 21_000);

  const prematureAccept = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/transition`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 1, status: 'accepted' },
  });
  assert.equal(prematureAccept.statusCode, 409);
  assert.equal(prematureAccept.json().code, 'QUOTE_TRANSITION_INVALID');

  const sent = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/transition`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 1, status: 'sent' },
  });
  assert.equal(sent.statusCode, 200, sent.body);
  assert.equal(sent.json().version, 2);

  const accepted = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/transition`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 2, status: 'accepted' },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  assert.equal(accepted.json().version, 3);

  const invoiceRes = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/invoice`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 3 },
  });
  assert.equal(invoiceRes.statusCode, 201, invoiceRes.body);
  const invoice = invoiceRes.json();
  assert.equal(invoice.totalCents, quote.totalCents);
  assert.equal(invoice.status, 'draft');

  const idempotent = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/invoice`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 3 },
  });
  assert.equal(idempotent.statusCode, 200, idempotent.body);
  assert.equal(idempotent.json().id, invoice.id);

  const invoiceSent = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}/transition`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 1, status: 'sent' },
  });
  assert.equal(invoiceSent.statusCode, 200, invoiceSent.body);

  const paid = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}/pay`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: 2, paymentMethod: 'check', paymentReference: 'CHK-1042' },
  });
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal(paid.json().status, 'paid');
  assert.equal(paid.json().paymentReference, 'CHK-1042');

  const dashboardA = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/revenue', headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(dashboardA.statusCode, 200, dashboardA.body);
  assert.deepEqual(
    [dashboardA.json().customers.length, dashboardA.json().jobs.length, dashboardA.json().quotes.length, dashboardA.json().invoices.length],
    [1, 1, 1, 1],
  );
  assert.equal(dashboardA.json().jobs[0].status, 'paid');

  const dashboardB = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/revenue', headers: headers(ownerB, ownerB.currentTenantId) });
  assert.equal(dashboardB.statusCode, 200, dashboardB.body);
  assert.equal(dashboardB.json().invoices.length, 0);
});

test('TradeFlowKit viewer can inspect revenue records but cannot create them', async () => {
  const read = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/revenue', headers: headers(viewer, ownerA.currentTenantId) });
  assert.equal(read.statusCode, 200, read.body);
  const write = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/customers',
    headers: headers(viewer, ownerA.currentTenantId), payload: { name: 'Denied customer' },
  });
  assert.equal(write.statusCode, 403, write.body);
  assert.equal(write.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
});
