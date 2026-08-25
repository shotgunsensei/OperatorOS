import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { resolveEntitlements } from './entitlement-resolver.js';
import { NINJA_LAUNCH_PLAN_LIMITS, type NinjaLaunchPlan } from './ninja-launch-kit-phase34.js';

type Executor = Pick<typeof db, 'execute'>;

export interface NinjaLaunchAccess {
  plan: NinjaLaunchPlan;
  limits: (typeof NINJA_LAUNCH_PLAN_LIMITS)[NinjaLaunchPlan];
  source: 'module_feature' | 'tenant_entitlement' | 'default';
}

export async function resolveNinjaLaunchAccess(userId: string, tenantId: string): Promise<NinjaLaunchAccess> {
  const snapshot = await resolveEntitlements(userId, tenantId);
  const module = snapshot?.modules.find((entry) => entry.slug === 'ninja-launch-kit');
  const configured = module?.features.ninjaLaunchKitPlan;
  let plan: NinjaLaunchPlan = configured === 'agency' || configured === 'pro' || configured === 'free' ? configured : 'free';
  let source: NinjaLaunchAccess['source'] = configured === plan ? 'module_feature' : 'default';
  if (source === 'default') {
    const result = await db.execute(sql`
      SELECT entitlement_key FROM tenant_entitlements
      WHERE tenant_id=${tenantId} AND active=TRUE
        AND entitlement_key IN ('ninja-launch-kit.pro','ninja-launch-kit.agency')
      ORDER BY CASE WHEN entitlement_key='ninja-launch-kit.agency' THEN 0 ELSE 1 END LIMIT 1
    `);
    const key = result.rows[0] ? String((result.rows[0] as any).entitlement_key) : '';
    if (key.endsWith('.agency')) plan = 'agency';
    else if (key.endsWith('.pro')) plan = 'pro';
    if (key) source = 'tenant_entitlement';
  }
  return { plan, limits: NINJA_LAUNCH_PLAN_LIMITS[plan], source };
}

export async function consumeNinjaLaunchGeneration(args: { tenantId: string; userId: string; limit: number | null; executor?: Executor }) {
  const executor = args.executor ?? db;
  const result = await executor.execute(sql`
    INSERT INTO launchkit_usage_counters(tenant_id,user_id,period_start,generation_count)
    VALUES (${args.tenantId},${args.userId},date_trunc('month',CURRENT_DATE)::date,1)
    ON CONFLICT (tenant_id,user_id,period_start) DO UPDATE SET
      generation_count=launchkit_usage_counters.generation_count+1,updated_at=NOW()
    WHERE ${args.limit === null ? sql`TRUE` : sql`launchkit_usage_counters.generation_count < ${args.limit}`}
    RETURNING generation_count
  `);
  if (!result.rows[0]) {
    throw Object.assign(new Error('Deploy Ops monthly generation limit reached for this OperatorOS entitlement'), {
      statusCode: 402,
      code: 'NINJA_LAUNCH_KIT_GENERATION_LIMIT_REACHED',
    });
  }
  return Number((result.rows[0] as any).generation_count);
}

export async function releaseNinjaLaunchGeneration(args: { tenantId: string; userId: string; executor?: Executor }) {
  const executor = args.executor ?? db;
  await executor.execute(sql`
    UPDATE launchkit_usage_counters SET generation_count=GREATEST(generation_count-1,0),updated_at=NOW()
    WHERE tenant_id=${args.tenantId} AND user_id=${args.userId}
      AND period_start=date_trunc('month',CURRENT_DATE)::date
  `);
}
