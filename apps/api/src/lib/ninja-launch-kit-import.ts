import { LaunchKitValidationError, sha256 } from './ninja-launch-kit.js';

export const NINJA_LAUNCH_KIT_SOURCE_COMMIT = '30bd1abc05846926e97bc7b26c5b7d6625e8f161';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function planNinjaLaunchKitImport(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LaunchKitValidationError('Import descriptor must be an object');
  }
  const descriptor = input as Record<string, unknown>;
  if (descriptor.sourceCommit !== NINJA_LAUNCH_KIT_SOURCE_COMMIT) {
    throw new LaunchKitValidationError('Import sourceCommit does not match the pinned source', 'sourceCommit');
  }
  if (!descriptor.export || typeof descriptor.export !== 'object' || Array.isArray(descriptor.export)) {
    throw new LaunchKitValidationError('Import export must be an object', 'export');
  }
  const exported = descriptor.export as Record<string, unknown>;
  const count = (key: string) => Array.isArray(exported[key]) ? exported[key].length : 0;
  return {
    mode: 'dry-run' as const,
    sourceCommit: NINJA_LAUNCH_KIT_SOURCE_COMMIT,
    exportSha256: sha256(stable(exported)),
    counts: {
      launchKits: count('launchKits'),
      brandProfiles: count('brandProfiles'),
      exports: count('exports'),
    },
    mappings: {
      launchKits: 'launchkit_launches plus reviewed artifacts and plan records',
      brandProfiles: 'bounded launch-specific snapshot fields; no BrandForgeOS mutation',
      exports: 'launchkit_exports provenance after authorized content regeneration',
    },
    excluded: [
      'users', 'password hashes', 'sessions', 'anonymous users', 'demo plan mutations',
      'subscriptions', 'stripe events', 'child roles', 'admin authority', 'legacy SSO tokens',
    ],
    blockers: [
      'Owner-approved OperatorOS tenant/user mapping is required before apply.',
      'Legacy kit content needs per-record review before approval status can be assigned.',
      'No apply mode exists in Phase 11D.',
    ],
  };
}
