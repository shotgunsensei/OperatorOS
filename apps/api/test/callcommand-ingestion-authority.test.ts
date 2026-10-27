import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectCallCommandIngestionAuthority } from '../src/lib/callcommand-ingestion-authority.js';

test('active durable integration admission uses tenant authority and the fixed module, without an issuer session', async () => {
  const calls: string[] = [];
  const result = await inspectCallCommandIngestionAuthority('tenant-a', {
    loadTenantStatus: async id => { calls.push(`tenant:${id}`); return 'active'; },
    tenantHasModuleEntitlement: async (id, slug) => { calls.push(`module:${id}:${slug}`); return true; },
  });
  assert.deepEqual(result, { allowed: true });
  assert.deepEqual(calls, ['tenant:tenant-a', 'module:tenant-a:callcommand-ai']);
});

for (const status of ['suspended', 'archived', 'unexpected', null]) {
  test(`tenant status ${status} blocks admission before resolving a module`, async () => {
    let moduleReads = 0;
    const result = await inspectCallCommandIngestionAuthority('tenant-a', {
      loadTenantStatus: async () => status,
      tenantHasModuleEntitlement: async () => { moduleReads++; return true; },
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.equal(result.code, 'CALLCOMMAND_INGESTION_TENANT_UNAVAILABLE');
    assert.equal(moduleReads, 0);
  });
}

test('revoked or globally disabled module admission fails closed', async () => {
  const result = await inspectCallCommandIngestionAuthority('tenant-a', {
    loadTenantStatus: async () => 'active', tenantHasModuleEntitlement: async () => false,
  });
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.code, 'CALLCOMMAND_INGESTION_MODULE_UNAVAILABLE');
});

for (const failingPort of ['tenant', 'module']) {
  test(`${failingPort} lookup failure is unavailable and never exposes database details`, async () => {
    const result = await inspectCallCommandIngestionAuthority('tenant-a', {
      loadTenantStatus: async () => { if (failingPort === 'tenant') throw new Error('private connection detail'); return 'active'; },
      tenantHasModuleEntitlement: async () => { throw new Error('private provider detail'); },
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.equal(result.statusCode, 503);
      assert.equal(result.code, 'CALLCOMMAND_INGESTION_AUTHORITY_UNAVAILABLE');
      assert.equal(result.message.includes('private'), false);
    }
  });
}

test('missing trusted tenant identity never performs a lookup', async () => {
  let calls = 0;
  const result = await inspectCallCommandIngestionAuthority('', {
    loadTenantStatus: async () => { calls++; return 'active'; },
    tenantHasModuleEntitlement: async () => { calls++; return true; },
  });
  assert.equal(result.allowed, false);
  assert.equal(calls, 0);
});
