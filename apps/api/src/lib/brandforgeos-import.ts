import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepositoryRoot } from './repository-root.js';

export const BRANDFORGEOS_SOURCE_COMMIT = '5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e';
export const BRANDFORGEOS_SOURCE_MANIFEST_SHA256 = 'a9870113010225951faead6c74afbc4b3f15c7a2e643cd7c0459ed9920689298';

const repoRoot = resolveRepositoryRoot();
const sourceRoot = resolve(repoRoot, 'apps/modules/brandforgeos/source');
const evidenceFiles = [
  ['lib/db/src/schema/brands.ts', '93cefd2242f779de4d8e74c0fc16d4c78f5b2446b23febd786697c67f63b1d96'],
  ['lib/db/src/schema/personas.ts', 'f8c0faa89b5cdfff80573ee6b09c51d4fb2493c1c5945a52f3ba0933874d3a9c'],
  ['lib/db/src/schema/campaigns.ts', '91ecfe809b7dc76833eb505f39701fde614539a921c65e2423bec556e2aac16f'],
  ['lib/db/src/schema/copyAssets.ts', 'a58b6857ab1bc38adc0ab2ee28011820f8f3b6089497e45e1cff0887ce014a3e'],
  ['lib/db/src/schema/calendarItems.ts', 'd72370d17dd94c65676e89b8001340ce9b46e19f63c4300be48e1e1506270544'],
  ['artifacts/api-server/src/routes/ai.ts', '12e1b888953f2233fe0bf386ce408cc740a83e203cea2098bbed1bbccff5168e'],
  ['artifacts/api-server/src/routes/dashboard.ts', 'dd6f86afa2165aed57e9cc1f652d6e6e81b33c63c3879bfb091e4a42c7bc5c71'],
] as const;

function hash(bytes: string | Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface BrandForgeOsImportPlan {
  planVersion: 1;
  mode: 'dry-run';
  sourceCommit: string;
  sourceManifestHash: string;
  sourceFileCount: number;
  trackedFileCount: number;
  totalBytes: number;
  evidenceFiles: Array<{ path: string; expectedHash: string; actualHash: string; exact: boolean }>;
  mappings: Array<{
    sourceSurface: string;
    disposition: 'operatoros-native' | 'operatoros-owned' | 'excluded';
    target: string;
    reason: string;
  }>;
  reconciliation: {
    standaloneRowsAvailable: 0;
    identityRecordsImported: 0;
    tenantRecordsImported: 0;
    billingRecordsImported: 0;
    providerCredentialsImported: 0;
    standaloneDataApplyRequired: false;
  };
  errors: string[];
  warnings: string[];
  ready: boolean;
  applySupported: false;
}

export function planBrandForgeOsImport(): BrandForgeOsImportPlan {
  const manifestBytes = readFileSync(resolve(sourceRoot, 'SOURCE_SNAPSHOT.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
    sourceCommit?: string;
    fileCount?: number;
    trackedFileCount?: number;
    totalBytes?: number;
  };
  const errors: string[] = [];
  const sourceManifestHash = hash(manifestBytes);
  if (manifest.sourceCommit !== BRANDFORGEOS_SOURCE_COMMIT) {
    errors.push('Pinned source commit does not match the Phase 11A authority');
  }
  if (sourceManifestHash !== BRANDFORGEOS_SOURCE_MANIFEST_SHA256) {
    errors.push('Source snapshot manifest hash does not match the reviewed Phase 11A snapshot');
  }
  const verifiedFiles = evidenceFiles.map(([path, expectedHash]) => {
    const actualHash = hash(readFileSync(resolve(sourceRoot, path)));
    if (actualHash !== expectedHash) errors.push(`Source evidence file differs from the reviewed snapshot: ${path}`);
    return { path, expectedHash, actualHash, exact: actualHash === expectedHash };
  });

  return {
    planVersion: 1,
    mode: 'dry-run',
    sourceCommit: BRANDFORGEOS_SOURCE_COMMIT,
    sourceManifestHash,
    sourceFileCount: Number(manifest.fileCount ?? 0),
    trackedFileCount: Number(manifest.trackedFileCount ?? 0),
    totalBytes: Number(manifest.totalBytes ?? 0),
    evidenceFiles: verifiedFiles,
    mappings: [
      { sourceSurface: 'brands, personas, campaigns, copy assets, calendar', disposition: 'operatoros-native', target: '/v1/modules/brandforgeos/*', reason: 'Durable tenant-scoped creative workspace with validated references and optimistic concurrency.' },
      { sourceSurface: 'AI copy, strategy, campaign ideas', disposition: 'operatoros-native', target: '/v1/modules/brandforgeos/generations', reason: 'OperatorOS provider, idempotency, rate limits, usage ledger and redacted activity replace child credit mutation.' },
      { sourceSurface: 'auth, tenants, memberships, plans, billing, credits, admin', disposition: 'operatoros-owned', target: 'OperatorOS platform authority', reason: 'Child identity and commercial control cannot coexist with OperatorOS authority.' },
      { sourceSurface: 'dashboard analytics', disposition: 'operatoros-native', target: '/v1/modules/brandforgeos/dashboard', reason: 'Only persisted counts and recorded campaign metrics are returned.' },
      { sourceSurface: 'random analytics and integration sync counters', disposition: 'excluded', target: 'disabled', reason: 'Simulated counters cannot be represented as product functionality.' },
      { sourceSurface: 'template marketplace purchasing', disposition: 'excluded', target: 'disabled', reason: 'The source combines templates with child billing and has no approved OperatorOS commerce contract.' },
      { sourceSurface: 'child runtime and migrations', disposition: 'excluded', target: 'read-only source evidence', reason: 'Only the ordered OperatorOS database release and shared runtime may execute.' },
    ],
    reconciliation: {
      standaloneRowsAvailable: 0,
      identityRecordsImported: 0,
      tenantRecordsImported: 0,
      billingRecordsImported: 0,
      providerCredentialsImported: 0,
      standaloneDataApplyRequired: false,
    },
    errors,
    warnings: [
      'No authorized frozen standalone database export or immutable tenant/user mapping was supplied.',
      'This deterministic dry run performs no database writes and exposes no apply mode.',
      'A future data apply requires backup, mapping, duplicate policy, reconciliation and separate owner approval.',
    ],
    ready: errors.length === 0,
    applySupported: false,
  };
}
