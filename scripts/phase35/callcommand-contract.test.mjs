import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const parity = JSON.parse(readFileSync('docs/parity/modules/callcommand-ai.json', 'utf8'));
const sourceGate = readFileSync('apps/modules/callcommand-ai/source/scripts/src/gatePhase3LiveCall.ts', 'utf8');
const restoredGate = readFileSync('apps/api/test/callcommand-phase35-live-call-gate.test.ts', 'utf8');

test('Phase 35 preserves the pinned CallCommand source and exact compiler-derived baseline', () => {
  assert.equal(parity.provenance.commit, 'd49434e1d641d62cc141591c7208539a7afbf11e');
  assert.equal(parity.capabilities.length, 589);
  assert.deepEqual(parity.typeCounts, { api_endpoint:86, asset:5, component_action:134, database_column:264, database_table:20, import_flow:16, integration:39, ui_page:22, ui_route:3 });
  for (const sourceBehavior of ['after_hours:voicemail','consent:accepted','callerPhone end-to-end','logged_no_provider']) assert.match(sourceGate, new RegExp(sourceBehavior.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(restoredGate, /cases\.length, 42/);
});

test('Phase 35 maps every source facet to active native or shared-equivalent behavior', () => {
  assert.equal(parity.stateCounts.BLOCKED, 0);
  assert.equal(parity.stateCounts.OWNER_WAIVED, 0);
  assert.equal(parity.stateCounts.ACTIVE_NATIVE + parity.stateCounts.ACTIVE_SHARED_EQUIVALENT, 589);
  for (const capability of parity.capabilities) {
    assert.ok(['ACTIVE_NATIVE','ACTIVE_SHARED_EQUIVALENT'].includes(capability.state), capability.capabilityId);
    assert.ok(capability.currentTargets.length, capability.capabilityId);
    assert.ok(capability.automatedEvidence.includes('apps/api/test/callcommand-phase35-live-call-gate.test.ts'), capability.capabilityId);
  }
});
