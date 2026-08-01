import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('TradeFlowKit accounting exports are wired through API, UI, safety controls, and the parity ledger', async () => {
  const [formats, routes, ui, ledgerText] = await Promise.all([
    read('apps/api/src/lib/tradeflowkit-accounting-exports.ts'),
    read('apps/api/src/routes/tradeflowkit-routes.ts'),
    read('apps/web/src/components/module-shells/TradeFlowKitOperations.tsx'),
    read('docs/modules/tradeflowkit/PHASE16_SOURCE_LEDGER.json'),
  ]);
  const canonicalRoutes = [
    '/v1/modules/tradeflowkit/exports/quickbooks.iif',
    '/v1/modules/tradeflowkit/exports/quickbooks/invoices.csv',
    '/v1/modules/tradeflowkit/exports/xero/customers.csv',
    '/v1/modules/tradeflowkit/exports/xero/invoices.csv',
    '/v1/modules/tradeflowkit/exports/xero/payments.csv',
  ];
  for (const route of canonicalRoutes) assert.ok(routes.includes(route), `missing API route ${route}`);
  for (const route of canonicalRoutes.map(route => route.replace('/v1', '/api'))) {
    assert.ok(ui.includes(route), `missing browser export link ${route}`);
  }
  assert.match(routes, /ACCOUNTING_EXPORT_LIMIT_EXCEEDED/);
  assert.match(routes, /X-TradeFlowKit-Accounting-Export-Version/);
  assert.match(routes, /eq\(tradeflowkitInvoices\.tenantId, tenant\)/);
  assert.match(routes, /eq\(tradeflowkitPayments\.status, 'succeeded'\)/);
  assert.match(formats, /neutralizeSpreadsheetFormula/);
  assert.match(formats, /Sales Tax Payable/);
  assert.match(ui, /data-testid="tradeflowkit-accounting-exports"/);

  const ledger = JSON.parse(ledgerText) as { inventory: { apiRoutes: Array<{ key: string; disposition: string }> } };
  const sourceKeys = [
    'GET /api/exports/quickbooks/iif',
    'GET /api/exports/xero/customers.csv',
    'GET /api/exports/xero/invoices.csv',
    'GET /api/exports/xero/payments.csv',
    'GET /api/invoices/export/quickbooks',
  ];
  for (const key of sourceKeys) {
    const item = ledger.inventory.apiRoutes.find(candidate => candidate.key === key);
    assert.equal(item?.disposition, 'active', `ledger did not activate ${key}`);
  }
});
