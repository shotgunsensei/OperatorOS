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
import {
  evaluatePackageManager,
  isReplitProviderInstallEnvironment,
} from '../enforce-pnpm.mjs';

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
  workspace: 'packages:\n  - apps/*\n  - packages/*\nmanagePackageManagerVersions: false\n',
  importer: "$excludedDependencyLockPattern = 'lock'\ndependency lockfile excluded from non-installable historical snapshot",
  packageManagerEnforcer: `const REQUIRED_PNPM_VERSION = '10.34.5';
const MINIMUM_REPLIT_PROVIDER_PNPM_VERSION = '10.26.0';
const OBSERVED_REPLIT_SECURITY_SCAN = { pnpmVersion: '10.26.1', nodeVersion: 'v24.12.0', platform: 'linux', arch: 'x64' };
const CURRENT_REPLIT_SECURITY_SCAN = { pnpmVersion: '10.26.1', nodeVersion: 'v20.20.0', platform: 'linux', arch: 'x64' };
const REPLIT_PROVIDER_ENVIRONMENT_KEYS = ['REPL_ID', 'REPLIT_DEPLOYMENT'];
const REPLIT_DEV_DOMAIN = 'editor-only';
const providerNode = '/nix/store/provider-node/bin/node';
const mode = 'replit-provider-scan';
corepack pnpm install --frozen-lockfile`,
  packageJson: {
    packageManager: 'pnpm@10.34.5',
    devEngines: {
      packageManager: { name: 'pnpm', version: '10.34.5', onFail: 'error' },
    },
    scripts: { preinstall: 'node scripts/enforce-pnpm.mjs' },
  },
};

test('package-manager enforcement keeps exact pnpm authoritative and bounds the Replit scan exception', () => {
  const exact = evaluatePackageManager('pnpm/10.34.5 npm/? node/v24.16.0 win32 x64');
  assert.equal(exact.pass, true);
  assert.equal(exact.mode, 'pinned');
  assert.equal(evaluatePackageManager('pnpm/10.26.1 npm/? node/v24.12.0 linux x64').pass, false);
  assert.equal(evaluatePackageManager(
    'pnpm/10.26.1 npm/? node/v24.12.0 linux x64',
    { allowReplitProviderVersion: true },
  ).mode, 'replit-provider-scan');
  assert.equal(evaluatePackageManager(
    'pnpm/10.25.0 npm/? node/v24.12.0 linux x64',
    { allowReplitProviderVersion: true },
  ).pass, false);
  assert.equal(evaluatePackageManager(
    'pnpm/11.0.0 npm/? node/v24.12.0 linux x64',
    { allowReplitProviderVersion: true },
  ).pass, false);
  assert.equal(evaluatePackageManager('npm/11.6.2 node/v24.16.0 win32 x64').pass, false);
  assert.equal(evaluatePackageManager('').pass, false);
});

test('Replit provider detection uses provider evidence and excludes the interactive editor', () => {
  assert.equal(isReplitProviderInstallEnvironment({ REPL_ID: 'provider-build' }), true);
  assert.equal(isReplitProviderInstallEnvironment({ REPLIT_DEPLOYMENT: '1' }), true);
  assert.equal(isReplitProviderInstallEnvironment({}, {
    platform: 'linux',
    execPath: '/nix/store/provider-node/bin/node',
  }), true);
  const scanRuntime = {
    platform: 'linux',
    arch: 'x64',
    execPath: '/usr/local/bin/node',
    nodeVersion: 'v24.12.0',
  };
  const scanUserAgent = 'pnpm/10.26.1 npm/? node/v24.12.0 linux x64';
  assert.equal(isReplitProviderInstallEnvironment({}, scanRuntime, scanUserAgent), true);
  assert.equal(isReplitProviderInstallEnvironment({}, {
    ...scanRuntime,
    nodeVersion: 'v20.20.0',
  }, 'pnpm/10.26.1 npm/? node/v20.20.0 linux x64'), true);
  assert.equal(isReplitProviderInstallEnvironment({}, {
    ...scanRuntime,
    nodeVersion: 'v20.20.1',
  }, 'pnpm/10.26.1 npm/? node/v20.20.1 linux x64'), false);
  assert.equal(isReplitProviderInstallEnvironment({}, {
    ...scanRuntime,
    nodeVersion: 'v20.20.0',
  }, 'pnpm/10.26.2 npm/? node/v20.20.0 linux x64'), false);
  assert.equal(isReplitProviderInstallEnvironment(
    { REPLIT_DEV_DOMAIN: 'example.replit.dev' },
    scanRuntime,
    scanUserAgent,
  ), true);
  assert.equal(isReplitProviderInstallEnvironment(
    { REPLIT_DEV_DOMAIN: 'example.replit.dev' },
    { ...scanRuntime, nodeVersion: 'v20.20.0' },
    'pnpm/10.26.1 npm/? node/v20.20.0 linux x64',
  ), true);
  assert.equal(isReplitProviderInstallEnvironment({
    REPLIT_DEV_DOMAIN: 'example.replit.dev',
    REPLIT_DEPLOYMENT: '1',
  }, {
    platform: 'linux',
    arch: 'x64',
    execPath: '/nix/store/provider-node/bin/node',
    nodeVersion: 'v20.20.0',
  }, 'pnpm/10.26.1 npm/? node/v20.20.0 linux x64'), true);
  assert.equal(isReplitProviderInstallEnvironment(
    {},
    scanRuntime,
    'pnpm/10.26.2 npm/? node/v24.12.0 linux x64',
  ), false);
  assert.equal(isReplitProviderInstallEnvironment({}, {
    ...scanRuntime,
    nodeVersion: 'v24.12.1',
  }, scanUserAgent), false);
  assert.equal(isReplitProviderInstallEnvironment({}, {
    ...scanRuntime,
    arch: 'arm64',
  }, scanUserAgent), false);
  assert.equal(isReplitProviderInstallEnvironment({
    REPL_ID: 'interactive-editor',
    REPLIT_DEV_DOMAIN: 'example.replit.dev',
  }), false);
  assert.equal(isReplitProviderInstallEnvironment({ REPLIT_DEV_DOMAIN: 'example.replit.dev' }, {
    platform: 'linux',
    arch: 'x64',
    execPath: '/nix/store/editor-node/bin/node',
    nodeVersion: 'v24.12.0',
  }, scanUserAgent), true);
  assert.equal(isReplitProviderInstallEnvironment({}, {
    platform: 'linux',
    arch: 'x64',
    execPath: '/usr/local/bin/node',
    nodeVersion: 'v20.20.0',
  }, ''), false);
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
