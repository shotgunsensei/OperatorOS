import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../src/schema.js';
import * as sso from '../../../packages/sso/index.js';
import * as browserContract from '../../../packages/sso/browser-contract.js';
import * as sessionScope from '../src/lib/sso-session-scope.js';

const installed=createRequire(import.meta.url);
const secret='SYNTHETIC_SSO_KEY_FOR_OFFLINE_TESTS_ONLY';
const fingerprint=createHash('sha256').update('SYNTHETIC_ISSUING_SESSION_ONLY').digest('hex');

/** Actual registered SSO handlers and code crypto; no authentication bootstrap,
 * .env, listening server, real account/provider or database connection. */
async function fixture() {
  const currentUser={id:'fixture-user',email:'owner@example.invalid',role:'user',platformRole:'user',status:'active',currentTenantId:'fixture-tenant',tokenVersion:7};
  const module={id:'fixture-app',slug:'fixture-app',name:'Synthetic module',status:'active',enabled:true,requiresTenant:true,requiresSubscription:true,clientId:'operatoros:fixture-app',callbackPath:'/sso',exactRedirectUris:['https://fixture-app.example.invalid/sso'],entitlementKey:'fixture-app'};
  const state='SYNTHETIC_STATE_'.padEnd(43,'a'), nonce='SYNTHETIC_NONCE_'.padEnd(43,'b'), verifier='SYNTHETIC_VERIFIER_'.padEnd(64,'c');
  const revoked=new Set<string>();const handoffs=new Map<string,any>();const minted:any[]=[];
  let entitled=true,member=true,tenantStatus='active';
  let beforeConsume: (()=>void) | undefined;
  let consumeQuery: ReturnType<PgDialect['sqlToQuery']> | undefined;
  const dialect=new PgDialect();
  const db = {
    select(_projection?: unknown) {
      return { from(table: unknown) {
        return { where(_where: unknown) {
          return { async limit() {
            if (table === schema.users) return [{...currentUser}];
            if (table === schema.tenants) return [{id:'fixture-tenant',status:tenantStatus,name:'Synthetic tenant'}];
            if (table === schema.tenantUsers) return member ? [{tenantId:'fixture-tenant',userId:currentUser.id,role:'owner'}] : [];
            if (table === schema.ssoHandoffTokens) return [...handoffs.values()].map(row=>({...row}));
            if (table === schema.revokedSessionTokens) return revoked.has(fingerprint) ? [{tokenHash:fingerprint}] : [];
            throw new Error('Unexpected isolated SSO lookup');
          } };
        } };
      } };
    },
    insert(table: unknown) {
      return { async values(row: any) {
        assert.equal(table,schema.ssoHandoffTokens);
        handoffs.set(row.jti,{...row,consumedAt:null});
      } };
    },
    update(table: unknown) {
      return { set(update: any) {
        return { where(where: any) {
          return { async returning() {
            assert.equal(table,schema.ssoHandoffTokens);
            const row=[...handoffs.values()][0]; if(!row || row.consumedAt)return[];
            beforeConsume?.();
            consumeQuery=dialect.sqlToQuery(where);
            const sql=consumeQuery.sql;
            if(sql.includes('revoked_session_tokens') && revoked.has(fingerprint))return[];
            const binding=sso.parseSsoExchangeCode(lastCode,secret) as any;
            if(sql.includes('token_version') && binding?.tokenVersion !== currentUser.tokenVersion)return[];
            if(sql.includes('expires_at') && row.expiresAt.getTime()<=Date.now())return[];
            Object.assign(row,update);return[{...row}];
          } };
        } };
      } };
    },
  };
  const handlers=new Map<string,(request:any,reply:any)=>Promise<any>>();
  const app:any={addHook(){},async register(run:(app:any)=>Promise<void>){await run(app);},post(path:string,...args:any[]){handlers.set(path,args.at(-1));}};
  const dependencies:Record<string,unknown>={
    '../db.js':{db},'../schema.js':schema,
    '../lib/auth.js':{authenticate(){},sanitizeUser:(user:any)=>({id:user.id}),signToken:(payload:any)=>{minted.push(payload);return'SYNTHETIC_SESSION_ONLY';}},
    '../lib/audit.js':{writeAudit:async()=>undefined},'../lib/rbac.js':{hasPlatformAdminAuthority:()=>false},
    '../lib/role-aliases.js':{tenantRoleToEffective:(role:string)=>role},
    '../lib/tenant-entitlements.js':{resolveTenantModuleAccess:async()=>({hasAccess:entitled,reason:entitled?undefined:'explicit_deny',accessLevel:'user'})},
    '../lib/sso-exchange-rollout.js':{moduleSupportsExchangeCode:()=>true},'../lib/sso-session-scope.js':sessionScope,
    '../../../../packages/auth/index.js':{SESSION_COOKIE_NAME:'operatoros_session',getSessionCookieOptions:()=>({httpOnly:true,sameSite:'lax',path:'/'}),getSessionClearCookieOptions:()=>({path:'/'})},
    '../../../../packages/modules/registry.js':{getModuleById:(id:string)=>id===module.id?module:null,getModuleByHost:(host:string)=>host==='fixture-app.example.invalid'?module:null,normalizeHost:(host:string)=>host.trim().toLowerCase().split(':')[0]},
    '../../../../packages/sso/index.js':{...sso,resolveSsoCodeSecret:()=>secret,resolveSsoSecret:()=>secret,resolveSsoIssuer:()=>'https://auth.example.invalid'},
    '../../../../packages/sso/browser-contract.js':browserContract,
  };
  const source=readFileSync(new URL('../src/routes/sso-routes.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const loaded={exports:{} as Record<string,any>};
  runInNewContext(code,{module:loaded,exports:loaded.exports,require:(name:string)=>{
    if(name in dependencies)return dependencies[name];
    if(name.startsWith('.'))throw new Error(`Unprovided SSO boundary: ${name}`);
    return installed(name);
  },process:{env:{APP_ENV:'test',NODE_ENV:'test'}},Buffer,Date,URL,Map,WeakMap,Set},{filename:'actual-sso-routes.js'});
  await loaded.exports.registerSsoRoutes(app);
  const request=(body:unknown,host='fixture-app.example.invalid')=>({body,headers:{host,'user-agent':'synthetic-only'},cookies:{[browserContract.SSO_STATE_COOKIE_NAME]:state,[browserContract.SSO_NONCE_COOKIE_NAME]:nonce,[browserContract.SSO_VERIFIER_COOKIE_NAME]:verifier},ip:'192.0.2.20',id:'synthetic-request',log:{info(){},error(){}}});
  const reply=()=>({statusCode:200,cookies:[] as any[],header(){return this;},code(value:number){this.statusCode=value;return this;},send(value:unknown){return value;},setCookie(...args:any[]){this.cookies.push(args);return this;},clearCookie(){return this;}});
  let lastCode='';
  return {currentUser,minted,revoked,handoffs,state,verifier,get consumeQuery(){return consumeQuery;},beforeConsume(callback:()=>void){beforeConsume=callback;},setEntitled(value:boolean){entitled=value;},setMember(value:boolean){member=value;},setTenantStatus(value:string){tenantStatus=value;},
    async issue(){const response=reply();const req={...request({moduleId:module.id,tenantId:'fixture-tenant',clientId:module.clientId,redirectUri:module.exactRedirectUris[0],returnTo:'/dashboard',state,nonce,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256'},'auth.example.invalid'),user:{...currentUser},authTokenFingerprint:fingerprint,authSession:{sessionType:'platform',tokenVersion:currentUser.tokenVersion}};const body=await handlers.get('/v1/sso/issue')!(req,response);assert.equal(response.statusCode,200);lastCode=body.code;return body.code as string;},
    async exchange(code=lastCode,changes:Record<string,unknown>={}){const response=reply();const req={...request({code,state}),...changes};const body=await handlers.get('/v1/sso/browser-exchange')!(req,response);return{status:response.statusCode,body,cookies:response.cookies};},
    unbound(code:string){const binding:any={...sso.parseSsoExchangeCode(code,secret)};delete binding.tokenVersion;delete binding.sessionFingerprint;return sso.createSsoExchangeCode(binding,secret);},
  };
}

test('a pending handoff cannot mint current authority after global session-version revocation',async()=>{
  const f=await fixture();await f.issue();f.currentUser.tokenVersion++;
  const result=await f.exchange();assert.equal(result.status,401);assert.equal(f.minted.length,0);assert.equal(result.cookies.length,0);
});

test('local issuing-session logout invalidates its pending handoff without changing user version',async()=>{
  const f=await fixture();await f.issue();f.revoked.add(fingerprint);
  const result=await f.exchange();assert.equal(result.status,401);assert.equal(f.minted.length,0);
});

test('unbound pre-release codes fail closed instead of adopting current authority',async()=>{
  const f=await fixture();const code=await f.issue();
  assert.equal((await f.exchange(f.unbound(code))).status,401);assert.equal(f.minted.length,0);
});

test('current short-lived bound transaction still establishes only the target module session once',async()=>{
  const f=await fixture();const code=await f.issue();
  const binding=sso.parseSsoExchangeCode(code,secret)!;
  assert.equal(binding.tokenVersion,7);assert.equal(binding.sessionFingerprint,fingerprint);
  assert.equal((await f.exchange()).status,200);
  assert.equal(f.minted.length,1);assert.equal(f.minted[0].sessionType,'module');assert.equal(f.minted[0].moduleId,'fixture-app');assert.equal(f.minted[0].tenantId,'fixture-tenant');assert.equal(f.minted[0].tokenVersion,7);
  assert.match(f.consumeQuery!.sql,/EXISTS.*SELECT 1 FROM "users"/s);
  assert.match(f.consumeQuery!.sql,/NOT EXISTS.*"revoked_session_tokens"/s);
  assert.match(f.consumeQuery!.sql,/"expires_at" > NOW\(\)/);
  assert.ok(f.consumeQuery!.params.includes(fingerprint));assert.ok(f.consumeQuery!.params.includes(7));
  assert.equal((await f.exchange()).status,409);assert.equal(f.minted.length,1);
});

test('revocation or expiry during authority reads cannot cross the atomic one-use consume',async()=>{
  for(const reason of ['version','local','expiry']){
    const f=await fixture();await f.issue();
    f.beforeConsume(()=>{
      if(reason==='version')f.currentUser.tokenVersion++;
      if(reason==='local')f.revoked.add(fingerprint);
      if(reason==='expiry')[...f.handoffs.values()][0].expiresAt=new Date(0);
    });
    assert.equal((await f.exchange()).status,409,reason);assert.equal(f.minted.length,0,reason);
    assert.equal([...f.handoffs.values()][0].consumedAt,null,reason);
  }
});

test('sealed issuing authority rejects malformed versions and fingerprints; version zero is valid',()=>{
  const binding={jti:'fixture-jti',aud:'fixture-app',tokenVersion:0,sessionFingerprint:fingerprint};
  assert.deepEqual(sso.parseSsoExchangeCode(sso.createSsoExchangeCode(binding,secret),secret),binding);
  for(const tokenVersion of [-1,1.5,Number.MAX_SAFE_INTEGER+1,'7',null]){
    const code=sso.createSsoExchangeCode({...binding,tokenVersion} as any,secret);
    assert.equal(sso.parseSsoExchangeCode(code,secret),null);
  }
  for(const sessionFingerprint of ['',fingerprint.toUpperCase(),'SYNTHETIC_RAW_SESSION',null]){
    const code=sso.createSsoExchangeCode({...binding,sessionFingerprint} as any,secret);
    assert.equal(sso.parseSsoExchangeCode(code,secret),null);
  }
});

test('exact host, PKCE, expiry and current tenant/module authority remain required',async()=>{
  for(const denied of ['host','pkce','expiry','membership','entitlement','tenant']){
    const f=await fixture();await f.issue();let changes:Record<string,unknown>={};
    if(denied==='host')changes={headers:{host:'other.example.invalid'}};
    if(denied==='pkce')changes={cookies:{}};
    if(denied==='expiry')[...f.handoffs.values()][0].expiresAt=new Date(0);
    if(denied==='membership')f.setMember(false);
    if(denied==='entitlement')f.setEntitled(false);
    if(denied==='tenant')f.setTenantStatus('suspended');
    assert.ok((await f.exchange(undefined,changes)).status>=400,denied);assert.equal(f.minted.length,0,denied);
  }
});
