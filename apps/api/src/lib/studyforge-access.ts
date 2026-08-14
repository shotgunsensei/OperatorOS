import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { resolveEntitlements } from './entitlement-resolver.js';
import { STUDYFORGE_PLAN_LIMITS, type StudyForgePlan } from './studyforge-phase33.js';

type Executor = Pick<typeof db, 'execute'>;
export type StudyForgeUsageKind = 'generation' | 'quiz_attempt';

export interface StudyForgeAccess {
  plan: StudyForgePlan;
  limits: {
    activeSets: number | null;
    flashcardsPerSet: number;
    quizAttemptsPerMonth: number | null;
    generationsPerMonth: number | null;
    examCountdowns: boolean;
    advancedExport: boolean;
    spacedRepetition: boolean;
    tutorGroups: boolean;
  };
  source: 'module_feature' | 'tenant_entitlement' | 'default';
}

export async function resolveStudyForgeAccess(userId: string, tenantId: string): Promise<StudyForgeAccess> {
  const snapshot = await resolveEntitlements(userId, tenantId);
  const module = snapshot?.modules.find((entry) => entry.slug === 'studyforge-ai');
  const configured = module?.features.studyforgePlan;
  let plan: StudyForgePlan = configured === 'tutor' || configured === 'pro' || configured === 'free'
    ? configured
    : 'free';
  let source: StudyForgeAccess['source'] = configured === plan ? 'module_feature' : 'default';
  if (source === 'default') {
    const result = await db.execute(sql`
      SELECT entitlement_key FROM tenant_entitlements
      WHERE tenant_id=${tenantId} AND active=TRUE
        AND entitlement_key IN ('studyforge-ai.pro','studyforge-ai.tutor')
      ORDER BY CASE WHEN entitlement_key='studyforge-ai.tutor' THEN 0 ELSE 1 END LIMIT 1
    `);
    const key = result.rows[0] ? String((result.rows[0] as any).entitlement_key) : '';
    if (key.endsWith('.tutor')) plan = 'tutor';
    else if (key.endsWith('.pro')) plan = 'pro';
    if (key) source = 'tenant_entitlement';
  }
  const defaults = STUDYFORGE_PLAN_LIMITS[plan];
  const override = Number(module?.features.studyforgeMonthlyGenerations);
  return {
    plan,
    limits: {
      ...defaults,
      generationsPerMonth: Number.isSafeInteger(override) && override >= 0 ? override : defaults.generationsPerMonth,
    },
    source,
  };
}

export async function consumeStudyForgeUsage(args: {
  tenantId: string;
  userId: string;
  kind: StudyForgeUsageKind;
  limit: number | null;
  executor?: Executor;
}): Promise<{ generationCount: number; quizAttemptCount: number }> {
  const executor = args.executor ?? db;
  if (args.limit === 0) {
    throw Object.assign(new Error(
      args.kind === 'generation'
        ? 'StudyForge generation limit reached for this OperatorOS entitlement period'
        : 'StudyForge quiz attempt limit reached for this OperatorOS entitlement period',
    ), {
      statusCode: 402,
      code: args.kind === 'generation' ? 'STUDYFORGE_GENERATION_LIMIT_REACHED' : 'STUDYFORGE_QUIZ_LIMIT_REACHED',
    });
  }
  const column = args.kind === 'generation' ? sql.raw('generation_count') : sql.raw('quiz_attempt_count');
  const currentColumn = args.kind === 'generation'
    ? sql.raw('studyforge_usage_counters.generation_count')
    : sql.raw('studyforge_usage_counters.quiz_attempt_count');
  const limit = args.limit;
  const result = await executor.execute(sql`
    INSERT INTO studyforge_usage_counters(tenant_id,user_id,period_start,generation_count,quiz_attempt_count)
    VALUES (${args.tenantId},${args.userId},date_trunc('month',CURRENT_DATE)::date,
      ${args.kind === 'generation' ? 1 : 0},${args.kind === 'quiz_attempt' ? 1 : 0})
    ON CONFLICT (tenant_id,user_id,period_start) DO UPDATE SET
      ${column}=${currentColumn}+1,updated_at=NOW()
    WHERE ${limit === null ? sql`TRUE` : sql`${currentColumn} < ${limit}`}
    RETURNING generation_count,quiz_attempt_count
  `);
  if (!result.rows[0]) {
    throw Object.assign(new Error(
      args.kind === 'generation'
        ? 'StudyForge generation limit reached for this OperatorOS entitlement period'
        : 'StudyForge quiz attempt limit reached for this OperatorOS entitlement period',
    ), {
      statusCode: 402,
      code: args.kind === 'generation' ? 'STUDYFORGE_GENERATION_LIMIT_REACHED' : 'STUDYFORGE_QUIZ_LIMIT_REACHED',
    });
  }
  const row = result.rows[0] as any;
  return { generationCount: Number(row.generation_count), quizAttemptCount: Number(row.quiz_attempt_count) };
}

export async function releaseStudyForgeUsage(args: {
  tenantId: string;
  userId: string;
  kind: StudyForgeUsageKind;
  executor?: Executor;
}): Promise<void> {
  const executor = args.executor ?? db;
  const column = args.kind === 'generation' ? sql.raw('generation_count') : sql.raw('quiz_attempt_count');
  await executor.execute(sql`
    UPDATE studyforge_usage_counters
    SET ${column}=GREATEST(${column}-1,0),updated_at=NOW()
    WHERE tenant_id=${args.tenantId} AND user_id=${args.userId}
      AND period_start=date_trunc('month',CURRENT_DATE)::date
  `);
}
