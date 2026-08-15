import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRevenueRelease } from './audit-torqueshed-revenue.mjs';

const source = 'a'.repeat(40);
const release = (commit) => ({
  release: {
    commit,
    buildId: 'b'.repeat(24),
    deployedAt: '2026-08-15T00:00:00.000Z',
    databaseRelease: { contractVersion: 1, releaseVersion: 48, stepCount: 48, lastStep: 'phase39_hardening_tables' },
  },
});

test('deployed/source release drift is reported without hiding endpoint disagreement', () => {
  const result = compareRevenueRelease(source, release('c'.repeat(40)), release('d'.repeat(40)));
  assert.equal(result.matches, false);
  assert.equal(result.code, 'TORQUE_RELEASE_IDENTITY_MISMATCH');
  assert.equal(result.endpointsAgree, false);
});

test('matching health, readiness, and source identities pass', () => {
  const result = compareRevenueRelease(source, release(source), release(source));
  assert.equal(result.matches, true);
  assert.equal(result.code, 'TORQUE_RELEASE_IDENTITY_MATCH');
  assert.equal(result.endpointsAgree, true);
});
