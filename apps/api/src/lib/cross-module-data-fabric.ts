import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  enqueueSharedJob,
  registerSharedJobHandler,
  type SharedJobContext,
} from './shared-background-jobs.js';
import { sanitizeSharedMetadata, safeFailureCode } from './shared-service-safety.js';
import { resolveTenantModuleAccess } from './tenant-entitlements.js';
import { deliverNativeWorkflow, type NativeReferenceResult } from './cross-module-workflow-adapters.js';

type Executor = Pick<typeof db, 'execute'>;
type Row = Record<string, any>;

export const DATA_FABRIC_JOB_HANDLER = 'operatoros.data-fabric.dispatch.v1';

export const DATA_FABRIC_WORKFLOWS = Object.freeze({
  'tradeflowkit.job_to_snapproof': { source: 'tradeflowkit', destination: 'snapproofos', eventType: 'tradeflowkit.job.proof_requested.v1', sourceKind: 'job', sourceType: 'tradeflowkit_job' },
  'snapproof.approved_report_to_tradeflowkit': { source: 'snapproofos', destination: 'tradeflowkit', eventType: 'snapproof.report.approved_exported.v1', sourceKind: 'report', sourceType: 'snapproof_report' },
  'callcommand.analysis_to_tradeflowkit': { source: 'callcommand-ai', destination: 'tradeflowkit', eventType: 'callcommand.call.analyzed.v1', sourceKind: 'case', sourceType: 'callcommand_call' },
  'callcommand.analysis_to_pulsedesk': { source: 'callcommand-ai', destination: 'pulsedesk', eventType: 'callcommand.call.analyzed.v1', sourceKind: 'case', sourceType: 'callcommand_call' },
  'callcommand.analysis_to_techdeck': { source: 'callcommand-ai', destination: 'techdeck', eventType: 'callcommand.call.analyzed.v1', sourceKind: 'case', sourceType: 'callcommand_call' },
  'support.resolved_to_faultlinelab': { source: null, destination: 'faultlinelab', eventType: 'support.issue.resolved_training_opt_in.v1', sourceKind: 'ticket', sourceType: null },
  'torqueshed.diagnostic_to_snapproof': { source: 'torqueshed', destination: 'snapproofos', eventType: 'torqueshed.diagnostic.proof_requested.v1', sourceKind: 'case', sourceType: 'torqueshed_diagnostic' },
  'torqueshed.diagnostic_to_faultlinelab': { source: 'torqueshed', destination: 'faultlinelab', eventType: 'torqueshed.diagnostic.training_opt_in.v1', sourceKind: 'case', sourceType: 'torqueshed_diagnostic' },
  'brandforgeos.campaign_to_launchkit': { source: 'brandforgeos', destination: 'ninja-launch-kit', eventType: 'brandforgeos.campaign.launch_kit_requested.v1', sourceKind: 'campaign', sourceType: 'brandforge_campaign' },
  'ninjamation.script_to_techdeck': { source: 'ninjamation', destination: 'techdeck', eventType: 'ninjamation.script.documentation_requested.v1', sourceKind: 'script', sourceType: 'ninjamation_script' },
} as const);

export type DataFabricWorkflowKey = keyof typeof DATA_FABRIC_WORKFLOWS;

export class DataFabricError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Row;
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signingMaterial(): { key: Buffer; version: string } {
  const configured = String(process.env.SHARED_SECRET_ENCRYPTION_KEY ?? '').trim();
  let root: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(configured)) root = Buffer.from(configured, 'hex');
  if (!root && configured) {
    try {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length === 32) root = decoded;
    } catch { /* rejected below */ }
  }
  if (!root && (process.env.APP_ENV === 'test' || process.env.NODE_ENV === 'test')) {
    root = createHash('sha256').update('operatoros-data-fabric-test-only-v1').digest();
  }
  if (!root) throw new DataFabricError('DATA_FABRIC_SIGNING_KEY_UNAVAILABLE', 'The internal data-fabric signing key is unavailable', 503);
  return {
    key: createHmac('sha256', root).update('operatoros:data-fabric:event-signing:v1').digest(),
    version: String(process.env.SHARED_SECRET_ENCRYPTION_KEY_VERSION ?? (configured ? 'shared-v1' : 'test-only-v1')).slice(0, 80),
  };
}

function signEnvelope(envelope: Record<string, unknown>) {
  const canonical = stable(envelope);
  const material = signingMaterial();
  return {
    canonical,
    payloadSha256: createHash('sha256').update(stable(envelope.payload)).digest('hex'),
    signature: createHmac('sha256', material.key).update(canonical).digest('hex'),
    signingKeyVersion: material.version,
  };
}

function verifyEnvelope(row: Row): boolean {
  const payload = row.payload_json as Record<string, unknown>;
  const envelope = {
    tenantId: String(row.tenant_id),
    sourceModuleId: String(row.source_module_id),
    eventType: String(row.event_type),
    eventVersion: Number(row.event_version),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    aggregateSequence: Number(row.aggregate_sequence),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    causationId: row.causation_id ? String(row.causation_id) : null,
    rootEventId: row.root_event_id ? String(row.root_event_id) : null,
    propagationDepth: Number(row.propagation_depth),
    sourceDeepLink: String(row.source_deep_link),
    payload,
  };
  const expected = signEnvelope(envelope);
  const supplied = Buffer.from(String(row.signature_hmac_sha256), 'hex');
  const expectedBuffer = Buffer.from(expected.signature, 'hex');
  return expected.payloadSha256 === String(row.payload_sha256)
    && supplied.length === expectedBuffer.length
    && timingSafeEqual(supplied, expectedBuffer);
}

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}

function validKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/.test(value);
}

function validDeepLink(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && value.length <= 1_000 && !/[\u0000-\u001f\u007f]/.test(value);
}

async function moduleBySlug(slug: string, executor: Executor = db): Promise<Row> {
  const result = await executor.execute(sql`SELECT id,slug,name,status,archived_at FROM modules WHERE slug=${slug} LIMIT 1`);
  const row = result.rows[0] as Row | undefined;
  if (!row) throw new DataFabricError('FABRIC_MODULE_NOT_FOUND', `Module ${slug} is not registered`, 404);
  return row;
}

async function requireWritableAccess(userId: string, tenantId: string, slug: string) {
  const decision = await resolveTenantModuleAccess(userId, tenantId, slug);
  if (!decision.hasAccess) {
    throw new DataFabricError('FABRIC_MODULE_ACCESS_DENIED', `Access to ${slug} is unavailable`, 403, { moduleSlug: slug, reason: decision.reason ?? 'not_entitled' });
  }
  if (decision.accessLevel === 'viewer' || decision.accessLevel === 'none') {
    throw new DataFabricError('FABRIC_MODULE_WRITE_DENIED', `Write access to ${slug} is required`, 403, { moduleSlug: slug });
  }
  return decision;
}

async function upsertReference(input: {
  tenantId: string; moduleId: string; resourceKind: string; resourceType: string; resourceId: string;
  deepLink: string; actorUserId: string | null; metadata?: Record<string, unknown>; canonicalType?: string | null; canonicalId?: string | null;
}, executor: Executor): Promise<Row> {
  if (!validDeepLink(input.deepLink)) throw new DataFabricError('FABRIC_DEEP_LINK_INVALID', 'Resource deep links must be safe relative paths');
  const result = await executor.execute(sql`
    INSERT INTO shared_resource_references(
      tenant_id,module_id,resource_kind,resource_type,resource_id,canonical_type,canonical_id,deep_link,metadata_json,status,created_by_user_id
    ) VALUES (
      ${input.tenantId},${input.moduleId},${input.resourceKind},${input.resourceType},${input.resourceId},
      ${input.canonicalType ?? null},${input.canonicalId ?? null},${input.deepLink},${sanitizeSharedMetadata(input.metadata)},'active',${input.actorUserId}
    )
    ON CONFLICT (tenant_id,module_id,resource_type,resource_id) DO UPDATE SET
      resource_kind=EXCLUDED.resource_kind,canonical_type=COALESCE(EXCLUDED.canonical_type,shared_resource_references.canonical_type),
      canonical_id=COALESCE(EXCLUDED.canonical_id,shared_resource_references.canonical_id),deep_link=EXCLUDED.deep_link,
      metadata_json=shared_resource_references.metadata_json || EXCLUDED.metadata_json,status='active',archived_at=NULL,
      version=shared_resource_references.version+1,updated_at=NOW()
    RETURNING *
  `);
  return result.rows[0] as Row;
}

export interface PublishDataFabricWorkflowInput {
  tenantId: string;
  actorUserId: string;
  workflowKey: DataFabricWorkflowKey;
  aggregateId: string;
  sourceDeepLink: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string | null;
  rootEventId?: string | null;
  propagationDepth?: number;
  sourceModuleSlug?: string;
  sourceType?: string;
  sourceKind?: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export async function publishDataFabricWorkflow(input: PublishDataFabricWorkflowInput) {
  const contract = DATA_FABRIC_WORKFLOWS[input.workflowKey];
  if (!contract) throw new DataFabricError('FABRIC_WORKFLOW_NOT_REGISTERED', 'Workflow is not registered');
  if (!validId(input.aggregateId)) throw new DataFabricError('FABRIC_AGGREGATE_ID_INVALID', 'aggregateId must be a UUID');
  if (!validKey(input.idempotencyKey)) throw new DataFabricError('FABRIC_IDEMPOTENCY_KEY_INVALID', 'idempotencyKey must be 8-180 safe characters');
  if (!validDeepLink(input.sourceDeepLink)) throw new DataFabricError('FABRIC_DEEP_LINK_INVALID', 'sourceDeepLink must be a safe relative path');
  const depth = Math.max(0, Math.floor(input.propagationDepth ?? 0));
  if (depth > 12) throw new DataFabricError('FABRIC_LOOP_GUARD_REJECTED', 'Event propagation depth exceeds the loop guard', 409);
  const sourceSlug = input.sourceModuleSlug ?? contract.source;
  if (!sourceSlug) throw new DataFabricError('FABRIC_SOURCE_MODULE_REQUIRED', 'This workflow requires an explicit source module');
  if (contract.source && sourceSlug !== contract.source) throw new DataFabricError('FABRIC_SOURCE_MODULE_MISMATCH', 'Source module does not match the workflow contract');
  if (input.workflowKey === 'support.resolved_to_faultlinelab' && !['techdeck','pulsedesk'].includes(sourceSlug)) {
    throw new DataFabricError('FABRIC_SOURCE_MODULE_MISMATCH', 'Resolved support training drafts must originate in TechDeck or PulseDesk');
  }
  const [sourceAccess, destinationAccess, sourceModule, destinationModule] = await Promise.all([
    requireWritableAccess(input.actorUserId, input.tenantId, sourceSlug),
    requireWritableAccess(input.actorUserId, input.tenantId, contract.destination),
    moduleBySlug(sourceSlug), moduleBySlug(contract.destination),
  ]);
  if (!sourceAccess.moduleId || !destinationAccess.moduleId) throw new DataFabricError('FABRIC_MODULE_UNAVAILABLE', 'Workflow module registration is unavailable', 503);
  const safePayload = sanitizeSharedMetadata({ ...(input.payload ?? {}), sourceType: input.sourceType ?? contract.sourceType });
  return db.transaction(async tx => {
    const existing = await tx.execute(sql`
      SELECT r.*,e.id AS event_id,i.id AS inbox_id FROM shared_workflow_runs r
      LEFT JOIN shared_domain_events e ON e.tenant_id=r.tenant_id AND e.workflow_run_id=r.id
      LEFT JOIN shared_event_inbox i ON i.tenant_id=e.tenant_id AND i.event_id=e.id
      WHERE r.tenant_id=${input.tenantId} AND r.workflow_key=${input.workflowKey} AND r.idempotency_key=${input.idempotencyKey} LIMIT 1
    `);
    if (existing.rows[0]) return { duplicate: true, run: existing.rows[0] };
    const sourceReference = await upsertReference({
      tenantId: input.tenantId, moduleId: String(sourceModule.id),
      resourceKind: input.sourceKind ?? contract.sourceKind,
      resourceType: input.sourceType ?? contract.sourceType ?? 'support_issue',
      resourceId: input.aggregateId, deepLink: input.sourceDeepLink, actorUserId: input.actorUserId,
      metadata: { workflowKey: input.workflowKey },
    }, tx);
    const run = await tx.execute(sql`
      INSERT INTO shared_workflow_runs(
        tenant_id,workflow_key,source_module_id,destination_module_id,actor_user_id,source_reference_id,
        status,idempotency_key,correlation_id,causation_id,details_json
      ) VALUES (
        ${input.tenantId},${input.workflowKey},${String(sourceModule.id)},${String(destinationModule.id)},${input.actorUserId},${String(sourceReference.id)},
        'queued',${input.idempotencyKey},${input.correlationId},${input.causationId ?? null},${sanitizeSharedMetadata({ sourceModule: sourceSlug, destinationModule: contract.destination })}
      ) ON CONFLICT (tenant_id,workflow_key,idempotency_key) DO NOTHING RETURNING *
    `);
    let runRow = run.rows[0] as Row | undefined;
    if (!runRow) {
      const raced = await tx.execute(sql`
        SELECT r.*,e.id AS event_id,i.id AS inbox_id FROM shared_workflow_runs r
        LEFT JOIN shared_domain_events e ON e.tenant_id=r.tenant_id AND e.workflow_run_id=r.id
        LEFT JOIN shared_event_inbox i ON i.tenant_id=e.tenant_id AND i.event_id=e.id
        WHERE r.tenant_id=${input.tenantId} AND r.workflow_key=${input.workflowKey} AND r.idempotency_key=${input.idempotencyKey} LIMIT 1
      `);
      if (!raced.rows[0]) throw new DataFabricError('FABRIC_IDEMPOTENCY_CONFLICT', 'The idempotent workflow run could not be resolved', 409);
      return { duplicate: true, run: raced.rows[0] };
    }
    const lockKey = `${input.tenantId}:${sourceModule.id}:${input.sourceType ?? contract.sourceType}:${input.aggregateId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const sequence = await tx.execute(sql`
      SELECT COALESCE(MAX(aggregate_sequence),0)::int + 1 AS next_sequence FROM shared_domain_events
      WHERE tenant_id=${input.tenantId} AND source_module_id=${String(sourceModule.id)}
        AND aggregate_type=${input.sourceType ?? contract.sourceType ?? 'support_issue'} AND aggregate_id=${input.aggregateId}
    `);
    const aggregateSequence = Number((sequence.rows[0] as Row).next_sequence);
    const envelope = {
      tenantId: input.tenantId, sourceModuleId: String(sourceModule.id), eventType: contract.eventType, eventVersion: 1,
      aggregateType: input.sourceType ?? contract.sourceType ?? 'support_issue', aggregateId: input.aggregateId, aggregateSequence,
      idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, causationId: input.causationId ?? null,
      rootEventId: input.rootEventId ?? null, propagationDepth: depth, sourceDeepLink: input.sourceDeepLink, payload: safePayload,
    };
    const signed = signEnvelope(envelope);
    const event = await tx.execute(sql`
      INSERT INTO shared_domain_events(
        tenant_id,workflow_run_id,source_module_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_sequence,
        source_deep_link,actor_user_id,payload_json,payload_sha256,signature_hmac_sha256,signing_key_version,
        idempotency_key,correlation_id,causation_id,root_event_id,propagation_depth,status
      ) VALUES (
        ${input.tenantId},${String(runRow.id)},${String(sourceModule.id)},${contract.eventType},1,
        ${envelope.aggregateType},${input.aggregateId},${aggregateSequence},${input.sourceDeepLink},${input.actorUserId},${safePayload},
        ${signed.payloadSha256},${signed.signature},${signed.signingKeyVersion},${input.idempotencyKey},${input.correlationId},
        ${input.causationId ?? null},${input.rootEventId ?? null},${depth},'pending'
      ) RETURNING *
    `);
    const eventRow = event.rows[0] as Row;
    const inbox = await tx.execute(sql`
      INSERT INTO shared_event_inbox(tenant_id,event_id,workflow_run_id,destination_module_id,consumer_key,max_attempts)
      VALUES (${input.tenantId},${String(eventRow.id)},${String(runRow.id)},${String(destinationModule.id)},${input.workflowKey},${Math.max(1,Math.min(20,input.maxAttempts ?? 5))})
      RETURNING *
    `);
    const inboxRow = inbox.rows[0] as Row;
    await enqueueSharedJob({
      tenantId: input.tenantId, moduleId: String(destinationModule.id), requestedByUserId: input.actorUserId,
      handlerKey: DATA_FABRIC_JOB_HANDLER, payload: { inboxId: inboxRow.id }, idempotencyKey: `fabric:${inboxRow.id}:initial`,
      correlationId: input.correlationId, maxAttempts: Math.max(1,Math.min(20,input.maxAttempts ?? 5)),
    }, tx);
    return { duplicate: false, run: { ...runRow, event_id: eventRow.id, inbox_id: inboxRow.id } };
  });
}

const PERMANENT_CODES = new Set([
  'FABRIC_SOURCE_ARCHIVED','FABRIC_SOURCE_NOT_READY','FABRIC_SOURCE_NOT_APPROVED','FABRIC_SOURCE_NOT_RESOLVED',
  'FABRIC_DESTINATION_ARCHIVED','FABRIC_DESTINATION_NOT_FOUND','FABRIC_DESTINATION_TYPE_UNSUPPORTED',
  'FABRIC_MODULE_ACCESS_DENIED','FABRIC_MODULE_WRITE_DENIED','FABRIC_EVENT_SIGNATURE_INVALID','FABRIC_EVENT_TENANT_MISMATCH',
  'FABRIC_LOOP_GUARD_REJECTED','FABRIC_AUTHOR_APPROVAL_REQUIRED','FABRIC_REDACTION_FAILED','FABRIC_PARTIAL_EXPORT',
  'FABRIC_EXPORT_INTEGRITY_FAILED','FABRIC_PROVENANCE_MISSING','FABRIC_WORKFLOW_NOT_REGISTERED','FABRIC_SOURCE_TYPE_UNSUPPORTED',
  'NINJA_LAUNCH_KIT_GENERATION_LIMIT_REACHED',
  'NINJA_LAUNCH_KIT_BRAND_LIMIT_REACHED',
]);

async function recordDeliveryFailure(inbox: Row, error: unknown): Promise<{ terminal: boolean; code: string }> {
  const code = safeFailureCode(error, 'FABRIC_DELIVERY_FAILED');
  const nextAttempt = Number(inbox.attempt_count) + 1;
  const terminal = PERMANENT_CODES.has(code) || nextAttempt >= Number(inbox.max_attempts);
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE shared_event_inbox SET status=${terminal ? 'dead_letter' : 'retry'},attempt_count=${nextAttempt},
        available_at=NOW()+make_interval(secs => LEAST(3600,5*power(2,LEAST(${nextAttempt}-1,10)))::int),
        lease_owner=NULL,lease_expires_at=NULL,last_error_code=${code},updated_at=NOW()
      WHERE tenant_id=${String(inbox.tenant_id)} AND id=${String(inbox.id)} AND status<>'completed'
    `);
    await tx.execute(sql`
      UPDATE shared_workflow_runs SET status=${terminal ? 'dead_letter' : 'queued'},retry_count=${nextAttempt},last_error_code=${code},updated_at=NOW()
      WHERE tenant_id=${String(inbox.tenant_id)} AND id=${String(inbox.workflow_run_id)} AND status<>'completed'
    `);
    await tx.execute(sql`UPDATE shared_domain_events SET status=${terminal ? 'dead_letter' : 'pending'} WHERE tenant_id=${String(inbox.tenant_id)} AND id=${String(inbox.event_id)} AND status<>'delivered'`);
    if (terminal) {
      const action = code === 'FABRIC_PARTIAL_EXPORT' || code === 'FABRIC_EXPORT_INTEGRITY_FAILED' ? 'partial_artifact_not_linked'
        : code.includes('ACCESS') || code.includes('ENTITLE') ? 'destination_reference_revoked' : 'source_unchanged';
      await tx.execute(sql`
        INSERT INTO shared_workflow_compensations(tenant_id,workflow_run_id,reason_code,action,state,details_json,created_by_user_id)
        VALUES (${String(inbox.tenant_id)},${String(inbox.workflow_run_id)},${code},${action},'completed',
          ${sanitizeSharedMetadata({ sourceRecordMutated: false, destinationCommitted: false })},${inbox.actor_user_id ? String(inbox.actor_user_id) : null})
      `);
    }
  });
  return { terminal, code };
}

export async function deliverDataFabricInbox(inboxId: string): Promise<void> {
  const loaded = await db.execute(sql`
    SELECT i.*,e.*,i.id AS inbox_id,i.status AS inbox_status,i.attempt_count AS inbox_attempt_count,i.max_attempts AS inbox_max_attempts,
      i.workflow_run_id AS inbox_workflow_run_id,i.event_id AS inbox_event_id,i.destination_module_id AS inbox_destination_module_id,
      r.workflow_key,r.actor_user_id,r.source_reference_id,sm.slug AS source_module_slug,dm.slug AS destination_module_slug
    FROM shared_event_inbox i
    JOIN shared_domain_events e ON e.tenant_id=i.tenant_id AND e.id=i.event_id
    JOIN shared_workflow_runs r ON r.tenant_id=i.tenant_id AND r.id=i.workflow_run_id
    JOIN modules sm ON sm.id=e.source_module_id JOIN modules dm ON dm.id=i.destination_module_id
    WHERE i.id=${inboxId} LIMIT 1
  `);
  const row = loaded.rows[0] as Row | undefined;
  if (!row) throw new DataFabricError('FABRIC_INBOX_NOT_FOUND', 'Data-fabric inbox row is unavailable', 404);
  const inbox: Row = {
    ...row,
    id: row.inbox_id,
    status: row.inbox_status,
    attempt_count: row.inbox_attempt_count,
    max_attempts: row.inbox_max_attempts,
    workflow_run_id: row.inbox_workflow_run_id,
    event_id: row.inbox_event_id,
    destination_module_id: row.inbox_destination_module_id,
  };
  if (inbox.status === 'completed') return;
  try {
    if (String(row.tenant_id) !== String(inbox.tenant_id)) throw new DataFabricError('FABRIC_EVENT_TENANT_MISMATCH', 'Event and inbox tenant mismatch');
    if (!verifyEnvelope(row)) throw new DataFabricError('FABRIC_EVENT_SIGNATURE_INVALID', 'Domain-event signature or payload hash is invalid');
    if (Number(row.propagation_depth) > 12) throw new DataFabricError('FABRIC_LOOP_GUARD_REJECTED', 'Domain-event propagation depth exceeds the loop guard');
    if (!row.actor_user_id) throw new DataFabricError('FABRIC_ACTOR_UNAVAILABLE', 'Workflow actor is unavailable');
    await Promise.all([
      requireWritableAccess(String(row.actor_user_id), String(row.tenant_id), String(row.source_module_slug)),
      requireWritableAccess(String(row.actor_user_id), String(row.tenant_id), String(row.destination_module_slug)),
    ]);
    await db.transaction(async tx => {
      const claimed = await tx.execute(sql`
        UPDATE shared_event_inbox SET status='processing',attempt_count=attempt_count+1,lease_owner=${`fabric:${process.pid}`},
          lease_expires_at=NOW()+interval '2 minutes',updated_at=NOW()
        WHERE tenant_id=${String(row.tenant_id)} AND id=${String(inbox.id)} AND status IN ('pending','retry')
        RETURNING attempt_count
      `);
      if (!claimed.rows[0]) {
        const current = await tx.execute(sql`SELECT status FROM shared_event_inbox WHERE tenant_id=${String(row.tenant_id)} AND id=${String(inbox.id)}`);
        if ((current.rows[0] as Row | undefined)?.status === 'completed') return;
        throw new DataFabricError('FABRIC_INBOX_BUSY', 'Inbox delivery is already in progress', 409);
      }
      await tx.execute(sql`UPDATE shared_workflow_runs SET status='running',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE tenant_id=${String(row.tenant_id)} AND id=${String(row.workflow_run_id)}`);
      await tx.execute(sql`UPDATE shared_domain_events SET status='dispatching',dispatched_at=COALESCE(dispatched_at,NOW()) WHERE tenant_id=${String(row.tenant_id)} AND id=${String(row.event_id)}`);
      const result = await deliverNativeWorkflow(String(row.workflow_key), {
        tenantId: String(row.tenant_id), actorUserId: String(row.actor_user_id), eventId: String(row.event_id),
        workflowRunId: String(row.workflow_run_id), sourceModuleId: String(row.source_module_id),
        destinationModuleId: String(inbox.destination_module_id), aggregateId: String(row.aggregate_id),
        payload: row.payload_json as Record<string, unknown>, executor: tx,
      });
      let primaryDestinationId: string | null = null;
      for (const native of result.references) {
        const reference = await upsertReference({
          tenantId: String(row.tenant_id), moduleId: String(inbox.destination_module_id), resourceKind: native.resourceKind,
          resourceType: native.resourceType, resourceId: native.resourceId, deepLink: native.deepLink,
          actorUserId: String(row.actor_user_id), metadata: native.metadata,
        }, tx);
        if (!primaryDestinationId) primaryDestinationId = String(reference.id);
        await tx.execute(sql`
          INSERT INTO shared_resource_links(tenant_id,workflow_run_id,event_id,source_reference_id,destination_reference_id,relationship,created_by_user_id,metadata_json)
          VALUES (${String(row.tenant_id)},${String(row.workflow_run_id)},${String(row.event_id)},${String(row.source_reference_id)},${String(reference.id)},${native.relationship},${String(row.actor_user_id)},${sanitizeSharedMetadata(native.metadata)})
          ON CONFLICT (tenant_id,source_reference_id,destination_reference_id,relationship) DO NOTHING
        `);
      }
      const status = result.partial ? 'partial' : 'completed';
      await tx.execute(sql`
        UPDATE shared_event_inbox SET status='completed',result_json=${sanitizeSharedMetadata({ summary: result.summary, references: result.references.map(item => ({ resourceType: item.resourceType, resourceId: item.resourceId, deepLink: item.deepLink })) })},
          lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL,completed_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${String(row.tenant_id)} AND id=${String(inbox.id)}
      `);
      await tx.execute(sql`UPDATE shared_domain_events SET status=${result.partial ? 'partial' : 'delivered'},completed_at=NOW() WHERE tenant_id=${String(row.tenant_id)} AND id=${String(row.event_id)}`);
      await tx.execute(sql`
        UPDATE shared_workflow_runs SET status=${status},destination_reference_id=${primaryDestinationId},last_error_code=NULL,
          details_json=details_json || ${sanitizeSharedMetadata({ summary: result.summary, destinationCount: result.references.length, asynchronous: true })},completed_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${String(row.tenant_id)} AND id=${String(row.workflow_run_id)}
      `);
    });
  } catch (error) {
    const failureInbox = { ...inbox, actor_user_id: row.actor_user_id };
    const failure = await recordDeliveryFailure(failureInbox, error);
    if (!failure.terminal) throw error;
  }
}

async function sharedJobHandler(context: SharedJobContext): Promise<void> {
  const inboxId = String(context.payload.inboxId ?? '');
  if (!validId(inboxId)) throw new DataFabricError('FABRIC_INBOX_ID_INVALID', 'Data-fabric job is missing a valid inbox ID');
  await deliverDataFabricInbox(inboxId);
}

registerSharedJobHandler(DATA_FABRIC_JOB_HANDLER, sharedJobHandler);

export async function replayDataFabricInbox(input: { tenantId: string; actorUserId: string; inboxId: string }) {
  if (!validId(input.inboxId)) throw new DataFabricError('FABRIC_INBOX_ID_INVALID', 'inboxId must be a UUID');
  const loaded = await db.execute(sql`
    SELECT i.*,r.source_module_id,r.destination_module_id,sm.slug AS source_module_slug,dm.slug AS destination_module_slug
    FROM shared_event_inbox i JOIN shared_workflow_runs r ON r.tenant_id=i.tenant_id AND r.id=i.workflow_run_id
    JOIN modules sm ON sm.id=r.source_module_id JOIN modules dm ON dm.id=r.destination_module_id
    WHERE i.tenant_id=${input.tenantId} AND i.id=${input.inboxId} LIMIT 1
  `);
  const row = loaded.rows[0] as Row | undefined;
  if (!row) throw new DataFabricError('FABRIC_INBOX_NOT_FOUND', 'Dead-letter inbox row was not found', 404);
  if (row.status !== 'dead_letter') throw new DataFabricError('FABRIC_REPLAY_STATE_INVALID', 'Only dead-letter deliveries can be replayed', 409);
  await Promise.all([
    requireWritableAccess(input.actorUserId, input.tenantId, String(row.source_module_slug)),
    requireWritableAccess(input.actorUserId, input.tenantId, String(row.destination_module_slug)),
  ]);
  return db.transaction(async tx => {
    const updated = await tx.execute(sql`
      UPDATE shared_event_inbox SET status='pending',attempt_count=0,replay_count=replay_count+1,available_at=NOW(),
        lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=NOW(),completed_at=NULL
      WHERE tenant_id=${input.tenantId} AND id=${input.inboxId} AND status='dead_letter' RETURNING *
    `);
    const inbox = updated.rows[0] as Row;
    await tx.execute(sql`UPDATE shared_workflow_runs SET status='queued',retry_count=0,last_error_code=NULL,completed_at=NULL,updated_at=NOW() WHERE tenant_id=${input.tenantId} AND id=${String(inbox.workflow_run_id)}`);
    await tx.execute(sql`UPDATE shared_domain_events SET status='pending',completed_at=NULL WHERE tenant_id=${input.tenantId} AND id=${String(inbox.event_id)}`);
    await enqueueSharedJob({
      tenantId: input.tenantId,moduleId:String(row.destination_module_id),requestedByUserId:input.actorUserId,
      handlerKey:DATA_FABRIC_JOB_HANDLER,payload:{inboxId:input.inboxId},idempotencyKey:`fabric:${input.inboxId}:replay:${inbox.replay_count}`,
      correlationId:String(inbox.workflow_run_id),maxAttempts:Number(inbox.max_attempts),
    },tx);
    return inbox;
  });
}

export async function listDataFabricActivity(input: { tenantId: string; actorUserId: string; limit?: number; status?: string | null }) {
  const limit = Math.max(1,Math.min(100,input.limit ?? 50));
  const result = await db.execute(sql`
    SELECT r.*,sm.slug AS source_module_slug,sm.name AS source_module_name,dm.slug AS destination_module_slug,dm.name AS destination_module_name,
      sr.resource_type AS source_resource_type,sr.resource_id AS source_resource_id,sr.deep_link AS source_deep_link,
      dr.resource_type AS destination_resource_type,dr.resource_id AS destination_resource_id,dr.deep_link AS destination_deep_link,
      i.id AS inbox_id,i.status AS delivery_status,i.attempt_count,i.max_attempts,i.replay_count,i.last_error_code AS delivery_error_code,
      u.email AS actor_email
    FROM shared_workflow_runs r
    JOIN modules sm ON sm.id=r.source_module_id JOIN modules dm ON dm.id=r.destination_module_id
    LEFT JOIN shared_resource_references sr ON sr.tenant_id=r.tenant_id AND sr.id=r.source_reference_id
    LEFT JOIN shared_resource_references dr ON dr.tenant_id=r.tenant_id AND dr.id=r.destination_reference_id
    LEFT JOIN shared_event_inbox i ON i.tenant_id=r.tenant_id AND i.workflow_run_id=r.id
    LEFT JOIN users u ON u.id=r.actor_user_id
    WHERE r.tenant_id=${input.tenantId} AND (${input.status ?? null}::text IS NULL OR r.status=${input.status ?? null})
    ORDER BY r.updated_at DESC,r.id DESC LIMIT ${limit}
  `);
  const rows: Row[] = [];
  const accessCache = new Map<string, boolean>();
  for (const row of result.rows as Row[]) {
    let allowed = true;
    for (const slug of [String(row.source_module_slug),String(row.destination_module_slug)]) {
      if (!accessCache.has(slug)) {
        const decision = await resolveTenantModuleAccess(input.actorUserId,input.tenantId,slug);
        accessCache.set(slug,decision.hasAccess);
      }
      if (!accessCache.get(slug)) allowed = false;
    }
    if (allowed) rows.push(row);
  }
  return rows;
}

export async function getDataFabricRun(input: { tenantId: string; actorUserId: string; runId: string }) {
  if (!validId(input.runId)) throw new DataFabricError('FABRIC_RUN_ID_INVALID', 'runId must be a UUID');
  const found = await db.execute(sql`
    SELECT r.*,sm.slug AS source_module_slug,sm.name AS source_module_name,dm.slug AS destination_module_slug,dm.name AS destination_module_name,
      sr.resource_type AS source_resource_type,sr.resource_id AS source_resource_id,sr.deep_link AS source_deep_link,
      dr.resource_type AS destination_resource_type,dr.resource_id AS destination_resource_id,dr.deep_link AS destination_deep_link,
      i.id AS inbox_id,i.status AS delivery_status,i.attempt_count,i.max_attempts,i.replay_count,i.last_error_code AS delivery_error_code,
      u.email AS actor_email
    FROM shared_workflow_runs r
    JOIN modules sm ON sm.id=r.source_module_id JOIN modules dm ON dm.id=r.destination_module_id
    LEFT JOIN shared_resource_references sr ON sr.tenant_id=r.tenant_id AND sr.id=r.source_reference_id
    LEFT JOIN shared_resource_references dr ON dr.tenant_id=r.tenant_id AND dr.id=r.destination_reference_id
    LEFT JOIN shared_event_inbox i ON i.tenant_id=r.tenant_id AND i.workflow_run_id=r.id
    LEFT JOIN users u ON u.id=r.actor_user_id
    WHERE r.tenant_id=${input.tenantId} AND r.id=${input.runId} LIMIT 1
  `);
  const run = found.rows[0] as Row | undefined;
  if (!run) throw new DataFabricError('FABRIC_RUN_NOT_FOUND', 'Workflow run was not found or is not visible', 404);
  const [sourceAccess,destinationAccess] = await Promise.all([
    resolveTenantModuleAccess(input.actorUserId,input.tenantId,String(run.source_module_slug)),
    resolveTenantModuleAccess(input.actorUserId,input.tenantId,String(run.destination_module_slug)),
  ]);
  if (!sourceAccess.hasAccess || !destinationAccess.hasAccess) {
    throw new DataFabricError('FABRIC_RUN_NOT_FOUND', 'Workflow run was not found or is not visible', 404);
  }
  const [events,links,compensations] = await Promise.all([
    db.execute(sql`SELECT id,event_type,event_version,aggregate_type,aggregate_id,aggregate_sequence,source_deep_link,payload_sha256,signing_key_version,correlation_id,causation_id,root_event_id,propagation_depth,status,occurred_at,dispatched_at,completed_at FROM shared_domain_events WHERE tenant_id=${input.tenantId} AND workflow_run_id=${input.runId} ORDER BY occurred_at,id`),
    db.execute(sql`SELECT l.relationship,l.metadata_json,l.created_at,s.resource_type AS source_type,s.resource_id AS source_id,s.deep_link AS source_deep_link,d.resource_type AS destination_type,d.resource_id AS destination_id,d.deep_link AS destination_deep_link FROM shared_resource_links l JOIN shared_resource_references s ON s.tenant_id=l.tenant_id AND s.id=l.source_reference_id JOIN shared_resource_references d ON d.tenant_id=l.tenant_id AND d.id=l.destination_reference_id WHERE l.tenant_id=${input.tenantId} AND l.workflow_run_id=${input.runId} ORDER BY l.created_at,l.id`),
    db.execute(sql`SELECT reason_code,action,state,details_json,created_at FROM shared_workflow_compensations WHERE tenant_id=${input.tenantId} AND workflow_run_id=${input.runId} ORDER BY created_at,id`),
  ]);
  return { run, events: events.rows, links: links.rows, compensations: compensations.rows };
}

export async function createDataFabricRule(input: {
  tenantId: string; actorUserId: string; name: string; sourceModuleSlug: string; destinationModuleSlug: string;
  sourceEventType: string; workflowKey: DataFabricWorkflowKey; conditions?: Record<string, unknown>; configuration?: Record<string, unknown>; priority?: number;
}) {
  const contract = DATA_FABRIC_WORKFLOWS[input.workflowKey];
  if (!contract || contract.source !== input.sourceModuleSlug || contract.destination !== input.destinationModuleSlug
    || contract.eventType !== input.sourceEventType) {
    throw new DataFabricError('FABRIC_RULE_CONTRACT_INVALID', 'Rule modules do not match the registered workflow');
  }
  const [source,destination] = await Promise.all([
    requireWritableAccess(input.actorUserId,input.tenantId,input.sourceModuleSlug),
    requireWritableAccess(input.actorUserId,input.tenantId,input.destinationModuleSlug),
  ]);
  const result = await db.execute(sql`
    INSERT INTO shared_workflow_rules(tenant_id,name,source_module_id,destination_module_id,source_event_type,workflow_key,conditions_json,configuration_json,priority,created_by_user_id,updated_by_user_id)
    VALUES (${input.tenantId},${input.name.trim().slice(0,160)},${source.moduleId!},${destination.moduleId!},${input.sourceEventType},${input.workflowKey},
      ${sanitizeSharedMetadata(input.conditions)},${sanitizeSharedMetadata(input.configuration)},${Math.max(0,Math.min(10000,input.priority ?? 100))},${input.actorUserId},${input.actorUserId}) RETURNING *
  `);
  return result.rows[0];
}

export async function listDataFabricRules(input: { tenantId: string; actorUserId: string }) {
  const result = await db.execute(sql`
    SELECT r.*,sm.slug AS source_module_slug,dm.slug AS destination_module_slug FROM shared_workflow_rules r
    JOIN modules sm ON sm.id=r.source_module_id JOIN modules dm ON dm.id=r.destination_module_id
    WHERE r.tenant_id=${input.tenantId} AND r.archived_at IS NULL ORDER BY r.priority,r.name
  `);
  const rows: Row[] = [];
  for (const row of result.rows as Row[]) {
    const [source,destination] = await Promise.all([
      resolveTenantModuleAccess(input.actorUserId,input.tenantId,String(row.source_module_slug)),
      resolveTenantModuleAccess(input.actorUserId,input.tenantId,String(row.destination_module_slug)),
    ]);
    if (source.hasAccess && destination.hasAccess) rows.push(row);
  }
  return rows;
}

export async function publishConfiguredCallWorkflows(input: { tenantId: string; actorUserId: string; callId: string; correlationId: string }) {
  const callModule = await moduleBySlug('callcommand-ai');
  const rules = await db.execute(sql`
    SELECT r.*,dm.slug AS destination_module_slug FROM shared_workflow_rules r JOIN modules dm ON dm.id=r.destination_module_id
    WHERE r.tenant_id=${input.tenantId} AND r.source_module_id=${String(callModule.id)} AND r.source_event_type='callcommand.call.analyzed.v1'
      AND r.enabled=TRUE AND r.archived_at IS NULL ORDER BY r.priority,r.id
  `);
  const outcomes: Array<Record<string, unknown>> = [];
  for (const rule of rules.rows as Row[]) {
    try {
      const configuration = (rule.configuration_json ?? {}) as Row;
      const outcome = await publishDataFabricWorkflow({
        tenantId:input.tenantId,actorUserId:input.actorUserId,workflowKey:String(rule.workflow_key) as DataFabricWorkflowKey,
        aggregateId:input.callId,sourceDeepLink:`/modules/callcommand-ai/calls/${input.callId}`,
        idempotencyKey:`call:${input.callId}:rule:${rule.id}:v${rule.version}`,correlationId:input.correlationId,
        payload:{ destinationType: configuration.destinationType, ruleId: rule.id },
      });
      outcomes.push({ ruleId: rule.id, queued: true, duplicate: outcome.duplicate });
    } catch (error) {
      outcomes.push({ ruleId: rule.id, queued: false, errorCode: safeFailureCode(error,'FABRIC_RULE_QUEUE_FAILED') });
    }
  }
  return outcomes;
}
