import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { createAttachment } from './shared-attachments.js';
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

const redactionPatterns = [
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[redacted-email]' },
  { pattern: /(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g, replacement: '[redacted-phone]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[redacted-identifier]' },
  { pattern: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[redacted-payment]' },
];

function redactForTraining(value: unknown): string {
  let output = bounded(value, 'Source record did not contain a narrative.', 8_000);
  for (const rule of redactionPatterns) output = output.replace(rule.pattern, rule.replacement);
  for (const rule of redactionPatterns) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(output)) fabricError('FABRIC_REDACTION_FAILED', 'Sensitive-data redaction could not be verified');
  }
  return output;
}

function trainingDraftContent(input: {
  sourceId: string;
  summary: string;
  details: string;
  resolution: string;
  category: 'windows-ad' | 'networking' | 'automotive' | 'electronics' | 'servers' | 'mixed' | 'healthcare-imaging';
}) {
  const summary = redactForTraining(input.summary);
  const details = redactForTraining(input.details);
  const resolution = redactForTraining(input.resolution);
  return {
    schemaVersion: 1,
    sourceId: input.sourceId,
    description: summary,
    briefing: `Author-approved, redacted training draft. Review the evidence and determine the most defensible next step.\n\n${details}`,
    symptoms: [
      { id: 'source-symptom', description: summary, severity: 'medium' },
      { id: 'operational-impact', description: 'The source issue required investigation and a documented resolution.', severity: 'medium' },
    ],
    rootCause: { id: 'author-review-required', title: 'Author review required', description: resolution, technicalDetail: 'Confirm the final root cause before publishing this draft.' },
    rootCauseOptions: [{ id: 'author-review-required', title: 'Author review required' }],
    evidence: [
      { id: 'source-summary', title: 'Redacted source summary', description: summary, category: 'clue', importance: 'high' },
      { id: 'source-details', title: 'Redacted investigation detail', description: details, category: 'contextual', importance: 'medium' },
      { id: 'source-resolution', title: 'Redacted resolution', description: resolution, category: 'clue', importance: 'high' },
      { id: 'provenance', title: 'OperatorOS provenance', description: `Draft derived from ${input.sourceId}; the source record remains authoritative.`, category: 'contextual', importance: 'medium' },
    ],
    hints: [1, 2, 3, 4].map(level => ({ level, label: `Author hint ${level}`, text: 'Replace this placeholder with an approved learning hint before publishing.', scorePenalty: level * 2 })),
    commands: [{ command: 'inspect provenance', aliases: [], description: 'Review the redacted source provenance.', output: `Source: ${input.sourceId}`, revealsEvidence: ['provenance'], risky: false }],
    events: [], tickets: [], availableTools: ['inspect provenance'], redHerrings: [],
    remediation: resolution,
    remediationKeywords: ['review', 'validate', 'document'],
    preventativeMeasures: ['Author must validate the redaction and instructional framing before publication.'],
    maxScore: 100,
    sourceCategory: input.category,
  };
}

async function createFaultlineDraft(context: FabricDeliveryContext, source: {
  sourceId: string; title: string; summary: string; details: string; resolution: string;
  category: 'windows-ad' | 'networking' | 'automotive' | 'electronics' | 'servers' | 'mixed' | 'healthcare-imaging';
}): Promise<FabricAdapterResult> {
  if (context.payload.authorApproved !== true) {
    fabricError('FABRIC_AUTHOR_APPROVAL_REQUIRED', 'Author approval is required before creating a training draft');
  }
  const content = trainingDraftContent({ ...source });
  const contentHash = digest(content);
  const slug = `training-${source.sourceId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 84)}-${context.eventId.slice(0, 8)}`;
  const challenge = await context.executor.execute(sql`
    INSERT INTO faultlinelab_challenges(
      tenant_id,owner_user_id,scope,slug,title,category,difficulty,status,
      created_by_user_id,updated_by_user_id
    ) VALUES (
      ${context.tenantId},${context.actorUserId},'tenant',${slug},${bounded(source.title, 'Training case', 200)},
      ${source.category},'intermediate','draft',${context.actorUserId},${context.actorUserId}
    ) RETURNING id
  `);
  const challengeId = String((challenge.rows[0] as Row).id);
  await context.executor.execute(sql`
    INSERT INTO faultlinelab_challenge_versions(
      tenant_id,challenge_id,version_number,content,content_sha256,validation,change_note,created_by_user_id
    ) VALUES (
      ${context.tenantId},${challengeId},1,${JSON.stringify(content)}::jsonb,${contentHash},
      ${JSON.stringify({ valid: false, requiresAuthorReview: true, redactionVerified: true })}::jsonb,
      'Phase 38 author-approved redacted training draft',${context.actorUserId}
    )
  `);
  return {
    summary: 'Created a redacted FaultlineLab authoring draft',
    references: [{ resourceKind: 'case', resourceType: 'faultlinelab_challenge', resourceId: challengeId, deepLink: `/modules/faultlinelab/challenges/${challengeId}/edit`, relationship: 'training_case_draft', metadata: { redactionVerified: true, authorApproved: true } }],
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
  const jobId = bounded(context.payload.tradeFlowJobId ?? sourceContext.jobId, '', 36);
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) fabricError('FABRIC_PROVENANCE_MISSING', 'TradeFlowKit job provenance is missing from the report');
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
    summary: 'Attached a checksum-verified SnapProofOS PDF to the TradeFlowKit job',
    references: [
      { resourceKind: 'attachment', resourceType: 'shared_attachment', resourceId: attachmentId, deepLink: `/modules/tradeflowkit/jobs/${jobId}?attachment=${attachmentId}`, relationship: 'approved_proof_pdf', metadata: { jobId, customerId: job.customer_id, invoiceId, exportId: exported.id, sha256: actualHash } },
    ],
  };
}

type CallWorkflowDestination = 'tradeflowkit_lead' | 'tradeflowkit_job' | 'pulsedesk_ticket' | 'techdeck_ticket';

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
  const summary = bounded(call.summary, 'Analyzed CallCommand call', 8_000);
  const customerName = bounded(call.customer_name ?? call.subject_name, 'Inbound caller', 160);
  const destinationType = String(context.payload.destinationType ?? '') as CallWorkflowDestination;
  if (!allowedDestinations.includes(destinationType)) {
    fabricError('FABRIC_DESTINATION_TYPE_UNSUPPORTED', 'CallCommand destination type does not match the authorized workflow');
  }
  if (destinationType === 'tradeflowkit_lead') {
    const lead = await context.executor.execute(sql`
      INSERT INTO tradeflowkit_leads(tenant_id,created_by_user_id,source,status,name,phone,service_type,description,urgency,source_id)
      VALUES (${context.tenantId},${context.actorUserId},'phone','new',${customerName},${call.phone_masked ?? null},
        ${bounded(call.intent, 'CallCommand inquiry', 200)},${summary},${call.priority === 'urgent' ? 'urgent' : 'normal'},${`fabric:call:${call.id}`})
      ON CONFLICT (tenant_id,source_id) WHERE source_id IS NOT NULL DO UPDATE SET updated_at=tradeflowkit_leads.updated_at
      RETURNING id
    `);
    const id = String((lead.rows[0] as Row).id);
    return { summary: 'Created a TradeFlowKit lead from analyzed call intelligence', references: [{ resourceKind: 'lead', resourceType: 'tradeflowkit_lead', resourceId: id, deepLink: `/modules/tradeflowkit/leads/${id}`, relationship: 'call_generated_lead' }] };
  }
  if (destinationType === 'tradeflowkit_job') {
    const customer = await context.executor.execute(sql`
      INSERT INTO tradeflowkit_customers(tenant_id,created_by_user_id,name,phone,notes,source_id)
      VALUES (${context.tenantId},${context.actorUserId},${customerName},${call.phone_masked ?? null},${'Created from analyzed CallCommand call.'},${`fabric:call:${call.id}`})
      ON CONFLICT (tenant_id,source_id) WHERE source_id IS NOT NULL DO UPDATE SET updated_at=tradeflowkit_customers.updated_at
      RETURNING id
    `);
    const customerId = String((customer.rows[0] as Row).id);
    const job = await context.executor.execute(sql`
      INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,description,status,priority,source_id)
      VALUES (${context.tenantId},${customerId},${context.actorUserId},${bounded(call.intent, 'CallCommand follow-up job', 200)},${summary},'lead',${call.priority === 'urgent' ? 'urgent' : 'normal'},${`fabric:call:${call.id}`})
      ON CONFLICT (tenant_id,source_id) WHERE source_id IS NOT NULL DO UPDATE SET updated_at=tradeflowkit_jobs.updated_at
      RETURNING id
    `);
    const id = String((job.rows[0] as Row).id);
    return { summary: 'Created a TradeFlowKit customer and job from analyzed call intelligence', references: [{ resourceKind: 'job', resourceType: 'tradeflowkit_job', resourceId: id, deepLink: `/modules/tradeflowkit/jobs/${id}`, relationship: 'call_generated_job', metadata: { customerId } }] };
  }
  if (destinationType === 'pulsedesk_ticket') {
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
    return { summary: 'Created a PulseDesk ticket from redacted call intelligence', references: [{ resourceKind: 'ticket', resourceType: 'pulsedesk_request', resourceId: id, deepLink: `/modules/pulsedesk/tickets/${id}`, relationship: 'call_generated_ticket' }] };
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
    return { summary: 'Created a TechDeck ticket from analyzed call intelligence', references: [{ resourceKind: 'ticket', resourceType: 'techdeck_ticket', resourceId: id, deepLink: `/modules/techdeck/tickets/${id}`, relationship: 'call_generated_ticket' }] };
  }
  fabricError('FABRIC_DESTINATION_TYPE_UNSUPPORTED', 'CallCommand destination type is not supported');
}

async function resolvedSupportToFaultline(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const sourceType = String(context.payload.sourceType ?? '');
  if (sourceType === 'techdeck_ticket') {
    const found = await context.executor.execute(sql`SELECT * FROM techdeck_tickets WHERE tenant_id=${context.tenantId} AND id=${context.aggregateId} AND status IN ('resolved','closed') AND deleted_at IS NULL LIMIT 1`);
    const ticket = found.rows[0] as Row | undefined;
    if (!ticket) fabricError('FABRIC_SOURCE_NOT_RESOLVED', 'TechDeck ticket must be resolved and active');
    return createFaultlineDraft(context, { sourceId: `techdeck-ticket-${ticket.id}`, title: `Training draft: ${ticket.title}`, summary: ticket.title, details: ticket.description, resolution: `Resolved in TechDeck at ${ticket.resolved_at ?? ticket.closed_at ?? 'recorded time'}. Author must add the validated technical resolution.`, category: 'windows-ad' });
  }
  if (sourceType === 'pulsedesk_request') {
    const found = await context.executor.execute(sql`SELECT * FROM pulsedesk_requests WHERE tenant_id=${context.tenantId} AND id=${context.aggregateId} AND status IN ('resolved','closed') AND archived_at IS NULL LIMIT 1`);
    const ticket = found.rows[0] as Row | undefined;
    if (!ticket) fabricError('FABRIC_SOURCE_NOT_RESOLVED', 'PulseDesk issue must be resolved and active');
    return createFaultlineDraft(context, { sourceId: `pulsedesk-ticket-${ticket.id}`, title: `Training draft: ${ticket.summary}`, summary: ticket.summary, details: ticket.description, resolution: 'Resolved operations issue. Author must add a non-sensitive validated resolution before publishing.', category: 'healthcare-imaging' });
  }
  fabricError('FABRIC_SOURCE_TYPE_UNSUPPORTED', 'Resolved support source type is not supported');
}

async function torqueDiagnosticToSnapProof(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const found = await context.executor.execute(sql`
    SELECT d.*,v.nickname,v.year,v.make,v.model,v.trim FROM torqueshed_diagnostic_sessions d
    JOIN torqueshed_vehicles v ON v.tenant_id=d.tenant_id AND v.id=d.vehicle_id AND v.archived_at IS NULL
    WHERE d.tenant_id=${context.tenantId} AND d.id=${context.aggregateId} AND d.archived_at IS NULL LIMIT 1
  `);
  const diagnostic = found.rows[0] as Row | undefined;
  if (!diagnostic) fabricError('FABRIC_SOURCE_ARCHIVED', 'TorqueShed diagnostic case is unavailable or archived');
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
    WHERE d.tenant_id=${context.tenantId} AND d.id=${context.aggregateId} AND d.archived_at IS NULL AND v.archived_at IS NULL LIMIT 1
  `);
  const diagnostic = found.rows[0] as Row | undefined;
  if (!diagnostic) fabricError('FABRIC_SOURCE_ARCHIVED', 'TorqueShed diagnostic case is unavailable or archived');
  return createFaultlineDraft(context, {
    sourceId: `torqueshed-diagnostic-${diagnostic.id}`,
    title: `Training draft: ${diagnostic.title}`,
    summary: diagnostic.customer_concern,
    details: diagnostic.symptoms ?? diagnostic.conditions,
    resolution: diagnostic.resolution ?? diagnostic.repair_performed ?? 'Resolution requires author review.',
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
    targetCustomer: bounded(campaign.target_audience, 'the approved campaign audience', 1_000),
    offer: bounded(campaign.offer, campaign.core_message ?? campaign.name, 1_000),
    tone: 'professional',
    painPoint: bounded(campaign.objective, 'the campaign objective', 1_000),
    desiredAction: 'Review the approved campaign offer',
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
  return { summary: `Created a plan-aware Deploy Ops release package with ${visuals.length} evidence briefs`, references: [{ resourceKind: 'content', resourceType: 'launchkit_product_kit', resourceId: kitId, deepLink: `/modules/ninja-launch-kit/kits/${kitId}`, relationship: 'campaign_launch_kit', metadata: { brandProfileId: brandRow?.id ?? null, visualBriefCount: visuals.length, entitlementPlan: access.plan } }] };
}

async function ninjamationToTechDeck(context: FabricDeliveryContext): Promise<FabricAdapterResult> {
  const found = await context.executor.execute(sql`
    SELECT s.*,v.id AS script_version_id,v.version_number,v.content,v.content_sha256,v.static_analysis
    FROM ninjamation_scripts s JOIN ninjamation_script_versions v ON v.tenant_id=s.tenant_id AND v.script_id=s.id AND v.version_number=s.current_version_number
    WHERE s.tenant_id=${context.tenantId} AND s.id=${context.aggregateId} AND s.status='approved' AND s.deleted_at IS NULL LIMIT 1
  `);
  const script = found.rows[0] as Row | undefined;
  if (!script) fabricError('FABRIC_SOURCE_NOT_APPROVED', 'Script Ops script must be approved and active');
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
  const runbook = await context.executor.execute(sql`
    INSERT INTO techdeck_runbooks(tenant_id,created_by_user_id,name,platform,purpose,script_text,risk_level,status)
    VALUES (${context.tenantId},${context.actorUserId},${script.name},${script.language},${bounded(script.description, 'Imported documentation reference', 2_000)},${script.content},${script.risk_tier},'draft') RETURNING id
  `);
  const runbookId = String((runbook.rows[0] as Row).id);
  const evidence = await context.executor.execute(sql`
    INSERT INTO techdeck_evidence(tenant_id,document_id,title,evidence_type,summary,source_reference,observed_at,tags,created_by_user_id)
    VALUES (${context.tenantId},${documentId},${`${script.name} checksum evidence`},'configuration_snapshot',${`Script Ops version ${script.version_number}; static analysis recorded; no execution performed.`},
      ${`ninjamation:${script.id}:version:${script.script_version_id}:sha256:${script.content_sha256}`},NOW(),${JSON.stringify(['ninjamation','checksum','no-auto-execution'])}::jsonb,${context.actorUserId}) RETURNING id
  `);
  const evidenceId = String((evidence.rows[0] as Row).id);
  return { summary: 'Created TechDeck draft documentation, runbook, and checksum evidence without execution', references: [
    { resourceKind: 'content', resourceType: 'techdeck_document', resourceId: documentId, deepLink: `/modules/techdeck/docs/${documentId}`, relationship: 'documentation_reference' },
    { resourceKind: 'runbook', resourceType: 'techdeck_runbook', resourceId: runbookId, deepLink: `/modules/techdeck/runbooks/${runbookId}`, relationship: 'non_executable_runbook_reference', metadata: { executionAllowed: false } },
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
