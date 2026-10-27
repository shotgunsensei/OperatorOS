import assert from 'node:assert/strict';
import test from 'node:test';
import { ids, workspaceFixture } from './customer-workspace-fixture.js';

test('qualified context contains canonical IDs and a stable revision, not private notes', async () => {
  const f = workspaceFixture(); const first = await f.context();
  assert.equal(first.organizationId, ids.organization); assert.equal(first.contactId, ids.contact); assert.equal(first.siteId, ids.site);
  assert.match(first.revision, /^[0-9a-f]{64}$/); assert.deepEqual(await f.context(), first);
  assert.equal('notes' in first, false);
});

for (const boundary of ['organization tenant', 'organization archived', 'organization inactive', 'contact tenant', 'contact archived', 'contact inactive', 'contact association', 'site tenant', 'site organization', 'site archived', 'site inactive']) test(`qualified context rejects ${boundary}`, async () => {
  const f = workspaceFixture();
  if (boundary === 'organization tenant') f.organization.tenant_id = ids.otherTenant;
  if (boundary === 'organization archived') f.organization.archived_at = '2026-10-27';
  if (boundary === 'organization inactive') f.organization.status = 'inactive';
  if (boundary === 'contact tenant') f.contact.tenant_id = ids.otherTenant;
  if (boundary === 'contact archived') f.contact.archived_at = '2026-10-27';
  if (boundary === 'contact inactive') f.contact.status = 'inactive';
  if (boundary === 'contact association') f.association.organization_id = 'foreign-organization';
  if (boundary === 'site tenant') f.site.tenant_id = ids.otherTenant;
  if (boundary === 'site organization') f.site.organization_id = 'foreign-organization';
  if (boundary === 'site archived') f.site.archived_at = '2026-10-27';
  if (boundary === 'site inactive') f.site.status = 'inactive';
  await assert.rejects(f.context(), { code: 'CUSTOMER_CONTEXT_NOT_FOUND', statusCode: 404 });
  assert.equal(f.native.length, 0);
});

for (const edited of ['organization', 'contact', 'site']) test(`job confirmation rejects a changed ${edited} revision`, async () => {
  const f = workspaceFixture(); const context = await f.context();
  if (edited === 'organization') f.organization.name = 'Changed business name';
  if (edited === 'contact') f.contact.email = 'new@example.test';
  if (edited === 'site') f.site.version++;
  await assert.rejects(f.database.transaction(tx => f.helper.inspectWorkspaceJob({ tenantId: ids.tenant, jobId: ids.job, expectedSourceVersion: 1, directoryContext: context }, tx)), { code: 'CUSTOMER_CONTEXT_CHANGED' });
  assert.equal(f.native.length, 0);
});

test('job confirmation rejects foreign/deleted jobs and changed job version/context', async () => {
  const f = workspaceFixture(); const context = await f.context();
  f.job.tenant_id = ids.otherTenant;
  await assert.rejects(f.helper.inspectWorkspaceJob({ tenantId: ids.tenant, jobId: ids.job, expectedSourceVersion: 1, directoryContext: context }), { code: 'CUSTOMER_CONTEXT_NOT_FOUND' });
  f.job.tenant_id = ids.tenant; f.job.deleted_at = '2026-10-27';
  await assert.rejects(f.helper.inspectWorkspaceJob({ tenantId: ids.tenant, jobId: ids.job, expectedSourceVersion: 1, directoryContext: context }), { code: 'CUSTOMER_CONTEXT_NOT_FOUND' });
  f.job.deleted_at = null;
  await assert.rejects(f.helper.inspectWorkspaceJob({ tenantId: ids.tenant, jobId: ids.job, expectedSourceVersion: 2, directoryContext: context }), { code: 'CUSTOMER_CONTEXT_CHANGED' });
  await assert.rejects(f.helper.inspectWorkspaceJob({ tenantId: ids.tenant, jobId: ids.job, expectedSourceVersion: 1, directoryContext: { ...context, contactId: null } }), { code: 'CUSTOMER_CONTEXT_CHANGED' });
});

test('workspace customer projection supplies only existing qualified jobs and safe identity', async () => {
  const f = workspaceFixture(); f.organization.notes = 'Private module narrative';
  const value = await f.helper.getWorkspaceCustomer(ids.tenant, f.selection);
  assert.equal(value.customer.id, ids.organization); assert.equal(value.jobs.length, 1); assert.equal(value.jobs[0].directoryContext.organizationId, ids.organization);
  assert.equal(value.contacts[0].email, 'sam@example.test'); assert.equal(value.sites[0].id, ids.site);
  assert.doesNotMatch(JSON.stringify(value), /Private module narrative|Original customer fact/);
});

test('invalid native job references are blocked without exposing their foreign IDs', async () => {
  const f = workspaceFixture(); f.job.primary_contact_id = '30000000-0000-4000-8000-000000000099';
  const value = await f.helper.getWorkspaceCustomer(ids.tenant, f.selection);
  assert.equal(value.jobs[0].directoryContext, null); assert.equal(value.jobs[0].handoffBlocker, 'CUSTOMER_CONTEXT_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(value), /30000000-0000-4000-8000-000000000099/);
});
