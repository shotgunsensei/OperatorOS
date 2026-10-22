import './_pulsedesk-mailbox-network-guard.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mailboxCallbackUri, publicMailboxConfiguration } from '../src/lib/pulsedesk-mailbox-service.js';
import { PulseDeskMailboxError } from '../src/lib/pulsedesk-mailbox-adapter.js';
import { authorize,fixture,owner,foreign,connectorId,time,tokens,mailboxModuleId } from './_pulsedesk-mailbox-fixture.js';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
test('application scope uses canonical module UUID and permits only matching module or tenant-global config and secret',async()=>{
  for(const scope of [mailboxModuleId,null]){const f=fixture();f.setModuleScope(mailboxModuleId,scope,scope);await authorize(f);assert.equal(f.row().status,'active');}
  for(const scopes of [[null,null,null],['malformed','malformed','malformed'],[mailboxModuleId,'70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001'],[mailboxModuleId,null,mailboxModuleId],[mailboxModuleId,mailboxModuleId,null]] as const){
    const f=fixture();f.setModuleScope(scopes[0],scopes[1],scopes[2]);await assert.rejects(f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net'));assert.equal(f.calls.length,0);assert.equal(f.secrets().size,0);
  }
});
async function until(predicate:()=>boolean){for(let n=0;n<100&&!predicate();n++)await new Promise<void>(resolve=>setImmediate(resolve));assert.ok(predicate(),'Synthetic service reached the intended await');}
for(const provider of ['google','microsoft'] as const)test(provider+' actual service binds OAuth state/PKCE/actor and stores credentials only through tenant vault',async()=>{
  const f=fixture(provider);const started=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');
  const state=new URL(started.authorizationUrl).searchParams.get('state')!;
  assert.ok(f.row().oauth_state_hash);assert.ok(f.row().public_config.oauthPendingSecretReferenceId);
  assert.doesNotMatch(JSON.stringify(started),/SYNTHETIC_APP_SECRET|SYNTHETIC_ACCESS|SYNTHETIC_REFRESH|verifier|secretReference/);
  const result=await f.service.complete(owner,connectorId,{state,code:'SYNTHETIC_CODE'});
  assert.deepEqual(result,{connected:true,provider});assert.equal(f.row().status,'active');assert.equal(f.row().oauth_state_hash,null);
  assert.ok(f.row().secret_reference_id);assert.ok(f.secrets().size>0);
  assert.doesNotMatch(JSON.stringify(f.row()),/SYNTHETIC_ACCESS|SYNTHETIC_REFRESH|SYNTHETIC_APP_SECRET/);
  const exchanges=f.calls.filter(value=>value==='exchange').length;
  await assert.rejects(f.service.complete(owner,connectorId,{state,code:'REPLAY'}));assert.equal(f.calls.filter(value=>value==='exchange').length,exchanges);
});
test('missing maintained runtime fails before any SQL, secret or provider work',async()=>{
  const f=fixture();f.setReady(false);await assert.rejects(f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net'));
  assert.equal(f.queries.length,0);assert.equal(f.calls.length,0);
});
test('foreign tenant/actor and expired state do not consume valid state or call provider',async()=>{
  const f=fixture();const started=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');const state=new URL(started.authorizationUrl).searchParams.get('state')!;
  await assert.rejects(f.service.complete(foreign,connectorId,{state,code:'SYNTHETIC_CODE'}));
  await assert.rejects(f.service.complete({...owner,actorUserId:foreign.actorUserId},connectorId,{state,code:'SYNTHETIC_CODE'}));
  assert.ok(f.row().oauth_state_hash);assert.equal(f.calls.filter(value=>value==='exchange').length,0);
  f.setTime(time+10*60_000+1);await assert.rejects(f.service.complete(owner,connectorId,{state,code:'SYNTHETIC_CODE'}));
  assert.equal(f.calls.filter(value=>value==='exchange').length,0);
});
test('invalid database state expiry and changed provider application fail closed before exchange',async()=>{
  for(const invalidExpiry of [true,false]){
    const f=fixture();const started=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');const state=new URL(started.authorizationUrl).searchParams.get('state')!;
    if(invalidExpiry)f.row().oauth_state_expires_at=new Date('invalid');else f.setAppVersion(2);
    await assert.rejects(f.service.complete(owner,connectorId,{state,code:'SYNTHETIC_CODE'}));assert.equal(f.calls.filter(value=>value==='exchange').length,0);
  }
});
test('same state concurrent callbacks exchange once; second callback is a replay',async()=>{
  const f=fixture();const started=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');const state=new URL(started.authorizationUrl).searchParams.get('state')!;
  const held=deferred<typeof tokens>();let exchanges=0;f.adapter.exchange=async()=>{exchanges++;return held.promise;};
  const first=f.service.complete(owner,connectorId,{state,code:'SYNTHETIC_CODE'});await until(()=>exchanges===1);
  await assert.rejects(f.service.complete(owner,connectorId,{state,code:'SYNTHETIC_CODE'}));held.resolve({...tokens});await first;assert.equal(exchanges,1);
});
test('disconnect during provider exchange prevents later mailbox verification or credential activation',async()=>{
  const f=fixture();const started=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');const state=new URL(started.authorizationUrl).searchParams.get('state')!;
  const held=deferred<typeof tokens>();let entered=false;f.adapter.exchange=async()=>{entered=true;return held.promise;};
  const work=f.service.complete(owner,connectorId,{state,code:'SYNTHETIC_CODE'});await until(()=>entered);
  await f.service.disconnect(owner,connectorId);held.resolve({...tokens});await assert.rejects(work);
  assert.equal(f.row().status,'revoked');assert.equal(f.row().secret_reference_id,null);assert.equal(f.calls.filter(value=>value==='verify').length,0);
});
test('new authorization generation survives an older held callback and failure handler',async()=>{
  const f=fixture();const first=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');const held=deferred<typeof tokens>();let entered=false;
  f.adapter.exchange=async()=>{entered=true;return held.promise;};
  const work=f.service.complete(owner,connectorId,{state:new URL(first.authorizationUrl).searchParams.get('state'),code:'SYNTHETIC_CODE'});await until(()=>entered);
  const next=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');const snapshot=structuredClone(f.row());held.resolve({...tokens});await assert.rejects(work);
  assert.deepEqual(f.row(),snapshot);assert.equal(f.row().status,'pending');assert.notEqual(next.authorizationUrl,first.authorizationUrl);
});
test('foreign provider config and user-controlled callback origins cannot resolve app secrets',async()=>{
  const f=fixture();f.setAppTenant(foreign.tenantId);
  await assert.rejects(f.service.validateConfiguration(owner,'microsoft','operations@example.invalid'));
  await assert.rejects(f.service.start(owner,connectorId,'https://attacker.invalid'));
  assert.equal(f.calls.filter(value=>value==='application-secret').length,0);
  assert.equal(mailboxCallbackUri('https://operatoros.net'),'https://operatoros.net/app/pulsedesk/integrations');
});
test('poll commits import+cursor before acknowledgement and only scoped safe config is public',async()=>{
  const f=fixture();await authorize(f);
  f.adapter.acknowledge=async()=>{assert.equal(f.ingestions.length,1);assert.ok(f.row().public_config.mailboxCursor);f.calls.push('ack');};
  assert.deepEqual(await f.service.poll(owner,connectorId),{imported:1});
  assert.equal(f.row().public_config.pollLease,undefined);assert.equal(f.row().public_config.pendingAcknowledgements,undefined);
  assert.deepEqual(Object.keys(publicMailboxConfiguration({...f.row().public_config,verifier:'PRIVATE',accessToken:'PRIVATE'})).sort(),['operationsOnly','sharedProviderConfigId']);
});
test('failed import rolls back its projection/cursor and leaves a recoverable degraded connector',async()=>{
  const f=fixture();await authorize(f);f.setIngest(async()=>{f.ingestions.push('uncommitted');throw new Error('SYNTHETIC_DATABASE_FAILURE');});
  await assert.rejects(f.service.poll(owner,connectorId),error=>{assert.doesNotMatch(String(error),/SYNTHETIC_DATABASE_FAILURE/);return true;});
  assert.equal(f.ingestions.length,0);assert.equal(f.row().public_config.mailboxCursor,undefined);assert.equal(f.row().public_config.pollLease,undefined);assert.equal(f.row().status,'degraded');
  assert.equal(f.calls.filter(value=>value==='ack').length,0);
});
test('disconnect during a held read prevents all ticket/cursor writes and acknowledgements',async()=>{
  const f=fixture();await authorize(f);const held=deferred<Awaited<ReturnType<typeof f.adapter.read>>>();let entered=false;
  f.adapter.read=async()=>{entered=true;return held.promise;};const work=f.service.poll(owner,connectorId);await until(()=>entered);
  await f.service.disconnect(owner,connectorId);held.resolve({messages:[],cursor:{uidValidity:'7',lastUid:100}});await assert.rejects(work);
  assert.equal(f.ingestions.length,0);assert.equal(f.row().public_config.mailboxCursor,undefined);assert.equal(f.calls.filter(value=>value==='ack').length,0);
});
test('overlapping poll lease rejects second worker before provider refresh or mailbox access',async()=>{
  const f=fixture();await authorize(f);const held=deferred<Awaited<ReturnType<typeof f.adapter.read>>>();let reads=0;
  f.adapter.read=async()=>{reads++;return held.promise;};const work=f.service.poll(owner,connectorId);await until(()=>reads===1);
  await assert.rejects(f.service.poll(owner,connectorId),error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_POLL_BUSY');
  held.resolve({messages:[],cursor:{uidValidity:'7',lastUid:100}});await work;assert.equal(reads,1);
});
test('failed provider acknowledgement keeps durable pending IDs; retry acknowledges before reading next cursor',async()=>{
  const f=fixture();await authorize(f);let acknowledgements=0;
  f.adapter.acknowledge=async()=>{acknowledgements++;throw new Error('SYNTHETIC_ACK_FAILURE');};
  await assert.rejects(f.service.poll(owner,connectorId));assert.equal(f.ingestions.length,1);assert.deepEqual(f.row().public_config.pendingAcknowledgements,[1]);
  f.adapter.acknowledge=async()=>{acknowledgements++;};f.adapter.read=async()=>{assert.equal(f.row().public_config.pendingAcknowledgements,undefined);return{messages:[],cursor:{uidValidity:'7',lastUid:1}};};
  await f.service.poll(owner,connectorId);assert.equal(f.ingestions.length,1);assert.equal(f.row().public_config.pendingAcknowledgements,undefined);assert.equal(acknowledgements,3);
});
test('foreign secret pointer cannot be decrypted or initiate provider reads',async()=>{
  const f=fixture();await authorize(f);f.row().secret_reference_id='90000000-0000-4000-8000-000000000009';
  await assert.rejects(f.service.poll(owner,connectorId));assert.equal(f.calls.filter(value=>value==='read'||value==='refresh').length,0);
});

test('application rotation during held mailbox verification cannot activate stale credentials',async()=>{
  const f=fixture();const started=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');
  const held=deferred<{verified:true}>();let entered=false;f.adapter.verify=async()=>{entered=true;return held.promise;};
  const work=f.service.complete(owner,connectorId,{state:new URL(started.authorizationUrl).searchParams.get('state'),code:'SYNTHETIC_CODE'});await until(()=>entered);
  f.setAppVersion(2);held.resolve({verified:true});await assert.rejects(work,error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_APPLICATION_CHANGED');
  assert.equal(f.row().secret_reference_id,null);assert.equal(f.row().status,'degraded');
});

test('unapproved callback setup and changed application identity cannot initiate mailbox access',async()=>{
  const f=fixture();f.setCallbackReady(false);await assert.rejects(f.service.validateConfiguration(owner,'google','operations@example.invalid'));
  assert.equal(f.calls.length,0);f.setCallbackReady(true);await authorize(f);f.setAppClientId('DIFFERENT_SYNTHETIC_APP');
  await assert.rejects(f.service.poll(owner,connectorId),error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_APPLICATION_CHANGED');
  assert.equal(f.calls.filter(value=>value==='read'||value==='refresh').length,0);
});

test('recreated mailbox drops stale pending acknowledgement before scanning replacement UIDs',async()=>{
  const f=fixture();await authorize(f);f.adapter.acknowledge=async()=>{throw new Error('SYNTHETIC_ACK_FAILURE');};
  await assert.rejects(f.service.poll(owner,connectorId));assert.deepEqual(f.row().public_config.pendingAcknowledgements,[1]);
  let ack=0;f.adapter.acknowledge=async input=>{ack++;assert.equal(input.uidValidity,'7');throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_UIDVALIDITY_CHANGED');};
  f.adapter.read=async input=>{assert.equal(input.cursor,null);assert.equal(f.row().public_config.pendingAcknowledgements,undefined);return{messages:[],cursor:{uidValidity:'8',lastUid:0}};};
  // The final empty acknowledgement does no provider work in the real adapter.
  const acknowledge=f.adapter.acknowledge;f.adapter.acknowledge=input=>input.uids.length?acknowledge(input):Promise.resolve();
  await f.service.poll(owner,connectorId);assert.equal(ack,1);assert.equal(f.ingestions.length,1);assert.equal(f.row().status,'active');
});

test('refresh rotation replaces only owned encrypted credentials before mailbox use',async()=>{
  const f=fixture();await authorize(f);const oldReference=f.row().secret_reference_id!;f.setTime(time+3_600_000-30_000);
  f.adapter.refresh=async()=>({accessToken:'ROTATED_SYNTHETIC_ACCESS',refreshToken:'ROTATED_SYNTHETIC_REFRESH',expiresAt:time+7_200_000});
  f.adapter.read=async input=>{assert.equal(input.credentials.accessToken,'ROTATED_SYNTHETIC_ACCESS');assert.notEqual(f.row().secret_reference_id,oldReference);assert.equal(f.secrets().get(oldReference)?.revoked,true);return{messages:[],cursor:{uidValidity:'7',lastUid:0}};};
  await f.service.poll(owner,connectorId);assert.doesNotMatch(JSON.stringify(f.row()),/ROTATED_SYNTHETIC/);
});

for(const status of ['processed','rejected'])test('duplicate '+status+' message acknowledgement respects existing quarantine state',async()=>{
  const f=fixture();await authorize(f);f.setIngest(async()=>({statusCode:200,payload:{duplicate:true,status,ticketId:status==='processed'?'synthetic-existing-ticket':null}}));
  let acknowledged:number[]=[];f.adapter.acknowledge=async input=>{acknowledged=input.uids;};
  const result=await f.service.poll(owner,connectorId);assert.deepEqual(acknowledged,status==='processed'?[1]:[]);assert.equal(result.imported,status==='processed'?1:0);
});

test('revoked queued authority prevents every secret, SQL and provider operation',async()=>{
  const f=fixture();await authorize(f);f.setAuthorized(false);const queries=f.queries.length,calls=f.calls.length;
  await assert.rejects(f.service.poll(owner,connectorId),error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_AUTHORITY_REQUIRED');assert.equal(f.queries.length,queries);assert.equal(f.calls.length,calls);
});

test('authority revoked during a held mailbox read prevents ticket writes and acknowledgements',async()=>{
  const f=fixture();await authorize(f);const held=deferred<Awaited<ReturnType<typeof f.adapter.read>>>();let entered=false;
  f.adapter.read=async()=>{entered=true;return held.promise;};const work=f.service.poll(owner,connectorId);await until(()=>entered);
  f.setAuthorized(false);held.resolve({messages:[{uid:1,messageId:'synthetic-message',from:'requester@example.invalid',subject:'Operational support',attachmentCount:0,attachmentsClean:true}],cursor:{uidValidity:'7',lastUid:1}});
  await assert.rejects(work,error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_AUTHORITY_REQUIRED');assert.equal(f.ingestions.length,0);assert.equal(f.calls.filter(call=>call==='ack').length,0);assert.equal(f.row().public_config.mailboxCursor,undefined);
});

test('authority revoked during OAuth exchange cannot verify or activate the mailbox',async()=>{
  const f=fixture();const started=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');const held=deferred<typeof tokens>();let entered=false;
  f.adapter.exchange=async()=>{entered=true;return held.promise;};const work=f.service.complete(owner,connectorId,{state:new URL(started.authorizationUrl).searchParams.get('state'),code:'SYNTHETIC_CODE'});await until(()=>entered);
  f.setAuthorized(false);held.resolve({...tokens});await assert.rejects(work);assert.equal(f.row().secret_reference_id,null);assert.equal(f.calls.filter(call=>call==='verify').length,0);
});
