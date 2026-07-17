import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FREE_ACCOUNT_APP_SLUGS,
  NEW_FREE_ACCOUNT_GRANT_METADATA,
  isFreeWithAnyAccountTenantModule,
  selectPlanModuleReconciliation,
  shouldUpgradeLegacyFreeAccountGrant,
  type PlanReconciledTenantModule,
} from '../src/lib/free-account-apps.js';
import { DATABASE_RELEASE_STEPS } from '../src/lib/database-release-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readRepoFile(repoPath: string): string {
  return fs.readFileSync(path.join(root, repoPath), 'utf8');
}

test('free-account catalog is the exact three tenant-scoped companion apps', () => {
  assert.deepEqual([...FREE_ACCOUNT_APP_SLUGS], [
    'torqueshed',
    'faultlinelab',
    'ninja-pool-hall',
  ]);
  assert.deepEqual(NEW_FREE_ACCOUNT_GRANT_METADATA, {
    grantedBy: 'free_account',
    freeWithAnyAccount: true,
  });
});

test('only an exact JSON boolean marks a free-account tenant-module row', () => {
  assert.equal(isFreeWithAnyAccountTenantModule({
    metadata: { freeWithAnyAccount: true },
  }), true);
  assert.equal(isFreeWithAnyAccountTenantModule({
    metadata: { freeWithAnyAccount: false },
  }), false);
  assert.equal(isFreeWithAnyAccountTenantModule({
    metadata: { freeWithAnyAccount: 'true' },
  }), false);
  assert.equal(isFreeWithAnyAccountTenantModule({ metadata: null }), false);
  assert.equal(shouldUpgradeLegacyFreeAccountGrant({ metadata: null }), true);
  assert.equal(shouldUpgradeLegacyFreeAccountGrant({
    metadata: { freeWithAnyAccount: true },
  }), false);
});

test('plan propagation neither drops nor re-enables free-account rows', () => {
  const rows: PlanReconciledTenantModule[] = [
    {
      moduleId: 'free-enabled',
      source: 'included',
      status: 'enabled',
      metadata: { freeWithAnyAccount: true },
    },
    {
      moduleId: 'free-disabled',
      source: 'included',
      status: 'disabled',
      metadata: { freeWithAnyAccount: true },
    },
    {
      moduleId: 'paid-dropped',
      source: 'included',
      status: 'enabled',
      metadata: null,
    },
    {
      moduleId: 'paid-reenabled',
      source: 'included',
      status: 'disabled',
      metadata: null,
    },
    {
      moduleId: 'addon-not-plan-managed',
      source: 'addon',
      status: 'enabled',
      metadata: null,
    },
  ];
  const included = new Set(['free-disabled', 'paid-reenabled']);

  const result = selectPlanModuleReconciliation(rows, included);

  assert.deepEqual(result.dropped.map(row => row.moduleId), ['paid-dropped']);
  assert.deepEqual(result.reEnabled.map(row => row.moduleId), ['paid-reenabled']);
});

test('database provisioning restores unmarked legacy grants exactly once', () => {
  const source = readRepoFile('apps/api/src/lib/saas-db-init.ts');
  const upgradeStart = source.indexOf('const migrateLegacyGrant');
  const ownerGrantStart = source.indexOf('const ownerGrantInsert', upgradeStart);
  assert.ok(upgradeStart >= 0, 'missing legacy free-account row upgrade');
  assert.ok(ownerGrantStart > upgradeStart, 'missing owner grant after tenant-module upgrade');

  const upgrade = source.slice(upgradeStart, ownerGrantStart);
  assert.match(upgrade, /allowAllMembers:\s*true/);
  assert.match(upgrade, /freeWithAnyAccount/);
  assert.match(upgrade, /status:\s*'enabled'/);
  assert.match(upgrade, /source:\s*'included'/);
  assert.match(upgrade, /shouldUpgradeLegacyFreeAccountGrant/);

  const ownerGrant = source.slice(ownerGrantStart, source.indexOf('/**', ownerGrantStart));
  assert.match(ownerGrant, /onConflictDoUpdate/);
  assert.match(source, /Once classified, later backfills leave tenant-admin changes/);
  assert.match(source, /export async function backfillFreeAccountAppsForAllTenants/);
  assert.match(source, /tenant\.status === 'archived'/);
});

test('all creation/boot paths provision free apps while SSO remains tenant gated', () => {
  const platformRoutes = readRepoFile('apps/api/src/routes/platform-routes.ts');
  const moduleRegistry = readRepoFile('packages/modules/registry.ts');

  const createRoute = platformRoutes.indexOf("app.post('/v1/platform/tenants'");
  const transaction = platformRoutes.indexOf('db.transaction(async (tx)', createRoute);
  const membership = platformRoutes.indexOf("role: 'owner'", transaction);
  const platformGrant = platformRoutes.indexOf(
    'ensureFreeAccountAppsWithDatabase(tx, tenant.id, ownerUserId)',
    membership,
  );
  assert.ok(createRoute >= 0 && transaction > createRoute, 'platform tenant creation must be transactional');
  assert.ok(membership > transaction && platformGrant > membership, 'free grants must share the owner transaction');

  const restoreRoute = platformRoutes.indexOf("'/v1/platform/tenants/:id/restore'");
  const restoreActive = platformRoutes.indexOf("status: 'active'", restoreRoute);
  const restoreGrant = platformRoutes.indexOf(
    'ensureFreeAccountApps(after.id, after.ownerUserId)',
    restoreRoute,
  );
  assert.ok(restoreRoute >= 0, 'missing archived-tenant restore route');
  assert.ok(
    restoreActive > restoreRoute && restoreGrant > restoreActive,
    'restored tenant grant must run only after status becomes active',
  );

  const postSeed = DATABASE_RELEASE_STEPS.findIndex(step => step.id === 'launch_fix_post_seed');
  const allTenantBackfill = DATABASE_RELEASE_STEPS.findIndex(
    step => step.id === 'free_account_app_backfill',
  );
  assert.ok(postSeed >= 0 && allTenantBackfill > postSeed, 'all-tenant free-app backfill must run after special seeders');

  // Child apps still pass through resolveTenantModuleAccess; free status is a
  // tenant grant, never a subscription-gate bypass.
  assert.match(moduleRegistry, /requiresSubscription:\s*true/);
  assert.doesNotMatch(moduleRegistry, /requiresSubscription:\s*module\.slug/);
});
