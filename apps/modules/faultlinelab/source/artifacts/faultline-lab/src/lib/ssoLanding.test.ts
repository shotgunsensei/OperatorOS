import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeSsoLandingParams, isAccessDeniedReason } from './ssoLanding';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function setHref(href: string): void {
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: new URL(href),
  });
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
}

describe('ssoLanding', () => {
  beforeEach(() => {
    setHref('https://example.test/');
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok=true on success', () => {
    setHref('https://example.test/?sso=ok');
    const r = consumeSsoLandingParams();
    expect(r.ok).toBe(true);
    expect(r.error).toBeNull();
  });

  it('returns the reason on error and strips params', () => {
    setHref('https://example.test/?sso=error&reason=module_disabled');
    const r = consumeSsoLandingParams();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('module_disabled');
    expect(window.history.replaceState).toHaveBeenCalled();
  });

  it('flags module_disabled as access-denied', () => {
    expect(isAccessDeniedReason('module_disabled')).toBe(true);
  });

  it('flags wrong_module as access-denied', () => {
    expect(isAccessDeniedReason('wrong_module')).toBe(true);
  });

  it('does not flag transient errors as access-denied', () => {
    expect(isAccessDeniedReason('expired')).toBe(false);
    expect(isAccessDeniedReason('sso_consume_unavailable')).toBe(false);
    expect(isAccessDeniedReason(null)).toBe(false);
  });
});
