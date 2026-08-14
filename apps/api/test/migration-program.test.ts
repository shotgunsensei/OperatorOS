import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MODULE_CATALOG } from '../../../packages/sdk/src/catalog.ts';
import {
  PHASE13_MIGRATION_MANIFESTS,
  PROHIBITED_MIGRATION_AUTHORITY,
  runPhase13MigrationRehearsal,
  validateMigrationManifestCoverage,
} from '../src/lib/migration-program.ts';
import { planOutCallImport } from '../src/lib/outcall-import.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('Phase 13 manifests cover every active module and every release target', () => {
  assert.deepEqual(validateMigrationManifestCoverage(), []);
  assert.deepEqual(
    PHASE13_MIGRATION_MANIFESTS.map(manifest => manifest.slug).sort(),
    MODULE_CATALOG.map(module => module.slug).sort(),
  );
  assert.equal(new Set(PHASE13_MIGRATION_MANIFESTS.map(manifest => manifest.slug)).size, 13);
  for (const manifest of PHASE13_MIGRATION_MANIFESTS) {
    assert.match(manifest.source.commit ?? manifest.source.version, /\S/);
    assert.match(manifest.source.exportMethod, /\S/);
    assert.ok(manifest.mappings.length > 0);
    assert.ok(manifest.reconciliation.length > 0);
    assert.match(manifest.conflicts, /\S/);
    assert.match(manifest.rollback, /\S/);
    assert.match(manifest.writeFreeze, /write|surface/i);
    assert.ok(manifest.cutoverBlockers.length > 0);
  }
});

test('master rehearsal executes all 13 deterministic planners without writes or cutover claims', () => {
  const first = runPhase13MigrationRehearsal();
  const second = runPhase13MigrationRehearsal();
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.authorityImported, false);
  assert.equal(first.databaseWritesPerformed, false);
  assert.equal(first.applySupported, false);
  assert.equal(first.summary.total, 13);
  assert.equal(first.summary.passed, 13);
  assert.equal(first.summary.failed, 0);
  assert.equal(first.summary.productionCutoverReady, 0);
  assert.equal(first.evidenceFingerprint, second.evidenceFingerprint);
  assert.ok(first.modules.every(module => module.rehearsalPassed));
  assert.ok(first.modules.every(module => module.deterministic));
  assert.ok(first.modules.every(module => module.productionCutoverReady === false));
  assert.deepEqual(first.prohibitedAuthority, PROHIBITED_MIGRATION_AUTHORITY);
  assert.doesNotMatch(
    JSON.stringify(first),
    /passwordHash|refreshToken|bearerToken|apiKey|webhookSecret|privateKey/i,
  );
});

test('single-module rehearsal remains bounded and unknown modules fail closed', () => {
  const report = runPhase13MigrationRehearsal('snapproofos');
  assert.equal(report.summary.total, 1);
  assert.equal(report.modules[0]?.slug, 'snapproofos');
  assert.equal(report.modules[0]?.productionCutoverReady, false);
  assert.throws(() => runPhase13MigrationRehearsal('unsupported-module'), /Unknown migration module/);
});

test('OutCall explicitly reconciles a zero-row source and cannot apply data', () => {
  const plan = planOutCallImport();
  assert.equal(plan.sourceRepositoryRecovered, false);
  assert.equal(plan.sourceDataRows, 0);
  assert.equal(plan.ready, true);
  assert.equal(plan.applySupported, false);
  assert.match(plan.blockers.join(' '), /No canonical source repository/);
});

test('master and module CLIs expose dry-run only and no production apply path', () => {
  const master = readFileSync(resolve(root, 'apps/api/src/scripts/migration-program.ts'), 'utf8');
  const snapProof = readFileSync(resolve(root, 'apps/api/src/scripts/snapproofos-import.ts'), 'utf8');
  const outCall = readFileSync(resolve(root, 'apps/api/src/scripts/outcall-import.ts'), 'utf8');
  assert.match(master, /--dry-run/);
  assert.match(master, /--apply/);
  assert.match(master, /never applies data/);
  assert.match(snapProof, /supports --dry-run only/);
  assert.match(outCall, /no standalone data apply exists/);
  assert.doesNotMatch(`${master}\n${snapProof}\n${outCall}`, /db:apply|OPERATOROS_DATABASE_RELEASE_MODE|INSERT INTO|UPDATE\s+\w+/i);
});

test('migration and source-evidence paths resolve from the documented repository root', () => {
  const migration = readFileSync(resolve(root, 'apps/api/src/lib/migration-program.ts'), 'utf8');
  const pool = readFileSync(resolve(root, 'apps/api/src/lib/ninja-pool-hall-import.ts'), 'utf8');
  const brand = readFileSync(resolve(root, 'apps/api/src/lib/brandforgeos-import.ts'), 'utf8');
  for (const source of [migration, pool, brand]) {
    assert.match(source, /resolveRepositoryRoot\(\)/);
  }
  const resolver = readFileSync(resolve(root, 'apps/api/src/lib/repository-root.ts'), 'utf8');
  assert.match(resolver, /findWorkspaceRoot\(process\.cwd\(\)\) \?\? findWorkspaceRoot\(moduleDirectory\)/);
  assert.match(resolver, /pnpm-workspace\.yaml/);
});
