import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const PASSWORD = 'Phase51-Routes-Disposable-9!';

type Product = { slug: string; host: string; shell: string; routes: string[]; axe: string[]; entry?: string };
const products: Product[] = [
  { slug:'brandforgeos',host:'https://brandforgeos.operatoros.net',shell:'brandforgeos-module-shell',routes:['/','/brands','/campaigns','/content','/calendar','/approvals','/ai-workflows','/analytics','/reports','/integrations','/settings'],axe:['/','/content','/settings'] },
  { slug:'studyforge-ai',host:'https://studyforge-ai.operatoros.net',shell:'studyforge-module-shell',routes:['/','/sources','/sets','/flashcards','/quizzes','/sessions','/studio','/progress','/settings'],axe:['/','/sets','/progress'] },
  { slug:'ninja-launch-kit',host:'https://deployops.operatoros.net',shell:'launchkit-module-shell',entry:'/dashboard',routes:['/dashboard','/projects','/templates','/brief','/deliverables','/review','/exports','/settings'],axe:['/dashboard','/templates','/review'] },
  { slug:'ninjamation',host:'https://scriptops.operatoros.net',shell:'ninjamation-module-shell',entry:'/library',routes:['/dashboard','/library','/sources','/generate','/review','/runs','/versions','/settings'],axe:['/dashboard','/library','/settings'] },
  { slug:'ninja-pool-hall',host:'https://operatorpoolhall.operatoros.net',shell:'ninja-pool-hall-module-shell',routes:['/','/practice','/cpu','/local','/online','/history','/profile','/settings'],axe:['/','/practice','/settings'] },
];

async function establish(page: Page, product: Product) {
  const databaseUrl = process.env.DATABASE_URL; if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const email = `phase51-${product.slug}-${Date.now()}-${Math.random().toString(36).slice(2,7)}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, { headers:{host:'auth.operatoros.net','x-forwarded-host':'auth.operatoros.net','x-forwarded-proto':'https','x-forwarded-for':`10.96.0.${20+Math.floor(Math.random()*180)}`}, data:{email,password:PASSWORD,name:`Phase 51 ${product.slug}`} });
  expect(registration.status(), await registration.text()).toBe(202);
  const pg = new Client({connectionString:databaseUrl}); await pg.connect();
  try { const identity=await pg.query<{user_id:string;tenant_id:string}>('select id user_id,current_tenant_id tenant_id from users where email=$1 limit 1',[email]); const elite=await pg.query<{id:string}>("select id from subscription_plans where slug='elite' and is_active=true limit 1"); expect(identity.rows).toHaveLength(1);expect(elite.rows).toHaveLength(1);await pg.query("insert into subscriptions (user_id,plan_id,status,current_period_start,current_period_end,tenant_id,scope_type) values ($1,$2,'active',now(),now()+interval '30 days',$3,'tenant')",[identity.rows[0].user_id,elite.rows[0].id,identity.rows[0].tenant_id]);await pg.query("insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members) select $1,id,'enabled','included',true from modules where slug=$2 on conflict (tenant_id,module_id) do update set status='enabled',allow_all_members=true",[identity.rows[0].tenant_id,product.slug]); } finally { await pg.end(); }
  await page.setExtraHTTPHeaders({'x-forwarded-for':`10.97.0.${20+Math.floor(Math.random()*180)}`});
  await page.goto(`${product.host}${product.entry??''}`); await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/u);await page.getByTestId('input-email').fill(email);await page.getByTestId('input-password').fill(PASSWORD);await Promise.all([page.waitForURL(new RegExp(`^${product.host.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}${(product.entry??'/').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:[?#].*)?$`),{timeout:30_000}),page.getByTestId('button-login').click()]);await expect(page.getByTestId(product.shell)).toBeVisible({timeout:30_000});
}

async function noOverflow(page:Page,path:string){const amount=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);expect(amount,`${path} horizontal overflow`).toBeLessThanOrEqual(1)}

for (const product of products) test(`${product.slug} owns stable major routes, history, responsive layout, and accessibility`,async({page})=>{
  test.setTimeout(300_000);const consoleErrors:string[]=[];const serverErrors:string[]=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('response',r=>{if(r.status()>=500)serverErrors.push(`${r.status()} ${r.url()}`)});await establish(page,product);consoleErrors.length=0;serverErrors.length=0;await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
  for(const path of product.routes){const response=await page.goto(`${product.host}${path}`,{waitUntil:'networkidle'});expect(response?.status(),`${product.slug}${path}`).toBeLessThan(400);await expect(page.getByTestId(product.shell)).toBeVisible();await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/iu);await noOverflow(page,path)}
  expect(page.context().pages(),`${product.slug} ordinary navigation stays in one tab`).toHaveLength(1);
  await page.goBack();await expect(page).not.toHaveURL(`${product.host}${product.routes.at(-1)}`);await page.reload({waitUntil:'networkidle'});await expect(page.getByTestId(product.shell)).toBeVisible();
  for(const path of product.axe){await page.goto(`${product.host}${path}`,{waitUntil:'networkidle'});const result=await new AxeBuilder({page}).analyze();expect(result.violations,`${product.slug}${path} axe`).toEqual([])}
  const evidence=resolve(process.env.E2E_ARTIFACT_DIR??resolve(process.cwd(),'../../docs/phase-51/evidence'));await mkdir(evidence,{recursive:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto(`${product.host}${product.routes[1]}`,{waitUntil:'networkidle'});await page.screenshot({path:resolve(evidence,`${product.slug}-desktop.png`),fullPage:true});
  await page.setViewportSize({width:768,height:1024});await noOverflow(page,'tablet');await page.setViewportSize({width:390,height:844});await page.goto(`${product.host}${product.routes.at(-1)}`,{waitUntil:'networkidle'});await noOverflow(page,'mobile');await page.screenshot({path:resolve(evidence,`${product.slug}-mobile.png`),fullPage:true});
  expect(serverErrors).toEqual([]);expect(consoleErrors.filter(e=>!/favicon|Download the React DevTools/iu.test(e))).toEqual([]);
});
