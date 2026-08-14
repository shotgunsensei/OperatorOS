import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = file => readFileSync(resolve(root, file), 'utf8');

test('Phase 38 report is present, generated, and records the complete workflow contract', () => {
  const report = read('docs/phase-38/CROSS-MODULE-DATA-FABRIC-REPORT.md');
  assert.match(report, /10 versioned native workflow contracts/);
  assert.match(report, /7 additive tenant-scoped data-fabric tables/);
  for (const workflow of [
    'tradeflowkit.job_to_snapproof','snapproof.approved_report_to_tradeflowkit',
    'callcommand.analysis_to_tradeflowkit','callcommand.analysis_to_pulsedesk','callcommand.analysis_to_techdeck',
    'support.resolved_to_faultlinelab','torqueshed.diagnostic_to_snapproof','torqueshed.diagnostic_to_faultlinelab',
    'brandforgeos.campaign_to_launchkit','ninjamation.script_to_techdeck',
  ]) assert.ok(report.includes(workflow), workflow);
  assert.match(report, /Production promotion remains a separate human gate/);
});

test('Phase 38 release, API, UI, browser, and ADR evidence is tracked', () => {
  for (const file of [
    'apps/api/src/lib/cross-module-data-fabric-db-init.ts','apps/api/src/lib/cross-module-data-fabric.ts',
    'apps/api/src/lib/cross-module-workflow-adapters.ts','apps/api/src/routes/cross-module-data-fabric-routes.ts',
    'apps/api/test/cross-module-data-fabric.test.ts','apps/web/e2e/cross-module-data-fabric-phase38.spec.ts',
    'docs/adr/ADR-0041-cross-module-data-fabric.md',
  ]) assert.ok(existsSync(resolve(root, file)), file);
  assert.match(read('apps/api/src/lib/database-release-contract.ts'), /releaseVersion:\s*48/);
  assert.match(read('apps/web/src/components/pages/SharedServicesAdminPage.tsx'), /cross-module-provenance/);
});
