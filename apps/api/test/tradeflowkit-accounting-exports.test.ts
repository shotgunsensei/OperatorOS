process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-accounting-export-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules,
  tenantModules,
  tradeflowkitCustomers,
  tradeflowkitInvoiceItems,
  tradeflowkitInvoices,
  tradeflowkitPayments,
  tradeflowkitSettings,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let moduleRow: any;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': user.currentTenantId,
  };
}

async function createApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const instance = Fastify();
  await instance.register(cookie);
  const { registerTradeFlowKitRoutes } = await import('../src/routes/tradeflowkit-routes.js');
  await registerTradeFlowKitRoutes(instance);
  await instance.ready();
  return instance;
}

async function seedTenant(user: any, name: string, invoiceNumber: number) {
  await db.insert(tradeflowkitSettings).values({
    tenantId: user.currentTenantId,
    invoicePrefix: invoiceNumber === 7 ? 'ACME' : 'FOREIGN',
    currency: 'USD',
    updatedByUserId: user.id,
  });
  const [customer] = await db.insert(tradeflowkitCustomers).values({
    tenantId: user.currentTenantId,
    createdByUserId: user.id,
    name,
    email: `${name.replaceAll(' ', '-').toLowerCase()}@example.test`,
    phone: '+1 555 0100',
    address: '10 Main Street',
  }).returning();
  const [invoice] = await db.insert(tradeflowkitInvoices).values({
    tenantId: user.currentTenantId,
    customerId: customer.id,
    createdByUserId: user.id,
    number: invoiceNumber,
    status: 'sent',
    lineItems: [{ description: 'Managed service', quantity: 1, unitPriceCents: 11_500 }],
    subtotalCents: 11_500,
    taxCents: 1_000,
    discountCents: 500,
    totalCents: 12_000,
    paidCents: 4_000,
    balanceCents: 8_000,
    dueDate: new Date('2026-08-31T12:00:00.000Z'),
  }).returning();
  await db.insert(tradeflowkitInvoiceItems).values({
    tenantId: user.currentTenantId,
    invoiceId: invoice.id,
    lineNumber: 1,
    description: 'Managed service',
    quantityMilli: 1_000,
    unitPriceCents: 11_500,
    lineTotalCents: 11_500,
  });
  await db.insert(tradeflowkitPayments).values([
    {
      tenantId: user.currentTenantId,
      invoiceId: invoice.id,
      createdByUserId: user.id,
      amountCents: 4_000,
      method: 'bank_transfer',
      status: 'succeeded',
      reference: `${name} partial payment`,
      idempotencyKey: `${name}-succeeded-payment`,
      paidAt: new Date('2026-08-04T12:00:00.000Z'),
    },
    {
      tenantId: user.currentTenantId,
      invoiceId: invoice.id,
      createdByUserId: user.id,
      amountCents: 8_000,
      method: 'card_external',
      status: 'failed',
      reference: `${name} failed payment`,
      idempotencyKey: `${name}-failed-payment`,
      paidAt: new Date('2026-08-05T12:00:00.000Z'),
    },
  ]);
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('tradeflowkit'); createdModule = true; }
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await seedTenant(ownerA, '=Tenant A', 7);
  await seedTenant(ownerB, 'Foreign Tenant', 99);
  app = await createApp();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    for (const owner of [ownerA, ownerB]) {
      if (!owner) continue;
      try { await db.delete(tenantModules).where(and(eq(tenantModules.moduleId, moduleRow.id), eq(tenantModules.tenantId, owner.currentTenantId))); } catch {}
    }
  }
  for (const owner of [ownerA, ownerB]) if (owner) await cleanupUser(owner.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('accounting exports require auth and remain versioned, tenant-scoped, and ledger-accurate', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/tradeflowkit/exports/quickbooks.iif' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);

  const paths = [
    '/v1/modules/tradeflowkit/exports/quickbooks.iif',
    '/v1/modules/tradeflowkit/exports/quickbooks/invoices.csv',
    '/v1/modules/tradeflowkit/exports/xero/customers.csv',
    '/v1/modules/tradeflowkit/exports/xero/invoices.csv',
    '/v1/modules/tradeflowkit/exports/xero/payments.csv',
  ];
  const responses = [];
  for (const url of paths) {
    const response = await app.inject({ method: 'GET', url, headers: headers(ownerA) });
    assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
    assert.equal(response.headers['x-tradeflowkit-accounting-export-version'], '1');
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.match(String(response.headers['content-disposition']), /attachment; filename="tradeflowkit-/);
    assert.doesNotMatch(response.body, /Foreign Tenant|FOREIGN-00099/);
    responses.push(response);
  }

  assert.match(responses[0].body, /TRNS\tINVOICE.*ACME-00007/);
  assert.match(responses[0].body, /TRNS\tPAYMENT.*40\.00.*ACME-00007/);
  assert.doesNotMatch(responses[0].body, /80\.00.*failed payment/);
  assert.match(responses[1].body, /"ACME-00007"/);
  assert.match(responses[2].body, /"'=Tenant A"/);
  assert.match(responses[3].body, /"Invoice discount","1","-5"/);
  assert.match(responses[4].body, /"40\.00","'=Tenant A partial payment"/);
  assert.doesNotMatch(responses[4].body, /failed payment/);
});
