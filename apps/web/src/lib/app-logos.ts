/**
 * App logo registry — the single source of truth mapping an ecosystem
 * module's stable `iconKey` to a real brand logo asset.
 *
 * Task #129: the /apps catalog (and any other surface that shows an app
 * badge) used to render a colored monogram of the app's initials as a
 * stand-in. Real per-app logos now live in `apps/web/public/app-logos/`
 * and are wired up here, keyed by `iconKey` (which defaults to the
 * module slug — see `packages/sdk/src/ecosystem.ts`). Keying by
 * `iconKey` rather than hard-coding paths at each call site means the
 * catalog and per-app surfaces can never drift.
 *
 * To add a logo for an app:
 *   1. Drop the file in `apps/web/public/app-logos/` (transparent png or
 *      svg). Name it after the module's `iconKey`, e.g.
 *      `tradeflowkit.png`.
 *   2. Add an entry below mapping the `iconKey` to its public path.
 *
 * Any module without an entry here gracefully falls back to the monogram
 * badge (see `AppLogo`), so the catalog never breaks when a logo is
 * missing.
 */

/**
 * iconKey -> public asset path (served from `apps/web/public`).
 * Only list keys whose asset file actually exists; missing keys fall
 * back to the monogram badge.
 */
export const APP_LOGO_BY_ICON_KEY: Readonly<Record<string, string>> = {
  tradeflowkit: '/app-logos/tradeflowkit.png',
  techdeck: '/app-logos/techdeck.png',
  torqueshed: '/app-logos/torqueshed.png',
  ninjamation: '/app-logos/ninjamation.png',
  snapproofos: '/app-logos/snapproofos.png',
  pulsedesk: '/app-logos/pulsedesk.png',
  faultlinelab: '/app-logos/faultlinelab.png',
};

/** Resolve a logo asset path for an `iconKey`, or `undefined` if none. */
export function getAppLogoSrc(iconKey: string | null | undefined): string | undefined {
  if (!iconKey) return undefined;
  return APP_LOGO_BY_ICON_KEY[iconKey];
}

/**
 * Compact monogram used as the graceful per-app fallback when no real
 * logo asset is mapped. Prefers the first two capitalised initials
 * (e.g. "TradeFlowKit" -> "TF"), otherwise the first two letters.
 */
export function monogram(name: string): string {
  const caps = name.match(/[A-Z]/g) ?? [];
  if (caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  const letters = name.replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 2).toUpperCase() || '?';
}
