import type { JWTPayload } from './auth.js';
import type { OperatorOSModuleRegistryEntry } from '../../../../packages/modules/registry.js';
import { normalizeSsoEnv } from '../../../../packages/sso/index.js';

type BrowserSessionUser = Pick<JWTPayload, 'userId' | 'email' | 'role' | 'tokenVersion'>;
type BrowserSessionModule = Pick<
  OperatorOSModuleRegistryEntry,
  'id' | 'clientId' | 'requiresTenant'
>;

export function isOperatorOSPlatformBrowserClient(module: BrowserSessionModule): boolean {
  return module.id === 'operatoros' &&
    module.clientId === 'operatoros:web' &&
    module.requiresTenant === false;
}

/** Persisted handoffs use the canonical prod/staging/dev tri-state. */
export function ssoEnvironmentMatchesRuntime(
  persistedEnv: unknown,
  runtimeEnv: string | null | undefined,
): boolean {
  if (persistedEnv !== 'prod' && persistedEnv !== 'staging' && persistedEnv !== 'dev') {
    return false;
  }
  return persistedEnv === normalizeSsoEnv(runtimeEnv);
}

/**
 * The parent console gets a broad platform session only on its exact browser
 * client. Every child application remains sealed to one module and tenant.
 */
export function buildBrowserSessionPayload(
  user: BrowserSessionUser,
  module: BrowserSessionModule,
  tenantId: string | null,
): JWTPayload {
  if (isOperatorOSPlatformBrowserClient(module)) {
    return {
      ...user,
      sessionType: 'platform',
    };
  }

  if (!tenantId) {
    throw new Error('A tenant-bound module session requires tenantId');
  }

  return {
    ...user,
    sessionType: 'module',
    tenantId,
    moduleId: module.id,
  };
}

export function mapSsoModuleAccessDenial(
  reason: string | undefined,
  fallbackError: string,
): { code: string; error: string } {
  switch (reason) {
    case 'module_archived':
      return { code: 'MODULE_ARCHIVED', error: 'Module is archived' };
    case 'module_disabled':
      return { code: 'MODULE_DISABLED', error: 'Module is disabled' };
    case 'module_unavailable':
      return { code: 'MODULE_UNAVAILABLE', error: 'Module is not available for launch' };
    default:
      return { code: 'MODULE_ACCESS_DENIED', error: fallbackError };
  }
}
