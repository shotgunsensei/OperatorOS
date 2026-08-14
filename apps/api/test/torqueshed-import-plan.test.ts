import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planTorqueShedImport } from '../src/lib/torqueshed-import.js';

async function fixture() {
  return JSON.parse(
    await readFile(new URL('./fixtures/torqueshed-export-v1.json', import.meta.url), 'utf8'),
  );
}

test('TorqueShed dry-run importer reconciles identity, references, attachments, counts, and integer costs without authority data', async () => {
  const plan = planTorqueShedImport(await fixture());
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.readyToApply, true);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.identityMappings, 1);
  assert.equal(plan.excludedAuthority.users, 1);
  assert.equal(plan.excludedAuthority.sessions, 1);
  assert.equal(plan.plannedTargetCounts.torqueshed_vehicles, 1);
  assert.equal(plan.plannedTargetCounts.shared_attachments, 1);
  assert.equal(plan.reconciliation.referencesChecked, 14);
  assert.equal(plan.reconciliation.referencesResolved, 14);
  assert.equal(plan.reconciliation.referencesMissing, 0);
  assert.equal(plan.reconciliation.attachmentBytes, 17);
  assert.equal(plan.reconciliation.serviceCostMinor, 8399);
  assert.equal(plan.reconciliation.partCostMinor, 899);
  assert.match(plan.warnings.join(' '), /OperatorOS remains authoritative/);
  assert.match(plan.warnings.join(' '), /plaintext VIN will not be retained/);
});

test('TorqueShed import plan fails closed on missing mappings, references, and decimal costs', async () => {
  const source = await fixture();
  source.identityMappings = [];
  source.serviceRecords[0].laborCostMinor = 35.5;
  source.diagnostics[0].vehicleId = 'missing';
  const plan = planTorqueShedImport(source);
  assert.equal(plan.readyToApply, false);
  assert.ok(plan.reconciliation.referencesMissing > 0);
  assert.match(plan.errors.join(' '), /no OperatorOS identity mapping/);
  assert.match(plan.errors.join(' '), /integer minor-unit/);
});
