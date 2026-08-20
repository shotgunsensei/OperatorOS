import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRestartCentralAuth } from '../../web/src/lib/auth-navigation.ts';

test('fresh invitation visits stay on the inline authentication surface after /auth/me returns 401', () => {
  for (const host of ['operatoros.net', 'app.operatoros.net']) {
    assert.equal(
      shouldRestartCentralAuth(host, '/app/invites/opaque-invitation-token'),
      false,
      `${host} must not restart central auth from an invitation page`,
    );
  }
});

test('invalid sessions still restart central auth on protected platform and module surfaces', () => {
  for (const [host, path] of [
    ['operatoros.net', '/app'],
    ['operatoros.net', '/app/platform'],
    ['app.operatoros.net', '/'],
    ['techdeck.operatoros.net', '/tickets'],
  ] as const) {
    assert.equal(
      shouldRestartCentralAuth(host, path),
      true,
      `${host}${path} must retain the protected-session recovery behavior`,
    );
  }

  assert.equal(shouldRestartCentralAuth('operatoros.net', '/pricing'), false);
  assert.equal(shouldRestartCentralAuth('auth.operatoros.net', '/login'), false);
  assert.equal(shouldRestartCentralAuth('api.operatoros.net', '/api/auth/me'), false);
});
