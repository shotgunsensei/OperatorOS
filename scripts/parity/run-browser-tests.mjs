import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_ROOT, REPOSITORY_ROOT } from './lib/compiler.mjs';
import { PNPM, run, spawnLogged, stopChild, waitForHttp, waitForPort } from './lib/process.mjs';

const suiteIndex = process.argv.indexOf('--suite');
const suite = suiteIndex >= 0 ? process.argv[suiteIndex + 1] : 'all';
if (!['e2e', 'visual', 'all'].includes(suite)) throw new Error('--suite must be e2e, visual, or all');
if (process.env.PARITY_DATABASE_IS_DISPOSABLE !== '1') throw new Error('PARITY_DATABASE_IS_DISPOSABLE=1 is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
mkdirSync(BUILD_ROOT, { recursive: true });

const runtimeEnv = {
  ...process.env,
  APP_ENV: 'production',
  NODE_ENV: 'production',
  INTERNAL_API_URL: 'http://localhost:5001',
  OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
  PORT: '5000',
  API_PORT: '5001',
};
let runtime;
let proxy;
let exitCode = 0;
try {
  runtime = spawnLogged(process.execPath, ['scripts/start-unified-runtime.mjs'], {
    cwd: REPOSITORY_ROOT,
    env: runtimeEnv,
    logPath: join(BUILD_ROOT, 'runtime.log'),
  });
  await waitForHttp('http://127.0.0.1:5000/api/health', runtime, 180_000);
  if (suite === 'e2e' || suite === 'all') {
    proxy = spawnLogged(process.execPath, ['apps/web/e2e/production-host-proxy.mjs'], {
      cwd: REPOSITORY_ROOT,
      env: { ...runtimeEnv, E2E_PROXY_PORT: '443' },
      logPath: join(BUILD_ROOT, 'exact-host-proxy.log'),
    });
    await waitForPort(443);
    exitCode = run(PNPM, [
      '--dir', 'apps/web', 'exec', 'playwright', 'test',
      'e2e/sso-v1.spec.ts',
      'e2e/parity-route-control.spec.ts',
    ], {
      cwd: REPOSITORY_ROOT,
      env: {
        ...runtimeEnv,
        E2E_PRODUCTION_HOSTS: '1',
        E2E_ROOT_URL: 'https://operatoros.net',
        E2E_API_URL: 'http://127.0.0.1:5001',
        E2E_WEB_URL: 'http://127.0.0.1:5000',
      },
    });
  }
  if (suite === 'visual' || suite === 'all') {
    const visualCode = run(PNPM, [
      '--dir', 'apps/web', 'exec', 'playwright', 'test', '--config', 'playwright.visual.config.ts',
    ], {
      cwd: REPOSITORY_ROOT,
      env: {
        ...runtimeEnv,
        E2E_API_URL: 'http://127.0.0.1:5001',
        E2E_WEB_URL: 'http://127.0.0.1:5000',
      },
    });
    if (exitCode === 0) exitCode = visualCode;
  }
} finally {
  await stopChild(proxy);
  await stopChild(runtime);
}
process.exitCode = exitCode;
