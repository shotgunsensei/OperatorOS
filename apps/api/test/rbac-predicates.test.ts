import test from 'node:test';
import assert from 'node:assert/strict';
import { isSuperAdmin, isTenantAdmin, isTenantOwner } from '../src/lib/rbac.js';

test('isSuperAdmin only passes for super_admin', () => {
  assert.equal(isSuperAdmin('super_admin'), true);
  assert.equal(isSuperAdmin('user'), false);
  assert.equal(isSuperAdmin(undefined), false);
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
  assert.equal(isTenantAdmin('member', 'user'), false);
});
