import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireTenantMember, requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import { DataFabricError, getDataFabricWorkflowReadiness, publishDataFabricWorkflow } from '../lib/cross-module-data-fabric.js';
import { CustomerWorkspaceError, directoryContextSchema, getWorkspaceCustomer, inspectWorkspaceJob, listWorkspaceCustomers } from '../lib/customer-workspace.js';
import { writeAudit } from '../lib/audit.js';

const base = '/v1/customer-workspace';
const reads = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const writes = [...reads, requireTenantModuleWriteAccess];
const uuid = z.string().uuid();
const listQuery = z.object({ search: z.string().trim().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
const detailQuery = z.object({ siteId: uuid.optional(), contactId: uuid.optional() }).strict();
const actionBody = z.object({ jobId: uuid, expectedSourceVersion: z.number().int().positive(), directoryContext: directoryContextSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,180}$/) }).strict();
function actor(request: FastifyRequest) { return { tenantId: String((request as any).tenantContext.tenantId), actorUserId: String((request as any).user.id) }; }
function readonly(request: FastifyRequest) { const value = request as any; return value.tenantModuleAccessLevel === 'viewer' || (value.tenantContext.membershipRole === 'viewer' && !value.tenantContext.viaPlatformRole); }
function failure(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) return reply.code(400).send({ code: 'CUSTOMER_WORKSPACE_INPUT_INVALID', error: 'Choose valid customer context and request fields.' });
  if (error instanceof DataFabricError && error.code === 'FABRIC_IDEMPOTENCY_CONFLICT') return reply.code(error.statusCode).send({
    code: error.code, error: 'This request conflicts with an existing field-proof operation. Open the TradeFlow job or existing workflow run and reconcile it before continuing; reloading or changing the retry key does not create a new operation.',
  });
  if (error instanceof CustomerWorkspaceError || error instanceof DataFabricError) return reply.code(error.statusCode).send({ code: error.code, error: error.message });
  throw error;
}

export async function registerCustomerWorkspaceRoutes(app: FastifyInstance) {
  app.get(`${base}/customers`, { preHandler: reads }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    try { return await listWorkspaceCustomers(actor(request).tenantId, listQuery.parse(request.query)); }
    catch (error) { return failure(reply, error); }
  });
  app.get(`${base}/customers/:organizationId`, { preHandler: reads }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    try {
      const organizationId = uuid.parse((request.params as any).organizationId); const query = detailQuery.parse(request.query);
      const context = actor(request);
      const [workspace, readiness] = await Promise.all([
        getWorkspaceCustomer(context.tenantId, { organizationId, siteId: query.siteId ?? null, contactId: query.contactId ?? null }),
        getDataFabricWorkflowReadiness({ ...context, workflowKey: 'tradeflowkit.job_to_snapproof' }),
      ]);
      const readOnly = readonly(request);
      return { ...workspace, capabilities: { sourceModule: 'tradeflowkit', destinationModule: 'snapproofos', readOnly,
        canRequestFieldProof: !readOnly && readiness.available, handoffBlocker: readiness.blocker ?? (readOnly ? 'source_write_required' : null) } };
    } catch (error) { return failure(reply, error); }
  });
  app.post(`${base}/field-proof`, { preHandler: writes }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    try {
      const input = actionBody.parse(request.body); const context = actor(request);
      await db.transaction(tx => inspectWorkspaceJob({ tenantId: context.tenantId, ...input }, tx));
      const queued = await publishDataFabricWorkflow({ ...context, workflowKey: 'tradeflowkit.job_to_snapproof',
        aggregateId: input.jobId, expectedSourceVersion: input.expectedSourceVersion, sourceDeepLink: `/modules/tradeflowkit/jobs/${input.jobId}`,
        idempotencyKey: input.idempotencyKey, correlationId: request.id, payload: { directoryContext: input.directoryContext } });
      await writeAudit({ ...context, targetType: 'shared_workflow_run', targetId: String(queued.run.id),
        action: queued.duplicate ? 'customer_workspace_handoff_duplicate' : 'customer_workspace_handoff_queued',
        after: { workflowKey: 'tradeflowkit.job_to_snapproof', jobId: input.jobId, duplicate: queued.duplicate } }, request);
      return reply.code(queued.duplicate ? 200 : 202).send({ duplicate: queued.duplicate, requeued: queued.requeued, run: queued.run });
    } catch (error) { return failure(reply, error); }
  });
}
