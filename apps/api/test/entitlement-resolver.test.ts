/**
 * Task #108 — resolveEntitlements() unified snapshot shape.
 *
 * Locks in:
 *   - Snapshot version + required fields
 *   - Tenant role alias mapping (owner -> owner, admin -> tenant_admin,
 *     member -> user)
 *   - Module entry includes both internal access_level and public
 *     module_role_alias
 *   - null result when (user, tenant) pairing is invalid
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
} from '../src/schema.js';
import { resolveEntitlements } from '../src/lib/entitlement-resolver.js';
import {
  ensureSchemaReady, createTestUser, createTestModule,
  cleanupUser, cleanupModule,
} from './_setup.js';

let owner: any, member: any, outsider: any, tenant: any, mod: any;

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  member = await createTestUser();
  outsider = await createTestUser();
  mod = await createTestModule();

  [tenant] = await db.insert(tenants).values({
    name: 'ResolverTest', slug: `resolver-${owner.id}`,
    type: 'company', ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values([
    { tenantId: tenant.id, userId: owner.id, role: 'owner' },
    { tenantId: tenant.id, userId: member.id, role: 'member' },
  ]);
  await db.insert(tenantModules).values({
    tenantId: tenant.id, moduleId: mod.id,
    status: 'enabled', source: 'included', allowAllMembers: true,
  });
});

after(async () => {
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenant.id)); } catch {}
  if (mod) await cleanupModule(mod.id);
  for (const u of [owner, member, outsider]) if (u) await cleanupUser(u.id);
});

test('snapshot has required top-level fields + version=1', async () => {
  const snap = await resolveEntitlements(owner.id, tenant.id);
  assert.ok(snap, 'snapshot returned');
  assert.equal(snap!.version, 1);
  assert.ok(typeof snap!.computed_at === 'string');
  assert.equal(snap!.user.id, owner.id);
  assert.equal(snap!.tenant.id, tenant.id);
  assert.ok(Array.isArray(snap!.modules));
  assert.ok(snap!.limits && typeof snap!.limits === 'object');
  assert.ok(snap!.capabilities && typeof snap!.capabilities === 'object');
});

test('tenant role alias: owner -> owner', async () => {
  const snap = await resolveEntitlements(owner.id, tenant.id);
  assert.equal(snap!.tenant.role, 'owner');
  assert.equal(snap!.tenant.role_alias, 'owner');
  assert.equal(snap!.tenant.via_platform_role, false);
});

test('tenant role alias: member -> user', async () => {
  const snap = await resolveEntitlements(member.id, tenant.id);
  assert.equal(snap!.tenant.role, 'member');
  assert.equal(snap!.tenant.role_alias, 'user');
});

test('module entry carries both internal and public role values', async () => {
  const snap = await resolveEntitlements(member.id, tenant.id);
  const entry = snap!.modules.find(m => m.slug === mod.slug);
  assert.ok(entry, 'module entry present');
  assert.equal(entry!.has_access, true, 'allowAllMembers grants access');
  // Internal column is `user` (from allowAllMembers default), public is `module_user`.
  assert.equal(entry!.access_level, 'user');
  assert.equal(entry!.module_role_alias, 'module_user');
});

test('non-member outsider returns null (no snapshot)', async () => {
  const snap = await resolveEntitlements(outsider.id, tenant.id);
  assert.equal(snap, null);
});
