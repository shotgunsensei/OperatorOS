import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET ||= 'module-runtime-authority-test-secret-32-plus';

const { globalModuleUnavailableReason } = await import('../src/lib/tenant-entitlements.ts');
const { resolveEffectiveTenantAuthority } = await import('../src/lib/tenant-auth.ts');

test('global module availability allows only launchable platform statuses', () => {
  for (const status of ['live', 'active', 'beta']) {
    assert.equal(globalModuleUnavailableReason({ status, archivedAt: null }), null, status);
  }

  assert.equal(
    globalModuleUnavailableReason({ status: 'live', archivedAt: new Date() }),
    'module_archived',
    'archive wins even when the status is otherwise launchable',
  );

  for (const status of ['disabled', 'deprecated', 'hidden']) {
    assert.equal(
      globalModuleUnavailableReason({ status, archivedAt: null }),
      'module_disabled',
      status,
    );
  }

  for (const status of ['coming_soon', 'planned', 'unknown']) {
    assert.equal(
      globalModuleUnavailableReason({ status, archivedAt: null }),
      'module_unavailable',
      status,
    );
  }
});

test('platform authority is owner-equivalent while retaining membership for audit', () => {
  assert.deepEqual(resolveEffectiveTenantAuthority('member', true), {
    role: 'owner',
    membershipRole: 'member',
    viaPlatformRole: true,
  });
  assert.deepEqual(resolveEffectiveTenantAuthority('admin', false), {
    role: 'admin',
    membershipRole: 'admin',
    viaPlatformRole: false,
  });
  assert.deepEqual(resolveEffectiveTenantAuthority(null, true), {
    role: 'owner',
    membershipRole: null,
    viaPlatformRole: true,
  });
  assert.equal(resolveEffectiveTenantAuthority(null, false), null);
});
