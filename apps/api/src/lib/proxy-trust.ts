/**
 * Parse the reverse-proxy trust switch without JavaScript truthiness.
 *
 * Trusting forwarding headers changes the security boundary for client IP,
 * host, protocol, audit attribution, and per-IP rate limiting. Keep the
 * default closed and enable it only through the two documented affirmative
 * values.
 */
export function parseTrustProxy(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function runtimeTrustsProxy(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseTrustProxy(env.TRUST_PROXY);
}
