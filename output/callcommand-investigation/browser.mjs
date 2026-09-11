import { join,resolve } from 'node:path';
import { stripExternalProviderEnvironment,assertLocalBrowserTestEnvironment } from '../../scripts/parity/lib/database.mjs';
import { spawnLogged,stopChild,waitForHttp,waitForPort,runCaptured } from '../../scripts/parity/lib/process.mjs';
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
assertLocalBrowserTestEnvironment(browserEnv,{requireExactHosts:true});
const env={...browserEnv,APP_ENV:'production',NODE_ENV:'production',INTERNAL_API_URL:'http://localhost:5001',OPERATOROS_DETERMINISTIC_PROVIDER_MODE:'1',TRUST_PROXY:'1',PORT:'5000',API_PORT:'5001'};
env.RUNNER_MODE='disabled';
env.SHARED_SECRET_ENCRYPTION_KEY='ab'.repeat(32);
delete env.OPERATOROS_DATABASE_RELEASE_MODE;
let runtime,proxy;
try {
 runtime=spawnLogged(process.execPath,['scripts/start-unified-runtime.mjs'],{cwd:process.cwd(),env,logPath:resolve('output/callcommand-investigation/runtime.log'),mirrorToParent:false});
 await waitForHttp('http://127.0.0.1:5000/api/health',runtime,180000);
 proxy=spawnLogged(process.execPath,['apps/web/e2e/production-host-proxy.mjs'],{cwd:process.cwd(),env:{...env,E2E_PROXY_PORT:'443'},logPath:resolve('output/callcommand-investigation/proxy.log'),mirrorToParent:false});
 await waitForPort(443,'127.0.0.1',30000,proxy);
 const result=await runCaptured(process.execPath,[resolve('apps/web/node_modules/@playwright/test/cli.js'),'test','--retries=0','e2e/callcommand-guided-setup.spec.ts'],{cwd:resolve('apps/web'),env});
 process.exitCode=result.status;
} finally {await stopChild(proxy);await stopChild(runtime);}
