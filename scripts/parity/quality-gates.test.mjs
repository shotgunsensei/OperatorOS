import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVisualNegativeFixture,
  readVisualApprovals,
  readVisualContracts,
  validateControlIntegrity,
  validateVisualContracts,
} from './lib/quality.mjs';
import { assertDisposableDatabaseEnvironment } from './lib/database.mjs';
import { parseNodeTestSummary, requiredTestExitCode } from './lib/process.mjs';

test('visual contract covers 13 module-owned suites at desktop, tablet, and mobile widths', () => {
  const contracts = readVisualContracts();
  assert.equal(contracts.modules.length, 13);
  for (const module of contracts.modules) {
    assert.deepEqual(module.viewports.map((viewport) => viewport.width), [1440, 1024, 390]);
    assert.equal(module.viewports.length, 3);
  }
});

test('current visual approval gate fails closed on missing baselines and missing OutCall source branding', () => {
  const issues = validateVisualContracts(readVisualContracts(), readVisualApprovals());
  assert.equal(issues.filter((entry) => entry.code === 'MISSING_VISUAL_BASELINE').length, 39);
  assert.ok(issues.some((entry) => entry.code === 'MISSING_MODULE_BRANDING_TOKENS' && entry.moduleSlug === 'outcall'));
});

for (const [fixtureName, expectedCode] of [
  ['missing-brand-token', 'MISSING_MODULE_BRANDING_TOKENS'],
  ['missing-viewport', 'MISSING_VISUAL_VIEWPORT'],
  ['invalid-route', 'INVALID_VISUAL_ROUTE'],
]) {
  test(`controlled visual fixture ${fixtureName} produces ${expectedCode}`, () => {
    const contracts = readVisualContracts();
    contracts.modules.find((module) => module.moduleSlug === 'outcall').brandTokens = [
      { name: 'primary', value: '#112233' },
      { name: 'accent', value: '#445566' },
      { name: 'surface', value: '#778899' },
    ];
    const fixture = createVisualNegativeFixture(fixtureName, contracts);
    const issues = validateVisualContracts(fixture, { approvals: [] }, { checkFiles: false });
    assert.ok(issues.some((entry) => entry.code === expectedCode));
  });
}

test('controlled route/control fixture detects a dead button and an uncrawlable active route', () => {
  const ledger = {
    modules: [{
      capabilities: [{
        capabilityId: 'fixture.ui_route.1',
        moduleSlug: 'fixture',
        type: 'ui_route',
        state: 'ACTIVE_NATIVE',
        mapping: { implementationFiles: [{ path: 'fixture.tsx' }], routeIds: [] },
      }],
    }],
  };
  const target = {
    forbiddenPatterns: [],
    routes: [],
    files: [{
      path: 'fixture.tsx',
      controls: [{
        controlId: 'control:fixture',
        tag: 'button',
        label: 'Save',
        href: null,
        handler: null,
        type: null,
        disabled: false,
        sourcePath: 'fixture.tsx',
        line: 1,
      }],
    }],
  };
  const issues = validateControlIntegrity(ledger, target).issues;
  assert.ok(issues.some((entry) => entry.code === 'DEAD_BUTTON_STATIC'));
  assert.ok(issues.some((entry) => entry.code === 'ROUTE_NOT_CRAWLABLE'));
});

test('database reset guard accepts only marked loopback test databases', () => {
  assert.equal(assertDisposableDatabaseEnvironment({
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/operatoros_phase21_release',
  }).database, 'operatoros_phase21_release');
  assert.throws(() => assertDisposableDatabaseEnvironment({
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://operator:secret@db.operatoros.net:5432/operatoros',
  }), /non-loopback/u);
  assert.throws(() => assertDisposableDatabaseEnvironment({
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://operator:secret@127.0.0.1:5432/operatoros',
  }), /database name/u);
});

test('required Node test summaries fail closed on skips and missing telemetry', () => {
  const passing = parseNodeTestSummary('ℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n');
  const skipped = parseNodeTestSummary('# tests 4\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n');
  assert.equal(requiredTestExitCode(0, passing), 0);
  assert.equal(requiredTestExitCode(0, skipped), 1);
  assert.equal(requiredTestExitCode(0, null), 1);
});
