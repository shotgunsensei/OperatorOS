import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 50 OutCall exposes a distinct safety-first route application shell', () => {
  const contract = read('apps/web/src/components/module-shells/OutCallRoute.contract.ts');
  const shell = read('apps/web/src/components/module-shells/OutCallShell.tsx');
  const workspace = read('apps/web/src/components/module-shells/OutCallWorkspace.tsx');
  for (const route of ['/contacts', '/schedules', '/campaigns', '/calls', '/reminders', '/verification', '/delivery', '/history', '/compliance', '/settings']) {
    assert.match(contract, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(contract, /outcall-midnight-violet-safety/);
  assert.match(shell, /ModuleApplicationShell/);
  assert.match(shell, /DEFAULT_OPERATOROS_NAVIGATION_URLS/);
  assert.match(workspace, /data-outcall-view=\{view\}/);
  assert.doesNotMatch(workspace, /ShellLiveBadge|<h1[^>]*>OutCall/);
});

test('Phase 50 OutCall route copy preserves the single-destination and non-emergency boundary', () => {
  const contract = read('apps/web/src/components/module-shells/OutCallRoute.contract.ts');
  const workspace = read('apps/web/src/components/module-shells/OutCallWorkspace.tsx');
  assert.match(contract, /does not maintain a bulk contact list/);
  assert.match(contract, /does not send bulk campaigns/);
  assert.match(contract, /confirmed by the calling service/);
  assert.match(workspace, /no arbitrary contact address book/);
  assert.match(workspace, /not a bulk outbound campaign/);
  assert.match(workspace, /does not replace 911/);
  assert.match(workspace, /Calls can only go to your verified number/);
  assert.match(workspace, /A call appears as completed only after the calling service confirms it/);
});

test('Phase 50 OutCall compatibility paths and durable call records converge safely', () => {
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  for (const alias of ['/dashboard', '/readiness', '/profiles', '/triggers', '/setup', '/privacy']) {
    assert.match(routeMap, new RegExp(alias.replaceAll('/', '\\/')));
  }
  assert.match(routeMap, /outcall-call-record/);
  assert.match(routeMap, /redirectPath: '\/contacts'/);
  assert.match(routeMap, /redirectPath: '\/campaigns'/);
  assert.match(routeMap, /redirectPath: '\/verification'/);
  assert.match(routeMap, /redirectPath: '\/compliance'/);
});
