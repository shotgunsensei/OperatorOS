import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('release v31 owns additive tenant-scoped lead-operations tables', () => {
  const contract = read('apps/api/src/lib/database-release-contract.ts');
  const release = read('apps/api/src/lib/database-release.ts');
  const schema = read('apps/api/src/schema.ts');
  const ddl = read('apps/api/src/lib/tradeflowkit-lead-operations-db-init.ts');
  assert.match(contract, /releaseVersion: 31/);
  assert.match(contract, /tradeflowkit_lead_operations/);
  assert.match(release, /ensureTradeFlowKitLeadOperationsTables/);
  for (const table of [
    'tradeflowkit_lead_settings',
    'tradeflowkit_lead_capture_forms',
    'tradeflowkit_lead_followups',
    'tradeflowkit_lead_source_events',
  ]) {
    assert.match(schema, new RegExp(table));
    assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(release, new RegExp(table));
  }
  assert.match(ddl, /FOREIGN KEY \(tenant_id, lead_id\)/);
  assert.match(ddl, /public_intake_enabled = FALSE/);
  assert.match(ddl, /auto_respond = FALSE/);
  assert.match(ddl, /pg_column_size\(metadata\) <= 4096/);
});

test('lead operations use server authority, shared delivery, versions, and sanitized source validation', () => {
  const routes = read('apps/api/src/routes/tradeflowkit-lead-operations-routes.ts');
  const moduleRoutes = read('apps/api/src/routes/module-shell-routes.ts');
  const service = read('apps/api/src/lib/tradeflowkit-lead-operations.ts');
  for (const route of [
    'leads/settings',
    'leads/settings/apply-template',
    'leads/source-adapters',
    'leads/source-events',
    'leads/:id/followups',
    'leads/test-message',
  ]) assert.match(routes, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(routes, /preHandler: \[\.\.\.adminGuards\]/);
  assert.match(routes, /preHandler: \[\.\.\.readGuards\]/);
  assert.match(routes, /preHandler: \[\.\.\.writeGuards\]/);
  assert.match(routes, /enqueueOutboxMessage/);
  assert.match(routes, /beginIdempotentOperation/);
  assert.match(routes, /parseTradeFlowKitLeadCreate\(sample\)/);
  assert.match(routes, /acceptedFields: Object\.keys\(sample\)\.sort\(\)/);
  assert.match(routes, /destination: actorUser\.email/);
  assert.match(routes, /onlyFields\(body, \['channel', 'confirmDelivery', 'expectedVersion'\]\)/);
  assert.doesNotMatch(routes, /app\.post\('\/v1\/modules\/tradeflowkit\/leads\/public/);
  assert.match(moduleRoutes, /scheduleTradeFlowKitLeadFollowups/);
  assert.match(service, /TRADEFLOWKIT_LEAD_TEMPLATES/);
  assert.equal((service.match(/template\('/g) ?? []).length >= 7, true);
});

test('Lead Conversion Center exposes working setup, follow-up, validation, and delivery controls', () => {
  const center = read('apps/web/src/components/module-shells/TradeFlowKitLeadCenter.tsx');
  const operations = read('apps/web/src/components/module-shells/TradeFlowKitLeadOperations.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  assert.match(center, /Lead Conversion Center/);
  assert.match(center, /TradeFlowKitLeadOperations/);
  for (const marker of [
    'tradeflowkit-lead-operations',
    'tradeflowkit-lead-template',
    'tradeflowkit-lead-settings-save',
    'tradeflowkit-followup-lead-select',
    'tradeflowkit-lead-test-email',
  ]) assert.match(operations, new RegExp(marker));
  assert.match(operations, /Anonymous intake remains off/);
  assert.match(operations, /No lead was created and no sample values were retained/);
  for (const method of [
    'leadOperationsSettings',
    'updateLeadOperationsSettings',
    'applyLeadOperationsTemplate',
    'validateLeadSourceAdapter',
    'leadSourceEvents',
    'leadFollowups',
    'queueLeadFollowup',
    'completeLeadFollowup',
    'testLeadOperationsEmail',
  ]) assert.match(client, new RegExp(method));
});

test('executable Phase 16 ledger closes eleven lead-operation gaps without reclassifying public ingress', () => {
  const ledger = JSON.parse(read('docs/modules/tradeflowkit/PHASE16_SOURCE_LEDGER.json')) as {
    inventory: Record<string, Array<{ key: string; disposition: string }>>;
  };
  const rows = Object.values(ledger.inventory).flat();
  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.disposition] = (result[row.disposition] ?? 0) + 1;
    return result;
  }, {});
  assert.equal(counts.active, 135);
  assert.equal(counts.phase16_gap, 23);
  for (const key of [
    'GET /api/leads/:id/followups',
    'GET /api/leads/settings',
    'GET /api/leads/source-adapters',
    'GET /api/leads/source-events',
    'PATCH /api/leads/settings',
    'POST /api/leads/settings/apply-template',
    'POST /api/leads/test-message',
    'lead_capture_forms',
    'lead_followup_tasks',
    'lead_settings',
    'lead_source_events',
  ]) assert.equal(rows.find(row => row.key === key)?.disposition, 'active', key);
  for (const key of [
    'PATCH /api/leads/capture-form/:id',
    'POST /api/public/lead-capture/:publicToken',
    'POST /api/public/lead-source/:publicToken/:adapterKey',
  ]) assert.equal(rows.find(row => row.key === key)?.disposition, 'phase16_gap', key);
});
