import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, closeDatabasePool } from '../src/db.js';
import { ensureSchemaReady, createTestUser, createTestModule } from './_setup.js';
import { tenantModules, tenantUsers, tenantUserModuleAccess } from '../src/schema.js';
import { ensureSharedCustomerLinks } from '../src/lib/shared-customer-db-init.js';

let app: any, owner: any, foreign: any, viewer: any;
let signToken: typeof import('../src/lib/auth.js').signToken;
const moduleIds: Record<string, string> = {};
let customer: any, sharedId: string, snapId: string, brandId: string;
function headers(user = owner, tenantId = owner.currentTenantId, moduleSlug?: string) {
  return { authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role,
    tokenVersion: user.tokenVersion, sessionType: moduleSlug ? 'module' : 'platform',
    ...(moduleSlug ? { tenantId, moduleId: moduleSlug } : {}),
  })}`, 'x-tenant-id': tenantId };
}
before(async () => {
  assert.equal(process.env.PARITY_DATABASE_IS_DISPOSABLE, '1');
  await ensureSchemaReady();
  await ensureSharedCustomerLinks(); // idempotent additive release
  ({ signToken } = await import('../src/lib/auth.js'));
  owner = await createTestUser(); foreign = await createTestUser(); viewer = await createTestUser();
  await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId, userId: viewer.id, role: 'member' });
  for (const slug of ['tradeflowkit', 'snapproofos', 'brandforgeos', 'techdeck', 'pulsedesk']) {
    const module = await createTestModule(slug); moduleIds[slug] = module.id;
    await db.insert(tenantModules).values([owner, foreign].map(user => ({ tenantId: user.currentTenantId, moduleId: module.id, status: 'enabled' as const, source: 'admin' as const, allowAllMembers: true })));
    await db.insert(tenantUserModuleAccess).values({ tenantId: owner.currentTenantId, userId: viewer.id, moduleId: module.id, accessLevel: 'viewer' });
  }
  const Fastify = (await import('fastify')).default;
  app = Fastify(); await app.register((await import('@fastify/cookie')).default);
  await (await import('../src/routes/directory-routes.js')).registerDirectoryRoutes(app);
  await (await import('../src/routes/module-shell-routes.js')).registerModuleShellRoutes(app);
  await (await import('../src/routes/snapproofos-phase32-routes.js')).registerSnapProofOsPhase32Routes(app);
  await app.ready();
});
after(async () => { await app?.close(); await closeDatabasePool(); });

test('TradeFlowKit customer is immediately available to enabled modules without private notes', async () => {
  const created = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(), payload: {
    name: 'Shared Test Customer', email: 'shared@example.test', phone: '+15555550100', address: '101 Test Lane', notes: 'Private billing instructions',
  } });
  assert.equal(created.statusCode, 201, created.body); customer = created.json(); sharedId = customer.organizationId;
  for (const slug of Object.keys(moduleIds)) {
    const res = await app.inject({ method: 'GET', url: `/v1/modules/${slug}/shared-customers?search=Shared`, headers: headers() });
    assert.equal(res.statusCode, 200, res.body);
    const found = res.json().customers.find((row: any) => row.id === sharedId);
    assert.equal(found.email, 'shared@example.test'); assert.equal(found.address, '101 Test Lane');
    assert.equal('notes' in found, false); assert.equal('tenantId' in found, false);
    assert.equal(res.headers['cache-control'], 'private, no-store');
  }
});

test('SnapProof reuses shared identity without typing and simultaneous retries create one customer', async () => {
  const requests = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/v1/modules/snapproofos/customers', headers: headers(), payload: {
    directoryOrganizationId: sharedId, name: 'Forged client name', email: 'wrong@example.test',
  } })));
  for (const response of requests) assert.equal(response.statusCode, 201, response.body);
  const first = requests[0].json().customer; snapId = first.id;
  assert.equal(first.name, customer.name); assert.equal(first.email, customer.email);
  assert.equal(requests[1].json().customer.id, snapId);
  const count = await db.execute(sql`SELECT count(*)::int AS n FROM snapproof_customers WHERE tenant_id=${owner.currentTenantId} AND directory_organization_id=${sharedId}`);
  assert.equal(count.rows[0].n, 1);
});

test('BrandForge saves a durable shared-customer link while keeping the brand identity independent', async () => {
  const response = await app.inject({ method: 'POST', url: '/v1/modules/brandforgeos/brands', headers: headers(), payload: {
    name: 'Separate Brand Name', directoryOrganizationId: sharedId,
  } });
  assert.equal(response.statusCode, 201, response.body); brandId = response.json().id;
  const fetched = await app.inject({ method: 'GET', url: `/v1/modules/brandforgeos/brands/${brandId}`, headers: headers() });
  assert.equal(fetched.json().sharedCustomer.id, sharedId); assert.equal(fetched.json().name, 'Separate Brand Name');
});

test('Editing TradeFlowKit contact details refreshes linked modules but preserves stored historical snapshots', async () => {
  const changed = await app.inject({ method: 'PATCH', url: `/v1/modules/tradeflowkit/customers/${customer.id}`, headers: headers(), payload: {
    expectedVersion: customer.version, name: 'Updated Shared Customer', email: 'updated@example.test', phone: '+15555550101', address: '202 Test Lane',
  } });
  assert.equal(changed.statusCode, 200, changed.body);
  for (const path of [`snapproofos/customers/${snapId}`, `brandforgeos/brands/${brandId}`]) {
    const response = await app.inject({ method: 'GET', url: `/v1/modules/${path}`, headers: headers() });
    assert.equal(response.statusCode, 200, response.body);
    const data = response.json().customer ?? response.json();
    assert.equal(data.sharedCustomer.name, 'Updated Shared Customer');
    assert.equal(data.sharedCustomer.email, 'updated@example.test'); assert.equal(data.sharedCustomer.address, '202 Test Lane');
  }
  const snapshot = await db.execute(sql`SELECT email FROM snapproof_customers WHERE tenant_id=${owner.currentTenantId} AND id=${snapId}`);
  assert.equal(snapshot.rows[0].email, 'shared@example.test');
});

test('A customer created in SnapProof becomes available in the shared directory too', async () => {
  const response = await app.inject({ method: 'POST', url: '/v1/modules/snapproofos/customers', headers: headers(), payload: { name: 'Snap Created Customer', email: 'snap@example.test' } });
  assert.equal(response.statusCode, 201, response.body);
  const found = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers?search=Snap%20Created', headers: headers() });
  assert.equal(found.json().customers.length, 1); assert.equal(found.json().customers[0].email, 'snap@example.test');
  const shared = found.json().customers[0];
  const linked = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(), payload: { directoryOrganizationId: shared.id, name: shared.name } });
  assert.equal(linked.statusCode, 201, linked.body); assert.equal(linked.json().email, 'snap@example.test');
  const replay = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(), payload: { directoryOrganizationId: shared.id, name: shared.name } });
  assert.equal(replay.json().id, linked.json().id);
});

test('Creating a same-name customer does not silently merge or overwrite shared details', async () => {
  const before = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers', headers: headers() });
  const existing = before.json().customers.find((row: any) => row.id === sharedId);
  const duplicate = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(), payload: {
    name: existing.name, email: 'different@example.test', address: 'Different address',
  } });
  assert.equal(duplicate.statusCode, 409, duplicate.body);
  const loaded = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers?search=Shared', headers: headers() });
  const shared = loaded.json().customers.find((row: any) => row.id === sharedId);
  assert.equal(shared.email, existing.email); assert.equal(shared.address, existing.address);
});

test('Shared edits from BrandForge update TradeFlowKit once and reject stale or unauthorized changes', async () => {
  const loaded = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers?search=Updated', headers: headers() });
  const shared = loaded.json().customers[0];
  const payload = { expectedRevision: shared.revision, name: 'Directory Edited Customer', email: 'directory@example.test', phone: shared.phone, address: '303 Shared Lane', website: 'https://example.test' };
  const denied = await app.inject({ method: 'PATCH', url: `/v1/modules/brandforgeos/shared-customers/${shared.id}`, headers: headers(viewer), payload });
  assert.equal(denied.statusCode, 403, denied.body);
  const changed = await app.inject({ method: 'PATCH', url: `/v1/modules/brandforgeos/shared-customers/${shared.id}`, headers: headers(), payload });
  assert.equal(changed.statusCode, 200, changed.body); assert.notEqual(changed.json().revision, shared.revision);
  const stale = await app.inject({ method: 'PATCH', url: `/v1/modules/brandforgeos/shared-customers/${shared.id}`, headers: headers(), payload });
  assert.equal(stale.statusCode, 409, stale.body);
  const row = await db.execute(sql`SELECT name,email,address FROM tradeflowkit_customers WHERE tenant_id=${owner.currentTenantId} AND id=${customer.id}`);
  assert.equal(row.rows[0].email, 'directory@example.test'); assert.equal(row.rows[0].address, '303 Shared Lane');
  const foreignWrite = await app.inject({ method: 'PATCH', url: `/v1/modules/brandforgeos/shared-customers/${shared.id}`, headers: headers(foreign, foreign.currentTenantId), payload: { ...payload, expectedRevision: changed.json().revision } });
  assert.equal(foreignWrite.statusCode, 404, foreignWrite.body);
});

test('Cross-organization read and forged links cannot expose or attach another customer', async () => {
  const list = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers', headers: headers(foreign, foreign.currentTenantId) });
  assert.equal(list.statusCode, 200); assert.equal(list.json().customers.length, 0);
  for (const id of [sharedId, randomUUID()]) {
    const response = await app.inject({ method: 'POST', url: '/v1/modules/brandforgeos/brands', headers: headers(foreign, foreign.currentTenantId), payload: { name: 'Forbidden', directoryOrganizationId: id } });
    assert.equal(response.statusCode, 404, response.body);
  }
  await assert.rejects(db.execute(sql`INSERT INTO brandforge_brands(tenant_id,name,directory_organization_id) VALUES (${foreign.currentTenantId},'Direct FK check',${sharedId})`));
});

test('SnapProof directs linked contact edits to shared details while retaining private notes', async () => {
  const changed = await app.inject({ method: 'PATCH', url: `/v1/modules/snapproofos/customers/${snapId}`, headers: headers(), payload: { email: 'silent-overwrite@example.test' } });
  assert.equal(changed.statusCode, 409, changed.body);
  assert.equal(changed.json().code, 'SHARED_CUSTOMER_EDIT_REQUIRED');
  const notes = await app.inject({ method: 'PATCH', url: `/v1/modules/snapproofos/customers/${snapId}`, headers: headers(), payload: { notes: 'Private inspection note' } });
  assert.equal(notes.statusCode, 200, notes.body);
  const listed = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers', headers: headers() });
  assert.doesNotMatch(listed.body, /Private inspection note|silent-overwrite/);
});

test('Linking shared customers preserves a chosen service site and private module details', async () => {
  const siteId = randomUUID();
  await db.execute(sql`INSERT INTO directory_sites(id,tenant_id,organization_id,name,normalized_name,created_by_user_id,updated_by_user_id)
    VALUES (${siteId},${owner.currentTenantId},${sharedId},'Second site','second site',${owner.id},${owner.id})`);
  const linked = await app.inject({ method: 'POST', url: '/v1/modules/snapproofos/customers', headers: headers(), payload: {
    directoryOrganizationId: sharedId, directorySiteId: siteId, company: 'Site team', notes: 'Private site access instructions',
  } });
  assert.equal(linked.statusCode, 201, linked.body);
  assert.equal(linked.json().customer.directorySiteId, siteId);
  assert.equal(linked.json().customer.notes, 'Private site access instructions');
  assert.notEqual(linked.json().customer.id, snapId);
});

test('Inactive name matches explain reactivation and can be selected after reactivation', async () => {
  const name = 'Inactive Review Customer';
  const created = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(), payload: { name } });
  assert.equal(created.statusCode, 201, created.body);
  const saved = created.json();
  await db.execute(sql`UPDATE directory_organizations SET status='inactive' WHERE tenant_id=${owner.currentTenantId} AND id=${saved.organizationId}`);
  const rejected = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(), payload: { name, email: 'should-not-save@example.test' } });
  assert.equal(rejected.statusCode, 409, rejected.body);
  assert.equal(rejected.json().code, 'SHARED_CUSTOMER_INACTIVE');
  assert.match(rejected.json().error, /reactivate.*business directory/);
  assert.doesNotMatch(rejected.json().error, /Choose.*Shared customers/);
  const hidden = await app.inject({ method: 'GET', url: `/v1/modules/tradeflowkit/shared-customers?search=${encodeURIComponent(name)}`, headers: headers() });
  assert.equal(hidden.json().customers.length, 0);
  const stored = await db.execute(sql`SELECT status,version FROM directory_organizations WHERE tenant_id=${owner.currentTenantId} AND id=${saved.organizationId}`);
  assert.equal(stored.rows[0].status, 'inactive');
  const count = await db.execute(sql`SELECT COUNT(*)::int AS n FROM tradeflowkit_customers WHERE tenant_id=${owner.currentTenantId} AND organization_id=${saved.organizationId}`);
  assert.equal(count.rows[0].n, 1);
  const activated = await app.inject({ method: 'PATCH', url: `/v1/modules/tradeflowkit/directory/organizations/${saved.organizationId}`, headers: headers(), payload: { expectedVersion: Number(stored.rows[0].version), status: 'active' } });
  assert.equal(activated.statusCode, 200, activated.body);
  const visible = await app.inject({ method: 'GET', url: `/v1/modules/tradeflowkit/shared-customers?search=${encodeURIComponent(name)}`, headers: headers() });
  assert.equal(visible.json().customers[0].id, saved.organizationId);
  const linked = await app.inject({ method: 'POST', url: '/v1/modules/tradeflowkit/customers', headers: headers(), payload: { directoryOrganizationId: saved.organizationId } });
  assert.equal(linked.statusCode, 201, linked.body); assert.equal(linked.json().id, saved.id);
});

test('SnapProof search matches the current shared name and primary email without exposing other tenants', async () => {
  for (const search of ['Directory Edited Customer', 'DIRECTORY@EXAMPLE.TEST']) {
    const url = `/v1/modules/snapproofos/customers?search=${encodeURIComponent(search)}`;
    const found = await app.inject({ method: 'GET', url, headers: headers() });
    assert.equal(found.statusCode, 200, found.body);
    assert.ok(found.json().customers.some((row: any) => row.id === snapId));
    const denied = await app.inject({ method: 'GET', url, headers: headers(foreign, foreign.currentTenantId) });
    assert.equal(denied.statusCode, 200, denied.body); assert.equal(denied.json().customers.length, 0);
  }
  const old = await app.inject({ method: 'GET', url: '/v1/modules/snapproofos/customers?search=shared%40example.test', headers: headers() });
  assert.equal(old.json().customers.some((row: any) => row.id === snapId), false);
});

test('SnapProof search preserves legacy fallback and does not match cleared shared email or wildcard text', async () => {
  const created = await app.inject({ method: 'POST', url: '/v1/modules/snapproofos/customers', headers: headers(), payload: { name: 'Search Fallback Review', email: 'search-snapshot@example.test' } });
  assert.equal(created.statusCode, 201, created.body);
  const saved = created.json().customer;
  await db.execute(sql`UPDATE directory_contacts SET email=NULL,normalized_email=NULL WHERE tenant_id=${owner.currentTenantId} AND id=${saved.directoryContactId}`);
  const url = '/v1/modules/snapproofos/customers?search=search-snapshot%40example.test';
  const cleared = await app.inject({ method: 'GET', url, headers: headers() });
  assert.equal(cleared.json().customers.length, 0);
  await db.execute(sql`UPDATE directory_organizations SET status='inactive' WHERE tenant_id=${owner.currentTenantId} AND id=${saved.directoryOrganizationId}`);
  const fallback = await app.inject({ method: 'GET', url, headers: headers() });
  assert.equal(fallback.json().customers[0].id, saved.id);
  await db.execute(sql`UPDATE snapproof_customers SET directory_organization_id=NULL,directory_contact_id=NULL WHERE tenant_id=${owner.currentTenantId} AND id=${saved.id}`);
  const legacy = await app.inject({ method: 'GET', url, headers: headers() });
  assert.equal(legacy.json().customers[0].id, saved.id);
  const wildcard = await app.inject({ method: 'GET', url: '/v1/modules/snapproofos/customers?search=%25', headers: headers() });
  assert.equal(wildcard.json().customers.length, 0);
});

test('Viewer can read shared identity but cannot create a linked module record', async () => {
  const read = await app.inject({ method: 'GET', url: '/v1/modules/snapproofos/shared-customers', headers: headers(viewer) });
  assert.equal(read.statusCode, 200, read.body);
  const write = await app.inject({ method: 'POST', url: '/v1/modules/snapproofos/customers', headers: headers(viewer), payload: { directoryOrganizationId: sharedId } });
  assert.equal(write.statusCode, 403, write.body);
});

test('Anonymous, disabled-module and cross-module sessions remain blocked', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers' })).statusCode, 401);
  const wrongModule = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers', headers: headers(owner, owner.currentTenantId, 'snapproofos') });
  assert.equal(wrongModule.statusCode, 403, wrongModule.body);
  await db.execute(sql`UPDATE tenant_modules SET status='disabled' WHERE tenant_id=${owner.currentTenantId} AND module_id=${moduleIds.brandforgeos}`);
  const denied = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/shared-customers', headers: headers() });
  assert.equal(denied.statusCode, 403, denied.body);
});
