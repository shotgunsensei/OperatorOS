import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root=resolve(import.meta.dirname,'..');
const installed=createRequire(resolve(root,'package.json'));
let bundle='';

test.beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:root,loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import Console from './src/components/module-shells/TechDeckLiteralConsole';const root=createRoot(document.getElementById('root'));window.renderPortal=()=>root.render(<Console key={window.fixture.tenant} tenantKey={window.fixture.tenant} canWrite={window.fixture.write} canManage={window.fixture.manage} area={window.fixture.area}/>);window.renderPortal();`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},alias:{'@':resolve(root,'src'),react:dirname(installed.resolve('react')),'react-dom':dirname(installed.resolve('react-dom'))},plugins:[{name:'synthetic-portal-boundaries',setup(plugin){
  plugin.onResolve({filter:/^@\/(lib\/(auth|messenger)|components\/AuthProvider)$/},args=>({path:args.path,namespace:'portal-fixture'}));
  plugin.onLoad({filter:/.*/,namespace:'portal-fixture'},args=>({loader:'tsx',contents:args.path.includes('AuthProvider')?`export const useAuth=()=>({user:window.fixture.actor});`:args.path.endsWith('messenger')?`export const tenantMessengerApi={members:search=>window.fixture.members(search)};`:`export const directoryApi={organizations:{list:()=>window.fixture.organizations()},sites:{list:()=>window.fixture.sites()}};export const moduleShellApi={techdeck:{getLiteralWorkspace:async()=>({appointments:[],schedules:[],portalAssignments:[],licenseProducts:[],statusPages:[],intakeSpaces:[],intakeRequests:[],apiTokens:[],webhooks:[],exports:[]}),literalAction:async(path,input)=>{window.fixture.actions.push({path,input:JSON.parse(JSON.stringify(input))});return{ok:true}}}};`}));
 }}]});bundle=result.outputFiles[0].text;
});

async function mount(page:Page,options:Record<string,unknown>={}){
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}):route.abort());
 await page.goto('http://localhost:55497/portal');
 await page.evaluate(options=>{
  const f:any={tenant:'tenant-a',write:true,manage:true,area:'portal',actor:{id:'self',name:'Synthetic owner',email:'owner@example.invalid'},actions:[],calls:[],...options};
  f.members=async(search='')=>{f.calls.push({kind:'members',search,tenant:f.tenant});if(f.failure)throw{status:f.failure,error:'Synthetic lookup denied'};return{members:[{id:'member-a',name:'Synthetic technician',email:'tech@example.invalid'}]}};
  f.organizations=async()=>{f.calls.push({kind:'organizations'});return{organizations:[{id:'client-a',name:'Synthetic North client'},{id:'client-b',name:'Synthetic South client'}]}};
  f.sites=async()=>{f.calls.push({kind:'sites'});return{sites:[{id:'site-a',organizationId:'client-a',name:'North workshop'},{id:'site-b',organizationId:'client-b',name:'South workshop'}]}};
  (window as any).fixture=f;
 },options);
 await page.addScriptTag({content:bundle});
}

test('named choices submit existing server IDs and unchanged portal permissions',async({page})=>{
 await mount(page);
 await page.getByLabel('Portal member',{exact:true}).selectOption('member-a');
 await page.getByLabel('Client organization',{exact:true}).selectOption('client-a');
 await page.getByLabel('Client site',{exact:true}).selectOption('site-a');
 await page.getByRole('button',{name:'Grant portal access',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixture.actions)).toEqual([{path:'portal-assignments',input:{userId:'member-a',directoryOrganizationId:'client-a',directorySiteId:'site-a',canCreateTickets:true,canComment:true,canViewEvidence:true}}]);
});

test('client change clears the site and offers only that client’s sites',async({page})=>{
 await mount(page);
 await page.getByLabel('Portal member',{exact:true}).selectOption('member-a');
 await page.getByLabel('Client organization',{exact:true}).selectOption('client-a');
 await page.getByLabel('Client site',{exact:true}).selectOption('site-a');
 await page.getByLabel('Client organization',{exact:true}).selectOption('client-b');
 await expect(page.getByLabel('Client site',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Client site',{exact:true}).locator('option')).toHaveText(['All sites for this client','South workshop']);
 await page.getByRole('button',{name:'Grant portal access',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixture.actions[0]?.input)).toEqual({userId:'member-a',directoryOrganizationId:'client-b',canCreateTickets:true,canComment:true,canViewEvidence:true});
});

test('unavailable member lookup disables assignment, exposes retry and has no raw-ID fallback',async({page})=>{
 for(const failure of [403,404]){
  await mount(page,{failure});
  await expect(page.getByRole('alert')).toContainText('Synthetic lookup denied');
  await expect(page.getByRole('button',{name:'Grant portal access',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Retry portal choices',exact:true})).toBeVisible();
  await expect(page.locator('input[name="userId"],input[name="organizationId"],input[name="siteId"]')).toHaveCount(0);
 }
});

test('viewer and technician views never query administrator assignment choices',async({page})=>{
 for(const write of [false,true]){
  await mount(page,{write,manage:false});
  await expect(page.getByRole('button',{name:'Grant portal access',exact:true})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.calls.length)).toBe(0);
 }
});

test('member search uses the supported bounded lookup and keyboard selection remains available',async({page})=>{
 await mount(page);
 const search=page.getByLabel('Find portal member',{exact:true});
 await search.fill('Synthetic technician');
 await expect.poll(()=>page.evaluate(()=>(window as any).fixture.calls.filter((x:any)=>x.kind==='members').at(-1)?.search)).toBe('Synthetic technician');
 const member=page.getByLabel('Portal member',{exact:true});await member.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(member).not.toHaveValue('');
 await expect(page.getByText('Search by name or email. Up to 100 active members are shown.',{exact:true})).toBeVisible();
});

test('calendar inputs retain their names and expose persistent visible labels',async({page})=>{
 await mount(page,{area:'calendar'});
 for(const name of ['Appointment title','Starts at','Ends at','Recurring rule name','Generated ticket title','Interval days'])await expect(page.getByLabel(name,{exact:true})).toBeVisible();
 await expect(page.locator('label').filter({has:page.locator('[name="startsAt"]')})).toContainText('Starts at');
 await expect(page.locator('label').filter({has:page.locator('[name="intervalDays"]')})).toContainText('Interval days');
});


test('a late member lookup cannot replace the newly selected tenant’s choices',async({page})=>{
 await mount(page);
 await expect(page.getByLabel('Portal member',{exact:true})).toBeEnabled();
 await page.evaluate(()=>{
  const f=(window as any).fixture;
  f.members=()=>new Promise(resolve=>{f.resolveOld=resolve;});
 });
 await page.getByLabel('Find portal member',{exact:true}).fill('Old tenant search');
 await expect.poll(()=>page.evaluate(()=>Boolean((window as any).fixture.resolveOld))).toBe(true);
 await page.evaluate(()=>{
  const f=(window as any).fixture;f.tenant='tenant-b';f.actor={id:'new-owner',name:'New tenant owner',email:'new-owner@example.invalid'};
  f.members=async()=>({members:[{id:'new-member',name:'New tenant technician',email:'new-tech@example.invalid'}]});
  (window as any).renderPortal();
 });
 await expect(page.getByLabel('Portal member',{exact:true}).locator('option')).toContainText(['Choose an active member','New tenant owner (new-owner@example.invalid)','New tenant technician (new-tech@example.invalid)']);
 await page.evaluate(()=>(window as any).fixture.resolveOld({members:[{id:'old-member',name:'Old tenant technician',email:'old-tech@example.invalid'}]}));
 await expect(page.getByLabel('Portal member',{exact:true}).locator('option')).not.toContainText(['Old tenant technician (old-tech@example.invalid)']);
 await expect(page.getByLabel('Portal member',{exact:true})).toHaveValue('');
});

test('a failed Directory lookup also disables assignment and can be retried',async({page})=>{
 await mount(page,{manage:false});
 await page.evaluate(()=>{
  const f=(window as any).fixture;f.manage=true;
  f.organizations=async()=>{throw{status:403,error:'Synthetic Directory denied'};};
  (window as any).renderPortal();
 });
 await expect(page.getByRole('alert')).toContainText('Synthetic Directory denied');
 await expect(page.getByRole('button',{name:'Grant portal access',exact:true})).toBeDisabled();
 await page.evaluate(()=>{(window as any).fixture.organizations=async()=>({organizations:[{id:'client-a',name:'Synthetic North client'}]});});
 await page.getByRole('button',{name:'Retry portal choices',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.getByLabel('Client organization',{exact:true})).toBeEnabled();
});
