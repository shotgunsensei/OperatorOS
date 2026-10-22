import { getPublicOrigin, isLocalHost, isProductionHost, type PublicOriginInput } from './public-url.js';

/** Navigation only. These links confer no account, tenant or device authority. */
export function fieldNodeLinks(input: PublicOriginInput = {}, environment = 'production') {
  let origin = 'https://fieldnode.operatoros.net';
  let local = false;
  try {
    const url = new URL(getPublicOrigin(input));
    if (environment !== 'production' && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
        (isLocalHost(url.hostname) || (!isProductionHost(url.hostname) && url.hostname.endsWith('.replit.dev')))) {
      origin = url.origin;
      local = true;
    }
  } catch { /* Unknown/malformed origins use the canonical public destinations. */ }
  return local
    ? { introduction: `${origin}/fieldnode`, purchase: `${origin}/fieldnode#purchase`, manage: `${origin}/modules/fieldnode/manage` }
    : { introduction: 'https://fieldnode.operatoros.net/', purchase: 'https://operatoros.net/fieldnode#purchase', manage: 'https://fieldnode.operatoros.net/manage' };
}

/** Same-origin return paths work in production-built previews without client env disclosure. */
export function fieldNodeIntroductionPath(hostname: string, pathname: string): string {
  if (hostname === 'fieldnode.operatoros.net') return '/';
  return /^\/modules\/fieldnode(?:\/|$)/u.test(pathname) ? '/modules/fieldnode' : '/fieldnode';
}

/** Only an operator-configured, already verified OperatorOS hardware destination. */
export function fieldNodePurchaseUrl(configured: string | undefined): string | null {
  if (!configured || /[\\\s\u0000-\u001f\u007f]/u.test(configured)) return null;
  try {
    const url = new URL(configured);
    if (url.origin !== 'https://operatoros.net' || url.username || url.password || url.hash || url.search) return null;
    // A configured public destination must be unambiguous across proxy/router
    // decoding; encoded separators, controls and auth-path spellings fail closed.
    if (url.pathname.includes('%')) return null;
    if (url.pathname === '/' || /^\/(?:fieldnode\/?$|app(?:\/|$)|api(?:\/|$)|auth(?:\/|$)|login(?:\/|$)|logout(?:\/|$)|signup(?:\/|$)|register(?:\/|$)|forgot-password(?:\/|$)|reset-password(?:\/|$)|sso(?:\/|$))/u.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
