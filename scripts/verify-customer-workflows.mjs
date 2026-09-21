import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
mkdirSync('build', { recursive: true });
import { stripExternalProviderEnvironment, assertDisposableDatabaseEnvironment } from './parity/lib/database.mjs';
const suffix = randomBytes(5).toString('hex');
const name = `operatoros-customer-disposable-${suffix}`;
const password = randomBytes(24).toString('hex');
const env = { ...stripExternalProviderEnvironment(process.env), POSTGRES_PASSWORD: password,
  APP_ENV: 'test', NODE_ENV: 'test', SESSION_SECRET: randomBytes(40).toString('hex'),
  PARITY_DATABASE_IS_DISPOSABLE: '1', DISABLE_BACKGROUND_JOBS: '1',
};
function docker(args) { const r = spawnSync('docker', args, { env, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); return r.stdout.trim(); }
try {
  docker(['run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=operatoros_customer_test','-p','127.0.0.1::5432','postgres:16']);
  const port = docker(['port',name,'5432/tcp']).split(':').at(-1);
  env.DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/operatoros_customer_test`;
  assertDisposableDatabaseEnvironment(env);
  let ready = false;
  for (let i=0;i<30;i++) {
    const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres','-d','operatoros_customer_test'],{env,encoding:'utf8'});
    if (!r.status) {ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if (!ready) throw new Error('Disposable database did not start');
  const args = process.argv.slice(2);
  if (args.some(arg => !/^apps\/api\/test\/[a-z0-9.-]+\.test\.ts$/.test(arg))) throw new Error('Pass repository API test paths only.');
  const defaults = readdirSync('apps/api/test').filter(name => /^(?:account-security-upgrades|auth-.+|sso-.+|session-.+|email-verification|legacy-sso-production-gate|database-release-contract|phase15-release-identity|production-runtime-verifier|snapproofos-db|shared-platform|shared-platform-routes|shared-customers|brandforgeos-db|tradeflowkit-customer-import|tradeflowkit-revenue-flow|clamav-scanner|customer-readiness|attachment-rescan|resend-delivery-retry|shared-queue-tenant-scope|business-directory)\.test\.ts$/.test(name)).map(name => `apps/api/test/${name}`);
  const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1',...(args.length?args:defaults)],{env,encoding:'utf8',maxBuffer:30_000_000});
  const output=`${result.stdout ?? ''}\n${result.stderr ?? ''}`.replaceAll(password,'[test secret]');
  writeFileSync('build/shared-customers-db-tests.log',output);
  process.stdout.write(output.slice(-16000)); process.exitCode=result.status ?? 1;
} finally { try { docker(['stop',name]); } catch {} }
