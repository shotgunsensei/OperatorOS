import type { FastifyInstance } from 'fastify';
import { authenticate } from '../lib/auth.js';
import {
  executeAiTool,
  getAiUsageStats,
  getAiHistory,
  getUserTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getToolsForPlan,
  checkAiToolAccess,
  AI_TOOLS,
} from '../lib/ai-service.js';
import type { AiToolType } from '../lib/ai-service.js';
import { getUserPlanConfig } from '../lib/plans.js';
import { getProviderInfo } from '../lib/ai-provider.js';

export async function registerAiRoutes(app: FastifyInstance) {
  app.get('/v1/ai/tools', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { config } = await getUserPlanConfig(user.id);
    const tools = getToolsForPlan(config.slug);
    return { tools, plan: config.slug, provider: getProviderInfo() };
  });

  app.get('/v1/ai/usage', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const stats = await getAiUsageStats(user.id);
    return stats;
  });

  app.get('/v1/ai/history', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const rawLimit = parseInt((request.query as any).limit || '20', 10);
    const limit = Number.isNaN(rawLimit) ? 20 : Math.max(1, Math.min(rawLimit, 50));
    const history = await getAiHistory(user.id, limit);
    return { history };
  });

  app.post('/v1/ai/execute', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { toolType, input, templateId } = request.body as {
      toolType: AiToolType;
      input: string;
      templateId?: string;
    };

    if (!toolType || !input) {
      return reply.status(400).send({ error: 'toolType and input are required' });
    }

    if (!AI_TOOLS.find(t => t.type === toolType)) {
      return reply.status(400).send({ error: 'Invalid tool type' });
    }

    if (input.length > 10000) {
      return reply.status(400).send({ error: 'Input too long (max 10000 characters)' });
    }

    try {
      const result = await executeAiTool(user.id, toolType, input, templateId);
      return result;
    } catch (err: any) {
      if (err.code === 'AI_ACCESS_DENIED') {
        return reply.status(403).send({
          error: err.message,
          code: err.code,
          upgradeSlug: err.upgradeSlug,
        });
      }
      if (err.code === 'AI_ERROR') {
        return reply.status(500).send({ error: err.message, code: err.code });
      }
      return reply.status(500).send({ error: 'AI processing failed' });
    }
  });

  app.post('/v1/ai/check-access', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { toolType } = request.body as { toolType: AiToolType };
    if (!toolType) return reply.status(400).send({ error: 'toolType is required' });

    const result = await checkAiToolAccess(user.id, toolType);
    return result;
  });

  app.get('/v1/ai/templates', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { config } = await getUserPlanConfig(user.id);
    if (!config.features.templates) {
      return reply.status(403).send({
        error: 'Prompt templates require the Pro plan or higher.',
        code: 'FEATURE_LOCKED',
        upgradeSlug: 'pro',
      });
    }
    const templates = await getUserTemplates(user.id);
    return { templates };
  });

  app.post('/v1/ai/templates', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { config } = await getUserPlanConfig(user.id);
    if (!config.features.templates) {
      return reply.status(403).send({
        error: 'Prompt templates require the Pro plan or higher.',
        code: 'FEATURE_LOCKED',
        upgradeSlug: 'pro',
      });
    }

    const { name, description, toolType, promptText } = request.body as {
      name: string;
      description?: string;
      toolType: AiToolType;
      promptText: string;
    };

    if (!name || !toolType || !promptText) {
      return reply.status(400).send({ error: 'name, toolType, and promptText are required' });
    }

    const template = await createTemplate(user.id, { name, description, toolType, promptText });
    return template;
  });

  app.put('/v1/ai/templates/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { config } = await getUserPlanConfig(user.id);
    if (!config.features.templates) {
      return reply.status(403).send({ error: 'Prompt templates require the Pro plan or higher.', code: 'FEATURE_LOCKED' });
    }
    const { id } = request.params as { id: string };
    const data = request.body as { name?: string; description?: string; promptText?: string };

    try {
      const template = await updateTemplate(user.id, id, data);
      return template;
    } catch (err: any) {
      if (err.status === 404) return reply.status(404).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/v1/ai/templates/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { config } = await getUserPlanConfig(user.id);
    if (!config.features.templates) {
      return reply.status(403).send({ error: 'Prompt templates require the Pro plan or higher.', code: 'FEATURE_LOCKED' });
    }
    const { id } = request.params as { id: string };

    try {
      const result = await deleteTemplate(user.id, id);
      return result;
    } catch (err: any) {
      if (err.status === 404) return reply.status(404).send({ error: err.message });
      throw err;
    }
  });
}
