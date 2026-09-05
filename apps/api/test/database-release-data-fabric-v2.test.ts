import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ensureCrossModuleDataFabricTables } from '../src/lib/cross-module-data-fabric-db-init.js';
import { applyOperatorOSDatabaseRelease } from '../src/lib/database-release.js';
import { runDatabaseReleaseCli } from '../src/scripts/database-release.js';

process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

interface DriftCase {
  name: string;
  breakStatements: string[];
  expectedMissing: string[];
  cleanupStatements?: string[];
}

const driftCases: DriftCase[] = [
  {
    name: 'idempotency ownership column and check',
    breakStatements: [
      'ALTER TABLE shared_workflow_runs DROP COLUMN IF EXISTS idempotency_scope',
    ],
    expectedMissing: [
      'shared_workflow_runs_idempotency_scope_v2',
      'shared_workflow_run_idempotency_scope_check_v2',
    ],
  },
  {
    name: 'signature-envelope version column and check',
    breakStatements: [
      'ALTER TABLE shared_domain_events DROP COLUMN IF EXISTS signature_envelope_version',
    ],
    expectedMissing: [
      'shared_domain_events_signature_envelope_v2',
      'shared_domain_event_signature_envelope_check_v2',
    ],
  },
  {
    name: 'idempotency ownership check definition',
    breakStatements: [
      'ALTER TABLE shared_workflow_runs DROP CONSTRAINT IF EXISTS shared_workflow_run_idempotency_scope_check',
      `ALTER TABLE shared_workflow_runs
        ADD CONSTRAINT shared_workflow_run_idempotency_scope_check
        CHECK (idempotency_scope IN ('tenant','actor','global')) NOT VALID`,
    ],
    cleanupStatements: [
      'ALTER TABLE shared_workflow_runs DROP CONSTRAINT IF EXISTS shared_workflow_run_idempotency_scope_check',
    ],
    expectedMissing: ['shared_workflow_run_idempotency_scope_check_v2'],
  },
  {
    name: 'signature-envelope check definition',
    breakStatements: [
      'ALTER TABLE shared_domain_events DROP CONSTRAINT IF EXISTS shared_domain_event_signature_envelope_check',
      `ALTER TABLE shared_domain_events
        ADD CONSTRAINT shared_domain_event_signature_envelope_check
        CHECK (signature_envelope_version >= 0) NOT VALID`,
    ],
    cleanupStatements: [
      'ALTER TABLE shared_domain_events DROP CONSTRAINT IF EXISTS shared_domain_event_signature_envelope_check',
    ],
    expectedMissing: ['shared_domain_event_signature_envelope_check_v2'],
  },
  {
    name: 'workflow source-route unique key definition',
    breakStatements: [
      'ALTER TABLE shared_domain_events DROP CONSTRAINT IF EXISTS shared_domain_event_source_run_route_fk',
      'ALTER TABLE shared_workflow_runs DROP CONSTRAINT IF EXISTS uq_shared_workflow_run_source_route',
      'DROP INDEX IF EXISTS uq_shared_workflow_run_source_route',
      `CREATE UNIQUE INDEX uq_shared_workflow_run_source_route
        ON shared_workflow_runs(id,tenant_id,source_module_id)`,
    ],
    cleanupStatements: [
      'ALTER TABLE shared_domain_events DROP CONSTRAINT IF EXISTS shared_domain_event_source_run_route_fk',
      'ALTER TABLE shared_workflow_runs DROP CONSTRAINT IF EXISTS uq_shared_workflow_run_source_route',
      'DROP INDEX IF EXISTS uq_shared_workflow_run_source_route',
    ],
    expectedMissing: [
      'shared_workflow_run_source_route_unique_v2',
      'shared_domain_event_source_run_route_fk_v2',
    ],
  },
  {
    name: 'workflow destination-route unique key definition',
    breakStatements: [
      'ALTER TABLE shared_event_inbox DROP CONSTRAINT IF EXISTS shared_event_inbox_destination_run_route_fk',
      'ALTER TABLE shared_workflow_runs DROP CONSTRAINT IF EXISTS uq_shared_workflow_run_destination_route',
      'DROP INDEX IF EXISTS uq_shared_workflow_run_destination_route',
      `CREATE UNIQUE INDEX uq_shared_workflow_run_destination_route
        ON shared_workflow_runs(id,tenant_id,destination_module_id,workflow_key)`,
    ],
    cleanupStatements: [
      'ALTER TABLE shared_event_inbox DROP CONSTRAINT IF EXISTS shared_event_inbox_destination_run_route_fk',
      'ALTER TABLE shared_workflow_runs DROP CONSTRAINT IF EXISTS uq_shared_workflow_run_destination_route',
      'DROP INDEX IF EXISTS uq_shared_workflow_run_destination_route',
    ],
    expectedMissing: [
      'shared_workflow_run_destination_route_unique_v2',
      'shared_event_inbox_destination_run_route_fk_v2',
    ],
  },
  {
    name: 'domain-event run-route unique key definition',
    breakStatements: [
      'ALTER TABLE shared_event_inbox DROP CONSTRAINT IF EXISTS shared_event_inbox_event_run_route_fk',
      'ALTER TABLE shared_domain_events DROP CONSTRAINT IF EXISTS uq_shared_domain_event_run_route',
      'DROP INDEX IF EXISTS uq_shared_domain_event_run_route',
      `CREATE UNIQUE INDEX uq_shared_domain_event_run_route
        ON shared_domain_events(id,tenant_id,workflow_run_id)`,
    ],
    cleanupStatements: [
      'ALTER TABLE shared_event_inbox DROP CONSTRAINT IF EXISTS shared_event_inbox_event_run_route_fk',
      'ALTER TABLE shared_domain_events DROP CONSTRAINT IF EXISTS uq_shared_domain_event_run_route',
      'DROP INDEX IF EXISTS uq_shared_domain_event_run_route',
    ],
    expectedMissing: [
      'shared_domain_event_run_route_unique_v2',
      'shared_event_inbox_event_run_route_fk_v2',
    ],
  },
  {
    name: 'domain-event source-to-run foreign key definition',
    breakStatements: [
      'ALTER TABLE shared_domain_events DROP CONSTRAINT IF EXISTS shared_domain_event_source_run_route_fk',
      `ALTER TABLE shared_domain_events
        ADD CONSTRAINT shared_domain_event_source_run_route_fk
        FOREIGN KEY (tenant_id,workflow_run_id,source_module_id)
        REFERENCES shared_workflow_runs(tenant_id,id,source_module_id)
        ON DELETE NO ACTION NOT VALID`,
    ],
    cleanupStatements: [
      'ALTER TABLE shared_domain_events DROP CONSTRAINT IF EXISTS shared_domain_event_source_run_route_fk',
    ],
    expectedMissing: ['shared_domain_event_source_run_route_fk_v2'],
  },
  {
    name: 'inbox event-to-run foreign key definition',
    breakStatements: [
      'ALTER TABLE shared_event_inbox DROP CONSTRAINT IF EXISTS shared_event_inbox_event_run_route_fk',
      `ALTER TABLE shared_event_inbox
        ADD CONSTRAINT shared_event_inbox_event_run_route_fk
        FOREIGN KEY (tenant_id,event_id,workflow_run_id)
        REFERENCES shared_domain_events(tenant_id,id,workflow_run_id)
        ON DELETE NO ACTION NOT VALID`,
    ],
    cleanupStatements: [
      'ALTER TABLE shared_event_inbox DROP CONSTRAINT IF EXISTS shared_event_inbox_event_run_route_fk',
    ],
    expectedMissing: ['shared_event_inbox_event_run_route_fk_v2'],
  },
  {
    name: 'inbox destination-to-run foreign key definition',
    breakStatements: [
      'ALTER TABLE shared_event_inbox DROP CONSTRAINT IF EXISTS shared_event_inbox_destination_run_route_fk',
      `ALTER TABLE shared_event_inbox
        ADD CONSTRAINT shared_event_inbox_destination_run_route_fk
        FOREIGN KEY (tenant_id,workflow_run_id,destination_module_id,consumer_key)
        REFERENCES shared_workflow_runs(tenant_id,id,destination_module_id,workflow_key)
        ON DELETE NO ACTION NOT VALID`,
    ],
    cleanupStatements: [
      'ALTER TABLE shared_event_inbox DROP CONSTRAINT IF EXISTS shared_event_inbox_destination_run_route_fk',
    ],
    expectedMissing: ['shared_event_inbox_destination_run_route_fk_v2'],
  },
];

async function executeStatements(statements: string[] = []): Promise<void> {
  for (const statement of statements) await db.execute(sql.raw(statement));
}

async function verifyCurrent(): Promise<void> {
  assert.equal(await runDatabaseReleaseCli(['--verify-current'], process.env), 0);
}

before(async () => {
  assert.equal(
    process.env.PARITY_DATABASE_IS_DISPOSABLE,
    '1',
    'data-fabric release drift tests require an explicitly disposable database',
  );
  await applyOperatorOSDatabaseRelease();
  await verifyCurrent();
});

after(async () => {
  if (process.env.PARITY_DATABASE_IS_DISPOSABLE === '1') {
    await ensureCrossModuleDataFabricTables();
  }
});

test('verify-current rejects incomplete or definition-drifted data-fabric v2 schema and accepts repair reapply', async t => {
  for (const driftCase of driftCases) {
    await t.test(driftCase.name, async () => {
      try {
        await executeStatements(driftCase.breakStatements);
        await assert.rejects(
          () => verifyCurrent(),
          error => {
            const message = error instanceof Error ? error.message : String(error);
            for (const missing of driftCase.expectedMissing) assert.match(message, new RegExp(missing));
            return true;
          },
        );
      } finally {
        await executeStatements(driftCase.cleanupStatements);
        await ensureCrossModuleDataFabricTables();
      }

      await verifyCurrent();
    });
  }
});
