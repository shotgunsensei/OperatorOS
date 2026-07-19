import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  createTorqueTokenPurchase,
  listTorqueTokenPackages,
  OperatorOsTokenBillingError,
  registerTorqueTokenWebhookHandler,
  torqueTokenWebhookHandlerKey,
  torqueTokenWebhookVerifier,
} from '../lib/operatoros-token-billing.js';
import {
  listTorqueAssistHistory,
  listTorqueTokenLedger,
  normalizeFollowUpAnswers,
  runTorqueAssist,
  torqueAssistContextPreview,
  torqueAssistReconciliation,
  torqueTokenBalance,
  TorqueAssistServiceError,
} from '../lib/torque-assist-service.js';
import { torqueId, TorqueShedValidationError } from '../lib/torqueshed-foundation.js';
import {
  getPaymentProviderAdapter,
  getSharedAiProviderAdapter,
  ProviderDisabledError,
} from '../lib/shared-provider-adapters.js';
import { receiveWebhook } from '../lib/shared-webhooks.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('torqueshed')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];

type Context = { tenantId: string; role: 'owner' | 'admin' | 'member'; viaPlatformRole: boolean };
type User = { id: string };

function tenant(request: FastifyRequest): string {
  return ((request as any).tenantContext as Context).tenantId;
}

function user(request: FastifyRequest): string {
  return ((request as any).user as User).id;
}

function canManage(request: FastifyRequest): boolean {
  const context = (request as any).tenantContext as Context;
  const access = (request as any).tenantModuleAccessLevel as string | undefined;
  return (
    context.viaPlatformRole ||
    context.role === 'owner' ||
    context.role === 'admin' ||
    access === 'manager'
  );
}

function body(request: FastifyRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new TorqueAssistServiceError(
      'A JSON object is required',
      'TORQUE_ASSIST_BODY_INVALID',
      400,
    );
  }
  return request.body as Record<string, unknown>;
}

function idempotencyKey(request: FastifyRequest): string {
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !/^[A-Za-z0-9._:-]{8,200}$/.test(value)) {
    throw new TorqueAssistServiceError(
      'A valid Idempotency-Key header is required',
      'IDEMPOTENCY_KEY_REQUIRED',
      400,
    );
  }
  return value;
}

async function requireOwnedDiagnostic(
  request: FastifyRequest,
  reply: FastifyReply,
  diagnosticSessionId: string,
) {
  const result = await db.execute(sql`
    SELECT id FROM torqueshed_diagnostic_sessions
    WHERE tenant_id=${tenant(request)} AND id=${diagnosticSessionId} AND archived_at IS NULL
      AND (${canManage(request)} OR owner_user_id=${user(request)})
    LIMIT 1
  `);
  if (!result.rows[0]) {
    reply.code(404).send({
      error: 'Diagnostic session not found',
      code: 'TORQUE_ASSIST_SESSION_NOT_FOUND',
    });
    return false;
  }
  return true;
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof TorqueAssistServiceError || error instanceof OperatorOsTokenBillingError) {
    return reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      ...('details' in error ? (error as TorqueAssistServiceError).details : {}),
    });
  }
  if (error instanceof TorqueShedValidationError) {
    return reply.code(error.statusCode).send({ error: error.message, code: error.code });
  }
  if (error instanceof ProviderDisabledError) {
    return reply.code(503).send({
      error: `${error.providerKind} provider is disabled`,
      code:
        error.providerKind === 'ai'
          ? 'TORQUE_ASSIST_PROVIDER_DISABLED'
          : 'TORQUE_PAYMENT_PROVIDER_DISABLED',
    });
  }
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as any).code) : '';
  if (code === 'WEBHOOK_EVENT_CONFLICT' || code === 'WEBHOOK_SCOPE_CONFLICT') {
    return reply.code(409).send({ error: 'Webhook event conflicts with its prior claim', code });
  }
  throw error;
}

export async function registerTorqueAssistRoutes(app: FastifyInstance): Promise<void> {
  registerTorqueTokenWebhookHandler();

  app.get(
    '/v1/modules/torqueshed/torque-assist/status',
    { preHandler: readGuards },
    async (request) => ({
      provider: getSharedAiProviderAdapter().status,
      payments: getPaymentProviderAdapter().status,
      balance: await torqueTokenBalance({ tenantId: tenant(request), userId: user(request) }),
      packages: listTorqueTokenPackages(),
      limits: { userPerMinute: 5, tenantPerMinute: 20, maximumContextCharacters: 48_000 },
      ledgerAuthoritative: true,
    }),
  );

  app.post(
    '/v1/modules/torqueshed/token-purchases/checkout',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const diagnosticSessionId = torqueId(
          input.diagnosticSessionId,
          'diagnosticSessionId',
          true,
        )!;
        if (!(await requireOwnedDiagnostic(request, reply, diagnosticSessionId))) return;
        const result = await createTorqueTokenPurchase({
          tenantId: tenant(request),
          userId: user(request),
          diagnosticSessionId,
          packageKey: input.packageKey,
          idempotencyKey: idempotencyKey(request),
          request,
        });
        return reply.code(result.replayed ? 200 : 201).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post('/v1/billing/torque-assist/webhook', async (request, reply) => {
    try {
      const rawBody = (request as any).rawBody;
      if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') {
        return reply.code(400).send({
          error: 'Raw body unavailable for signature verification',
          code: 'TORQUE_PAYMENT_RAW_BODY_REQUIRED',
        });
      }
      const received = await receiveWebhook({
        rawBody,
        headers: request.headers,
        handlerKey: torqueTokenWebhookHandlerKey(),
        verifier: torqueTokenWebhookVerifier(),
        maxAttempts: 5,
      });
      return reply.code(received.status === 'processed' ? 200 : 202).send({
        received: true,
        duplicate: received.duplicate,
        status: received.status,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get(
    '/v1/modules/torqueshed/token-ledger',
    { preHandler: readGuards },
    async (request, reply) => {
      try {
        const query = request.query as { scope?: string; limit?: string };
        const includeTenant = query.scope === 'tenant';
        if (includeTenant && !canManage(request)) {
          return reply.code(403).send({
            error: 'Manager access is required for tenant ledger scope',
            code: 'TORQUE_LEDGER_MANAGER_REQUIRED',
          });
        }
        return await listTorqueTokenLedger({
          tenantId: tenant(request),
          userId: user(request),
          includeTenant,
          limit: Number(query.limit || 50),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/token-ledger/reconciliation',
    { preHandler: readGuards },
    async (request, reply) => {
      if (!canManage(request)) {
        return reply.code(403).send({
          error: 'Manager access is required for ledger reconciliation',
          code: 'TORQUE_LEDGER_MANAGER_REQUIRED',
        });
      }
      return torqueAssistReconciliation(tenant(request));
    },
  );

  app.get(
    '/v1/modules/torqueshed/diagnostics/:id/torque-assist/context',
    { preHandler: readGuards },
    async (request, reply) => {
      try {
        const diagnosticSessionId = torqueId(
          (request.params as any).id,
          'diagnosticSessionId',
          true,
        )!;
        return await torqueAssistContextPreview({
          tenantId: tenant(request),
          userId: user(request),
          diagnosticSessionId,
          canManage: canManage(request),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/diagnostics/:id/torque-assist',
    { preHandler: readGuards },
    async (request, reply) => {
      try {
        const diagnosticSessionId = torqueId(
          (request.params as any).id,
          'diagnosticSessionId',
          true,
        )!;
        if (!(await requireOwnedDiagnostic(request, reply, diagnosticSessionId))) return;
        return {
          requests: await listTorqueAssistHistory({
            tenantId: tenant(request),
            diagnosticSessionId,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/torque-assist',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const diagnosticSessionId = torqueId(
          input.diagnosticSessionId ?? input.sessionId,
          'diagnosticSessionId',
          true,
        )!;
        const result = await runTorqueAssist({
          tenantId: tenant(request),
          userId: user(request),
          diagnosticSessionId,
          canManage: canManage(request),
          idempotencyKey: idempotencyKey(request),
          followUpAnswers: normalizeFollowUpAnswers(input.followUpAnswers),
          request,
        });
        return reply.send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
