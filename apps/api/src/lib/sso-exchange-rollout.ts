/**
 * Compatibility gate for the opaque-code launch (Task #140).
 *
 * Rollout policy:
 * All clients in the unified runtime use the shared `/sso` callback and
 * browser exchange. The environment extension remains only for non-core
 * registry entries during the bounded legacy rollback window.
 *
 * Kept as a pure function (env read + string compare, no DB/Fastify imports)
 * so the rollout logic can be unit-tested in isolation.
 */

import { OPERATOROS_MODULE_REGISTRY } from '../../../../packages/modules/registry.js';

/** Modules served by the unified callback/browser-exchange runtime. */
export const DEFAULT_EXCHANGE_CODE_MODULES: readonly string[] = Object.freeze(
  OPERATOROS_MODULE_REGISTRY
    .filter(module => module.status === 'active')
    .map(module => module.slug),
);

export function moduleSupportsExchangeCode(slug: string): boolean {
  const target = slug.trim().toLowerCase();
  const raw = process.env.SSO_EXCHANGE_CODE_MODULES;
  const envEntries = raw
    ? raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (envEntries.includes('*')) return true;
  const enabled = new Set<string>([...DEFAULT_EXCHANGE_CODE_MODULES, ...envEntries]);
  return enabled.has(target);
}
