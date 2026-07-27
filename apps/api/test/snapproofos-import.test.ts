import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSnapProofMigrationPlan,
  SNAPPROOF_SOURCE_COMMIT,
} from '../src/lib/snapproofos-import.ts';

test('SnapProofOS legacy migration assessment is deterministic and commit pinned', () => {
  const source = {
    sourceCommit: SNAPPROOF_SOURCE_COMMIT,
    jobs: [{ id: 'job-1' }],
    findings: [{ id: 'finding-1' }],
    notes: [{ id: 'note-1' }],
    files: [{ id: 'file-1', fileUrl: 'https://legacy.invalid/raw' }],
    reports: [{ id: 'report-1' }],
  };
  const first = buildSnapProofMigrationPlan(source);
  const second = buildSnapProofMigrationPlan(source);
  assert.deepEqual(first, second);
  assert.equal(first.counts.cases, 1);
  assert.equal(first.applyAvailable, false);
  assert.ok(first.blockers[0]?.includes('validated file bytes'));
  assert.ok(first.excluded.includes('client_supplied_file_urls'));
  assert.ok(first.excluded.includes('billing'));
});

test('SnapProofOS legacy migration rejects drift and standalone authority', () => {
  assert.throws(
    () => buildSnapProofMigrationPlan({ sourceCommit: 'unapproved', users: [{ password: 'x' }] }),
    /approved snapshot/,
  );
});
