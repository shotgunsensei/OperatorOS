import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { activityFeed, ninjaPoolPracticeSessions } from '../schema.js';
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

const ninjaPoolReadGuards = [requireTenantModuleAccess('ninja-pool-hall')];
const ninjaPoolWriteGuards = [...ninjaPoolReadGuards, requireTenantModuleWriteAccess];
const ONE_HOUR_MS = 60 * 60 * 1_000;

type NinjaPoolContext = { tenantId: string };
type NinjaPoolUser = { id: string };
type NinjaPoolSession = typeof ninjaPoolPracticeSessions.$inferSelect;

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
}
