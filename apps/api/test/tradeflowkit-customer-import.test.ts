process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-customer-import-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { db } from '../src/db.js';
import {
  activityFeed,
  directoryContacts,
  directoryOrganizationContacts,
  directoryOrganizations,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tradeflowkitCustomers,
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
let persistedCustomerId = '';

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
    try { await db.delete(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryOrganizationContacts).where(eq(directoryOrganizationContacts.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryContacts).where(eq(directoryContacts.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryOrganizations).where(eq(directoryOrganizations.tenantId, tenantId)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('customer import rejects missing replay protection, oversized batches, and viewer writes', async () => {
  const missingKey = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers/import',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { customers: [{ name: 'Missing Key' }] },
  });
  assert.equal(missingKey.statusCode, 400, missingKey.body);
  assert.equal(missingKey.json().code, 'IDEMPOTENCY_KEY_REQUIRED');

  const oversized = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'customer-import:oversized-batch'),
    payload: { customers: Array.from({ length: 101 }, (_, index) => ({ name: `Customer ${index}` })) },
  });
  assert.equal(oversized.statusCode, 400, oversized.body);
  assert.equal(oversized.json().code, 'CUSTOMER_IMPORT_ROWS_INVALID');

  const viewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers/import',
    headers: headers(viewer, ownerA.currentTenantId, 'customer-import:viewer-denied'),
    payload: { customers: [{ name: 'Viewer Cannot Import' }] },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
  assert.equal(viewerWrite.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
});

test('customer import reconciles Directory records, validates rows, and is replay safe per tenant', async () => {
  const payload = {
    customers: [
      {
        name: 'Alpha Service Company',
        email: 'alpha@example.test',
        phone: '(555) 010-1000',
        address: '100 Alpha Avenue',
        notes: 'Priority service account',
      },
      { name: 'Invalid Email', email: 'not-an-email' },
      { name: 'Beta Workshop', phone: '555-010-2000' },
      { name: '  alpha   service company  ', email: 'second-alpha@example.test' },
      { name: 'Gamma Duplicate Contact', email: 'ALPHA@example.test' },
    ],
  };
  const imported = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'customer-import:directory-reconcile-v1'),
    payload,
  });
  assert.equal(imported.statusCode, 200, imported.body);
  const result = imported.json();
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.errors, [{ row: 3, code: 'EMAIL_INVALID', field: 'email' }]);
  assert.deepEqual(result.skippedRows, [
    { row: 5, reason: 'duplicate_name' },
    { row: 6, reason: 'duplicate_email' },
  ]);
  assert.equal(result.customers.length, 2);
  persistedCustomerId = result.customers[0].id;

  const customerRows = await db.select().from(tradeflowkitCustomers)
    .where(eq(tradeflowkitCustomers.tenantId, ownerA.currentTenantId));
  assert.equal(customerRows.length, 2);
  assert.ok(customerRows.every(row => row.organizationId));
  assert.ok(customerRows.every(row => row.primaryContactId));
  assert.ok(customerRows.every(row => /^customer-import:[0-9a-f]{64}$/.test(row.sourceId ?? '')));
  const organizations = await db.select().from(directoryOrganizations)
    .where(eq(directoryOrganizations.tenantId, ownerA.currentTenantId));
  const contacts = await db.select().from(directoryContacts)
    .where(eq(directoryContacts.tenantId, ownerA.currentTenantId));
  assert.equal(organizations.length, 2);
  assert.equal(contacts.length, 2);

  const importEvents = await db.select().from(activityFeed)
    .where(eq(activityFeed.tenantId, ownerA.currentTenantId));
  const completed = importEvents.find(event => event.entityType === 'tradeflowkit_customer_import');
  assert.ok(completed);
  assert.match(String(completed.metadata?.requestSha256), /^[0-9a-f]{64}$/);
  assert.deepEqual(completed.metadata, {
    idempotencyKey: 'customer-import:directory-reconcile-v1',
    requestSha256: completed.metadata?.requestSha256,
    totalRows: 5,
    imported: 2,
    skipped: 2,
    errors: 1,
    validationErrors: [{ row: 3, code: 'EMAIL_INVALID', field: 'email' }],
    skippedRows: [
      { row: 5, reason: 'duplicate_name' },
      { row: 6, reason: 'duplicate_email' },
    ],
    importedCustomerIds: result.customers.map((customer: { id: string }) => customer.id),
  });
  assert.equal(JSON.stringify(importEvents).includes('alpha@example.test'), false);
  const idempotencyClaims = await db.execute(sql`
    SELECT status, request_sha256, response_json
    FROM shared_idempotency_keys
    WHERE tenant_id = ${ownerA.currentTenantId}
      AND module_id = ${moduleRow.id}
      AND scope = 'tradeflowkit-customer-import'
      AND idempotency_key = 'customer-import:directory-reconcile-v1'
  `);
  assert.equal(idempotencyClaims.rows.length, 1);
  assert.equal(idempotencyClaims.rows[0].status, 'completed');
  assert.match(String(idempotencyClaims.rows[0].request_sha256), /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(idempotencyClaims.rows[0].response_json).includes('alpha@example.test'), false);

  const replay = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'customer-import:directory-reconcile-v1'),
    payload,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().imported, 2);
  assert.equal(replay.json().skipped, 2);
  assert.deepEqual(replay.json().errors, result.errors);
  assert.deepEqual(
    replay.json().customers.map((customer: { id: string }) => customer.id),
    result.customers.map((customer: { id: string }) => customer.id),
  );
  assert.equal((await db.select().from(tradeflowkitCustomers)
    .where(eq(tradeflowkitCustomers.tenantId, ownerA.currentTenantId))).length, 2);
  assert.equal((await db.select().from(activityFeed).where(and(
    eq(activityFeed.tenantId, ownerA.currentTenantId),
    eq(activityFeed.entityType, 'tradeflowkit_customer_import'),
  ))).length, 1);
  assert.equal((await db.execute(sql`
    SELECT id FROM shared_idempotency_keys
    WHERE tenant_id = ${ownerA.currentTenantId}
      AND module_id = ${moduleRow.id}
      AND scope = 'tradeflowkit-customer-import'
      AND idempotency_key = 'customer-import:directory-reconcile-v1'
  `)).rows.length, 1);

  const conflictingReuse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers/import',
    headers: headers(ownerA, ownerA.currentTenantId, 'customer-import:directory-reconcile-v1'),
    payload: { customers: [{ name: 'Different Payload' }] },
  });
  assert.equal(conflictingReuse.statusCode, 409, conflictingReuse.body);
  assert.equal(conflictingReuse.json().code, 'IDEMPOTENCY_KEY_REUSE');

  const otherTenant = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers/import',
    headers: headers(ownerB, ownerB.currentTenantId, 'customer-import:tenant-b'),
    payload: { customers: [{ name: 'Alpha Service Company', email: 'tenant-b@example.test' }] },
  });
  assert.equal(otherTenant.statusCode, 200, otherTenant.body);
  assert.equal(otherTenant.json().imported, 1);

  const tenantBRevenue = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/revenue',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(tenantBRevenue.statusCode, 200, tenantBRevenue.body);
  assert.equal(tenantBRevenue.json().customers.length, 1);
  assert.equal(tenantBRevenue.json().customers[0].email, 'tenant-b@example.test');
});

test('imported customer remains durable after the API is closed', async () => {
  await app.close();
  app = null;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `SELECT c.id, c.organization_id, o.name
       FROM tradeflowkit_customers c
       INNER JOIN directory_organizations o
         ON o.tenant_id = c.tenant_id AND o.id = c.organization_id
       WHERE c.tenant_id = $1 AND c.id = $2`,
      [ownerA.currentTenantId, persistedCustomerId],
    );
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].name, 'Alpha Service Company');
    assert.ok(result.rows[0].organization_id);
  } finally {
    await pool.end();
  }
});
