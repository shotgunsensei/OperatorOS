import './_pulsedesk-mailbox-network-guard.js';
import { after,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import Fastify, { type FastifyInstance,type FastifyReply,type FastifyRequest } from 'fastify';
import ts from 'typescript';
import { sql,type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { PulseDeskMailboxError } from '../src/lib/pulsedesk-mailbox-adapter.js';
import { publicMailboxConfiguration,type PulseDeskMailboxContext,type createPulseDeskMailboxService } from '../src/lib/pulsedesk-mailbox-service.js';
import { tenantRoleToEffective } from '../src/lib/role-aliases.js';
const own='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const actor='30000000-0000-4000-8000-000000000001',connectorId='20000000-0000-4000-8000-000000000001';
type Row=Record<string,unknown>;
type MailboxDependencies=Parameters<typeof createPulseDeskMailboxService>[0];
const canonicalModuleId='60000000-0000-4000-8000-000000000001';
const apps:FastifyInstance[]=[];
after(async()=>{for(const app of apps)await app.close();});
async function fixture(options:{available?:boolean;mode?:'test'|'live'}={}){
  const available=options.available??true,mode=options.mode??'live';
  let connectors:Row[]=[{id:connectorId,tenant_id:own,provider:'google',label:'Operations inbox',mailbox_address:'operations@example.invalid',inbound_alias:'synthetic-inbound-alias',mode,status:'active',revoked_at:null,created_by_user_id:actor,version:1,public_config:{operationsOnly:true,sharedProviderConfigId:'40000000-0000-4000-8000-000000000001',accessToken:'PRIVATE_PUBLIC_CONFIG_CANARY',oauthPendingSecretReferenceId:'PRIVATE_PENDING_CANARY'}}];
  let inbound:Row[]=[];let tickets:Row[]=[];let events:Row[]=[];let sequence=0;let fault=false;
  const calls:Array<{kind:string;context?:unknown;input?:unknown}>=[];const handlers=new Map<string,(context:unknown)=>Promise<void>>();
  const secrets=new Map<string,{tenantId:string;moduleId:string|null;purpose:string;reference:string;revoked:boolean}>();
  let canonicalModule:string|null=canonicalModuleId;let mailboxDependencies!:MailboxDependencies;
  let authorizeService:(context:PulseDeskMailboxContext)=>Promise<void>=async()=>{throw new Error('Authorization port not wired');};
  let authority={hasAccess:true,accessLevel:'user',viaPlatformRole:false};let membershipRole:string|null='owner';
  const authorityCalls:unknown[][]=[];
  const dialect=new PgDialect();
  function value(query:{sql:string;params:unknown[]},name:string){const match=new RegExp('\\b'+name+'\\s*=\\s*\\$(\\d+)').exec(query.sql);return match?query.params[Number(match[1])-1]:undefined;}
  const execute=async(statement:SQL)=>{
    const query=dialect.sqlToQuery(statement),text=query.sql.replace(/\s+/g,' ').trim();const p=query.params;
    if(text==="SELECT id FROM modules WHERE slug='pulsedesk' LIMIT 1")return{rows:canonicalModule===null?[]:[{id:canonicalModule}]};
    if(text.includes('shared_secret_references')){
      const row=secrets.get(String(value(query,'id'))),scope=/module_id IS NOT DISTINCT FROM \$(\d+)/.exec(text);
      const moduleId=scope?p[Number(scope[1])-1]:value(query,'module_id');
      const match=row&&row.tenantId===value(query,'tenant_id')&&row.moduleId===moduleId&&row.purpose===value(query,'purpose')&&!row.revoked;
      if(text.startsWith('UPDATE')){if(match)row.revoked=true;return{rows:[]};}
      return{rows:match?[{id:value(query,'id')}]:[]};
    }
    if(text.startsWith('SELECT')&&text.includes('FROM pulsedesk_mail_connectors')){
      const tenant=value(query,'tenant_id'),id=value(query,'id'),alias=value(query,'inbound_alias');
      const rows=connectors.filter(row=>!row.revoked_at&&(tenant===undefined||row.tenant_id===tenant)&&(id===undefined||row.id===id)&&(alias===undefined||row.inbound_alias===alias));
      return{rows:structuredClone(rows)};
    }
    if(text.startsWith('INSERT INTO pulsedesk_mail_connectors')){
      const row={tenant_id:p[0],provider:p[1],label:p[2],inbound_alias:p[3],mailbox_address:p[4],mode:'live',status:'pending',public_config:p[5],created_by_user_id:p[6],id:randomUUID(),version:1,revoked_at:null};connectors.push(row);return{rows:[structuredClone(row)]};
    }
    if(text.startsWith('UPDATE pulsedesk_mail_connectors')){
      const row=connectors.find(row=>row.tenant_id===value(query,'tenant_id')&&row.id===value(query,'id')&&!row.revoked_at);return{rows:row?[{id:row.id}]:[]};
    }
    if(text.startsWith('INSERT INTO pulsedesk_connector_events')){
      if(fault&&p[2]==='ingested')throw new Error('SYNTHETIC_ACTIVITY_FAILURE');events.push({tenantId:p[0],connectorId:p[1],type:p[2]});return{rows:[]};
    }
    if(text.startsWith('SELECT')&&text.includes('FROM pulsedesk_connector_events'))return{rows:events.filter(row=>row.tenantId===value(query,'tenant_id'))};
    if(text.startsWith('INSERT INTO pulsedesk_inbound_messages')){
      if(inbound.some(row=>row.tenant_id===p[0]&&row.provider===p[2]&&row.message_id===p[3]))return{rows:[]};
      const row={id:randomUUID(),tenant_id:p[0],connector_id:p[1],provider:p[2],message_id:p[3],sender_hash:p[4],subject_summary:p[5],attachment_count:p[6],scan_status:p[7],status:p[8],ticket_id:null};inbound.push(row);return{rows:[{id:row.id}]};
    }
    if(text.startsWith('SELECT ticket_id,status FROM pulsedesk_inbound_messages'))return{rows:inbound.filter(row=>row.tenant_id===value(query,'tenant_id')&&row.provider===value(query,'provider')&&row.message_id===value(query,'message_id'))};
    if(text.startsWith('INSERT INTO pulsedesk_request_sequences'))return{rows:[{last_number:++sequence}]};
    if(text.startsWith('INSERT INTO pulsedesk_requests')){const row={id:randomUUID(),tenant_id:p[0],number:p[1],summary:p[3],status:'new'};tickets.push(row);return{rows:[structuredClone(row)]};}
    if(text.startsWith('UPDATE pulsedesk_inbound_messages')){const row=inbound.find(row=>row.id===value(query,'id'));if(row){row.status='processed';row.ticket_id=p[0];}return{rows:[]};}
    throw new Error('UNEXPECTED_SYNTHETIC_ROUTE_SQL '+text);
  };
  const db={execute,async transaction<T>(work:(tx:{execute:typeof execute})=>Promise<T>){const saved={connectors:structuredClone(connectors),inbound:structuredClone(inbound),tickets:structuredClone(tickets),events:structuredClone(events),sequence};
    try{return await work({execute});}catch(error){connectors=saved.connectors;inbound=saved.inbound;tickets=saved.tickets;events=saved.events;sequence=saved.sequence;throw error;}}};
  const member=async(request:FastifyRequest,reply:FastifyReply)=>{const identity=request.headers['x-test-identity'];if(!identity)return reply.code(401).send({code:'AUTH_REQUIRED'});Object.assign(request,{user:{id:actor},tenantContext:{tenantId:identity==='foreign'?other:own,role:identity==='tenant-viewer'?'viewer':['member','module-manager'].includes(String(identity))?'member':'owner',viaPlatformRole:false},tenantModuleAccessLevel:identity==='module-viewer'?'viewer':identity==='module-manager'?'manager':'user'});};
  const write=async(request:FastifyRequest,reply:FastifyReply)=>{if(['member','tenant-viewer','module-viewer'].includes(String(request.headers['x-test-identity'])))return reply.code(403).send({code:'WRITE_DENIED'});};
  const service={
    async validateConfiguration(context:unknown,provider:unknown,address:unknown){calls.push({kind:'configure',context,input:{provider,address}});return{provider,mailbox:address,publicConfig:{operationsOnly:true,sharedProviderConfigId:'40000000-0000-4000-8000-000000000001'}};},
    async start(context:unknown,id:unknown,origin:unknown){calls.push({kind:'start',context,input:{id,origin}});return{authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic'};},
    async complete(context:unknown,id:unknown,input:unknown){calls.push({kind:'complete',context,input:{id,input}});return{connected:true,provider:'google'};},
    async poll(context:unknown,id:unknown){calls.push({kind:'poll',context,input:id});return{imported:1};},
    async disconnect(context:unknown,id:unknown){calls.push({kind:'disconnect',context,input:id});},
  };
  const sourcePath=process.env.PULSEDESK_ROUTE_SOURCE??resolve(import.meta.dirname,'../src/routes/pulsedesk-literal-routes.ts');
  const source=readFileSync(sourcePath,'utf8');const exports:Record<string,unknown>={};
  const dependencies:Record<string,unknown>={
    'node:crypto':{createHash,randomBytes},'drizzle-orm':{sql},'../db.js':{db},
    '../lib/tenant-auth.js':{requireTenantMember:member,requireTenantModuleAccess:()=>async()=>undefined,requireTenantModuleWriteAccess:write},
    '../lib/tenant-entitlements.js':{resolveTenantModuleAccess:async(...args:unknown[])=>{authorityCalls.push(args);return authority;},getTenantMembership:async()=>membershipRole===null?null:{role:membershipRole}},
    '../lib/role-aliases.js':{tenantRoleToEffective},
    '../lib/shared-secret-vault.js':{storeEncryptedSecretReference:async(input:{tenantId:string;moduleId:string|null;purpose:string;reference:string})=>{const id=randomUUID();secrets.set(id,{...input,revoked:false});return{id};},resolveEncryptedSecretReference:async(input:{id:string})=>{calls.push({kind:'decrypt',input});return secrets.get(input.id)?.reference??null;},getSharedSecretVaultReadiness:()=>({configured:true})},
    '../lib/shared-background-jobs.js':{registerSharedJobHandler:(key:string,handler:(context:unknown)=>Promise<void>)=>handlers.set(key,handler),enqueueSharedJob:async(input:unknown)=>{calls.push({kind:'queue',input});return{job:{id:'synthetic-job'},duplicate:false};}},
    '../lib/shared-platform-control-plane.js':{saveProviderConfiguration:async()=>({id:randomUUID()})},
    '../lib/shared-service-safety.js':{isOperatorOSDeterministicProviderTestEnvironment:()=>true},
    '../lib/pulsedesk-mailbox-adapter.js':{PulseDeskMailboxError,pulseDeskMailboxRuntimeStatus:()=>({available,providers:['google','microsoft'],missingPackages:available?[]:['imapflow@1.3.1','mailparser@3.9.8']}),loadPulseDeskMailboxAdapter:()=>{throw new Error('NO_REAL_PROVIDER_IN_HTTP_MODEL');}},
    '../lib/pulsedesk-mailbox-service.js':{createPulseDeskMailboxService:(input:MailboxDependencies)=>{mailboxDependencies=input;authorizeService=input.authorize;return service;},publicMailboxConfiguration},
  };
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(compiled,{exports,require:(name:string)=>{if(!(name in dependencies))throw new Error('UNEXPECTED_SOURCE_DEPENDENCY '+name);return dependencies[name];},console:{log(){throw new Error('NO_PAYLOAD_LOGS');}},Date,Buffer,URL,URLSearchParams});
  assert.equal(typeof exports.registerPulseDeskLiteralRoutes,'function');
  const app=Fastify({logger:false});apps.push(app);await (exports.registerPulseDeskLiteralRoutes as(app:FastifyInstance)=>Promise<void>)(app);await app.ready();
  const inject=(method:'GET'|'POST'|'DELETE',url:string,body?:Record<string,unknown>,identity:string|null='owner')=>app.inject({method,url,headers:{...(identity?{'x-test-identity':identity}:{}),origin:'https://pulsedesk.operatoros.net'},...(body===undefined?{}:{payload:body})});
  return{app,inject,calls,handlers,authorityCalls,secrets,mailboxDependencies,executor:db,setCanonicalModule(value:string|null){canonicalModule=value;},authorize:(context:PulseDeskMailboxContext)=>authorizeService(context),setAuthority(value:typeof authority,role:string|null){authority=value;membershipRole=role;},connector:()=>connectors[0],snapshot:()=>structuredClone({inbound,tickets,events,sequence}),fault(value:boolean){fault=value;}};
}
test('actual vault adapter translates fixed module key to canonical UUID and rejects missing/malformed registry identity',async()=>{
  const f=await fixture(),port=f.mailboxDependencies.vault(f.executor as unknown as Parameters<MailboxDependencies['vault']>[0]);
  const input={tenantId:own,moduleKey:'pulsedesk' as const,purpose:`pulsedesk:mailbox:google:${connectorId}:credentials:manifest`,reference:'SYNTHETIC_SERVER_ONLY',actorUserId:actor};
  const saved=await port.store(input);assert.equal(f.secrets.get(saved.id)!.moduleId,canonicalModuleId);assert.equal(await port.resolve({...input,id:saved.id}),input.reference);
  for(const change of [{tenantId:other},{purpose:input.purpose+':other'}])assert.equal(await port.resolve({...input,...change,id:saved.id}),null);
  f.secrets.get(saved.id)!.moduleId='70000000-0000-4000-8000-000000000001';assert.equal(await port.resolve({...input,id:saved.id}),null);await port.revoke({...input,id:saved.id});assert.equal(f.secrets.get(saved.id)!.revoked,false);
  for(const missing of [null,'pulsedesk']){f.setCanonicalModule(missing);await assert.rejects(port.store(input));await assert.rejects(port.resolve({...input,id:saved.id}));await assert.rejects(port.revoke({...input,id:saved.id}));}assert.equal(f.secrets.size,1);
});
test('actual OAuth app-secret resolver enforces tenant/config module and exact purpose including global scope',async()=>{
  const f=await fixture(),executor=f.executor as unknown as Parameters<MailboxDependencies['vault']>[0],id=randomUUID();
  const purpose='provider:oauth:pulsedesk.google';
  for(const moduleId of [canonicalModuleId,null]){
    f.secrets.set(id,{tenantId:own,moduleId,purpose,reference:'SYNTHETIC_APP_ONLY',revoked:false});
    assert.equal(await f.mailboxDependencies.resolveApplicationSecret({tenantId:own,moduleId,purpose,id},executor),'SYNTHETIC_APP_ONLY');
    for(const change of [{tenantId:other},{moduleId:moduleId===null?canonicalModuleId:null},{purpose:'provider:oauth:pulsedesk.microsoft'},{moduleId:'70000000-0000-4000-8000-000000000001'},{purpose:'other'}]){
      const before=f.calls.filter(call=>call.kind==='decrypt').length;assert.equal(await f.mailboxDependencies.resolveApplicationSecret({tenantId:own,moduleId,purpose,id,...change},executor),null);assert.equal(f.calls.filter(call=>call.kind==='decrypt').length,before);
    }
  }
});
test('actual HTTP capability response uses runtime readiness and strips private configuration',async()=>{
  const f=await fixture();const response=await f.inject('GET','/v1/modules/pulsedesk/connectors');assert.equal(response.statusCode,200);
  assert.equal(response.json().capabilities.liveMailboxAdapters,true);assert.equal(response.json().capabilities.canManageMailboxes,true);
  assert.doesNotMatch(response.body,/PRIVATE_PUBLIC_CONFIG_CANARY|PRIVATE_PENDING_CANARY/);
  const blocked=await fixture({available:false});const unavailable=await blocked.inject('GET','/v1/modules/pulsedesk/connectors');assert.equal(unavailable.json().capabilities.liveMailboxAdapters,false);
});
test('actual live setup retains authentication/manager authority and both providers with no browser secret fields',async()=>{
  const f=await fixture();const input={label:'Facilities inbox',mailboxAddress:'operations@example.invalid',mode:'live',publicConfig:{operationsOnly:true}};
  assert.equal((await f.inject('POST','/v1/modules/pulsedesk/connectors',{...input,provider:'google'},null)).statusCode,401);
  assert.equal((await f.inject('POST','/v1/modules/pulsedesk/connectors',{...input,provider:'google'},'member')).statusCode,403);
  for(const provider of ['google','microsoft']){const response=await f.inject('POST','/v1/modules/pulsedesk/connectors',{...input,provider});assert.equal(response.statusCode,201,response.body);}
  assert.ok(f.calls.filter(call=>call.kind==='configure').every(call=>(call.context as {tenantId:string}).tenantId===own));
  assert.equal((await f.inject('POST','/v1/modules/pulsedesk/connectors',{...input,provider:'google',secretReference:'PRIVATE_MUST_NOT_BE_ACCEPTED'})).statusCode,400);
  assert.equal((await f.inject('POST','/v1/modules/pulsedesk/connectors',{...input,provider:'google',publicConfig:{operationsOnly:false}})).statusCode,400);
  assert.equal((await f.inject('POST','/v1/modules/pulsedesk/connectors',{...input,provider:'sendgrid'})).statusCode,503);
});
test('actual OAuth/poll/delete routes deny foreign connector before service calls',async()=>{
  const f=await fixture();for(const suffix of ['oauth/start','oauth/callback','poll']){const response=await f.inject('POST',`/v1/modules/pulsedesk/connectors/${connectorId}/${suffix}`,{},'foreign');assert.equal(response.statusCode,404,response.body);}
  assert.equal((await f.inject('DELETE',`/v1/modules/pulsedesk/connectors/${connectorId}`,undefined,'foreign')).statusCode,404);
  assert.equal(f.calls.length,0);
});
test('actual live poll queues trusted tenant work; public deterministic header cannot authenticate live mailbox',async()=>{
  const f=await fixture();const queued=await f.inject('POST',`/v1/modules/pulsedesk/connectors/${connectorId}/poll`,{});assert.equal(queued.statusCode,202);
  assert.equal((f.calls.find(call=>call.kind==='queue')!.input as {tenantId:string}).tenantId,own);
  assert.equal((f.calls.find(call=>call.kind==='queue')!.input as {moduleId:string}).moduleId,canonicalModuleId);
  const inbound=await f.app.inject({method:'POST',url:'/v1/public/pulsedesk/inbound/google/synthetic-inbound-alias',headers:{'x-pulsedesk-test-adapter':'deterministic'},payload:{messageId:'synthetic',subject:'Operational support request'}});
  assert.equal(inbound.statusCode,401);assert.equal(f.snapshot().tickets.length,0);
});
test('actual ingestion activity failure rolls back dedup claim, ticket and sequence; identical retry succeeds',async()=>{
  const f=await fixture({mode:'test'});const url=`/v1/modules/pulsedesk/connectors/${connectorId}/test-ingest`;const input={messageId:'same-message-id',from:'requester@example.invalid',subject:'Operational equipment support request',attachmentCount:0};
  f.fault(true);assert.equal((await f.inject('POST',url,input)).statusCode,400);assert.deepEqual(f.snapshot(),{inbound:[],tickets:[],events:[],sequence:0});
  f.fault(false);assert.equal((await f.inject('POST',url,input)).statusCode,201);const duplicate=await f.inject('POST',url,input);assert.equal(duplicate.statusCode,200);assert.equal(duplicate.json().duplicate,true);
  assert.equal(f.snapshot().tickets.length,1);assert.equal(f.snapshot().sequence,1);
});
test('actual ingestion rejects attachments and sensitive subject without creating a ticket',async()=>{
  const f=await fixture({mode:'test'});const url=`/v1/modules/pulsedesk/connectors/${connectorId}/test-ingest`;
  assert.equal((await f.inject('POST',url,{messageId:'attachment-only',from:'requester@example.invalid',subject:'Operational equipment support request',attachmentCount:1,attachmentsClean:false})).statusCode,422);
  assert.equal((await f.inject('POST',url,{messageId:'private-only',subject:'Patient diagnosis medical record'})).statusCode,422);
  assert.equal(f.snapshot().tickets.length,0);assert.equal(f.snapshot().inbound.length,1);
});

test('actual worker authorization reuses current central decision and membership including canonical aliases',async()=>{
  const f=await fixture();const context={tenantId:own,actorUserId:actor};
  await f.authorize(context);assert.deepEqual(f.authorityCalls[0],[actor,own,'pulsedesk']);
  for(const role of ['tenant_admin','billing_admin']){f.setAuthority({hasAccess:true,accessLevel:'user',viaPlatformRole:false},role);await f.authorize(context);}
  f.setAuthority({hasAccess:true,accessLevel:'manager',viaPlatformRole:false},'user');await f.authorize(context);
  f.setAuthority({hasAccess:true,accessLevel:'manager',viaPlatformRole:true},null);await f.authorize(context);
  for(const [decision,role]of [
    [{hasAccess:false,accessLevel:'none',viaPlatformRole:false},'owner'],
    [{hasAccess:true,accessLevel:'viewer',viaPlatformRole:false},'owner'],
    [{hasAccess:true,accessLevel:'manager',viaPlatformRole:false},null],
    [{hasAccess:true,accessLevel:'manager',viaPlatformRole:false},'viewer'],
    [{hasAccess:true,accessLevel:'user',viaPlatformRole:false},'member'],
  ] as const){f.setAuthority(decision,role);await assert.rejects(f.authorize(context),error=>(error as {code:string}).code==='PULSEDESK_MAILBOX_AUTHORITY_REQUIRED');}
});

test('actual live worker never substitutes connector creator for a missing queued requestor',async()=>{
  const f=await fixture();const handler=f.handlers.get('pulsedesk.connector.poll.v1')!;
  for(const value of [{tenantId:own,moduleId:canonicalModuleId,requestedByUserId:null},{tenantId:own,moduleId:'pulsedesk',requestedByUserId:actor},{tenantId:own,moduleId:'70000000-0000-4000-8000-000000000001',requestedByUserId:actor}])await assert.rejects(handler({...value,payload:{connectorId}}));
  assert.equal(f.calls.filter(call=>call.kind==='poll').length,0);
  await handler({tenantId:own,moduleId:canonicalModuleId,requestedByUserId:actor,payload:{connectorId}});
  assert.deepEqual(structuredClone(f.calls.find(call=>call.kind==='poll')!.context),{tenantId:own,actorUserId:actor});
});

test('queue module identity fails closed before enqueue and test mode retains canonical UUID allocation',async()=>{
  for(const invalid of [null,'pulsedesk']){const f=await fixture();f.setCanonicalModule(invalid);const response=await f.inject('POST',`/v1/modules/pulsedesk/connectors/${connectorId}/poll`,{});assert.equal(response.statusCode,500);assert.equal(f.calls.filter(call=>call.kind==='queue').length,0);}
  const f=await fixture({mode:'test'});assert.equal((await f.inject('POST',`/v1/modules/pulsedesk/connectors/${connectorId}/poll`,{})).statusCode,202);assert.equal((f.calls.find(call=>call.kind==='queue')!.input as {moduleId:string}).moduleId,canonicalModuleId);
});

test('actual capability narrows owner/manager controls for tenant and module viewer access',async()=>{
  const f=await fixture();for(const identity of ['tenant-viewer','module-viewer']){
    const response=await f.inject('GET','/v1/modules/pulsedesk/connectors',undefined,identity);assert.equal(response.statusCode,200);assert.equal(response.json().capabilities.canManageMailboxes,false);
    assert.equal((await f.inject('POST',`/v1/modules/pulsedesk/connectors/${connectorId}/poll`,{},identity)).statusCode,403);
  }
  const manager=await f.inject('GET','/v1/modules/pulsedesk/connectors',undefined,'module-manager');assert.equal(manager.json().capabilities.canManageMailboxes,true);
  assert.equal((await f.inject('POST',`/v1/modules/pulsedesk/connectors/${connectorId}/poll`,{},'module-manager')).statusCode,202);
});
