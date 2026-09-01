process.env.SESSION_SECRET ||= 'operatoros-callcommand-action-reservation-recovery-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { createHash, randomInt } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules } from '../src/schema.js';
import { dispatchCallCommandActions } from '../src/routes/callcommand-phase35-routes.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';

type User = Awaited<ReturnType<typeof createTestUser>>;
type Row = Record<string, any>;

const PHONE = `+1555${String(randomInt(100_000, 999_999)).padStart(7, '0')}`;
let owner: User;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let profileId = '';
let channelId = '';
let call: Row;

async function cleanupTenant(tenantId: string) {
  await db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL operatoros.allow_callcommand_usage_delete='on'`));
    await tx.execute(sql`UPDATE callcommand_calls SET capacity_lease_id=NULL WHERE tenant_id=${tenantId}`);
    for (const table of [
      'callcommand_usage_events', 'callcommand_transfer_logs', 'callcommand_reports', 'callcommand_flow_traces',
      'callcommand_tickets', 'callcommand_leads', 'callcommand_tasks', 'callcommand_action_runs',
      'callcommand_ingestion_events', 'callcommand_live_sessions', 'callcommand_lane_leases',
      'callcommand_events', 'callcommand_followups', 'callcommand_calls', 'callcommand_consents',
      'callcommand_agent_knowledge', 'callcommand_automation_rules', 'callcommand_transfer_targets',
      'callcommand_channels', 'callcommand_flow_versions', 'callcommand_flows',
      'callcommand_capacity_entitlements', 'callcommand_tenant_runtime_settings', 'callcommand_profiles',
      'shared_usage_events', 'shared_activity_events',
    ]) {
      await tx.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${tenantId.replaceAll("'", "''")}'`));
    }
  });
}

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  const [existingModule] = await db.select().from(modules).where(eq(modules.slug, 'callcommand-ai')).limit(1);
  moduleRow = existingModule ?? await createTestModule('callcommand-ai');
  createdModule = !existingModule;

  const profile = await db.execute(sql`
    INSERT INTO callcommand_profiles(
      tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,product_mode,business_name
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('reservation-profile')},'receptionist',
      'Welcome.','[]'::jsonb,'active','general','Reservation Recovery Works'
    ) RETURNING id
  `);
  profileId = String(profile.rows[0].id);
  const channel = await db.execute(sql`
    INSERT INTO callcommand_channels(
      tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,status,
      profile_id,product_mode,routing_mode
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('reservation-channel')},${PHONE},'UTC',
      'Consent is not required.',FALSE,'active',${profileId},'general','general'
    ) RETURNING id
  `);
  channelId = String(channel.rows[0].id);
  const createdCall = await db.execute(sql`
    INSERT INTO callcommand_calls(
      tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,
      direction,purpose,provider,status,idempotency_key,recording_status,priority
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${channelId},${profileId},
      ${createHash('sha256').update(PHONE).digest('hex')},${`***${PHONE.slice(-4)}`},${PHONE},
      'inbound','support','simulator','in_progress',${uniqueId('reservation-call')},'disabled','low'
    ) RETURNING *
  `);
  call = createdCall.rows[0] as Row;
});

after(async () => {
  if (owner) await cleanupTenant(owner.currentTenantId);
  if (owner) await cleanupUser(owner.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('expired running business-action reservation becomes outcome-unknown without replaying or reporting the side effect', async () => {
  const idempotencyKey = `${call.id}:flow:0:priority`;
  const reserved = await db.execute(sql`
    INSERT INTO callcommand_action_runs(
      tenant_id,call_id,action_type,status,idempotency_key,provider,safe_result,attempts,
      reservation_status,reserved_at,lease_expires_at
    ) VALUES (
      ${owner.currentTenantId},${call.id},'priority','running',${idempotencyKey},'operatoros','{}'::jsonb,1,
      'claimed',NOW()-INTERVAL '3 minutes',NOW()-INTERVAL '1 minute'
    ) RETURNING id
  `);
  const actionRunId = String(reserved.rows[0].id);

  const results = await dispatchCallCommandActions({
    tenantId: owner.currentTenantId,
    userId: owner.id,
    call,
    actions: [{ actionType: 'priority', priority: 'urgent' }],
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, actionRunId);
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].reservationStatus, 'failed');
  assert.equal(results[0].errorCode, 'CALLCOMMAND_ACTION_OUTCOME_UNKNOWN');
  assert.deepEqual(results[0].safeResult, { providerActionConfirmed: false, outcomeUnknown: true });
  assert.notEqual(results[0].status, 'completed');
  assert.notEqual(results[0].status, 'delivered');
  assert.notEqual(results[0].status, 'queued');

  const persisted = (await db.execute(sql`
    SELECT status,reservation_status,error_code,safe_result,attempts,lease_expires_at,completed_at
    FROM callcommand_action_runs
    WHERE tenant_id=${owner.currentTenantId} AND id=${actionRunId}
  `)).rows[0] as Row;
  assert.equal(persisted.status, 'failed');
  assert.equal(persisted.reservation_status, 'failed');
  assert.equal(persisted.error_code, 'CALLCOMMAND_ACTION_OUTCOME_UNKNOWN');
  assert.deepEqual(persisted.safe_result, { providerActionConfirmed: false, outcomeUnknown: true });
  assert.equal(Number(persisted.attempts), 1, 'an expired unknown-outcome reservation must not be attempted again');
  assert.equal(persisted.lease_expires_at, null);
  assert.ok(persisted.completed_at);

  const calls = await db.execute(sql`
    SELECT priority FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND id=${call.id}
  `);
  assert.equal(calls.rows[0].priority, 'low', 'the duplicate priority side effect must not be replayed');
  const reservations = await db.execute(sql`
    SELECT id FROM callcommand_action_runs
    WHERE tenant_id=${owner.currentTenantId} AND idempotency_key=${idempotencyKey}
  `);
  assert.equal(reservations.rows.length, 1, 'the duplicate must not create a second reservation');
});
