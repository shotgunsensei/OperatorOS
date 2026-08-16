import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { authenticate } from '../lib/auth.js';
import { resolveTenantContext } from '../lib/tenant-auth.js';
import {
  TenantMessengerError,
  createTenantMessengerConversation,
  deleteTenantMessengerMessage,
  disconnectTenantMessengerPresence,
  getTenantMessengerConversation,
  hideTenantMessengerConversation,
  listTenantMessengerConversations,
  listTenantMessengerDeliveryTargets,
  listTenantMessengerMembers,
  listTenantMessengerMessages,
  loadTenantMessengerMessage,
  markTenantMessengerConversationRead,
  sendTenantMessengerMessage,
  touchTenantMessengerPresence,
  updateTenantMessengerConversation,
  updateTenantMessengerMessage,
} from '../lib/tenant-messenger.js';
import {
  createTenantMessengerRealtimeBus,
  type TenantMessengerRealtimeEvent,
} from '../lib/tenant-messenger-realtime.js';

const uuid = z.string().uuid();
const clientMessageId = z.string().regex(/^[A-Za-z0-9._:-]{8,80}$/);
const createConversationBody = z.object({
  participantUserIds: z.array(uuid).min(1).max(19),
  title: z.string().trim().min(1).max(120).optional(),
}).strict();
const sendMessageBody = z.object({
  body: z.string().trim().min(1).max(4000),
  clientMessageId,
  replyToMessageId: uuid.nullish(),
}).strict();
const updateMessageBody = z.object({
  body: z.string().trim().min(1).max(4000),
  expectedVersion: z.number().int().positive(),
}).strict();
const deleteMessageQuery = z.object({ expectedVersion: z.coerce.number().int().positive() }).strict();
const updateConversationBody = z.object({
  muted: z.boolean().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  expectedVersion: z.number().int().positive().optional(),
}).strict().refine(value => value.muted !== undefined || value.title !== undefined, {
  message: 'At least one conversation setting is required',
}).refine(value => value.title === undefined || value.expectedVersion !== undefined, {
  message: 'expectedVersion is required when renaming a conversation',
});

type SocketRegistry = Map<string, Map<string, Set<WebSocket>>>;
const sockets: SocketRegistry = new Map();

function addSocket(tenantId: string, userId: string, socket: WebSocket) {
  let tenantSockets = sockets.get(tenantId);
  if (!tenantSockets) {
    tenantSockets = new Map();
    sockets.set(tenantId, tenantSockets);
  }
  let userSockets = tenantSockets.get(userId);
  if (!userSockets) {
    userSockets = new Set();
    tenantSockets.set(userId, userSockets);
  }
  userSockets.add(socket);
}

function removeSocket(tenantId: string, userId: string, socket: WebSocket): number {
  const tenantSockets = sockets.get(tenantId);
  const userSockets = tenantSockets?.get(userId);
  userSockets?.delete(socket);
  const remaining = userSockets?.size ?? 0;
  if (userSockets && userSockets.size === 0) tenantSockets?.delete(userId);
  if (tenantSockets && tenantSockets.size === 0) sockets.delete(tenantId);
  return remaining;
}

function safeSend(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== 1) return;
  try { socket.send(JSON.stringify(payload)); } catch { /* reconnect/polling recovers */ }
}

function sendToTenant(tenantId: string, payload: unknown) {
  for (const userSockets of sockets.get(tenantId)?.values() ?? []) {
    for (const socket of userSockets) safeSend(socket, payload);
  }
}

function sendToUser(tenantId: string, userId: string, payload: unknown) {
  for (const socket of sockets.get(tenantId)?.get(userId) ?? []) safeSend(socket, payload);
}

function privateReply(reply: FastifyReply) {
  return reply.header('Cache-Control', 'private, no-store').header('Pragma', 'no-cache');
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return privateReply(reply).code(422).send({
    error: 'Messenger request validation failed',
    code: 'MESSENGER_VALIDATION_FAILED',
    fields: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

function messengerError(reply: FastifyReply, error: unknown) {
  if (error instanceof TenantMessengerError) {
    return privateReply(reply).code(error.statusCode).send({ error: error.message, code: error.code, ...error.payload });
  }
  throw error;
}

async function requireTenantMessengerMember(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return reply;
  const context = await resolveTenantContext(request);
  if (!context) {
    if ((request as any).sessionTenantMismatch) {
      return privateReply(reply).code(403).send({
        error: 'This module session is bound to a different tenant',
        code: 'SESSION_TENANT_MISMATCH',
      });
    }
    return privateReply(reply).code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
  }
  if (context.status !== 'active') {
    return privateReply(reply).code(403).send({ error: 'Tenant messaging is unavailable', code: 'TENANT_SUSPENDED' });
  }
  const user = (request as any).user;
  const membership = await db.execute(sql`
    SELECT role FROM tenant_users
    WHERE tenant_id=${context.tenantId} AND user_id=${String(user.id)}
    LIMIT 1
  `);
  const row = membership.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    // Platform authority cannot silently enter a tenant's private messages.
    return privateReply(reply).code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
  }
  (request as any).tenantContext = { ...context, role: row.role, membershipRole: row.role, viaPlatformRole: false };
}

function context(request: FastifyRequest) {
  return {
    tenantId: String((request as any).tenantContext.tenantId),
    userId: String((request as any).user.id),
    userName: String((request as any).user.name),
  };
}

export async function registerTenantMessengerRoutes(app: FastifyInstance) {
  const realtime = await createTenantMessengerRealtimeBus(async event => {
    if (event.type === 'presence.updated') {
      sendToTenant(event.tenantId, {
        type: event.type,
        userId: event.userId,
        presence: event.presence,
        lastSeenAt: event.lastSeenAt,
      });
      return;
    }
    if (!event.conversationId) return;
    const targets = await listTenantMessengerDeliveryTargets(event.tenantId, event.conversationId);
    if (event.type === 'conversation.updated') {
      for (const target of targets) {
        sendToUser(event.tenantId, target.userId, { type: event.type, conversationId: event.conversationId });
      }
      return;
    }
    if (!event.messageId) return;
    const message = await loadTenantMessengerMessage(event.tenantId, event.conversationId, event.messageId);
    if (!message) return;
    for (const target of targets) {
      sendToUser(event.tenantId, target.userId, {
        type: event.type,
        conversationId: event.conversationId,
        message,
        ...(event.type === 'message.created' ? { muted: target.muted } : {}),
      });
    }
  });
  app.addHook('onClose', async () => realtime.close());

  const publishRealtime = (event: Omit<TenantMessengerRealtimeEvent, 'originId'>) => {
    void realtime.publish(event).catch(() => {
      app.log.warn({ eventType: event.type, code: 'MESSENGER_REALTIME_PUBLISH_FAILED' }, 'tenant_messenger_realtime_publish_failed');
    });
  };

  app.get('/v1/messenger/members', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const parsed = z.object({ search: z.string().max(80).optional() }).safeParse(request.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    return privateReply(reply).send({ members: await listTenantMessengerMembers(tenantId, userId, parsed.data.search) });
  });

  app.get('/v1/messenger/conversations', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const conversations = await listTenantMessengerConversations(tenantId, userId);
    return privateReply(reply).send({
      conversations,
      unreadCount: conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    });
  });

  app.post('/v1/messenger/conversations', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const parsed = createConversationBody.safeParse(request.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const { tenantId, userId } = context(request);
    try {
      const conversation = await createTenantMessengerConversation({
        tenantId,
        actorUserId: userId,
        participantUserIds: parsed.data.participantUserIds,
        title: parsed.data.title,
        correlationId: request.id,
      });
      for (const participant of conversation.participants) {
        if (participant.userId) sendToUser(tenantId, participant.userId, { type: 'conversation.updated', conversationId: conversation.id });
      }
      publishRealtime({ type: 'conversation.updated', tenantId, conversationId: conversation.id });
      return privateReply(reply).code(201).send({ conversation });
    } catch (error) { return messengerError(reply, error); }
  });

  app.get('/v1/messenger/conversations/:conversationId', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const parsed = z.object({ conversationId: uuid }).safeParse(request.params);
    if (!parsed.success) return validationError(reply, parsed.error);
    const { tenantId, userId } = context(request);
    try { return privateReply(reply).send({ conversation: await getTenantMessengerConversation(tenantId, userId, parsed.data.conversationId) }); }
    catch (error) { return messengerError(reply, error); }
  });

  app.get('/v1/messenger/conversations/:conversationId/messages', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const params = z.object({ conversationId: uuid }).safeParse(request.params);
    const query = z.object({ before: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).safeParse(request.query ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!query.success) return validationError(reply, query.error);
    const { tenantId, userId } = context(request);
    try {
      return privateReply(reply).send(await listTenantMessengerMessages({
        tenantId, userId, conversationId: params.data.conversationId, before: query.data.before, limit: query.data.limit,
      }));
    } catch (error) { return messengerError(reply, error); }
  });

  app.post('/v1/messenger/conversations/:conversationId/messages', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const params = z.object({ conversationId: uuid }).safeParse(request.params);
    const body = sendMessageBody.safeParse(request.body ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!body.success) return validationError(reply, body.error);
    const { tenantId, userId, userName } = context(request);
    try {
      const result = await sendTenantMessengerMessage({
        tenantId,
        conversationId: params.data.conversationId,
        senderUserId: userId,
        senderName: userName,
        clientMessageId: body.data.clientMessageId,
        body: body.data.body,
        replyToMessageId: body.data.replyToMessageId,
        correlationId: request.id,
      });
      if (result.created) {
        for (const recipient of result.recipients) {
          sendToUser(tenantId, recipient.userId, {
            type: 'message.created',
            conversationId: params.data.conversationId,
            message: result.message,
            muted: recipient.muted,
          });
        }
        publishRealtime({
          type: 'message.created', tenantId, conversationId: params.data.conversationId, messageId: result.message.id,
        });
      }
      return privateReply(reply).code(result.created ? 201 : 200).send({ message: result.message, duplicate: !result.created });
    } catch (error) { return messengerError(reply, error); }
  });

  app.post('/v1/messenger/conversations/:conversationId/read', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const parsed = z.object({ conversationId: uuid }).safeParse(request.params);
    if (!parsed.success) return validationError(reply, parsed.error);
    const { tenantId, userId } = context(request);
    try {
      const read = await markTenantMessengerConversationRead(tenantId, parsed.data.conversationId, userId);
      sendToUser(tenantId, userId, { type: 'conversation.updated', conversationId: parsed.data.conversationId });
      publishRealtime({ type: 'conversation.updated', tenantId, conversationId: parsed.data.conversationId });
      return privateReply(reply).send({ read });
    } catch (error) { return messengerError(reply, error); }
  });

  app.patch('/v1/messenger/conversations/:conversationId/messages/:messageId', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const params = z.object({ conversationId: uuid, messageId: uuid }).safeParse(request.params);
    const body = updateMessageBody.safeParse(request.body ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!body.success) return validationError(reply, body.error);
    const { tenantId, userId } = context(request);
    try {
      const message = await updateTenantMessengerMessage({
        tenantId, userId, conversationId: params.data.conversationId, messageId: params.data.messageId,
        body: body.data.body, expectedVersion: body.data.expectedVersion, correlationId: request.id,
      });
      const targets = await listTenantMessengerDeliveryTargets(tenantId, params.data.conversationId);
      for (const target of targets) sendToUser(tenantId, target.userId, { type: 'message.updated', conversationId: params.data.conversationId, message });
      publishRealtime({
        type: 'message.updated', tenantId, conversationId: params.data.conversationId, messageId: params.data.messageId,
      });
      return privateReply(reply).send({ message });
    } catch (error) { return messengerError(reply, error); }
  });

  app.delete('/v1/messenger/conversations/:conversationId/messages/:messageId', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const params = z.object({ conversationId: uuid, messageId: uuid }).safeParse(request.params);
    const query = deleteMessageQuery.safeParse(request.query ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!query.success) return validationError(reply, query.error);
    const { tenantId, userId } = context(request);
    try {
      const message = await deleteTenantMessengerMessage({
        tenantId, userId, conversationId: params.data.conversationId, messageId: params.data.messageId,
        expectedVersion: query.data.expectedVersion, correlationId: request.id,
      });
      const targets = await listTenantMessengerDeliveryTargets(tenantId, params.data.conversationId);
      for (const target of targets) sendToUser(tenantId, target.userId, { type: 'message.updated', conversationId: params.data.conversationId, message });
      publishRealtime({
        type: 'message.updated', tenantId, conversationId: params.data.conversationId, messageId: params.data.messageId,
      });
      return privateReply(reply).send({ message });
    } catch (error) { return messengerError(reply, error); }
  });

  app.patch('/v1/messenger/conversations/:conversationId', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const params = z.object({ conversationId: uuid }).safeParse(request.params);
    const body = updateConversationBody.safeParse(request.body ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!body.success) return validationError(reply, body.error);
    const { tenantId, userId } = context(request);
    try {
      const conversation = await updateTenantMessengerConversation({
        tenantId, userId, conversationId: params.data.conversationId,
        muted: body.data.muted, title: body.data.title, expectedVersion: body.data.expectedVersion,
        correlationId: request.id,
      });
      const targets = await listTenantMessengerDeliveryTargets(tenantId, params.data.conversationId);
      for (const target of targets) sendToUser(tenantId, target.userId, { type: 'conversation.updated', conversationId: params.data.conversationId });
      publishRealtime({ type: 'conversation.updated', tenantId, conversationId: params.data.conversationId });
      return privateReply(reply).send({ conversation });
    } catch (error) { return messengerError(reply, error); }
  });

  app.delete('/v1/messenger/conversations/:conversationId', { preHandler: [requireTenantMessengerMember] }, async (request, reply) => {
    const parsed = z.object({ conversationId: uuid }).safeParse(request.params);
    if (!parsed.success) return validationError(reply, parsed.error);
    const { tenantId, userId } = context(request);
    try {
      const result = await hideTenantMessengerConversation({ tenantId, userId, conversationId: parsed.data.conversationId, correlationId: request.id });
      sendToUser(tenantId, userId, { type: 'conversation.updated', conversationId: parsed.data.conversationId });
      publishRealtime({ type: 'conversation.updated', tenantId, conversationId: parsed.data.conversationId });
      return privateReply(reply).send(result);
    } catch (error) { return messengerError(reply, error); }
  });

  app.get<{ Params: { tenantId: string } }>(
    '/v1/tenants/:tenantId/messenger/socket',
    { websocket: true, preHandler: [requireTenantMessengerMember] },
    async (socket, request) => {
      const { tenantId, userId } = context(request);
      const connectionId = crypto.randomUUID();
      const presence = await touchTenantMessengerPresence({ tenantId, userId, connectionId });
      addSocket(tenantId, userId, socket);
      sendToTenant(tenantId, { type: 'presence.updated', ...presence });
      publishRealtime({ type: 'presence.updated', tenantId, ...presence });
      safeSend(socket, { type: 'messenger.connected', tenantId, userId, heartbeatSeconds: 25 });

      let windowStarted = Date.now();
      let received = 0;
      const heartbeat = setInterval(() => {
        void db.execute(sql`
          SELECT 1 FROM tenant_users WHERE tenant_id=${tenantId} AND user_id=${userId} LIMIT 1
        `).then(result => {
          if (result.rows.length === 0) {
            socket.close(4403, 'Tenant membership ended');
            return;
          }
          return touchTenantMessengerPresence({ tenantId, userId, connectionId }).then(() => {
            safeSend(socket, { type: 'messenger.heartbeat', at: new Date().toISOString() });
          });
        }).catch(() => socket.close(1011, 'Presence heartbeat failed'));
      }, 25_000);
      heartbeat.unref();

      socket.on('message', data => {
        const raw = typeof data === 'string' ? data : data.toString();
        if (Buffer.byteLength(raw, 'utf8') > 1024) return socket.close(4400, 'Message too large');
        if (Date.now() - windowStarted > 10_000) { windowStarted = Date.now(); received = 0; }
        received += 1;
        if (received > 30) return socket.close(4429, 'Message rate exceeded');
        try {
          const message = JSON.parse(raw);
          if (message?.type === 'ping') safeSend(socket, { type: 'pong', at: new Date().toISOString() });
        } catch { socket.close(4400, 'Invalid message'); }
      });

      socket.on('close', () => {
        clearInterval(heartbeat);
        removeSocket(tenantId, userId, socket);
        void disconnectTenantMessengerPresence({ tenantId, userId, connectionId }).then(changed => {
          if (changed) {
            const lastSeenAt = new Date().toISOString();
            sendToTenant(tenantId, { type: 'presence.updated', userId, presence: 'offline', lastSeenAt });
            publishRealtime({ type: 'presence.updated', tenantId, userId, presence: 'offline', lastSeenAt });
          }
        }).catch(() => undefined);
      });
    },
  );
}
