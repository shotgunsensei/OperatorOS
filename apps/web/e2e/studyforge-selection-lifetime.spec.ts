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
    import '@fontsource-variable/inter/wght.css';
    import '@fontsource-variable/open-sans/wght.css';
    Object.assign(document.body.style,{margin:'0',fontFamily:brand.fontBody,background:brand.bgPrimary,color:brand.textPrimary});
    const theme=document.createElement('style');theme.textContent=':root{'+brandCssVariables+'}';document.head.append(theme);
    import Workspace from ${JSON.stringify(resolve(process.env.OPERATOROS_TEST_WORKSPACE_ROOT ?? root,'apps/web/src/components/module-shells/StudyForgeCompleteWorkspace'))};
    window.root=createRoot(document.getElementById('root'));
    window.renderFixture=()=>window.root.render(window.hidden?null:<Workspace {...window.props}/>);
  `},bundle:true,write:false,loader:{'.woff2':'dataurl','.woff':'dataurl'},outfile:'fixture.js',platform:'browser',format:'iife',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},nodePaths:[resolve(assets,'apps/web/node_modules'),resolve(assets,'node_modules')],
  alias:{react:dirname(require.resolve('react')),'react-dom':dirname(require.resolve('react-dom'))},
  plugins:[{name:'synthetic-boundaries',setup(plugin){
    plugin.onResolve({filter:/AuthProvider$|TenantProvider$|^@\/lib\/auth$|^next\/link$/},args=>({path:args.path,namespace:'fixture'}));
    plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',contents:
      args.path.endsWith('AuthProvider')?'export const useAuth=()=>({user:window.user,loading:false});':
      args.path.endsWith('TenantProvider')?'export const useTenant=()=>({activeTenant:{id:window.tenant}});':
      args.path==='next/link'?'import React from "react";export default props=><a {...props}/>;':
      'export const getActiveTenantId=()=>window.tenant; export const moduleShellApi={studyforge:new Proxy({},{get:(_,kind)=>(...args)=>window.api(kind,args)})};'
    }));
  }}]});
  script=result.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
  css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
});
async function setup(page:Page){
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*',route=>route.request().url()==='https://fixture.invalid/'?route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}):route.abort());
  await page.goto('https://fixture.invalid/');
  await page.evaluate(({A,B})=>{
    const w=window as any;w.user={id:'actor-a'};w.tenant='tenant-a';w.props={view:'sets',routePath:'',canWrite:true};w.hidden=false;w.pending=[];w.calls=[];w.mode='ok';w.holdMutation=false;
    w.set=(id:string,title?:string)=>({id,title:title??(id===A?'Alpha':'Beta'),status:'active',summary:'Synthetic saved learning records',difficulty:'medium',qualityScore:80,version:1,cards:[],questions:[],shortAnswers:[],studyPlan:[],attempts:[]});
    w.workspace={preferences:{defaultDifficulty:'medium'},plan:{plan:'free',limits:{},source:'synthetic'},usage:{generationCount:0,quizAttemptCount:0},metrics:{activeSets:2,totalStudyMinutes:0,cardsReviewed:0,averageQuizScore:null,currentStreak:0,longestStreak:0},folders:[],sets:[w.set(A),w.set(B)],countdowns:[],activity:[],quizTrend:[]};
    w.api=(kind:string,args:any[])=>{
      w.calls.push({kind,args});
      if(kind==='completeWorkspace')return Promise.resolve(w.workspace);
      if(kind==='completeSet')return w.mode==='hold'?new Promise((resolve,reject)=>w.pending.push({kind,id:args[0],resolve,reject})):Promise.resolve(w.set(args[0]));
      if(kind==='updateCompleteSet')return w.holdMutation?new Promise((resolve,reject)=>w.pending.push({kind,id:args[0],resolve,reject})):Promise.resolve({});
      return Promise.reject(new Error('Unexpected synthetic API '+kind));
    };
  },{A,B});
  await page.addStyleTag({content:css});await page.addScriptTag({content:script});expect(errors).toEqual([]);await page.evaluate(()=>(window as any).renderFixture());
  await expect(page.getByRole('heading',{name:'Folders and study sets'})).toBeVisible();
}
async function route(page:Page,id:string){await page.evaluate(id=>{const w=window as any;w.props={...w.props,routePath:id?'/sets/'+id:'/sets'};w.renderFixture();},id);}
async function hold(page:Page){await page.evaluate(()=>(window as any).mode='hold');}
async function settle(page:Page,id:string,outcome:string,title='OLD'){
  await page.evaluate(async ({id,outcome,title})=>{const w=window as any;const index=w.pending.findIndex((p:any)=>p.id===id);const p=w.pending.splice(index,1)[0];if(!p)throw Error('Missing deferred read');outcome==='resolve'?p.resolve(w.set(id,title)):p.reject(new Error('old request error'));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));},{id,outcome,title});
}
async function pending(page:Page,count:number){await expect.poll(()=>page.evaluate(()=>(window as any).pending.length)).toBe(count);}
for(const outcome of ['resolve','reject'])test(`newer open B wins over stale A ${outcome}`,async({page})=>{
  await setup(page);await hold(page);await route(page,A);await pending(page,1);await route(page,B);await pending(page,2);
  await settle(page,B,'resolve','Current Beta');await expect(page.locator('#studyforge-set-workspace')).toContainText('Current Beta');
  await settle(page,A,outcome);await expect(page.locator('#studyforge-set-workspace')).toContainText('Current Beta');await expect(page.getByRole('alert')).toHaveCount(0);
});
for(const outcome of ['resolve','reject'])test(`Library dismissal ignores pending open ${outcome}`,async({page})=>{
  await setup(page);await page.getByRole('button',{name:/Alpha active/}).click();await expect(page.locator('#studyforge-set-workspace')).toBeVisible();
  await hold(page);await route(page,B);await pending(page,1);await page.getByRole('button',{name:'Library',exact:true}).click();
  await settle(page,B,outcome);await expect(page.locator('#studyforge-set-workspace')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Alpha active/})).toBeEnabled();
});
for(const change of ['route','actor','tenant','unmount'])for(const outcome of ['resolve','reject'])test(`${change} invalidates pending selection ${outcome}`,async({page})=>{
  await setup(page);await hold(page);await route(page,A);await pending(page,1);
  await page.evaluate(change=>{const w=window as any;w.mode='ok';if(change==='route')w.props={...w.props,routePath:'/sets'};if(change==='actor'){w.user={id:'actor-b'};w.props={...w.props,routePath:'/sets'};}if(change==='tenant'){w.tenant='tenant-b';w.props={...w.props,routePath:'/sets'};}if(change==='unmount')w.hidden=true;w.renderFixture();},change);
  await settle(page,A,outcome);await expect(page.locator('#studyforge-set-workspace')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
});
for(const outcome of ['resolve','reject'])test(`actor change on the same deep link rejects old ${outcome}`,async({page})=>{
  await setup(page);await hold(page);await route(page,A);await pending(page,1);
  await page.evaluate(()=>{const w=window as any;w.mode='ok';w.user={id:'actor-b'};w.renderFixture();});
  await expect(page.locator('#studyforge-set-workspace')).toContainText('Alpha');
  await settle(page,A,outcome);await expect(page.locator('#studyforge-set-workspace')).toContainText('Alpha');await expect(page.getByText('OLD',{exact:true})).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('closing a pending mutation does not unlock another write or reopen selection',async({page})=>{
  await setup(page);await page.getByRole('button',{name:/Alpha active/}).click();
  await page.evaluate(()=>(window as any).holdMutation=true);
  await page.getByRole('button',{name:'Archive',exact:true}).click();await pending(page,1);
  await page.getByRole('button',{name:'Library',exact:true}).click();
  await expect(page.getByRole('button',{name:/Beta active/})).toBeDisabled();
  await page.evaluate(()=>{const w=window as any;w.pending.shift().resolve({});});
  await expect(page.getByRole('button',{name:/Beta active/})).toBeEnabled();await expect(page.locator('#studyforge-set-workspace')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).calls.filter((x:any)=>x.kind==='completeSet').length)).toBe(1);
});
test('Library dismissal fences an already pending action refresh',async({page})=>{
  await setup(page);await page.getByRole('button',{name:/Alpha active/}).click();await hold(page);
  await page.getByRole('button',{name:'Archive',exact:true}).click();await pending(page,1);
  await page.getByRole('button',{name:'Library',exact:true}).click();await settle(page,A,'resolve');
  await expect(page.locator('#studyforge-set-workspace')).toHaveCount(0);
});
test('current read failure remains visible and can be retried',async({page})=>{
  await setup(page);await hold(page);await route(page,A);await pending(page,1);await settle(page,A,'reject');
  await expect(page.getByRole('alert')).toContainText('old request error');
  await page.evaluate(()=>(window as any).mode='ok');await page.getByRole('button',{name:/Alpha active/}).click();
  await expect(page.locator('#studyforge-set-workspace')).toContainText('Alpha');await expect(page.getByRole('alert')).toHaveCount(0);
});
for(const width of [390,1440])test(`selected set and Library control ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);await page.getByRole('button',{name:/Alpha active/}).click();
  const library=page.getByRole('button',{name:'Library',exact:true});await library.focus();await expect(library).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.locator('#studyforge-set-workspace').screenshot({path:resolve(process.env.OPERATOROS_TEST_EVIDENCE_ROOT??root,`studyforge-selection-${width}.png`)});
  await hold(page);await route(page,B);await pending(page,1);await settle(page,B,'reject');
  await page.getByRole('alert').screenshot({path:resolve(process.env.OPERATOROS_TEST_EVIDENCE_ROOT??root,`studyforge-stale-cue-${width}.png`)});
  await library.press('Enter');await expect(page.locator('#studyforge-set-workspace')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).calls.every((x:any)=>['completeWorkspace','completeSet'].includes(x.kind)))).toBe(true);
});



test('failed newer set clearly identifies the unchanged prior selection',async({page})=>{
  await setup(page);await page.getByRole('button',{name:/Alpha active/}).click();await hold(page);await route(page,B);await pending(page,1);
  await expect(page.getByRole('status')).toContainText('previously opened set, Alpha');
  await expect(page.getByRole('button',{name:'Archive',exact:true})).toBeDisabled();
  await settle(page,B,'reject');
  await expect(page.getByRole('alert')).toContainText('The requested set was not opened. Still viewing the previously opened set: Alpha.');
  await expect(page.locator('#studyforge-set-workspace').getByRole('heading',{name:'Alpha',exact:true})).toBeVisible();
  await expect(page.locator('#studyforge-set-workspace').getByRole('heading',{name:'Beta',exact:true})).toHaveCount(0);
});
