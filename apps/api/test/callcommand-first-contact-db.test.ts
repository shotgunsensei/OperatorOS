/** Actual PostgreSQL/registered-route journey starting AFTER synthetic signed-carrier A0 context.
 * NOT EXECUTED in this pass. Remote OpenAI control/media are synthetic; no real carrier proof. Never use a persistent database.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import Fastify, {type FastifyRequest} from 'fastify';
import {sql} from 'drizzle-orm';
import {db} from '../src/db.js';
import {createRecoveryFixture,cleanupRecoveryFixture} from './fixtures/callcommand-recovery-fixture.js';
import {
  __setCallCommandRealtimeAdapterFactoryForTests,prepareAssociatedMspRealtimeIntake,prepareUnverifiedMspRealtimeIntake,registerCallCommandRealtimeRoutes,
} from '../src/routes/callcommand-realtime-routes.js';
import {appendMspCallEvent} from '../src/lib/callcommand-msp-service.js';
import {dispatchCallCommandActions} from '../src/routes/callcommand-phase35-routes.js';
import {drainCallCommandRealtimeSidebands} from '../src/lib/callcommand-realtime-session-registry.js';
import {CallCommandRealtimeError,createCallCommandSipRouteToken,verifyCallCommandSipRouteToken,
  type RealtimeSidebandCallbacks,type RealtimeToolInvocation,type VerifiedOpenAiIncomingCall} from '../src/lib/callcommand-realtime.js';

test('unverified first contact records one unassociated request/email, denies automation, and rechecks opt-out and expiry',async()=>{
  // ensureSchemaReady inside the retained fixture enforces the shared disposable-DB guard.
  const fixture=await createRecoveryFixture();
  const app=Fastify({logger:false});
  const secret=randomBytes(40).toString('hex');
  const envNames=['OPENAI_API_KEY','OPENAI_PROJECT_ID','OPENAI_WEBHOOK_SECRET','CALLCOMMAND_SIP_ROUTE_SECRET','CALLCOMMAND_REALTIME_MODEL','TWILIO_PUBLIC_BASE_URL','CALLCOMMAND_UNVERIFIED_VOICE_CHANNEL_IDS'];
  Object.assign(process.env,{OPENAI_API_KEY:'sk-'+randomBytes(24).toString('hex'),OPENAI_PROJECT_ID:'proj_msp_local_fixture',
    OPENAI_WEBHOOK_SECRET:'whsec_'+randomBytes(24).toString('hex'),CALLCOMMAND_SIP_ROUTE_SECRET:secret,
    CALLCOMMAND_REALTIME_MODEL:'gpt-realtime-2.1-mini',TWILIO_PUBLIC_BASE_URL:'https://voice.example.test'});
  let callbacks:RealtimeSidebandCallbacks|null=null;
  let offered:readonly string[]=[];
  const openAiCallId='rtc_msp_'+randomBytes(10).toString('hex');
  try {
    const bound=(await db.execute(sql`SELECT channel_id,profile_id FROM callcommand_calls WHERE tenant_id=${fixture.tenantId} AND id=${fixture.callId}`)).rows[0];
    await db.execute(sql`UPDATE callcommand_channels SET product_mode='msp',routing_mode='msp',acquisition_mode='byon',lifecycle_state='ACTIVE',billing_status='included',live_behavior='ai_screen_then_transfer' WHERE tenant_id=${fixture.tenantId} AND id=${bound.channel_id}`);
    await db.execute(sql`UPDATE callcommand_profiles SET product_mode='msp',transcription_policy='disabled',recording_policy='disabled' WHERE tenant_id=${fixture.tenantId} AND id=${bound.profile_id}`);
    await db.execute(sql`INSERT INTO callcommand_automation_rules(tenant_id,created_by_user_id,name,enabled,conditions_json,actions_json)
      VALUES(${fixture.tenantId},${fixture.userId},'Owned support mailbox',TRUE,'{}'::jsonb,${JSON.stringify([{actionType:'email',destination:'support@xodus-is.com'}])}::jsonb)`);
    process.env.CALLCOMMAND_UNVERIFIED_VOICE_CHANNEL_IDS=String(bound.channel_id);
    const context=(await db.execute(sql`INSERT INTO callcommand_msp_call_contexts(tenant_id,call_id,provider_call_id,state,assurance_level)
      VALUES(${fixture.tenantId},${fixture.callId},${fixture.providerSid},'UNRECOGNIZED_LINE','A0') RETURNING id`)).rows[0];
    for(const eventType of ['provider.signature.verified','tenant.resolved.by.exact.to'])await appendMspCallEvent({tenantId:fixture.tenantId,callContextId:String(context.id),eventType,actorType:'SYSTEM',outcome:'SYNTHETIC_SIGNED_CONTEXT'});
    const input={tenantId:fixture.tenantId,callId:fixture.callId,providerCallSid:fixture.providerSid};
    assert.equal(await prepareUnverifiedMspRealtimeIntake({...input,tenantId:randomUUID()}),null);
    assert.equal(await prepareUnverifiedMspRealtimeIntake({...input,providerCallSid:'CA'+randomBytes(16).toString('hex')}),null);
    assert.equal(await prepareAssociatedMspRealtimeIntake(input),null);
    const sip=await prepareUnverifiedMspRealtimeIntake(input);
    assert.ok(sip?.includes('sip.api.openai.com'));
    assert.ok(!sip?.includes('<Record'));assert.match(sip!,/timeLimit="300"/);
    assert.ok(await prepareUnverifiedMspRealtimeIntake(input));
    const attempts=await db.execute(sql`SELECT attempt_count FROM callcommand_msp_rate_limits WHERE tenant_id=${fixture.tenantId} AND scope IN ('voice-a0-tenant','voice-a0-caller')`);
    assert.equal(attempts.rows.length,2);assert.ok(attempts.rows.every(row=>Number(row.attempt_count)===1));

    __setCallCommandRealtimeAdapterFactoryForTests(()=>({
      readiness:{ready:true,model:'gpt-realtime-2.1-mini'},
      unwrapIncomingCall:async input=>{
        if(input.headers['webhook-signature']!=='synthetic-provider-envelope')throw new CallCommandRealtimeError('Invalid test signature','CALLCOMMAND_REALTIME_SIGNATURE_INVALID',401);
        return JSON.parse(String(input.rawBody)) as VerifiedOpenAiIncomingCall;
      },
      verifyRouteToken:(callId,sid,token)=>verifyCallCommandSipRouteToken({internalCallId:callId,providerCallSid:sid,routeToken:token,routeSecret:secret}),
      accept:async id=>({ok:true,action:'accept',openAiCallId:id}),reject:async id=>({ok:true,action:'reject',openAiCallId:id}),
      refer:async id=>({ok:true,action:'refer',openAiCallId:id}),hangup:async id=>({ok:true,action:'hangup',openAiCallId:id}),
      connectSideband:input=>{
        callbacks=input.callbacks;offered=input.allowedToolNames;
        return {waitUntilOpen:async()=>{},greet(){},close(){void input.callbacks.onClosed?.({openAiCallId:input.openAiCallId,code:1000,clean:true});}} as never;
      },
    }));
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json',{parseAs:'buffer'},(request:FastifyRequest,body,done)=>{
      (request as FastifyRequest & {rawBody?:Buffer}).rawBody=body as Buffer;
      try{done(null,JSON.parse(String(body)));}catch{done(new Error('Invalid synthetic JSON'));}
    });
    await registerCallCommandRealtimeRoutes(app);
    const response=await app.inject({method:'POST',url:'/v1/modules/callcommand-ai/openai/realtime/incoming',headers:{'webhook-signature':'synthetic-provider-envelope'},payload:{eventId:'evt_'+randomUUID(),createdAt:Math.floor(Date.now()/1000),openAiCallId,internalCallId:fixture.callId,
      routeToken:createCallCommandSipRouteToken({internalCallId:fixture.callId,providerCallSid:fixture.providerSid,routeSecret:secret})}});
    assert.equal(response.statusCode,200);
    assert.ok(offered.includes('save_first_contact_intake') && offered.includes('submit_unverified_support_request'));
    assert.ok(!offered.includes('create_ticket') && !offered.includes('create_task') && !offered.includes('send_email') && !offered.includes('submit_support_request'));
    assert.ok(callbacks);
    const invoke=(name:string,args:RealtimeToolInvocation['arguments'])=>(callbacks as RealtimeSidebandCallbacks).executeTool({openAiCallId,toolCallId:'tool_'+randomUUID(),name,arguments:args}) as Promise<Record<string,any>>;
    const missing=await invoke('submit_unverified_support_request',{});
    assert.equal(missing.ok,false);
    const first=await invoke('resolve_support_link',{number:'zero zero one two three four five six',skip:false});
    assert.equal(first.attemptsRemaining,1);
    const second=await invoke('resolve_support_link',{number:'zero zero one two three four five seven',skip:false});
    assert.equal(second.manualIntake,true);assert.equal(second.attemptsRemaining,0);
    const third=await invoke('resolve_support_link',{number:'zero zero one two three four five eight',skip:false});
    assert.equal(third.manualIntake,true);
    assert.equal(Number((await db.execute(sql`SELECT support_link_attempts FROM callcommand_msp_call_contexts WHERE tenant_id=${fixture.tenantId} AND call_id=${fixture.callId}`)).rows[0].support_link_attempts),2);
    const draft={fields:{firstName:'Alex',lastName:'Example',company:'Example Workshop',contactEmail:'alex@example.test',callbackPhone:'',issue:'Cannot open the shared drive',impact:'Three people cannot work'},declinedFields:['callbackPhone'],callerConfirmed:false};
    const saved=await invoke('save_first_contact_intake',draft);
    const confirmed=await invoke('save_first_contact_intake',{...draft,callerConfirmed:true,confirmationRevision:saved.confirmationRevision});
    assert.equal(confirmed.status,'confirmed');
    const submitted=await invoke('submit_unverified_support_request',{});
    assert.equal(submitted.localRequestRecorded,true);assert.equal(submitted.deliveryState,'queued');
    assert.equal(submitted.ticketCreationConfirmed,false);assert.equal(submitted.mailboxReceiptConfirmed,false);
    await invoke('submit_unverified_support_request',{});
    const cases=await db.execute(sql`SELECT id,organization_id,contact_id FROM callcommand_local_cases WHERE tenant_id=${fixture.tenantId}`);
    assert.equal(cases.rows.length,1);assert.equal(cases.rows[0].organization_id,null);assert.equal(cases.rows[0].contact_id,null);
    const messages=await db.execute(sql`SELECT status,body FROM shared_outbox_messages WHERE tenant_id=${fixture.tenantId} AND context_json->>'callId'=${fixture.callId}`);
    assert.equal(messages.rows.length,1);assert.equal(messages.rows[0].status,'pending');
    assert.match(String(messages.rows[0].body),/Three people cannot work/);
    assert.equal((await db.execute(sql`SELECT id FROM callcommand_integration_outbox WHERE tenant_id=${fixture.tenantId}`)).rows.length,0);
    assert.match(String(messages.rows[0].body),/UNVERIFIED/);
    assert.match(String(messages.rows[0].body),/manual association required/);
    await assert.rejects(invoke('submit_support_request',{}));
    await assert.rejects(invoke('create_task',{summary:'must not execute'}));
    const current=(await db.execute(sql`SELECT * FROM callcommand_calls WHERE tenant_id=${fixture.tenantId} AND id=${fixture.callId}`)).rows[0];
    await assert.rejects(dispatchCallCommandActions({tenantId:fixture.tenantId,userId:fixture.userId,call:current,actions:[{actionType:'task'}]}),error=>(error as {code?:string}).code==='UNVERIFIED_AUTOMATION_NOT_ALLOWED');
    delete process.env.CALLCOMMAND_UNVERIFIED_VOICE_CHANNEL_IDS;
    await assert.rejects(invoke('save_first_contact_intake',draft));
    assert.equal(await prepareUnverifiedMspRealtimeIntake(input),null);
    process.env.CALLCOMMAND_UNVERIFIED_VOICE_CHANNEL_IDS=String(bound.channel_id);
    await db.execute(sql`UPDATE callcommand_msp_call_events SET created_at=NOW()-INTERVAL '6 minutes' WHERE tenant_id=${fixture.tenantId} AND event_type='unverified.voice.admitted'`);
    await assert.rejects(invoke('save_first_contact_intake',draft));
    assert.equal(await prepareUnverifiedMspRealtimeIntake(input),null);

  } finally {
    await drainCallCommandRealtimeSidebands();
    __setCallCommandRealtimeAdapterFactoryForTests(null);
    await app.close();
    for(const table of ['callcommand_msp_rate_limits','callcommand_msp_call_events','callcommand_local_cases','callcommand_msp_call_contexts','callcommand_contact_profiles','callcommand_trusted_originating_lines','callcommand_organization_profiles','directory_contacts','directory_organizations']) {
      await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE tenant_id=${fixture.tenantId}`);
    }
    await cleanupRecoveryFixture(fixture);
    for(const name of envNames)delete process.env[name];
  }
});
