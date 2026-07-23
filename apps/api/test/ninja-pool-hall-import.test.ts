import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NINJA_POOL_HALL_SOURCE_COMMIT,
  planNinjaPoolHallImport,
} from '../src/lib/ninja-pool-hall-import.ts';

test('Ninja Pool Hall reconciliation is deterministic, exact, and authority-free', () => {
  const first = planNinjaPoolHallImport();
  const second = planNinjaPoolHallImport();
  assert.deepEqual(first, second);
  assert.equal(first.sourceCommit, NINJA_POOL_HALL_SOURCE_COMMIT);
  assert.equal(first.ready, true);
  assert.equal(first.applySupported, false);
  assert.equal(first.errors.length, 0);
  assert.equal(first.promotedEngineFiles.length, 5);
  assert.equal(first.promotedEngineFiles.every((file) => file.exact), true);
  assert.equal(first.reconciliation.identityRecordsImported, 0);
  assert.equal(first.reconciliation.billingRecordsImported, 0);
  assert.equal(first.reconciliation.standaloneDataApplyRequired, false);
  assert.equal(first.mappings.find((mapping) => mapping.sourceSurface === '/host and /join')?.disposition, 'excluded');
});

test('Ninja Pool Hall importer exposes no apply mode', () => {
  const plan = planNinjaPoolHallImport();
  assert.equal(plan.reconciliation.profileRowsAvailable, 0);
  assert.equal(plan.reconciliation.preferenceRowsAvailable, 0);
  assert.equal(plan.reconciliation.achievementRowsAvailable, 0);
  assert.equal(plan.reconciliation.historicalSummaryRowsAvailable, 0);
});
