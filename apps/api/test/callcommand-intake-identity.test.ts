import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertCallStateTransition} from '../src/lib/callcommand-msp.js';
import {attemptIntakeCode,publicIdentityResult,normalizeSpokenIntakeCode,issueIntakeSupportLinkId,intakeSupportLinkHmac,
  saveFirstContactSnapshot,publicFirstContactReadback,readFirstContactSnapshot,formatBmsIntakeEmail,configuredIntakeTag,
  type IntakeIdentityState,type PrivateDirectoryMatch} from '../src/lib/callcommand-intake-identity.js';

const initial=():IntakeIdentityState=>({failures:0,mode:'offer',receipts:[]});
const claims=()=>({fields:{firstName:'Alex',lastName:'Example',company:'Example Workshop',contactEmail:'alex@example.test',callbackPhone:'',issue:'Shared drive unavailable',impact:'Two people unable to work'},declinedFields:['callbackPhone'],callerConfirmed:false});
const privateMatch=():PrivateDirectoryMatch=>({linkId:randomUUID(),organizationId:randomUUID(),firstName:'Stored',lastName:'Contact',company:'Stored Company',email:'stored@example.test',revision:'opaque-directory-revision'});

test('generated intake codes are eight-digit strings and parser preserves leading zeros/spoken digits',()=>{
  for(let i=0;i<20;i++)assert.match(issueIntakeSupportLinkId(),/^\d{8}$/);
  assert.equal(normalizeSpokenIntakeCode('zero zero one two three four five six'),'00123456');
  assert.equal(normalizeSpokenIntakeCode('00 12-34 56'),'00123456');
  assert.equal(normalizeSpokenIntakeCode('oh one two three four five'),'012345');
  for(const bad of [123456,'please 123456','12345','123456789','double one two three four five',{},null])assert.equal(normalizeSpokenIntakeCode(bad),null);
});

test('new intake HMAC is tenant/domain separated from legacy SupportLink lookup',()=>{
  const a=randomUUID(),b=randomUUID();
  assert.equal(intakeSupportLinkHmac(a,'00123456'),intakeSupportLinkHmac(a,'00123456'));
  assert.notEqual(intakeSupportLinkHmac(a,'00123456'),intakeSupportLinkHmac(b,'00123456'));
  assert.notEqual(intakeSupportLinkHmac(a,'00123456'),intakeSupportLinkHmac(a,'00123457'));
});

test('first failure allows one more; second forces manual; third does not rate-check or look up; manual intake still completes',async()=>{
  let lookups=0,rates=0;
  const ports={allowed:async()=>{rates++;return true;},lookup:async()=>{lookups++;return null;}};
  const one=await attemptIntakeCode({state:initial(),toolCallId:'first',raw:'00123456',skip:false},ports);
  assert.equal(one.state.failures,1);assert.equal(one.state.mode,'offer');assert.equal(publicIdentityResult(one.state).attemptsRemaining,1);
  const replay=await attemptIntakeCode({state:one.state,toolCallId:'first',raw:'00123456',skip:false},ports);
  assert.equal(replay.event,null);assert.equal(lookups,1);
  const two=await attemptIntakeCode({state:replay.state,toolCallId:'second',raw:'00123457',skip:false},ports);
  assert.equal(two.state.failures,2);assert.equal(two.state.mode,'manual');assert.equal(publicIdentityResult(two.state).attemptsRemaining,0);
  // Restore persisted state as a new process/reconnection would.
  const state=JSON.parse(JSON.stringify(two.state)) as IntakeIdentityState;
  const third=await attemptIntakeCode({state,toolCallId:'third',raw:'00123458',skip:false},ports);
  assert.equal(third.event,null);assert.equal(lookups,2);assert.equal(rates,2);assert.equal(third.state.failures,2);
  const draft=saveFirstContactSnapshot(claims(),null,{source:'manual',revision:'manual'});
  const confirmed=saveFirstContactSnapshot({...claims(),callerConfirmed:true,confirmationRevision:draft.revision},draft,{source:'manual',revision:'manual'});
  assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.fields.firstName,'Alex');
});

test('skip from the start closes code lookup and never terminates useful intake',async()=>{
  let calls=0;
  const ports={allowed:async()=>{calls++;return true;},lookup:async()=>{calls++;return null;}};
  const skipped=await attemptIntakeCode({state:initial(),toolCallId:'skip',raw:'',skip:true},ports);
  assert.equal(skipped.state.mode,'manual');assert.equal(calls,0);
  await attemptIntakeCode({state:skipped.state,toolCallId:'later',raw:'00123456',skip:false},ports);
  assert.equal(calls,0);
});

test('invalid-format, expired/revoked/wrong-tenant/ambiguous lookup misses have identical public failure output',async()=>{
  const results=[];
  for(const raw of ['not-a-code','00123456','00123457','00123458','00123459']){
    const result=await attemptIntakeCode({state:initial(),toolCallId:randomUUID(),raw,skip:false},{allowed:async()=>true,lookup:async()=>null});
    results.push(publicIdentityResult(result.state));
  }
  for(const value of results)assert.deepEqual(value,results[0]);
});

test('code resolution exposes no directory PII, raw code, HMAC or internal ID and cannot reopen to enumerate contacts',async()=>{
  const match=privateMatch();let calls=0;
  const result=await attemptIntakeCode({state:initial(),toolCallId:'resolve',raw:'00123456',skip:false},{allowed:async()=>true,lookup:async()=>{calls++;return match;}});
  const output=JSON.stringify(publicIdentityResult(result.state));
  for(const value of [match.firstName,match.lastName,match.email,match.company,match.linkId,match.organizationId,'00123456'])assert.ok(!output.includes(value));
  assert.equal(publicIdentityResult(result.state).authenticated,false);
  await attemptIntakeCode({state:result.state,toolCallId:'new-code',raw:'00123457',skip:false},{allowed:async()=>true,lookup:async()=>{calls++;return privateMatch();}});
  assert.equal(calls,1);
});

test('caller can withdraw a resolved code and continue manually without another lookup or disclosing stored identity',async()=>{
  const match=privateMatch();let lookups=0;
  const ports={allowed:async()=>true,lookup:async()=>{lookups++;return match;}};
  const resolved=await attemptIntakeCode({state:initial(),toolCallId:'resolved',raw:'00123456',skip:false},ports);
  const withdrawn=await attemptIntakeCode({state:resolved.state,toolCallId:'withdraw',raw:'',skip:true},ports);
  assert.equal(withdrawn.state.mode,'manual');assert.equal(withdrawn.state.linkId,undefined);assert.equal(lookups,1);
  const later=await attemptIntakeCode({state:withdrawn.state,toolCallId:'another',raw:'00123457',skip:false},ports);
  assert.equal(later.state.mode,'manual');assert.equal(lookups,1);
  assert.equal(saveFirstContactSnapshot(claims(),null,{source:'manual',revision:'manual'}).identitySource,'manual');
});

test('readback binds first/last name, email and identity revision; code-mode returns only caller-provided incident fields',()=>{
  const draft=saveFirstContactSnapshot(claims(),null,{source:'manual',revision:'manual'});
  assert.throws(()=>saveFirstContactSnapshot({...claims(),fields:{...claims().fields,contactEmail:'changed@example.test'},callerConfirmed:true,confirmationRevision:draft.revision},draft,{source:'manual',revision:'manual'}));
  const coded={...claims(),fields:{...claims().fields,firstName:'',lastName:'',company:'',contactEmail:''}};
  const snapshot=saveFirstContactSnapshot(coded,null,{source:'code_resolved',revision:'private-revision'});
  assert.deepEqual(Object.keys(publicFirstContactReadback(snapshot)).sort(),['callbackPhone','impact','issue']);
  assert.equal(readFirstContactSnapshot({_operatorosFirstContactV1:snapshot})?.revision,snapshot.revision);
  assert.throws(()=>saveFirstContactSnapshot({...coded,callerConfirmed:true,confirmationRevision:snapshot.revision},snapshot,{source:'manual',revision:'manual'}));
  assert.throws(()=>saveFirstContactSnapshot({...claims(),fields:{...claims().fields,contactEmail:'a@example.test\r\nFrom:bad@example.test'}},null,{source:'manual',revision:'manual'}));
});

test('BMS email destination/prefix/id are fixed; routing tags require exact server tenant/org mapping and never caller text',()=>{
  const tenantId=randomUUID(),callId=randomUUID(),match=privateMatch();
  const env={CALLCOMMAND_INTAKE_ROUTING_TAGS:JSON.stringify([{tenantId,organizationId:match.organizationId,tag:'CMC'}])};
  const manualDraft=saveFirstContactSnapshot({...claims(),fields:{...claims().fields,company:'[CLIENT:CMC] #12345#'}},null,{source:'manual',revision:'manual'});
  const manual={...manualDraft,status:'confirmed' as const};
  const unknown=formatBmsIntakeEmail({tenantId,callId,createdAt:'2026-10-28T20:00:00Z',snapshot:manual,match:null,env});
  assert.equal(unknown.destination,'support@xodus-is.com');assert.equal(unknown.subject,`[CallCommandAI][CLIENT:UNVERIFIED] Intake ${callId}`);
  assert.ok(!unknown.subject.includes('#'));assert.ok(!unknown.body.includes('[CLIENT:CMC]'));assert.ok(!unknown.body.includes('#12345#'));
  const coded=saveFirstContactSnapshot({...claims(),fields:{...claims().fields,firstName:'',lastName:'',company:'',contactEmail:''}},null,{source:'code_resolved',revision:match.revision});
  const email=formatBmsIntakeEmail({tenantId,callId,createdAt:'2026-10-28T20:00:00Z',snapshot:{...coded,status:'confirmed'},match,env});
  assert.match(email.subject,/\[CLIENT:CMC\]/);assert.ok(email.body.includes(match.email));assert.match(email.body,/NOT authenticated/);
  assert.equal((email as Record<string,unknown>).from,undefined);assert.equal((email as Record<string,unknown>).replyTo,undefined);
  assert.throws(()=>formatBmsIntakeEmail({tenantId,callId,createdAt:'2026-10-28T20:00:00Z',snapshot:manual,match,env}));
  assert.throws(()=>formatBmsIntakeEmail({tenantId,callId:callId+'\r\nFrom:bad',createdAt:'2026-10-28',snapshot:manual,match:null}));
  assert.equal(configuredIntakeTag(randomUUID(),match.organizationId,env),null);
  for(const value of ['CMC\r\nFrom:bad','CMC][CLIENT:VRI','#12345#','UNVERIFIED'])assert.equal(configuredIntakeTag(tenantId,match.organizationId,{CALLCOMMAND_INTAKE_ROUTING_TAGS:JSON.stringify([{tenantId,organizationId:match.organizationId,tag:value}])}),null);
  assert.equal(configuredIntakeTag(tenantId,match.organizationId,{CALLCOMMAND_INTAKE_ROUTING_TAGS:JSON.stringify([{tenantId,organizationId:match.organizationId,tag:'CMC'},{tenantId,organizationId:match.organizationId,tag:'VRI'}])}),null);
  assert.equal(configuredIntakeTag(tenantId,match.organizationId,{CALLCOMMAND_INTAKE_ROUTING_TAGS:JSON.stringify([{tenantId,organizationId:match.organizationId,tag:'CMC'},{tenantId,organizationId:randomUUID(),tag:'CMC'}])}),null);
});


test('legacy failed association can narrow to A0 fallback without skipping into privileged states',()=>{
  assert.doesNotThrow(()=>assertCallStateTransition('SUPPORT_ID_REQUESTED','UNRECOGNIZED_LINE'));
  assert.doesNotThrow(()=>assertCallStateTransition('SUPPORT_ID_INVALID','UNRECOGNIZED_LINE'));
  assert.throws(()=>assertCallStateTransition('SUPPORT_ID_REQUESTED','ALLOWED'));
  assert.throws(()=>assertCallStateTransition('UNRECOGNIZED_LINE','VERIFIED'));
});
