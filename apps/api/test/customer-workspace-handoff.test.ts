import assert from 'node:assert/strict';
import test from 'node:test';
import { ids, loadWorkspaceSource, workspaceFixture } from './customer-workspace-fixture.js';

test('actual adapter reuses a qualified customer for two distinct existing job handoffs', async () => {
  const f = workspaceFixture(); const context = await f.context(); await f.deliver({ directoryContext: context });
  const nativeId = f.native[0].id; const storedFacts = JSON.stringify(f.native[0]);
  const firstReport = JSON.stringify(f.reports[0]);
  f.job.id = '50000000-0000-4000-8000-000000000002'; f.job.customer_name = 'Updated editable source';
  const reused = await f.deliver({ directoryContext: context });
  assert.equal(f.native.length, 1); assert.equal(f.cases.length, 2); assert.ok(f.cases.every(row => row.customer_id === nativeId));
  assert.equal(JSON.stringify(f.native[0]), storedFacts); assert.equal(JSON.stringify(f.reports[0]), firstReport);
  assert.equal(reused.summary, 'Created a SnapProofOS field job and draft report');
  assert.ok(f.statements.some(statement => /FOR SHARE OF j,c/.test(statement)));
});

test('actual adapter rejects ambiguous active native matches without creating proof', async () => {
  const f = workspaceFixture(); await f.deliver();
  f.native.push({ ...f.native[0], id: 'second-qualified-native' });
  f.cases.length = 0; f.reports.length = 0;
  await assert.rejects(f.deliver(), { code: 'FABRIC_CUSTOMER_LINK_AMBIGUOUS' });
  assert.equal(f.native.length, 2); assert.equal(f.cases.length, 0); assert.equal(f.reports.length, 0);
});

test('actual adapter rejects a context changed after enqueue before native writes', async () => {
  const f = workspaceFixture(); const context = await f.context(); f.organization.version++;
  await assert.rejects(f.deliver({ directoryContext: context }), { code: 'CUSTOMER_CONTEXT_CHANGED' });
  assert.equal(f.native.length, 0); assert.equal(f.cases.length, 0); assert.equal(f.reports.length, 0);
});

test('actual adapter preserves the explicit unlinked legacy path without guessing a Directory identity', async () => {
  const f = workspaceFixture(); f.job.organization_id = null; f.job.primary_contact_id = null; f.job.primary_site_id = null;
  await f.deliver(); assert.equal(f.native.length, 1); assert.equal(f.native[0].directory_organization_id, null);
  assert.equal(f.cases.length, 1);
});

test('a queued qualified source cannot fall back to the legacy path after its link is removed', async () => {
  const f = workspaceFixture(); const context = await f.context(); f.job.organization_id = null;
  await assert.rejects(f.deliver({ directoryContext: context }), { code: 'CUSTOMER_CONTEXT_CHANGED' }); assert.equal(f.native.length, 0);
});

test('concurrent reuse waits for its context lock and rechecks committed native identity', async () => {
  const f = workspaceFixture(); const expected = await f.context();
  const results = await Promise.all(Array.from({ length: 5 }, () => f.database.transaction(tx => f.helper.reuseQualifiedSnapProofCustomer({ tenantId: ids.tenant, actorUserId: ids.user, job: { ...f.job }, expectedContext: expected }, tx))));
  assert.equal(f.native.length, 1); assert.equal(new Set(results).size, 1);
  assert.equal(f.statements.filter(value => /pg_advisory_xact_lock/.test(value)).length, 5);
});

test('foreign, archived and differently qualified native records are never silently reused', async () => {
  const f = workspaceFixture(); await f.deliver(); const original = f.native[0];
  original.tenant_id = ids.otherTenant; await f.deliver(); assert.equal(f.native.length, 2);
  f.native[1].archived_at = '2026-10-27'; await f.deliver(); assert.equal(f.native.length, 3);
  f.native[2].directory_contact_id = null; await f.deliver(); assert.equal(f.native.length, 4);
});

test('explicit job site overrides a different customer primary site without rewriting either', async () => {
  const f = workspaceFixture(); f.job.site_id = ids.site; f.job.primary_site_id = '40000000-0000-4000-8000-000000000099';
  await f.deliver({ directoryContext: await f.context() });
  assert.equal(f.native[0].directory_site_id, ids.site); assert.equal(f.job.primary_site_id, '40000000-0000-4000-8000-000000000099');
});

for (const drift of ['job version', 'customer version', 'customer contact']) test(`source ${drift} drift before row lock cannot create a stale native customer`, async () => {
  const f = workspaceFixture();
  f.beforeSourceLock(() => {
    if (drift === 'job version') f.job.version++;
    if (drift === 'customer version') f.job.customer_version++;
    if (drift === 'customer contact') f.job.primary_contact_id = null;
  });
  await assert.rejects(f.deliver({ directoryContext: await f.context() }), { code: 'CUSTOMER_CONTEXT_CHANGED' });
  assert.equal(f.native.length, 0); assert.equal(f.cases.length, 0);
});

test('reuse lock order is advisory then Directory then source customer, matching existing Directory edits', async () => {
  const f = workspaceFixture(); await f.deliver();
  const advisory = f.statements.findIndex(statement => /pg_advisory_xact_lock/.test(statement));
  const directory = f.statements.findIndex(statement => /FROM directory_organizations/.test(statement));
  const source = f.statements.findIndex(statement => /FOR SHARE OF j,c/.test(statement));
  const native = f.statements.findIndex(statement => /FROM snapproof_customers/.test(statement));
  assert.ok(advisory >= 0 && advisory < directory && directory < source && source < native);
});

test('existing signed fabric metadata sanitizer preserves qualified IDs and context revision', async () => {
  const f = workspaceFixture(); const context = await f.context();
  const safety = loadWorkspaceSource('lib/shared-service-safety.ts', {});
  const payload = safety.sanitizeSharedMetadata({ directoryContext: context, sourceType: 'tradeflowkit_job', expectedSourceVersion: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(payload.directoryContext)), JSON.parse(JSON.stringify(context)));
});
