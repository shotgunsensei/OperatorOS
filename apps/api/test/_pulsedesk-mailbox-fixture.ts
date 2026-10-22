import { randomUUID } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createPulseDeskMailboxService } from '../src/lib/pulsedesk-mailbox-service.js';
import { PulseDeskMailboxError,type PulseDeskMailboxProvider,type createPulseDeskMailboxAdapter } from '../src/lib/pulsedesk-mailbox-adapter.js';
import type { PulseDeskMailboxVaultPort } from '../src/lib/pulsedesk-mailbox-vault.js';

export const owner={tenantId:'10000000-0000-4000-8000-000000000001',actorUserId:'30000000-0000-4000-8000-000000000001'};
export const foreign={tenantId:'10000000-0000-4000-8000-000000000002',actorUserId:'30000000-0000-4000-8000-000000000002'};
export const connectorId='20000000-0000-4000-8000-000000000001';
export const appId='40000000-0000-4000-8000-000000000001';
export const mailboxModuleId='60000000-0000-4000-8000-000000000001';
export const time=1_800_000_000_000;
export const tokens={accessToken:'SYNTHETIC_ACCESS',refreshToken:'SYNTHETIC_REFRESH',expiresAt:time+3_600_000};
type ServiceDependencies=Parameters<typeof createPulseDeskMailboxService>[0];
type Adapter=ReturnType<typeof createPulseDeskMailboxAdapter>;
interface Row extends Record<string,unknown>{id:string;tenant_id:string;provider:PulseDeskMailboxProvider;mailbox_address:string;status:string;mode:string;public_config:Record<string,unknown>;secret_reference_id:string|null;version:number;revoked_at:string|null;oauth_state_hash:string|null;oauth_state_expires_at:Date|null;created_by_user_id:string}
export function fixture(provider:PulseDeskMailboxProvider='google') {
  let row:Row={id:connectorId,tenant_id:owner.tenantId,provider,mailbox_address:'operations@example.invalid',status:'pending',mode:'live',public_config:{operationsOnly:true,sharedProviderConfigId:appId},secret_reference_id:null,version:1,revoked_at:null,oauth_state_hash:null,oauth_state_expires_at:null,created_by_user_id:owner.actorUserId};
  let secretRecords=new Map<string,{tenantId:string;moduleKey:string;purpose:string;reference:string;revoked:boolean}>();
  const events:Array<unknown>=[];const ingestions:Array<unknown>=[];const queries:Array<{sql:string;params:unknown[]}>=[];const calls:string[]=[];
  let ready=true;let authorized=true;let appTenant=owner.tenantId;let appVersion=1;let appClientId='SYNTHETIC_APP';let callbackReady=true;let currentTime=time;
  let canonicalModule: string | null=mailboxModuleId;let appModule: string | null=mailboxModuleId;let secretModule: string | null=mailboxModuleId;
  const dialect=new PgDialect();
  function parameter(query:{sql:string;params:unknown[]},name:string){const match=new RegExp('\\b'+name+'\\s*=\\s*\\$(\\d+)','i').exec(query.sql);return match?query.params[Number(match[1])-1]:undefined;}
  const vault:PulseDeskMailboxVaultPort={
    async store(input){const id=randomUUID();secretRecords.set(id,{...input,reference:input.reference.trim(),revoked:false});return{id};},
    async resolve(input){const stored=secretRecords.get(input.id);return stored&&!stored.revoked&&stored.tenantId===input.tenantId&&stored.moduleKey===input.moduleKey&&stored.purpose===input.purpose?stored.reference:null;},
    async revoke(input){const stored=secretRecords.get(input.id);if(stored&&stored.tenantId===input.tenantId&&stored.moduleKey===input.moduleKey&&stored.purpose===input.purpose)stored.revoked=true;},
  };
  const execute=async(statement:SQL)=>{
    const query=dialect.sqlToQuery(statement);queries.push(query);const text=query.sql.replace(/\s+/g,' ').trim();
    if(text.startsWith('SELECT config.id')){
      if(parameter(query,'tenant_id')!==appTenant||!query.params.includes(`pulsedesk.${provider}`)||!callbackReady)return{rows:[]};
      if(!canonicalModule || (appModule!==null&&appModule!==canonicalModule) || secretModule!==appModule)return{rows:[]};
      const expected=query.params.at(-1);if(expected!==null&&expected!==appId)return{rows:[]};
      return{rows:[{id:appId,version:appVersion,secret_reference_id:'50000000-0000-4000-8000-000000000001',module_id:appModule,mailbox_module_id:canonicalModule}]};
    }
    if(text.startsWith('SELECT * FROM pulsedesk_mail_connectors')){
      if(parameter(query,'tenant_id')!==row.tenant_id||parameter(query,'id')!==row.id||row.revoked_at||row.mode!=='live')return{rows:[]};
      return{rows:[structuredClone(row)]};
    }
    if(text.startsWith('UPDATE pulsedesk_mail_connectors')){
      if(parameter(query,'tenant_id')!==row.tenant_id||parameter(query,'id')!==row.id||row.revoked_at)return{rows:[]};
      const setting=text.split(' SET ')[1].split(' WHERE ')[0];
      for(const key of ['public_config','secret_reference_id','oauth_state_hash','oauth_state_expires_at','last_error_code']){
        const index=new RegExp('\\b'+key+'\\s*=\\s*\\$(\\d+)').exec(setting);
        if(index)row[key]=structuredClone(query.params[Number(index[1])-1]);
        else if(new RegExp('\\b'+key+'=NULL').test(setting))row[key]=null;
      }
      const status=/\bstatus='([^']+)'/.exec(setting);if(status)row.status=status[1];
      if(setting.includes('revoked_at=NOW()'))row.revoked_at=new Date(currentTime).toISOString();
      if(setting.includes('version=version+1'))row.version++;
      return{rows:[]};
    }
    if(text.startsWith('INSERT INTO pulsedesk_connector_events')){events.push(structuredClone(query.params));return{rows:[]};}
    throw new Error('UNEXPECTED_SYNTHETIC_SQL '+text);
  };
  let queue=Promise.resolve();
  const database={execute,async transaction<T>(work:(executor:{execute:typeof execute})=>Promise<T>){
    const previous=queue;let release!:()=>void;queue=new Promise<void>(resolve=>{release=resolve;});await previous;
    const saved={row:structuredClone(row),secrets:structuredClone(secretRecords),events:events.length,ingestions:ingestions.length};
    try{return await work({execute});}catch(error){row=saved.row;secretRecords=saved.secrets;events.length=saved.events;ingestions.length=saved.ingestions;throw error;}finally{release();}
  }};
  const adapter:Adapter={
    async exchange(){calls.push('exchange');return{...tokens};},async refresh(){calls.push('refresh');return{...tokens};},async verify(){calls.push('verify');return{verified:true};},
    async read(){calls.push('read');return{messages:[{uid:1,messageId:'synthetic-message',from:'requester@example.invalid',subject:'Operational equipment support request',attachmentCount:0,attachmentsClean:true}],cursor:{uidValidity:'7',lastUid:1}};},
    async acknowledge(){calls.push('ack');},
  };
  let ingest:ServiceDependencies['ingest']=async input=>{ingestions.push(structuredClone(input));return{statusCode:201,payload:{ticket:{id:'synthetic-ticket'}}};};
  const service=createPulseDeskMailboxService({database:database as unknown as ServiceDependencies['database'],vault:()=>vault,ready:()=>ready,adapter:()=>adapter,now:()=>currentTime,
    async authorize(){if(!authorized)throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_AUTHORITY_REQUIRED');},
    async resolveApplicationSecret(input){calls.push('application-secret');if(input.tenantId!==appTenant||input.moduleId!==appModule||input.purpose!==`provider:oauth:pulsedesk.${provider}`)return null;return JSON.stringify({clientId:appClientId,clientSecret:'SYNTHETIC_APP_SECRET'});},
    ingest:(...args)=>ingest(...args),
  });
  return{service,adapter,vault,queries,calls,events,ingestions,row:()=>row,secrets:()=>secretRecords,setModuleScope(canonical:string|null,application:string|null,secret:string|null){canonicalModule=canonical;appModule=application;secretModule=secret;},setReady(value:boolean){ready=value;},setAuthorized(value:boolean){authorized=value;},setAppTenant(value:string){appTenant=value;},setAppVersion(value:number){appVersion=value;},setAppClientId(value:string){appClientId=value;},setCallbackReady(value:boolean){callbackReady=value;},setTime(value:number){currentTime=value;},setIngest(value:ServiceDependencies['ingest']){ingest=value;}};
}
export async function authorize(f:ReturnType<typeof fixture>){const started=await f.service.start(owner,connectorId,'https://pulsedesk.operatoros.net');const state=new URL(started.authorizationUrl).searchParams.get('state')!;await f.service.complete(owner,connectorId,{state,code:'SYNTHETIC_CODE'});return state;}
