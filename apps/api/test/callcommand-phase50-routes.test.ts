import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 50 CallCommand AI exposes a distinct route application shell', () => {
  const contract = read('apps/web/src/components/module-shells/CallCommandRoute.contract.ts');
  const shell = read('apps/web/src/components/module-shells/CallCommandShell.tsx');
  const workspace = read('apps/web/src/components/module-shells/CallCommandWorkspace.tsx');
  for (const route of ['/calls', '/recordings', '/transcripts', '/analysis', '/actions', '/automations', '/numbers', '/providers', '/organizations', '/compliance', '/settings']) {
    assert.match(contract, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(contract, /callcommand-emerald-signal-grid/);
  assert.match(shell, /ModuleApplicationShell/);
  assert.match(shell, /DEFAULT_OPERATOROS_NAVIGATION_URLS/);
  assert.match(workspace, /data-callcommand-view=\{view\}/);
  assert.doesNotMatch(workspace, /CallCommand product sections|href=\{`#\$\{href\}`\}/);
});

test('Phase 50 CallCommand AI routes general and MSP workspaces without duplicating authority', () => {
  const workspace = read('apps/web/src/components/module-shells/CallCommandWorkspace.tsx');
  const msp = read('apps/web/src/components/module-shells/CallCommandMspWorkspace.tsx');
  assert.match(workspace, /if \(\['organizations', 'compliance'\]\.includes\(view\)\) return/);
  assert.match(workspace, /\['organizations', 'providers', 'compliance', 'settings'\]\.includes\(view\).*CallCommandMspWorkspace/s);
  assert.match(msp, /view === 'organizations'/);
  assert.match(msp, /view === 'providers'/);
  assert.match(msp, /view === 'compliance'/);
  assert.match(msp, /view === 'settings'/);
  assert.match(msp, /Arbitrary commands/);
  assert.match(msp, /display-once/);
  assert.match(msp, /Ticket-only is the safe default/);
});

test('Phase 50 CallCommand AI compatibility aliases converge on canonical owner routes', () => {
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  for (const alias of ['/dashboard', '/switchboard', '/tickets', '/profiles', '/flows', '/setup/telephony', '/msp/organizations', '/msp/audit', '/billing']) {
    assert.match(routeMap, new RegExp(alias.replaceAll('/', '\\/')));
  }
  assert.match(routeMap, /resource === 'calls'.*Call Record/);
  assert.match(routeMap, /redirectPath: '\/automations'/);
  assert.match(routeMap, /redirectPath: '\/compliance'/);
});
