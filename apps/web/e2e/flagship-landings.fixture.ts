import { expect, test, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CORE_PRODUCTS, COMPANION_MODULE_PRICE_CENTS, DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS } from '@operatoros/sdk';

const WEB = 'http://127.0.0.1:5100';
const fixture = 'http://127.0.0.1:5101';
const screenshotDir = path.resolve('../../output/playwright/flagship-landings');
const lanes = [['trades','TradeFlowKit','tradeflowkit','$149'], ['msps','TechDeck','techdeck','$99'], ['healthcare-legal','PulseDesk','pulsedesk','$149']] as const;
const catalog = {billingInterval:'month', includedSeats:5, includedCompanionCount:1, coreProducts:CORE_PRODUCTS,
  companionModuleMonthlyPriceCents:COMPANION_MODULE_PRICE_CENTS, additionalSeatMonthlyPriceCents:DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
  stripeConfigured:{tradeflowkit:false,pulsedesk:false,techdeck:false,companionModule:false,additionalSeat:false}};
const setMode = async (request: APIRequestContext, mode: string) => {
  await request.post(`${fixture}/__test/catalog-mode?mode=${mode}`);
};
test.beforeEach(async ({request}) => { await fs.mkdir(screenshotDir, {recursive:true}); await setMode(request, 'ok'); });
test.afterEach(async ({request}) => { await setMode(request, 'ok'); });

test('server HTML contains authoritative prices before any client catalog request', async ({ browser }) => {
  // Inspect server data with JS disabled. The shared Next loading stream
  // needs JS to reveal the page; visible rendering is verified separately.
  const context = await browser.newContext({javaScriptEnabled:false, userAgent:'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'});
  const page = await context.newPage();
  for (const [slug,, ,price] of lanes) {
    await page.goto(`${WEB}/for/${slug}`);
    await expect(page.getByTestId('lane-price')).toContainText(price);
    await expect(page.getByTestId('lane-price-panel')).toContainText('5 team seats');
  }
  await page.goto(`${WEB}/pricing?product=techdeck`);
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$99/month');
  await expect(page.locator('main')).not.toContainText('Price unavailable');
  await context.close();
});

for (const width of [1440,390]) test(`flagships have one conversion destination, verified prices and campaign handoff at ${width}px`, async ({page}) => {
  test.setTimeout(120000);
  await fs.mkdir(screenshotDir, {recursive:true});
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [slug,product,key,price] of lanes) {
    await page.setViewportSize({width,height:width===390 ? 844 : 1000});
    await page.goto(`${WEB}/for/${slug}?utm_source=sales-kit&utm_campaign=oct5`);
    await expect(page.getByTestId('marketing-loading')).toBeHidden();
    await expect(page.getByTestId('lane-price')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByTestId('lane-price')).toContainText(price);
    await expect(page.getByTestId(`audience-page-${slug}`)).toContainText('ILLUSTRATIVE WORKDAY');
    const destinations = await page.locator('main a').filter({hasText:`Review ${product} pricing`}).evaluateAll(links => links.map(link => link.getAttribute('href')));
    expect(new Set(destinations).size).toBe(1);
    expect(destinations[0]).toContain(`product=${key}`);
    expect(destinations[0]).toContain('utm_campaign=oct5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:path.join(screenshotDir,`${key}-${width}.png`),fullPage:true});
    await page.getByTestId('lane-pricing-cta').click();
    await expect(page.getByTestId('stack-monthly-total')).toHaveText(`${price}/month`);
    await expect(page.locator('#build-stack').getByRole('button',{name:new RegExp(`^${product}`)})).toHaveAttribute('aria-pressed','true');
    const next = new URL((await page.getByTestId('stack-create-account-cta').getAttribute('href'))!, WEB).searchParams.get('next')!;
    expect(next).toContain(`product=${key}`);
    expect(next).toContain('utm_campaign=oct5');
    const footerSignIn = await page.getByTestId('marketing-footer').getByRole('link',{name:'Sign in',exact:true}).getAttribute('href');
    expect(new URL(footerSignIn!,WEB).searchParams.get('next')).toBe(next);
    if (width===1440) {
      const signInHref = await page.getByTestId('cta-sign-in').getAttribute('href');
      expect(new URL(signInHref!, WEB).searchParams.get('next')).toBe(next);
    }
    await page.getByTestId('stack-create-account-cta').click();
    await expect(page.getByRole('heading',{name:'Create your OperatorOS account'})).toBeVisible();
    expect(new URL(page.url()).searchParams.get('next')).toBe(next);
    await page.goBack();
    await expect(page.getByTestId('stack-monthly-total')).toHaveText(`${price}/month`);
    await page.goForward();
    await expect(page.getByRole('heading',{name:'Create your OperatorOS account'})).toBeVisible();
    await page.goBack();
    await page.getByTestId('stack-checkout-cta').click();
    await expect(page.getByTestId('button-login')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('next')).toBe(next);
  }
  expect(errors).toEqual([]);
});

for (const mode of ['failure','malformed']) test(`catalog ${mode} fails closed and retry restores correct prices`, async ({page,request}) => {
  await setMode(request,mode);
  await page.goto(`${WEB}/pricing?product=techdeck#build-stack`);
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('Price unavailable');
  await expect(page.locator('main').getByRole('alert')).toContainText('nothing can be charged');
  await expect(page.getByTestId('stack-checkout-cta')).toHaveText(/sign in to continue/i);
  await page.screenshot({path:path.join(screenshotDir,`pricing-${mode}.png`),fullPage:true});
  await setMode(request,'ok');
  await page.getByRole('button',{name:'Retry pricing'}).click();
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$99/month');
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('Secure provider checkout is not configured');
});

test('loading is distinct from unavailable and recovers without a purchase', async ({page,request}) => {
  await setMode(request,'failure');
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => {release = resolve;});
  await page.route('**/api/billing/catalog', async route => {await held; await route.fulfill({json:catalog});});
  await page.goto(`${WEB}/pricing#build-stack`,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('Loading pricing…');
  await expect(page.locator('main')).not.toContainText('Price unavailable');
  await expect(page.getByTestId('marketing-loading')).toBeHidden();
  await page.screenshot({path:path.join(screenshotDir,'pricing-loading.png'),fullPage:true});
  release();
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$149/month');
  await page.screenshot({path:path.join(screenshotDir,'pricing-loaded.png'),fullPage:true});
});

test('landing pricing has recoverable failure and no invented offer', async ({page,request}) => {
  await setMode(request,'failure');
  await page.goto(`${WEB}/for/healthcare-legal`);
  await expect(page.getByTestId('lane-price')).toHaveText('Pricing unavailable');
  await setMode(request,'ok');
  await page.getByRole('button',{name:'Retry pricing'}).click();
  await expect(page.getByTestId('lane-price')).toHaveText('$149 / month');
});

// These are local UI authority fixtures, not authenticated provider acceptance.
for (const scenario of ['owner-unconfigured','administrator','existing-flagship']) test(`displayed prices do not bypass ${scenario} checkout restrictions`, async ({page}) => {
  let checkoutRequests = 0;
  page.on('request', request => {if (request.method()==='POST' && request.url().includes('/billing/stack/checkout')) checkoutRequests++;});
  await page.route('**/api/auth/me', route => route.fulfill({json:{user:{id:'fixture-user',name:'Fixture operator',email:'operator@example.test',currentTenantId:'fixture-org'}}}));
  await page.route('**/api/me/tenants', route => route.fulfill({json:{current:'fixture-org',tenants:[{id:'fixture-org',role:scenario==='administrator' ? 'admin' : 'owner'}]}}));
  await page.route('**/api/billing/stack', route => route.fulfill({json:{applicationSubscription:scenario==='existing-flagship' ? {coreProduct:'techdeck',status:'active'} : null,entitlements:[]}}));
  await page.goto(`${WEB}/pricing?product=techdeck#build-stack`);
  await expect(page.getByTestId('stack-monthly-total')).toHaveText('$99/month');
  const expected = scenario==='owner-unconfigured' ? 'Secure provider checkout is not configured'
    : scenario==='administrator' ? 'only the organization owner can start checkout' : 'already has its one flagship application';
  await expect(page.locator('main')).toContainText(expected);
  await expect(page.getByTestId('stack-checkout-cta')).toBeDisabled();
  expect(checkoutRequests).toBe(0);
});
