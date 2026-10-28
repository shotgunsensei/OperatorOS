import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  CallCommandSupportIntakeError, callCommandVoicePolicy, formatSupportIntake,
  associatedMspVoiceGate,
  associatedMspVoiceStage,
  realtimeActionAllowedForProduct, usesMspSupportIntake,
  mspSupportNotificationReady,
  readSupportIntakeSnapshot, saveSupportIntakeSnapshot, supportDeliveryEvidence, supportIntakeTool,
} from '../src/lib/callcommand-support-intake.js';
import { buildOpenAiRealtimeAcceptConfig } from '../src/lib/callcommand-number-provider.js';
import { OpenAiRealtimeSipAdapter } from '../src/lib/callcommand-realtime.js';

const details = () => ({ callerName:'Alex Example',company:'Example Workshop',callbackPhone:'+15555550123',issue:'Cannot open the shared drive',impact:'Three staff cannot process orders' });
const draft = () => ({ fields:details(),declinedFields:[],callerConfirmed:false });
const code = (value: string) => (error: unknown) => error instanceof CallCommandSupportIntakeError && error.code === value;

test('support intake requires a saved readback before caller confirmation',()=>{
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),callerConfirmed:true},null),code('SUPPORT_INTAKE_READBACK_REQUIRED'));
  const saved=saveSupportIntakeSnapshot(draft(),null);
  assert.equal(saved.status,'awaiting_confirmation');
  const confirmed=saveSupportIntakeSnapshot({...draft(),callerConfirmed:true,confirmationRevision:saved.revision},saved);
  assert.equal(confirmed.status,'confirmed');
  assert.equal(confirmed.associationAssurance,'caller_reported_only');
  assert.equal(confirmed.revision,saved.revision);
});

test('corrections cannot reuse stale confirmation or silently retain confirmed status',()=>{
  const saved=saveSupportIntakeSnapshot(draft(),null);
  const changed={...draft(),fields:{...details(),impact:'All staff cannot work'}};
  assert.throws(()=>saveSupportIntakeSnapshot({...changed,callerConfirmed:true,confirmationRevision:saved.revision},saved),code('SUPPORT_INTAKE_READBACK_REQUIRED'));
  const revised=saveSupportIntakeSnapshot(changed,saved);
  assert.notEqual(revised.revision,saved.revision);
  assert.equal(revised.status,'awaiting_confirmation');
  assert.throws(()=>saveSupportIntakeSnapshot({...changed,callerConfirmed:true,confirmationRevision:saved.revision},revised),code('SUPPORT_INTAKE_READBACK_REQUIRED'));
});

test('repeated confirmation has stable content identity without becoming identity verification',()=>{
  const saved=saveSupportIntakeSnapshot(draft(),null);
  const input={...draft(),callerConfirmed:true,confirmationRevision:saved.revision};
  const confirmed=saveSupportIntakeSnapshot(input,saved);
  assert.deepEqual(saveSupportIntakeSnapshot(input,confirmed),confirmed);
  assert.match(formatSupportIntake(confirmed),/not verified/);
});

test('explicitly declined fields remain empty and are never invented from caller ID',()=>{
  const input={...draft(),fields:{...details(),callbackPhone:'',company:''},declinedFields:['callbackPhone','company']};
  const saved=saveSupportIntakeSnapshot(input,null);
  assert.match(formatSupportIntake(saved),/Callback: Caller declined/);
  assert.equal(saved.fields.callbackPhone,'');
  assert.throws(()=>saveSupportIntakeSnapshot({...input,fields:details()},saved),code('SUPPORT_INTAKE_DECLINED_HAS_VALUE'));
});

for(const callback of ['5555550123','+0123456789','+1555','+15555550123 extension 2']){
  test(`callback shape is rejected without country guessing (${callback.length} characters)`,()=>{
    assert.throws(()=>saveSupportIntakeSnapshot({...draft(),fields:{...details(),callbackPhone:callback}},null),
      code(callback.length>16?'SUPPORT_INTAKE_VALUE_INVALID':'SUPPORT_INTAKE_CALLBACK_INVALID'));
  });
}

test('missing fields, overlong values, control characters and unexpected authority keys are rejected',()=>{
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),fields:{...details(),issue:''}},null),code('SUPPORT_INTAKE_FIELD_REQUIRED'));
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),fields:{...details(),issue:'x'.repeat(501)}},null),code('SUPPORT_INTAKE_VALUE_INVALID'));
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),fields:{...details(),callerName:'Alex\nExample'}},null),code('SUPPORT_INTAKE_VALUE_INVALID'));
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),tenantId:'other-tenant'},null),code('SUPPORT_INTAKE_ARGUMENT_INVALID'));
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),fields:{...details(),userId:'other-user'}},null),code('SUPPORT_INTAKE_FIELDS_INVALID'));
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),declinedFields:['company','company']},null),code('SUPPORT_INTAKE_DECLINED_INVALID'));
});

test('obvious credential disclosures are rejected without echoing their content; reset requests remain valid',()=>{
  const volunteered='password is synthetic-example-do-not-store';
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),fields:{...details(),issue:volunteered}},null),(error:unknown)=>{
    assert.ok(code('SUPPORT_INTAKE_SENSITIVE_CONTENT')(error));
    assert.ok(!String(error).includes(volunteered));return true;
  });
  assert.equal(saveSupportIntakeSnapshot({...draft(),fields:{...details(),issue:'I need a password reset'}},null).fields.issue,'I need a password reset');
});
test('ordinary password-failure descriptions remain valid while a later disclosed value is still rejected',()=>{
  for(const issue of ['My password is not working','The password is expired','My PIN is invalid','The passcode is being rejected']) {
    assert.equal(saveSupportIntakeSnapshot({...draft(),fields:{...details(),issue}},null).fields.issue,issue);
  }
  assert.throws(()=>saveSupportIntakeSnapshot({...draft(),fields:{...details(),issue:'The password is expired; my passcode is synthetic-do-not-store'}},null),code('SUPPORT_INTAKE_SENSITIVE_CONTENT'));
});

test('saved snapshots survive JSON persistence and corruption does not become confirmed intake',()=>{
  const saved=saveSupportIntakeSnapshot(draft(),null);
  const stored=JSON.parse(JSON.stringify({_operatorosSupportIntakeV1:saved}));
  assert.deepEqual(readSupportIntakeSnapshot(stored),saved);
  stored._operatorosSupportIntakeV1.fields.company='Another organization';
  assert.equal(readSupportIntakeSnapshot(stored),null);
  assert.equal(readSupportIntakeSnapshot({_operatorosSupportIntakeV1:{...saved,version:2}}),null);
});

test('intake summaries remain bounded and distinguish unconfirmed from confirmed data',()=>{
  const fields={callerName:'n'.repeat(120),company:'c'.repeat(160),callbackPhone:'+15555550123',issue:'i'.repeat(500),impact:'b'.repeat(240)};
  const saved=saveSupportIntakeSnapshot({...draft(),fields},null);
  assert.ok(formatSupportIntake(saved).length<=1500);
  assert.match(formatSupportIntake(saved),/NOT YET CONFIRMED/);
});

test('closed nested tool schema survives canonical compilation and preserves confirmation fields',()=>{
  const config=buildOpenAiRealtimeAcceptConfig({model:'gpt-realtime-2.1-mini',voice:'marin',serverCompiledInstructions:'Synthetic support contract.',allowlistedTools:[supportIntakeTool()]});
  assert.equal(config.tools[0].name,'save_support_intake');
  assert.equal(config.tools[0].parameters.additionalProperties,false);
  assert.equal(config.audio.input.turn_detection.interrupt_response,true);
  assert.equal(config.audio.input.turn_detection.create_response,true);
});

test('actual adapter accept payload explicitly permits caller interruption without sending a network request',async()=>{
  let request:Record<string,any>|null=null;
  const synthetic=()=>randomBytes(24).toString('hex');
  const adapter=new OpenAiRealtimeSipAdapter({env:{OPENAI_API_KEY:'sk-'+synthetic(),OPENAI_PROJECT_ID:'proj_local_support_fixture',OPENAI_WEBHOOK_SECRET:'whsec_'+synthetic(),CALLCOMMAND_SIP_ROUTE_SECRET:synthetic(),CALLCOMMAND_REALTIME_MODEL:'gpt-realtime-2.1-mini'},
    fetch:async (_url,init)=>{request=JSON.parse(String(init?.body));return new Response(null,{status:200});},
    webhookClientFactory:()=>({webhooks:{unwrap:async()=>({})}}),
  });
  await adapter.accept('rtc_support_fixture',{instructions:callCommandVoicePolicy({supportIntakeEnabled:true,transferReference:[]}),tools:[supportIntakeTool()],voice:'marin'});
  assert.ok(request);
  const payload=request as Record<string,any>;
  assert.equal(payload.audio.input.turn_detection.interrupt_response,true);
  assert.equal(payload.audio.input.turn_detection.create_response,true);
});

test('final voice policy preserves disclosure, privacy, human priority and truthful ticket/transfer outcomes',()=>{
  const text=callCommandVoicePolicy({supportIntakeEnabled:true,transferReference:[{alias:'target_1',label:'Business support'}]});
  for(const required of ['AI assistant','one question at a time','patient details','passwords','stop troubleshooting/intake','Do not require intake completion','callerConfirmed=false','confirmationRevision','not mailbox receipt or a ticket','not a human answer','not claim automatic redaction']) assert.ok(text.includes(required),required);
  const nonsupport=callCommandVoicePolicy({supportIntakeEnabled:false,transferReference:[]});
  assert.ok(!nonsupport.includes('save_support_intake'));
});

test('worst-case transfer labels leave at least the compiler minimum and preserve final policy',()=>{
  const text=callCommandVoicePolicy({supportIntakeEnabled:true,transferReference:Array.from({length:20},(_,i)=>({alias:`target_${i+1}`,label:'"\\'.repeat(60)}))});
  assert.ok(12000-text.length-2>=2000);
  assert.ok(text.endsWith('Never invent a destination.'));
});

for(const [outcomes,state] of [[[], 'not_configured'],[['queued'],'queued'],[['delivered'],'provider_accepted'],[['test_recorded'],'test_only'],[['failed'],'failed'],[['running'],'unconfirmed']] as const){
  test(`notification evidence stays honest for ${state}`,()=>{
    const result=supportDeliveryEvidence([...outcomes]);
    assert.equal(result.deliveryState,state);
    assert.equal(result.ticketCreationConfirmed,false);
    assert.equal(result.mailboxReceiptConfirmed,false);
  });
}

const mspGate = () => ({associated:true,channelActive:true,callActive:true,providerReady:true,eligibleFlow:true,
  managedLine:true,billingEligible:true,lifecycleActive:true,consentRequired:false,recordingEnabled:false,realtimeConfigured:true,notificationConfigured:true});
test('MSP associated voice requires the complete server-side gate without granting automation',()=>{
  assert.equal(associatedMspVoiceGate(mspGate()),true);
});
for(const key of ['associated','channelActive','callActive','providerReady','eligibleFlow','managedLine','billingEligible','lifecycleActive','realtimeConfigured','notificationConfigured'] as const){
  test(`MSP voice remains unavailable when ${key} is not established`,()=>assert.equal(associatedMspVoiceGate({...mspGate(),[key]:false}),false));
}
for(const key of ['consentRequired','recordingEnabled'] as const){
  test(`MSP voice does not bypass an existing ${key} workflow`,()=>assert.equal(associatedMspVoiceGate({...mspGate(),[key]:true}),false));
}
test('MSP consent staging never treats an outstanding consent requirement as SIP authorization',()=>{
  assert.equal(associatedMspVoiceStage({...mspGate(),consentRequired:true}),'consent');
  assert.equal(associatedMspVoiceStage({...mspGate(),consentRequired:true,associated:false}),'unavailable');
  assert.equal(associatedMspVoiceStage({...mspGate(),consentRequired:true,recordingEnabled:true}),'unavailable');
  assert.equal(associatedMspVoiceStage(mspGate()),'realtime');
});
test('structured MSP workflow does not impose a new intake gate on existing general/sales/medical calls',()=>{
  for(const mode of ['general','sales','medical','field_service']) {
    assert.equal(usesMspSupportIntake(mode,['send_email']),false);
    for(const action of ['email','ticket','lead','task','slack','webhook']) assert.equal(realtimeActionAllowedForProduct(mode,action),true);
  }
  assert.equal(usesMspSupportIntake('msp',['send_email']),true);
  assert.equal(usesMspSupportIntake('msp',['create_ticket']),false);
});
test('MSP realtime action allowlist does not expose generic CRM, device, identity or arbitrary webhooks',()=>{
  assert.equal(realtimeActionAllowedForProduct('msp','email'),true);
  for(const action of ['ticket','lead','task','slack','webhook','device.restart','identity.reset']) assert.equal(realtimeActionAllowedForProduct('msp',action),false);
});
test('human-first or interrupted MSP intake cannot consume the primary ticket email with partial details',()=>{
  const saved=saveSupportIntakeSnapshot(draft(),null);
  const confirmed=saveSupportIntakeSnapshot({...draft(),callerConfirmed:true,confirmationRevision:saved.revision},saved);
  assert.equal(mspSupportNotificationReady(null,false),false);
  assert.equal(mspSupportNotificationReady(saved,false),false);
  assert.equal(mspSupportNotificationReady(saved,true),false);
  assert.equal(mspSupportNotificationReady(confirmed,false),false);
  assert.equal(mspSupportNotificationReady(confirmed,true),true);
});
test('actual realtime eligibility requires the MSP server proof and current lifecycle/billing without changing general calls',async()=>{
  const {isRealtimeCallEligible}=await import('../src/routes/callcommand-phase35-routes.js');
  const base={realtime_enabled:true,active_flow_id:'fixture-flow',profile_status:'active',product_mode:'msp',routing_mode:'msp',
    msp_realtime_association_verified:true,realtime_billing_eligible:true,lifecycle_state:'ACTIVE',
    business_hours:{},timezone:'UTC',live_behavior:'ai_receptionist',after_hours_behavior:'ai_intake'};
  assert.equal(isRealtimeCallEligible(base),true);
  for(const overrides of [{msp_realtime_association_verified:false},{realtime_billing_eligible:false},{lifecycle_state:'SUSPENDED'}]) {
    assert.equal(isRealtimeCallEligible({...base,...overrides}),false);
  }
  assert.equal(isRealtimeCallEligible({...base,product_mode:'general',routing_mode:'general',msp_realtime_association_verified:false,realtime_billing_eligible:false,lifecycle_state:'LEGACY'}),true);
});
