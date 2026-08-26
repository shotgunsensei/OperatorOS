import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_ROOT, REPOSITORY_ROOT } from './lib/compiler.mjs';
import { runCaptured, spawnLogged, stopChild, waitForHttp, waitForPort } from './lib/process.mjs';

const suiteIndex = process.argv.indexOf('--suite');
const suite = suiteIndex >= 0 ? process.argv[suiteIndex + 1] : 'all';
const webRoot = join(REPOSITORY_ROOT, 'apps/web');
const playwrightCli = join(webRoot, 'node_modules', '@playwright', 'test', 'cli.js');
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
  OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1',
  // This harness runs behind its own exact-host reverse proxy. Trusting that
  // bounded proxy keeps production IP-based abuse controls active while each
  // disposable browser identity retains its explicit test client address.
  TRUST_PROXY: '1',
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
    mirrorToParent: false,
  });
  await waitForHttp('http://127.0.0.1:5000/api/health', runtime, 180_000);
  proxy = spawnLogged(process.execPath, ['apps/web/e2e/production-host-proxy.mjs'], {
    cwd: REPOSITORY_ROOT,
    env: { ...runtimeEnv, E2E_PROXY_PORT: '443' },
    logPath: join(BUILD_ROOT, 'exact-host-proxy.log'),
    mirrorToParent: false,
  });
  await waitForPort(443, '127.0.0.1', 30_000, proxy);
  if (suite === 'e2e' || suite === 'all') {
    const browserArgs = [
      'test',
      'e2e/sso-v1.spec.ts',
      'e2e/parity-route-control.spec.ts',
      'e2e/twilio-compliance.spec.ts',
      'e2e/torqueshed-phase28.spec.ts',
      'e2e/ninja-pool-hall-phase30.spec.ts',
      'e2e/brandforgeos-phase31.spec.ts',
      'e2e/phase39-accessibility-performance.spec.ts',
    ];
    const focusedPattern = process.env.PARITY_BROWSER_GREP?.trim();
    if (focusedPattern) browserArgs.push('--grep', focusedPattern);
    const browserResult = await runCaptured(process.execPath, [playwrightCli, ...browserArgs], {
      cwd: webRoot,
      env: {
        ...runtimeEnv,
        E2E_PRODUCTION_HOSTS: '1',
        E2E_ROOT_URL: 'https://operatoros.net',
        E2E_API_URL: 'http://127.0.0.1:5001',
        E2E_WEB_URL: 'http://127.0.0.1:5000',
      },
    });
    exitCode = browserResult.status;
  }
  if (suite === 'visual' || suite === 'all') {
    const visualArgs = ['test', '--config', 'playwright.visual.config.ts'];
    if (process.env.PARITY_UPDATE_SNAPSHOTS === '1') visualArgs.push('--update-snapshots');
    const visualResult = await runCaptured(process.execPath, [playwrightCli, ...visualArgs], {
      cwd: webRoot,
      env: {
        ...runtimeEnv,
        E2E_PRODUCTION_HOSTS: '1',
        E2E_API_URL: 'http://127.0.0.1:5001',
        E2E_WEB_URL: 'http://127.0.0.1:5000',
      },
    });
    if (exitCode === 0) exitCode = visualResult.status;
  }
} finally {
  await stopChild(proxy);
  await stopChild(runtime);
}
process.exitCode = exitCode;
