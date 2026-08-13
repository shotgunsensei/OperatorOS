import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const route = read('../src/routes/ninjamation-phase36-routes.ts');
const sync = read('../src/lib/ninjamation-sync.ts');
const catalog = read('../src/lib/ninjamation-phase36.ts');
const schema = read('../src/lib/ninjamation-phase36-db-init.ts');
const shell = read('../../web/src/components/module-shells/NinjamationShell.tsx');
const publicPage = read('../../web/src/app/public/ninjamation/[page]/page.tsx');
const middleware = read('../../web/src/middleware.ts');
const routeMap = read('../../web/src/app/modules/[slug]/[...path]/route-map.ts');
const release = read('../src/lib/database-release-contract.ts');

test('Phase 36 exposes complete tenant-scoped library, ownership, generation, sync, account, and admin contracts', () => {
  for (const contract of [
    '/workspace','/scripts','/scripts/:id','/scripts/:id/favorite','/scripts/:id/download',
    '/generations','/sync-runs','/sync-runs/:id/retry','/account','/admin','/admin/sync-schedule',
  ]) assert.match(route, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(route, /requireTenantModuleAccess/);
  assert.match(route, /requireTenantModuleWriteAccess/);
  assert.match(route, /requireTenantAdmin/);
  assert.match(route, /resolveNinjamationAccess/);
  assert.match(route, /recordUsageEvent/);
  assert.match(route, /completeIdempotentOperation/);
});

test('Phase 36 GitHub sync is fixed-source, commit-provenanced, incremental, and non-destructive', () => {
  assert.match(catalog, /shotgunsensei\/AutomationPacks/);
  assert.match(catalog, /ca0e55fd086f6751a43964927166bfa69db012b6/);
  assert.match(catalog, /redirect: 'error'/);
  assert.match(catalog, /AbortSignal\.timeout/);
  assert.match(sync, /action = wasDeprecated \? 'restored' : 'updated'/);
  assert.match(sync, /deprecation_reason='Missing from the complete allowlisted repository snapshot'/);
  assert.match(sync, /approvalReset: true/);
  assert.doesNotMatch(sync, /DELETE FROM ninjamation_scripts|DROP TABLE|TRUNCATE/i);
});

test('Phase 36 preserves the hard no-execution boundary in API and web processes', () => {
  for (const source of [route, sync, catalog]) {
    assert.doesNotMatch(source, /child_process|execSync|spawnSync|\bexec\s*\(|\bspawn\s*\(/);
  }
  assert.match(route, /executionSupported: false/);
  assert.match(shell, /never executes script source/);
  assert.match(shell, /runner-gateway/);
  assert.match(shell, /No execution claim or command interpolation/);
});

test('Phase 36 release v45 is additive, idempotent-shaped, and contains every new persisted domain', () => {
  for (const table of ['ninjamation_favorites','ninjamation_sync_runs','ninjamation_sync_items','ninjamation_usage_counters']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(schema, /ADD COLUMN IF NOT EXISTS owner_user_id/);
  assert.match(schema, /DROP CONSTRAINT IF EXISTS ninjamation_script_language_check/);
  assert.doesNotMatch(schema, /DROP TABLE|TRUNCATE/i);
  assert.match(release, /releaseVersion: 45/);
  assert.match(release, /ninjamation_complete_product_tables/);
});

test('Phase 36 premium product shell and exact-host routes cover every source page and honest plan state', () => {
  for (const phrase of ['Script Arsenal','AI Forge','GitHub Sync','Account','Admin','AutomationPacks','OperatorOS owns identity']) {
    assert.match(`${shell}\n${publicPage}`, new RegExp(phrase));
  }
  for (const path of ['/library','/generate','/account','/admin','/checkout/success','/checkout/cancel']) {
    assert.match(routeMap, new RegExp(path.replaceAll('/', '\\/')));
  }
  assert.match(middleware, /function ninjamationPublicDestination/);
  assert.match(middleware, /\['home', 'pricing'\]\.includes\(normalized\)/);
  assert.match(middleware, /`\/public\/ninjamation\/\$\{normalized\}`/);
  assert.match(shell, /repeat\(auto-fit,minmax/);
});
