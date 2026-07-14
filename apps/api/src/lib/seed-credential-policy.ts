const MIN_SEED_PASSWORD_LENGTH = 12;

export function isProductionRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = String(env.APP_ENV || env.NODE_ENV || '').trim().toLowerCase();
  return value === 'production' || value === 'prod';
}

/**
 * Resolve an explicitly supplied bootstrap password without ever falling back
 * to a credential embedded in source control.
 */
export function resolveSeedPassword(input: {
  envName: 'ADMIN_PASSWORD' | 'DEMO_PASSWORD';
  value: string | undefined;
  requiredInProduction: boolean;
  production?: boolean;
}): string | null {
  const production = input.production ?? isProductionRuntime();
  const value = input.value?.trim() ?? '';

  if (!value) {
    if (production && input.requiredInProduction) {
      throw new Error(
        `[seed] ${input.envName} is required to create the production bootstrap account. ` +
        'Set it in the deployment secret manager; no source-controlled fallback exists.',
      );
    }
    return null;
  }

  if (value.length < MIN_SEED_PASSWORD_LENGTH) {
    throw new Error(`[seed] ${input.envName} must be at least ${MIN_SEED_PASSWORD_LENGTH} characters.`);
  }

  return value;
}
