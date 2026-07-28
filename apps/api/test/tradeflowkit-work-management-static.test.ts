import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

test('TradeFlowKit work-management UI calls real APIs, exposes states, and disables viewer mutations', () => {
  const component = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitWorkManagement.tsx'),
    'utf8',
  );
  const shell = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'),
    'utf8',
  );
  const api = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');

  assert.match(shell, /<TradeFlowKitWorkManagement/);
  assert.match(shell, /canManage=\{canManageModule\}/);
  assert.match(component, /data-testid="tradeflowkit-work-management"/);
  assert.match(component, /data-testid="tradeflowkit-work-management-loading"/);
  assert.match(component, /data-testid="tradeflowkit-work-management-error"/);
  assert.match(component, /No workflows yet/);
  assert.match(component, /No job tasks match this view/);
  assert.match(component, /createWorkflow/);
  assert.match(component, /addWorkflowStage/);
  assert.match(component, /updateWorkflow/);
  assert.match(component, /archiveWorkflow/);
  assert.match(component, /transitionJobWorkflow/);
  assert.match(component, /updateTask/);
  assert.match(component, /archiveTask/);
  assert.equal((component.match(/disabled=\{!canManage \|\| pending/g) ?? []).length, 2);
  assert.match(api, /\/tradeflowkit\/workflows/);
  assert.match(api, /\/workflow-transition/);
  assert.match(api, /\/tradeflowkit\/activity/);
  assert.doesNotMatch(component, /coming soon|mock data/i);
  assert.doesNotMatch(component, /\bTODO\b/);
});
