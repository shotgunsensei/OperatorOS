import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { modules, tradeflowkitJobs } from '../schema.js';
import {
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  createAttachment,
  getAttachmentContent,
  getAttachmentServiceStatus,
  getMaxAttachmentBytes,
  listAttachments,
  softDeleteAttachment,
} from '../lib/shared-attachments.js';
import {
  enqueueOutboxMessage,
  listUserNotifications,
  markUserNotificationRead,
} from '../lib/shared-notification-outbox.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  listActivityEvents,
  recordUsageEvent,
  summarizeUsage,
} from '../lib/shared-usage-activity.js';
import { getSharedProviderStatuses } from '../lib/shared-provider-adapters.js';
import { getSharedServiceQueueHealth, getSharedServiceWorkerStatus } from '../lib/shared-service-worker.js';
import { writeAudit } from '../lib/audit.js';

function requestedModuleSlug(request: FastifyRequest): string {
  return String((request.params as { moduleSlug?: string }).moduleSlug || '').trim();
}

async function requireRequestedModuleAccess(request: FastifyRequest, reply: FastifyReply) {
  const slug = requestedModuleSlug(request);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
  }
  return requireTenantModuleAccess(slug)(request, reply);
}

async function moduleIdForSlug(slug: string): Promise<string | null> {
  const [row] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, slug)).limit(1);
  return row?.id ?? null;
}

function tenantAndUser(request: FastifyRequest): { tenantId: string; userId: string } {
  return {
    tenantId: String((request as any).tenantContext.tenantId),
    userId: String((request as any).user.id),
  };
}

function attachmentJson(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    objectType: String(row.object_type),
    objectId: String(row.object_id),
    originalName: String(row.original_name),
    sizeBytes: Number(row.size_bytes),
    declaredMimeType: row.declared_mime_type ? String(row.declared_mime_type) : null,
    detectedMimeType: String(row.detected_mime_type),
    sha256: String(row.sha256),
    scanStatus: String(row.scan_status),
    retentionUntil: row.retention_until ?? null,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

function decodeBase64(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw Object.assign(new Error('contentBase64 must be valid base64'), { code: 'INVALID_ATTACHMENT_CONTENT' });
  }
  const content = Buffer.from(value, 'base64');
  if (content.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
    throw Object.assign(new Error('contentBase64 must be canonical base64'), { code: 'INVALID_ATTACHMENT_CONTENT' });
  }
  return content;
}

function idempotencyKey(request: FastifyRequest): string | null {
  const value = request.headers['idempotency-key'];
  const key = Array.isArray(value) ? value[0] : value;
  return typeof key === 'string' && /^[A-Za-z0-9._:-]{8,200}$/.test(key) ? key : null;
}

function sendSharedServiceError(reply: FastifyReply, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as any).code) : 'SHARED_SERVICE_ERROR';
  const status = code.includes('SIZE') ? 413
    : code.includes('MIME') || code.includes('SIGNATURE') || code.includes('INVALID') ? 422
      : code === 'ATTACHMENT_SCAN_PENDING' ? 423
        : code === 'ATTACHMENT_QUARANTINED' ? 403
          : 503;
  return reply.code(status).send({ error: error instanceof Error ? error.message : 'Shared service failed', code });
}

export async function registerSharedServiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/:moduleSlug/services/status', {
    preHandler: [requireRequestedModuleAccess],
  }, async (request, reply) => {
    const providers = await getSharedProviderStatuses();
    let queues: Record<string, unknown> = {};
    try { queues = await getSharedServiceQueueHealth() as Record<string, unknown>; } catch { /* readiness owns DB failure */ }
    return reply.send({
      providers,
      attachments: getAttachmentServiceStatus(),
      worker: getSharedServiceWorkerStatus(),
      queues,
    });
  });

  app.get('/v1/modules/:moduleSlug/services/notifications', {
    preHandler: [requireRequestedModuleAccess],
  }, async (request, reply) => {
    const slug = requestedModuleSlug(request);
    const moduleId = await moduleIdForSlug(slug);
    if (!moduleId) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
    const { tenantId, userId } = tenantAndUser(request);
    const query = request.query as { limit?: string; before?: string };
    const before = query.before && !Number.isNaN(Date.parse(query.before)) ? new Date(query.before) : null;
    const notifications = await listUserNotifications({
      tenantId,
      moduleId,
      userId,
      limit: Number(query.limit || 25),
      before,
    });
    return reply.send({ notifications });
  });

  app.post('/v1/modules/:moduleSlug/services/notifications/:notificationId/read', {
    preHandler: [requireRequestedModuleAccess],
  }, async (request, reply) => {
    const slug = requestedModuleSlug(request);
    const moduleId = await moduleIdForSlug(slug);
    if (!moduleId) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
    const { tenantId, userId } = tenantAndUser(request);
    const notificationId = String((request.params as any).notificationId || '');
    const updated = await markUserNotificationRead({ tenantId, moduleId, userId, notificationId });
    if (!updated) return reply.code(404).send({ error: 'Notification not found', code: 'NOTIFICATION_NOT_FOUND' });
    return reply.send({ ok: true });
  });

  app.get('/v1/modules/:moduleSlug/services/activity', {
    preHandler: [requireRequestedModuleAccess],
  }, async (request, reply) => {
    const slug = requestedModuleSlug(request);
    const moduleId = await moduleIdForSlug(slug);
    if (!moduleId) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
    const { tenantId } = tenantAndUser(request);
    const query = request.query as { objectType?: string; objectId?: string; cursor?: string; limit?: string };
    return reply.send(await listActivityEvents({
      tenantId,
      moduleId,
      objectType: query.objectType,
      objectId: query.objectId,
      cursor: query.cursor,
      limit: Number(query.limit || 25),
    }));
  });

  app.get('/v1/modules/:moduleSlug/services/usage', {
    preHandler: [requireRequestedModuleAccess],
  }, async (request, reply) => {
    const slug = requestedModuleSlug(request);
    const moduleId = await moduleIdForSlug(slug);
    if (!moduleId) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
    const { tenantId, userId } = tenantAndUser(request);
    const query = request.query as { since?: string };
    const since = query.since && !Number.isNaN(Date.parse(query.since)) ? new Date(query.since) : undefined;
    return reply.send({ usage: await summarizeUsage({ tenantId, moduleId, userId, since }) });
  });

  const tradeFlowAccess = requireTenantModuleAccess('tradeflowkit');
  const bodyLimit = Math.ceil(getMaxAttachmentBytes() * 1.38) + 16_384;

  app.post('/v1/modules/tradeflowkit/jobs/:jobId/attachments', {
    bodyLimit,
    preHandler: [tradeFlowAccess, requireTenantModuleWriteAccess],
  }, async (request, reply) => {
    const key = idempotencyKey(request);
    if (!key) {
      return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    const body = (request.body ?? {}) as {
      originalName?: string;
      mimeType?: string;
      contentBase64?: string;
      retentionUntil?: string | null;
    };
    const jobId = String((request.params as any).jobId || '');
    const { tenantId, userId } = tenantAndUser(request);
    const moduleId = await moduleIdForSlug('tradeflowkit');
    if (!moduleId) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
    const [job] = await db.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs)
      .where(and(eq(tradeflowkitJobs.id, jobId), eq(tradeflowkitJobs.tenantId, tenantId))).limit(1);
    if (!job) return reply.code(404).send({ error: 'Job not found', code: 'JOB_NOT_FOUND' });

    try {
      const content = decodeBase64(body.contentBase64);
      const retentionUntil = body.retentionUntil && !Number.isNaN(Date.parse(body.retentionUntil))
        ? new Date(body.retentionUntil)
        : null;
      const result = await db.transaction(async tx => {
        const operation = await beginIdempotentOperation({
          tenantId,
          moduleId,
          scope: 'tradeflowkit.job.attachment.create',
          idempotencyKey: key,
          request: body,
        }, tx);
        if (operation.state !== 'acquired') return { operation };

        const attachment = await createAttachment({
          tenantId,
          moduleId,
          objectType: 'tradeflowkit_job',
          objectId: jobId,
          originalName: body.originalName || '',
          declaredMimeType: body.mimeType,
          content,
          createdByUserId: userId,
          retentionUntil,
          correlationId: request.id,
        }, tx);
        await recordUsageEvent({
          tenantId,
          moduleId,
          userId,
          operation: 'attachment.storage',
          units: content.length,
          unitKind: 'bytes',
          idempotencyKey: `attachment:${attachment.id}`,
          externalReference: String(attachment.id),
          metadata: { objectType: 'tradeflowkit_job' },
        }, tx);
        await appendActivityEvent({
          tenantId,
          moduleId,
          actorUserId: userId,
          objectType: 'tradeflowkit_job',
          objectId: jobId,
          eventType: 'attachment.uploaded',
          summary: 'Attachment uploaded and queued for security scanning.',
          metadata: { attachmentId: attachment.id, mimeType: attachment.detected_mime_type, sizeBytes: content.length },
          correlationId: request.id,
        }, tx);
        await enqueueOutboxMessage({
          tenantId,
          moduleId,
          requestedByUserId: userId,
          recipientUserId: userId,
          channel: 'in_app',
          subject: 'Attachment received',
          body: `${String(attachment.original_name)} was uploaded and queued for security scanning.`,
          context: { level: 'info', objectType: 'tradeflowkit_job', objectId: jobId },
          idempotencyKey: `attachment:${attachment.id}:received`,
          correlationId: request.id,
        }, tx);
        const response = attachmentJson(attachment);
        await completeIdempotentOperation({
          tenantId,
          id: operation.id,
          leaseExpiresAt: operation.leaseExpiresAt,
          responseStatus: 202,
          responseJson: response,
        }, tx);
        await writeAudit({
          actorUserId: userId,
          tenantId,
          targetType: 'shared_attachment',
          targetId: String(attachment.id),
          action: 'attachment_created',
          after: response,
          extra: { moduleSlug: 'tradeflowkit', objectType: 'tradeflowkit_job', objectId: jobId },
        }, request, tx);
        return { response };
      });

      if ('response' in result) return reply.code(202).send({ attachment: result.response, replayed: false });
      if (result.operation.state === 'replay') {
        return reply.code(result.operation.responseStatus).send({ attachment: result.operation.responseJson, replayed: true });
      }
      if (result.operation.state === 'conflict') {
        return reply.code(409).send({ error: 'Idempotency key was reused for a different upload', code: 'IDEMPOTENCY_CONFLICT' });
      }
      return reply.code(409).send({ error: 'An upload with this idempotency key is still processing', code: 'IDEMPOTENCY_IN_PROGRESS' });
    } catch (error) {
      return sendSharedServiceError(reply, error);
    }
  });

  app.get('/v1/modules/tradeflowkit/jobs/:jobId/attachments', {
    preHandler: [tradeFlowAccess],
  }, async (request, reply) => {
    const jobId = String((request.params as any).jobId || '');
    const { tenantId } = tenantAndUser(request);
    const moduleId = await moduleIdForSlug('tradeflowkit');
    if (!moduleId) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
    const [job] = await db.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs)
      .where(and(eq(tradeflowkitJobs.id, jobId), eq(tradeflowkitJobs.tenantId, tenantId))).limit(1);
    if (!job) return reply.code(404).send({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
    const attachments = await listAttachments({
      tenantId,
      moduleId,
      objectType: 'tradeflowkit_job',
      objectId: jobId,
    });
    return reply.send({ attachments: attachments.map(row => attachmentJson(row as Record<string, unknown>)) });
  });

  app.get('/v1/modules/tradeflowkit/jobs/:jobId/attachments/:attachmentId/content', {
    preHandler: [tradeFlowAccess],
  }, async (request, reply) => {
    const params = request.params as any;
    const { tenantId } = tenantAndUser(request);
    const moduleId = await moduleIdForSlug('tradeflowkit');
    if (!moduleId) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
    try {
      const result = await getAttachmentContent({
        tenantId,
        moduleId,
        attachmentId: String(params.attachmentId),
        objectType: 'tradeflowkit_job',
        objectId: String(params.jobId),
      });
      if (!result) return reply.code(404).send({ error: 'Attachment not found', code: 'ATTACHMENT_NOT_FOUND' });
      const encodedName = encodeURIComponent(String(result.metadata.original_name));
      return reply
        .header('Content-Type', String(result.metadata.detected_mime_type))
        .header('Content-Length', String(result.content.length))
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`)
        .header('Cache-Control', 'private, no-store')
        .send(result.content);
    } catch (error) {
      return sendSharedServiceError(reply, error);
    }
  });

  app.delete('/v1/modules/tradeflowkit/jobs/:jobId/attachments/:attachmentId', {
    preHandler: [tradeFlowAccess, requireTenantModuleWriteAccess],
  }, async (request, reply) => {
    const params = request.params as any;
    const body = (request.body ?? {}) as { version?: number; retentionUntil?: string | null };
    if (!Number.isInteger(body.version) || Number(body.version) < 1) {
      return reply.code(400).send({ error: 'version is required', code: 'VERSION_REQUIRED' });
    }
    const { tenantId, userId } = tenantAndUser(request);
    const moduleId = await moduleIdForSlug('tradeflowkit');
    if (!moduleId) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
    const retentionUntil = body.retentionUntil && !Number.isNaN(Date.parse(body.retentionUntil))
      ? new Date(body.retentionUntil)
      : null;
    const deleted = await db.transaction(async tx => {
      const result = await softDeleteAttachment({
        tenantId,
        moduleId,
        attachmentId: String(params.attachmentId),
        deletedByUserId: userId,
        version: Number(body.version),
        objectType: 'tradeflowkit_job',
        objectId: String(params.jobId),
        retentionUntil,
      }, tx);
      if (!result) return null;
      await appendActivityEvent({
        tenantId,
        moduleId,
        actorUserId: userId,
        objectType: 'tradeflowkit_job',
        objectId: String(params.jobId),
        eventType: 'attachment.deleted',
        summary: 'Attachment was soft deleted.',
        metadata: { attachmentId: params.attachmentId },
        correlationId: request.id,
      }, tx);
      await writeAudit({
        actorUserId: userId,
        tenantId,
        targetType: 'shared_attachment',
        targetId: String(params.attachmentId),
        action: 'attachment_soft_deleted',
        after: { deletedAt: result.deleted_at, version: result.version, retentionUntil: result.retention_until },
        extra: { moduleSlug: 'tradeflowkit', objectType: 'tradeflowkit_job', objectId: String(params.jobId) },
      }, request, tx);
      return result;
    });
    if (!deleted) return reply.code(409).send({ error: 'Attachment version conflict or not found', code: 'ATTACHMENT_VERSION_CONFLICT' });
    return reply.send({ attachment: deleted });
  });
}
