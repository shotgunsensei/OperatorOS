import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { createAttachment } from './shared-attachments.js';
import {
  faultlineContentHash,
  parseFaultlineChallengeContent,
  type FaultlineEvidenceImportance,
} from './faultlinelab-domain.js';
import { consumeNinjaLaunchGeneration, resolveNinjaLaunchAccess } from './ninja-launch-kit-access.js';
import {
  generateDeterministicKit,
  generateVisualPromos,
  sha256 as launchSha256,
  type NinjaLaunchInput,
} from './ninja-launch-kit-phase34.js';

type Executor = Pick<typeof db, 'execute'>;
type Row = Record<string, any>;

export interface FabricDeliveryContext {
  tenantId: string;
  actorUserId: string;
  eventId: string;
  workflowRunId: string;
  sourceModuleId: string;
  destinationModuleId: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  /** Trusted server-side source capability; never accepted from event payloads. */
  sourceCanReviewAll: boolean;
  executor: Executor;
}

export interface NativeReferenceResult {
  resourceKind: string;
  resourceType: string;
  resourceId: string;
  deepLink: string;
  relationship: string;
  metadata?: Record<string, unknown>;
}

export interface FabricAdapterResult {
  references: NativeReferenceResult[];
  summary: string;
  partial?: boolean;
}

function fabricError(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function bounded(value: unknown, fallback: string, max = 2_000): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

function requiredCampaignBriefValue(value: unknown, label: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 3 || /^(?:n\/?a|none|tbd|unknown|later|not sure)$/iu.test(text)) {
    fabricError(
      'FABRIC_SOURCE_NOT_READY',
      `Complete a meaningful ${label} in the BrandForgeOS campaign brief before creating a Deploy Ops package.`,
    );
  }
  return text.slice(0, max);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Row).sort().map(key => `${JSON.stringify(key)}:${stable((value as Row)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
}

function normalizedSourceVersion(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value !== 'string') return null;
  const result = value.trim();
  if (!result) return null;
  if (/^\d+$/.test(result)) return String(BigInt(result));
  const timestamp = Date.parse(result);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : result;
}

function assertExpectedSourceVersion(context: FabricDeliveryContext, actual: unknown, label: string): void {
  const supplied = context.payload.expectedSourceVersion;
  if (supplied === undefined || supplied === null) {
    fabricError(
      'FABRIC_SOURCE_VERSION_REQUIRED',
      `${label} must be reviewed at a specific saved version before handoff.`,
    );
  }
  const expected = normalizedSourceVersion(supplied);
  const current = normalizedSourceVersion(actual);
  if (!expected || !current || expected !== current) {
    fabricError(
      'FABRIC_SOURCE_VERSION_CHANGED',
      `${label} changed after it was reviewed. Refresh it and confirm the handoff again.`,
    );
  }
}

const basicMaskingPatterns = [
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[masked-email]' },
  { pattern: /(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g, replacement: '[masked-phone]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[masked-identifier]' },
  { pattern: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[masked-payment]' },
  { pattern: /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, replacement: '[masked-record-reference]' },
  { pattern: /\b[0-9a-f]{40,128}\b/gi, replacement: '[masked-file-reference]' },
];

function sourceNarrative(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

function maskCommonIdentifiersForTraining(
  value: unknown,
  fallback = 'The source record did not include this detail.',
  max = 8_000,
): string {
  const narrative = sourceNarrative(value).trim();
  let output = (narrative || fallback)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .slice(0, max);
  for (const rule of basicMaskingPatterns) output = output.replace(rule.pattern, rule.replacement);
  output = output.slice(0, max);
  for (const rule of basicMaskingPatterns) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(output)) fabricError('FABRIC_BASIC_MASKING_FAILED', 'Common identifier masking could not be completed');
  }
  return output;
}

function singleLineTrainingText(value: unknown, fallback: string, max: number): string {
  return maskCommonIdentifiersForTraining(value, fallback, max).replace(/\s+/g, ' ').trim().slice(0, max);
}

type TrainingCategory = 'windows-ad' | 'networking' | 'automotive' | 'electronics' | 'servers' | 'mixed' | 'healthcare-imaging';

interface TrainingEvidenceInput {
  title: unknown;
  description: unknown;
  importance?: FaultlineEvidenceImportance;
}

interface TrainingDraftInput {
  sourceLabel: string;
  summary: string;
  details: string;
  diagnosis: string;
  resolution: string;
  recordedAt?: unknown;
  evidence?: TrainingEvidenceInput[];
  category: TrainingCategory;
}

const plausibleCauseChoices: Record<TrainingCategory, string[]> = {
  'windows-ad': [
    'Identity, permission, or policy configuration issue — unvalidated option',
    'Name resolution, network path, or dependent service issue — unvalidated option',
    'Client software, resource, or stale-state issue — unvalidated option',
  ],
  networking: [
    'Addressing, routing, or name-resolution issue — unvalidated option',
    'Physical link, wireless, or upstream-provider issue — unvalidated option',
    'Policy, segmentation, or service configuration issue — unvalidated option',
  ],
  automotive: [
    'Fuel, ignition, electrical supply, or mechanical issue — unvalidated option',
    'Sensor, control, wiring, or communication issue — unvalidated option',
    'Intermittent operating-condition or external influence — unvalidated option',
  ],
  electronics: [
    'Power, grounding, or component issue — unvalidated option',
    'Signal path, connection, or control issue — unvalidated option',
    'Thermal, load, or intermittent environmental issue — unvalidated option',
  ],
  servers: [
    'Service, dependency, or resource exhaustion issue — unvalidated option',
    'Storage, network, identity, or permission issue — unvalidated option',
    'Configuration, release, or stale-state issue — unvalidated option',
  ],
  mixed: [
    'Equipment, power, or physical-path issue — unvalidated option',
    'Network, integration, or dependent-service issue — unvalidated option',
    'Process, configuration, or human-workflow issue — unvalidated option',
  ],
  'healthcare-imaging': [
    'Equipment, workstation, or display availability issue — unvalidated option',
    'Network, integration, or upstream-service interruption — unvalidated option',
    'Process, routing, staffing, or configuration breakdown — unvalidated option',
  ],
};

function remediationKeywords(value: string): string[] {
  const ignored = new Set([
    'about','after','again','also','before','being','could','document','from','have','into','must','recorded','review',
    'should','source','that','their','there','these','this','through','validate','verification','were','with','without',
  ]);
  const sourceWords = value.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [];
  const meaningful = [...new Set(sourceWords.filter(word => !ignored.has(word) && !word.startsWith('masked-')))].slice(0, 8);
  return [...new Set([...meaningful, 'verify', 'document'])].slice(0, 10);
}

function trainingDraftContent(input: TrainingDraftInput) {
  const summary = maskCommonIdentifiersForTraining(input.summary, 'The reported condition was not recorded.', 1_000);
  const details = maskCommonIdentifiersForTraining(input.details, 'No investigation notes were recorded.', 3_000);
  const diagnosis = maskCommonIdentifiersForTraining(
    input.diagnosis,
    'No specific root cause was recorded. The trainer must determine and document one from the evidence.',
    3_000,
  );
  const resolution = maskCommonIdentifiersForTraining(
    input.resolution,
    'No remediation was recorded. The trainer must add an evidence-backed remediation before publication.',
    5_000,
  );
  const sourceLabel = singleLineTrainingText(input.sourceLabel, 'connected source', 120);
  const recordedAt = singleLineTrainingText(input.recordedAt, 'Time not supplied by the source record', 100);
  const recordedCauseTitle = singleLineTrainingText(diagnosis, 'Root cause not yet documented', 175);
  const sourceEvidence = (input.evidence ?? []).slice(0, 10).map((item, index) => ({
    id: `source-observation-${index + 1}`,
    title: singleLineTrainingText(item.title, `Source observation ${index + 1}`, 180),
    description: maskCommonIdentifiersForTraining(item.description, 'The source observation did not include a narrative.', 3_000),
    category: 'clue' as const,
    importance: item.importance ?? 'medium',
  }));
  const evidence = [
    { id: 'source-summary', title: 'Reported condition', description: summary, category: 'clue' as const, importance: 'high' as const },
    { id: 'source-details', title: 'Recorded investigation notes', description: details, category: 'contextual' as const, importance: 'medium' as const },
    { id: 'source-diagnosis', title: 'Recorded diagnosis to validate', description: diagnosis, category: 'clue' as const, importance: 'high' as const },
    { id: 'source-resolution', title: 'Recorded remediation to validate', description: resolution, category: 'clue' as const, importance: 'high' as const },
    {
      id: 'source-record',
      title: 'Connected source record',
      description: `This private draft came from the reviewed ${sourceLabel}. Use the secure source link in workflow history to check the original record before publishing.`,
      category: 'contextual' as const,
      importance: 'medium' as const,
    },
    ...sourceEvidence,
  ];
  const commands = [
    { command: 'review reported condition', aliases: ['review symptoms'], description: 'Start with the reported condition without assuming a cause.', output: summary, revealsEvidence: ['source-summary'], risky: false },
    { command: 'review investigation notes', aliases: ['review notes'], description: 'Read the work notes captured with the source record.', output: details, revealsEvidence: ['source-details'], risky: false },
    { command: 'compare recorded diagnosis', aliases: ['compare diagnosis'], description: 'Treat the recorded diagnosis as a candidate and test it against the observations.', output: diagnosis, revealsEvidence: ['source-diagnosis'], risky: false },
    { command: 'review recorded remediation', aliases: ['review remediation'], description: 'Check whether the recorded action explains and resolves the reported condition.', output: resolution, revealsEvidence: ['source-resolution'], risky: false },
    { command: 'open connected source', aliases: ['open source'], description: 'Return to the secure source record from workflow history.', output: 'The secure workflow link opens the original source record. No record identifier is copied into learner content.', revealsEvidence: ['source-record'], risky: false },
    ...sourceEvidence.map((item, index) => ({
      command: `inspect observation ${index + 1}`,
      aliases: [`inspect clue ${index + 1}`],
      description: `Inspect ${item.title} and decide what it supports or rules out.`,
      output: item.description,
      revealsEvidence: [item.id],
      risky: false,
    })),
  ];
  const strongestEvidence = sourceEvidence[0] ?? evidence[1];
  return parseFaultlineChallengeContent({
    schemaVersion: 1,
    description: summary,
    briefing: [
      `Private, unpublished training draft created from a reviewed ${sourceLabel}.`,
      'FaultlineLab has not verified the diagnosis, alternate causes, evidence framing, or remediation. A trainer must compare every statement with the secure source record, remove any remaining private information, and save a reviewed revision before publication.',
      '',
      details,
    ].join('\n'),
    symptoms: [
      { id: 'source-symptom', description: summary, severity: 'medium' },
      { id: 'operational-impact', description: `The ${sourceLabel} was closed only after investigation; the trainer must verify the impact and outcome.`, severity: 'medium' },
    ],
    rootCause: {
      id: 'source-candidate',
      title: recordedCauseTitle,
      description: diagnosis,
      technicalDetail: 'This candidate came from the source record and has not been validated by FaultlineLab. Confirm that it explains the symptoms, observations, repair, and verification before publishing.',
    },
    rootCauseOptions: [
      { id: 'source-candidate', title: `${recordedCauseTitle.slice(0, 185)} — unvalidated source candidate` },
      ...plausibleCauseChoices[input.category].map((title, index) => ({ id: `unvalidated-alternative-${index + 1}`, title })),
    ],
    evidence,
    hints: [
      { level: 1, label: 'Separate symptom from cause', text: `Begin with the reported condition: ${summary} List what is observed and what is still an assumption.`, scorePenalty: 4 },
      { level: 2, label: 'Use the strongest observation', text: `Inspect “${strongestEvidence.title}.” Explain which candidate causes it supports and which it does not rule out.`, scorePenalty: 8 },
      { level: 3, label: 'Challenge the recorded diagnosis', text: `Compare the source candidate with at least two clues: ${diagnosis} Do not accept it only because the source record was closed.`, scorePenalty: 12 },
      { level: 4, label: 'Close the evidence loop', text: `Compare the recorded remediation and verification with the original condition: ${resolution} If the record does not prove the outcome, the trainer must add or correct the verification step before publishing.`, scorePenalty: 16 },
    ],
    commands,
    events: [{
      id: 'source-completion-event', timestamp: recordedAt, source: sourceLabel, level: 'info',
      message: 'The source record reached a completed state.', details: resolution, revealsEvidence: ['source-resolution'],
    }],
    tickets: [{
      id: 'source-history', author: 'Connected workflow', role: sourceLabel, timestamp: recordedAt,
      content: details, redHerring: false, revealsEvidence: ['source-details'],
    }],
    availableTools: commands.map(command => command.command),
    redHerrings: [],
    remediation: resolution,
    remediationKeywords: remediationKeywords(resolution),
    preventativeMeasures: [
      'Before publication, the trainer must add at least one evidence-backed prevention step that is supported by the source record or an approved procedure.',
      'The trainer must remove any remaining names, addresses, patient information, customer details, or other private data and validate the instructional framing before publication.',
    ],
    maxScore: 100,
  });
}

async function createFaultlineDraft(context: FabricDeliveryContext, source: {
  sourceId: string; sourceLabel: string; title: string; summary: string; details: string; diagnosis: string; resolution: string;
  recordedAt?: unknown; evidence?: TrainingEvidenceInput[]; category: TrainingCategory;
}): Promise<FabricAdapterResult> {
  if (context.payload.authorApproved !== true) {
    fabricError('FABRIC_AUTHOR_APPROVAL_REQUIRED', 'Author approval is required before creating a training draft');
  }
  if (context.payload.privacyReviewed !== true) {
    fabricError('FABRIC_PRIVACY_REVIEW_REQUIRED', 'A privacy review is required before creating a training draft');
  }
  const { sourceId, ...draftSource } = source;
  const content = trainingDraftContent(draftSource);
  const safeTitle = singleLineTrainingText(source.title, 'Training case', 200);
  const contentHash = faultlineContentHash(content);
  const slugLabel = safeTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'case';
  const slug = `training-${slugLabel}-${digest({ sourceId, eventId: context.eventId }).slice(0, 10)}`;
  const challenge = await context.executor.execute(sql`
    INSERT INTO faultlinelab_challenges(
      tenant_id,owner_user_id,scope,slug,title,category,difficulty,status,
      created_by_user_id,updated_by_user_id
    ) VALUES (
      ${context.tenantId},${context.actorUserId},'tenant',${slug},${bounded(safeTitle, 'Training case', 200)},
      ${source.category},'intermediate','draft',${context.actorUserId},${context.actorUserId}
    ) RETURNING id
  `);
  const challengeId = String((challenge.rows[0] as Row).id);
  await context.executor.execute(sql`
    INSERT INTO faultlinelab_challenge_versions(
      tenant_id,challenge_id,version_number,content,content_sha256,validation,change_note,created_by_user_id
    ) VALUES (
      ${context.tenantId},${challengeId},1,${JSON.stringify(content)}::jsonb,${contentHash},
      ${JSON.stringify({
        valid: false,
        errors: [{
          code: 'FAULTLINE_IMPORTED_DRAFT_REVIEW_REQUIRED',
          path: 'content',
          message: 'A trainer must compare this imported draft with the source record and save a reviewed revision before publication.',
        }],
        warnings: [],
        requiresAuthorReview: true,
        importedWorkflowDraft: true,
        privacyReviewRequired: true,
        basicIdentifierMaskingApplied: true,
        structuralValidationPassed: true,
      })}::jsonb,
      'Private imported training draft; trainer must review the source and save a new revision before publication',${context.actorUserId}
    )
  `);
  return {
    summary: 'Created a private FaultlineLab training draft for trainer review',
    references: [{ resourceKind: 'case', resourceType: 'faultlinelab_challenge', resourceId: challengeId, deepLink: `/modules/faultlinelab/authoring/${challengeId}`, relationship: 'training_case_draft', metadata: { basicIdentifierMaskingApplied: true, privacyReviewRequired: true, authorApproved: true, trainerRevisionRequired: true } }],
  };
}

async function tradeFlowJobToSnapProof(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const found = await context.executor.execute(sql`
    SELECT j.*,c.name AS customer_name,c.email AS customer_email,c.phone AS customer_phone,c.address AS customer_address,
      c.organization_id,c.primary_contact_id,c.primary_site_id
    FROM tradeflowkit_jobs j
    JOIN tradeflowkit_customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id AND c.deleted_at IS NULL
    WHERE j.tenant_id=${context.tenantId} AND j.id=${context.aggregateId} AND j.deleted_at IS NULL LIMIT 1
  `);
  const job = found.rows[0] as Row | undefined;
  if (!job) fabricError('FABRIC_SOURCE_ARCHIVED', 'TradeFlowKit job is unavailable or archived');
  assertExpectedSourceVersion(context, job.version, 'The TradeFlowKit job');
  const customer = await context.executor.execute(sql`
    INSERT INTO snapproof_customers(
      tenant_id,created_by_user_id,name,email,phone,address,notes,
      directory_organization_id,directory_site_id,directory_contact_id
    ) VALUES (
      ${context.tenantId},${context.actorUserId},${bounded(job.customer_name, 'TradeFlowKit customer', 200)},
      ${job.customer_email ?? null},${job.customer_phone ?? null},${job.customer_address ?? null},
      ${`Created from TradeFlowKit job ${job.number ?? job.id}.`},${job.organization_id ?? null},${job.primary_site_id ?? null},${job.primary_contact_id ?? null}
    ) RETURNING id
  `);
  const customerId = String((customer.rows[0] as Row).id);
  const caseResult = await context.executor.execute(sql`
    INSERT INTO snapproof_cases(
      tenant_id,created_by_user_id,assigned_to_user_id,customer_id,reference,title,description,
      case_type,source_context,status,job_type,job_status,site_address,scheduled_for
    ) VALUES (
      ${context.tenantId},${context.actorUserId},${job.assigned_to_user_id ?? null},${customerId},
      ${`TFK-${job.number ?? String(job.id).slice(0,8)}-${context.eventId.slice(0,6)}`},
      ${bounded(job.title, 'TradeFlowKit field job', 200)},${bounded(job.description, 'Field proof requested from TradeFlowKit.', 10_000)},
      'proof_of_work',${JSON.stringify({ schemaVersion: 1, sourceModule: 'tradeflowkit', jobId: job.id, customerId: job.customer_id, workflowRunId: context.workflowRunId })}::jsonb,
      'collecting','field_service','in_progress',${job.customer_address ?? null},${job.scheduled_start ?? null}
    ) RETURNING id
  `);
  const caseId = String((caseResult.rows[0] as Row).id);
  const reportContent = {
    schemaVersion: 1, source: { module: 'tradeflowkit', jobId: job.id },
    job: { title: job.title, description: job.description, status: job.status },
    customer: { name: job.customer_name }, findings: [], notes: [], parts: [], labor: [], evidence: [],
  };
  const report = await context.executor.execute(sql`
    INSERT INTO snapproof_reports(tenant_id,case_id,created_by_user_id,title,status,content,content_hash)
    VALUES (${context.tenantId},${caseId},${context.actorUserId},${`${bounded(job.title, 'Field job', 160)} field report`},'draft',
      ${JSON.stringify(reportContent)}::jsonb,${digest(reportContent)}) RETURNING id
  `);
  const reportId = String((report.rows[0] as Row).id);
  return {
    summary: 'Created a SnapProofOS customer, field job, and draft report',
    references: [
      { resourceKind: 'job', resourceType: 'snapproof_case', resourceId: caseId, deepLink: `/modules/snapproofos/jobs/${caseId}`, relationship: 'field_proof_job', metadata: { customerId } },
      { resourceKind: 'report', resourceType: 'snapproof_report', resourceId: reportId, deepLink: `/modules/snapproofos/reports/${reportId}`, relationship: 'draft_field_report', metadata: { caseId } },
    ],
  };
}

async function snapProofReportToTradeFlow(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const source = await context.executor.execute(sql`
    SELECT r.*,c.source_context,c.customer_id FROM snapproof_reports r
    JOIN snapproof_cases c ON c.tenant_id=r.tenant_id AND c.id=r.case_id AND c.deleted_at IS NULL
    WHERE r.tenant_id=${context.tenantId} AND r.id=${context.aggregateId} AND r.status='approved' AND r.archived_at IS NULL LIMIT 1
  `);
  const report = source.rows[0] as Row | undefined;
  if (!report) fabricError('FABRIC_SOURCE_NOT_APPROVED', 'SnapProofOS report must be approved and active');
  assertExpectedSourceVersion(context, report.version, 'The SnapProofOS report');
  const exportResult = await context.executor.execute(sql`
    SELECT * FROM snapproof_exports WHERE tenant_id=${context.tenantId} AND report_id=${context.aggregateId}
      AND format='pdf' AND content IS NOT NULL ORDER BY created_at DESC LIMIT 1
  `);
  const exported = exportResult.rows[0] as Row | undefined;
  if (!exported) fabricError('FABRIC_PARTIAL_EXPORT', 'An approved, generated PDF export is required before attachment delivery');
  const content = Buffer.isBuffer(exported.content) ? exported.content : Buffer.from(exported.content);
  const actualHash = createHash('sha256').update(content).digest('hex');
  if (actualHash !== String(exported.export_hash) || Number(exported.byte_length) !== content.length) {
    fabricError('FABRIC_EXPORT_INTEGRITY_FAILED', 'SnapProofOS PDF export failed checksum or byte-length verification');
  }
  const sourceContext = (report.source_context ?? {}) as Row;
  const storedJobId = bounded(sourceContext.jobId, '', 36);
  if (sourceContext.sourceModule !== 'tradeflowkit' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(storedJobId)) {
    fabricError('FABRIC_PROVENANCE_MISSING', 'The report is not connected to an originating TradeFlowKit job');
  }
  const requestedJobId = typeof context.payload.tradeFlowJobId === 'string' ? context.payload.tradeFlowJobId.trim() : '';
  if (requestedJobId && requestedJobId !== storedJobId) {
    fabricError('FABRIC_PROVENANCE_MISMATCH', 'The requested TradeFlowKit job does not match the report origin');
  }
  const jobId = storedJobId;
  const jobResult = await context.executor.execute(sql`
    SELECT j.id,j.customer_id FROM tradeflowkit_jobs j WHERE j.tenant_id=${context.tenantId} AND j.id=${jobId} AND j.deleted_at IS NULL LIMIT 1
  `);
  const job = jobResult.rows[0] as Row | undefined;
  if (!job) fabricError('FABRIC_DESTINATION_ARCHIVED', 'TradeFlowKit job is unavailable or archived');
  const invoiceId = typeof context.payload.invoiceId === 'string' ? context.payload.invoiceId : null;
  if (invoiceId) {
    const invoice = await context.executor.execute(sql`SELECT id FROM tradeflowkit_invoices WHERE tenant_id=${context.tenantId} AND id=${invoiceId} AND job_id=${jobId} AND deleted_at IS NULL LIMIT 1`);
    if (!invoice.rows[0]) fabricError('FABRIC_DESTINATION_NOT_FOUND', 'Invoice is not active or does not belong to the destination job');
  }
  const attachment = await createAttachment({
    tenantId: context.tenantId,
    moduleId: context.destinationModuleId,
    objectType: 'tradeflowkit_job',
    objectId: jobId,
    originalName: bounded(exported.filename, `snapproof-${context.aggregateId}.pdf`, 240),
    declaredMimeType: 'application/pdf',
    content,
    createdByUserId: context.actorUserId,
    idempotencyKey: `fabric:${context.eventId}`,
    correlationId: context.workflowRunId,
  }, context.executor);
  const attachmentId = String(attachment.id);
  return {
    summary: 'Added the approved SnapProofOS PDF to the TradeFlowKit job',
    references: [
      { resourceKind: 'attachment', resourceType: 'shared_attachment', resourceId: attachmentId, deepLink: `/modules/tradeflowkit/jobs/${jobId}?attachment=${attachmentId}`, relationship: 'approved_proof_pdf', metadata: { jobId, customerId: job.customer_id, invoiceId, exportId: exported.id, sha256: actualHash } },
    ],
  };
}

type CallWorkflowDestination = 'tradeflowkit_lead' | 'tradeflowkit_job' | 'pulsedesk_ticket' | 'techdeck_ticket';

type CallTradeFlowDisposition = 'created' | 'refreshed' | 'already_linked';

interface CallTradeFlowLinkage {
  disposition: CallTradeFlowDisposition;
  appliedSourceVersion: string;
  linkageNoteId: string | null;
}

function combineCallTradeFlowDispositions(
  dispositions: readonly CallTradeFlowDisposition[],
): CallTradeFlowDisposition {
  if (dispositions.includes('created')) return 'created';
  if (dispositions.includes('refreshed')) return 'refreshed';
  return 'already_linked';
}

function callTradeFlowSummary(
  destination: 'lead' | 'customer and job',
  disposition: CallTradeFlowDisposition,
): string {
  if (disposition === 'created') {
    return `Created a TradeFlowKit ${destination} from the reviewed CallCommand summary`;
  }
  if (disposition === 'refreshed') {
    return `Added the latest reviewed CallCommand summary to the existing TradeFlowKit ${destination}; team edits stayed unchanged`;
  }
  const verb = destination === 'lead' ? 'was' : 'were';
  return `The existing TradeFlowKit ${destination} ${verb} already linked to this reviewed call; nothing changed`;
}

/**
 * Record an immutable, version-specific CallCommand linkage without treating
 * another system's analysis as authority over fields a TradeFlowKit user can
 * edit. The advisory lock makes the audit event + visible note idempotent even
 * when two authorized actors deliver the same analyzed version concurrently.
 */
async function recordCallTradeFlowLinkage(
  context: FabricDeliveryContext,
  input: {
    entityType: 'lead' | 'customer' | 'job';
    entityId: string;
    created: boolean;
    call: Row;
  },
): Promise<CallTradeFlowLinkage> {
  const appliedSourceVersion = normalizedSourceVersion(context.payload.expectedSourceVersion);
  if (!appliedSourceVersion) {
    fabricError('FABRIC_SOURCE_VERSION_REQUIRED', 'CallCommand provenance requires an applied source version');
  }
  const linkageKey = digest({
    sourceModule: 'callcommand-ai',
    callId: context.aggregateId,
    appliedSourceVersion,
    destinationType: `tradeflowkit_${input.entityType}`,
    destinationId: input.entityId,
  }).slice(0, 32);
  await context.executor.execute(sql`
    SELECT pg_advisory_xact_lock(hashtext(${`callcommand:tradeflowkit:${input.entityType}:${input.entityId}:${linkageKey}`}))
  `);
  const prior = await context.executor.execute(sql`
    SELECT id
    FROM activity_feed
    WHERE tenant_id=${context.tenantId}
      AND entity_type=${`tradeflowkit_${input.entityType}`}
      AND entity_id=${input.entityId}
      AND action='callcommand_analysis_applied'
      AND metadata->>'callId'=${context.aggregateId}
      AND metadata->>'appliedSourceVersion'=${appliedSourceVersion}
    LIMIT 1
  `);
  if (prior.rows[0]) {
    return { disposition: 'already_linked', appliedSourceVersion, linkageNoteId: null };
  }

  const disposition: CallTradeFlowDisposition = input.created ? 'created' : 'refreshed';
  const noteBody = [
    'CallCommand update',
    input.created
      ? 'This record was created from a reviewed CallCommand summary.'
      : 'The latest reviewed CallCommand summary was added to this record.',
    input.created
      ? 'The initial TradeFlowKit values came from this reviewed analysis.'
      : 'Existing TradeFlowKit business fields were preserved; this update did not overwrite team work.',
    `Call summary: ${bounded(input.call.summary, 'No call summary was recorded.', 6_000)}`,
    `Requested outcome: ${bounded(input.call.intent, 'No requested outcome was recorded.', 1_000)}`,
    `Priority: ${bounded(input.call.priority, 'normal', 40)}`,
  ].join('\n').slice(0, 10_000);
  const note = await context.executor.execute(sql`
    INSERT INTO tradeflowkit_comments(tenant_id,entity_type,entity_id,body,created_by_user_id)
    VALUES (${context.tenantId},${input.entityType},${input.entityId},${noteBody},${context.actorUserId})
    RETURNING id
  `);
  const linkageNoteId = String((note.rows[0] as Row).id);
  await context.executor.execute(sql`
    INSERT INTO activity_feed(user_id,action,entity_type,entity_id,metadata,tenant_id)
    VALUES (
      ${context.actorUserId},'callcommand_analysis_applied',${`tradeflowkit_${input.entityType}`},${input.entityId},
      ${JSON.stringify({
        schemaVersion: 1,
        sourceModule: 'callcommand-ai',
        callId: context.aggregateId,
        appliedSourceVersion,
        workflowRunId: context.workflowRunId,
        eventId: context.eventId,
        disposition,
        linkageNoteId,
        humanFieldsPreserved: !input.created,
      })}::jsonb,${context.tenantId}
    )
  `);
  return { disposition, appliedSourceVersion, linkageNoteId };
}

async function callAnalysisToDestination(
  context: FabricDeliveryContext,
  allowedDestinations: readonly CallWorkflowDestination[],
): Promise<FabricAdapterResult> {
  const result = await context.executor.execute(sql`
    SELECT * FROM callcommand_calls WHERE tenant_id=${context.tenantId} AND id=${context.aggregateId}
      AND analyzed_at IS NOT NULL AND status='completed' LIMIT 1
  `);
  const call = result.rows[0] as Row | undefined;
  if (!call) fabricError('FABRIC_SOURCE_NOT_READY', 'CallCommand call must be completed and analyzed');
  if (String(call.provider).toLowerCase() === 'simulator') {
    fabricError('FABRIC_SIMULATION_SOURCE_REJECTED', 'CallCommand simulations cannot create production follow-up records');
  }
  assertExpectedSourceVersion(context, call.version ?? call.updated_at ?? call.analyzed_at, 'The CallCommand call');
  const summary = bounded(call.summary, 'Analyzed CallCommand call', 8_000);
  const customerName = bounded(call.customer_name ?? call.subject_name, 'Inbound caller', 160);
  const destinationType = String(context.payload.destinationType ?? '') as CallWorkflowDestination;
  if (!allowedDestinations.includes(destinationType)) {
    fabricError('FABRIC_DESTINATION_TYPE_UNSUPPORTED', 'CallCommand destination type does not match the authorized workflow');
  }
  if (destinationType === 'tradeflowkit_lead') {
    const inserted = await context.executor.execute(sql`
      INSERT INTO tradeflowkit_leads(tenant_id,created_by_user_id,source,status,name,phone,service_type,description,urgency,source_id)
      VALUES (${context.tenantId},${context.actorUserId},'phone','new',${customerName},${call.phone_masked ?? null},
        ${bounded(call.intent, 'CallCommand inquiry', 200)},${summary},${call.priority === 'urgent' ? 'urgent' : 'normal'},${`fabric:call:${call.id}`})
      ON CONFLICT (tenant_id,source_id) WHERE source_id IS NOT NULL DO NOTHING
      RETURNING id,deleted_at
    `);
    const created = Boolean(inserted.rows[0]);
    const lead = inserted.rows[0] ?? (await context.executor.execute(sql`
      SELECT id,deleted_at FROM tradeflowkit_leads
      WHERE tenant_id=${context.tenantId} AND source_id=${`fabric:call:${call.id}`}
      LIMIT 1 FOR UPDATE
    `)).rows[0];
    if (!lead || lead.deleted_at) {
      fabricError('FABRIC_DESTINATION_ARCHIVED', 'The existing CallCommand-linked TradeFlowKit lead is unavailable or archived');
    }
    const id = String((lead as Row).id);
    const linkage = await recordCallTradeFlowLinkage(context, { entityType: 'lead', entityId: id, created, call });
    return {
      summary: callTradeFlowSummary('lead', linkage.disposition),
      references: [{
        resourceKind: 'lead', resourceType: 'tradeflowkit_lead', resourceId: id,
        deepLink: `/modules/tradeflowkit/leads/${id}`, relationship: 'call_generated_lead',
        metadata: {
          callId: context.aggregateId,
          appliedSourceVersion: linkage.appliedSourceVersion,
          disposition: linkage.disposition,
          linkageNoteId: linkage.linkageNoteId,
          humanFieldsPreserved: linkage.disposition !== 'created',
        },
      }],
    };
  }
  if (destinationType === 'tradeflowkit_job') {
    const insertedCustomer = await context.executor.execute(sql`
      INSERT INTO tradeflowkit_customers(tenant_id,created_by_user_id,name,phone,notes,source_id)
      VALUES (${context.tenantId},${context.actorUserId},${customerName},${call.phone_masked ?? null},${'Created from analyzed CallCommand call.'},${`fabric:call:${call.id}`})
      ON CONFLICT (tenant_id,source_id) WHERE source_id IS NOT NULL DO NOTHING
      RETURNING id,deleted_at
    `);
    const customerCreated = Boolean(insertedCustomer.rows[0]);
    const customer = insertedCustomer.rows[0] ?? (await context.executor.execute(sql`
      SELECT id,deleted_at FROM tradeflowkit_customers
      WHERE tenant_id=${context.tenantId} AND source_id=${`fabric:call:${call.id}`}
      LIMIT 1 FOR UPDATE
    `)).rows[0];
    if (!customer || customer.deleted_at) {
      fabricError('FABRIC_DESTINATION_ARCHIVED', 'The existing CallCommand-linked TradeFlowKit customer is unavailable or archived');
    }
    const customerId = String((customer as Row).id);
    const insertedJob = await context.executor.execute(sql`
      INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,description,status,priority,source_id)
      VALUES (${context.tenantId},${customerId},${context.actorUserId},${bounded(call.intent, 'CallCommand follow-up job', 200)},${summary},'lead',${call.priority === 'urgent' ? 'urgent' : 'normal'},${`fabric:call:${call.id}`})
      ON CONFLICT (tenant_id,source_id) WHERE source_id IS NOT NULL DO NOTHING
      RETURNING id,customer_id,deleted_at
    `);
    const jobCreated = Boolean(insertedJob.rows[0]);
    const job = insertedJob.rows[0] ?? (await context.executor.execute(sql`
      SELECT id,customer_id,deleted_at FROM tradeflowkit_jobs
      WHERE tenant_id=${context.tenantId} AND source_id=${`fabric:call:${call.id}`}
      LIMIT 1 FOR UPDATE
    `)).rows[0];
    if (!job || job.deleted_at) {
      fabricError('FABRIC_DESTINATION_ARCHIVED', 'The existing CallCommand-linked TradeFlowKit job is unavailable or archived');
    }
    if (String((job as Row).customer_id) !== customerId) {
      fabricError('FABRIC_DESTINATION_CONFLICT', 'The CallCommand-linked TradeFlowKit job belongs to a different customer');
    }
    const id = String((job as Row).id);
    const customerLinkage = await recordCallTradeFlowLinkage(context, {
      entityType: 'customer', entityId: customerId, created: customerCreated, call,
    });
    const jobLinkage = await recordCallTradeFlowLinkage(context, {
      entityType: 'job', entityId: id, created: jobCreated, call,
    });
    const disposition = combineCallTradeFlowDispositions([customerLinkage.disposition, jobLinkage.disposition]);
    return {
      summary: callTradeFlowSummary('customer and job', disposition),
      references: [{
        resourceKind: 'job', resourceType: 'tradeflowkit_job', resourceId: id,
        deepLink: `/modules/tradeflowkit/jobs/${id}`, relationship: 'call_generated_job',
        metadata: {
          customerId,
          callId: context.aggregateId,
          appliedSourceVersion: jobLinkage.appliedSourceVersion,
          disposition,
          customerDisposition: customerLinkage.disposition,
          jobDisposition: jobLinkage.disposition,
          customerLinkageNoteId: customerLinkage.linkageNoteId,
          jobLinkageNoteId: jobLinkage.linkageNoteId,
          humanFieldsPreserved: disposition !== 'created',
        },
      }],
    };
  }
  if (destinationType === 'pulsedesk_ticket') {
    if (context.payload.operationsOnlyApproved !== true) {
      fabricError(
        'FABRIC_PULSEDESK_OPERATIONS_REVIEW_REQUIRED',
        'PulseDesk handoff requires confirmation that the call summary is operations-only and contains no patient or clinical data',
      );
    }
    const sequence = await context.executor.execute(sql`
      INSERT INTO pulsedesk_request_sequences(tenant_id,last_number) VALUES (${context.tenantId},1)
      ON CONFLICT (tenant_id) DO UPDATE SET last_number=pulsedesk_request_sequences.last_number+1,updated_at=NOW()
      RETURNING last_number
    `);
    const ticket = await context.executor.execute(sql`
      INSERT INTO pulsedesk_requests(tenant_id,number,created_by_user_id,summary,description,category,priority,status,location_label)
      VALUES (${context.tenantId},${Number((sequence.rows[0] as Row).last_number)},${context.actorUserId},
        ${bounded(call.intent, 'CallCommand operations request', 300)},${summary},'administrative',
        ${call.priority === 'urgent' ? 'critical' : call.priority === 'high' ? 'high' : 'normal'},'new','CallCommand intake') RETURNING id
    `);
    const id = String((ticket.rows[0] as Row).id);
    return { summary: 'Created a PulseDesk operations request from the reviewed call', references: [{ resourceKind: 'ticket', resourceType: 'pulsedesk_request', resourceId: id, deepLink: `/modules/pulsedesk/tickets/${id}`, relationship: 'call_generated_ticket', metadata: { operationsOnlyApproved: true } }] };
  }
  if (destinationType === 'techdeck_ticket') {
    const sequence = await context.executor.execute(sql`
      INSERT INTO techdeck_ticket_sequences(tenant_id,last_number) VALUES (${context.tenantId},1)
      ON CONFLICT (tenant_id) DO UPDATE SET last_number=techdeck_ticket_sequences.last_number+1,updated_at=NOW()
      RETURNING last_number
    `);
    const ticket = await context.executor.execute(sql`
      INSERT INTO techdeck_tickets(tenant_id,number,created_by_user_id,title,description,priority,status)
      VALUES (${context.tenantId},${Number((sequence.rows[0] as Row).last_number)},${context.actorUserId},
        ${bounded(call.intent, 'CallCommand technical request', 300)},${summary},
        ${call.priority === 'urgent' ? 'critical' : call.priority === 'high' ? 'high' : 'medium'},'open') RETURNING id
    `);
    const id = String((ticket.rows[0] as Row).id);
    return { summary: 'Created a TechDeck ticket from the reviewed call', references: [{ resourceKind: 'ticket', resourceType: 'techdeck_ticket', resourceId: id, deepLink: `/modules/techdeck/tickets/${id}`, relationship: 'call_generated_ticket' }] };
  }
  fabricError('FABRIC_DESTINATION_TYPE_UNSUPPORTED', 'CallCommand destination type is not supported');
}

async function resolvedSupportToFaultline(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const sourceType = String(context.payload.sourceType ?? '');
  if (sourceType === 'techdeck_ticket') {
    const found = await context.executor.execute(sql`SELECT * FROM techdeck_tickets WHERE tenant_id=${context.tenantId} AND id=${context.aggregateId} AND status IN ('resolved','closed') AND deleted_at IS NULL LIMIT 1`);
    const ticket = found.rows[0] as Row | undefined;
    if (!ticket) fabricError('FABRIC_SOURCE_NOT_RESOLVED', 'TechDeck ticket must be resolved and active');
    assertExpectedSourceVersion(context, ticket.version ?? ticket.updated_at, 'The TechDeck ticket');
    const [commentResult, evidenceResult] = await Promise.all([
      context.executor.execute(sql`
        SELECT body,created_at
        FROM techdeck_ticket_comments
        WHERE tenant_id=${context.tenantId} AND ticket_id=${ticket.id} AND deleted_at IS NULL
        ORDER BY created_at,id
        LIMIT 12
      `),
      context.executor.execute(sql`
        SELECT title,evidence_type,summary,observed_at,created_at
        FROM techdeck_evidence
        WHERE tenant_id=${context.tenantId} AND ticket_id=${ticket.id} AND archived_at IS NULL
        ORDER BY COALESCE(observed_at,created_at),id
        LIMIT 12
      `),
    ]);
    const comments = commentResult.rows as Row[];
    const linkedEvidence = evidenceResult.rows as Row[];
    const latestComment = comments[comments.length - 1];
    const strongestEvidence = linkedEvidence.find(item => sourceNarrative(item.summary).trim()) ?? linkedEvidence[0];
    const diagnosis = strongestEvidence
      ? `Candidate finding from recorded evidence “${sourceNarrative(strongestEvidence.title)}”: ${sourceNarrative(strongestEvidence.summary) || 'No evidence narrative was recorded.'}`
      : latestComment
        ? `Candidate finding from the latest work note: ${sourceNarrative(latestComment.body)}`
        : 'The resolved ticket does not contain a specific root cause. The trainer must derive and document one from approved evidence.';
    const resolution = latestComment
      ? `Latest recorded work note; confirm that it describes the final remediation: ${sourceNarrative(latestComment.body)}`
      : `The ticket was marked ${ticket.status}, but no written remediation was stored with it. The trainer must add an evidence-backed remediation before publication.`;
    const trainingEvidence: TrainingEvidenceInput[] = [
      ...linkedEvidence.map((item, index) => ({
        title: item.title ?? `TechDeck evidence ${index + 1}`,
        description: [
          `Evidence type: ${String(item.evidence_type ?? 'observation').replaceAll('_', ' ')}.`,
          sourceNarrative(item.summary) || 'No evidence narrative was recorded.',
        ].join(' '),
        importance: item.evidence_type === 'test_result' ? 'high' as const : 'medium' as const,
      })),
      ...comments.map((item, index) => ({
        title: `Recorded work note ${index + 1}`,
        description: item.body,
        importance: index === comments.length - 1 ? 'high' as const : 'medium' as const,
      })),
    ];
    return createFaultlineDraft(context, {
      sourceId: `techdeck-ticket-${ticket.id}`,
      sourceLabel: 'resolved TechDeck ticket',
      title: `Training draft: ${ticket.title}`,
      summary: ticket.title,
      details: ticket.description,
      diagnosis,
      resolution,
      recordedAt: ticket.resolved_at ?? ticket.closed_at ?? ticket.updated_at,
      evidence: trainingEvidence,
      category: 'windows-ad',
    });
  }
  if (sourceType === 'pulsedesk_request') {
    const found = await context.executor.execute(sql`SELECT * FROM pulsedesk_requests WHERE tenant_id=${context.tenantId} AND id=${context.aggregateId} AND status IN ('resolved','closed') AND archived_at IS NULL LIMIT 1`);
    const ticket = found.rows[0] as Row | undefined;
    if (!ticket) fabricError('FABRIC_SOURCE_NOT_RESOLVED', 'PulseDesk issue must be resolved and active');
    assertExpectedSourceVersion(context, ticket.version ?? ticket.updated_at, 'The PulseDesk request');
    const [messageResult, eventResult] = await Promise.all([
      context.executor.execute(sql`
        SELECT body,created_at
        FROM pulsedesk_ticket_messages
        WHERE tenant_id=${context.tenantId} AND ticket_id=${ticket.id}
          AND visibility='internal' AND deleted_at IS NULL
        ORDER BY created_at,id
        LIMIT 12
      `),
      context.executor.execute(sql`
        SELECT event_type,from_status,to_status,created_at
        FROM pulsedesk_request_events
        WHERE tenant_id=${context.tenantId} AND request_id=${ticket.id}
        ORDER BY created_at,id
        LIMIT 12
      `),
    ]);
    const internalNotes = messageResult.rows as Row[];
    const statusHistory = eventResult.rows as Row[];
    const latestInternalNote = internalNotes[internalNotes.length - 1];
    const diagnosis = latestInternalNote
      ? `Candidate operational finding from the latest internal work note: ${sourceNarrative(latestInternalNote.body)}`
      : `No specific operational root cause was recorded. Start with the request description: ${sourceNarrative(ticket.description)}`;
    const resolution = latestInternalNote
      ? `Latest internal work note; confirm that it is the final non-clinical remediation: ${sourceNarrative(latestInternalNote.body)}`
      : `The request was marked ${ticket.status}, but no non-clinical remediation note was stored with it. The trainer must add an evidence-backed remediation before publication.`;
    const trainingEvidence: TrainingEvidenceInput[] = [
      ...internalNotes.map((item, index) => ({
        title: `Internal operations note ${index + 1}`,
        description: item.body,
        importance: index === internalNotes.length - 1 ? 'high' as const : 'medium' as const,
      })),
      ...statusHistory.map((item, index) => ({
        title: `Request status history ${index + 1}`,
        description: item.from_status && item.to_status
          ? `The operations request moved from ${String(item.from_status).replaceAll('_', ' ')} to ${String(item.to_status).replaceAll('_', ' ')}.`
          : `Recorded workflow event: ${String(item.event_type ?? 'request updated').replaceAll('_', ' ')}.`,
        importance: 'low' as const,
      })),
    ];
    return createFaultlineDraft(context, {
      sourceId: `pulsedesk-ticket-${ticket.id}`,
      sourceLabel: 'resolved PulseDesk operations request',
      title: `Training draft: ${ticket.summary}`,
      summary: ticket.summary,
      details: ticket.description,
      diagnosis,
      resolution,
      recordedAt: ticket.resolved_at ?? ticket.closed_at ?? ticket.updated_at,
      evidence: trainingEvidence,
      category: 'healthcare-imaging',
    });
  }
  fabricError('FABRIC_SOURCE_TYPE_UNSUPPORTED', 'Resolved support source type is not supported');
}

async function torqueDiagnosticToSnapProof(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const found = await context.executor.execute(sql`
    SELECT d.*,v.nickname,v.year,v.make,v.model,v.trim FROM torqueshed_diagnostic_sessions d
    JOIN torqueshed_vehicles v ON v.tenant_id=d.tenant_id AND v.id=d.vehicle_id AND v.archived_at IS NULL
    WHERE d.tenant_id=${context.tenantId}
      AND d.id=${context.aggregateId}
      AND d.archived_at IS NULL
      AND (
        ${context.sourceCanReviewAll}
        OR d.owner_user_id=${context.actorUserId}
        OR d.visibility='tenant'
      )
    LIMIT 1
    FOR SHARE OF d
  `);
  const diagnostic = found.rows[0] as Row | undefined;
  if (!diagnostic) fabricError('FABRIC_SOURCE_NOT_FOUND', 'TorqueShed diagnostic case is unavailable or not visible');
  assertExpectedSourceVersion(context, diagnostic.version, 'The TorqueShed diagnostic');
  const vehicleName = `${diagnostic.year} ${diagnostic.make} ${diagnostic.model}${diagnostic.trim ? ` ${diagnostic.trim}` : ''}`.slice(0, 200);
  const customer = await context.executor.execute(sql`
    INSERT INTO snapproof_customers(tenant_id,created_by_user_id,name,company,notes)
    VALUES (${context.tenantId},${context.actorUserId},${bounded(diagnostic.nickname, vehicleName, 200)},'TorqueShed garage',${vehicleName}) RETURNING id
  `);
  const customerId = String((customer.rows[0] as Row).id);
  const caseRow = await context.executor.execute(sql`
    INSERT INTO snapproof_cases(tenant_id,created_by_user_id,assigned_to_user_id,customer_id,reference,title,description,case_type,source_context,status,job_type,job_status)
    VALUES (${context.tenantId},${context.actorUserId},${diagnostic.owner_user_id},${customerId},${`TS-${String(diagnostic.id).slice(0,8)}-${context.eventId.slice(0,6)}`},
      ${bounded(diagnostic.title, 'TorqueShed diagnostic proof', 200)},${bounded(diagnostic.customer_concern, 'Vehicle diagnostic evidence', 10_000)},'diagnostic',
      ${JSON.stringify({ schemaVersion: 1, sourceModule: 'torqueshed', diagnosticId: diagnostic.id, vehicleId: diagnostic.vehicle_id, workflowRunId: context.workflowRunId })}::jsonb,
      'collecting','diagnostic','in_progress') RETURNING id
  `);
  const caseId = String((caseRow.rows[0] as Row).id);
  const entries = await context.executor.execute(sql`SELECT * FROM torqueshed_diagnostic_entries WHERE tenant_id=${context.tenantId} AND diagnostic_session_id=${context.aggregateId} AND archived_at IS NULL ORDER BY observed_at,id`);
  for (const entry of entries.rows as Row[]) {
    await context.executor.execute(sql`
      INSERT INTO snapproof_evidence_items(tenant_id,case_id,created_by_user_id,title,evidence_type,description,captured_at,source_type,source_reference,capture_context,status)
      VALUES (${context.tenantId},${caseId},${context.actorUserId},${bounded(entry.title, 'Diagnostic observation', 200)},'note',
        ${bounded(entry.outcome ?? entry.value_text, 'Recorded TorqueShed diagnostic evidence.', 10_000)},${entry.observed_at},'torqueshed',${String(entry.id)},
        ${JSON.stringify({ kind: entry.kind, unit: entry.unit ?? null, workflowRunId: context.workflowRunId })}::jsonb,'captured')
    `);
  }
  const reportContent = { schemaVersion: 1, vehicle: vehicleName, diagnosticId: diagnostic.id, concern: diagnostic.customer_concern, symptoms: diagnostic.symptoms, confirmedCause: diagnostic.confirmed_cause, repair: diagnostic.repair_performed, verification: diagnostic.verification, resolution: diagnostic.resolution, evidenceCount: entries.rows.length };
  const report = await context.executor.execute(sql`
    INSERT INTO snapproof_reports(tenant_id,case_id,created_by_user_id,title,status,content,content_hash)
    VALUES (${context.tenantId},${caseId},${context.actorUserId},${`${bounded(diagnostic.title, 'Diagnostic', 160)} proof report`},'draft',${JSON.stringify(reportContent)}::jsonb,${digest(reportContent)}) RETURNING id
  `);
  const reportId = String((report.rows[0] as Row).id);
  return { summary: 'Created a SnapProofOS diagnostic job, evidence notes, and draft report', references: [
    { resourceKind: 'case', resourceType: 'snapproof_case', resourceId: caseId, deepLink: `/modules/snapproofos/jobs/${caseId}`, relationship: 'diagnostic_proof_job', metadata: { customerId, evidenceCount: entries.rows.length } },
    { resourceKind: 'report', resourceType: 'snapproof_report', resourceId: reportId, deepLink: `/modules/snapproofos/reports/${reportId}`, relationship: 'diagnostic_proof_report', metadata: { caseId } },
  ] };
}

async function torqueDiagnosticToFaultline(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const found = await context.executor.execute(sql`
    SELECT d.*,v.year,v.make,v.model FROM torqueshed_diagnostic_sessions d
    JOIN torqueshed_vehicles v ON v.tenant_id=d.tenant_id AND v.id=d.vehicle_id
    WHERE d.tenant_id=${context.tenantId} AND d.id=${context.aggregateId}
      AND d.status IN ('verified','resolved') AND d.archived_at IS NULL AND v.archived_at IS NULL LIMIT 1
  `);
  const diagnostic = found.rows[0] as Row | undefined;
  if (!diagnostic) fabricError('FABRIC_SOURCE_NOT_RESOLVED', 'TorqueShed diagnostic must be verified or resolved and active');
  assertExpectedSourceVersion(context, diagnostic.version, 'The TorqueShed diagnostic');
  const [entryResult, codeResult] = await Promise.all([
    context.executor.execute(sql`
      SELECT kind,title,value_text,value_numeric,unit,reference_min,reference_max,outcome,observed_at
      FROM torqueshed_diagnostic_entries
      WHERE tenant_id=${context.tenantId} AND diagnostic_session_id=${diagnostic.id} AND archived_at IS NULL
      ORDER BY observed_at,id
      LIMIT 16
    `),
    context.executor.execute(sql`
      SELECT code,description,code_status,freeze_frame,observed_at
      FROM torqueshed_diagnostic_trouble_codes
      WHERE tenant_id=${context.tenantId} AND diagnostic_session_id=${diagnostic.id} AND archived_at IS NULL
      ORDER BY observed_at,id
      LIMIT 8
    `),
  ]);
  const entries = entryResult.rows as Row[];
  const codes = codeResult.rows as Row[];
  const confirmedEntry = entries.find(item => item.kind === 'confirmed_cause');
  const diagnosis = sourceNarrative(diagnostic.confirmed_cause).trim()
    || sourceNarrative(confirmedEntry?.outcome).trim()
    || sourceNarrative(confirmedEntry?.value_text).trim()
    || 'The completed diagnostic does not name a confirmed cause. The trainer must identify and support one from the recorded tests.';
  const resolutionParts = [
    sourceNarrative(diagnostic.repair_performed).trim() ? `Repair performed: ${sourceNarrative(diagnostic.repair_performed).trim()}` : '',
    sourceNarrative(diagnostic.resolution).trim() ? `Recorded resolution: ${sourceNarrative(diagnostic.resolution).trim()}` : '',
    sourceNarrative(diagnostic.verification).trim() ? `Verification: ${sourceNarrative(diagnostic.verification).trim()}` : '',
  ].filter(Boolean);
  const details = [
    sourceNarrative(diagnostic.symptoms).trim() ? `Recorded symptoms: ${sourceNarrative(diagnostic.symptoms).trim()}` : '',
    sourceNarrative(diagnostic.conditions).trim() ? `Recorded conditions: ${sourceNarrative(diagnostic.conditions).trim()}` : '',
    sourceNarrative(diagnostic.verification).trim() ? `Recorded verification: ${sourceNarrative(diagnostic.verification).trim()}` : '',
  ].filter(Boolean).join('\n');
  const entryEvidence: TrainingEvidenceInput[] = entries.map((entry, index) => {
    const observedValue = sourceNarrative(entry.value_text).trim()
      || (entry.value_numeric !== null && entry.value_numeric !== undefined
        ? `${entry.value_numeric}${entry.unit ? ` ${entry.unit}` : ''}`
        : 'No observed value was recorded.');
    const referenceRange = entry.reference_min !== null && entry.reference_min !== undefined
      || entry.reference_max !== null && entry.reference_max !== undefined
      ? ` Reference range: ${entry.reference_min ?? 'not supplied'} to ${entry.reference_max ?? 'not supplied'}${entry.unit ? ` ${entry.unit}` : ''}.`
      : '';
    const outcome = sourceNarrative(entry.outcome).trim();
    return {
      title: entry.title ?? `Diagnostic observation ${index + 1}`,
      description: `${String(entry.kind ?? 'observation').replaceAll('_', ' ')}: ${observedValue}.${referenceRange}${outcome ? ` Recorded outcome: ${outcome}` : ''}`,
      importance: entry.kind === 'confirmed_cause' || entry.kind === 'verification' ? 'high' : 'medium',
    };
  });
  const codeEvidence: TrainingEvidenceInput[] = codes.map((code, index) => ({
    title: code.code ? `Diagnostic code ${code.code}` : `Diagnostic code observation ${index + 1}`,
    description: [
      sourceNarrative(code.description).trim() || 'No code description was recorded.',
      code.code_status ? `Status: ${String(code.code_status).replaceAll('_', ' ')}.` : '',
      sourceNarrative(code.freeze_frame).trim() ? `Recorded freeze-frame: ${sourceNarrative(code.freeze_frame).trim()}` : '',
    ].filter(Boolean).join(' '),
    importance: 'medium',
  }));
  return createFaultlineDraft(context, {
    sourceId: `torqueshed-diagnostic-${diagnostic.id}`,
    sourceLabel: 'completed TorqueShed diagnostic',
    title: `Training draft: ${diagnostic.title}`,
    summary: diagnostic.customer_concern,
    details,
    diagnosis,
    resolution: resolutionParts.join('\n') || 'No repair, resolution, or verification was recorded. The trainer must complete the remediation and proof-of-fix before publication.',
    recordedAt: diagnostic.resolved_at ?? diagnostic.updated_at,
    evidence: [...entryEvidence, ...codeEvidence],
    category: 'automotive',
  });
}

async function brandForgeToLaunchKit(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const found = await context.executor.execute(sql`
    SELECT c.*,b.name AS brand_name,b.description AS brand_description,b.primary_color,b.accent_color,b.voice_tone
    FROM brandforge_campaigns c JOIN brandforge_brands b ON b.tenant_id=c.tenant_id AND b.id=c.brand_id AND b.deleted_at IS NULL
    WHERE c.tenant_id=${context.tenantId} AND c.id=${context.aggregateId} AND c.deleted_at IS NULL LIMIT 1
  `);
  const campaign = found.rows[0] as Row | undefined;
  if (!campaign) fabricError('FABRIC_SOURCE_ARCHIVED', 'BrandForgeOS campaign and brand must be active');
  assertExpectedSourceVersion(context, campaign.version, 'The BrandForgeOS campaign');
  const targetCustomer = requiredCampaignBriefValue(campaign.target_audience, 'target audience', 1_000);
  const offer = requiredCampaignBriefValue(campaign.offer, 'offer', 1_000);
  const desiredAction = requiredCampaignBriefValue(campaign.core_message, 'desired action / core message', 1_000);
  const access = await resolveNinjaLaunchAccess(context.actorUserId, context.tenantId);
  await consumeNinjaLaunchGeneration({ tenantId: context.tenantId, userId: context.actorUserId, limit: access.limits.kitsPerMonth, executor: context.executor });
  let brandRow: Row | null = null;
  if (access.limits.brandProfiles !== 0) {
    let brand = await context.executor.execute(sql`SELECT * FROM launchkit_brand_profiles WHERE tenant_id=${context.tenantId} AND user_id=${context.actorUserId} AND lower(name)=lower(${campaign.brand_name}) AND deleted_at IS NULL LIMIT 1`);
    if (!brand.rows[0]) {
      const count = await context.executor.execute(sql`SELECT COUNT(*)::int AS count FROM launchkit_brand_profiles WHERE tenant_id=${context.tenantId} AND user_id=${context.actorUserId} AND deleted_at IS NULL`);
      if (access.limits.brandProfiles !== null && Number((count.rows[0] as Row).count) >= access.limits.brandProfiles) {
        fabricError('NINJA_LAUNCH_KIT_BRAND_LIMIT_REACHED', 'Deploy Ops configuration profile limit reached for this OperatorOS entitlement');
      }
      brand = await context.executor.execute(sql`
      INSERT INTO launchkit_brand_profiles(tenant_id,user_id,name,logo_text,primary_color,accent_color,voice,contact_json)
      VALUES (${context.tenantId},${context.actorUserId},${campaign.brand_name},${campaign.brand_name},${campaign.primary_color ?? '#111827'},${campaign.accent_color ?? '#DC2626'},${campaign.voice_tone ?? null},'{}'::jsonb) RETURNING *
    `);
    }
    brandRow = brand.rows[0] as Row;
  }
  const input: NinjaLaunchInput = {
    businessName: bounded(campaign.brand_name, 'BrandForge campaign', 160),
    businessType: 'BrandForgeOS campaign',
    targetCustomer,
    offer,
    tone: 'professional',
    painPoint: bounded(campaign.objective, 'the campaign objective', 1_000),
    desiredAction,
    promoDeadline: campaign.end_at ? new Date(campaign.end_at).toISOString().slice(0, 10) : undefined,
    brandProfileId: brandRow ? String(brandRow.id) : null,
  };
  const content = generateDeterministicKit(input);
  const visuals = generateVisualPromos(input, content, access.plan, {
    name: String(brandRow?.name ?? campaign.brand_name), logoText: brandRow?.logo_text ?? campaign.brand_name,
    primaryColor: String(brandRow?.primary_color ?? campaign.primary_color ?? '#111827'),
    accentColor: String(brandRow?.accent_color ?? campaign.accent_color ?? '#DC2626'), voice: brandRow?.voice ?? campaign.voice_tone,
  });
  const provenance = { schemaVersion: 1, sourceModule: 'brandforgeos', brandId: campaign.brand_id, campaignId: campaign.id, workflowRunId: context.workflowRunId, entitlementPlan: access.plan, entitlementSource: access.source };
  const contentHash = launchSha256(stable({ input, content, visuals, provenance }));
  const key = `fabric:${context.eventId}`;
  const kit = await context.executor.execute(sql`
    INSERT INTO launchkit_product_kits(tenant_id,user_id,brand_profile_id,title,business_type,input_json,content_json,visual_promo_json,generator_mode,provider,provider_model,provenance_json,content_sha256,watermarked,white_label,idempotency_key,status)
    VALUES (${context.tenantId},${context.actorUserId},${brandRow ? String(brandRow.id) : null},${`${campaign.name} launch kit`},${input.businessType},${JSON.stringify(input)}::jsonb,${JSON.stringify(content)}::jsonb,${JSON.stringify(visuals)}::jsonb,
      'deterministic','deterministic','ninja-launch-kit-v1',${JSON.stringify(provenance)}::jsonb,${contentHash},${access.limits.watermarked},${access.limits.whiteLabel},${key},'active')
    ON CONFLICT (tenant_id,user_id,idempotency_key) DO UPDATE SET updated_at=launchkit_product_kits.updated_at RETURNING id
  `);
  const kitId = String((kit.rows[0] as Row).id);
  await context.executor.execute(sql`
    INSERT INTO launchkit_product_revisions(tenant_id,kit_id,user_id,revision,reason,input_json,content_json,visual_promo_json,provenance_json,content_sha256)
    VALUES (${context.tenantId},${kitId},${context.actorUserId},1,'created',${JSON.stringify(input)}::jsonb,${JSON.stringify(content)}::jsonb,${JSON.stringify(visuals)}::jsonb,${JSON.stringify(provenance)}::jsonb,${contentHash})
    ON CONFLICT (tenant_id,kit_id,revision) DO NOTHING
  `);
  return { summary: `Created a Deploy Ops campaign package with ${visuals.length} ready-to-review creative options`, references: [{ resourceKind: 'content', resourceType: 'launchkit_product_kit', resourceId: kitId, deepLink: `/modules/ninja-launch-kit/kits/${kitId}`, relationship: 'campaign_launch_kit', metadata: { brandProfileId: brandRow?.id ?? null, visualBriefCount: visuals.length, entitlementPlan: access.plan } }] };
}

async function ninjamationToTechDeck(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const found = await context.executor.execute(sql`
    SELECT s.*,v.id AS script_version_id,v.version_number,v.content,v.content_sha256,v.static_analysis
    FROM ninjamation_scripts s JOIN ninjamation_script_versions v ON v.tenant_id=s.tenant_id AND v.script_id=s.id AND v.version_number=s.current_version_number
    WHERE s.tenant_id=${context.tenantId} AND s.id=${context.aggregateId} AND s.status='approved' AND s.deleted_at IS NULL LIMIT 1
  `);
  const script = found.rows[0] as Row | undefined;
  if (!script) fabricError('FABRIC_SOURCE_NOT_APPROVED', 'Script Ops script must be approved and active');
  assertExpectedSourceVersion(context, script.version_number, 'The Script Ops version');
  const slug = `ninjamation-${String(script.id).slice(0,8)}-${context.eventId.slice(0,8)}`;
  const content = [
    `# ${script.name}`,
    '',
    'Imported as a documentation reference from Script Ops. This content is never executed by OperatorOS.',
    '',
    `Language: ${script.language}`,
    `Risk tier: ${script.risk_tier}`,
    `Version: ${script.version_number}`,
    `SHA-256: ${script.content_sha256}`,
    '',
    '```',
    String(script.content),
    '```',
  ].join('\n');
  const document = await context.executor.execute(sql`
    INSERT INTO techdeck_documents(tenant_id,page_type,title,slug,summary,content,status,minimum_role,tags,created_by_user_id,updated_by_user_id)
    VALUES (${context.tenantId},'runbook',${script.name},${slug},${bounded(script.description, 'Script Ops script reference', 1_000)},${content},'draft','member',
      ${JSON.stringify(['ninjamation','imported-reference',String(script.language),`risk:${script.risk_tier}`])}::jsonb,${context.actorUserId},${context.actorUserId}) RETURNING id
  `);
  const documentId = String((document.rows[0] as Row).id);
  await context.executor.execute(sql`
    INSERT INTO techdeck_document_revisions(tenant_id,document_id,version,title,summary,content,status,minimum_role,tags,change_note,created_by_user_id)
    VALUES (${context.tenantId},${documentId},1,${script.name},${bounded(script.description, 'Script Ops script reference', 1_000)},${content},'draft','member',
      ${JSON.stringify(['ninjamation','imported-reference'])}::jsonb,'Phase 38 provenance import; execution intentionally disabled',${context.actorUserId})
  `);
  const evidence = await context.executor.execute(sql`
    INSERT INTO techdeck_evidence(tenant_id,document_id,title,evidence_type,summary,source_reference,observed_at,tags,created_by_user_id)
    VALUES (${context.tenantId},${documentId},${`${script.name} checksum evidence`},'configuration_snapshot',${`Script Ops version ${script.version_number}; static analysis recorded; no execution performed.`},
      ${`ninjamation:${script.id}:version:${script.script_version_id}:sha256:${script.content_sha256}`},NOW(),${JSON.stringify(['ninjamation','checksum','no-auto-execution'])}::jsonb,${context.actorUserId}) RETURNING id
  `);
  const evidenceId = String((evidence.rows[0] as Row).id);
  return { summary: 'Created a private TechDeck runbook draft for review; nothing was executed', references: [
    { resourceKind: 'runbook', resourceType: 'techdeck_document', resourceId: documentId, deepLink: `/modules/techdeck/runbooks/${documentId}`, relationship: 'non_executable_runbook_reference', metadata: { executionAllowed: false, scriptVersionId: script.script_version_id } },
    { resourceKind: 'evidence', resourceType: 'techdeck_evidence', resourceId: evidenceId, deepLink: `/modules/techdeck/evidence/${evidenceId}`, relationship: 'checksum_evidence', metadata: { sha256: script.content_sha256 } },
  ] };
}

export async function deliverNativeWorkflow(workflowKey: string, context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  switch (workflowKey) {
    case 'tradeflowkit.job_to_snapproof': return tradeFlowJobToSnapProof(context);
    case 'snapproof.approved_report_to_tradeflowkit': return snapProofReportToTradeFlow(context);
    case 'callcommand.analysis_to_tradeflowkit': return callAnalysisToDestination(context, ['tradeflowkit_lead','tradeflowkit_job']);
    case 'callcommand.analysis_to_pulsedesk': return callAnalysisToDestination(context, ['pulsedesk_ticket']);
    case 'callcommand.analysis_to_techdeck': return callAnalysisToDestination(context, ['techdeck_ticket']);
    case 'support.resolved_to_faultlinelab': return resolvedSupportToFaultline(context);
    case 'torqueshed.diagnostic_to_snapproof': return torqueDiagnosticToSnapProof(context);
    case 'torqueshed.diagnostic_to_faultlinelab': return torqueDiagnosticToFaultline(context);
    case 'brandforgeos.campaign_to_launchkit': return brandForgeToLaunchKit(context);
    case 'ninjamation.script_to_techdeck': return ninjamationToTechDeck(context);
    default: fabricError('FABRIC_WORKFLOW_NOT_REGISTERED', `No native adapter is registered for ${workflowKey}`);
  }
}
