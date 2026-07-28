import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

test('TradeFlowKit revenue UI exposes persistent document mutations and keeps viewer controls read-only', () => {
  const component = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'),
    'utf8',
  );
  const shell = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'),
    'utf8',
  );
  const api = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');

  assert.match(shell, /<TradeFlowKitRevenueFlow/);
  assert.match(shell, /canManage=\{canManageModule\}/);
  assert.match(component, /data-testid="tradeflowkit-document-create-form"/);
  assert.match(component, /data-testid="tradeflowkit-revenue-readonly"/);
  assert.match(component, /data-testid=\{`tradeflowkit-\$\{kind\}-editor`\}/);
  assert.match(component, /Direct invoice/);
  assert.match(component, /updateQuote/);
  assert.match(component, /archiveQuote/);
  assert.match(component, /quoteToJob/);
  assert.match(component, /createInvoice/);
  assert.match(component, /updateInvoice/);
  assert.match(component, /archiveInvoice/);
  assert.match(component, /canManage && quote\.status/);
  assert.match(component, /canManage && invoice\.status/);
  assert.match(api, /\/tradeflowkit\/quotes\/\$\{encodeURIComponent\(id\)\}\/job/);
  assert.match(api, /method: 'PATCH'/);
  assert.match(api, /method: 'DELETE'/);
  assert.doesNotMatch(component, /coming soon|mock data|fake counter/i);
  assert.doesNotMatch(component, /\bTODO\b/);
});
