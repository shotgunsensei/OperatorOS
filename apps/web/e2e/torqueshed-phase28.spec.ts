import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';

const exactHost=process.env.E2E_PRODUCTION_HOSTS==='1';
const WEB=process.env.E2E_TORQUESHED_URL??(exactHost?'https://torqueshed.operatoros.net':process.env.E2E_WEB_URL??'http://127.0.0.1:5000');
const API=process.env.E2E_API_URL??'http://127.0.0.1:5001';
const PASSWORD='Phase28-Disposable-Only-9!';
const viewports=[{name:'desktop',width:1440,height:1000},{name:'tablet',width:900,height:1000},{name:'mobile',width:390,height:844}] as const;
async function noUnlabelledControls(page:Page){const failures=await page.locator('input,select,textarea').evaluateAll(controls=>controls.flatMap(control=>{const node=control as HTMLInputElement,rect=node.getBoundingClientRect();if(!rect.width||!rect.height||getComputedStyle(node).visibility==='hidden')return[];return node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||(node.id&&document.querySelector(`label[for="${CSS.escape(node.id)}"]`))||node.closest('label')?[]:[node.outerHTML.slice(0,140)];}));expect(failures).toEqual([]);}
async function establishExactHostSession(page: Page) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for exact-host setup');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase28-exact-${suffix}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net',
      'x-forwarded-host': 'auth.operatoros.net',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.79.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 28 Exact Host' },
  });
  expect(registration.status(), await registration.text()).toBe(202);
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    const identity = await pg.query<{ user_id: string; tenant_id: string }>(
      'select id as user_id,current_tenant_id as tenant_id from users where email=$1 limit 1',
      [email],
    );
    expect(identity.rows).toHaveLength(1);
    const elite = await pg.query<{ id: string }>(
      "select id from subscription_plans where slug='elite' and is_active=true limit 1",
    );
    expect(elite.rows).toHaveLength(1);
    await pg.query(
      `insert into subscriptions
         (user_id,plan_id,status,current_period_start,current_period_end,tenant_id,scope_type,legacy_access_grandfathered_at)
       values ($1,$2,'active',now(),now()+interval '30 days',$3,'tenant',clock_timestamp())`,
      [identity.rows[0].user_id, elite.rows[0].id, identity.rows[0].tenant_id],
    );
    await pg.query(
      `insert into tenant_modules (tenant_id,module_id,status,source,allow_all_members)
       select $1,id,'enabled','included',true from modules where slug='torqueshed' and status='live'
       on conflict do nothing`,
      [identity.rows[0].tenant_id],
    );
  } finally {
    await pg.end();
  }
  await page.goto(`${WEB}/garage`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/torqueshed\.operatoros\.net\/garage(?:[?#].*)?$/, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  await expect(page.getByTestId('torqueshed-module-shell')).toBeVisible({ timeout: 30_000 });
}

test.describe('Phase 28 TorqueShed premium web/API visual contract',()=>{
  test.setTimeout(300_000);
  test('garage, journal, diagnostics, live bay, marketplace and tools are real responsive surfaces',async({page})=>{
    if(exactHost)await establishExactHostSession(page);else await establishParitySession(page.request);
    await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
    const prefix=exactHost?'':'/modules/torqueshed';
    const routes=[['/garage','torqueshed-garage'],['/journal','torqueshed-journal'],['/diagnostics','torqueshed-diagnostics'],['/live-bay','torqueshed-live-bay'],['/marketplace','torqueshed-marketplace'],['/settings','torqueshed-settings-route']] as const;
    for(const viewport of viewports){await page.setViewportSize({width:viewport.width,height:viewport.height});for(const [route,testid] of routes){const response=await page.goto(`${WEB}${prefix}${route}`,{waitUntil:'networkidle'});expect(response?.status(),route).toBeLessThan(400);await expect(page.locator(`[data-testid="${testid}"]`)).toBeVisible();await expect(page.locator('body')).not.toContainText(/coming soon|not implemented|placeholder action/i);expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),`${viewport.name} ${route} overflow`).toBeLessThanOrEqual(1);await noUnlabelledControls(page);}await page.goto(`${WEB}${prefix}/dashboard`,{waitUntil:'networkidle'});await page.screenshot({path:`test-results/playwright/torqueshed-phase28-${viewport.name}.png`,fullPage:true,animations:'disabled'});}
    const assets=await page.evaluate(async()=>{const manifest=await fetch('/torqueshed.webmanifest'),worker=await fetch('/torqueshed-sw.js');return{manifestStatus:manifest.status,manifest:await manifest.json(),workerStatus:worker.status,worker:await worker.text()};});expect(assets.manifestStatus).toBe(200);expect(assets.manifest.display).toBe('standalone');expect(assets.workerStatus).toBe(200);expect(assets.worker).toContain("event.request.method !== 'GET'");
  });
});
