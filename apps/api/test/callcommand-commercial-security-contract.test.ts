import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateCallCommandCapacity } from '../src/lib/callcommand-capacity.js';

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const commercialRoutes = readSource('../src/routes/callcommand-commercial-routes.ts');
const billingRoutes = readSource('../src/routes/billing-routes.ts');
const laneBilling = readSource('../src/lib/callcommand-lane-billing.ts');
const phase35Routes = readSource('../src/routes/callcommand-phase35-routes.ts');
const commercialSchema = readSource('../src/lib/callcommand-commercial-db-init.ts');
const automationPolicy = readSource('../src/lib/callcommand-automation-policy.ts');
const managedNumberSchema = readSource('../src/lib/callcommand-managed-number-db-init.ts');
const numberBilling = readSource('../src/lib/callcommand-number-billing.ts');

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing contract start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing contract end: ${end}`);
  return source.slice(from, to);
}

test('commercial workspace response masks provider identity and excludes credential references', () => {
  const camel = between(commercialRoutes, 'function camel(', 'function fail(');
  for (const serverOnlyColumn of [
    'tenant_id', 'phone_e164', 'secret_reference_id', 'destination_fingerprint', 'provider_account_sid',
  ]) {
    assert.match(camel, new RegExp(`['\"]${serverOnlyColumn}['\"]`));
  }

  const workspace = between(
    commercialRoutes,
    "app.get(`${base}/commercial/workspace`",
    "app.post(`${base}/commercial/numbers/search`",
  );
  const response = workspace.slice(workspace.lastIndexOf('\n      return {'));
  assert.match(
    response,
    /providerAccounts:\s*accounts\.map\(row => \(\{ \.\.\.camel\(row\), providerAccountMasked: maskedAccountSid\(row\.provider_account_sid\) \}\)\)/,
  );
  assert.match(workspace, /credential_ready/);
  assert.match(workspace, /c\.product_mode='general'/);
  assert.match(workspace, /capabilities: \{ canWrite, canAdmin, moduleAccessLevel \}/);
  assert.match(workspace, /a\.id IS NOT NULL AND a\.status='active' AND a\.health_status='healthy'/);
  assert.doesNotMatch(response, /authToken|auth_token|secretReferenceId|secret_reference_id\s*:/);
  assert.doesNotMatch(response, /providerAccountSid\s*:|provider_account_sid\s*:/);
  assert.doesNotMatch(response, /phoneE164\s*:|phone_e164\s*:/);
});

test('transfer verification code is ephemeral and only an approved provider result verifies a target', () => {
  const check = between(
    commercialRoutes,
    "app.post(`${base}/transfer-targets/:id/verification/check`",
    "app.patch(`${base}/commercial/runtime-settings`",
  );
  assert.match(check, /const code = String\(value\.code \?\? ''\)\.trim\(\)/);
  assert.match(check, /checkTwilioVerification\(String\(target\.phone_e164\), code\)/);
  for (const match of check.matchAll(/sql`([\s\S]*?)`/g)) {
    assert.doesNotMatch(match[1], /\$\{code\}|verification_code|challenge_code|plaintext_code/i);
  }
  assert.doesNotMatch(check, /console\.(?:log|info|warn|error)\([^)]*code/i);
  assert.match(check, /const approved = provider\.status === 'approved' && provider\.ok/);
  assert.match(
    check,
    /if \(approved\) \{[\s\S]*?UPDATE callcommand_transfer_targets SET verified_at=NOW\(\),updated_at=NOW\(\)[\s\S]*?WHERE tenant_id=\$\{tenant\(request\)\} AND id=\$\{targetId\} AND status='active'/,
  );
  assert.match(
    check,
    /\{ verificationId: String\(target\.verification_id\), approved, terminalFailure, attemptCount: attempts \}/,
  );
  assert.doesNotMatch(check, /\{[^{}]*verificationId:[^{}]*code[,}]/);
  assert.match(check, /providerActionConfirmed: true/);
  assert.match(check, /if \(!approved\)[\s\S]*?providerActionConfirmed: false/);
});

test('forward overflow accepts only a verified active external target in the current tenant', () => {
  const runtime = between(
    commercialRoutes,
    "app.patch(`${base}/commercial/runtime-settings`",
    "app.post(`${base}/commercial/lane-checkout`",
  );
  assert.match(runtime, /overflowPolicy === 'forward'/);
  assert.match(runtime, /WHERE tenant_id=\$\{tenant\(request\)\} AND id=\$\{forwardTargetId\} AND kind='external'/);
  assert.match(runtime, /AND status='active' AND verified_at IS NOT NULL AND deleted_at IS NULL LIMIT 1/);
  assert.match(runtime, /CALLCOMMAND_OVERFLOW_TARGET_UNAVAILABLE/);
  assert.match(runtime, /overflow_forward_target_id=EXCLUDED\.overflow_forward_target_id/);
  assert.match(runtime, /activationChannelId/);
  assert.match(runtime, /c\.id=\$\{activationChannelId\}/);
  assert.match(runtime, /p\.product_mode='general'/);
  assert.match(runtime, /f\.product_mode='general'/);
  assert.match(runtime, /c\.provider_number_status='active'/);
  assert.match(runtime, /c\.health_status='healthy'/);
  assert.match(runtime, /db\.transaction\(async tx/);
  assert.match(runtime, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(runtime, /FOR UPDATE OF c,p,f,a,secret/);
  assert.ok(runtime.indexOf('const saved = await db.transaction') < runtime.indexOf('SELECT c.id'));
  assert.match(runtime, /UPDATE callcommand_channels SET status='active'/);
  assert.doesNotMatch(runtime, /WHERE id=\$\{forwardTargetId\}(?![\s\S]*tenant_id)/);
});

test('cost-bearing number and lane operations require explicit server-side confirmation', () => {
  const provision = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/provision`",
    "app.post(`${base}/commercial/numbers/connect`",
  );
  assert.match(provision, /confirmRecurringProviderCharge !== true/);
  assert.match(provision, /CALLCOMMAND_NUMBER_RECURRING_CHARGE_NOT_CONFIRMED/);
  assert.match(provision, /rawIdempotencyKey = value\.idempotencyKey \?\? request\.headers\['idempotency-key'\]/);
  assert.match(provision, /CALLCOMMAND_NUMBER_IDEMPOTENCY_KEY_INVALID/);
  assert.doesNotMatch(provision, /provision:\$\{request\.id\}/);
  assert.match(provision, /phone_e164,phone_masked,status/);
  assert.match(provision, /String\(row\.phone_e164 \?\? ''\) !== phone/);
  assert.match(provision, /CALLCOMMAND_NUMBER_IDEMPOTENCY_CONFLICT/);
  assert.ok(
    provision.indexOf('CALLCOMMAND_NUMBER_IDEMPOTENCY_CONFLICT')
      < provision.indexOf("if (row.status === 'completed'"),
  );

  const lane = between(
    commercialRoutes,
    "app.post(`${base}/commercial/lane-checkout`",
    '\n}\n',
  );
  assert.match(lane, /confirmPaidLaneQuantity !== true/);
  assert.match(lane, /CALLCOMMAND_LANE_QUANTITY_NOT_CONFIRMED/);

  const release = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/:id/release`",
    "app.patch(`${base}/profiles/:id`",
  );
  assert.match(release, /confirmationText \?\? ''/);
  assert.match(release, /'RELEASE NUMBER'/);
  assert.match(release, /confirmRelease !== true/);
  assert.match(release, /CALLCOMMAND_NUMBER_RELEASE_NOT_CONFIRMED/);
});

test('profile and channel mutation preserve general and MSP product-mode boundaries', () => {
  const profiles = between(
    commercialRoutes,
    "app.patch(`${base}/profiles/:id`",
    "app.post(`${base}/profiles/:id/knowledge`",
  );
  assert.match(profiles, /productMode !== String\(current\.product_mode \?\? 'general'\)/);
  assert.match(profiles, /CALLCOMMAND_PROFILE_PRODUCT_MODE_IMMUTABLE/);

  const channels = between(
    phase35Routes,
    "app.patch(`${base}/channels/:id`",
    "app.post(`${base}/profiles`",
  );
  assert.match(channels, /product_mode=\$\{String\(row\.product_mode\)\}/);
  assert.match(channels, /CALLCOMMAND_CHANNEL_PROFILE_MODE_MISMATCH/);
  assert.match(channels, /CALLCOMMAND_CHANNEL_FLOW_MODE_MISMATCH/);

  const provision = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/provision`",
    "app.post(`${base}/commercial/numbers/connect`",
  );
  assert.match(provision, /resolveProvisioningAgentAndFlow\(request, value\)/);
  const onboarding = between(
    commercialRoutes,
    'async function resolveProvisioningAgentAndFlow(',
    'export async function registerCallCommandCommercialRoutes',
  );
  assert.match(onboarding, /tenant_id=\$\{tenant\(request\)\} AND id=\$\{profileId\} AND product_mode='general'/);
  assert.match(onboarding, /tenant_id=\$\{tenant\(request\)\} AND id=\$\{flowId\} AND product_mode='general'/);
  assert.match(onboarding, /'AI Receptionist'/);
  assert.match(onboarding, /'General Reception'/);
  const connect = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/connect`",
    "app.post(`${base}/commercial/numbers/:id/health`",
  );
  assert.match(connect, /id=\$\{profileId\} AND product_mode='general'/);
  assert.match(connect, /AND status='active' AND deleted_at IS NULL/);
});

test('BYO connection type and commercial alert ownership are durable database contracts', () => {
  assert.match(commercialSchema, /ADD COLUMN IF NOT EXISTS connection_type VARCHAR\(24\)/);
  assert.match(commercialSchema, /connection_type IN \('forwarding','twilio_transfer','sip','port'\)/);
  assert.match(commercialSchema, /BYON_TWILIO_TRANSFER_SETUP_REQUIRED/);
  assert.match(commercialSchema, /ADD COLUMN IF NOT EXISTS managed_key VARCHAR\(200\)/);
  assert.match(commercialSchema, /CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_rule_managed_key/);

  const managedAlerts = between(
    commercialRoutes,
    "app.put(`${base}/commercial/channels/:channelId/alert-rule`",
    "app.get(`${base}/profiles/:id/knowledge`",
  );
  assert.match(managedAlerts, /conditions_json,actions_json,managed_key/);
  assert.match(managedAlerts, /ON CONFLICT \(tenant_id,managed_key\)/);
  assert.match(managedAlerts, /JSON\.stringify\(\{ channelId \}\)/);
  assert.match(managedAlerts, /\['email', 'slack', 'webhook'\]/);
  assert.match(automationPolicy, /CALLCOMMAND_RULE_EMAIL_INVALID/);
  assert.match(automationPolicy, /endpoint\.tenant_id=\$\{input\.tenantId\}/);
  assert.match(automationPolicy, /endpoint\.enabled=TRUE AND endpoint\.archived_at IS NULL/);
});

test('lane checkout treats UI quantity as additional lanes and pending quantity grants no capacity', () => {
  const route = between(
    commercialRoutes,
    "app.post(`${base}/commercial/lane-checkout`",
    '\n}\n',
  );
  assert.match(route, /const additionalLanes = Number\(value\.additionalLanes \?\? value\.quantity\)/);
  assert.match(route, /additionalLanes,/);
  assert.match(route, /confirmCancelPaidLanes !== true/);
  assert.match(route, /idempotencyKey: String\(value\.idempotencyKey \?\? request\.headers\['idempotency-key'\]/);
  assert.match(route, /confirmPaidLaneQuantity !== true/);
  assert.match(route, /capacityGranted: false/);
  assert.match(route, /capacity remains unchanged until signed payment settlement/);

  const checkout = between(
    laneBilling,
    'export async function createOrUpdateCallCommandLaneCheckout(',
    'function eventMetadata(',
  );
  assert.match(checkout, /const quantity = additionalLaneQuantity\(input\.additionalLanes\)/);
  assert.match(checkout, /\$\{input\.tenantId\}, 1, 0, \$\{quantity\}, 'pending'/);
  assert.match(checkout, /pending_additional_lanes = EXCLUDED\.pending_additional_lanes/);
  assert.match(checkout, /items: \[\{ id: String\(current\.stripe_subscription_item_id\), quantity \}\]/);
  assert.match(checkout, /line_items: \[\{ price: priceId, quantity \}\]/);
  assert.doesNotMatch(checkout, /\badditional_lanes\s*=\s*EXCLUDED\.pending_additional_lanes/);

  assert.deepEqual(calculateCallCommandCapacity({
    baseLanes: 1,
    additionalLanes: 0,
    pendingAdditionalLanes: 12,
    billingStatus: 'pending',
  }), {
    baseLanes: 1,
    additionalLanes: 0,
    pendingAdditionalLanes: 12,
    effectiveLanes: 1,
    admittedLanes: 1,
    admittedAdditionalLanes: 0,
    pendingLanesGrantCapacity: false,
  });
});

test('lane settlement is reachable only after central raw-signature verification and event claim', () => {
  const webhookStart = billingRoutes.indexOf("app.post('/v1/billing/webhook'");
  assert.notEqual(webhookStart, -1);
  const webhook = billingRoutes.slice(webhookStart);
  const signature = webhook.indexOf("request.headers['stripe-signature']");
  const rawBody = webhook.indexOf('(request as any).rawBody');
  const verified = webhook.indexOf('paymentAdapter.verifyWebhook(rawBody, signature)');
  const claimed = webhook.indexOf('claimStripeEvent(event, classification)');
  const dispatched = webhook.indexOf('processCallCommandLaneWebhookEvent(event)');
  assert.ok(signature >= 0 && rawBody > signature && verified > rawBody && claimed > verified && dispatched > claimed);
  assert.match(webhook, /if \(isDuplicate\)[\s\S]*?duplicate_ignored/);
  assert.match(webhook, /classification\.isFeatureAddon[\s\S]*?classification\.featureKey === CALLCOMMAND_NUMBER_FEATURE_KEY[\s\S]*?processCallCommandNumberWebhookEvent\(event\)[\s\S]*?processCallCommandLaneWebhookEvent\(event\)/);

  const settlement = between(
    laneBilling,
    'export async function processCallCommandLaneWebhookEvent(',
    'export function isCallCommandLaneStripeEvent(',
  );
  const paid = between(
    settlement,
    "if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded')",
    "if (event.type === 'invoice.payment_failed')",
  );
  assert.match(paid, /additional_lanes = \$\{quantity\}/);
  assert.match(paid, /pending_additional_lanes = 0/);
  assert.match(paid, /billing_status = 'active'/);
  assert.match(paid, /WHERE tenant_id = \$\{tenantId\} AND \$\{created\} >= last_stripe_event_created/);
  assert.match(settlement, /last_stripe_event_created = GREATEST\(last_stripe_event_created, \$\{created\}\)/);
  assert.ok((settlement.match(/\$\{created\} >= last_stripe_event_created/g) ?? []).length >= 4);

  const observed = between(
    settlement,
    "if (\n    event.type === 'checkout.session.completed'",
    "return { handled: false, error: `Unhandled CallCommand lane event type",
  );
  assert.doesNotMatch(observed, /additional_lanes\s*=\s*\$\{quantity\}/);
});

test('managed-number persistence separates provider, routing, billing, release, and reconciliation truth', () => {
  for (const column of [
    'lifecycle_state', 'billing_status', 'billing_grace_expires_at', 'provider_config_hash',
    'release_scheduled_at', 'released_at', 'provisioning_state', 'request_hash',
    'compensation_status', 'reconciliation_status', 'lease_expires_at',
  ]) assert.match(managedNumberSchema, new RegExp(column));
  for (const state of [
    'REQUESTED', 'PROVISIONING', 'PROVIDER_PROVISIONED', 'CONFIGURING_ROUTING',
    'CONFIGURING_BILLING', 'TESTING', 'ACTIVE', 'PROVISION_FAILED', 'ROUTING_FAILED',
    'BILLING_FAILED', 'ACTION_REQUIRED', 'SUSPENDED', 'RELEASE_PENDING', 'RELEASED',
    'RECONCILIATION_REQUIRED',
  ]) assert.match(managedNumberSchema, new RegExp(`'${state}'`));
  assert.match(managedNumberSchema, /CREATE TABLE IF NOT EXISTS callcommand_number_billing_entitlements/);
  assert.match(managedNumberSchema, /CREATE TABLE IF NOT EXISTS callcommand_number_reconciliation_issues/);
  assert.match(managedNumberSchema, /FOREIGN KEY \(tenant_id,requested_profile_id\)/);
  assert.match(managedNumberSchema, /FOREIGN KEY \(tenant_id,requested_flow_id\)/);
  assert.match(managedNumberSchema, /uq_callcommand_number_order_provider_number_provision/);
  assert.match(managedNumberSchema, /GREATEST\(active_local_numbers-included_local_numbers,0\)/);
});

test('provisioning prevents paid provider mutation before billing and recovers an ambiguous response by inventory', () => {
  const provision = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/provision`",
    "app.post(`${base}/commercial/numbers/connect`",
  );
  const billingGate = provision.indexOf('CALLCOMMAND_NUMBER_BILLING_REQUIRED');
  const providerPurchase = provision.indexOf('numberProvider().provisionNumber');
  assert.ok(billingGate >= 0 && providerPurchase > billingGate);
  assert.match(provision, /licensed_billable_local_quantity/);
  assert.match(provision, /licensed_billable_toll_free_quantity/);
  assert.match(provision, /numberProvider\(\)\.listNumbers/);
  assert.match(provision, /inventory\.find\(number => number\.phoneNumber === phone\)/);
  assert.match(provision, /provider_operation_reference='recovered_by_inventory'/);
  assert.match(provision, /CALLCOMMAND_NUMBER_INVENTORY_CHANGED/);
  assert.match(provision, /NUMBER_PERSISTENCE_RECONCILIATION_REQUIRED/);
  assert.match(provision, /callcommand_number_reconciliation_issues/);
});

test('managed-number release is delayed, cancelable, and decrements billing only after provider confirmation', () => {
  const schedule = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/:id/release`",
    "app.post(`${base}/commercial/numbers/:id/release/cancel`",
  );
  assert.match(schedule, /managedNumberReleaseAt\(\)/);
  assert.match(schedule, /lifecycle_state='RELEASE_PENDING'/);
  assert.doesNotMatch(schedule, /releaseNumber\(/);
  const cancel = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/:id/release/cancel`",
    "app.post(`${base}/commercial/numbers/:id/release/execute`",
  );
  assert.match(cancel, /lifecycle_state='ACTION_REQUIRED'/);
  assert.match(cancel, /RELEASE_CANCELED_REVALIDATION_REQUIRED/);
  const execute = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/:id/release/execute`",
    "app.patch(`${base}/profiles/:id`",
  );
  const providerRelease = execute.indexOf('numberProvider().releaseNumber');
  const billingUpdate = execute.indexOf('requestCallCommandNumberBilling');
  assert.ok(providerRelease >= 0 && billingUpdate > providerRelease);
  assert.match(execute, /provider_number_status='released'/);
  assert.match(execute, /billing_quantity_drift/);
});

test('reconciliation is tenant-scoped and only routing drift is auto-repaired', () => {
  const reconcile = between(
    commercialRoutes,
    "app.post(`${base}/commercial/numbers/reconcile`",
    "app.post(`${base}/commercial/numbers/:id/release`",
  );
  assert.match(reconcile, /tenant_id=\$\{tenant\(request\)\}/);
  assert.match(reconcile, /provider_orphan_number/);
  assert.match(reconcile, /database_number_missing_at_provider/);
  assert.match(reconcile, /stale_number_operation/);
  assert.match(reconcile, /billing_quantity_drift/);
  assert.match(reconcile, /numberProvider\(\)\.updateRouting/);
  assert.doesNotMatch(reconcile, /releaseNumber\(/);
});

test('signed billing settlement grants quantities and payment failure starts grace without releasing numbers', () => {
  const settlement = between(
    numberBilling,
    'export async function processCallCommandNumberWebhookEvent(',
    'export function isCallCommandNumberStripeEvent(',
  );
  assert.match(settlement, /invoice\.paid/);
  assert.match(settlement, /licensed_billable_local_quantity=\$\{local\}/);
  assert.match(settlement, /licensed_billable_toll_free_quantity=\$\{tollFree\}/);
  assert.match(settlement, /billing_status='grace_period'/);
  assert.match(settlement, /CALLCOMMAND_NUMBER_BILLING_GRACE_DAYS|callCommandNumberBillingGraceDays/);
  assert.match(settlement, /customer\.subscription\.deleted/);
  assert.match(settlement, /lifecycle_state='SUSPENDED'/);
  assert.doesNotMatch(settlement, /releaseNumber\(/);
});

test('managed commercial inbound routing enforces lifecycle and number billing authority', () => {
  const incoming = between(
    phase35Routes,
    "app.post('/v1/modules/callcommand-ai/twilio/voice/incoming'",
    "app.post('/v1/modules/callcommand-ai/twilio/voice/consent'",
  );
  assert.match(incoming, /c\.lifecycle_state='ACTIVE'/);
  assert.match(incoming, /c\.billing_status IN \('included','active'\)/);
  assert.match(incoming, /c\.billing_status='grace_period' AND c\.billing_grace_expires_at>NOW\(\)/);
});
