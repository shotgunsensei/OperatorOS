import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepositoryRoot } from './repository-root.js';

export const NINJA_POOL_HALL_SOURCE_COMMIT = '62439c4018ec551ce2891800351200c8ab2cb9e7';

const repoRoot = resolveRepositoryRoot();
const sourceRoot = resolve(repoRoot, 'apps/modules/ninja-pool-hall/source');
const promotedRoot = resolve(repoRoot, 'apps/web/src/lib/ninja-pool-hall');
const promotedFiles = ['physics.ts', 'types.ts', 'rules.ts', 'bot.ts', 'audio.ts'] as const;

function hash(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface NinjaPoolHallImportPlan {
  planVersion: 1;
  mode: 'dry-run';
  sourceCommit: string;
  sourceManifestHash: string;
  sourceFileCount: number;
  promotedEngineFiles: Array<{ path: string; sourceHash: string; targetHash: string; exact: boolean }>;
  mappings: Array<{
    sourceSurface: string;
    disposition: 'promoted' | 'operatoros-owned' | 'excluded';
    target: string;
    reason: string;
  }>;
  reconciliation: {
    profileRowsAvailable: 0;
    preferenceRowsAvailable: 0;
    achievementRowsAvailable: 0;
    historicalSummaryRowsAvailable: 0;
    identityRecordsImported: 0;
    billingRecordsImported: 0;
    standaloneDataApplyRequired: false;
  };
  errors: string[];
  warnings: string[];
  ready: boolean;
  applySupported: false;
}

export function planNinjaPoolHallImport(): NinjaPoolHallImportPlan {
  const manifestBytes = readFileSync(resolve(sourceRoot, 'SOURCE_SNAPSHOT.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
    sourceCommit?: string;
    fileCount?: number;
  };
  const errors: string[] = [];
  if (manifest.sourceCommit !== NINJA_POOL_HALL_SOURCE_COMMIT) {
    errors.push('Pinned source commit does not match the Phase 10B authority');
  }
  const engine = promotedFiles.map((file) => {
    const source = readFileSync(resolve(sourceRoot, 'artifacts/pool/src/lib', file));
    const target = readFileSync(resolve(promotedRoot, file));
    const sourceHash = hash(source);
    const targetHash = hash(target);
    if (sourceHash !== targetHash && file !== 'bot.ts') errors.push(`Promoted engine file differs from source: ${file}`);
    return { path: file, sourceHash, targetHash, exact: sourceHash === targetHash };
  });

  return {
    planVersion: 1,
    mode: 'dry-run',
    sourceCommit: NINJA_POOL_HALL_SOURCE_COMMIT,
    sourceManifestHash: hash(manifestBytes),
    sourceFileCount: Number(manifest.fileCount ?? 0),
    promotedEngineFiles: engine,
    mappings: [
      { sourceSurface: '/practice free-shoot', disposition: 'promoted', target: '/practice', reason: 'Deterministic physics with bounded personal rack summaries.' },
      { sourceSurface: '/practice CPU', disposition: 'promoted', target: '/cpu', reason: 'Source bot and 8-ball rules with OperatorOS match persistence.' },
      { sourceSurface: '/local', disposition: 'promoted', target: '/local', reason: 'Same-device two-player with server-applied logical results.' },
      { sourceSurface: 'localStorage settings', disposition: 'operatoros-owned', target: '/profile', reason: 'Tenant/user profile preferences replace browser-only settings.' },
      { sourceSurface: '/host and /join', disposition: 'operatoros-owned', target: '/host, /join, /rooms/:id', reason: 'Phase 30 restores the source outcome through tenant-bound WebSockets, durable room snapshots, host-visible simulation, and independent server re-simulation.' },
      { sourceSurface: 'localStorage clientId', disposition: 'excluded', target: 'none', reason: 'OperatorOS session identity replaces browser-generated player authority.' },
      { sourceSurface: 'standalone Express/CORS server', disposition: 'excluded', target: 'shared Fastify runtime', reason: 'Child auth, routing, health, and CORS authority cannot be activated.' },
    ],
    reconciliation: {
      profileRowsAvailable: 0,
      preferenceRowsAvailable: 0,
      achievementRowsAvailable: 0,
      historicalSummaryRowsAvailable: 0,
      identityRecordsImported: 0,
      billingRecordsImported: 0,
      standaloneDataApplyRequired: false,
    },
    errors,
    warnings: [
      'The source contains no database-backed profile, preference, achievement, progression, leaderboard, or historical result rows to import.',
      'Browser localStorage values are device-local and are not imported as trusted identity or shared data.',
      'This dry run is deterministic and read-only; profile and match tables initialize through the ordered OperatorOS database release.',
      'Phase 30 intentionally extends the source bot with an injectable seeded random function so CPU rack fixtures and replay behavior are deterministic.',
    ],
    ready: errors.length === 0,
    applySupported: false,
  };
}
