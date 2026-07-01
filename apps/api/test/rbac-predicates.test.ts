import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPlatformAdminAuthority,
  isRootSuperAdmin,
  isSuperAdmin,
  isTenantAdmin,
  isTenantOwner,
} from '../src/lib/rbac.js';

test('isSuperAdmin passes for stored super_admin or the root super-admin account', () => {
  assert.equal(isSuperAdmin('super_admin'), true);
  assert.equal(isSuperAdmin('user'), false);
  assert.equal(isSuperAdmin('user', { email: 'john@shotgunninjas.com', platformRole: 'user' }), true);
  assert.equal(isSuperAdmin(undefined), false);
});

test('root super-admin predicate is normalized and server-side', () => {
  assert.equal(isRootSuperAdmin({ email: ' John@ShotgunNinjas.com ' }), true);
  assert.equal(isRootSuperAdmin({ email: 'operator@example.com' }), false);
  assert.equal(hasPlatformAdminAuthority({ email: 'john@shotgunninjas.com', platformRole: 'user' }), true);
  assert.equal(hasPlatformAdminAuthority({ email: 'operator@example.com', platformRole: 'user' }), false);
});

test('isTenantOwner only passes for owner', () => {
  assert.equal(isTenantOwner('owner'), true);
  assert.equal(isTenantOwner('admin'), false);
  assert.equal(isTenantOwner('member'), false);
});

test('isTenantAdmin passes for owner/admin or super admin platform role', () => {
  assert.equal(isTenantAdmin('owner', 'user'), true);
  assert.equal(isTenantAdmin('admin', 'user'), true);
  assert.equal(isTenantAdmin('member', 'super_admin'), true);
  assert.equal(isTenantAdmin('member', 'user', { email: 'john@shotgunninjas.com', platformRole: 'user' }), true);
  assert.equal(isTenantAdmin('member', 'user'), false);
});
