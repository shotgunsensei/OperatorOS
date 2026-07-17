import { recordCrossPromoClick } from './api';
import { getEntitlements } from './entitlements';
import { useAppStore } from '@/stores/useAppStore';

export type CrossPromoUserTier = 'anonymous' | 'free' | 'pro';

/**
 * Stable source slug attached to every outbound cross-promo URL so sibling
 * Shotgun Ninjas products can attribute sign-ups / purchases back to
 * faultline-lab. Keep in sync with `CROSS_PROMO_TELEMETRY.md`.
 */
export const CROSS_PROMO_SOURCE = 'faultlinelab';

/**
 * Append the standard cross-promo attribution query params to an outbound
 * URL. The `placement` param matches `cross_promo_clicks.placement_id` so
 * click + conversion data can be joined later.
 *
 * Params added (in order):
 *   - ref=faultlinelab
 *   - placement=<placementId>
 *   - utm_source=faultlinelab
 *   - utm_medium=cross-promo
 *   - utm_campaign=<placementId>
 *
 * Existing query params on the URL are preserved. If any of these keys are
 * already present (e.g. the link author wants a custom utm_campaign) the
 * existing value wins and we do not overwrite it. Never throws — falls back
 * to the original URL string on parse failure.
 */
export function decorateCrossPromoUrl(url: string, placementId: string): string {
  try {
    const u = new URL(url);
    const setIfMissing = (key: string, value: string) => {
      if (!u.searchParams.has(key)) u.searchParams.set(key, value);
    };
    setIfMissing('ref', CROSS_PROMO_SOURCE);
    setIfMissing('placement', placementId);
    setIfMissing('utm_source', CROSS_PROMO_SOURCE);
    setIfMissing('utm_medium', 'cross-promo');
    setIfMissing('utm_campaign', placementId);
    return u.toString();
  } catch {
    return url;
  }
}

function currentUserTier(): CrossPromoUserTier {
  const isSignedIn = useAppStore.getState().isSignedIn;
  if (!isSignedIn) return 'anonymous';
  return getEntitlements().isProUser ? 'pro' : 'free';
}

function currentRoute(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.location.pathname + window.location.search;
  } catch {
    return undefined;
  }
}

export interface TrackCrossPromoClickArgs {
  placementId: string;
  targetProduct: string;
  targetUrl: string;
}

/**
 * Fire-and-forget cross-promo click telemetry. Safe to call from a click
 * handler — never throws and never blocks navigation.
 */
export function trackCrossPromoClick(args: TrackCrossPromoClickArgs): void {
  recordCrossPromoClick({
    placementId: args.placementId,
    targetProduct: args.targetProduct,
    targetUrl: args.targetUrl,
    route: currentRoute(),
    userTier: currentUserTier(),
  });
}
