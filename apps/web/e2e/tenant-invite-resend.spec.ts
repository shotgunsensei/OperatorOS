/**
 * Task 30 — UI coverage for the "Resend invite" button on the
 * Tenant Members page (TenantUsersPage).
 *
 * Runtime: this is a `@playwright/test` spec. It is intentionally
 * isolated from the api `node:test` suite because it drives a real
 * browser against the dev servers (web on :5000, api on :5001).
 *
 * Run locally with the dev servers up:
 *   npx playwright test apps/web/e2e/tenant-invite-resend.spec.ts
 *
 * Why a separate file: the API test
 * (apps/api/test/tenant-invite-emails.test.ts) already proves the
 * audit row + error contracts. This spec exists purely to prove the
 * UI wiring — the Pending Invites row, the Resend button click, and
 * the success status text — does not silently regress.
 */
import { test, expect } from '@playwright/test';
import {
  E2E_API_URL as API,
  E2E_WEB_URL as WEB,
  expectNoScriptReadableAuth,
  registerAndLogin,
  resolveCurrentTenant,
} from './session-auth';

test('admin can resend a pending invite from the Members page', async ({ page }) => {
  const ts = Date.now();
  const ownerEmail = `task30-owner-${ts}@example.com`;
  const inviteeEmail = `task30-invitee-${ts}@example.com`;
  const password = 'CorrectHorseBattery9!';

  const api = page.context().request;

  // 1) Register and sign in an owner through the production cookie contract.
  await registerAndLogin(api, {
    email: ownerEmail,
    password,
    name: 'Task30 Owner',
  });

  // 2) Use the personal tenant that registration auto-provisions for the
  //    new user. There is no public POST /v1/tenants — every account is
  //    born with its own personal tenant where they are the owner, which
  //    is exactly the role we need to drive the Members page.
  const tenantId = await resolveCurrentTenant(api);

  // 3) Create a pending invite as the owner.
  const inviteRes = await api.post(`${API}/v1/tenants/${tenantId}/invites`, {
    data: { email: inviteeEmail, role: 'member' },
  });
  expect(inviteRes.ok(), `create invite: ${inviteRes.status()} ${await inviteRes.text()}`).toBeTruthy();
  const inviteId: string = (await inviteRes.json()).invite.id;

  // 4) Load the SPA with the host-only session already in its cookie jar.
  await page.goto(WEB);
  await expectNoScriptReadableAuth(page);

  // Wait until the dashboard chrome (sidebar) renders, then jump to Members.
  await page.getByRole('button', { name: 'Members' }).click();

  // 5) The pending invite row + Resend button should be present.
  const row = page.getByTestId(`row-invite-${inviteId}`);
  await expect(row).toBeVisible();
  const resendBtn = page.getByTestId(`button-resend-${inviteId}`);
  await expect(resendBtn).toBeVisible();

  // 6) Click Resend and assert the success status text appears.
  await resendBtn.click();
  const status = page.getByTestId(`text-resend-status-${inviteId}`);
  await expect(status).toBeVisible({ timeout: 10_000 });
  // The handler renders `Invite email sent (${provider}).` on success;
  // in dev (no RESEND_API_KEY) the provider is `log`.
  await expect(status).toContainText(/Invite email sent/i);
});
