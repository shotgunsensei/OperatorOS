/**
 * Migration gate for the opaque-code launch (Task #140).
 *
 * The browser-facing handoff is moving from `?token=<JWT>` (identity +
 * entitlement claims sitting in the address bar) to `?code=<opaque>` that
 * the receiver redeems server-to-server. Because receivers are deployed
 * independently, we must NOT flip every module at once — a module whose
 * receiver still only reads `?token` would break.
 *
 * Rollout policy:
 *   - Modules in `DEFAULT_EXCHANGE_CODE_MODULES` use `?code` out of the box.
 *     These are the receivers that have shipped the redeem endpoint (currently
 *     PulseDesk — the module migrated in this task). Their code path is on by
 *     default so the migration is real and not dependent on external env.
 *   - Operators can enable additional modules by listing their slugs in
 *     `SSO_EXCHANGE_CODE_MODULES` (comma-separated) once those receivers ship
 *     redeem support, or set it to `*` to enable every module at once.
 *   - Unlisted, non-default modules keep the legacy `?token` URL.
 *
 * Kept as a pure function (env read + string compare, no DB/Fastify imports)
 * so the rollout logic can be unit-tested in isolation.
 */

/** Modules whose receivers already support server-to-server code redemption. */
export const DEFAULT_EXCHANGE_CODE_MODULES: readonly string[] = ['pulsedesk'];

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
