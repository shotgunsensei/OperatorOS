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

export async function ensureFaultlineStarterContent(
  tenantId: string,
  actorUserId: string,
  executor: Executor = db,
): Promise<void> {
  for (const starter of FAULTLINELAB_STARTER_CHALLENGES) {
    const challengeId = faultlineStableUuid(
      `faultlinelab:${tenantId}:starter:${starter.sourceId}`,
    );
    const versionId = faultlineStableUuid(`${challengeId}:version:1`);
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
    await executor.execute(sql`
      INSERT INTO faultlinelab_challenge_versions (
        id, tenant_id, challenge_id, version_number, content, content_sha256,
        validation, change_note, created_by_user_id
      )
      SELECT ${versionId}, ${tenantId}, ${challengeId}, 1,
        ${JSON.stringify(starter.content)}::jsonb, ${starter.contentHash},
        ${JSON.stringify({ valid: true, errors: [], warnings: [] })}::jsonb,
        'Pinned starter content imported from the approved source snapshot',
        ${actorUserId}
      WHERE EXISTS (
        SELECT 1 FROM faultlinelab_challenges
        WHERE tenant_id=${tenantId} AND id=${challengeId}
      )
      ON CONFLICT DO NOTHING
    `);
    await executor.execute(sql`
      INSERT INTO faultlinelab_migration_refs (
        id, tenant_id, source_commit, source_type, source_id, target_type,
        target_id, source_fingerprint
      )
      SELECT ${migrationId}, ${tenantId}, ${FAULTLINELAB_SOURCE_COMMIT},
        'starter_challenge', ${starter.sourceId}, 'challenge', ${challengeId},
        ${starter.contentHash}
      WHERE EXISTS (
        SELECT 1 FROM faultlinelab_challenges
        WHERE tenant_id=${tenantId} AND id=${challengeId}
      )
      ON CONFLICT DO NOTHING
    `);
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
