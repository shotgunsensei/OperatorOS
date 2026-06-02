/**
 * Ecosystem registry — the single source of truth for OperatorOS as the
 * central control plane for all related apps (e.g. `techdeck.app` →
 * `techdeck.operatoros.net`), while Replit remains the host.
 *
 * This registry is strictly *derived from* `MODULE_CATALOG` (the existing
 * single source of truth keyed by slug). Module identity — slug, name,
 * description, category — always comes from the catalog so the two can
 * never drift. The ecosystem-only fields (the ecosystem subdomain URL,
 * legacy URL, launch/auth/billing modes, status, icon key, ordering) are
 * layered on top here.
 *
 * Slug reconciliation (catalog slug ← requested ecosystem name):
 *   brandforgeos       ← "brandforge"   → brandforge.operatoros.net
 *   studyforge-ai      ← "studyforge"   → studyforge.operatoros.net
 *   ninja-launch-kit   ← "launchkit"    → launchkit.operatoros.net
 *   callcommand-ai     ← "callcommand"  → callcommand.operatoros.net
 *   techdeck, tradeflowkit, pulsedesk, snapproofos, faultlinelab,
 *   ninjamation, torqueshed                     map 1:1
 *
 * The ecosystem subdomain *label* can differ from the internal slug, so
 * every module carries an explicit `ecosystemUrl` rather than blindly
 * deriving it from the slug.
 *
 * This module performs no I/O and forces no redirects — it is pure data
 * plus pure helper functions, safe to import from both the API and the
 * web app.
 */

import {
  MODULE_CATALOG,
  type ModuleCatalogEntry,
  type ModuleCategory,
  type ModuleStatus,
} from './catalog.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Ecosystem-level lifecycle for a module's public subdomain presence. */
export type EcosystemModuleStatus = 'active' | 'planned' | 'beta';

/** How OperatorOS launches the module from the ecosystem launcher. */
export type EcosystemLaunchMode = 'subdomain' | 'external' | 'internal';

/** Where the module's authentication is owned. */
export type EcosystemAuthMode = 'sso' | 'standalone';

/** Where the module's billing is owned. */
export type EcosystemBillingMode = 'operatoros' | 'standalone';

export interface EcosystemModule {
  /** Internal catalog slug — the join key back to `MODULE_CATALOG`. */
  slug: string;
  name: string;
  category: ModuleCategory;
  description: string;
  /** Canonical ecosystem URL, e.g. `https://techdeck.operatoros.net`. */
  ecosystemUrl: string;
  /** Pre-migration URL, e.g. `https://techdeck.app`. Present only when one exists. */
  legacyUrl?: string;
  status: EcosystemModuleStatus;
  launchMode: EcosystemLaunchMode;
  authMode: EcosystemAuthMode;
  billingMode: EcosystemBillingMode;
  /** Stable key a UI can map to an icon. Defaults to the slug. */
  iconKey: string;
  /** Ecosystem display order (Tech Deck is first). */
  ord: number;
}

export interface PlatformDomains {
  root: string;
  app: string;
  api: string;
  admin: string;
  auth: string;
  docs: string;
  status: string;
}

export interface EcosystemRegistry {
  platformDomains: PlatformDomains;
  modules: EcosystemModule[];
}

export interface OperatorOSHostInfo {
  /** Normalized hostname (lower-cased, port stripped). */
  hostname: string;
  /** Sub-label in front of the root domain, or null on the root / foreign hosts. */
  subdomain: string | null;
  isRootDomain: boolean;
  isAppDomain: boolean;
  isApiDomain: boolean;
  isAdminDomain: boolean;
  /** Matched module slug when the subdomain maps to an ecosystem module. */
  matchedModuleSlug: string | null;
}

// ---------------------------------------------------------------------------
// Platform domains
// ---------------------------------------------------------------------------

/** The ecosystem root domain (bare hostname, no scheme). */
export const ECOSYSTEM_ROOT_DOMAIN = 'operatoros.net';

export const PLATFORM_DOMAINS: PlatformDomains = {
  root: `https://${ECOSYSTEM_ROOT_DOMAIN}`,
  app: `https://app.${ECOSYSTEM_ROOT_DOMAIN}`,
  api: `https://api.${ECOSYSTEM_ROOT_DOMAIN}`,
  admin: `https://admin.${ECOSYSTEM_ROOT_DOMAIN}`,
  auth: `https://auth.${ECOSYSTEM_ROOT_DOMAIN}`,
  docs: `https://docs.${ECOSYSTEM_ROOT_DOMAIN}`,
  status: `https://status.${ECOSYSTEM_ROOT_DOMAIN}`,
};

// ---------------------------------------------------------------------------
// Per-module ecosystem overlay
//
// Everything not listed here falls back to sensible defaults: the
// subdomain label equals the slug, status derives from the catalog's
// `defaultStatus`, launch is `subdomain`, auth is `sso`, billing is
// `operatoros`, and the icon key equals the slug.
// ---------------------------------------------------------------------------

interface EcosystemOverride {
  /** Ecosystem subdomain label when it differs from the slug. */
  subdomain?: string;
  legacyUrl?: string;
  status?: EcosystemModuleStatus;
  launchMode?: EcosystemLaunchMode;
  authMode?: EcosystemAuthMode;
  billingMode?: EcosystemBillingMode;
  iconKey?: string;
  /** Force this module to the front of the ecosystem ordering. */
  first?: boolean;
}

const ECOSYSTEM_OVERRIDES: Readonly<Record<string, EcosystemOverride>> = {
  techdeck: { legacyUrl: 'https://techdeck.app', first: true },
  brandforgeos: { subdomain: 'brandforge' },
  'studyforge-ai': { subdomain: 'studyforge' },
  'ninja-launch-kit': { subdomain: 'launchkit' },
  'callcommand-ai': { subdomain: 'callcommand' },
};

function ecosystemSubdomain(slug: string): string {
  return ECOSYSTEM_OVERRIDES[slug]?.subdomain ?? slug;
}

function catalogStatusToEcosystem(s: ModuleStatus): EcosystemModuleStatus {
  if (s === 'coming_soon') return 'planned';
  if (s === 'beta') return 'beta';
  return 'active';
}

function buildEcosystemModule(entry: ModuleCatalogEntry, ord: number): EcosystemModule {
  const o = ECOSYSTEM_OVERRIDES[entry.slug] ?? {};
  const subdomain = ecosystemSubdomain(entry.slug);
  const module: EcosystemModule = {
    slug: entry.slug,
    name: entry.name,
    category: entry.category,
    description: entry.description,
    ecosystemUrl: `https://${subdomain}.${ECOSYSTEM_ROOT_DOMAIN}`,
    status: o.status ?? catalogStatusToEcosystem(entry.defaultStatus),
    launchMode: o.launchMode ?? 'subdomain',
    authMode: o.authMode ?? 'sso',
    billingMode: o.billingMode ?? 'operatoros',
    iconKey: o.iconKey ?? entry.slug,
    ord,
  };
  if (o.legacyUrl) module.legacyUrl = o.legacyUrl;
  return module;
}

// Ordering: any module flagged `first` (Tech Deck) leads, then the rest
// follow the catalog's own `ord`. `ord` on the resulting records is the
// 1-based ecosystem position.
const ORDERED_CATALOG: ModuleCatalogEntry[] = [...MODULE_CATALOG].sort((a, b) => {
  const af = ECOSYSTEM_OVERRIDES[a.slug]?.first ? 0 : 1;
  const bf = ECOSYSTEM_OVERRIDES[b.slug]?.first ? 0 : 1;
  if (af !== bf) return af - bf;
  return a.ord - b.ord;
});

export const ECOSYSTEM_MODULES: readonly EcosystemModule[] = Object.freeze(
  ORDERED_CATALOG.map((entry, i) => buildEcosystemModule(entry, i + 1)),
);

export const ECOSYSTEM_MODULES_BY_SLUG: Readonly<Record<string, EcosystemModule>> =
  Object.freeze(Object.fromEntries(ECOSYSTEM_MODULES.map(m => [m.slug, m])));

/** Reverse lookup: ecosystem subdomain label → catalog slug. */
const SLUG_BY_SUBDOMAIN: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(MODULE_CATALOG.map(m => [ecosystemSubdomain(m.slug), m.slug])),
);

// ---------------------------------------------------------------------------
// Helpers — URL / filter resolution. No hard-coded URLs anywhere else.
// ---------------------------------------------------------------------------

export function getAllModules(): EcosystemModule[] {
  return [...ECOSYSTEM_MODULES];
}

export function getEcosystemModule(slug: string): EcosystemModule | undefined {
  return ECOSYSTEM_MODULES_BY_SLUG[slug];
}

export function getModuleUrl(slug: string): string | undefined {
  return getEcosystemModule(slug)?.ecosystemUrl;
}

export function getLegacyUrl(slug: string): string | undefined {
  return getEcosystemModule(slug)?.legacyUrl;
}

export function getActiveModules(): EcosystemModule[] {
  return ECOSYSTEM_MODULES.filter(m => m.status === 'active');
}

export function getPlannedModules(): EcosystemModule[] {
  return ECOSYSTEM_MODULES.filter(m => m.status === 'planned');
}

export function getModulesByCategory(category: ModuleCategory): EcosystemModule[] {
  return ECOSYSTEM_MODULES.filter(m => m.category === category);
}

/** The full machine-readable registry (modules + platform domains). */
export function getEcosystemRegistry(): EcosystemRegistry {
  return {
    platformDomains: PLATFORM_DOMAINS,
    modules: getAllModules(),
  };
}

// ---------------------------------------------------------------------------
// Host detection — pure classifier, no redirects, safe for any hostname
// (including the current Replit `*.janeway.replit.dev` and localhost).
// ---------------------------------------------------------------------------

export function detectOperatorOSHost(hostname: string): OperatorOSHostInfo {
  const host = (hostname ?? '').toString().trim().toLowerCase().split(':')[0];
  const base: OperatorOSHostInfo = {
    hostname: host,
    subdomain: null,
    isRootDomain: false,
    isAppDomain: false,
    isApiDomain: false,
    isAdminDomain: false,
    matchedModuleSlug: null,
  };

  if (!host) return base;

  const root = ECOSYSTEM_ROOT_DOMAIN;
  // Foreign host (Replit dev domain, localhost, custom domains, etc.).
  if (host !== root && !host.endsWith(`.${root}`)) return base;

  // Bare root domain.
  if (host === root) return { ...base, isRootDomain: true };

  // `<label>.operatoros.net` — `label` may itself be multi-level
  // (e.g. `api.staging`); the left-most segment is the primary subdomain.
  const label = host.slice(0, host.length - root.length - 1);
  const primary = label.split('.')[0];

  // Treat `www` as the root domain.
  if (primary === 'www') return { ...base, subdomain: label, isRootDomain: true };

  return {
    ...base,
    subdomain: label,
    isAppDomain: primary === 'app',
    isApiDomain: primary === 'api',
    isAdminDomain: primary === 'admin',
    matchedModuleSlug: SLUG_BY_SUBDOMAIN[primary] ?? null,
  };
}
