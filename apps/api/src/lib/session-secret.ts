export function requireSessionSecret(nodeEnv: string | undefined, sessionSecret: string | undefined): string {
  if (sessionSecret && sessionSecret.trim().length > 0) return sessionSecret;

  if (nodeEnv === 'development' || !nodeEnv) {
    return 'operatoros-dev-secret';
  }

  throw new Error('SESSION_SECRET must be set when NODE_ENV is not development');
}
