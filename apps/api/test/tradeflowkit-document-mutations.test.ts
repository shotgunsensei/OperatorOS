process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-document-mutations-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
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
  tradeflowkitPayments,
  tradeflowkitQuoteItems,
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
let persistentQuoteId = '';
let persistentJobId = '';

function headers(user: any, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id, email: user.email, role: user.role,
      tokenVersion: user.tokenVersion, sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
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
  app = await createApp();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  for (const tenantId of [ownerA?.currentTenantId, ownerB?.currentTenantId].filter(Boolean)) {
    try { await db.delete(activityFeed).where(eq(activityFeed.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitPayments).where(eq(tradeflowkitPayments.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitInvoiceItems).where(eq(tradeflowkitInvoiceItems.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitQuoteItems).where(eq(tradeflowkitQuoteItems.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitQuotes).where(eq(tradeflowkitQuotes.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitJobs).where(eq(tradeflowkitJobs.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.tenantId, tenantId)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('draft quote edits reconcile line items and quote-to-job is tenant-scoped and idempotent', async () => {
  const customerResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/customers',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Revenue Mutation Customer', email: 'revenue-mutation@example.test' },
  });
  assert.equal(customerResponse.statusCode, 201, customerResponse.body);
  const customer = customerResponse.json();

  const quoteResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/quotes',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      customerId: customer.id,
      lineItems: [{ description: 'Initial diagnostic', quantity: 1, unitPriceCents: 5000 }],
    },
  });
  assert.equal(quoteResponse.statusCode, 201, quoteResponse.body);
  const quote = quoteResponse.json();

  const updatedResponse = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/quotes/${quote.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: quote.version, customerId: customer.id, taxRateBps: 800, discountCents: 500,
      notes: 'Approved scope for conversion',
      lineItems: [
        { description: 'Diagnostic', quantity: 2, unitPriceCents: 5000 },
        { description: 'Repair labor', quantity: 3, unitPriceCents: 7500 },
      ],
    },
  });
  assert.equal(updatedResponse.statusCode, 200, updatedResponse.body);
  const updated = updatedResponse.json();
  assert.equal(updated.version, 2);
  assert.equal(updated.subtotalCents, 32_500);
  assert.equal(updated.taxCents, 2_600);
  assert.equal(updated.totalCents, 34_600);

  const normalizedItems = await db.select().from(tradeflowkitQuoteItems).where(and(
    eq(tradeflowkitQuoteItems.tenantId, ownerA.currentTenantId),
    eq(tradeflowkitQuoteItems.quoteId, quote.id),
  )).orderBy(tradeflowkitQuoteItems.lineNumber);
  assert.deepEqual(normalizedItems.map((row) => [row.lineNumber, row.description, row.lineTotalCents]), [
    [1, 'Diagnostic', 10_000],
    [2, 'Repair labor', 22_500],
  ]);

  const staleUpdate = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/quotes/${quote.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: 1, customerId: customer.id,
      lineItems: [{ description: 'Stale overwrite', quantity: 1, unitPriceCents: 1 }],
    },
  });
  assert.equal(staleUpdate.statusCode, 409, staleUpdate.body);
  assert.equal(staleUpdate.json().code, 'QUOTE_VERSION_CONFLICT');

  const foreignUpdate = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/quotes/${quote.id}`,
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: {
      expectedVersion: 2, customerId: customer.id,
      lineItems: [{ description: 'Foreign overwrite', quantity: 1, unitPriceCents: 1 }],
    },
  });
  assert.equal(foreignUpdate.statusCode, 404, foreignUpdate.body);
  assert.equal(foreignUpdate.json().code, 'QUOTE_NOT_FOUND');

  const sent = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/transition`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 2, status: 'sent' },
  });
  assert.equal(sent.statusCode, 200, sent.body);
  const accepted = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/transition`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 3, status: 'accepted' },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);

  const lockedEdit = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/quotes/${quote.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: 4, customerId: customer.id,
      lineItems: [{ description: 'Unsafe accepted edit', quantity: 1, unitPriceCents: 1 }],
    },
  });
  assert.equal(lockedEdit.statusCode, 409, lockedEdit.body);
  assert.equal(lockedEdit.json().code, 'QUOTE_NOT_EDITABLE');

  const converted = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/job`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 4 },
  });
  assert.equal(converted.statusCode, 201, converted.body);
  const job = converted.json();
  assert.equal(job.customerId, customer.id);
  assert.equal(job.status, 'quoted');

  const replay = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/job`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 4 },
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().id, job.id);

  const foreignReplay = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/quotes/${quote.id}/job`,
    headers: headers(ownerB, ownerB.currentTenantId), payload: { expectedVersion: 4 },
  });
  assert.equal(foreignReplay.statusCode, 404, foreignReplay.body);

  persistentQuoteId = quote.id;
  persistentJobId = job.id;
});

test('direct invoices support safe draft mutation and refuse unauthorized or history-destructive actions', async () => {
  const [customer] = await db.select().from(tradeflowkitCustomers).where(eq(
    tradeflowkitCustomers.tenantId, ownerA.currentTenantId,
  )).limit(1);
  assert.ok(customer);

  const createdResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      customerId: customer.id, dueDate: '2026-08-15T12:00:00.000Z', taxRateBps: 500,
      lineItems: [
        { description: 'Parts', quantity: 2, unitPriceCents: 4500 },
        { description: 'Labor', quantity: 1, unitPriceCents: 12_000 },
      ],
    },
  });
  assert.equal(createdResponse.statusCode, 201, createdResponse.body);
  const invoice = createdResponse.json();
  assert.equal(invoice.totalCents, 22_050);
  assert.equal(invoice.balanceCents, 22_050);

  const viewerEdit = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}`,
    headers: headers(viewer, ownerA.currentTenantId),
    payload: {
      expectedVersion: 1, customerId: customer.id,
      lineItems: [{ description: 'Denied', quantity: 1, unitPriceCents: 1 }],
    },
  });
  assert.equal(viewerEdit.statusCode, 403, viewerEdit.body);
  assert.equal(viewerEdit.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');

  const updatedResponse = await app.inject({
    method: 'PATCH', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: 1, customerId: customer.id, dueDate: '2026-08-20T12:00:00.000Z',
      discountCents: 1000, notes: 'Net terms approved',
      lineItems: [{ description: 'Consolidated service', quantity: 2, unitPriceCents: 10_000 }],
    },
  });
  assert.equal(updatedResponse.statusCode, 200, updatedResponse.body);
  const updated = updatedResponse.json();
  assert.equal(updated.version, 2);
  assert.equal(updated.totalCents, 19_000);
  assert.equal(updated.balanceCents, 19_000);

  const normalizedItems = await db.select().from(tradeflowkitInvoiceItems).where(and(
    eq(tradeflowkitInvoiceItems.tenantId, ownerA.currentTenantId),
    eq(tradeflowkitInvoiceItems.invoiceId, invoice.id),
  ));
  assert.equal(normalizedItems.length, 1);
  assert.equal(normalizedItems[0].description, 'Consolidated service');

  const foreignArchive = await app.inject({
    method: 'DELETE', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}`,
    headers: headers(ownerB, ownerB.currentTenantId), payload: { expectedVersion: 2 },
  });
  assert.equal(foreignArchive.statusCode, 404, foreignArchive.body);

  const archivedResponse = await app.inject({
    method: 'DELETE', url: `/v1/modules/tradeflowkit/invoices/${invoice.id}`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 2 },
  });
  assert.equal(archivedResponse.statusCode, 200, archivedResponse.body);
  assert.equal(archivedResponse.json().ok, true);

  const activeDashboard = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/revenue',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(activeDashboard.statusCode, 200, activeDashboard.body);
  assert.equal(activeDashboard.json().invoices.some((row: any) => row.id === invoice.id), false);

  const lockedResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      customerId: customer.id,
      lineItems: [{ description: 'Committed invoice', quantity: 1, unitPriceCents: 15_000 }],
    },
  });
  assert.equal(lockedResponse.statusCode, 201, lockedResponse.body);
  const lockedInvoice = lockedResponse.json();
  const sent = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${lockedInvoice.id}/transition`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 1, status: 'sent' },
  });
  assert.equal(sent.statusCode, 200, sent.body);
  const paid = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${lockedInvoice.id}/pay`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: 2, paymentMethod: 'check', paymentReference: 'SAFE-ARCHIVE-TEST' },
  });
  assert.equal(paid.statusCode, 200, paid.body);

  const archivePaid = await app.inject({
    method: 'DELETE', url: `/v1/modules/tradeflowkit/invoices/${lockedInvoice.id}`,
    headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 3 },
  });
  assert.equal(archivePaid.statusCode, 409, archivePaid.body);
  assert.equal(archivePaid.json().code, 'INVOICE_NOT_ARCHIVABLE');
});

test('invoice transition rolls back a scoped activity fault and permits the identical retry', async () => {
  // Revalidate the pool captured by db.ts before installing any temporary DDL.
  // The shared fixture refuses remote, persistent or query-retargeted targets.
  await ensureSchemaReady();
  const [customer] = await db.select().from(tradeflowkitCustomers).where(eq(
    tradeflowkitCustomers.tenantId, ownerA.currentTenantId,
  )).limit(1);
  assert.ok(customer);
  const create = async () => {
    const response = await app.inject({
      method: 'POST', url: '/v1/modules/tradeflowkit/invoices',
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { customerId: customer.id, lineItems: [{ description: 'Synthetic atomic transition', quantity: 1, unitPriceCents: 25000 }] },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  };
  const invoice = await create();
  const other = await create();
  const scope = randomUUID().replaceAll('-', '');
  const functionName = `tfk_transition_fault_${scope}`;
  const triggerName = `tfk_transition_trigger_${scope}`;
  assert.match(invoice.id, /^[0-9a-f-]{36}$/i);
  assert.match(ownerA.currentTenantId, /^[0-9a-f-]{36}$/i);
  // Only UUIDs from isolated fixtures and generated identifier-safe names are
  // interpolated into DDL. PostgreSQL utility statements cannot bind these
  // identifiers. The trigger affects exactly this synthetic invoice/tenant.
  let functionCreated = false;
  let triggerCreated = false;
  const snapshot = async () => ({
    invoice: await db.select().from(tradeflowkitInvoices).where(and(
      eq(tradeflowkitInvoices.id, invoice.id), eq(tradeflowkitInvoices.tenantId, ownerA.currentTenantId),
    )),
    activity: await db.select().from(activityFeed).where(and(
      eq(activityFeed.entityId, invoice.id), eq(activityFeed.tenantId, ownerA.currentTenantId),
    )),
  });
  const transition = (document: any, user = ownerA) => app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/invoices/${document.id}/transition`,
    headers: headers(user, user.currentTenantId), payload: { expectedVersion: document.version, status: 'sent' },
  });
  try {
    await db.execute(sql.raw(`CREATE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SYNTHETIC_TFK_TRANSITION_ACTIVITY_FAULT'; END; $$`));
    functionCreated = true;
    await db.execute(sql.raw(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON activity_feed FOR EACH ROW
      WHEN (NEW.tenant_id = '${ownerA.currentTenantId}' AND NEW.entity_id = '${invoice.id}'
        AND NEW.entity_type = 'tradeflowkit_invoice' AND NEW.action = 'status_changed')
      EXECUTE FUNCTION public.${functionName}()`));
    triggerCreated = true;
    const before = await snapshot();
    const foreign = await transition(invoice, ownerB);
    assert.equal(foreign.statusCode, 404, foreign.body);
    assert.deepEqual(await snapshot(), before);
    // A different owned document proves the injected failure is narrowly scoped.
    const unaffected = await transition(other);
    assert.equal(unaffected.statusCode, 200, unaffected.body);
    const failed = await transition(invoice);
    assert.equal(failed.statusCode, 500, failed.body);
    assert.deepEqual(await snapshot(), before, 'an activity failure must roll back invoice status, timestamps and version');
    await db.execute(sql.raw(`DROP TRIGGER ${triggerName} ON activity_feed`));
    triggerCreated = false;
    const retry = await transition(invoice);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().status, 'sent');
    assert.equal(retry.json().version, invoice.version + 1);
    const afterRetry = await snapshot();
    const transitions = afterRetry.activity.filter(entry => entry.action === 'status_changed');
    assert.equal(transitions.length, 1);
    assert.deepEqual(transitions[0].metadata, { fromStatus: 'draft', toStatus: 'sent' });
    const duplicate = await transition(invoice);
    assert.equal(duplicate.statusCode, 409, duplicate.body);
    assert.equal(duplicate.json().code, 'INVOICE_TRANSITION_INVALID');
    assert.deepEqual(await snapshot(), afterRetry);
  } finally {
    if (triggerCreated) await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON activity_feed`));
    if (functionCreated) await db.execute(sql.raw(`DROP FUNCTION IF EXISTS public.${functionName}()`));
  }
});

test('quote and converted job survive API shutdown and remain visible through a fresh database connection', async () => {
  await app.close();
  app = null;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const quote = await pool.query(
      'SELECT id, job_id FROM tradeflowkit_quotes WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL',
      [ownerA.currentTenantId, persistentQuoteId],
    );
    const job = await pool.query(
      'SELECT id FROM tradeflowkit_jobs WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL',
      [ownerA.currentTenantId, persistentJobId],
    );
    assert.equal(quote.rowCount, 1);
    assert.equal(quote.rows[0].job_id, persistentJobId);
    assert.equal(job.rowCount, 1);
  } finally {
    await pool.end();
  }
});
