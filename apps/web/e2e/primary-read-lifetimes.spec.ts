import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const root = resolve(process.env.OPERATOROS_TEST_SOURCE_ROOT ?? resolve(import.meta.dirname, '../../..'));
const assets = resolve(process.env.OPERATOROS_TEST_ASSET_ROOT ?? root);
const require = createRequire(resolve(assets, 'apps/web/package.json'));
const { build } = require('esbuild') as typeof import('esbuild');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let script: string; let css: string;
test.beforeAll(async () => {
  const result=await build({stdin:{resolveDir:resolve(root,'apps/web'),loader:'tsx',contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {brand,brandCssVariables} from './src/lib/brand';
    import './src/app/globals.css';
    import tradeTheme from './src/components/module-shells/TradeFlowKitShell.module.css';
    import {PULSEDESK_THEME} from './src/components/module-shells/PulseDeskRoute.contract';
    if(window.module==='trade')document.getElementById('root').className=tradeTheme.shell;
    import '@fontsource-variable/inter/wght.css';
    import '@fontsource-variable/open-sans/wght.css';
    Object.assign(document.body.style,{margin:'0',fontFamily:brand.fontBody,background:brand.bgPrimary,color:brand.textPrimary});
    if(window.module==='pulse')Object.assign(document.body.style,{fontFamily:PULSEDESK_THEME.typography.body,background:PULSEDESK_THEME.colors.background,color:PULSEDESK_THEME.colors.text});
    const theme=document.createElement('style');theme.textContent=':root{'+brandCssVariables+'}';document.head.append(theme);
    import Pulse from ${JSON.stringify(resolve(process.env.OPERATOROS_TEST_WORKSPACE_ROOT ?? root,'apps/web/src/components/module-shells/PulseDeskServiceDeskWorkspace'))};
    import Trade from ${JSON.stringify(resolve(process.env.OPERATOROS_TEST_WORKSPACE_ROOT ?? root,'apps/web/src/components/module-shells/TradeFlowKitOperations'))};
    window.root=createRoot(document.getElementById('root'));
    window.renderFixture=()=>window.root.render(window.hidden?null:window.module==='pulse'?<Pulse {...window.props} requestHref={id=>'/tickets/'+id} routeHref={path=>path}/>:<Trade {...window.props}/>);
  `},bundle:true,write:false,loader:{'.woff2':'dataurl','.woff':'dataurl'},outfile:'fixture.js',platform:'browser',format:'iife',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},nodePaths:[resolve(assets,'apps/web/node_modules'),resolve(assets,'node_modules')],
  alias:{react:dirname(require.resolve('react')),'react-dom':dirname(require.resolve('react-dom'))},
  plugins:[{name:'synthetic-boundaries',setup(plugin){
    plugin.onResolve({filter:/AuthProvider$|TenantProvider$|^@\/lib\/auth$|^next\/link$|^next\/navigation$/},args=>({path:args.path,namespace:'fixture'}));
    plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',contents:
      args.path.endsWith('AuthProvider')?'export const useAuth=()=>({user:window.user,loading:false});':
      args.path.endsWith('TenantProvider')?'export const useTenant=()=>({activeTenant:{id:window.tenant}});':
      args.path==='next/navigation'?'export const usePathname=()=>window.path??location.pathname;':
      args.path==='next/link'?'import React from "react";export default props=><a {...props}/>;':
      'export const sharedPlatformApi={dataFabricWorkflowReadiness:async()=>({available:false,blocker:"Synthetic test boundary"})}; export const getActiveTenantId=()=>window.tenant; export const moduleShellApi={pulsedesk:new Proxy({},{get:(_,kind)=>(...args)=>window.api(kind,args)}),tradeflowkit:new Proxy({},{get:(_,kind)=>(...args)=>window.api(kind,args)})};'
    }));
  }}]});
  script=result.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
  css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
});
async function setup(page:Page,module:'pulse'|'trade'){
  await page.route('**/*',route=>route.request().url()==='https://fixture.invalid/'?route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}):route.abort());
  await page.goto('https://fixture.invalid/');
  await page.evaluate(({A,B,module})=>{
    const w=window as any;w.module=module;w.user={id:'actor-a'};w.tenant='tenant-a';w.hidden=false;w.overrides={};w.pending=[];w.calls=[];w.holds=[];w.errors=[];
    window.addEventListener('error',e=>w.errors.push(e.message));
    w.props=module==='pulse'?{tenantKey:'tenant-a',view:'tickets',canWriteModule:true,canManageModule:true,showWorkday:false}:{tenantKey:'tenant-a',view:'jobs',canWrite:true,canManage:true};
    w.ticket=(id:string)=>({id,humanId:id===A?'PD-A':'PD-B',summary:id===A?'Alpha request':'Beta request',description:'Synthetic operational detail',status:'triage',priority:'normal',version:1,sla:{state:'healthy'},ticketTypeKey:'service_request',category:'other'});
    w.detail=(id:string)=>({ticket:w.ticket(id),capabilities:{canViewInternal:true,canManage:true},messages:[],events:[]});
    w.job=(id:string)=>({id,title:id===A?'Alpha job':'Beta job',number:id===A?1:2,version:1,status:'scheduled',priority:'normal'});
    w.settings=(prefix='JOB')=>({jobPrefix:prefix,jobNumberPadding:4});
    w.operations=(id?:string)=>({jobs:id?[w.job(id)]:[w.job(A),w.job(B)],tasks:[],payments:[],settings:w.settings(),metrics:{leads:0,jobs:2,tasks:0,completed_tasks:0,invoiced_cents:'0',collected_cents:'0',outstanding_cents:'0'},pagination:{limit:50,offset:0,returned:2}});
    w.result=(kind:string,args:any[])=>{
      if(w.overrides[kind])return w.overrides[kind];
      if(kind==='getServiceTicket')return w.detail(args[0]);
      if(kind==='listTicketAttachments')return [{id:args[0]+args[1],originalName:(args[0]===A?'Alpha':'Beta')+' '+args[1]+'.txt'}];
      if(kind==='listServiceTickets')return {tickets:[w.ticket(A),w.ticket(B)],pagination:{total:2}};
      if(kind==='getServiceConfiguration')return {defaults:{categories:['other'],priorities:['normal','high'],statuses:['triage','resolved'],types:['service_request']},departments:[],queues:[],teams:[],slaPolicies:[]};
      if(kind==='listServiceAssets')return {assets:[]};if(kind==='listServiceClients')return {organizations:[]};if(kind==='listServiceFacilities')return {sites:[]};if(kind==='listServiceContacts')return {contacts:[]};if(kind==='listSavedViews'||kind==='savedViews')return {savedViews:[]};if(kind==='listAssignees')return {assignees:[]};if(kind==='listKnowledge')return {articles:[]};
      if(kind==='operations')return w.operations();if(kind==='settings')return w.settings();if(kind==='job')return {job:w.job(args[0]),tasks:[]};if(kind==='revenue')return {customers:[],jobs:[],quotes:[],invoices:[]};
      if(['transitionServiceTicket','archiveJob','updateServiceTicket','createSavedView','saveView'].includes(kind))return {};
      throw Error('Unexpected synthetic API '+kind);
    };
    w.api=(kind:string,args:any[])=>{w.calls.push({kind,args});return (w.holds.includes(kind)&&(kind!=='listTicketAttachments'||args[1]==='requester'))?new Promise((resolve,reject)=>w.pending.push({kind,args,resolve,reject})):Promise.resolve(w.result(kind,args));};
    w.files=[];w.filePending=[];w.downloads=0;
    URL.createObjectURL=()=>{w.downloads++;return 'blob:synthetic';};URL.revokeObjectURL=()=>{};
    window.fetch=async(input)=>{
      if(String(input).endsWith('/content'))return {ok:true,blob:()=>new Promise((resolve,reject)=>w.filePending.push({kind:'blob',resolve,reject}))} as Response;
      if(w.holdFiles)return new Promise(resolve=>w.filePending.push({kind:'list',resolve:(files:any[])=>resolve(new Response(JSON.stringify({attachments:files}),{status:200}))}));
      return new Response(JSON.stringify({attachments:w.files}),{status:200,headers:{'Content-Type':'application/json'}});
    };
  },{A,B,module});
  await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(()=>(window as any).renderFixture());
  await expect(page.getByRole('button',{name:module==='pulse'?/PD-A Alpha request/:/Alpha job/}).first()).toBeVisible();
  expect(await page.evaluate(()=>(window as any).errors)).toEqual([]);
}
async function holds(page:Page,kinds:string[]){await page.evaluate(kinds=>(window as any).holds=kinds,kinds);}
async function count(page:Page,kind:string,n:number){await expect.poll(()=>page.evaluate(kind=>(window as any).pending.filter((p:any)=>p.kind===kind).length,kind)).toBe(n);}
async function settle(page:Page,kind:string,index=0,reject=false,id?:string){
  await page.evaluate(async({kind,index,reject,id})=>{const w=window as any;const p=w.pending.filter((p:any)=>p.kind===kind)[index];if(!p)throw Error('Missing pending '+kind);w.pending.splice(w.pending.indexOf(p),1);reject?p.reject(Error('STALE FAILURE')):p.resolve(id&&kind==='operations'?w.operations(id):id&&kind==='settings'?w.settings(id):w.result(kind,p.args));await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));},{kind,index,reject,id});
}
async function change(page:Page,props:Record<string,unknown>){await page.evaluate(props=>{const w=window as any;w.props={...w.props,...props};w.renderFixture();},props);}
async function open(page:Page,id:string){await page.getByRole('button',{name:id===A?/PD-A Alpha request/:/PD-B Beta request/}).click();}
for(const reject of [false,true])test(`Pulse latest detail wins over late ${reject?'error':'success'}`,async({page})=>{
  await setup(page,'pulse');await holds(page,['getServiceTicket']);await open(page,A);await open(page,B);await count(page,'getServiceTicket',2);
  await settle(page,'getServiceTicket',1);await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');await settle(page,'getServiceTicket',0,reject);
  await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');await expect(page.getByText('STALE FAILURE')).toHaveCount(0);await expect(page.getByText('Alpha requester.txt')).toHaveCount(0);
});
test('Pulse old finally cannot complete newer detail read',async({page})=>{
  await setup(page,'pulse');await holds(page,['getServiceTicket']);await open(page,A);await open(page,B);await settle(page,'getServiceTicket');
  await expect(page.getByTestId('pulsedesk-ticket-workspace')).toHaveCount(0);await settle(page,'getServiceTicket');await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');
});
test('Pulse attachment result stays paired with selected ticket',async({page})=>{
  await setup(page,'pulse');await holds(page,['listTicketAttachments']);await open(page,A);await count(page,'listTicketAttachments',1);await holds(page,[]);await open(page,B);await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta requester.txt');await settle(page,'listTicketAttachments');
  await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');await expect(page.getByText('Alpha requester.txt')).toHaveCount(0);
});
for(const scope of ['tenant','view','unmount'])for(const reject of [false,true])test(`Pulse ${scope} invalidates pending detail ${reject?'error':'success'}`,async({page})=>{
  await setup(page,'pulse');await holds(page,['getServiceTicket']);await open(page,A);await count(page,'getServiceTicket',1);
  if(scope==='tenant')await change(page,{tenantKey:'tenant-b'});if(scope==='view')await change(page,{view:'knowledge'});if(scope==='unmount')await page.evaluate(()=>{const w=window as any;w.hidden=true;w.renderFixture();});
  await settle(page,'getServiceTicket',0,reject);await expect(page.getByTestId('pulsedesk-ticket-workspace')).toHaveCount(0);await expect(page.getByText('STALE FAILURE')).toHaveCount(0);
});
test('Pulse mutation after selection change cannot reopen old record',async({page})=>{
  await setup(page,'pulse');await open(page,A);await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Alpha request');await holds(page,['transitionServiceTicket']);await page.getByRole('button',{name:'Resolve',exact:true}).click();await count(page,'transitionServiceTicket',1);await open(page,B);await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');await settle(page,'transitionServiceTicket');await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');
  expect(await page.evaluate(A=>(window as any).calls.filter((c:any)=>c.kind==='getServiceTicket'&&c.args[0]===A).length,A)).toBe(1);
});
for(const reject of [false,true])test(`Trade newer filter wins over late ${reject?'error':'success'}`,async({page})=>{
  await setup(page,'trade');await holds(page,['operations']);await page.getByPlaceholder('Search jobs',{exact:true}).fill('old');await count(page,'operations',1);await page.getByPlaceholder('Search jobs',{exact:true}).fill('new');await count(page,'operations',2);await settle(page,'operations',1,false,B);await expect(page.getByRole('heading',{name:'Beta job',exact:true})).toBeVisible();await settle(page,'operations',0,reject,A);await expect(page.getByRole('heading',{name:'Beta job',exact:true})).toBeVisible();await expect(page.getByText('STALE FAILURE')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Alpha job',exact:true})).toHaveCount(0);
});
test('Trade stale finally leaves current operations loading',async({page})=>{
  await setup(page,'trade');await holds(page,['operations']);await page.getByPlaceholder('Search jobs',{exact:true}).fill('old');await count(page,'operations',1);await page.getByPlaceholder('Search jobs',{exact:true}).fill('new');await count(page,'operations',2);await settle(page,'operations',0,false,A);await expect(page.getByTestId('tradeflowkit-operations-loading')).toBeVisible();await settle(page,'operations',0,false,B);await expect(page.getByRole('heading',{name:'Beta job',exact:true})).toBeVisible();
});
test('Trade old settings cannot overwrite current settings',async({page})=>{
  await setup(page,'trade');await holds(page,['settings']);await page.getByPlaceholder('Search jobs',{exact:true}).fill('old');await count(page,'settings',1);await page.getByPlaceholder('Search jobs',{exact:true}).fill('new');await count(page,'settings',2);await settle(page,'settings',1,false,'CURRENT');await settle(page,'settings',0,false,'OLDPREFIX');await expect(page.getByText(/OLDPREFIX/)).toHaveCount(0);await expect(page.getByText(/CURRENT/).first()).toBeVisible();
});
for(const scope of ['tenant','view','unmount'])for(const reject of [false,true])test(`Trade ${scope} invalidates pending operations ${reject?'error':'success'}`,async({page})=>{
  await setup(page,'trade');await holds(page,['operations']);await page.getByPlaceholder('Search jobs',{exact:true}).fill('old');await count(page,'operations',1);await holds(page,[]);
  if(scope==='tenant')await change(page,{tenantKey:'tenant-b'});if(scope==='view')await change(page,{view:'full'});if(scope==='unmount')await page.evaluate(()=>{const w=window as any;w.hidden=true;w.renderFixture();});
  await settle(page,'operations',0,reject,A);await expect(page.getByText('STALE FAILURE')).toHaveCount(0);if(scope!=='unmount')await expect(page.getByRole('button',{name:/Beta job/}).first()).toBeVisible();else await expect(page.getByTestId('tradeflowkit-operations')).toHaveCount(0);
});
test('Trade mutation cannot seed old filter refresh',async({page})=>{
  await setup(page,'trade');page.on('dialog',dialog=>dialog.accept());await holds(page,['archiveJob']);await page.getByRole('button',{name:'Archive',exact:true}).click();await count(page,'archiveJob',1);await page.getByPlaceholder('Search jobs',{exact:true}).fill('new');await expect(page.getByTestId('tradeflowkit-operations-loading')).toHaveCount(0);const before=await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.kind==='operations').length);await settle(page,'archiveJob');expect(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.kind==='operations').length)).toBe(before);
});




test('Pulse partial list refresh does not dismiss exact ticket outside first page',async({page})=>{
  await setup(page,'pulse');await open(page,B);await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');
  await page.evaluate(A=>{const w=window as any;w.overrides.listServiceTickets={tickets:[w.ticket(A)],pagination:{total:101}};},A);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');await expect(page.getByRole('heading',{name:'Ticket queue (101)'})).toBeVisible();
});
test('Pulse sibling read failure preserves successful ticket panel',async({page})=>{
  await setup(page,'pulse');await holds(page,['getServiceConfiguration']);await page.getByRole('button',{name:'Refresh',exact:true}).click();await count(page,'getServiceConfiguration',1);await settle(page,'getServiceConfiguration',0,true);await expect(page.getByRole('button',{name:/PD-A Alpha request/})).toBeVisible();await expect(page.getByText('STALE FAILURE')).toBeVisible();
});
for(const module of ['pulse','trade'] as const)for(const width of [390,1440])test(`${module} actual workspace visual ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:1000});await setup(page,module);if(module==='pulse')await open(page,B);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:process.env.OPERATOROS_TEST_EVIDENCE_ROOT?resolve(process.env.OPERATOROS_TEST_EVIDENCE_ROOT,`${module}-workspace-${width}.png`):testInfo.outputPath(`${module}-workspace-${width}.png`),fullPage:true});
  expect(await page.evaluate(()=>(window as any).errors)).toEqual([]);
});

test('Pulse same-view route change wins over old exact request',async({page})=>{
  await setup(page,'pulse');await holds(page,['getServiceTicket']);
  await page.evaluate(A=>{const w=window as any;w.path='/tickets/'+A;history.replaceState({},'',w.path);w.renderFixture();},A);await count(page,'getServiceTicket',1);
  await page.evaluate(B=>{const w=window as any;w.path='/tickets/'+B;history.replaceState({},'',w.path);w.renderFixture();},B);await count(page,'getServiceTicket',2);
  await settle(page,'getServiceTicket',1);await settle(page,'getServiceTicket');await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');
});
test('Pulse filter does not reopen previous URL ticket',async({page})=>{
  await setup(page,'pulse');await page.evaluate(A=>{const w=window as any;w.path='/tickets/'+A;history.replaceState({},'',w.path);w.renderFixture();},A);await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Alpha request');
  await page.getByRole('textbox',{name:'Search requests'}).fill('new');await expect(page.getByRole('button',{name:/PD-A Alpha request/})).toBeVisible();await expect(page.getByTestId('pulsedesk-ticket-workspace')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.kind==='getServiceTicket').length)).toBe(1);
});

test('Trade revenue failure preserves successful operations metrics',async({page})=>{
  await setup(page,'trade');await holds(page,['revenue']);await change(page,{view:'dashboard'});await count(page,'revenue',1);await settle(page,'revenue',0,true);
  await expect(page.getByTestId('tradeflowkit-workday-error')).toBeVisible();await expect(page.getByTestId('tradeflowkit-operations-loading')).toHaveCount(0);await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();
  await page.getByText('Business totals',{exact:true}).click();await expect(page.getByLabel('Business totals')).toContainText('Jobs2');
});
test('Trade saved views failure preserves successful jobs',async({page})=>{
  await setup(page,'trade');await holds(page,['savedViews']);await change(page,{tenantKey:'tenant-b'});await count(page,'savedViews',1);await settle(page,'savedViews',0,true);
  await expect(page.getByText('STALE FAILURE')).toBeVisible();await expect(page.getByRole('heading',{name:'Alpha job',exact:true})).toBeVisible();
});
test('Trade stale attachment list cannot appear under newer job',async({page})=>{
  await setup(page,'trade');await page.evaluate(()=>{const w=window as any;w.holdFiles=true;});await page.getByRole('button',{name:/Beta job/}).first().click();
  await expect.poll(()=>page.evaluate(()=>(window as any).filePending.length)).toBe(1);await page.evaluate(()=>{const w=window as any;w.holdFiles=false;});await page.getByRole('button',{name:/Alpha job/}).first().click();
  await page.evaluate(()=>{const w=window as any;w.filePending.shift().resolve([{id:'stale',originalName:'STALE FILE',sizeBytes:1,scanStatus:'clean'}]);});await expect(page.getByText('STALE FILE')).toHaveCount(0);
});
for(const reject of [false,true])test(`Trade stale download ${reject?'error':'success'} after selecting another job is ignored`,async({page})=>{
  await setup(page,'trade');await page.evaluate(()=>{const w=window as any;w.files=[{id:'file-a',originalName:'Synthetic file',sizeBytes:1,scanStatus:'clean'}];});await page.getByRole('button',{name:/Beta job/}).first().click();await page.getByRole('button',{name:/Download/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).filePending.length)).toBe(1);await page.getByRole('button',{name:/Alpha job/}).first().click();
  await page.evaluate(async reject=>{const w=window as any;const p=w.filePending.shift();reject?p.reject(Error('STALE DOWNLOAD')):p.resolve(new Blob(['synthetic']));await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));},reject);
  await expect(page.getByText('STALE DOWNLOAD')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).downloads)).toBe(0);await expect(page.getByRole('button',{name:/Download/})).toBeEnabled();
});
for(const reject of [false,true])test(`Pulse old list ${reject?'error':'success'} cannot replace newer tenant queue`,async({page})=>{
  await setup(page,'pulse');await holds(page,['listServiceTickets']);await page.getByRole('button',{name:'Refresh',exact:true}).click();await count(page,'listServiceTickets',1);await holds(page,[]);
  await page.evaluate(B=>{const w=window as any;w.overrides.listServiceTickets={tickets:[w.ticket(B)],pagination:{total:1}};},B);await change(page,{tenantKey:'tenant-b'});await expect(page.getByRole('button',{name:/PD-B Beta request/})).toBeVisible();
  await page.evaluate(A=>{const w=window as any;w.overrides.listServiceTickets={tickets:[w.ticket(A)],pagination:{total:1}};},A);await settle(page,'listServiceTickets',0,reject);await expect(page.getByRole('button',{name:/PD-B Beta request/})).toBeVisible();await expect(page.getByRole('button',{name:/PD-A Alpha request/})).toHaveCount(0);await expect(page.getByText('STALE FAILURE')).toHaveCount(0);
});
test('Pulse exact route outside list survives delayed list completion',async({page})=>{
  await setup(page,'pulse');await holds(page,['listServiceTickets']);await page.evaluate(({A,B})=>{const w=window as any;w.overrides.listServiceTickets={tickets:[w.ticket(A)],pagination:{total:101}};w.path='/tickets/'+B;history.replaceState({},'',w.path);w.renderFixture();},{A,B});await count(page,'listServiceTickets',1);
  await expect.poll(()=>page.evaluate(()=>(window as any).calls.filter((c:any)=>c.kind==='listTicketAttachments').length)).toBe(2);await settle(page,'listServiceTickets');await expect(page.getByTestId('pulsedesk-ticket-workspace')).toContainText('Beta request');await expect(page.getByRole('heading',{name:'Ticket queue (101)'})).toBeVisible();
});

test.afterEach(async({page})=>{expect(await page.evaluate(()=>(window as any).errors??[])).toEqual([]);});
