import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANION_MODULES, CORE_PRODUCTS, FREE_WITH_ANY_ACCOUNT, MODULE_CATALOG, ECOSYSTEM_MODULES,
  TOOL_MODULE_CATALOG, TOOL_PURCHASE_PENDING_DECISIONS, isIndependentToolModuleSlug,
} from '@operatoros/sdk';
import {
  toolModuleCatalogReadiness, toolPurchaseEligibility, type ToolPurchaseContext,
} from '../src/lib/tool-module-policy.js';

const owner: ToolPurchaseContext = {
  userId: 'owner-a', userStatus: 'active', tenantId: 'tenant-a', tenantStatus: 'active',
  ownerUserId: 'owner-a', membership: { userId: 'owner-a', tenantId: 'tenant-a', role: 'owner' },
};

test('independent tools remain one-time, disabled and outside all Stack catalogs', () => {
  const stacks = [...CORE_PRODUCTS, ...COMPANION_MODULES, ...FREE_WITH_ANY_ACCOUNT].map(p => p.key);
  assert.deepEqual(TOOL_MODULE_CATALOG.map(t => t.slug), ['officeexit', 'vendortrust365']);
  assert.ok(Object.isFrozen(TOOL_MODULE_CATALOG));
  for (const tool of TOOL_MODULE_CATALOG) {
    assert.ok(Object.isFrozen(tool));
    assert.ok(!stacks.includes(tool.slug as never));
    assert.equal(tool.purchaseKind, 'one_time');
    assert.equal(tool.requiresPaidBase, false);
    assert.equal(tool.automaticRenewal, false);
    assert.equal(tool.recurringCharges, false);
    assert.equal(tool.updatesAndSupportCoverage, 'pending_acceptance');
    assert.equal(tool.price, null);
    assert.equal(tool.licenseAllowance, null);
    assert.equal(tool.salesEnabled, false);
    assert.equal(tool.downloadsAvailable, false);
    assert.equal(tool.releaseStatus, 'not_accepted');
  }
});

test('catalog contains undecided commercial terms without artifact/provider/credential data', () => {
  assert.ok(TOOL_PURCHASE_PENDING_DECISIONS.includes('license_unit_and_allowance'));
  assert.ok(TOOL_PURCHASE_PENDING_DECISIONS.includes('updates_and_support_coverage'));
  assert.ok(TOOL_PURCHASE_PENDING_DECISIONS.includes('edition_release_compatibility'));
  const output = JSON.stringify(toolModuleCatalogReadiness(owner));
  assert.doesNotMatch(output, /https?:|stripe|secret|token|password|github/i);
  const copy = toolModuleCatalogReadiness(owner);
  copy.tools.pop();
  copy.pendingDecisions.pop();
  assert.equal(toolModuleCatalogReadiness(owner).tools.length, 2);
  assert.equal(toolModuleCatalogReadiness(owner).pendingDecisions.length, TOOL_PURCHASE_PENDING_DECISIONS.length);
});

test('active persisted owner is eligible independently of subscription/seat inputs, while checkout stays closed', () => {
  for (const additional of [{ basePlan: 'free', seatLimit: 0 }, { basePlan: 'paid', seatLimit: 25 }]) {
    const result = toolModuleCatalogReadiness({ ...owner, ...additional });
    assert.deepEqual(result.purchaseEligibility, { eligible: true, reason: 'eligible' });
    assert.equal(result.checkoutAvailable, false);
    assert.equal(result.tenantId, owner.tenantId);
  }
});

for (const role of ['viewer', 'member', 'admin', 'tenant_admin', 'billing_admin', 'super_admin']) {
  test(`membership role ${role} does not authorize a purchase`, () => {
    assert.deepEqual(toolPurchaseEligibility({ ...owner, membership: { ...owner.membership!, role } }),
      { eligible: false, reason: 'owner_required' });
  });
}

for (const [name, patch, reason] of [
  ['inactive user', { userStatus: 'suspended' }, 'user_inactive'],
  ['suspended tenant', { tenantStatus: 'suspended' }, 'tenant_inactive'],
  ['archived tenant', { tenantStatus: 'archived' }, 'tenant_inactive'],
  ['removed membership', { membership: null }, 'not_a_member'],
  ['foreign user', { membership: { ...owner.membership!, userId: 'other' } }, 'not_a_member'],
  ['foreign tenant', { membership: { ...owner.membership!, tenantId: 'other' } }, 'not_a_member'],
  ['empty identity', { userId: '', membership: { ...owner.membership!, userId: '' }, ownerUserId: '' }, 'not_a_member'],
  ['empty tenant', { tenantId: '', membership: { ...owner.membership!, tenantId: '' } }, 'not_a_member'],
  ['transferred ownership', { ownerUserId: 'new-owner' }, 'owner_required'],
] as const) {
  test(`${name} fails closed`, () => {
    assert.deepEqual(toolPurchaseEligibility({ ...owner, ...patch }), { eligible: false, reason });
  });
}

test('reserved slug matching cannot accidentally classify existing products or variants', () => {
  assert.equal(isIndependentToolModuleSlug('officeexit'), true);
  assert.equal(isIndependentToolModuleSlug('vendortrust365'), true);
  for (const value of ['OfficeExit', 'officeexit-2026', 'vendortrust365 ', 'tradeflowkit', 'torqueshed', '']) {
    assert.equal(isIndependentToolModuleSlug(value), false);
  }
});

test('tools have no registered hosted launch or SSO catalog entry', () => {
  for (const slug of ['officeexit', 'vendortrust365']) {
    assert.ok(!MODULE_CATALOG.some(module => module.slug === slug));
    assert.ok(!ECOSYSTEM_MODULES.some(module => module.slug === slug));
  }
});
