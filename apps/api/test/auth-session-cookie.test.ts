import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentUser,
  getSessionClearCookieOptions,
  getSessionCookieOptions,
  hasPlatformAdminAuthority,
  requireAuth,
  requirePlatformAdmin,
  SESSION_COOKIE_MAX_AGE_SECONDS,
} from '../../../packages/auth/index.js';
import { requireTenantMember } from '../../../packages/tenants/index.js';
import { requireModuleEntitlement as requireEntitlement } from '../../../packages/entitlements/index.js';

test('shared auth helpers resolve the request user and root platform admin authority', () => {
  const user = { id: 'user-1', email: 'john@shotgunninjas.com', platformRole: 'user' };
  const request = { user };

  assert.equal(getCurrentUser(request), user);
  assert.equal(requireAuth(request), user);
  assert.equal(hasPlatformAdminAuthority(user), true);
  assert.equal(requirePlatformAdmin(request), user);
});

test('shared auth helpers reject anonymous and non-admin users', () => {
  assert.throws(
    () => requireAuth({}),
    (err: any) => err.code === 'AUTH_REQUIRED' && err.statusCode === 401,
  );
  assert.throws(
    () => requirePlatformAdmin({ user: { id: 'user-2', email: 'operator@example.com', platformRole: 'user' } }),
    (err: any) => err.code === 'PLATFORM_ROLE_REQUIRED' && err.statusCode === 403,
  );
});

test('session cookie options use parent-domain secure cookies in production only', () => {
  assert.deepEqual(getSessionCookieOptions({ nodeEnv: 'production' }), {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: '.operatoros.net',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  assert.deepEqual(getSessionCookieOptions({ nodeEnv: 'development' }), {
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  assert.deepEqual(getSessionClearCookieOptions({ nodeEnv: 'production' }), {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: '.operatoros.net',
  });
});

test('tenant and entitlement helpers fail closed unless context or entitlement is present', () => {
  const request = { user: { id: 'user-3', email: 'operator@example.com', platformRole: 'user' } };

  assert.throws(
    () => requireTenantMember(request, 'tenant-1'),
    (err: any) => err.code === 'TENANT_NOT_FOUND' && err.statusCode === 404,
  );
  assert.throws(
    () => requireEntitlement(request, 'techdeck'),
    (err: any) => err.code === 'MODULE_ACCESS_DENIED' && err.statusCode === 403,
  );

  assert.equal(
    requireEntitlement(
      {
        ...request,
        entitlements: { modules: [{ id: 'techdeck', enabled: true }] },
      },
      'techdeck',
    ),
    true,
  );
});
