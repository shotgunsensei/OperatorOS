/**
 * Auth-aware CTA targeting for the public marketing surface.
 *
 * Centralizes the rule that the entire Phase 2 homepage relies on:
 *
 *   - Signed-in visitor   → `/app` (the console, where SSO handoff
 *                            into individual modules already lives).
 *   - Signed-out visitor  → `/login` (which then bounces them to
 *                            `/app` after auth).
 *   - Locked module       → `/pricing` (regardless of auth state) so
 *                            visitors discover the upgrade path before
 *                            they hit a 403 in-app.
 *
 * Marketing CTAs never perform the actual SSO handoff — that still
 * happens inside the console once the user is authenticated and the
 * tenant context is resolved.
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
  if (signedIn)                 return { href: '/app',     label: 'Open' };
  return { href: '/login', label: 'Sign in to launch' };
}
