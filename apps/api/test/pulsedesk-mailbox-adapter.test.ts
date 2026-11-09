import './_pulsedesk-mailbox-network-guard.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createMailboxOAuthRequest, createPulseDeskMailboxAdapter, mailboxAddress, mailboxProvider,
  parseMailboxApplication, pulseDeskMailboxRuntimeStatus, loadPulseDeskMailboxAdapter, inspectPulseDeskMailboxRuntime, PULSEDESK_MAILBOX_PACKAGES,
  type MaintainedMailboxClient, type MaintainedMailboxConfiguration, type ParsedMailboxMessage,
} from '../src/lib/pulsedesk-mailbox-adapter.js';

const time=1_800_000_000_000;
const credentials={accessToken:'SYNTHETIC_ACCESS_ONLY',refreshToken:'SYNTHETIC_REFRESH_ONLY',expiresAt:time+3_600_000};
const application={clientId:'SYNTHETIC_CLIENT',clientSecret:'SYNTHETIC_APP_SECRET'};
function fixture(options:{uids?:number[];size?:number;source?:Buffer;parsed?:ParsedMailboxMessage;uidNext?:number;uidValidity?:string}={}) {
  const calls:Array<{kind:string;value?:unknown}>=[]; const configurations:MaintainedMailboxConfiguration[]=[];
  const client:MaintainedMailboxClient={
    async connect(){calls.push({kind:'connect'});},
    async getMailboxLock(folder){calls.push({kind:'lock',value:folder});return{release(){calls.push({kind:'release'});}};},
    async status(){return{uidNext:options.uidNext??102,uidValidity:options.uidValidity??'7'};},
    async search(query){calls.push({kind:'search',value:query});return options.uids??[1,2];},
    async fetchOne(uid,query){calls.push({kind:'fetch',value:{uid,query}});return query.source?{source:options.source??Buffer.from('synthetic MIME only')}:{size:options.size??128};},
    async messageFlagsAdd(uids,flags){calls.push({kind:'ack',value:{uids,flags}});},
    async logout(){calls.push({kind:'logout'});},close(){calls.push({kind:'close'});},
  };
  let fetcher:typeof fetch=async (url,init)=>{
    calls.push({kind:'token',value:{url:String(url),init}});
    return new Response(JSON.stringify({access_token:credentials.accessToken,refresh_token:credentials.refreshToken,expires_in:3600}),{headers:{'content-type':'application/json'}});
  };
  const adapter=createPulseDeskMailboxAdapter({now:()=>time,fetch:(...args)=>fetcher(...args),client:configuration=>{configurations.push(configuration);return client;},parse:async source=>{calls.push({kind:'parse',value:source.length});return options.parsed??{subject:'Operational equipment support request',from:{value:[{address:'requester@example.invalid'}]},attachments:[]};}});
  return{adapter,client,calls,configurations,setFetch(next:typeof fetch){fetcher=next;}};
}
for(const provider of ['google','microsoft'] as const) {
  test(`${provider} existing OAuth contract adds PKCE, fresh state and exact provider URLs without secret URL values`,()=>{
    const first=createMailboxOAuthRequest({provider,clientId:application.clientId,mailbox:'Facilities@example.invalid',redirectUri:'https://pulsedesk.operatoros.net/integrations'});
    const second=createMailboxOAuthRequest({provider,clientId:application.clientId,mailbox:'facilities@example.invalid',redirectUri:'https://pulsedesk.operatoros.net/integrations'});
    assert.notEqual(first.state,second.state);assert.match(first.state,/^[A-Za-z0-9_-]{43}$/);
    assert.match(first.verifier,/^[A-Za-z0-9_-]{64}$/);
    const url=new URL(first.authorizationUrl);
    assert.equal(url.origin,provider==='google'?'https://accounts.google.com':'https://login.microsoftonline.com');
    assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(first.verifier).digest('base64url'));
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('state'),first.state);
    assert.equal(url.searchParams.get('redirect_uri'),first.redirectUri);
    assert.equal(url.searchParams.get('login_hint'),'facilities@example.invalid');
    assert.match(url.searchParams.get('scope')!,provider==='google'?/https:\/\/mail.google.com\//:/IMAP.AccessAsUser.All/);
    assert.doesNotMatch(first.authorizationUrl,/SYNTHETIC_APP_SECRET|SYNTHETIC_ACCESS_ONLY|SYNTHETIC_REFRESH_ONLY/);
  });
  test(`${provider} token exchange is fixed-endpoint POST, bounded, no redirects and server-only credentials`,async()=>{
    const f=fixture();const oauth=createMailboxOAuthRequest({provider,clientId:application.clientId,mailbox:'facilities@example.invalid',redirectUri:'https://pulsedesk.operatoros.net/integrations'});
    const result=await f.adapter.exchange({provider,application,code:'SYNTHETIC_CODE',verifier:oauth.verifier,redirectUri:oauth.redirectUri});
    assert.deepEqual(result,credentials);
    const call=f.calls.find(c=>c.kind==='token')!.value as {url:string;init:RequestInit};
    assert.equal(call.url,provider==='google'?'https://oauth2.googleapis.com/token':'https://login.microsoftonline.com/common/oauth2/v2.0/token');
    assert.equal(call.init.method,'POST');assert.equal(call.init.redirect,'error');assert.ok(call.init.signal);
    const body=call.init.body as URLSearchParams;
    assert.equal(body.get('client_secret'),application.clientSecret);assert.equal(body.get('code_verifier'),oauth.verifier);
    assert.doesNotMatch(call.url,/SYNTHETIC/);
  });
  test(`${provider} maintained client uses fixed TLS hostname, verified certificates, OAuth and no logger`,async()=>{
    const f=fixture();await f.adapter.verify({provider,mailbox:'facilities@example.invalid',credentials});
    const configuration=f.configurations[0];
    assert.equal(configuration.host,provider==='google'?'imap.gmail.com':'outlook.office365.com');
    assert.equal(configuration.servername,configuration.host);assert.equal(configuration.port,993);assert.equal(configuration.secure,true);
    assert.deepEqual(configuration.tls,{rejectUnauthorized:true,minVersion:'TLSv1.2'});
    assert.deepEqual(configuration.auth,{user:'facilities@example.invalid',accessToken:credentials.accessToken});
    assert.equal(configuration.logger,false);assert.ok(f.calls.some(c=>c.kind==='release'));assert.equal(f.calls.at(-1)!.kind,'close');
  });
}
for(const invalid of ['http://pulsedesk.operatoros.net/integrations','https://user:pass@pulsedesk.operatoros.net/integrations','https://pulsedesk.operatoros.net/integrations#fragment','https://pulsedesk.operatoros.net/integrations?redirect=bad']) {
  test('OAuth redirect rejects unsafe shape '+new URL(invalid).protocol+' '+new URL(invalid).pathname,()=>{
    assert.throws(()=>createMailboxOAuthRequest({provider:'google',clientId:application.clientId,mailbox:'a@example.invalid',redirectUri:invalid}),/Mailbox connection/);
  });
}
for(const value of [' leading@example.invalid','a@example.invalid\r\nInjected: yes','not-an-address','a@localhost','x'.repeat(255)+'@example.invalid']) test('mailbox address validation rejects malformed/control/oversized input',()=>assert.throws(()=>mailboxAddress(value)));
test('provider and application validation cannot select caller-controlled transport or extra secret properties',()=>{
  assert.throws(()=>mailboxProvider('https://localhost'));assert.equal(mailboxAddress('Facilities@example.invalid'),'facilities@example.invalid');
  assert.deepEqual(parseMailboxApplication(JSON.stringify(application)),application);
  for(const body of [{...application,host:'localhost'},{clientId:'x',clientSecret:''},{...application,accessToken:credentials.accessToken}]) assert.throws(()=>parseMailboxApplication(JSON.stringify(body)));
});
for(const response of [
  ()=>new Response('SYNTHETIC_PROVIDER_PRIVATE_FAILURE',{status:500}),
  ()=>new Response('',{status:302,headers:{location:'https://example.invalid'}}),
  ()=>new Response(JSON.stringify({access_token:'x',refresh_token:'y'})),
  ()=>new Response(JSON.stringify({access_token:'x',refresh_token:'y',expires_in:0})),
  ()=>new Response(JSON.stringify({access_token:'x',refresh_token:'y',expires_in:86401})),
  ()=>new Response(JSON.stringify({access_token:'x',refresh_token:'y',expires_in:3600,scope:'openid email'})),
  ()=>new Response('x'.repeat(65537)),
  ()=>new Response(JSON.stringify({access_token:'x\nsecret',refresh_token:'y',expires_in:3600})),
]) test('invalid provider token response fails closed without echoing response/credentials',async()=>{
  const f=fixture();f.setFetch(async()=>response());
  await assert.rejects(f.adapter.exchange({provider:'google',application,code:'synthetic',verifier:'a'.repeat(64),redirectUri:'https://pulsedesk.operatoros.net/integrations'}),error=>{
    assert.equal((error as {code:string}).code,'PULSEDESK_MAILBOX_TOKEN_FAILED');assert.doesNotMatch(String(error),/SYNTHETIC_PROVIDER|SYNTHETIC_APP_SECRET/);return true;
  });assert.equal(f.configurations.length,0);
});
test('refresh preserves a retained refresh token or accepts provider rotation',async()=>{
  const f=fixture();f.setFetch(async()=>new Response(JSON.stringify({access_token:'rotated_access',expires_in:3600})));
  assert.equal((await f.adapter.refresh({provider:'google',application,credentials})).refreshToken,credentials.refreshToken);
  f.setFetch(async()=>new Response(JSON.stringify({access_token:'rotated_access',refresh_token:'rotated_refresh',expires_in:3600})));
  assert.equal((await f.adapter.refresh({provider:'microsoft',application,credentials})).refreshToken,'rotated_refresh');
});
test('bounded cursor scans at most100 UIDs and imports at most20 messages without bodies or attachments',async()=>{
  const f=fixture({uids:Array.from({length:30},(_,i)=>i+1),parsed:{subject:'Operational support request',from:{value:[{address:'sender@example.invalid'}]},attachments:[{content:Buffer.from('PRIVATE_ATTACHMENT')}]}});
  const result=await f.adapter.read({provider:'google',mailbox:'facilities@example.invalid',credentials,connectorId:'same-connector'});
  assert.equal(result.messages.length,20);assert.deepEqual(result.cursor,{uidValidity:'7',lastUid:20});
  assert.deepEqual(f.calls.find(c=>c.kind==='search')!.value,{seen:false,uid:'1:100'});
  assert.equal(result.messages[0].attachmentCount,1);assert.equal(result.messages[0].attachmentsClean,false);
  assert.match(result.messages[0].messageId,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_ATTACHMENT|synthetic MIME|accessToken|bodyPlain|bodyHtml/);
  assert.equal(f.calls.filter(c=>c.kind==='ack').length,0);
});
test('UIDVALIDITY replacement resets scan and scoped message IDs; empty ranges do not fetch',async()=>{
  const f=fixture({uids:[1],uidNext:10});
  const first=await f.adapter.read({provider:'microsoft',mailbox:'a@example.invalid',credentials,connectorId:'A',cursor:{uidValidity:'old',lastUid:500}});
  const second=await f.adapter.read({provider:'microsoft',mailbox:'a@example.invalid',credentials,connectorId:'B'});
  assert.notEqual(first.messages[0].messageId,second.messages[0].messageId);assert.equal(first.cursor.lastUid,9);
  const empty=fixture({uidNext:1});const result=await empty.adapter.read({provider:'google',mailbox:'a@example.invalid',credentials,connectorId:'A'});
  assert.equal(result.messages.length,0);assert.equal(empty.calls.filter(c=>c.kind==='fetch'||c.kind==='search').length,0);
});
test('declared and actual MIME size are checked before parsing and connection is closed',async()=>{
  for(const options of [{size:2097153},{source:Buffer.alloc(2097153)}]){
    const f=fixture(options);await assert.rejects(f.adapter.read({provider:'google',mailbox:'a@example.invalid',credentials,connectorId:'A'}));
    assert.equal(f.calls.filter(c=>c.kind==='parse').length,0);assert.equal(f.calls.at(-1)!.kind,'close');
  }
});
test('expired access token and oversized acknowledgement never open a mailbox',async()=>{
  const f=fixture();await assert.rejects(f.adapter.verify({provider:'google',mailbox:'a@example.invalid',credentials:{...credentials,expiresAt:time+1000}}));
  await assert.rejects(f.adapter.acknowledge({provider:'google',mailbox:'a@example.invalid',credentials,uids:Array.from({length:21},(_,i)=>i+1),uidValidity:'7'}));
  assert.equal(f.configurations.length,0);
});
test('acknowledgement is explicit and bounded, never part of mailbox read',async()=>{
  const f=fixture();await f.adapter.acknowledge({provider:'microsoft',mailbox:'a@example.invalid',credentials,uids:[1,2],uidValidity:'7'});
  assert.deepEqual(f.calls.find(c=>c.kind==='ack')!.value,{uids:[1,2],flags:['\\Seen']});
});

test('mailbox recreation never marks unrelated replacement UIDs as seen',async()=>{
  const f=fixture({uidValidity:'8'});await assert.rejects(f.adapter.acknowledge({provider:'google',mailbox:'a@example.invalid',credentials,uids:[1],uidValidity:'7'}),error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_UIDVALIDITY_CHANGED');
  assert.equal(f.calls.filter(call=>call.kind==='ack').length,0);
});
test('whole-client deadline closes an unresponsive maintained client',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const f=fixture();f.client.connect=()=>new Promise(()=>undefined);
  const work=f.adapter.verify({provider:'google',mailbox:'a@example.invalid',credentials});
  context.mock.timers.tick(30000);
  await assert.rejects(work,error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_DEADLINE');
  assert.ok(f.calls.some(c=>c.kind==='close'));context.mock.timers.reset();
});
test('production readiness requires canonical declared/pinned maintained dependencies',()=>{
  const readiness=pulseDeskMailboxRuntimeStatus();
  assert.deepEqual(readiness.providers,['google','microsoft']);
  if(!readiness.available){assert.ok(readiness.missingPackages.length);assert.throws(()=>loadPulseDeskMailboxAdapter(),error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_DEPENDENCIES_UNAVAILABLE');}
  else assert.equal(typeof loadPulseDeskMailboxAdapter().read,'function');
});

test('partial maintained transitive closure cannot advertise a live adapter',()=>{
  const load=(name:string)=>name.endsWith('/package.json')?{version:name.startsWith('imapflow')?'1.7.8':'3.14.2'}:name==='imapflow'?{ImapFlow:class{}}:{simpleParser:()=>undefined};
  assert.equal(inspectPulseDeskMailboxRuntime(PULSEDESK_MAILBOX_PACKAGES,load).available,true);
  const missing=inspectPulseDeskMailboxRuntime(PULSEDESK_MAILBOX_PACKAGES,name=>{if(name==='imapflow')throw new Error('SYNTHETIC_MISSING_TRANSITIVE');return load(name);});
  assert.deepEqual(missing.missingPackages,['imapflow@1.7.8']);assert.equal(missing.available,false);
  assert.equal(inspectPulseDeskMailboxRuntime(PULSEDESK_MAILBOX_PACKAGES,name=>name==='mailparser'?{}:load(name)).available,false);
});
