import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateDeploymentScope,
  inspectDeploymentScope,
  isDependencyLockfile,
} from '../verify-deployment-scope.mjs';

const compliantFixture = {
  files: ['package.json', 'pnpm-lock.yaml', 'apps/modules/example/source/package.json'],
  gitignore: [
    '/package-lock.json',
    '/apps/modules/*/source/**/package-lock.json',
    '/apps/modules/*/source/**/pnpm-lock*.yaml',
  ].join('\n'),
  npmrc: 'package-lock=false\n',
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
  packageJson: { packageManager: 'pnpm@10.34.5' },
};

test('dependency lock classifier recognizes duplicate historical lock names', () => {
  assert.equal(isDependencyLockfile('pnpm-lock.yaml'), true);
  assert.equal(isDependencyLockfile('apps/modules/example/source/pnpm-lock (1).yaml'), true);
  assert.equal(isDependencyLockfile('apps/modules/example/source/package-lock.json'), true);
  assert.equal(isDependencyLockfile('apps/api/package.json'), false);
});

test('deployment scope rejects non-authoritative locks and internal public ports', () => {
  const result = evaluateDeploymentScope({
    ...compliantFixture,
    files: [...compliantFixture.files, 'package-lock.json', 'apps/modules/example/source/yarn.lock'],
    replit: `${compliantFixture.replit}\n[[ports]]\nlocalPort = 5001\nexternalPort = 3000`,
  });
  assert.equal(result.pass, false);
  assert.deepEqual(result.disallowedLockfiles, [
    'apps/modules/example/source/yarn.lock',
    'package-lock.json',
  ]);
  assert.deepEqual(result.externalPorts, [80, 3000]);
});

test('current repository has one authoritative install graph and one public Replit port', () => {
  const result = inspectDeploymentScope();
  assert.equal(result.pass, true, result.issues.join('\n'));
  assert.deepEqual(result.discoveredLockfiles, ['pnpm-lock.yaml']);
  assert.deepEqual(result.externalPorts, [80]);
});
