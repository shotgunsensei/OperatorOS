import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDiagnosticTransition,
  maskVin,
  normalizeVin,
  torqueInteger,
  torquePage,
  TorqueShedValidationError,
} from '../src/lib/torqueshed-foundation.js';

test('TorqueShed stores only a deterministic VIN fingerprint and masked suffix', () => {
  const first = normalizeVin('1FTCR15X0VTA12345')!;
  const second = normalizeVin('1ftcr15x0vta12345')!;
  assert.equal(first.hash, second.hash);
  assert.equal(first.hash.length, 64);
  assert.equal(first.last6, 'A12345');
  assert.equal(first.masked, '***********A12345');
  assert.equal(maskVin(first.last6), first.masked);
  assert.ok(!JSON.stringify(first).includes('1FTCR15X0VTA12345'));
  assert.throws(
    () => normalizeVin('INVALID'),
    (error: unknown) =>
      error instanceof TorqueShedValidationError && error.code === 'TORQUESHED_VIN_INVALID',
  );
});

test('TorqueShed validates pagination, integer minor units, and diagnostic transitions', () => {
  assert.deepEqual(torquePage({ limit: '50', offset: '25', search: ' lean condition ' }), {
    limit: 50,
    offset: 25,
    search: 'lean condition',
  });
  assert.equal(torqueInteger(4899, 'costMinor', 0, 10000, true), 4899);
  assert.throws(() => torqueInteger(48.99, 'costMinor', 0, 10000, true));
  assert.doesNotThrow(() => assertDiagnosticTransition('open', 'testing'));
  assert.doesNotThrow(() => assertDiagnosticTransition('resolved', 'open'));
  assert.throws(
    () => assertDiagnosticTransition('open', 'resolved'),
    (error: unknown) => error instanceof TorqueShedValidationError && error.statusCode === 409,
  );
});
