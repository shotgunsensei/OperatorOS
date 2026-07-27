import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NINJAMATION_CATALOG_COMMIT,
  NINJAMATION_SOURCE_COMMIT,
  NinjamationValidationError,
} from '../src/lib/ninjamation.ts';
import { planNinjamationImport } from '../src/lib/ninjamation-import.ts';

test('Ninjamation import planning is commit-pinned, deterministic, and no-apply', () => {
  const descriptor = {
    sourceCommit: NINJAMATION_SOURCE_COMMIT,
    catalogCommit: NINJAMATION_CATALOG_COMMIT,
    export: {
      scripts: [{ id: 1, name: 'Inventory', content: 'Get-ComputerInfo', downloadCount: 999 }],
      users: [{ id: 'legacy-user' }],
      sessions: [{ sid: 'never-import' }],
    },
  };
  const first = planNinjamationImport(descriptor);
  const second = planNinjamationImport(descriptor);
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.exportSha256, second.exportSha256);
  assert.equal(first.counts.scripts, 1);
  assert.equal(first.counts.users, 1);
  assert.match(first.mappings.downloadCount, /excluded/);
  assert.ok(first.excluded.includes('Replit Auth identities'));
  assert.ok(first.blockers.includes('No apply mode exists in Phase 12A.'));
});

test('Ninjamation import rejects unpinned application and catalog commits', () => {
  assert.throws(
    () => planNinjamationImport({
      sourceCommit: 'different',
      catalogCommit: NINJAMATION_CATALOG_COMMIT,
      export: {},
    }),
    NinjamationValidationError,
  );
  assert.throws(
    () => planNinjamationImport({
      sourceCommit: NINJAMATION_SOURCE_COMMIT,
      catalogCommit: 'different',
      export: {},
    }),
    NinjamationValidationError,
  );
});
