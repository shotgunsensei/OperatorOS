import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

test('TradeFlowKit global search is real, bounded, tenant-scoped, and wired to canonical deep links', () => {
  const route = readFileSync(resolve(root, 'apps/api/src/routes/tradeflowkit-routes.ts'), 'utf8');
  const component = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitGlobalSearch.tsx'),
    'utf8',
  );
  const shell = readFileSync(
    resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'),
    'utf8',
  );
  const recordSurfaces = [
    'TradeFlowKitLeadCenter.tsx', 'TradeFlowKitOperations.tsx', 'TradeFlowKitRevenueFlow.tsx',
  ].map(file => readFileSync(resolve(root, 'apps/web/src/components/module-shells', file), 'utf8')).join('\n');
  const api = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');
  const ledger = readFileSync(resolve(root, 'scripts/tradeflowkit-phase16-ledger.mjs'), 'utf8');

  assert.match(route, /\/v1\/modules\/tradeflowkit\/search/);
  assert.match(route, /preHandler: \[\.\.\.readGuards\]/);
  assert.match(route, /stringValue\(raw\.q, 'q', 100\)/);
  assert.match(route, /const limit = 5/);
  for (const table of [
    'tradeflowkitLeads', 'tradeflowkitCustomers', 'tradeflowkitJobs', 'tradeflowkitTasks',
    'directoryOrganizations', 'directoryContacts', 'tradeflowkitQuotes', 'tradeflowkitInvoices',
  ]) {
    assert.match(route, new RegExp(`eq\\(${table}\\.tenantId, tenant\\)`), `${table} needs a trusted tenant predicate`);
  }
  assert.match(route, /query\.replace\(\/\[\\\\%_\]\/g/);

  assert.match(shell, /<TradeFlowKitGlobalSearch/);
  assert.match(component, /data-testid="tradeflowkit-global-search"/);
  assert.match(component, /data-testid="tradeflowkit-global-search-input"/);
  assert.match(component, /data-testid="tradeflowkit-global-search-submit"/);
  assert.match(component, /data-testid="tradeflowkit-global-search-error"/);
  assert.match(component, /data-testid="tradeflowkit-global-search-empty"/);
  assert.match(component, /data-testid="tradeflowkit-global-search-results"/);
  assert.match(component, /@media \(max-width: 620px\)/);
  assert.match(component, /href: `\/leads\/\$\{row\.id\}`/);
  assert.match(component, /href: `\/jobs\/\$\{row\.id\}`/);
  assert.match(component, /href: `\/tasks\/\$\{row\.id\}`/);
  assert.match(component, /href: `\/clients\/\$\{row\.id\}`/);
  assert.match(component, /href: `\/quotes\/\$\{row\.id\}`/);
  assert.match(component, /href: `\/invoices\/\$\{row\.id\}`/);
  assert.doesNotMatch(component, /href: [`']\/modules\/tradeflowkit\//);
  assert.doesNotMatch(recordSurfaces, /href=\{`\/modules\/tradeflowkit\//);
  assert.match(api, /search: \(query: string\): Promise<TradeFlowKitSearchResponse>/);
  assert.match(api, /\/modules\/tradeflowkit\/search\?q=/);
  assert.match(ledger, /ACTIVE,[\s\S]*?'global_search'/);
  assert.doesNotMatch(component, /mock data|coming soon|\bTODO\b/i);
});
