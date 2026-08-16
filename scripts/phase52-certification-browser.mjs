import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_ROOT, REPOSITORY_ROOT } from './parity/lib/compiler.mjs';
import { PNPM, run, spawnLogged, stopChild, waitForHttp, waitForPort } from './parity/lib/process.mjs';

if (process.env.PARITY_DATABASE_IS_DISPOSABLE !== '1') throw new Error('PARITY_DATABASE_IS_DISPOSABLE=1 is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const webRoot = join(REPOSITORY_ROOT, 'apps/web');
const playwright = join(webRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
const runtimeEnv = {
  ...process.env,
  CI: 'true', APP_ENV: 'test', NODE_ENV: 'production',
  SESSION_SECRET: process.env.SESSION_SECRET || 'phase52-certification-session-secret',
  SSO_CODE_ENCRYPTION_SECRET: process.env.SSO_CODE_ENCRYPTION_SECRET || '52'.repeat(32),
  MODULE_SSO_SECRET: process.env.MODULE_SSO_SECRET || '25'.repeat(32),
  SHARED_SECRET_ENCRYPTION_KEY: process.env.SHARED_SECRET_ENCRYPTION_KEY || '52'.repeat(32),
  TRUST_PROXY: '1', API_PORT: '5001', NEXT_INTERNAL_PORT: '5002', PORT: '5001',
  INTERNAL_API_URL: 'http://127.0.0.1:5001', OPERATOROS_DATABASE_RELEASE_APPLIED: '1',
  E2E_PRODUCTION_HOSTS: '1', E2E_ROOT_URL: 'https://operatoros.net',
  E2E_API_URL: 'http://127.0.0.1:5001', E2E_WEB_URL: 'http://127.0.0.1:5000', E2E_PROXY_PORT: '443',
  OUTCALL_TEST_ADAPTER: 'enabled',
};
if (process.platform === 'win32' && !runtimeEnv.OPENSSL_BIN) {
  runtimeEnv.OPENSSL_BIN = ['C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe'].find(existsSync);
}

mkdirSync(BUILD_ROOT, { recursive: true });
if (process.env.PHASE52_SKIP_BUILD !== '1') {
  if (run(PNPM, ['--filter', '@operatoros/api', 'build'], { cwd: REPOSITORY_ROOT, env: runtimeEnv }) !== 0) throw new Error('Phase 52 API build failed');
  if (run(PNPM, ['--filter', '@operatoros/web', 'build'], { cwd: REPOSITORY_ROOT, env: runtimeEnv }) !== 0) throw new Error('Phase 52 web build failed');
}

const suites = [
  ['test', 'e2e/sso-v1.spec.ts', '--grep', 'one credential entry establishes the canonical app host then launches all active modules in the current page'],
  ['test', 'e2e/platform-command-phase47.spec.ts'],
  ['test', 'e2e/tradeflowkit-phase23-visual.spec.ts', '--grep', 'active routes are real'],
  ['test', 'e2e/torqueshed-phase49-routes.spec.ts'],
  ['test', 'e2e/phase50-techdeck-routes.spec.ts', 'e2e/phase50-pulsedesk-routes.spec.ts', 'e2e/phase50-faultlinelab-routes.spec.ts', 'e2e/phase50-snapproofos-routes.spec.ts', 'e2e/phase50-callcommand-routes.spec.ts'],
];

let api; let web; let gateway; let proxy; let exitCode = 1;
try {
  api = spawnLogged(process.execPath, ['--conditions=production', 'apps/api/dist/apps/api/src/index.js'], {
    cwd: REPOSITORY_ROOT, env: runtimeEnv, logPath: join(BUILD_ROOT, 'phase52-api.log'), directToLog: true,
  });
  await waitForHttp('http://127.0.0.1:5001/readyz', api, 120_000);
  web = spawnLogged(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '5002'], {
    cwd: webRoot, env: { ...runtimeEnv, PORT: '5002' }, logPath: join(BUILD_ROOT, 'phase52-web.log'), directToLog: true,
  });
  await waitForPort(5002);
  gateway = spawnLogged(process.execPath, ['scripts/hotfix/exact-host-gateway.mjs'], {
    cwd: REPOSITORY_ROOT, env: { ...runtimeEnv, PORT: '5000' }, logPath: join(BUILD_ROOT, 'phase52-gateway.log'), directToLog: true,
  });
  await waitForPort(5000);
  proxy = spawnLogged(process.execPath, ['apps/web/e2e/production-host-proxy.mjs'], {
    cwd: REPOSITORY_ROOT, env: { ...runtimeEnv, E2E_PROXY_TARGET: 'http://127.0.0.1:5000' }, logPath: join(BUILD_ROOT, 'phase52-proxy.log'), directToLog: true,
  });
  await waitForPort(443);
  exitCode = 0;
  for (const suite of suites) {
    const result = run(playwright, suite, { cwd: webRoot, env: runtimeEnv });
    if (result !== 0) { exitCode = result; break; }
  }
} finally {
  await stopChild(proxy); await stopChild(gateway); await stopChild(web); await stopChild(api);
}
// Restart before Phase 51 so its five independent direct-login journeys do
// not inherit the intentionally bounded in-memory authentication IP window
// consumed by the earlier production suites.
if (exitCode === 0) {
  exitCode = run(process.execPath, ['scripts/phase51-creative-routes-browser.mjs'], {
    cwd: REPOSITORY_ROOT,
    env: { ...runtimeEnv, PHASE51_SKIP_BUILD: '1' },
  });
}
// OutCall's verified-self provider is deliberately test-only and refuses to
// activate under production NODE_ENV. Exercise that explicit boundary in a
// third runtime after the production-cookie suites have stopped.
if (exitCode === 0) {
  exitCode = run(process.execPath, ['scripts/phase50-business-operations-browser.mjs'], {
    cwd: REPOSITORY_ROOT,
    env: { ...runtimeEnv, PHASE50_BROWSER_SPEC: 'outcall', PHASE50_SKIP_BUILD: '1' },
  });
}
process.exitCode = exitCode;
