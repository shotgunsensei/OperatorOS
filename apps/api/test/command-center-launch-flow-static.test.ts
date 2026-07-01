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

test('Command Center launchpad is registry-driven and uses shared SSO issue flow', () => {
  const page = readRepoFile('apps/web/src/components/pages/MyAppsPage.tsx');
  const launchHelper = readRepoFile('apps/web/src/lib/module-launch.ts');
  const registry = readRepoFile('apps/web/src/lib/operatoros-registry.ts');

  assert.match(registry, /OPERATOROS_MODULE_REGISTRY/);
  assert.match(page, /COMMAND_CENTER_MODULES/);
  assert.match(page, /buildLaunchpadModule/);
  assert.match(page, /command-center-tenant-selector/);
  assert.match(page, /button-command-center-platform/);
  assert.match(page, /button-command-center-manage-modules/);
  assert.match(page, /Active modules/);
  assert.match(page, /Locked modules/);
  assert.match(page, /Planned modules/);

  assert.match(launchHelper, /fetch\('\/api\/sso\/issue'/);
  assert.match(launchHelper, /credentials:\s*'include'/);
  assert.match(launchHelper, /headers\['X-Tenant-Id'\]/);
  assert.match(launchHelper, /body:\s*JSON\.stringify\(\{\s*moduleId,\s*tenantId\s*\}\)/);
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
    'Active modules',
    'Locked modules',
    'Planned modules',
    'access denied',
    'module disabled',
    'network failure',
    'server-side',
  ]) {
    assert.ok(doc.includes(needle), `missing documentation coverage for ${needle}`);
  }
});
