import type { FastifyInstance } from 'fastify';
import { deliverOfficeExitPurchases, type OfficeExitDeliveryConfiguration } from './tool-fulfillment.js';

/** Closed by default; a reviewed explicit composition config is required to schedule any work. */
export function registerToolFulfillmentWorker(app: FastifyInstance,
  configuration: OfficeExitDeliveryConfiguration = { enabled: false },
  deliver: typeof deliverOfficeExitPurchases = deliverOfficeExitPurchases) {
  if (!configuration.enabled) return;
  let closed = false, inFlight: Promise<unknown> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const run = () => {
    if (closed || inFlight) return;
    inFlight = Promise.resolve().then(() => deliver(configuration)).catch(() => {
      app.log.error({ code: 'TOOL_FULFILLMENT_WORKER_UNCONFIRMED' }, 'Tool fulfillment will be retried.');
    }).finally(() => { inFlight = null; });
  };
  app.addHook('onReady', async () => { timer = setInterval(run, 60_000); timer.unref(); run(); });
  // preClose drains before the root's database onClose hook. onClose hooks
  // run LIFO, so registering another onClose here would race pool shutdown.
  app.addHook('preClose', async () => { closed = true; if (timer) clearInterval(timer); await inFlight; });
}
