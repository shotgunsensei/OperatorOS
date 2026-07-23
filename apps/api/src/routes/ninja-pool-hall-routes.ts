import type { FastifyInstance, FastifyReply } from 'fastify';
import { isDeepStrictEqual } from 'node:util';
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  ninjaPoolMatchEvents,
  ninjaPoolMatchSessions,
  ninjaPoolPlayerProfiles,
  ninjaPoolPracticeSessions,
  users,
} from '../schema.js';
import {
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  assertNinjaPoolPracticeProgress,
  assertNinjaPoolPracticeVersion,
  NINJA_POOL_RETAINED_SESSIONS,
  NINJA_POOL_STARTS_PER_HOUR,
  parseNinjaPoolPracticeAbandon,
  parseNinjaPoolPracticeListQuery,
  parseNinjaPoolPracticeProgress,
  parseNinjaPoolPracticeStart,
  NinjaPoolPracticeStateError,
  NinjaPoolPracticeValidationError,
  NinjaPoolPracticeVersionConflictError,
} from '../lib/ninja-pool-practice.js';
import {
  DEFAULT_NINJA_POOL_PREFERENCES,
  NINJA_POOL_MATCH_HISTORY_LIMIT,
  NINJA_POOL_MATCH_STARTS_PER_HOUR,
  NINJA_POOL_MAX_MATCH_SHOTS,
  NinjaPoolMatchConflictError,
  NinjaPoolMatchValidationError,
  parseNinjaPoolChoice,
  parseNinjaPoolMatchAbandon,
  parseNinjaPoolMatchListQuery,
  parseNinjaPoolMatchStart,
  parseNinjaPoolProfileUpdate,
  parseNinjaPoolShot,
  toStoredLogicalState,
} from '../lib/ninja-pool-match.js';
import { makeLogicalBalls, POCKETS, type GameState } from '../lib/ninja-pool-game.js';
import {
  acceptTable,
  applyShotResult,
  makeInitialGameState,
  rerackAndBreak,
} from '../lib/ninja-pool-rules.js';

const ninjaPoolReadGuards = [requireTenantModuleAccess('ninja-pool-hall')];
const ninjaPoolWriteGuards = [...ninjaPoolReadGuards, requireTenantModuleWriteAccess];
const ONE_HOUR_MS = 60 * 60 * 1_000;

type NinjaPoolContext = { tenantId: string };
type NinjaPoolUser = { id: string };
type NinjaPoolSession = typeof ninjaPoolPracticeSessions.$inferSelect;
type NinjaPoolMatch = typeof ninjaPoolMatchSessions.$inferSelect;

function sessionView(session: typeof ninjaPoolPracticeSessions.$inferSelect) {
  return {
    id: session.id,
    status: session.status,
    shots: session.shots,
    objectBallsPocketed: session.objectBallsPocketed,
    scratches: session.scratches,
    version: session.version,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    updatedAt: session.updatedAt,
  };
}

function matchView(match: NinjaPoolMatch) {
  return {
    id: match.id,
    mode: match.mode,
    status: match.status,
    opponentName: match.opponentName,
    rulesSettings: match.rulesSettings,
    logicalState: match.logicalState,
    winnerSeat: match.winnerSeat,
    result: match.result,
    finishReason: match.finishReason,
    shotCount: match.shotCount,
    evidence: match.evidence,
    rulesVersion: match.rulesVersion,
    version: match.version,
    startedAt: match.startedAt,
    completedAt: match.completedAt,
    abandonedAt: match.abandonedAt,
    updatedAt: match.updatedAt,
  };
}

function profileView(profile: typeof ninjaPoolPlayerProfiles.$inferSelect) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    preferences: profile.preferences,
    version: profile.version,
    persisted: true,
    updatedAt: profile.updatedAt,
  };
}

function handleNinjaPoolError(
  reply: FastifyReply,
  error: unknown,
  currentSession?: NinjaPoolSession,
): boolean {
  if (error instanceof NinjaPoolPracticeValidationError) {
    reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      field: error.field,
    });
    return true;
  }
  if (error instanceof NinjaPoolPracticeVersionConflictError) {
    reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      expectedVersion: error.expectedVersion,
      actualVersion: error.actualVersion,
      ...(currentSession ? { session: sessionView(currentSession) } : {}),
    });
    return true;
  }
  if (error instanceof NinjaPoolPracticeStateError) {
    reply.code(error.statusCode).send({ error: error.message, code: error.code });
    return true;
  }
  if (error instanceof NinjaPoolMatchValidationError) {
    reply.code(error.statusCode).send({ error: error.message, code: error.code, field: error.field });
    return true;
  }
  if (error instanceof NinjaPoolMatchConflictError) {
    reply.code(error.statusCode).send({ error: error.message, code: error.code });
    return true;
  }
  return false;
}

async function loadScopedSession(id: string, tenantId: string, userId: string) {
  const [session] = await db.select().from(ninjaPoolPracticeSessions).where(and(
    eq(ninjaPoolPracticeSessions.id, id),
    eq(ninjaPoolPracticeSessions.tenantId, tenantId),
    eq(ninjaPoolPracticeSessions.userId, userId),
  )).limit(1);
  return session ?? null;
}

async function loadScopedMatch(id: string, tenantId: string, userId: string) {
  const [match] = await db.select().from(ninjaPoolMatchSessions).where(and(
    eq(ninjaPoolMatchSessions.id, id),
    eq(ninjaPoolMatchSessions.tenantId, tenantId),
    eq(ninjaPoolMatchSessions.userId, userId),
  )).limit(1);
  return match ?? null;
}

function matchNotFound(reply: FastifyReply) {
  return reply.code(404).send({ error: 'Match not found', code: 'NINJA_POOL_MATCH_NOT_FOUND' });
}

function matchConflict(reply: FastifyReply, error: NinjaPoolMatchConflictError, match?: NinjaPoolMatch | null) {
  return reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...(match ? { match: matchView(match) } : {}),
  });
}

function shotEventInput(input: ReturnType<typeof parseNinjaPoolShot>) {
  return {
    shooterSeat: input.shooterSeat,
    calledPocket: input.calledPocket ?? null,
    eightPocket: input.eightPocket ?? null,
    events: input.events,
  };
}

function idempotencyConflict(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'Idempotency key was already used with different input',
    code: 'NINJA_POOL_IDEMPOTENCY_CONFLICT',
  });
}

function progressWasAlreadyApplied(
  session: NinjaPoolSession,
  progress: {
    expectedVersion: number;
    shots: number;
    objectBallsPocketed: number;
    scratches: number;
  },
) {
  return session.version === progress.expectedVersion + 1
    && session.shots === progress.shots
    && session.objectBallsPocketed === progress.objectBallsPocketed
    && session.scratches === progress.scratches;
}

function abandonWasAlreadyApplied(session: NinjaPoolSession, expectedVersion: number) {
  return session.status === 'abandoned' && session.version === expectedVersion + 1;
}

function sendVersionConflict(
  reply: FastifyReply,
  message: string,
  currentSession: NinjaPoolSession | null,
) {
  return reply.code(409).send({
    error: message,
    code: 'NINJA_POOL_PRACTICE_VERSION_CONFLICT',
    ...(currentSession ? { session: sessionView(currentSession) } : {}),
  });
}

function sessionNotFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: 'Practice session not found',
    code: 'NINJA_POOL_PRACTICE_NOT_FOUND',
  });
}

export async function registerNinjaPoolHallRoutes(app: FastifyInstance) {
  app.get(
    '/v1/modules/ninja-pool-hall/practice-sessions',
    { preHandler: [...ninjaPoolReadGuards] },
    async (request, reply) => {
      let query;
      try {
        query = parseNinjaPoolPracticeListQuery(request.query);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const sessions = await db.select().from(ninjaPoolPracticeSessions).where(and(
        eq(ninjaPoolPracticeSessions.tenantId, ctx.tenantId),
        eq(ninjaPoolPracticeSessions.userId, user.id),
      )).orderBy(desc(ninjaPoolPracticeSessions.startedAt)).limit(query.limit);
      return { sessions: sessions.map(sessionView) };
    },
  );

  app.post(
    '/v1/modules/ninja-pool-hall/practice-sessions',
    { preHandler: [...ninjaPoolWriteGuards] },
    async (request, reply) => {
      try {
        parseNinjaPoolPracticeStart(request.body);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const outcome = await db.transaction(async (tx) => {
        // Serialize starts for this exact tenant/user pair. The partial unique
        // index remains the final database invariant; the lock lets us return
        // the existing active session instead of surfacing a constraint error.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(
          hashtext(${ctx.tenantId}), hashtext(${user.id})
        )`);

        const [active] = await tx.select().from(ninjaPoolPracticeSessions).where(and(
          eq(ninjaPoolPracticeSessions.tenantId, ctx.tenantId),
          eq(ninjaPoolPracticeSessions.userId, user.id),
          eq(ninjaPoolPracticeSessions.status, 'active'),
        )).limit(1);
        if (active) return { kind: 'existing' as const, session: active };

        const since = new Date(Date.now() - ONE_HOUR_MS);
        const [rate] = await tx.select({
          count: sql<number>`count(*)::int`,
        }).from(ninjaPoolPracticeSessions).where(and(
          eq(ninjaPoolPracticeSessions.tenantId, ctx.tenantId),
          eq(ninjaPoolPracticeSessions.userId, user.id),
          gte(ninjaPoolPracticeSessions.startedAt, since),
        ));
        if (Number(rate?.count ?? 0) >= NINJA_POOL_STARTS_PER_HOUR) {
          return { kind: 'rate_limited' as const };
        }

        // Keep bounded history. Leave room for the new active session and
        // remove only finalized rows, never another recoverable active row.
        const expired = await tx.select({ id: ninjaPoolPracticeSessions.id })
          .from(ninjaPoolPracticeSessions)
          .where(and(
            eq(ninjaPoolPracticeSessions.tenantId, ctx.tenantId),
            eq(ninjaPoolPracticeSessions.userId, user.id),
            ne(ninjaPoolPracticeSessions.status, 'active'),
          ))
          .orderBy(desc(ninjaPoolPracticeSessions.startedAt))
          .limit(10_000)
          .offset(NINJA_POOL_RETAINED_SESSIONS - 1);
        if (expired.length > 0) {
          await tx.delete(ninjaPoolPracticeSessions).where(inArray(
            ninjaPoolPracticeSessions.id,
            expired.map((row) => row.id),
          ));
        }

        const [created] = await tx.insert(ninjaPoolPracticeSessions).values({
          tenantId: ctx.tenantId,
          userId: user.id,
          status: 'active',
          shots: 0,
          objectBallsPocketed: 0,
          scratches: 0,
          version: 1,
        }).returning();
        if (!created) throw new Error('Ninja Pool practice session insert returned no row');
        return { kind: 'created' as const, session: created };
      });

      if (outcome.kind === 'rate_limited') {
        reply.header('Retry-After', '3600');
        return reply.code(429).send({
          error: 'Practice session start limit reached; retry later',
          code: 'NINJA_POOL_PRACTICE_START_RATE_LIMITED',
        });
      }
      return reply
        .code(outcome.kind === 'created' ? 201 : 200)
        .send(sessionView(outcome.session));
    },
  );

  app.patch(
    '/v1/modules/ninja-pool-hall/practice-sessions/:id',
    { preHandler: [...ninjaPoolWriteGuards] },
    async (request, reply) => {
      let progress;
      try {
        progress = parseNinjaPoolPracticeProgress(request.body);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }

      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const before = await loadScopedSession(id, ctx.tenantId, user.id);
      if (!before) return sessionNotFound(reply);

      // A retry after a lost successful response is safe and idempotent.
      if (progressWasAlreadyApplied(before, progress)) return sessionView(before);

      let nextStatus;
      try {
        assertNinjaPoolPracticeVersion(progress.expectedVersion, before.version);
        nextStatus = assertNinjaPoolPracticeProgress(before, progress);
      } catch (error) {
        if (handleNinjaPoolError(reply, error, before)) return;
        throw error;
      }

      const now = new Date();
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.update(ninjaPoolPracticeSessions).set({
          shots: progress.shots,
          objectBallsPocketed: progress.objectBallsPocketed,
          scratches: progress.scratches,
          status: nextStatus,
          completedAt: nextStatus === 'completed' ? now : null,
          version: sql`${ninjaPoolPracticeSessions.version} + 1`,
          updatedAt: now,
        }).where(and(
          eq(ninjaPoolPracticeSessions.id, id),
          eq(ninjaPoolPracticeSessions.tenantId, ctx.tenantId),
          eq(ninjaPoolPracticeSessions.userId, user.id),
          eq(ninjaPoolPracticeSessions.status, 'active'),
          eq(ninjaPoolPracticeSessions.version, progress.expectedVersion),
        )).returning();
        if (!row) return null;
        if (row.status === 'completed') {
          await tx.insert(activityFeed).values({
            userId: user.id,
            tenantId: ctx.tenantId,
            action: 'completed',
            entityType: 'ninja_pool_practice_session',
            entityId: row.id,
            metadata: {
              shots: row.shots,
              objectBallsPocketed: row.objectBallsPocketed,
              scratches: row.scratches,
              mode: 'local_practice',
              evidence: 'client_reported',
            },
          });
        }
        return row;
      });
      if (!updated) {
        const current = await loadScopedSession(id, ctx.tenantId, user.id);
        if (current && progressWasAlreadyApplied(current, progress)) return sessionView(current);
        return sendVersionConflict(
          reply,
          'Practice session changed; reconcile before saving this shot',
          current,
        );
      }
      return sessionView(updated);
    },
  );

  app.post(
    '/v1/modules/ninja-pool-hall/practice-sessions/:id/abandon',
    { preHandler: [...ninjaPoolWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseNinjaPoolPracticeAbandon(request.body);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }

      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const before = await loadScopedSession(id, ctx.tenantId, user.id);
      if (!before) return sessionNotFound(reply);
      if (abandonWasAlreadyApplied(before, input.expectedVersion)) return sessionView(before);
      try {
        assertNinjaPoolPracticeVersion(input.expectedVersion, before.version);
        if (before.status !== 'active') {
          throw new NinjaPoolPracticeStateError(
            'Practice session is already finalized',
            'NINJA_POOL_PRACTICE_FINALIZED',
          );
        }
      } catch (error) {
        if (handleNinjaPoolError(reply, error, before)) return;
        throw error;
      }

      const [updated] = await db.update(ninjaPoolPracticeSessions).set({
        status: 'abandoned',
        version: sql`${ninjaPoolPracticeSessions.version} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(ninjaPoolPracticeSessions.id, id),
        eq(ninjaPoolPracticeSessions.tenantId, ctx.tenantId),
        eq(ninjaPoolPracticeSessions.userId, user.id),
        eq(ninjaPoolPracticeSessions.status, 'active'),
        eq(ninjaPoolPracticeSessions.version, input.expectedVersion),
      )).returning();
      if (!updated) {
        const current = await loadScopedSession(id, ctx.tenantId, user.id);
        if (current && abandonWasAlreadyApplied(current, input.expectedVersion)) {
          return sessionView(current);
        }
        return sendVersionConflict(
          reply,
          'Practice session changed; reconcile before abandoning it',
          current,
        );
      }
      return sessionView(updated);
    },
  );

  app.get(
    '/v1/modules/ninja-pool-hall/profile',
    { preHandler: [...ninjaPoolReadGuards] },
    async (request) => {
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const [[profile], [identity], [stats]] = await Promise.all([
        db.select().from(ninjaPoolPlayerProfiles).where(and(
          eq(ninjaPoolPlayerProfiles.tenantId, ctx.tenantId),
          eq(ninjaPoolPlayerProfiles.userId, user.id),
        )).limit(1),
        db.select({ name: users.name, email: users.email }).from(users)
          .where(eq(users.id, user.id)).limit(1),
        db.select({
          matchesCompleted: sql<number>`count(*) filter (where ${ninjaPoolMatchSessions.status} = 'completed')::int`,
          wins: sql<number>`count(*) filter (where ${ninjaPoolMatchSessions.status} = 'completed' and ${ninjaPoolMatchSessions.result} = 'win')::int`,
          losses: sql<number>`count(*) filter (where ${ninjaPoolMatchSessions.status} = 'completed' and ${ninjaPoolMatchSessions.result} = 'loss')::int`,
          localMatches: sql<number>`count(*) filter (where ${ninjaPoolMatchSessions.status} = 'completed' and ${ninjaPoolMatchSessions.mode} = 'local')::int`,
        }).from(ninjaPoolMatchSessions).where(and(
          eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
          eq(ninjaPoolMatchSessions.userId, user.id),
        )),
      ]);
      return {
        profile: profile ? {
          id: profile.id,
          displayName: profile.displayName,
          preferences: profile.preferences,
          version: profile.version,
          persisted: true,
          updatedAt: profile.updatedAt,
        } : {
          id: null,
          displayName: identity?.name?.trim() || identity?.email?.split('@')[0] || 'Player 1',
          preferences: DEFAULT_NINJA_POOL_PREFERENCES,
          version: 0,
          persisted: false,
          updatedAt: null,
        },
        progression: {
          matchesCompleted: Number(stats?.matchesCompleted ?? 0),
          wins: Number(stats?.wins ?? 0),
          losses: Number(stats?.losses ?? 0),
          localMatches: Number(stats?.localMatches ?? 0),
          evidence: 'client_reported_server_rules',
          competitiveRanking: false,
        },
      };
    },
  );

  app.put(
    '/v1/modules/ninja-pool-hall/profile',
    { preHandler: [...ninjaPoolWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseNinjaPoolProfileUpdate(request.body);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId}), hashtext(${`${user.id}:nph-profile`}))`);
        const [current] = await tx.select().from(ninjaPoolPlayerProfiles).where(and(
          eq(ninjaPoolPlayerProfiles.tenantId, ctx.tenantId),
          eq(ninjaPoolPlayerProfiles.userId, user.id),
        )).limit(1);
        if (!current) {
          if (input.expectedVersion !== 0) return { kind: 'conflict' as const, profile: null };
          const [created] = await tx.insert(ninjaPoolPlayerProfiles).values({
            tenantId: ctx.tenantId,
            userId: user.id,
            displayName: input.displayName,
            preferences: input.preferences,
          }).returning();
          return { kind: 'saved' as const, profile: created! };
        }
        if (current.version !== input.expectedVersion) return { kind: 'conflict' as const, profile: current };
        const [updated] = await tx.update(ninjaPoolPlayerProfiles).set({
          displayName: input.displayName,
          preferences: input.preferences,
          version: sql`${ninjaPoolPlayerProfiles.version} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(ninjaPoolPlayerProfiles.id, current.id),
          eq(ninjaPoolPlayerProfiles.tenantId, ctx.tenantId),
          eq(ninjaPoolPlayerProfiles.userId, user.id),
          eq(ninjaPoolPlayerProfiles.version, input.expectedVersion),
        )).returning();
        return updated
          ? { kind: 'saved' as const, profile: updated }
          : { kind: 'conflict' as const, profile: current };
      });
      if (outcome.kind === 'conflict') {
        return reply.code(409).send({
          error: 'Profile changed; reload before saving',
          code: 'NINJA_POOL_PROFILE_VERSION_CONFLICT',
          ...(outcome.profile ? { profile: profileView(outcome.profile) } : {}),
        });
      }
      return profileView(outcome.profile);
    },
  );

  app.get(
    '/v1/modules/ninja-pool-hall/matches',
    { preHandler: [...ninjaPoolReadGuards] },
    async (request, reply) => {
      let query;
      try {
        query = parseNinjaPoolMatchListQuery(request.query);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const matches = await db.select().from(ninjaPoolMatchSessions).where(and(
        eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
        eq(ninjaPoolMatchSessions.userId, user.id),
      )).orderBy(desc(ninjaPoolMatchSessions.startedAt)).limit(query.limit);
      return { matches: matches.map(matchView) };
    },
  );

  app.get(
    '/v1/modules/ninja-pool-hall/matches/:id',
    { preHandler: [...ninjaPoolReadGuards] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const match = await loadScopedMatch(id, ctx.tenantId, user.id);
      if (!match) return matchNotFound(reply);
      const events = await db.select().from(ninjaPoolMatchEvents).where(and(
        eq(ninjaPoolMatchEvents.tenantId, ctx.tenantId),
        eq(ninjaPoolMatchEvents.matchId, id),
        eq(ninjaPoolMatchEvents.userId, user.id),
      )).orderBy(ninjaPoolMatchEvents.sequenceNumber);
      return {
        match: matchView(match),
        events: events.map((event) => ({
          id: event.id,
          sequenceNumber: event.sequenceNumber,
          eventKind: event.eventKind,
          outcome: event.outcome,
          createdAt: event.createdAt,
        })),
      };
    },
  );

  app.post(
    '/v1/modules/ninja-pool-hall/matches',
    { preHandler: [...ninjaPoolWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseNinjaPoolMatchStart(request.body);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId}), hashtext(${`${user.id}:nph-match`}))`);
        const [idempotent] = await tx.select().from(ninjaPoolMatchSessions).where(and(
          eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
          eq(ninjaPoolMatchSessions.userId, user.id),
          eq(ninjaPoolMatchSessions.clientStartId, input.clientStartId),
        )).limit(1);
        if (idempotent) {
          if (idempotent.mode !== input.mode || idempotent.opponentName !== input.opponentName) {
            return { kind: 'idempotency_conflict' as const, match: idempotent };
          }
          return { kind: 'existing' as const, match: idempotent };
        }
        const [activeMatch] = await tx.select().from(ninjaPoolMatchSessions).where(and(
          eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
          eq(ninjaPoolMatchSessions.userId, user.id),
          eq(ninjaPoolMatchSessions.status, 'active'),
        )).limit(1);
        if (activeMatch) return { kind: 'active' as const, match: activeMatch };
        const [rate] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(ninjaPoolMatchSessions).where(and(
            eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
            eq(ninjaPoolMatchSessions.userId, user.id),
            gte(ninjaPoolMatchSessions.startedAt, new Date(Date.now() - ONE_HOUR_MS)),
          ));
        if (Number(rate?.count ?? 0) >= NINJA_POOL_MATCH_STARTS_PER_HOUR) {
          return { kind: 'rate_limited' as const, match: null };
        }
        const [profile] = await tx.select().from(ninjaPoolPlayerProfiles).where(and(
          eq(ninjaPoolPlayerProfiles.tenantId, ctx.tenantId),
          eq(ninjaPoolPlayerProfiles.userId, user.id),
        )).limit(1);
        const [identity] = await tx.select({ name: users.name, email: users.email }).from(users)
          .where(eq(users.id, user.id)).limit(1);
        const playerName = profile?.displayName
          ?? identity?.name?.trim()
          ?? identity?.email?.split('@')[0]
          ?? 'Player 1';
        const rulesSettings = profile?.preferences ?? DEFAULT_NINJA_POOL_PREFERENCES;
        const logicalState = makeInitialGameState(makeLogicalBalls(), [playerName, input.opponentName]);
        const [created] = await tx.insert(ninjaPoolMatchSessions).values({
          tenantId: ctx.tenantId,
          userId: user.id,
          mode: input.mode,
          opponentName: input.opponentName,
          rulesSettings,
          logicalState: toStoredLogicalState(logicalState),
          clientStartId: input.clientStartId,
        }).returning();
        const expired = await tx.select({ id: ninjaPoolMatchSessions.id })
          .from(ninjaPoolMatchSessions).where(and(
            eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
            eq(ninjaPoolMatchSessions.userId, user.id),
            ne(ninjaPoolMatchSessions.status, 'active'),
          )).orderBy(desc(ninjaPoolMatchSessions.startedAt))
          .limit(10_000).offset(NINJA_POOL_MATCH_HISTORY_LIMIT - 1);
        if (expired.length > 0) {
          const ids = expired.map((row) => row.id);
          await tx.delete(ninjaPoolMatchEvents).where(and(
            eq(ninjaPoolMatchEvents.tenantId, ctx.tenantId),
            inArray(ninjaPoolMatchEvents.matchId, ids),
          ));
          await tx.delete(ninjaPoolMatchSessions).where(and(
            eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
            inArray(ninjaPoolMatchSessions.id, ids),
          ));
        }
        return { kind: 'created' as const, match: created! };
      });
      if (outcome.kind === 'rate_limited') {
        reply.header('Retry-After', '3600');
        return reply.code(429).send({
          error: 'Match start limit reached; retry later',
          code: 'NINJA_POOL_MATCH_START_RATE_LIMITED',
        });
      }
      if (outcome.kind === 'idempotency_conflict') return idempotencyConflict(reply);
      return reply.code(outcome.kind === 'created' ? 201 : 200).send({
        ...matchView(outcome.match!),
        recovered: outcome.kind === 'active',
      });
    },
  );

  app.post(
    '/v1/modules/ninja-pool-hall/matches/:id/shots',
    { preHandler: [...ninjaPoolWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseNinjaPoolShot(request.body);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const beforeMatch = await loadScopedMatch(id, ctx.tenantId, user.id);
      if (!beforeMatch) return matchNotFound(reply);
      const [priorEvent] = await db.select().from(ninjaPoolMatchEvents).where(and(
        eq(ninjaPoolMatchEvents.tenantId, ctx.tenantId),
        eq(ninjaPoolMatchEvents.matchId, id),
        eq(ninjaPoolMatchEvents.clientActionId, input.clientShotId),
      )).limit(1);
      const recordedShotInput = shotEventInput(input);
      if (priorEvent) {
        if (priorEvent.eventKind !== 'shot' || !isDeepStrictEqual(priorEvent.input, recordedShotInput)) {
          return idempotencyConflict(reply);
        }
        return { match: matchView(beforeMatch), outcome: priorEvent.outcome, idempotent: true };
      }
      if (beforeMatch.status !== 'active') {
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match is already finalized', 'NINJA_POOL_MATCH_FINALIZED'), beforeMatch);
      }
      if (beforeMatch.version !== input.expectedVersion) {
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match version is stale', 'NINJA_POOL_MATCH_VERSION_CONFLICT'), beforeMatch);
      }
      const beforeState = beforeMatch.logicalState as GameState;
      if (beforeState.pendingChoice) {
        return matchConflict(reply, new NinjaPoolMatchConflictError('Resolve the pending table choice before shooting', 'NINJA_POOL_MATCH_CHOICE_REQUIRED'), beforeMatch);
      }
      if (beforeState.currentPlayer !== input.shooterSeat) {
        return matchConflict(reply, new NinjaPoolMatchConflictError('Shot does not belong to the active seat', 'NINJA_POOL_MATCH_TURN_CONFLICT'), beforeMatch);
      }
      if (beforeState.shotCount >= NINJA_POOL_MAX_MATCH_SHOTS) {
        return reply.code(409).send({ error: 'Match shot limit reached', code: 'NINJA_POOL_MATCH_SHOT_LIMIT' });
      }
      const alreadyPocketed = new Set(beforeState.balls.filter((ball) => ball.inPocket).map((ball) => ball.id));
      if (input.events.pocketed.some((ballId) => ballId !== 0 && alreadyPocketed.has(ballId))) {
        return reply.code(400).send({
          error: 'A previously pocketed object ball cannot be reported again',
          code: 'INVALID_NINJA_POOL_MATCH_INPUT',
          field: 'pocketed',
        });
      }
      if (input.events.firstContact !== null && alreadyPocketed.has(input.events.firstContact)) {
        return reply.code(400).send({
          error: 'firstContact must be an object ball still on the table',
          code: 'INVALID_NINJA_POOL_MATCH_INPUT',
          field: 'firstContact',
        });
      }
      if (input.events.pocketed.includes(8)
        && beforeMatch.rulesSettings.callShotOn8
        && input.eightPocket === undefined) {
        return reply.code(400).send({
          error: 'eightPocket is required when call-shot-on-8 is enabled',
          code: 'INVALID_NINJA_POOL_MATCH_INPUT',
          field: 'eightPocket',
        });
      }
      const afterPocketed = new Set([...alreadyPocketed, ...input.events.pocketed]);
      const afterState: GameState = {
        ...beforeState,
        balls: beforeState.balls.map((ball) => ({
          ...ball,
          ...(ball.id === 8 && input.eightPocket !== undefined
            ? { pos: { ...POCKETS[input.eightPocket]! } }
            : {}),
          inPocket: afterPocketed.has(ball.id),
        })),
      };
      const resolved = applyShotResult(
        beforeState,
        afterState,
        input.events,
        beforeMatch.rulesSettings,
        input.calledPocket === undefined ? undefined : { calledPocket: input.calledPocket },
      );
      const completed = Boolean(resolved.state.gameOver);
      const winnerSeat = resolved.state.gameOver?.winner ?? null;
      const result = completed
        ? beforeMatch.mode === 'bot'
          ? winnerSeat === null ? 'draw' : winnerSeat === 0 ? 'win' : 'loss'
          : winnerSeat === null ? 'draw' : winnerSeat === 0 ? 'player_1' : 'player_2'
        : null;
      const now = new Date();
      const outcome = {
        foul: resolved.foul,
        turnContinues: resolved.turnContinues,
        potNotes: resolved.potNotes.slice(0, 20),
        currentPlayer: resolved.state.currentPlayer,
        groupsAssigned: resolved.state.groupsAssigned,
        groups: resolved.state.players.map((player) => player.group),
        pendingChoice: resolved.state.pendingChoice ?? null,
        gameOver: resolved.state.gameOver,
        evidence: 'client_reported_server_rules',
      };
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.update(ninjaPoolMatchSessions).set({
          logicalState: toStoredLogicalState(resolved.state),
          status: completed ? 'completed' : 'active',
          winnerSeat,
          result,
          finishReason: resolved.state.gameOver?.reason?.slice(0, 240) ?? null,
          shotCount: resolved.state.shotCount,
          completedAt: completed ? now : null,
          version: sql`${ninjaPoolMatchSessions.version} + 1`,
          updatedAt: now,
        }).where(and(
          eq(ninjaPoolMatchSessions.id, id),
          eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
          eq(ninjaPoolMatchSessions.userId, user.id),
          eq(ninjaPoolMatchSessions.status, 'active'),
          eq(ninjaPoolMatchSessions.version, input.expectedVersion),
        )).returning();
        if (!row) return null;
        await tx.insert(ninjaPoolMatchEvents).values({
          tenantId: ctx.tenantId,
          matchId: id,
          userId: user.id,
          sequenceNumber: input.expectedVersion,
          clientActionId: input.clientShotId,
          eventKind: 'shot',
          input: recordedShotInput,
          outcome,
        });
        if (completed) {
          await tx.insert(activityFeed).values({
            userId: user.id,
            tenantId: ctx.tenantId,
            action: 'completed',
            entityType: 'ninja_pool_match',
            entityId: id,
            metadata: {
              mode: row.mode,
              result: row.result,
              shotCount: row.shotCount,
              evidence: row.evidence,
            },
          });
        }
        return row;
      });
      if (!updated) {
        const current = await loadScopedMatch(id, ctx.tenantId, user.id);
        const [duplicate] = await db.select().from(ninjaPoolMatchEvents).where(and(
          eq(ninjaPoolMatchEvents.tenantId, ctx.tenantId),
          eq(ninjaPoolMatchEvents.matchId, id),
          eq(ninjaPoolMatchEvents.clientActionId, input.clientShotId),
        )).limit(1);
        if (current && duplicate) {
          if (duplicate.eventKind !== 'shot' || !isDeepStrictEqual(duplicate.input, recordedShotInput)) {
            return idempotencyConflict(reply);
          }
          return { match: matchView(current), outcome: duplicate.outcome, idempotent: true };
        }
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match changed; reload before saving this shot', 'NINJA_POOL_MATCH_VERSION_CONFLICT'), current);
      }
      return { match: matchView(updated), outcome, idempotent: false };
    },
  );

  app.post(
    '/v1/modules/ninja-pool-hall/matches/:id/choices',
    { preHandler: [...ninjaPoolWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseNinjaPoolChoice(request.body);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const before = await loadScopedMatch(id, ctx.tenantId, user.id);
      if (!before) return matchNotFound(reply);
      const [prior] = await db.select().from(ninjaPoolMatchEvents).where(and(
        eq(ninjaPoolMatchEvents.tenantId, ctx.tenantId),
        eq(ninjaPoolMatchEvents.matchId, id),
        eq(ninjaPoolMatchEvents.clientActionId, input.clientActionId),
      )).limit(1);
      const recordedChoiceInput = { action: input.action };
      if (prior) {
        if (prior.eventKind !== 'choice' || !isDeepStrictEqual(prior.input, recordedChoiceInput)) {
          return idempotencyConflict(reply);
        }
        return { match: matchView(before), outcome: prior.outcome, idempotent: true };
      }
      if (before.status !== 'active') {
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match is already finalized', 'NINJA_POOL_MATCH_FINALIZED'), before);
      }
      if (before.version !== input.expectedVersion) {
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match version is stale', 'NINJA_POOL_MATCH_VERSION_CONFLICT'), before);
      }
      const state = before.logicalState as GameState;
      if (!state.pendingChoice) {
        return reply.code(409).send({ error: 'No table choice is pending', code: 'NINJA_POOL_MATCH_CHOICE_NOT_PENDING' });
      }
      const nextState = input.action === 'accept'
        ? acceptTable(state)
        : rerackAndBreak(state, makeLogicalBalls());
      const outcome = {
        action: input.action,
        currentPlayer: nextState.currentPlayer,
        pendingChoice: nextState.pendingChoice ?? null,
        evidence: 'server_rules',
      };
      const [updated] = await db.transaction(async (tx) => {
        const rows = await tx.update(ninjaPoolMatchSessions).set({
          logicalState: toStoredLogicalState(nextState),
          shotCount: nextState.shotCount,
          version: sql`${ninjaPoolMatchSessions.version} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(ninjaPoolMatchSessions.id, id),
          eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
          eq(ninjaPoolMatchSessions.userId, user.id),
          eq(ninjaPoolMatchSessions.status, 'active'),
          eq(ninjaPoolMatchSessions.version, input.expectedVersion),
        )).returning();
        const row = rows[0];
        if (!row) return [];
        await tx.insert(ninjaPoolMatchEvents).values({
          tenantId: ctx.tenantId,
          matchId: id,
          userId: user.id,
          sequenceNumber: input.expectedVersion,
          clientActionId: input.clientActionId,
          eventKind: 'choice',
          input: recordedChoiceInput,
          outcome,
        });
        return [row];
      });
      if (!updated) {
        const current = await loadScopedMatch(id, ctx.tenantId, user.id);
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match changed; reload before resolving the table', 'NINJA_POOL_MATCH_VERSION_CONFLICT'), current);
      }
      return { match: matchView(updated), outcome, idempotent: false };
    },
  );

  app.post(
    '/v1/modules/ninja-pool-hall/matches/:id/abandon',
    { preHandler: [...ninjaPoolWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseNinjaPoolMatchAbandon(request.body);
      } catch (error) {
        if (handleNinjaPoolError(reply, error)) return;
        throw error;
      }
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as NinjaPoolContext;
      const user = (request as any).user as NinjaPoolUser;
      const before = await loadScopedMatch(id, ctx.tenantId, user.id);
      if (!before) return matchNotFound(reply);
      if (before.status === 'abandoned' && before.version === input.expectedVersion + 1) return matchView(before);
      if (before.status !== 'active') {
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match is already finalized', 'NINJA_POOL_MATCH_FINALIZED'), before);
      }
      if (before.version !== input.expectedVersion) {
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match version is stale', 'NINJA_POOL_MATCH_VERSION_CONFLICT'), before);
      }
      const [updated] = await db.update(ninjaPoolMatchSessions).set({
        status: 'abandoned',
        abandonedAt: new Date(),
        version: sql`${ninjaPoolMatchSessions.version} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(ninjaPoolMatchSessions.id, id),
        eq(ninjaPoolMatchSessions.tenantId, ctx.tenantId),
        eq(ninjaPoolMatchSessions.userId, user.id),
        eq(ninjaPoolMatchSessions.status, 'active'),
        eq(ninjaPoolMatchSessions.version, input.expectedVersion),
      )).returning();
      if (!updated) {
        const current = await loadScopedMatch(id, ctx.tenantId, user.id);
        return matchConflict(reply, new NinjaPoolMatchConflictError('Match changed; reload before abandoning it', 'NINJA_POOL_MATCH_VERSION_CONFLICT'), current);
      }
      return matchView(updated);
    },
  );
}
