import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  evaluateDeploymentScope,
  findFilesystemDependencyLockfiles,
  inspectDeploymentScope,
  isDependencyLockfile,
} from '../verify-deployment-scope.mjs';
import { evaluatePackageManager } from '../enforce-pnpm.mjs';

const compliantFixture = {
  files: ['package.json', 'pnpm-lock.yaml', 'apps/modules/example/source/package.json'],
  gitignore: [
    '/package-lock.json',
    '/apps/modules/*/source/**/package-lock.json',
    '/apps/modules/*/source/**/pnpm-lock*.yaml',
  ].join('\n'),
  replit: `hidden = ["apps/modules"]
[packager]
ignoredPaths = ["apps/modules"]
[packager.features]
enabledForHosting = false
[[ports]]
localPort = 5000
externalPort = 80
[deployment]
run = ["node", "scripts/start-unified-runtime.mjs"]
build = ["bash", "npm exec --yes --package=pnpm@10.34.5 -- pnpm install --frozen-lockfile"]`,
  workspace: 'packages:\n  - apps/*\n  - packages/*\n',
  importer: "$excludedDependencyLockPattern = 'lock'\ndependency lockfile excluded from non-installable historical snapshot",
  packageManagerEnforcer: "const REQUIRED_PNPM_VERSION = '10.34.5'; corepack pnpm install --frozen-lockfile",
  packageJson: {
    packageManager: 'pnpm@10.34.5',
    devEngines: {
      packageManager: { name: 'pnpm', version: '10.34.5', onFail: 'error' },
    },
    scripts: { preinstall: 'node scripts/enforce-pnpm.mjs' },
  },
};

test('package-manager enforcement accepts only the pinned pnpm lifecycle', () => {
  assert.equal(evaluatePackageManager('pnpm/10.34.5 npm/? node/v24.16.0 win32 x64').pass, true);
  assert.equal(evaluatePackageManager('pnpm/10.34.4 npm/? node/v24.16.0 win32 x64').pass, false);
  assert.equal(evaluatePackageManager('npm/11.6.2 node/v24.16.0 win32 x64').pass, false);
  assert.equal(evaluatePackageManager('').pass, false);
});

test('dependency lock classifier recognizes duplicate historical lock names', () => {
  assert.equal(isDependencyLockfile('pnpm-lock.yaml'), true);
  assert.equal(isDependencyLockfile('apps/modules/example/source/pnpm-lock (1).yaml'), true);
  assert.equal(isDependencyLockfile('apps/modules/example/source/package-lock.json'), true);
  assert.equal(isDependencyLockfile('apps/api/package.json'), false);
});

test('filesystem scan finds dependency locks even when Git ignores them', () => {
  const root = mkdtempSync(join(tmpdir(), 'operatoros-deployment-locks-'));
  try {
    const historical = join(root, 'apps', 'modules', 'example', 'source', 'nested');
    mkdirSync(historical, { recursive: true });
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    writeFileSync(join(historical, 'pnpm-lock (1).yaml'), 'lockfileVersion: 9.0\n');
    assert.deepEqual(findFilesystemDependencyLockfiles(root), [
      'apps/modules/example/source/nested/pnpm-lock (1).yaml',
      'package-lock.json',
      'pnpm-lock.yaml',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('deployment scope rejects non-authoritative locks and internal public ports', () => {
  const result = evaluateDeploymentScope({
    ...compliantFixture,
    files: [...compliantFixture.files, 'package-lock.json', 'apps/modules/example/source/yarn.lock'],
    npmrc: 'package-lock=false\n',
    replit: `${compliantFixture.replit}\n[[ports]]\nlocalPort = 5001\nexternalPort = 3000`,
    packageJson: {
      ...compliantFixture.packageJson,
      devEngines: { packageManager: { name: 'npm', version: '11', onFail: 'warn' } },
    },
  });
  assert.equal(result.pass, false);
  assert.deepEqual(result.disallowedLockfiles, [
    'apps/modules/example/source/yarn.lock',
    'package-lock.json',
  ]);
  assert.deepEqual(result.externalPorts, [80, 3000]);
  assert.ok(result.issues.includes('.npmrc disables the authoritative pnpm lockfile'));
  assert.ok(result.issues.includes('devEngines.packageManager must reject npm before install and pin pnpm 10.34.5'));
});

test('current repository has one authoritative install graph and one public Replit port', () => {
  const result = inspectDeploymentScope();
  assert.equal(result.pass, true, result.issues.join('\n'));
  assert.deepEqual(result.discoveredLockfiles, ['pnpm-lock.yaml']);
  assert.deepEqual(result.externalPorts, [80]);
});
