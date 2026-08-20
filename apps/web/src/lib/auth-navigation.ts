/**
 * Decide whether an unauthenticated browser should clear its local session
 * and restart the central SSO flow.
 *
 * Invitation pages are deliberately public, same-origin authentication
 * surfaces. Their initial /auth/me request is expected to return 401 in a
 * fresh browser, and that response must leave the recipient on the invite so
 * the page can render account creation or sign-in.
 */
export function shouldRestartCentralAuth(hostname: string, pathname: string): boolean {
  const host = hostname.toLowerCase();
  if (pathname.startsWith('/app/invites/')) return false;
  if (host === 'auth.operatoros.net' || host === 'api.operatoros.net') return false;
  if (host === 'operatoros.net') return pathname === '/app' || pathname.startsWith('/app/');
  return host === 'app.operatoros.net' || host.endsWith('.operatoros.net');
}
