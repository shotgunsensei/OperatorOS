import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

for (const module of [
  {
    slug: 'tradeflowkit',
    shell: 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx',
    manifest: 'apps/web/src/app/tradeflowkit.webmanifest/route.ts',
    worker: 'apps/web/public/tradeflowkit-sw.js',
    expectedName: 'TradeFlowKit',
  },
  {
    slug: 'faultlinelab',
    shell: 'apps/web/src/components/module-shells/FaultlineLabShell.tsx',
    manifest: 'apps/web/src/app/faultlinelab.webmanifest/route.ts',
    worker: 'apps/web/public/faultlinelab-sw.js',
    expectedName: 'FaultlineLab',
  },
]) {
  test(`${module.expectedName} restores an installable shell without caching protected state`, () => {
    const shell = read(module.shell);
    const manifest = read(module.manifest);
    const worker = read(module.worker);
    assert.match(shell, new RegExp(`${module.slug}\\.webmanifest`, 'u'));
    assert.match(shell, new RegExp(`${module.slug}-sw\\.js`, 'u'));
    assert.match(shell, /serviceWorker\.register/u);
    assert.match(shell, new RegExp(`window\\.location\\.hostname\\.toLowerCase\\(\\) === '${module.slug}\\.operatoros\\.net'`, 'u'));
    assert.match(manifest, new RegExp(`name: '${module.expectedName}`, 'u'));
    assert.match(manifest, /display: 'standalone'/u);
    assert.match(manifest, /purpose: 'any maskable'/u);
    assert.match(worker, /request\.method !== 'GET' \|\| request\.mode !== 'navigate'/u);
    assert.doesNotMatch(worker, /caches\.open|cache\.put|caches\.match/u);
    assert.match(worker, /Cache-Control': 'no-store'/u);
  });
}

test('TradeFlowKit Android association remains fail-closed until reviewed signing values are configured', () => {
  const route = read('apps/web/src/app/.well-known/assetlinks.json/route.ts');
  assert.match(route, /host === 'tradeflowkit\.operatoros\.net'/u);
  assert.match(route, /TRADEFLOWKIT_ANDROID_PACKAGE_NAME/u);
  assert.match(route, /TRADEFLOWKIT_ANDROID_CERT_FINGERPRINTS/u);
  assert.match(route, /associations\.length > 0 \? 'public, max-age=3600' : 'no-store'/u);
  assert.match(route, /:\s*\[\];/u);
  assert.match(route, /host === 'torqueshed\.operatoros\.net'/u);
  assert.match(route, /TORQUESHED_ANDROID_SHA256_CERT_FINGERPRINT/u);
  assert.match(route, /TORQUESHED_ASSETLINKS_UNAVAILABLE/u);
  assert.doesNotMatch(route, /63:1A:1C|F0:21:04|F7:F0:FF/u);
});
