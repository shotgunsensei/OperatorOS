import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const E2E_API_URL = process.env.E2E_API_URL ?? 'http://localhost:5001';
export const E2E_WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:5000';

interface RegisterAndLoginOptions {
  email: string;
  password: string;
  name: string;
}

interface SessionUser {
  id: string;
  email: string;
  [key: string]: unknown;
}

/**
 * Register and sign in through the public production contract. The supplied
 * request context must be the Page's BrowserContext.request instance so the
 * API Set-Cookie response enters the browser-owned cookie jar directly.
 */
export async function registerAndLogin(
  api: APIRequestContext,
  options: RegisterAndLoginOptions,
): Promise<SessionUser> {
  const registration = await api.post(`${E2E_API_URL}/v1/auth/register`, {
    data: options,
  });
  expect(
    registration.ok(),
    `register ${options.email}: ${registration.status()} ${await registration.text()}`,
  ).toBeTruthy();

  const login = await api.post(`${E2E_API_URL}/v1/auth/login`, {
    data: { email: options.email, password: options.password },
  });
  expect(
    login.ok(),
    `login ${options.email}: ${login.status()} ${await login.text()}`,
  ).toBeTruthy();

  const body = await login.json() as { user?: SessionUser; token?: unknown };
  expect(body.user?.id, `login ${options.email} must return a user id`).toBeTruthy();
  expect(body.token, 'browser login must not return a script-readable session token').toBeUndefined();

  const setCookie = login.headersArray()
    .find(({ name, value }) => name.toLowerCase() === 'set-cookie'
      && value.startsWith('operatoros_session='))
    ?.value;
  expect(setCookie, 'login must issue operatoros_session').toBeTruthy();
  expect(setCookie, 'operatoros_session must remain HttpOnly')
    .toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(setCookie, 'operatoros_session must remain host-only')
    .not.toMatch(/;\s*Domain=/i);

  const apiHost = new URL(E2E_API_URL).hostname;
  const webHost = new URL(E2E_WEB_URL).hostname;
  expect(
    webHost,
    'cookie-session E2E requires API and web to share the same local hostname',
  ).toBe(apiHost);

  const state = await api.storageState();
  const sessionCookie = state.cookies.find(({ name }) => name === 'operatoros_session');
  expect(sessionCookie, 'operatoros_session must enter the BrowserContext cookie jar').toBeTruthy();
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.domain).toBe(apiHost);

  return body.user as SessionUser;
}

/** Resolve and pin the server-owned active tenant using cookie authentication. */
export async function resolveCurrentTenant(api: APIRequestContext): Promise<string> {
  const tenants = await api.get(`${E2E_API_URL}/v1/me/tenants`);
  expect(
    tenants.ok(),
    `list tenants: ${tenants.status()} ${await tenants.text()}`,
  ).toBeTruthy();

  const body = await tenants.json() as {
    current?: string | null;
    tenants?: Array<{ id: string }>;
  };
  const tenantId = body.current ?? body.tenants?.[0]?.id;
  expect(tenantId, 'registered user must have a personal tenant').toBeTruthy();

  const switched = await api.post(`${E2E_API_URL}/v1/tenants/${tenantId}/switch`);
  expect(
    switched.ok(),
    `switch tenant: ${switched.status()} ${await switched.text()}`,
  ).toBeTruthy();

  return tenantId as string;
}

/** Prove the rendered SPA did not copy authentication material into web storage. */
export async function expectNoScriptReadableAuth(page: Page): Promise<void> {
  const exposed = await page.evaluate(() => {
    const authKeys = ['token', 'auth_token', 'access_token', 'jwt'];
    return {
      local: authKeys.filter((key) => window.localStorage.getItem(key) !== null),
      session: authKeys.filter((key) => window.sessionStorage.getItem(key) !== null),
    };
  });

  expect(exposed).toEqual({ local: [], session: [] });
}
