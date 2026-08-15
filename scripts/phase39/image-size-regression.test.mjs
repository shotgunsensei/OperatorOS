import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

function resolvePatchedImageSizeRoot() {
  const nativeRoot = join(process.cwd(), 'apps', 'torqueshed-native');
  const expoPackage = require.resolve('expo/package.json', { paths: [nativeRoot] });
  const metroPackage = require.resolve('@expo/metro-config/package.json', {
    paths: [dirname(expoPackage)],
  });
  return dirname(require.resolve('image-size/package.json', { paths: [dirname(metroPackage)] }));
}

const imageSizeRoot = resolvePatchedImageSizeRoot();
const { ICNS } = require(join(imageSizeRoot, 'dist', 'types', 'icns.js'));
const { JXL } = require(join(imageSizeRoot, 'dist', 'types', 'jxl.js'));

test('GHSA-w3rx-r6r6-pgpr: zero-length ICNS entries fail without looping', () => {
  const input = Buffer.alloc(32);
  input.write('icns', 0, 'ascii');
  input.writeUInt32BE(input.length, 4);
  input.write('ic10', 8, 'ascii');
  input.writeUInt32BE(0, 12);
  const started = performance.now();
  assert.throws(() => ICNS.calculate(input), /Invalid ICNS entry length/);
  assert.ok(performance.now() - started < 250, 'malformed ICNS must be rejected promptly');
});

test('GHSA-5p2g-fcmc-qvqq: zero-length JXL partial streams fail without looping', () => {
  const input = Buffer.alloc(16);
  input.writeUInt32BE(0, 0);
  input.write('jxlp', 4, 'ascii');
  const started = performance.now();
  assert.throws(() => JXL.calculate(input), /Invalid JXL partial-stream box length/);
  assert.ok(performance.now() - started < 250, 'malformed JXL must be rejected promptly');
});
