import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DATABASE_RELEASE_CONTRACT,
  DATABASE_RELEASE_STEPS,
} from './database-release-contract.js';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const BUILD_ID_PATTERN = /^[0-9a-f]{24}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type OperatorOsReleaseMetadata =
  | {
      status: 'identified';
      contractVersion: 1;
      commit: string;
      buildId: string;
      builtAt: string;
      lockfileSha256: string;
    }
  | {
      status: 'unavailable';
    };

export type OperatorOsReleaseIdentity =
  | (Extract<OperatorOsReleaseMetadata, { status: 'identified' }> & {
      deployedAt: string;
      databaseRelease: {
        contractVersion: number;
        releaseVersion: number;
        stepCount: number;
        lastStep: string;
      };
    })
  | {
      status: 'unavailable';
    };

function parseReleaseMetadata(value: unknown): OperatorOsReleaseMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.contractVersion !== 1 ||
    typeof candidate.commit !== 'string' ||
    !COMMIT_PATTERN.test(candidate.commit) ||
    typeof candidate.buildId !== 'string' ||
    !BUILD_ID_PATTERN.test(candidate.buildId) ||
    typeof candidate.builtAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.builtAt)) ||
    typeof candidate.lockfileSha256 !== 'string' ||
    !SHA256_PATTERN.test(candidate.lockfileSha256)
  ) {
    return null;
  }
  return {
    status: 'identified',
    contractVersion: 1,
    commit: candidate.commit,
    buildId: candidate.buildId,
    builtAt: candidate.builtAt,
    lockfileSha256: candidate.lockfileSha256,
  };
}

export function loadReleaseMetadata(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): OperatorOsReleaseMetadata {
  const paths = [
    env.OPERATOROS_RELEASE_METADATA_PATH,
    resolve(cwd, 'build/operatoros-release.json'),
    resolve(cwd, '../../build/operatoros-release.json'),
  ].filter((value): value is string => !!value);
  for (const path of [...new Set(paths)]) {
    try {
      const parsed = parseReleaseMetadata(JSON.parse(readFileSync(path, 'utf8')));
      if (parsed) return parsed;
    } catch {
      // A missing or malformed manifest is represented by the fail-closed
      // unavailable state; no filesystem error details are exposed.
    }
  }
  return { status: 'unavailable' };
}

export function createRuntimeReleaseIdentity(
  metadata: OperatorOsReleaseMetadata,
  deployedAt = new Date().toISOString(),
): OperatorOsReleaseIdentity {
  if (metadata.status !== 'identified' || !Number.isFinite(Date.parse(deployedAt))) {
    return { status: 'unavailable' };
  }
  const lastStep = DATABASE_RELEASE_STEPS.at(-1);
  if (
    !Number.isInteger(DATABASE_RELEASE_CONTRACT.releaseVersion)
    || DATABASE_RELEASE_CONTRACT.releaseVersion !== DATABASE_RELEASE_STEPS.length
    || !lastStep
  ) {
    return { status: 'unavailable' };
  }
  return {
    ...metadata,
    deployedAt,
    databaseRelease: {
      contractVersion: DATABASE_RELEASE_CONTRACT.contractVersion,
      releaseVersion: DATABASE_RELEASE_CONTRACT.releaseVersion,
      stepCount: DATABASE_RELEASE_STEPS.length,
      lastStep: lastStep.id,
    },
  };
}
