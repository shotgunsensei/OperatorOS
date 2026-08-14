import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_ROOT, REPOSITORY_ROOT } from '../parity/lib/compiler.mjs';
import { run, spawnLogged, stopChild, waitForHttp, waitForPort } from '../parity/lib/process.mjs';

if (process.env.PARITY_DATABASE_IS_DISPOSABLE !== '1') {
  throw new Error('PARITY_DATABASE_IS_DISPOSABLE=1 is required');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const webRoot = join(REPOSITORY_ROOT, 'apps/web');
const playwright = join(
  webRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
);
const runtimeEnv = {
  ...process.env,
  // The API uses deterministic provider adapters while the web and API code
  // still execute from compiled production artifacts.
  APP_ENV: 'test',
  NODE_ENV: 'production',
  SESSION_SECRET: process.env.SESSION_SECRET || 'torqueshed-hotfix-exact-host-session-secret',
  SSO_CODE_ENCRYPTION_SECRET:
    process.env.SSO_CODE_ENCRYPTION_SECRET || 'torqueshed-hotfix-exact-host-sso-code-secret',
  TRUST_PROXY: '1',
  PORT: '5001',
  API_PORT: '5001',
  INTERNAL_API_URL: 'http://127.0.0.1:5001',
  OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
  OPERATOROS_DATABASE_RELEASE_APPLIED: '1',
  E2E_PRODUCTION_HOSTS: '1',
  E2E_ROOT_URL: 'https://operatoros.net',
  E2E_API_URL: 'http://127.0.0.1:5001',
  E2E_WEB_URL: 'http://127.0.0.1:5000',
  E2E_PROXY_PORT: '443',
};
if (process.platform === 'win32' && !runtimeEnv.OPENSSL_BIN) {
  runtimeEnv.OPENSSL_BIN = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
  ].find((candidate) => existsSync(candidate));
}

mkdirSync(BUILD_ROOT, { recursive: true });
let api;
let web;
let proxy;
let gateway;
let exitCode = 1;
try {
  api = spawnLogged(
    process.execPath,
    ['--conditions=production', 'apps/api/dist/apps/api/src/index.js'],
    {
      cwd: REPOSITORY_ROOT,
      env: runtimeEnv,
      logPath: join(BUILD_ROOT, 'hotfix-torque-api.log'),
    },
  );
  await waitForHttp('http://127.0.0.1:5001/readyz', api, 120_000);

  web = spawnLogged(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', '5002'],
    {
      cwd: webRoot,
      env: { ...runtimeEnv, PORT: '5002' },
      logPath: join(BUILD_ROOT, 'hotfix-torque-web.log'),
    },
  );
  await waitForHttp('http://127.0.0.1:5002/healthz', web, 120_000);

  gateway = spawnLogged(
    process.execPath,
    ['scripts/hotfix/exact-host-gateway.mjs'],
    {
      cwd: REPOSITORY_ROOT,
      env: { ...runtimeEnv, PORT: '5000', NEXT_INTERNAL_PORT: '5002' },
      logPath: join(BUILD_ROOT, 'hotfix-torque-gateway.log'),
    },
  );
  await waitForPort(5000);

  proxy = spawnLogged(
    process.execPath,
    ['apps/web/e2e/production-host-proxy.mjs'],
    {
      cwd: REPOSITORY_ROOT,
      env: runtimeEnv,
      logPath: join(BUILD_ROOT, 'hotfix-torque-exact-host-proxy.log'),
    },
  );
  await waitForPort(443);

  exitCode = run(
    playwright,
    ['test', 'e2e/sso-v1.spec.ts', '--grep', 'TorqueShed canonical payment return'],
    { cwd: webRoot, env: runtimeEnv },
  );
} finally {
  await stopChild(proxy);
  await stopChild(gateway);
  await stopChild(web);
  await stopChild(api);
}

process.exitCode = exitCode;
