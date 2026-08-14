import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NINJAMATION_LIBRARY_FORMATS,
  NINJAMATION_REPOSITORY,
  NINJAMATION_REPOSITORY_BRANCH,
  NinjamationPhase36Error,
  analyzePhase36Script,
  detectScriptFormat,
  normalizeCatalogSnapshot,
  parseLibraryQuery,
  parseSyncRequest,
} from '../src/lib/ninjamation-phase36.js';

const commit = 'a'.repeat(40);
const blob = 'b'.repeat(40);

test('Phase 36 detects every source catalog format and rejects executable or unknown extensions', () => {
  const cases: Record<string, string> = {
    'a.ps1': 'powershell', 'a.py': 'python', 'a.bat': 'batch', 'a.cmd': 'batch',
    'a.sh': 'bash', 'a.bash': 'bash', 'a.vbs': 'vbscript', 'a.js': 'javascript',
    'a.ts': 'typescript', 'a.ahk': 'autohotkey', 'a.reg': 'registry', 'a.xml': 'xml',
    'a.json': 'json', 'a.yaml': 'yaml', 'a.yml': 'yaml',
  };
  for (const [path, format] of Object.entries(cases)) assert.equal(detectScriptFormat(path), format);
  assert.equal(detectScriptFormat('runner.exe'), null);
  assert.equal(detectScriptFormat('README.md'), null);
  assert.ok(NINJAMATION_LIBRARY_FORMATS.includes('powershell'));
});

test('Phase 36 catalog normalization is deterministic, sorted, checksummed, and secret-aware', () => {
  const snapshot = {
    repository: NINJAMATION_REPOSITORY,
    branch: NINJAMATION_REPOSITORY_BRANCH,
    commit,
    entries: [
      { path: 'Windows/Inventory.ps1', type: 'blob' as const, sha: blob, content: 'Get-ComputerInfo\r\n' },
      { path: 'Linux/inspect.sh', type: 'blob' as const, sha: 'c'.repeat(40), content: '#!/bin/sh\nprintf ok' },
    ],
  };
  const first = normalizeCatalogSnapshot(snapshot);
  const second = normalizeCatalogSnapshot({ ...snapshot, entries: [...snapshot.entries].reverse() });
  assert.equal(first.snapshotSha256, second.snapshotSha256);
  assert.deepEqual(first.scripts.map((item) => item.sourcePath), ['Linux/inspect.sh', 'Windows/Inventory.ps1']);
  assert.match(first.snapshotSha256, /^[0-9a-f]{64}$/);
  const unsafe = analyzePhase36Script('api_key="sk_live_1234567890123456"');
  assert.ok(unsafe.secretFindingCount >= 1);
  assert.ok(unsafe.findings.some((finding) => finding.code === 'POTENTIAL_EMBEDDED_SECRET'));
});

test('Phase 36 rejects duplicate/path traversal catalog data and bounds product queries', () => {
  const duplicate = {
    repository: NINJAMATION_REPOSITORY,
    branch: NINJAMATION_REPOSITORY_BRANCH,
    commit,
    entries: [
      { path: 'same.ps1', type: 'blob' as const, sha: blob, content: 'Write-Output one' },
      { path: 'same.ps1', type: 'blob' as const, sha: 'c'.repeat(40), content: 'Write-Output two' },
    ],
  };
  assert.throws(() => normalizeCatalogSnapshot(duplicate), (error: unknown) => error instanceof NinjamationPhase36Error && error.code === 'NINJAMATION_CATALOG_DUPLICATE_PATH');
  assert.throws(() => normalizeCatalogSnapshot({ ...duplicate, entries: [{ ...duplicate.entries[0], path: '../escape.ps1' }] }), NinjamationPhase36Error);
  assert.equal(parseLibraryQuery({ q: 'inventory', format: 'powershell', favoritesOnly: 'true', limit: 20 }).favoritesOnly, true);
  assert.throws(() => parseLibraryQuery({ limit: 101 }), NinjamationPhase36Error);
  assert.equal(parseSyncRequest({ idempotencyKey: 'sync:test:001', commit }).requestedCommit, commit);
  assert.throws(() => parseSyncRequest({ idempotencyKey: 'short', commit }), NinjamationPhase36Error);
});
