import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRANDFORGEOS_SOURCE_COMMIT,
  BRANDFORGEOS_SOURCE_MANIFEST_SHA256,
  planBrandForgeOsImport,
} from '../src/lib/brandforgeos-import.ts';

test('BrandForgeOS reconciliation is deterministic and verifies the pinned source evidence', () => {
  const first = planBrandForgeOsImport();
  const second = planBrandForgeOsImport();
  assert.deepEqual(first, second);
  assert.equal(first.sourceCommit, BRANDFORGEOS_SOURCE_COMMIT);
  assert.equal(first.sourceManifestHash, BRANDFORGEOS_SOURCE_MANIFEST_SHA256);
  assert.equal(first.sourceFileCount, 271);
  assert.equal(first.trackedFileCount, 348);
  assert.equal(first.totalBytes, 1_031_572);
  assert.equal(first.evidenceFiles.length, 7);
  assert.equal(first.evidenceFiles.every((file) => file.exact), true);
  assert.equal(first.errors.length, 0);
  assert.equal(first.ready, true);
});

test('BrandForgeOS importer cannot import platform authority or apply standalone data', () => {
  const plan = planBrandForgeOsImport();
  assert.equal(plan.applySupported, false);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.reconciliation.standaloneRowsAvailable, 0);
  assert.equal(plan.reconciliation.identityRecordsImported, 0);
  assert.equal(plan.reconciliation.tenantRecordsImported, 0);
  assert.equal(plan.reconciliation.billingRecordsImported, 0);
  assert.equal(plan.reconciliation.providerCredentialsImported, 0);
  assert.equal(plan.reconciliation.standaloneDataApplyRequired, false);
  assert.equal(plan.mappings.find((row) => row.sourceSurface.includes('random analytics'))?.disposition, 'excluded');
  assert.equal(plan.mappings.find((row) => row.sourceSurface.includes('auth, tenants'))?.disposition, 'operatoros-owned');
});
