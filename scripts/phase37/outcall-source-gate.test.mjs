import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildOutCallSourceGate } from '../phase37-outcall-source-gate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Phase 37 records the owner-authorized current reconstruction without claiming historical literal parity', () => {
  const gate = buildOutCallSourceGate();
  assert.equal(gate.phaseStatus, 'APPLICATION_SOURCE_ACTIVE_PROVIDER_GATED');
  assert.equal(gate.blockerCode, 'COMMERCIAL_DECISION_AND_PROVIDER_ACCEPTANCE_REQUIRED');
  assert.equal(gate.source.historicalCommit, null);
  assert.equal(gate.source.provenanceStatus, 'OWNER_AUTHORIZED_RECONSTRUCTION');
  assert.ok(gate.source.canonicalCurrentImplementation.targetCount >= 7);
  assert.ok(gate.source.canonicalCurrentImplementation.evidenceCount >= 5);
  assert.match(gate.source.canonicalCurrentImplementation.fingerprintSha256, /^[a-f0-9]{64}$/u);
  assert.equal(gate.acceptance.historicalFullSourceRecovered, false);
  assert.equal(gate.acceptance.ownerAuthorizedReconstruction, true);
  assert.equal(gate.acceptance.canonicalCurrentImplementationPinned, true);
  assert.equal(gate.acceptance.everyCurrentSourceOutcomeMappedAndTested, true);
  assert.equal(gate.acceptance.originalHistoricalLiteralParityClaimed, false);
});

test('OutCall application launches separately from provider and commercial approval', () => {
  const gate = buildOutCallSourceGate();
  assert.equal(gate.applicationLaunchAllowed, true);
  assert.equal(gate.liveProviderAcceptanceProven, false);
  assert.equal(gate.acceptance.completeTwilioSandboxLifecycleProven, false);
  assert.equal(gate.acceptance.goLiveAccepted, false);
  assert.equal(gate.activationPolicy.failClosed, true);
  assert.ok(Object.entries(gate.activationPolicy.checks).every(([, value]) => value === true));
  assert.equal(gate.activationPolicy.sdkCatalogStatus, 'live');
  assert.equal(gate.activationPolicy.ecosystemStatus, 'active');
  assert.equal(gate.activationPolicy.deploymentRegistryEnabled, true);
  assert.equal(gate.activationPolicy.existingDatabaseStatusAfterSeed, 'live');
  assert.equal(gate.activationPolicy.newEnrollment, 'closed_pending_commercial_decision');
});

test('committed Phase 37 recovery ledger matches the compiler output', () => {
  const committed = JSON.parse(readFileSync(
    resolve(root, 'docs/phase-37/OUTCALL-SOURCE-RECOVERY-LEDGER.json'),
    'utf8',
  ));
  assert.deepEqual(committed, buildOutCallSourceGate());
});
