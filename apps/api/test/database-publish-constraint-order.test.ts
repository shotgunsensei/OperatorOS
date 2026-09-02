import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const definitions = [
  ['apps/api/src/lib/tradeflowkit-db-init.ts', 'uq_tfk_workflows_tenant_id'],
  ['apps/api/src/lib/tradeflowkit-db-init.ts', 'uq_tfk_workflow_stages_tenant_id'],
  ['apps/api/src/lib/snapproofos-phase32-db-init.ts', 'uq_snapproof_labor_tenant_id'],
  ['apps/api/src/lib/snapproofos-phase32-db-init.ts', 'uq_snapproof_part_tenant_id'],
  ['apps/api/src/lib/snapproofos-phase32-db-init.ts', 'uq_snapproof_share_tenant_id'],
  ['apps/api/src/lib/snapproofos-phase32-db-init.ts', 'uq_snapproof_customer_tenant_id'],
  ['apps/api/src/lib/ninja-launch-kit-phase34-db-init.ts', 'uq_launchkit_brand_tenant_id'],
  ['apps/api/src/lib/ninja-launch-kit-phase34-db-init.ts', 'uq_launchkit_product_tenant_id'],
  ['apps/api/src/lib/ninjamation-phase36-db-init.ts', 'uq_ninjamation_sync_tenant_id'],
] as const;

test('publish-sensitive tenant identity constraints retain production-compatible order', () => {
  for (const [path, constraint] of definitions) {
    const source = readFileSync(resolve(root, path), 'utf8');
    assert.match(
      source,
      new RegExp(`CONSTRAINT\\s+${constraint}\\s+UNIQUE\\s*\\(id\\s*,\\s*tenant_id\\s*\\)`),
      `${constraint} must remain ordered as (id, tenant_id)`,
    );
    assert.doesNotMatch(
      source,
      new RegExp(`CONSTRAINT\\s+${constraint}\\s+UNIQUE\\s*\\(tenant_id\\s*,\\s*id\\s*\\)`),
      `${constraint} must not reintroduce the publish-time order drift`,
    );
  }
});

test('CallCommand action-run tenant key is a constraint before dependent foreign keys', () => {
  const phase35 = readFileSync(
    resolve(root, 'apps/api/src/lib/callcommand-phase35-db-init.ts'),
    'utf8',
  );
  const commercial = readFileSync(
    resolve(root, 'apps/api/src/lib/callcommand-commercial-db-init.ts'),
    'utf8',
  );
  const actionRunTable = phase35.match(
    /CREATE TABLE IF NOT EXISTS callcommand_action_runs\s*\([\s\S]*?\n\s{4}\);/,
  )?.[0];

  assert.ok(actionRunTable, 'callcommand_action_runs table definition must remain present');
  assert.match(
    actionRunTable,
    /CONSTRAINT\s+uq_callcommand_action_tenant_id\s+UNIQUE\s*\(tenant_id\s*,\s*id\s*\)/,
    'clean databases must create the composite referenced key with the parent table',
  );
  assert.doesNotMatch(
    commercial,
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_callcommand_action_tenant_id/i,
    'the referenced key must not regress to a separately scheduled unique index',
  );

  const constraintPosition = commercial.indexOf(
    'ADD CONSTRAINT uq_callcommand_action_tenant_id',
  );
  const firstDependentPosition = commercial.indexOf(
    'ADD CONSTRAINT callcommand_ticket_action_run_fk',
  );
  assert.ok(constraintPosition >= 0, 'existing databases must promote or add the named unique constraint');
  assert.ok(firstDependentPosition >= 0, 'the dependent ticket foreign key must remain present');
  assert.ok(
    constraintPosition < firstDependentPosition,
    'the parent unique constraint must be established before dependent action-run foreign keys',
  );
});
