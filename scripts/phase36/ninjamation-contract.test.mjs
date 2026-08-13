import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const parity = JSON.parse(readFileSync(resolve(root, 'docs/parity/modules/ninjamation.json'), 'utf8'));
const report = readFileSync(resolve(root, 'docs/phase-36/NINJAMATION-COMPLETE-PRODUCT-REPORT.md'), 'utf8');

test('Phase 36 source compiler resolves the exact pinned Ninjamation baseline', () => {
  assert.equal(parity.provenance.commit, 'cca75338d04ed35b89f28d614eb51559735aa32f');
  assert.equal(parity.provenance.additionalSource.commit, 'ca0e55fd086f6751a43964927166bfa69db012b6');
  assert.equal(parity.capabilities.length, 189);
  assert.deepEqual(parity.typeCounts, { api_endpoint:29, asset:7, background_process:1, component_action:67, database_column:26, database_table:3, export_flow:2, integration:32, public_flow:3, ui_page:10, ui_route:9 });
});

test('Phase 36 has no blocked, waived, retired-as-green, or missing evidence facets', () => {
  assert.equal(parity.stateCounts.BLOCKED, 0); assert.equal(parity.stateCounts.OWNER_WAIVED, 0);
  assert.equal(parity.stateCounts.ACTIVE_NATIVE + parity.stateCounts.ACTIVE_SHARED_EQUIVALENT, 189);
  for (const capability of parity.capabilities) {
    assert.ok(['ACTIVE_NATIVE','ACTIVE_SHARED_EQUIVALENT'].includes(capability.state), capability.capabilityId);
    assert.ok(capability.currentTargets.length > 0, capability.capabilityId);
    assert.ok(capability.automatedEvidence.length > 0, capability.capabilityId);
    assert.ok(!String(capability.state).includes('RETIRED'), capability.capabilityId);
  }
});

test('Phase 36 report records synchronization, AI, checksum, no-execution, and production gates', () => {
  for (const phrase of ['Incremental commit','NINJAMATION_GENERATED_OUTPUT_INVALID','checksum/version headers','no `child_process`','Full source capability ledger','Live GitHub API/OpenAI provider acceptance']) {
    assert.match(report, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
