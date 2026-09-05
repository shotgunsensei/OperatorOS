import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_ROOT, REPOSITORY_ROOT } from './lib/compiler.mjs';
import {
  assertLocalBrowserTestEnvironment,
  stripExternalProviderEnvironment,
} from './lib/database.mjs';
import { runCaptured, spawnLogged, stopChild, waitForHttp, waitForPort } from './lib/process.mjs';

const suiteIndex = process.argv.indexOf('--suite');
const suite = suiteIndex >= 0 ? process.argv[suiteIndex + 1] : 'all';
const webRoot = join(REPOSITORY_ROOT, 'apps/web');
const playwrightCli = join(webRoot, 'node_modules', '@playwright', 'test', 'cli.js');
if (!['e2e', 'visual', 'all'].includes(suite)) throw new Error('--suite must be e2e, visual, or all');
const browserEnv = {
  ...stripExternalProviderEnvironment(process.env),
  CI: 'true',
  ALLOW_LEGACY_SSO_ROLLBACK: 'false',
  OPERATOROS_SELF_SERVICE_TRIALS_ENABLED: 'false',
  E2E_PRODUCTION_HOSTS: '1',
  E2E_ROOT_URL: 'https://operatoros.net',
  E2E_API_URL: 'http://127.0.0.1:5001',
  E2E_WEB_URL: 'http://127.0.0.1:5000',
  E2E_PROXY_HOST: '127.0.0.1',
  E2E_PROXY_TARGET: 'http://127.0.0.1:5000',
  INTERNAL_API_URL: 'http://127.0.0.1:5001',
  APP_BASE_URL: 'https://app.operatoros.net',
  WEB_BASE_URL: 'https://operatoros.net',
  INVITE_ACCEPT_BASE_URL: 'https://app.operatoros.net',
  OPERATOROS_BASE_URL: 'https://operatoros.net',
  OPERATOROS_APPS_URL: 'https://app.operatoros.net/',
  E2E_APP_URL: 'https://app.operatoros.net',
  E2E_WEB_BASE_URL: 'https://operatoros.net',
  E2E_MESSENGER_ROOT_URL: 'https://app.operatoros.net',
  HELP_CENTER_E2E_URL: 'https://operatoros.net',
  BRAND_E2E_BASE_URL: 'https://brandforgeos.operatoros.net',
  E2E_BRANDFORGEOS_URL: 'https://brandforgeos.operatoros.net',
  E2E_TORQUESHED_URL: 'https://torqueshed.operatoros.net',
  E2E_SNAPPROOFOS_URL: 'https://snapproofos.operatoros.net',
  E2E_STUDYFORGE_URL: 'https://studyforge-ai.operatoros.net',
  TRADEFLOWKIT_URL: 'https://tradeflowkit.operatoros.net',
  TORQUESHED_URL: 'https://torqueshed.operatoros.net',
  TECHDECK_URL: 'https://techdeck.operatoros.net',
  PULSEDESK_URL: 'https://pulsedesk.operatoros.net',
  FAULTLINELAB_URL: 'https://faultlinelab.operatoros.net',
  OPERATOR_POOL_HALL_URL: 'https://operatorpoolhall.operatoros.net',
  NINJA_POOL_HALL_URL: 'https://operatorpoolhall.operatoros.net',
  BRANDFORGEOS_URL: 'https://brandforgeos.operatoros.net',
  SNAPPROOFOS_URL: 'https://snapproofos.operatoros.net',
  STUDYFORGE_AI_URL: 'https://studyforge-ai.operatoros.net',
  DEPLOY_OPS_URL: 'https://deployops.operatoros.net',
  NINJA_LAUNCH_KIT_URL: 'https://deployops.operatoros.net',
  CALLCOMMAND_AI_URL: 'https://callcommand-ai.operatoros.net',
  SCRIPT_OPS_URL: 'https://scriptops.operatoros.net',
  NINJAMATION_URL: 'https://scriptops.operatoros.net',
  OUTCALL_URL: 'https://outcall.operatoros.net',
};
assertLocalBrowserTestEnvironment(browserEnv, { requireExactHosts: true });
mkdirSync(BUILD_ROOT, { recursive: true });

const runtimeEnv = {
  ...browserEnv,
  APP_ENV: 'production',
  NODE_ENV: 'production',
  INTERNAL_API_URL: 'http://localhost:5001',
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
      env: runtimeEnv,
    });
    exitCode = browserResult.status;
  }
  if (suite === 'visual' || suite === 'all') {
    const visualArgs = ['test', '--config', 'playwright.visual.config.ts'];
    if (process.env.PARITY_UPDATE_SNAPSHOTS === '1') visualArgs.push('--update-snapshots');
    const visualResult = await runCaptured(process.execPath, [playwrightCli, ...visualArgs], {
      cwd: webRoot,
      env: runtimeEnv,
    });
    if (exitCode === 0) exitCode = visualResult.status;
  }
} finally {
  await stopChild(proxy);
  await stopChild(runtime);
}
process.exitCode = exitCode;
