import { randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { writeAudit } from '../lib/audit.js';
import {
  createAttachment,
  getMaxAttachmentBytes,
  listAttachments,
} from '../lib/shared-attachments.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  FAULTLINE_CATEGORIES,
  FAULTLINE_DIFFICULTIES,
  FAULTLINE_SESSION_MODES,
  FaultlineValidationError,
  faultlineChaosSettings,
  faultlineContentHash,
  faultlineExpectedVersion,
  faultlineId,
  faultlineText,
  matchFaultlineCommand,
  parseFaultlineChallengeContent,
  safeFaultlineChallenge,
  scoreFaultlineSubmission,
  validateFaultlineChallengeContent,
  type FaultlineChallengeContent,
  type FaultlineSessionMode,
} from '../lib/faultlinelab-domain.js';
import {
  ensureFaultlineStarterContent,
  faultlineCamelRow,
  faultlineCsvCell,
  faultlineFirst,
  faultlineModuleId,
  faultlineRows,
  faultlineUtcDate,
  loadFaultlineVersion,
  pickFaultlineDailyChallenge,
  publicFaultlineSession,
} from '../lib/faultlinelab-service.js';
import {
  FAULTLINELAB_STARTER_CHALLENGES,
  faultlineStarterManifest,
} from '../lib/faultlinelab-starter-content.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('faultlinelab')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
const attachmentBodyLimit = Math.ceil(getMaxAttachmentBytes() * 1.38) + 16_384;
const sourceCatalogById = new Map(
  FAULTLINELAB_STARTER_CHALLENGES.map((challenge) => [challenge.sourceId, challenge.catalog]),
);

type Context = {
  tenantId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  viaPlatformRole: boolean;
};

function tenant(request: FastifyRequest): string {
  return ((request as any).tenantContext as Context).tenantId;
}

function user(request: FastifyRequest): string {
  return String((request as any).user.id);
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
    throw new FaultlineValidationError(
      'A JSON object is required',
      'FAULTLINE_BODY_INVALID',
    );
  }
  return request.body as Record<string, unknown>;
}

function param(request: FastifyRequest, key = 'id'): string {
  return faultlineId((request.params as Record<string, unknown>)[key], key);
}

function slug(value: unknown): string {
  const result = faultlineText(value, 'slug', 120, {
    required: true,
    min: 2,
    singleLine: true,
  })!;
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(result)) {
    throw new FaultlineValidationError(
      'slug must contain only lowercase letters, numbers, and hyphens',
      'FAULTLINE_SLUG_INVALID',
      400,
      'slug',
    );
  }
  return result;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new FaultlineValidationError(
      `${field} must be an integer between ${min} and ${max}`,
      'FAULTLINE_INTEGER_INVALID',
      400,
      field,
    );
  }
  return parsed;
}

function stringIds(value: unknown, field: string, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new FaultlineValidationError(
      `${field} must be an array of at most ${max} ids`,
      'FAULTLINE_ARRAY_INVALID',
      400,
      field,
    );
  }
  return [...new Set(value.map((item, index) => faultlineId(item, `${field}.${index}`)))];
}

function handleFaultlineError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof FaultlineValidationError) {
    reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      ...(error.field ? { field: error.field } : {}),
    });
    return true;
  }
  const pg = error as { code?: string; constraint?: string };
  if (pg?.code === '23505') {
    reply.code(409).send({
      error: 'A matching FaultlineLab record already exists',
      code: 'FAULTLINE_DUPLICATE',
      constraint: pg.constraint,
    });
    return true;
  }
  return false;
}

function notFound(reply: FastifyReply, entity: string) {
  return reply.code(404).send({
    error: `${entity} not found`,
    code: 'FAULTLINE_NOT_FOUND',
  });
}

async function challengeRow(
  request: FastifyRequest,
  challengeId: string,
  authoring = false,
  executor: Pick<typeof db, 'execute'> = db,
): Promise<Record<string, any> | null> {
  const manager = canManage(request);
  const result = await executor.execute(sql`
    SELECT * FROM faultlinelab_challenges
    WHERE tenant_id=${tenant(request)} AND id=${challengeId} AND archived_at IS NULL
      AND (
        ${manager}
        OR owner_user_id=${user(request)}
        OR (${!authoring} AND scope='tenant' AND status='published')
      )
    LIMIT 1
  `);
  return faultlineFirst(result);
}

async function sessionBundle(
  request: FastifyRequest,
  sessionId: string,
  managerRead = false,
) {
  const sessionResult = await db.execute(sql`
    SELECT s.*, c.title AS challenge_title, c.slug AS challenge_slug,
      c.category, c.difficulty
    FROM faultlinelab_sessions s
    JOIN faultlinelab_challenges c
      ON c.tenant_id=s.tenant_id AND c.id=s.challenge_id
    WHERE s.tenant_id=${tenant(request)} AND s.id=${sessionId}
      AND (${managerRead && canManage(request)} OR s.user_id=${user(request)})
    LIMIT 1
  `);
  const session = faultlineFirst(sessionResult);
  if (!session) return null;
  const version = await loadFaultlineVersion({
    tenantId: tenant(request),
    challengeId: String(session.challengeId),
    versionNumber: Number(session.challengeVersionNumber),
  });
  if (!version) return null;
  const actions = faultlineRows(
    await db.execute(sql`
      SELECT id, sequence_number, kind, target_key, output, evidence_unlocked,
        risky, hint_penalty, created_at
      FROM faultlinelab_session_actions
      WHERE tenant_id=${tenant(request)} AND session_id=${sessionId}
      ORDER BY sequence_number
    `),
  );
  const submission = faultlineFirst(
    await db.execute(sql`
      SELECT id, hypothesis, selected_root_cause_id, evidence_ids, remediation,
        proof_note, score_breakdown, badges, passed, submitted_at
      FROM faultlinelab_submissions
      WHERE tenant_id=${tenant(request)} AND session_id=${sessionId}
      LIMIT 1
    `),
  );
  return publicFaultlineSession(session, version.content, actions, submission);
}

function actionHelp(content: FaultlineChallengeContent, command: string): string {
  const firstWord = command.trim().toLowerCase().split(/\s+/)[0] ?? '';
  const similar = content.commands.filter((item) =>
    item.command.toLowerCase().startsWith(firstWord),
  );
  const choices = (similar.length > 0 ? similar : content.commands)
    .slice(0, 20)
    .map((item) => `${item.command} — ${item.description}`)
    .join('\n');
  return `Command not recognized. Available commands:\n${choices}`;
}

async function audit(
  request: FastifyRequest,
  action: string,
  targetType: string,
  targetId: string,
  after: Record<string, unknown>,
) {
  await writeAudit(
    {
      actorUserId: user(request),
      tenantId: tenant(request),
      action,
      targetType,
      targetId,
      after,
      ipAddress: request.ip,
    },
    request,
  );
}

async function dailyEligibleChallenges(tenantId: string) {
  const rows = faultlineRows(
    await db.execute(sql`
      SELECT c.id, c.slug, c.title, c.category, c.difficulty,
        c.published_version_number, m.source_id
      FROM faultlinelab_challenges c
      JOIN faultlinelab_migration_refs m
        ON m.tenant_id=c.tenant_id AND m.target_type='challenge'
        AND m.target_id=c.id AND m.source_type='starter_challenge'
      WHERE c.tenant_id=${tenantId} AND c.scope='tenant' AND c.status='published'
        AND c.archived_at IS NULL
      ORDER BY c.id
    `),
  );
  return rows.filter((row) => sourceCatalogById.get(String(row.sourceId))?.isDailyEligible === true);
}

export async function registerFaultlineLabRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/modules/faultlinelab/policy',
    { preHandler: readGuards },
    async () => {
      const manifest = faultlineStarterManifest();
      return {
        authority: 'operatoros',
        scoring: 'server-only',
        certificates: {
          available: false,
          reason:
            'FaultlineLab records badges and completion evidence but does not issue identity-verified credentials or certificates.',
        },
        authoredValidCasesArePlayable: true,
        plannedCatalogEntriesArePlayable: true,
        sourceCatalog: {
          sourceCommit: manifest.sourceCommit,
          sourceManifestHash: manifest.sourceManifestHash,
          discoveredCount: manifest.discoveredCount,
          compilerManaged: true,
        },
      };
    },
  );

  app.get(
    '/v1/modules/faultlinelab/challenges',
    { preHandler: readGuards },
    async (request, reply) => {
      try {
        await ensureFaultlineStarterContent(tenant(request), user(request));
        const query = request.query as Record<string, unknown>;
        const search = faultlineText(query.search, 'search', 120, { singleLine: true });
        const category = query.category
          ? faultlineText(query.category, 'category', 40, { required: true, singleLine: true })
          : null;
        const difficulty = query.difficulty
          ? faultlineText(query.difficulty, 'difficulty', 20, { required: true, singleLine: true })
          : null;
        const sort = query.sort
          ? faultlineText(query.sort, 'sort', 30, { required: true, singleLine: true })
          : 'featured';
        if (category && !FAULTLINE_CATEGORIES.includes(category as any)) {
          throw new FaultlineValidationError('Invalid category', 'FAULTLINE_CATEGORY_INVALID', 400, 'category');
        }
        if (difficulty && !FAULTLINE_DIFFICULTIES.includes(difficulty as any)) {
          throw new FaultlineValidationError('Invalid difficulty', 'FAULTLINE_DIFFICULTY_INVALID', 400, 'difficulty');
        }
        if (!['featured', 'title', 'difficulty', 'newest', 'best-score'].includes(sort!)) {
          throw new FaultlineValidationError('Invalid sort', 'FAULTLINE_SORT_INVALID', 400, 'sort');
        }
        const includeDrafts = query.includeDrafts === 'true' && canManage(request);
        const rawRows = faultlineRows(
          await db.execute(sql`
            SELECT c.id, c.slug, c.title, c.category, c.difficulty, c.scope,
              c.status, c.owner_user_id, c.current_version_number,
              c.published_version_number, c.version, c.published_at, c.updated_at,
              m.source_id,
              COALESCE(p.attempt_count,0) AS attempt_count,
              COALESCE(p.pass_count,0) AS pass_count,
              p.best_score, p.best_percentage, p.best_tier, p.last_completed_at
            FROM faultlinelab_challenges c
            LEFT JOIN faultlinelab_user_challenge_progress p
              ON p.tenant_id=c.tenant_id AND p.challenge_id=c.id
              AND p.user_id=${user(request)}
            LEFT JOIN faultlinelab_migration_refs m
              ON m.tenant_id=c.tenant_id AND m.target_type='challenge'
              AND m.target_id=c.id AND m.source_type='starter_challenge'
            WHERE c.tenant_id=${tenant(request)} AND c.archived_at IS NULL
              AND (
                (c.scope='tenant' AND c.status='published')
                OR c.owner_user_id=${user(request)}
                OR ${includeDrafts}
              )
              AND (${category}::text IS NULL OR c.category=${category})
              AND (${difficulty}::text IS NULL OR c.difficulty=${difficulty})
              AND (${search}::text IS NULL OR c.title ILIKE ${search ? `%${search}%` : null} OR c.slug ILIKE ${search ? `%${search}%` : null})
            ORDER BY CASE WHEN c.status='published' THEN 0 ELSE 1 END,
              CASE WHEN ${sort}='title' THEN c.title END ASC,
              CASE WHEN ${sort}='difficulty' THEN
                CASE c.difficulty WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 ELSE 4 END
              END ASC,
              CASE WHEN ${sort}='best-score' THEN p.best_percentage END DESC NULLS LAST,
              CASE WHEN ${sort}='newest' THEN c.published_at END DESC NULLS LAST,
              c.updated_at DESC, c.title
            LIMIT 200
          `),
        );
        const rows = rawRows.map((row) => {
          const catalog = row.sourceId ? sourceCatalogById.get(String(row.sourceId)) : null;
          return catalog ? { ...row, ...catalog } : row;
        });
        const countRows = faultlineRows(
          await db.execute(sql`
            SELECT category, difficulty, COUNT(*)::int AS count
            FROM faultlinelab_challenges
            WHERE tenant_id=${tenant(request)} AND scope='tenant'
              AND status='published' AND archived_at IS NULL
            GROUP BY category, difficulty
          `),
        );
        const facets = countRows.reduce(
          (result, row) => {
            const count = Number(row.count);
            result.total += count;
            result.categories[String(row.category)] =
              (result.categories[String(row.category)] ?? 0) + count;
            result.difficulties[String(row.difficulty)] =
              (result.difficulties[String(row.difficulty)] ?? 0) + count;
            return result;
          },
          {
            total: 0,
            categories: {} as Record<string, number>,
            difficulties: {} as Record<string, number>,
          },
        );
        return { challenges: rows, total: rows.length, facets };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.get(
    '/v1/modules/faultlinelab/challenges/:id',
    { preHandler: readGuards },
    async (request, reply) => {
      try {
        const id = param(request);
        const challenge = await challengeRow(request, id);
        if (!challenge) return notFound(reply, 'Challenge');
        const versionNumber =
          challenge.status === 'published'
            ? Number(challenge.publishedVersionNumber)
            : Number(challenge.currentVersionNumber);
        const version = await loadFaultlineVersion({
          tenantId: tenant(request),
          challengeId: id,
          versionNumber,
        });
        if (!version) return notFound(reply, 'Challenge version');
        return {
          challenge,
          content: safeFaultlineChallenge(version.content),
          contentHash: version.contentSha256,
        };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.get(
    '/v1/modules/faultlinelab/authoring/challenges/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const id = param(request);
        const challenge = await challengeRow(request, id, true);
        if (!challenge) return notFound(reply, 'Challenge draft');
        const versions = faultlineRows(
          await db.execute(sql`
            SELECT id, version_number, content_sha256, validation, change_note,
              created_by_user_id, created_at
            FROM faultlinelab_challenge_versions
            WHERE tenant_id=${tenant(request)} AND challenge_id=${id}
            ORDER BY version_number DESC
          `),
        );
        const current = await loadFaultlineVersion({
          tenantId: tenant(request),
          challengeId: id,
          versionNumber: Number(challenge.currentVersionNumber),
        });
        if (!current) return notFound(reply, 'Challenge version');
        return { challenge, content: current.content, versions };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.post(
    '/v1/modules/faultlinelab/authoring/validate',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const content = parseFaultlineChallengeContent(body(request).content);
        const validation = validateFaultlineChallengeContent(content);
        return {
          valid: validation.valid,
          validation,
          contentHash: faultlineContentHash(content),
        };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.post(
    '/v1/modules/faultlinelab/authoring/challenges',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const challengeSlug = slug(input.slug);
        const title = faultlineText(input.title, 'title', 200, {
          required: true,
          min: 2,
          singleLine: true,
        })!;
        const category = faultlineText(input.category, 'category', 40, {
          required: true,
          singleLine: true,
        })!;
        const difficulty = faultlineText(input.difficulty, 'difficulty', 20, {
          required: true,
          singleLine: true,
        })!;
        if (!FAULTLINE_CATEGORIES.includes(category as any)) {
          throw new FaultlineValidationError('Invalid category', 'FAULTLINE_CATEGORY_INVALID', 400, 'category');
        }
        if (!FAULTLINE_DIFFICULTIES.includes(difficulty as any)) {
          throw new FaultlineValidationError('Invalid difficulty', 'FAULTLINE_DIFFICULTY_INVALID', 400, 'difficulty');
        }
        const content = parseFaultlineChallengeContent(input.content);
        const validation = validateFaultlineChallengeContent(content);
        const hash = faultlineContentHash(content);
        const scope = input.scope === 'tenant' && canManage(request) ? 'tenant' : 'personal';
        const created = await db.transaction(async (tx) => {
          const challengeResult = await tx.execute(sql`
            INSERT INTO faultlinelab_challenges (
              tenant_id, owner_user_id, scope, slug, title, category, difficulty,
              status, current_version_number, created_by_user_id, updated_by_user_id
            ) VALUES (
              ${tenant(request)}, ${user(request)}, ${scope}, ${challengeSlug},
              ${title}, ${category}, ${difficulty}, 'draft', 1,
              ${user(request)}, ${user(request)}
            ) RETURNING *
          `);
          const challenge = faultlineFirst(challengeResult)!;
          await tx.execute(sql`
            INSERT INTO faultlinelab_challenge_versions (
              tenant_id, challenge_id, version_number, content, content_sha256,
              validation, change_note, created_by_user_id
            ) VALUES (
              ${tenant(request)}, ${challenge.id}, 1,
              ${JSON.stringify(content)}::jsonb, ${hash},
              ${JSON.stringify(validation)}::jsonb,
              ${faultlineText(input.changeNote, 'changeNote', 500, { singleLine: true })},
              ${user(request)}
            )
          `);
          return challenge;
        });
        await audit(request, 'faultlinelab_challenge_created', 'faultlinelab_challenge', created.id, {
          scope: created.scope,
          slug: created.slug,
          version: created.version,
        });
        return reply.code(201).send({ challenge: created, content, validation, contentHash: hash });
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.patch(
    '/v1/modules/faultlinelab/authoring/challenges/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const expectedVersion = faultlineExpectedVersion(input.expectedVersion);
        const id = param(request);
        const content = parseFaultlineChallengeContent(input.content);
        const validation = validateFaultlineChallengeContent(content);
        const hash = faultlineContentHash(content);
        const nextCategory = input.category
          ? faultlineText(input.category, 'category', 40, { required: true, singleLine: true })
          : null;
        const nextDifficulty = input.difficulty
          ? faultlineText(input.difficulty, 'difficulty', 20, { required: true, singleLine: true })
          : null;
        if (nextCategory && !FAULTLINE_CATEGORIES.includes(nextCategory as any)) {
          throw new FaultlineValidationError('Invalid category', 'FAULTLINE_CATEGORY_INVALID', 400, 'category');
        }
        if (nextDifficulty && !FAULTLINE_DIFFICULTIES.includes(nextDifficulty as any)) {
          throw new FaultlineValidationError('Invalid difficulty', 'FAULTLINE_DIFFICULTY_INVALID', 400, 'difficulty');
        }
        const updated = await db.transaction(async (tx) => {
          const existing = faultlineFirst(
            await tx.execute(sql`
              SELECT * FROM faultlinelab_challenges
              WHERE tenant_id=${tenant(request)} AND id=${id} AND archived_at IS NULL
              FOR UPDATE
            `),
          );
          if (!existing || (!canManage(request) && existing.ownerUserId !== user(request))) return null;
          if (Number(existing.version) !== expectedVersion) {
            throw new FaultlineValidationError(
              'Challenge changed; reload and retry',
              'FAULTLINE_VERSION_CONFLICT',
              409,
            );
          }
          const nextVersion = Number(existing.currentVersionNumber) + 1;
          await tx.execute(sql`
            INSERT INTO faultlinelab_challenge_versions (
              tenant_id, challenge_id, version_number, content, content_sha256,
              validation, change_note, created_by_user_id
            ) VALUES (
              ${tenant(request)}, ${id}, ${nextVersion},
              ${JSON.stringify(content)}::jsonb, ${hash},
              ${JSON.stringify(validation)}::jsonb,
              ${faultlineText(input.changeNote, 'changeNote', 500, { singleLine: true })},
              ${user(request)}
            )
          `);
          return faultlineFirst(
            await tx.execute(sql`
              UPDATE faultlinelab_challenges SET
                title=COALESCE(${faultlineText(input.title, 'title', 200, { min: 2, singleLine: true })},title),
                category=COALESCE(${nextCategory},category),
                difficulty=COALESCE(${nextDifficulty},difficulty),
                current_version_number=${nextVersion}, version=version+1,
                updated_by_user_id=${user(request)}, updated_at=NOW()
              WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${expectedVersion}
              RETURNING *
            `),
          );
        });
        if (!updated) return notFound(reply, 'Challenge draft');
        await audit(request, 'faultlinelab_challenge_version_created', 'faultlinelab_challenge', id, {
          challengeVersion: updated.version,
          contentVersion: updated.currentVersionNumber,
          contentHash: hash,
        });
        return { challenge: updated, content, validation, contentHash: hash };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.post(
    '/v1/modules/faultlinelab/authoring/challenges/:id/publish',
    { preHandler: adminGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const expectedVersion = faultlineExpectedVersion(input.expectedVersion);
        const id = param(request);
        const challenge = await challengeRow(request, id, true);
        if (!challenge) return notFound(reply, 'Challenge draft');
        const versionNumber = input.versionNumber === undefined
          ? Number(challenge.currentVersionNumber)
          : integer(input.versionNumber, 'versionNumber', 1, 1_000_000);
        const version = await loadFaultlineVersion({
          tenantId: tenant(request), challengeId: id, versionNumber,
        });
        if (!version) return notFound(reply, 'Challenge version');
        const validation = validateFaultlineChallengeContent(version.content);
        if (!validation.valid) {
          return reply.code(422).send({
            error: 'Challenge version has validation errors',
            code: 'FAULTLINE_PUBLISH_VALIDATION_FAILED',
            validation,
          });
        }
        const updated = faultlineFirst(
          await db.execute(sql`
            UPDATE faultlinelab_challenges SET scope='tenant', status='published',
              published_version_number=${versionNumber}, published_at=NOW(),
              retired_at=NULL, version=version+1, updated_by_user_id=${user(request)},
              updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${id}
              AND version=${expectedVersion} AND archived_at IS NULL
            RETURNING *
          `),
        );
        if (!updated) {
          const exists = await challengeRow(request, id, true);
          return exists
            ? reply.code(409).send({ error: 'Challenge changed; reload and retry', code: 'FAULTLINE_VERSION_CONFLICT' })
            : notFound(reply, 'Challenge');
        }
        await audit(request, 'faultlinelab_challenge_published', 'faultlinelab_challenge', id, {
          publishedVersionNumber: versionNumber,
          contentHash: version.contentSha256,
        });
        return { challenge: updated };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.post(
    '/v1/modules/faultlinelab/authoring/challenges/:id/retire',
    { preHandler: adminGuards },
    async (request, reply) => {
      try {
        const expectedVersion = faultlineExpectedVersion(body(request).expectedVersion);
        const id = param(request);
        const updated = faultlineFirst(
          await db.execute(sql`
            UPDATE faultlinelab_challenges SET status='retired', retired_at=NOW(),
              version=version+1, updated_by_user_id=${user(request)}, updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${id}
              AND version=${expectedVersion} AND archived_at IS NULL
            RETURNING *
          `),
        );
        if (!updated) {
          const exists = await challengeRow(request, id, true);
          return exists
            ? reply.code(409).send({ error: 'Challenge changed; reload and retry', code: 'FAULTLINE_VERSION_CONFLICT' })
            : notFound(reply, 'Challenge');
        }
        await audit(request, 'faultlinelab_challenge_retired', 'faultlinelab_challenge', id, {
          version: updated.version,
        });
        return { challenge: updated };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.get(
    '/v1/modules/faultlinelab/authoring/challenges/:id/export',
    { preHandler: writeGuards },
    async (request, reply) => {
      const id = param(request);
      const challenge = await challengeRow(request, id, true);
      if (!challenge) return notFound(reply, 'Challenge');
      const version = await loadFaultlineVersion({
        tenantId: tenant(request),
        challengeId: id,
        versionNumber: Number(challenge.currentVersionNumber),
      });
      if (!version) return notFound(reply, 'Challenge version');
      reply.header('Content-Disposition', `attachment; filename="${challenge.slug}-v${version.versionNumber}.json"`);
      return {
        schemaVersion: 1,
        challenge: {
          slug: challenge.slug,
          title: challenge.title,
          category: challenge.category,
          difficulty: challenge.difficulty,
          versionNumber: version.versionNumber,
          contentHash: version.contentSha256,
        },
        content: version.content,
      };
    },
  );

  app.get(
    '/v1/modules/faultlinelab/daily',
    { preHandler: readGuards },
    async (request) => {
      await ensureFaultlineStarterContent(tenant(request), user(request));
      const date = faultlineUtcDate();
      const challenges = await dailyEligibleChallenges(tenant(request)) as Array<{
        id: string;
        slug: string;
        title: string;
        category: string;
        difficulty: string;
        publishedVersionNumber: number;
      }>;
      const challenge = pickFaultlineDailyChallenge(challenges, tenant(request), date);
      const outcome = faultlineFirst(
        await db.execute(sql`
          SELECT * FROM faultlinelab_daily_outcomes
          WHERE tenant_id=${tenant(request)} AND user_id=${user(request)}
            AND challenge_date=${date}::date
          LIMIT 1
        `),
      );
      return { date, challenge, outcome };
    },
  );

  app.post(
    '/v1/modules/faultlinelab/sessions',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        await ensureFaultlineStarterContent(tenant(request), user(request));
        const input = body(request);
        const mode = (input.mode ?? 'standard') as FaultlineSessionMode;
        if (!FAULTLINE_SESSION_MODES.includes(mode)) {
          throw new FaultlineValidationError('Invalid session mode', 'FAULTLINE_MODE_INVALID', 400, 'mode');
        }
        const clientStartKey = faultlineText(input.clientStartKey, 'clientStartKey', 160, {
          required: true,
          min: 8,
          singleLine: true,
        })!;
        const existing = faultlineFirst(
          await db.execute(sql`
            SELECT * FROM faultlinelab_sessions
            WHERE tenant_id=${tenant(request)} AND user_id=${user(request)}
              AND client_start_key=${clientStartKey}
            LIMIT 1
          `),
        );
        if (existing) {
          const bundle = await sessionBundle(request, String(existing.id));
          return reply.code(200).send(bundle);
        }
        let challengeId = input.challengeId ? faultlineId(input.challengeId, 'challengeId') : '';
        let versionNumber: number | null = null;
        let assignmentId: string | null = null;
        if (mode === 'daily') {
          const date = faultlineUtcDate();
          const challenges = await dailyEligibleChallenges(tenant(request)) as Array<{
            id: string;
            publishedVersionNumber: number;
          }>;
          const chosen = pickFaultlineDailyChallenge(challenges, tenant(request), date);
          if (!chosen) throw new FaultlineValidationError('No published challenge is available', 'FAULTLINE_CATALOG_EMPTY', 409);
          challengeId = String(chosen.id);
          versionNumber = Number(chosen.publishedVersionNumber);
        } else if (mode === 'assignment') {
          assignmentId = faultlineId(input.assignmentId, 'assignmentId');
          const assignment = faultlineFirst(
            await db.execute(sql`
              SELECT * FROM faultlinelab_assignments
              WHERE tenant_id=${tenant(request)} AND id=${assignmentId}
                AND assignee_user_id=${user(request)}
                AND status IN ('assigned','in_progress') AND archived_at IS NULL
              LIMIT 1
            `),
          );
          if (!assignment) return notFound(reply, 'Assignment');
          challengeId = String(assignment.challengeId);
          versionNumber = Number(assignment.challengeVersionNumber);
        }
        const challenge = await challengeRow(request, challengeId, mode === 'preview');
        if (!challenge) return notFound(reply, 'Challenge');
        if (mode !== 'preview' && challenge.status !== 'published') {
          throw new FaultlineValidationError(
            'Only published challenges can start scored attempts',
            'FAULTLINE_CHALLENGE_NOT_PUBLISHED',
            409,
          );
        }
        versionNumber ??= mode === 'preview'
          ? Number(challenge.currentVersionNumber)
          : Number(challenge.publishedVersionNumber);
        const challengeVersion = await loadFaultlineVersion({
          tenantId: tenant(request), challengeId, versionNumber,
        });
        if (!challengeVersion) return notFound(reply, 'Challenge version');
        const chaos = mode === 'chaos' ? faultlineChaosSettings(input.chaosIntensity) : null;
        const chaosSeed = chaos
          ? randomInt(1, 2_147_483_647)
          : null;
        let created: Record<string, any> | null = null;
        try {
          created = faultlineFirst(
            await db.execute(sql`
              INSERT INTO faultlinelab_sessions (
                tenant_id, user_id, challenge_id, challenge_version_number,
                assignment_id, mode, chaos_seed, chaos_settings, client_start_key
              ) VALUES (
                ${tenant(request)}, ${user(request)}, ${challengeId}, ${versionNumber},
                ${assignmentId}, ${mode}, ${chaosSeed},
                ${chaos ? JSON.stringify(chaos) : null}::jsonb, ${clientStartKey}
              ) RETURNING *
            `),
          );
        } catch (error) {
          if ((error as { code?: string }).code !== '23505') throw error;
          created = faultlineFirst(
            await db.execute(sql`
              SELECT * FROM faultlinelab_sessions
              WHERE tenant_id=${tenant(request)} AND user_id=${user(request)}
                AND challenge_id=${challengeId} AND mode=${mode} AND state='active'
              LIMIT 1
            `),
          );
        }
        if (!created) throw new Error('FaultlineLab session could not be created');
        if (assignmentId) {
          await db.execute(sql`
            UPDATE faultlinelab_assignments SET status='in_progress',
              version=version+1, updated_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${assignmentId} AND status='assigned'
          `);
        }
        const bundle = await sessionBundle(request, String(created.id));
        return reply.code(201).send(bundle);
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.get(
    '/v1/modules/faultlinelab/sessions',
    { preHandler: readGuards },
    async (request, reply) => {
      try {
        const query = request.query as Record<string, unknown>;
        const state = query.state
          ? faultlineText(query.state, 'state', 20, { required: true, singleLine: true })
          : null;
        const tenantScope = query.scope === 'tenant' && canManage(request);
        const rows = faultlineRows(
          await db.execute(sql`
            SELECT s.*, c.title AS challenge_title, c.slug AS challenge_slug,
              c.category, c.difficulty
            FROM faultlinelab_sessions s
            JOIN faultlinelab_challenges c
              ON c.tenant_id=s.tenant_id AND c.id=s.challenge_id
            WHERE s.tenant_id=${tenant(request)}
              AND (${tenantScope} OR s.user_id=${user(request)})
              AND (${state}::text IS NULL OR s.state=${state})
            ORDER BY s.last_activity_at DESC LIMIT 200
          `),
        );
        return { sessions: rows, total: rows.length };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.get(
    '/v1/modules/faultlinelab/sessions/:id',
    { preHandler: readGuards },
    async (request, reply) => {
      const bundle = await sessionBundle(request, param(request), true);
      return bundle ?? notFound(reply, 'Session');
    },
  );

  app.post(
    '/v1/modules/faultlinelab/sessions/:id/actions',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const sessionId = param(request);
        const expectedVersion = faultlineExpectedVersion(input.expectedVersion);
        const clientActionId = faultlineText(input.clientActionId, 'clientActionId', 160, {
          required: true,
          min: 8,
          singleLine: true,
        })!;
        const kind = faultlineText(input.kind, 'kind', 30, {
          required: true,
          singleLine: true,
        })!;
        if (!['command', 'event', 'ticket', 'hint'].includes(kind)) {
          throw new FaultlineValidationError('Invalid action kind', 'FAULTLINE_ACTION_INVALID', 400, 'kind');
        }
        await db.transaction(async (tx) => {
          const duplicate = faultlineFirst(
            await tx.execute(sql`
              SELECT id FROM faultlinelab_session_actions
              WHERE tenant_id=${tenant(request)} AND session_id=${sessionId}
                AND client_action_id=${clientActionId}
              LIMIT 1
            `),
          );
          if (duplicate) return;
          const session = faultlineFirst(
            await tx.execute(sql`
              SELECT * FROM faultlinelab_sessions
              WHERE tenant_id=${tenant(request)} AND id=${sessionId}
                AND user_id=${user(request)}
              FOR UPDATE
            `),
          );
          if (!session) throw new FaultlineValidationError('Session not found', 'FAULTLINE_NOT_FOUND', 404);
          if (session.state !== 'active') {
            throw new FaultlineValidationError('Session is no longer active', 'FAULTLINE_SESSION_CLOSED', 409);
          }
          if (Number(session.version) !== expectedVersion) {
            throw new FaultlineValidationError('Session changed; reload and retry', 'FAULTLINE_VERSION_CONFLICT', 409);
          }
          const version = await loadFaultlineVersion({
            tenantId: tenant(request),
            challengeId: String(session.challengeId),
            versionNumber: Number(session.challengeVersionNumber),
          }, tx);
          if (!version) throw new FaultlineValidationError('Challenge version not found', 'FAULTLINE_NOT_FOUND', 404);
          let targetKey = '';
          let output = '';
          let reveals: string[] = [];
          let risky = false;
          let hintPenalty = 0;
          const hintsUsed = Array.isArray(session.hintsUsed)
            ? session.hintsUsed.map(Number)
            : [];
          if (kind === 'command') {
            targetKey = faultlineText(input.target, 'target', 200, {
              required: true,
              min: 1,
              singleLine: true,
            })!;
            const command = matchFaultlineCommand(version.content, targetKey);
            output = command?.output ?? actionHelp(version.content, targetKey);
            reveals = command?.revealsEvidence ?? [];
            risky = command?.risky ?? false;
          } else if (kind === 'event') {
            targetKey = faultlineId(input.target, 'target');
            const event = version.content.events.find((item) => item.id === targetKey);
            if (!event) throw new FaultlineValidationError('Event not found', 'FAULTLINE_ACTION_TARGET_INVALID', 404, 'target');
            output = event.details;
            reveals = event.revealsEvidence;
          } else if (kind === 'ticket') {
            targetKey = faultlineId(input.target, 'target');
            const ticket = version.content.tickets.find((item) => item.id === targetKey);
            if (!ticket) throw new FaultlineValidationError('Ticket not found', 'FAULTLINE_ACTION_TARGET_INVALID', 404, 'target');
            output = ticket.content;
            reveals = ticket.revealsEvidence;
          } else {
            const level = integer(input.target, 'target', 1, 4);
            targetKey = String(level);
            const chaosSettings = session.chaosSettings as { hintBlackout?: boolean } | null;
            if (chaosSettings?.hintBlackout) {
              throw new FaultlineValidationError('Hints are disabled in this Chaos session', 'FAULTLINE_HINT_BLACKOUT', 409);
            }
            if (hintsUsed.includes(level)) {
              throw new FaultlineValidationError('This hint was already used', 'FAULTLINE_HINT_ALREADY_USED', 409);
            }
            const hint = version.content.hints.find((item) => item.level === level);
            if (!hint) throw new FaultlineValidationError('Hint not found', 'FAULTLINE_ACTION_TARGET_INVALID', 404, 'target');
            output = hint.text;
            hintPenalty = hint.scorePenalty;
          }
          const unlocked = Array.isArray(session.unlockedEvidence)
            ? session.unlockedEvidence.map(String)
            : [];
          const nextUnlocked = [...new Set([...unlocked, ...reveals])];
          const nextHints = kind === 'hint'
            ? [...new Set([...hintsUsed, Number(targetKey)])]
            : hintsUsed;
          const nextSequence = Number(session.actionCount) + 1;
          await tx.execute(sql`
            INSERT INTO faultlinelab_session_actions (
              tenant_id, session_id, user_id, sequence_number, client_action_id,
              kind, target_key, output, evidence_unlocked, risky, hint_penalty
            ) VALUES (
              ${tenant(request)}, ${sessionId}, ${user(request)}, ${nextSequence},
              ${clientActionId}, ${kind}, ${targetKey}, ${output},
              ${JSON.stringify(reveals)}::jsonb, ${risky}, ${hintPenalty}
            )
          `);
          await tx.execute(sql`
            UPDATE faultlinelab_sessions SET
              unlocked_evidence=${JSON.stringify(nextUnlocked)}::jsonb,
              hints_used=${JSON.stringify(nextHints)}::jsonb,
              action_count=${nextSequence},
              risky_action_count=risky_action_count+${risky ? 1 : 0},
              version=version+1, last_activity_at=NOW()
            WHERE tenant_id=${tenant(request)} AND id=${sessionId}
              AND version=${expectedVersion}
          `);
        });
        const bundle = await sessionBundle(request, sessionId);
        return bundle ?? notFound(reply, 'Session');
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.post(
    '/v1/modules/faultlinelab/sessions/:id/submit',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const sessionId = param(request);
        const expectedVersion = faultlineExpectedVersion(input.expectedVersion);
        const clientSubmissionId = faultlineText(
          input.clientSubmissionId,
          'clientSubmissionId',
          160,
          { required: true, min: 8, singleLine: true },
        )!;
        const hypothesis = faultlineText(input.hypothesis, 'hypothesis', 4000, {
          required: true,
          min: 4,
        })!;
        const selectedRootCauseId = faultlineId(input.selectedRootCauseId, 'selectedRootCauseId');
        const evidenceIds = stringIds(input.evidenceIds, 'evidenceIds', 100);
        const remediation = faultlineText(input.remediation, 'remediation', 5000, {
          required: true,
          min: 4,
        })!;
        const proofNote = faultlineText(input.proofNote, 'proofNote', 5000);
        await db.transaction(async (tx) => {
          const duplicate = faultlineFirst(
            await tx.execute(sql`
              SELECT s.session_id FROM faultlinelab_submissions s
              WHERE s.tenant_id=${tenant(request)} AND s.user_id=${user(request)}
                AND s.client_submission_id=${clientSubmissionId}
              LIMIT 1
            `),
          );
          if (duplicate) {
            if (String(duplicate.sessionId) !== sessionId) {
              throw new FaultlineValidationError('Submission key already used', 'FAULTLINE_IDEMPOTENCY_CONFLICT', 409);
            }
            return;
          }
          const session = faultlineFirst(
            await tx.execute(sql`
              SELECT * FROM faultlinelab_sessions
              WHERE tenant_id=${tenant(request)} AND id=${sessionId}
                AND user_id=${user(request)}
              FOR UPDATE
            `),
          );
          if (!session) throw new FaultlineValidationError('Session not found', 'FAULTLINE_NOT_FOUND', 404);
          if (session.state !== 'active') {
            throw new FaultlineValidationError('Session is no longer active', 'FAULTLINE_SESSION_CLOSED', 409);
          }
          if (Number(session.version) !== expectedVersion) {
            throw new FaultlineValidationError('Session changed; reload and retry', 'FAULTLINE_VERSION_CONFLICT', 409);
          }
          const version = await loadFaultlineVersion({
            tenantId: tenant(request),
            challengeId: String(session.challengeId),
            versionNumber: Number(session.challengeVersionNumber),
          }, tx);
          if (!version) throw new FaultlineValidationError('Challenge version not found', 'FAULTLINE_NOT_FOUND', 404);
          if (!version.content.rootCauseOptions.some((item) => item.id === selectedRootCauseId)) {
            throw new FaultlineValidationError('Invalid root cause option', 'FAULTLINE_ROOT_CAUSE_INVALID', 422, 'selectedRootCauseId');
          }
          const chaos = session.chaosSettings as { intensity?: number; timeLimitSeconds?: number } | null;
          const elapsedSeconds = Math.max(
            0,
            Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000),
          );
          const score = scoreFaultlineSubmission(version.content, {
            selectedRootCauseId,
            evidenceIds,
            remediation,
            unlockedEvidenceIds: Array.isArray(session.unlockedEvidence)
              ? session.unlockedEvidence.map(String)
              : [],
            hintLevels: Array.isArray(session.hintsUsed) ? session.hintsUsed.map(Number) : [],
            actionCount: Number(session.actionCount),
            riskyActionCount: Number(session.riskyActionCount),
            elapsedSeconds,
            mode: session.mode as FaultlineSessionMode,
            chaosIntensity: chaos?.intensity,
            timeLimitSeconds: chaos?.timeLimitSeconds,
          });
          await tx.execute(sql`
            INSERT INTO faultlinelab_submissions (
              tenant_id, session_id, user_id, client_submission_id, hypothesis,
              selected_root_cause_id, evidence_ids, remediation, proof_note,
              score_breakdown, badges, passed
            ) VALUES (
              ${tenant(request)}, ${sessionId}, ${user(request)}, ${clientSubmissionId},
              ${hypothesis}, ${selectedRootCauseId}, ${JSON.stringify(evidenceIds)}::jsonb,
              ${remediation}, ${proofNote}, ${JSON.stringify(score)}::jsonb,
              ${JSON.stringify(score.badges)}::jsonb, ${score.passed}
            )
          `);
          await tx.execute(sql`
            UPDATE faultlinelab_sessions SET state='completed', score=${score.total},
              max_score=${score.maxPossible}, score_percentage=${score.percentage},
              tier=${score.tier}, passed=${score.passed}, completed_at=NOW(),
              last_activity_at=NOW(), version=version+1
            WHERE tenant_id=${tenant(request)} AND id=${sessionId}
              AND version=${expectedVersion}
          `);
          if (session.mode !== 'preview') {
            const previous = faultlineFirst(
              await tx.execute(sql`
                SELECT * FROM faultlinelab_user_challenge_progress
                WHERE tenant_id=${tenant(request)} AND user_id=${user(request)}
                  AND challenge_id=${session.challengeId}
                FOR UPDATE
              `),
            );
            const previousBest = previous?.bestScore === null || previous?.bestScore === undefined
              ? null
              : Number(previous.bestScore);
            const nextBest = previousBest === null ? score.total : Math.max(previousBest, score.total);
            const bestImprovement = previousBest === null
              ? score.total
              : Math.max(0, score.total - previousBest);
            const firstPass = score.passed && Number(previous?.passCount ?? 0) === 0;
            await tx.execute(sql`
              INSERT INTO faultlinelab_user_challenge_progress (
                tenant_id, user_id, challenge_id, attempt_count, pass_count,
                best_score, best_percentage, best_tier, first_passed_at,
                last_completed_at
              ) VALUES (
                ${tenant(request)}, ${user(request)}, ${session.challengeId}, 1,
                ${score.passed ? 1 : 0}, ${score.total}, ${score.percentage},
                ${score.tier}, ${score.passed ? new Date() : null}, NOW()
              )
              ON CONFLICT (tenant_id, user_id, challenge_id) DO UPDATE SET
                attempt_count=faultlinelab_user_challenge_progress.attempt_count+1,
                pass_count=faultlinelab_user_challenge_progress.pass_count+${score.passed ? 1 : 0},
                best_score=${nextBest},
                best_percentage=CASE WHEN ${score.total} > COALESCE(faultlinelab_user_challenge_progress.best_score,-1) THEN ${score.percentage} ELSE faultlinelab_user_challenge_progress.best_percentage END,
                best_tier=CASE WHEN ${score.total} > COALESCE(faultlinelab_user_challenge_progress.best_score,-1) THEN ${score.tier} ELSE faultlinelab_user_challenge_progress.best_tier END,
                first_passed_at=COALESCE(faultlinelab_user_challenge_progress.first_passed_at, ${score.passed ? new Date() : null}),
                last_completed_at=NOW(), version=faultlinelab_user_challenge_progress.version+1
            `);
            await tx.execute(sql`
              INSERT INTO faultlinelab_user_progress (
                tenant_id, user_id, attempts_completed, challenges_solved,
                total_best_score, current_streak, best_streak, last_outcome_at
              ) VALUES (
                ${tenant(request)}, ${user(request)}, 1, ${firstPass ? 1 : 0},
                ${score.total}, ${score.passed ? 1 : 0}, ${score.passed ? 1 : 0}, NOW()
              )
              ON CONFLICT (tenant_id, user_id) DO UPDATE SET
                attempts_completed=faultlinelab_user_progress.attempts_completed+1,
                challenges_solved=faultlinelab_user_progress.challenges_solved+${firstPass ? 1 : 0},
                total_best_score=faultlinelab_user_progress.total_best_score+${bestImprovement},
                current_streak=CASE WHEN ${score.passed} THEN faultlinelab_user_progress.current_streak+1 ELSE 0 END,
                best_streak=GREATEST(faultlinelab_user_progress.best_streak, CASE WHEN ${score.passed} THEN faultlinelab_user_progress.current_streak+1 ELSE 0 END),
                last_outcome_at=NOW(), updated_at=NOW(), version=faultlinelab_user_progress.version+1
            `);
            for (const badge of score.badges) {
              await tx.execute(sql`
                INSERT INTO faultlinelab_badge_awards (
                  tenant_id, user_id, badge_key, session_id
                ) VALUES (${tenant(request)}, ${user(request)}, ${badge}, ${sessionId})
                ON CONFLICT DO NOTHING
              `);
            }
            if (session.mode === 'daily') {
              await tx.execute(sql`
                INSERT INTO faultlinelab_daily_outcomes (
                  tenant_id, user_id, challenge_date, challenge_id, session_id,
                  passed, score
                ) VALUES (
                  ${tenant(request)}, ${user(request)}, ${faultlineUtcDate()}::date,
                  ${session.challengeId}, ${sessionId}, ${score.passed}, ${score.total}
                ) ON CONFLICT DO NOTHING
              `);
            }
            if (session.assignmentId) {
              await tx.execute(sql`
                UPDATE faultlinelab_assignments SET
                  status=${score.passed ? 'completed' : 'in_progress'},
                  completed_session_id=CASE WHEN ${score.passed} THEN ${sessionId} ELSE completed_session_id END,
                  completed_at=CASE WHEN ${score.passed} THEN NOW() ELSE completed_at END,
                  updated_at=NOW(), version=version+1
                WHERE tenant_id=${tenant(request)} AND id=${session.assignmentId}
                  AND assignee_user_id=${user(request)} AND status IN ('assigned','in_progress')
              `);
            }
          }
        });
        const bundle = await sessionBundle(request, sessionId);
        return bundle ?? notFound(reply, 'Session');
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.post(
    '/v1/modules/faultlinelab/sessions/:id/abandon',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const expectedVersion = faultlineExpectedVersion(body(request).expectedVersion);
        const id = param(request);
        const updated = faultlineFirst(
          await db.execute(sql`
            UPDATE faultlinelab_sessions SET state='abandoned', abandoned_at=NOW(),
              last_activity_at=NOW(), version=version+1
            WHERE tenant_id=${tenant(request)} AND id=${id} AND user_id=${user(request)}
              AND state='active' AND version=${expectedVersion}
            RETURNING *
          `),
        );
        if (!updated) {
          const exists = faultlineFirst(await db.execute(sql`
            SELECT id FROM faultlinelab_sessions
            WHERE tenant_id=${tenant(request)} AND id=${id} AND user_id=${user(request)}
          `));
          return exists
            ? reply.code(409).send({ error: 'Session changed or is closed', code: 'FAULTLINE_VERSION_CONFLICT' })
            : notFound(reply, 'Session');
        }
        return { session: updated };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.get(
    '/v1/modules/faultlinelab/progress',
    { preHandler: readGuards },
    async (request) => {
      const progress = faultlineFirst(
        await db.execute(sql`
          SELECT * FROM faultlinelab_user_progress
          WHERE tenant_id=${tenant(request)} AND user_id=${user(request)}
        `),
      ) ?? {
        tenantId: tenant(request),
        userId: user(request),
        attemptsCompleted: 0,
        challengesSolved: 0,
        totalBestScore: 0,
        currentStreak: 0,
        bestStreak: 0,
      };
      const [challengeProgress, badges, recentDaily] = await Promise.all([
        db.execute(sql`
          SELECT p.*, c.title, c.slug, c.category, c.difficulty
          FROM faultlinelab_user_challenge_progress p
          JOIN faultlinelab_challenges c
            ON c.tenant_id=p.tenant_id AND c.id=p.challenge_id
          WHERE p.tenant_id=${tenant(request)} AND p.user_id=${user(request)}
          ORDER BY p.last_completed_at DESC
        `),
        db.execute(sql`
          SELECT badge_key, session_id, awarded_at
          FROM faultlinelab_badge_awards
          WHERE tenant_id=${tenant(request)} AND user_id=${user(request)}
          ORDER BY awarded_at
        `),
        db.execute(sql`
          SELECT challenge_date, passed, score
          FROM faultlinelab_daily_outcomes
          WHERE tenant_id=${tenant(request)} AND user_id=${user(request)}
          ORDER BY challenge_date DESC LIMIT 400
        `),
      ]);
      let dailyStreak = 0;
      let expected = faultlineUtcDate();
      for (const row of recentDaily.rows as Array<Record<string, any>>) {
        const date = new Date(row.challenge_date ?? row.challengeDate).toISOString().slice(0, 10);
        if (date !== expected || row.passed !== true) break;
        dailyStreak += 1;
        const previous = new Date(`${expected}T00:00:00Z`);
        previous.setUTCDate(previous.getUTCDate() - 1);
        expected = previous.toISOString().slice(0, 10);
      }
      return {
        progress,
        challengeProgress: faultlineRows(challengeProgress),
        badges: faultlineRows(badges),
        dailyStreak,
      };
    },
  );

  app.get(
    '/v1/modules/faultlinelab/assignments',
    { preHandler: readGuards },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const all = query.scope === 'tenant' && canManage(request);
      const rows = faultlineRows(
        await db.execute(sql`
          SELECT a.*, c.title AS challenge_title, c.slug AS challenge_slug,
            c.category, c.difficulty, u.name AS assignee_name, u.email AS assignee_email
          FROM faultlinelab_assignments a
          JOIN faultlinelab_challenges c
            ON c.tenant_id=a.tenant_id AND c.id=a.challenge_id
          JOIN users u ON u.id=a.assignee_user_id
          WHERE a.tenant_id=${tenant(request)} AND a.archived_at IS NULL
            AND (${all} OR a.assignee_user_id=${user(request)})
          ORDER BY CASE WHEN a.status IN ('assigned','in_progress') THEN 0 ELSE 1 END,
            a.due_at NULLS LAST, a.created_at DESC
          LIMIT 300
        `),
      );
      return { assignments: rows, total: rows.length };
    },
  );

  app.get(
    '/v1/modules/faultlinelab/members',
    { preHandler: adminGuards },
    async (request) => {
      const members = faultlineRows(
        await db.execute(sql`
          SELECT u.id, u.name, u.email, tu.role
          FROM tenant_users tu
          JOIN users u ON u.id=tu.user_id
          WHERE tu.tenant_id=${tenant(request)}
          ORDER BY lower(u.name), lower(u.email)
          LIMIT 500
        `),
      );
      return { members, total: members.length };
    },
  );

  app.post(
    '/v1/modules/faultlinelab/assignments',
    { preHandler: adminGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const challengeId = faultlineId(input.challengeId, 'challengeId');
        const assigneeUserId = faultlineId(input.assigneeUserId, 'assigneeUserId');
        const challenge = await challengeRow(request, challengeId, true);
        if (!challenge || challenge.status !== 'published') {
          throw new FaultlineValidationError('Published challenge not found', 'FAULTLINE_NOT_FOUND', 404);
        }
        const membership = faultlineFirst(
          await db.execute(sql`
            SELECT id FROM tenant_users
            WHERE tenant_id=${tenant(request)} AND user_id=${assigneeUserId}
            LIMIT 1
          `),
        );
        if (!membership) return notFound(reply, 'Tenant member');
        const dueAt = input.dueAt
          ? new Date(faultlineText(input.dueAt, 'dueAt', 100, { required: true, singleLine: true })!)
          : null;
        if (dueAt && !Number.isFinite(dueAt.getTime())) {
          throw new FaultlineValidationError('dueAt must be an ISO date', 'FAULTLINE_DATE_INVALID', 400, 'dueAt');
        }
        const created = faultlineFirst(
          await db.execute(sql`
            INSERT INTO faultlinelab_assignments (
              tenant_id, challenge_id, challenge_version_number,
              assignee_user_id, assigned_by_user_id, title, instructions, due_at
            ) VALUES (
              ${tenant(request)}, ${challengeId}, ${challenge.publishedVersionNumber},
              ${assigneeUserId}, ${user(request)},
              ${faultlineText(input.title, 'title', 200, { singleLine: true })},
              ${faultlineText(input.instructions, 'instructions', 5000)}, ${dueAt}
            ) RETURNING *
          `),
        )!;
        await audit(request, 'faultlinelab_assignment_created', 'faultlinelab_assignment', created.id, {
          challengeId,
          assigneeUserId,
          dueAt: dueAt?.toISOString() ?? null,
        });
        return reply.code(201).send({ assignment: created });
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.patch(
    '/v1/modules/faultlinelab/assignments/:id',
    { preHandler: adminGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const id = param(request);
        const expectedVersion = faultlineExpectedVersion(input.expectedVersion);
        if (input.status !== 'canceled') {
          throw new FaultlineValidationError('Only cancellation is supported', 'FAULTLINE_ASSIGNMENT_TRANSITION_INVALID', 422, 'status');
        }
        const updated = faultlineFirst(
          await db.execute(sql`
            UPDATE faultlinelab_assignments SET status='canceled', canceled_at=NOW(),
              updated_at=NOW(), version=version+1
            WHERE tenant_id=${tenant(request)} AND id=${id}
              AND status IN ('assigned','in_progress') AND version=${expectedVersion}
              AND archived_at IS NULL
            RETURNING *
          `),
        );
        if (!updated) {
          const exists = faultlineFirst(await db.execute(sql`
            SELECT id FROM faultlinelab_assignments
            WHERE tenant_id=${tenant(request)} AND id=${id} AND archived_at IS NULL
          `));
          return exists
            ? reply.code(409).send({ error: 'Assignment changed or cannot be canceled', code: 'FAULTLINE_VERSION_CONFLICT' })
            : notFound(reply, 'Assignment');
        }
        await audit(request, 'faultlinelab_assignment_canceled', 'faultlinelab_assignment', id, {
          version: updated.version,
        });
        return { assignment: updated };
      } catch (error) {
        if (handleFaultlineError(reply, error)) return;
        throw error;
      }
    },
  );

  app.get(
    '/v1/modules/faultlinelab/analytics',
    { preHandler: adminGuards },
    async (request) => {
      const [summary, challenges, daily] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS completed_attempts,
            COUNT(*) FILTER (WHERE passed)::int AS passed_attempts,
            COALESCE(ROUND(AVG(score_percentage)),0)::int AS average_percentage,
            COALESCE(ROUND(AVG(action_count)),0)::int AS average_actions,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (completed_at-started_at)))),0)::int AS average_seconds
          FROM faultlinelab_sessions
          WHERE tenant_id=${tenant(request)} AND state='completed' AND mode<>'preview'
        `),
        db.execute(sql`
          SELECT c.id, c.title, c.slug, COUNT(s.id)::int AS attempts,
            COUNT(s.id) FILTER (WHERE s.passed)::int AS passes,
            COALESCE(ROUND(AVG(s.score_percentage)),0)::int AS average_percentage,
            COALESCE(ROUND(AVG(jsonb_array_length(s.hints_used))),0)::int AS average_hints
          FROM faultlinelab_challenges c
          LEFT JOIN faultlinelab_sessions s
            ON s.tenant_id=c.tenant_id AND s.challenge_id=c.id
            AND s.state='completed' AND s.mode<>'preview'
          WHERE c.tenant_id=${tenant(request)} AND c.archived_at IS NULL
          GROUP BY c.id, c.title, c.slug ORDER BY attempts DESC, c.title
        `),
        db.execute(sql`
          SELECT challenge_date, COUNT(*)::int AS attempts,
            COUNT(*) FILTER (WHERE passed)::int AS passes
          FROM faultlinelab_daily_outcomes
          WHERE tenant_id=${tenant(request)}
          GROUP BY challenge_date ORDER BY challenge_date DESC LIMIT 90
        `),
      ]);
      return {
        summary: faultlineFirst(summary),
        challenges: faultlineRows(challenges),
        daily: faultlineRows(daily),
      };
    },
  );

  app.get(
    '/v1/modules/faultlinelab/exports/attempts.csv',
    { preHandler: readGuards },
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const tenantScope = query.scope === 'tenant' && canManage(request);
      const rows = faultlineRows(
        await db.execute(sql`
          SELECT s.id, s.user_id, c.slug, c.title, s.mode, s.state, s.score,
            s.max_score, s.score_percentage, s.tier, s.passed, s.started_at,
            s.completed_at
          FROM faultlinelab_sessions s
          JOIN faultlinelab_challenges c
            ON c.tenant_id=s.tenant_id AND c.id=s.challenge_id
          WHERE s.tenant_id=${tenant(request)} AND s.state='completed'
            AND s.mode<>'preview' AND (${tenantScope} OR s.user_id=${user(request)})
          ORDER BY s.completed_at DESC LIMIT 5000
        `),
      );
      const headers = [
        'sessionId', 'userId', 'challengeSlug', 'challengeTitle', 'mode', 'score',
        'maxScore', 'scorePercentage', 'tier', 'passed', 'startedAt', 'completedAt',
      ];
      const lines = [headers.join(',')];
      for (const row of rows) {
        lines.push([
          row.id, row.userId, row.slug, row.title, row.mode, row.score,
          row.maxScore, row.scorePercentage, row.tier, row.passed,
          row.startedAt instanceof Date ? row.startedAt.toISOString() : row.startedAt,
          row.completedAt instanceof Date ? row.completedAt.toISOString() : row.completedAt,
        ].map(faultlineCsvCell).join(','));
      }
      reply.type('text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="faultlinelab-attempts.csv"');
      return lines.join('\r\n');
    },
  );

  async function attachmentTarget(request: FastifyRequest, kind: 'challenge' | 'session') {
    const id = param(request);
    if (kind === 'challenge') {
      const challenge = await challengeRow(request, id, true);
      return challenge
        ? { id, storageType: 'faultlinelab_challenge', writable: canManage(request) || challenge.ownerUserId === user(request) }
        : null;
    }
    const session = faultlineFirst(
      await db.execute(sql`
        SELECT id, user_id FROM faultlinelab_sessions
        WHERE tenant_id=${tenant(request)} AND id=${id}
          AND (${canManage(request)} OR user_id=${user(request)})
        LIMIT 1
      `),
    );
    return session
      ? { id, storageType: 'faultlinelab_session', writable: session.userId === user(request) }
      : null;
  }

  for (const targetKind of ['challenge', 'session'] as const) {
    const base = targetKind === 'challenge'
      ? '/v1/modules/faultlinelab/authoring/challenges/:id/attachments'
      : '/v1/modules/faultlinelab/sessions/:id/attachments';
    app.get(base, { preHandler: readGuards }, async (request, reply) => {
      const target = await attachmentTarget(request, targetKind);
      if (!target) return notFound(reply, targetKind);
      const attachments = await listAttachments({
        tenantId: tenant(request),
        moduleId: await faultlineModuleId(),
        objectType: target.storageType,
        objectId: target.id,
        limit: 100,
      });
      return { attachments: attachments.map(faultlineCamelRow) };
    });
    app.post(
      base,
      { preHandler: writeGuards, bodyLimit: attachmentBodyLimit },
      async (request, reply) => {
        try {
          const target = await attachmentTarget(request, targetKind);
          if (!target) return notFound(reply, targetKind);
          if (!target.writable) {
            return reply.code(403).send({
              error: 'Attachment write access required',
              code: 'FAULTLINE_ATTACHMENT_WRITE_DENIED',
            });
          }
          const input = body(request);
          const encoded = faultlineText(input.contentBase64, 'contentBase64', 35_000_000, {
            required: true,
            min: 4,
          })!;
          const attachment = await createAttachment({
            tenantId: tenant(request),
            moduleId: await faultlineModuleId(),
            objectType: target.storageType,
            objectId: target.id,
            originalName: faultlineText(input.originalName, 'originalName', 240, {
              required: true,
              min: 1,
              singleLine: true,
            })!,
            declaredMimeType: faultlineText(input.declaredMimeType, 'declaredMimeType', 120, {
              singleLine: true,
            }),
            content: Buffer.from(encoded, 'base64'),
            createdByUserId: user(request),
            correlationId: request.id,
          });
          return reply.code(201).send({ attachment: faultlineCamelRow(attachment) });
        } catch (error) {
          if (handleFaultlineError(reply, error)) return;
          const attachmentError = error as { code?: string; message?: string };
          if (attachmentError.code?.startsWith('ATTACHMENT_')) {
            return reply.code(422).send({
              error: attachmentError.message,
              code: attachmentError.code,
            });
          }
          throw error;
        }
      },
    );
  }
}
