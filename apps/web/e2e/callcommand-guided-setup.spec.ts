import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { establishParitySession } from './parity-auth';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = process.env.E2E_PRODUCTION_HOSTS === '1' ? 'https://127.0.0.1' : 'http://127.0.0.1:5000';
const artifacts = resolve(process.cwd(),'../../output/callcommand-investigation');
test.use({video:'off'});
for (const width of [1440,390]) test(`guided setup saves real business configuration and handles unavailable service at ${width}px`, async ({page}) => {
  test.setTimeout(120000); await establishParitySession(page.request); await page.setViewportSize({width,height:950});
  await page.goto(`${WEB}/modules/callcommand-ai/setup`);
  const wizard=page.getByTestId('callcommand-guided-setup'); await expect(wizard).toBeVisible();
  await expect(wizard.getByRole('heading',{name:'A receptionist, ready in three steps.'})).toBeVisible();
  await wizard.getByLabel('Business name',{exact:true}).fill('Synthetic Harbor Services');
  await wizard.getByLabel('What should callers know?',{exact:true}).fill('We handle property maintenance. Open weekdays 9 to 5. Take a message for appointments.');
  await wizard.getByRole('button',{name:'Save and choose a number'}).click();
  await expect(wizard.getByRole('heading',{name:'2. Choose your business number'})).toBeVisible();
  await expect(wizard).toContainText('Your first local number is included');
  await expect(wizard).toContainText('$5.00/month each');
  mkdirSync(artifacts,{recursive:true}); await wizard.screenshot({path:resolve(artifacts,`guided-number-pricing-${width}.png`)});
  await wizard.getByLabel('Preferred area code').fill('910'); await wizard.getByRole('button',{name:'Find numbers'}).click();
  await expect(wizard.getByRole('alert')).toBeVisible();
  await page.reload(); await expect(wizard.getByLabel('Business name',{exact:true})).toHaveValue('Synthetic Harbor Services');
  await expect(wizard.getByRole('textbox',{name:'What should callers know?',exact:true})).toHaveValue(/property maintenance/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const axe=await new AxeBuilder({page}).include('[data-testid="callcommand-guided-setup"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); expect(axe.violations).toEqual([]);
  mkdirSync(artifacts,{recursive:true}); await page.screenshot({path:resolve(artifacts,`guided-setup-${width}.png`),fullPage:true});
});

test('synthetic billing return restores the selected number, waits for settlement, and enables answering in step three', async ({page}) => {
  test.setTimeout(120000); await establishParitySession(page.request);
  const profileId='11111111-1111-4111-8111-111111111111',flowId='22222222-2222-4222-8222-222222222222',channelId='33333333-3333-4333-8333-333333333333';
  let order: any=null, paid=false, enabled=false, saved=false, continueCount=0;
  const requests: any[]=[];
  const number={id:channelId,phoneE164:'+19105550777',dialNumber:'+19105550777',phoneMasked:'***0777',status:'active',productMode:'general',profileId,activeFlowId:flowId,acquisitionMode:'platform_provisioned',numberType:'local',lifecycleState:'ACTIVE',billingStatus:'active',providerReady:true,providerNumberStatus:'active',providerVerifiedAt:new Date().toISOString(),healthStatus:'healthy',healthCheckedAt:new Date().toISOString()};
  await page.route('**/api/modules/callcommand-ai/product/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let value: any={};
    if(path.endsWith('/commercial/setup')) value={order};
    else if(path.endsWith('/commercial/workspace')) value={capabilities:{canWrite:true,canAdmin:true},numbers:paid?[number]:[],numberBilling:{activeLocalNumbers:0},runtime:{realtimeEnabled:enabled},readiness:{realtimeConfigured:true},pricing:{managedNumbers:{includedLocalNumbers:0,additionalLocalMonthlyCents:500,tollFreeMonthlyCents:800}},provider:{},capacity:{}};
    else if(path.endsWith('/product/workspace')) value={channels:paid?[number]:[],profiles:saved?[{id:profileId,productMode:'general',status:'active',name:'Synthetic Receptionist'}]:[],flows:saved?[{id:flowId,productMode:'general',status:'active'}]:[],targets:[],rules:[],calls:[],tickets:[],leads:[],tasks:[],sessions:[],actionRuns:[],analytics:{},usage:[],providers:{}};
    else if(path.endsWith('/setup/receptionist')) {saved=true;value={profileId,flowId};}
    else if(path.endsWith('/numbers/search')) value={numbers:[number]};
    else if(path.endsWith('/setup/orders')) {requests.push(route.request().postDataJSON());order={id:'44444444-4444-4444-8444-444444444444',phone:number.phoneE164,profileId,flowId,status:'awaiting_payment',monthlyAmountCents:500};value={orderId:order.id};}
    else if(path.endsWith('/continue')) {continueCount++; if(paid)order={...order,status:'ready',channelId};value={state:paid?'ready':'awaiting_payment',channelId:paid?channelId:null};}
    else if(path.endsWith('/runtime-settings')) {enabled=route.request().postDataJSON().realtimeEnabled===true;value={runtime:{realtimeEnabled:enabled}};}
    else return route.fallback();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.goto(`${WEB}/modules/callcommand-ai/setup`);const wizard=page.getByTestId('callcommand-guided-setup');
  await wizard.getByLabel('Business name',{exact:true}).fill('Synthetic Test Business');await wizard.getByLabel('What should callers know?',{exact:true}).fill('Take messages for our team.');
  await wizard.getByRole('button',{name:'Save and choose a number'}).click();await wizard.getByRole('button',{name:'Find numbers'}).click();
  await wizard.getByRole('button',{name:'Choose this number'}).click();await wizard.getByRole('checkbox').check();await wizard.getByRole('button',{name:'Continue to secure billing'}).click();
  await expect(wizard).toContainText('Waiting for payment confirmation');await page.reload();await expect(wizard).toContainText(number.phoneE164);
  await expect(wizard.getByRole('button',{name:'Turn on my receptionist'})).toHaveCount(0);paid=true;
  await expect(wizard.getByRole('button',{name:'Turn on my receptionist'})).toBeVisible({timeout:20000});
  await wizard.getByRole('button',{name:'Turn on my receptionist'}).click();await expect(wizard.getByRole('link',{name:'Call your receptionist'})).toHaveAttribute('href',`tel:${number.phoneE164}`);
  expect(requests).toHaveLength(1);expect(requests[0].monthlyAmountCents).toBe(500);expect(continueCount).toBeGreaterThanOrEqual(2);
  mkdirSync(artifacts,{recursive:true}); await wizard.screenshot({path:resolve(artifacts,'guided-activation-synthetic.png')});
});
