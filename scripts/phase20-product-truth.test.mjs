import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function json(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

test('Phase 20 manifest is reproducible and has only allowed states', () => {
  const output = execFileSync(process.execPath, ['scripts/phase20-product-truth.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  const result = JSON.parse(output);
  assert.equal(result.failures, 0);
  assert.equal(result.modules, 13);
  assert.equal(result.unclassified, 0);
  assert.ok(result.capabilities > 0);
  assert.ok(result.stateCounts.BLOCKED > 0);
});

test('owner waivers start empty and cannot imply category retirement', () => {
  const waivers = json('docs/parity/OWNER_WAIVERS.yml');
  assert.equal(waivers.schemaVersion, 1);
  assert.deepEqual(waivers.waivers, []);
  const manifest = json('docs/parity/source-manifest.json');
  assert.equal(manifest.ownerWaivers.count, 0);
  assert.equal(manifest.ownerWaivers.implicitWaivers, 0);
  assert.equal(manifest.totals.stateCounts.OWNER_WAIVED, 0);
});

test('OutCall remains source-recovery blocked', () => {
  const outcall = json('docs/parity/modules/outcall.json');
  assert.equal(outcall.provenance.selectedKind, 'missing_source');
  const recovery = outcall.capabilities.find((capability) => capability.type === 'source_recovery');
  assert.ok(recovery);
  assert.equal(recovery.state, 'BLOCKED');
  assert.equal(recovery.blockerCode, 'SOURCE_RECOVERY_REQUIRED');
});

test('FaultlineLab maps every compiler-discovered playable source case', () => {
  const faultline = json('docs/parity/modules/faultlinelab.json');
  const cases = faultline.capabilities.filter((capability) => capability.type === 'playable_case');
  assert.ok(cases.length > 4);
  assert.equal(cases.filter((capability) => capability.state === 'ACTIVE_NATIVE').length, cases.length);
  assert.equal(cases.filter((capability) => capability.blockerCode).length, 0);
  assert.ok(cases.every((capability) => capability.automatedEvidence.includes('apps/api/test/faultlinelab-full-catalog.test.ts')));
});

test('TradeFlowKit recurring-work source outcomes map to the persisted Phase 24 adapter and test', () => {
  const tradeflowkit = json('docs/parity/modules/tradeflowkit.json');
  const titles = new Set([
    '/jobs?status=scheduled',
    'Recurring',
    'jobs.isRecurring',
    'jobs.recurringFrequency',
    'jobs.recurringSeriesId',
    'jobs.scheduledStart',
    'jobs.scheduledEnd',
  ]);
  const mapped = tradeflowkit.capabilities.filter((capability) => titles.has(capability.title));
  assert.equal(mapped.length, titles.size);
  assert.ok(mapped.every((capability) => capability.state === 'ACTIVE_NATIVE'));
  assert.ok(mapped.every((capability) => capability.currentTargets.includes('apps/api/src/routes/tradeflowkit-recurring-routes.ts')));
  assert.ok(mapped.every((capability) => capability.automatedEvidence.includes('apps/api/test/tradeflowkit-recurring-jobs.test.ts')));
});

test('retirement labels stay blocked unless a later literal-restoration contract supplies executable evidence', () => {
  const manifest = json('docs/parity/source-manifest.json');
  for (const module of manifest.modules) {
    const ledger = json(module.ledger);
    for (const capability of ledger.capabilities.filter((item) =>
      ['retired_security', 'retired_product_boundary'].includes(item.priorDisposition))) {
      if (module.moduleSlug === 'techdeck') {
        assert.ok(['ACTIVE_NATIVE', 'ACTIVE_SHARED_EQUIVALENT'].includes(capability.state));
        assert.equal(capability.blockerCode, null);
        assert.ok(capability.automatedEvidence.includes('apps/api/test/techdeck-literal-product.test.ts'));
        continue;
      }
      if (module.moduleSlug === 'pulsedesk') {
        assert.ok(['ACTIVE_NATIVE', 'ACTIVE_SHARED_EQUIVALENT'].includes(capability.state));
        assert.equal(capability.blockerCode, null);
        assert.ok(capability.automatedEvidence.includes('apps/api/test/pulsedesk-literal-product.test.ts'));
        continue;
      }
      assert.equal(capability.state, 'BLOCKED');
      assert.ok(['BLOCKED_REVIEW', 'SOURCE_IMPLEMENTATION_POINTER_MISSING'].includes(capability.blockerCode));
      if (capability.blockerCode === 'SOURCE_IMPLEMENTATION_POINTER_MISSING') {
        assert.ok(capability.missingSourcePointers.length > 0);
      }
    }
  }
  const techdeck = json('docs/parity/modules/techdeck.json');
  assert.equal(techdeck.stateCounts.BLOCKED, 0);
  assert.equal(techdeck.stateCounts.OWNER_WAIVED, 0);
  assert.equal(techdeck.capabilities.length, 1309);
  assert.equal(techdeck.typeCounts.api_endpoint, 195);
  assert.equal(techdeck.typeCounts.integration, 44);
  const pulsedesk = json('docs/parity/modules/pulsedesk.json');
  assert.equal(pulsedesk.stateCounts.BLOCKED, 0);
  assert.equal(pulsedesk.stateCounts.OWNER_WAIVED, 0);
  assert.equal(pulsedesk.capabilities.length, 840);
  const restoredPulseDeskRetirements = pulsedesk.capabilities.filter((capability) =>
    ['retired_security', 'retired_product_boundary'].includes(capability.priorDisposition));
  assert.ok(restoredPulseDeskRetirements.length >= 138);
  assert.ok(restoredPulseDeskRetirements.every((capability) => capability.automatedEvidence.includes('apps/api/test/pulsedesk-literal-product.test.ts')));
  const tradeflowkit = json('docs/parity/modules/tradeflowkit.json');
  const visual = tradeflowkit.capabilities.find((capability) => capability.type === 'visual_contract');
  assert.equal(visual?.state, 'ACTIVE_NATIVE');
  assert.ok(visual?.automatedEvidence.includes('apps/web/e2e/tradeflowkit-phase23-visual.spec.ts'));
  const torqueshed = json('docs/parity/modules/torqueshed.json');
  assert.equal(torqueshed.capabilities.find((capability) => capability.type === 'mobile_product')?.state, 'BLOCKED');
});
