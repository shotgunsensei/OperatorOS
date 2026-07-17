import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
process.env.SESSION_SECRET ||= 'database-release-contract-test-secret-32-plus';

test('database release plan is explicit, ordered, additive, and reusable by startup', async () => {
  const release = await import('../src/lib/database-release.js');
  assert.equal(release.DATABASE_RELEASE_CONTRACT.contractVersion, 1);
  assert.equal(release.DATABASE_RELEASE_CONTRACT.destructive, false);
  assert.equal(release.DATABASE_RELEASE_STEPS.length, 14);
  assert.equal(new Set(release.DATABASE_RELEASE_STEPS.map((step: { id: string }) => step.id)).size, 14);
  assert.equal(release.DATABASE_RELEASE_STEPS[0].id, 'base_tables');
  assert.equal(release.DATABASE_RELEASE_STEPS.at(-1).id, 'free_account_app_backfill');

  const api = read('apps/api/src/index.ts');
  const releaseSource = read('apps/api/src/lib/database-release.ts');
  assert.match(api, /applyOperatorOSDatabaseRelease/);
  assert.match(api, /OPERATOROS_DATABASE_RELEASE_APPLIED/);
  assert.doesNotMatch(api, /await ensureBaseTables\(\)/);
  assert.match(releaseSource, /to_regclass\('public\.sso_handoff_tokens'\)/);
  assert.doesNotMatch(releaseSource, /sso_authorization_codes/);
});

test('database release CLI exposes plan and apply modes without accepting arbitrary commands', () => {
  const cli = read('apps/api/src/scripts/database-release.ts');
  assert.match(cli, /--plan/);
  assert.match(cli, /--apply/);
  assert.match(cli, /OPERATOROS_DATABASE_RELEASE_MODE/);
  assert.match(cli, /Unknown database release option/);
  assert.doesNotMatch(cli, /process\.env\[[^\]]+\]\s*=\s*process\.argv/);
});
