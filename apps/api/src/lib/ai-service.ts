import { db } from '../db.js';
import { aiActionsLog, aiPromptTemplates } from '../schema.js';
import { eq, desc, and, gte } from 'drizzle-orm';
import { getAiProvider, getProviderInfo } from './ai-provider.js';
import { checkResourceLimit, recordAiUsage, getUserPlanConfig, checkFeatureAccess } from './plans.js';
import type { PlanCheckResult } from './plans.js';

export type AiToolType =
  | 'quick_action'
  | 'notes_summarizer'
  | 'task_breakdown'
  | 'project_planner'
  | 'bulk_operations'
  | 'automation_suggestions';

export interface AiToolConfig {
  type: AiToolType;
  name: string;
  description: string;
  icon: string;
  category: string;
  minPlan: 'starter' | 'pro' | 'elite';
  actionCost: number;
}

export const AI_TOOLS: AiToolConfig[] = [
  {
    type: 'quick_action',
    name: 'Quick Action Assistant',
    description: 'Get instant AI help with any operational question or task.',
    icon: '⚡',
    category: 'General',
    minPlan: 'starter',
    actionCost: 1,
  },
  {
    type: 'notes_summarizer',
    name: 'Notes Summarizer',
    description: 'Summarize long notes, meeting minutes, or documents into key points.',
    icon: '📝',
    category: 'Writing',
    minPlan: 'starter',
    actionCost: 1,
  },
  {
    type: 'task_breakdown',
    name: 'Task Breakdown Generator',
    description: 'Break complex goals into actionable sub-tasks with priorities and estimates.',
    icon: '🔧',
    category: 'Planning',
    minPlan: 'pro',
    actionCost: 2,
  },
  {
    type: 'project_planner',
    name: 'Project Action Planner',
    description: 'Generate a full project plan with phases, milestones, and risk analysis.',
    icon: '🗂️',
    category: 'Planning',
    minPlan: 'pro',
    actionCost: 3,
  },
  {
    type: 'bulk_operations',
    name: 'Bulk Operations Assistant',
    description: 'Get AI help organizing and batch-processing tasks, notes, and projects.',
    icon: '📦',
    category: 'Automation',
    minPlan: 'elite',
    actionCost: 3,
  },
  {
    type: 'automation_suggestions',
    name: 'Automation Suggestions',
    description: 'Get AI-powered workflow automation ideas based on your usage patterns.',
    icon: '🤖',
    category: 'Automation',
    minPlan: 'elite',
    actionCost: 2,
  },
];

const PLAN_ORDER = ['starter', 'pro', 'elite'];

const SYSTEM_PROMPTS: Record<AiToolType, string> = {
  quick_action: `You are a concise operations assistant for OperatorOS, a project management SaaS. Provide helpful, actionable answers. Use markdown formatting. Keep responses focused and practical.`,

  notes_summarizer: `You are an expert at summarizing operational notes and documents. Extract key points, action items, decisions, and deadlines. Use markdown with bullet points and headers. Be concise but thorough.`,

  task_breakdown: `You are a project management expert. Break down the given task or goal into actionable sub-tasks. For each sub-task include: a clear title, priority (High/Medium/Low), estimated time, and brief description. Use markdown formatting with headers and lists.`,

  project_planner: `You are a strategic project planning expert. Create a comprehensive action plan with: phases/sprints, milestones, deliverables, resource needs, risks with mitigations, and a suggested timeline. Use markdown tables and structured formatting.`,

  bulk_operations: `You are an operations efficiency expert. Analyze the provided items and suggest how to organize, categorize, prioritize, or batch-process them. Provide specific, actionable recommendations with markdown formatting.`,

  automation_suggestions: `You are a workflow automation expert for OperatorOS. Based on the described workflows or usage patterns, suggest specific automations, triggers, and efficiency improvements. Include implementation steps and expected time savings. Use markdown formatting.`,
};

export async function checkAiToolAccess(
  userId: string,
  toolType: AiToolType
): Promise<{ allowed: boolean; reason?: string; upgradeSlug?: string }> {
  const tool = AI_TOOLS.find(t => t.type === toolType);
  if (!tool) return { allowed: false, reason: 'Unknown AI tool' };

  const { config } = await getUserPlanConfig(userId);
  const currentPlanIdx = PLAN_ORDER.indexOf(config.slug);
  const requiredPlanIdx = PLAN_ORDER.indexOf(tool.minPlan);

  if (currentPlanIdx < requiredPlanIdx) {
    return {
      allowed: false,
      reason: `${tool.name} requires the ${tool.minPlan.charAt(0).toUpperCase() + tool.minPlan.slice(1)} plan or higher.`,
      upgradeSlug: tool.minPlan,
    };
  }

  const limitCheck = await checkResourceLimit(userId, 'maxAiActionsPerMonth');
  if (!limitCheck.allowed) {
    return {
      allowed: false,
      reason: limitCheck.message,
      upgradeSlug: limitCheck.upgradeSlug,
    };
  }

  if (limitCheck.used + tool.actionCost > limitCheck.limit && limitCheck.limit < 9999) {
    return {
      allowed: false,
      reason: `This action costs ${tool.actionCost} AI credits but you only have ${limitCheck.limit - limitCheck.used} remaining this month.`,
      upgradeSlug: limitCheck.upgradeSlug,
    };
  }

  return { allowed: true };
}

export async function executeAiTool(
  userId: string,
  toolType: AiToolType,
  input: string,
  templateId?: string
): Promise<{ result: string; tokenCount: number; durationMs: number; actionId: string }> {
  const tool = AI_TOOLS.find(t => t.type === toolType);
  if (!tool) throw new Error('Unknown AI tool');

  const accessCheck = await checkAiToolAccess(userId, toolType);
  if (!accessCheck.allowed) {
    const [logEntry] = await db.insert(aiActionsLog).values({
      userId,
      toolType,
      input: { text: input.substring(0, 500) },
      output: { error: accessCheck.reason },
      tokenCount: 0,
      durationMs: 0,
      status: 'rate_limited',
    }).returning();

    throw {
      status: 403,
      code: 'AI_ACCESS_DENIED',
      message: accessCheck.reason,
      upgradeSlug: accessCheck.upgradeSlug,
      actionId: logEntry.id,
    };
  }

  let promptText = input;
  if (templateId) {
    const [template] = await db.select().from(aiPromptTemplates)
      .where(and(eq(aiPromptTemplates.id, templateId), eq(aiPromptTemplates.userId, userId)))
      .limit(1);
    if (template) {
      promptText = template.promptText.replace('{{input}}', input);
      await db.update(aiPromptTemplates).set({
        usageCount: template.usageCount + 1,
        updatedAt: new Date(),
      }).where(eq(aiPromptTemplates.id, templateId));
    }
  }

  const provider = getAiProvider();
  const systemPrompt = SYSTEM_PROMPTS[toolType];

  try {
    const response = await provider.complete({
      systemPrompt,
      userPrompt: promptText,
      maxTokens: toolType === 'project_planner' ? 3000 : 2000,
      temperature: toolType === 'quick_action' ? 0.7 : 0.5,
    });

    await recordAiUsage(userId, tool.actionCost);

    const [logEntry] = await db.insert(aiActionsLog).values({
      userId,
      toolType,
      input: { text: input.substring(0, 1000) },
      output: { text: response.text.substring(0, 5000) },
      tokenCount: response.tokenCount,
      durationMs: response.durationMs,
      status: 'success',
    }).returning();

    return {
      result: response.text,
      tokenCount: response.tokenCount,
      durationMs: response.durationMs,
      actionId: logEntry.id,
    };
  } catch (err: any) {
    if (err.code === 'AI_ACCESS_DENIED') throw err;

    console.error('[AI Service] Error:', err.message || err);

    const [logEntry] = await db.insert(aiActionsLog).values({
      userId,
      toolType,
      input: { text: input.substring(0, 500) },
      output: { error: err.message || 'Unknown error' },
      tokenCount: 0,
      durationMs: 0,
      status: 'error',
    }).returning();

    throw {
      status: 500,
      code: 'AI_ERROR',
      message: 'AI processing failed. Please try again.',
      actionId: logEntry.id,
    };
  }
}

export async function getAiUsageStats(userId: string) {
  const { config } = await getUserPlanConfig(userId);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthlyActions = await db.select().from(aiActionsLog)
    .where(and(
      eq(aiActionsLog.userId, userId),
      gte(aiActionsLog.createdAt, monthStart),
    ));

  const totalActions = monthlyActions.length;
  const successActions = monthlyActions.filter(a => a.status === 'success').length;
  const totalTokens = monthlyActions.reduce((sum, a) => sum + a.tokenCount, 0);

  const byTool: Record<string, number> = {};
  monthlyActions.forEach(a => {
    byTool[a.toolType] = (byTool[a.toolType] || 0) + 1;
  });

  const limit = config.limits.maxAiActionsPerMonth;
  const creditUsed = monthlyActions
    .filter(a => a.status === 'success')
    .reduce((sum, a) => {
      const tool = AI_TOOLS.find(t => t.type === a.toolType);
      return sum + (tool?.actionCost || 1);
    }, 0);

  return {
    plan: config.slug,
    monthly: {
      used: creditUsed,
      limit,
      percentage: limit >= 9999 ? 0 : Math.min(Math.round((creditUsed / limit) * 100), 100),
      remaining: limit >= 9999 ? 9999 : Math.max(0, limit - creditUsed),
    },
    stats: {
      totalActions,
      successActions,
      totalTokens,
      byTool,
    },
    provider: getProviderInfo(),
  };
}

export async function getAiHistory(userId: string, limit: number = 20) {
  const actions = await db.select().from(aiActionsLog)
    .where(eq(aiActionsLog.userId, userId))
    .orderBy(desc(aiActionsLog.createdAt))
    .limit(limit);

  return actions.map(a => ({
    id: a.id,
    toolType: a.toolType,
    toolName: AI_TOOLS.find(t => t.type === a.toolType)?.name || a.toolType,
    input: (a.input as any)?.text?.substring(0, 200) || '',
    outputPreview: (a.output as any)?.text?.substring(0, 300) || (a.output as any)?.error || '',
    tokenCount: a.tokenCount,
    durationMs: a.durationMs,
    status: a.status,
    createdAt: a.createdAt,
  }));
}

export async function getUserTemplates(userId: string) {
  return db.select().from(aiPromptTemplates)
    .where(eq(aiPromptTemplates.userId, userId))
    .orderBy(desc(aiPromptTemplates.updatedAt));
}

export async function createTemplate(userId: string, data: {
  name: string;
  description?: string;
  toolType: AiToolType;
  promptText: string;
}) {
  const [template] = await db.insert(aiPromptTemplates).values({
    userId,
    name: data.name,
    description: data.description || null,
    toolType: data.toolType,
    promptText: data.promptText,
  }).returning();
  return template;
}

export async function updateTemplate(userId: string, templateId: string, data: {
  name?: string;
  description?: string;
  promptText?: string;
}) {
  const [existing] = await db.select().from(aiPromptTemplates)
    .where(and(eq(aiPromptTemplates.id, templateId), eq(aiPromptTemplates.userId, userId)))
    .limit(1);
  if (!existing) throw { status: 404, message: 'Template not found' };

  const [updated] = await db.update(aiPromptTemplates).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(aiPromptTemplates.id, templateId)).returning();
  return updated;
}

export async function deleteTemplate(userId: string, templateId: string) {
  const [existing] = await db.select().from(aiPromptTemplates)
    .where(and(eq(aiPromptTemplates.id, templateId), eq(aiPromptTemplates.userId, userId)))
    .limit(1);
  if (!existing) throw { status: 404, message: 'Template not found' };

  await db.delete(aiPromptTemplates).where(eq(aiPromptTemplates.id, templateId));
  return { deleted: true };
}

export function getToolsForPlan(planSlug: string) {
  const planIdx = PLAN_ORDER.indexOf(planSlug);
  return AI_TOOLS.map(tool => {
    const toolPlanIdx = PLAN_ORDER.indexOf(tool.minPlan);
    return {
      ...tool,
      available: planIdx >= toolPlanIdx,
      locked: planIdx < toolPlanIdx,
    };
  });
}
