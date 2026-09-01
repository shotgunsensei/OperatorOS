import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const contract = read('apps/web/src/components/module-shells/CallCommandRoute.contract.ts');
const commercial = read('apps/web/src/components/module-shells/CallCommandCommercialWorkspace.tsx');
const legacy = read('apps/web/src/components/module-shells/CallCommandWorkspace.tsx');
const client = read('apps/web/src/lib/auth.ts');
const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');

test('CallCommand exposes plain-language commercial routes while preserving MSP assurance', () => {
  for (const route of ['/setup', '/numbers', '/agents', '/workflows', '/calls', '/usage', '/health', '/organizations', '/providers', '/compliance']) {
    assert.match(contract, new RegExp(route.replaceAll('/', '\\/')));
  }
  for (const label of ['Set up CallCommand', 'Phone numbers', 'AI receptionists', 'Call workflows', 'Calls and history', 'Usage and billing', 'Health and readiness']) {
    assert.match(contract, new RegExp(label));
  }
});

test('prefixed-module compatibility routes converge on commercial canonicals', () => {
  for (const [legacy, canonical] of [
    ['/onboarding', '/setup'], ['/profiles', '/agents'], ['/receptionist-profiles', '/agents'],
    ['/automations', '/workflows'], ['/flows', '/workflows'], ['/automation-rules', '/workflows'],
    ['/channels', '/numbers'], ['/recordings', '/calls'], ['/transcripts', '/calls'], ['/analysis', '/calls'],
    ['/billing', '/usage'], ['/readiness', '/health'], ['/integrations/health', '/health'],
  ]) {
    const escapedLegacy = legacy.replaceAll('/', '\\/');
    const escapedCanonical = canonical.replaceAll('/', '\\/');
    assert.match(routeMap, new RegExp(`'${escapedLegacy}'.*redirectPath: '${escapedCanonical}'`));
  }
  for (const mspPath of ['/organizations', '/msp/organizations', '/contacts', '/msp/contacts', '/msp/onboarding', '/compliance', '/msp/policy', '/msp/audit', '/settings']) {
    assert.match(routeMap, new RegExp(mspPath.replaceAll('/', '\\/')));
  }
  assert.match(contract, /\['numbers', 'channels', 'transfer-targets'\]/);
  assert.match(contract, /'\/channels': '\/numbers'/);
  assert.doesNotMatch(contract, /'\/channels': '\/workflows'/);
});

test('CallCommand commercial client covers number onboarding, verification, health, lanes, and mutable configuration', () => {
  for (const path of [
    '/product/commercial/workspace', '/product/commercial/numbers/search', '/product/commercial/numbers/provision',
    '/product/commercial/numbers/connect', '/product/commercial/numbers/billing', '/product/commercial/numbers/reconcile',
    '/repair', '/release', '/release/cancel', '/release/execute',
    '/verification/start', '/verification/check', '/product/commercial/lane-checkout',
    '/alert-rule',
  ]) assert.match(client, new RegExp(path.replaceAll('/', '\\/')));
  assert.match(client, /productUpdateProfile/);
  assert.match(client, /productUpdateRule/);
  for (const action of ['commercialRepairNumber', 'commercialReconcileNumbers', 'commercialNumberBilling', 'commercialCancelNumberRelease', 'commercialExecuteNumberRelease']) {
    assert.match(client, new RegExp(action));
  }
});

test('commercial activation is provider-honest and makes workflow/call detail real', () => {
  const activationStart = commercial.indexOf('async function activateWorkflow()');
  const alertValidationStart = commercial.indexOf('function validateAlertSettings()');
  const alertSaveStart = commercial.indexOf('async function saveAlertSettings()');
  const transferStart = commercial.indexOf('async function createTransferTarget()');
  assert.ok(activationStart >= 0 && alertValidationStart > activationStart);
  assert.ok(alertSaveStart > alertValidationStart && transferStart > alertSaveStart);
  const activation = commercial.slice(
    activationStart,
    alertValidationStart,
  );
  const alertSave = commercial.slice(
    alertSaveStart,
    transferStart,
  );
  assert.match(activation, /productUpdateChannel\(flow\.channelId, \{ activeFlowId: flowId \}\)/);
  assert.doesNotMatch(activation, /validateAlertSettings|commercialUpsertAlertRule|alertActions\(\)/);
  assert.match(alertSave, /validateAlertSettings\(\)/);
  assert.match(alertSave, /commercialUpsertAlertRule\(flow\.channelId, \{ actions: alertActions\(\) \}\)/);
  assert.equal((commercial.match(/commercialUpsertAlertRule\(/g) ?? []).length, 1);
  assert.match(commercial, /Channel alert settings saved without rebuilding the assigned workflow/);
  assert.match(commercial, /commercial_channel_alerts:/);
  assert.match(commercial, /productCall\(selectedCallId\)/);
  assert.match(commercial, /Simulation · no external call/);
  assert.match(commercial, /providerReady && numberVerified && routingVerified/);
  assert.match(commercial, /activationChannelId: activeChannel\.id/);
  assert.match(commercial, /selectedCommercialNumber\?\.providerNumberStatus === 'active'/);
  assert.match(commercial, /selectedCommercialNumber\?\.healthStatus === 'healthy'/);
  assert.match(commercial, /selectedCommercialNumber\?\.providerReady === true/);
  assert.match(commercial, /Go Live locked/);
  assert.doesNotMatch(commercial, /verified\s*:\s*true/);
  assert.doesNotMatch(commercial, /productProcessCall/);
  assert.doesNotMatch(legacy, /verified\s*:\s*true/);
  assert.doesNotMatch(legacy, /productProcessCall/);
});

test('capacity and pricing remain API-derived', () => {
  assert.match(commercial, /additionalLaneMonthly/);
  assert.match(commercial, /lanePrice === null/);
  assert.doesNotMatch(commercial, /\$49|49\.00/);
});

test('commercial UI preserves product-mode, authorization, and cost-confirmation boundaries', () => {
  assert.match(commercial, /filter\(isGeneralProduct\)/);
  assert.match(commercial, /commercial\?\.capabilities\?\.canWrite === true/);
  assert.match(commercial, /commercial\?\.capabilities\?\.canAdmin === true/);
  assert.doesNotMatch(commercial, /activeRole !== 'viewer'|useTenant\(|useAuth\(/);
  assert.match(commercial, /confirmRecurringProviderCharge: true/);
  for (const label of ['Get New Number', 'Forward Existing', 'Connect Provider', 'Call It Now', 'Safe auto-repair']) {
    assert.match(commercial, new RegExp(label));
  }
  assert.match(commercial, /numberType: 'local' as 'local' \| 'toll_free'/);
  assert.match(commercial, /first local number is included/i);
  assert.match(commercial, /CALLCOMMAND_NUMBER_INVENTORY_CHANGED/);
  assert.match(commercial, /commercialNumberBilling/);
  assert.match(commercial, /commercialCancelNumberRelease/);
  assert.match(commercial, /commercialExecuteNumberRelease/);
  assert.match(commercial, /uiIdempotencyKey/);
  assert.match(commercial, /commercialReleaseNumber/);
  assert.match(commercial, /RELEASE NUMBER/);
  assert.match(commercial, /cost\.monthlyAmount/);
  assert.match(commercial, /confirmPaidLaneQuantity: true/);
  assert.match(commercial, /desired paid quantity/i);
  assert.match(commercial, /canAdmin && !busy/);
  assert.match(commercial, /aria-pressed/);
  assert.match(commercial, /detailLoading/);
  assert.doesNotMatch(commercial, /const actions: Row\[] = \[\{ actionType: selected\.action/);
  assert.doesNotMatch(commercial, /productCreateRule\(/);
});
