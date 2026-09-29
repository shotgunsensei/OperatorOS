import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';
import { assertLocalBrowserTestEnvironment } from '../../../scripts/parity/lib/database.mjs';

const base = '/api/modules/techdeck/resolution-intelligence';
const evidenceRoot = resolve(process.cwd(), '../../build/parity/resolution-phase3');
test.use({ actionTimeout: 15_000 });
async function capture(page: Page, name: string) {
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await page.screenshot({ path: resolve(evidenceRoot, name), fullPage: true, animations: 'disabled' });
}
async function assertAccessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(audit.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('TechDeck Resolution Technician V1 imports, searches, reviews and downloads evidence on exact and embedded hosts', async ({ page, request }) => {
  test.setTimeout(180_000);
  const safety = assertLocalBrowserTestEnvironment(process.env, { requireExactHosts: true });
  const identity = await establishParitySession(request);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://techdeck.operatoros.net' });
  const raw = readFileSync(resolve(process.cwd(), '../api/test/fixtures/techdeck-resolution-cam-wal-v1.json'), 'utf8');
  const source = JSON.parse(raw); source.incident.title = 'Synthetic CAM WAL closeout';
  source.diagnostics.push({ sequence: 2, timestamp: null, action: 'Inspect service status (synthetic)', command: 'Get-Service -Name camsvc', purpose: 'Read-only service inspection', expected_result: null, actual_result: 'Synthetic evidence only; command was not executed by this test.', outcome: 'NOT_RUN', risk_level: 'LOW' });
  const text = JSON.stringify(source, null, 2);
  const pg = new Client({ connectionString: safety.database.url }); await pg.connect();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  mkdirSync(evidenceRoot, { recursive: true });
  try {
    await page.goto('https://techdeck.operatoros.net/resolution-intelligence/import');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email); await page.getByTestId('input-password').fill(identity.password);
    await Promise.all([page.waitForURL('https://techdeck.operatoros.net/resolution-intelligence/import'), page.getByTestId('button-login').click()]);
    const workspace = page.getByTestId('techdeck-resolution-workspace');
    await expect(workspace.getByRole('heading', { name: 'Bring a closeout pack into TechDeck' })).toBeVisible();
    await workspace.getByLabel('Machine Evidence Export JSON', { exact: true }).fill(text);
    await workspace.getByRole('button', { name: 'Validate and preview' }).click();
    await expect(workspace.getByRole('heading', { name: 'Validated preview' })).toBeVisible();
    expect((await pg.query('SELECT count(*) FROM techdeck_resolution_incidents WHERE tenant_id=$1', [identity.tenantId])).rows[0].count).toBe('0');
    await page.setViewportSize({ width: 1440, height: 1050 }); await assertAccessible(page);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await capture(page, 'import-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 }); await assertAccessible(page);
    await capture(page, 'import-mobile.png');
    await page.setViewportSize({ width: 1440, height: 1050 });
    await workspace.getByRole('checkbox', { name: /I reviewed the source/ }).check();
    await workspace.getByRole('button', { name: 'Confirm import' }).click();
    await expect(workspace.getByText('Evidence saved', { exact: true })).toBeVisible();
    await workspace.getByRole('link', { name: 'Open incident evidence →' }).click();
    await expect(workspace.getByRole('heading', { name: 'Synthetic CAM WAL closeout', exact: true })).toBeVisible();
    const incidentId = page.url().split('/').pop()!;
    await workspace.getByText('Semantic index for this incident', { exact:true }).click();
    await expect(workspace.getByRole('button', { name:'Review excerpts for semantic indexing' })).toBeDisabled();
    await expect(workspace.getByText('No current index is recorded.', { exact:true })).toBeVisible();
    await expect(workspace.locator('#resolution-warnings')).toContainText('Disabling camsvc was followed by loss of Wi-Fi');
    await expect(workspace.locator('#resolution-validations')).toContainText('pending');
    await expect(workspace.locator('#resolution-side_effects')).toContainText('temporal_association');
    await expect(workspace.locator('#resolution-commands summary')).toBeVisible();
    await workspace.locator('#resolution-commands summary').click();
    await expect(workspace.getByRole('button', { name: 'Copy command as text' }).first()).toBeVisible();
    await workspace.getByRole('button', { name: 'Copy command as text' }).first().click();
    await expect(workspace.getByText('Command copied as text. Review risk, elevation, warnings, and actual results before using it.')).toBeVisible();
    await assertAccessible(page); await capture(page, 'detail-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 }); await assertAccessible(page);
    await expect(page.getByTestId('link-contact-floating')).toBeHidden();
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await capture(page, 'detail-mobile.png');
    await workspace.getByRole('link', { name: 'Search', exact: true }).click();
    await workspace.getByLabel('Error, service, path, or diagnostic text', { exact: true }).fill('0x800f0915');
    const searchRequest = page.waitForRequest(request => request.url().endsWith(`${base}/search`) && request.method() === 'POST');
    await workspace.getByRole('button', { name: 'Search evidence', exact: true }).click();
    expect((await searchRequest).postData()).toContain('0x800f0915'); expect(page.url()).not.toContain('0x800f0915');
    const results = workspace.getByRole('region', { name: 'Search results' });
    await workspace.getByText('Semantic search availability', { exact:true }).click();
    await expect(workspace.getByText('Semantic search is off. An administrator must finish provider setup before enabling it.', { exact:true })).toBeVisible();
    await expect(workspace.getByRole('button', { name:'Enable or update semantic search' })).toBeDisabled();
    await expect(results).toContainText('Semantic matching was not requested.');
    await expect(results).toContainText('exact identifier match'); await expect(results).toContainText('PARTIAL'); await expect(results).toContainText('failed attempts');
    await assertAccessible(page); await capture(page, 'search-mobile.png');
    await page.setViewportSize({ width: 1440, height: 1050 }); await capture(page, 'search-desktop.png');
    await results.getByRole('link', { name: 'Review evidence →' }).click();
    await workspace.getByText('Review and correct native links', { exact: true }).click();
    await workspace.getByRole('combobox', { name: /^Review status/ }).selectOption('reviewed');
    await workspace.getByRole('button', { name: 'Save reviewed metadata' }).click();
    await expect(workspace.getByText('Reviewed', { exact: true }).first()).toBeVisible();
    await workspace.getByRole('link', { name: /Source history/ }).click();
    const rawDownload = page.waitForEvent('download'); await workspace.getByRole('button', { name: 'Download raw revision 1' }).click();
    const download = await rawDownload; const stream = await download.createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk)); expect(Buffer.concat(chunks).toString('utf8')).toBe(text);
    expect((await pg.query("SELECT count(*) FROM shared_activity_events WHERE tenant_id=$1 AND object_id=$2 AND event_type='techdeck.resolution.raw_downloaded'", [identity.tenantId, incidentId])).rows[0].count).toBe('1');
    await page.setViewportSize({ width: 390, height: 844 }); await assertAccessible(page);
    await capture(page, 'history-mobile.png');
    await page.setViewportSize({ width: 1440, height: 1050 });
    await workspace.getByRole('link', { name: 'Prompt and templates', exact: true }).click();
    await expect(workspace.getByRole('button', { name: 'Copy JSON template', exact: true })).toBeVisible(); await expect(workspace.getByRole('button', { name: 'Copy JSON Schema', exact: true })).toBeVisible();
    const promptDownload = page.waitForEvent('download'); await workspace.getByRole('button', { name: 'Download full prompt', exact: true }).click();
    const prompt = await promptDownload; const promptStream = await prompt.createReadStream(); const promptChunks: Buffer[] = []; for await (const chunk of promptStream!) promptChunks.push(Buffer.from(chunk));
    expect(Buffer.concat(promptChunks).toString('utf8')).toBe(readFileSync(resolve(process.cwd(), '../../docs/prompts/MSP_RESOLUTION_CLOSEOUT_PROMPT.md'), 'utf8').replaceAll('\r\n', '\n'));
    await assertAccessible(page); await capture(page, 'prompt-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 }); await assertAccessible(page);
    await capture(page, 'prompt-mobile.png');
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto('https://techdeck.operatoros.net/resolution-intelligence/ai-integration/ticket-completion-prompt'); await expect(workspace.getByRole('button', { name: 'Copy JSON Schema', exact: true })).toBeVisible();
    // Embedded routes use a platform session on the loopback host established by this same browser context.
    await establishParitySession(page.request);
    await page.goto('https://127.0.0.1/modules/techdeck/resolution-intelligence'); await expect(workspace.getByRole('heading', { name: 'Find the evidence behind a resolution' })).toBeVisible();
    await workspace.getByRole('link', { name: 'Prompt and templates' }).click(); await expect(page).toHaveURL('https://127.0.0.1/modules/techdeck/settings/ai-integration/ticket-completion-prompt'); await expect(workspace.getByRole('button', { name: 'Copy JSON template' })).toBeVisible();
    await page.goto(`https://techdeck.operatoros.net/resolution-intelligence/incidents/${incidentId}`); await expect(workspace.getByRole('heading', { name: 'Synthetic CAM WAL closeout' })).toBeVisible();
    await workspace.getByText('Review and correct native links', { exact: true }).click();
    await workspace.getByRole('checkbox', { name: 'Archive this incident and remove it from active retrieval.' }).check();
    await workspace.getByRole('button', { name: 'Archive incident', exact: true }).click();
    await expect(workspace.getByText('Incident archived. It is now excluded from active retrieval.')).toBeVisible();
    await expect(workspace.getByRole('heading', { name: 'Synthetic CAM WAL closeout' })).toHaveCount(0);
    const moduleSession = (await page.context().cookies()).find(cookie => cookie.name === 'operatoros_session' && cookie.domain === 'techdeck.operatoros.net');
    expect(moduleSession).toBeDefined();
    const sessionHash = createHash('sha256').update(moduleSession!.value).digest('hex');
    const logout = await page.evaluate(async () => (await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status); expect(logout).toBe(200);
    expect((await page.context().cookies()).some(cookie => cookie.name === 'operatoros_session' && cookie.domain === 'techdeck.operatoros.net')).toBe(false);
    expect((await pg.query("SELECT reason FROM revoked_session_tokens WHERE token_hash=$1 AND user_id=$2", [sessionHash, identity.userId])).rows).toEqual([{ reason: 'local_logout' }]);
    // Browser fetch inherits the canonical-host loopback resolver; Playwright's
    // separate APIRequestContext does not. Summary also avoids an archived
    // incident's 404 masking the authentication result.
    const denied = await page.evaluate(async path => {
      const response = await fetch(`${path}/summary`, { credentials: 'include', redirect: 'manual' });
      return { status: response.status, body: await response.json() };
    }, base);
    expect(denied).toEqual({ status: 401, body: { error: 'Authentication required', code: 'AUTH_REQUIRED' } });
    expect(errors).toEqual([]);
  } finally { await pg.end(); }
});
