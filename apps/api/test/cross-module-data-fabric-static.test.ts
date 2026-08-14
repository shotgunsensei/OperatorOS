import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root,path),'utf8');

test('Phase 38 registers every named native workflow and never auto-executes scripts', () => {
  const fabric = read('apps/api/src/lib/cross-module-data-fabric.ts');
  const adapters = read('apps/api/src/lib/cross-module-workflow-adapters.ts');
  for (const workflow of [
    'tradeflowkit.job_to_snapproof','snapproof.approved_report_to_tradeflowkit',
    'callcommand.analysis_to_tradeflowkit','callcommand.analysis_to_pulsedesk','callcommand.analysis_to_techdeck',
    'support.resolved_to_faultlinelab','torqueshed.diagnostic_to_snapproof','torqueshed.diagnostic_to_faultlinelab',
    'brandforgeos.campaign_to_launchkit','ninjamation.script_to_techdeck',
  ]) {
    assert.match(fabric,new RegExp(workflow.replaceAll('.','\\.')));
    assert.match(adapters,new RegExp(workflow.replaceAll('.','\\.')));
  }
  assert.match(adapters,/no execution performed/i);
  assert.match(adapters,/executionAllowed:\s*false/);
  assert.doesNotMatch(adapters,/(?:exec|spawn|execFile|fork)\s*\(/);
});

test('Phase 38 persistence is tenant-bound, signed, replayable, and observable', () => {
  const ddl = read('apps/api/src/lib/cross-module-data-fabric-db-init.ts');
  const fabric = read('apps/api/src/lib/cross-module-data-fabric.ts');
  for (const table of ['shared_resource_references','shared_workflow_rules','shared_workflow_runs','shared_domain_events','shared_event_inbox','shared_resource_links','shared_workflow_compensations']) {
    assert.match(ddl,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(fabric,/createHmac\('sha256'/);
  assert.match(fabric,/timingSafeEqual/);
  assert.match(fabric,/pg_advisory_xact_lock/);
  assert.match(fabric,/propagationDepth/);
  assert.match(fabric,/replayDataFabricInbox/);
  assert.match(fabric,/requireWritableAccess[\s\S]*source_module_slug[\s\S]*destination_module_slug/);
});

test('Phase 38 exposes an entitlement-filtered provenance console and SnapProof Directory selection', () => {
  const routes = read('apps/api/src/routes/cross-module-data-fabric-routes.ts');
  const ui = read('apps/web/src/components/pages/SharedServicesAdminPage.tsx');
  const directory = read('apps/api/src/lib/business-directory.ts');
  const snap = read('apps/api/src/routes/snapproofos-phase32-routes.ts');
  assert.match(routes,/\/activity/);
  assert.match(routes,/\/runs\/:runId/);
  assert.match(routes,/\/inbox\/:inboxId\/replay/);
  assert.match(ui,/data-testid="cross-module-provenance"/);
  assert.match(ui,/Open source/);
  assert.match(ui,/Open destination/);
  assert.match(directory,/['"]snapproofos['"]/);
  assert.match(snap,/assertDirectorySelection/);
});

test('database release v48 appends the data fabric after v47', () => {
  const release = read('apps/api/src/lib/database-release-contract.ts');
  assert.match(release,/releaseVersion:\s*48/);
  assert.ok(release.indexOf('cross_module_data_fabric_tables') > release.indexOf('torqueshed_native_tables'));
});
