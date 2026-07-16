import { PLATFORM_DOMAINS } from '../sdk/src/ecosystem.js';

export const OPERATOROS_NAVIGATION_CONTRACT_VERSION = 'v1' as const;
export const DEFAULT_OPERATOROS_APPS_URL = `${PLATFORM_DOMAINS.app}/`;

export interface OperatorOSNavigationUrls {
  homeUrl: string;
  appsUrl: string;
  profileUrl: string;
  billingUrl: string;
  supportUrl: string;
  logoutUrl: string;
}

export interface OperatorOSNavigationIdentity {
  currentUser: {
    id: string;
    email: string;
    name: string | null;
  };
  tenant: {
    id: string;
    slug: string;
    type: string;
    status: string;
  };
  role: {
    tenant: string;
    platform: string;
  };
  entitlements: readonly {
    key: string;
    enabled: boolean;
    source: string | null;
  }[];
}

export interface OperatorOSModuleNavigationContract extends OperatorOSNavigationUrls, OperatorOSNavigationIdentity {
  version: typeof OPERATOROS_NAVIGATION_CONTRACT_VERSION;
  module: { id: string; slug: string; name: string };
  theme: {
    brand: 'OperatorOS';
    mode: 'dark';
    accent: '#ef4444';
    logoUrl: string;
  };
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Resolve the one trusted My Apps destination. Production accepts only the
 * registered app host; development may use an explicit loopback URL. Query,
 * fragment, credentials, and arbitrary hosts are rejected so this value can
 * never become an open-redirect primitive.
 */
export function resolveOperatorOSAppsUrl(
  configuredUrl?: string | null,
  environment: string = 'production',
): string {
  const production = ['production', 'prod'].includes(environment.toLowerCase());
  const fallback = production ? DEFAULT_OPERATOROS_APPS_URL : 'http://localhost:5000/app';
  const raw = configuredUrl?.trim() || fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('OPERATOROS_APPS_URL must be an absolute URL');
  }

  const isProductionApp = parsed.protocol === 'https:' && parsed.origin === PLATFORM_DOMAINS.app;
  const isLocalDevelopment = !production && ['http:', 'https:'].includes(parsed.protocol) && isLoopback(parsed.hostname);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (!isProductionApp && !isLocalDevelopment)
  ) {
    throw new Error('OPERATOROS_APPS_URL must use the registered app host (or loopback in development) without credentials, query, or fragment');
  }

  if (isProductionApp && parsed.pathname !== '/') {
    throw new Error('Production OPERATOROS_APPS_URL must equal https://app.operatoros.net/');
  }
  if (isLocalDevelopment && parsed.pathname !== '/' && parsed.pathname !== '/app') {
    throw new Error('Development OPERATOROS_APPS_URL path must be / or /app');
  }
  return parsed.toString();
}

export function buildOperatorOSNavigationUrls(appsUrl = DEFAULT_OPERATOROS_APPS_URL): OperatorOSNavigationUrls {
  const canonicalAppsUrl = resolveOperatorOSAppsUrl(
    appsUrl,
    new URL(appsUrl).hostname === 'app.operatoros.net' ? 'production' : 'development',
  );
  const consoleUrl = new URL(canonicalAppsUrl);
  const pageUrl = (page: string) => {
    const url = new URL(consoleUrl);
    url.searchParams.set('page', page);
    return url.toString();
  };
  const logout = new URL('/logout', consoleUrl.origin);
  logout.searchParams.set('return_to', `${PLATFORM_DOMAINS.root}/signed-out`);

  return {
    homeUrl: `${PLATFORM_DOMAINS.root}/`,
    appsUrl: canonicalAppsUrl,
    profileUrl: pageUrl('settings'),
    billingUrl: pageUrl('billing'),
    supportUrl: `${PLATFORM_DOMAINS.root}/john`,
    logoutUrl: logout.toString(),
  };
}

export const DEFAULT_OPERATOROS_NAVIGATION_URLS = Object.freeze(buildOperatorOSNavigationUrls());
