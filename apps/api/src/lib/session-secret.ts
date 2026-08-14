const MIN_SESSION_SECRET_LENGTH = 24;
const WEAK_SESSION_SECRET_VALUES = new Set([
  'operatoros-dev-secret',
  'operatoros-dev-secret-change-me',
  'changeme',
  'change-me',
  'secret',
  'test-secret',
]);

function normalizeSecret(secret: string): string {
  return secret.trim();
}

export function requireSessionSecret(): string {
  const rawSecret = process.env.SESSION_SECRET;
  const secret = rawSecret ? normalizeSecret(rawSecret) : '';

  if (!secret) {
    throw new Error('SESSION_SECRET is required at boot and must not be empty.');
  }

  if (WEAK_SESSION_SECRET_VALUES.has(secret.toLowerCase())) {
    throw new Error('SESSION_SECRET is too weak; use a unique, high-entropy value.');
  }

  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters long.`);
  }

  return secret;
}

