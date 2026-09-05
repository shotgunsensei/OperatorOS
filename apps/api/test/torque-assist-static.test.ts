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
  assert.match(service, /'provider_failed'/);
  assert.match(service, /response_json=NULL[\s\S]*actual_units=NULL/);
  assert.match(billing, /getPaymentProviderAdapter/);
  assert.match(billing, /amountMinor.*purchase\.amount_minor/s);
  assert.match(billing, /operationType: 'token_purchase_refund'/);
  assert.doesNotMatch(service, /console\.(?:log|error|warn).*Prompt/i);
});

test('Torque Assist UI/API routes and release verification are registered without client-side authority', () => {
  const registration = read('apps/api/src/routes/module-shell-routes.ts');
  const release = read('apps/api/src/lib/database-release.ts');
  const routes = read('apps/api/src/routes/torque-assist-routes.ts');
  const billingRoutes = read('apps/api/src/routes/billing-routes.ts');
  const web = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  assert.match(registration, /registerTorqueAssistRoutes/);
  assert.match(release, /torqueshed_assist_requests/);
  assert.match(release, /torqueshed_token_ledger_entries/);
  assert.match(release, /operatoros_token_purchase_intents/);
  for (const path of [
    '/torque-assist/status',
    '/token-purchases/checkout',
    '/token-purchases/:id/status',
    '/token-ledger',
    '/token-ledger/reconciliation',
    '/torque-assist',
  ]) {
    assert.ok(routes.includes(`/v1/modules/torqueshed${path}`), path);
  }
  assert.doesNotMatch(routes, /\/v1\/billing\/torque-assist\/webhook/);
  assert.match(billingRoutes, /isTorqueTokenStripeEvent/);
  assert.match(billingRoutes, /receiveVerifiedTorqueTokenStripeEvent/);
  assert.match(billingRoutes, /\/v1\/billing\/webhook/);
  assert.doesNotMatch(routes, /body\.tenantId|input\.tenantId|body\.userId|input\.userId/);
  assert.match(web, /data-testid="torqueshed-torque-assist"/);
  assert.match(web, /Retry without another charge/);
  assert.match(web, /Your previous result was restored; you were not charged again/);
  assert.match(web, /Total credits/);
  assert.match(web, /What we know and what we are assuming/);
  assert.match(web, /Most likely causes/);
  assert.match(web, /Safety warnings/);
  assert.match(web, /Recommended tests/);
  assert.match(web, /Verifying payment/);
  assert.match(web, /Credits added/);
  assert.match(read('apps/web/src/lib/torque-error-translator.ts'), /reference \$\{reference\}/);
  assert.match(client, /getTorqueAssistContext/);
  assert.match(client, /purchaseTorqueTokens/);
  assert.match(client, /runTorqueAssist/);
  assert.match(client, /getTorqueTokenPurchaseStatus/);
});

test('Torque payment reconciliation is dry-run first and live apply is explicitly gated', () => {
  const command = read('apps/api/src/scripts/torque-payment-reconcile.ts');
  const reconciliation = read('apps/api/src/lib/operatoros-token-reconciliation.ts');
  const dbInit = read('apps/api/src/lib/torqueshed-db-init.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['billing:reconcile:torque'], /torque-payment-reconcile/);
  assert.match(command, /--dry-run/);
  assert.match(command, /BILLING_RECONCILIATION_APPLY_CONFIRM/);
  assert.match(reconciliation, /retrieveTorqueStripeReconciliationSnapshot/);
  assert.match(reconciliation, /processWebhookReceiptById/);
  assert.match(reconciliation, /REPROCESS_VERIFIED_RECEIPT/);
  assert.match(dbInit, /uq_torqueshed_token_ledger_purchase_credit/);
  assert.doesNotMatch(reconciliation, /INSERT INTO torqueshed_token_ledger_entries/);
});

test('Phase 43 checkout is server-authoritative, durable, and browser returns are read-only', () => {
  const routes = read('apps/api/src/routes/torque-assist-routes.ts');
  const billing = read('apps/api/src/lib/operatoros-token-billing.ts');
  const checkout = read('apps/api/src/lib/billing-service.ts');
  const ddl = read('apps/api/src/lib/torqueshed-checkout-contract-db-init.ts');
  const web = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');

  assert.match(routes, /!\['diagnosticSessionId', 'packageKey'\]\.includes\(key\)/);
  assert.match(routes, /TORQUE_CHECKOUT_BODY_INVALID/);
  assert.match(billing, /status,idempotency_key[\s\S]*'creating_checkout'/);
  assert.match(billing, /status='checkout_open',checkout_created_at=NOW\(\)/);
  assert.match(billing, /url\.searchParams\.set\('purchase', purchaseId\)/);
  assert.doesNotMatch(billing, /url\.searchParams\.set\('(?:success|tokenPurchase)'/);
  assert.match(checkout, /price: input\.priceId/);
  assert.doesNotMatch(checkout.slice(checkout.indexOf('createUsageCreditCheckoutSession')), /price_data/);
  for (const snapshot of [
    'diagnostic_session_id', 'catalog_version', 'stripe_account_id',
    'provider_product_id', 'provider_price_id', 'success_return_url', 'cancel_return_url',
  ]) assert.match(ddl, new RegExp(snapshot));
  for (const state of [
    'creating_checkout', 'checkout_open', 'payment_pending', 'paid_pending_credit',
    'credited', 'cancelled', 'expired', 'failed', 'refunded', 'disputed',
  ]) assert.match(ddl, new RegExp(`'${state}'`));
  assert.match(web, /Verifying payment/);
  assert.match(web, /Payment received; credits are being applied/);
  assert.match(web, /Credits added/);
  assert.match(web, /Refresh status/);
  assert.match(web, /sessionStorage/);
});

test('Phase 44 settlement proves provider evidence and prevents unexplained negative refunds', () => {
  const billingRoutes = read('apps/api/src/routes/billing-routes.ts');
  const billing = read('apps/api/src/lib/operatoros-token-billing.ts');
  const stripe = read('apps/api/src/lib/billing-service.ts');
  const shared = read('apps/api/src/lib/shared-webhooks.ts');
  const ddl = read('apps/api/src/lib/torqueshed-settlement-db-init.ts');
  const reconciliation = read('apps/api/src/lib/operatoros-token-reconciliation.ts');

  assert.match(billingRoutes, /Buffer\.isBuffer\(rawBody\)/);
  assert.match(billingRoutes, /verifyWebhook\(rawBody, signature\)/);
  assert.match(stripe, /listLineItems\(checkoutSessionId/);
  for (const evidence of [
    'stripe_account_id', 'provider_product_id', 'provider_price_id',
    'catalog_version', 'diagnostic_session_id',
  ]) assert.match(billing, new RegExp(evidence));
  assert.match(billing, /status='processed'.*attempt_count=attempt_count\+1/s);
  assert.match(billing, /pg_advisory_xact_lock/);
  assert.match(shared, /atomically complete its receipt/);
  assert.match(ddl, /torqueshed_credit_policy_holds/);
  assert.match(ddl, /refund_debt/);
  assert.match(ddl, /dispute_freeze/);
  assert.match(billing, /Math\.min\(outstanding, Math\.max\(0,/);
  for (const finding of [
    'PAID_SESSION_NO_CREDIT', 'CREDIT_WITHOUT_PAID_SESSION', 'DUPLICATE_PURCHASE_CREDIT',
    'PAYMENT_AMOUNT_MISMATCH', 'CHECKOUT_PRICE_MISMATCH', 'PURCHASE_STUCK_PENDING',
    'REFUND_WITHOUT_POLICY_STATE', 'STRIPE_ACCOUNT_MISMATCH', 'ORPHAN_PROVIDER_SESSION',
    'NEGATIVE_LEDGER_BALANCE',
  ]) assert.match(reconciliation, new RegExp(`'${finding}'`));
  assert.match(reconciliation, /REPROCESS_VERIFIED_RECEIPT/);
  assert.doesNotMatch(reconciliation, /INSERT INTO torqueshed_token_ledger_entries/);
});

test('Phase 45 reserves bounded credits and translates actionable failures', () => {
  const service = read('apps/api/src/lib/torque-assist-service.ts');
  const domain = read('apps/api/src/lib/torque-assist-domain.ts');
  const ddl = read('apps/api/src/lib/torqueshed-reservation-db-init.ts');
  const routes = read('apps/api/src/routes/torque-assist-routes.ts');
  const reaper = read('apps/api/src/lib/torque-assist-reservation-reaper.ts');
  const web = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');
  const translator = read('apps/web/src/lib/torque-error-translator.ts');

  assert.match(ddl, /CREATE TABLE IF NOT EXISTS torqueshed_token_reservations/);
  assert.match(ddl, /status IN \('active','settled','released','expired'\)/);
  assert.match(ddl, /consumed_units \+ released_units <= reserved_units/);
  assert.match(ddl, /uq_torqueshed_token_reservation_idempotency/);
  assert.match(domain, /estimateTorqueAssistMaximumUnits/);
  assert.match(domain, /TORQUE_ASSIST_MAX_OUTPUT_UNITS/);
  assert.match(service, /availableUnits: Math\.max\(0, ledgerBalance - reservedUnits\)/);
  assert.match(service, /status='settled',consumed_units=\$\{actualUnits\},released_units=\$\{releasedUnits\}/);
  assert.match(service, /status='released',consumed_units=0,released_units=reserved_units/);
  assert.match(service, /ON CONFLICT \(tenant_id,assist_request_id\) WHERE entry_kind='debit' DO NOTHING/);
  assert.match(service, /provider_receipt_json/);
  assert.match(service, /TORQUE_ASSIST_PROVIDER_TIMEOUT/);
  assert.match(service, /TORQUE_ASSIST_RESPONSE_INVALID/);
  assert.match(routes, /consumptionMode: 'paid_credits_only'/);
  assert.match(reaper, /setInterval/);
  assert.match(web, /Promise\.allSettled/);
  assert.match(web, /No credits were consumed for this failed request/);
  assert.match(web, /More credits required/);
  assert.doesNotMatch(web, /function errorText/);
  for (const code of [
    'TORQUE_ASSIST_CREDITS_REQUIRED', 'TORQUE_ASSIST_RESERVATION_CONFLICT',
    'TORQUE_ASSIST_RATE_LIMITED', 'TORQUE_ASSIST_PROVIDER_DISABLED',
    'TORQUE_ASSIST_PROVIDER_UNAVAILABLE', 'TORQUE_ASSIST_PROVIDER_TIMEOUT',
    'TORQUE_ASSIST_RESPONSE_INVALID', 'TORQUE_ASSIST_CONTEXT_INVALID',
    'TORQUE_ASSIST_SESSION_NOT_FOUND', 'TORQUE_ASSIST_FORBIDDEN',
    'TORQUE_ASSIST_REQUEST_CONFLICT',
  ]) assert.match(translator, new RegExp(code));
});
