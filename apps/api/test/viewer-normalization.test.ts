/**
 * Task #108 — Regression test: the public `viewer` role MUST normalize
 * consistently across both the tenant-role bridge and the module
 * access-level bridge. Historically `viewer` was mapped to `'none'`
 * for module access (silent revocation) while being mapped to `'user'`
 * (read-only) on the tenant side; this test pins the canonical mapping
 * so that contradiction can't reappear.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeIncomingTenantRole,
  normalizeIncomingModuleAccessLevel,
  tenantRoleToEffective,
  tenantRoleToPublic,
  moduleAccessLevelToEffective,
  moduleAccessLevelToPublic,
} from '../src/lib/role-aliases.js';

test('viewer (tenant role) remains a distinct read-only grant on write', () => {
  assert.equal(normalizeIncomingTenantRole('viewer'), 'viewer');
});

test('stored tenant aliases normalize to bounded effective roles', () => {
  assert.equal(tenantRoleToEffective('owner'), 'owner');
  assert.equal(tenantRoleToEffective('tenant_admin'), 'admin');
  assert.equal(tenantRoleToEffective('billing_admin'), 'admin');
  assert.equal(tenantRoleToEffective('user'), 'member');
  assert.equal(tenantRoleToEffective('viewer'), 'viewer');
  assert.equal(tenantRoleToEffective('unexpected'), 'viewer');
});

test('viewer (module access) remains a distinct read-only grant on write', () => {
  // Critical: collapsing "viewer" to "user" silently grants mutation
  // authority, while mapping it to "none" silently revokes the grant.
  const v = normalizeIncomingModuleAccessLevel('viewer');
  assert.equal(v, 'viewer');
  assert.notEqual(v, 'none');
  assert.notEqual(v, 'user');
});

test('module_admin → manager on write', () => {
  assert.equal(normalizeIncomingModuleAccessLevel('module_admin'), 'manager');
});

test('module_user → user on write', () => {
  assert.equal(normalizeIncomingModuleAccessLevel('module_user'), 'user');
});

test('stored module aliases normalize without elevating viewer or unknown values', () => {
  assert.equal(moduleAccessLevelToEffective('module_admin'), 'manager');
  assert.equal(moduleAccessLevelToEffective('module_user'), 'user');
  assert.equal(moduleAccessLevelToEffective('viewer'), 'viewer');
  assert.equal(moduleAccessLevelToEffective('unexpected'), 'none');
});

test('legacy internal access levels still accepted on write', () => {
  assert.equal(normalizeIncomingModuleAccessLevel('none'), 'none');
  assert.equal(normalizeIncomingModuleAccessLevel('user'), 'user');
  assert.equal(normalizeIncomingModuleAccessLevel('manager'), 'manager');
});

test('read-path: a stored "viewer" row resolves to public "viewer"', () => {
  // DB CHECK was widened to also accept public values; the read-path
  // helper must pass them through.
  assert.equal(moduleAccessLevelToPublic('viewer'), 'viewer');
});

test('read-path: a stored "tenant_admin" row resolves to public "tenant_admin"', () => {
  assert.equal(tenantRoleToPublic('tenant_admin'), 'tenant_admin');
});

test('read-path: legacy internal "admin" still maps to public "tenant_admin"', () => {
  assert.equal(tenantRoleToPublic('admin'), 'tenant_admin');
});

test('read-path: legacy internal "manager" still maps to public "module_admin"', () => {
  assert.equal(moduleAccessLevelToPublic('manager'), 'module_admin');
});

test('unknown vocabulary returns null on write (validators reject it)', () => {
  assert.equal(normalizeIncomingTenantRole('king'), null);
  assert.equal(normalizeIncomingModuleAccessLevel('overlord'), null);
});
