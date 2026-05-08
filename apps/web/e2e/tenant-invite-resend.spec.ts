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
import { test, expect, request as pwRequest } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:5001';
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5000';

test('admin can resend a pending invite from the Members page', async ({ page }) => {
  const ts = Date.now();
  const ownerEmail = `task30-owner-${ts}@example.com`;
  const inviteeEmail = `task30-invitee-${ts}@example.com`;
  const password = 'CorrectHorseBattery9!';

  const api = await pwRequest.newContext();

  // 1) Register an owner user. Backend returns { token, user }.
  const reg = await api.post(`${API}/v1/auth/register`, {
    data: { email: ownerEmail, password, name: 'Task30 Owner' },
  });
  expect(reg.ok(), `register: ${reg.status()} ${await reg.text()}`).toBeTruthy();
  const { token } = await reg.json();

  const auth = { Authorization: `Bearer ${token}` };

  // 2) Use the personal tenant that registration auto-provisions for the
  //    new user. There is no public POST /v1/tenants — every account is
  //    born with its own personal tenant where they are the owner, which
  //    is exactly the role we need to drive the Members page.
  const tenantsRes = await api.get(`${API}/v1/me/tenants`, { headers: auth });
  expect(tenantsRes.ok(), `list tenants: ${tenantsRes.status()} ${await tenantsRes.text()}`).toBeTruthy();
  const meTenants = await tenantsRes.json();
  const tenantId: string =
    meTenants.current ?? meTenants.tenants?.[0]?.id;
  expect(tenantId, 'expected the new user to have at least one tenant').toBeTruthy();

  // Pin the active tenant server-side too, so any cookie-only request
  // (the SPA does both) resolves the same tenant the UI shows.
  await api.post(`${API}/v1/tenants/${tenantId}/switch`, { headers: auth })
    .catch(() => undefined);

  // 3) Create a pending invite as the owner.
  const inviteRes = await api.post(`${API}/v1/tenants/${tenantId}/invites`, {
    headers: auth,
    data: { email: inviteeEmail, role: 'member' },
  });
  expect(inviteRes.ok(), `create invite: ${inviteRes.status()} ${await inviteRes.text()}`).toBeTruthy();
  const inviteId: string = (await inviteRes.json()).invite.id;

  // 4) Seed browser auth state and load the SPA.
  await page.addInitScript(({ token, tenantId }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('activeTenantId', tenantId);
  }, { token, tenantId });
  await page.goto(WEB);

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
