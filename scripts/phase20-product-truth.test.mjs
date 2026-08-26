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
  assert.equal(result.stateCounts.BLOCKED, 0);
  assert.equal(result.stateCounts.OWNER_WAIVED, 0);
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

test('OutCall uses the owner-authorized canonical current reconstruction', () => {
  const outcall = json('docs/parity/modules/outcall.json');
  assert.equal(outcall.provenance.selectedKind, 'owner_authorized_reconstruction');
  assert.equal(outcall.provenance.authorizationDate, '2026-08-26');
  const recovery = outcall.capabilities.find((capability) => capability.type === 'source_recovery');
  assert.ok(recovery);
  assert.equal(recovery.state, 'ACTIVE_NATIVE');
  assert.equal(recovery.blockerCode, null);
  assert.ok(recovery.currentTargets.includes('apps/api/src/routes/outcall-routes.ts'));
  assert.ok(recovery.currentTargets.includes('apps/web/src/components/module-shells/OutCallWorkspace.tsx'));
  assert.ok(recovery.automatedEvidence.includes('apps/api/test/outcall-phase50-routes.test.ts'));
  assert.equal(outcall.stateCounts.BLOCKED, 0);
  assert.equal(outcall.stateCounts.OWNER_WAIVED, 0);
});

test('FaultlineLab maps every compiler-discovered playable source case', () => {
  const faultline = json('docs/parity/modules/faultlinelab.json');
  assert.equal(faultline.stateCounts.BLOCKED, 0);
  assert.equal(faultline.stateCounts.OWNER_WAIVED, 0);
  const cases = faultline.capabilities.filter((capability) => capability.type === 'playable_case');
  assert.ok(cases.length > 4);
  assert.equal(cases.filter((capability) => capability.state === 'ACTIVE_NATIVE').length, cases.length);
  assert.equal(cases.filter((capability) => capability.blockerCode).length, 0);
  assert.ok(cases.every((capability) => capability.automatedEvidence.includes('apps/api/test/faultlinelab-full-catalog.test.ts')));
});

test('TradeFlowKit recurring-work source outcomes map to the persisted Phase 24 adapter and test', () => {
  const tradeflowkit = json('docs/parity/modules/tradeflowkit.json');
  assert.equal(tradeflowkit.stateCounts.BLOCKED, 0);
  assert.equal(tradeflowkit.stateCounts.OWNER_WAIVED, 0);
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

test('TradeFlowKit and FaultlineLab restorations bind each row to one bounded evidence domain', () => {
  for (const [path, marker, maxTargets, maxEvidence] of [
    ['docs/parity/modules/tradeflowkit.json', 'Phase 24 evidence domain:', 7, 5],
    ['docs/parity/modules/faultlinelab.json', 'Phase 25 evidence domain:', 4, 3],
  ]) {
    const ledger = json(path);
    const restored = ledger.capabilities.filter(capability => capability.note.includes(marker));
    assert.ok(restored.length > 0);
    assert.ok(restored.every(capability => capability.blockerCode === null));
    assert.ok(restored.every(capability => capability.currentTargets.length > 0 && capability.currentTargets.length <= maxTargets));
    assert.ok(restored.every(capability => capability.automatedEvidence.length > 0 && capability.automatedEvidence.length <= maxEvidence));
  }
});

test('TradeFlowKit MFA source rows point only to the working central MFA implementation and tests', () => {
  const tradeflowkit = json('docs/parity/modules/tradeflowkit.json');
  const mfa = tradeflowkit.capabilities.filter(capability =>
    capability.sourcePointers.some(pointer => pointer.endsWith('/server/routes/twoFactor.ts')));
  const expectedTargets = [
    'apps/api/src/lib/auth-mfa-db-init.ts',
    'apps/api/src/lib/auth-mfa.ts',
    'apps/api/src/routes/auth-routes.ts',
    'apps/web/src/components/pages/LoginPage.tsx',
    'apps/web/src/components/pages/SettingsPage.tsx',
  ].sort();
  const expectedEvidence = [
    'apps/api/test/auth-mfa.test.ts',
    'apps/api/test/auth-mfa-static.test.ts',
  ].sort();
  assert.equal(mfa.length, 12);
  assert.ok(mfa.every(capability => capability.state === 'ACTIVE_SHARED_EQUIVALENT'));
  assert.ok(mfa.every(capability =>
    JSON.stringify([...capability.currentTargets].sort()) === JSON.stringify(expectedTargets)));
  assert.ok(mfa.every(capability =>
    JSON.stringify([...capability.automatedEvidence].sort()) === JSON.stringify(expectedEvidence)));
});

test('historical retirement labels are restored only with executable current targets and evidence', () => {
  const manifest = json('docs/parity/source-manifest.json');
  for (const module of manifest.modules) {
    const ledger = json(module.ledger);
    for (const capability of ledger.capabilities.filter((item) =>
      ['retired_security', 'retired_product_boundary'].includes(item.priorDisposition))) {
      assert.ok(['ACTIVE_NATIVE', 'ACTIVE_SHARED_EQUIVALENT'].includes(capability.state));
      assert.equal(capability.blockerCode, null);
      assert.ok(capability.currentTargets.length > 0);
      assert.ok(capability.automatedEvidence.length > 0);
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
  assert.equal(torqueshed.capabilities.length, 952);
  assert.equal(torqueshed.stateCounts.BLOCKED, 0);
  assert.equal(torqueshed.stateCounts.OWNER_WAIVED, 0);
  assert.equal(torqueshed.capabilities.find((capability) => capability.type === 'mobile_product')?.state, 'ACTIVE_SHARED_EQUIVALENT');
  assert.ok(torqueshed.capabilities.every((capability) => capability.automatedEvidence.includes('apps/api/test/torqueshed-web-api-product.test.ts')));
  const ninjaPool = json('docs/parity/modules/ninja-pool-hall.json');
  assert.equal(ninjaPool.capabilities.length, 56);
  assert.equal(ninjaPool.stateCounts.ACTIVE_NATIVE, 50);
  assert.equal(ninjaPool.stateCounts.ACTIVE_SHARED_EQUIVALENT, 6);
  assert.equal(ninjaPool.stateCounts.BLOCKED, 0);
  assert.equal(ninjaPool.stateCounts.OWNER_WAIVED, 0);
  assert.ok(ninjaPool.capabilities.every((capability) => capability.automatedEvidence.includes('apps/api/test/ninja-pool-phase30-domain.test.ts')));
  const snapproof = json('docs/parity/modules/snapproofos.json');
  assert.equal(snapproof.capabilities.length, 341);
  assert.equal(snapproof.stateCounts.BLOCKED, 0);
  assert.equal(snapproof.stateCounts.OWNER_WAIVED, 0);
  assert.equal(snapproof.typeCounts.database_table, 16);
  assert.ok(snapproof.capabilities.every((capability) => capability.automatedEvidence.includes('apps/api/test/snapproofos-phase32-static.test.ts')));
});
