/**
 * Public, read-only ecosystem surface.
 *
 *   GET /v1/ecosystem/modules   — the ecosystem registry (modules +
 *                                 platform domains) as JSON.
 *
 * Reachable from the web as `/api/ecosystem/modules` via the existing
 * `/api/* -> /v1/*` rewrite in `apps/web/next.config.js`. Unauthenticated
 * and free of secrets — it returns only the static registry derived from
 * `MODULE_CATALOG`.
 */

import type { FastifyInstance } from 'fastify';
import { getEcosystemRegistry } from '@operatoros/sdk';

export async function registerEcosystemRoutes(app: FastifyInstance) {
  app.get('/v1/ecosystem/modules', async (_request, reply) => {
    return reply.send(getEcosystemRegistry());
  });
}
