import test from 'node:test';
import assert from 'node:assert/strict';
import { planFaultlineLabImport } from '../src/lib/faultlinelab-import.js';

test('FaultlineLab dry-run imports only validated runnable source cases', () => {
  const first = planFaultlineLabImport();
  const second = planFaultlineLabImport();
  assert.deepEqual(second, first);
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.playableSourceCount, 4);
  assert.equal(first.plannedCatalogOnlyCount, 52);
  assert.equal(first.mappings.length, 4);
  assert.equal(first.reconciliation.uniqueSourceIds, 4);
  assert.equal(first.reconciliation.uniqueSlugs, 4);
  assert.equal(first.reconciliation.contentHashesVerified, 4);
  assert.equal(first.reconciliation.authorityRecordsImported, 0);
  assert.equal(first.reconciliation.billingRecordsImported, 0);
  assert.equal(first.reconciliation.plannedCatalogEntriesImported, 0);
  assert.equal(first.reconciliation.standaloneDataApplyRequired, false);
  assert.equal(first.applySupported, false);
  assert.deepEqual(first.errors, []);
  assert.equal(first.readyToInitialize, true);
  assert.match(first.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(first.sourceManifestHash, /^[0-9a-f]{64}$/);
  assert.equal(new Set(first.mappings.map((item) => item.sourceId)).size, 4);
  assert.equal(new Set(first.mappings.map((item) => item.sourceSlug)).size, 4);
});
