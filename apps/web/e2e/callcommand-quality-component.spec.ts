import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import AxeBuilder from '@axe-core/playwright';

// Actual screen and styles with synthetic, deferred API responses. Nothing here
// authenticates a user, provisions a code or contacts a server/provider.
const web = resolve(import.meta.dirname, '..');
const assets = process.env.OPERATOROS_TEST_ASSET_ROOT
  ? resolve(process.env.OPERATOROS_TEST_ASSET_ROOT, 'apps/web') : web;
const require = createRequire(resolve(assets, 'package.json'));
const shots = resolve(web, '../../../evidence/final-quality-oct30/screenshots');
let script: string;
let shellScript: string;
let styles: string;

test.beforeAll(async () => {
  const palette = readFileSync(resolve(web,'src/components/SaasLayout.tsx'),'utf8')
    .match(/const colors = (\{[\s\S]*?\n\});/)?.[1];
  if (!palette) throw new Error('Source design palette not found');
  const result = await build({
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import Workspace from './src/components/module-shells/CallCommandMspWorkspace';
      const root=createRoot(document.getElementById('root'));
      window.renderFixture=(props={})=>{
        window.fixtureProps={...window.fixtureProps,...props};
        const screen=React.createElement(Workspace,window.fixtureProps);
        root.render(window.fixtureStrict?React.createElement(React.StrictMode,null,screen):screen);
      };
      window.unmountFixture=()=>root.unmount();
      window.fixtureProps={view:'organizations',canWrite:true,canManage:true};
      window.renderFixture();
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: 'callcommand-quality-fixture.js', loader: { '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"test"' },
    nodePaths: [resolve(assets,'node_modules'),resolve(assets,'../../node_modules')],
    alias: { '@': resolve(web,'src'), react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'synthetic-api-only', setup(plugin) {
      plugin.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({path:'auth',namespace:'fixture'}));
      plugin.onResolve({ filter: /(?:^|\/)SaasLayout$/ }, () => ({path:'palette',namespace:'fixture'}));
      plugin.onLoad({ filter: /.*/, namespace:'fixture' }, args => ({contents:args.path==='palette'?`export const colors=${palette};`:'export const moduleShellApi={callcommand:window.fixtureApi};',loader:'js'}));
    }}],
  });
  script = result.outputFiles.find(file=>file.path.endsWith('.js'))!.text;
  styles = readFileSync(resolve(web,'src/app/globals.css'),'utf8') + '\n'
    + (result.outputFiles.find(file=>file.path.endsWith('.css'))?.text || '');
  const shell = await build({
    stdin:{resolveDir:web,loader:'tsx',contents:`
      import React from 'react';import {createRoot} from 'react-dom/client';
      import Shell from './src/components/module-shells/CallCommandShell';
      const root=createRoot(document.getElementById('root'));
      window.renderShell=()=>root.render(React.createElement(Shell,{routePath:'/organizations'}));
      window.renderShell();
    `},
    bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',
    nodePaths:[resolve(assets,'node_modules'),resolve(assets,'../../node_modules')],
    alias:{'@':resolve(web,'src'),react:dirname(require.resolve('react')),'react-dom':dirname(require.resolve('react-dom'))},
    define:{'process.env.NODE_ENV':'"test"'},
    plugins:[{name:'shell-lifetime-boundaries',setup(plugin){
      plugin.onResolve({filter:/(?:^|\/)(SaasLayout|CallCommandWorkspace)$/},args=>({path:args.path.endsWith('SaasLayout')?'palette':'workspace',namespace:'shell-fixture'}));
      plugin.onResolve({filter:/^(next\/(navigation|link|dynamic)|@\/lib\/auth|@\/components\/(AuthProvider|TenantProvider|ModuleAccessContext|module-application-shell))$/},args=>({path:args.path,namespace:'shell-fixture'}));
      plugin.onLoad({filter:/.*/,namespace:'shell-fixture'},args=>{
        const contents=args.path==='palette'?`export const colors=${palette};`
          :args.path==='workspace'?'export default function Workspace(){return null;}'
          :args.path==='next/navigation'?'export const usePathname=()=>"/modules/callcommand-ai/organizations";'
          :args.path==='next/link'?`import React from 'react';export default({children,href,...props})=><a href={href} {...props}>{children}</a>;`
          :args.path==='next/dynamic'?`import React,{useState} from 'react';export default()=>function ScopedWorkspace(){const [owner]=useState(window.fixtureUser.id);return <div data-testid="workspace-initial-user">{owner}</div>;};`
          :args.path.includes('AuthProvider')?'export const useAuth=()=>({user:window.fixtureUser,loading:false});'
          :args.path.includes('TenantProvider')?'export const useTenant=()=>({activeTenant:{id:"review-tenant",name:"Example Workshop"},activeRole:"owner",loading:false});'
          :args.path.includes('ModuleAccessContext')?'export const useModuleAccessLevel=()=>"manager";'
          :args.path.includes('module-application-shell')?`import React from 'react';export const ModuleApplicationShell=({children})=><main>{children}</main>;`
          :'export const getActiveTenantId=()=>"review-tenant";';
        return{contents,loader:'tsx'};
      });
    }}],
  });
  shellScript=shell.outputFiles[0].text;
  mkdirSync(shots,{recursive:true});
});

async function mount(page: Page, deferred = false, enabled = true, strict = false) {
  await page.route('**/*', route => {
    if (route.request().url() !== 'http://localhost:55496/') return route.abort();
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#041116;color:#edf7f6;font-family:Arial,sans-serif"><main style="max-width:1200px;margin:auto;padding:16px"><div id="root"></div></main></body></html>'});
  });
  await page.goto('http://localhost:55496/');
  await page.evaluate(({deferred,enabled,strict}) => {
    const f = window as any;
    f.fixtureStrict=strict;
    f.pendingReads=[];f.pendingIssues=[];f.issueCalls=0;
    f.workspace={contract:'synthetic-review',phases:[],settings:{automationMode:'TICKET_ONLY'},organizations:[{id:'review-org',name:'Example Workshop',profileId:'review-profile'}],directoryContacts:[{id:'review-contact',firstName:'Sample',lastName:'Contact',email:'sample@example.invalid'}],trustedLines:[],contacts:[{contactId:'review-contact',organizationId:'review-org',firstName:'Sample',lastName:'Contact',organizationName:'Example Workshop'}],supportLinks:[],integrations:[],actionCatalog:[],activeCalls:[],cases:[],outbox:[],audit:[],readiness:{intakeCodeIssuanceEnabled:enabled}};
    f.fixtureApi={
      mspWorkspace:()=>deferred?new Promise((resolve,reject)=>f.pendingReads.push({resolve,reject})):Promise.resolve(structuredClone(f.workspace)),
      mspIssueIntakeSupportLink:()=>{f.issueCalls++;return new Promise((resolve,reject)=>f.pendingIssues.push({resolve,reject}));},
    };
  },{deferred,enabled,strict});
  await page.addStyleTag({content:styles});
  await page.addScriptTag({content:script});
}

async function chooseContact(page: Page) {
  const area=page.locator('#callcommand-msp-contacts');
  await area.getByRole('combobox',{name:'Organization',exact:true}).last().selectOption('review-org');
  await area.getByRole('combobox',{name:'Mapped contact',exact:true}).selectOption('review-contact');
}
async function resolveIssue(page: Page) {
  await page.evaluate(() => {
    const f=window as any;
    f.displayCode=Array.from({length:8},(_,i)=>String(i)).join('');
    f.pendingIssues[0].resolve({supportLinkId:f.displayCode});
  });
}
async function read(page: Page, index: number, count = 0) {
  await page.evaluate(({index,count})=>{
    const f=window as any;
    f.pendingReads[index].resolve({...f.workspace,activeCalls:Array.from({length:count},(_,i)=>({id:'review-'+i,organizationName:'Example Workshop',state:'INTAKE',assuranceLevel:'A0',phoneMasked:'withheld'}))});
  },{index,count});
}

for (const width of [1440,390,320]) {
  test(`rendered intake setup is responsive at ${width}px`, async ({page})=>{
    await page.setViewportSize({width,height:1000});await mount(page);
    await expect(page.getByRole('heading',{name:'MSP Intake Command Center'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Create / rotate 8-digit intake code'})).toBeDisabled();
    await chooseContact(page);
    await expect(page.getByRole('button',{name:'Create / rotate 8-digit intake code'})).toBeEnabled();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({path:resolve(shots,`${process.env.QUALITY_SCREENSHOT_LABEL||'current'}-${width}.png`),fullPage:true});
  });
}

test('activation hold remains disabled after selecting a valid contact', async ({page})=>{
  await mount(page,false,false);await chooseContact(page);
  await expect(page.getByRole('button',{name:'Create / rotate 8-digit intake code'})).toBeDisabled();
  await expect(page.getByText('Intake-code issuance awaits activation review.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).issueCalls)).toBe(0);
});

test('same-turn repeated issuance submits only one operation', async ({page})=>{
  await mount(page);await chooseContact(page);
  await page.getByRole('button',{name:'Create / rotate 8-digit intake code'}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  expect(await page.evaluate(()=>(window as any).issueCalls)).toBe(1);
});

test('revealed code is discarded after management permission changes', async ({page})=>{
  await mount(page);await chooseContact(page);await page.getByRole('button',{name:'Create / rotate 8-digit intake code'}).click();
  await resolveIssue(page);await expect(page.getByRole('button',{name:'I recorded it'})).toBeVisible();
  await page.evaluate(()=>(window as any).renderFixture({canManage:false}));
  await expect(page.getByRole('button',{name:'I recorded it'})).toHaveCount(0);
  await page.evaluate(()=>(window as any).renderFixture({canManage:true}));
  await expect(page.getByRole('button',{name:'I recorded it'})).toHaveCount(0);
});

test('late issuance cannot reveal a code after permission loss and restoration', async ({page})=>{
  await mount(page);await chooseContact(page);await page.getByRole('button',{name:'Create / rotate 8-digit intake code'}).click();
  await page.evaluate(()=>(window as any).renderFixture({canManage:false}));
  await expect(page.locator('#callcommand-msp-contacts')).toHaveCount(0);
  await resolveIssue(page);
  await page.evaluate(()=>(window as any).renderFixture({canManage:true}));
  await expect(page.getByRole('button',{name:'I recorded it'})).toHaveCount(0);
});

test('a failed initial read cannot expose enabled configuration controls', async ({page})=>{
  await mount(page,true);
  await expect(page.getByRole('status')).toContainText('Loading');
  await page.evaluate(()=>(window as any).pendingReads[0].reject(new Error('Synthetic workspace unavailable')));
  await expect(page.getByRole('alert')).toContainText('Synthetic workspace unavailable');
  await expect(page.getByRole('button',{name:'Retry workspace'})).toBeVisible();
  await page.getByRole('button',{name:'Retry workspace'}).click();
  await read(page,1);
  await page.evaluate(()=>(window as any).renderFixture({view:'providers'}));
  await expect(page.getByRole('button',{name:'Save connection setup'})).not.toBeVisible();
  await page.evaluate(()=>(window as any).pendingReads[2].reject(new Error('Synthetic provider workspace unavailable')));
  await expect(page.getByRole('button',{name:'Retry workspace'})).toBeVisible();
  await page.getByRole('button',{name:'Retry workspace'}).click();await read(page,3);
  await expect(page.getByRole('button',{name:'Save connection setup'})).toBeEnabled();
});

test('older refresh cannot overwrite newer workspace data', async ({page})=>{
  await mount(page,true);await read(page,0,0);
  const refresh=page.getByRole('button',{name:'Refresh',exact:true});
  await refresh.click();await refresh.click();
  await read(page,2,2);await read(page,1,1);
  await expect(page.getByText('2 live',{exact:true})).toBeVisible();
});

test('read-only workspace has no mutation controls',async({page})=>{
  await mount(page);await page.evaluate(()=>(window as any).renderFixture({canManage:false,canWrite:false}));
  await expect(page.getByTestId('callcommand-read-only')).toBeVisible();
  await expect(page.locator('#callcommand-msp-contacts')).toHaveCount(0);
  await page.evaluate(()=>(window as any).renderFixture({view:'compliance'}));
  await expect(page.getByRole('button',{name:'Run intake test'})).toHaveCount(0);
});

test('an obsolete refresh failure cannot replace newer successful data',async({page})=>{
  await mount(page,true);await read(page,0);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await read(page,2,2);
  await page.evaluate(()=>(window as any).pendingReads[1].reject(new Error('Obsolete read error')));
  await expect(page.getByText('2 live',{exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed issuance releases the lock and permits a deliberate retry',async({page})=>{
  await mount(page);await chooseContact(page);
  const issue=page.getByRole('button',{name:'Create / rotate 8-digit intake code'});
  await issue.click();await expect(issue).toBeDisabled();
  await page.evaluate(()=>(window as any).pendingIssues[0].reject(new Error('Synthetic issuance unavailable')));
  await expect(page.getByRole('alert')).toContainText('Synthetic issuance unavailable');
  await expect(page.getByRole('button',{name:'I recorded it'})).toHaveCount(0);
  await expect(issue).toBeEnabled();await issue.click();
  expect(await page.evaluate(()=>(window as any).issueCalls)).toBe(2);
});

test('dismissed code stays hidden after refresh and route changes',async({page})=>{
  await mount(page);await chooseContact(page);await page.getByRole('button',{name:'Create / rotate 8-digit intake code'}).click();
  await resolveIssue(page);await page.getByRole('button',{name:'I recorded it'}).click();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('button',{name:'I recorded it'})).toHaveCount(0);
  await page.evaluate(()=>(window as any).renderFixture({view:'compliance'}));
  await expect(page.getByRole('heading',{name:'Go-live checklist'})).toBeVisible();
  await page.evaluate(()=>(window as any).renderFixture({view:'organizations'}));
  await expect(page.getByRole('button',{name:'I recorded it'})).toHaveCount(0);
});

test('account change inside the same tenant remounts private workspace state',async({page})=>{
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'}));
  await page.goto('http://localhost:55496/');
  await page.evaluate(()=>(window as any).fixtureUser={id:'review-first-user',currentTenantId:'review-tenant',platformRole:'user'});
  await page.addScriptTag({content:shellScript});
  await expect(page.getByTestId('workspace-initial-user')).toHaveText('review-first-user');
  await page.evaluate(()=>{(window as any).fixtureUser={id:'review-next-user',currentTenantId:'review-tenant',platformRole:'user'};(window as any).renderShell();});
  await expect(page.getByTestId('workspace-initial-user')).toHaveText('review-next-user');
});

test('loading and recoverable error states have rendered mobile proof',async({page})=>{
  await page.setViewportSize({width:390,height:844});await mount(page,true);
  await expect(page.getByRole('status')).toContainText('Loading');
  await page.screenshot({path:resolve(shots,`${process.env.QUALITY_SCREENSHOT_LABEL||'current'}-loading-390.png`)});
  await page.evaluate(()=>(window as any).pendingReads[0].reject(new Error('Synthetic workspace unavailable')));
  await expect(page.getByRole('button',{name:'Retry workspace'})).toBeVisible();
  await page.screenshot({path:resolve(shots,`${process.env.QUALITY_SCREENSHOT_LABEL||'current'}-error-390.png`)});
  await page.getByRole('button',{name:'Retry workspace'}).focus();await page.keyboard.press('Enter');await read(page,1);
  await expect(page.getByRole('heading',{name:'MSP Intake Command Center'})).toBeVisible();
});

for (const width of [1440,390]) test(`intake controls pass scoped accessibility at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});await mount(page);await chooseContact(page);
  const result=await new AxeBuilder({page}).include('.callcommand-msp-workspace').analyze();
  expect(result.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(node=>node.target)}))).toEqual([]);
});

test('StrictMode cleanup discards the first effect response',async({page})=>{
  await mount(page,true,true,true);
  await expect.poll(()=>page.evaluate(()=>(window as any).pendingReads.length)).toBe(2);
  await read(page,1,2);
  await page.evaluate(()=>(window as any).pendingReads[0].reject(new Error('Discarded first effect')));
  await expect(page.getByText('2 live',{exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('unmounting during issuance cannot reveal a code or start another read',async({page})=>{
  await mount(page,true);await read(page,0);await chooseContact(page);
  await page.getByRole('button',{name:'Create / rotate 8-digit intake code'}).click();
  await page.evaluate(()=>(window as any).unmountFixture());await resolveIssue(page);
  await expect(page.locator('#root')).toBeEmpty();
  expect(await page.evaluate(()=>(window as any).pendingReads.length)).toBe(1);
});
