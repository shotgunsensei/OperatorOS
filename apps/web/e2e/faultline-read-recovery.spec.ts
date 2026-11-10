import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const root = resolve(process.env.OPERATOROS_TEST_SOURCE_ROOT ?? resolve(import.meta.dirname, '../../..'));
const assets = resolve(process.env.OPERATOROS_TEST_ASSET_ROOT ?? root);
const require = createRequire(resolve(assets, 'apps/web/package.json'));
const { build } = require('esbuild') as typeof import('esbuild');
let script: string; let css: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: resolve(root, 'apps/web'), loader: 'tsx', contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import Workspace from ${JSON.stringify(resolve(process.env.OPERATOROS_TEST_WORKSPACE_ROOT ?? root, 'apps/web/src/components/module-shells/FaultlineLabWorkspace'))};
      import {useFaultlineReadPanel,FaultlineReadFeedback} from './src/components/module-shells/FaultlineReadFeedback';
      function Panel(){const panel=useFaultlineReadPanel([]); window.panel=panel;
        return <><FaultlineReadFeedback label="Test evidence" panel={panel}/><output>{JSON.stringify(panel.value)}</output></>;}
      window.root=createRoot(document.getElementById('root'));
      window.renderFixture=()=>window.root.render(window.hidden?null:window.onlyPanel?<Panel key={window.scope}/>:<Workspace {...window.props}/>);
    ` }, bundle: true, write: false, outfile: 'fixture.js', platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    nodePaths: [resolve(assets, 'apps/web/node_modules'), resolve(assets, 'node_modules')],
    alias: { react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'synthetic-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /AuthProvider$|TenantProvider$|^@\/lib\/auth$|^next\/navigation$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', contents:
        args.path.endsWith('AuthProvider') ? 'export const useAuth=()=>({user:window.user,loading:false});'
        : args.path.endsWith('TenantProvider') ? 'export const useTenant=()=>({activeTenant:{id:window.tenant}});'
        : args.path === 'next/navigation' ? 'export const useRouter=()=>window.router;'
        : 'export const moduleShellApi={faultlinelab:new Proxy({},{get:(_,kind)=>(...args)=>window.api(kind,args)})};',
      }));
    } }],
  });
  css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
  script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text ?? result.outputFiles[0]!.text;
});
async function setup(page: Page, onlyPanel = false, mode = 'fail', view = 'reports') {
  await page.route('**/*', route => route.request().url() === 'https://fixture.invalid/'
    ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
  await page.goto('https://fixture.invalid/');
  await page.evaluate(({onlyPanel,mode,view}) => {
    const w=window as any; w.onlyPanel=onlyPanel; w.scope='a'; w.user={id:'actor-a'}; w.tenant='tenant-a';
    w.hidden=false; w.calls=[]; w.pending=[]; w.mode=mode;
    w.props={view,canWrite:true,canAdmin:true,canManage:true,...(view==='session'?{recordId:'session-a'}:view==='authoring'?{challengeId:'draft-a'}:{})};
    w.router={push(){},replace(){}};
    w.api=(kind:string,args:any[])=>{
      w.calls.push({kind,args});
      if(kind.startsWith('upload') && w.uploadHold)return new Promise((resolve,reject)=>w.pending.push({resolve,reject}));
      if(kind==='analytics'||kind==='listMembers'||kind==='listSessionAttachments'||kind==='listChallengeAttachments'){
        if(w.mode==='hold')return new Promise((resolve,reject)=>w.pending.push({resolve,reject}));
        if(w.mode==='fail'||w.mode==='deny')return Promise.reject({status:w.mode==='deny'?403:503});
        if(kind.includes('Attachments'))return Promise.resolve({attachments:[{id:'attachment-a',originalName:'Synthetic evidence.txt',scanStatus:'clean'}]});
        return Promise.resolve(kind==='analytics'?{summary:{completedAttempts:7,passedAttempts:5}}:{members:[{id:'member',name:'Synthetic investigator',role:'member'}]});
      }
      if(kind==='getAuthoringChallenge')return Promise.resolve({challenge:{id:args[0],title:'Synthetic draft',status:'draft',currentVersionNumber:1},content:{},versions:[]});
      if(kind==='getSession')return Promise.resolve({session:{id:args[0],state:'completed',score:70},challenge:{briefing:'Synthetic investigation'},actions:[],evidence:[]});
      if(kind==='listSessions')return Promise.resolve({sessions:[]});
      if(kind==='progress')return Promise.resolve({progress:{attemptsCompleted:3}});
      if(kind==='listChallenges')return Promise.resolve({challenges:[],facets:{total:0,categories:{},difficulties:{}}});
      if(kind==='listAssignments')return Promise.resolve({assignments:[]});
      return Promise.resolve({});
    };
  },{onlyPanel,mode,view});
  await page.addStyleTag({content:css}); await page.addScriptTag({content:script}); await page.evaluate(()=>(window as any).renderFixture());
}
test('failed analytics stays unavailable while personal report remains usable; retry only reads',async({page})=>{
  await setup(page); await expect(page.getByRole('alert')).toContainText('Team analytics unavailable');
  await expect(page.getByText('Manager access required',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Attempt history'})).toBeVisible();
  await page.evaluate(()=>(window as any).mode='ok');
  await page.getByRole('button',{name:'Retry team analytics'}).click();
  await expect(page.getByRole('heading',{name:'7 completed'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.filter((x:any)=>x.kind==='analytics').length)).toBe(2);
});
test('unavailable members disable assignment and recover without writes',async({page})=>{
  await setup(page,false,'fail','assignments');
  await expect(page.getByRole('alert')).toContainText('Team members unavailable');
  await expect(page.getByRole('button',{name:'Create assignment'})).toBeDisabled();
  await page.evaluate(()=>(window as any).mode='ok');
  await page.getByRole('button',{name:'Retry team members'}).click();
  await expect(page.getByRole('button',{name:'Create assignment'})).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).calls.some((x:any)=>x.kind==='createAssignment'))).toBe(false);
});
for(const change of ['actor','tenant','route']) for(const outcome of ['resolve','reject']) {
  test(`old analytics ${outcome} ignored after ${change} change`,async({page})=>{
    await setup(page,false,'hold');
    await expect.poll(()=>page.evaluate(()=>(window as any).pending.length)).toBe(1);
    await page.evaluate(change=>{const w=window as any; w.mode='ok'; if(change==='actor')w.user={id:'actor-b'}; if(change==='tenant')w.tenant='tenant-b'; if(change==='route')w.props={...w.props,view:'assignments'}; w.renderFixture();},change);
    await expect(page.getByText('Loading your FaultlineLab workspace.')).toHaveCount(0);
    await page.evaluate(outcome=>{const p=(window as any).pending.shift();outcome==='resolve'?p.resolve({summary:{completedAttempts:999}}):p.reject({status:503});},outcome);
    await expect(page.getByText('999 completed',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
for(const outcome of ['resolve','reject']) test(`panel ignores stale ${outcome} after a newer read`,async({page})=>{
  await setup(page,true);
  await page.evaluate(()=>{const w=window as any; w.panel.read(()=>new Promise((resolve,reject)=>w.pending.push({resolve,reject})));});
  await page.evaluate(()=>{const w=window as any; return w.panel.read(()=>Promise.resolve(['current']));});
  await page.evaluate(outcome=>{const p=(window as any).pending.shift();outcome==='resolve'?p.resolve(['stale']):p.reject({status:503});},outcome);
  await expect(page.locator('output')).toHaveText('["current"]'); await expect(page.getByRole('alert')).toHaveCount(0);
});
test('panel reset cancels pending read and clears its retry target',async({page})=>{
  await setup(page,true);
  await page.evaluate(()=>{const w=window as any; w.panel.read(()=>new Promise(resolve=>w.pending.push({resolve})));});
  await page.evaluate(()=>{const w=window as any;w.panel.reset();w.pending.shift().resolve(['old']);});
  await expect(page.locator('output')).toHaveText('[]'); await expect(page.getByRole('button')).toHaveCount(0);
});
test('denied read hides previous evidence but remains visibly unavailable',async({page})=>{
  await setup(page,true);
  await page.evaluate(()=>(window as any).panel.read(()=>Promise.resolve(['protected'])));
  await expect(page.locator('output')).toContainText('protected');
  await page.evaluate(()=>(window as any).panel.read(()=>Promise.reject({status:403})));
  await expect(page.locator('output')).toHaveText('[]'); await expect(page.getByRole('alert')).toContainText('access could not be verified');
});
test('transient failure retains last known evidence with explicit stale warning',async({page})=>{
  await setup(page,true);
  await page.evaluate(()=>(window as any).panel.read(()=>Promise.resolve(['saved'])));
  await page.evaluate(()=>(window as any).panel.read(()=>Promise.reject({status:503})));
  await expect(page.locator('output')).toHaveText('["saved"]'); await expect(page.getByRole('alert')).toContainText('last successful read');
});
for(const width of [390,1440])test(`analytics error recovery layout ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900}); await setup(page);
  const retry=page.getByRole('button',{name:'Retry team analytics'}); await expect(retry).toBeVisible();
  await retry.focus(); await expect(retry).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:resolve(process.env.OPERATOROS_TEST_EVIDENCE_ROOT??root,`faultline-error-${width}.png`),fullPage:true});
});
test('all four secondary reads use explicit panel recovery rather than empty fallbacks',()=>{
  const source=readFileSync(resolve(root,'apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx'),'utf8');
  for(const text of ['readAnalytics(() =>','readMembers(async () =>','readAttachments(async () =>','readChallengeAttachments(async () =>'])expect(source).toContain(text);
  expect(source).not.toContain('.catch(() => ({ attachments: [] }))');
});


for(const [view,label] of [['session','Investigation attachments'],['authoring','Challenge attachments']])test(`${label} failures preserve the main record and retry only reads`,async({page})=>{
  await setup(page,false,'fail',view);
  await expect(page.getByRole('alert')).toContainText(`${label} unavailable`);
  await expect(page.getByRole('heading',{name:view==='session'?'Briefing':'Edit Synthetic draft'})).toBeVisible();
  await expect(page.getByText(/No (investigation|challenge) attachments are saved/)).toHaveCount(0);
  await page.evaluate(()=>(window as any).mode='ok');
  await page.getByRole('button',{name:`Retry ${label.toLowerCase()}`}).click();
  await expect(page.getByText('Synthetic evidence.txt',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.some((x:any)=>/upload|create|save/i.test(x.kind)))).toBe(false);
});

for(const outcome of ['resolve','reject'])test(`old draft upload ${outcome} cannot refresh evidence after fresh draft dismissal`,async({page})=>{
  await setup(page,false,'ok','authoring');
  await expect(page.getByRole('heading',{name:'Edit Synthetic draft'})).toBeVisible();
  await expect(page.getByText('Synthetic evidence.txt',{exact:false})).toBeVisible();
  await page.evaluate(()=>(window as any).uploadHold=true);
  await page.getByLabel('Private challenge author asset').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic')});
  await page.getByRole('button',{name:'Upload for scanning',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).pending.length)).toBe(1);
  const reads=await page.evaluate(()=>(window as any).calls.filter((x:any)=>x.kind==='listChallengeAttachments').length);
  await page.getByRole('button',{name:'Start a fresh challenge'}).click();
  await page.evaluate(outcome=>{const p=(window as any).pending.shift();outcome==='resolve'?p.resolve({}):p.reject({status:503});},outcome);
  await expect(page.getByRole('heading',{name:'New challenge draft'})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Author asset stored privately and queued for malware scanning.')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).calls.filter((x:any)=>x.kind==='listChallengeAttachments').length)).toBe(reads);
});
