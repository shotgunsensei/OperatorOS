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

export function moduleCtaTarget(
  status: MarketingStatus,
  signedIn: boolean,
): CtaTarget {
  if (status === 'Coming Soon') return { href: '/pricing', label: 'Notify me' };
  if (status === 'Locked')      return { href: '/pricing', label: 'Unlock' };
  // Available / Beta — surface depends on auth state only.
  if (signedIn)                 return { href: '/app',     label: 'Open' };
  return { href: '/login', label: 'Sign in to launch' };
}
