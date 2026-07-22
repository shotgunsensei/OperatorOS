import { createHash } from 'node:crypto';
import { faultlineContentHash } from './faultlinelab-domain.js';
import {
  FAULTLINELAB_SOURCE_COMMIT,
  FAULTLINELAB_STARTER_CHALLENGES,
  faultlineStarterManifest,
} from './faultlinelab-starter-content.js';

const PLANNED_CATALOG_ONLY_ENTRIES = 52;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

export interface FaultlineLabImportPlan {
  planVersion: 1;
  mode: 'dry-run';
  sourceCommit: string;
  sourceManifestHash: string;
  playableSourceCount: number;
  plannedCatalogOnlyCount: number;
  plannedTargetCounts: Record<string, number>;
  mappings: Array<{
    sourceId: string;
    sourceSlug: string;
    targetType: 'faultlinelab_challenge';
    contentHash: string;
  }>;
  reconciliation: {
    uniqueSourceIds: number;
    uniqueSlugs: number;
    contentHashesVerified: number;
    authorityRecordsImported: 0;
    billingRecordsImported: 0;
    plannedCatalogEntriesImported: 0;
    standaloneDataApplyRequired: false;
  };
  warnings: string[];
  errors: string[];
  readyToInitialize: boolean;
  applySupported: false;
}

export function planFaultlineLabImport(): FaultlineLabImportPlan {
  const errors: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  let contentHashesVerified = 0;

  for (const challenge of FAULTLINELAB_STARTER_CHALLENGES) {
    if (ids.has(challenge.sourceId)) errors.push(`Duplicate source id ${challenge.sourceId}`);
    if (slugs.has(challenge.slug)) errors.push(`Duplicate source slug ${challenge.slug}`);
    ids.add(challenge.sourceId);
    slugs.add(challenge.slug);
    const actualHash = faultlineContentHash(challenge.content);
    if (actualHash !== challenge.contentHash) {
      errors.push(`Content hash mismatch for ${challenge.sourceId}`);
    } else {
      contentHashesVerified += 1;
    }
  }

  const manifest = faultlineStarterManifest();
  if (manifest.sourceCommit !== FAULTLINELAB_SOURCE_COMMIT) {
    errors.push('Starter manifest source commit does not match the pinned source commit');
  }

  return {
    planVersion: 1,
    mode: 'dry-run',
    sourceCommit: FAULTLINELAB_SOURCE_COMMIT,
    sourceManifestHash: hash(manifest),
    playableSourceCount: FAULTLINELAB_STARTER_CHALLENGES.length,
    plannedCatalogOnlyCount: PLANNED_CATALOG_ONLY_ENTRIES,
    plannedTargetCounts: {
      faultlinelab_challenges: FAULTLINELAB_STARTER_CHALLENGES.length,
      faultlinelab_challenge_versions: FAULTLINELAB_STARTER_CHALLENGES.length,
      faultlinelab_migration_refs: FAULTLINELAB_STARTER_CHALLENGES.length,
    },
    mappings: FAULTLINELAB_STARTER_CHALLENGES.map((challenge) => ({
      sourceId: challenge.sourceId,
      sourceSlug: challenge.slug,
      targetType: 'faultlinelab_challenge' as const,
      contentHash: challenge.contentHash,
    })),
    reconciliation: {
      uniqueSourceIds: ids.size,
      uniqueSlugs: slugs.size,
      contentHashesVerified,
      authorityRecordsImported: 0,
      billingRecordsImported: 0,
      plannedCatalogEntriesImported: 0,
      standaloneDataApplyRequired: false,
    },
    warnings: [
      'Only the four validated runnable source cases are initialized; planned catalog cards remain non-playable evidence.',
      'Standalone identity, sessions, roles, subscriptions, billing, profile JSON, and child migrations are excluded.',
      'Initialization is idempotent and tenant-scoped; this dry run never writes to a database.',
    ],
    errors,
    readyToInitialize: errors.length === 0,
    applySupported: false,
  };
}
