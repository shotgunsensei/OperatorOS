import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const launcherPath = resolve(repoRoot, 'scripts/start-unified-runtime.mjs');
const launcher = await import(pathToFileURL(launcherPath).href);
const preflight = await import(pathToFileURL(resolve(repoRoot, 'scripts/production-env-preflight.mjs')).href);

test('unified Replit launcher validates production authority and port separation', () => {
  const valid = {
    ...preflight.CANONICAL_MODULE_URLS,
    DATABASE_URL: 'postgresql://example.invalid/operatoros',
    SESSION_SECRET: 'test-only-session-secret-long-enough',
    SSO_CODE_ENCRYPTION_SECRET: 'test-only-code-secret-long-enough-v1',
    APP_ENV: 'production', NODE_ENV: 'production',
    OPERATOROS_BASE_URL: 'https://operatoros.net',
    OPERATOROS_APPS_URL: 'https://app.operatoros.net/',
    INTERNAL_API_URL: 'http://localhost:5001',
    OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
    TRUST_PROXY: 'true',
    RUNNER_MODE: 'disabled',
    SHARED_SECRET_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };
  assert.doesNotThrow(() => launcher.validateDeploymentEnvironment(valid));
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, DATABASE_URL: '' }), /DATABASE_URL/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, SESSION_SECRET: 'short' }), /SESSION_SECRET/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, APP_ENV: 'dev' }), /production/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, APP_URL: 'https://legacy.invalid' }), /APP_URL/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, TECHDECK_URL: '' }), /TECHDECK_URL/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, RUNNER_MODE: 'local' }), /RUNNER_MODE/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, INTERNAL_API_URL: 'https://api.operatoros.net' }), /INTERNAL_API_URL/);
  assert.throws(() => launcher.resolveRuntimeConfig({ PORT: '5001', API_PORT: '5001' }), /different/);
  assert.deepEqual(launcher.resolveRuntimeConfig({ PORT: '5000', API_PORT: '5001' }), {
    apiPort: 5001,
    publicPort: 5000,
    nextPort: 5002,
    startupTimeoutMs: 120000,
    apiReadyUrl: 'http://127.0.0.1:5001/readyz',
    nextReadyUrl: 'http://127.0.0.1:5002/healthz',
    internalApiUrl: 'http://localhost:5001',
  });
  assert.deepEqual(launcher.resolveRuntimeEntrypoints('C:\\workspace'), {
    databaseReleaseEntry: resolve('C:\\workspace', 'apps/api/dist/apps/api/src/scripts/database-release.js'),
    apiEntry: resolve('C:\\workspace', 'apps/api/dist/apps/api/src/index.js'),
    nextCli: resolve('C:\\workspace', 'apps/web/node_modules/next/dist/bin/next'),
  });
});

test('Replit deployment uses the supervised readiness-gated runtime', () => {
  const replit = readFileSync(resolve(repoRoot, '.replit'), 'utf8');
  const deployment = replit.slice(replit.indexOf('[deployment]'), replit.indexOf('[workflows]'));
  const source = readFileSync(launcherPath, 'utf8');
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  const pnpmWorkspace = readFileSync(resolve(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  assert.match(deployment, /run = \["node", "scripts\/start-unified-runtime\.mjs"\]/);
  assert.match(deployment, /export CI=true/);
  assert.match(deployment, /npm exec --yes --package=pnpm@10\.34\.5 -- pnpm install --frozen-lockfile/);
  assert.match(deployment, /pnpm build:production/);
  assert.doesNotMatch(deployment, /cd apps\/web && node node_modules\/next\/dist\/bin\/next build/);
  assert.doesNotMatch(deployment, /corepack|\bnpx\b|node node_modules\/pnpm/);
  assert.doesNotMatch(deployment, /sleep 2 && cd apps\/web/);
  assert.match(source, /\/readyz/);
  assert.match(source, /evaluateProductionEnvironment/);
  assert.match(source, /Fastify exited/);
  assert.match(source, /Next exited/);
  assert.match(source, /server\.on\('upgrade'/);
  assert.match(source, /request\.url\.slice\(3\)/);
  assert.match(source, /SIGTERM/);
  assert.match(source, /shell: false/);
  assert.match(source, /database-release\.js/);
  assert.match(source, /--apply/);
  assert.match(source, /--conditions=production/);
  assert.match(source, /apps\/api\/dist\/apps\/api\/src\/index\.js/);
  assert.match(source, /apps\/web\/node_modules\/next\/dist\/bin\/next/);
  assert.match(source, /resolve\(process\.cwd\(\), 'apps\/web'\)/);
  assert.doesNotMatch(source, /corepack|spawnPnpm/);
  assert.equal(packageJson.packageManager, 'pnpm@10.34.5');
  assert.equal(
    packageJson.scripts['build:production'],
    'pnpm verify:faultlinelab:catalog && node scripts/generate-release-metadata.mjs && pnpm typecheck && pnpm build',
  );
  assert.equal(packageJson.dependencies.pnpm, undefined);
  assert.equal(packageJson.pnpm, undefined);
  assert.match(pnpmWorkspace, /^allowBuilds:\r?\n\s+bufferutil: true\r?\n\s+esbuild: true$/m);
  for (const [name, url] of Object.entries(preflight.CANONICAL_MODULE_URLS)) {
    assert.match(replit, new RegExp(`^${name} = "${String(url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"$`, 'm'));
  }
  assert.match(replit, /TWILIO_PUBLIC_BASE_URL = "https:\/\/callcommand-ai\.operatoros\.net"/);
  assert.match(replit, /OPERATOROS_APPS_URL = "https:\/\/app\.operatoros\.net\/"/);
  assert.match(replit, /INTERNAL_API_URL = "http:\/\/localhost:5001"/);
  assert.match(replit, /OPERATOROS_DATABASE_RELEASE_MODE = "apply"/);
});
