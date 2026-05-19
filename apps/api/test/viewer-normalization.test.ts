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
  tenantRoleToPublic,
  moduleAccessLevelToPublic,
} from '../src/lib/role-aliases.js';

test('viewer (tenant role) → member on write', () => {
  assert.equal(normalizeIncomingTenantRole('viewer'), 'member');
});

test('viewer (module access) → "user" on write (NEVER "none")', () => {
  // Critical: "viewer" must be a read-only grant, not a silent
  // revocation. Mapping it to "none" would drop the row entirely.
  const v = normalizeIncomingModuleAccessLevel('viewer');
  assert.equal(v, 'user');
  assert.notEqual(v, 'none');
});

test('module_admin → manager on write', () => {
  assert.equal(normalizeIncomingModuleAccessLevel('module_admin'), 'manager');
});

test('module_user → user on write', () => {
  assert.equal(normalizeIncomingModuleAccessLevel('module_user'), 'user');
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
