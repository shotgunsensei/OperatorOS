import type { FastifyReply, FastifyRequest } from 'fastify';

export const NINJA_POOL_SOCKET_AUTHORITY_MS = 3000;
type Guard = (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;
type Actor = { tenantId: string; userId: string };

export interface NinjaPoolSocketAuthority {
  refresh(): Promise<boolean>;
  maySend(): boolean;
  stop(): void;
  readonly expiresAt: number;
}

/** A socket is not an enduring grant. Re-run the canonical guards on a fresh
 * request facade so their per-request tenant/membership cache is never reused.
 * Broadcasts remain synchronous and retain order, with a maximum three-second
 * authority lease. Every client message requires a fresh successful check. */
export function createNinjaPoolSocketAuthority(
  request: FastifyRequest,
  actor: Actor,
  guards: readonly Guard[],
  denied: () => void,
  now: () => number = Date.now,
): NinjaPoolSocketAuthority {
  const headers = { ...request.headers };
  const cookies = { ...(request as FastifyRequest & { cookies?: Record<string, string> }).cookies };
  const params = { ...(request.params as Record<string, unknown>), tenantId: actor.tenantId };
  const originalExpiry = Number((request as any).authSession?.exp) * 1000;
  const expiresAt = Number.isSafeInteger(originalExpiry) ? originalExpiry : 0;
  let stopped = false;
  let leaseUntil = 0;
  let pending: Promise<boolean> | undefined;
  const stop = () => { stopped = true; leaseUntil = 0; };
  const reject = () => {
    if (!stopped) { stop(); denied(); }
    return false;
  };
  const maySend = () => !stopped && now() < expiresAt && now() < leaseUntil;
  const refresh = (): Promise<boolean> => {
    if (stopped || now() >= expiresAt) return Promise.resolve(reject());
    if (pending) return pending;
    const started = now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const validate = async () => {
      // Do not inherit request.user, authSession, tenantContext or symbol caches.
      const fresh = {
        headers: { ...headers }, cookies: { ...cookies }, params: { ...params },
        url: request.url, method: request.method, id: request.id, ip: request.ip, log: request.log,
      } as unknown as FastifyRequest;
      let sent = false;
      const reply = {
        get sent() { return sent; },
        code() { return this; },
        send() { sent = true; return this; },
      } as unknown as FastifyReply;
      for (const guard of guards) {
        await guard(fresh, reply);
        if (sent || stopped) return false;
      }
      const authenticated = fresh as any;
      const sessionExpiry = Number(authenticated.authSession?.exp) * 1000;
      return authenticated.user?.id === actor.userId
        && authenticated.tenantContext?.tenantId === actor.tenantId
        && ['user', 'manager'].includes(authenticated.tenantModuleAccessLevel)
        && (authenticated.authSession?.sessionType === 'platform'
          || authenticated.authSession?.sessionType === 'module'
            && authenticated.authSession.moduleId === 'ninja-pool-hall'
            && authenticated.authSession.tenantId === actor.tenantId)
        && Number.isSafeInteger(sessionExpiry) && sessionExpiry >= expiresAt
        && now() < expiresAt;
    };
    pending = Promise.race([
      validate(),
      new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), NINJA_POOL_SOCKET_AUTHORITY_MS); }),
    ]).then(allowed => {
      if (!allowed || stopped || now() >= expiresAt || now() >= started + NINJA_POOL_SOCKET_AUTHORITY_MS) return reject();
      leaseUntil = Math.min(expiresAt, started + NINJA_POOL_SOCKET_AUTHORITY_MS);
      return true;
    }, reject).finally(() => { clearTimeout(timeout); pending = undefined; });
    return pending;
  };
  return { refresh, maySend, stop, expiresAt };
}
