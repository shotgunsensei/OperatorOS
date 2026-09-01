process.env.SESSION_SECRET ||= 'operatoros-callcommand-realtime-route-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules } from '../src/schema.js';
import {
  __setCallCommandRealtimeAdapterFactoryForTests,
  registerCallCommandRealtimeRoutes,
} from '../src/routes/callcommand-realtime-routes.js';
import type {
  RealtimeAcceptInput,
  RealtimeSidebandCallbacks,
  VerifiedOpenAiIncomingCall,
} from '../src/lib/callcommand-realtime.js';
import { closeCallCommandRealtimeSideband } from '../src/lib/callcommand-realtime-session-registry.js';
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

const ROUTE = '/v1/modules/callcommand-ai/openai/realtime/incoming';
const WEBHOOK_SIGNATURE = 'signed-callcommand-realtime-test';
const PHONE_SEED = randomInt(100_000, 899_999);
const phone = (offset: number) => `+1555${String(PHONE_SEED + offset).padStart(7, '0')}`;
const providerSid = (marker: string) => `CA${createHash('sha256').update(`${PHONE_SEED}:${marker}`).digest('hex').slice(0, 32)}`;
const openAiCallId = (marker: string) => `call_${createHash('sha256').update(`openai:${PHONE_SEED}:${marker}`).digest('hex').slice(0, 24)}`;
const routeToken = (callId: string) => `route-test-${callId}`;

let app: ReturnType<typeof Fastify>;
let owner: User;
let profileId = '';
let flowId = '';
let activeChannelId = '';
let inactiveChannelId = '';
let unreadyChannelId = '';
let primaryCallId = '';
let noLaneCallId = '';
let inactiveCallId = '';
let unreadyCallId = '';
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;

const accepted: Array<{ openAiCallId: string; input: RealtimeAcceptInput }> = [];
const rejected: Array<{ openAiCallId: string; statusCode: number }> = [];
const hungUp: string[] = [];
const sidebandOpenFailures = new Set<string>();
const verifiedRoutes: Array<{ internalCallId: string; sid: string; token: string }> = [];
const unwrappedCalls: VerifiedOpenAiIncomingCall[] = [];
const sidebands: Array<{
  openAiCallId: string;
  allowedToolNames: readonly string[];
  callbacks: RealtimeSidebandCallbacks;
}> = [];

function signedEnvelope(input: {
  eventId: string;
  openAiCallId: string;
  internalCallId: string;
  nonce?: string;
}) {
  return {
    eventId: input.eventId,
    openAiCallId: input.openAiCallId,
    internalCallId: input.internalCallId,
    routeToken: routeToken(input.internalCallId),
    nonce: input.nonce ?? 'original',
  };
}

async function injectSigned(payload: ReturnType<typeof signedEnvelope>) {
  return app.inject({
    method: 'POST',
    url: ROUTE,
    headers: {
      'content-type': 'application/json',
      'webhook-signature': WEBHOOK_SIGNATURE,
    },
    payload,
  });
}

async function createCall(input: {
  channelId: string;
  marker: string;
  withLease?: boolean;
}) {
  const sid = providerSid(input.marker);
  const caller = phone(20 + input.marker.charCodeAt(0));
  const fingerprint = createHash('sha256').update(caller).digest('hex');
  const consent = await db.execute(sql`
    INSERT INTO callcommand_consents(
      tenant_id,recorded_by_user_id,phone_fingerprint,phone_masked,phone_e164,purpose,source,evidence
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${fingerprint},${`***${caller.slice(-4)}`},${caller},
      'support','realtime_route_test','Signed consent fixture for Realtime transcript persistence.'
    ) RETURNING id
  `);
  const created = await db.execute(sql`
    INSERT INTO callcommand_calls(
      tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,
      direction,purpose,provider,provider_call_sid,status,idempotency_key,started_at,realtime_status,consent_id
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${input.channelId},${profileId},
      ${fingerprint},${`***${caller.slice(-4)}`},${caller},
      'inbound','support','twilio',${sid},'ringing',${uniqueId(`realtime-${input.marker}`)},NOW(),'pending',${String(consent.rows[0].id)}
    ) RETURNING id
  `);
  const callId = String(created.rows[0].id);
  if (input.withLease) {
    await db.transaction(async tx => {
      const lease = await tx.execute(sql`
        INSERT INTO callcommand_lane_leases(
          tenant_id,call_id,lane_number,provider_call_sid,idempotency_key,status,expires_at
        ) VALUES (
          ${owner.currentTenantId},${callId},
          (SELECT COALESCE(MAX(lane_number),0)+1 FROM callcommand_lane_leases WHERE tenant_id=${owner.currentTenantId} AND status='active'),
          ${sid},${`realtime-lease:${callId}`},'active',NOW()+INTERVAL '10 minutes'
        ) RETURNING id
      `);
      await tx.execute(sql`
        UPDATE callcommand_calls SET capacity_lease_id=${String(lease.rows[0].id)}
        WHERE tenant_id=${owner.currentTenantId} AND id=${callId}
      `);
      await tx.execute(sql`
        INSERT INTO callcommand_live_sessions(
          tenant_id,call_id,channel_id,provider_call_sid,state,caller_phone_masked
        ) VALUES (${owner.currentTenantId},${callId},${input.channelId},${sid},'ringing',${`***${caller.slice(-4)}`})
      `);
    });
  }
  return callId;
}

async function cleanupTenant(tenantId: string) {
  await db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL operatoros.allow_callcommand_usage_delete='on'`));
    await tx.execute(sql`UPDATE callcommand_calls SET capacity_lease_id=NULL WHERE tenant_id=${tenantId}`);
    for (const table of [
      'callcommand_usage_events', 'callcommand_transfer_logs', 'callcommand_reports', 'callcommand_flow_traces',
      'callcommand_tickets', 'callcommand_leads', 'callcommand_tasks', 'callcommand_action_runs',
      'callcommand_ingestion_events', 'callcommand_live_sessions', 'callcommand_lane_leases',
      'callcommand_events', 'callcommand_followups', 'callcommand_calls', 'callcommand_agent_knowledge',
      'callcommand_consents',
      'callcommand_automation_rules', 'callcommand_transfer_targets', 'callcommand_channels',
      'callcommand_telephony_accounts', 'shared_secret_references',
      'callcommand_flow_versions', 'callcommand_flows', 'callcommand_capacity_entitlements',
      'callcommand_tenant_runtime_settings', 'callcommand_profiles', 'shared_usage_events', 'shared_activity_events',
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
  await db.insert(tenantModules).values({
    tenantId: owner.currentTenantId,
    moduleId: moduleRow.id,
    status: 'enabled',
    source: 'admin',
    allowAllMembers: true,
  });

  const profile = await db.execute(sql`
    INSERT INTO callcommand_profiles(
      tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,product_mode,
      business_name,business_description,advanced_prompt,voice_id,fallback_behavior
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('realtime-profile')},'receptionist',
      'Welcome to Realtime Route Works.','[]'::jsonb,'active','general',
      'Realtime Route Works','Tenant-owned appliance support.','Never disclose server-owned destinations.','marin','transfer'
    ) RETURNING id
  `);
  profileId = String(profile.rows[0].id);
  await db.execute(sql`
    INSERT INTO callcommand_agent_knowledge(
      tenant_id,profile_id,created_by_user_id,knowledge_type,title,content,priority
    ) VALUES (
      ${owner.currentTenantId},${profileId},${owner.id},'policy','Warranty policy',
      'Warranty appointments require the appliance serial number.',1
    )
  `);

  const flow = await db.execute(sql`
    INSERT INTO callcommand_flows(
      tenant_id,created_by_user_id,name,product_mode,status,active_version,start_node_key
    ) VALUES (${owner.currentTenantId},${owner.id},${uniqueId('realtime-flow')},'general','active',1,'start')
    RETURNING id
  `);
  flowId = String(flow.rows[0].id);
  await db.execute(sql`
    INSERT INTO callcommand_flow_versions(
      tenant_id,flow_id,version,graph_json,validation_json,published_by_user_id
    ) VALUES (
      ${owner.currentTenantId},${flowId},1,
      ${JSON.stringify({ nodes: [{ key: 'start', type: 'prompt', config: {} }], edges: [] })}::jsonb,
      '{"valid":true}'::jsonb,${owner.id}
    )
  `);

  const secret = await db.execute(sql`
    INSERT INTO shared_secret_references(
      tenant_id,module_id,purpose,ciphertext,iv,auth_tag,key_version,fingerprint,created_by_user_id
    ) VALUES (
      ${owner.currentTenantId},${moduleRow.id},'callcommand.realtime-test-credential',
      ${randomBytes(32)},${randomBytes(12)},${randomBytes(16)},'test-v1',
      ${createHash('sha256').update(`credential:${PHONE_SEED}`).digest('hex')},${owner.id}
    ) RETURNING id
  `);
  const account = await db.execute(sql`
    INSERT INTO callcommand_telephony_accounts(
      tenant_id,created_by_user_id,provider,account_mode,provider_account_sid,
      secret_reference_id,status,health_status,last_health_at,verified_at
    ) VALUES (
      ${owner.currentTenantId},${owner.id},'twilio','platform',
      ${`AC${createHash('sha256').update(`account:${PHONE_SEED}`).digest('hex').slice(0, 32)}`},
      ${String(secret.rows[0].id)},'active','healthy',NOW(),NOW()
    ) RETURNING id
  `);
  const telephonyAccountId = String(account.rows[0].id);

  const activeChannel = await db.execute(sql`
    INSERT INTO callcommand_channels(
      tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,status,
      profile_id,active_flow_id,product_mode,routing_mode,live_behavior
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('realtime-channel')},${phone(1)},'UTC','Consent required.',FALSE,'active',
      ${profileId},${flowId},'general','general','ai_screen_then_transfer'
    ) RETURNING id
  `);
  activeChannelId = String(activeChannel.rows[0].id);
  await db.execute(sql`
    UPDATE callcommand_channels SET
      telephony_account_id=${telephonyAccountId},
      provider_number_sid=${`PN${createHash('sha256').update(`number:active:${PHONE_SEED}`).digest('hex').slice(0, 32)}`},
      provider_number_status='active',health_status='healthy',provider_verified_at=NOW(),health_checked_at=NOW()
    WHERE tenant_id=${owner.currentTenantId} AND id=${activeChannelId}
  `);
  const inactiveChannel = await db.execute(sql`
    INSERT INTO callcommand_channels(
      tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,status,
      profile_id,active_flow_id,product_mode,routing_mode,live_behavior
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('realtime-inactive-channel')},${phone(2)},'UTC','Consent required.',FALSE,'paused',
      ${profileId},${flowId},'general','general','ai_receptionist'
    ) RETURNING id
  `);
  inactiveChannelId = String(inactiveChannel.rows[0].id);
  await db.execute(sql`
    UPDATE callcommand_channels SET
      telephony_account_id=${telephonyAccountId},
      provider_number_sid=${`PN${createHash('sha256').update(`number:inactive:${PHONE_SEED}`).digest('hex').slice(0, 32)}`},
      provider_number_status='active',health_status='healthy',provider_verified_at=NOW(),health_checked_at=NOW()
    WHERE tenant_id=${owner.currentTenantId} AND id=${inactiveChannelId}
  `);
  const unreadyChannel = await db.execute(sql`
    INSERT INTO callcommand_channels(
      tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,status,
      profile_id,active_flow_id,product_mode,routing_mode,live_behavior
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${uniqueId('realtime-unready-channel')},${phone(3)},'UTC','Consent required.',FALSE,'active',
      ${profileId},${flowId},'general','general','ai_receptionist'
    ) RETURNING id
  `);
  unreadyChannelId = String(unreadyChannel.rows[0].id);

  await db.execute(sql`
    INSERT INTO callcommand_tenant_runtime_settings(
      tenant_id,overflow_policy,default_lease_seconds,maximum_lease_seconds,realtime_enabled
    ) VALUES (${owner.currentTenantId},'refuse',120,600,TRUE)
  `);
  await db.execute(sql`
    INSERT INTO callcommand_automation_rules(
      tenant_id,created_by_user_id,name,priority,enabled,conditions_json,actions_json,managed_key
    ) VALUES
      (
        ${owner.currentTenantId},${owner.id},'Server-owned email route',1,TRUE,
        ${JSON.stringify({ channelId: activeChannelId })}::jsonb,
        ${JSON.stringify([{ actionType: 'email', enabled: true, destination: 'private-client@example.test' }])}::jsonb,
        ${`commercial_channel_alerts:${activeChannelId}`}
      ),
      (
        ${owner.currentTenantId},${owner.id},'Different channel webhook',2,TRUE,
        ${JSON.stringify({ channelId: inactiveChannelId })}::jsonb,
        ${JSON.stringify([{ actionType: 'webhook', enabled: true, endpointId: inactiveChannelId }])}::jsonb,
        ${`commercial_channel_alerts:${inactiveChannelId}`}
      )
  `);
  await db.execute(sql`
    INSERT INTO callcommand_transfer_targets(
      tenant_id,created_by_user_id,label,kind,phone_e164,verified_at,status
    ) VALUES (
      ${owner.currentTenantId},${owner.id},'On-call technician','external','+15559876543',NOW(),'active'
    )
  `);

  primaryCallId = await createCall({ channelId: activeChannelId, marker: 'primary', withLease: true });
  noLaneCallId = await createCall({ channelId: activeChannelId, marker: 'no-lane' });
  inactiveCallId = await createCall({ channelId: inactiveChannelId, marker: 'inactive' });
  unreadyCallId = await createCall({ channelId: unreadyChannelId, marker: 'unready', withLease: true });

  const fakeAdapter = {
    readiness: { ready: true as const, model: 'gpt-realtime-2.1-mini' as const },
    async unwrapIncomingCall(input: {
      rawBody: string | Buffer;
      headers: Record<string, string | string[] | undefined>;
    }): Promise<VerifiedOpenAiIncomingCall> {
      assert.equal(input.headers['webhook-signature'], WEBHOOK_SIGNATURE);
      const raw = Buffer.isBuffer(input.rawBody) ? input.rawBody.toString('utf8') : input.rawBody;
      const decoded = JSON.parse(raw) as ReturnType<typeof signedEnvelope>;
      const incoming = {
        eventId: decoded.eventId,
        createdAt: 1_788_000_000,
        openAiCallId: decoded.openAiCallId,
        internalCallId: decoded.internalCallId,
        routeToken: decoded.routeToken,
      };
      unwrappedCalls.push(incoming);
      return incoming;
    },
    verifyRouteToken(internalCallId: string, sid: string, token: string) {
      verifiedRoutes.push({ internalCallId, sid, token });
      return sid.startsWith('CA') && token === routeToken(internalCallId);
    },
    async accept(callId: string, input: RealtimeAcceptInput) {
      accepted.push({ openAiCallId: callId, input });
      return { ok: true as const, action: 'accept' as const, openAiCallId: callId };
    },
    async reject(callId: string, statusCode: 480 | 486 | 603) {
      rejected.push({ openAiCallId: callId, statusCode });
      return { ok: true as const, action: 'reject' as const, openAiCallId: callId };
    },
    async refer(callId: string) {
      return { ok: true as const, action: 'refer' as const, openAiCallId: callId };
    },
    async hangup(callId: string) {
      hungUp.push(callId);
      return { ok: true as const, action: 'hangup' as const, openAiCallId: callId };
    },
    connectSideband(input: {
      openAiCallId: string;
      allowedToolNames: readonly string[];
      callbacks: RealtimeSidebandCallbacks;
    }) {
      sidebands.push(input);
      return {
        close() { /* fake sideband has no external socket */ },
        async waitUntilOpen() {
          if (sidebandOpenFailures.has(input.openAiCallId)) {
            throw Object.assign(new Error('Synthetic socket open failure'), {
              code: 'CALLCOMMAND_REALTIME_SOCKET_OPEN_FAILED',
              statusCode: 503,
            });
          }
        },
      } as never;
    },
  };
  __setCallCommandRealtimeAdapterFactoryForTests(() => fakeAdapter);

  app = Fastify();
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    (request as typeof request & { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (error) {
      done(error as Error);
    }
  });
  await registerCallCommandRealtimeRoutes(app);
  await app.ready();
});

after(async () => {
  __setCallCommandRealtimeAdapterFactoryForTests(null);
  if (app) await app.close();
  if (owner) await cleanupTenant(owner.currentTenantId);
  if (owner) await db.delete(tenantModules).where(eq(tenantModules.tenantId, owner.currentTenantId));
  if (owner) await cleanupUser(owner.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('signed incoming call accepts once, replay is idempotent, conflict is fail-closed, and server tools hide destinations', async () => {
  const providerCall = openAiCallId('primary');
  const envelope = signedEnvelope({
    eventId: `evt_${PHONE_SEED}_primary`,
    openAiCallId: providerCall,
    internalCallId: primaryCallId,
  });
  const authorityFixture = await db.execute(sql`
    SELECT c.id,c.provider,c.direction,c.provider_call_sid,channel.id AS channel_id,profile.id AS profile_id
    FROM callcommand_calls c
    JOIN callcommand_channels channel ON channel.tenant_id=c.tenant_id AND channel.id=c.channel_id AND channel.deleted_at IS NULL
    JOIN callcommand_profiles profile ON profile.tenant_id=c.tenant_id AND profile.id=c.profile_id AND profile.deleted_at IS NULL
    JOIN modules module ON module.slug='callcommand-ai' AND module.status='live'
    JOIN tenant_modules tenant_module ON tenant_module.tenant_id=c.tenant_id
      AND tenant_module.module_id=module.id AND tenant_module.status='enabled'
    WHERE c.id=${primaryCallId} AND c.provider='twilio' AND c.direction='inbound'
  `);
  assert.equal(authorityFixture.rows.length, 1, JSON.stringify(authorityFixture.rows));
  const first = await injectSigned(envelope);
  assert.equal(first.statusCode, 200, `${first.body}; unwrapped=${JSON.stringify(unwrappedCalls)}; verified=${JSON.stringify(verifiedRoutes)}`);
  assert.deepEqual(first.json(), { ok: true, duplicate: false, providerActionConfirmed: true });
  assert.equal(accepted.length, 1);
  assert.equal(sidebands.length, 1);

  const replay = await injectSigned(envelope);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);
  assert.equal(accepted.length, 1, 'an exact replay must not accept the provider call twice');
  assert.equal(sidebands.length, 1, 'an exact replay must not create a second sideband');

  const conflict = await injectSigned({ ...envelope, nonce: 'different-raw-payload' });
  assert.equal(conflict.statusCode, 409, conflict.body);
  assert.equal(conflict.json().code, 'CALLCOMMAND_REALTIME_WEBHOOK_CONFLICT');
  assert.equal(accepted.length, 1);

  const acceptedConfig = accepted[0].input;
  assert.match(acceptedConfig.instructions, /Realtime Route Works/);
  assert.match(acceptedConfig.instructions, /Warranty appointments require the appliance serial number/);
  assert.deepEqual(acceptedConfig.tools.map(tool => tool.name).sort(), ['end_call', 'send_email', 'transfer_call']);
  assert.deepEqual([...sidebands[0].allowedToolNames].sort(), ['end_call', 'send_email', 'transfer_call']);
  const clientVisibleConfiguration = JSON.stringify({ acceptedConfig, allowed: sidebands[0].allowedToolNames });
  assert.doesNotMatch(clientVisibleConfiguration, /private-client@example\.test/);
  assert.doesNotMatch(clientVisibleConfiguration, /\+15559876543/);
  assert.doesNotMatch(clientVisibleConfiguration, /"to"\s*:/);

  await sidebands[0].callbacks.onTranscript?.({
    openAiCallId: providerCall,
    itemId: 'item_caller_1',
    role: 'caller',
    transcript: 'My refrigerator is not cooling.',
  });
  await sidebands[0].callbacks.onTranscript?.({
    openAiCallId: providerCall,
    itemId: 'item_assistant_1',
    role: 'assistant',
    transcript: 'I can help gather the appliance serial number.',
  });
  await sidebands[0].callbacks.onUsage?.({
    openAiCallId: providerCall,
    source: 'response',
    responseId: 'resp_tenant_scoped_1',
    inputTokens: 1_000,
    outputTokens: 500,
    totalTokens: 1_500,
  });
  await sidebands[0].callbacks.onCallbackError?.({
    openAiCallId: providerCall,
    callback: 'onUsage',
    code: 'CALLCOMMAND_REALTIME_CALLBACK_FAILED',
  });
  await sidebands[0].callbacks.onUsage?.({
    openAiCallId: providerCall,
    source: 'response',
    responseId: 'resp_tenant_scoped_1',
    inputTokens: 1_000,
    outputTokens: 500,
    totalTokens: 1_500,
  });

  const persistedCall = (await db.execute(sql`
    SELECT tenant_id,transcript,ai_input_tokens,ai_output_tokens,ai_cost_minor,total_cost_minor,realtime_status
    FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND id=${primaryCallId}
  `)).rows[0] as Row;
  assert.equal(persistedCall.tenant_id, owner.currentTenantId);
  assert.match(String(persistedCall.transcript), /\[Caller\] My refrigerator is not cooling\./);
  assert.match(String(persistedCall.transcript), /\[Assistant\] I can help gather the appliance serial number\./);
  assert.equal(Number(persistedCall.ai_input_tokens), 1_000);
  assert.equal(Number(persistedCall.ai_output_tokens), 500);
  assert.equal(Number(persistedCall.ai_cost_minor), 2);
  assert.equal(Number(persistedCall.total_cost_minor), 2);
  assert.equal(persistedCall.realtime_status, 'connected');
  const callbackFailure = await db.execute(sql`
    SELECT safe_payload FROM callcommand_events
    WHERE tenant_id=${owner.currentTenantId} AND call_id=${primaryCallId}
      AND event_type='provider.openai_realtime.callback_failed'
    ORDER BY created_at DESC,id DESC LIMIT 1
  `);
  assert.deepEqual((callbackFailure.rows[0] as Row).safe_payload, {
    provider: 'openai',callback: 'onUsage',code: 'CALLCOMMAND_REALTIME_CALLBACK_FAILED',
  });

  const facts = await db.execute(sql`
    SELECT tenant_id,source,provider_event_id,call_id FROM callcommand_ingestion_events
    WHERE source IN ('openai_realtime','openai_realtime_transcript','openai_realtime_usage')
      AND call_id=${primaryCallId}
    ORDER BY source,provider_event_id
  `);
  assert.equal(facts.rows.length, 4, 'one incoming, two transcript, and one idempotent usage fact should persist');
  assert.ok(facts.rows.every(row => row.tenant_id === owner.currentTenantId && row.call_id === primaryCallId));
  assert.equal(facts.rows.filter(row => row.source === 'openai_realtime_usage').length, 1);

  assert.equal(closeCallCommandRealtimeSideband(primaryCallId), true);
  const recovered = await injectSigned(envelope);
  assert.equal(recovered.statusCode, 200, recovered.body);
  assert.deepEqual(recovered.json(), { ok: true, duplicate: false, providerActionConfirmed: true });
  assert.equal(accepted.length, 1, 'a process-recovery replay must reattach without repeating provider acceptance');
  assert.equal(sidebands.length, 2, 'a persisted accepted call must recover one missing sideband');
  assert.equal(closeCallCommandRealtimeSideband(primaryCallId), true);
});

test('inactive, provider-unready, and missing-lane calls are rejected before provider acceptance', async () => {
  const noLaneProviderCall = openAiCallId('no-lane');
  const noLane = await injectSigned(signedEnvelope({
    eventId: `evt_${PHONE_SEED}_no_lane`,
    openAiCallId: noLaneProviderCall,
    internalCallId: noLaneCallId,
  }));
  assert.equal(noLane.statusCode, 409, noLane.body);
  assert.equal(noLane.json().code, 'CALLCOMMAND_REALTIME_CAPACITY_UNAVAILABLE');
  assert.ok(rejected.some(entry => entry.openAiCallId === noLaneProviderCall && entry.statusCode === 486));

  const inactiveProviderCall = openAiCallId('inactive');
  const inactive = await injectSigned(signedEnvelope({
    eventId: `evt_${PHONE_SEED}_inactive`,
    openAiCallId: inactiveProviderCall,
    internalCallId: inactiveCallId,
  }));
  assert.equal(inactive.statusCode, 409, inactive.body);
  assert.equal(inactive.json().code, 'CALLCOMMAND_REALTIME_CONFIGURATION_INACTIVE');
  assert.ok(rejected.some(entry => entry.openAiCallId === inactiveProviderCall && entry.statusCode === 603));

  const unreadyProviderCall = openAiCallId('unready');
  const unready = await injectSigned(signedEnvelope({
    eventId: `evt_${PHONE_SEED}_unready`,
    openAiCallId: unreadyProviderCall,
    internalCallId: unreadyCallId,
  }));
  assert.equal(unready.statusCode, 409, unready.body);
  assert.equal(unready.json().code, 'CALLCOMMAND_REALTIME_CONFIGURATION_INACTIVE');
  assert.ok(rejected.some(entry => entry.openAiCallId === unreadyProviderCall && entry.statusCode === 603));

  assert.equal(accepted.length, 1, 'rejected calls must never reach the provider accept operation');
  const rejectedEvents = await db.execute(sql`
    SELECT id FROM callcommand_ingestion_events
    WHERE tenant_id=${owner.currentTenantId} AND call_id IN (${noLaneCallId},${inactiveCallId},${unreadyCallId})
  `);
  assert.equal(rejectedEvents.rows.length, 0, 'rejected requests must not claim ingestion facts or mutate calls');
});

test('stale claims recover without duplicate provider actions and sideband-open failure terminates safely', async () => {
  const recoveredCallId = await createCall({ channelId: activeChannelId, marker: 'stale-processing', withLease: true });
  const recoveredProviderCall = openAiCallId('stale-processing');
  const recoveredEnvelope = signedEnvelope({
    eventId: `evt_${PHONE_SEED}_stale_processing`,
    openAiCallId: recoveredProviderCall,
    internalCallId: recoveredCallId,
  });
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE callcommand_calls SET openai_realtime_call_id=${recoveredProviderCall},realtime_status='connecting'
      WHERE tenant_id=${owner.currentTenantId} AND id=${recoveredCallId}
    `);
    await tx.execute(sql`
      INSERT INTO callcommand_ingestion_events(
        tenant_id,source,provider_event_id,payload_sha256,call_id,status,
        processing_owner,processing_lease_expires_at,attempts
      ) VALUES (
        ${owner.currentTenantId},'openai_realtime',${recoveredEnvelope.eventId},
        ${createHash('sha256').update(JSON.stringify(recoveredEnvelope)).digest('hex')},${recoveredCallId},'processing',
        'crashed-worker',NOW()-INTERVAL '1 minute',1
      )
    `);
  });
  const acceptedBeforeRecovery = accepted.length;
  const recovered = await injectSigned(recoveredEnvelope);
  assert.equal(recovered.statusCode, 200, recovered.body);
  assert.equal(accepted.length, acceptedBeforeRecovery + 1);
  const recoveredEvent = (await db.execute(sql`
    SELECT status,attempts,processing_owner,processing_lease_expires_at
    FROM callcommand_ingestion_events
    WHERE tenant_id=${owner.currentTenantId} AND source='openai_realtime'
      AND provider_event_id=${recoveredEnvelope.eventId}
  `)).rows[0] as Row;
  assert.equal(recoveredEvent.status, 'sideband_connected');
  assert.equal(Number(recoveredEvent.attempts), 2);
  assert.equal(recoveredEvent.processing_owner, null);
  assert.equal(recoveredEvent.processing_lease_expires_at, null);
  assert.equal(closeCallCommandRealtimeSideband(recoveredCallId), true);

  const failingCallId = await createCall({ channelId: activeChannelId, marker: 'socket-failure', withLease: true });
  const failingProviderCall = openAiCallId('socket-failure');
  sidebandOpenFailures.add(failingProviderCall);
  const failed = await injectSigned(signedEnvelope({
    eventId: `evt_${PHONE_SEED}_socket_failure`,
    openAiCallId: failingProviderCall,
    internalCallId: failingCallId,
  }));
  sidebandOpenFailures.delete(failingProviderCall);
  assert.equal(failed.statusCode, 503, failed.body);
  assert.equal(failed.json().providerActionConfirmed, false);
  assert.ok(hungUp.includes(failingProviderCall));
  const failedCall = (await db.execute(sql`
    SELECT status,realtime_status,realtime_error_code FROM callcommand_calls
    WHERE tenant_id=${owner.currentTenantId} AND id=${failingCallId}
  `)).rows[0] as Row;
  assert.equal(failedCall.status, 'failed');
  assert.equal(failedCall.realtime_status, 'failed');
  assert.equal(failedCall.realtime_error_code, 'CALLCOMMAND_REALTIME_SOCKET_OPEN_FAILED');
  const releasedLease = (await db.execute(sql`
    SELECT status FROM callcommand_lane_leases
    WHERE tenant_id=${owner.currentTenantId} AND call_id=${failingCallId}
  `)).rows[0] as Row;
  assert.equal(releasedLease.status, 'released');
});

test('disabled transcript policy exposes no persistence callback', async () => {
  await db.execute(sql`
    UPDATE callcommand_profiles SET transcription_policy='disabled'
    WHERE tenant_id=${owner.currentTenantId} AND id=${profileId}
  `);
  const callId = await createCall({ channelId: activeChannelId, marker: 'transcript-disabled', withLease: true });
  const providerCall = openAiCallId('transcript-disabled');
  const response = await injectSigned(signedEnvelope({
    eventId: `evt_${PHONE_SEED}_transcript_disabled`,openAiCallId:providerCall,internalCallId:callId,
  }));
  assert.equal(response.statusCode,200,response.body);
  assert.equal(sidebands.at(-1)?.callbacks.onTranscript,undefined);
  assert.equal(closeCallCommandRealtimeSideband(callId),true);
  await db.execute(sql`
    UPDATE callcommand_profiles SET transcription_policy='consent_required'
    WHERE tenant_id=${owner.currentTenantId} AND id=${profileId}
  `);
});
