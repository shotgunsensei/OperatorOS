import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

test('Torque Assist schema makes the ledger append-only, scoped, and duplicate-safe', () => {
  const ddl = read('apps/api/src/lib/torqueshed-db-init.ts');
  for (const table of [
    'operatoros_token_purchase_intents',
    'torqueshed_assist_requests',
    'torqueshed_token_ledger_entries',
    'torqueshed_assist_rate_windows',
    'torqueshed_ai_provider_circuits',
  ]) {
    assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(ddl, /torqueshed_token_ledger_append_only/);
  assert.match(ddl, /BEFORE UPDATE OR DELETE ON torqueshed_token_ledger_entries/);
  assert.match(ddl, /entry_kind IN \('credit','debit','credit_reversal','debit_reversal'/);
  assert.match(ddl, /uq_torqueshed_token_ledger_external_event/);
  assert.match(ddl, /uq_torqueshed_token_ledger_debit_request/);
  assert.match(ddl, /uq_operatoros_token_purchase_idempotency/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id, diagnostic_session_id\)/);
  assert.doesNotMatch(ddl, /mutable_balance|prompt_text|raw_prompt|api_key/i);
});

test('Torque Assist uses trusted session context, shared adapters, and transactional final charging', () => {
  const service = read('apps/api/src/lib/torque-assist-service.ts');
  const routes = read('apps/api/src/routes/torque-assist-routes.ts');
  const billing = read('apps/api/src/lib/operatoros-token-billing.ts');
  assert.match(routes, /requireTenantModuleAccess\('torqueshed'\)/);
  assert.match(routes, /requireTenantModuleWriteAccess/);
  assert.match(routes, /diagnosticSessionId \?\? input\.sessionId/);
  assert.match(service, /getSharedAiProviderAdapter/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /torqueshed:token-balance:/);
  assert.match(service, /SELECT id FROM users WHERE id=\$\{userId\} FOR UPDATE/);
  assert.ok(
    (service.match(/lockTorqueBalance\(tx, input\.tenantId, input\.userId\)/g) ?? []).length >= 2,
    'balance reservation and final charge must use the same tenant/user advisory and durable user-row locks',
  );
  assert.match(service, /recordUsageEvent/);
  assert.match(service, /completeIdempotentOperation/);
  assert.match(service, /status='provider_failed'/);
  assert.match(service, /response_json=NULL,actual_units=NULL/);
  assert.match(billing, /getPaymentProviderAdapter/);
  assert.match(billing, /amountMinor.*purchase\.amount_minor/s);
  assert.match(billing, /'credit_reversal','token_purchase_refund'/);
  assert.doesNotMatch(service, /console\.(?:log|error|warn).*Prompt/i);
});

test('Torque Assist UI/API routes and release verification are registered without client-side authority', () => {
  const registration = read('apps/api/src/routes/module-shell-routes.ts');
  const release = read('apps/api/src/lib/database-release.ts');
  const routes = read('apps/api/src/routes/torque-assist-routes.ts');
  const web = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  assert.match(registration, /registerTorqueAssistRoutes/);
  assert.match(release, /torqueshed_assist_requests/);
  assert.match(release, /torqueshed_token_ledger_entries/);
  assert.match(release, /operatoros_token_purchase_intents/);
  for (const path of [
    '/torque-assist/status',
    '/token-purchases/checkout',
    '/token-ledger',
    '/token-ledger/reconciliation',
    '/torque-assist',
  ]) {
    assert.ok(routes.includes(`/v1/modules/torqueshed${path}`), path);
  }
  assert.match(routes, /\/v1\/billing\/torque-assist\/webhook/);
  assert.match(routes, /Raw body unavailable for signature verification/);
  assert.doesNotMatch(routes, /body\.tenantId|input\.tenantId|body\.userId|input\.userId/);
  assert.match(web, /data-testid="torqueshed-torque-assist"/);
  assert.match(web, /Retry same request without duplicate charge/);
  assert.match(web, /Ledger-computed balance/);
  assert.match(web, /Facts and assumptions/);
  assert.match(web, /Ranked hypotheses/);
  assert.match(web, /Safety warnings/);
  assert.match(web, /Recommended tests/);
  assert.match(client, /getTorqueAssistContext/);
  assert.match(client, /purchaseTorqueTokens/);
  assert.match(client, /runTorqueAssist/);
});
