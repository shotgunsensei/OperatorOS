import { expect,test,type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname,resolve } from 'node:path';
import { build } from 'esbuild';

const root=resolve(import.meta.dirname,'..'),require=createRequire(resolve(root,'../../package.json'));
let bundle:string;
test.beforeAll(async()=>{
  const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Console from './src/components/module-shells/PulseDeskConnectorConsole';createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Console,{mode:'integrations'})));`,resolveDir:root,loader:'tsx'},
    bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},
    alias:{react:dirname(require.resolve('react')),'react-dom':dirname(require.resolve('react-dom'))},
    plugins:[{name:'synthetic-pulsedesk-api',setup(plugin){plugin.onResolve({filter:/lib[\\/]auth(?:\.ts)?$/},()=>({path:'api',namespace:'synthetic'}));plugin.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'export const moduleShellApi={pulsedesk:window.syntheticPulseDesk};',loader:'js'}));}}],
  });bundle=result.outputFiles[0].text;
});

async function mount(page:Page,options:{available?:boolean;manager?:boolean;callback?:boolean}={}){
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  // Fulfillment occurs before any request reaches a socket. All other URLs abort.
  await page.route('**/*',route=>route.request().url().startsWith('http://localhost:51836/')
    ?route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'}):route.abort());
  await page.goto('http://localhost:51836/integrations'+(options.callback?'?code=SYNTHETIC_CODE&state=SYNTHETIC_STATE':''));
  await page.evaluate(options=>{
    const f=window as any;f.calls=[];f.config={available:options.available??true,manager:options.manager??true};
    if(options.callback)sessionStorage.setItem('pulsedesk.pending-mailbox',JSON.stringify({id:'20000000-0000-4000-8000-000000000001',expiresAt:Date.now()+60000}));
    f.syntheticPulseDesk={
      listConnectors:async()=>({connectors:[{id:'20000000-0000-4000-8000-000000000001',provider:'google',label:'Facilities inbox',mode:'live',status:'active'}],capabilities:{deterministicTestAdapter:false,liveMailboxAdapters:f.config.available,canManageMailboxes:f.config.manager}}),
      createConnector:async(input:unknown)=>{f.calls.push({kind:'create',input});return{};},
      startConnectorOauth:async()=>{throw Error('No external OAuth navigation permitted');},
      completeConnectorOauth:async(id:unknown,input:unknown)=>{f.calls.push({kind:'complete',id,input});return{connected:true};},
      pollConnector:async(id:unknown)=>{f.calls.push({kind:'queue',id});return{job:{id:'synthetic-job'}};},
      revokeConnector:async()=>({}),
    };
  },options);
  await page.addScriptTag({content:bundle});await expect(page.getByRole('heading',{name:'Mailbox connection status'})).toBeVisible();
  return errors;
}

test('unavailable runtime hides real setup and import while preserving direct-intake guidance',async({page})=>{
  const errors=await mount(page,{available:false});await expect(page.getByText('Email connections are not available yet.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Add mailbox connection'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Import new requests'})).toHaveCount(0);expect(errors).toEqual([]);
});
test('members do not receive manager setup or import controls',async({page})=>{
  const errors=await mount(page,{manager:false});await expect(page.getByRole('button',{name:'Add mailbox connection'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Reconnect mailbox'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Import new requests'})).toHaveCount(0);expect(errors).toEqual([]);
});
for(const width of [1280,390])test(`both established providers and metadata-only setup remain usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const errors=await mount(page);
  await expect(page.getByLabel('Email service').locator('option')).toHaveText(['Google Workspace','Microsoft 365']);
  await expect(page.locator('input[type=password]')).toHaveCount(0);await expect(page.locator('input[name*=secret i],input[name*=token i]')).toHaveCount(0);
  await page.getByLabel('Email service').selectOption('microsoft');await page.getByLabel('Connection name').fill('Operations inbox');await page.getByLabel('Mailbox address',{exact:true}).fill('operations@example.invalid');
  await page.getByLabel('This mailbox is for operational requests and excludes patient or clinical information.').check();await page.getByRole('button',{name:'Add mailbox connection'}).click();
  await expect(page.getByText('Mailbox setup completed.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.find((call:any)=>call.kind==='create').input)).toEqual({provider:'microsoft',label:'Operations inbox',mailboxAddress:'operations@example.invalid',mode:'live',publicConfig:{operationsOnly:true}});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
  await page.screenshot({path:test.info().outputPath(`mailbox-${width}.png`),fullPage:true});
});
test('a queued import is described as queued rather than delivery or completed ingestion',async({page})=>{
  const errors=await mount(page);await page.getByRole('button',{name:'Import new requests'}).click();await expect(page.getByText('Mailbox import was queued. Check the saved connection activity for its result.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.filter((call:any)=>call.kind==='queue').length)).toBe(1);expect(errors).toEqual([]);
});
test('callback is exchanged once under StrictMode, scrubbed from URL and never stored as credentials',async({page})=>{
  const errors=await mount(page,{callback:true});await expect(page.getByText(/Mailbox authorization was confirmed/)).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.filter((call:any)=>call.kind==='complete'))).toEqual([{kind:'complete',id:'20000000-0000-4000-8000-000000000001',input:{code:'SYNTHETIC_CODE',state:'SYNTHETIC_STATE'}}]);
  expect(new URL(page.url()).search).toBe('');expect(await page.evaluate(()=>JSON.stringify({...sessionStorage}))).not.toMatch(/SYNTHETIC_CODE|SYNTHETIC_STATE|accessToken|refreshToken/);expect(errors).toEqual([]);
});
