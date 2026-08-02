import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReleaseMetadata } from '../../../scripts/generate-release-metadata.mjs';
import { createRuntimeReleaseIdentity, loadReleaseMetadata } from '../src/lib/release-metadata.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('release metadata is deterministic for an exact commit, lockfile, and timestamp', () => {
  const input = {
    commit: 'a'.repeat(40),
    lockfileBytes: Buffer.from('lockfile'),
    builtAt: '2026-07-27T20:00:00.000Z',
  };
  assert.deepEqual(createReleaseMetadata(input), createReleaseMetadata(input));
  assert.match(createReleaseMetadata(input).buildId, /^[0-9a-f]{24}$/);
  assert.throws(
    () => createReleaseMetadata({ ...input, commit: 'main' }),
    /full 40-character Git SHA/,
  );
});

test('runtime release metadata fails closed when the manifest is absent or malformed', () => {
  assert.deepEqual(
    loadReleaseMetadata(
      { OPERATOROS_RELEASE_METADATA_PATH: resolve(root, 'does-not-exist.json') },
      resolve(tmpdir(), 'operatoros-release-absent'),
    ),
    { status: 'unavailable' },
  );
});

test('runtime accepts only a complete build-generated release identity', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'operatoros-release-'));
  const path = resolve(directory, 'release.json');
  const metadata = createReleaseMetadata({
    commit: 'b'.repeat(40),
    lockfileBytes: Buffer.from('locked'),
    builtAt: '2026-07-27T21:00:00.000Z',
  });
  writeFileSync(path, JSON.stringify(metadata));
  try {
    assert.deepEqual(loadReleaseMetadata({ OPERATOROS_RELEASE_METADATA_PATH: path }), {
      status: 'identified',
      ...metadata,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runtime identity binds the build to deployment time and database release version', () => {
  const metadata = createReleaseMetadata({
    commit: 'c'.repeat(40),
    lockfileBytes: Buffer.from('locked'),
    builtAt: '2026-07-29T20:00:00.000Z',
  });
  assert.deepEqual(
    createRuntimeReleaseIdentity(
      { status: 'identified', ...metadata },
      '2026-07-29T20:05:00.000Z',
    ),
    {
      status: 'identified',
      ...metadata,
      deployedAt: '2026-07-29T20:05:00.000Z',
      databaseRelease: {
        contractVersion: 1,
        releaseVersion: 31,
        stepCount: 31,
        lastStep: 'tradeflowkit_lead_operations',
      },
    },
  );
  assert.deepEqual(
    createRuntimeReleaseIdentity(
      { status: 'identified', ...metadata },
      'not-a-timestamp',
    ),
    { status: 'unavailable' },
  );
});

test('production build, readiness, and public verifier require release identity', () => {
  const pkg = JSON.parse(read('package.json'));
  const api = read('apps/api/src/index.ts');
  const verifier = read('scripts/verify-production-runtime.mjs');
  assert.match(pkg.scripts['build:production'], /generate-release-metadata\.mjs/);
  assert.match(api, /releaseIdentity/);
  assert.match(api, /releaseIdentity\.status === 'identified'/);
  assert.match(verifier, /validateReleaseIdentity/);
  assert.match(verifier, /OPERATOROS_EXPECTED_RELEASE_COMMIT/);
});

test('Replit npm preinstall can parse root overrides while pnpm retains scoped overrides', () => {
  const pkg = JSON.parse(read('package.json'));
  const workspace = read('pnpm-workspace.yaml');
  const invalidNpmSelectors = Object.keys(pkg.overrides ?? {}).filter((key) =>
    key.includes('>'),
  );

  assert.deepEqual(invalidNpmSelectors, []);
  assert.equal(pkg.overrides.vite, '$vite');
  assert.equal(pkg.overrides.ws, '$ws');
  assert.match(workspace, /"express>router": ">=2\.2\.0"/);
  assert.match(workspace, /"next>sharp": ">=0\.35\.0"/);
  assert.match(workspace, /"vite>esbuild": ">=0\.28\.1"/);
  assert.match(
    read('.replit'),
    /pnpm@10\.34\.5 -- pnpm install --frozen-lockfile/,
  );
});
