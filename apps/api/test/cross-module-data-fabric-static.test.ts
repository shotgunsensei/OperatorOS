import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root,path),'utf8');

test('Phase 38 registers every named native workflow and never auto-executes scripts', () => {
  const fabric = read('apps/api/src/lib/cross-module-data-fabric.ts');
  const adapters = read('apps/api/src/lib/cross-module-workflow-adapters.ts');
  for (const workflow of [
    'tradeflowkit.job_to_snapproof','snapproof.approved_report_to_tradeflowkit',
    'callcommand.analysis_to_tradeflowkit','callcommand.analysis_to_pulsedesk','callcommand.analysis_to_techdeck',
    'support.resolved_to_faultlinelab','torqueshed.diagnostic_to_snapproof','torqueshed.diagnostic_to_faultlinelab',
    'brandforgeos.campaign_to_launchkit','ninjamation.script_to_techdeck',
  ]) {
    assert.match(fabric,new RegExp(workflow.replaceAll('.','\\.')));
    assert.match(adapters,new RegExp(workflow.replaceAll('.','\\.')));
  }
  assert.match(adapters,/no execution performed/i);
  assert.match(adapters,/executionAllowed:\s*false/);
  assert.match(adapters,/FABRIC_PULSEDESK_OPERATIONS_REVIEW_REQUIRED/);
  assert.match(adapters,/operationsOnlyApproved\s*!==\s*true/);
  assert.match(adapters,/FABRIC_PRIVACY_REVIEW_REQUIRED/);
  assert.match(adapters,/privacyReviewed\s*!==\s*true/);
  assert.match(adapters,/FABRIC_SOURCE_VERSION_CHANGED/);
  assert.match(adapters,/FABRIC_SIMULATION_SOURCE_REJECTED/);
  assert.match(adapters,/call\.provider[\s\S]*simulator/);
  assert.ok((adapters.match(/assertExpectedSourceVersion\(context,/g) ?? []).length >= 8);
  assert.match(adapters,/FABRIC_PROVENANCE_MISMATCH/);
  assert.match(adapters,/sourceContext\.sourceModule\s*!==\s*['"]tradeflowkit['"]/);
  assert.doesNotMatch(adapters,/redactionVerified/);
  assert.match(adapters,/basicIdentifierMaskingApplied/);
  assert.match(adapters,/\/modules\/faultlinelab\/authoring\/\$\{challengeId\}`/);
  assert.doesNotMatch(adapters,/\/modules\/faultlinelab\/challenges\/\$\{challengeId\}/);
  assert.match(adapters,/\/modules\/techdeck\/runbooks\/\$\{documentId\}`/);
  assert.doesNotMatch(adapters,/\/modules\/techdeck\/docs\//);
  assert.doesNotMatch(adapters,/(?:exec|spawn|execFile|fork)\s*\(/);
  assert.equal((fabric.match(/actionLabel:/g) ?? []).length, 10);
  assert.equal((fabric.match(/outcome:/g) ?? []).length, 10);
  assert.equal((fabric.match(/prerequisites:/g) ?? []).length, 10);
  const workflowContracts = fabric.slice(0,fabric.indexOf('} as const);'));
  assert.equal((workflowContracts.match(/idempotencyScope: 'tenant'/g) ?? []).length, 9);
  assert.equal((workflowContracts.match(/idempotencyScope: 'actor'/g) ?? []).length, 1);
  assert.match(fabric,/brandforgeos\.campaign_to_launchkit[\s\S]{0,500}idempotencyScope: 'actor'/);
});

test('Faultline handoffs create useful private drafts but require a trainer-authored revision before publication', () => {
  const adapters = read('apps/api/src/lib/cross-module-workflow-adapters.ts');
  const routes = read('apps/api/src/routes/faultlinelab-routes.ts');

  assert.match(adapters, /parseFaultlineChallengeContent\(\{/);
  assert.match(adapters, /plausibleCauseChoices/);
  assert.match(adapters, /unvalidated source candidate/);
  assert.match(adapters, /unvalidated option/g);
  assert.match(adapters, /review reported condition/);
  assert.match(adapters, /compare recorded diagnosis/);
  assert.match(adapters, /inspect observation \$\{index \+ 1\}/);
  assert.match(adapters, /Separate symptom from cause/);
  assert.match(adapters, /Use the strongest observation/);
  assert.match(adapters, /Challenge the recorded diagnosis/);
  assert.match(adapters, /Close the evidence loop/);
  assert.match(adapters, /FROM techdeck_ticket_comments/);
  assert.match(adapters, /FROM techdeck_evidence/);
  assert.match(adapters, /FROM pulsedesk_ticket_messages/);
  assert.match(adapters, /FROM torqueshed_diagnostic_entries/);
  assert.match(adapters, /FROM torqueshed_diagnostic_trouble_codes/);
  assert.doesNotMatch(adapters, /Replace this placeholder/);
  assert.doesNotMatch(adapters, /Draft created from \$\{input\.sourceId\}/);
  assert.doesNotMatch(adapters, /output: `Source: \$\{input\.sourceId\}`/);

  assert.match(adapters, /valid: false/);
  assert.match(adapters, /importedWorkflowDraft: true/);
  assert.match(adapters, /requiresAuthorReview: true/);
  assert.match(adapters, /structuralValidationPassed: true/);
  assert.match(routes, /WHERE tenant_id=\$\{tenant\(request\)\} AND challenge_id=\$\{id\} AND version_number=\$\{versionNumber\}/);
  assert.match(routes, /storedReview\.importedWorkflowDraft === true && storedReview\.requiresAuthorReview === true/);
  assert.match(routes, /FAULTLINE_IMPORTED_DRAFT_REVIEW_REQUIRED/);
});

test('adapter completion messages use customer language while audit metadata retains technical provenance', () => {
  const adapters = read('apps/api/src/lib/cross-module-workflow-adapters.ts');
  for (const internalPhrase of [
    'with versioned provenance',
    'plan-aware Deploy Ops release package',
    'evidence briefs',
    'checksum-verified SnapProofOS PDF',
    'analyzed call intelligence',
  ]) assert.doesNotMatch(adapters, new RegExp(`summary:[^\\n]*${internalPhrase}`, 'i'));
  assert.match(adapters, /summary: 'Added the approved SnapProofOS PDF to the TradeFlowKit job'/);
  assert.match(adapters, /summary: `Created a Deploy Ops campaign package with \$\{visuals\.length\} ready-to-review creative options`/);
  assert.match(adapters, /summary: 'Created a private TechDeck runbook draft for review; nothing was executed'/);
  assert.match(adapters, /appliedSourceVersion/);
  assert.match(adapters, /workflowRunId/);
  assert.match(adapters, /content_sha256/);
});

test('Phase 38 persistence is tenant-bound, signed, replayable, and observable', () => {
  const ddl = read('apps/api/src/lib/cross-module-data-fabric-db-init.ts');
  const fabric = read('apps/api/src/lib/cross-module-data-fabric.ts');
  for (const table of ['shared_resource_references','shared_workflow_rules','shared_workflow_runs','shared_domain_events','shared_event_inbox','shared_resource_links','shared_workflow_compensations']) {
    assert.match(ddl,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(fabric,/createHmac\('sha256'/);
  assert.match(fabric,/timingSafeEqual/);
  assert.match(fabric,/DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY/);
  assert.match(fabric,/verificationSigningMaterial\(String\(row\.signing_key_version\)\)/);
  for (const signedField of ['workflowRunId','workflowKey','destinationModuleId','consumerKey','actorUserId','sourceReferenceId']) {
    assert.match(fabric,new RegExp(`${signedField}:`));
  }
  assert.match(fabric,/CURRENT_SIGNATURE_ENVELOPE_VERSION = 2/);
  assert.match(fabric,/legacyEnvelopeFromDeliveryRow/);
  assert.match(fabric,/assertDeliveryRelationships\(row\)/);
  assert.match(fabric,/FOR UPDATE OF i,e,r,sr/);
  assert.doesNotMatch(fabric,/SELECT i\.\*,e\.\*/);
  assert.match(ddl,/idempotency_scope VARCHAR\(16\) NOT NULL DEFAULT 'actor'/);
  assert.match(ddl,/signature_envelope_version INTEGER NOT NULL DEFAULT 1/);
  for (const constraint of [
    'shared_domain_event_source_run_route_fk',
    'shared_event_inbox_event_run_route_fk',
    'shared_event_inbox_destination_run_route_fk',
  ]) assert.match(ddl,new RegExp(constraint));
  assert.match(fabric,/pg_advisory_xact_lock/);
  assert.match(fabric,/propagationDepth/);
  assert.match(fabric,/replayDataFabricInbox/);
  assert.match(fabric,/requireWritableAccess[\s\S]*source_module_slug[\s\S]*destination_module_slug/);
});

test('Phase 38 exposes an entitlement-filtered provenance console and SnapProof Directory selection', () => {
  const routes = read('apps/api/src/routes/cross-module-data-fabric-routes.ts');
  const ui = read('apps/web/src/components/pages/SharedServicesAdminPage.tsx');
  const directory = read('apps/api/src/lib/business-directory.ts');
  const snap = read('apps/api/src/routes/snapproofos-phase32-routes.ts');
  assert.match(routes,/\/activity/);
  assert.match(routes,/\/runs\/:runId/);
  assert.match(routes,/\/inbox\/:inboxId\/replay/);
  assert.match(ui,/data-testid="cross-module-provenance"/);
  assert.match(ui,/Open original item/);
  assert.match(ui,/Open created item/);
  assert.match(directory,/['"]snapproofos['"]/);
  assert.match(snap,/assertDirectorySelection/);
  assert.match(routes, /boundedInteger/);
  assert.match(routes, /Number\.isSafeInteger/);
  assert.match(routes, /FABRIC_NUMBER_INVALID/);
  assert.match(routes, /Cross-module operation could not be completed/);
  assert.doesNotMatch(routes, /error instanceof Error \? error\.message/);
});

test('customer outcome workflows are member-accessible but keep administration separate', () => {
  const routes = read('apps/api/src/routes/cross-module-data-fabric-routes.ts');
  const fabric = read('apps/api/src/lib/cross-module-data-fabric.ts');
  assert.match(routes, /workflows\/:workflowKey`, \{ preHandler: \[requireTenantMember\] \}/);
  assert.match(routes, /workflows\/:workflowKey\/readiness`, \{ preHandler: \[requireTenantMember\] \}/);
  assert.match(routes, /runs\/:runId`, \{ preHandler: \[requireTenantMember\] \}/);
  assert.match(routes, /\/rules`, \{ preHandler: \[requireTenantAdmin\] \}/);
  assert.match(routes, /\/inbox\/:inboxId\/replay`, \{ preHandler: \[requireTenantAdmin\] \}/);
  assert.match(fabric, /requireWritableAccess\(input\.actorUserId, input\.tenantId, sourceSlug\)/);
  assert.match(fabric, /requireWritableAccess\(input\.actorUserId, input\.tenantId, contract\.destination\)/);
  assert.match(fabric, /getDataFabricWorkflowReadiness/);
  assert.match(fabric, /publishDataFabricWorkflow repeats every authorization/);
  assert.match(fabric, /destination_write_required/);
  assert.match(fabric, /FABRIC_SOURCE_TYPE_MISMATCH/);
  assert.match(fabric, /FABRIC_SOURCE_KIND_MISMATCH/);
  assert.match(fabric, /workflowSemanticIdempotencyKey/);
  assert.match(fabric, /expectedSourceVersion/);
  assert.match(fabric, /FABRIC_MODULE_MANAGER_REQUIRED/);
  assert.match(fabric, /publishConfiguredCallWorkflows[\s\S]*provider[\s\S]*simulator[\s\S]*return \[\]/);
  assert.match(fabric, /callcommand\.analysis_to_pulsedesk[\s\S]*FABRIC_PER_CALL_REVIEW_REQUIRED/);
  assert.match(fabric, /configuredCallConditionsMatch[\s\S]*summaryIncludes[\s\S]*intentIncludes/);
  assert.match(fabric, /FABRIC_RULE_CONDITIONS_NOT_MATCHED/);
  assert.match(fabric, /support\.resolved_to_faultlinelab[\s\S]*requireManagerAccess/);
  assert.match(fabric, /getTenantMembership[\s\S]*isTenantAdmin/);
  assert.match(fabric, /resourceKind: sourceKind/);
  assert.match(fabric, /resourceType: sourceType/);
});

test('database release v48 appends the data fabric after v47', () => {
  const release = read('apps/api/src/lib/database-release-contract.ts');
  assert.match(release,/releaseVersion:\s*(?:4[9]|[5-9][0-9])/);
  assert.ok(release.indexOf('cross_module_data_fabric_tables') > release.indexOf('torqueshed_native_tables'));
});
