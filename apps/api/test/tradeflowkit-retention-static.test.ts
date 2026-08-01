import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

test('TradeFlowKit retention is bounded, restore-only, tenant-scoped, and exposed through complete UI states', () => {
  const route = readFileSync(resolve(root, 'apps/api/src/routes/tradeflowkit-routes.ts'), 'utf8');
  const customerArchive = readFileSync(resolve(root, 'apps/api/src/routes/module-shell-routes.ts'), 'utf8');
  const component = readFileSync(resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitTrash.tsx'), 'utf8');
  const shell = readFileSync(resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'), 'utf8');
  const routeMap = readFileSync(resolve(root, 'apps/web/src/app/modules/[slug]/[...path]/route-map.ts'), 'utf8');
  const api = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');
  const ledger = readFileSync(resolve(root, 'scripts/tradeflowkit-phase16-ledger.mjs'), 'utf8');

  assert.match(route, /app\.get\('\/v1\/modules\/tradeflowkit\/trash', \{ preHandler: \[\.\.\.readGuards\] \}/);
  for (const entity of ['customers', 'jobs', 'invoices']) {
    assert.match(route, new RegExp(`app\\.post\\('\\/v1\\/modules\\/tradeflowkit\\/trash\\/${entity}\\/:id\\/restore', \\{ preHandler: \\[\\.\\.\\.writeGuards\\] \\}`));
  }
  assert.doesNotMatch(route, /app\.delete\('\/v1\/modules\/tradeflowkit\/trash/);
  assert.match(route, /limit\(limit \+ 1\)/);
  assert.match(route, /isNotNull\(tradeflowkitCustomers\.deletedAt\)/);
  assert.match(route, /isNotNull\(tradeflowkitJobs\.deletedAt\)/);
  assert.match(route, /isNotNull\(tradeflowkitInvoices\.deletedAt\)/);
  assert.match(route, /tradeflowkit:customer:/);
  assert.match(route, /tradeflowkit:job:/);
  assert.match(customerArchive, /tradeflowkit:customer:/);

  assert.match(shell, /<TradeFlowKitTrash/);
  assert.match(component, /data-testid="tradeflowkit-trash"/);
  assert.match(component, /data-testid="tradeflowkit-trash-error"/);
  assert.match(component, /data-testid="tradeflowkit-trash-empty"/);
  assert.match(component, /data-testid="tradeflowkit-trash-groups"/);
  assert.match(component, /Permanent purge remains disabled/);
  assert.match(component, /@media\(max-width:620px\)/);
  assert.doesNotMatch(component, /permanent delete|purge now|mock data|coming soon|\bTODO\b/i);
  assert.match(routeMap, /'\/trash': \{ sectionId: 'tradeflowkit-trash'/);
  assert.match(api, /trash: \(\): Promise<TradeFlowKitTrashResponse>/);
  assert.match(api, /restoreCustomer:/);
  assert.match(api, /restoreJob:/);
  assert.match(api, /restoreInvoice:/);
  assert.match(ledger, /upperMethod === 'DELETE' \? RETIRED_SECURITY : ACTIVE/);
});
