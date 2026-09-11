import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULE_WORKFLOW_JOURNEYS, getModuleWorkflowJourney } from '../../web/src/lib/module-workflow-journey.ts';
import { buildPlatformAttention } from '../../web/src/lib/platform-attention.ts';

test('remaining module journeys preserve canonical stage routes across embedded and exact-host navigation', () => {
  assert.equal(Object.keys(MODULE_WORKFLOW_JOURNEYS).length, 10);
  for (const [slug, journey] of Object.entries(MODULE_WORKFLOW_JOURNEYS)) {
    assert.ok(journey.stages.length >= 3);
    assert.equal(getModuleWorkflowJourney(slug, '/dashboard')?.activeIndex, -1);
    for (const [index, stage] of journey.stages.entries()) {
      assert.match(stage.path, /^\/[a-z0-9/-]+$/);
      assert.equal(getModuleWorkflowJourney(slug, stage.path)?.activeIndex, index);
      assert.equal(getModuleWorkflowJourney(slug, `/modules/${slug}${stage.path}/record?tab=work#form`)?.activeIndex, index);
    }
    assert.equal(getModuleWorkflowJourney(slug, '/settings'), null);
    assert.equal(getModuleWorkflowJourney(slug, '/unknown'), null);
  }
  assert.equal(getModuleWorkflowJourney('__proto__', '/'), null);
  assert.equal(getModuleWorkflowJourney('constructor', '/'), null);
});

test('every new journey destination exists in its current module navigation source', () => {
  const sources: Record<string, string> = {
    torqueshed: 'TorqueShedRoute.contract.ts', faultlinelab: 'FaultlineLabRoute.contract.ts',
    'ninja-pool-hall': 'NinjaPoolHallRouteShell.tsx', brandforgeos: 'BrandForgeRouteShell.tsx',
    snapproofos: 'SnapProofRoute.contract.ts', 'studyforge-ai': 'StudyForgeRouteShell.tsx',
    'ninja-launch-kit': 'NinjaLaunchKitRouteShell.tsx', 'callcommand-ai': 'CallCommandRoute.contract.ts',
    ninjamation: 'NinjamationRouteShell.tsx', outcall: 'OutCallRoute.contract.ts',
  };
  for (const [slug, journey] of Object.entries(MODULE_WORKFLOW_JOURNEYS)) {
    const source = readFileSync(resolve(import.meta.dirname, '../../web/src/components/module-shells', sources[slug]), 'utf8');
    for (const stage of journey.stages) assert.ok(new RegExp(`canonicalPath:\\s*['"]${stage.path}['"]`).test(source), `${slug}: ${stage.path}`);
  }
});

test('admin review priorities derive from failures and preserve explicit destinations', () => {
  const items = buildPlatformAttention({ billingEvents: { failed: 2 }, callCommandInfrastructure: { routingDrift: 1 } }, { db: { ok: false }, auth: { sessionSecretConfigured: false } });
  assert.deepEqual(items.map(item => item.id), ['database', 'sessions', 'billing', 'calls']);
  assert.equal(items.find(item => item.id === 'billing')?.destination, 'billing');
  assert.equal(buildPlatformAttention({}, {}).length, 0);
  assert.equal(buildPlatformAttention({ billingEvents: { failed: 0 } }, { db: { ok: true } }).length, 0);
});

test('unknown counts do not manufacture admin failures or an all-healthy claim', () => {
  assert.deepEqual(buildPlatformAttention({ billingEvents: { failed: Number.NaN } }, {}), []);
  const items = buildPlatformAttention({ warnings: [{ code: 'SOURCE_UNAVAILABLE', message: 'Refresh the source.' }] }, {});
  assert.deepEqual(items, [{ id: 'SOURCE_UNAVAILABLE', title: 'SOURCE_UNAVAILABLE', detail: 'Refresh the source.', destination: 'audit' }]);
});
