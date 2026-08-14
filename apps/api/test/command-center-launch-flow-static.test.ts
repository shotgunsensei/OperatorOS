import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('Command Center launchpad is registry-driven and starts authorization on the target host', () => {
  const page = readRepoFile('apps/web/src/components/pages/MyAppsPage.tsx');
  const launchHelper = readRepoFile('apps/web/src/lib/module-launch.ts');
  const login = readRepoFile('apps/web/src/app/login/page.tsx');
  const registry = readRepoFile('apps/web/src/lib/operatoros-registry.ts');

  assert.match(registry, /OPERATOROS_MODULE_REGISTRY/);
  assert.match(page, /COMMAND_CENTER_MODULES/);
  assert.match(page, /buildLaunchpadModule/);
  assert.match(page, /command-center-tenant-selector/);
  assert.match(page, /button-command-center-platform/);
  assert.match(page, /button-command-center-manage-modules/);
  assert.match(page, /Your tools/);
  assert.match(page, /More tools you can add/);
  assert.doesNotMatch(page, /Planned for OperatorOS/);

  assert.match(launchHelper, /openExternal\(module\.productionBaseUrl\)/);
  assert.match(login, /issueModuleLaunch\(module\.id/);
  assert.match(login, /codeChallengeMethod:\s*'S256'/);
  assert.match(login, /sanitizeReturnTo\(destination, ''\)/);
  assert.match(login, /window\.location\.replace\(safeDestination\)/);
  assert.doesNotMatch(login, /window\.location\.replace\(destination\)/);
  assert.match(launchHelper, /credentials:\s*'include'/);
  assert.match(launchHelper, /body:\s*JSON\.stringify\(\{\s*moduleId,\s*tenantId,\s*\.\.\.authorization\s*\}\)/);
  assert.doesNotMatch(launchHelper, /\/v1\/sso\/issue/);
  assert.doesNotMatch(page, /modulesApi\.handoff/);
  assert.doesNotMatch(page, /meApi\.modules/);
});

test('Marketplace launch uses the same SSO issue helper as the Command Center', () => {
  const appsPage = readRepoFile('apps/web/src/components/pages/AppsPage.tsx');

  assert.match(appsPage, /launchModuleViaSso/);
  assert.match(appsPage, /friendlyModuleLaunchError/);
  assert.doesNotMatch(appsPage, /modulesApi\.handoff/);
});

test('Command Center launch flow documentation covers states and server authority', () => {
  const doc = readRepoFile('docs/command-center-launch-flow.md');

  for (const needle of [
    'POST /api/sso/issue',
    'central module registry',
    'tenantId',
    'Your tools',
    'More tools you can add',
    'Browse tools',
    'access denied',
    'module disabled',
    'network failure',
    'server-side',
  ]) {
    assert.ok(doc.includes(needle), `missing documentation coverage for ${needle}`);
  }
});
