import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compileSbom } from './generate-sbom.mjs';

const require = createRequire(import.meta.url);
const nativeRoot = join(process.cwd(), 'apps', 'torqueshed-native');

// The vulnerable parser was removed upstream in the supported Metro 0.84.5
// maintenance release. Test its absence rather than retaining an unused patch
// or resolving a stale node_modules copy left behind by an earlier install.
test('GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq: canonical graph excludes image-size', () => {
  assert.equal(compileSbom().components.some(component => component.name === 'image-size'), false);
  const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
  assert.doesNotMatch(workspace, /GHSA-w3rx-r6r6-pgpr|GHSA-5p2g-fcmc-qvqq|image-size/);
});

test('Expo and React Native CLI resolve maintained Metro without vulnerable parsers', () => {
  const expoRoot = dirname(require.resolve('expo/package.json', { paths: [nativeRoot] }));
  const expoMetroRoot = dirname(require.resolve('@expo/metro/package.json', { paths: [expoRoot] }));
  const reactNativeRoot = dirname(require.resolve('react-native/package.json', { paths: [nativeRoot] }));
  const cliRoot = dirname(require.resolve('@react-native/community-cli-plugin/package.json', { paths: [reactNativeRoot] }));
  for (const root of [expoMetroRoot, cliRoot]) {
    const manifest = require(require.resolve('metro/package.json', { paths: [root] }));
    assert.equal(manifest.version, '0.84.5');
    assert.equal(manifest.dependencies['image-size'], undefined);
    const metroRoot = dirname(require.resolve('metro/package.json', { paths: [root] }));
    for (const name of ['metro-config', 'metro-transform-worker']) {
      const child = require(require.resolve(`${name}/package.json`, { paths: [metroRoot] }));
      assert.equal(child.version, '0.84.5');
      assert.equal(child.dependencies['image-size'], undefined);
    }
  }
});
