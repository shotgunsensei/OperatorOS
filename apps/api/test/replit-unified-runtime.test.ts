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
    OPERATOROS_BASE_URL: 'https://operatoros.net', TRUST_PROXY: 'true',
  };
  assert.doesNotThrow(() => launcher.validateDeploymentEnvironment(valid));
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, DATABASE_URL: '' }), /DATABASE_URL/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, SESSION_SECRET: 'short' }), /SESSION_SECRET/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, APP_ENV: 'dev' }), /production/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, APP_URL: 'https://legacy.invalid' }), /APP_URL/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, TECHDECK_URL: '' }), /TECHDECK_URL/);
  assert.throws(() => launcher.resolveRuntimeConfig({ PORT: '5001', API_PORT: '5001' }), /different/);
  assert.deepEqual(launcher.resolveRuntimeConfig({ PORT: '5000', API_PORT: '5001' }), {
    apiPort: 5001,
    publicPort: 5000,
    startupTimeoutMs: 120000,
    apiReadyUrl: 'http://127.0.0.1:5001/readyz',
    internalApiUrl: 'http://localhost:5001',
  });
  assert.deepEqual(launcher.resolveRuntimeEntrypoints('C:\\workspace'), {
    tsxCli: resolve('C:\\workspace', 'node_modules/tsx/dist/cli.mjs'),
    nextCli: resolve('C:\\workspace', 'apps/web/node_modules/next/dist/bin/next'),
  });
});

test('Replit deployment uses the supervised readiness-gated runtime', () => {
  const replit = readFileSync(resolve(repoRoot, '.replit'), 'utf8');
  const deployment = replit.slice(replit.indexOf('[deployment]'), replit.indexOf('[workflows]'));
  const source = readFileSync(launcherPath, 'utf8');
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  assert.match(deployment, /run = \["node", "scripts\/start-unified-runtime\.mjs"\]/);
  assert.match(deployment, /export CI=true/);
  assert.match(deployment, /npm exec --yes --package=pnpm@10\.34\.5 -- pnpm install --frozen-lockfile/);
  assert.match(deployment, /cd apps\/web && node node_modules\/next\/dist\/bin\/next build/);
  assert.doesNotMatch(deployment, /corepack|\bnpx\b|node node_modules\/pnpm|\bpnpm -r\b/);
  assert.doesNotMatch(deployment, /sleep 2 && cd apps\/web/);
  assert.match(source, /\/readyz/);
  assert.match(source, /evaluateProductionEnvironment/);
  assert.match(source, /Fastify exited/);
  assert.match(source, /Next exited/);
  assert.match(source, /SIGTERM/);
  assert.match(source, /shell: false/);
  assert.match(source, /node_modules\/tsx\/dist\/cli\.mjs/);
  assert.match(source, /apps\/web\/node_modules\/next\/dist\/bin\/next/);
  assert.match(source, /resolve\(process\.cwd\(\), 'apps\/web'\)/);
  assert.doesNotMatch(source, /corepack|spawnPnpm/);
  assert.equal(packageJson.packageManager, 'pnpm@10.34.5');
  assert.equal(packageJson.dependencies.pnpm, undefined);
  assert.deepEqual(packageJson.pnpm.onlyBuiltDependencies, ['bufferutil', 'esbuild']);
  for (const [name, url] of Object.entries(preflight.CANONICAL_MODULE_URLS)) {
    assert.match(replit, new RegExp(`^${name} = "${String(url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"$`, 'm'));
  }
  assert.match(replit, /TWILIO_PUBLIC_BASE_URL = "https:\/\/callcommand-ai\.operatoros\.net"/);
});
