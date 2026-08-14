import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildOutCallSourceGate } from '../phase37-outcall-source-gate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Phase 37 records missing source without converting unknown capability counts to zero', () => {
  const gate = buildOutCallSourceGate();
  assert.equal(gate.phaseStatus, 'BLOCKED');
  assert.equal(gate.source.authoritativeCommit, null);
  assert.equal(gate.source.exactSourceCapabilityCounts.pages, null);
  assert.match(gate.source.exactSourceCapabilityCounts.reason, /null is not treated as zero/u);
  assert.equal(gate.acceptance.authoritativeFullSourceExistsAndFingerprintPinned, false);
  assert.equal(gate.acceptance.everySourceOutcomeMappedAndTested, false);
});

test('OutCall activation remains locked across every launch authority', () => {
  const gate = buildOutCallSourceGate();
  assert.equal(gate.activationAllowed, false);
  assert.equal(gate.activationLock.failClosed, true);
  assert.ok(Object.entries(gate.activationLock.checks).every(([, value]) => value === true));
  assert.equal(gate.activationLock.sdkCatalogStatus, 'coming_soon');
  assert.equal(gate.activationLock.ecosystemStatus, 'planned');
  assert.equal(gate.activationLock.deploymentRegistryEnabled, false);
  assert.equal(gate.activationLock.existingDatabaseStatusAfterSeed, 'coming_soon');
});

test('committed Phase 37 recovery ledger matches the compiler output', () => {
  const committed = JSON.parse(readFileSync(
    resolve(root, 'docs/phase-37/OUTCALL-SOURCE-RECOVERY-LEDGER.json'),
    'utf8',
  ));
  assert.deepEqual(committed, buildOutCallSourceGate());
});
