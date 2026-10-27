import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { IDS, buildCustomerWorkspaceFixture, mountCustomerWorkspace, chooseJob, reviewJob } from './customer-workspace-render-fixture';

const errors=new WeakMap<object,string[]>();
test.beforeAll(buildCustomerWorkspaceFixture);
test.beforeEach(async({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});

test('free/member shell discovers Customer Workspace without changing Lunch Break or granting Directory access',async({page})=>{
 const state=await mountCustomerWorkspace(page,{start:'home',role:'member'});
 await page.getByTestId('nav-customer-workspace').click();
 await expect(page.getByRole('heading',{name:'Customer Workspace',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/page=customer-workspace/);
 await expect(page.getByTestId('nav-lunch-break')).toHaveAttribute('href','/lunch-break');
 await expect.poll(()=>state.requests.filter(x=>x.path==='/api/customer-workspace/customers').length).toBe(1);
 expect(state.requests.find(x=>x.path==='/api/customer-workspace/customers')?.tenant).toBe(IDS.tenant);
 expect(state.requests.filter(x=>x.method==='POST')).toHaveLength(0);
});

test('contact/site filters and existing-job selection produce qualified history and support back/forward',async({page})=>{
 const state=await mountCustomerWorkspace(page);await chooseJob(page);
 await page.getByLabel('Contact',{exact:true}).selectOption(IDS.contact);
 await expect(page.getByLabel('Existing job',{exact:true})).toHaveValue('');
 await page.getByLabel('Site',{exact:true}).selectOption(IDS.site);
 await page.getByLabel('Existing job',{exact:true}).selectOption(IDS.job);
 await expect(page).toHaveURL(new RegExp(`cwContact=${IDS.contact}.*cwJob=${IDS.job}`));
 const href=page.url();expect(href).not.toContain('Synthetic');expect(href).not.toContain('coordinator');
 await page.goBack();await expect(page.getByLabel('Existing job',{exact:true})).toHaveValue('');
 await page.goForward();await expect(page.getByLabel('Existing job',{exact:true})).toHaveValue(IDS.job);
 await page.getByLabel('Search business names',{exact:true}).fill('Synthetic Northstar');
 await expect.poll(()=>state.requests.some(x=>x.path==='/api/customer-workspace/customers'&&x.search.includes('search=Synthetic+Northstar'))).toBe(true);
 expect(page.url()).not.toContain('Northstar');
});

test('reviewed handoff submits server context exactly once and queued stays pending until completed delivery',async({page})=>{
 const state=await mountCustomerWorkspace(page,{holdPost:true,holdRun:true});await reviewJob(page);
 const create=page.getByRole('button',{name:'Create field-proof draft',exact:true});
 await create.evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
 await expect.poll(()=>state.pendingPosts.length).toBe(1);
 expect(state.requests.filter(x=>x.method==='POST')).toHaveLength(1);
 const body=state.requests.find(x=>x.method==='POST')!.body;
 expect(body).toEqual({jobId:IDS.job,expectedSourceVersion:7,directoryContext:{organizationId:IDS.customer,siteId:IDS.site,contactId:IDS.contact,revision:'a'.repeat(64)},idempotencyKey:expect.stringMatching(/^workspace-proof:/)});
 expect(JSON.stringify(body)).not.toMatch(/Synthetic|Coordinator|example\.invalid/);
 state.pendingPosts.shift()!();await expect.poll(()=>state.pendingRuns.length).toBe(1);
 await expect(page.getByText('Handoff queued',{exact:true})).toBeVisible();
 await expect(page.getByText('Field-proof drafts ready',{exact:true})).toHaveCount(0);
 state.pendingRuns.shift()!();
 await expect(page.getByText('Field-proof drafts ready',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open field job',exact:true})).toHaveAttribute('href',`/modules/snapproofos/jobs/${IDS.fieldJob}`);
 await expect(page.getByRole('link',{name:'Open draft report',exact:true})).toHaveAttribute('href',`/modules/snapproofos/reports/${IDS.report}`);
});

test('read-only and destination-readiness responses permit inspection but never expose a create action',async({page})=>{
 for(const settings of [{readOnly:true},{actionAllowed:false}]){
  const state=await mountCustomerWorkspace(page,settings);await chooseJob(page);
  await expect(page.getByRole('button',{name:'Review field-proof handoff',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Create field-proof draft',exact:true})).toHaveCount(0);
  expect(state.requests.filter(x=>x.method==='POST')).toHaveLength(0);
 }
});

test('Directory403 is an honest access state with no customer data or invented purchase gate',async({page})=>{
 await mountCustomerWorkspace(page,{listDenied:403});
 await expect(page.getByRole('alert')).toContainText('existing TradeFlowKit Directory access');
 await expect(page.getByText('Synthetic Northstar Client',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Review field-proof handoff',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/purchase|subscribe|upgrade/i})).toHaveCount(0);
});

test('empty customer/job states and corrupt saved job links remain truthful and non-actionable',async({page})=>{
 await mountCustomerWorkspace(page,{empty:true});await expect(page.getByText('No customers available yet',{exact:true})).toBeVisible();
 await mountCustomerWorkspace(page,{noJobs:true});await page.getByRole('button',{name:/Synthetic Northstar Client/}).click();await expect(page.getByText('No linked jobs in this view',{exact:true})).toBeVisible();
 await mountCustomerWorkspace(page,{corruptJob:true});await chooseJob(page);await expect(page.getByText(/saved customer links need review/)).toBeVisible();await expect(page.getByRole('button',{name:'Review field-proof handoff',exact:true})).toHaveCount(0);
});

test('qualified stale selections and mismatched server echo cannot select an actionable record',async({page})=>{
 const selected=`?page=customer-workspace&cwTenant=${IDS.tenant}&cwCustomer=${IDS.customer}&cwJob=${IDS.otherJob}`;
 await mountCustomerWorkspace(page,{search:selected});await expect(page.getByText('The saved job is not in the current authorized list. Choose an available job.',{exact:true})).toBeVisible();await expect(page.getByLabel('Existing job',{exact:true})).toHaveValue('');
 await mountCustomerWorkspace(page,{search:selected,mismatchEcho:true});await expect(page.getByRole('alert')).toContainText('no longer available');await expect(page.getByRole('heading',{name:'Prepare field proof',exact:true})).toHaveCount(0);
});

test('a URL from another tenant is discarded instead of switching authority or querying its customer',async({page})=>{
 const state=await mountCustomerWorkspace(page,{search:`?page=customer-workspace&cwTenant=${IDS.otherTenant}&cwCustomer=${IDS.customer}`});
 await expect(page.getByText(/saved selection does not match/)).toBeVisible();
 await expect.poll(()=>state.requests.some(x=>x.path==='/api/customer-workspace/customers')).toBe(true);
 expect(state.requests.filter(x=>x.path.includes('/customer-workspace/customers/'))).toHaveLength(0);
 expect(state.requests.filter(x=>x.path.startsWith('/api/customer-workspace')).every(x=>x.tenant===IDS.tenant)).toBe(true);
});

test('completed run without completed delivery or a verified link never claims ready',async({page})=>{
 for(const settings of [{delivery:'pending'},{unsafeLinks:true}]){
  const state=await mountCustomerWorkspace(page,settings);await reviewJob(page);await page.getByRole('button',{name:'Create field-proof draft',exact:true}).click();
  await expect.poll(()=>state.requests.some(x=>x.path.includes('/data-fabric/runs/'))).toBe(true);
  await expect(page.getByText('Field-proof drafts ready',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Open draft report',exact:true})).toHaveCount(0);
 }
});

test('partial delivery and synchronous/asynchronous ambiguous customer matching are distinct from success',async({page})=>{
 await mountCustomerWorkspace(page,{runStatus:'partial'});await reviewJob(page);await page.getByRole('button',{name:'Create field-proof draft',exact:true}).click();await expect(page.getByText('Some draft items were prepared',{exact:true})).toBeVisible();await expect(page.getByText('Field-proof drafts ready',{exact:true})).toHaveCount(0);
 for(const settings of [{postCode:'FABRIC_CUSTOMER_LINK_AMBIGUOUS'},{runStatus:'dead_letter',delivery:'dead_letter',runError:'FABRIC_CUSTOMER_LINK_AMBIGUOUS'}]){
  await mountCustomerWorkspace(page,settings);await reviewJob(page);await page.getByRole('button',{name:'Create field-proof draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('More than one SnapProof customer');await expect(page.getByRole('button',{name:'Check or retry this handoff',exact:true})).toHaveCount(0);
 }
});

test('unknown mutation outcome retries the same intent key instead of a new request',async({page})=>{
 const state=await mountCustomerWorkspace(page,{postFailOnce:true});await reviewJob(page);await page.getByRole('button',{name:'Create field-proof draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('could not be confirmed');
 await expect(page.getByRole('button',{name:'Reload customer details',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Check or retry this handoff',exact:true}).click();await expect(page.getByText('Field-proof drafts ready',{exact:true})).toBeVisible();
 const posts=state.requests.filter(x=>x.method==='POST');expect(posts).toHaveLength(2);expect(posts[0].body.idempotencyKey).toBe(posts[1].body.idempotencyKey);
});

test('late detail after same-ID identity replacement cannot restore the previous customer snapshot',async({page})=>{
 const state=await mountCustomerWorkspace(page,{holdDetail:true});await page.getByRole('button',{name:/Synthetic Northstar Client/}).click();await expect.poll(()=>state.pendingDetails.length).toBe(1);
 state.holdDetail=false;state.name='Synthetic Fresh Customer';
 await page.evaluate(()=>{const f=(window as any).fixture;f.user={...f.user};f.epoch++;f.notify();});
 await expect(page.getByRole('heading',{name:'Synthetic Fresh Customer',exact:true})).toBeVisible();state.pendingDetails.shift()!();
 await expect(page.getByRole('heading',{name:'Synthetic Northstar Client',exact:true})).toHaveCount(0);
});

test('tenant-only change with unchanged user fences late mutation and does not poll or expose old result',async({page})=>{
 const state=await mountCustomerWorkspace(page,{holdPost:true});await reviewJob(page);await page.getByRole('button',{name:'Create field-proof draft',exact:true}).click();await expect.poll(()=>state.pendingPosts.length).toBe(1);
 await page.evaluate(ids=>{const f=(window as any).fixture;f.tenant={id:ids.otherTenant,name:'Synthetic South Services',role:'owner'};f.notify();},IDS);
 await expect(page.getByRole('button',{name:/Synthetic South Client/})).toBeVisible();state.pendingPosts.shift()!();
 await expect(page.getByText('Field-proof drafts ready',{exact:true})).toHaveCount(0);
 expect(state.requests.filter(x=>x.path.includes('/data-fabric/runs/'))).toHaveLength(0);
});

test('a valid saved job contact outside the bounded contact list is not falsely treated as missing',async({page})=>{
 const state=await mountCustomerWorkspace(page,{absentContact:true});await reviewJob(page);await expect(page.getByText('Uses the job’s saved contact · details outside this view',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create field-proof draft',exact:true}).click();await expect(page.getByText('Field-proof drafts ready',{exact:true})).toBeVisible();expect(state.requests.find(x=>x.method==='POST')?.body.directoryContext.contactId).toBe(IDS.contact);
});

test('actual responsive workspace, keyboard selection and reviewed handoff fit320/390/desktop',async({page})=>{
 const output=resolve(import.meta.dirname,'../../../../output/playwright/customer-workspace-oct27');mkdirSync(output,{recursive:true});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width<500?844:1000});await mountCustomerWorkspace(page);
  const customer=page.getByRole('button',{name:/Synthetic Northstar Client/});await customer.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Synthetic Northstar Client',exact:true})).toBeVisible();
  if(width<850){await expect(page.getByRole('heading',{name:'Synthetic Northstar Client',exact:true})).toBeFocused();await expect(page.getByRole('heading',{name:'Synthetic Northstar Client',exact:true})).toBeInViewport();}
  await page.screenshot({path:resolve(output,`after-context-${width}.png`),animations:'disabled'});
  await page.getByLabel('Existing job',{exact:true}).selectOption(IDS.job);await page.getByRole('button',{name:'Review field-proof handoff',exact:true}).click();
  const action=page.getByRole('button',{name:'Create field-proof draft',exact:true});await action.scrollIntoViewIfNeeded();await action.focus();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBe(0);
  const bounds=await action.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);expect(bounds!.width).toBeGreaterThan(120);
  await page.screenshot({path:resolve(output,`after-review-${width}.png`),animations:'disabled'});
  await page.getByRole('button',{name:'Change customer',exact:true}).click();await expect(page.getByLabel('Search business names',{exact:true})).toBeFocused();await expect(page.getByLabel('Search business names',{exact:true})).toBeInViewport();
 }
});


test('same job version with a different prior handoff fingerprint requires reconciliation, not a fresh-key promise',async({page})=>{
 await mountCustomerWorkspace(page,{revision:'b'.repeat(64),postCode:'FABRIC_IDEMPOTENCY_CONFLICT'});await reviewJob(page);await page.getByRole('button',{name:'Create field-proof draft',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('already exists for this job version');
 await expect(page.getByRole('alert')).toContainText('reconcile its existing handoff');
 await expect(page.getByRole('button',{name:'Check or retry this handoff',exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Open original job',exact:true})).toHaveAttribute('href',`/modules/tradeflowkit/jobs/${IDS.job}`);
});

test('changed customer or source requires reviewed context instead of retrying the stale body',async({page})=>{
 for(const postCode of ['CUSTOMER_CONTEXT_CHANGED','FABRIC_SOURCE_VERSION_CHANGED']){
  const state=await mountCustomerWorkspace(page,{postCode});await reviewJob(page);await page.getByRole('button',{name:'Create field-proof draft',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Reload and review the current selection');
  await expect(page.getByRole('alert')).toContainText('reconcile that handoff before requesting another');
  await expect(page.getByRole('button',{name:'Check or retry this handoff',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Open original job',exact:true})).toHaveAttribute('href',`/modules/tradeflowkit/jobs/${IDS.job}`);
  expect(state.requests.filter(x=>x.method==='POST')).toHaveLength(1);
 }
});
