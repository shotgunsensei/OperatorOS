import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';

const ROOT = process.env.E2E_ROOT_URL ?? 'https://operatoros.net';
const APP = process.env.E2E_APP_URL ?? 'https://app.operatoros.net';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';

test.describe('Phase 38 cross-module data fabric', () => {
  test.setTimeout(180_000);

  test('queues a native workflow and shows entitlement-filtered provenance on the exact host', async ({ page }) => {
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

    const queued = await page.request.post(
      `${API}/v1/tenants/${session.tenantId}/data-fabric/workflows/tradeflowkit.job_to_snapproof`,
      { data: {
        aggregateId: jobId,
        sourceDeepLink: `/modules/tradeflowkit/jobs/${jobId}`,
        idempotencyKey: `phase38-browser:${jobId}`,
        correlationId: `phase38-exact-host:${jobId}`,
      } },
    );
    expect(queued.status(), await queued.text()).toBe(202);
    const runId = String((await queued.json()).run.id);

    await expect.poll(async () => {
      const response = await page.request.get(`${API}/v1/tenants/${session.tenantId}/data-fabric/runs/${runId}`);
      if (!response.ok()) return `http-${response.status()}`;
      return (await response.json()).run.status;
    }, { timeout: 60_000 }).toBe('completed');

    await page.goto(`${ROOT}/app`, { waitUntil: 'networkidle' });
    if (/\/login(?:[?#]|$)/.test(page.url())) {
      await page.getByTestId('input-email').fill(session.email);
      await page.getByTestId('input-password').fill(session.password);
      await Promise.all([
        page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/),
        page.getByTestId('button-login').click(),
      ]);
    }
    await page.goto(`${APP}/app`, { waitUntil: 'networkidle' });
    await page.getByTestId('nav-tenant-shared-services').click();
    await expect(page.getByTestId('page-shared-services-admin')).toBeVisible();
    const provenance = page.getByTestId('cross-module-provenance');
    await expect(provenance).toContainText('TradeFlowKit');
    await expect(provenance).toContainText('SnapProofOS');
    await expect(provenance).toContainText('completed');
    await expect(provenance.getByRole('link', { name: 'Open source' }).first()).toHaveAttribute('href', `/modules/tradeflowkit/jobs/${jobId}`);
    await expect(provenance.getByRole('link', { name: 'Open destination' }).first()).toHaveAttribute('href', /\/modules\/snapproofos\//);

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
