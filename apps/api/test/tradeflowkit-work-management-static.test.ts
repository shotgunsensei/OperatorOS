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

test('TradeFlowKit retention UI exposes ordered soft restore without permanent purge controls', () => {
  const component = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitRetention.tsx'),
    'utf8',
  );
  const shell = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'),
    'utf8',
  );
  const api = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');

  assert.match(shell, /<TradeFlowKitRetention/);
  assert.match(shell, /tradeflowkit-sidebar-retention/);
  assert.match(component, /data-testid="tradeflowkit-retention"/);
  assert.match(component, /data-testid="tradeflowkit-retention-loading"/);
  assert.match(component, /data-testid="tradeflowkit-retention-empty"/);
  assert.match(component, /restoreBlockedReason/);
  assert.match(component, /permanent-delete or bulk-destructive action/);
  assert.match(api, /restoreRetained/);
  assert.doesNotMatch(component, /moduleShellApi\.[^\n]*(?:delete|purge)|<button[^>]*>[^<]*(?:delete|purge)/i);
});

test('TradeFlowKit global search is wired to active tenant records and canonical deep links', () => {
  const component = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitGlobalSearch.tsx'),
    'utf8',
  );
  const shell = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'),
    'utf8',
  );
  const routes = readFileSync(
    resolve(root, 'apps/api/src/routes/tradeflowkit-routes.ts'),
    'utf8',
  );

  assert.match(shell, /<TradeFlowKitGlobalSearch/);
  assert.match(component, /data-testid="tradeflowkit-global-search"/);
  assert.match(component, /tradeflowkit-global-search-empty/);
  assert.match(component, /data-testid="tradeflowkit-saved-views"/);
  assert.match(component, /createSavedView/);
  assert.match(component, /archiveSavedView/);
  assert.match(component, /item\.href/);
  assert.match(routes, /\/v1\/modules\/tradeflowkit\/search/);
  assert.match(routes, /\/v1\/modules\/tradeflowkit\/saved-views/);
  assert.match(routes, /eq\(tradeflowkitCustomers\.tenantId, tenant\)/);
  assert.match(routes, /isNull\(tradeflowkitTasks\.deletedAt\)/);
});
