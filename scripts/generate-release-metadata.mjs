import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..');
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, 'build/operatoros-release.json');
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

export function createReleaseMetadata({ commit, lockfileBytes, builtAt = new Date().toISOString() }) {
  const normalizedCommit = String(commit).trim().toLowerCase();
  if (!COMMIT_PATTERN.test(normalizedCommit)) {
    throw new Error('release commit must be a full 40-character Git SHA');
  }
  if (!Buffer.isBuffer(lockfileBytes) || lockfileBytes.length === 0) {
    throw new Error('pnpm lockfile bytes are required');
  }
  if (!Number.isFinite(Date.parse(builtAt))) {
    throw new Error('release build timestamp must be ISO-8601');
  }
  const lockfileSha256 = createHash('sha256').update(lockfileBytes).digest('hex');
  const buildId = createHash('sha256')
    .update(`${normalizedCommit}\n${lockfileSha256}\n${builtAt}`)
    .digest('hex')
    .slice(0, 24);
  return {
    contractVersion: 1,
    commit: normalizedCommit,
    buildId,
    builtAt,
    lockfileSha256,
  };
}

export async function generateReleaseMetadata({
  repositoryRoot = REPOSITORY_ROOT,
  outputPath = OUTPUT_PATH,
  env = process.env,
} = {}) {
  const suppliedCommit = env.OPERATOROS_RELEASE_COMMIT?.trim().toLowerCase();
  const commit = suppliedCommit || execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).trim().toLowerCase();
  const lockfileBytes = await readFile(resolve(repositoryRoot, 'pnpm-lock.yaml'));
  const metadata = createReleaseMetadata({ commit, lockfileBytes });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return metadata;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateReleaseMetadata()
    .then((metadata) => {
      console.log(`[release] ${metadata.commit} build ${metadata.buildId}`);
    })
    .catch((error) => {
      console.error(`[release] metadata generation failed: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
