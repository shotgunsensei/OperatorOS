import type { FastifyInstance } from 'fastify';
import { authenticate, logAudit, logUserActivity } from '../lib/auth.js';
import { checkRateLimit } from '../lib/rate-limiter.js';
import {
  CoreSuiteTrialError,
  getCoreSuiteTrialStatus,
  startCoreSuiteTrial,
} from '../lib/core-suite-trial.js';

const TRIAL_START_RATE_LIMIT = 5;
const TRIAL_START_RATE_WINDOW_MS = 15 * 60 * 1000;

export async function registerCoreSuiteTrialRoutes(app: FastifyInstance) {
  app.get('/v1/trials/core-suite', { preHandler: [authenticate] }, async request => {
    const user = (request as any).user;
    return { trial: await getCoreSuiteTrialStatus(user.id) };
  });

  app.post('/v1/trials/core-suite/start', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    if (!checkRateLimit(`core-suite-trial:start:${user.id}`, TRIAL_START_RATE_LIMIT, TRIAL_START_RATE_WINDOW_MS)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' });
    }
    try {
      const result = await startCoreSuiteTrial(user.id);
      if (result.created) {
        await logAudit(user.id, 'core_suite_trial_started', user.id, {
          offerCode: result.trial.offerCode,
          policyVersion: result.trial.policyVersion,
          tenantId: result.trial.personalTenantId,
          modules: result.trial.modules,
          startedAt: result.trial.startedAt,
          endsAt: result.trial.endsAt,
        }, request.ip);
        await logUserActivity(user.id, 'trial_started', 'account_trial', result.trial.offerCode, {
          tenantId: result.trial.personalTenantId,
          endsAt: result.trial.endsAt,
        });
      }
      return reply.code(result.created ? 201 : 200).send({ trial: result.trial });
    } catch (error) {
      if (error instanceof CoreSuiteTrialError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });
}
