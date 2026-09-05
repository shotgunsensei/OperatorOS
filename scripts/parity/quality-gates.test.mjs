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
import {
  assertDisposableDatabaseEnvironment,
  assertDeployedBrowserTestEnvironment,
  assertLocalBrowserTestEnvironment,
  assertLocalProxyEnvironment,
  resetDisposablePublicSchema,
  stripExternalProviderEnvironment,
} from './lib/database.mjs';
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
  const contracts = readVisualContracts();
  const approvals = readVisualApprovals();
  const issues = validateVisualContracts(contracts, approvals);
  assert.deepEqual(contracts.baselinePlatforms, ['linux', 'win32']);
  assert.equal(approvals.approvals.length, 78);
  assert.deepEqual([...new Set(approvals.approvals.map((approval) => approval.platform))].sort(), ['linux', 'win32']);
  assert.deepEqual(issues, []);
});

for (const [fixtureName, expectedCode] of [
  ['missing-brand-token', 'MISSING_MODULE_BRANDING_TOKENS'],
  ['missing-viewport', 'MISSING_VISUAL_VIEWPORT'],
  ['invalid-route', 'INVALID_VISUAL_ROUTE'],
  ['invalid-platforms', 'INVALID_VISUAL_BASELINE_PLATFORMS'],
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
  assert.equal(assertDisposableDatabaseEnvironment({
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://postgres:synthetic@localhost:5432/operatoros_test',
  }).database, 'operatoros_test');
  assert.throws(() => assertDisposableDatabaseEnvironment({
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://operator:secret@db.operatoros.net:5432/operatoros',
  }), /non-loopback/u);
  assert.throws(() => assertDisposableDatabaseEnvironment({
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://operator:secret@127.0.0.1:5432/operatoros',
  }), /database name/u);
  assert.throws(() => assertDisposableDatabaseEnvironment({
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://operator:secret@127.0.0.1:5432/operatoros_test?host=db.operatoros.net',
  }), /query or fragment overrides/u);
  assert.throws(() => assertDisposableDatabaseEnvironment({
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://operator:secret@127.0.0.1:5432/operatoros_test#host=db.operatoros.net',
  }), /query or fragment overrides/u);
  for (const unsafeName of ['operatoros_latest', 'operatoros_contest', 'operatoros_circular']) {
    assert.throws(() => assertDisposableDatabaseEnvironment({
      PARITY_DATABASE_IS_DISPOSABLE: '1',
      DATABASE_URL: `postgresql://operator:secret@127.0.0.1:5432/${unsafeName}`,
    }), /database name/u, `${unsafeName} must not pass on a marker substring`);
  }
});

test('browser fixture guard rejects unsafe API, web, root, and exact-host targets before use', () => {
  const safe = {
    PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/operatoros_test',
    E2E_API_URL: 'http://127.0.0.1:5001',
    E2E_WEB_URL: 'http://localhost:5000',
  };
  assert.equal(assertLocalBrowserTestEnvironment(safe).exactHosts, false);
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, E2E_API_URL: 'https://api.operatoros.net' }),
    /non-loopback E2E_API_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, E2E_WEB_URL: 'https://operatoros.net' }),
    /non-loopback E2E_WEB_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, INTERNAL_API_URL: 'https://api.operatoros.net' }),
    /non-loopback INTERNAL_API_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, NEXT_PUBLIC_API_URL: 'https://api.operatoros.net' }),
    /non-loopback NEXT_PUBLIC_API_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, E2E_PROXY_TARGET: 'https://api.operatoros.net' }),
    /non-loopback E2E_PROXY_TARGET/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, E2E_PROXY_HOST: '0.0.0.0' }),
    /non-loopback E2E_PROXY_HOST/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, E2E_BRANDFORGEOS_URL: 'https://example.com' }),
    /unmapped E2E_BRANDFORGEOS_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, HELP_CENTER_E2E_URL: 'https://operatoros.net' }),
    /unmapped HELP_CENTER_E2E_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, OPERATOROS_APPS_URL: 'https://app.operatoros.net' }),
    /unmapped OPERATOROS_APPS_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, E2E_TORQUESHED_URL: 'https://torqueshed.operatoros.net' }),
    /unmapped E2E_TORQUESHED_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({ ...safe, E2E_ROOT_URL: 'https://operatoros.net' }),
    /non-loopback E2E_ROOT_URL/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment(safe, { requireExactHosts: true }),
    /E2E_PRODUCTION_HOSTS=1/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({
      ...safe,
      E2E_PRODUCTION_HOSTS: '1',
      E2E_PROXY_TARGET: 'http://127.0.0.1:5999',
    }, { requireExactHosts: true }),
    /must match E2E_WEB_URL/u,
  );
  const exact = assertLocalBrowserTestEnvironment({
    ...safe,
    E2E_PRODUCTION_HOSTS: '1',
    E2E_ROOT_URL: 'https://operatoros.net',
    E2E_BRANDFORGEOS_URL: 'https://brandforgeos.operatoros.net',
  }, { requireExactHosts: true });
  assert.equal(exact.rootUrl, 'https://operatoros.net');
  assert.equal(exact.overrideUrls.E2E_BRANDFORGEOS_URL, 'https://brandforgeos.operatoros.net');
  assert.throws(
    () => assertLocalBrowserTestEnvironment({
      ...safe,
      E2E_PRODUCTION_HOSTS: '1',
      E2E_ROOT_URL: 'https://auth.operatoros.net',
    }, { requireExactHosts: true }),
    /canonical/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({
      ...safe,
      E2E_PRODUCTION_HOSTS: '1',
      E2E_BRANDFORGEOS_URL: 'https://brandforgeos.operatoros.net/workspace',
    }, { requireExactHosts: true }),
    /origin-only/u,
  );
  assert.throws(
    () => assertLocalBrowserTestEnvironment({
      ...safe,
      E2E_PRODUCTION_HOSTS: '1',
      E2E_BRANDFORGEOS_URL: 'https://brandforgeos.operatoros.net:444',
    }, { requireExactHosts: true }),
    /unmapped/u,
  );
});

test('browser runtime strips inherited live-provider credentials and activation switches', () => {
  const inherited = {
    Path: 'C:\\safe-tools',
    APP_URL: 'https://unsafe-inherited.example.test',
    OPENAI_API_KEY: 'sk-live-must-be-removed',
    OpenAi_Webhook_Secret: 'mixed-case-must-be-removed',
    OPENAI_WEBHOOK_SECRET: 'whsec-must-be-removed',
    RESEND_API_KEY: 're_must_be_removed',
    EMAIL_FROM: 'live@example.test',
    STRIPE_SECRET_KEY: 'sk_live_must_be_removed',
    Stripe_Price_Pro_Monthly: 'mixed-case-price-must-be-removed',
    STRIPE_PRICE_PRO_MONTHLY: 'price_live_must_be_removed',
    TWILIO_AUTH_TOKEN: 'must-be-removed',
    Twilio_Account_Sid: 'mixed-case-must-be-removed',
    REPLIT_CONNECTORS_HOSTNAME: 'connectors.example.test',
    REPL_IDENTITY: 'must-be-removed',
    NEXT_PUBLIC_API_URL: 'https://unsafe-api.example.test',
    TRADEFLOWKIT_PAYMENT_PROVIDER: 'stripe_connect',
    OUTCALL_LIVE_PROVIDER: 'enabled',
    GH_TOKEN: 'must-be-removed',
    hTtPs_PrOxY: 'http://proxy.example.test:8080',
  };
  const isolated = stripExternalProviderEnvironment(inherited);
  assert.equal(isolated.Path, inherited.Path);
  for (const name of Object.keys(inherited).filter((name) => name !== 'Path')) {
    assert.equal(isolated[name], undefined, `${name} must not reach the production-artifact child process`);
  }
  assert.equal(inherited.OPENAI_API_KEY, 'sk-live-must-be-removed', 'the parent environment must not be mutated');
});

test('local browser configs pin Chromium to direct loopback resolution and preserve deployed acceptance', () => {
  const localConfig = readFileSync(join(REPOSITORY_ROOT, 'apps', 'web', 'playwright.config.ts'), 'utf8');
  const visualConfig = readFileSync(join(REPOSITORY_ROOT, 'apps', 'web', 'playwright.visual.config.ts'), 'utf8');
  const deployedConfig = readFileSync(join(REPOSITORY_ROOT, 'apps', 'web', 'playwright.deployed.config.ts'), 'utf8');
  const runner = readFileSync(join(REPOSITORY_ROOT, 'scripts', 'parity', 'run-browser-tests.mjs'), 'utf8');

  assert.match(localConfig, /'--no-proxy-server'/u);
  assert.match(visualConfig, /'--no-proxy-server'/u);
  assert.doesNotMatch(deployedConfig, /--no-proxy-server|host-resolver-rules/u);
  assert.match(runner, /CI: 'true'/u);
  assert.match(runner, /ALLOW_LEGACY_SSO_ROLLBACK: 'false'/u);
  assert.match(runner, /OPERATOROS_SELF_SERVICE_TRIALS_ENABLED: 'false'/u);
  assert.doesNotMatch(runner, /^\s+APP_URL:/mu);
  assert.doesNotMatch(runner, /^\s+NEXT_PUBLIC_API_URL:/mu);
  assert.match(runner, /OPERATOROS_APPS_URL: 'https:\/\/app\.operatoros\.net\/'/u);
});

test('API aggregate does not inherit the production-artifact provider opt-in', () => {
  const runner = readFileSync(join(REPOSITORY_ROOT, 'scripts', 'parity', 'run-api-tests.mjs'), 'utf8');
  assert.match(runner, /delete env\.OPERATOROS_DETERMINISTIC_PROVIDER_MODE/u);
});

test('standalone exact-host proxy refuses remote targets and unsafe listeners', () => {
  assert.deepEqual(assertLocalProxyEnvironment({}), {
    targetUrl: 'http://127.0.0.1:5000',
    host: '127.0.0.1',
    port: 443,
  });
  assert.throws(
    () => assertLocalProxyEnvironment({ E2E_PROXY_TARGET: 'https://api.operatoros.net' }),
    /non-loopback E2E_PROXY_TARGET/u,
  );
  assert.throws(
    () => assertLocalProxyEnvironment({ E2E_PROXY_HOST: '0.0.0.0' }),
    /non-loopback E2E_PROXY_HOST/u,
  );
  assert.throws(
    () => assertLocalProxyEnvironment({ E2E_PROXY_PORT: '70000' }),
    /1 through 65535/u,
  );
});

test('deployed browser gate accepts only canonical production without the local resolver', () => {
  assert.equal(assertDeployedBrowserTestEnvironment({}).rootUrl, 'https://operatoros.net');
  assert.throws(
    () => assertDeployedBrowserTestEnvironment({
      E2E_PRODUCTION_HOSTS: '1',
    }),
    /local exact-host resolver/u,
  );
  assert.throws(
    () => assertDeployedBrowserTestEnvironment({
      E2E_ROOT_URL: 'https://staging.operatoros.net',
    }),
    /canonical/u,
  );
  for (const unsafeRoot of [
    'https://operatoros.net/app',
    'https://operatoros.net/?token=nope',
  ]) {
    assert.throws(
      () => assertDeployedBrowserTestEnvironment({ E2E_ROOT_URL: unsafeRoot }),
      /canonical/u,
    );
  }
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
