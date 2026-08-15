import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = join(repositoryRoot, 'build', 'phase39');
const archivePath = join(artifactRoot, 'operatoros-phase39-recovery.dump');
const resultPath = join(artifactRoot, 'recovery-rehearsal.json');
const containerArchive = '/tmp/operatoros-phase39-recovery.dump';

function fail(message) { throw new Error(message); }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) fail(`${command} failed with exit ${result.status}: ${(result.stderr || result.stdout || '').trim().slice(0, 2_000)}`);
  return result.stdout;
}

function docker(container, args) {
  return run('docker', ['exec', container, ...args]);
}

function validateName(value, field) {
  if (!/^operatoros_phase39[_a-z0-9]*$/.test(value)) fail(`${field} must be an explicitly named Phase 39 disposable database`);
  return value;
}

async function vector(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS public_tables,
        (SELECT COUNT(*)::int FROM information_schema.table_constraints WHERE constraint_schema='public' AND constraint_type='FOREIGN KEY') AS foreign_keys,
        (SELECT COUNT(*)::int FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated) AS unvalidated_constraints,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM tenants) AS tenants,
        (SELECT COUNT(*)::int FROM tenant_users) AS tenant_users,
        (SELECT COUNT(*)::int FROM modules) AS modules,
        (SELECT COUNT(*)::int FROM tenant_modules) AS tenant_modules,
        (SELECT COUNT(*)::int FROM shared_resource_references) AS shared_resource_references,
        (SELECT COUNT(*)::int FROM shared_workflow_runs) AS shared_workflow_runs,
        (SELECT COUNT(*)::int FROM shared_domain_events) AS shared_domain_events,
        (SELECT COUNT(*)::int FROM shared_resource_links) AS shared_resource_links,
        (SELECT COUNT(*)::int FROM shared_resource_links l LEFT JOIN shared_resource_references s ON s.tenant_id=l.tenant_id AND s.id=l.source_reference_id LEFT JOIN shared_resource_references d ON d.tenant_id=l.tenant_id AND d.id=l.destination_reference_id WHERE s.id IS NULL OR d.id IS NULL) AS orphan_resource_links,
        (SELECT COUNT(*)::int FROM shared_workflow_runs r LEFT JOIN shared_resource_references s ON s.tenant_id=r.tenant_id AND s.id=r.source_reference_id WHERE s.id IS NULL) AS orphan_workflow_sources,
        (SELECT COUNT(*)::int FROM shared_attachments WHERE size_bytes < 0 OR length(sha256) <> 64) AS invalid_attachments
    `);
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.env.PARITY_DATABASE_IS_DISPOSABLE !== '1') fail('PARITY_DATABASE_IS_DISPOSABLE=1 is required');
  const sourceUrl = new URL(process.env.DATABASE_URL || fail('DATABASE_URL is required'));
  if (!['127.0.0.1', 'localhost'].includes(sourceUrl.hostname)) fail('DATABASE_URL must be loopback-only');
  const sourceDb = validateName(sourceUrl.pathname.slice(1), 'source database');
  const restoreDb = validateName(process.env.PHASE39_RESTORE_DATABASE_NAME || '', 'restore database');
  if (sourceDb === restoreDb) fail('restore database must differ from source database');
  const container = process.env.PHASE39_POSTGRES_CONTAINER || fail('PHASE39_POSTGRES_CONTAINER is required');
  if (!/^operatoros-phase39-[a-z0-9-]+$/.test(container)) fail('container must use the operatoros-phase39-* disposable naming convention');
  const databaseUser = sourceUrl.username;
  if (!/^[a-zA-Z0-9_]+$/.test(databaseUser)) fail('database user is not safe for the rehearsal command');
  const restoreUrl = new URL(sourceUrl);
  restoreUrl.pathname = `/${restoreDb}`;
  mkdirSync(artifactRoot, { recursive: true });

  const startedAt = new Date().toISOString();
  const started = Date.now();
  let archiveRetained = false;
  try {
    docker(container, ['pg_dump', '-U', databaseUser, '-d', sourceDb, '--format=custom', '--no-owner', '--no-acl', '--file', containerArchive]);
    const toc = docker(container, ['pg_restore', '--list', containerArchive]);
    run('docker', ['cp', `${container}:${containerArchive}`, archivePath]);
    archiveRetained = true;
    const bytes = statSync(archivePath).size;
    const sha256 = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
    const sourceVector = await vector(sourceUrl.toString());

    docker(container, ['dropdb', '--if-exists', '-U', databaseUser, restoreDb]);
    docker(container, ['createdb', '-U', databaseUser, restoreDb]);
    // Restore the captured state exactly. OperatorOS owns bootstrap triggers
    // that create membership/module rows for newly inserted authorities; those
    // triggers are correct for live writes but must not synthesize extra rows
    // while replaying an archive.
    docker(container, ['pg_restore', '-U', databaseUser, '-d', restoreDb, '--exit-on-error', '--disable-triggers', '--no-owner', '--no-acl', containerArchive]);
    const restoredBeforeReapply = await vector(restoreUrl.toString());
    assertVectors(sourceVector, restoredBeforeReapply);

    const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'corepack';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'corepack', 'pnpm', 'db:apply'] : ['pnpm', 'db:apply'];
    run(command, args, {
      env: {
        ...process.env,
        DATABASE_URL: restoreUrl.toString(),
        APP_ENV: 'test',
        NODE_ENV: 'test',
        OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
        PARITY_DATABASE_IS_DISPOSABLE: '1',
      },
    });
    const restoredAfterReapply = await vector(restoreUrl.toString());
    assertStableAuthorityVector(sourceVector, restoredAfterReapply);
    // Release repair steps may legitimately restore membership/module rows
    // that were absent from an inconsistent synthetic snapshot. The second
    // apply must make no further change.
    run(command, args, {
      env: {
        ...process.env,
        DATABASE_URL: restoreUrl.toString(),
        APP_ENV: 'test',
        NODE_ENV: 'test',
        OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
        PARITY_DATABASE_IS_DISPOSABLE: '1',
      },
    });
    const restoredAfterSecondReapply = await vector(restoreUrl.toString());
    assertVectors(restoredAfterReapply, restoredAfterSecondReapply);
    if (Number(sourceVector.unvalidated_constraints) !== 0 || Number(sourceVector.orphan_resource_links) !== 0 || Number(sourceVector.orphan_workflow_sources) !== 0 || Number(sourceVector.invalid_attachments) !== 0) {
      fail('source reconciliation invariants are not clean');
    }

    const result = {
      schemaVersion: 1,
      status: 'PASS',
      startedAt,
      durationMs: Date.now() - started,
      sourceDatabase: sourceDb,
      restoreDatabase: restoreDb,
      archive: { format: 'PostgreSQL custom', bytes, sha256, tocEntries: toc.split(/\r?\n/).filter(line => /^\d+;/.test(line)).length, retained: false },
      sourceVector,
      restoredBeforeReapply,
      restoredAfterReapply,
      restoredAfterSecondReapply,
      forwardFixDelta: {
        tenantUsers: Number(restoredAfterReapply.tenant_users) - Number(sourceVector.tenant_users),
        tenantModules: Number(restoredAfterReapply.tenant_modules) - Number(sourceVector.tenant_modules),
      },
      providerTraffic: 'disabled',
    };
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: result.status, durationMs: result.durationMs, archive: result.archive, vector: sourceVector, artifact: 'build/phase39/recovery-rehearsal.json' }, null, 2)}\n`);
  } finally {
    try { docker(container, ['dropdb', '--if-exists', '-U', databaseUser, restoreDb]); } catch { /* preserve primary failure */ }
    try { docker(container, ['rm', '-f', containerArchive]); } catch { /* preserve primary failure */ }
    if (archiveRetained) {
      try { unlinkSync(archivePath); } catch { /* preserve checksum evidence even if cleanup fails */ }
    }
  }
}

function assertVectors(source, restored) {
  const sourceJson = JSON.stringify(source);
  const restoredJson = JSON.stringify(restored);
  if (sourceJson !== restoredJson) fail(`restore reconciliation mismatch: source=${sourceJson} restored=${restoredJson}`);
}

function assertStableAuthorityVector(source, restored) {
  for (const key of [
    'public_tables',
    'foreign_keys',
    'unvalidated_constraints',
    'users',
    'tenants',
    'modules',
    'shared_resource_references',
    'shared_workflow_runs',
    'shared_domain_events',
    'shared_resource_links',
    'orphan_resource_links',
    'orphan_workflow_sources',
    'invalid_attachments',
  ]) {
    if (String(source[key]) !== String(restored[key])) fail(`release reapply changed protected vector ${key}: source=${source[key]} restored=${restored[key]}`);
  }
}

await main();
