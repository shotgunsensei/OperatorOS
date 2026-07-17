export const SSO_STATE_COOKIE_NAME = 'operatoros_sso_state';
export const SSO_VERIFIER_COOKIE_NAME = 'operatoros_sso_verifier';
export const SSO_NONCE_COOKIE_NAME = 'operatoros_sso_nonce';
export const SSO_TRANSACTION_MAX_AGE_SECONDS = 5 * 60;
export const SSO_PKCE_METHOD = 'S256' as const;

const TRANSACTION_VALUE = /^[A-Za-z0-9_-]{32,128}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

export function isSsoTransactionValue(value: unknown): value is string {
  return typeof value === 'string' && TRANSACTION_VALUE.test(value);
}

export function isPkceChallenge(value: unknown): value is string {
  return typeof value === 'string' && PKCE_CHALLENGE.test(value);
}

export function isPkceVerifier(value: unknown): value is string {
  return typeof value === 'string' && PKCE_VERIFIER.test(value);
}
