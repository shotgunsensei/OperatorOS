import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAll,
  buildCompiledLedger,
  createNegativeFixture,
  effectiveIssues,
  issueSummary,
} from './lib/compiler.mjs';

const baseline = buildAll();

function fixtureIssues(name) {
  const fixture = createNegativeFixture(name, baseline.source, baseline.target, baseline.waivers);
  return buildCompiledLedger(fixture.source, fixture.target, fixture.waivers).issues;
}

test('compiler derives counts from all 13 Phase 20 module ledgers', () => {
  assert.equal(baseline.source.totals.modules, 13);
  assert.equal(baseline.source.totals.capabilities, 7396);
  assert.equal(baseline.source.totals.unclassified, 0);
  assert.equal(baseline.source.drift.length, 0);
  assert.equal(baseline.ledger.totals.capabilities, baseline.source.totals.capabilities);
  const tradeFlowKit = baseline.source.modules.find((module) => module.moduleSlug === 'tradeflowkit');
  assert.ok(tradeFlowKit);
  assert.equal(tradeFlowKit.freshFingerprint.fileCount, 321);
});

test('every active evidence file compiles to one or more real runnable test IDs', () => {
  const active = baseline.ledger.modules.flatMap((module) => module.capabilities)
    .filter((capability) => capability.state.startsWith('ACTIVE_'));
  assert.ok(active.length > 0);
  for (const capability of active) {
    assert.ok(capability.mapping.implementationFiles.length > 0, capability.capabilityId);
    assert.ok(capability.evidence.files.length > 0, capability.capabilityId);
    assert.ok(capability.evidence.testIds.length > 0, capability.capabilityId);
  }
});

test('shared equivalents carry original outcomes and compatibility assertions', () => {
  const shared = baseline.ledger.modules.flatMap((module) => module.capabilities)
    .filter((capability) => capability.state === 'ACTIVE_SHARED_EQUIVALENT');
  assert.ok(shared.length > 0);
  for (const capability of shared) {
    assert.ok(capability.originalUserOutcome, capability.capabilityId);
    assert.ok(capability.compatibilityAssertion, capability.capabilityId);
  }
});

test('current release contract has no required blockers', () => {
  const counts = issueSummary(effectiveIssues(baseline.ledger));
  assert.equal(counts.BLOCKED_REQUIRED ?? 0, baseline.source.totals.stateCounts.BLOCKED);
  assert.equal(counts.BLOCKED_REQUIRED ?? 0, 0);
});

for (const [fixture, expectedCode] of [
  ['source-drift', 'SOURCE_DRIFT'],
  ['missing-mapping', 'MISSING_MAPPING'],
  ['missing-target', 'MISSING_TARGET_FILE'],
  ['missing-route', 'MISSING_TARGET_ROUTE'],
  ['missing-schema', 'MISSING_TARGET_SCHEMA'],
  ['missing-evidence', 'MISSING_EVIDENCE'],
  ['missing-test-id', 'MISSING_TEST_ID'],
  ['tests-skipped', 'REQUIRED_TESTS_SKIPPED'],
  ['duplicate-id', 'DUPLICATE_CAPABILITY_ID'],
  ['unapproved-waiver', 'UNAPPROVED_WAIVER'],
  ['stale-counts', 'STALE_MANIFEST_COUNTS'],
  ['shared-outcome', 'MISSING_ORIGINAL_USER_OUTCOME'],
  ['shared-compatibility', 'MISSING_COMPATIBILITY_ASSERTION'],
  ['blocked-required', 'BLOCKED_REQUIRED'],
]) {
  test(`controlled negative fixture ${fixture} produces ${expectedCode}`, () => {
    assert.ok(fixtureIssues(fixture).some((entry) => entry.code === expectedCode));
  });
}
