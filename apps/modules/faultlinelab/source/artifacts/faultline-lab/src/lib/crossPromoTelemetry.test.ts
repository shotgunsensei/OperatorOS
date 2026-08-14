import { describe, expect, it } from 'vitest';
import { CROSS_PROMO_SOURCE, decorateCrossPromoUrl } from './crossPromoTelemetry';

describe('decorateCrossPromoUrl', () => {
  it('appends ref, placement, and utm_* params to a clean URL', () => {
    const decorated = decorateCrossPromoUrl(
      'https://example.com/landing',
      'incident-board-banner',
    );
    const u = new URL(decorated);
    expect(u.searchParams.get('ref')).toBe(CROSS_PROMO_SOURCE);
    expect(u.searchParams.get('placement')).toBe('incident-board-banner');
    expect(u.searchParams.get('utm_source')).toBe(CROSS_PROMO_SOURCE);
    expect(u.searchParams.get('utm_medium')).toBe('cross-promo');
    expect(u.searchParams.get('utm_campaign')).toBe('incident-board-banner');
  });

  it('preserves pre-existing unrelated query params', () => {
    const decorated = decorateCrossPromoUrl(
      'https://example.com/landing?foo=bar&baz=qux',
      'store-footer',
    );
    const u = new URL(decorated);
    expect(u.searchParams.get('foo')).toBe('bar');
    expect(u.searchParams.get('baz')).toBe('qux');
    expect(u.searchParams.get('ref')).toBe(CROSS_PROMO_SOURCE);
    expect(u.searchParams.get('placement')).toBe('store-footer');
    expect(u.searchParams.get('utm_campaign')).toBe('store-footer');
  });

  it('does not overwrite existing keys when the author already set them', () => {
    const decorated = decorateCrossPromoUrl(
      'https://example.com/landing?utm_campaign=hand-picked&ref=author-override&placement=keep-me&utm_source=newsletter&utm_medium=email',
      'should-not-be-used',
    );
    const u = new URL(decorated);
    expect(u.searchParams.get('ref')).toBe('author-override');
    expect(u.searchParams.get('placement')).toBe('keep-me');
    expect(u.searchParams.get('utm_campaign')).toBe('hand-picked');
    expect(u.searchParams.get('utm_source')).toBe('newsletter');
    expect(u.searchParams.get('utm_medium')).toBe('email');
  });

  it('backfills only the missing telemetry keys', () => {
    const decorated = decorateCrossPromoUrl(
      'https://example.com/landing?ref=author-override',
      'store-footer',
    );
    const u = new URL(decorated);
    expect(u.searchParams.get('ref')).toBe('author-override');
    expect(u.searchParams.get('placement')).toBe('store-footer');
    expect(u.searchParams.get('utm_source')).toBe(CROSS_PROMO_SOURCE);
    expect(u.searchParams.get('utm_medium')).toBe('cross-promo');
    expect(u.searchParams.get('utm_campaign')).toBe('store-footer');
  });

  it('falls back to the original string on a malformed URL', () => {
    const input = 'not a real url';
    expect(decorateCrossPromoUrl(input, 'anywhere')).toBe(input);
  });
});
