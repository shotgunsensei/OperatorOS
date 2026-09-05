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
  assert.match(component, /data-testid="tradeflowkit-status-action-guidance"/);
  assert.match(component, /Status actions only update your organization&(?:apos;|#39;)s revenue record/);
  assert.match(component, /They do not email or deliver a document/);
  assert.match(component, /label="Mark as sent"/);
  assert.match(component, /label="Record customer acceptance"/);
  assert.match(component, /label="Record customer decline"/);
  assert.match(component, /label="Mark invoice as sent"/);
  assert.match(component, /It does not email or deliver the quote/);
  assert.match(component, /does not contact the customer or independently prove acceptance/);
  assert.match(component, /does not contact the customer or independently prove a decline/);
  assert.match(component, /It does not email or deliver the invoice/);
  assert.doesNotMatch(component, /label="Send"/);
  assert.doesNotMatch(component, /label="Accept"/);
  assert.doesNotMatch(component, /label="Decline"/);
  assert.doesNotMatch(component, /label="Send invoice"/);
  assert.match(api, /\/tradeflowkit\/quotes\/\$\{encodeURIComponent\(id\)\}\/job/);
  assert.match(api, /method: 'PATCH'/);
  assert.match(api, /method: 'DELETE'/);
  assert.doesNotMatch(component, /coming soon|mock data|fake counter/i);
  assert.doesNotMatch(component, /\bTODO\b/);
});

test('TradeFlowKit customer CSV import is bounded, replay protected, and wired to the real API', () => {
  const component = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'),
    'utf8',
  );
  const api = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');
  const server = readFileSync(resolve(root, 'apps/api/src/routes/module-shell-routes.ts'), 'utf8');

  assert.match(component, /data-testid="tradeflowkit-customer-import"/);
  assert.match(component, /file\.size > 256 \* 1024/);
  assert.match(component, /records\.length - 1 > 100/);
  assert.match(component, /contains data outside the declared columns/);
  assert.match(component, /parseCustomerCsv\(await file\.text\(\)\)/);
  assert.match(component, /customer-import:\$\{crypto\.randomUUID\(\)\}/);
  assert.match(api, /importCustomers:/);
  assert.match(api, /'Idempotency-Key': idempotencyKey/);
  assert.match(api, /JSON\.stringify\(\{ customers \}\)/);
  assert.match(server, /\/v1\/modules\/tradeflowkit\/customers\/import/);
  assert.match(server, /pg_advisory_xact_lock/);
  assert.match(server, /beginIdempotentOperation/);
  assert.match(server, /scope: 'tradeflowkit-customer-import'/);
  assert.match(server, /completeIdempotentOperation/);
  assert.match(server, /customers: importedCustomers\.map\(customer => \(\{ id: customer\.id \}\)\)/);
  assert.match(server, /IDEMPOTENCY_KEY_REUSE/);
  assert.match(server, /deduplicateOrganization: true/);
  assert.match(component, /customerImportResult\.errors\.slice\(0, 3\)/);
  assert.doesNotMatch(component, /FormData|multipart/);
});

test('TradeFlowKit job and invoice CSV imports use the same bounded server-authoritative workflow', () => {
  const component = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'),
    'utf8',
  );
  const api = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');
  const server = readFileSync(resolve(root, 'apps/api/src/routes/module-shell-routes.ts'), 'utf8');
  const validation = readFileSync(resolve(root, 'apps/api/src/lib/tradeflowkit-revenue.ts'), 'utf8');

  assert.match(component, /data-testid="tradeflowkit-job-import"/);
  assert.match(component, /data-testid="tradeflowkit-invoice-import"/);
  assert.match(component, /parseJobCsv\(await file\.text\(\)\)/);
  assert.match(component, /parseInvoiceCsv\(await file\.text\(\)\)/);
  assert.match(component, /Imports cannot mark an invoice paid; payments must be recorded in its payment history/);
  assert.match(component, /records\.length - 1 > 100/);
  assert.match(api, /importJobs:/);
  assert.match(api, /JSON\.stringify\(\{ jobs \}\)/);
  assert.match(api, /importInvoices:/);
  assert.match(api, /JSON\.stringify\(\{ invoices \}\)/);
  assert.match(server, /\/v1\/modules\/tradeflowkit\/jobs\/import/);
  assert.match(server, /\/v1\/modules\/tradeflowkit\/invoices\/import/);
  assert.match(server, /scope: 'tradeflowkit-job-import'/);
  assert.match(server, /scope: 'tradeflowkit-invoice-import'/);
  assert.match(server, /pg_advisory_xact_lock/);
  assert.match(server, /sourceId = tradeFlowKitRecordImportSourceId/);
  assert.match(server, /calculateDocumentTotals/);
  assert.match(validation, /body\.jobs\.length > 100/);
  assert.match(validation, /body\.invoices\.length > 100/);
  assert.match(validation, /const INVOICE_IMPORT_STATUSES = new Set\(\['draft', 'sent', 'void'\]\)/);
  assert.doesNotMatch(component, /FormData|multipart/);
});
