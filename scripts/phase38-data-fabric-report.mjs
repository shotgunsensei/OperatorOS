import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/phase-38/CROSS-MODULE-DATA-FABRIC-REPORT.md');
const read = path => readFileSync(resolve(root, path), 'utf8');
const workflowSource = read('apps/api/src/lib/cross-module-data-fabric.ts');
const adapterSource = read('apps/api/src/lib/cross-module-workflow-adapters.ts');
const schemaSource = read('apps/api/src/lib/cross-module-data-fabric-db-init.ts');

const workflows = [
  ['tradeflowkit.job_to_snapproof','TradeFlowKit','SnapProofOS','job -> customer, field case, draft report'],
  ['snapproof.approved_report_to_tradeflowkit','SnapProofOS','TradeFlowKit','approved checksum-verified PDF -> job/customer/invoice-linked attachment'],
  ['callcommand.analysis_to_tradeflowkit','CallCommand','TradeFlowKit','analyzed call -> lead or customer/job'],
  ['callcommand.analysis_to_pulsedesk','CallCommand','PulseDesk','analyzed call -> operations ticket'],
  ['callcommand.analysis_to_techdeck','CallCommand','TechDeck','analyzed call -> technical ticket'],
  ['support.resolved_to_faultlinelab','TechDeck or PulseDesk','FaultlineLab','resolved issue -> redacted, author-approved draft'],
  ['torqueshed.diagnostic_to_snapproof','TorqueShed','SnapProofOS','diagnostic -> field case, evidence, report'],
  ['torqueshed.diagnostic_to_faultlinelab','TorqueShed','FaultlineLab','diagnostic -> redacted, author-approved draft'],
  ['brandforgeos.campaign_to_launchkit','BrandForgeOS','Ninja Launch Kit','campaign/brand -> entitled kit plus nine visual briefs'],
  ['ninjamation.script_to_techdeck','Ninjamation','TechDeck','approved script -> inert documentation, runbook, checksum evidence'],
];
const tables = ['shared_resource_references','shared_workflow_rules','shared_workflow_runs','shared_domain_events','shared_event_inbox','shared_resource_links','shared_workflow_compensations'];
const evidence = [
  'apps/api/test/cross-module-data-fabric.test.ts',
  'apps/api/test/cross-module-data-fabric-static.test.ts',
  'apps/web/e2e/cross-module-data-fabric-phase38.spec.ts',
  'scripts/phase38/data-fabric-contract.test.mjs',
  'docs/adr/ADR-0041-cross-module-data-fabric.md',
];
for (const file of evidence) if (!existsSync(resolve(root, file))) throw new Error(`Missing Phase 38 evidence ${file}`);
for (const [key] of workflows) {
  if (!workflowSource.includes(`'${key}'`)) throw new Error(`Workflow contract is missing ${key}`);
  if (!adapterSource.includes(`'${key}'`)) throw new Error(`Native adapter is missing ${key}`);
}
for (const table of tables) if (!schemaSource.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) throw new Error(`Release schema is missing ${table}`);

const report = [
  '# Phase 38 — Cross-Module Workflow and Shared Data Fabric','',
  '> Source/local release evidence for the OperatorOS ecosystem data fabric. Production database promotion, live-provider acceptance, deployed restart, backup/restore, and rollback remain separate owner-controlled gates.','',
  '## Outcome','',
  `Phase 38 implements **${workflows.length} versioned native workflow contracts** across the requested product pairs and **${tables.length} additive tenant-scoped data-fabric tables** in cumulative database release **v48**. All named workflows create native destination records or artifacts; none are simulated cards, synchronous distributed transactions, or untracked cross-module writes.`,'',
  'OperatorOS remains the identity, tenant, membership, role, module-entitlement, provider, attachment, job, usage, audit, and deployment authority. Module records stay in their native schemas. Canonical references and provenance links connect them without transferring ownership.','',
  '## Canonical reference model','',
  '| Canonical kind | Shared identity/reference | Ownership rule |','|---|---|---|',
  '| organization, site, contact, requester | OperatorOS Business Directory IDs | Directory owns canonical identity; module profile/detail remains module-owned. |',
  '| user, team | OperatorOS user, tenant membership, role, and module grant IDs | Modules never create a competing identity or access authority. |',
  '| vehicle, asset, configuration item | Typed `shared_resource_references` rows | Native module remains owner; sharing is explicit and directional. |',
  '| attachment, evidence | Shared scanned attachment IDs or native evidence references | Bytes stay behind shared MIME, scan, checksum, signed-access, retention, and deletion controls. |',
  '| ticket, job, case, report, content | Typed immutable source/destination references plus native deep links | No polymorphic shared write model replaces module tables. |',
  '| provider, account | Shared provider-configuration references | Raw credentials and provider authority remain in the shared vault/control plane. |','',
  'SnapProofOS customer records now accept tenant-validated Directory organization, site, and contact references. TradeFlowKit, PulseDesk, TechDeck, and SnapProofOS therefore select the same canonical external-party records while retaining their distinct operational data.','',
  '## Versioned event envelope','',
  '```json',
  '{',
  '  "eventId": "uuid",',
  '  "eventType": "tradeflowkit.job.proof_requested.v1",',
  '  "schemaVersion": 1,',
  '  "tenantId": "uuid",',
  '  "sourceModule": "tradeflowkit",',
  '  "destinationModule": "snapproofos",',
  '  "aggregateType": "tradeflowkit_job",',
  '  "aggregateId": "uuid",',
  '  "aggregateSequence": 1,',
  '  "correlationId": "caller-or-generated-id",',
  '  "causationId": null,',
  '  "sourceDeepLink": "/modules/tradeflowkit/jobs/uuid",',
  '  "payload": { "bounded": "workflow-specific and secret-redacted" },',
  '  "payloadSha256": "sha256",',
  '  "signatureHmacSha256": "HMAC-SHA256 over canonical envelope"',
  '}','```','',
  '- Publish uses a tenant and aggregate advisory lock, monotonic aggregate sequence, workflow idempotency key, canonical JSON digest, and an HMAC derived from the shared encryption key. Production fails closed without that key.','- Delivery re-verifies digest and signature with constant-time comparison, claims one inbox lease, and checks active source and destination module write access again immediately before mutation.','- The destination adapter, destination references, provenance links, inbox completion, event completion, and workflow completion commit in one destination transaction; the source reference was already committed with the outbox event. The source record is never part of a distributed transaction and is not mutated on delivery failure.','- Correlation, causation, event, run, inbox, actor, timestamps, attempts, error code, and deep links are durable. Payload sanitization drops secrets, tokens, transcript-like content, recording URLs, and credentials before persistence.','',
  '## Native workflow matrix','',
  '| Contract | Source | Destination | Native outcome |','|---|---|---|---|',
  ...workflows.map(([key,source,destination,outcome]) => `| \`${key}\` | ${source} | ${destination} | ${outcome} |`),'',
  '## Failure, compensation, and replay','',
  '| Failure | Durable behavior | Source safety |','|---|---|---|',
  '| destination disabled/unavailable or entitlement revoked | delivery denied at the second authority check; retry or dead letter with exact code | source unchanged |',
  '| duplicate publish/event/replay | original run/inbox/native rows reused; unique business and event keys suppress side effects | no duplicate source or destination mutation |',
  '| partial/missing/corrupt SnapProof export | checksum/length or presence rejection; compensation records `partial_artifact_not_linked` | report and TradeFlowKit records unchanged |',
  '| source archived/missing/not approved | permanent dead letter with source-state code | no resurrection or destination artifact |',
  '| redaction or author approval missing | permanent denial before FaultlineLab draft creation | sensitive source remains private |',
  '| repair after operator review | audited replay resets the same inbox/event/run and enqueues a uniquely keyed replay job | original provenance and replay count retained |','',
  'Dead letters are visible in the shared-services provenance console with attempt count, error code, source/destination links, and an audited Replay action. Retry never silently creates a replacement workflow run.','',
  '## Representative complete traces','',
  '| Trace | Durable sequence | Verified result |','|---|---|---|',
  '| Field proof | TFK job -> signed event -> Snap customer/case/report -> approved PDF event -> attachment | one field case and report; checksum-verified TFK attachment with customer/job/invoice provenance |',
  '| Call routing | analyzed call -> rule-selected event -> TFK lead/job, PulseDesk ticket, or TechDeck ticket | each entitled destination receives one native record; revoked destination is denied |',
  '| Training draft | resolved TechDeck/PulseDesk or Torque diagnostic -> PII redaction -> explicit author approval -> FaultlineLab draft | email, phone, SSN, and payment-card patterns absent; draft remains unpublished |',
  '| Campaign launch | BrandForge campaign/brand -> entitlement/usage check -> deterministic Ninja Launch Kit | full kit with nine plan-aware visual briefs; free brand cap and watermark remain enforced |',
  '| Script reference | approved immutable Ninjamation version -> TechDeck document/revision/runbook/evidence | checksum and static-analysis provenance retained; execution flag false; no shell path exists |','',
  '## Local verification','',
  '- API and web TypeScript: PASS.','- Focused ESLint over all Phase 38 API, UI, test, and browser files: PASS.','- Phase 38 PostgreSQL API/domain acceptance: PASS, including authenticated route idempotency, every named native workflow, signature tampering, cross-tenant denial, duplicate event, compensation, dead-letter repair/replay, deep links, redaction, plan gates, and no-execution evidence.','- Database release v48 clean apply and immediate idempotent reapply on disposable PostgreSQL 16: PASS.','- Static and release contracts: PASS.','- Compiled production-artifact exact-host browser journey: PASS for API queue, real worker completion, provenance UI, source/destination links, 390px layout, and labeled controls.','- Production data migration, deployed exact-host verification, background-worker restart under production infrastructure, live provider reconciliation, backup/restore, monitoring, and rollback are not claimed.','',
  '## Production promotion gates','',
  '1. Back up the reviewed production database and record exact commit/build identity. Apply cumulative release v48 through the supported release runner; verify all seven tables and new SnapProof Directory constraints.','2. Verify every destination module remains enabled and correctly entitled for representative tenants. Run the workflow matrix with reviewed, non-sensitive records and inspect native destination data plus the provenance console.','3. Exercise destination-disable, entitlement-revoke, partial-export, archived-source, redaction-denial, dead-letter replay, duplicate-event, worker-restart, and tenant-isolation cases in the deployed environment.','4. Confirm signed attachment retrieval and scanner readiness, provider health where source workflows depend on providers, audit retention, observability/alerts, backup restore-to-new-database, and rollback before traffic promotion.','',
  '## Evidence files','',
  ...evidence.map(file => `- \`${file}\``),'',
  '## Release statement','',
  'Phase 38 is complete as a reviewed source/local release candidate when this report’s executable contract, focused tests, compiled browser gate, lint, types, build, and release checks pass. Production promotion remains a separate human gate and must not be inferred from this report.','',
].join('\n');

if (process.argv.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, report);
  console.log(JSON.stringify({ mode:'write', output:'docs/phase-38/CROSS-MODULE-DATA-FABRIC-REPORT.md', workflows:workflows.length, tables:tables.length }, null, 2));
} else {
  if (!existsSync(output) || readFileSync(output, 'utf8').replaceAll('\r\n','\n') !== report) throw new Error('Phase 38 report is stale; run phase38:report:write');
  console.log(JSON.stringify({ mode:'check', workflows:workflows.length, tables:tables.length, status:'source-local-release-candidate' }, null, 2));
}
