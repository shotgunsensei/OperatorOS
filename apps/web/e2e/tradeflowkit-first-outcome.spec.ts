import { expect, test, type Locator, type Page } from '@playwright/test';
import { Client } from 'pg';
import { assertLocalBrowserTestEnvironment } from '../../../scripts/parity/lib/database.mjs';
import { establishParitySession, type ParitySession } from './parity-auth';

const MODULE = 'https://tradeflowkit.operatoros.net';
const API = '/api/modules/tradeflowkit';
const REFERENCE = 'synthetic-offline-payment-no-provider-charge';
type RecordId = { id: string };
type Invoice = RecordId & {
  customerId: string; jobId: string; sourceQuoteId: string;
  status: string; totalCents: number; paidCents: number; balanceCents: number;
  paymentReference: string | null; version: number;
};

async function save<T extends RecordId>(page: Page, path: string, action: () => Promise<unknown>, status: number): Promise<T> {
  const responsePending = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === `${API}${path}`,
  );
  await action();
  const response = await responsePending;
  expect(response.status(), await response.text()).toBe(status);
  return response.json() as Promise<T>;
}

async function recordedAction(page: Page, button: Locator, message: string, reference?: string, accept = true) {
  const dialogPending = page.waitForEvent('dialog');
  const clickPending = button.click();
  const dialog = await dialogPending;
  try {
    expect(dialog.type()).toBe(reference !== undefined ? 'prompt' : 'confirm');
    expect(dialog.message()).toContain(message);
  } catch (error) {
    await dialog.dismiss();
    await clickPending;
    throw error;
  }
  if (accept) await dialog.accept(reference);
  else await dialog.dismiss();
  await clickPending;
}

async function enterModule(page: Page, identity: ParitySession, path: string) {
  await page.goto(`${MODULE}${path}`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(identity.email);
  await page.getByTestId('input-password').fill(identity.password);
  await page.getByTestId('button-login').click();
  await expect(page).toHaveURL(`${MODULE}${path}`);
  await expect(page.getByTestId('tradeflowkit-module-shell')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const sessions = (await page.context().cookies()).filter(cookie => cookie.name === 'operatoros_session');
  const session = sessions.find(cookie => cookie.domain === 'tradeflowkit.operatoros.net');
  expect(session).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
  expect(sessions.some(cookie => cookie.domain === '.operatoros.net')).toBe(false);
}

for (const [index, width] of [1440, 390].entries()) {
  test(`TradeFlowKit saves its first invoice and offline payment across reload and a read-only teammate at ${width}px`, async ({ page, browser }) => {
    test.setTimeout(180_000);
    const safety = assertLocalBrowserTestEnvironment(process.env, { requireExactHosts: true });
    const pg = new Client({ connectionString: safety.database.url });
    await pg.connect();
    const viewerContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width, height: 1000 },
      extraHTTPHeaders: { 'x-forwarded-for': `10.91.0.${30 + index}` },
    });
    try {
      await page.setViewportSize({ width, height: 1000 });
      const paymentReference = index === 0 ? REFERENCE : '';
      const storedReference = paymentReference || null;
      await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `10.91.0.${10 + index}` });
      // Existing isolated fixtures pregrant access. This scenario proves module
      // workflow/authorization, not Stripe purchase or subscription settlement.
      const owner = await establishParitySession(page.request);
      const viewer = await establishParitySession(viewerContext.request);
      await pg.query(
        `insert into tenant_users (tenant_id, user_id, role) values ($1, $2, 'member')`,
        [owner.tenantId, viewer.userId],
      );
      const grant = await pg.query(
        `insert into tenant_user_module_access (tenant_id, user_id, module_id, access_level)
         select $1, $2, id, 'viewer' from modules where slug = 'tradeflowkit'`,
        [owner.tenantId, viewer.userId],
      );
      expect(grant.rowCount, 'fixture grants exactly one module viewer role').toBe(1);
      await pg.query(`update users set current_tenant_id = $1 where id = $2`, [owner.tenantId, viewer.userId]);

      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await enterModule(page, owner, '/customers');
      // The login page first probes /auth/me without a session. Assert the
      // console contract after canonical authentication settles, not that probe.
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      const customerForm = page.getByTestId('tradeflowkit-customer-create');
      await customerForm.getByLabel('Customer name').fill('Synthetic Pilot Customer');
      await customerForm.getByLabel('Customer email').fill('pilot@example.invalid');
      const customer = await save(page, '/customers', () => customerForm.getByRole('button', { name: 'Add customer', exact: true }).click(), 201);
      await expect(page.getByTestId(`tradeflowkit-customer-${customer.id}`)).toContainText('Synthetic Pilot Customer');

      await page.goto(`${MODULE}/quotes/new`, { waitUntil: 'domcontentloaded' });
      const document = page.getByTestId('tradeflowkit-document-create-form');
      await document.getByLabel('Document customer').selectOption(customer.id);
      await document.getByLabel('Line-item description').fill('Valve replacement and labor');
      await document.getByLabel('Quantity', { exact: true }).fill('2');
      await document.getByLabel('Unit price dollars').fill('125.00');
      await document.getByLabel('Tax percent').fill('0');
      const quote = await save<RecordId & { totalCents: number }>(page, '/quotes', () => document.getByRole('button', { name: 'Create quote', exact: true }).click(), 201);
      expect(quote.totalCents).toBe(25000);
      const quoteRow = page.getByTestId(`tradeflowkit-quote-${quote.id}`);
      await save(page, `/quotes/${quote.id}/transition`, () => recordedAction(page,
        quoteRow.getByRole('button', { name: 'Mark as sent', exact: true }), 'It does not email or deliver the quote.'), 200);
      await save(page, `/quotes/${quote.id}/transition`, () => recordedAction(page,
        quoteRow.getByRole('button', { name: 'Record customer acceptance', exact: true }), 'does not contact the customer or independently prove acceptance.'), 200);
      const job = await save(page, `/quotes/${quote.id}/job`, () => quoteRow.getByRole('button', { name: 'Create job', exact: true }).click(), 201);
      await expect(quoteRow.getByRole('button', { name: 'Create job', exact: true })).toHaveCount(0);
      const invoice = await save<Invoice>(page, `/quotes/${quote.id}/invoice`, () => quoteRow.getByRole('button', { name: 'Create invoice', exact: true }).click(), 201);
      expect(invoice).toMatchObject({ customerId: customer.id, jobId: job.id, sourceQuoteId: quote.id, totalCents: 25000, status: 'draft' });

      const invoicePath = `/invoices/${invoice.id}`;
      await page.goto(`${MODULE}${invoicePath}`, { waitUntil: 'domcontentloaded' });
      const invoiceRow = page.getByTestId(`tradeflowkit-invoice-${invoice.id}`);
      await save(page, `/invoices/${invoice.id}/transition`, () => recordedAction(page,
        invoiceRow.getByRole('button', { name: 'Mark invoice as sent', exact: true }), 'It does not email or deliver the invoice.'), 200);
      const paymentRequests: string[] = [];
      page.on('request', request => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === `${API}/invoices/${invoice.id}/pay`) paymentRequests.push(request.url());
      });
      await recordedAction(page, invoiceRow.getByRole('button', { name: 'Record payment', exact: true }), 'Payment reference (optional)', REFERENCE, false);
      await page.waitForLoadState('networkidle');
      expect(paymentRequests, 'canceling the payment prompt must not issue a write').toEqual([]);
      const canceled = await pg.query(`select status, paid_cents, balance_cents from tradeflowkit_invoices where id = $1 and tenant_id = $2`, [invoice.id, owner.tenantId]);
      expect(canceled.rows).toEqual([{ status: 'sent', paid_cents: 0, balance_cents: 25000 }]);
      const paid = await save<Invoice>(page, `/invoices/${invoice.id}/pay`, () => recordedAction(page,
        invoiceRow.getByRole('button', { name: 'Record payment', exact: true }), 'Payment reference (optional)', paymentReference), 200);
      expect(paid).toMatchObject({ status: 'paid', paidCents: 25000, balanceCents: 0, paymentReference: storedReference });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(invoiceRow).toContainText('balance $0.00');
      if (paymentReference) await expect(invoiceRow).toContainText(paymentReference);
      await expect(invoiceRow.getByText('Paid', { exact: true })).toBeVisible();
      await expect(invoiceRow.getByRole('button', { name: 'Record payment', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(consoleErrors, 'owner browser console errors').toEqual([]);

      const viewerPage = await viewerContext.newPage();
      viewerPage.on('pageerror', error => pageErrors.push(error.message));
      await enterModule(viewerPage, viewer, invoicePath);
      const viewerConsoleErrors: string[] = [];
      viewerPage.on('console', message => { if (message.type() === 'error') viewerConsoleErrors.push(message.text()); });
      const sharedInvoice = viewerPage.getByTestId(`tradeflowkit-invoice-${invoice.id}`);
      await expect(sharedInvoice).toContainText('Synthetic Pilot Customer');
      if (paymentReference) await expect(sharedInvoice).toContainText(paymentReference);
      await expect(viewerPage.getByTestId('tradeflowkit-revenue-readonly')).toBeVisible();
      await expect(sharedInvoice.getByRole('button')).toHaveCount(0);
      await viewerPage.reload({ waitUntil: 'domcontentloaded' });
      await expect(sharedInvoice.getByText('Paid', { exact: true })).toBeVisible();
      expect(viewerConsoleErrors, 'authenticated teammate browser console errors').toEqual([]);
      // Exercise the server guard even though the UI exposes no write control.
      const denied = await viewerPage.evaluate(async ({ path, expectedVersion }) => {
        const response = await fetch(path, { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedVersion, paymentMethod: 'other', paymentReference: 'must-not-write' }),
        });
        return { status: response.status, body: await response.json() };
      }, { path: `${API}/invoices/${invoice.id}/pay`, expectedVersion: paid.version });
      expect(denied.status, JSON.stringify(denied.body)).toBe(403);

      const storedInvoice = await pg.query(
        `select customer_id, job_id, source_quote_id, status, total_cents, paid_cents, balance_cents, payment_reference
         from tradeflowkit_invoices where id = $1 and tenant_id = $2`, [invoice.id, owner.tenantId],
      );
      expect(storedInvoice.rows).toEqual([{ customer_id: customer.id, job_id: job.id, source_quote_id: quote.id,
        status: 'paid', total_cents: 25000, paid_cents: 25000, balance_cents: 0, payment_reference: storedReference }]);
      const payments = await pg.query(
        `select amount_cents, method, reference, provider from tradeflowkit_payments where invoice_id = $1 and tenant_id = $2`,
        [invoice.id, owner.tenantId],
      );
      expect(payments.rows).toEqual([{ amount_cents: 25000, method: 'other', reference: storedReference, provider: null }]);
      const storedJob = await pg.query(`select status from tradeflowkit_jobs where id = $1 and tenant_id = $2`, [job.id, owner.tenantId]);
      expect(storedJob.rows).toEqual([{ status: 'paid' }]);
      expect(pageErrors, 'owner and teammate page errors').toEqual([]);
    } finally {
      await viewerContext.close();
      await pg.end();
    }
  });
}
