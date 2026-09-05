import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDeployedBrowserTestEnvironment } from '../../../scripts/parity/lib/database.mjs';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const { rootUrl: ROOT } = assertDeployedBrowserTestEnvironment(process.env);

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the deployed Phase 17 acceptance gate`);
  }
  return value;
}

const ENTITLED = {
  email: requiredEnv('E2E_PHASE17_EMAIL'),
  password: requiredEnv('E2E_PHASE17_PASSWORD'),
  tenantId: requiredEnv('E2E_PHASE17_TENANT_ID'),
};

const DENIED = {
  email: requiredEnv('E2E_PHASE17_DENIED_EMAIL'),
  password: requiredEnv('E2E_PHASE17_DENIED_PASSWORD'),
  tenantId: requiredEnv('E2E_PHASE17_DENIED_TENANT_ID'),
};

const SHELL_TEST_IDS: Record<string, string> = {
  tradeflowkit: 'tradeflowkit-module-shell',
  torqueshed: 'torqueshed-module-shell',
  techdeck: 'techdeck-module-shell',
  pulsedesk: 'pulsedesk-module-shell',
  faultlinelab: 'faultlinelab-module-shell',
  'ninja-pool-hall': 'ninja-pool-hall-shell',
  brandforgeos: 'brandforgeos-workspace',
  snapproofos: 'snapproofos-workspace',
  'studyforge-ai': 'shell-studyforge-ai',
  'ninja-launch-kit': 'shell-ninja-launch-kit-complete',
  'callcommand-ai': 'shell-callcommand-ai',
  ninjamation: 'shell-ninjamation',
  outcall: 'shell-outcall',
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = JSON.parse(
  readFileSync(resolve(repoRoot, 'config/operatoros-module-registry.json'), 'utf8'),
) as Array<{
  moduleId: string;
  slug: string;
  productionBaseUrl: string;
  enabled: boolean;
}>;

const ENABLED_MODULES = registry
  .filter(entry => entry.moduleId !== 'operatoros' && entry.enabled)
  .map(entry => {
    const shellTestId = SHELL_TEST_IDS[entry.slug];
    if (!shellTestId) throw new Error(`Missing deployed shell selector for ${entry.slug}`);
    return { ...entry, shellTestId };
  });

if (ENABLED_MODULES.length !== 12) {
  throw new Error(`Expected 12 enabled modules while OutCall is source-recovery locked, found ${ENABLED_MODULES.length}`);
}

function assertNoCredentialQuery(rawUrl: string) {
  const forbidden = /^(token|jwt|access_token|id_token|refresh_token|session|session_token)$/i;
  const leaked = [...new URL(rawUrl).searchParams.keys()].filter(key => forbidden.test(key));
  expect(leaked, `credential query parameter leaked in ${rawUrl}`).toEqual([]);
}

async function assertNoBrowserCredentialStorage(page: Page) {
  const stored = await page.evaluate(() => {
    const values: string[] = [];
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) || '';
        values.push(`${key}=${storage.getItem(key) || ''}`);
      }
    }
    return values;
  });
  expect(stored.join('\n')).not.toMatch(/(bearer|jwt|access[_-]?token|refresh[_-]?token|session[_-]?token)/i);
}

async function assertHostOnlySession(context: BrowserContext, host: string) {
  const cookies = (await context.cookies()).filter(cookie => cookie.name === 'operatoros_session');
  const cookie = cookies.find(candidate => candidate.domain === host);
  expect(cookie, `${host} must own an independent operatoros_session`).toBeTruthy();
  expect(cookie!.secure).toBe(true);
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe('Lax');
  expect(cookie!.path).toBe('/');
}

async function login(page: Page, identity: { email: string; password: string }) {
  await page.goto(`${ROOT}/app`);
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  assertNoCredentialQuery(page.url());
  await page.getByTestId('input-email').fill(identity.email);
  await page.getByTestId('input-password').fill(identity.password);
  await Promise.all([
    page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  assertNoCredentialQuery(page.url());
  await assertNoBrowserCredentialStorage(page);
}

test.describe('Phase 17 deployed production acceptance', () => {
  test('one credential launches every enabled module and global logout revokes sibling hosts', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, ENTITLED);
    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();
    await expect(page.getByTestId('button-launch-outcall')).toHaveCount(0);
    await expect(page.getByTestId('module-status-outcall')).toContainText('Coming soon');

    let lastModulePage: Page | null = null;
    for (const [index, module] of ENABLED_MODULES.entries()) {
      await page.getByTestId(`button-launch-${module.slug}`).click();
      const modulePage = page;
      await expect(modulePage.getByTestId(module.shellTestId)).toBeVisible({ timeout: 30_000 });
      expect(new URL(modulePage.url()).origin).toBe(new URL(module.productionBaseUrl).origin);
      assertNoCredentialQuery(modulePage.url());
      await assertNoBrowserCredentialStorage(modulePage);
      await assertHostOnlySession(modulePage.context(), new URL(module.productionBaseUrl).hostname);
      if (index < ENABLED_MODULES.length - 1) {
        await modulePage.getByRole('link', { name: 'My Apps' }).first().click();
        await expect(modulePage.getByTestId('page-my-apps')).toBeVisible({ timeout: 30_000 });
      } else {
        lastModulePage = modulePage;
      }
    }

    const logoutAll = await page.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);
    expect(lastModulePage).toBeTruthy();
    await lastModulePage!.reload();
    await expect(lastModulePage!).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    assertNoCredentialQuery(lastModulePage!.url());
  });

  test('local logout preserves an authenticated sibling module session', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, ENTITLED);
    await page.getByTestId('nav-my-apps').click();

    const techDeckPopup = page.waitForEvent('popup');
    await page.getByTestId('button-launch-new-tab-techdeck').click();
    const techDeck = await techDeckPopup;
    await expect(techDeck.getByTestId('techdeck-module-shell')).toBeVisible({ timeout: 30_000 });

    const pulseDeskPopup = page.waitForEvent('popup');
    await page.getByTestId('button-launch-new-tab-pulsedesk').click();
    const pulseDesk = await pulseDeskPopup;
    await expect(pulseDesk.getByTestId('pulsedesk-module-shell')).toBeVisible({ timeout: 30_000 });

    await techDeck.goto('https://techdeck.operatoros.net/logout');
    await expect(techDeck).toHaveURL(/^https:\/\/operatoros\.net\/signed-out\?signed_out=local$/);
    await pulseDesk.reload();
    await expect(pulseDesk.getByTestId('pulsedesk-module-shell')).toBeVisible({ timeout: 30_000 });
    await assertHostOnlySession(pulseDesk.context(), 'pulsedesk.operatoros.net');
  });

  test('tenant denial and the global OutCall activation lock return no authorization handoff', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page, DENIED);
    const denied = await page.evaluate(async (tenantId) => {
      const issue = async (moduleId: 'techdeck' | 'outcall') => {
        const response = await fetch('/api/sso/issue', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moduleId,
            tenantId,
            clientId: `operatoros:${moduleId}`,
            redirectUri: `https://${moduleId}.operatoros.net/sso`,
            returnTo: '/',
            state: 's'.repeat(43),
            nonce: 'n'.repeat(43),
            codeChallenge: 'c'.repeat(43),
            codeChallengeMethod: 'S256',
          }),
        });
        return { status: response.status, body: await response.json() };
      };
      return {
        tenant: await issue('techdeck'),
        outcall: await issue('outcall'),
      };
    }, DENIED.tenantId);

    expect(denied.tenant.status).toBe(403);
    expect(denied.tenant.body.code).toBe('MODULE_ACCESS_DENIED');
    expect(denied.tenant.body.launchUrl).toBeUndefined();
    expect(denied.outcall.status).toBe(403);
    expect(denied.outcall.body.code).toBe('MODULE_UNAVAILABLE');
    expect(denied.outcall.body.launchUrl).toBeUndefined();
    assertNoCredentialQuery(page.url());
    await assertNoBrowserCredentialStorage(page);
  });
});
