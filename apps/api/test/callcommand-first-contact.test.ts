import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {firstContactChannelEnabled,unverifiedContextAllowed,firstContactEmailActions,firstContactTools,
  firstContactVoiceInstructions,unverifiedSupportSummary,FIRST_CONTACT_LIMITS,firstContactHumanTransferAllowed,firstContactAvailableTargets} from '../src/lib/callcommand-first-contact.js';
import {saveSupportIntakeSnapshot,formatSupportIntake} from '../src/lib/callcommand-support-intake.js';
import {buildOpenAiSipDialTwiml} from '../src/lib/callcommand-number-provider.js';
import {isRealtimeCallEligible} from '../src/routes/callcommand-phase35-routes.js';

test('first contact is off by default and exact-line opt-in rejects wildcards/malformed lists',()=>{
  const id=randomUUID(),other=randomUUID();
  assert.equal(firstContactChannelEnabled(id,{}),false);
  assert.equal(firstContactChannelEnabled(id,{CALLCOMMAND_UNVERIFIED_VOICE_CHANNEL_IDS:other}),false);
  assert.equal(firstContactChannelEnabled(id,{CALLCOMMAND_UNVERIFIED_VOICE_CHANNEL_IDS:`${other}, ${id.toUpperCase()}`}),true);
  for(const value of ['*',`${id},`,`${id},*`,`${id},not-an-id`])assert.equal(firstContactChannelEnabled(id,{CALLCOMMAND_UNVERIFIED_VOICE_CHANNEL_IDS:value}),false);
});

test('A0 context cannot acquire customer association or privileged assurance through intake',()=>{
  const base={assurance_level:'A0',state:'UNRECOGNIZED_LINE',organization_id:null,contact_id:null,originating_line_id:null};
  assert.equal(unverifiedContextAllowed(base),true);
  for(const state of ['CALLBACK_REQUESTED','LOCAL_CASE_CREATED','COMPLETED'])assert.equal(unverifiedContextAllowed({...base,state}),true);
  for(const assurance_level of ['A1','A2','A3','A4'])assert.equal(unverifiedContextAllowed({...base,assurance_level}),false);
  for(const key of ['organization_id','contact_id','originating_line_id'])assert.equal(unverifiedContextAllowed({...base,[key]:randomUUID()}),false);
  for(const state of ['RECEIVED','SUPPORT_ID_REQUESTED','LOCKED','DENIED','FAILED','TRANSFERRED'])assert.equal(unverifiedContextAllowed({...base,state}),false);
  assert.equal(unverifiedContextAllowed(null),false);
  assert.equal(unverifiedContextAllowed({assurance_level:'A0',state:'UNRECOGNIZED_LINE'}),false);
});

test('realtime admission needs current server proof and retains billing/lifecycle and A1 boundaries',()=>{
  const base={realtime_enabled:true,active_flow_id:randomUUID(),profile_status:'active',product_mode:'msp',routing_mode:'msp',
    realtime_billing_eligible:true,lifecycle_state:'ACTIVE',business_hours:{always:true},timezone:'UTC',live_behavior:'ai_receptionist',after_hours_behavior:'voicemail'};
  assert.equal(isRealtimeCallEligible(base),false);
  assert.equal(isRealtimeCallEligible({...base,msp_realtime_association_verified:true}),true);
  const a0={...base,msp_unverified_call:true,msp_unverified_intake_verified:true};
  assert.equal(isRealtimeCallEligible(a0),true);
  assert.equal(isRealtimeCallEligible({...a0,msp_unverified_intake_verified:false,msp_realtime_association_verified:true}),false);
  assert.equal(isRealtimeCallEligible({...a0,realtime_billing_eligible:false}),false);
  assert.equal(isRealtimeCallEligible({...a0,lifecycle_state:'SUSPENDED'}),false);
  assert.equal(isRealtimeCallEligible({...a0,realtime_enabled:false}),false);
});

test('only one unconditional administrator-owned email destination survives; text/CRM actions do not',()=>{
  const rows=[{conditions_json:{},actions_json:[{actionType:'email',destination:'support@xodus-is.com',body:'Private template',subject:'Private subject'},
    {actionType:'task'},{actionType:'ticket'},{actionType:'email',destination:'disabled@example.test',enabled:false}]}];
  const result=firstContactEmailActions(rows);
  assert.equal(result.length,1);assert.equal(result[0].destination,'support@xodus-is.com');
  assert.match(String(result[0].subject),/UNVERIFIED/);assert.equal(result[0].body,undefined);
  assert.deepEqual(firstContactEmailActions([{...rows[0],conditions_json:{company:'claimed'}}]),[]);
  assert.equal(firstContactEmailActions([...rows,{conditions_json:{},actions_json:[{actionType:'email',destination:'other@example.test'}]}]).length,1);
  for(const destination of ['first@example.test,second@example.test','https://example.test','a@example.test\nBcc:bad@example.test'])assert.deepEqual(firstContactEmailActions([{conditions_json:{},actions_json:[{actionType:'email',destination}]}]),[]);
});

test('unverified model tools exclude arbitrary CRM/notifications and offer local request before email configuration',()=>{
  const tools=firstContactTools(['create_ticket','create_task','send_email','transfer_call','end_call'].map(name=>({type:'function' as const,name,description:'fixture',parameters:{}})));
  assert.deepEqual(tools.map(tool=>tool.name),['resolve_support_link','save_first_contact_intake','submit_unverified_support_request','transfer_call','end_call']);
  const submit=tools.find(tool=>tool.name==='submit_unverified_support_request')!;
  assert.equal(submit.parameters.additionalProperties,false);assert.deepEqual(submit.parameters.properties,{});
});

test('human handoff needs an unambiguous verified target and open configured hours, never caller destination',()=>{
  const base={businessHoursOpen:true,targetCount:1,liveBehavior:'ai_screen_then_transfer',fallbackBehavior:'callback'};
  assert.equal(firstContactHumanTransferAllowed(base),true);
  assert.equal(firstContactHumanTransferAllowed({...base,businessHoursOpen:false}),false);
  for(const targetCount of [0,2,20])assert.equal(firstContactHumanTransferAllowed({...base,targetCount}),false);
  assert.equal(firstContactHumanTransferAllowed({...base,liveBehavior:'ai_receptionist'}),false);
  assert.equal(firstContactHumanTransferAllowed({...base,liveBehavior:'ai_receptionist',fallbackBehavior:'transfer'}),true);
});

test('individual human-target schedules and timezone are enforced before offering aliases',()=>{
  const targets=[{id:'open',business_hours:{weekly:{wed:[{open:'09:00',close:'17:00'}]},timezone:'America/New_York'}},
    {id:'closed',business_hours:{always:false,weekly:{}}},{id:'invalid',business_hours:{timezone:'invalid-zone'}},
    {id:'missing'}];
  assert.deepEqual(firstContactAvailableTargets(targets,new Date('2026-10-28T15:00:00Z'),'UTC').map(target=>target.id),['open']);
  assert.deepEqual(firstContactAvailableTargets(targets,new Date('2026-10-28T23:00:00Z'),'UTC'),[]);
});

test('first-contact policy discloses AI, prioritizes humans and never treats claims or local references as identity/tickets',()=>{
  const prompt=firstContactVoiceInstructions();
  for(const evidence of ['AI support intake assistant','UNVERIFIED (A0)','no customer record access','The code is optional','explicit request for a human','not a support-system ticket','five minutes','Incomplete/unconfirmed'])assert.ok(prompt.includes(evidence));
});

test('caller confirmation is readback only and unverified summary carries manual-association warnings',()=>{
  const draft={fields:{callerName:'Example Caller',company:'Claimed Example Company',callbackPhone:'',issue:'Printer unavailable',impact:'Office printing paused'},declinedFields:['callbackPhone'],callerConfirmed:false};
  const initial=saveSupportIntakeSnapshot(draft,null);
  assert.throws(()=>saveSupportIntakeSnapshot({...draft,callerConfirmed:true},initial));
  const confirmed=saveSupportIntakeSnapshot({...draft,callerConfirmed:true,confirmationRevision:initial.revision},initial);
  const summary=unverifiedSupportSummary(confirmed,formatSupportIntake(confirmed));
  assert.match(summary,/A0/);assert.match(summary,/MANUAL CUSTOMER ASSOCIATION REQUIRED/);
  assert.match(summary,/not verified/);assert.match(summary,/Do not automatically match, merge/);
  assert.equal(confirmed.associationAssurance,'caller_reported_only');
});

test('unverified SIP has a carrier-side maximum duration, distinct from ringing timeout',()=>{
  const base={openAiProjectId:'proj_synthetic_first_contact',timeoutSeconds:30};
  const limited=buildOpenAiSipDialTwiml({...base,timeLimitSeconds:FIRST_CONTACT_LIMITS.maxSeconds});
  assert.match(limited,/timeout="30"/);assert.match(limited,/timeLimit="300"/);
  assert.doesNotMatch(buildOpenAiSipDialTwiml(base),/timeLimit=/);
  for(const timeLimitSeconds of [0,-1,1.5,14401,Number.NaN])assert.throws(()=>buildOpenAiSipDialTwiml({...base,timeLimitSeconds}));
});
