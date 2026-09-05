import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  enqueueSharedJob,
  registerSharedJobHandler,
  type SharedJobContext,
} from './shared-background-jobs.js';
import { sanitizeSharedMetadata, safeFailureCode } from './shared-service-safety.js';
import { getTenantMembership, resolveTenantModuleAccess } from './tenant-entitlements.js';
import { isTenantAdmin } from './rbac.js';
import { deliverNativeWorkflow, type NativeReferenceResult } from './cross-module-workflow-adapters.js';

type Executor = Pick<typeof db, 'execute'>;
type Row = Record<string, any>;

export const DATA_FABRIC_JOB_HANDLER = 'operatoros.data-fabric.dispatch.v1';

export const DATA_FABRIC_WORKFLOWS = Object.freeze({
  'tradeflowkit.job_to_snapproof': {
    source: 'tradeflowkit', destination: 'snapproofos', eventType: 'tradeflowkit.job.proof_requested.v1', sourceKind: 'job', sourceType: 'tradeflowkit_job',
    idempotencyScope: 'tenant',
    actionLabel: 'Start field proof', title: 'Turn this job into a field-proof package',
    outcome: 'Creates a connected SnapProofOS customer, field job, and draft closeout report.',
    prerequisites: ['Write access to TradeFlowKit and SnapProofOS', 'An active TradeFlowKit job'],
  },
  'snapproof.approved_report_to_tradeflowkit': {
    source: 'snapproofos', destination: 'tradeflowkit', eventType: 'snapproof.report.approved_exported.v1', sourceKind: 'report', sourceType: 'snapproof_report',
    idempotencyScope: 'tenant',
    actionLabel: 'Attach approved report', title: 'Return approved proof to the job',
    outcome: 'Attaches the verified PDF closeout report to its active TradeFlowKit job.',
    prerequisites: ['Write access to SnapProofOS and TradeFlowKit', 'An approved report with a generated PDF', 'A connected TradeFlowKit job'],
  },
  'callcommand.analysis_to_tradeflowkit': {
    source: 'callcommand-ai', destination: 'tradeflowkit', eventType: 'callcommand.call.analyzed.v1', sourceKind: 'case', sourceType: 'callcommand_call',
    idempotencyScope: 'tenant',
    actionLabel: 'Create follow-up work', title: 'Turn this call into revenue work',
    outcome: 'Creates either a TradeFlowKit lead or a customer job from the completed call summary.',
    prerequisites: ['Write access to CallCommand AI and TradeFlowKit', 'A completed, analyzed call', 'A selected lead or job destination'],
  },
  'callcommand.analysis_to_pulsedesk': {
    source: 'callcommand-ai', destination: 'pulsedesk', eventType: 'callcommand.call.analyzed.v1', sourceKind: 'case', sourceType: 'callcommand_call',
    idempotencyScope: 'tenant',
    actionLabel: 'Create operations request', title: 'Route this call into the operations queue',
    outcome: 'Creates a prioritized PulseDesk operations request from the completed call summary.',
    prerequisites: ['Write access to CallCommand AI and PulseDesk', 'A completed, analyzed call', 'Explicit confirmation that the summary is operations-only and contains no patient or clinical data'],
  },
  'callcommand.analysis_to_techdeck': {
    source: 'callcommand-ai', destination: 'techdeck', eventType: 'callcommand.call.analyzed.v1', sourceKind: 'case', sourceType: 'callcommand_call',
    idempotencyScope: 'tenant',
    actionLabel: 'Create support ticket', title: 'Route this call into technical support',
    outcome: 'Creates a prioritized TechDeck ticket from the completed call summary.',
    prerequisites: ['Write access to CallCommand AI and TechDeck', 'A completed, analyzed call'],
  },
  'support.resolved_to_faultlinelab': {
    source: null, destination: 'faultlinelab', eventType: 'support.issue.resolved_training_opt_in.v1', sourceKind: 'ticket', sourceType: null,
    idempotencyScope: 'tenant',
    actionLabel: 'Create training exercise', title: 'Turn a resolved issue into team practice',
    outcome: 'Creates an unpublished FaultlineLab draft with common identifiers masked and a required trainer privacy review.',
    prerequisites: ['Manager access to the source support app and FaultlineLab', 'A resolved issue', 'Explicit author and privacy review before creating the draft'],
  },
  'torqueshed.diagnostic_to_snapproof': {
    source: 'torqueshed', destination: 'snapproofos', eventType: 'torqueshed.diagnostic.proof_requested.v1', sourceKind: 'case', sourceType: 'torqueshed_diagnostic',
    idempotencyScope: 'tenant',
    actionLabel: 'Build customer proof', title: 'Turn this diagnosis into a customer-ready work record',
    outcome: 'Creates a SnapProofOS diagnostic job, copies the recorded observations, and starts a draft report.',
    prerequisites: ['Write access to TorqueShed and SnapProofOS', 'An active diagnostic session'],
  },
  'torqueshed.diagnostic_to_faultlinelab': {
    source: 'torqueshed', destination: 'faultlinelab', eventType: 'torqueshed.diagnostic.training_opt_in.v1', sourceKind: 'case', sourceType: 'torqueshed_diagnostic',
    idempotencyScope: 'tenant',
    actionLabel: 'Create training exercise', title: 'Teach the team from a completed diagnosis',
    outcome: 'Creates an unpublished automotive training draft with common identifiers masked for trainer privacy and accuracy review.',
    prerequisites: ['Write access to TorqueShed and FaultlineLab', 'An active diagnostic session', 'Explicit author and privacy review before creating the draft'],
  },
  'brandforgeos.campaign_to_launchkit': {
    source: 'brandforgeos', destination: 'ninja-launch-kit', eventType: 'brandforgeos.campaign.launch_kit_requested.v1', sourceKind: 'campaign', sourceType: 'brandforge_campaign',
    idempotencyScope: 'actor',
    actionLabel: 'Create launch package', title: 'Turn this campaign into a launch package',
    outcome: 'Creates a Deploy Ops campaign package with launch copy, visual guidance, review history, and a readiness checklist.',
    prerequisites: ['Write access to BrandForgeOS and Deploy Ops', 'An active campaign and brand', 'Available Deploy Ops generation allowance'],
  },
  'ninjamation.script_to_techdeck': {
    source: 'ninjamation', destination: 'techdeck', eventType: 'ninjamation.script.documentation_requested.v1', sourceKind: 'script', sourceType: 'ninjamation_script',
    idempotencyScope: 'tenant',
    actionLabel: 'Create support runbook', title: 'Package this approved script for technician use',
    outcome: 'Creates a non-executing TechDeck draft runbook with the approved script, review history, and a protected file-integrity record.',
    prerequisites: ['Write access to Script Ops and TechDeck', 'An approved current script revision'],
  },
} as const);

export type DataFabricWorkflowKey = keyof typeof DATA_FABRIC_WORKFLOWS;
export type DataFabricIdempotencyScope = (typeof DATA_FABRIC_WORKFLOWS)[DataFabricWorkflowKey]['idempotencyScope'];

const CURRENT_SIGNATURE_ENVELOPE_VERSION = 2;

const MANAGER_REVIEWED_WORKFLOWS = new Set<DataFabricWorkflowKey>([
  'support.resolved_to_faultlinelab',
  'torqueshed.diagnostic_to_faultlinelab',
]);

function workflowRequiresManagerReview(workflowKey: DataFabricWorkflowKey): boolean {
  return MANAGER_REVIEWED_WORKFLOWS.has(workflowKey);
}

function canonicalWorkflowSourceDeepLink(
  workflowKey: DataFabricWorkflowKey,
  sourceModuleSlug: string,
  aggregateId: string,
): string {
  switch (workflowKey) {
    case 'tradeflowkit.job_to_snapproof': return `/modules/tradeflowkit/jobs/${aggregateId}`;
    case 'snapproof.approved_report_to_tradeflowkit': return `/modules/snapproofos/reports/${aggregateId}`;
    case 'callcommand.analysis_to_tradeflowkit':
    case 'callcommand.analysis_to_pulsedesk':
    case 'callcommand.analysis_to_techdeck': return `/modules/callcommand-ai/calls/${aggregateId}`;
    case 'support.resolved_to_faultlinelab': return `/modules/${sourceModuleSlug}/tickets/${aggregateId}`;
    case 'torqueshed.diagnostic_to_snapproof':
    case 'torqueshed.diagnostic_to_faultlinelab': return `/modules/torqueshed/diagnostics/${aggregateId}`;
    case 'brandforgeos.campaign_to_launchkit': return `/modules/brandforgeos/campaigns/${aggregateId}`;
    case 'ninjamation.script_to_techdeck': return `/modules/ninjamation/scripts/${aggregateId}`;
  }
}

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

type FabricSigningMaterial = { key: Buffer; version: string };

function signingRoot(configured: string): Buffer | null {
  let root: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(configured)) root = Buffer.from(configured, 'hex');
  if (!root && configured) {
    try {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length === 32) root = decoded;
    } catch { /* rejected below */ }
  }
  return root;
}

function derivedSigningMaterial(configured: string, version: string): FabricSigningMaterial | null {
  const root = signingRoot(configured);
  if (!root) return null;
  return {
    key: createHmac('sha256', root).update('operatoros:data-fabric:event-signing:v1').digest(),
    version: version.slice(0, 80),
  };
}

function signingMaterial(): FabricSigningMaterial {
  // The dedicated key decouples event delivery from secret-vault rotation.
  // Falling back to the shared key preserves existing deployments until they
  // opt into the dedicated key through a controlled rotation window.
  const dedicated = String(process.env.DATA_FABRIC_EVENT_SIGNING_KEY ?? '').trim();
  const shared = String(process.env.SHARED_SECRET_ENCRYPTION_KEY ?? '').trim();
  const configured = dedicated || shared;
  let material = derivedSigningMaterial(
    configured,
    String(dedicated
      ? process.env.DATA_FABRIC_EVENT_SIGNING_KEY_VERSION ?? 'data-fabric-v1'
      : process.env.SHARED_SECRET_ENCRYPTION_KEY_VERSION ?? (shared ? 'shared-v1' : 'test-only-v1')),
  );
  if (!material && (process.env.APP_ENV === 'test' || process.env.NODE_ENV === 'test')) {
    const root = createHash('sha256').update('operatoros-data-fabric-test-only-v1').digest('hex');
    material = derivedSigningMaterial(root, 'test-only-v1');
  }
  if (!material) throw new DataFabricError('DATA_FABRIC_SIGNING_KEY_UNAVAILABLE', 'The internal data-fabric signing key is unavailable', 503);
  return material;
}

function verificationSigningMaterial(version: string): FabricSigningMaterial | null {
  const current = signingMaterial();
  if (current.version === version) return current;
  const previousKey = String(process.env.DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY ?? '').trim();
  const previousVersion = String(process.env.DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY_VERSION ?? '').trim();
  if (!previousKey && !previousVersion) return null;
  if (!previousKey || !previousVersion || previousVersion === current.version) {
    throw new DataFabricError('DATA_FABRIC_SIGNING_KEYRING_INVALID', 'The data-fabric signing key rotation window is invalid', 503);
  }
  const previous = derivedSigningMaterial(previousKey, previousVersion);
  return previous?.version === version ? previous : null;
}

function signEnvelopeWithMaterial(envelope: Record<string, unknown>, material: FabricSigningMaterial) {
  const canonical = stable(envelope);
  return {
    canonical,
    payloadSha256: createHash('sha256').update(stable(envelope.payload)).digest('hex'),
    signature: createHmac('sha256', material.key).update(canonical).digest('hex'),
    signingKeyVersion: material.version,
  };
}

function signEnvelope(envelope: Record<string, unknown>) {
  return signEnvelopeWithMaterial(envelope, signingMaterial());
}

function legacyEnvelopeFromDeliveryRow(row: Row): Record<string, unknown> {
  return {
    tenantId: String(row.event_tenant_id),
    sourceModuleId: String(row.event_source_module_id),
    eventType: String(row.event_type),
    eventVersion: Number(row.event_version),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    aggregateSequence: Number(row.aggregate_sequence),
    idempotencyKey: String(row.event_idempotency_key),
    correlationId: String(row.event_correlation_id),
    causationId: row.event_causation_id ? String(row.event_causation_id) : null,
    rootEventId: row.event_root_event_id ? String(row.event_root_event_id) : null,
    propagationDepth: Number(row.propagation_depth),
    sourceDeepLink: String(row.source_deep_link),
    payload: row.payload_json as Record<string, unknown>,
  };
}

function routedEnvelopeFromDeliveryRow(row: Row): Record<string, unknown> {
  return {
    signatureEnvelopeVersion: CURRENT_SIGNATURE_ENVELOPE_VERSION,
    tenantId: String(row.event_tenant_id),
    workflowRunId: String(row.event_workflow_run_id),
    workflowKey: String(row.run_workflow_key),
    sourceModuleId: String(row.event_source_module_id),
    destinationModuleId: String(row.inbox_destination_module_id),
    consumerKey: String(row.inbox_consumer_key),
    actorUserId: row.event_actor_user_id ? String(row.event_actor_user_id) : null,
    sourceReferenceId: row.run_source_reference_id ? String(row.run_source_reference_id) : null,
    eventType: String(row.event_type),
    eventVersion: Number(row.event_version),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    aggregateSequence: Number(row.aggregate_sequence),
    idempotencyKey: String(row.event_idempotency_key),
    correlationId: String(row.event_correlation_id),
    causationId: row.event_causation_id ? String(row.event_causation_id) : null,
    rootEventId: row.event_root_event_id ? String(row.event_root_event_id) : null,
    propagationDepth: Number(row.propagation_depth),
    sourceDeepLink: String(row.source_deep_link),
    payload: row.payload_json as Record<string, unknown>,
  };
}

function verifyEnvelope(row: Row): boolean {
  const envelopeVersion = Number(row.event_signature_envelope_version ?? 1);
  const envelope = envelopeVersion === 1
    ? legacyEnvelopeFromDeliveryRow(row)
    : envelopeVersion === CURRENT_SIGNATURE_ENVELOPE_VERSION
      ? routedEnvelopeFromDeliveryRow(row)
      : null;
  if (!envelope) return false;
  const material = verificationSigningMaterial(String(row.signing_key_version));
  if (!material) return false;
  const expected = signEnvelopeWithMaterial(envelope, material);
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

function normalizeExpectedSourceVersion(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new DataFabricError('FABRIC_SOURCE_VERSION_INVALID', 'expectedSourceVersion must be a safe non-negative integer or timestamp');
    }
    return String(value);
  }
  if (typeof value !== 'string') {
    throw new DataFabricError('FABRIC_SOURCE_VERSION_INVALID', 'expectedSourceVersion must be a number or timestamp');
  }
  const result = value.trim();
  if (!result || result.length > 120 || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new DataFabricError('FABRIC_SOURCE_VERSION_INVALID', 'expectedSourceVersion is outside the allowed format');
  }
  if (/^\d+$/.test(result)) return String(BigInt(result));
  const timestamp = Date.parse(result);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : result;
}

function workflowSemanticIdempotencyKey(input: {
  workflowKey: DataFabricWorkflowKey;
  aggregateId: string;
  sourceModuleSlug: string;
  actorUserId: string;
  idempotencyScope: DataFabricIdempotencyScope;
  expectedSourceVersion: string;
  payload: Record<string, unknown>;
}): string {
  const scope = {
    workflowKey: input.workflowKey,
    aggregateId: input.aggregateId,
    sourceModuleSlug: input.sourceModuleSlug,
    actorUserId: input.idempotencyScope === 'actor' ? input.actorUserId : null,
    expectedSourceVersion: input.expectedSourceVersion,
    destinationType: typeof input.payload.destinationType === 'string' ? input.payload.destinationType : null,
    tradeFlowJobId: typeof input.payload.tradeFlowJobId === 'string' ? input.payload.tradeFlowJobId : null,
    invoiceId: typeof input.payload.invoiceId === 'string' ? input.payload.invoiceId : null,
    operationsOnlyApproved: input.payload.operationsOnlyApproved === true,
    authorApproved: input.payload.authorApproved === true,
    privacyReviewed: input.payload.privacyReviewed === true,
  };
  return `operation:${createHash('sha256').update(stable(scope)).digest('hex')}`;
}

function workflowRequestFingerprint(input: {
  workflowKey: DataFabricWorkflowKey;
  aggregateId: string;
  sourceModuleSlug: string;
  sourceType: string;
  sourceKind: string;
  sourceDeepLink: string;
  actorUserId: string;
  idempotencyScope: DataFabricIdempotencyScope;
  expectedSourceVersion: string;
  payload: Record<string, unknown>;
  propagationDepth: number;
}): string {
  const material = {
    workflowKey: input.workflowKey,
    aggregateId: input.aggregateId,
    sourceModuleSlug: input.sourceModuleSlug,
    sourceType: input.sourceType,
    sourceKind: input.sourceKind,
    sourceDeepLink: input.sourceDeepLink,
    actorUserId: input.idempotencyScope === 'actor' ? input.actorUserId : null,
    expectedSourceVersion: input.expectedSourceVersion,
    payload: input.payload,
    propagationDepth: input.propagationDepth,
  };
  return createHash('sha256').update(stable(material)).digest('hex');
}

function publishRunForRequester(row: Row, actorUserId: string): Row {
  if (String(row.actor_user_id ?? '') === actorUserId) return row;
  const {
    actor_user_id: _actorUserId,
    idempotency_key: _idempotencyKey,
    legacy_shared_match: _legacySharedMatch,
    details_json: detailsValue,
    ...visible
  } = row;
  const details = (detailsValue ?? {}) as Row;
  return {
    ...visible,
    details_json: sanitizeSharedMetadata({
      sourceModule: details.sourceModule,
      destinationModule: details.destinationModule,
      idempotencyScope: details.idempotencyScope,
      summary: details.summary,
      destinationCount: details.destinationCount,
      asynchronous: details.asynchronous,
    }),
  };
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

async function requireManagerAccess(
  decision: Awaited<ReturnType<typeof requireWritableAccess>>,
  userId: string,
  tenantId: string,
  slug: string,
) {
  if (!(await hasManagerAccess(decision, userId, tenantId))) {
    throw new DataFabricError(
      'FABRIC_MODULE_MANAGER_REQUIRED',
      `Manager access to ${slug} is required for this workflow`,
      403,
      { moduleSlug: slug },
    );
  }
}

function resolveWorkflowSourceSlug(
  workflowKey: DataFabricWorkflowKey,
  requestedSourceModuleSlug?: string,
): string {
  const contract = DATA_FABRIC_WORKFLOWS[workflowKey];
  if (!contract) throw new DataFabricError('FABRIC_WORKFLOW_NOT_REGISTERED', 'Workflow is not registered', 404);
  const sourceSlug = requestedSourceModuleSlug ?? contract.source;
  if (!sourceSlug) throw new DataFabricError('FABRIC_SOURCE_MODULE_REQUIRED', 'This workflow requires an explicit source module');
  if (contract.source && sourceSlug !== contract.source) {
    throw new DataFabricError('FABRIC_SOURCE_MODULE_MISMATCH', 'Source module does not match the workflow contract');
  }
  if (workflowKey === 'support.resolved_to_faultlinelab' && !['techdeck', 'pulsedesk'].includes(sourceSlug)) {
    throw new DataFabricError('FABRIC_SOURCE_MODULE_MISMATCH', 'Resolved support training drafts must originate in TechDeck or PulseDesk');
  }
  return sourceSlug;
}

async function hasManagerAccess(
  decision: Awaited<ReturnType<typeof requireWritableAccess>>,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  if (decision.viaPlatformRole || decision.accessLevel === 'manager') return true;
  const membership = await getTenantMembership(userId, tenantId);
  return isTenantAdmin(membership?.role);
}

export type DataFabricWorkflowReadinessBlocker =
  | 'source_unavailable'
  | 'source_write_required'
  | 'source_manager_required'
  | 'destination_unavailable'
  | 'destination_write_required'
  | 'destination_manager_required';

export interface DataFabricWorkflowModuleReadiness {
  moduleSlug: string;
  hasAccess: boolean;
  accessLevel: 'none' | 'viewer' | 'user' | 'manager';
  canWrite: boolean;
  canManage: boolean;
}

/**
 * Read-only access check for the confirmation UI. This improves the customer
 * journey only; publishDataFabricWorkflow repeats every authorization and
 * source-record check so a stale readiness response can never grant access.
 */
export async function getDataFabricWorkflowReadiness(input: {
  tenantId: string;
  actorUserId: string;
  workflowKey: DataFabricWorkflowKey;
  sourceModuleSlug?: string;
}) {
  const contract = DATA_FABRIC_WORKFLOWS[input.workflowKey];
  if (!contract) throw new DataFabricError('FABRIC_WORKFLOW_NOT_REGISTERED', 'Workflow is not registered', 404);
  const sourceSlug = resolveWorkflowSourceSlug(input.workflowKey, input.sourceModuleSlug);
  const [sourceDecision, destinationDecision, membership] = await Promise.all([
    resolveTenantModuleAccess(input.actorUserId, input.tenantId, sourceSlug),
    resolveTenantModuleAccess(input.actorUserId, input.tenantId, contract.destination),
    getTenantMembership(input.actorUserId, input.tenantId),
  ]);
  const tenantManager = isTenantAdmin(membership?.role);
  const summarize = (
    moduleSlug: string,
    decision: typeof sourceDecision,
  ): DataFabricWorkflowModuleReadiness => ({
    moduleSlug,
    hasAccess: decision.hasAccess,
    accessLevel: decision.accessLevel,
    canWrite: decision.hasAccess && (decision.accessLevel === 'user' || decision.accessLevel === 'manager'),
    canManage: decision.hasAccess && (decision.viaPlatformRole || decision.accessLevel === 'manager' || tenantManager),
  });
  const source = summarize(sourceSlug, sourceDecision);
  const destination = summarize(contract.destination, destinationDecision);
  const managerAccessRequired = workflowRequiresManagerReview(input.workflowKey);
  const blocker: DataFabricWorkflowReadinessBlocker | null = !source.hasAccess
    ? 'source_unavailable'
    : !source.canWrite
      ? 'source_write_required'
      : managerAccessRequired && !source.canManage
        ? 'source_manager_required'
        : !destination.hasAccess
          ? 'destination_unavailable'
          : !destination.canWrite
            ? 'destination_write_required'
            : managerAccessRequired && !destination.canManage
              ? 'destination_manager_required'
              : null;
  return {
    workflowKey: input.workflowKey,
    source,
    destination,
    managerAccessRequired,
    minimumAccess: managerAccessRequired ? 'manager' as const : 'user' as const,
    available: blocker === null,
    blocker,
  };
}

/**
 * Reapply source-record visibility before accepting and before delivering a
 * workflow. Module access alone must never allow a caller to copy another
 * member's private record into a destination they can read.
 */
async function requireWorkflowSourceObjectAccess(input: {
  workflowKey: DataFabricWorkflowKey;
  tenantId: string;
  actorUserId: string;
  aggregateId: string;
  sourceCanReviewAll: boolean;
  executor?: Executor;
}): Promise<void> {
  if (input.workflowKey !== 'torqueshed.diagnostic_to_snapproof') return;
  const executor = input.executor ?? db;
  const found = await executor.execute(sql`
    SELECT id
    FROM torqueshed_diagnostic_sessions
    WHERE tenant_id=${input.tenantId}
      AND id=${input.aggregateId}
      AND archived_at IS NULL
      AND (
        ${input.sourceCanReviewAll}
        OR owner_user_id=${input.actorUserId}
        OR visibility='tenant'
      )
    LIMIT 1
  `);
  if (!found.rows[0]) {
    throw new DataFabricError(
      'FABRIC_SOURCE_NOT_FOUND',
      'The source record was not found or is not visible',
      404,
    );
  }
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
  expectedSourceVersion: string | number;
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
  const sourceSlug = resolveWorkflowSourceSlug(input.workflowKey, input.sourceModuleSlug);
  const sourceDeepLink = canonicalWorkflowSourceDeepLink(input.workflowKey, sourceSlug, input.aggregateId);
  if (input.sourceDeepLink !== sourceDeepLink) {
    throw new DataFabricError(
      'FABRIC_SOURCE_LINK_MISMATCH',
      'The source link does not match the selected workflow record',
      409,
      { expectedSourceDeepLink: sourceDeepLink },
    );
  }
  const contractSourceType = contract.sourceType
    ?? (input.workflowKey === 'support.resolved_to_faultlinelab'
      ? sourceSlug === 'techdeck' ? 'techdeck_ticket' : 'pulsedesk_request'
      : null);
  if (input.sourceType && contractSourceType && input.sourceType !== contractSourceType) {
    throw new DataFabricError('FABRIC_SOURCE_TYPE_MISMATCH', 'Source record type does not match the workflow contract', 409);
  }
  if (input.sourceKind && input.sourceKind !== contract.sourceKind) {
    throw new DataFabricError('FABRIC_SOURCE_KIND_MISMATCH', 'Source record kind does not match the workflow contract', 409);
  }
  const sourceType = contractSourceType ?? input.sourceType ?? 'support_issue';
  const sourceKind = contract.sourceKind;
  const expectedSourceVersion = normalizeExpectedSourceVersion(input.expectedSourceVersion);
  if (expectedSourceVersion === null) {
    throw new DataFabricError(
      'FABRIC_SOURCE_VERSION_REQUIRED',
      'Review the current saved record before confirming this handoff',
      400,
    );
  }
  const [sourceAccess, destinationAccess, sourceModule, destinationModule] = await Promise.all([
    requireWritableAccess(input.actorUserId, input.tenantId, sourceSlug),
    requireWritableAccess(input.actorUserId, input.tenantId, contract.destination),
    moduleBySlug(sourceSlug), moduleBySlug(contract.destination),
  ]);
  if (!sourceAccess.moduleId || !destinationAccess.moduleId) throw new DataFabricError('FABRIC_MODULE_UNAVAILABLE', 'Workflow module registration is unavailable', 503);
  if (workflowRequiresManagerReview(input.workflowKey)) {
    await Promise.all([
      requireManagerAccess(sourceAccess, input.actorUserId, input.tenantId, sourceSlug),
      requireManagerAccess(destinationAccess, input.actorUserId, input.tenantId, contract.destination),
    ]);
  }
  const sourceCanReviewAll = await hasManagerAccess(
    sourceAccess,
    input.actorUserId,
    input.tenantId,
  );
  await requireWorkflowSourceObjectAccess({
    workflowKey: input.workflowKey,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    aggregateId: input.aggregateId,
    sourceCanReviewAll,
  });
  const safePayload = sanitizeSharedMetadata({
    ...(input.payload ?? {}),
    sourceType,
    expectedSourceVersion,
  });
  const idempotencyScope = contract.idempotencyScope;
  const semanticIdempotencyInput = {
    workflowKey: input.workflowKey,
    aggregateId: input.aggregateId,
    sourceModuleSlug: sourceSlug,
    actorUserId: input.actorUserId,
    expectedSourceVersion,
    payload: safePayload,
  };
  const effectiveIdempotencyKey = workflowSemanticIdempotencyKey({
    ...semanticIdempotencyInput,
    idempotencyScope,
  });
  // Existing data-fabric rows were actor-scoped. Retain their exact semantic
  // material so an in-flight or completed pre-policy operation remains
  // discoverable after tenant-owned workflows move to tenant scope.
  const legacyActorIdempotencyKey = workflowSemanticIdempotencyKey({
    ...semanticIdempotencyInput,
    idempotencyScope: 'actor',
  });
  const requestFingerprintInput = {
    workflowKey: input.workflowKey,
    aggregateId: input.aggregateId,
    sourceModuleSlug: sourceSlug,
    sourceType,
    sourceKind,
    sourceDeepLink,
    actorUserId: input.actorUserId,
    expectedSourceVersion,
    payload: safePayload,
    propagationDepth: depth,
  };
  const requestFingerprint = workflowRequestFingerprint({
    ...requestFingerprintInput,
    idempotencyScope,
  });
  const legacyActorRequestFingerprint = workflowRequestFingerprint({
    ...requestFingerprintInput,
    idempotencyScope: 'actor',
  });
  return db.transaction(async tx => {
    // Serialize a caller's retry key so two concurrent, different requests
    // cannot both pass the request-fingerprint check.
    const clientLockKey = `${input.tenantId}:${input.workflowKey}:${input.actorUserId}:${input.idempotencyKey}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${clientLockKey}))`);
    // Tenant-owned operations also serialize across actors. The database
    // uniqueness rule remains the final race guard, but this avoids using a
    // unique-violation path for an ordinary simultaneous confirmation.
    const semanticLockKey = `${input.tenantId}:${input.workflowKey}:${idempotencyScope}:${effectiveIdempotencyKey}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${semanticLockKey}))`);
    const existing = await tx.execute(sql`
      SELECT r.*,e.id AS event_id,i.id AS inbox_id,i.status AS inbox_status,
        i.replay_count AS inbox_replay_count,i.max_attempts AS inbox_max_attempts,
        CASE WHEN ${idempotencyScope}='tenant'
          AND r.idempotency_scope='actor'
          AND r.source_module_id=${String(sourceModule.id)}
          AND r.destination_module_id=${String(destinationModule.id)}
          AND e.aggregate_type=${sourceType}
          AND e.aggregate_id=${input.aggregateId}
          AND e.source_deep_link=${sourceDeepLink}
          AND e.payload_json=${safePayload}
          AND e.propagation_depth=${depth}
        THEN TRUE ELSE FALSE END AS legacy_shared_match
      FROM shared_workflow_runs r
      LEFT JOIN shared_domain_events e ON e.tenant_id=r.tenant_id AND e.workflow_run_id=r.id
      LEFT JOIN shared_event_inbox i ON i.tenant_id=e.tenant_id AND i.event_id=e.id
      WHERE r.tenant_id=${input.tenantId}
        AND r.workflow_key=${input.workflowKey}
        AND (
          (r.idempotency_scope=${idempotencyScope} AND r.idempotency_key=${effectiveIdempotencyKey})
          OR (r.actor_user_id=${input.actorUserId} AND r.idempotency_key=${legacyActorIdempotencyKey})
          OR (r.actor_user_id=${input.actorUserId} AND r.details_json->>'requestIdempotencyKey'=${input.idempotencyKey})
          OR (
            ${idempotencyScope}='tenant'
            AND r.idempotency_scope='actor'
            AND r.source_module_id=${String(sourceModule.id)}
            AND r.destination_module_id=${String(destinationModule.id)}
            AND e.aggregate_type=${sourceType}
            AND e.aggregate_id=${input.aggregateId}
            AND e.source_deep_link=${sourceDeepLink}
            AND e.payload_json=${safePayload}
            AND e.propagation_depth=${depth}
          )
        )
      ORDER BY CASE
        WHEN r.actor_user_id=${input.actorUserId} AND r.details_json->>'requestIdempotencyKey'=${input.idempotencyKey} THEN 0
        WHEN r.idempotency_scope=${idempotencyScope} AND r.idempotency_key=${effectiveIdempotencyKey} THEN 1
        ELSE 2
      END,r.queued_at,r.id
      LIMIT 1
    `);
    const existingRow = existing.rows[0] as Row | undefined;
    if (existingRow) {
      const details = (existingRow.details_json ?? {}) as Row;
      const sameClientKey = String(details.requestIdempotencyKey ?? '') === input.idempotencyKey;
      const acceptedFingerprint = String(details.requestFingerprint ?? '') === requestFingerprint
        || String(details.requestFingerprint ?? '') === legacyActorRequestFingerprint
        || existingRow.legacy_shared_match === true;
      if (
        (
          sameClientKey
          || String(existingRow.idempotency_key) === effectiveIdempotencyKey
          || String(existingRow.idempotency_key) === legacyActorIdempotencyKey
          || existingRow.legacy_shared_match === true
        )
        && !acceptedFingerprint
      ) {
        throw new DataFabricError(
          'FABRIC_IDEMPOTENCY_CONFLICT',
          'This retry key was already used for a different workflow request',
          409,
        );
      }
      if (
        existingRow.status === 'dead_letter'
        && existingRow.inbox_status === 'dead_letter'
        && String(existingRow.actor_user_id) === input.actorUserId
        && existingRow.inbox_id
      ) {
        const requeued = await tx.execute(sql`
          UPDATE shared_event_inbox SET status='pending',attempt_count=0,replay_count=replay_count+1,
            available_at=NOW(),lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL,completed_at=NULL,updated_at=NOW()
          WHERE tenant_id=${input.tenantId} AND id=${String(existingRow.inbox_id)} AND status='dead_letter'
          RETURNING replay_count,max_attempts
        `);
        const inbox = requeued.rows[0] as Row | undefined;
        if (inbox) {
          await tx.execute(sql`UPDATE shared_workflow_runs SET status='queued',retry_count=0,last_error_code=NULL,completed_at=NULL,updated_at=NOW() WHERE tenant_id=${input.tenantId} AND id=${String(existingRow.id)}`);
          await tx.execute(sql`UPDATE shared_domain_events SET status='pending',completed_at=NULL WHERE tenant_id=${input.tenantId} AND id=${String(existingRow.event_id)}`);
          await enqueueSharedJob({
            tenantId: input.tenantId,
            moduleId: String(destinationModule.id),
            requestedByUserId: input.actorUserId,
            handlerKey: DATA_FABRIC_JOB_HANDLER,
            payload: { inboxId: String(existingRow.inbox_id) },
            idempotencyKey: `fabric:${existingRow.inbox_id}:member-retry:${inbox.replay_count}`,
            correlationId: String(existingRow.correlation_id),
            maxAttempts: Number(inbox.max_attempts),
          }, tx);
          return {
            duplicate: true,
            requeued: true,
            run: { ...existingRow, status: 'queued', delivery_status: 'pending', last_error_code: null },
          };
        }
      }
      return { duplicate: true, requeued: false, run: publishRunForRequester(existingRow, input.actorUserId) };
    }
    const sourceReference = await upsertReference({
      tenantId: input.tenantId, moduleId: String(sourceModule.id),
      resourceKind: sourceKind,
      resourceType: sourceType,
      resourceId: input.aggregateId, deepLink: sourceDeepLink, actorUserId: input.actorUserId,
      metadata: { workflowKey: input.workflowKey },
    }, tx);
    const run = await tx.execute(sql`
      INSERT INTO shared_workflow_runs(
        tenant_id,workflow_key,source_module_id,destination_module_id,actor_user_id,source_reference_id,
        status,idempotency_scope,idempotency_key,correlation_id,causation_id,details_json
      ) VALUES (
        ${input.tenantId},${input.workflowKey},${String(sourceModule.id)},${String(destinationModule.id)},${input.actorUserId},${String(sourceReference.id)},
        'queued',${idempotencyScope},${effectiveIdempotencyKey},${input.correlationId},${input.causationId ?? null},${sanitizeSharedMetadata({ sourceModule: sourceSlug, destinationModule: contract.destination, idempotencyScope, requestIdempotencyKey: input.idempotencyKey, requestFingerprint })}
      ) ON CONFLICT (tenant_id,workflow_key,idempotency_key) DO NOTHING RETURNING *
    `);
    let runRow = run.rows[0] as Row | undefined;
    if (!runRow) {
      const raced = await tx.execute(sql`
        SELECT r.*,e.id AS event_id,i.id AS inbox_id FROM shared_workflow_runs r
        LEFT JOIN shared_domain_events e ON e.tenant_id=r.tenant_id AND e.workflow_run_id=r.id
        LEFT JOIN shared_event_inbox i ON i.tenant_id=e.tenant_id AND i.event_id=e.id
        WHERE r.tenant_id=${input.tenantId}
          AND r.workflow_key=${input.workflowKey}
          AND r.idempotency_scope=${idempotencyScope}
          AND r.idempotency_key=${effectiveIdempotencyKey}
        LIMIT 1
      `);
      const racedRow = raced.rows[0] as Row | undefined;
      if (!racedRow) throw new DataFabricError('FABRIC_IDEMPOTENCY_CONFLICT', 'The idempotent workflow run could not be resolved', 409);
      const racedDetails = (racedRow.details_json ?? {}) as Row;
      if (String(racedDetails.requestFingerprint ?? '') !== requestFingerprint) {
        throw new DataFabricError(
          'FABRIC_IDEMPOTENCY_CONFLICT',
          'The concurrent workflow request did not match the accepted operation',
          409,
        );
      }
      return { duplicate: true, requeued: false, run: publishRunForRequester(racedRow, input.actorUserId) };
    }
    const lockKey = `${input.tenantId}:${sourceModule.id}:${sourceType}:${input.aggregateId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const sequence = await tx.execute(sql`
      SELECT COALESCE(MAX(aggregate_sequence),0)::int + 1 AS next_sequence FROM shared_domain_events
      WHERE tenant_id=${input.tenantId} AND source_module_id=${String(sourceModule.id)}
        AND aggregate_type=${sourceType} AND aggregate_id=${input.aggregateId}
    `);
    const aggregateSequence = Number((sequence.rows[0] as Row).next_sequence);
    const workflowRunId = String(runRow.id);
    const consumerKey = input.workflowKey;
    const envelope = {
      signatureEnvelopeVersion: CURRENT_SIGNATURE_ENVELOPE_VERSION,
      tenantId: input.tenantId,
      workflowRunId,
      workflowKey: input.workflowKey,
      sourceModuleId: String(sourceModule.id),
      destinationModuleId: String(destinationModule.id),
      consumerKey,
      actorUserId: input.actorUserId,
      sourceReferenceId: String(sourceReference.id),
      eventType: contract.eventType,
      eventVersion: 1,
      aggregateType: sourceType, aggregateId: input.aggregateId, aggregateSequence,
      idempotencyKey: effectiveIdempotencyKey, correlationId: input.correlationId, causationId: input.causationId ?? null,
      rootEventId: input.rootEventId ?? null, propagationDepth: depth, sourceDeepLink, payload: safePayload,
    };
    const signed = signEnvelope(envelope);
    const event = await tx.execute(sql`
      INSERT INTO shared_domain_events(
        tenant_id,workflow_run_id,source_module_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_sequence,
        source_deep_link,actor_user_id,payload_json,payload_sha256,signature_hmac_sha256,signing_key_version,signature_envelope_version,
        idempotency_key,correlation_id,causation_id,root_event_id,propagation_depth,status
      ) VALUES (
        ${input.tenantId},${workflowRunId},${String(sourceModule.id)},${contract.eventType},1,
        ${envelope.aggregateType},${input.aggregateId},${aggregateSequence},${sourceDeepLink},${input.actorUserId},${safePayload},
        ${signed.payloadSha256},${signed.signature},${signed.signingKeyVersion},${CURRENT_SIGNATURE_ENVELOPE_VERSION},${effectiveIdempotencyKey},${input.correlationId},
        ${input.causationId ?? null},${input.rootEventId ?? null},${depth},'pending'
      ) RETURNING *
    `);
    const eventRow = event.rows[0] as Row;
    const inbox = await tx.execute(sql`
      INSERT INTO shared_event_inbox(tenant_id,event_id,workflow_run_id,destination_module_id,consumer_key,max_attempts)
      VALUES (${input.tenantId},${String(eventRow.id)},${workflowRunId},${String(destinationModule.id)},${consumerKey},${Math.max(1,Math.min(20,input.maxAttempts ?? 5))})
      RETURNING *
    `);
    const inboxRow = inbox.rows[0] as Row;
    await enqueueSharedJob({
      tenantId: input.tenantId, moduleId: String(destinationModule.id), requestedByUserId: input.actorUserId,
      handlerKey: DATA_FABRIC_JOB_HANDLER, payload: { inboxId: inboxRow.id }, idempotencyKey: `fabric:${inboxRow.id}:initial`,
      correlationId: input.correlationId, maxAttempts: Math.max(1,Math.min(20,input.maxAttempts ?? 5)),
    }, tx);
    return { duplicate: false, requeued: false, run: { ...runRow, event_id: eventRow.id, inbox_id: inboxRow.id } };
  });
}

function comparable(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}

function assertDeliveryRelationships(row: Row): void {
  const relationships: Array<[string, unknown, unknown]> = [
    ['event tenant to inbox tenant', row.event_tenant_id, row.inbox_tenant_id],
    ['run tenant to inbox tenant', row.run_tenant_id, row.inbox_tenant_id],
    ['event ID to inbox event ID', row.event_id, row.inbox_event_id],
    ['run ID to inbox workflow run ID', row.run_id, row.inbox_workflow_run_id],
    ['event workflow run ID to inbox workflow run ID', row.event_workflow_run_id, row.inbox_workflow_run_id],
    ['event source module to run source module', row.event_source_module_id, row.run_source_module_id],
    ['inbox destination module to run destination module', row.inbox_destination_module_id, row.run_destination_module_id],
    ['inbox consumer to run workflow', row.inbox_consumer_key, row.run_workflow_key],
    ['event actor to run actor', row.event_actor_user_id, row.run_actor_user_id],
    ['event idempotency key to run idempotency key', row.event_idempotency_key, row.run_idempotency_key],
    ['event correlation ID to run correlation ID', row.event_correlation_id, row.run_correlation_id],
    ['source reference module to run source module', row.source_reference_module_id, row.run_source_module_id],
    ['source reference record to event aggregate', row.source_reference_resource_id, row.aggregate_id],
    ['source reference type to event aggregate type', row.source_reference_resource_type, row.aggregate_type],
    ['source reference link to event source link', row.source_reference_deep_link, row.source_deep_link],
  ];
  const mismatch = relationships.find(([, left, right]) => comparable(left) !== comparable(right));
  if (mismatch) {
    throw new DataFabricError(
      'FABRIC_ROUTE_INTEGRITY_INVALID',
      'The signed event, inbox, workflow run, or source reference does not describe one authorized route',
      409,
      { relationship: mismatch[0] },
    );
  }
  const workflowKey = String(row.run_workflow_key) as DataFabricWorkflowKey;
  const contract = DATA_FABRIC_WORKFLOWS[workflowKey];
  const sourceSlug = String(row.source_module_slug);
  const destinationSlug = String(row.destination_module_slug);
  const sourceMatches = contract?.source
    ? contract.source === sourceSlug
    : workflowKey === 'support.resolved_to_faultlinelab' && ['techdeck', 'pulsedesk'].includes(sourceSlug);
  if (!contract || !sourceMatches || contract.destination !== destinationSlug || contract.eventType !== String(row.event_type)) {
    throw new DataFabricError(
      'FABRIC_ROUTE_INTEGRITY_INVALID',
      'The signed event route does not match the registered workflow contract',
      409,
      { relationship: 'registered workflow contract' },
    );
  }
}

const PERMANENT_CODES = new Set([
  'FABRIC_SOURCE_ARCHIVED','FABRIC_SOURCE_NOT_READY','FABRIC_SOURCE_NOT_APPROVED','FABRIC_SOURCE_NOT_RESOLVED',
  'FABRIC_DESTINATION_ARCHIVED','FABRIC_DESTINATION_NOT_FOUND','FABRIC_DESTINATION_TYPE_UNSUPPORTED','FABRIC_DESTINATION_CONFLICT',
  'FABRIC_MODULE_ACCESS_DENIED','FABRIC_MODULE_WRITE_DENIED','FABRIC_EVENT_SIGNATURE_INVALID','FABRIC_EVENT_TENANT_MISMATCH',
  'FABRIC_LOOP_GUARD_REJECTED','FABRIC_AUTHOR_APPROVAL_REQUIRED','FABRIC_PRIVACY_REVIEW_REQUIRED','FABRIC_BASIC_MASKING_FAILED','FABRIC_PARTIAL_EXPORT',
  'FABRIC_EXPORT_INTEGRITY_FAILED','FABRIC_PROVENANCE_MISSING','FABRIC_PROVENANCE_MISMATCH','FABRIC_WORKFLOW_NOT_REGISTERED','FABRIC_SOURCE_TYPE_UNSUPPORTED',
  'FABRIC_SOURCE_VERSION_REQUIRED','FABRIC_SOURCE_VERSION_CHANGED','FABRIC_SOURCE_NOT_FOUND','FABRIC_MODULE_MANAGER_REQUIRED',
  'FABRIC_SIMULATION_SOURCE_REJECTED',
  'FABRIC_ROUTE_INTEGRITY_INVALID',
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

export async function deliverDataFabricInbox(
  inboxId: string,
  expectedJobContext?: { tenantId: string; moduleId: string },
): Promise<void> {
  const expectedTenantId = expectedJobContext?.tenantId ?? null;
  const expectedModuleId = expectedJobContext?.moduleId ?? null;
  let failureInbox: Row | null = null;
  try {
    await db.transaction(async tx => {
      // Lock the complete route before verifying it. The signature and
      // relationship checks therefore describe the exact rows used by the
      // adapter, rather than a pre-transaction snapshot that could change
      // between verification and destination writes.
      const loaded = await tx.execute(sql`
        SELECT
          i.id AS inbox_id,i.tenant_id AS inbox_tenant_id,i.event_id AS inbox_event_id,
          i.workflow_run_id AS inbox_workflow_run_id,i.destination_module_id AS inbox_destination_module_id,
          i.consumer_key AS inbox_consumer_key,i.status AS inbox_status,i.attempt_count AS inbox_attempt_count,
          i.max_attempts AS inbox_max_attempts,i.replay_count AS inbox_replay_count,
          e.id AS event_id,e.tenant_id AS event_tenant_id,e.workflow_run_id AS event_workflow_run_id,
          e.source_module_id AS event_source_module_id,e.event_type,e.event_version,e.aggregate_type,e.aggregate_id,
          e.aggregate_sequence,e.source_deep_link,e.actor_user_id AS event_actor_user_id,e.payload_json,e.payload_sha256,
          e.signature_hmac_sha256,e.signing_key_version,e.signature_envelope_version AS event_signature_envelope_version,
          e.idempotency_key AS event_idempotency_key,e.correlation_id AS event_correlation_id,
          e.causation_id AS event_causation_id,e.root_event_id AS event_root_event_id,e.propagation_depth,
          r.id AS run_id,r.tenant_id AS run_tenant_id,r.workflow_key AS run_workflow_key,
          r.source_module_id AS run_source_module_id,r.destination_module_id AS run_destination_module_id,
          r.actor_user_id AS run_actor_user_id,r.source_reference_id AS run_source_reference_id,
          r.idempotency_key AS run_idempotency_key,r.correlation_id AS run_correlation_id,
          sr.module_id AS source_reference_module_id,sr.resource_type AS source_reference_resource_type,
          sr.resource_id AS source_reference_resource_id,sr.deep_link AS source_reference_deep_link,
          sm.slug AS source_module_slug,dm.slug AS destination_module_slug
        FROM shared_event_inbox i
        JOIN shared_domain_events e ON e.tenant_id=i.tenant_id AND e.id=i.event_id
        JOIN shared_workflow_runs r ON r.tenant_id=i.tenant_id AND r.id=i.workflow_run_id
        JOIN shared_resource_references sr ON sr.tenant_id=r.tenant_id AND sr.id=r.source_reference_id
        JOIN modules sm ON sm.id=e.source_module_id
        JOIN modules dm ON dm.id=i.destination_module_id
        WHERE i.id=${inboxId}
          AND (${expectedTenantId}::text IS NULL OR i.tenant_id=${expectedTenantId})
          AND (${expectedModuleId}::text IS NULL OR i.destination_module_id=${expectedModuleId})
        LIMIT 1
        FOR UPDATE OF i,e,r,sr
      `);
      const row = loaded.rows[0] as Row | undefined;
      if (!row) throw new DataFabricError('FABRIC_INBOX_NOT_FOUND', 'Data-fabric inbox row is unavailable', 404);
      const inbox: Row = {
        id: row.inbox_id,
        tenant_id: row.inbox_tenant_id,
        status: row.inbox_status,
        attempt_count: row.inbox_attempt_count,
        max_attempts: row.inbox_max_attempts,
        replay_count: row.inbox_replay_count,
        workflow_run_id: row.inbox_workflow_run_id,
        event_id: row.inbox_event_id,
        destination_module_id: row.inbox_destination_module_id,
        actor_user_id: row.run_actor_user_id,
      };
      if (inbox.status === 'completed') return;
      failureInbox = inbox;
      assertDeliveryRelationships(row);
      if (!verifyEnvelope(row)) throw new DataFabricError('FABRIC_EVENT_SIGNATURE_INVALID', 'Domain-event signature or payload hash is invalid');
      if (Number(row.propagation_depth) > 12) throw new DataFabricError('FABRIC_LOOP_GUARD_REJECTED', 'Domain-event propagation depth exceeds the loop guard');
      if (!row.run_actor_user_id) throw new DataFabricError('FABRIC_ACTOR_UNAVAILABLE', 'Workflow actor is unavailable');
      const delivery = {
        tenantId: String(row.run_tenant_id),
        actorUserId: String(row.run_actor_user_id),
        workflowKey: String(row.run_workflow_key) as DataFabricWorkflowKey,
        workflowRunId: String(row.run_id),
        eventId: String(row.event_id),
        sourceModuleId: String(row.run_source_module_id),
        destinationModuleId: String(row.run_destination_module_id),
        sourceReferenceId: String(row.run_source_reference_id),
        aggregateId: String(row.aggregate_id),
        payload: row.payload_json as Record<string, unknown>,
        sourceModuleSlug: String(row.source_module_slug),
        destinationModuleSlug: String(row.destination_module_slug),
      };
      const [sourceAccess, destinationAccess] = await Promise.all([
        requireWritableAccess(delivery.actorUserId, delivery.tenantId, delivery.sourceModuleSlug),
        requireWritableAccess(delivery.actorUserId, delivery.tenantId, delivery.destinationModuleSlug),
      ]);
      if (workflowRequiresManagerReview(delivery.workflowKey)) {
        await Promise.all([
          requireManagerAccess(sourceAccess, delivery.actorUserId, delivery.tenantId, delivery.sourceModuleSlug),
          requireManagerAccess(destinationAccess, delivery.actorUserId, delivery.tenantId, delivery.destinationModuleSlug),
        ]);
      }
      const sourceCanReviewAll = await hasManagerAccess(sourceAccess, delivery.actorUserId, delivery.tenantId);
      await requireWorkflowSourceObjectAccess({
        workflowKey: delivery.workflowKey,
        tenantId: delivery.tenantId,
        actorUserId: delivery.actorUserId,
        aggregateId: delivery.aggregateId,
        sourceCanReviewAll,
      });
      const claimed = await tx.execute(sql`
        UPDATE shared_event_inbox SET status='processing',attempt_count=attempt_count+1,lease_owner=${`fabric:${process.pid}`},
          lease_expires_at=NOW()+interval '2 minutes',updated_at=NOW()
        WHERE tenant_id=${delivery.tenantId} AND id=${String(inbox.id)} AND status IN ('pending','retry')
        RETURNING attempt_count
      `);
      if (!claimed.rows[0]) {
        const current = await tx.execute(sql`SELECT status FROM shared_event_inbox WHERE tenant_id=${delivery.tenantId} AND id=${String(inbox.id)}`);
        if ((current.rows[0] as Row | undefined)?.status === 'completed') return;
        throw new DataFabricError('FABRIC_INBOX_BUSY', 'Inbox delivery is already in progress', 409);
      }
      await tx.execute(sql`UPDATE shared_workflow_runs SET status='running',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE tenant_id=${delivery.tenantId} AND id=${delivery.workflowRunId}`);
      await tx.execute(sql`UPDATE shared_domain_events SET status='dispatching',dispatched_at=COALESCE(dispatched_at,NOW()) WHERE tenant_id=${delivery.tenantId} AND id=${delivery.eventId}`);
      const result = await deliverNativeWorkflow(delivery.workflowKey, {
        tenantId: delivery.tenantId, actorUserId: delivery.actorUserId, eventId: delivery.eventId,
        workflowRunId: delivery.workflowRunId, sourceModuleId: delivery.sourceModuleId,
        destinationModuleId: delivery.destinationModuleId, aggregateId: delivery.aggregateId,
        payload: delivery.payload, sourceCanReviewAll, executor: tx,
      });
      let primaryDestinationId: string | null = null;
      for (const native of result.references) {
        const reference = await upsertReference({
          tenantId: delivery.tenantId, moduleId: delivery.destinationModuleId, resourceKind: native.resourceKind,
          resourceType: native.resourceType, resourceId: native.resourceId, deepLink: native.deepLink,
          actorUserId: delivery.actorUserId, metadata: native.metadata,
        }, tx);
        if (!primaryDestinationId) primaryDestinationId = String(reference.id);
        await tx.execute(sql`
          INSERT INTO shared_resource_links(tenant_id,workflow_run_id,event_id,source_reference_id,destination_reference_id,relationship,created_by_user_id,metadata_json)
          VALUES (${delivery.tenantId},${delivery.workflowRunId},${delivery.eventId},${delivery.sourceReferenceId},${String(reference.id)},${native.relationship},${delivery.actorUserId},${sanitizeSharedMetadata(native.metadata)})
          ON CONFLICT (tenant_id,source_reference_id,destination_reference_id,relationship) DO NOTHING
        `);
      }
      const status = result.partial ? 'partial' : 'completed';
      await tx.execute(sql`
        UPDATE shared_event_inbox SET status='completed',result_json=${sanitizeSharedMetadata({ summary: result.summary, references: result.references.map(item => ({ resourceType: item.resourceType, resourceId: item.resourceId, deepLink: item.deepLink })) })},
          lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL,completed_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${delivery.tenantId} AND id=${String(inbox.id)}
      `);
      await tx.execute(sql`UPDATE shared_domain_events SET status=${result.partial ? 'partial' : 'delivered'},completed_at=NOW() WHERE tenant_id=${delivery.tenantId} AND id=${delivery.eventId}`);
      await tx.execute(sql`
        UPDATE shared_workflow_runs SET status=${status},destination_reference_id=${primaryDestinationId},last_error_code=NULL,
          details_json=details_json || ${sanitizeSharedMetadata({ summary: result.summary, destinationCount: result.references.length, asynchronous: true })},completed_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${delivery.tenantId} AND id=${delivery.workflowRunId}
      `);
    });
  } catch (error) {
    if (!failureInbox) throw error;
    const failure = await recordDeliveryFailure(failureInbox, error);
    if (!failure.terminal) throw error;
  }
}

async function sharedJobHandler(context: SharedJobContext): Promise<void> {
  const inboxId = String(context.payload.inboxId ?? '');
  if (!validId(inboxId)) throw new DataFabricError('FABRIC_INBOX_ID_INVALID', 'Data-fabric job is missing a valid inbox ID');
  await deliverDataFabricInbox(inboxId, { tenantId: context.tenantId, moduleId: context.moduleId });
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
  const ownsRun = String(run.actor_user_id ?? '') === input.actorUserId;
  const tenantMembership = sourceAccess.viaPlatformRole
    ? null
    : await getTenantMembership(input.actorUserId,input.tenantId);
  const mayReviewTenantRuns = sourceAccess.viaPlatformRole
    || destinationAccess.viaPlatformRole
    || isTenantAdmin(tenantMembership?.role)
    || (sourceAccess.accessLevel === 'manager' && destinationAccess.accessLevel === 'manager');
  const mayReviewTenantOwnedOutcome = run.idempotency_scope === 'tenant'
    && !['none', 'viewer'].includes(String(sourceAccess.accessLevel))
    && !['none', 'viewer'].includes(String(destinationAccess.accessLevel));
  if (!ownsRun && !mayReviewTenantRuns && !mayReviewTenantOwnedOutcome) {
    throw new DataFabricError('FABRIC_RUN_NOT_FOUND', 'Workflow run was not found or is not visible', 404);
  }
  const [events,links,compensations] = await Promise.all([
    db.execute(sql`SELECT id,event_type,event_version,signature_envelope_version,aggregate_type,aggregate_id,aggregate_sequence,source_deep_link,payload_sha256,signing_key_version,correlation_id,causation_id,root_event_id,propagation_depth,status,occurred_at,dispatched_at,completed_at FROM shared_domain_events WHERE tenant_id=${input.tenantId} AND workflow_run_id=${input.runId} ORDER BY occurred_at,id`),
    db.execute(sql`SELECT l.relationship,l.metadata_json,l.created_at,s.resource_type AS source_type,s.resource_id AS source_id,s.deep_link AS source_deep_link,d.resource_type AS destination_type,d.resource_id AS destination_id,d.deep_link AS destination_deep_link FROM shared_resource_links l JOIN shared_resource_references s ON s.tenant_id=l.tenant_id AND s.id=l.source_reference_id JOIN shared_resource_references d ON d.tenant_id=l.tenant_id AND d.id=l.destination_reference_id WHERE l.tenant_id=${input.tenantId} AND l.workflow_run_id=${input.runId} ORDER BY l.created_at,l.id`),
    db.execute(sql`SELECT reason_code,action,state,details_json,created_at FROM shared_workflow_compensations WHERE tenant_id=${input.tenantId} AND workflow_run_id=${input.runId} ORDER BY created_at,id`),
  ]);
  const details = (run.details_json ?? {}) as Row;
  const safeDetails = ownsRun || mayReviewTenantRuns
    ? details
    : sanitizeSharedMetadata({
      sourceModule: details.sourceModule,
      destinationModule: details.destinationModule,
      idempotencyScope: details.idempotencyScope,
      summary: details.summary,
      destinationCount: details.destinationCount,
      asynchronous: details.asynchronous,
    });
  const safeRun = {
    id: run.id,
    workflow_key: run.workflow_key,
    status: run.status,
    correlation_id: run.correlation_id,
    causation_id: run.causation_id,
    retry_count: run.retry_count,
    last_error_code: run.last_error_code,
    details_json: safeDetails,
    queued_at: run.queued_at,
    started_at: run.started_at,
    completed_at: run.completed_at,
    updated_at: run.updated_at,
    source_module_slug: run.source_module_slug,
    source_module_name: run.source_module_name,
    destination_module_slug: run.destination_module_slug,
    destination_module_name: run.destination_module_name,
    source_resource_type: run.source_resource_type,
    source_resource_id: run.source_resource_id,
    source_deep_link: run.source_deep_link,
    destination_resource_type: run.destination_resource_type,
    destination_resource_id: run.destination_resource_id,
    destination_deep_link: run.destination_deep_link,
    inbox_id: run.inbox_id,
    delivery_status: run.delivery_status,
    delivery_error_code: run.delivery_error_code,
    attempt_count: run.attempt_count,
    max_attempts: run.max_attempts,
    replay_count: run.replay_count,
    ...(mayReviewTenantRuns || ownsRun ? { actor_email: run.actor_email } : {}),
  };
  return { run: safeRun, events: events.rows, links: links.rows, compensations: compensations.rows };
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
  if (input.workflowKey === 'callcommand.analysis_to_pulsedesk') {
    throw new DataFabricError(
      'FABRIC_PER_CALL_REVIEW_REQUIRED',
      'PulseDesk requests require a person to review and approve each call summary',
      409,
    );
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

function configuredCallConditionsMatch(call: Row, input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const conditions = input as Row;
  const exactFields: Record<string, unknown> = {
    channelId: call.channel_id,
    direction: call.direction,
    purpose: call.purpose,
    priority: call.priority,
    intent: call.intent,
    disposition: call.disposition,
  };
  for (const [key, expected] of Object.entries(conditions)) {
    if (key === 'summaryIncludes' || key === 'intentIncludes') {
      if (typeof expected !== 'string' || !expected.trim()) return false;
      const actual = key === 'summaryIncludes' ? call.summary : call.intent;
      if (!String(actual ?? '').toLowerCase().includes(expected.trim().toLowerCase())) return false;
      continue;
    }
    if (!(key in exactFields)) return false;
    const actual = String(exactFields[key] ?? '');
    if (Array.isArray(expected)) {
      if (!expected.some(item => typeof item === 'string' && item === actual)) return false;
    } else if (typeof expected !== 'string' || expected !== actual) {
      return false;
    }
  }
  return true;
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
  const source = await db.execute(sql`
    SELECT * FROM callcommand_calls
    WHERE tenant_id=${input.tenantId} AND id=${input.callId} AND analyzed_at IS NOT NULL AND status='completed'
    LIMIT 1
  `);
  const call = source.rows[0] as Row | undefined;
  if (!call || String(call.provider).toLowerCase() === 'simulator') return [];
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
      if (String(rule.workflow_key) === 'callcommand.analysis_to_pulsedesk') {
        outcomes.push({ ruleId: rule.id, queued: false, matched: false, errorCode: 'FABRIC_PER_CALL_REVIEW_REQUIRED' });
        continue;
      }
      if (!configuredCallConditionsMatch(call, rule.conditions_json ?? {})) {
        outcomes.push({ ruleId: rule.id, queued: false, matched: false, errorCode: 'FABRIC_RULE_CONDITIONS_NOT_MATCHED' });
        continue;
      }
      const outcome = await publishDataFabricWorkflow({
        tenantId:input.tenantId,actorUserId:input.actorUserId,workflowKey:String(rule.workflow_key) as DataFabricWorkflowKey,
        aggregateId:input.callId,sourceDeepLink:`/modules/callcommand-ai/calls/${input.callId}`,
        idempotencyKey:`call:${input.callId}:rule:${rule.id}:v${rule.version}`,correlationId:input.correlationId,
        expectedSourceVersion: call.updated_at instanceof Date
          ? call.updated_at.toISOString()
          : String(call.updated_at ?? call.analyzed_at),
        payload:{
          destinationType: configuration.destinationType,
          ruleId: rule.id,
        },
      });
      outcomes.push({ ruleId: rule.id, queued: true, duplicate: outcome.duplicate });
    } catch (error) {
      outcomes.push({ ruleId: rule.id, queued: false, errorCode: safeFailureCode(error,'FABRIC_RULE_QUEUE_FAILED') });
    }
  }
  return outcomes;
}
