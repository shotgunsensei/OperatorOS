import { randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import { db } from '../db.js';
import {
  activityFeed,
  ninjaPoolOnlineEvents,
  ninjaPoolOnlineRooms,
  ninjaPoolPlayerProfiles,
  users,
} from '../schema.js';
import { requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import { makeInitialGameState } from '../lib/ninja-pool-rules.js';
import { makeInitialBalls } from '../lib/ninja-pool-physics.js';
import {
  NINJA_POOL_ROOM_MAX_SHOTS,
  NINJA_POOL_ROOM_RECONNECT_MS,
  NINJA_POOL_ROOM_SHOTS_PER_MINUTE,
  NINJA_POOL_ROOM_STARTS_PER_HOUR,
  NINJA_POOL_ROOM_TTL_MS,
  NINJA_POOL_WS_MAX_MESSAGE_BYTES,
  NINJA_POOL_WS_MESSAGES_PER_10_SECONDS,
  NinjaPoolOnlineValidationError,
  applyOnlineChoice,
  hashOnlineResult,
  parseNinjaPoolClientMessage,
  parseNinjaPoolRoomCreate,
  parseNinjaPoolRoomJoin,
  samePendingShot,
  simulateOnlineShot,
  validateOnlineShotForState,
  type NinjaPoolOnlineRole,
  type NinjaPoolPendingShot,
} from '../lib/ninja-pool-online.js';
import { DEFAULT_NINJA_POOL_PREFERENCES } from '../lib/ninja-pool-match.js';
import type { GameState, Settings } from '../lib/ninja-pool-game.js';

const readGuards = [requireTenantModuleAccess('ninja-pool-hall')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const socketsByRoom = new Map<string, Map<string, Set<WebSocket>>>();

type Room = typeof ninjaPoolOnlineRooms.$inferSelect;
type Actor = { tenantId: string; userId: string };

class OnlineRateLimitError extends Error {
  readonly statusCode = 429;
  readonly code = 'NINJA_POOL_ONLINE_RATE_LIMITED';
  constructor(readonly retryAfterSeconds: number) {
    super('Operator Pool Hall online action rate limit reached');
  }
}

function actor(request: FastifyRequest): Actor {
  return {
    tenantId: (request as any).tenantContext.tenantId as string,
    userId: (request as any).user.id as string,
  };
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify(payload));
}

function roleFor(room: Room, userId: string): NinjaPoolOnlineRole | null {
  if (room.hostUserId === userId) return 'host';
  if (room.guestUserId === userId) return 'guest';
  return null;
}

function connected(roomId: string, userId: string): boolean {
  return [...(socketsByRoom.get(roomId)?.get(userId) ?? [])].some((socket) => socket.readyState === 1);
}

function roomView(room: Room, userId: string) {
  const state = room.authoritativeState as GameState;
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    role: roleFor(room, userId),
    players: [
      { seat: 0, name: state.players[0].name, role: 'host', connected: connected(room.id, room.hostUserId) },
      { seat: 1, name: state.players[1].name, role: 'guest', joined: Boolean(room.guestUserId), connected: room.guestUserId ? connected(room.id, room.guestUserId) : false },
    ],
    rulesSettings: room.rulesSettings,
    authoritativeState: state,
    stateHash: room.stateHash,
    pendingShot: room.pendingShot ? {
      expectedVersion: room.pendingShot.expectedVersion,
      clientShotId: room.pendingShot.clientShotId,
      shooterSeat: room.pendingShot.shooterSeat,
      shot: room.pendingShot.shot,
    } : null,
    sequenceNumber: room.sequenceNumber,
    version: room.version,
    expiresAt: room.expiresAt,
    lastActivityAt: room.lastActivityAt,
    completedAt: room.completedAt,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

function roomNotFound(reply: FastifyReply) {
  return reply.code(404).send({ error: 'Online room not found', code: 'NINJA_POOL_ROOM_NOT_FOUND' });
}

function handleError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof NinjaPoolOnlineValidationError) {
    reply.code(error.statusCode).send({ error: error.message, code: error.code, field: error.field });
    return true;
  }
  if (error instanceof OnlineRateLimitError) {
    reply.header('Retry-After', String(error.retryAfterSeconds));
    reply.code(error.statusCode).send({ error: error.message, code: error.code, retryAfterSeconds: error.retryAfterSeconds });
    return true;
  }
  return false;
}

async function consumeRateLimit(
  context: Actor,
  action: 'host' | 'join' | 'shot',
  limit: number,
  windowMs: number,
): Promise<void> {
  const cutoff = new Date(Date.now() - windowMs);
  const result = await db.execute(sql`
    INSERT INTO ninja_pool_online_rate_limits
      (tenant_id, user_id, action, window_started_at, count, updated_at)
    VALUES (${context.tenantId}, ${context.userId}, ${action}, NOW(), 1, NOW())
    ON CONFLICT (tenant_id, user_id, action) DO UPDATE SET
      count = CASE
        WHEN ninja_pool_online_rate_limits.window_started_at <= ${cutoff} THEN 1
        ELSE ninja_pool_online_rate_limits.count + 1
      END,
      window_started_at = CASE
        WHEN ninja_pool_online_rate_limits.window_started_at <= ${cutoff} THEN NOW()
        ELSE ninja_pool_online_rate_limits.window_started_at
      END,
      updated_at = NOW()
    RETURNING count, window_started_at
  `);
  const row = result.rows[0] as { count: number | string; window_started_at: Date | string } | undefined;
  const count = Number(row?.count ?? limit + 1);
  if (count > limit) {
    const started = new Date(row?.window_started_at ?? Date.now()).getTime();
    const retryAfter = Math.max(1, Math.ceil((started + windowMs - Date.now()) / 1_000));
    throw new OnlineRateLimitError(retryAfter);
  }
}

async function playerName(tenantId: string, userId: string): Promise<string> {
  const [profile, user] = await Promise.all([
    db.select({ displayName: ninjaPoolPlayerProfiles.displayName })
      .from(ninjaPoolPlayerProfiles)
      .where(and(eq(ninjaPoolPlayerProfiles.tenantId, tenantId), eq(ninjaPoolPlayerProfiles.userId, userId)))
      .limit(1),
    db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  return profile[0]?.displayName || user[0]?.name || user[0]?.email?.split('@')[0] || 'Operator';
}

async function profileSettings(tenantId: string, userId: string): Promise<Settings> {
  const [profile] = await db.select({ preferences: ninjaPoolPlayerProfiles.preferences })
    .from(ninjaPoolPlayerProfiles)
    .where(and(eq(ninjaPoolPlayerProfiles.tenantId, tenantId), eq(ninjaPoolPlayerProfiles.userId, userId)))
    .limit(1);
  return (profile?.preferences ?? DEFAULT_NINJA_POOL_PREFERENCES) as Settings;
}

function makeCode(): string {
  return Array.from({ length: 4 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
}

async function uniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = makeCode();
    const [existing] = await db.select({ id: ninjaPoolOnlineRooms.id })
      .from(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.code, code)).limit(1);
    if (!existing) return code;
  }
  throw new Error('Unable to allocate a unique Ninja Pool room code');
}

async function loadParticipantRoom(id: string, context: Actor): Promise<Room | null> {
  const [room] = await db.select().from(ninjaPoolOnlineRooms).where(and(
    eq(ninjaPoolOnlineRooms.id, id),
    eq(ninjaPoolOnlineRooms.tenantId, context.tenantId),
    or(eq(ninjaPoolOnlineRooms.hostUserId, context.userId), eq(ninjaPoolOnlineRooms.guestUserId, context.userId)),
  )).limit(1);
  return room ?? null;
}

async function expireRoom(room: Room): Promise<Room> {
  if (!['waiting', 'active'].includes(room.status) || room.expiresAt.getTime() > Date.now()) return room;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`);
    const [current] = await tx.select().from(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.id, room.id)).limit(1);
    if (!current || !['waiting', 'active'].includes(current.status) || current.expiresAt.getTime() > Date.now()) return current ?? room;
    const sequence = current.sequenceNumber + 1;
    const now = new Date();
    const [updated] = await tx.update(ninjaPoolOnlineRooms).set({
      status: 'expired', completedAt: now, pendingShot: null, sequenceNumber: sequence,
      version: current.version + 1, updatedAt: now, lastActivityAt: now,
    }).where(and(eq(ninjaPoolOnlineRooms.id, current.id), eq(ninjaPoolOnlineRooms.version, current.version))).returning();
    if (!updated) return current;
    await tx.insert(ninjaPoolOnlineEvents).values({
      tenantId: current.tenantId, roomId: current.id, actorUserId: null, sequenceNumber: sequence,
      clientActionId: null, eventKind: 'expire', input: {}, outcome: { status: 'expired' },
    });
    return updated;
  });
}

async function currentParticipantRoom(id: string, context: Actor): Promise<Room | null> {
  const room = await loadParticipantRoom(id, context);
  if (!room) return null;
  const finalized = await expireRoom(room);
  if (finalized.status !== 'active') return finalized;
  const leftAt = finalized.hostUserId === context.userId ? finalized.hostLeftAt : finalized.guestLeftAt;
  if (leftAt && leftAt.getTime() + NINJA_POOL_ROOM_RECONNECT_MS < Date.now()) {
    await expireDisconnectedRoom(finalized);
    return null;
  }
  return finalized;
}

async function expireDisconnectedRoom(room: Room): Promise<Room> {
  if (room.status !== 'active') return room;
  const cutoff = Date.now() - NINJA_POOL_ROOM_RECONNECT_MS;
  const reconnectExpired = [room.hostLeftAt, room.guestLeftAt].some((value) => value && value.getTime() <= cutoff);
  if (!reconnectExpired) return room;
  const [updated] = await db.update(ninjaPoolOnlineRooms).set({
    status: 'abandoned', completedAt: new Date(), pendingShot: null,
    sequenceNumber: room.sequenceNumber + 1, version: room.version + 1,
    updatedAt: new Date(), lastActivityAt: new Date(),
  }).where(and(eq(ninjaPoolOnlineRooms.id, room.id), eq(ninjaPoolOnlineRooms.version, room.version), eq(ninjaPoolOnlineRooms.status, 'active'))).returning();
  if (!updated) return (await db.select().from(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.id, room.id)).limit(1))[0] ?? room;
  await db.insert(ninjaPoolOnlineEvents).values({
    tenantId: updated.tenantId, roomId: updated.id, actorUserId: null,
    sequenceNumber: updated.sequenceNumber, clientActionId: null, eventKind: 'expire',
    input: { reason: 'reconnect-window-expired' }, outcome: { status: 'abandoned' },
  });
  return updated;
}

function addSocket(room: Room, userId: string, socket: WebSocket): void {
  let usersInRoom = socketsByRoom.get(room.id);
  if (!usersInRoom) {
    usersInRoom = new Map();
    socketsByRoom.set(room.id, usersInRoom);
  }
  let userSockets = usersInRoom.get(userId);
  if (!userSockets) {
    userSockets = new Set();
    usersInRoom.set(userId, userSockets);
  }
  userSockets.add(socket);
}

function removeSocket(roomId: string, userId: string, socket: WebSocket): void {
  const usersInRoom = socketsByRoom.get(roomId);
  const userSockets = usersInRoom?.get(userId);
  userSockets?.delete(socket);
  if (userSockets?.size === 0) usersInRoom?.delete(userId);
  if (usersInRoom?.size === 0) socketsByRoom.delete(roomId);
}

function broadcast(room: Room, payload: unknown, role?: NinjaPoolOnlineRole): void {
  const usersInRoom = socketsByRoom.get(room.id);
  if (!usersInRoom) return;
  for (const [userId, sockets] of usersInRoom) {
    if (role && roleFor(room, userId) !== role) continue;
    for (const socket of sockets) send(socket, payload);
  }
}

function broadcastSnapshot(room: Room, reason: string): void {
  const usersInRoom = socketsByRoom.get(room.id);
  if (!usersInRoom) return;
  for (const [userId, sockets] of usersInRoom) {
    const payload = { type: 'roomSnapshot', reason, room: roomView(room, userId) };
    for (const socket of sockets) send(socket, payload);
  }
}

async function appendResync(room: Room, context: Actor, reason: string): Promise<Room> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`);
    const [current] = await tx.select().from(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.id, room.id)).limit(1);
    if (!current) return room;
    const sequence = current.sequenceNumber + 1;
    const [updated] = await tx.update(ninjaPoolOnlineRooms).set({
      sequenceNumber: sequence, pendingShot: null, updatedAt: new Date(), lastActivityAt: new Date(),
    }).where(eq(ninjaPoolOnlineRooms.id, current.id)).returning();
    await tx.insert(ninjaPoolOnlineEvents).values({
      tenantId: current.tenantId, roomId: current.id, actorUserId: context.userId,
      sequenceNumber: sequence, clientActionId: null, eventKind: 'resync', input: { reason },
      outcome: { version: current.version, stateHash: current.stateHash },
    });
    return updated!;
  });
}

async function processMessage(socket: WebSocket, roomId: string, context: Actor, raw: string): Promise<void> {
  let message;
  try {
    message = parseNinjaPoolClientMessage(JSON.parse(raw));
  } catch (error) {
    const safe = error instanceof NinjaPoolOnlineValidationError ? error : new NinjaPoolOnlineValidationError('Room message is not valid JSON');
    send(socket, { type: 'error', code: safe.code, error: safe.message, field: safe.field });
    return;
  }
  let room = await currentParticipantRoom(roomId, context);
  if (!room) {
    send(socket, { type: 'error', code: 'NINJA_POOL_ROOM_NOT_FOUND', error: 'Online room not found' });
    socket.close(4404, 'Room not found');
    return;
  }
  const role = roleFor(room, context.userId)!;
  if (message.type === 'ping') {
    send(socket, { type: 'pong', t: message.t });
    return;
  }
  if (message.type === 'stateRequest') {
    send(socket, { type: 'roomSnapshot', reason: 'state-request', room: roomView(room, context.userId) });
    return;
  }
  if (message.type === 'leave') {
    const now = new Date();
    room = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${roomId}, 0))`);
      const [current] = await tx.select().from(ninjaPoolOnlineRooms).where(and(
        eq(ninjaPoolOnlineRooms.id, roomId), eq(ninjaPoolOnlineRooms.tenantId, context.tenantId),
      )).limit(1);
      if (!current || !roleFor(current, context.userId)) return room!;
      const sequence = current.sequenceNumber + 1;
      const hostLeaving = current.hostUserId === context.userId;
      const [updated] = await tx.update(ninjaPoolOnlineRooms).set({
        ...(hostLeaving
          ? { hostLeftAt: now, status: 'abandoned' as const, completedAt: now, pendingShot: null }
          : { guestLeftAt: now }),
        sequenceNumber: sequence, version: current.version + 1, updatedAt: now, lastActivityAt: now,
      }).where(eq(ninjaPoolOnlineRooms.id, current.id)).returning();
      await tx.insert(ninjaPoolOnlineEvents).values({
        tenantId: current.tenantId, roomId: current.id, actorUserId: context.userId,
        sequenceNumber: sequence, clientActionId: null, eventKind: 'leave', input: { role },
        outcome: { status: updated!.status, reconnectUntil: hostLeaving ? null : new Date(now.getTime() + NINJA_POOL_ROOM_RECONNECT_MS).toISOString() },
      });
      return updated!;
    });
    broadcastSnapshot(room, 'player-left');
    socket.close(1000, 'Left room');
    return;
  }
  if (room.status !== 'active') {
    send(socket, { type: 'error', code: 'NINJA_POOL_ROOM_NOT_ACTIVE', error: 'The online room is not active' });
    return;
  }
  if (message.type === 'shotIntent') {
    if (role !== 'guest' || room.authoritativeState.currentPlayer !== 1) {
      send(socket, { type: 'error', code: 'NINJA_POOL_TURN_REJECTED', error: 'Only the current guest seat may submit a guest shot intent' });
      return;
    }
    if (message.expectedVersion !== room.version) {
      send(socket, { type: 'staleVersion', expectedVersion: room.version, room: roomView(room, context.userId) });
      return;
    }
    try {
      await consumeRateLimit(context, 'shot', NINJA_POOL_ROOM_SHOTS_PER_MINUTE, 60_000);
      validateOnlineShotForState(room.authoritativeState as GameState, message.shot);
    } catch (error) {
      if (error instanceof OnlineRateLimitError || error instanceof NinjaPoolOnlineValidationError) {
        send(socket, { type: 'error', code: error.code, error: error.message });
        return;
      }
      throw error;
    }
    const pending: NinjaPoolPendingShot = {
      expectedVersion: message.expectedVersion, clientShotId: message.clientShotId,
      shooterSeat: 1, shot: message.shot, requestedByUserId: context.userId,
    };
    const shotIntentResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${roomId}, 0))`);
      const [current] = await tx.select().from(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.id, roomId)).limit(1);
      if (!current || current.version !== message.expectedVersion) throw new Error('STALE_VERSION');
      if (current.pendingShot) {
        if (samePendingShot(current.pendingShot as NinjaPoolPendingShot, pending)) return current;
        throw new Error('PENDING_SHOT');
      }
      const sequence = current.sequenceNumber + 1;
      const [updated] = await tx.update(ninjaPoolOnlineRooms).set({
        pendingShot: pending, sequenceNumber: sequence, updatedAt: new Date(), lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + NINJA_POOL_ROOM_TTL_MS),
      }).where(and(eq(ninjaPoolOnlineRooms.id, roomId), eq(ninjaPoolOnlineRooms.version, message.expectedVersion))).returning();
      if (!updated) throw new Error('STALE_VERSION');
      await tx.insert(ninjaPoolOnlineEvents).values({
        tenantId: current.tenantId, roomId, actorUserId: context.userId, sequenceNumber: sequence,
        clientActionId: null, eventKind: 'intent', input: { clientShotId: message.clientShotId, shot: message.shot },
        outcome: { forwardedToHost: true },
      });
      return updated;
    }).catch((error) => {
      if (error instanceof Error && error.message === 'STALE_VERSION') return null;
      if (error instanceof Error && error.message === 'PENDING_SHOT') return false;
      throw error;
    }) as Room | null | false;
    if (shotIntentResult === null) {
      const current = await currentParticipantRoom(roomId, context);
      send(socket, { type: 'staleVersion', expectedVersion: current?.version, room: current ? roomView(current, context.userId) : null });
      return;
    }
    if (shotIntentResult === false) {
      send(socket, { type: 'error', code: 'NINJA_POOL_SHOT_PENDING', error: 'A guest shot is already awaiting host simulation' });
      return;
    }
    room = shotIntentResult;
    broadcast(room, { type: 'guestShotIntent', expectedVersion: message.expectedVersion, clientShotId: message.clientShotId, shot: message.shot }, 'host');
    send(socket, { type: 'intentAccepted', clientShotId: message.clientShotId, sequenceNumber: room.sequenceNumber });
    return;
  }
  if (message.type === 'hostShotResult') {
    if (role !== 'host') {
      send(socket, { type: 'error', code: 'NINJA_POOL_HOST_AUTHORITY_REQUIRED', error: 'Only the authenticated room host may commit simulation results' });
      return;
    }
    if (message.expectedVersion !== room.version || message.shooterSeat !== room.authoritativeState.currentPlayer) {
      send(socket, { type: 'staleVersion', expectedVersion: room.version, room: roomView(room, context.userId) });
      return;
    }
    if (message.shooterSeat === 1) {
      const pending = room.pendingShot as NinjaPoolPendingShot | null;
      if (!pending || pending.clientShotId !== message.clientShotId || !samePendingShot(pending, {
        expectedVersion: message.expectedVersion, clientShotId: message.clientShotId, shooterSeat: 1,
        shot: message.shot, requestedByUserId: room.guestUserId!,
      })) {
        send(socket, { type: 'error', code: 'NINJA_POOL_GUEST_INTENT_REQUIRED', error: 'The host result does not match the authenticated guest intent' });
        return;
      }
    } else if (room.pendingShot) {
      send(socket, { type: 'error', code: 'NINJA_POOL_SHOT_PENDING', error: 'Resolve the pending guest shot before another result' });
      return;
    }
    if (message.shooterSeat === 0) {
      try {
        await consumeRateLimit(context, 'shot', NINJA_POOL_ROOM_SHOTS_PER_MINUTE, 60_000);
      } catch (error) {
        if (error instanceof OnlineRateLimitError) {
          send(socket, { type: 'error', code: error.code, error: error.message, retryAfterSeconds: error.retryAfterSeconds });
          return;
        }
        throw error;
      }
    }
    const prior = await db.select().from(ninjaPoolOnlineEvents).where(and(
      eq(ninjaPoolOnlineEvents.tenantId, context.tenantId), eq(ninjaPoolOnlineEvents.roomId, roomId),
      eq(ninjaPoolOnlineEvents.clientActionId, message.clientShotId), eq(ninjaPoolOnlineEvents.eventKind, 'shot'),
    )).limit(1);
    if (prior[0]) {
      send(socket, { type: 'shotCommitted', idempotent: true, clientShotId: message.clientShotId, room: roomView(room, context.userId) });
      return;
    }
    if (room.authoritativeState.shotCount >= NINJA_POOL_ROOM_MAX_SHOTS) {
      send(socket, { type: 'error', code: 'NINJA_POOL_SHOT_CAP_REACHED', error: 'This rack reached the bounded shot cap' });
      return;
    }
    const result = simulateOnlineShot(room.authoritativeState as GameState, message.shot, room.rulesSettings as Settings);
    if (result.resultHash !== message.resultHash) {
      room = await appendResync(room, context, 'host-result-hash-mismatch');
      broadcastSnapshot(room, 'desync-recovery');
      send(socket, { type: 'desync', code: 'NINJA_POOL_RESULT_HASH_MISMATCH', authoritativeHash: room.stateHash, resultHash: result.resultHash });
      return;
    }
    room = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${roomId}, 0))`);
      const [current] = await tx.select().from(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.id, roomId)).limit(1);
      if (!current || current.version !== message.expectedVersion) throw new Error('STALE_VERSION');
      const duplicate = await tx.select().from(ninjaPoolOnlineEvents).where(and(
        eq(ninjaPoolOnlineEvents.tenantId, context.tenantId), eq(ninjaPoolOnlineEvents.roomId, roomId),
        eq(ninjaPoolOnlineEvents.clientActionId, message.clientShotId),
      )).limit(1);
      if (duplicate[0]) return current;
      const sequence = current.sequenceNumber + 1;
      const completed = Boolean(result.state.gameOver);
      const now = new Date();
      const stateHash = hashOnlineResult(result.state, null);
      const [updated] = await tx.update(ninjaPoolOnlineRooms).set({
        authoritativeState: result.state, stateHash, pendingShot: null,
        sequenceNumber: sequence, version: current.version + 1,
        status: completed ? 'completed' : 'active', completedAt: completed ? now : null,
        lastActivityAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + NINJA_POOL_ROOM_TTL_MS),
      }).where(and(eq(ninjaPoolOnlineRooms.id, roomId), eq(ninjaPoolOnlineRooms.version, message.expectedVersion))).returning();
      if (!updated) throw new Error('STALE_VERSION');
      await tx.insert(ninjaPoolOnlineEvents).values({
        tenantId: context.tenantId, roomId, actorUserId: context.userId, sequenceNumber: sequence,
        clientActionId: message.clientShotId, eventKind: 'shot',
        input: { shooterSeat: message.shooterSeat, shot: message.shot, expectedVersion: message.expectedVersion },
        outcome: { events: result.events, ticks: result.ticks, resultHash: result.resultHash, stateHash, gameOver: result.state.gameOver },
      });
      if (completed) {
        await tx.insert(activityFeed).values({
          tenantId: context.tenantId, userId: context.userId, action: 'completed',
          entityType: 'ninja_pool_online_room', entityId: roomId,
          metadata: { mode: 'online', shots: result.state.shotCount, evidence: 'host_result_server_resimulated' },
        });
      }
      return updated;
    }).catch((error) => {
      if (error instanceof Error && error.message === 'STALE_VERSION') return null;
      throw error;
    }) as Room | null;
    if (!room) {
      const current = await currentParticipantRoom(roomId, context);
      send(socket, { type: 'staleVersion', expectedVersion: current?.version, room: current ? roomView(current, context.userId) : null });
      return;
    }
    broadcastSnapshot(room, 'shot-committed');
    broadcast(room, { type: 'shotCommitted', clientShotId: message.clientShotId, resultHash: message.resultHash, version: room.version, sequenceNumber: room.sequenceNumber });
    return;
  }
  if (message.type === 'choice') {
    const chooser = room.authoritativeState.pendingChoice?.chooser;
    const seat = role === 'host' ? 0 : 1;
    if (chooser === undefined || chooser !== seat) {
      send(socket, { type: 'error', code: 'NINJA_POOL_CHOICE_REJECTED', error: 'Only the designated seat may resolve this rules choice' });
      return;
    }
    if (message.expectedVersion !== room.version) {
      send(socket, { type: 'staleVersion', expectedVersion: room.version, room: roomView(room, context.userId) });
      return;
    }
    const nextState = applyOnlineChoice(room.authoritativeState as GameState, message.action);
    room = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${roomId}, 0))`);
      const prior = await tx.select().from(ninjaPoolOnlineEvents).where(and(
        eq(ninjaPoolOnlineEvents.tenantId, context.tenantId), eq(ninjaPoolOnlineEvents.roomId, roomId),
        eq(ninjaPoolOnlineEvents.clientActionId, message.clientActionId),
      )).limit(1);
      if (prior[0]) {
        const [current] = await tx.select().from(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.id, roomId)).limit(1);
        return current!;
      }
      const sequence = room!.sequenceNumber + 1;
      const stateHash = hashOnlineResult(nextState, null);
      const [updated] = await tx.update(ninjaPoolOnlineRooms).set({
        authoritativeState: nextState, stateHash, sequenceNumber: sequence, version: room!.version + 1,
        updatedAt: new Date(), lastActivityAt: new Date(), expiresAt: new Date(Date.now() + NINJA_POOL_ROOM_TTL_MS),
      }).where(and(eq(ninjaPoolOnlineRooms.id, roomId), eq(ninjaPoolOnlineRooms.version, message.expectedVersion))).returning();
      if (!updated) throw new Error('STALE_VERSION');
      await tx.insert(ninjaPoolOnlineEvents).values({
        tenantId: context.tenantId, roomId, actorUserId: context.userId, sequenceNumber: sequence,
        clientActionId: message.clientActionId, eventKind: 'choice', input: { action: message.action },
        outcome: { stateHash, currentPlayer: nextState.currentPlayer },
      });
      return updated;
    });
    broadcastSnapshot(room, 'choice-committed');
  }
}

export async function registerNinjaPoolOnlineRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/ninja-pool-hall/rooms', { preHandler: [...readGuards] }, async (request) => {
    const context = actor(request);
    const rooms = await db.select().from(ninjaPoolOnlineRooms).where(and(
      eq(ninjaPoolOnlineRooms.tenantId, context.tenantId),
      or(eq(ninjaPoolOnlineRooms.hostUserId, context.userId), eq(ninjaPoolOnlineRooms.guestUserId, context.userId)),
    )).orderBy(desc(ninjaPoolOnlineRooms.updatedAt)).limit(30);
    const current = await Promise.all(rooms.map(expireRoom));
    return { rooms: current.map((room) => roomView(room, context.userId)) };
  });

  app.get<{ Params: { id: string } }>('/v1/modules/ninja-pool-hall/rooms/:id', { preHandler: [...readGuards] }, async (request, reply) => {
    const context = actor(request);
    const room = await currentParticipantRoom(request.params.id, context);
    if (!room) return roomNotFound(reply);
    const events = await db.select({
      sequenceNumber: ninjaPoolOnlineEvents.sequenceNumber,
      eventKind: ninjaPoolOnlineEvents.eventKind,
      outcome: ninjaPoolOnlineEvents.outcome,
      createdAt: ninjaPoolOnlineEvents.createdAt,
    }).from(ninjaPoolOnlineEvents).where(and(
      eq(ninjaPoolOnlineEvents.tenantId, context.tenantId), eq(ninjaPoolOnlineEvents.roomId, room.id),
    )).orderBy(ninjaPoolOnlineEvents.sequenceNumber).limit(500);
    return { room: roomView(room, context.userId), events };
  });

  app.post('/v1/modules/ninja-pool-hall/rooms', { preHandler: [...writeGuards] }, async (request, reply) => {
    const context = actor(request);
    try {
      const input = parseNinjaPoolRoomCreate(request.body);
      const [idempotent] = await db.select().from(ninjaPoolOnlineRooms).where(and(
        eq(ninjaPoolOnlineRooms.tenantId, context.tenantId), eq(ninjaPoolOnlineRooms.hostUserId, context.userId),
        eq(ninjaPoolOnlineRooms.clientRoomId, input.clientRoomId),
      )).limit(1);
      if (idempotent) return reply.send(roomView(await expireRoom(idempotent), context.userId));
      await consumeRateLimit(context, 'host', NINJA_POOL_ROOM_STARTS_PER_HOUR, 60 * 60 * 1_000);
      const [name, settings, code] = await Promise.all([
        playerName(context.tenantId, context.userId), profileSettings(context.tenantId, context.userId), uniqueCode(),
      ]);
      const state = makeInitialGameState(makeInitialBalls(), [name, 'Waiting guest']);
      const now = new Date();
      const created = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${context.userId}:pool-host`}, 0))`);
        const [active] = await tx.select().from(ninjaPoolOnlineRooms).where(and(
          eq(ninjaPoolOnlineRooms.tenantId, context.tenantId), eq(ninjaPoolOnlineRooms.hostUserId, context.userId),
          inArray(ninjaPoolOnlineRooms.status, ['waiting', 'active']),
        )).limit(1);
        if (active) return active;
        const [room] = await tx.insert(ninjaPoolOnlineRooms).values({
          tenantId: context.tenantId, code, hostUserId: context.userId, guestUserId: null,
          status: 'waiting', rulesSettings: settings, authoritativeState: state,
          stateHash: hashOnlineResult(state, null), pendingShot: null,
          sequenceNumber: 1, version: 1, clientRoomId: input.clientRoomId,
          expiresAt: new Date(now.getTime() + NINJA_POOL_ROOM_TTL_MS), lastActivityAt: now,
        }).returning();
        await tx.insert(ninjaPoolOnlineEvents).values({
          tenantId: context.tenantId, roomId: room!.id, actorUserId: context.userId,
          sequenceNumber: 1, clientActionId: input.clientRoomId, eventKind: 'create',
          input: {}, outcome: { code, status: 'waiting' },
        });
        await tx.insert(activityFeed).values({
          tenantId: context.tenantId, userId: context.userId, action: 'created',
          entityType: 'ninja_pool_online_room', entityId: room!.id, metadata: { mode: 'online' },
        });
        return room!;
      });
      return reply.code(created.clientRoomId === input.clientRoomId ? 201 : 200).send(roomView(created, context.userId));
    } catch (error) {
      if (handleError(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/ninja-pool-hall/rooms/join', { preHandler: [...writeGuards] }, async (request, reply) => {
    const context = actor(request);
    try {
      const input = parseNinjaPoolRoomJoin(request.body);
      await consumeRateLimit(context, 'join', 30, 10 * 60 * 1_000);
      const room = await db.transaction(async (tx) => {
        const [candidate] = await tx.select().from(ninjaPoolOnlineRooms).where(and(
          eq(ninjaPoolOnlineRooms.code, input.code), eq(ninjaPoolOnlineRooms.tenantId, context.tenantId),
        )).limit(1);
        if (!candidate || !['waiting', 'active'].includes(candidate.status) || candidate.expiresAt.getTime() <= Date.now()) return null;
        if (candidate.hostUserId === context.userId) return candidate;
        if (candidate.guestUserId && candidate.guestUserId !== context.userId) return false;
        if (candidate.guestUserId === context.userId && candidate.guestLeftAt
          && candidate.guestLeftAt.getTime() + NINJA_POOL_ROOM_RECONNECT_MS < Date.now()) return null;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.id}, 0))`);
        const guestName = await playerName(context.tenantId, context.userId);
        const state = structuredClone(candidate.authoritativeState) as GameState;
        state.players[1].name = guestName;
        const sequence = candidate.sequenceNumber + 1;
        const now = new Date();
        const [updated] = await tx.update(ninjaPoolOnlineRooms).set({
          guestUserId: context.userId, guestLeftAt: null, status: 'active', authoritativeState: state,
          stateHash: hashOnlineResult(state, null), sequenceNumber: sequence, version: candidate.version + 1,
          lastActivityAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + NINJA_POOL_ROOM_TTL_MS),
        }).where(and(eq(ninjaPoolOnlineRooms.id, candidate.id), eq(ninjaPoolOnlineRooms.version, candidate.version))).returning();
        if (!updated) return null;
        await tx.insert(ninjaPoolOnlineEvents).values({
          tenantId: context.tenantId, roomId: candidate.id, actorUserId: context.userId,
          sequenceNumber: sequence, clientActionId: null, eventKind: 'join', input: {}, outcome: { status: 'active' },
        });
        return updated;
      });
      if (!room) return roomNotFound(reply);
      broadcastSnapshot(room, 'guest-joined');
      return reply.send(roomView(room, context.userId));
    } catch (error) {
      if (handleError(reply, error)) return;
      throw error;
    }
  });

  const socketHandler = async (
    socket: WebSocket,
    request: FastifyRequest<{ Params: { id: string; tenantId?: string } }>,
  ) => {
      const context = actor(request);
      let room = await currentParticipantRoom(request.params.id, context);
      if (!room) {
        socket.close(4404, 'Room not found');
        return;
      }
      if (['completed', 'abandoned', 'expired'].includes(room.status)) {
        send(socket, { type: 'roomSnapshot', reason: 'final-state', room: roomView(room, context.userId) });
        socket.close(4409, 'Room finalized');
        return;
      }
      addSocket(room, context.userId, socket);
      const role = roleFor(room, context.userId)!;
      if ((role === 'host' && room.hostLeftAt) || (role === 'guest' && room.guestLeftAt)) {
        const [reconnected] = await db.update(ninjaPoolOnlineRooms).set({
          ...(role === 'host' ? { hostLeftAt: null } : { guestLeftAt: null }),
          updatedAt: new Date(), lastActivityAt: new Date(),
        }).where(eq(ninjaPoolOnlineRooms.id, room.id)).returning();
        if (reconnected) room = reconnected;
      }
      send(socket, { type: 'joined', role: roleFor(room, context.userId), room: roomView(room, context.userId) });
      broadcastSnapshot(room, 'presence-change');

      let alive = true;
      let chain = Promise.resolve();
      let windowStarted = Date.now();
      let messageCount = 0;
      const heartbeat = setInterval(() => {
        if (!alive) {
          socket.terminate();
          clearInterval(heartbeat);
          return;
        }
        alive = false;
        socket.ping();
      }, 30_000);
      heartbeat.unref();
      socket.on('pong', () => { alive = true; });
      socket.on('message', (data) => {
        const raw = typeof data === 'string' ? data : data.toString();
        if (Buffer.byteLength(raw, 'utf8') > NINJA_POOL_WS_MAX_MESSAGE_BYTES) {
          socket.close(4400, 'Message too large');
          return;
        }
        if (Date.now() - windowStarted >= 10_000) {
          windowStarted = Date.now();
          messageCount = 0;
        }
        messageCount += 1;
        if (messageCount > NINJA_POOL_WS_MESSAGES_PER_10_SECONDS) {
          socket.close(4429, 'Message rate exceeded');
          return;
        }
        chain = chain.then(() => processMessage(socket, room!.id, context, raw)).catch((error) => {
          request.log.warn({ roomId: room!.id, userId: context.userId, error: error instanceof Error ? error.message : 'unknown' }, 'ninja_pool_online_message_failed');
          send(socket, { type: 'error', code: 'NINJA_POOL_ONLINE_MESSAGE_FAILED', error: 'Room message could not be applied' });
        });
      });
      socket.on('close', async () => {
        clearInterval(heartbeat);
        removeSocket(room!.id, context.userId, socket);
        if (!connected(room!.id, context.userId)) {
          const role = roleFor(room!, context.userId);
          if (role) {
            await db.update(ninjaPoolOnlineRooms).set({
              ...(role === 'host' ? { hostLeftAt: new Date() } : { guestLeftAt: new Date() }),
              updatedAt: new Date(), lastActivityAt: new Date(),
            }).where(and(eq(ninjaPoolOnlineRooms.id, room!.id), eq(ninjaPoolOnlineRooms.status, 'active'))).catch(() => undefined);
          }
        }
        const current = await currentParticipantRoom(room!.id, context).catch(() => null);
        if (current) broadcastSnapshot(current, 'presence-change');
      });
  };
  app.get<{ Params: { id: string; tenantId?: string } }>(
    '/v1/modules/ninja-pool-hall/rooms/:id/socket',
    { websocket: true, preHandler: [...writeGuards] },
    socketHandler,
  );
  app.get<{ Params: { id: string; tenantId: string } }>(
    '/v1/tenants/:tenantId/modules/ninja-pool-hall/rooms/:id/socket',
    { websocket: true, preHandler: [...writeGuards] },
    socketHandler,
  );

  const cleanup = setInterval(() => {
    void db.select().from(ninjaPoolOnlineRooms).where(and(
      inArray(ninjaPoolOnlineRooms.status, ['waiting', 'active']),
      or(
        lt(ninjaPoolOnlineRooms.expiresAt, new Date()),
        lt(ninjaPoolOnlineRooms.hostLeftAt, new Date(Date.now() - NINJA_POOL_ROOM_RECONNECT_MS)),
        lt(ninjaPoolOnlineRooms.guestLeftAt, new Date(Date.now() - NINJA_POOL_ROOM_RECONNECT_MS)),
      ),
    )).limit(100).then(async (rooms) => {
      for (const room of rooms) {
        const expired = await expireDisconnectedRoom(await expireRoom(room));
        broadcastSnapshot(expired, 'room-expired');
      }
    }).catch((error) => app.log.warn({ error: error instanceof Error ? error.message : 'unknown' }, 'ninja_pool_room_cleanup_failed'));
  }, 60_000);
  cleanup.unref();
  app.addHook('onClose', async () => clearInterval(cleanup));
}
