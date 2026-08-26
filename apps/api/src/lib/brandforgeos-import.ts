import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepositoryRoot } from './repository-root.js';

export const BRANDFORGEOS_SOURCE_COMMIT = '5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e';
export const BRANDFORGEOS_SOURCE_MANIFEST_SHA256 = '2125d8ced0a7486b4f90467c4e60ada98b462b1db099f3405e46d46cb2dfd956';

const repoRoot = resolveRepositoryRoot();
const sourceRoot = resolve(repoRoot, 'apps/modules/brandforgeos/source');
const evidenceFiles = [
  ['lib/db/src/schema/brands.ts', '2234fd0132c3c5f8da56a21e3569f3df90f444019eac0a1f47b68f4a639f9486'],
  ['lib/db/src/schema/personas.ts', '94b87ecceaf96a578281a0b0b564d229c0392a705372b6ee2aa793d6e09c8327'],
  ['lib/db/src/schema/campaigns.ts', '9d2785a6b53e901f7db9f40f6802d87db70674e75e1b7d54887a6a65a7feb336'],
  ['lib/db/src/schema/copyAssets.ts', '149000fdc2c5ceab1428e3a0e87cb28ccc799cd5a51a6960ddc598366ff9257c'],
  ['lib/db/src/schema/calendarItems.ts', '1f872f8a14abd88b491580c47a511f6bc6d9589c6b70ae6d469f4e815106eccc'],
  ['artifacts/api-server/src/routes/ai.ts', 'd806cbd30e0c5b6fbea0dfa2e084154fd03a5e102ccc49375c017c9b78c94b92'],
  ['artifacts/api-server/src/routes/dashboard.ts', '7e0041404be0091a1ce242a4c2f9fa145fcac580c1bdcdda1d33f8ef46723d6b'],
] as const;

function hash(bytes: string | Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashCanonicalText(bytes: Buffer) {
  return hash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8'));
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
  const sourceManifestHash = hashCanonicalText(manifestBytes);
  if (manifest.sourceCommit !== BRANDFORGEOS_SOURCE_COMMIT) {
    errors.push('Pinned source commit does not match the Phase 11A authority');
  }
  if (sourceManifestHash !== BRANDFORGEOS_SOURCE_MANIFEST_SHA256) {
    errors.push('Source snapshot manifest hash does not match the reviewed Phase 11A snapshot');
  }
  const verifiedFiles = evidenceFiles.map(([path, expectedHash]) => {
    const actualHash = hashCanonicalText(readFileSync(resolve(sourceRoot, path)));
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
