import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { resolveEntitlements } from './entitlement-resolver.js';
import { tenantHasActiveApplicationStackCompanion } from './product-entitlements.js';

export type NinjamationPlan = 'starter' | 'pro' | 'enterprise';

export const NINJAMATION_PLAN_LIMITS = Object.freeze({
  starter: { monthlyDownloads: 10, monthlyGenerations: 0, aiGeneration: false, apiAccess: false },
  pro: { monthlyDownloads: null, monthlyGenerations: 50, aiGeneration: true, apiAccess: false },
  enterprise: { monthlyDownloads: null, monthlyGenerations: null, aiGeneration: true, apiAccess: true },
} as const);

export async function resolveNinjamationAccess(userId: string, tenantId: string) {
  const snapshot = await resolveEntitlements(userId, tenantId);
  const module = snapshot?.modules.find((entry) => entry.slug === 'ninjamation');
  if (module?.enabled && await tenantHasActiveApplicationStackCompanion(tenantId, 'ninjamation')) {
    return {
      plan: 'enterprise' as const,
      limits: NINJAMATION_PLAN_LIMITS.enterprise,
      source: 'application_stack' as const,
      billingAuthority: 'OperatorOS' as const,
      billingManagementPath: '/app/billing',
    };
  }
  const configured = module?.features.ninjamationPlan;
  let plan: NinjamationPlan = configured === 'enterprise' || configured === 'pro' || configured === 'starter'
    ? configured
    : 'starter';
  let source: 'module_feature' | 'tenant_entitlement' | 'default' = configured === plan ? 'module_feature' : 'default';
  if (source === 'default') {
    const result = await db.execute(sql`
      SELECT entitlement_key FROM tenant_entitlements
      WHERE tenant_id=${tenantId} AND active=TRUE
        AND entitlement_key IN ('ninjamation.pro','ninjamation.enterprise')
      ORDER BY CASE WHEN entitlement_key='ninjamation.enterprise' THEN 0 ELSE 1 END LIMIT 1
    `);
    const key = String(result.rows[0]?.entitlement_key ?? '');
    if (key.endsWith('.enterprise')) plan = 'enterprise';
    else if (key.endsWith('.pro')) plan = 'pro';
    if (key) source = 'tenant_entitlement';
  }
  return {
    plan,
    limits: NINJAMATION_PLAN_LIMITS[plan],
    source,
    billingAuthority: 'OperatorOS' as const,
    billingManagementPath: '/app/billing',
  };
}

type UsageKind = 'generation' | 'download';

export async function consumeNinjamationUsage(input: {
  tenantId: string;
  userId: string;
  kind: UsageKind;
  limit: number | null;
  executor?: Pick<typeof db, 'execute'>;
}) {
  const executor = input.executor ?? db;
  const column = input.kind === 'generation' ? sql.raw('generation_count') : sql.raw('download_count');
  const result = await executor.execute(sql`
    INSERT INTO ninjamation_usage_counters(
      tenant_id,user_id,period_start,generation_count,download_count
    ) VALUES (
      ${input.tenantId},${input.userId},date_trunc('month',CURRENT_DATE)::date,
      ${input.kind === 'generation' ? 1 : 0},${input.kind === 'download' ? 1 : 0}
    )
    ON CONFLICT (tenant_id,user_id,period_start) DO UPDATE SET
      ${column}=ninjamation_usage_counters.${column}+1,updated_at=NOW()
    WHERE ${input.limit === null ? sql`TRUE` : sql`ninjamation_usage_counters.${column} < ${input.limit}`}
    RETURNING generation_count,download_count,period_start
  `);
  if (!result.rows[0]) {
    throw Object.assign(new Error(`Script Ops monthly ${input.kind} limit reached for this OperatorOS entitlement`), {
      statusCode: 429,
      code: input.kind === 'generation'
        ? 'NINJAMATION_GENERATION_LIMIT_REACHED'
        : 'NINJAMATION_DOWNLOAD_LIMIT_REACHED',
    });
  }
  return result.rows[0];
}

export async function releaseNinjamationUsage(input: {
  tenantId: string;
  userId: string;
  kind: UsageKind;
  executor?: Pick<typeof db, 'execute'>;
}) {
  const executor = input.executor ?? db;
  if (input.kind === 'generation') {
    await executor.execute(sql`
      UPDATE ninjamation_usage_counters
      SET generation_count=GREATEST(generation_count-1,0),updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId}
        AND period_start=date_trunc('month',CURRENT_DATE)::date
    `);
  } else {
    await executor.execute(sql`
      UPDATE ninjamation_usage_counters
      SET download_count=GREATEST(download_count-1,0),updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId}
        AND period_start=date_trunc('month',CURRENT_DATE)::date
    `);
  }
}
