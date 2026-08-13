import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = readFileSync(new URL('../src/routes/callcommand-msp-routes.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../src/lib/callcommand-msp-db-init.ts', import.meta.url), 'utf8');
const domain = readFileSync(new URL('../src/lib/callcommand-msp.ts', import.meta.url), 'utf8');
const telephony = readFileSync(new URL('../src/lib/telephony.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../web/src/components/module-shells/CallCommandMspWorkspace.tsx', import.meta.url), 'utf8');
const routeMap = readFileSync(new URL('../../web/src/app/modules/[slug]/[...path]/route-map.ts', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/lib/database-release-contract.ts', import.meta.url), 'utf8');

test('MSP Phase 1 exposes exact signed webhook and tenant-authenticated administration boundaries', () => {
  for (const route of ['/webhooks/twilio/voice/inbound','/webhooks/twilio/voice/support-link','/webhooks/twilio/voice/intent','/webhooks/twilio/voice/unrecognized','/workspace','/settings','/organizations','/trusted-lines','/support-links','/integrations','/action-catalog','/policy/evaluate']) {
    assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(routes, /verifyTwilioSignature/);
  assert.match(routes, /WHERE c\.phone_e164=\$\{to\}/);
  assert.match(routes, /c\.product_mode='msp'/);
  assert.match(routes, /requireTenantModuleAccess/);
  assert.match(routes, /requireTenantModuleWriteAccess/);
  assert.match(routes, /requireTenantAdmin/);
  assert.match(routes, /storeEncryptedSecretReference/);
  assert.match(routes, /trusted-lines\/:id\/status/);
  assert.match(routes, /support-links\/:id\/status/);
  assert.doesNotMatch(routes, /resolveEncryptedSecretReference/);
  assert.doesNotMatch(routes, /SELECT \* FROM callcommand_trusted_originating_lines/);
  assert.match(routes, /SELECT id,organization_id,site_id,display_last4,line_type,trust_mode,verified_at/);
  assert.doesNotMatch(routes, /localStorage|parent-domain|query-string credential/i);
});

test('MSP schema is additive, tenant-bearing, constrained, idempotent, and release ordered', () => {
  for (const table of ['callcommand_msp_settings','callcommand_organization_profiles','automation_fabric_integrations','callcommand_trusted_originating_lines','callcommand_contact_profiles','callcommand_support_links','automation_fabric_devices','automation_fabric_action_catalog','callcommand_msp_call_contexts','callcommand_msp_call_events','callcommand_local_cases','callcommand_action_requests','callcommand_policy_decisions','callcommand_verification_challenges','callcommand_reset_sessions','callcommand_integration_outbox']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(schema, /DROP TABLE|TRUNCATE|DELETE FROM/i);
  assert.match(schema, /FOREIGN KEY \(tenant_id,call_context_id\)/);
  assert.match(schema, /UNIQUE \(tenant_id,idempotency_key\)/);
  assert.match(schema, /previous_event_hash CHAR\(64\)/);
  assert.match(release, /releaseVersion: 46/);
  assert.match(release, /ninjamation_complete_product_tables[\s\S]*callcommand_msp_automation_fabric_tables/);
});

test('security domain retains assurance, prohibitions, rate-limit, idempotency and hash-evidence controls', () => {
  for (const value of ['A0','A1','A2','A3','A4','BREAK_GLASS','R4_DESTRUCTIVE_PRIVILEGE','CROSS_TENANT_TARGET_BLOCKED','DEVICE_AFFINITY_INSUFFICIENT','ACTION_PARAMETER_PROHIBITED']) assert.match(domain, new RegExp(value));
  assert.match(routes, /limit:10,windowSeconds:900/);
  assert.match(routes, /limit:5,windowSeconds:900/);
  assert.match(routes, /providerActionConfirmed:bms\.status==='TEST_RECORDED'/);
  assert.match(routes, /automationExecuted:false/);
  assert.match(routes, /rawTranscriptStored:false/);
  assert.match(telephony, /twilio\.validateRequest/);
  assert.doesNotMatch(routes, /providerActionConfirmed:true/);
});

test('premium MSP workspace implements operations, organizations, contacts, integrations, policy, audit and onboarding with honest gates', () => {
  for (const text of ['MSP Intake Command Center','Live intake operations','Organizations and trusted originating lines','Support contacts and SupportLink','MSP Automation Fabric integrations','Assurance and action policy','Hash-linked call evidence','Production onboarding gates','display once','privileged actions gated']) assert.match(shell, new RegExp(text));
  assert.match(shell, /gridTemplateColumns:'repeat\(auto-fit/);
  assert.match(shell, /colorScheme: 'dark'/);
  assert.match(shell, /Password reset and RMM action toggles are server-forced off/);
  for (const path of ['/organizations','/contacts','/integrations/health','/action-catalog','/policy','/audit','/onboarding']) assert.match(routeMap, new RegExp(path.replaceAll('/', '\\/')));
});
