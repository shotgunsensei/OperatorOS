import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../../..');
const read=(path:string)=>readFileSync(resolve(root,path),'utf8');

test('Phase 27 connector routes preserve tenant authority, encrypted credentials, OAuth state, deterministic ingestion, and shared retries',()=>{
  const routes=read('apps/api/src/routes/pulsedesk-literal-routes.ts');
  assert.match(routes,/requireTenantModuleAccess\('pulsedesk'\)/);
  assert.match(routes,/storeEncryptedSecretReference/);
  assert.match(routes,/oauth_state_hash/);
  assert.match(routes,/PULSEDESK_OAUTH_STATE_INVALID/);
  assert.match(routes,/enqueueSharedJob/);
  assert.match(routes,/test-ingest/);
  assert.match(routes,/PULSEDESK_TEST_ADAPTER_REQUIRED/);
  assert.match(routes,/x-pulsedesk-test-adapter/);
  assert.match(routes,/connector\.mode === 'test' && isOperatorOSDeterministicProviderTestEnvironment\(\)/);
  assert.match(routes,/PULSEDESK_INBOUND_AUTH_FAILED/);
  assert.match(routes,/connector\.mode !== 'test' \|\| !isOperatorOSDeterministicProviderTestEnvironment\(\)/);
  assert.match(routes,/mode === 'live' \|\| \(mode === 'test' && !isOperatorOSDeterministicProviderTestEnvironment\(\)\)/);
  assert.match(routes,/PULSEDESK_ATTACHMENT_SCAN_REJECTED/);
  assert.ok(routes.indexOf("status='processed'")>routes.indexOf('if (!scanClean)'));
  assert.doesNotMatch(routes,/console\.log|request\.body.*log/);
});

test('Phase 27 public intake is bounded, rate limited, and rejects sensitive clinical language',()=>{
  const routes=read('apps/api/src/routes/pulsedesk-literal-routes.ts');
  const middleware=read('apps/web/src/middleware.ts');
  assert.match(routes,/PULSEDESK_SENSITIVE_CONTENT_REJECTED/);
  assert.match(routes,/PULSEDESK_INTAKE_RATE_LIMITED/);
  assert.match(middleware,/pulseDeskPublicDestination/);
  assert.match(middleware,/^\s*const intake = \/\^\\\/submit/um);
});

test('Phase 27 release v36 appends provider and intake persistence after TechDeck v35',()=>{
  const contract=read('apps/api/src/lib/database-release-contract.ts');
  const ddl=read('apps/api/src/lib/pulsedesk-literal-db-init.ts');
  assert.ok(Number(contract.match(/releaseVersion:\s*(\d+)/)?.[1] ?? 0) >= 36);
  assert.ok(contract.indexOf("{ id: 'pulsedesk_literal_tables'")>contract.indexOf("{ id: 'techdeck_literal_tables'"));
  for(const table of ['pulsedesk_mail_connectors','pulsedesk_connector_events','pulsedesk_inbound_messages','pulsedesk_public_intake_policies']) assert.match(ddl,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
});

test('Phase 27 UI exposes connector management and PHI-minimized public intake',()=>{
  const shell=read('apps/web/src/components/module-shells/PulseDeskShell.tsx');
  const consoleSource=read('apps/web/src/components/module-shells/PulseDeskConnectorConsole.tsx');
  const intake=read('apps/web/src/app/public/pulsedesk/intake/[slug]/page.tsx');
  const worker=read('apps/web/public/pulsedesk-sw.js');
  assert.match(shell,/PulseDeskConnectorConsole/);
  for(const provider of ['SendGrid','Standard email mailbox','Google Workspace','Microsoft 365']) assert.match(consoleSource,new RegExp(provider));
  assert.match(intake,/Do not include patient names/);
  assert.match(intake,/navigator\.onLine/);
  assert.match(intake,/serviceWorker\.register/);
  assert.doesNotMatch(`${intake}\n${worker}`,/localStorage|sessionStorage|method !== 'POST'/);
  assert.match(worker,/request\.method !== 'GET'/);
});
