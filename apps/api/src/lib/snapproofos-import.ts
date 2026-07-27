import { sha256Json, SnapProofValidationError } from './snapproofos.js';

export const SNAPPROOF_SOURCE_COMMIT = '26bded38c13b5b6361d407462c68052b0c30613d';

type LegacyExport = {
  sourceCommit?: unknown;
  jobs?: unknown;
  findings?: unknown;
  notes?: unknown;
  files?: unknown;
  reports?: unknown;
};

function count(value: unknown, label: string): number {
  if (value === undefined) return 0;
  if (!Array.isArray(value)) throw new SnapProofValidationError(`${label} must be an array`);
  if (value.length > 100_000) throw new SnapProofValidationError(`${label} exceeds the migration limit`);
  return value.length;
}

/**
 * Deterministic, read-only migration assessment.
 *
 * Apply is deliberately unavailable until an owner supplies an authorized
 * export containing file bytes and accepts the mapping. Legacy fileUrl and
 * share-link data are never trusted or imported.
 */
export function buildSnapProofMigrationPlan(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SnapProofValidationError('Legacy export must be an object');
  }
  const input = value as LegacyExport;
  if (input.sourceCommit !== SNAPPROOF_SOURCE_COMMIT) {
    throw new SnapProofValidationError('Legacy export sourceCommit does not match the approved snapshot');
  }
  const counts = {
    cases: count(input.jobs, 'jobs'),
    findings: count(input.findings, 'findings'),
    comments: count(input.notes, 'notes'),
    fileMetadata: count(input.files, 'files'),
    reports: count(input.reports, 'reports'),
  };
  return {
    mode: 'dry-run',
    sourceCommit: SNAPPROOF_SOURCE_COMMIT,
    sourceHash: sha256Json(input),
    counts,
    mappings: {
      jobs: 'snapproof_cases',
      findings: 'snapproof_findings',
      notes: 'snapproof_comments',
      files: 'manual-private-attachment-import-required',
      reports: 'regenerate-from-approved-case-snapshot',
    },
    excluded: [
      'users',
      'organizations',
      'team_members',
      'billing',
      'share_links',
      'jwt_credentials',
      'client_supplied_file_urls',
    ],
    blockers: counts.fileMetadata > 0
      ? ['Legacy export does not include validated file bytes; secure attachment import requires an owner-approved transfer package.']
      : [],
    applyAvailable: false,
  };
}
