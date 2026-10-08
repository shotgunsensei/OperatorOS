process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'synthetic-ai-upgrade-session-secret-at-least-32-bytes';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { db, closeDatabasePool } from '../src/db.js';
import { assertDisposableDatabaseEnvironment, stripExternalProviderEnvironment } from '../../../scripts/parity/lib/database.mjs';
import { createTestUser } from './_setup.js';
import { applyOperatorOSDatabaseRelease, verifyOperatorOSDatabaseRelease } from '../src/lib/database-release.js';

// This ordered upgrade test requires its own fresh, marked loopback database.
// Export the real v65 source with git archive into the ignored fixture path.
assertDisposableDatabaseEnvironment(process.env);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'build/ai-review/v65-source');
const contract = readFileSync(resolve(fixture, 'apps/api/src/lib/database-release-contract.ts'), 'utf8');
assert.match(contract, /releaseVersion: 65,/);
assert.doesNotMatch(contract, /shared_ai_budget_tables/);
after(async () => { await closeDatabasePool(); });

test('real populated v65 upgrades twice to verified v66 without losing authority, billing, work or usage', async () => {
  assert.equal((await db.execute(sql`SELECT to_regclass('public.users') AS table_name`)).rows[0].table_name, null);
  const applyLegacy = () => spawnSync(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'),
    resolve(fixture, 'apps/api/src/scripts/database-release.ts'), '--apply'], {
    cwd: fixture, encoding: 'utf8', timeout: 60_000,
    env: { ...stripExternalProviderEnvironment(process.env), OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
      OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL: 'synthetic-upgrade-owner@example.test' },
  });
  const legacy = applyLegacy();
  assert.equal(legacy.status, 0, legacy.stderr + legacy.stdout.slice(-2000));
  assert.match(legacy.stdout, /complete techdeck_resolution_semantic_tables/);
  assert.equal((await db.execute(sql`SELECT to_regclass('public.shared_ai_requests') AS table_name`)).rows[0].table_name, null);
  const actors = [await createTestUser(), await createTestUser()];
  const module = (await db.execute(sql`SELECT id FROM modules WHERE slug='techdeck'`)).rows[0];
  const plan = (await db.execute(sql`SELECT id FROM subscription_plans ORDER BY id LIMIT 1`)).rows[0];
  for (const actor of actors) {
    await db.execute(sql`INSERT INTO tenant_modules(tenant_id,module_id,status,source,allow_all_members)
      VALUES (${actor.currentTenantId},${module.id},'enabled','admin',true)`);
    await db.execute(sql`INSERT INTO subscriptions(user_id,plan_id,status,tenant_id,scope_type)
      VALUES (${actor.id},${plan.id},'active',${actor.currentTenantId},'tenant')`);
    await db.execute(sql`INSERT INTO techdeck_tickets(tenant_id,number,created_by_user_id,title,description)
      VALUES (${actor.currentTenantId},1,${actor.id},'Synthetic upgrade ticket','Synthetic evidence only')`);
    await db.execute(sql`INSERT INTO shared_usage_events(tenant_id,module_id,user_id,operation,units,unit_kind,idempotency_key,metadata_json)
      VALUES (${actor.currentTenantId},${module.id},${actor.id},'synthetic.legacy.ai',37,'tokens','synthetic-v65-usage',
      '{"synthetic":true}'::jsonb)`);
  }
  // Converge the existing v65 free-account backfill before taking the upgrade
  // snapshot. It is an existing v65 operation, not a change introduced by v66.
  const populatedLegacy = applyLegacy();
  assert.equal(populatedLegacy.status, 0, populatedLegacy.stderr + populatedLegacy.stdout.slice(-2000));
  assert.equal((await db.execute(sql`SELECT to_regclass('public.shared_ai_requests') AS table_name`)).rows[0].table_name, null);
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of ['users','tenants','tenant_users','tenant_modules','subscriptions','techdeck_tickets','shared_usage_events']) {
      // Constant table names, full snapshots of disposable synthetic fixture data.
      result[table] = (await db.execute(sql.raw(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`))).rows;
    }
    return result;
  };
  const original = await snapshot();
  const applied: string[] = [];
  await applyOperatorOSDatabaseRelease(({ phase, step }) => { if (phase === 'complete') applied.push(step.id); });
  assert.equal(applied.length, 66); assert.equal(applied[65], 'shared_ai_budget_tables');
  await verifyOperatorOSDatabaseRelease();
  assert.deepEqual(await snapshot(), original);
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM shared_ai_budget_policies`)).rows[0].n, 0);
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM shared_ai_requests`)).rows[0].n, 0);
  await applyOperatorOSDatabaseRelease(); await verifyOperatorOSDatabaseRelease();
  assert.deepEqual(await snapshot(), original);
  // Defaults and constraints still deny spending after upgrade, with no seeds.
  await db.execute(sql`INSERT INTO shared_ai_budget_policies(tenant_id,module_id)
    VALUES (${actors[0].currentTenantId},${module.id})`);
  const policy = (await db.execute(sql`SELECT enabled,per_call_micros,daily_micros,monthly_micros
    FROM shared_ai_budget_policies WHERE tenant_id=${actors[0].currentTenantId}`)).rows[0];
  assert.deepEqual(policy, { enabled: false, per_call_micros: '0', daily_micros: '0', monthly_micros: '0' });
  await assert.rejects(db.execute(sql`UPDATE shared_ai_budget_policies SET per_call_micros=1
    WHERE tenant_id=${actors[0].currentTenantId}`));
  const invalidConstraints = (await db.execute(sql`SELECT count(*)::int AS n FROM pg_constraint
    WHERE conrelid IN ('shared_ai_budget_policies'::regclass,'shared_ai_requests'::regclass) AND NOT convalidated`)).rows[0].n;
  assert.equal(invalidConstraints, 0);
});
