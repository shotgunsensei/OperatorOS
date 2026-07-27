import { createHash } from 'node:crypto';
import {
  NINJAMATION_CATALOG_COMMIT,
  NINJAMATION_SOURCE_COMMIT,
  NinjamationValidationError,
} from './ninjamation.js';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function planNinjamationImport(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new NinjamationValidationError('Import descriptor must be an object');
  }
  const descriptor = input as Record<string, unknown>;
  if (descriptor.sourceCommit !== NINJAMATION_SOURCE_COMMIT) {
    throw new NinjamationValidationError(
      'Import sourceCommit does not match the pinned Ninjamation application source',
      'sourceCommit',
    );
  }
  if (descriptor.catalogCommit !== NINJAMATION_CATALOG_COMMIT) {
    throw new NinjamationValidationError(
      'Import catalogCommit does not match the reviewed AutomationPacks catalog source',
      'catalogCommit',
    );
  }
  if (!descriptor.export || typeof descriptor.export !== 'object' || Array.isArray(descriptor.export)) {
    throw new NinjamationValidationError('Import export must be an object', 'export');
  }
  const exported = descriptor.export as Record<string, unknown>;
  const scripts = Array.isArray(exported.scripts) ? exported.scripts : [];
  return {
    mode: 'dry-run' as const,
    sourceCommit: NINJAMATION_SOURCE_COMMIT,
    catalogCommit: NINJAMATION_CATALOG_COMMIT,
    exportSha256: createHash('sha256').update(stable(exported)).digest('hex'),
    counts: {
      scripts: scripts.length,
      users: Array.isArray(exported.users) ? exported.users.length : 0,
      sessions: Array.isArray(exported.sessions) ? exported.sessions.length : 0,
    },
    mappings: {
      scripts:
        'reviewed records become tenant-scoped catalog_import drafts with immutable version 1 and fresh OperatorOS static analysis',
      downloadCount:
        'excluded; OperatorOS derives counts only from audited ninjamation_downloads events',
      generatedScripts:
        'treated as unapproved drafts; legacy subscription state never implies approval',
    },
    excluded: [
      'users',
      'sessions',
      'Replit Auth identities',
      'mobile bearer tokens',
      'Stripe customers, products, prices, subscriptions, checkout and webhooks',
      'GitHub credentials and automatic repository sync',
      'legacy mutable download counters',
      'admin authority',
      'attached assets and mockup sandbox',
      'script execution claims and endpoint mutation',
      'secrets embedded in script bodies',
    ],
    blockers: [
      'An owner-approved OperatorOS tenant and user mapping is required.',
      'Every script body requires secret scanning, static analysis, license review, and human code review.',
      'Catalog items import as drafts and require tenant-admin approval before download.',
      'No source database export was supplied or accessed in Phase 12A.',
      'No apply mode exists in Phase 12A.',
    ],
  };
}
