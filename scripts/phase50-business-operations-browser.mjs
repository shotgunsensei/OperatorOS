import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_ROOT, REPOSITORY_ROOT } from './parity/lib/compiler.mjs';
import { PNPM, run, spawnLogged, stopChild, waitForHttp, waitForPort } from './parity/lib/process.mjs';

if (process.env.PARITY_DATABASE_IS_DISPOSABLE !== '1') throw new Error('PARITY_DATABASE_IS_DISPOSABLE=1 is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const webRoot = join(REPOSITORY_ROOT, 'apps/web');
const playwright = join(webRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
const requestedSpec = process.env.PHASE50_BROWSER_SPEC?.trim();
const phaseSpecs = readdirSync(join(webRoot, 'e2e'))
  .filter(name => /^phase50-.*\.spec\.ts$/u.test(name))
  .filter(name => !requestedSpec || name.includes(requestedSpec))
  .map(name => `e2e/${name}`);
if (!phaseSpecs.length) throw new Error('No Phase 50 browser specifications were found');
const runtimeEnv = {
  ...process.env,
  CI: 'true', APP_ENV: 'test', NODE_ENV: 'production', SESSION_SECRET: process.env.SESSION_SECRET || 'phase50-business-routes-session-secret',
  SSO_CODE_ENCRYPTION_SECRET: process.env.SSO_CODE_ENCRYPTION_SECRET || '50'.repeat(32), MODULE_SSO_SECRET: process.env.MODULE_SSO_SECRET || '05'.repeat(32),
  SHARED_SECRET_ENCRYPTION_KEY: process.env.SHARED_SECRET_ENCRYPTION_KEY || '50'.repeat(32), TRUST_PROXY: '1', API_PORT: '5001', NEXT_INTERNAL_PORT: '5002', PORT: '5001',
  INTERNAL_API_URL: 'http://127.0.0.1:5001', OPERATOROS_DATABASE_RELEASE_APPLIED: '1', E2E_PRODUCTION_HOSTS: '1',
  E2E_ROOT_URL: 'https://operatoros.net', E2E_API_URL: 'http://127.0.0.1:5001', E2E_WEB_URL: 'http://127.0.0.1:5000', E2E_PROXY_PORT: '443',
};
if (process.platform === 'win32' && !runtimeEnv.OPENSSL_BIN) runtimeEnv.OPENSSL_BIN = ['C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe'].find(candidate => existsSync(candidate));
mkdirSync(BUILD_ROOT, { recursive: true });
if (process.env.PHASE50_SKIP_BUILD !== '1') {
  if (run(PNPM, ['--filter', '@operatoros/api', 'build'], { cwd: REPOSITORY_ROOT, env: runtimeEnv }) !== 0) throw new Error('Phase 50 API build failed');
  if (run(PNPM, ['--filter', '@operatoros/web', 'build'], { cwd: REPOSITORY_ROOT, env: runtimeEnv }) !== 0) throw new Error('Phase 50 web build failed');
}
let api; let web; let gateway; let proxy; let exitCode = 1;
try {
  api = spawnLogged(process.execPath, ['--conditions=production', 'apps/api/dist/apps/api/src/index.js'], { cwd: REPOSITORY_ROOT, env: { ...runtimeEnv, NODE_ENV: 'test' }, logPath: join(BUILD_ROOT, 'phase50-api.log'), directToLog: true });
  await waitForHttp('http://127.0.0.1:5001/readyz', api, 120_000);
  web = spawnLogged(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '5002'], { cwd: webRoot, env: { ...runtimeEnv, PORT: '5002' }, logPath: join(BUILD_ROOT, 'phase50-web.log'), directToLog: true });
  await waitForPort(5002);
  gateway = spawnLogged(process.execPath, ['scripts/hotfix/exact-host-gateway.mjs'], { cwd: REPOSITORY_ROOT, env: { ...runtimeEnv, PORT: '5000' }, logPath: join(BUILD_ROOT, 'phase50-gateway.log'), directToLog: true });
  await waitForPort(5000);
  proxy = spawnLogged(process.execPath, ['apps/web/e2e/production-host-proxy.mjs'], { cwd: REPOSITORY_ROOT, env: { ...runtimeEnv, E2E_PROXY_TARGET: 'http://127.0.0.1:5000' }, logPath: join(BUILD_ROOT, 'phase50-proxy.log'), directToLog: true });
  await waitForPort(443);
  exitCode = run(playwright, ['test', ...phaseSpecs], { cwd: webRoot, env: runtimeEnv });
} finally {
  await stopChild(proxy); await stopChild(gateway); await stopChild(web); await stopChild(api);
}
process.exitCode = exitCode;
