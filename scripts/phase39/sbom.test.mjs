import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSbom } from './generate-sbom.mjs';

const timestamp = '2026-08-15T00:00:00.000Z';
const lockLf = [
  'lockfileVersion: 9.0',
  'packages:',
  "  'example@1.2.3':",
  '    resolution: {integrity: sha512-test}',
  'snapshots:',
  '',
].join('\n');

test('SBOM inventory and lock fingerprint are stable across checkout line endings', () => {
  const lf = compileSbom(lockLf, { timestamp });
  const crlf = compileSbom(lockLf.replaceAll('\n', '\r\n'), { timestamp });

  assert.deepEqual(crlf, lf);
  assert.equal(lf.metadata.timestamp, timestamp);
  assert.equal(lf.components.length, 1);
  assert.equal(lf.components[0].name, 'example');
  assert.match(lf.metadata.properties[0].value, /^[a-f0-9]{64}$/);
});
