/**
 * Gate 3 — Sidebar IA contract.
 *
 * The role-aware sidebar is the user-visible information architecture for
 * the whole product. This test pins down:
 *   1. Section order: Launch, Tenant, Platform, Account.
 *   2. Tenant section is hidden for non-admins.
 *   3. Platform section is gated by super_admin only.
 *   4. The legacy entries (Workspaces / Projects / Tasks / Notes / Activity)
 *      are gone from every role's sidebar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNavSections } from '../../web/src/lib/sidebar-nav.js';

const LEGACY_IDS = new Set(['workspaces', 'projects', 'tasks', 'notes', 'activity']);

function ids(sections: ReturnType<typeof buildNavSections>): string[] {
  return sections.flatMap(s => s.items.map(i => i.id));
}

test('regular user sees only Launch + Account, in that order', () => {
  const sections = buildNavSections({ isSuperAdmin: false, isTenantAdmin: false });
  assert.deepEqual(sections.map(s => s.label), ['Launch', 'Account']);
  const itemIds = ids(sections);
  assert.ok(itemIds.includes('my-apps'));
  assert.ok(itemIds.includes('apps'));
  assert.ok(itemIds.includes('billing'));
  assert.ok(itemIds.includes('settings'));
  assert.ok(!itemIds.includes('command-center'), 'no Tenant entries for non-admin');
  assert.ok(!itemIds.includes('platform'), 'no Platform entry for non-super-admin');
});

test('tenant admin sees Launch + Tenant + Account, in that order', () => {
  const sections = buildNavSections({ isSuperAdmin: false, isTenantAdmin: true });
  assert.deepEqual(sections.map(s => s.label), ['Launch', 'Tenant', 'Account']);
  const itemIds = ids(sections);
  assert.ok(itemIds.includes('command-center'));
  assert.ok(itemIds.includes('tenant-users'));
  assert.ok(itemIds.includes('tenant-modules'));
  assert.ok(itemIds.includes('tenant-billing'));
  assert.ok(itemIds.includes('tenant-settings'));
  assert.ok(!itemIds.includes('platform'));
});

test('super admin sees Launch + Tenant + Platform + Account, in that order', () => {
  const sections = buildNavSections({ isSuperAdmin: true, isTenantAdmin: true });
  assert.deepEqual(sections.map(s => s.label), ['Launch', 'Tenant', 'Platform', 'Account']);
  const itemIds = ids(sections);
  assert.ok(itemIds.includes('platform'));
});

// ---------------------------------------------------------------------------
// Role snapshots — the canonical (label, ids[]) tuple for every role.
// These freeze the sidebar IA so unintended additions / reorderings break the
// build instead of silently shipping. Update the snapshot ONLY together with
// a corresponding nav contract change in the spec.
// ---------------------------------------------------------------------------
const sectionShape = (sections: ReturnType<typeof buildNavSections>) =>
  sections.map(s => ({ label: s.label, ids: s.items.map(i => i.id) }));

test('snapshot: regular user sidebar IA', () => {
  const snap = sectionShape(buildNavSections({ isSuperAdmin: false, isTenantAdmin: false }));
  assert.deepEqual(snap, [
    { label: 'Launch',  ids: ['my-apps', 'apps', 'ai-tools'] },
    { label: 'Account', ids: ['billing', 'settings'] },
  ]);
});

test('snapshot: tenant admin sidebar IA', () => {
  const snap = sectionShape(buildNavSections({ isSuperAdmin: false, isTenantAdmin: true }));
  assert.deepEqual(snap, [
    { label: 'Launch',  ids: ['my-apps', 'apps', 'ai-tools'] },
    { label: 'Tenant',  ids: ['command-center', 'tenant-users', 'tenant-modules', 'tenant-billing', 'tenant-settings'] },
    { label: 'Account', ids: ['billing', 'settings'] },
  ]);
});

test('snapshot: super admin sidebar IA', () => {
  const snap = sectionShape(buildNavSections({ isSuperAdmin: true, isTenantAdmin: true }));
  assert.deepEqual(snap, [
    { label: 'Launch',   ids: ['my-apps', 'apps', 'ai-tools'] },
    { label: 'Tenant',   ids: ['command-center', 'tenant-users', 'tenant-modules', 'tenant-billing', 'tenant-settings'] },
    { label: 'Platform', ids: ['platform'] },
    { label: 'Account',  ids: ['billing', 'settings'] },
  ]);
});

test('legacy nav entries (workspaces/projects/tasks/notes/activity) are removed for every role', () => {
  for (const flags of [
    { isSuperAdmin: false, isTenantAdmin: false },
    { isSuperAdmin: false, isTenantAdmin: true },
    { isSuperAdmin: true,  isTenantAdmin: true },
  ]) {
    const itemIds = ids(buildNavSections(flags));
    for (const legacy of LEGACY_IDS) {
      assert.ok(!itemIds.includes(legacy),
        `Legacy entry "${legacy}" must not appear (flags=${JSON.stringify(flags)})`);
    }
  }
});
