import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const snapshots = [
  {
    slug: 'torqueshed',
    commit: '508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75',
    remote: 'https://github.com/shotgunsensei/TorqueShed-Codex.git',
  },
  {
    slug: 'faultlinelab',
    commit: '46877aae35565149ccf4f4988dd94627fc6bb92b',
    remote: 'https://github.com/shotgunsensei/Faultline-Lab.git',
  },
  {
    slug: 'ninja-pool-hall',
    commit: '62439c4018ec551ce2891800351200c8ab2cb9e7',
    remote: 'https://github.com/shotgunsensei/Shotgun-ninja-pool-hall.git',
  },
  {
    slug: 'brandforgeos',
    commit: '5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e',
    remote: 'https://github.com/shotgunsensei/BrandForge-OS.git',
  },
  {
    slug: 'snapproofos',
    commit: '26bded38c13b5b6361d407462c68052b0c30613d',
    remote: 'https://github.com/shotgunsensei/snapproof.git',
  },
  {
    slug: 'studyforge-ai',
    commit: 'a607a9f34442b1d0f6bfffbf0293609529494825',
    remote: 'https://github.com/shotgunsensei/Study-Forge.git',
  },
  {
    slug: 'ninja-launch-kit',
    commit: '30bd1abc05846926e97bc7b26c5b7d6625e8f161',
    remote: 'https://github.com/shotgunsensei/Ninja-Launch-Kit.git',
  },
  {
    slug: 'callcommand-ai',
    commit: 'd49434e1d641d62cc141591c7208539a7afbf11e',
    remote: 'https://github.com/shotgunsensei/Call-Command-AI.git',
  },
  {
    slug: 'ninjamation',
    commit: 'cca75338d04ed35b89f28d614eb51559735aa32f',
    remote: 'https://github.com/shotgunsensei/AutomationPacks.git',
  },
] as const;

interface SnapshotManifest {
  moduleSlug: string;
  sourceRemote: string;
  sourceCommit: string;
  fileCount: number;
  totalBytes: number;
  highConfidenceSecretFindings: number;
  excludedFiles: Array<{ path: string; reason: string }>;
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = resolve(directory, entry.name);
      assert.equal(lstatSync(full).isSymbolicLink(), false, `snapshot symlink is forbidden: ${full}`);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  visit(root);
  return files;
}

function assertSnapshotMatchesIndex(sourceRoot: string): void {
  const relativeRoot = relative(repositoryRoot, sourceRoot).replaceAll('\\', '/');
  execFileSync('git', ['diff', '--quiet', '--', relativeRoot], { cwd: repositoryRoot });
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '--', relativeRoot],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  assert.equal(untracked.trim(), '', 'snapshot contains untracked files');
}

const forbiddenDirectory = /(^|\/)(?:\.git|\.agents|\.openai|\.migration-backup|\.backup|backups?|\.replit-artifact|mockup-sandbox|design-audit|node_modules|dist|build|\.next|coverage|\.cache|\.turbo|\.vercel|playwright-report|test-results|tmp|temp|uploads?)(\/|$)/i;
const forbiddenFile = /(^|\/)(?:\.env(?:\..*)?|\.replit(?:ignore)?(?:\..*)?|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|credentials\.json|service-account[^/]*\.json)$|\.(?:pem|key|p12|pfx|jks|keystore|sqlite|sqlite3|db|log)$/i;
const highConfidenceSecrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /(?:sk|rk)_live_[A-Za-z0-9]{16,}/,
  /(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
];

for (const snapshot of snapshots) {
  test(`${snapshot.slug} source snapshot is commit-pinned, quarantined, and secret-clean`, () => {
    const moduleRoot = resolve(repositoryRoot, 'apps/modules', snapshot.slug);
    const sourceRoot = resolve(moduleRoot, 'source');
    assert.equal(existsSync(resolve(moduleRoot, 'README.md')), true);
    assert.equal(existsSync(sourceRoot), true);

    const manifestPath = resolve(sourceRoot, 'SOURCE_SNAPSHOT.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as SnapshotManifest;
    assert.equal(manifest.moduleSlug, snapshot.slug);
    assert.equal(manifest.sourceCommit, snapshot.commit);
    assert.equal(manifest.sourceRemote, snapshot.remote);
    assert.equal(manifest.highConfidenceSecretFindings, 0);
    assert.ok(manifest.excludedFiles.length > 0, 'snapshot records its exclusions');

    const files = walkFiles(sourceRoot);
    const importedFiles = files.filter((file) => file !== manifestPath);
    assert.equal(importedFiles.length, manifest.fileCount);
    assert.ok(Number.isSafeInteger(manifest.totalBytes) && manifest.totalBytes > 0);
    // Raw working-tree byte counts are not stable under Git's platform line-ending
    // filters. A clean index comparison is the portable content-integrity check.
    assertSnapshotMatchesIndex(sourceRoot);

    for (const file of importedFiles) {
      const path = relative(sourceRoot, file).replaceAll('\\', '/');
      assert.doesNotMatch(`/${path}`, forbiddenDirectory);
      assert.doesNotMatch(`/${path}`, forbiddenFile);
      if (path.startsWith('attached_assets/')) {
        assert.equal(snapshot.slug, 'faultlinelab');
        assert.ok([
          'attached_assets/faultlinelabhero_1776394938788.jpg',
          'attached_assets/faultlinelogotrans_1776394938786.png',
        ].includes(path));
      }

      const size = statSync(file).size;
      if (size === 0 || size > 2 * 1024 * 1024) continue;
      const bytes = readFileSync(file);
      if (bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0)) continue;
      const text = bytes.toString('utf8');
      for (const pattern of highConfidenceSecrets) {
        assert.doesNotMatch(text, pattern, `${snapshot.slug}/${path} contains ${pattern}`);
      }
    }
  });
}

test('source snapshots are outside the executable pnpm workspace', () => {
  const workspace = readFileSync(resolve(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');
  assert.doesNotMatch(workspace, /apps\/modules\/\*|apps\/modules\/\*\*|apps\/modules\/[^\s"']+\/source/);
});
