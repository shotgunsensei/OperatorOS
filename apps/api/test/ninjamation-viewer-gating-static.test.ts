import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const routeShell = read('../../web/src/components/module-shells/NinjamationRouteShell.tsx');
const workspace = read('../../web/src/components/module-shells/NinjamationShell.tsx');

test('Script Ops derives contributor and administrator capability from the selected module access', () => {
  assert.match(routeShell, /const canWriteModule =/);
  assert.match(routeShell, /const canManageModule = canWriteModule &&/);
  assert.match(routeShell, /canWrite=\{canWriteModule\}/);
  assert.match(routeShell, /canManage=\{canManageModule\}/);
  assert.match(routeShell, /Read-only library access/);
});

test('Script Ops viewers can inspect approved content without receiving record mutation controls', () => {
  assert.match(workspace, /data-testid="ninjamation-read-only"/);
  assert.match(workspace, /if \(!canWrite \|\| !detail \|\| busy\) return;/);
  assert.match(workspace, /disabled=\{!canWrite \|\| Boolean\(busy\)\}/);
  assert.match(workspace, /disabled=\{!canManage \|\| busy === 'sync'\}/);
  assert.match(workspace, /data-testid="ninjamation-generation-read-only"/);
  assert.match(workspace, /if \(!canWrite \|\| busy\) return;/);
});

test('Script Ops keeps approval, retirement, synchronization, and administration manager-only', () => {
  assert.match(workspace, /const permitted = action === 'review' \? canWrite : canManage/);
  assert.match(workspace, /canManage && detail\.script\.status === 'review'/);
  assert.match(workspace, /canManage && detail\.script\.status !== 'retired'/);
  assert.match(workspace, /if \(!canManage \|\| busy\) return;/);
  assert.match(workspace, /title="Administrator access required"/);
  assert.match(workspace, /active === 'admin' && canManage && !admin/);
});
