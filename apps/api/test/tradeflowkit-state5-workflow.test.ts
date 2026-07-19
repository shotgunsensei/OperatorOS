process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-state5-test-v1';
process.env.TRADEFLOWKIT_PAYMENT_PROVIDER = 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  directoryOrganizationContacts,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';
import { getTradeFlowKitPaymentProvider } from '../src/lib/tradeflowkit-payment-provider.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
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

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
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

test('customer payment provider fails closed outside the deterministic test environment', async () => {
  const provider = getTradeFlowKitPaymentProvider({
    NODE_ENV: 'production',
    TRADEFLOWKIT_PAYMENT_PROVIDER: 'test',
  });
  assert.deepEqual(provider.status, {
    kind: 'disabled',
    configured: false,
    reason: 'Customer payment processing is disabled until a reviewed centralized provider adapter is configured.',
  });
  await assert.rejects(
    () => provider.createSession({
      tenantId: 'tenant', invoiceId: 'invoice', amountCents: 1, idempotencyKey: 'key',
    }),
    (error: any) => error?.code === 'TRADEFLOWKIT_PAYMENT_PROVIDER_DISABLED',
  );
});

test('lead-to-payment workflow persists tasks, public decisions, partial payments, and provider retries', async () => {
  const tenant = ownerA.currentTenantId;
  const leadResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads', headers: headers(ownerA, tenant),
    payload: {
      name: 'Northstar Mechanical', email: 'dispatch@northstar.test', phone: '+15555550127',
      serviceType: 'Compressor replacement', description: 'Unit is offline', urgency: 'urgent',
      estimatedValueCents: 250_000,
    },
  });
  assert.equal(leadResponse.statusCode, 201, leadResponse.body);
  const lead = leadResponse.json();

  const conversionResponses = await Promise.all([
    app.inject({
      method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/convert`,
      headers: headers(ownerA, tenant, 'convert-northstar-001'), payload: {},
    }),
    app.inject({
      method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/convert`,
      headers: headers(ownerA, tenant, 'convert-northstar-002'), payload: {},
    }),
  ]);
  assert.deepEqual(conversionResponses.map(response => response.statusCode).sort(), [200, 201]);
  const conversion = conversionResponses.find(response => response.statusCode === 201)!;
  const concurrentReplay = conversionResponses.find(response => response.statusCode === 200)!;
  const converted = conversion.json();
  assert.equal(converted.lead.status, 'converted');
  assert.equal(converted.job.number, 1);
  assert.ok(converted.customer.organizationId);
  assert.equal(concurrentReplay.json().jobId, converted.job.id);
  assert.equal(concurrentReplay.json().customerId, converted.customer.id);
  const organizationContact = await db.select().from(directoryOrganizationContacts).where(and(
    eq(directoryOrganizationContacts.tenantId, tenant),
    eq(directoryOrganizationContacts.organizationId, converted.customer.organizationId),
    eq(directoryOrganizationContacts.contactId, converted.customer.primaryContactId),
  ));
  assert.equal(organizationContact.length, 1);

  const replayConversion = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/convert`,
    headers: headers(ownerA, tenant, 'convert-northstar-001'), payload: {},
  });
  assert.equal(replayConversion.statusCode, 200, replayConversion.body);
  assert.equal(replayConversion.json().jobId, converted.job.id);

  const foreignJob = await app.inject({
    method: 'GET', url: `/v1/modules/tradeflowkit/jobs/${converted.job.id}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignJob.statusCode, 404);

  const taskOneResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/jobs/${converted.job.id}/tasks`,
    headers: headers(ownerA, tenant), payload: { title: 'Isolate and recover refrigerant', priority: 'high', sortOrder: 1 },
  });
  assert.equal(taskOneResponse.statusCode, 201, taskOneResponse.body);
  const taskOne = taskOneResponse.json();
  const taskTwoResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/jobs/${converted.job.id}/tasks`,
    headers: headers(ownerA, tenant), payload: { title: 'Install replacement compressor', priority: 'urgent', sortOrder: 2 },
  });
  assert.equal(taskTwoResponse.statusCode, 201, taskTwoResponse.body);
  const taskTwo = taskTwoResponse.json();

  const dependency = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/tasks/${taskTwo.id}/dependencies`,
    headers: headers(ownerA, tenant), payload: { dependsOnTaskId: taskOne.id },
  });
  assert.equal(dependency.statusCode, 201, dependency.body);
  const blockedCompletion = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/tasks/${taskTwo.id}`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: 1, status: 'completed' },
  });
  assert.equal(blockedCompletion.statusCode, 409);
  assert.equal(blockedCompletion.json().code, 'TASK_DEPENDENCY_INCOMPLETE');

  const completedOne = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/tasks/${taskOne.id}`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: 1, status: 'completed' },
  });
  assert.equal(completedOne.statusCode, 200, completedOne.body);
  const staleOne = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/tasks/${taskOne.id}`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: 1, title: 'stale edit' },
  });
  assert.equal(staleOne.statusCode, 409);
  const completedTwo = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/tasks/${taskTwo.id}`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: 1, status: 'completed' },
  });
  assert.equal(completedTwo.statusCode, 200, completedTwo.body);

  const comment = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/comments/job/${converted.job.id}`,
    headers: headers(ownerA, tenant), payload: { body: 'Customer approved crane access for Tuesday.' },
  });
  assert.equal(comment.statusCode, 201, comment.body);
  const comments = await app.inject({
    method: 'GET', url: `/v1/modules/tradeflowkit/comments/job/${converted.job.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(comments.statusCode, 200, comments.body);
  assert.equal(comments.json().length, 1);

  const tagResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/tags',
    headers: headers(ownerA, tenant), payload: { name: 'Priority customer', color: 'amber' },
  });
  assert.equal(tagResponse.statusCode, 201, tagResponse.body);
  const tagAssignment = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/tags/${tagResponse.json().id}/assign`,
    headers: headers(ownerA, tenant), payload: { entityType: 'job', entityId: converted.job.id },
  });
  assert.equal(tagAssignment.statusCode, 201, tagAssignment.body);
  const tags = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/tags', headers: headers(ownerA, tenant),
  });
  assert.equal(tags.statusCode, 200, tags.body);
  assert.equal(tags.json().length, 1);

  const settingsResponse = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/settings', headers: headers(ownerA, tenant),
  });
  assert.equal(settingsResponse.statusCode, 200, settingsResponse.body);
  const updatedSettings = await app.inject({
    method: 'PATCH', url: '/v1/modules/tradeflowkit/settings', headers: headers(ownerA, tenant),
    payload: {
      expectedVersion: settingsResponse.json().version,
      jobPrefix: 'JOB', quotePrefix: 'EST', invoicePrefix: 'INV',
      defaultTaxRateBps: 800, defaultHourlyRateCents: 15_000,
      paymentTermsDays: 30, currency: 'USD', timezone: 'America/New_York',
    },
  });
  assert.equal(updatedSettings.statusCode, 200, updatedSettings.body);
  assert.equal(updatedSettings.json().defaultTaxRateBps, 800);

  const queuedMessage = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/job/${converted.job.id}/message`,
    headers: headers(ownerA, tenant, 'message-northstar-001'),
    payload: {
      channel: 'in_app', recipientUserId: ownerA.id,
      subject: 'Northstar job update', body: 'The compressor work is scheduled.',
    },
  });
  assert.equal(queuedMessage.statusCode, 202, queuedMessage.body);
  const queuedMessageReplay = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/job/${converted.job.id}/message`,
    headers: headers(ownerA, tenant, 'message-northstar-001'),
    payload: {
      channel: 'in_app', recipientUserId: ownerA.id,
      subject: 'Northstar job update', body: 'The compressor work is scheduled.',
    },
  });
  assert.equal(queuedMessageReplay.statusCode, 200, queuedMessageReplay.body);
  assert.equal(queuedMessageReplay.json().duplicate, true);

  const quoteResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/quotes', headers: headers(ownerA, tenant),
    payload: {
      customerId: converted.customer.id, jobId: converted.job.id, taxRateBps: 800,
      lineItems: [
        { description: 'Compressor', quantity: 1, unitPriceCents: 180_000 },
        { description: 'Installation labor', quantity: 4, unitPriceCents: 15_000 },
      ],
    },
  });
  assert.equal(quoteResponse.statusCode, 201, quoteResponse.body);
  const quote = quoteResponse.json();
  assert.equal(quote.number, 1);
  assert.equal(quote.totalCents, 259_200);
  const sent = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/transition`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: 1, status: 'sent' },
  });
  assert.equal(sent.statusCode, 200, sent.body);

  const publicLinkResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/public-link`, headers: headers(ownerA, tenant), payload: {},
  });
  assert.equal(publicLinkResponse.statusCode, 200, publicLinkResponse.body);
  const quoteToken = publicLinkResponse.json().token;
  const publicQuote = await app.inject({ method: 'GET', url: `/v1/public/tradeflowkit/quotes/${quoteToken}` });
  assert.equal(publicQuote.statusCode, 200, publicQuote.body);
  assert.equal(publicQuote.json().totalCents, quote.totalCents);
  const accepted = await app.inject({
    method: 'POST', url: `/v1/public/tradeflowkit/quotes/${quoteToken}/respond`,
    payload: { expectedVersion: 2, response: 'accepted' },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);

  const invoiceResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/invoice`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: 3 },
  });
  assert.equal(invoiceResponse.statusCode, 201, invoiceResponse.body);
  const invoice = invoiceResponse.json();
  assert.equal(invoice.number, 1);
  assert.equal(invoice.balanceCents, invoice.totalCents);
  const invoiceReplay = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/invoice`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: 3 },
  });
  assert.equal(invoiceReplay.statusCode, 200, invoiceReplay.body);
  assert.equal(invoiceReplay.json().id, invoice.id);
  const invoiceSent = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}/transition`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: 1, status: 'sent' },
  });
  assert.equal(invoiceSent.statusCode, 200, invoiceSent.body);

  const firstPayment = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}/payments`,
    headers: headers(ownerA, tenant, 'payment-northstar-001'),
    payload: { expectedVersion: 2, amountCents: 50_000, method: 'check', reference: 'CHK-5000' },
  });
  assert.equal(firstPayment.statusCode, 201, firstPayment.body);
  assert.equal(firstPayment.json().invoice.balanceCents, invoice.totalCents - 50_000);
  const firstPaymentReplay = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}/payments`,
    headers: headers(ownerA, tenant, 'payment-northstar-001'),
    payload: { expectedVersion: 2, amountCents: 50_000, method: 'check', reference: 'CHK-5000' },
  });
  assert.equal(firstPaymentReplay.statusCode, 200, firstPaymentReplay.body);
  assert.equal(firstPaymentReplay.json().payment.id, firstPayment.json().payment.id);

  const session = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}/payment-session`,
    headers: headers(ownerA, tenant, 'provider-northstar-001'), payload: {},
  });
  assert.equal(session.statusCode, 201, session.body);
  assert.match(session.json().checkoutUrl, /^https:\/\/payments\.test\//);
  const completedProvider = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/payments/${session.json().payment.id}/test-complete`,
    headers: headers(ownerA, tenant), payload: {},
  });
  assert.equal(completedProvider.statusCode, 200, completedProvider.body);
  assert.equal(completedProvider.json().invoice.status, 'paid');
  assert.equal(completedProvider.json().invoice.balanceCents, 0);
  const completedProviderReplay = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/payments/${session.json().payment.id}/test-complete`,
    headers: headers(ownerA, tenant), payload: {},
  });
  assert.equal(completedProviderReplay.statusCode, 200, completedProviderReplay.body);
  assert.equal(completedProviderReplay.json().replay, true);

  const invoiceLinkResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}/public-link`,
    headers: headers(ownerA, tenant), payload: {},
  });
  assert.equal(invoiceLinkResponse.statusCode, 200, invoiceLinkResponse.body);
  const publicInvoice = await app.inject({
    method: 'GET', url: `/v1/public/tradeflowkit/invoices/${invoiceLinkResponse.json().token}`,
  });
  assert.equal(publicInvoice.statusCode, 200, publicInvoice.body);
  assert.equal(publicInvoice.json().balanceCents, 0);
  assert.equal(publicInvoice.headers['cache-control'], 'no-store');

  const portalLinkResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/customers/${converted.customer.id}/public-link`,
    headers: headers(ownerA, tenant), payload: {},
  });
  assert.equal(portalLinkResponse.statusCode, 200, portalLinkResponse.body);
  const publicPortal = await app.inject({
    method: 'GET', url: `/v1/public/tradeflowkit/customers/${portalLinkResponse.json().token}`,
  });
  assert.equal(publicPortal.statusCode, 200, publicPortal.body);
  assert.equal(publicPortal.json().customer.id, converted.customer.id);
  assert.equal(publicPortal.json().jobs.length, 1);
  assert.equal(publicPortal.json().quotes.length, 1);
  assert.equal(publicPortal.json().invoices.length, 1);

  const operations = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/operations', headers: headers(ownerA, tenant) });
  assert.equal(operations.statusCode, 200, operations.body);
  assert.equal(Number(operations.json().metrics.completed_tasks), 2);
  assert.equal(Number(operations.json().metrics.collected_cents), invoice.totalCents);
  const invoiceExport = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/exports/invoices.csv', headers: headers(ownerA, tenant) });
  assert.equal(invoiceExport.statusCode, 200, invoiceExport.body);
  assert.match(String(invoiceExport.headers['content-type']), /text\/csv/);
  assert.match(invoiceExport.body, /total_cents/);
  assert.match(invoiceExport.body, new RegExp(String(invoice.totalCents)));

  const viewerWrite = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/jobs/${converted.job.id}/tasks`,
    headers: headers(viewer, tenant), payload: { title: 'Denied viewer task' },
  });
  assert.equal(viewerWrite.statusCode, 403);

  await app.close();
  app = await createApp(true);
  const afterRestart = await app.inject({
    method: 'GET', url: `/v1/modules/tradeflowkit/jobs/${converted.job.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(afterRestart.statusCode, 200, afterRestart.body);
  assert.equal(afterRestart.json().tasks.length, 2);
  assert.equal(afterRestart.json().comments.length, 1);

  const financialRows = await db.execute(sql`
    SELECT i.total_cents, i.paid_cents, i.balance_cents,
      COALESCE(SUM(p.amount_cents) FILTER (WHERE p.status = 'succeeded'), 0)::bigint AS succeeded_cents
    FROM tradeflowkit_invoices i
    LEFT JOIN tradeflowkit_payments p ON p.tenant_id = i.tenant_id AND p.invoice_id = i.id
    WHERE i.tenant_id = ${tenant} AND i.id = ${invoice.id}
    GROUP BY i.id
  `);
  assert.deepEqual(
    [Number(financialRows.rows[0].total_cents), Number(financialRows.rows[0].paid_cents), Number(financialRows.rows[0].balance_cents), Number(financialRows.rows[0].succeeded_cents)],
    [invoice.totalCents, invoice.totalCents, 0, invoice.totalCents],
  );
});
