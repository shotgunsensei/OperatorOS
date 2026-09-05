import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('module summaries expose the server-resolved module role to the selected application', () => {
  const service = read('apps/api/src/lib/entitlement-service.ts');
  const appPage = read('apps/web/src/app/apps/[slug]/page.tsx');
  const context = read('apps/web/src/components/ModuleAccessContext.tsx');

  assert.match(service, /module_access_level:\s*TenantModuleAccessLevel/);
  assert.ok((service.match(/module_access_level:\s*access\.accessLevel/g) ?? []).length >= 2);
  assert.match(appPage, /module_access_level:\s*ModuleAccessLevel/);
  assert.match(appPage, /setModuleAccessLevel\(summary\.module_access_level\)/);
  assert.match(appPage, /<ModuleAccessProvider accessLevel=\{moduleAccessLevel\}>/);
  assert.match(context, /'none' \| 'viewer' \| 'user' \| 'manager'/);
});

test('every writable module shell consumes module-specific access instead of trusting a global tenant role alone', () => {
  const shells = [
    'BrandForgeRouteShell.tsx',
    'CallCommandShell.tsx',
    'FaultlineLabShell.tsx',
    'NinjaLaunchKitRouteShell.tsx',
    'NinjamationRouteShell.tsx',
    'NinjaPoolHallRouteShell.tsx',
    'PulseDeskShell.tsx',
    'SnapProofShell.tsx',
    'StudyForgeRouteShell.tsx',
    'OutCallShell.tsx',
    'TechDeckShell.tsx',
    'TorqueShedWorkspace.tsx',
    'TradeFlowKitShell.tsx',
  ];

  for (const shell of shells) {
    const source = read(`apps/web/src/components/module-shells/${shell}`);
    assert.match(source, /useModuleAccessLevel/, `${shell} must consume the selected module role`);
    assert.match(source, /moduleAccessLevel/, `${shell} must apply the selected module role`);
  }
});

test('customer workspaces split ordinary edits from manager-only controls and keep viewers read-only', () => {
  const pulseShell = read('apps/web/src/components/module-shells/PulseDeskShell.tsx');
  const pulseWorkspace = read('apps/web/src/components/module-shells/PulseDeskServiceDeskWorkspace.tsx');
  const callShell = read('apps/web/src/components/module-shells/CallCommandShell.tsx');
  const callMsp = read('apps/web/src/components/module-shells/CallCommandMspWorkspace.tsx');
  const tradeShell = read('apps/web/src/components/module-shells/TradeFlowKitShell.tsx');
  const tradeOperations = read('apps/web/src/components/module-shells/TradeFlowKitOperations.tsx');
  const poolRoute = read('apps/web/src/components/module-shells/NinjaPoolHallRouteShell.tsx');
  const poolOnline = read('apps/web/src/components/module-shells/NinjaPoolHallOnline.tsx');

  for (const source of [pulseShell, callShell, tradeShell]) {
    assert.match(source, /const canWriteModule =/);
    assert.match(source, /const canManageModule = canWriteModule &&/);
  }
  assert.match(pulseWorkspace, /data-testid="pulsedesk-service-read-only"/);
  assert.match(pulseWorkspace, /canWriteModule && preferences/);
  assert.match(callMsp, /data-testid="callcommand-read-only"/);
  assert.match(callMsp, /view === 'settings' && canManage/);
  assert.match(tradeOperations, /data-testid="tradeflowkit-operations-read-only"/);
  assert.match(tradeOperations, /disabled=\{!canWrite\}/);
  assert.match(poolRoute, /<Workspace[\s\S]*canWrite=\{canWrite\}/);
  assert.match(poolOnline, /disabled=\{!canWrite \|\| joinCode\.length !== 4\}/);
});

test('shared shell badge reports workspace availability without claiming a live provider', () => {
  const chrome = read('apps/web/src/components/module-shells/ShellChrome.tsx');
  assert.match(chrome, /ShellWorkspaceBadge/);
  assert.match(chrome, /Workspace available/);
  assert.match(chrome, /badgeStyles\.neutral/);
  assert.doesNotMatch(chrome, /badge-shell-live|>\s*Live\s*</);
});
