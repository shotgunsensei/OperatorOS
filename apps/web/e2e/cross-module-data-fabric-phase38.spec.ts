import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';

const ROOT = process.env.E2E_ROOT_URL ?? 'https://operatoros.net';
const APP = process.env.E2E_APP_URL ?? 'https://app.operatoros.net';

test.describe('Phase 38 cross-module data fabric', () => {
  test.setTimeout(180_000);

  test('a module session creates native field proof and shows scoped provenance on the exact hosts', async ({ page }) => {
    // Keep disposable browser identities separate under the harness's trusted
    // loopback proxy; production authentication rate limits remain enabled.
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for':`10.79.38.${10 + Math.floor(Math.random() * 200)}` });
    const session = await establishParitySession(page.request);
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    let jobId = '';
    try {
      await pg.query(
        `insert into tenant_modules(tenant_id,module_id,status,source,allow_all_members)
         select $1,id,'enabled','admin',true from modules where slug=any($2::text[])
         on conflict(tenant_id,module_id) do update set status='enabled',allow_all_members=true`,
        [session.tenantId, ['tradeflowkit', 'snapproofos']],
      );
      const customer = await pg.query<{ id: string }>(
        `insert into tradeflowkit_customers(tenant_id,created_by_user_id,name,email,source_id)
         values($1,$2,'Phase 38 browser customer','phase38-browser@example.test',$3) returning id`,
        [session.tenantId, session.userId, `phase38-browser-customer:${session.userId}`],
      );
      const job = await pg.query<{ id: string }>(
        `insert into tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
         values($1,$2,$3,'Phase 38 exact-host field proof','scheduled','normal',$4) returning id`,
        [session.tenantId, customer.rows[0]!.id, session.userId, `phase38-browser-job:${session.userId}`],
      );
      jobId = job.rows[0]!.id;
    } finally {
      await pg.end();
    }

    await page.goto(`${ROOT}/app`, { waitUntil: 'networkidle' });
    if (/\/login(?:[?#]|$)/.test(page.url())) {
      await page.getByTestId('input-email').fill(session.email);
      await page.getByTestId('input-password').fill(session.password);
      await Promise.all([
        page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/),
        page.getByTestId('button-login').click(),
      ]);
    }
    const scopedBase = `/api/tenants/${session.tenantId}/modules/tradeflowkit/data-fabric`;
    const readinessResponse = page.waitForResponse(response => response.url().includes(`${scopedBase}/workflows/tradeflowkit.job_to_snapproof/readiness`), { timeout:30_000 });
    await page.getByTestId('button-launch-tradeflowkit').click();
    await expect(page.getByTestId('tradeflowkit-module-shell')).toBeVisible();
    const readiness = await readinessResponse;
    expect(readiness.status(), await readiness.text()).toBe(200);
    expect((await readiness.json()).readiness.available).toBe(true);
    const outcome = page.getByTestId('tradeflowkit-start-field-proof');
    await expect(outcome).toContainText('Phase 38 exact-host field proof');
    await page.getByText('Prepare proof of completed work', { exact:true }).click();
    await expect(outcome.getByRole('button', { name:'Review field-proof package' })).toBeEnabled();
    const deniedPlatform = await page.evaluate(async tenantId => {
      const response = await fetch(`/api/tenants/${tenantId}/data-fabric/workflows/tradeflowkit.job_to_snapproof/readiness`);
      return { status:response.status,code:(await response.json()).code };
    }, session.tenantId);
    expect(deniedPlatform).toEqual({ status:403,code:'SESSION_SCOPE_DENIED' });
    await outcome.getByRole('button', { name:'Review field-proof package' }).click();
    await page.getByTestId('tradeflowkit-start-field-proof-confirmation').check();
    const queuedResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && response.url().endsWith(`${scopedBase}/workflows/tradeflowkit.job_to_snapproof`));
    const polledResponse = page.waitForResponse(response => response.url().includes(`${scopedBase}/runs/`));
    await page.getByTestId('tradeflowkit-start-field-proof-confirm').click();
    const queued = await queuedResponse;
    expect(queued.status(), await queued.text()).toBe(202);
    const runId = String((await queued.json()).run.id);
    const polled = await polledResponse;
    expect(polled.status(), await polled.text()).toBe(200);
    await expect(outcome).toContainText('Items created', { timeout:60_000 });
    await expect(outcome.getByRole('link').first()).toHaveAttribute('href', /\/modules\/snapproofos\//);
    await page.reload({ waitUntil:'networkidle' });
    await page.getByText('Prepare proof of completed work', { exact:true }).click();
    let repeatedSubmissions = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith(`${scopedBase}/workflows/tradeflowkit.job_to_snapproof`)) repeatedSubmissions += 1;
    });
    await outcome.getByRole('button', { name:'Review field-proof package' }).click();
    await page.getByTestId('tradeflowkit-start-field-proof-confirmation').check();
    await page.getByTestId('tradeflowkit-start-field-proof-confirm').click();
    await expect(outcome).toContainText('Items created', { timeout:60_000 });
    expect(repeatedSubmissions).toBe(0);
    const verification = new Client({ connectionString:process.env.DATABASE_URL });
    await verification.connect();
    try {
      const persisted = await verification.query<{ status:string; count:string }>(
        `select r.status,(select count(*) from shared_resource_links l where l.tenant_id=r.tenant_id and l.workflow_run_id=r.id)::text as count
         from shared_workflow_runs r where r.tenant_id=$1 and r.id=$2`, [session.tenantId,runId],
      );
      expect(persisted.rows).toEqual([{ status:'completed',count:'2' }]);
    } finally { await verification.end(); }
    await page.goto(`${APP}/app`, { waitUntil: 'networkidle' });
    await page.getByTestId('nav-tenant-shared-services').click();
    await expect(page.getByTestId('page-shared-services-admin')).toBeVisible();
    const provenance = page.getByTestId('cross-module-provenance');
    await expect(provenance).toContainText('TradeFlowKit');
    await expect(provenance).toContainText('SnapProofOS');
    await expect(provenance).toContainText('Complete');
    await expect(provenance.getByRole('link', { name: 'Open original item' }).first()).toHaveAttribute('href', `/modules/tradeflowkit/jobs/${jobId}`);
    await expect(provenance.getByRole('link', { name: 'Open created item' }).first()).toHaveAttribute('href', /\/modules\/snapproofos\//);

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const unlabeled = await page.locator('input,select,textarea').evaluateAll(controls => controls.flatMap(control => {
      const node = control as HTMLElement;
      const box = node.getBoundingClientRect();
      return box.width && box.height && !node.closest('label') && !node.getAttribute('aria-label') ? [node.outerHTML.slice(0, 100)] : [];
    }));
    expect(unlabeled).toEqual([]);
  });
});
