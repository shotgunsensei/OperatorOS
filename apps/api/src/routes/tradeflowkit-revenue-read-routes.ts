import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { RevenueReadInputError, parseRevenueQuery, revenueCursor, revenueId, revenueKind, type RevenueReadRepository } from '../lib/tradeflowkit-revenue-reads.js';

/** Production supplies the same tenant-member and module-access guards as legacy revenue. */
export function registerTradeFlowKitRevenueReadRoutes(app: FastifyInstance, repository: RevenueReadRepository, guards: preHandlerHookHandler[]) {
  for (const detail of [false, true]) {
    app.get(`/v1/modules/tradeflowkit/revenue/:kind${detail ? '/:id' : ''}`, { onRequest: async (_request, reply) => { reply.header('Cache-Control', 'no-store'); }, preHandler: [...guards] }, async (request, reply) => {
      let kind, query, id;
      try {
        const params = request.params as { kind: unknown; id?: unknown };
        kind = revenueKind(params.kind);
        if (detail) {
          if (Object.keys(request.query as object).length) throw new RevenueReadInputError();
          id = revenueId(params.id);
        }
        query = parseRevenueQuery(kind, request.query);
      } catch (error) {
        if (!(error instanceof RevenueReadInputError)) throw error;
        return reply.code(400).send({ error: 'Invalid revenue query', code: 'REVENUE_QUERY_INVALID' });
      }
      const tenantId = (request as typeof request & { tenantContext: { tenantId: string } }).tenantContext.tenantId;
      const found = await repository.read(tenantId, kind, query, id);
      if (detail && !found.length) return reply.code(404).send({ error: 'Record not found', code: 'REVENUE_RECORD_NOT_FOUND' });
      const page = found.slice(0, detail ? 1 : query.limit);
      const items = page.map(({ cursorAt: _cursorAt, ...row }) => row);
      const related = await repository.related(tenantId, kind, items);
      if (detail) return { item: items[0], related };
      const last = page.at(-1);
      return { items, nextCursor: found.length > query.limit && last ? revenueCursor(kind, query, last.cursorAt, last.id) : null, related };
    });
  }
}
