/**
 * Auth-aware + entitlement-aware CTA targeting for marketing surfaces.
 *
 * Targeting matrix:
 *
 *   | Viewer state                  | Module status     | Destination |
 *   | ----------------------------- | ----------------- | ----------- |
 *   | Signed out                    | Available / Beta  | /login      |
 *   | Signed in, entitled           | Available / Beta  | /app        |
 *   | Signed in, NOT entitled       | (status=Locked)   | /pricing    |
 *   | Anyone                        | Coming Soon       | /pricing    |
 *   | Anyone                        | Locked            | /pricing    |
 *
 * Entitlement is surfaced through `MarketingModule.status` —
 * `applyEntitlements()` in `marketing-catalog.ts` flips an unentitled
 * signed-in viewer's module status to `'Locked'` so this helper only
 * has to read the status field. Marketing CTAs never perform the
 * actual SSO handoff; that still lives inside `/app`.
 */

import type { MarketingStatus } from './marketing-catalog';

export interface CtaTarget {
  href: string;
  label: string;
}

export function primaryCtaTarget(signedIn: boolean): CtaTarget {
  return signedIn
    ? { href: '/app',   label: 'Launch OperatorOS' }
    : { href: '/login', label: 'Launch OperatorOS' };
}

/**
 * Pricing CTA targeting — used by the pricing teaser strip and any
 * "See pricing" / "Manage billing" affordances on marketing pages.
 *
 * Signed-out → /login (so they can come back to billing afterwards)
 * Signed-in  → /app (the console entry; the in-console sidebar exposes
 *              the Billing page from there). There is no top-level
 *              Next route at /app/billing — billing lives inside the
 *              console shell behind `activePage='billing'`, so routing
 *              directly to /app/billing would 404.
 *
 * Marketing surfaces never talk to billing routes directly; this just
 * routes the visitor to the console where billing is reachable.
 */
export function billingCtaTarget(signedIn: boolean): CtaTarget {
  return signedIn
    ? { href: '/app',   label: 'Manage billing' }
    : { href: '/login', label: 'See pricing' };
}

export function moduleCtaTarget(
  status: MarketingStatus,
  signedIn: boolean,
): CtaTarget {
  if (status === 'Coming Soon') return { href: '/pricing', label: 'View access options' };
  if (status === 'Locked')      return { href: '/pricing', label: 'View access options' };
  // Available / Beta — surface depends on auth state only.
  if (signedIn)                 return { href: '/app',     label: 'Open in OperatorOS' };
  return { href: '/login', label: 'Sign in to launch' };
}
