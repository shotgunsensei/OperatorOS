import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../src/routes/callcommand-phase35-routes.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../src/lib/callcommand-phase35-db-init.ts', import.meta.url), 'utf8');
const domain = readFileSync(new URL('../src/lib/callcommand-phase35.ts', import.meta.url), 'utf8');
const telephony = readFileSync(new URL('../src/lib/telephony.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../web/src/components/module-shells/CallCommandWorkspace.tsx', import.meta.url), 'utf8');
const routeMap = readFileSync(new URL('../../web/src/app/modules/[slug]/[...path]/route-map.ts', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/lib/database-release-contract.ts', import.meta.url), 'utf8');

test('Phase 35 declares complete persisted telephony, intelligence, automation, switchboard, ingestion, and report routes', () => {
  for (const contract of [
    '/workspace','/channels','/profiles','/transfer-targets','/flows','/flows/:id/publish','/automation-rules',
    '/calls/:id/process','/calls/:id/report','/upload-intents','/ingestion-tokens','/ingest/:source',
    '/switchboard/sessions/:id/transfer','/simulate','/twilio/voice/incoming','/twilio/voice/consent',
    '/twilio/voice/gather','/twilio/voice/recording','/twilio/voice/status',
  ]) assert.match(route, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(route, /verifyCallCommandTwilioSignature/);
  assert.match(route, /recordIngestion/);
  assert.match(route, /providerActionConfirmed: result\.ok/);
  assert.match(route, /startTwilioCallRecording/);
  assert.doesNotMatch(route, /<Start><Recording/);
  assert.match(telephony, /Calls\/\$\{encodeURIComponent\(input\.callSid\)\}\/Recordings\.json/);
  assert.match(route, /requireTenantModuleAccess/);
  assert.match(route, /requireTenantModuleWriteAccess/);
  assert.match(route, /requireTenantAdmin/);
});

test('Phase 35 release step remains additive and tenant-scoped in the cumulative release', () => {
  for (const table of [
    'callcommand_flows','callcommand_flow_versions','callcommand_flow_traces','callcommand_live_sessions',
    'callcommand_ingestion_tokens','callcommand_ingestion_events','callcommand_upload_intents','callcommand_automation_rules',
    'callcommand_tickets','callcommand_leads','callcommand_tasks','callcommand_action_runs','callcommand_transfer_logs','callcommand_reports',
  ]) assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.doesNotMatch(schema, /DROP TABLE|TRUNCATE/i);
  assert.match(schema, /DROP CONSTRAINT IF EXISTS callcommand_target_shape_check/);
  assert.match(schema, /FOREIGN KEY \(tenant_id,call_id\)/);
  assert.match(release, /callcommand_complete_product_tables/);
  assert.match(release, /callcommand_complete_product_tables[\s\S]*ninjamation_complete_product_tables/);
});

test('Phase 35 preserves loop guards, deterministic fallback, strict analysis, consent TwiML, protected tokens, and PDF integrity', () => {
  assert.match(domain, /CALLCOMMAND_MAX_FLOW_STEPS = 50/);
  assert.match(domain, /OPERATOROS_CALLCOMMAND_RECEPTIONIST_V1/);
  assert.match(domain, /OPERATOROS_CALLCOMMAND_ANALYSIS_V1/);
  assert.match(domain, /Press 1 to consent/);
  assert.match(domain, /gpt-4o-mini-transcribe/);
  assert.match(domain, /randomBytes\(32\)/);
  assert.match(domain, /%PDF-1\.4/);
  assert.doesNotMatch(domain, /DEMO_TRANSCRIPT|DEMO_ANALYSIS/);
});

test('Phase 35 premium workspace exposes every major source module with honest provider language and responsive controls', () => {
  for (const phrase of [
    'Channels and phone lines','Receptionist profiles','Versioned call flows','Live switchboard',
    'Call intelligence and simulation','Rules and action dispatch','Tickets','Leads','Tasks',
    'Twilio setup needed','remain unavailable','Manage organization access, plan features',
  ]) assert.match(shell, new RegExp(phrase));
  assert.match(shell, /colorScheme: 'dark'/);
  assert.match(shell, /gridTemplateColumns:'repeat\(auto-fit/);
  assert.doesNotMatch(shell, /provider connected.*true|fake success|demo transcript/i);
});

test('Phase 35 source-compatible deep links resolve to active product sections', () => {
  for (const path of ['/dashboard','/channels','/receptionist-profiles','/flows','/automation-rules','/switchboard','/setup/telephony','/integrations','/transfer-targets','/simulate/live-call','/calls','/tickets','/leads','/tasks','/billing','/settings']) {
    assert.match(routeMap, new RegExp(path.replaceAll('/', '\\/')));
  }
});
