import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

test('TradeFlowKit batch controls are bounded, admin-only, replay-safe, and non-destructive', () => {
  const route = readFileSync(resolve(root, 'apps/api/src/routes/tradeflowkit-routes.ts'), 'utf8');
  const service = readFileSync(resolve(root, 'apps/api/src/lib/tradeflowkit-bulk-operations.ts'), 'utf8');
  const operations = readFileSync(resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitOperations.tsx'), 'utf8');
  const trash = readFileSync(resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitTrash.tsx'), 'utf8');
  const revenue = readFileSync(resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'), 'utf8');
  const api = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');
  const adr = readFileSync(resolve(root, 'docs/adr/ADR-0029-tradeflowkit-bounded-bulk-operations.md'), 'utf8');

  for (const path of [
    '/v1/modules/tradeflowkit/jobs/bulk-status',
    '/v1/modules/tradeflowkit/trash/jobs/bulk-restore',
    '/v1/modules/tradeflowkit/trash/invoices/bulk-restore',
    '/v1/modules/tradeflowkit/invoices/bulk-mark-paid',
  ]) {
    assert.match(route, new RegExp(`app\\.post\\('${path.replaceAll('/', '\\/')}', \\{ preHandler: \\[\\.\\.\\.adminGuards\\] \\}`));
  }
  assert.match(route, /TRADEFLOWKIT_BULK_LIMIT/);
  assert.match(route, /bulkIdempotencyKey/);
  assert.match(service, /export const TRADEFLOWKIT_BULK_LIMIT = 25/);
  assert.match(service, /beginIdempotentOperation/);
  assert.match(service, /completeIdempotentOperation/);
  assert.match(service, /\.for\('update'\)/);
  assert.match(service, /eq\(tradeflowkitJobs\.tenantId, context\.tenantId\)/);
  assert.match(service, /eq\(tradeflowkitInvoices\.tenantId, context\.tenantId\)/);
  assert.match(service, /tradeflowkitPayments/);
  assert.match(service, /amountCents: invoice\.balanceCents/);
  assert.doesNotMatch(route, /jobs\/bulk-delete|invoices\/bulk-delete/);

  assert.match(operations, /data-testid="tradeflowkit-job-bulk-actions"/);
  assert.match(trash, /data-testid=\{`tradeflowkit-\$\{kind\}-bulk-restore`\}/);
  assert.match(revenue, /data-testid="tradeflowkit-invoice-bulk-payment"/);
  assert.match(api, /bulkJobStatus:/);
  assert.match(api, /bulkRestoreJobs:/);
  assert.match(api, /bulkRestoreInvoices:/);
  assert.match(api, /bulkMarkInvoicesPaid:/);
  assert.match(adr, /Permanent purge, bulk delete, and archive-by-batch remain excluded/);
});
