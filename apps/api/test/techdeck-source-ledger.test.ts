import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ledger = JSON.parse(readFileSync(resolve(repoRoot, 'docs/modules/techdeck/SOURCE_LEDGER.json'), 'utf8')) as {
  moduleSlug: string;
  source: { commit: string; worktreeDirty: boolean; trackedFileCount: number };
  inventory: Record<string, Array<{
    key: string;
    disposition: string;
    targetPointers: string[];
    evidence: string[];
  }>>;
  relevantFileHashes: Array<{ path: string; sha256: string }>;
};

const expectedCommit = '8125f8d89d8d39d60a50c8061a26133a0c917792';
const allowed = new Set([
  'active',
  'shared_replacement',
  'retired_security',
  'retired_product_boundary',
  'restoration_gap',
]);

function item(collection: string, key: string) {
  const found = ledger.inventory[collection]?.find(candidate => candidate.key === key);
  assert.ok(found, `missing ${collection} inventory item ${key}`);
  return found;
}

test('TechDeck executable source ledger is commit-pinned, complete, and has zero restoration gaps', () => {
  assert.equal(ledger.moduleSlug, 'techdeck');
  assert.equal(ledger.source.commit, expectedCommit);
  assert.equal(ledger.source.worktreeDirty, false);
  assert.equal(ledger.source.trackedFileCount, 423);
  assert.equal(ledger.inventory.pages.length, 65);
  assert.equal(ledger.inventory.apiRoutes.length, 221);
  assert.equal(ledger.inventory.tables.length, 45);
  assert.equal(ledger.inventory.providers.length, 46);
  assert.equal(ledger.inventory.backgroundProcesses.length, 5);

  const all = Object.values(ledger.inventory).flat();
  assert.equal(all.length, 382);
  assert.equal(all.filter(candidate => !allowed.has(candidate.disposition)).length, 0);
  assert.equal(all.filter(candidate => candidate.disposition === 'restoration_gap').length, 0);
  for (const candidate of all) {
    assert.ok(candidate.targetPointers.length > 0, `${candidate.key} is missing a target or boundary pointer`);
    for (const pointer of [...candidate.targetPointers, ...candidate.evidence]) {
      assert.ok(existsSync(resolve(repoRoot, pointer)), `${candidate.key} points to missing ${pointer}`);
    }
  }
  assert.ok(ledger.relevantFileHashes.length >= 20);
  for (const entry of ledger.relevantFileHashes) assert.match(entry.sha256, /^[0-9a-f]{64}$/);
});

test('TechDeck source capabilities resolve to active, shared, or explicit retired boundaries', () => {
  assert.equal(item('pages', '/assets').disposition, 'active');
  assert.equal(item('pages', '/clients/:id').disposition, 'shared_replacement');
  assert.equal(item('pages', '/login').disposition, 'retired_security');
  assert.equal(item('pages', '/secure-intake').disposition, 'retired_product_boundary');

  assert.equal(item('apiRoutes', 'POST /api/tickets').disposition, 'active');
  assert.equal(item('apiRoutes', 'POST /api/ops/attachments').disposition, 'shared_replacement');
  assert.equal(item('apiRoutes', 'POST /api/generate-image').disposition, 'retired_security');
  assert.equal(item('apiRoutes', 'POST /api/public/intake/:token/upload').disposition, 'retired_product_boundary');

  assert.equal(item('tables', 'configuration_items').disposition, 'active');
  assert.equal(item('tables', 'clients').disposition, 'shared_replacement');
  assert.equal(item('tables', 'tenant_members').disposition, 'retired_security');
  assert.equal(item('tables', 'webhook_endpoints').disposition, 'retired_product_boundary');

  assert.equal(item('providers', 'DATABASE_URL').disposition, 'shared_replacement');
  assert.equal(item('providers', 'MODULE_SSO_SECRET').disposition, 'retired_security');
  assert.equal(item('backgroundProcesses', 'process-health-sampler').disposition, 'shared_replacement');
  assert.equal(item('backgroundProcesses', 'outbound-webhook-worker').disposition, 'retired_product_boundary');
});

test('TechDeck source ledger verifier is exposed as a root command', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  assert.equal(packageJson.scripts?.['verify:techdeck:source'], 'node scripts/techdeck-source-ledger.mjs');
});
