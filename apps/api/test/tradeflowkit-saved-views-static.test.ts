import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../..', import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), 'utf8');
}

test('TradeFlowKit saved views remain wired through the current release, API, client, UI, and ledger', async () => {
  const [schema, init, contract, release, routes, client, ui, ledger] = await Promise.all([
    source('apps/api/src/schema.ts'),
    source('apps/api/src/lib/tradeflowkit-saved-views-db-init.ts'),
    source('apps/api/src/lib/database-release-contract.ts'),
    source('apps/api/src/lib/database-release.ts'),
    source('apps/api/src/routes/tradeflowkit-routes.ts'),
    source('apps/web/src/lib/auth.ts'),
    source('apps/web/src/components/module-shells/TradeFlowKitOperations.tsx'),
    source('scripts/tradeflowkit-phase16-ledger.mjs'),
  ]);
  assert.match(schema, /pgTable\('tradeflowkit_saved_views'/);
  assert.match(init, /tfk_saved_views_filters_check/);
  assert.match(init, /uq_tfk_saved_views_active_name/);
  assert.match(contract, /releaseVersion: 32/);
  assert.match(contract, /tradeflowkit_saved_views/);
  assert.match(release, /ensureTradeFlowKitSavedViewTables/);
  for (const route of [
    "app.get('/v1/modules/tradeflowkit/saved-views'",
    "app.post('/v1/modules/tradeflowkit/saved-views'",
    "app.delete('/v1/modules/tradeflowkit/saved-views/:id'",
  ]) assert.ok(routes.includes(route), `missing route ${route}`);
  assert.match(routes, /SAVED_VIEW_ADMIN_REQUIRED/);
  assert.match(routes, /pg_advisory_xact_lock/);
  assert.match(routes, /eq\(tradeflowkitSavedViews\.tenantId, tenant\)/);
  assert.match(client, /createSavedView/);
  assert.match(client, /deleteSavedView/);
  assert.match(ui, /data-testid="tradeflowkit-saved-views"/);
  assert.match(ui, /Save these job filters as/);
  assert.doesNotMatch(ledger, /if \(path\.startsWith\('\/api\/operations\/saved-views'\)\) \{\s*return outcome\(GAP/);
  assert.doesNotMatch(ledger, /if \(name === 'saved_views'\) \{\s*return outcome\(GAP/);
});
