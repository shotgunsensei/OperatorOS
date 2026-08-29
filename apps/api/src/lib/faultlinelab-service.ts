import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  parseFaultlineChallengeContent,
  safeFaultlineChallenge,
  type FaultlineChallengeContent,
} from './faultlinelab-domain.js';
import {
  FAULTLINELAB_SOURCE_COMMIT,
  FAULTLINELAB_STARTER_CHALLENGES,
} from './faultlinelab-starter-content.js';

type Executor = Pick<typeof db, 'execute'>;

export function faultlineStableUuid(value: string): string {
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = ((Number.parseInt(hash[16]!, 16) & 0x3) | 0x8).toString(16);
  const joined = hash.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

export function faultlineCamelKey(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function faultlineCamelRow(row: unknown): Record<string, any> {
  if (!row || typeof row !== 'object') return {};
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => [
      faultlineCamelKey(key),
      value,
    ]),
  );
}

export function faultlineRows(result: { rows: unknown[] }): Array<Record<string, any>> {
  return result.rows.map(faultlineCamelRow);
}

export function faultlineFirst(result: { rows: unknown[] }): Record<string, any> | null {
  return result.rows[0] ? faultlineCamelRow(result.rows[0]) : null;
}

async function faultlineStarterContentIsCurrent(
  tenantId: string,
  executor: Executor,
): Promise<boolean> {
  const result = await executor.execute(sql`
    SELECT COUNT(DISTINCT m.source_id)::int AS current_count
    FROM faultlinelab_migration_refs m
    JOIN faultlinelab_challenges c
      ON c.tenant_id=m.tenant_id AND c.id=m.target_id
    JOIN faultlinelab_challenge_versions v
      ON v.tenant_id=c.tenant_id AND v.challenge_id=c.id
      AND v.version_number=c.current_version_number
    WHERE m.tenant_id=${tenantId}
      AND m.source_commit=${FAULTLINELAB_SOURCE_COMMIT}
      AND m.source_type='starter_challenge'
      AND m.target_type='challenge'
      AND c.scope='tenant' AND c.status='published' AND c.archived_at IS NULL
  `);
  return Number(result.rows[0]?.current_count ?? 0) === FAULTLINELAB_STARTER_CHALLENGES.length;
}

async function reconcileFaultlineStarterContent(
  tenantId: string,
  actorUserId: string,
  executor: Executor,
): Promise<void> {
  for (const starter of FAULTLINELAB_STARTER_CHALLENGES) {
    const challengeId = faultlineStableUuid(
      `faultlinelab:${tenantId}:starter:${starter.sourceId}`,
    );
    const versionId = faultlineStableUuid(`${challengeId}:content:${starter.contentHash}`);
    const migrationId = faultlineStableUuid(
      `faultlinelab:${tenantId}:migration:${starter.sourceId}`,
    );
    await executor.execute(sql`
      INSERT INTO faultlinelab_challenges (
        id, tenant_id, owner_user_id, scope, slug, title, category, difficulty,
        status, current_version_number, published_version_number,
        created_by_user_id, updated_by_user_id, published_at
      ) VALUES (
        ${challengeId}, ${tenantId}, ${actorUserId}, 'tenant', ${starter.slug},
        ${starter.title}, ${starter.category}, ${starter.difficulty}, 'published',
        1, 1, ${actorUserId}, ${actorUserId}, NOW()
      )
      ON CONFLICT DO NOTHING
    `);
    const existingVersion = await executor.execute(sql`
      SELECT version_number
      FROM faultlinelab_challenge_versions
      WHERE tenant_id=${tenantId} AND challenge_id=${challengeId} AND content_sha256=${starter.contentHash}
      LIMIT 1
    `);
    let versionNumber = Number(existingVersion.rows[0]?.version_number ?? 0);
    if (!versionNumber) {
      const nextVersion = await executor.execute(sql`
        SELECT COALESCE(MAX(version_number), 0)::int + 1 AS version_number
        FROM faultlinelab_challenge_versions
        WHERE tenant_id=${tenantId} AND challenge_id=${challengeId}
      `);
      versionNumber = Number(nextVersion.rows[0]?.version_number ?? 1);
      await executor.execute(sql`
      INSERT INTO faultlinelab_challenge_versions (
        id, tenant_id, challenge_id, version_number, content, content_sha256,
        validation, change_note, created_by_user_id
      )
      SELECT ${versionId}, ${tenantId}, ${challengeId}, ${versionNumber},
        ${JSON.stringify(starter.content)}::jsonb, ${starter.contentHash},
        ${JSON.stringify({ valid: true, errors: [], warnings: [] })}::jsonb,
        'Compiled from the pinned source allCases export',
        ${actorUserId}
      WHERE EXISTS (
        SELECT 1 FROM faultlinelab_challenges
        WHERE tenant_id=${tenantId} AND id=${challengeId}
      )
      ON CONFLICT DO NOTHING
    `);
      const resolved = await executor.execute(sql`
        SELECT version_number
        FROM faultlinelab_challenge_versions
        WHERE tenant_id=${tenantId} AND challenge_id=${challengeId} AND content_sha256=${starter.contentHash}
        LIMIT 1
      `);
      versionNumber = Number(resolved.rows[0]?.version_number ?? versionNumber);
    }
    await executor.execute(sql`
      UPDATE faultlinelab_challenges
      SET slug=${starter.slug}, title=${starter.title}, category=${starter.category}, difficulty=${starter.difficulty},
        status='published', current_version_number=${versionNumber}, published_version_number=${versionNumber},
        updated_by_user_id=${actorUserId}, updated_at=NOW(), published_at=COALESCE(published_at, NOW()),
        retired_at=NULL, archived_at=NULL,
        version=CASE WHEN current_version_number=${versionNumber} AND slug=${starter.slug} AND title=${starter.title}
          THEN version ELSE version + 1 END
      WHERE tenant_id=${tenantId} AND id=${challengeId}
    `);
    await executor.execute(sql`
      INSERT INTO faultlinelab_migration_refs (
        id, tenant_id, source_commit, source_type, source_id, target_type,
        target_id, source_fingerprint
      )
      SELECT ${migrationId}, ${tenantId}, ${FAULTLINELAB_SOURCE_COMMIT},
        'starter_challenge', ${starter.sourceId}, 'challenge', ${challengeId},
        ${starter.sourceHash}
      WHERE EXISTS (
        SELECT 1 FROM faultlinelab_challenges
        WHERE tenant_id=${tenantId} AND id=${challengeId}
      )
      ON CONFLICT (tenant_id, source_type, source_id) DO UPDATE SET
        source_commit=EXCLUDED.source_commit, target_id=EXCLUDED.target_id,
        source_fingerprint=EXCLUDED.source_fingerprint, imported_at=NOW()
    `);
  }
}

const activeStarterReconciliations = new Map<string, Promise<void>>();

export async function ensureFaultlineStarterContent(
  tenantId: string,
  actorUserId: string,
): Promise<void> {
  const active = activeStarterReconciliations.get(tenantId);
  if (active) return active;

  const reconciliation = db.transaction(async (tx) => {
    // The workspace loads the catalog and daily challenge in parallel.
    // Deduplicate inside this process and serialize across API replicas so
    // fresh-tenant reads cannot race through hundreds of per-case upserts.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`operatoros:faultlinelab:starter:${tenantId}`}, 0::bigint)
      )
    `);
    if (await faultlineStarterContentIsCurrent(tenantId, tx)) return;
    await reconcileFaultlineStarterContent(tenantId, actorUserId, tx);
    if (!(await faultlineStarterContentIsCurrent(tenantId, tx))) {
      throw new Error('FaultlineLab starter catalog reconciliation did not complete');
    }
  });
  activeStarterReconciliations.set(tenantId, reconciliation);
  try {
    await reconciliation;
  } finally {
    if (activeStarterReconciliations.get(tenantId) === reconciliation) {
      activeStarterReconciliations.delete(tenantId);
    }
  }
}

export async function loadFaultlineVersion(
  input: { tenantId: string; challengeId: string; versionNumber: number },
  executor: Executor = db,
): Promise<{
  id: string;
  challengeId: string;
  versionNumber: number;
  content: FaultlineChallengeContent;
  contentSha256: string;
} | null> {
  const result = await executor.execute(sql`
    SELECT id, challenge_id, version_number, content, content_sha256
    FROM faultlinelab_challenge_versions
    WHERE tenant_id=${input.tenantId}
      AND challenge_id=${input.challengeId}
      AND version_number=${input.versionNumber}
    LIMIT 1
  `);
  const row = faultlineFirst(result);
  if (!row) return null;
  const value = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
  return {
    id: String(row.id),
    challengeId: String(row.challengeId),
    versionNumber: Number(row.versionNumber),
    content: parseFaultlineChallengeContent(value),
    contentSha256: String(row.contentSha256),
  };
}

export function publicFaultlineSession(
  sessionRow: Record<string, any>,
  content: FaultlineChallengeContent,
  actions: Array<Record<string, any>> = [],
  submission: Record<string, any> | null = null,
) {
  const unlocked = new Set<string>(
    Array.isArray(sessionRow.unlockedEvidence) ? sessionRow.unlockedEvidence.map(String) : [],
  );
  const completed = sessionRow.state === 'completed';
  return {
    session: {
      ...sessionRow,
      unlockedEvidence: [...unlocked],
      hintsUsed: Array.isArray(sessionRow.hintsUsed) ? sessionRow.hintsUsed : [],
      chaosSettings:
        typeof sessionRow.chaosSettings === 'string'
          ? JSON.parse(sessionRow.chaosSettings)
          : sessionRow.chaosSettings,
    },
    challenge: safeFaultlineChallenge(content),
    evidence: content.evidence
      .filter((item) => unlocked.has(item.id))
      .map((item) => ({ ...item })),
    actions,
    submission,
    ...(completed
      ? {
          debrief: {
            rootCause: content.rootCause,
            cluesThatMattered: content.evidence.filter(
              (item) => item.category === 'clue' && item.importance !== 'low',
            ),
            misleadingClues: content.redHerrings,
            remediation: content.remediation,
            preventativeMeasures: content.preventativeMeasures,
          },
        }
      : {}),
  };
}

let cachedModuleId: string | null = null;
export async function faultlineModuleId(): Promise<string> {
  if (cachedModuleId) return cachedModuleId;
  const result = await db.execute(sql`SELECT id FROM modules WHERE slug='faultlinelab' LIMIT 1`);
  const id = result.rows[0]?.id;
  if (!id) throw new Error('FaultlineLab module registry row is unavailable');
  cachedModuleId = String(id);
  return cachedModuleId;
}

export function faultlineUtcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function pickFaultlineDailyChallenge<T extends { id: string }>(
  challenges: readonly T[],
  tenantId: string,
  dateKey: string,
): T | null {
  if (challenges.length === 0) return null;
  const sorted = [...challenges].sort((left, right) => left.id.localeCompare(right.id));
  const digest = createHash('sha256').update(`${tenantId}:${dateKey}`).digest();
  return sorted[digest.readUInt32BE(0) % sorted.length] ?? null;
}

export function faultlineCsvCell(value: unknown): string {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(stringValue)
    ? `"${stringValue.replaceAll('"', '""')}"`
    : stringValue;
}
