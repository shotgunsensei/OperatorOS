import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { AiBudgetError, priceUsageMicros, type AiMeasuredUsage, type AiPricing } from './ai-cost-control.js';
import { recordUsageEvent, appendActivityEvent } from './shared-usage-activity.js';

export interface AiBudgetScope { tenantId: string; moduleId: string; userId: string; workflow: string }
export interface AiBudgetReservation extends AiBudgetScope {
  id: string; reservedMicros: number; pricing: AiPricing; correlationId: string;
}

export async function reserveAiBudget(input: AiBudgetScope & {
  idempotencyKey: string; requestHash: string; provider: string; model: string;
  pricing: AiPricing; reservedMicros: number; correlationId: string;
}): Promise<{ reservation: AiBudgetReservation } | { replay: Record<string, any> }> {
  return db.transaction(async tx => {
    // Row lock serializes reservations across all autoscale instances for this tenant/module.
    const policyResult = await tx.execute(sql`SELECT * FROM shared_ai_budget_policies
      WHERE tenant_id=${input.tenantId} AND module_id=${input.moduleId} FOR UPDATE`);
    const policy = policyResult.rows[0];
    if (!policy || !policy.enabled) throw new AiBudgetError('AI_BUDGET_DISABLED');
    const prior = (await tx.execute(sql`SELECT * FROM shared_ai_requests
      WHERE tenant_id=${input.tenantId} AND module_id=${input.moduleId}
      AND workflow=${input.workflow} AND idempotency_key=${input.idempotencyKey}`)).rows[0];
    if (prior) {
      if (prior.user_id !== input.userId || prior.request_hash !== input.requestHash) {
        throw new AiBudgetError('AI_REQUEST_CONFLICT', 409);
      }
      if (prior.status === 'completed') return { replay: prior.response_json as Record<string, any> };
      if (prior.status === 'failed') throw new AiBudgetError('AI_REQUEST_FAILED', 502);
      throw new AiBudgetError('AI_REQUEST_PENDING', 409);
    }
    const totals = (await tx.execute(sql`SELECT
      COALESCE(SUM(reserved_micros) FILTER (WHERE status IN ('reserved','unknown')),0)::text AS held,
      COALESCE(SUM(measured_micros) FILTER (WHERE (settled_at AT TIME ZONE 'UTC')::date=(NOW() AT TIME ZONE 'UTC')::date),0)::text AS daily,
      COALESCE(SUM(measured_micros) FILTER (WHERE date_trunc('month',settled_at AT TIME ZONE 'UTC')=date_trunc('month',NOW() AT TIME ZONE 'UTC')),0)::text AS monthly
      FROM shared_ai_requests WHERE tenant_id=${input.tenantId} AND module_id=${input.moduleId}`)).rows[0];
    if (!Number.isSafeInteger(input.reservedMicros) || input.reservedMicros <= 0
      || BigInt(input.reservedMicros) > BigInt(String(policy.per_call_micros))
      || BigInt(String(totals.held)) + BigInt(String(totals.daily)) + BigInt(input.reservedMicros) > BigInt(String(policy.daily_micros))
      || BigInt(String(totals.held)) + BigInt(String(totals.monthly)) + BigInt(input.reservedMicros) > BigInt(String(policy.monthly_micros))) {
      throw new AiBudgetError('AI_BUDGET_EXCEEDED', 429);
    }
    const row = (await tx.execute(sql`INSERT INTO shared_ai_requests
      (tenant_id,module_id,user_id,workflow,idempotency_key,request_hash,provider,model,
       pricing_json,reserved_micros,correlation_id)
      VALUES (${input.tenantId},${input.moduleId},${input.userId},${input.workflow},${input.idempotencyKey},
       ${input.requestHash},${input.provider},${input.model},${input.pricing},${input.reservedMicros},${input.correlationId}) RETURNING id`)).rows[0];
    return { reservation: { id: String(row.id), tenantId: input.tenantId, moduleId: input.moduleId,
      userId: input.userId, workflow: input.workflow, reservedMicros: input.reservedMicros,
      pricing: input.pricing, correlationId: input.correlationId } };
  });
}

export async function settleAiBudget(reservation: AiBudgetReservation, input: {
  usage?: AiMeasuredUsage; response?: Record<string, unknown>; errorCode?: string; durationMs: number;
}): Promise<void> {
  await db.transaction(async tx => {
    // Match reservation lock order with reserveAiBudget to avoid deadlocks.
    await tx.execute(sql`SELECT tenant_id FROM shared_ai_budget_policies
      WHERE tenant_id=${reservation.tenantId} AND module_id=${reservation.moduleId} FOR UPDATE`);
    const cost = input.usage ? priceUsageMicros(input.usage, reservation.pricing) : null;
    // Numeric counts are safe telemetry; "*Tokens" keys are intentionally removed
    // by the shared secret-key sanitizer. Do not weaken that sanitizer.
    const usageTelemetry = input.usage ? { unit: 'tokens', input: input.usage.inputTokens,
      output: input.usage.outputTokens, cachedInput: input.usage.cachedInputTokens,
      cacheWrite: input.usage.cacheWriteTokens } : null;
    const overrun = cost !== null && cost > reservation.reservedMicros;
    const status = cost === null ? 'unknown' : overrun ? 'overrun' : input.response ? 'completed' : 'failed';
    const updated = await tx.execute(sql`UPDATE shared_ai_requests SET
      status=${status},measured_micros=${cost},usage_json=${input.usage ?? null},
      response_json=${status === 'completed' ? input.response ?? null : null},
      error_code=${input.errorCode ?? (overrun ? 'AI_BUDGET_OVERRUN' : null)},
      duration_ms=${Math.min(2147483647, Math.max(0, Math.round(input.durationMs)))},
      settled_at=${cost === null ? null : new Date()}
      WHERE id=${reservation.id} AND tenant_id=${reservation.tenantId} AND module_id=${reservation.moduleId}
      AND user_id=${reservation.userId} AND status='reserved' RETURNING id`);
    if (!updated.rows[0]) throw new AiBudgetError('AI_RESERVATION_CONFLICT', 409);
    if (overrun) await tx.execute(sql`UPDATE shared_ai_budget_policies SET enabled=false,updated_at=NOW()
      WHERE tenant_id=${reservation.tenantId} AND module_id=${reservation.moduleId}`);
    if (cost !== null && cost > 0) await recordUsageEvent({ ...reservation,
      operation: reservation.workflow, units: cost, unitKind: 'usd_micros',
      idempotencyKey: reservation.id, externalReference: reservation.id,
      metadata: { measured: true, usage: usageTelemetry, pricing: reservation.pricing, status },
    }, tx);
    await appendActivityEvent({ tenantId: reservation.tenantId, moduleId: reservation.moduleId,
      actorUserId: reservation.userId, objectType: 'ai_request', objectId: reservation.id,
      eventType: `ai_${status}`, summary: status === 'completed'
        ? 'Generated documentation-only guidance for review' : 'AI guidance needs review or reconciliation',
      metadata: { status, reservedMicros: reservation.reservedMicros, measuredMicros: cost,
        usage: usageTelemetry, model: reservation.pricing.model, errorCode: input.errorCode ?? null },
      correlationId: reservation.correlationId,
    }, tx);
  });
}
