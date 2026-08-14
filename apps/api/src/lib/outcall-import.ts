import { createHash } from 'node:crypto';

export const OUTCALL_SOURCE_CONTRACT = 'owner-phase-prompts-plus-adr-0027';

export interface OutCallImportPlan {
  mode: 'dry-run';
  sourceContract: typeof OUTCALL_SOURCE_CONTRACT;
  sourceRepositoryRecovered: false;
  sourceDataRows: 0;
  sourceFingerprint: string;
  mappings: Record<string, string>;
  excluded: string[];
  blockers: string[];
  ready: true;
  applySupported: false;
}

/**
 * OutCall has no recovered standalone repository or durable source dataset.
 * This contract records the intentional zero-row migration instead of
 * inventing a source export or silently treating missing data as migrated.
 */
export function planOutCallImport(): OutCallImportPlan {
  return {
    mode: 'dry-run',
    sourceContract: OUTCALL_SOURCE_CONTRACT,
    sourceRepositoryRecovered: false,
    sourceDataRows: 0,
    sourceFingerprint: createHash('sha256')
      .update(`${OUTCALL_SOURCE_CONTRACT}:zero-row-import`)
      .digest('hex'),
    mappings: {
      productContract: 'ADR-0027 and the recovered owner phase prompts',
      targetSchema: 'outcall_* tables created by the ordered OperatorOS release',
      sourceData: 'none; no standalone records exist to apply',
    },
    excluded: [
      'invented standalone users',
      'passwords and sessions',
      'tenant, role, subscription, billing, and entitlement authority',
      'provider credentials',
      'emergency-dispatch, impersonation, recording, location, and arbitrary-destination data',
    ],
    blockers: [
      'No canonical source repository or frozen standalone export exists.',
      'Live provider and deployed acceptance remain separate release gates.',
      'No data apply exists or is required for the documented zero-row source.',
    ],
    ready: true,
    applySupported: false,
  };
}
