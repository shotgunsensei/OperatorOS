process.env.SESSION_SECRET ||= 'operatoros-callcommand-commercial-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  acquireCallCommandLane,
  reconcileCallCommandRealtimeUsage,
  reconcileCallCommandTerminalUsage,
  releaseCallCommandLane,
  requireCallCommandTenantMember,
} from '../src/lib/callcommand-capacity.js';
import { cleanupUser, createTestUser, ensureSchemaReady, uniqueId } from './_setup.js';

type User = Awaited<ReturnType<typeof createTestUser>>;
let ownerA: User;
let ownerB: User;
let profileA = '';
let profileB = '';
let channelA = '';
let channelB = '';
let phoneCounter = 3000;

async function createProfileAndChannel(user: User) {
  const profile = await db.execute(sql`
    INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,status)
    VALUES (${user.currentTenantId},${user.id},${uniqueId('commercial-profile')},'receptionist','Hello','active')
    RETURNING id
  `);
  const phone = `+155501${String(phoneCounter++).padStart(4, '0')}`;
  const channel = await db.execute(sql`
    INSERT INTO callcommand_channels(
      tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,status,profile_id
    ) VALUES (
      ${user.currentTenantId},${user.id},${uniqueId('commercial-channel')},${phone},
      'America/New_York','Consent required','active',${String(profile.rows[0].id)}
    ) RETURNING id
  `);
  return { profileId: String(profile.rows[0].id), channelId: String(channel.rows[0].id) };
}

async function createCall(user: User, profileId: string, channelId: string, suffix: string) {
  const created = await db.execute(sql`
    INSERT INTO callcommand_calls(
      tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,
      direction,purpose,provider,status,idempotency_key,recording_status
    ) VALUES (
      ${user.currentTenantId},${user.id},${channelId},${profileId},${'a'.repeat(64)},'***-0100','+15555550100',
      'inbound','support','test','in_progress',${uniqueId(`commercial-call-${suffix}`)},'disabled'
    ) RETURNING id
  `);
  return String(created.rows[0].id);
}

async function cleanupTenant(tenantId: string) {
  await db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL operatoros.allow_callcommand_usage_delete='on'`));
    await tx.execute(sql.raw(`UPDATE callcommand_calls SET capacity_lease_id=NULL WHERE tenant_id='${tenantId.replaceAll("'", "''")}'`));
    for (const table of [
      'callcommand_usage_events', 'callcommand_ingestion_events', 'callcommand_transfer_verifications', 'callcommand_agent_knowledge',
      'callcommand_number_orders', 'callcommand_tickets', 'callcommand_leads', 'callcommand_tasks',
      'callcommand_action_runs', 'callcommand_lane_leases', 'callcommand_capacity_entitlements',
      'callcommand_tenant_runtime_settings', 'callcommand_telephony_accounts', 'callcommand_live_sessions',
      'callcommand_calls', 'callcommand_channels', 'callcommand_transfer_targets', 'callcommand_profiles',
    ]) {
      await tx.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${tenantId.replaceAll("'", "''")}'`));
    }
  });
}

before(async () => {
  await ensureSchemaReady();
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  ({ profileId: profileA, channelId: channelA } = await createProfileAndChannel(ownerA));
  ({ profileId: profileB, channelId: channelB } = await createProfileAndChannel(ownerB));
  await db.execute(sql`
    INSERT INTO callcommand_tenant_runtime_settings(
      tenant_id,overflow_policy,default_lease_seconds,maximum_lease_seconds
    ) VALUES
      (${ownerA.currentTenantId},'refuse',120,600),
      (${ownerB.currentTenantId},'voicemail',120,600)
  `);
  await db.execute(sql`
    INSERT INTO callcommand_capacity_entitlements(
      tenant_id,base_lanes,additional_lanes,pending_additional_lanes,billing_status,
      current_period_start,current_period_end
    ) VALUES
      (${ownerA.currentTenantId},1,1,9,'active',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days'),
      (${ownerB.currentTenantId},1,0,0,'active',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days')
  `);
});

after(async () => {
  if (ownerA) await cleanupTenant(ownerA.currentTenantId);
  if (ownerB) await cleanupTenant(ownerB.currentTenantId);
  if (ownerA) await cleanupUser(ownerA.id);
  if (ownerB) await cleanupUser(ownerB.id);
});

test('N settled lanes admit N concurrent calls and N+1 is refused without counting pending lanes', async () => {
  const calls = await Promise.all([
    createCall(ownerA, profileA, channelA, 'n1'),
    createCall(ownerA, profileA, channelA, 'n2'),
    createCall(ownerA, profileA, channelA, 'n3'),
  ]);
  const admitted = await Promise.all(calls.slice(0, 2).map((callId, index) => acquireCallCommandLane({
    tenantId: ownerA.currentTenantId,
    callId,
    idempotencyKey: `lane-n-${index}`,
  })));
  assert.deepEqual(admitted.map(item => item.admitted), [true, true]);
  assert.deepEqual(admitted.map(item => Number(item.lease?.lane_number)).sort(), [1, 2]);
  const overflow = await acquireCallCommandLane({
    tenantId: ownerA.currentTenantId,
    callId: calls[2],
    idempotencyKey: 'lane-n-overflow',
  });
  assert.equal(overflow.admitted, false);
  assert.equal(overflow.code, 'CAPACITY_EXHAUSTED');
  assert.equal(overflow.overflowPolicy, 'refuse');
  for (const callId of calls.slice(0, 2)) {
    await releaseCallCommandLane({ tenantId: ownerA.currentTenantId, callId, reason: 'test_complete' });
  }
});

test('acquire and release are idempotent and tenant lanes remain isolated', async () => {
  const callA = await createCall(ownerA, profileA, channelA, 'idempotent-a');
  const callB = await createCall(ownerB, profileB, channelB, 'idempotent-b');
  const first = await acquireCallCommandLane({
    tenantId: ownerA.currentTenantId, callId: callA, idempotencyKey: 'lane-idempotent-a',
  });
  const replay = await acquireCallCommandLane({
    tenantId: ownerA.currentTenantId, callId: callA, idempotencyKey: 'lane-idempotent-a',
  });
  const tenantB = await acquireCallCommandLane({
    tenantId: ownerB.currentTenantId, callId: callB, idempotencyKey: 'lane-idempotent-b',
  });
  assert.equal(String(first.lease?.id), String(replay.lease?.id));
  assert.equal(replay.duplicate, true);
  assert.equal(Number(first.lease?.lane_number), 1);
  assert.equal(Number(tenantB.lease?.lane_number), 1);
  await assert.rejects(
    acquireCallCommandLane({ tenantId: ownerA.currentTenantId, callId: callB, idempotencyKey: 'cross-tenant-call' }),
    /Call was not found/,
  );
  const released = await releaseCallCommandLane({ tenantId: ownerA.currentTenantId, callId: callA, reason: 'completed' });
  const releaseReplay = await releaseCallCommandLane({ tenantId: ownerA.currentTenantId, callId: callA, reason: 'completed' });
  assert.equal(released.released, true);
  assert.equal(released.duplicate, false);
  assert.equal(releaseReplay.released, true);
  assert.equal(releaseReplay.duplicate, true);
  await releaseCallCommandLane({ tenantId: ownerB.currentTenantId, callId: callB, reason: 'completed' });
});

test('stale leases expire under the tenant lock and the lowest lane is recovered', async () => {
  await db.execute(sql`
    UPDATE callcommand_capacity_entitlements SET additional_lanes=0 WHERE tenant_id=${ownerA.currentTenantId}
  `);
  const staleCall = await createCall(ownerA, profileA, channelA, 'stale');
  const nextCall = await createCall(ownerA, profileA, channelA, 'stale-next');
  const stale = await acquireCallCommandLane({
    tenantId: ownerA.currentTenantId, callId: staleCall, idempotencyKey: 'lane-stale',
  });
  await db.execute(sql`
    UPDATE callcommand_lane_leases
    SET acquired_at=NOW()-INTERVAL '10 minutes',expires_at=NOW()-INTERVAL '1 second'
    WHERE tenant_id=${ownerA.currentTenantId} AND id=${String(stale.lease?.id)}
  `);
  const recovered = await acquireCallCommandLane({
    tenantId: ownerA.currentTenantId, callId: nextCall, idempotencyKey: 'lane-stale-next',
  });
  assert.equal(recovered.admitted, true);
  assert.equal(Number(recovered.lease?.lane_number), 1);
  const expired = await db.execute(sql`
    SELECT status FROM callcommand_lane_leases WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${staleCall}
  `);
  assert.equal(expired.rows[0].status, 'expired');
  await releaseCallCommandLane({ tenantId: ownerA.currentTenantId, callId: nextCall, reason: 'completed' });
  await db.execute(sql`
    UPDATE callcommand_capacity_entitlements SET additional_lanes=1 WHERE tenant_id=${ownerA.currentTenantId}
  `);
});

test('terminal reconciliation releases capacity and inserts one immutable usage event', async () => {
  const callId = await createCall(ownerA, profileA, channelA, 'terminal');
  const admitted = await acquireCallCommandLane({
    tenantId: ownerA.currentTenantId, callId, idempotencyKey: 'lane-terminal',
  });
  assert.equal(admitted.admitted, true);
  const input = {
    tenantId: ownerA.currentTenantId,
    callId,
    terminalEventId: 'provider-terminal-1',
    providerSequence: 10,
    providerOutcome: 'completed' as const,
    usage: {
      startedAt: '2026-08-31T12:00:00.000Z',
      answeredAt: '2026-08-31T12:00:05.000Z',
      endedAt: '2026-08-31T12:01:35.000Z',
      telephonyRateMinorPerMinute: 3,
      aiInputTokens: 1_000_000,
      aiOutputTokens: 500_000,
      aiInputMinorPerMillion: 2,
      aiOutputMinorPerMillion: 4,
    },
  };
  const first = await reconcileCallCommandTerminalUsage(input);
  const replay = await reconcileCallCommandTerminalUsage(input);
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(Number(first.call?.duration_seconds), 95);
  assert.equal(Number(first.call?.billable_seconds), 90);
  assert.equal(Number(first.call?.telephony_cost_minor), 6);
  assert.equal(Number(first.call?.ai_cost_minor), 4);
  const events = await db.execute(sql`
    SELECT * FROM callcommand_usage_events WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${callId}
  `);
  assert.equal(events.rows.length, 1);
  await assert.rejects(db.execute(sql`
    UPDATE callcommand_usage_events SET quantity=999 WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${callId}
  `), (error: unknown) => /append-only/.test(String((error as { cause?: Error }).cause?.message)));
  const lease = await db.execute(sql`
    SELECT status FROM callcommand_lane_leases WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${callId}
  `);
  assert.equal(lease.rows[0].status, 'released');
});

test('Realtime response usage increments exactly once and appends only a late terminal correction', async () => {
  const callId = await createCall(ownerA, profileA, channelA, 'realtime-usage');
  const first = await reconcileCallCommandRealtimeUsage({
    tenantId: ownerA.currentTenantId, callId, providerEventId: 'realtime-response-1',
    model: 'gpt-realtime-2.1-mini', inputTokens: 1_000, outputTokens: 500,
  });
  const replay = await reconcileCallCommandRealtimeUsage({
    tenantId: ownerA.currentTenantId, callId, providerEventId: 'realtime-response-1',
    model: 'gpt-realtime-2.1-mini', inputTokens: 1_000, outputTokens: 500,
  });
  await reconcileCallCommandRealtimeUsage({
    tenantId: ownerA.currentTenantId, callId, providerEventId: 'realtime-response-2',
    model: 'gpt-realtime-2.1-mini', inputTokens: 1_000, outputTokens: 0,
  });
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  let call = (await db.execute(sql`
    SELECT ai_input_tokens,ai_output_tokens,ai_cost_minor,total_cost_minor
    FROM callcommand_calls WHERE tenant_id=${ownerA.currentTenantId} AND id=${callId}
  `)).rows[0];
  assert.equal(Number(call.ai_input_tokens), 2_000);
  assert.equal(Number(call.ai_output_tokens), 500);
  assert.equal(Number(call.ai_cost_minor), 3);
  assert.equal(Number((await db.execute(sql`
    SELECT count(*)::int AS count FROM callcommand_usage_events
    WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${callId}
  `)).rows[0].count), 0);

  await reconcileCallCommandTerminalUsage({
    tenantId: ownerA.currentTenantId, callId, terminalEventId: 'realtime-terminal-1',
    providerSequence: 1, providerOutcome: 'completed',
    usage: {
      startedAt: '2026-08-31T12:00:00.000Z', answeredAt: '2026-08-31T12:00:00.000Z',
      endedAt: '2026-08-31T12:01:00.000Z', providerCostMinor: 2,
      aiInputTokens: 2_000, aiOutputTokens: 500,
      aiInputMinorPerMillion: 1_000, aiOutputMinorPerMillion: 2_000,
    },
  });
  await reconcileCallCommandRealtimeUsage({
    tenantId: ownerA.currentTenantId, callId, providerEventId: 'realtime-response-late',
    model: 'gpt-realtime-2.1-mini', inputTokens: 1_000, outputTokens: 0,
  });
  call = (await db.execute(sql`
    SELECT ai_input_tokens,ai_output_tokens,telephony_cost_minor,ai_cost_minor,total_cost_minor
    FROM callcommand_calls WHERE tenant_id=${ownerA.currentTenantId} AND id=${callId}
  `)).rows[0];
  assert.equal(Number(call.ai_input_tokens), 3_000);
  assert.equal(Number(call.ai_output_tokens), 500);
  assert.equal(Number(call.telephony_cost_minor), 2);
  assert.equal(Number(call.ai_cost_minor), 4);
  assert.equal(Number(call.total_cost_minor), 6);
  const ledger = await db.execute(sql`
    SELECT event_type,ai_cost_minor,total_cost_minor FROM callcommand_usage_events
    WHERE tenant_id=${ownerA.currentTenantId} AND call_id=${callId} ORDER BY created_at,id
  `);
  assert.deepEqual(ledger.rows.map(row => String(row.event_type)), ['call.terminal', 'call.realtime_usage_correction']);
  assert.equal(ledger.rows.reduce((sum, row) => sum + Number(row.ai_cost_minor), 0), 4);
});

test('tenant-member validation rejects foreign users and honors role narrowing', async () => {
  const member = await requireCallCommandTenantMember({
    tenantId: ownerA.currentTenantId, userId: ownerA.id, allowedRoles: ['owner'],
  });
  assert.equal(member.role, 'owner');
  await assert.rejects(
    requireCallCommandTenantMember({ tenantId: ownerA.currentTenantId, userId: ownerB.id }),
    /Tenant member was not found/,
  );
  await assert.rejects(
    requireCallCommandTenantMember({ tenantId: ownerA.currentTenantId, userId: ownerA.id, allowedRoles: ['viewer'] }),
    /Tenant member was not found/,
  );
});

test('an existing tenant call receives the included base lane when no add-on projection exists', async () => {
  await db.execute(sql`DELETE FROM callcommand_capacity_entitlements WHERE tenant_id=${ownerB.currentTenantId}`);
  const callId = await createCall(ownerB, profileB, channelB, 'included-base-default');
  const admitted = await acquireCallCommandLane({
    tenantId: ownerB.currentTenantId,
    callId,
    idempotencyKey: 'included-base-without-projection',
  });
  assert.equal(admitted.admitted, true);
  assert.equal(Number(admitted.lease?.lane_number), 1);
  await releaseCallCommandLane({ tenantId: ownerB.currentTenantId, callId, reason: 'test_complete' });
});
