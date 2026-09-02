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