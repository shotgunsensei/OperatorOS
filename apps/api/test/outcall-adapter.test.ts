import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutCallAdapterContext } from '../../modules/outcall/adapter.js';

test('OutCall adapter accepts only the server-supplied enabled entitlement', () => {
  const base = {
    currentUser: { id: 'user-1', email: 'user@example.com', status: 'active' },
    tenantId: 'tenant-1',
    role: 'member',
    platformAdmin: false,
  };

  assert.equal(createOutCallAdapterContext({ ...base, entitlements: null }).entitled, false);
  assert.equal(
    createOutCallAdapterContext({
      ...base,
      entitlements: { modules: [{ slug: 'outcall', enabled: false }] },
    }).entitled,
    false,
  );
  assert.equal(
    createOutCallAdapterContext({
      ...base,
      entitlements: { modules: [{ slug: 'outcall', enabled: true }] },
    }).entitled,
    true,
  );
});

test('OutCall adapter preserves the canonical OperatorOS integration boundary', () => {
  const context = createOutCallAdapterContext({
    currentUser: null,
    tenantId: null,
    role: null,
    entitlements: null,
    platformAdmin: true,
  });

  assert.equal(context.moduleId, 'outcall');
  assert.equal(context.standaloneLoginMode, 'operatoros_managed');
  assert.equal(context.hostnames.production, 'outcall.operatoros.net');
  assert.equal(context.apiCompatibilityBasePath, '/api/outcall');
  assert.equal(context.entitled, true);
});
