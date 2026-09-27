import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';
import { assertLocalBrowserTestEnvironment } from '../../../scripts/parity/lib/database.mjs';

const base = '/api/modules/techdeck/resolution-intelligence';
const evidenceRoot = resolve(process.cwd(), '../../build/parity/resolution-phase4');
test.use({ actionTimeout: 15_000 });
test.beforeEach(async ({ context }, testInfo) => {
  // Match the exact-host SSO harness: isolate this synthetic client at the local
  // trusted proxy while leaving the production per-IP login policy unchanged.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.79.4.${10 + testInfo.retry}` });
});
async function capture(page: Page, name: string) {
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await expect.poll(() => page.locator('.ops-skip-link').evaluate(link => link.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await page.screenshot({ path: resolve(evidenceRoot, name), fullPage: true, animations: 'disabled' });
}
async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(audit.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('TechDeck evidence documents preview, edit, link multiple incidents, publish and retain stale source history', async ({ page, request }) => {
  test.setTimeout(180_000);
  const safety = assertLocalBrowserTestEnvironment(process.env, { requireExactHosts: true });
  const identity = await establishParitySession(request);
  const pg = new Client({ connectionString: safety.database.url }); await pg.connect();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), '../api/test/fixtures/techdeck-resolution-cam-wal-v1.json'), 'utf8'));
  mkdirSync(evidenceRoot, { recursive: true });
  async function importIncident(title: string) {
    const response = await page.evaluate(async ({ path, source }) => {
      const result = await fetch(`${path}/exports`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ rawText: JSON.stringify(source) }) });
      return { status: result.status, body: await result.json() };
    }, { path: base, source: { ...raw, incident: { ...raw.incident, title } } });
    expect(response.status, JSON.stringify(response.body)).toBe(201); return response.body.incidentId as string;
  }
  try {
    await page.goto('https://techdeck.operatoros.net/resolution-intelligence/kb');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email); await page.getByTestId('input-password').fill(identity.password);
    await Promise.all([page.waitForURL('https://techdeck.operatoros.net/resolution-intelligence/kb'), page.getByTestId('button-login').click()]);
    const id = await importIncident('Synthetic evidence document case');
    await page.goto(`https://techdeck.operatoros.net/resolution-intelligence/incidents/${id}`);
    const drafts = page.getByRole('region', { name: 'Evidence-derived documents' });
    await drafts.getByRole('button', { name: 'Preview evidence draft' }).click();
    const preview = drafts.getByRole('region', { name: 'Draft privacy preview' });
    await expect(preview).toContainText('Disabling camsvc'); await expect(preview).toContainText('pending'); await expect(preview).toContainText('temporal_association');
    expect((await pg.query('SELECT count(*) FROM techdeck_documents WHERE tenant_id=$1', [identity.tenantId])).rows[0].count).toBe('0');
    await page.setViewportSize({ width: 1440, height: 1050 }); await accessible(page); await capture(page, 'draft-preview-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 }); await accessible(page); await capture(page, 'draft-preview-mobile.png');
    await preview.getByRole('checkbox', { name: /I reviewed the draft/ }).check(); await preview.getByRole('button', { name: 'Save linked draft' }).click();
    await drafts.getByRole('link', { name: 'Open document editor →' }).click();
    const editor = page.getByTestId('techdeck-document-editor'); await expect(editor).toContainText('Version 1'); await expect(editor.getByLabel('Document content')).toContainText('Disabling camsvc');
    const documentId = page.url().split('/').pop()!;
    await editor.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await editor.getByLabel('Draft title', { exact: true }).fill('Reviewed synthetic knowledge article');
    await editor.getByLabel('Revision note', { exact: true }).fill('Reviewed source warnings and applicability.');
    await editor.getByRole('button', { name: 'Save document revision' }).click();
    await expect(editor).toContainText('Version 2'); await expect(editor.getByRole('heading', { name: 'Reviewed synthetic knowledge article' })).toBeVisible();
    await accessible(page); await capture(page, 'document-editor-mobile.png');
    const second = await importIncident('Synthetic supporting incident');
    await page.goto(`https://techdeck.operatoros.net/resolution-intelligence/incidents/${second}`);
    await drafts.getByText('Link this incident to an existing draft', { exact: true }).click();
    await drafts.getByRole('combobox', { name: 'Existing evidence draft', exact: true }).selectOption(documentId);
    await drafts.getByRole('button', { name: 'Link source to draft' }).click(); await drafts.getByRole('link', { name: 'Open document editor →' }).click();
    await expect(editor).toContainText('Version 3'); await expect(editor.getByRole('link', { name: 'Source incident · revision 1', exact: true })).toHaveCount(2);
    await editor.getByRole('button', { name: 'Submit for review' }).click(); await expect(editor).toContainText('in review');
    await editor.getByRole('button', { name: 'Approve document', exact: true }).click(); await expect(editor).toContainText('approved');
    await editor.getByRole('button', { name: 'Publish document', exact: true }).click(); await expect(editor).toContainText('published'); await expect(editor).toContainText('Version 6');
    await page.setViewportSize({ width: 1440, height: 1050 }); await accessible(page); await capture(page, 'document-published-desktop.png');
    await page.goto('https://techdeck.operatoros.net/resolution-intelligence/kb'); await expect(drafts).toContainText('Reviewed synthetic knowledge article'); await expect(drafts).toContainText('published');
    await capture(page, 'linked-knowledge-desktop.png');
    // New source revision must not silently replace published guidance.
    const reprocessed = await page.evaluate(async ({ path, id, source }) => {
      const response = await fetch(`${path}/incidents/${id}/reprocess`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ expectedVersion: 1, rawText: JSON.stringify(source) }) });
      return { status: response.status, body: await response.json() };
    }, { path: base, id, source: { ...raw, incident: { ...raw.incident, title: 'Synthetic corrected source revision' } } });
    expect(reprocessed.status, JSON.stringify(reprocessed.body)).toBe(201);
    await page.reload(); await expect(drafts).toContainText('Source changed.');
    await page.setViewportSize({ width: 390, height: 844 }); await accessible(page); await capture(page, 'linked-knowledge-stale-mobile.png');
    await drafts.getByRole('link', { name: 'Reviewed synthetic knowledge article', exact: true }).click(); await expect(editor).toContainText('Source changed.'); await expect(editor.getByLabel('Document content')).toContainText('Synthetic evidence document case');
    expect((await pg.query('SELECT count(*) FROM techdeck_document_revisions WHERE tenant_id=$1 AND document_id=$2', [identity.tenantId, documentId])).rows[0].count).toBe('6');
    await establishParitySession(page.request);
    await page.goto('https://127.0.0.1/modules/techdeck/resolution-intelligence/kb'); await expect(drafts.getByRole('heading', { name: 'Evidence-derived knowledge' })).toBeVisible();
    await page.reload(); await expect(drafts).toContainText('No linked documents are available');
    expect(errors).toEqual([]);
  } finally { await pg.end(); }
});
