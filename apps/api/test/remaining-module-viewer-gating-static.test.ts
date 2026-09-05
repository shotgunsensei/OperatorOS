import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('BrandForgeOS, FaultlineLab, and TorqueShed cannot widen a tenant viewer role', () => {
  const brandShell = read('apps/web/src/components/module-shells/BrandForgeRouteShell.tsx');
  const brandWorkspace = read('apps/web/src/components/module-shells/BrandForgeWorkspace.tsx');
  const faultlineShell = read('apps/web/src/components/module-shells/FaultlineLabShell.tsx');
  const faultlineWorkspace = read('apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx');
  const torque = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');

  for (const source of [brandShell, faultlineShell, torque]) {
    assert.match(source, /activeRole !== 'viewer' && \(moduleAccessLevel/);
  }

  assert.match(brandShell, /const canAdminModule = canWriteModule &&/);
  assert.match(brandShell, /canWrite=\{canWriteModule\} canAdmin=\{canAdminModule\}/);
  assert.match(brandWorkspace, /data-testid="brandforgeos-read-only"/);
  assert.match(brandWorkspace, /if \(!canWrite\)[\s\S]{0,180}read-only/);
  assert.match(brandWorkspace, /canWrite=\{canWrite\} canAdmin=\{canAdmin\}/);

  assert.match(faultlineShell, /canWrite=\{canWriteModule\}[\s\S]{0,120}canManage=\{canManageModule\}[\s\S]{0,120}canAdmin=\{canAdminModule\}/);
  assert.match(faultlineShell, /const canManageModule = canWriteModule &&/);
  assert.match(faultlineWorkspace, /data-testid="faultlinelab-read-only"/);
  assert.match(faultlineWorkspace, /if \(!canWrite \|\| !session\) return;/);
  assert.match(faultlineWorkspace, /if \(!canAdmin \|\| !draft\) return;/);
  assert.match(faultlineWorkspace, /tab === 'authoring' && canWrite/);

  assert.match(torque, /data-testid="torqueshed-read-only"/);
  assert.match(torque, /const canManageModule = canWriteModule &&/);
  assert.match(torque, /if \(!canWriteModule\)[\s\S]{0,180}read-only/);
  assert.match(torque, /canManageTraining=\{canManageModule\}/);
  assert.match(torque, /<TorqueShedMarketplacePanel[\s\S]{0,160}canWrite=\{canWriteModule\}/);
  assert.match(torque, /<TorqueShedCommunityPanel[\s\S]{0,160}canWrite=\{canWriteModule\} canManage=\{canManageModule\}/);
});

test('legacy CallCommand routes remain read-only for viewers and manager-only for publishing', () => {
  const shell = read('apps/web/src/components/module-shells/CallCommandShell.tsx');
  const workspace = read('apps/web/src/components/module-shells/CallCommandWorkspace.tsx');

  assert.match(shell, /canWriteModule=\{canWriteModule\} canManageModule=\{canManageModule\}/);
  assert.match(workspace, /if \(busy \|\| !canWriteModule\) return;/);
  assert.match(workspace, /data-testid="text-callcommand-viewer-access"/);
  assert.match(workspace, /button-callcommand-create-channel" disabled=\{!canWriteModule/);
  assert.match(workspace, /button-callcommand-create-profile" disabled=\{!canWriteModule/);
  assert.match(workspace, /disabled=\{!canManageModule \|\| !!busy\}[\s\S]{0,220}>Publish<\/button>/);
  assert.match(workspace, /button-callcommand-place-test-call"[\s\S]{0,160}disabled=\{!canWriteModule/);
  assert.match(workspace, /<WorkList[\s\S]{0,220}canWrite=\{canWriteModule\}/);
  assert.match(workspace, /function WorkList[\s\S]{0,1200}disabled=\{!canWrite\}/);
});

test('OutCall mirrors server write access while leaving read-only history visible', () => {
  const routes = read('apps/api/src/routes/outcall-routes.ts');
  const shell = read('apps/web/src/components/module-shells/OutCallShell.tsx');
  const workspace = read('apps/web/src/components/module-shells/OutCallWorkspace.tsx');

  assert.match(routes, /const writeGuards = \[\.\.\.readGuards, requireTenantModuleWriteAccess\]/);
  assert.match(shell, /useModuleAccessLevel/);
  assert.match(shell, /activeRole !== 'viewer' && \(moduleAccessLevel/);
  assert.match(shell, /canWrite=\{canWriteModule\}/);
  assert.match(workspace, /canWrite = false/);
  assert.match(workspace, /if \(!canWrite \|\| busy\) return;/);
  assert.match(workspace, /data-testid="outcall-read-only"/);
  assert.match(workspace, /button-outcall-accept-safety"[\s\S]{0,180}disabled=\{!canWrite/);
  assert.match(workspace, /button-outcall-schedule"[\s\S]{0,180}disabled=\{!canWrite/);
  assert.match(workspace, /actionEnabled=\{canWrite\}/);
  assert.match(workspace, /disabled=\{!canWrite \|\| !!busy \|\| !privacyPassword/);
});

test('StudyForge AI, Deploy Ops, and Script Ops keep tenant viewers read-only even with a wider module role', () => {
  const files = [
    'apps/web/src/components/module-shells/StudyForgeRouteShell.tsx',
    'apps/web/src/components/module-shells/NinjaLaunchKitRouteShell.tsx',
    'apps/web/src/components/module-shells/NinjamationRouteShell.tsx',
  ];
  for (const path of files) {
    const source = read(path);
    assert.match(source, /activeRole\s*!==\s*'viewer'\s*&&/u, `${path} must not let module access widen tenant viewer access`);
  }
});
