import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  createVisualNegativeFixture,
  readVisualApprovals,
  readVisualContracts,
  validateControlIntegrity,
  validateVisualContracts,
} from './lib/quality.mjs';
import { assertDisposableDatabaseEnvironment, resetDisposablePublicSchema } from './lib/database.mjs';
import { REPOSITORY_ROOT } from './lib/compiler.mjs';
import { PNPM, parseNodeTestSummary, requiredTestExitCode, runCaptured, waitForPort } from './lib/process.mjs';

test('visual contract covers 13 module-owned suites at desktop, tablet, and mobile widths', () => {
  const contracts = readVisualContracts();
  assert.equal(contracts.modules.length, 13);
  for (const module of contracts.modules) {
    assert.deepEqual(module.viewports.map((viewport) => viewport.width), [1440, 1024, 390]);
    assert.equal(module.viewports.length, 3);
  }
});

test('current visual approval gate binds every module viewport to a reviewed baseline', () => {
  const issues = validateVisualContracts(readVisualContracts(), readVisualApprovals());
  assert.equal(readVisualApprovals().approvals.length, 39);
  assert.deepEqual(issues, []);
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

test('generated source catalog prose is not treated as a maintained UI feature-count claim', () => {
  const ledger = {
    modules: [{ capabilities: [{
      capabilityId: 'fixture.source_test.1', moduleSlug: 'fixture', type: 'source_test', state: 'ACTIVE_NATIVE',
      mapping: { implementationFiles: [{ path: 'apps/api/src/generated/fixture-catalog.ts' }], routeIds: [] },
    }] }],
  };
  const target = {
    forbiddenPatterns: [{
      code: 'HARD_CODED_FEATURE_COUNT', sourcePath: 'apps/api/src/generated/fixture-catalog.ts', line: 1, excerpt: '2 modules',
    }],
    routes: [],
    files: [{ path: 'apps/api/src/generated/fixture-catalog.ts', controls: [] }],
  };
  assert.deepEqual(validateControlIntegrity(ledger, target).issues, []);
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

test('disposable database reset releases locks between foreign keys and relations', async () => {
  const statements = [];
  const client = {
    async query(statement) {
      statements.push(statement);
      if (statement.includes('FROM pg_constraint')) {
        return { rows: [{ schema_name: 'public', object_name: 'child"table', constraint_name: 'fk"parent' }] };
      }
      if (statement.includes('FROM pg_class relation')) {
        return { rows: [
          { schema_name: 'public', object_name: 'current_view', object_kind: 'v' },
          { schema_name: 'public', object_name: 'parent_table', object_kind: 'r' },
        ] };
      }
      return { rows: [] };
    },
  };
  const dropped = await resetDisposablePublicSchema(client);
  assert.deepEqual(dropped, { foreignKeys: 1, views: 1, tables: 1, sequences: 0, foreignTables: 0 });
  assert.ok(statements.includes('ALTER TABLE IF EXISTS "public"."child""table" DROP CONSTRAINT IF EXISTS "fk""parent"'));
  assert.ok(statements.includes('DROP VIEW IF EXISTS "public"."current_view" CASCADE'));
  assert.ok(statements.includes('DROP TABLE IF EXISTS "public"."parent_table" CASCADE'));
  assert.equal(statements.some(statement => /^begin$/iu.test(statement.trim())), false);
  assert.ok(statements.indexOf('DROP SCHEMA IF EXISTS public CASCADE') > statements.indexOf('DROP TABLE IF EXISTS "public"."parent_table" CASCADE'));
  assert.equal(statements.at(-1), 'CREATE SCHEMA public');
});

test('repository child pnpm commands resolve the packageManager version through Corepack', async () => {
  const result = await runCaptured(PNPM, ['--version']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '10.34.5');
});

test('port readiness fails immediately when its child process exits', async () => {
  await assert.rejects(
    waitForPort(9, '127.0.0.1', 1_000, { exitCode: 1 }),
    /Process exited before 127\.0\.0\.1:9 became ready \(1\)/u,
  );
});

test('GitHub release runners grant only Node the low-port capability required by the exact-host TLS edge', () => {
  const workflow = readFileSync(join(REPOSITORY_ROOT, '.github', 'workflows', 'release-gate.yml'), 'utf8');
  assert.match(workflow, /sudo setcap cap_net_bind_service=\+ep .*command -v node/u);
});

test('required Node test summaries fail closed on skips and missing telemetry', () => {
  const passing = parseNodeTestSummary('ℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n');
  const skipped = parseNodeTestSummary('# tests 4\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n');
  assert.equal(requiredTestExitCode(0, passing), 0);
  assert.equal(requiredTestExitCode(0, skipped), 1);
  assert.equal(requiredTestExitCode(0, null), 1);
});
