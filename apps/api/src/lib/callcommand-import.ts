import { createHash } from 'node:crypto';
import { CALLCOMMAND_SOURCE_COMMIT, CallCommandValidationError } from './callcommand.js';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function planCallCommandImport(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CallCommandValidationError('Import descriptor must be an object');
  }
  const descriptor = input as Record<string, unknown>;
  if (descriptor.sourceCommit !== CALLCOMMAND_SOURCE_COMMIT) {
    throw new CallCommandValidationError('Import sourceCommit does not match the pinned source', 'CALLCOMMAND_IMPORT_COMMIT', 'sourceCommit');
  }
  if (!descriptor.export || typeof descriptor.export !== 'object' || Array.isArray(descriptor.export)) {
    throw new CallCommandValidationError('Import export must be an object', 'CALLCOMMAND_IMPORT_EXPORT', 'export');
  }
  const exported = descriptor.export as Record<string, unknown>;
  const count = (key: string) => Array.isArray(exported[key]) ? exported[key].length : 0;
  return {
    mode: 'dry-run' as const,
    sourceCommit: CALLCOMMAND_SOURCE_COMMIT,
    exportSha256: createHash('sha256').update(stable(exported)).digest('hex'),
    counts: {
      channels: count('channels'),
      receptionistProfiles: count('receptionistProfiles'),
      transferTargets: count('transferTargets'),
      callRecords: count('callRecords'),
      callFlows: count('callFlows'),
    },
    mappings: {
      channels: 'callcommand_channels after tenant and phone ownership review',
      receptionistProfiles: 'callcommand_profiles with bounded intake schema',
      transferTargets: 'review-only external or voicemail targets; execution remains disabled',
      callRecords: 'callcommand_calls and safe events after consent reconciliation',
      callFlows: 'manual review into profiles; arbitrary flow execution is excluded',
    },
    excluded: [
      'users', 'sessions', 'Clerk identities', 'passwords', 'child roles',
      'Stripe subscriptions', 'ingestion tokens', 'integration secrets',
      'raw provider payloads', 'recording URLs', 'demo AI responses',
      'simulated email delivery', 'SIP stubs', 'user and queue transfer placeholders',
      'unverified transfer execution', 'recording and transcript metadata',
    ],
    blockers: [
      'Owner-approved OperatorOS tenant and user mapping is required.',
      'Every imported outbound call requires consent and suppression reconciliation.',
      'Recording retention and jurisdiction review are required before recording metadata import.',
      'No apply mode exists in Phase 11E.',
    ],
  };
}
