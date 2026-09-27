import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';
import { assertLocalBrowserTestEnvironment } from '../../../scripts/parity/lib/database.mjs';

test('TechDeck production ingestion uses exact-host sessions, central service tokens and persistent revisions', async ({ page, request }) => {
  test.setTimeout(90_000);
  const safety = assertLocalBrowserTestEnvironment(process.env, { requireExactHosts: true });
  const identity = await establishParitySession(request);
  const source = readFileSync(resolve(process.cwd(), '../api/test/fixtures/techdeck-resolution-cam-wal-v1.json'), 'utf8');
  const pg = new Client({ connectionString: safety.database.url });
  await pg.connect();
  try {
    await page.goto('https://techdeck.operatoros.net/tickets');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(identity.password);
    await Promise.all([
      page.waitForURL(/^https:\/\/techdeck\.operatoros\.net\/tickets(?:[?#].*)?$/),
      page.getByTestId('button-login').click(),
    ]);
    await expect(page.getByTestId('techdeck-module-shell')).toBeVisible();
    const moduleCookies = (await page.context().cookies()).filter(cookie => cookie.domain === 'techdeck.operatoros.net' && cookie.httpOnly);
    expect(moduleCookies.length).toBeGreaterThan(0);
    expect(moduleCookies.every(cookie => cookie.secure && cookie.sameSite === 'Lax' && cookie.path === '/')).toBeTruthy();

    const send = async (path: string, body: Record<string, unknown>, key?: string) => page.evaluate(async ({ path, body, key }) => {
      const response = await fetch(`/api/modules/techdeck/resolution-intelligence${path}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
        body: JSON.stringify(body),
      });
      return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
    }, { path, body, key });

    const preview = await send('/exports/validate', { rawText: source });
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body).toMatchObject({ valid: true, embeddingState: 'not_enabled' });
    expect(preview.cacheControl).toBe('no-store');
    expect((await pg.query('SELECT count(*) FROM techdeck_resolution_incidents WHERE tenant_id=$1', [identity.tenantId])).rows[0].count).toBe('0');

    const key = randomUUID();
    const imported = await send('/exports', { rawText: source }, key);
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    expect(imported.body).toMatchObject({ status: 'imported', activeRevision: 1, version: 1 });
    const replay = await send('/exports', { rawText: source }, key);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ incidentId: imported.body.incidentId, replayed: true });

    const changed = JSON.parse(source); changed.incident.title = 'Synthetic production-artifact reprocess';
    changed.incident.opened_at = '0000-01-01T00:00:00Z';
    const revised = await send(`/incidents/${imported.body.incidentId}/reprocess`, { rawText: JSON.stringify(changed), expectedVersion: 1 }, randomUUID());
    expect(revised.status, JSON.stringify(revised.body)).toBe(201);
    expect(revised.body).toMatchObject({ incidentId: imported.body.incidentId, activeRevision: 2, version: 2 });
    expect(revised.body.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DATE_UNRESOLVED' })]));
    expect((await pg.query('SELECT opened_at FROM techdeck_resolution_incidents WHERE tenant_id=$1 AND id=$2', [identity.tenantId, imported.body.incidentId])).rows[0].opened_at).toBeNull();
    const stored = await pg.query('SELECT revision,raw_text FROM techdeck_resolution_raw_exports WHERE tenant_id=$1 AND incident_id=$2 ORDER BY revision', [identity.tenantId, imported.body.incidentId]);
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows[0].raw_text).toBe(source);

    const moduleId = (await pg.query("SELECT id FROM modules WHERE slug='techdeck'")).rows[0].id;
    const provisioned = await request.post(`https://127.0.0.1/api/tenants/${identity.tenantId}/shared-platform/service-identities`, {
      data: { moduleId, identityName: `resolution-e2e-${randomUUID()}`, tokenName: 'Disposable resolution importer', scopes: ['techdeck:resolution:import'] },
    });
    expect(provisioned.status()).toBe(201);
    const token = await provisioned.json();
    const headless = await request.post('https://127.0.0.1/api/headless/techdeck/resolution-intelligence/exports', {
      headers: { Authorization: `Bearer ${token.rawToken}`, 'Idempotency-Key': randomUUID() },
      data: { rawText: JSON.stringify(changed) },
    });
    expect(headless.status(), 'headless production route returns a scoped duplicate receipt').toBe(200);
    expect(await headless.json()).toMatchObject({ incidentId: imported.body.incidentId, status: 'duplicate' });
    const revoked = await request.delete(`https://127.0.0.1/api/tenants/${identity.tenantId}/shared-platform/api-tokens/${token.token.id}`);
    expect(revoked.ok()).toBeTruthy();
    const denied = await request.post('https://127.0.0.1/api/headless/techdeck/resolution-intelligence/exports/validate', {
      headers: { Authorization: `Bearer ${token.rawToken}` }, data: { rawText: source },
    });
    expect(denied.status()).toBe(401);
  } finally {
    await pg.end();
  }
});
