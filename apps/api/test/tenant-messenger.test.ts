import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import { db } from '../src/db.js';
import { tenantUsers, users } from '../src/schema.js';
import {
  disconnectTenantMessengerPresence,
  touchTenantMessengerPresence,
} from '../src/lib/tenant-messenger.js';
import { cleanupUser, createTestUser, ensureSchemaReady, uniqueId } from './_setup.js';

process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'tenant-messenger-test-session-secret-v53';

let app: any;
let signToken: typeof import('../src/lib/auth.js').signToken;
let owner: Awaited<ReturnType<typeof createTestUser>>;
let member: Awaited<ReturnType<typeof createTestUser>>;
let secondMember: Awaited<ReturnType<typeof createTestUser>>;
let foreign: Awaited<ReturnType<typeof createTestUser>>;
let conversationId = '';
let groupConversationId = '';

function bearer(user: Awaited<ReturnType<typeof createTestUser>>, moduleSession = false) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: moduleSession ? 'module' : 'platform',
      ...(moduleSession ? { tenantId: owner.currentTenantId!, moduleId: 'tradeflowkit' } : {}),
    })}`,
  };
}

interface SocketHarness {
  ws: WebSocket;
  next(type: string, timeoutMs?: number): Promise<Record<string, any>>;
}

async function openSocket(path: string, headers: Record<string, string>): Promise<SocketHarness> {
  const messages: Array<Record<string, any>> = [];
  const waiters: Array<{ type: string; resolve: (message: Record<string, any>) => void }> = [];
  const ws = await app.injectWS(path, { headers }, {
    onInit(socket: WebSocket) {
      socket.on('message', value => {
        const message = JSON.parse(value.toString()) as Record<string, any>;
        const waiterIndex = waiters.findIndex(waiter => waiter.type === message.type);
        if (waiterIndex >= 0) waiters.splice(waiterIndex, 1)[0]!.resolve(message);
        else messages.push(message);
      });
    },
  });
  return {
    ws,
    next(type, timeoutMs = 4_000) {
      const existingIndex = messages.findIndex(message => message.type === type);
      if (existingIndex >= 0) return Promise.resolve(messages.splice(existingIndex, 1)[0]!);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve };
        waiters.push(waiter);
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for ${type}; queued=${messages.map(message => message.type).join(',')}`));
        }, timeoutMs);
        timer.unref();
        waiter.resolve = message => { clearTimeout(timer); resolve(message); };
      });
    },
  };
}

async function clearMessengerTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM tenant_messenger_events WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM tenant_messenger_messages WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM tenant_messenger_participants WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM tenant_messenger_presence_connections WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM tenant_messenger_presence WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM tenant_messenger_conversations WHERE tenant_id=${tenantId}`);
}

before(async () => {
  ({ signToken } = await import('../src/lib/auth.js'));
  await ensureSchemaReady();
  owner = await createTestUser();
  member = await createTestUser();
  secondMember = await createTestUser();
  foreign = await createTestUser();
  for (const [user, role] of [[member, 'member'], [secondMember, 'viewer']] as const) {
    await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId!, userId: user.id, role });
    await db.update(users).set({ currentTenantId: owner.currentTenantId!, updatedAt: new Date() }).where(eq(users.id, user.id));
  }

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const websocket = (await import('@fastify/websocket')).default;
  const { registerTenantMessengerRoutes } = await import('../src/routes/tenant-messenger-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'tenant-messenger-cookie-secret' });
  await app.register(websocket);
  await registerTenantMessengerRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (owner) await clearMessengerTenant(owner.currentTenantId!);
  for (const user of [owner, member, secondMember, foreign]) if (user) await cleanupUser(user.id);
});

test('P53-MIGRATION-001: messenger schema reapplies idempotently with tenant constraints and timeline indexes', async () => {
  const { ensureTenantMessengerTables } = await import('../src/lib/tenant-messenger-db-init.js');
  await ensureTenantMessengerTables();
  await ensureTenantMessengerTables();
  const result = await db.execute(sql`
    SELECT
      to_regclass('tenant_messenger_conversations') IS NOT NULL AS conversations,
      to_regclass('tenant_messenger_participants') IS NOT NULL AS participants,
      to_regclass('tenant_messenger_messages') IS NOT NULL AS messages,
      to_regclass('tenant_messenger_presence') IS NOT NULL AS presence,
      to_regclass('tenant_messenger_presence_connections') IS NOT NULL AS presence_connections,
      to_regclass('tenant_messenger_events') IS NOT NULL AS events,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='tenant_messenger_message_reply_fk'
          AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (tenant_id, conversation_id, reply_to_message_id)%'
      ) AS reply_scope,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='tenant_messenger_event_message_fk'
          AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (tenant_id, conversation_id, message_id)%'
      ) AS event_scope,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='tenant_messenger_messages'
          AND column_name='request_hash' AND is_nullable='NO'
      ) AS request_hash_required,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='tenant_messenger_request_hash_check'
          AND pg_get_constraintdef(oid) LIKE '%request_hash%[0-9a-f]%'
      ) AS request_hash_format
  `);
  assert.deepEqual(result.rows[0], {
    conversations: true, participants: true, messages: true, presence: true,
    presence_connections: true, events: true, reply_scope: true, event_scope: true,
    request_hash_required: true, request_hash_format: true,
  });
});

test('P53-SCALE-001: PostgreSQL fan-out carries metadata-only events between API instances', async () => {
  const { createTenantMessengerRealtimeBus } = await import('../src/lib/tenant-messenger-realtime.js');
  let resolveEvent!: (event: Record<string, any>) => void;
  const received = new Promise<Record<string, any>>((resolve, reject) => {
    resolveEvent = resolve;
    const timer = setTimeout(() => reject(new Error('Timed out waiting for cross-instance messenger event')), 4_000);
    timer.unref();
  });
  const first = await createTenantMessengerRealtimeBus(() => undefined);
  const second = await createTenantMessengerRealtimeBus(event => resolveEvent(event));
  try {
    const lastSeenAt = new Date().toISOString();
    await first.publish({
      type: 'presence.updated', tenantId: owner.currentTenantId!, userId: owner.id, presence: 'online', lastSeenAt,
    });
    const event = await received;
    assert.equal(event.type, 'presence.updated');
    assert.equal(event.tenantId, owner.currentTenantId);
    assert.equal(event.userId, owner.id);
    assert.equal(event.lastSeenAt, lastSeenAt);
    assert.equal('body' in event, false);
    assert.match(String(event.originId), /^[0-9a-f-]{36}$/i);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});

test('P53-TENANT-001: member directory exposes only active members in the resolved tenant', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/messenger/members', headers: bearer(owner) });
  assert.equal(response.statusCode, 200, response.body);
  const ids = response.json().members.map((item: any) => item.id);
  assert.ok(ids.includes(member.id));
  assert.ok(ids.includes(secondMember.id));
  assert.equal(ids.includes(foreign.id), false);

  const denied = await app.inject({
    method: 'GET',
    url: '/v1/messenger/members',
    headers: { ...bearer(foreign), 'x-tenant-id': owner.currentTenantId! },
  });
  assert.equal(denied.statusCode, 404, denied.body);
  assert.equal(denied.json().code, 'TENANT_NOT_FOUND');
});

test('P53-CONVERSATION-001: direct creation is tenant-validated, durable, and duplicate-safe', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/v1/messenger/conversations',
    headers: bearer(owner, true),
    payload: { participantUserIds: [member.id] },
  });
  assert.equal(created.statusCode, 201, created.body);
  conversationId = created.json().conversation.id;
  assert.equal(created.json().conversation.kind, 'direct');
  assert.equal(created.json().conversation.participants.length, 2);

  const duplicate = await app.inject({
    method: 'POST',
    url: '/v1/messenger/conversations',
    headers: bearer(owner),
    payload: { participantUserIds: [member.id] },
  });
  assert.equal(duplicate.statusCode, 201, duplicate.body);
  assert.equal(duplicate.json().conversation.id, conversationId);

  const foreignParticipant = await app.inject({
    method: 'POST',
    url: '/v1/messenger/conversations',
    headers: bearer(owner),
    payload: { participantUserIds: [foreign.id] },
  });
  assert.equal(foreignParticipant.statusCode, 404, foreignParticipant.body);
  assert.equal(foreignParticipant.json().code, 'MESSENGER_MEMBER_NOT_FOUND');
});

test('P53-GROUP-001: group conversations are durable and only their owner can rename them', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/v1/messenger/conversations',
    headers: bearer(owner),
    payload: { participantUserIds: [member.id, secondMember.id], title: 'Operations crew' },
  });
  assert.equal(created.statusCode, 201, created.body);
  const group = created.json().conversation;
  groupConversationId = group.id;
  assert.equal(group.kind, 'group');
  assert.equal(group.title, 'Operations crew');
  assert.equal(group.participants.length, 3);

  const deniedRename = await app.inject({
    method: 'PATCH',
    url: `/v1/messenger/conversations/${group.id}`,
    headers: bearer(member),
    payload: { title: 'Unauthorized title', expectedVersion: 1 },
  });
  assert.equal(deniedRename.statusCode, 403, deniedRename.body);
  assert.equal(deniedRename.json().code, 'MESSENGER_CONVERSATION_UPDATE_DENIED');

  const renamed = await app.inject({
    method: 'PATCH',
    url: `/v1/messenger/conversations/${group.id}`,
    headers: bearer(owner),
    payload: { title: 'Operations bridge', expectedVersion: 1 },
  });
  assert.equal(renamed.statusCode, 200, renamed.body);
  assert.equal(renamed.json().conversation.title, 'Operations bridge');
  assert.equal(renamed.json().conversation.version, 2);
});

test('P53-MESSAGE-001: sends are idempotent, unread state is per-user, and history persists', async () => {
  const key = uniqueId('client-message');
  const sent = await app.inject({
    method: 'POST',
    url: `/v1/messenger/conversations/${conversationId}/messages`,
    headers: bearer(owner),
    payload: { clientMessageId: key, body: 'Tenant-private hello' },
  });
  assert.equal(sent.statusCode, 201, sent.body);
  const messageId = sent.json().message.id;
  assert.equal(sent.json().message.body, 'Tenant-private hello');

  const replay = await app.inject({
    method: 'POST',
    url: `/v1/messenger/conversations/${conversationId}/messages`,
    headers: bearer(owner),
    payload: { clientMessageId: key, body: 'Tenant-private hello' },
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);
  assert.equal(replay.json().message.id, messageId);

  const conflictingReplay = await app.inject({
    method: 'POST',
    url: `/v1/messenger/conversations/${conversationId}/messages`,
    headers: bearer(owner),
    payload: { clientMessageId: key, body: 'Different payload under the same key' },
  });
  assert.equal(conflictingReplay.statusCode, 409, conflictingReplay.body);
  assert.equal(conflictingReplay.json().code, 'MESSENGER_IDEMPOTENCY_CONFLICT');

  const memberConversations = await app.inject({ method: 'GET', url: '/v1/messenger/conversations', headers: bearer(member) });
  assert.equal(memberConversations.statusCode, 200, memberConversations.body);
  assert.equal(memberConversations.json().conversations[0].unreadCount, 1);

  const history = await app.inject({
    method: 'GET', url: `/v1/messenger/conversations/${conversationId}/messages`, headers: bearer(member),
  });
  assert.equal(history.statusCode, 200, history.body);
  assert.equal(history.json().messages.length, 1);
  assert.equal(history.json().messages[0].body, 'Tenant-private hello');

  const read = await app.inject({
    method: 'POST', url: `/v1/messenger/conversations/${conversationId}/read`, headers: bearer(member),
  });
  assert.equal(read.statusCode, 200, read.body);
  const afterRead = await app.inject({ method: 'GET', url: '/v1/messenger/conversations', headers: bearer(member) });
  assert.equal(afterRead.json().conversations[0].unreadCount, 0);
});

test('P53-MUTATION-001: only the sender can edit/delete and version conflicts fail closed', async () => {
  const editableKey = uniqueId('editable');
  const sent = await app.inject({
    method: 'POST',
    url: `/v1/messenger/conversations/${conversationId}/messages`,
    headers: bearer(owner),
    payload: { clientMessageId: editableKey, body: 'Original text' },
  });
  const message = sent.json().message;
  const denied = await app.inject({
    method: 'PATCH',
    url: `/v1/messenger/conversations/${conversationId}/messages/${message.id}`,
    headers: bearer(member),
    payload: { body: 'Recipient rewrite', expectedVersion: 1 },
  });
  assert.equal(denied.statusCode, 404, denied.body);

  const edited = await app.inject({
    method: 'PATCH',
    url: `/v1/messenger/conversations/${conversationId}/messages/${message.id}`,
    headers: bearer(owner),
    payload: { body: 'Edited text', expectedVersion: 1 },
  });
  assert.equal(edited.statusCode, 200, edited.body);
  assert.equal(edited.json().message.version, 2);
  assert.equal(edited.json().message.body, 'Edited text');

  const stale = await app.inject({
    method: 'DELETE',
    url: `/v1/messenger/conversations/${conversationId}/messages/${message.id}?expectedVersion=1`,
    headers: bearer(owner),
  });
  assert.equal(stale.statusCode, 409, stale.body);

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/v1/messenger/conversations/${conversationId}/messages/${message.id}?expectedVersion=2`,
    headers: bearer(owner),
  });
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(deleted.json().message.body, null);
  assert.ok(deleted.json().message.deletedAt);

  const driftAfterDelete = await app.inject({
    method: 'POST',
    url: `/v1/messenger/conversations/${conversationId}/messages`,
    headers: bearer(owner),
    payload: { clientMessageId: editableKey, body: 'Reused key after deletion' },
  });
  assert.equal(driftAfterDelete.statusCode, 409, driftAfterDelete.body);
  assert.equal(driftAfterDelete.json().code, 'MESSENGER_IDEMPOTENCY_CONFLICT');
});

test('P53-REALTIME-001: tenant sockets publish presence and saved incoming messages without crossing tenants', async () => {
  const socketPath = `/v1/tenants/${owner.currentTenantId}/messenger/socket`;
  await assert.rejects(app.injectWS(socketPath, { headers: bearer(foreign) }), /Unexpected server response: 404/);

  const ownerSocket = await openSocket(socketPath, bearer(owner, true));
  const memberSocket = await openSocket(socketPath, bearer(member, true));
  try {
    assert.equal((await ownerSocket.next('messenger.connected')).tenantId, owner.currentTenantId);
    assert.equal((await memberSocket.next('messenger.connected')).userId, member.id);

    let memberOnline = await ownerSocket.next('presence.updated');
    while (memberOnline.userId !== member.id) memberOnline = await ownerSocket.next('presence.updated');
    assert.equal(memberOnline.presence, 'online');

    const sent = await app.inject({
      method: 'POST',
      url: `/v1/messenger/conversations/${conversationId}/messages`,
      headers: bearer(owner),
      payload: { clientMessageId: uniqueId('socket-push'), body: 'Realtime tenant notification' },
    });
    assert.equal(sent.statusCode, 201, sent.body);
    const pushed = await memberSocket.next('message.created');
    assert.equal(pushed.conversationId, conversationId);
    assert.equal(pushed.message.id, sent.json().message.id);
    assert.equal(pushed.message.body, 'Realtime tenant notification');

    const memberClosed = new Promise<void>(resolve => memberSocket.ws.once('close', () => resolve()));
    memberSocket.ws.terminate();
    await memberClosed;
    let memberOffline = await ownerSocket.next('presence.updated');
    while (memberOffline.userId !== member.id || memberOffline.presence !== 'offline') {
      memberOffline = await ownerSocket.next('presence.updated');
    }
    assert.equal(memberOffline.userId, member.id);
  } finally {
    memberSocket.ws.close();
    ownerSocket.ws.close();
  }
});

test('P53-REVOCATION-001: removed tenant members stop receiving messages on an already-open socket', async () => {
  const socketPath = `/v1/tenants/${owner.currentTenantId}/messenger/socket`;
  const revokedSocket = await openSocket(socketPath, bearer(secondMember, true));
  try {
    await revokedSocket.next('messenger.connected');
    await db.delete(tenantUsers).where(sql`${tenantUsers.tenantId}=${owner.currentTenantId!} AND ${tenantUsers.userId}=${secondMember.id}`);
    const sent = await app.inject({
      method: 'POST',
      url: `/v1/messenger/conversations/${groupConversationId}/messages`,
      headers: bearer(owner),
      payload: { clientMessageId: uniqueId('revoked-delivery'), body: 'Current members only' },
    });
    assert.equal(sent.statusCode, 201, sent.body);
    await assert.rejects(revokedSocket.next('message.created', 300), /Timed out waiting for message\.created/);

    await assert.rejects(
      app.injectWS(socketPath, { headers: bearer(secondMember, true) }),
      /Unexpected server response: 404/,
    );
  } finally {
    await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId!, userId: secondMember.id, role: 'viewer' }).onConflictDoNothing();
    revokedSocket.ws.close();
  }
});

test('P53-HISTORY-001: deleting a conversation hides only the caller copy', async () => {
  const hidden = await app.inject({
    method: 'DELETE', url: `/v1/messenger/conversations/${conversationId}`, headers: bearer(member),
  });
  assert.equal(hidden.statusCode, 200, hidden.body);
  const memberList = await app.inject({ method: 'GET', url: '/v1/messenger/conversations', headers: bearer(member) });
  const ownerList = await app.inject({ method: 'GET', url: '/v1/messenger/conversations', headers: bearer(owner) });
  assert.equal(memberList.json().conversations.some((item: any) => item.id === conversationId), false);
  assert.equal(ownerList.json().conversations.some((item: any) => item.id === conversationId), true);
});

test('P53-PRESENCE-001: presence is tenant-scoped and expires to offline on disconnect', async () => {
  const firstConnectionId = uniqueId('connection');
  const secondConnectionId = uniqueId('connection');
  await touchTenantMessengerPresence({ tenantId: owner.currentTenantId!, userId: member.id, connectionId: firstConnectionId });
  await touchTenantMessengerPresence({ tenantId: owner.currentTenantId!, userId: member.id, connectionId: secondConnectionId });
  const online = await app.inject({ method: 'GET', url: '/v1/messenger/members', headers: bearer(owner) });
  assert.equal(online.json().members.find((item: any) => item.id === member.id).presence, 'online');
  assert.equal(await disconnectTenantMessengerPresence({ tenantId: owner.currentTenantId!, userId: member.id, connectionId: firstConnectionId }), false);
  const stillOnline = await app.inject({ method: 'GET', url: '/v1/messenger/members', headers: bearer(owner) });
  assert.equal(stillOnline.json().members.find((item: any) => item.id === member.id).presence, 'online');
  assert.equal(await disconnectTenantMessengerPresence({ tenantId: owner.currentTenantId!, userId: member.id, connectionId: secondConnectionId }), true);
  const offline = await app.inject({ method: 'GET', url: '/v1/messenger/members', headers: bearer(owner) });
  assert.equal(offline.json().members.find((item: any) => item.id === member.id).presence, 'offline');
});
