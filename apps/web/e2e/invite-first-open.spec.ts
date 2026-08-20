import { expect, test, type Page } from '@playwright/test';

const INVITE_PATH = '/app/invites/opaque-invitation-token';
const INVITED_EMAIL = 'invitee@example.com';

async function mockInvitation(page: Page) {
  await page.route('**/api/invites/opaque-invitation-token/peek', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: INVITED_EMAIL,
        role: 'member',
        tenantName: 'Example Operations',
        status: 'pending',
      }),
    });
  });
}

async function mockFreshBrowser(page: Page) {
  let authChecks = 0;
  await page.route('**/api/auth/me', async (route) => {
    authChecks += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }),
    });
  });
  return () => authChecks;
}

test('a fresh browser stays on the invitation after the expected anonymous auth check', async ({ page }) => {
  let mainFrameNavigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations += 1;
  });
  const authChecks = await mockFreshBrowser(page);
  await mockInvitation(page);

  await page.goto(`http://127.0.0.1:5000${INVITE_PATH}`);
  const navigationsAfterInitialLoad = mainFrameNavigations;

  await expect(page.getByRole('heading', { name: 'Join Example Operations' })).toBeVisible();
  await expect(page.getByTestId('form-invite-register')).toBeVisible();
  await expect(page).toHaveURL(`http://127.0.0.1:5000${INVITE_PATH}`);
  await page.waitForTimeout(1_000);

  expect(authChecks()).toBeGreaterThan(0);
  expect(mainFrameNavigations).toBe(navigationsAfterInitialLoad);
});

test('new account creation waits for consent, then joins the inviting tenant', async ({ page }) => {
  const authChecks = await mockFreshBrowser(page);
  await mockInvitation(page);
  let registrations = 0;
  let acceptances = 0;
  let tenantSwitches = 0;

  await page.route('**/api/auth/register-with-invite', async (route) => {
    registrations += 1;
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      token: 'opaque-invitation-token',
      name: 'New Team Member',
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: { 'set-cookie': 'operatoros_session=test-session; Path=/; HttpOnly; SameSite=Lax' },
      body: JSON.stringify({
        user: {
          id: 'new-user',
          email: INVITED_EMAIL,
          name: 'New Team Member',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          currentTenantId: 'personal-tenant',
        },
        personalTenantId: 'personal-tenant',
        invitation: { tenantName: 'Example Operations', role: 'member', status: 'pending' },
      }),
    });
  });
  await page.route('**/api/invites/opaque-invitation-token/accept', async (route) => {
    acceptances += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tenantId: 'inviting-tenant', tenantName: 'Example Operations', alreadyAccepted: false }),
    });
  });
  await page.route('**/api/tenants/inviting-tenant/switch', async (route) => {
    tenantSwitches += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`http://127.0.0.1:5000${INVITE_PATH}`);
  await page.getByLabel('Full name').fill('New Team Member');
  await page.getByLabel('Create password').fill('InvitePassword9!');
  await page.getByLabel('Confirm password').fill('InvitePassword9!');
  await page.getByTestId('button-invite-register').click();

  await expect(page.getByTestId('panel-invite-decision')).toBeVisible();
  await expect(page.getByText('Join Example Operations?')).toBeVisible();
  expect(registrations).toBe(1);
  expect(acceptances).toBe(0);
  expect(authChecks()).toBeGreaterThan(0);
  await expect(page).toHaveURL(`http://127.0.0.1:5000${INVITE_PATH}`);

  await page.getByTestId('button-invite-accept').click();
  await expect(page).toHaveURL('http://127.0.0.1:5000/app');
  expect(acceptances).toBe(1);
  expect(tenantSwitches).toBe(1);
});

test('existing account login waits for consent and decline preserves its workspace', async ({ page }) => {
  const authChecks = await mockFreshBrowser(page);
  await mockInvitation(page);
  let logins = 0;
  let declines = 0;
  let tenantSwitches = 0;

  await page.route('**/api/auth/login', async (route) => {
    logins += 1;
    expect(route.request().postDataJSON()).toMatchObject({ email: INVITED_EMAIL });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': 'operatoros_session=test-session; Path=/; HttpOnly; SameSite=Lax' },
      body: JSON.stringify({
        user: {
          id: 'existing-user',
          email: INVITED_EMAIL,
          name: 'Existing Team Member',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          currentTenantId: 'existing-tenant',
        },
      }),
    });
  });
  await page.route('**/api/invites/opaque-invitation-token/decline', async (route) => {
    declines += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tenantId: 'inviting-tenant', tenantName: 'Example Operations', alreadyDeclined: false }),
    });
  });
  await page.route('**/api/tenants/*/switch', async (route) => {
    tenantSwitches += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`http://127.0.0.1:5000${INVITE_PATH}`);
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByLabel('Password').fill('ExistingPassword9!');
  await page.getByTestId('button-invite-login').click();

  await expect(page.getByTestId('panel-invite-decision')).toBeVisible();
  expect(logins).toBe(1);
  expect(declines).toBe(0);
  expect(authChecks()).toBeGreaterThan(0);

  await page.getByTestId('button-invite-decline').click();
  await expect(page.getByTestId('text-invite-declined')).toContainText('Your current workspace and access remain unchanged.');
  await expect(page).toHaveURL(`http://127.0.0.1:5000${INVITE_PATH}`);
  expect(declines).toBe(1);
  expect(tenantSwitches).toBe(0);
});
