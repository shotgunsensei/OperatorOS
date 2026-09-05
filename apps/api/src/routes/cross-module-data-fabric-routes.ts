import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireTenantAdmin, requireTenantMember } from '../lib/tenant-auth.js';
import { writeAudit } from '../lib/audit.js';
import {
  DATA_FABRIC_WORKFLOWS,
  DataFabricError,
  createDataFabricRule,
  getDataFabricRun,
  getDataFabricWorkflowReadiness,
  listDataFabricActivity,
  listDataFabricRules,
  publishDataFabricWorkflow,
  replayDataFabricInbox,
  type DataFabricWorkflowKey,
} from '../lib/cross-module-data-fabric.js';

type Row = Record<string, any>;

function context(request: FastifyRequest) {
  return {
    tenantId: String((request.params as Row).tenantId),
    actorUserId: String((request as any).user.id),
  };
}

function body(request: FastifyRequest): Row {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new DataFabricError('FABRIC_BODY_INVALID', 'A JSON object is required');
  }
  const value = request.body as Row;
  for (const key of ['tenantId','tenant_id','actorUserId','userId','sourceModuleId','destinationModuleId','role','entitlement']) {
    if (key in value) throw new DataFabricError('FABRIC_AUTHORITY_FIELD_REJECTED', `${key} is resolved from the trusted OperatorOS session`);
  }
  return value;
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new DataFabricError('FABRIC_FIELD_INVALID', `${field} must be text`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new DataFabricError('FABRIC_FIELD_INVALID', `${field} is outside the allowed format`);
  }
  return result;
}

function identifier(value: unknown, field: string): string {
  const result = text(value,field,36,36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new DataFabricError('FABRIC_IDENTIFIER_INVALID', `${field} must be a UUID`);
  return result;
}

function boundedInteger(value: unknown, field: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new DataFabricError('FABRIC_NUMBER_INVALID', `${field} must be a whole number between ${min} and ${max}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new DataFabricError('FABRIC_NUMBER_INVALID', `${field} must be a whole number between ${min} and ${max}`);
  }
  return parsed;
}

function sourceVersion(value: unknown): string | number {
  if (value === undefined || value === null) {
    throw new DataFabricError(
      'FABRIC_SOURCE_VERSION_REQUIRED',
      'Review the current saved record before confirming this handoff',
    );
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new DataFabricError('FABRIC_SOURCE_VERSION_INVALID', 'expectedSourceVersion must be a safe non-negative integer or timestamp');
    }
    return value;
  }
  if (typeof value === 'string') return text(value, 'expectedSourceVersion', 1, 120);
  throw new DataFabricError('FABRIC_SOURCE_VERSION_INVALID', 'expectedSourceVersion must be a number or timestamp');
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof DataFabricError) {
    return reply.code(error.statusCode).send({ error: error.message, code: error.code, ...error.details });
  }
  const code = error && typeof error === 'object' && 'code' in error ? String((error as Row).code) : 'FABRIC_REQUEST_FAILED';
  const status = code.includes('NOT_FOUND') ? 404 : code.includes('CONFLICT') ? 409 : code.includes('ACCESS') || code.includes('DENIED') ? 403 : code.includes('UNAVAILABLE') ? 503 : 400;
  request.log.error({ requestId: request.id, code, errorType: error instanceof Error ? error.name : typeof error }, 'Cross-module operation failed');
  return reply.code(status).send({ error: 'Cross-module operation could not be completed', code });
}

export async function registerCrossModuleDataFabricRoutes(app: FastifyInstance): Promise<void> {
  const base = '/v1/tenants/:tenantId/data-fabric';

  // Ordinary members may discover and start outcome workflows. The service
  // revalidates write access to both the source and destination modules before
  // it queues anything, so a viewer or a user missing either application
  // cannot use this route to widen their access.
  app.get(`${base}/contracts`, { preHandler: [requireTenantMember] }, async (_request, reply) => {
    return reply.send({ schemaVersion: 1, workflows: DATA_FABRIC_WORKFLOWS });
  });

  app.get(`${base}/workflows/:workflowKey/readiness`, { preHandler: [requireTenantMember] }, async (request, reply) => {
    try {
      const workflowKey = text((request.params as Row).workflowKey, 'workflowKey', 3, 120) as DataFabricWorkflowKey;
      if (!(workflowKey in DATA_FABRIC_WORKFLOWS)) {
        throw new DataFabricError('FABRIC_WORKFLOW_NOT_REGISTERED', 'Workflow is not registered', 404);
      }
      const query = (request.query ?? {}) as Row;
      const sourceModuleSlug = typeof query.sourceModuleSlug === 'string'
        ? text(query.sourceModuleSlug, 'sourceModuleSlug', 2, 80)
        : undefined;
      return reply.send({
        readiness: await getDataFabricWorkflowReadiness({
          ...context(request),
          workflowKey,
          sourceModuleSlug,
        }),
      });
    } catch (error) { return sendError(request, reply, error); }
  });

  app.get(`${base}/activity`, { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    const query = (request.query ?? {}) as Row;
    try {
      const runs = await listDataFabricActivity({ ...context(request), limit: boundedInteger(query.limit,'limit',50,1,100), status: query.status ? String(query.status) : null });
      return reply.send({ runs });
    } catch (error) { return sendError(request,reply,error); }
  });

  app.get(`${base}/runs/:runId`, { preHandler: [requireTenantMember] }, async (request, reply) => {
    try {
      return reply.send(await getDataFabricRun({ ...context(request), runId: identifier((request.params as Row).runId,'runId') }));
    } catch (error) { return sendError(request,reply,error); }
  });

  app.get(`${base}/rules`, { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    try { return reply.send({ rules: await listDataFabricRules(context(request)) }); }
    catch (error) { return sendError(request,reply,error); }
  });

  app.post(`${base}/rules`, { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    try {
      const input = body(request);
      const workflowKey = text(input.workflowKey,'workflowKey',3,120) as DataFabricWorkflowKey;
      if (!(workflowKey in DATA_FABRIC_WORKFLOWS)) throw new DataFabricError('FABRIC_WORKFLOW_NOT_REGISTERED','Workflow is not registered');
      const created = await createDataFabricRule({
        ...context(request), name:text(input.name,'name',1,160), sourceModuleSlug:text(input.sourceModuleSlug,'sourceModuleSlug',2,80),
        destinationModuleSlug:text(input.destinationModuleSlug,'destinationModuleSlug',2,80),
        sourceEventType:text(input.sourceEventType,'sourceEventType',3,120), workflowKey,
        conditions: input.conditions && typeof input.conditions === 'object' && !Array.isArray(input.conditions) ? input.conditions : {},
        configuration: input.configuration && typeof input.configuration === 'object' && !Array.isArray(input.configuration) ? input.configuration : {},
        priority: boundedInteger(input.priority,'priority',100,0,10000),
      });
      const { tenantId,actorUserId } = context(request);
      await writeAudit({ actorUserId,tenantId,targetType:'shared_workflow_rule',targetId:String((created as Row).id),action:'data_fabric_rule_created',after:{ workflowKey, sourceModuleSlug:input.sourceModuleSlug, destinationModuleSlug:input.destinationModuleSlug } },request);
      return reply.code(201).send({ rule:created });
    } catch (error) { return sendError(request,reply,error); }
  });

  app.post(`${base}/workflows/:workflowKey`, { preHandler: [requireTenantMember] }, async (request, reply) => {
    try {
      const input = body(request);
      const workflowKey = text((request.params as Row).workflowKey,'workflowKey',3,120) as DataFabricWorkflowKey;
      if (!(workflowKey in DATA_FABRIC_WORKFLOWS)) throw new DataFabricError('FABRIC_WORKFLOW_NOT_REGISTERED','Workflow is not registered',404);
      const aggregateId = identifier(input.aggregateId,'aggregateId');
      const sourceDeepLink = text(input.sourceDeepLink,'sourceDeepLink',1,1000);
      const idempotencyKey = text(input.idempotencyKey,'idempotencyKey',8,180);
      const correlationId = typeof input.correlationId === 'string' ? text(input.correlationId,'correlationId',1,120) : request.id;
      const queued = await publishDataFabricWorkflow({
        ...context(request),workflowKey,aggregateId,sourceDeepLink,idempotencyKey,correlationId,
        causationId:typeof input.causationId === 'string' ? text(input.causationId,'causationId',1,120) : null,
        rootEventId:input.rootEventId ? identifier(input.rootEventId,'rootEventId') : null,
        propagationDepth:boundedInteger(input.propagationDepth,'propagationDepth',0,0,12),
        sourceModuleSlug:typeof input.sourceModuleSlug === 'string' ? text(input.sourceModuleSlug,'sourceModuleSlug',2,80) : undefined,
        sourceType:typeof input.sourceType === 'string' ? text(input.sourceType,'sourceType',2,100) : undefined,
        sourceKind:typeof input.sourceKind === 'string' ? text(input.sourceKind,'sourceKind',2,32) : undefined,
        expectedSourceVersion:sourceVersion(input.expectedSourceVersion),
        payload:input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {},
        maxAttempts:boundedInteger(input.maxAttempts,'maxAttempts',5,1,20),
      });
      const { tenantId,actorUserId } = context(request);
      const auditAction = queued.requeued
        ? 'data_fabric_workflow_requeued'
        : queued.duplicate
          ? 'data_fabric_workflow_duplicate_observed'
          : 'data_fabric_workflow_queued';
      await writeAudit({ actorUserId,tenantId,targetType:'shared_workflow_run',targetId:String((queued.run as Row).id),action:auditAction,after:{ workflowKey,aggregateId,duplicate:queued.duplicate,requeued:queued.requeued } },request);
      return reply.code(queued.duplicate ? 200 : 202).send({ duplicate:queued.duplicate,requeued:queued.requeued,run:queued.run });
    } catch (error) { return sendError(request,reply,error); }
  });

  app.post(`${base}/inbox/:inboxId/replay`, { preHandler: [requireTenantAdmin] }, async (request, reply) => {
    try {
      const values = context(request);
      const inboxId = identifier((request.params as Row).inboxId,'inboxId');
      const inbox = await replayDataFabricInbox({ ...values,inboxId });
      await writeAudit({ actorUserId:values.actorUserId,tenantId:values.tenantId,targetType:'shared_event_inbox',targetId:inboxId,action:'data_fabric_dead_letter_replayed',after:{ replayCount:(inbox as Row).replay_count } },request);
      return reply.code(202).send({ inbox });
    } catch (error) { return sendError(request,reply,error); }
  });
}
