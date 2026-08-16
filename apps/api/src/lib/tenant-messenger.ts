import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

type Executor = Pick<typeof db, 'execute'>;
type Row = Record<string, any>;

export class TenantMessengerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly payload: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function resultRows<T extends Row = Row>(result: any): T[] {
  return (result?.rows ?? []) as T[];
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function messageRequestHash(conversationId: string, replyToMessageId: string | null, body: string) {
  return createHash('sha256').update(JSON.stringify([conversationId, replyToMessageId, body])).digest('hex');
}

function messageProjection(row: Row) {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderUserId: row.sender_user_id ? String(row.sender_user_id) : null,
    senderName: String(row.sender_name ?? row.sender_name_snapshot ?? 'Former member'),
    senderAvatarUrl: row.sender_avatar_url ? String(row.sender_avatar_url) : null,
    clientMessageId: String(row.client_message_id),
    replyTo: row.reply_to_message_id ? {
      id: String(row.reply_to_message_id),
      senderName: String(row.reply_sender_name ?? 'Former member'),
      body: row.reply_deleted_at ? null : String(row.reply_body ?? ''),
      deleted: Boolean(row.reply_deleted_at),
    } : null,
    body: row.deleted_at ? null : String(row.body ?? ''),
    version: Number(row.version),
    editedAt: iso(row.edited_at),
    deletedAt: iso(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function conversationProjection(row: Row) {
  const participants = Array.isArray(row.participants) ? row.participants : [];
  return {
    id: String(row.id),
    kind: String(row.kind) as 'direct' | 'group',
    title: row.title ? String(row.title) : null,
    participants: participants.map((participant: Row) => ({
      userId: participant.userId ? String(participant.userId) : null,
      name: String(participant.name ?? 'Former member'),
      email: participant.email ? String(participant.email) : null,
      avatarUrl: participant.avatarUrl ? String(participant.avatarUrl) : null,
      role: String(participant.role ?? 'member'),
      presence: participant.presence === 'online' ? 'online' : 'offline',
      lastSeenAt: participant.lastSeenAt ? iso(participant.lastSeenAt) : null,
    })),
    unreadCount: Number(row.unread_count ?? 0),
    muted: Boolean(row.muted),
    version: Number(row.version),
    lastMessage: row.last_message_id ? {
      id: String(row.last_message_id),
      senderUserId: row.last_sender_user_id ? String(row.last_sender_user_id) : null,
      senderName: String(row.last_sender_name ?? 'Former member'),
      body: row.last_deleted_at ? null : String(row.last_body ?? ''),
      deleted: Boolean(row.last_deleted_at),
      createdAt: iso(row.last_message_created_at),
    } : null,
    lastMessageAt: iso(row.last_message_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function conversationRows(tenantId: string, userId: string, conversationId?: string) {
  const result = await db.execute(sql`
    SELECT c.id,c.kind,c.title,c.version,c.last_message_at,c.created_at,c.updated_at,
      participant.muted,
      COALESCE((
        SELECT count(*)::int
        FROM tenant_messenger_messages unread
        WHERE unread.tenant_id=c.tenant_id
          AND unread.conversation_id=c.id
          AND unread.sender_user_id IS DISTINCT FROM ${userId}
          AND unread.created_at > COALESCE(participant.last_read_at,participant.joined_at)
      ),0)::int AS unread_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'userId',member.user_id,
          'name',COALESCE(member_user.name,member.display_name_snapshot),
          'email',member_user.email,
          'avatarUrl',member_user.avatar_url,
          'role',member.role,
          'presence',CASE
            WHEN presence.status='online' AND presence.active_until>NOW() THEN 'online'
            ELSE 'offline'
          END,
          'lastSeenAt',presence.last_seen_at
        ) ORDER BY COALESCE(member_user.name,member.display_name_snapshot),member.id)
        FROM tenant_messenger_participants member
        LEFT JOIN users member_user ON member_user.id=member.user_id
        LEFT JOIN tenant_messenger_presence presence
          ON presence.tenant_id=member.tenant_id AND presence.user_id=member.user_id
        WHERE member.tenant_id=c.tenant_id AND member.conversation_id=c.id
      ),'[]'::jsonb) AS participants,
      latest.id AS last_message_id,
      latest.sender_user_id AS last_sender_user_id,
      COALESCE(latest_sender.name,latest.sender_name_snapshot) AS last_sender_name,
      latest.body AS last_body,
      latest.deleted_at AS last_deleted_at,
      latest.created_at AS last_message_created_at
    FROM tenant_messenger_participants participant
    JOIN tenant_messenger_conversations c
      ON c.tenant_id=participant.tenant_id AND c.id=participant.conversation_id
    LEFT JOIN LATERAL (
      SELECT message.*
      FROM tenant_messenger_messages message
      WHERE message.tenant_id=c.tenant_id AND message.conversation_id=c.id
      ORDER BY message.created_at DESC,message.id DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN users latest_sender ON latest_sender.id=latest.sender_user_id
    WHERE participant.tenant_id=${tenantId}
      AND participant.user_id=${userId}
      AND participant.hidden_at IS NULL
      AND participant.left_at IS NULL
      ${conversationId ? sql`AND c.id=${conversationId}` : sql``}
    ORDER BY c.last_message_at DESC NULLS LAST,c.updated_at DESC,c.id DESC
    LIMIT 100
  `);
  return resultRows(result);
}

export async function listTenantMessengerConversations(tenantId: string, userId: string) {
  return (await conversationRows(tenantId, userId)).map(conversationProjection);
}

export async function getTenantMessengerConversation(tenantId: string, userId: string, conversationId: string) {
  const [row] = await conversationRows(tenantId, userId, conversationId);
  if (!row) throw new TenantMessengerError('MESSENGER_CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
  return conversationProjection(row);
}

export async function listTenantMessengerMembers(tenantId: string, currentUserId: string, search = '') {
  const normalizedSearch = search.trim().slice(0, 80);
  const pattern = `%${normalizedSearch.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const result = await db.execute(sql`
    SELECT user_row.id,user_row.name,user_row.email,user_row.avatar_url,membership.role,
      CASE WHEN presence.status='online' AND presence.active_until>NOW() THEN 'online' ELSE 'offline' END AS presence,
      presence.last_seen_at
    FROM tenant_users membership
    JOIN users user_row ON user_row.id=membership.user_id AND user_row.status='active'
    LEFT JOIN tenant_messenger_presence presence
      ON presence.tenant_id=membership.tenant_id AND presence.user_id=membership.user_id
    WHERE membership.tenant_id=${tenantId}
      AND user_row.id<>${currentUserId}
      ${normalizedSearch ? sql`AND (user_row.name ILIKE ${pattern} ESCAPE '\\' OR user_row.email ILIKE ${pattern} ESCAPE '\\')` : sql``}
    ORDER BY CASE WHEN presence.status='online' AND presence.active_until>NOW() THEN 0 ELSE 1 END,
      lower(user_row.name),lower(user_row.email),user_row.id
    LIMIT 100
  `);
  return resultRows(result).map(row => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    role: String(row.role),
    presence: row.presence === 'online' ? 'online' : 'offline',
    lastSeenAt: iso(row.last_seen_at),
  }));
}

function participantValues(
  tenantId: string,
  conversationId: string,
  members: Array<{ id: string; name: string }>,
  ownerUserId: string,
) {
  return sql.join(members.map(member => sql`(
    ${tenantId},${conversationId},${member.id},${member.name.slice(0, 160)},
    ${member.id === ownerUserId ? 'owner' : 'member'},NOW(),NOW()
  )`), sql`,`);
}

async function recordMessengerEvent(
  executor: Executor,
  input: {
    tenantId: string;
    conversationId: string;
    actorUserId: string;
    eventType: string;
    messageId?: string | null;
    metadata?: Record<string, unknown>;
    correlationId?: string | null;
  },
) {
  await executor.execute(sql`
    INSERT INTO tenant_messenger_events (
      tenant_id,conversation_id,message_id,actor_user_id,event_type,metadata_json,correlation_id
    ) VALUES (
      ${input.tenantId},${input.conversationId},${input.messageId ?? null},${input.actorUserId},
      ${input.eventType},${JSON.stringify(input.metadata ?? {})}::jsonb,${input.correlationId ?? null}
    )
  `);
}

export async function createTenantMessengerConversation(input: {
  tenantId: string;
  actorUserId: string;
  participantUserIds: string[];
  title?: string | null;
  correlationId?: string | null;
}) {
  const otherIds = [...new Set(input.participantUserIds)].filter(id => id !== input.actorUserId);
  if (otherIds.length < 1 || otherIds.length > 19) {
    throw new TenantMessengerError('MESSENGER_PARTICIPANTS_INVALID', 'Choose between 1 and 19 other tenant members', 422);
  }
  const allIds = [input.actorUserId, ...otherIds];
  const identifiers = sql.join(allIds.map(id => sql`${id}`), sql`,`);
  const memberResult = await db.execute(sql`
    SELECT user_row.id,user_row.name
    FROM tenant_users membership
    JOIN users user_row ON user_row.id=membership.user_id AND user_row.status='active'
    WHERE membership.tenant_id=${input.tenantId} AND user_row.id IN (${identifiers})
    ORDER BY user_row.id
  `);
  const members = resultRows(memberResult).map(row => ({ id: String(row.id), name: String(row.name) }));
  if (members.length !== allIds.length) {
    throw new TenantMessengerError('MESSENGER_MEMBER_NOT_FOUND', 'One or more selected members are unavailable', 404);
  }

  const kind = otherIds.length === 1 ? 'direct' : 'group';
  const directKey = kind === 'direct' ? [...allIds].sort().join(':') : null;
  const title = kind === 'group' ? (input.title?.trim().slice(0, 120) || 'Group conversation') : null;
  const conversationId = await db.transaction(async tx => {
    if (directKey) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${directKey}`},0))`);
      const existing = await tx.execute(sql`
        SELECT id FROM tenant_messenger_conversations
        WHERE tenant_id=${input.tenantId} AND direct_key=${directKey}
        LIMIT 1
      `);
      const existingId = resultRows(existing)[0]?.id;
      if (existingId) {
        await tx.execute(sql`
          UPDATE tenant_messenger_participants
          SET hidden_at=NULL,left_at=NULL,updated_at=NOW()
          WHERE tenant_id=${input.tenantId} AND conversation_id=${String(existingId)} AND user_id=${input.actorUserId}
        `);
        return String(existingId);
      }
    }

    const inserted = await tx.execute(sql`
      INSERT INTO tenant_messenger_conversations (
        tenant_id,kind,direct_key,title,created_by_user_id,last_message_at
      ) VALUES (${input.tenantId},${kind},${directKey},${title},${input.actorUserId},NULL)
      RETURNING id
    `);
    const id = String(resultRows(inserted)[0]!.id);
    await tx.execute(sql`
      INSERT INTO tenant_messenger_participants (
        tenant_id,conversation_id,user_id,display_name_snapshot,role,joined_at,updated_at
      ) VALUES ${participantValues(input.tenantId, id, members, input.actorUserId)}
    `);
    await recordMessengerEvent(tx, {
      tenantId: input.tenantId,
      conversationId: id,
      actorUserId: input.actorUserId,
      eventType: 'conversation.created',
      metadata: { kind, participantCount: members.length },
      correlationId: input.correlationId,
    });
    return id;
  });
  return getTenantMessengerConversation(input.tenantId, input.actorUserId, conversationId);
}

async function requireConversationParticipant(
  executor: Executor,
  tenantId: string,
  conversationId: string,
  userId: string,
) {
  const result = await executor.execute(sql`
    SELECT participant.role,participant.muted,participant.hidden_at,participant.left_at,
      conversation.kind,conversation.title,conversation.version
    FROM tenant_messenger_participants participant
    JOIN tenant_messenger_conversations conversation
      ON conversation.tenant_id=participant.tenant_id AND conversation.id=participant.conversation_id
    WHERE participant.tenant_id=${tenantId}
      AND participant.conversation_id=${conversationId}
      AND participant.user_id=${userId}
    LIMIT 1
  `);
  const row = resultRows(result)[0];
  if (!row || row.left_at) {
    throw new TenantMessengerError('MESSENGER_CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
  }
  return row;
}

export async function listTenantMessengerMessages(input: {
  tenantId: string;
  userId: string;
  conversationId: string;
  before?: string | null;
  limit?: number;
}) {
  await requireConversationParticipant(db, input.tenantId, input.conversationId, input.userId);
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const result = await db.execute(sql`
    SELECT message.*,
      COALESCE(sender.name,message.sender_name_snapshot) AS sender_name,
      sender.avatar_url AS sender_avatar_url,
      reply.body AS reply_body,
      reply.deleted_at AS reply_deleted_at,
      COALESCE(reply_sender.name,reply.sender_name_snapshot) AS reply_sender_name
    FROM tenant_messenger_messages message
    LEFT JOIN users sender ON sender.id=message.sender_user_id
    LEFT JOIN tenant_messenger_messages reply
      ON reply.tenant_id=message.tenant_id
      AND reply.conversation_id=message.conversation_id
      AND reply.id=message.reply_to_message_id
    LEFT JOIN users reply_sender ON reply_sender.id=reply.sender_user_id
    WHERE message.tenant_id=${input.tenantId}
      AND message.conversation_id=${input.conversationId}
      ${input.before ? sql`AND (message.created_at,message.id) < (
        SELECT cursor.created_at,cursor.id
        FROM tenant_messenger_messages cursor
        WHERE cursor.tenant_id=${input.tenantId}
          AND cursor.conversation_id=${input.conversationId}
          AND cursor.id=${input.before}
      )` : sql``}
    ORDER BY message.created_at DESC,message.id DESC
    LIMIT ${limit}
  `);
  const messages = resultRows(result).map(messageProjection).reverse();
  return { messages, hasMore: messages.length === limit };
}

export async function loadTenantMessengerMessage(tenantId: string, conversationId: string, messageId: string, executor: Executor = db) {
  const result = await executor.execute(sql`
    SELECT message.*,
      COALESCE(sender.name,message.sender_name_snapshot) AS sender_name,
      sender.avatar_url AS sender_avatar_url,
      reply.body AS reply_body,
      reply.deleted_at AS reply_deleted_at,
      COALESCE(reply_sender.name,reply.sender_name_snapshot) AS reply_sender_name
    FROM tenant_messenger_messages message
    LEFT JOIN users sender ON sender.id=message.sender_user_id
    LEFT JOIN tenant_messenger_messages reply
      ON reply.tenant_id=message.tenant_id AND reply.conversation_id=message.conversation_id AND reply.id=message.reply_to_message_id
    LEFT JOIN users reply_sender ON reply_sender.id=reply.sender_user_id
    WHERE message.tenant_id=${tenantId} AND message.conversation_id=${conversationId} AND message.id=${messageId}
    LIMIT 1
  `);
  const row = resultRows(result)[0];
  return row ? messageProjection(row) : null;
}

export async function sendTenantMessengerMessage(input: {
  tenantId: string;
  conversationId: string;
  senderUserId: string;
  senderName: string;
  clientMessageId: string;
  body: string;
  replyToMessageId?: string | null;
  correlationId?: string | null;
}) {
  const normalizedBody = input.body.trim();
  const requestHash = messageRequestHash(input.conversationId, input.replyToMessageId ?? null, normalizedBody);
  const outcome = await db.transaction(async tx => {
    await requireConversationParticipant(tx, input.tenantId, input.conversationId, input.senderUserId);
    // Serialize this user's sends so concurrent unique client IDs cannot race
    // the per-minute limit and retries cannot create ambiguous outcomes.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${input.tenantId}:${input.senderUserId}:messenger-send`}, 0)
      )
    `);
    const replay = await tx.execute(sql`
      SELECT id,request_hash
      FROM tenant_messenger_messages
      WHERE tenant_id=${input.tenantId}
        AND sender_user_id=${input.senderUserId}
        AND client_message_id=${input.clientMessageId}
      LIMIT 1
    `);
    const replayRow = resultRows(replay)[0];
    if (replayRow) {
      if (String(replayRow.request_hash) !== requestHash) {
        throw new TenantMessengerError(
          'MESSENGER_IDEMPOTENCY_CONFLICT',
          'That client message ID was already used for a different message',
          409,
        );
      }
      const recipients = await tx.execute(sql`
        SELECT participant.user_id,participant.muted
        FROM tenant_messenger_participants participant
        JOIN tenant_users membership
          ON membership.tenant_id=participant.tenant_id AND membership.user_id=participant.user_id
        WHERE participant.tenant_id=${input.tenantId} AND participant.conversation_id=${input.conversationId}
          AND participant.user_id IS NOT NULL AND participant.left_at IS NULL
      `);
      return {
        id: String(replayRow.id),
        created: false,
        recipients: resultRows(recipients).map(row => ({ userId: String(row.user_id), muted: Boolean(row.muted) })),
      };
    }
    const recent = await tx.execute(sql`
      SELECT count(*)::int AS count
      FROM tenant_messenger_messages
      WHERE tenant_id=${input.tenantId}
        AND sender_user_id=${input.senderUserId}
        AND created_at>NOW()-INTERVAL '60 seconds'
    `);
    if (Number(resultRows(recent)[0]?.count ?? 0) >= 60) {
      throw new TenantMessengerError('MESSENGER_RATE_LIMITED', 'Message rate exceeded. Try again in a moment.', 429);
    }
    if (input.replyToMessageId) {
      const reply = await tx.execute(sql`
        SELECT id FROM tenant_messenger_messages
        WHERE tenant_id=${input.tenantId}
          AND conversation_id=${input.conversationId}
          AND id=${input.replyToMessageId}
        LIMIT 1
      `);
      if (resultRows(reply).length === 0) {
        throw new TenantMessengerError('MESSENGER_REPLY_NOT_FOUND', 'The message being replied to is unavailable', 404);
      }
    }
    const inserted = await tx.execute(sql`
      INSERT INTO tenant_messenger_messages (
        tenant_id,conversation_id,sender_user_id,sender_name_snapshot,client_message_id,request_hash,reply_to_message_id,body
      ) VALUES (
        ${input.tenantId},${input.conversationId},${input.senderUserId},${input.senderName.slice(0, 160)},
        ${input.clientMessageId},${requestHash},${input.replyToMessageId ?? null},${normalizedBody}
      )
      ON CONFLICT (tenant_id,sender_user_id,client_message_id) WHERE sender_user_id IS NOT NULL
      DO NOTHING
      RETURNING id
    `);
    let id = resultRows(inserted)[0]?.id ? String(resultRows(inserted)[0]!.id) : null;
    const created = Boolean(id);
    if (!id) {
      const existing = await tx.execute(sql`
        SELECT id FROM tenant_messenger_messages
        WHERE tenant_id=${input.tenantId}
          AND sender_user_id=${input.senderUserId}
          AND client_message_id=${input.clientMessageId}
        LIMIT 1
      `);
      id = resultRows(existing)[0]?.id ? String(resultRows(existing)[0]!.id) : null;
    }
    if (!id) throw new TenantMessengerError('MESSENGER_SEND_FAILED', 'Message could not be saved', 500);
    if (created) {
      await tx.execute(sql`
        UPDATE tenant_messenger_conversations
        SET last_message_at=NOW(),updated_at=NOW(),version=version+1
        WHERE tenant_id=${input.tenantId} AND id=${input.conversationId}
      `);
      await tx.execute(sql`
        UPDATE tenant_messenger_participants
        SET hidden_at=NULL,updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND conversation_id=${input.conversationId} AND left_at IS NULL
      `);
      await tx.execute(sql`
        UPDATE tenant_messenger_participants
        SET last_read_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND conversation_id=${input.conversationId} AND user_id=${input.senderUserId}
      `);
      await recordMessengerEvent(tx, {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        messageId: id,
        actorUserId: input.senderUserId,
        eventType: 'message.created',
        metadata: { reply: Boolean(input.replyToMessageId), characterCount: normalizedBody.length },
        correlationId: input.correlationId,
      });
    }
    const recipients = await tx.execute(sql`
      SELECT participant.user_id,participant.muted
      FROM tenant_messenger_participants participant
      JOIN tenant_users membership
        ON membership.tenant_id=participant.tenant_id AND membership.user_id=participant.user_id
      WHERE participant.tenant_id=${input.tenantId} AND participant.conversation_id=${input.conversationId}
        AND participant.user_id IS NOT NULL AND participant.left_at IS NULL
    `);
    return { id, created, recipients: resultRows(recipients).map(row => ({ userId: String(row.user_id), muted: Boolean(row.muted) })) };
  });
  const message = await loadTenantMessengerMessage(input.tenantId, input.conversationId, outcome.id);
  if (!message) throw new TenantMessengerError('MESSENGER_SEND_FAILED', 'Message could not be loaded', 500);
  return { message, created: outcome.created, recipients: outcome.recipients };
}

export async function markTenantMessengerConversationRead(tenantId: string, conversationId: string, userId: string) {
  await requireConversationParticipant(db, tenantId, conversationId, userId);
  await db.execute(sql`
    UPDATE tenant_messenger_participants
    SET last_read_at=NOW(),updated_at=NOW()
    WHERE tenant_id=${tenantId} AND conversation_id=${conversationId} AND user_id=${userId}
  `);
  return { conversationId, readAt: new Date().toISOString() };
}

export async function updateTenantMessengerMessage(input: {
  tenantId: string;
  conversationId: string;
  messageId: string;
  userId: string;
  body: string;
  expectedVersion: number;
  correlationId?: string | null;
}) {
  const body = input.body.trim();
  await db.transaction(async tx => {
    await requireConversationParticipant(tx, input.tenantId, input.conversationId, input.userId);
    const current = await tx.execute(sql`
      SELECT sender_user_id,version,deleted_at FROM tenant_messenger_messages
      WHERE tenant_id=${input.tenantId} AND conversation_id=${input.conversationId} AND id=${input.messageId}
      LIMIT 1
    `);
    const row = resultRows(current)[0];
    if (!row || row.sender_user_id !== input.userId || row.deleted_at) {
      throw new TenantMessengerError('MESSENGER_MESSAGE_NOT_FOUND', 'Message not found', 404);
    }
    if (Number(row.version) !== input.expectedVersion) {
      throw new TenantMessengerError('MESSENGER_MESSAGE_VERSION_CONFLICT', 'Message changed before this edit was saved', 409, { currentVersion: Number(row.version) });
    }
    await tx.execute(sql`
      UPDATE tenant_messenger_messages
      SET body=${body},version=version+1,edited_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND conversation_id=${input.conversationId} AND id=${input.messageId}
    `);
    await recordMessengerEvent(tx, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      actorUserId: input.userId,
      eventType: 'message.edited',
      metadata: { characterCount: body.length },
      correlationId: input.correlationId,
    });
  });
  return loadTenantMessengerMessage(input.tenantId, input.conversationId, input.messageId);
}

export async function deleteTenantMessengerMessage(input: {
  tenantId: string;
  conversationId: string;
  messageId: string;
  userId: string;
  expectedVersion: number;
  correlationId?: string | null;
}) {
  await db.transaction(async tx => {
    await requireConversationParticipant(tx, input.tenantId, input.conversationId, input.userId);
    const current = await tx.execute(sql`
      SELECT sender_user_id,version,deleted_at FROM tenant_messenger_messages
      WHERE tenant_id=${input.tenantId} AND conversation_id=${input.conversationId} AND id=${input.messageId}
      LIMIT 1
    `);
    const row = resultRows(current)[0];
    if (!row || row.sender_user_id !== input.userId || row.deleted_at) {
      throw new TenantMessengerError('MESSENGER_MESSAGE_NOT_FOUND', 'Message not found', 404);
    }
    if (Number(row.version) !== input.expectedVersion) {
      throw new TenantMessengerError('MESSENGER_MESSAGE_VERSION_CONFLICT', 'Message changed before it could be deleted', 409, { currentVersion: Number(row.version) });
    }
    await tx.execute(sql`
      UPDATE tenant_messenger_messages
      SET body=NULL,deleted_at=NOW(),version=version+1,updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND conversation_id=${input.conversationId} AND id=${input.messageId}
    `);
    await recordMessengerEvent(tx, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      actorUserId: input.userId,
      eventType: 'message.deleted',
      correlationId: input.correlationId,
    });
  });
  return loadTenantMessengerMessage(input.tenantId, input.conversationId, input.messageId);
}

export async function updateTenantMessengerConversation(input: {
  tenantId: string;
  conversationId: string;
  userId: string;
  muted?: boolean;
  title?: string;
  expectedVersion?: number;
  correlationId?: string | null;
}) {
  await db.transaction(async tx => {
    const participant = await requireConversationParticipant(tx, input.tenantId, input.conversationId, input.userId);
    if (typeof input.muted === 'boolean') {
      await tx.execute(sql`
        UPDATE tenant_messenger_participants
        SET muted=${input.muted},updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND conversation_id=${input.conversationId} AND user_id=${input.userId}
      `);
      await recordMessengerEvent(tx, {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        actorUserId: input.userId,
        eventType: 'conversation.muted',
        metadata: { muted: input.muted },
        correlationId: input.correlationId,
      });
    }
    if (input.title !== undefined) {
      if (participant.kind !== 'group' || participant.role !== 'owner') {
        throw new TenantMessengerError('MESSENGER_CONVERSATION_UPDATE_DENIED', 'Only the group owner can rename this conversation', 403);
      }
      if (Number(participant.version) !== input.expectedVersion) {
        throw new TenantMessengerError('MESSENGER_CONVERSATION_VERSION_CONFLICT', 'Conversation changed before the title was saved', 409, { currentVersion: Number(participant.version) });
      }
      await tx.execute(sql`
        UPDATE tenant_messenger_conversations
        SET title=${input.title.trim()},version=version+1,updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${input.conversationId}
      `);
      await recordMessengerEvent(tx, {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        actorUserId: input.userId,
        eventType: 'conversation.renamed',
        metadata: { titleLength: input.title.trim().length },
        correlationId: input.correlationId,
      });
    }
  });
  return getTenantMessengerConversation(input.tenantId, input.userId, input.conversationId);
}

export async function hideTenantMessengerConversation(input: {
  tenantId: string;
  conversationId: string;
  userId: string;
  correlationId?: string | null;
}) {
  await db.transaction(async tx => {
    await requireConversationParticipant(tx, input.tenantId, input.conversationId, input.userId);
    await tx.execute(sql`
      UPDATE tenant_messenger_participants
      SET hidden_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND conversation_id=${input.conversationId} AND user_id=${input.userId}
    `);
    await recordMessengerEvent(tx, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      actorUserId: input.userId,
      eventType: 'conversation.hidden',
      correlationId: input.correlationId,
    });
  });
  return { conversationId: input.conversationId, hidden: true };
}

export async function touchTenantMessengerPresence(input: {
  tenantId: string;
  userId: string;
  connectionId: string;
}) {
  await db.transaction(async tx => {
    await tx.execute(sql`
      INSERT INTO tenant_messenger_presence (
        tenant_id,user_id,connection_id,status,active_until,last_seen_at,updated_at
      ) VALUES (${input.tenantId},${input.userId},${input.connectionId},'online',NOW()+INTERVAL '70 seconds',NOW(),NOW())
      ON CONFLICT (tenant_id,user_id) DO UPDATE SET
        connection_id=EXCLUDED.connection_id,status='online',active_until=EXCLUDED.active_until,
        last_seen_at=NOW(),updated_at=NOW()
    `);
    await tx.execute(sql`
      DELETE FROM tenant_messenger_presence_connections
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId} AND active_until<=NOW()
    `);
    await tx.execute(sql`
      INSERT INTO tenant_messenger_presence_connections (
        tenant_id,user_id,connection_id,active_until,last_seen_at,updated_at
      ) VALUES (${input.tenantId},${input.userId},${input.connectionId},NOW()+INTERVAL '70 seconds',NOW(),NOW())
      ON CONFLICT (tenant_id,user_id,connection_id) DO UPDATE SET
        active_until=EXCLUDED.active_until,last_seen_at=NOW(),updated_at=NOW()
    `);
  });
  return { userId: input.userId, presence: 'online' as const, lastSeenAt: new Date().toISOString() };
}

export async function disconnectTenantMessengerPresence(input: {
  tenantId: string;
  userId: string;
  connectionId: string;
}) {
  return db.transaction(async tx => {
    // Lock the per-user aggregate so a concurrent heartbeat/connect cannot be
    // overwritten by a disconnect from another tab or API instance.
    await tx.execute(sql`
      SELECT user_id FROM tenant_messenger_presence
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId}
      FOR UPDATE
    `);
    await tx.execute(sql`
      DELETE FROM tenant_messenger_presence_connections
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId} AND connection_id=${input.connectionId}
    `);
    const remaining = await tx.execute(sql`
      SELECT max(active_until) AS active_until
      FROM tenant_messenger_presence_connections
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId} AND active_until>NOW()
    `);
    const activeUntil = resultRows(remaining)[0]?.active_until ?? null;
    await tx.execute(sql`
      UPDATE tenant_messenger_presence
      SET status=${activeUntil ? 'online' : 'offline'},
          active_until=${activeUntil},last_seen_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId}
    `);
    return !activeUntil;
  });
}

export async function listTenantMessengerDeliveryTargets(tenantId: string, conversationId: string) {
  const result = await db.execute(sql`
    SELECT participant.user_id,participant.muted
    FROM tenant_messenger_participants participant
    JOIN tenant_users membership
      ON membership.tenant_id=participant.tenant_id AND membership.user_id=participant.user_id
    WHERE participant.tenant_id=${tenantId} AND participant.conversation_id=${conversationId}
      AND participant.user_id IS NOT NULL AND participant.left_at IS NULL
  `);
  return resultRows(result).map(row => ({ userId: String(row.user_id), muted: Boolean(row.muted) }));
}
