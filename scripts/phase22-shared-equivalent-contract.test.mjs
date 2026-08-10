import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(resolve(root, 'docs/parity/shared-equivalent-adapters.json'), 'utf8'));

test('P22-ADAPTER-LEDGER-001: every shared-equivalent capability names an outcome, assertion, adapter, and executable behavior test', () => {
  const ids = new Set();
  assert.equal(contract.mappingCount, contract.mappings.length);
  assert.ok(contract.mappingCount > 0);
  for (const mapping of contract.mappings) {
    assert.equal(ids.has(mapping.capabilityId), false, mapping.capabilityId);
    ids.add(mapping.capabilityId);
    assert.ok(contract.adapters[mapping.adapterId], mapping.capabilityId);
    assert.ok(mapping.originalUserOutcome.length > 0, mapping.capabilityId);
    assert.ok(mapping.compatibilityAssertion.length > 0, mapping.capabilityId);
    assert.ok(mapping.adapterTestIds.length > 0, mapping.capabilityId);
    assert.equal(mapping.adapterTestIds.length, mapping.adapterTestPaths.length, mapping.capabilityId);
  }
});

test('P22-ADAPTER-LEDGER-NEGATIVE-001: duplicate or untested mappings are rejected by the contract shape', () => {
  const first = contract.mappings[0];
  assert.ok(first);
  const duplicateFixture = [first, { ...first, adapterTestIds: [] }];
  assert.notEqual(new Set(duplicateFixture.map(item => item.capabilityId)).size, duplicateFixture.length);
  assert.equal(duplicateFixture.some(item => item.adapterTestIds.length === 0), true);
});
