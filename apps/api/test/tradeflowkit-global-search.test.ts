process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-global-search-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let moduleRow: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any, tenantId: string, key?: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
    ...(key ? { 'idempotency-key': key } : {}),
  };
}

async function createApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const instance = Fastify();
  await instance.register(cookie);
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
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
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
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

test('global search is bounded, readable by viewers, tenant isolated, and returns canonical workflow records', async () => {
  const tenantA = ownerA.currentTenantId;
  const tenantB = ownerB.currentTenantId;

  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/search?q=atlas' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);

  const invalid = await app.inject({
    method: 'GET', url: `/v1/modules/tradeflowkit/search?q=${'a'.repeat(101)}`, headers: headers(ownerA, tenantA),
  });
  assert.equal(invalid.statusCode, 400, invalid.body);
  assert.equal(invalid.json().code, 'FIELD_TOO_LONG');

  const empty = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/search', headers: headers(viewer, tenantA) });
  assert.equal(empty.statusCode, 200, empty.body);
  assert.equal(empty.json().total, 0);
  for (const group of ['leads', 'customers', 'jobs', 'tasks', 'organizations', 'contacts', 'quotes', 'invoices']) {
    assert.deepEqual(empty.json()[group], []);
  }

  const leadAResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads', headers: headers(ownerA, tenantA),
    payload: {
      name: 'Atlas Search Works', email: 'dispatch@atlas-search.test', phone: '+15555550117',
      serviceType: 'Atlas switchboard retrofit', description: 'Searchable source workflow', urgency: 'urgent',
    },
  });
  assert.equal(leadAResponse.statusCode, 201, leadAResponse.body);
  const leadA = leadAResponse.json();

  const convertedAResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${leadA.id}/convert`,
    headers: headers(ownerA, tenantA, 'atlas-search-convert-a'), payload: {},
  });
  assert.equal(convertedAResponse.statusCode, 201, convertedAResponse.body);
  const convertedA = convertedAResponse.json();

  const taskResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/jobs/${convertedA.job.id}/tasks`, headers: headers(ownerA, tenantA),
    payload: { title: 'Atlas permit verification', priority: 'high' },
  });
  assert.equal(taskResponse.statusCode, 201, taskResponse.body);
  const task = taskResponse.json();

  const quoteResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/quotes', headers: headers(ownerA, tenantA),
    payload: {
      customerId: convertedA.customer.id,
      jobId: convertedA.job.id,
      lineItems: [{ description: 'Atlas switchboard labor', quantity: 1, unitPriceCents: 125_000 }],
    },
  });
  assert.equal(quoteResponse.statusCode, 201, quoteResponse.body);
  const quote = quoteResponse.json();

  const invoiceResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/invoices', headers: headers(ownerA, tenantA),
    payload: {
      customerId: convertedA.customer.id,
      jobId: convertedA.job.id,
      lineItems: [{ description: 'Atlas mobilization', quantity: 1, unitPriceCents: 25_000 }],
    },
  });
  assert.equal(invoiceResponse.statusCode, 201, invoiceResponse.body);
  const invoice = invoiceResponse.json();

  const foreignLeadResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads', headers: headers(ownerB, tenantB),
    payload: { name: 'Atlas Foreign Tenant', email: 'foreign@atlas-search.test', serviceType: 'Atlas foreign work' },
  });
  assert.equal(foreignLeadResponse.statusCode, 201, foreignLeadResponse.body);
  const foreignLead = foreignLeadResponse.json();

  const search = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/search?q=Atlas', headers: headers(viewer, tenantA),
  });
  assert.equal(search.statusCode, 200, search.body);
  const result = search.json();
  assert.equal(result.query, 'Atlas');
  assert.ok(result.total >= 8, search.body);
  assert.equal(result.leads.some((row: any) => row.id === leadA.id), true);
  assert.equal(result.customers.some((row: any) => row.id === convertedA.customer.id), true);
  assert.equal(result.jobs.some((row: any) => row.id === convertedA.job.id), true);
  assert.equal(result.tasks.some((row: any) => row.id === task.id), true);
  assert.equal(result.organizations.some((row: any) => row.id === convertedA.customer.organizationId), true);
  assert.equal(result.contacts.some((row: any) => row.id === convertedA.customer.primaryContactId), true);
  assert.equal(result.quotes.some((row: any) => row.id === quote.id), true);
  assert.equal(result.invoices.some((row: any) => row.id === invoice.id), true);
  assert.equal(Object.values(result).flatMap(value => Array.isArray(value) ? value : []).some((row: any) => row?.id === foreignLead.id), false);
  for (const group of ['leads', 'customers', 'jobs', 'tasks', 'organizations', 'contacts', 'quotes', 'invoices']) {
    assert.ok(result[group].length <= 5, `${group} exceeded the per-type result bound`);
  }

  const wildcard = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/search?q=%25', headers: headers(viewer, tenantA),
  });
  assert.equal(wildcard.statusCode, 200, wildcard.body);
  assert.equal(wildcard.json().total, 0, 'SQL wildcard characters must be treated as literal search text');

  const foreignSearch = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/search?q=Atlas', headers: headers(ownerB, tenantB),
  });
  assert.equal(foreignSearch.statusCode, 200, foreignSearch.body);
  assert.deepEqual(foreignSearch.json().leads.map((row: any) => row.id), [foreignLead.id]);
  assert.equal(foreignSearch.json().customers.length, 0);
});
