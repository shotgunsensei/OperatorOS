import {
  ECOSYSTEM_ROOT_DOMAIN,
  getAllModules as getEcosystemModules,
  getModuleUrl,
  PLATFORM_DOMAINS,
  type EcosystemModule,
  type EcosystemModuleStatus,
} from '../sdk/src/ecosystem.js';
import {
  MODULE_CATALOG_BY_SLUG,
  type ModuleCatalogEntry,
  type ModuleCategory,
} from '../sdk/src/catalog.js';
import {
  SESSION_COOKIE_NAME,
  hasPlatformAdminAuthority,
  type OperatorOSUserLike,
} from '../auth/index.js';

export type OperatorOSModuleStatus = 'active' | 'planned' | 'hidden' | 'disabled';
export type OperatorOSModuleCategory = 'platform' | ModuleCategory;
export type OperatorOSHostSurface = 'root' | 'app' | 'auth' | 'api' | 'module' | 'local-module' | 'unknown';
export type OperatorOSModuleRouteStatus =
  | 'public'
  | 'allowed'
  | 'unauthenticated'
  | 'access_denied'
  | 'module_unavailable'
  | 'unknown_host';

export interface OperatorOSModuleRegistryEntry {
  id: string;
  name: string;
  slug: string;
  hostname: string;
  localDevHost: string | null;
  localPathFallback: string;
  routePath: string;
  defaultRoute: string;
  launchUrl: string;
  description: string;
  category: OperatorOSModuleCategory;
  entitlementKey: string;
  status: OperatorOSModuleStatus;
  iconName: string;
  requiresSubscription: boolean;
  requiresTenant: boolean;
}

export interface ModuleEntitlementEntry {
  id?: string;
  slug?: string;
  entitlementKey?: string;
  enabled?: boolean;
}

export type ModuleEntitlementInput =
  | {
      modules?: readonly ModuleEntitlementEntry[];
      [key: string]: unknown;
    }
  | Record<string, boolean | ModuleEntitlementEntry | undefined>
  | null
  | undefined;

export type HeaderReaderLike =
  | {
      get(name: string): string | null | undefined;
    }
  | Record<string, string | readonly string[] | undefined>
  | null
  | undefined;

export type CookieReaderLike =
  | {
      get(name: string): { value?: string } | string | undefined;
      has?(name: string): boolean;
    }
  | Record<string, { value?: string } | string | undefined>
  | null
  | undefined;

export interface ResolveModuleContextRequest {
  url?: string | null;
  host?: string | null;
  pathname?: string | null;
  headers?: HeaderReaderLike;
  cookies?: CookieReaderLike;
  user?: OperatorOSUserLike | null;
  entitlements?: ModuleEntitlementInput;
}

export interface OperatorOSModuleAccessDecision {
  status: OperatorOSModuleRouteStatus;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  entitlementChecked: boolean;
  hasEntitlement: boolean | null;
  reason: string | null;
}

export interface ResolvedOperatorOSModuleContext extends OperatorOSModuleAccessDecision {
  host: string;
  pathname: string;
  surface: OperatorOSHostSurface;
  module: OperatorOSModuleRegistryEntry | null;
  isKnownHost: boolean;
  isOperatorOSHost: boolean;
  isLocalFallback: boolean;
  routePath: string | null;
  localRoutePath: string | null;
  redirectTo: string | null;
}

function hostnameFromUrl(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function statusFromEcosystem(status: EcosystemModuleStatus): OperatorOSModuleStatus {
  if (status === 'planned') return 'planned';
  return 'active';
}

function routeFor(slug: string): string {
  return `/app/apps/${slug}`;
}

function localFallbackFor(slug: string): string {
  return `/modules/${slug}`;
}

function toRegistryEntry(module: EcosystemModule): OperatorOSModuleRegistryEntry {
  const catalog = MODULE_CATALOG_BY_SLUG[module.slug] as ModuleCatalogEntry | undefined;
  return {
    id: module.slug,
    name: module.name,
    slug: module.slug,
    hostname: hostnameFromUrl(module.ecosystemUrl),
    localDevHost: null,
    localPathFallback: localFallbackFor(module.slug),
    routePath: routeFor(module.slug),
    defaultRoute: routeFor(module.slug),
    launchUrl: module.ecosystemUrl,
    description: module.description,
    category: module.category,
    entitlementKey: module.slug,
    status: statusFromEcosystem(module.status),
    iconName: module.iconKey,
    requiresSubscription: true,
    requiresTenant: true,
    ...(catalog
      ? {
          category: catalog.category,
          description: catalog.description,
        }
      : {}),
  };
}

const OPERATOROS_MODULE: OperatorOSModuleRegistryEntry = Object.freeze({
  id: 'operatoros',
  name: 'OperatorOS',
  slug: 'operatoros',
  hostname: hostnameFromUrl(PLATFORM_DOMAINS.app),
  localDevHost: null,
  localPathFallback: '/app',
  routePath: '/app',
  defaultRoute: '/app',
  launchUrl: PLATFORM_DOMAINS.app,
  description: 'Parent command center, identity, tenant, billing, entitlement, and module launch control plane.',
  category: 'platform',
  entitlementKey: 'operatoros',
  status: 'active',
  iconName: 'operatoros',
  requiresSubscription: false,
  requiresTenant: false,
});

export const OPERATOROS_MODULE_REGISTRY: readonly OperatorOSModuleRegistryEntry[] = Object.freeze([
  OPERATOROS_MODULE,
  ...getEcosystemModules().map(toRegistryEntry),
]);

const MODULES_BY_ID: ReadonlyMap<string, OperatorOSModuleRegistryEntry> = new Map(
  OPERATOROS_MODULE_REGISTRY.map(module => [module.id, module]),
);

const MODULES_BY_HOST: ReadonlyMap<string, OperatorOSModuleRegistryEntry> = new Map([
  ...OPERATOROS_MODULE_REGISTRY.map(module => [module.hostname, module] as const),
  [ECOSYSTEM_ROOT_DOMAIN, OPERATOROS_MODULE] as const,
  [`www.${ECOSYSTEM_ROOT_DOMAIN}`, OPERATOROS_MODULE] as const,
  [hostnameFromUrl(PLATFORM_DOMAINS.auth), OPERATOROS_MODULE] as const,
  [hostnameFromUrl(PLATFORM_DOMAINS.api), OPERATOROS_MODULE] as const,
  [hostnameFromUrl(PLATFORM_DOMAINS.admin), OPERATOROS_MODULE] as const,
]);

export function normalizeHost(input: string | null | undefined): string {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return '';

  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/\.$/, '');
  } catch {
    return raw.split('/')[0]?.split(':')[0]?.replace(/\.$/, '') ?? '';
  }
}

function getHeaderValue(headers: HeaderReaderLike, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null | undefined }).get(name) ?? undefined;
  }

  const record = headers as Record<string, string | readonly string[] | undefined>;
  const direct = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  if (typeof direct === 'string') return direct;
  return direct?.[0];
}

function getRequestHost(request: ResolveModuleContextRequest): string {
  const explicitHost = request.host?.trim();
  if (explicitHost) return normalizeHost(explicitHost);

  const forwarded = getHeaderValue(request.headers, 'x-forwarded-host');
  if (forwarded) return normalizeHost(forwarded.split(',')[0] ?? forwarded);

  const host = getHeaderValue(request.headers, 'host');
  if (host) return normalizeHost(host);

  if (request.url) {
    try {
      return normalizeHost(new URL(request.url).host);
    } catch {
      return '';
    }
  }

  return '';
}

function getRequestPathname(request: ResolveModuleContextRequest): string {
  if (request.pathname?.startsWith('/')) return request.pathname;
  if (request.url) {
    try {
      return new URL(request.url).pathname || '/';
    } catch {
      return request.url.startsWith('/') ? request.url.split('?')[0] || '/' : '/';
    }
  }
  return '/';
}

function hasSessionCookie(cookies: CookieReaderLike): boolean {
  if (!cookies) return false;
  if (
    typeof (cookies as { has?: unknown }).has === 'function' &&
    (cookies as { has(name: string): boolean }).has(SESSION_COOKIE_NAME)
  ) {
    return true;
  }

  const value = typeof (cookies as { get?: unknown }).get === 'function'
    ? (cookies as { get(name: string): { value?: string } | string | undefined }).get(SESSION_COOKIE_NAME)
    : (cookies as Record<string, { value?: string } | string | undefined>)[SESSION_COOKIE_NAME];

  if (typeof value === 'string') return value.length > 0;
  return typeof value?.value === 'string' && value.value.length > 0;
}

function isOperatorOSDomainHost(host: string): boolean {
  return host === ECOSYSTEM_ROOT_DOMAIN || host.endsWith(`.${ECOSYSTEM_ROOT_DOMAIN}`);
}

function localModuleSlugFromPath(pathname: string): string | undefined {
  const match = /^\/modules\/([^/?#]+)/.exec(pathname);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function getHostSurface(host: string | null | undefined): OperatorOSHostSurface {
  const normalized = normalizeHost(host);
  if (!normalized) return 'unknown';
  if (normalized === ECOSYSTEM_ROOT_DOMAIN || normalized === `www.${ECOSYSTEM_ROOT_DOMAIN}`) return 'root';
  if (normalized === hostnameFromUrl(PLATFORM_DOMAINS.app)) return 'app';
  if (normalized === hostnameFromUrl(PLATFORM_DOMAINS.auth)) return 'auth';
  if (normalized === hostnameFromUrl(PLATFORM_DOMAINS.api)) return 'api';

  const module = getModuleByHost(normalized);
  if (module && module.id !== OPERATOROS_MODULE.id) return 'module';

  return 'unknown';
}

export function moduleEnabledByEntitlements(
  module: OperatorOSModuleRegistryEntry,
  entitlements: ModuleEntitlementInput,
): boolean {
  if (!module.requiresSubscription) return true;
  if (!entitlements) return false;

  const records = Array.isArray((entitlements as { modules?: unknown }).modules)
    ? ((entitlements as { modules?: readonly ModuleEntitlementEntry[] }).modules ?? [])
    : [];
  const match = records.find(entry =>
    entry.id === module.id ||
    entry.slug === module.slug ||
    entry.entitlementKey === module.entitlementKey
  );
  if (match) return match.enabled === true;

  const direct = (entitlements as Record<string, boolean | ModuleEntitlementEntry | undefined>)[module.entitlementKey]
    ?? (entitlements as Record<string, boolean | ModuleEntitlementEntry | undefined>)[module.slug]
    ?? (entitlements as Record<string, boolean | ModuleEntitlementEntry | undefined>)[module.id];
  if (typeof direct === 'boolean') return direct;
  if (direct && typeof direct === 'object') return direct.enabled === true;

  return false;
}

export function getModuleById(id: string): OperatorOSModuleRegistryEntry | undefined {
  return MODULES_BY_ID.get(id);
}

export function getModuleBySlug(slug: string): OperatorOSModuleRegistryEntry | undefined {
  return OPERATOROS_MODULE_REGISTRY.find(module => module.slug === slug);
}

export function getModuleByHost(host: string): OperatorOSModuleRegistryEntry | undefined {
  return MODULES_BY_HOST.get(normalizeHost(host));
}

export function resolveModuleRouteAccess(
  module: OperatorOSModuleRegistryEntry,
  request: Pick<ResolveModuleContextRequest, 'cookies' | 'user' | 'entitlements'> = {},
): OperatorOSModuleAccessDecision {
  const isAuthenticated = !!request.user || hasSessionCookie(request.cookies);
  const isPlatformAdmin = hasPlatformAdminAuthority(request.user ?? null);

  if (module.status !== 'active') {
    return {
      status: 'module_unavailable',
      isAuthenticated,
      isPlatformAdmin,
      entitlementChecked: false,
      hasEntitlement: null,
      reason: `Module status is ${module.status}`,
    };
  }

  if (!isAuthenticated) {
    return {
      status: 'unauthenticated',
      isAuthenticated: false,
      isPlatformAdmin,
      entitlementChecked: false,
      hasEntitlement: null,
      reason: 'Authentication required',
    };
  }

  if (isPlatformAdmin) {
    return {
      status: 'allowed',
      isAuthenticated,
      isPlatformAdmin,
      entitlementChecked: false,
      hasEntitlement: true,
      reason: 'Platform admin override',
    };
  }

  const entitlementChecked = request.entitlements !== undefined && request.entitlements !== null;
  if (module.requiresSubscription && entitlementChecked) {
    const hasEntitlement = moduleEnabledByEntitlements(module, request.entitlements);
    if (!hasEntitlement) {
      return {
        status: 'access_denied',
        isAuthenticated,
        isPlatformAdmin,
        entitlementChecked,
        hasEntitlement,
        reason: 'Module entitlement required',
      };
    }
    return {
      status: 'allowed',
      isAuthenticated,
      isPlatformAdmin,
      entitlementChecked,
      hasEntitlement,
      reason: null,
    };
  }

  return {
    status: 'allowed',
    isAuthenticated,
    isPlatformAdmin,
    entitlementChecked,
    hasEntitlement: module.requiresSubscription ? null : true,
    reason: null,
  };
}

export function resolveModuleContext(
  request: ResolveModuleContextRequest,
): ResolvedOperatorOSModuleContext {
  const host = getRequestHost(request);
  const pathname = getRequestPathname(request);
  const localSlug = localModuleSlugFromPath(pathname);
  const localModule = localSlug ? getModuleBySlug(localSlug) : undefined;
  const isLocalFallback = !!localSlug;
  const surface = isLocalFallback ? 'local-module' : getHostSurface(host);
  const isOperatorOSHost = isOperatorOSDomainHost(host);

  if (isLocalFallback || surface === 'module') {
    const module = isLocalFallback ? localModule : getModuleByHost(host);
    if (!module || module.id === OPERATOROS_MODULE.id) {
      const isAuthenticated = !!request.user || hasSessionCookie(request.cookies);
      const isPlatformAdmin = hasPlatformAdminAuthority(request.user ?? null);
      return {
        host,
        pathname,
        surface,
        module: null,
        isKnownHost: false,
        isOperatorOSHost,
        isLocalFallback,
        routePath: null,
        localRoutePath: localSlug ? localFallbackFor(localSlug) : null,
        redirectTo: null,
        status: 'unknown_host',
        isAuthenticated,
        isPlatformAdmin,
        entitlementChecked: false,
        hasEntitlement: null,
        reason: localSlug ? `Unknown module slug: ${localSlug}` : 'Unknown module host',
      };
    }

    const access = resolveModuleRouteAccess(module, request);
    return {
      ...access,
      host,
      pathname,
      surface,
      module,
      isKnownHost: true,
      isOperatorOSHost,
      isLocalFallback,
      routePath: module.routePath,
      localRoutePath: module.localPathFallback || localFallbackFor(module.slug),
      redirectTo: access.status === 'unauthenticated'
        ? `/login?next=${encodeURIComponent(pathname)}`
        : null,
    };
  }

  if (isOperatorOSHost && surface === 'unknown') {
    const isAuthenticated = !!request.user || hasSessionCookie(request.cookies);
    const isPlatformAdmin = hasPlatformAdminAuthority(request.user ?? null);
    return {
      host,
      pathname,
      surface,
      module: null,
      isKnownHost: false,
      isOperatorOSHost,
      isLocalFallback: false,
      routePath: null,
      localRoutePath: null,
      redirectTo: null,
      status: 'unknown_host',
      isAuthenticated,
      isPlatformAdmin,
      entitlementChecked: false,
      hasEntitlement: null,
      reason: 'Unknown OperatorOS subdomain',
    };
  }

  const module = getModuleByHost(host) ?? (surface === 'unknown' ? null : OPERATOROS_MODULE);
  const isAuthenticated = !!request.user || hasSessionCookie(request.cookies);
  const isPlatformAdmin = hasPlatformAdminAuthority(request.user ?? null);
  return {
    host,
    pathname,
    surface,
    module,
    isKnownHost: !!module || ['root', 'app', 'auth', 'api'].includes(surface),
    isOperatorOSHost,
    isLocalFallback: false,
    routePath: module?.routePath ?? null,
    localRoutePath: module?.localPathFallback ?? null,
    redirectTo: null,
    status: 'public',
    isAuthenticated,
    isPlatformAdmin,
    entitlementChecked: false,
    hasEntitlement: module?.requiresSubscription === false ? true : null,
    reason: null,
  };
}

export function getActiveModules(): OperatorOSModuleRegistryEntry[] {
  return OPERATOROS_MODULE_REGISTRY.filter(module => module.status === 'active');
}

export function getLaunchableModulesForEntitlements(
  entitlements: ModuleEntitlementInput,
): OperatorOSModuleRegistryEntry[] {
  return getActiveModules().filter(module => moduleEnabledByEntitlements(module, entitlements));
}

export function isKnownModuleHost(host: string): boolean {
  return !!getModuleByHost(host);
}

export function getModuleLaunchUrl(id: string): string | undefined {
  const module = getModuleById(id);
  if (!module) return undefined;
  return module.launchUrl || getModuleUrl(module.slug);
}
