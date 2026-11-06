import { expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

export const IDS={tenant:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',otherTenant:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',user:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',customer:'11111111-1111-4111-8111-111111111111',otherCustomer:'22222222-2222-4222-8222-222222222222',contact:'33333333-3333-4333-8333-333333333333',site:'44444444-4444-4444-8444-444444444444',job:'55555555-5555-4555-8555-555555555555',otherJob:'66666666-6666-4666-8666-666666666666',run:'77777777-7777-4777-8777-777777777777',fieldJob:'88888888-8888-4888-8888-888888888888',report:'99999999-9999-4999-8999-999999999999'};
const web=resolve(import.meta.dirname,'..'),installed=createRequire(resolve(web,'package.json'));
let bundle='',css='';
export async function buildCustomerWorkspaceFixture(){
 const result=await build({stdin:{resolveDir:web,loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import '@fontsource-variable/inter';import '@fontsource-variable/open-sans';import Console from './src/app/app/page';createRoot(document.getElementById('root')).render(<Console/>);`},bundle:true,write:false,outdir:'customer-workspace-fixture',platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},alias:{'@':resolve(web,'src'),react:dirname(installed.resolve('react')),'react-dom':dirname(installed.resolve('react-dom'))},loader:{'.woff2':'dataurl','.woff':'dataurl'},plugins:[{name:'explicit-synthetic-console-boundaries',setup(plugin){
  plugin.onResolve({filter:/(?:^|[\\/])(AuthProvider|TenantProvider|Toast|TenantMessenger)(?:\.tsx)?$/},args=>({path:args.path.split(/[\\/]/).pop()!.replace(/\.tsx$/,''),namespace:'fixture'}));
  plugin.onResolve({filter:/^@\/components\/pages\//},args=>['MyAppsPage','CustomerWorkspacePage'].includes(args.path.split('/').pop()!)?undefined:{path:args.path,namespace:'unexercised'});
  plugin.onLoad({filter:/.*/,namespace:'unexercised'},()=>({contents:`export default function ExistingPage(){return <p>This fixture does not exercise this existing route.</p>}`,loader:'tsx'}));
  plugin.onResolve({filter:/^(next\/link|next\/image|next\/navigation|@\/lib\/launch)$/},args=>({path:args.path,namespace:'fixture'}));
  plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'tsx',contents:{
   AuthProvider:`import{useSyncExternalStore}from'react';export const useAuth=()=>{useSyncExternalStore(window.fixture.subscribe,window.fixture.snapshot);return{user:window.fixture.user,loading:false,authError:null,captureIdentity:window.fixture.captureIdentity,logout:async()=>{},clearAuthError:()=>{}}};export default function Provider({children}){return children}`,
   TenantProvider:`import{useSyncExternalStore}from'react';export const useTenant=()=>{useSyncExternalStore(window.fixture.subscribe,window.fixture.snapshot);return{activeTenant:window.fixture.tenant,activeRole:window.fixture.role,tenants:[window.fixture.tenant],allTenants:[],loading:false,switchTenant:async()=>{throw Error('Tenant switches are not exercised')},refresh:async()=>{}}};export default function Provider({children}){return children}`,
   Toast:`const toast=()=>{};export const useToast=()=>({toast});export function ToastProvider({children}){return children}`,
   TenantMessenger:`export default function Messenger(){return <button type="button" aria-label="Team messages">Messages</button>}`,
   'next/link':`export default function Link({children,href,...props}){return <a {...props} href={href}>{children}</a>}`,
   'next/image':`export default function Image({src,fill,priority,unoptimized,...props}){return <img {...props} src={typeof src==='string'?src:src.src}/ >}`,
   'next/navigation':`export const usePathname=()=>window.location.pathname;export const useSearchParams=()=>new URLSearchParams(window.location.search);export const useRouter=()=>({push:path=>window.history.pushState(null,'',path),replace:path=>window.history.replaceState(null,'',path)});`,
   '@/lib/launch':`export const isNativeLaunchRuntime=()=>false;export const navigateToModuleProgrammatically=async()=>{};`,
  }[args.path]!}));
 }}]});
 bundle=result.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
 css=readFileSync(resolve(web,'src/app/globals.css'),'utf8')+'\n'+(result.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'');
}

export interface Scenario {
 role?:string; start?:string; search?:string; listDenied?:number; empty?:boolean; noJobs?:boolean; readOnly?:boolean; actionAllowed?:boolean; detailDenied?:number; invalidContext?:boolean; corruptJob?:boolean; absentContact?:boolean; mismatchEcho?:boolean;
 postCode?:string; postStatus?:number; postFailOnce?:boolean; holdPost?:boolean; holdDetail?:boolean; holdRun?:boolean; runStatus?:string; delivery?:string; runError?:string; unsafeLinks?:boolean;
 name?:string; revision?:string; requests:Array<{method:string;path:string;search:string;tenant:string|undefined;body:any}>;
 pendingPosts:Array<()=>void>; pendingDetails:Array<()=>void>; pendingRuns:Array<()=>void>;
}
export async function mountCustomerWorkspace(page:Page,options:Partial<Scenario>={}){
 const state:Scenario={role:'owner',name:'Synthetic Northstar Client',revision:'a'.repeat(64),runStatus:'completed',delivery:'completed',requests:[],pendingPosts:[],pendingDetails:[],pendingRuns:[],...options};
 const context={organizationId:IDS.customer,siteId:IDS.site,contactId:IDS.contact,revision:state.revision};
 await page.goto('about:blank');
 await page.unroute('**/*');
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.hostname!=='localhost')return route.abort();
  if(url.pathname.startsWith('/api/')){
   const body=request.postDataJSON();const tenant=request.headers()['x-tenant-id'];state.requests.push({method:request.method(),path:url.pathname,search:url.search,tenant,body});
   const response=(data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>undefined);
   if(url.pathname==='/api/modules')return response({modules:[]});
   if(url.pathname==='/api/trials/core-suite')return response({trial:{offerCode:'synthetic-fixture',policyVersion:1,durationDays:7,durationHours:168,modules:['tradeflowkit','techdeck','pulsedesk'],featureEnabled:false,emailVerified:true,personalTenantId:null,state:'unavailable',startedAt:null,endsAt:null,remainingSeconds:0}});
   if(url.pathname==='/api/customer-workspace/customers'){
    if(state.listDenied)return response({error:'Synthetic access denied',code:'TENANT_MODULE_ACCESS_DENIED'},state.listDenied);
    const name=tenant===IDS.otherTenant?'Synthetic South Client':state.name!;
    return response({customers:state.empty?[]:[{id:tenant===IDS.otherTenant?IDS.otherCustomer:IDS.customer,name,type:'client',website:null,version:3},...(tenant===IDS.otherTenant?[]:[{id:IDS.otherCustomer,name:'Synthetic Other Client',type:'client',website:null,version:1}])],pagination:{limit:30,offset:Number(url.searchParams.get('offset')??0),hasMore:false},sourceModule:'tradeflowkit'});
   }
   if(url.pathname.startsWith('/api/customer-workspace/customers/')){
    if(state.detailDenied)return response({error:'Synthetic context unavailable',code:'CUSTOMER_CONTEXT_NOT_FOUND'},state.detailDenied);
    const organizationId=url.pathname.split('/').at(-1)!;
    if(![IDS.customer,IDS.otherCustomer].includes(organizationId))return response({error:'Synthetic context unavailable',code:'CUSTOMER_CONTEXT_NOT_FOUND'},404);
    const selection={organizationId,siteId:url.searchParams.get('siteId'),contactId:url.searchParams.get('contactId')};
    const result={customer:{id:organizationId,name:tenant===IDS.otherTenant?'Synthetic South Client':organizationId===IDS.customer?state.name:'Synthetic Other Client',type:'client',website:null,version:3},contacts:state.absentContact?[]:[{id:IDS.contact,firstName:'Synthetic',lastName:'Coordinator',email:'coordinator@example.invalid',phone:null,title:'Operations',version:2,isPrimary:true}],sites:[{id:IDS.site,name:'Synthetic North Workshop',type:'office',timezone:'America/New_York',address:'Synthetic site address',version:4}],selection:state.mismatchEcho?{...selection,organizationId:IDS.otherCustomer}:selection,jobs:state.noJobs?[]:[{id:IDS.job,number:12,title:'Synthetic installation visit',status:'scheduled',version:7,customerId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',directoryContext:state.corruptJob?null:{...context,organizationId,revision:state.revision},handoffBlocker:state.corruptJob?'CUSTOMER_CONTEXT_UNAVAILABLE':null}],pagination:{hasMoreJobs:false,jobsLimit:100},capabilities:{sourceModule:'tradeflowkit',destinationModule:'snapproofos',canRequestFieldProof:state.actionAllowed!==false&&!state.readOnly,readOnly:Boolean(state.readOnly),handoffBlocker:state.actionAllowed===false?'destination_unavailable':null}};
    if(state.holdDetail)await new Promise<void>(resolve=>state.pendingDetails.push(resolve));
    return response(result);
   }
   if(url.pathname==='/api/customer-workspace/field-proof'){
    if(state.holdPost)await new Promise<void>(resolve=>state.pendingPosts.push(resolve));
    if(state.postFailOnce){state.postFailOnce=false;return route.abort('failed');}
    if(state.postCode)return response({error:'Synthetic handoff conflict',code:state.postCode},state.postStatus??409);
    return response({duplicate:false,requeued:false,run:{id:IDS.run,status:'queued'}},202);
   }
   if(url.pathname===`/api/tenants/${IDS.tenant}/data-fabric/runs/${IDS.run}`||url.pathname===`/api/tenants/${IDS.otherTenant}/data-fabric/runs/${IDS.run}`){
    if(state.holdRun)await new Promise<void>(resolve=>state.pendingRuns.push(resolve));
    return response({run:{id:IDS.run,status:state.runStatus,delivery_status:state.delivery,delivery_error_code:state.runError??null,last_error_code:null},events:[],compensations:[],links:state.unsafeLinks?[{destination_deep_link:`https://evil.example.invalid/${IDS.report}`}]:[{destination_type:'field-job',destination_deep_link:`/modules/snapproofos/jobs/${IDS.fieldJob}`},{destination_type:'report',destination_deep_link:`/modules/snapproofos/reports/${IDS.report}`}]});
   }
   return response({error:'Synthetic route not exercised',code:'FIXTURE_UNAVAILABLE'},503);
  }
  if(/\.(png|svg|webp|ico)$/i.test(url.pathname)){const p=resolve(web,'public','.'+url.pathname);if(p.startsWith(resolve(web,'public')))return route.fulfill({path:p}).catch(()=>route.abort());}
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:Inter Variable,Inter,sans-serif"><div id="root"></div></body></html>'});
 });
 const suffix=state.search??(state.start==='home'?'':'?page=customer-workspace');await page.goto('http://localhost:34327/app'+suffix);
 await page.evaluate(({ids,role})=>{
  const f:any={user:{id:ids.user,name:'Synthetic Review Owner',email:'owner@example.invalid',platformRole:'user',currentTenantId:ids.tenant},tenant:{id:ids.tenant,name:'Synthetic Northstar Services',role},role,epoch:1,revision:0,listeners:new Set()};
  f.subscribe=(listener:()=>void)=>{f.listeners.add(listener);return()=>f.listeners.delete(listener);};f.snapshot=()=>f.revision;
  f.captureIdentity=(expected:unknown)=>{const epoch=f.epoch;return()=>f.user===expected&&f.epoch===epoch;};
  f.notify=()=>{f.revision++;for(const listener of f.listeners)listener();};
  (window as any).fixture=f;
  // Deliberately stale cache: the actual new client must send explicit headers.
  localStorage.setItem('activeTenantId',ids.otherTenant);
 },{ids:IDS,role:state.role});
 await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});
 return state;
}
export async function chooseJob(page:Page){
 await page.getByRole('button',{name:/Synthetic Northstar Client/}).click();
 await expect(page.getByRole('heading',{name:'Synthetic Northstar Client',exact:true})).toBeVisible();
 await page.getByLabel('Existing job',{exact:true}).selectOption(IDS.job);
 await expect(page.getByRole('heading',{name:'Prepare field proof',exact:true})).toBeVisible();
}
export async function reviewJob(page:Page){await chooseJob(page);await page.getByRole('button',{name:'Review field-proof handoff',exact:true}).click();}
