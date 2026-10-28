/** Actual PostgreSQL/registered-route journey starting AFTER signed MSP A1 association.
 * Remote OpenAI control/media are synthetic. Never use a persistent database.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import Fastify, {type FastifyRequest} from 'fastify';
import {sql} from 'drizzle-orm';
import {db} from '../src/db.js';
import {createRecoveryFixture,cleanupRecoveryFixture} from './fixtures/callcommand-recovery-fixture.js';
import {
  __setCallCommandRealtimeAdapterFactoryForTests,prepareAssociatedMspRealtimeIntake,registerCallCommandRealtimeRoutes,
} from '../src/routes/callcommand-realtime-routes.js';
import {drainCallCommandRealtimeSidebands} from '../src/lib/callcommand-realtime-session-registry.js';
import {CallCommandRealtimeError,createCallCommandSipRouteToken,verifyCallCommandSipRouteToken,
  type RealtimeSidebandCallbacks,type RealtimeToolInvocation,type VerifiedOpenAiIncomingCall} from '../src/lib/callcommand-realtime.js';

test('associated MSP voice saves a confirmed local case and one durable support email, preserving current authority',async()=>{
  // ensureSchemaReady inside the retained fixture enforces the shared disposable-DB guard.
  const fixture=await createRecoveryFixture();
  const app=Fastify({logger:false});
  const secret=randomBytes(40).toString('hex');
  const envNames=['OPENAI_API_KEY','OPENAI_PROJECT_ID','OPENAI_WEBHOOK_SECRET','CALLCOMMAND_SIP_ROUTE_SECRET','CALLCOMMAND_REALTIME_MODEL','TWILIO_PUBLIC_BASE_URL'];
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
      VALUES(${fixture.tenantId},${fixture.userId},'Owned support mailbox',TRUE,'{}'::jsonb,${JSON.stringify([{actionType:'email',destination:'support@example.test'}])}::jsonb)`);
    const org=(await db.execute(sql`INSERT INTO directory_organizations(tenant_id,name,normalized_name,created_by_user_id,updated_by_user_id) VALUES(${fixture.tenantId},'Example Workshop','example workshop',${fixture.userId},${fixture.userId}) RETURNING id`)).rows[0];
    const contact=(await db.execute(sql`INSERT INTO directory_contacts(tenant_id,first_name,normalized_name,created_by_user_id,updated_by_user_id) VALUES(${fixture.tenantId},'Alex','alex example',${fixture.userId},${fixture.userId}) RETURNING id`)).rows[0];
    await db.execute(sql`INSERT INTO callcommand_organization_profiles(tenant_id,organization_id,created_by_user_id,updated_by_user_id) VALUES(${fixture.tenantId},${org.id},${fixture.userId},${fixture.userId})`);
    await db.execute(sql`INSERT INTO callcommand_contact_profiles(tenant_id,organization_id,contact_id,created_by_user_id,updated_by_user_id) VALUES(${fixture.tenantId},${org.id},${contact.id},${fixture.userId},${fixture.userId})`);
    const vault=(await db.execute(sql`SELECT id FROM shared_secret_references WHERE tenant_id=${fixture.tenantId} LIMIT 1`)).rows[0];
    const line=(await db.execute(sql`INSERT INTO callcommand_trusted_originating_lines(tenant_id,organization_id,phone_secret_reference_id,lookup_hmac,display_last4,line_type,status,verified_at,created_by_user_id,updated_by_user_id)
      VALUES(${fixture.tenantId},${org.id},${vault.id},${randomBytes(32).toString('hex')},'0123','DIRECT_DID','ACTIVE',NOW(),${fixture.userId},${fixture.userId}) RETURNING id`)).rows[0];
    await db.execute(sql`INSERT INTO callcommand_msp_call_contexts(tenant_id,call_id,provider_call_id,state,assurance_level,organization_id,contact_id,originating_line_id)
      VALUES(${fixture.tenantId},${fixture.callId},${fixture.providerSid},'CONTACT_ASSOCIATED','A1',${org.id},${contact.id},${line.id})`);
    const input={tenantId:fixture.tenantId,callId:fixture.callId,providerCallSid:fixture.providerSid};
    assert.equal(await prepareAssociatedMspRealtimeIntake({...input,tenantId:randomUUID()}),null);
    assert.equal(await prepareAssociatedMspRealtimeIntake({...input,providerCallSid:'CA'+randomBytes(16).toString('hex')}),null);
    const sip=await prepareAssociatedMspRealtimeIntake(input);
    assert.ok(sip?.includes('sip.api.openai.com'));
    assert.ok(!sip?.includes('<Record'));
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
    assert.ok(offered.includes('save_support_intake') && offered.includes('submit_support_request'));
    assert.ok(!offered.includes('create_ticket') && !offered.includes('create_task') && !offered.includes('send_email'));
    assert.ok(callbacks);
    const invoke=(name:string,args:RealtimeToolInvocation['arguments'])=>(callbacks as RealtimeSidebandCallbacks).executeTool({openAiCallId,toolCallId:'tool_'+randomUUID(),name,arguments:args}) as Promise<Record<string,any>>;
    const missing=await invoke('submit_support_request',{summary:'Synthetic support request'});
    assert.equal(missing.ok,false);
    const draft={fields:{callerName:'Alex Example',company:'Example Workshop',callbackPhone:'+15555550123',issue:'Cannot open the shared drive',impact:'Three people cannot work'},declinedFields:[],callerConfirmed:false};
    const saved=await invoke('save_support_intake',draft);
    const confirmed=await invoke('save_support_intake',{...draft,callerConfirmed:true,confirmationRevision:saved.confirmationRevision});
    assert.equal(confirmed.status,'confirmed');
    const submitted=await invoke('submit_support_request',{summary:'Synthetic support request'});
    assert.equal(submitted.localCaseRecorded,true);assert.equal(submitted.deliveryState,'queued');
    assert.equal(submitted.ticketCreationConfirmed,false);assert.equal(submitted.mailboxReceiptConfirmed,false);
    await invoke('submit_support_request',{summary:'Same request with another tool invocation ID'});
    const cases=await db.execute(sql`SELECT id,organization_id,contact_id FROM callcommand_local_cases WHERE tenant_id=${fixture.tenantId}`);
    assert.equal(cases.rows.length,1);assert.equal(cases.rows[0].organization_id,org.id);assert.equal(cases.rows[0].contact_id,contact.id);
    const messages=await db.execute(sql`SELECT status,body FROM shared_outbox_messages WHERE tenant_id=${fixture.tenantId} AND context_json->>'callId'=${fixture.callId}`);
    assert.equal(messages.rows.length,1);assert.equal(messages.rows[0].status,'pending');
    assert.match(String(messages.rows[0].body),/Three people cannot work/);
    assert.equal((await db.execute(sql`SELECT id FROM callcommand_integration_outbox WHERE tenant_id=${fixture.tenantId}`)).rows.length,0);
    await db.execute(sql`UPDATE callcommand_contact_profiles SET support_eligible=FALSE WHERE tenant_id=${fixture.tenantId} AND contact_id=${contact.id}`);
    await assert.rejects(invoke('save_support_intake',draft));
  } finally {
    await drainCallCommandRealtimeSidebands();
    __setCallCommandRealtimeAdapterFactoryForTests(null);
    await app.close();
    for(const table of ['callcommand_msp_call_events','callcommand_local_cases','callcommand_msp_call_contexts','callcommand_contact_profiles','callcommand_trusted_originating_lines','callcommand_organization_profiles','directory_contacts','directory_organizations']) {
      await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE tenant_id=${fixture.tenantId}`);
    }
    await cleanupRecoveryFixture(fixture);
    for(const name of envNames)delete process.env[name];
  }
});
