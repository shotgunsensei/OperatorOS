import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { writeAudit } from './audit.js';
import { torqueShedModule } from './operatoros-token-billing.js';
import { getSharedAiProviderAdapter, ProviderDisabledError } from './shared-provider-adapters.js';
import { safeFailureCode, sanitizeSharedMetadata } from './shared-service-safety.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  recordUsageEvent,
} from './shared-usage-activity.js';
import {
  parseTorqueAssistResult,
  summarizeContext,
  TORQUE_ASSIST_MAX_PROVIDER_ATTEMPTS,
  TORQUE_ASSIST_RESERVATION_TTL_MS,
  TORQUE_ASSIST_SYSTEM_PROMPT,
  TORQUE_ASSIST_TENANT_LIMIT_PER_MINUTE,
  TORQUE_ASSIST_USER_LIMIT_PER_MINUTE,
  type TorqueAssistResult,
  TorqueAssistDomainError,
} from './torque-assist-domain.js';

type Executor = Pick<typeof db, 'execute' | 'insert'>;

export class TorqueAssistServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'TorqueAssistServiceError';
  }
}

function first(result: Awaited<ReturnType<typeof db.execute>>): Record<string, any> | null {
  return (result.rows[0] as Record<string, any> | undefined) ?? null;
}

function camel(row: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

function balanceCaseSql() {
  return sql`COALESCE(SUM(CASE
    WHEN entry_kind IN ('credit','debit_reversal','adjustment_credit') THEN units
    ELSE -units END),0)::bigint`;
}

async function lockTorqueBalance(
  executor: Executor,
  tenantId: string,
  userId: string,
): Promise<void> {
  // The ledger has no mutable balance row to lock. Use a transaction-scoped,
  // tenant/user advisory lock so the balance read and append-only debit are one
  // serialized operation even while multiple provider completions finish at once.
  await executor.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`torqueshed:token-balance:${tenantId}:${userId}`}, 0)
    )
  `);
  await executor.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`);
}

export async function torqueTokenBalance(
  input: {
    tenantId: string;
    userId: string;
    moduleId?: string;
  },
  executor: Executor = db,
): Promise<number> {
  const moduleId = input.moduleId ?? (await torqueShedModule()).id;
  const row = first(
    await executor.execute(sql`
      SELECT ${balanceCaseSql()} AS balance
      FROM torqueshed_token_ledger_entries
      WHERE tenant_id=${input.tenantId} AND module_id=${moduleId} AND user_id=${input.userId}
    `),
  );
  return Number(row?.balance ?? 0);
}

export async function torqueTokenAvailability(
  input: { tenantId: string; userId: string; moduleId?: string },
  executor: Executor = db,
) {
  const moduleId = input.moduleId ?? (await torqueShedModule()).id;
  const ledgerBalance = await torqueTokenBalance({ ...input, moduleId }, executor);
  const reservationRow = await executor.execute(sql`
      SELECT COALESCE(SUM(reserved_units),0)::bigint AS reserved_units
      FROM torqueshed_token_reservations
      WHERE tenant_id=${input.tenantId} AND module_id=${moduleId} AND user_id=${input.userId}
        AND status='active' AND expires_at > NOW()
    `);
  const reservedUnits = Number(reservationRow.rows[0]?.reserved_units ?? 0);
  return {
    ledgerBalance,
    reservedUnits,
    availableUnits: Math.max(0, ledgerBalance - reservedUnits),
  };
}

export async function listTorqueTokenLedger(input: {
  tenantId: string;
  userId: string;
  includeTenant: boolean;
  limit?: number;
}) {
  const module = await torqueShedModule();
  const limit = Math.max(1, Math.min(200, Math.floor(input.limit ?? 50)));
  const entries = await db.execute(sql`
    SELECT id,user_id,entry_kind,operation_type,units,purchase_intent_id,
      diagnostic_session_id,assist_request_id,reverses_entry_id,metadata_json,created_at
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${input.tenantId} AND module_id=${module.id}
      AND (${input.includeTenant} OR user_id=${input.userId})
    ORDER BY created_at DESC,id DESC LIMIT ${limit}
  `);
  const totals = await db.execute(sql`
    SELECT user_id,
      COALESCE(SUM(CASE WHEN entry_kind IN ('credit','adjustment_credit') THEN units ELSE 0 END),0)::bigint AS credits,
      COALESCE(SUM(CASE WHEN entry_kind IN ('debit','adjustment_debit') THEN units ELSE 0 END),0)::bigint AS debits,
      COALESCE(SUM(CASE WHEN entry_kind='credit_reversal' THEN units ELSE 0 END),0)::bigint AS credit_reversals,
      COALESCE(SUM(CASE WHEN entry_kind='debit_reversal' THEN units ELSE 0 END),0)::bigint AS debit_reversals,
      ${balanceCaseSql()} AS balance
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${input.tenantId} AND module_id=${module.id}
      AND (${input.includeTenant} OR user_id=${input.userId})
    GROUP BY user_id ORDER BY user_id
  `);
  const purchases = await db.execute(sql`
    SELECT id,user_id,package_key,units,amount_minor,currency,provider,provider_mode,status,
      failure_code,created_at,credited_at,refunded_at
    FROM operatoros_token_purchase_intents
    WHERE tenant_id=${input.tenantId} AND module_id=${module.id}
      AND (${input.includeTenant} OR user_id=${input.userId})
    ORDER BY created_at DESC LIMIT ${limit}
  `);
  const availability = await torqueTokenAvailability({
      tenantId: input.tenantId,
      userId: input.userId,
      moduleId: module.id,
    });
  return {
    balance: availability.ledgerBalance,
    ledgerBalance: availability.ledgerBalance,
    reservedUnits: availability.reservedUnits,
    availableBalance: availability.availableUnits,
    entries: entries.rows.map((row) => camel(row as Record<string, any>)),
    totals: totals.rows.map((row) => camel(row as Record<string, any>)),
    purchases: purchases.rows.map((row) => camel(row as Record<string, any>)),
  };
}

export async function torqueAssistReconciliation(tenantId: string) {
  const module = await torqueShedModule();
  const [balances, purchaseFindings, requestFindings] = await Promise.all([
    db.execute(sql`
      SELECT user_id,${balanceCaseSql()} AS balance,COUNT(*)::int AS entry_count,
        MAX(created_at) AS last_entry_at
      FROM torqueshed_token_ledger_entries
      WHERE tenant_id=${tenantId} AND module_id=${module.id}
      GROUP BY user_id ORDER BY user_id
    `),
    db.execute(sql`
      SELECT p.id,p.user_id,p.status,p.units,p.settlement_policy_state,p.settlement_policy_units,
        COALESCE(SUM(CASE WHEN l.entry_kind='credit' THEN l.units ELSE 0 END),0)::bigint AS credited_units,
        COALESCE(SUM(CASE WHEN l.entry_kind='credit_reversal' THEN l.units ELSE 0 END),0)::bigint AS reversed_units
      FROM operatoros_token_purchase_intents p
      LEFT JOIN torqueshed_token_ledger_entries l
        ON l.tenant_id=p.tenant_id AND l.purchase_intent_id=p.id
      WHERE p.tenant_id=${tenantId} AND p.module_id=${module.id}
      GROUP BY p.id,p.user_id,p.status,p.units,p.settlement_policy_state,p.settlement_policy_units
      HAVING
        (p.status='credited' AND COALESCE(SUM(CASE WHEN l.entry_kind='credit' THEN l.units ELSE 0 END),0)<>p.units)
        OR (p.status='refunded' AND
          COALESCE(SUM(CASE WHEN l.entry_kind='credit_reversal' THEN l.units ELSE 0 END),0)
            + p.settlement_policy_units <> p.units)
        OR COALESCE(SUM(CASE WHEN l.entry_kind='credit_reversal' THEN l.units ELSE 0 END),0) >
           COALESCE(SUM(CASE WHEN l.entry_kind='credit' THEN l.units ELSE 0 END),0)
      ORDER BY p.id
    `),
    db.execute(sql`
      SELECT r.id,r.user_id,r.status,r.actual_units,
        COALESCE(SUM(CASE WHEN l.entry_kind='debit' THEN l.units ELSE 0 END),0)::bigint AS debited_units
      FROM torqueshed_assist_requests r
      LEFT JOIN torqueshed_token_ledger_entries l
        ON l.tenant_id=r.tenant_id AND l.assist_request_id=r.id
      WHERE r.tenant_id=${tenantId}
      GROUP BY r.id,r.user_id,r.status,r.actual_units
      HAVING
        (r.status IN ('complete','follow_up') AND COALESCE(SUM(CASE WHEN l.entry_kind='debit' THEN l.units ELSE 0 END),0)<>COALESCE(r.actual_units,0))
        OR (r.status NOT IN ('complete','follow_up') AND COALESCE(SUM(CASE WHEN l.entry_kind='debit' THEN l.units ELSE 0 END),0)<>0)
      ORDER BY r.id
    `),
  ]);
  const negativeBalances = balances.rows.filter((row) => Number((row as any).balance) < 0);
  return {
    mathematicallyReconciled:
      negativeBalances.length === 0 &&
      purchaseFindings.rows.length === 0 &&
      requestFindings.rows.length === 0,
    balances: balances.rows.map((row) => camel(row as Record<string, any>)),
    findings: {
      negativeBalances: negativeBalances.map((row) => camel(row as Record<string, any>)),
      purchaseMismatches: purchaseFindings.rows.map((row) => camel(row as Record<string, any>)),
      requestMismatches: requestFindings.rows.map((row) => camel(row as Record<string, any>)),
    },
  };
}

async function loadDiagnosticContext(input: {
  tenantId: string;
  userId: string;
  diagnosticSessionId: string;
  canManage: boolean;
  followUpAnswers: Array<{ question: string; answer: string }>;
}, executor: Executor = db) {
  const diagnostic = first(
    await executor.execute(sql`
      SELECT d.id,d.vehicle_id,d.title,d.customer_concern,d.symptoms,d.conditions,d.status,
        d.confirmed_cause,d.repair_performed,d.verification,d.resolution,d.opened_at,d.updated_at,
        v.nickname,v.year,v.make,v.model,v.trim,v.engine,v.transmission,v.drivetrain,
        v.current_mileage,v.ownership_status
      FROM torqueshed_diagnostic_sessions d
      JOIN torqueshed_vehicles v ON v.tenant_id=d.tenant_id AND v.id=d.vehicle_id
      WHERE d.tenant_id=${input.tenantId} AND d.id=${input.diagnosticSessionId}
        AND d.archived_at IS NULL AND v.archived_at IS NULL
        AND (${input.canManage} OR d.owner_user_id=${input.userId})
      LIMIT 1
    `),
  );
  if (!diagnostic) {
    throw new TorqueAssistServiceError(
      'Diagnostic session not found',
      'TORQUE_ASSIST_SESSION_NOT_FOUND',
      404,
    );
  }
  const codes = await executor.execute(sql`
      SELECT code,description,code_status,freeze_frame,observed_at
      FROM torqueshed_diagnostic_trouble_codes
      WHERE tenant_id=${input.tenantId} AND diagnostic_session_id=${input.diagnosticSessionId}
        AND archived_at IS NULL ORDER BY observed_at,id LIMIT 100
    `);
  const entries = await executor.execute(sql`
      SELECT kind,title,value_text,value_numeric,unit,reference_min,reference_max,outcome,metadata,observed_at
      FROM torqueshed_diagnostic_entries
      WHERE tenant_id=${input.tenantId} AND diagnostic_session_id=${input.diagnosticSessionId}
        AND archived_at IS NULL ORDER BY observed_at,id LIMIT 250
    `);
  const service = await executor.execute(sql`
      SELECT kind,title,description,mileage,occurred_at,status
      FROM torqueshed_service_records
      WHERE tenant_id=${input.tenantId} AND vehicle_id=${String(diagnostic.vehicle_id)}
        AND archived_at IS NULL ORDER BY occurred_at DESC,id DESC LIMIT 50
    `);
  return {
    diagnostic: camel(diagnostic),
    codes: codes.rows.map((row) => camel(row as Record<string, any>)),
    entries: entries.rows.map((row) => camel(row as Record<string, any>)),
    priorService: service.rows.map((row) => camel(row as Record<string, any>)),
    followUpAnswers: input.followUpAnswers,
  };
}

export async function torqueAssistContextPreview(input: {
  tenantId: string;
  userId: string;
  diagnosticSessionId: string;
  canManage: boolean;
}) {
  const context = await loadDiagnosticContext({ ...input, followUpAnswers: [] });
  const summary = summarizeContext(context);
  return {
    diagnosticSessionId: input.diagnosticSessionId,
    vehicle: {
      nickname: context.diagnostic.nickname,
      year: context.diagnostic.year,
      make: context.diagnostic.make,
      model: context.diagnostic.model,
      engine: context.diagnostic.engine,
      currentMileage: context.diagnostic.currentMileage,
    },
    concern: context.diagnostic.customerConcern,
    symptoms: context.diagnostic.symptoms,
    codeCount: context.codes.length,
    evidenceCount: context.entries.length,
    priorServiceCount: context.priorService.length,
    contextCharacters: summary.chars,
    estimatedUnits: summary.estimatedUnits,
  };
}

async function consumeRateWindow(
  executor: Executor,
  input: { tenantId: string; scope: 'tenant' | 'user'; subjectId: string; limit: number },
): Promise<void> {
  const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const row = first(
    await executor.execute(sql`
      INSERT INTO torqueshed_assist_rate_windows (
        tenant_id,scope,subject_id,window_started_at,request_count
      ) VALUES (${input.tenantId},${input.scope},${input.subjectId},${windowStartedAt},1)
      ON CONFLICT (tenant_id,scope,subject_id,window_started_at) DO UPDATE
        SET request_count=torqueshed_assist_rate_windows.request_count+1,updated_at=NOW()
        WHERE torqueshed_assist_rate_windows.request_count < ${input.limit}
      RETURNING request_count
    `),
  );
  if (!row) {
    throw new TorqueAssistServiceError(
      `${input.scope} Torque Assist rate limit exceeded`,
      'TORQUE_ASSIST_RATE_LIMITED',
      429,
      { scope: input.scope, retryAfterSeconds: 60 },
    );
  }
}

async function assertCircuitClosed(tenantId: string, provider: string): Promise<void> {
  const row = first(
    await db.execute(sql`
      SELECT state,open_until FROM torqueshed_ai_provider_circuits
      WHERE tenant_id=${tenantId} AND provider=${provider} LIMIT 1
    `),
  );
  if (row?.state === 'open' && row.open_until && new Date(row.open_until).getTime() > Date.now()) {
    throw new TorqueAssistServiceError(
      'Torque Assist provider circuit is temporarily open',
      'TORQUE_ASSIST_PROVIDER_CIRCUIT_OPEN',
      503,
      {
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((new Date(row.open_until).getTime() - Date.now()) / 1000),
        ),
      },
    );
  }
}

async function recordCircuitSuccess(tenantId: string, provider: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO torqueshed_ai_provider_circuits (tenant_id,provider,state,consecutive_failures,open_until,last_error_code)
    VALUES (${tenantId},${provider},'closed',0,NULL,NULL)
    ON CONFLICT (tenant_id,provider) DO UPDATE SET
      state='closed',consecutive_failures=0,open_until=NULL,last_error_code=NULL,updated_at=NOW()
  `);
}

async function recordCircuitFailure(
  tenantId: string,
  provider: string,
  code: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO torqueshed_ai_provider_circuits (
      tenant_id,provider,state,consecutive_failures,open_until,last_error_code
    ) VALUES (${tenantId},${provider},'closed',1,NULL,${code})
    ON CONFLICT (tenant_id,provider) DO UPDATE SET
      consecutive_failures=torqueshed_ai_provider_circuits.consecutive_failures+1,
      state=CASE WHEN torqueshed_ai_provider_circuits.consecutive_failures+1 >= 3 THEN 'open' ELSE 'closed' END,
      open_until=CASE WHEN torqueshed_ai_provider_circuits.consecutive_failures+1 >= 3 THEN NOW()+INTERVAL '60 seconds' ELSE NULL END,
      last_error_code=${code},updated_at=NOW()
  `);
}

function responseFromRequest(
  row: Record<string, any>,
  replayed: boolean,
  availability?: { ledgerBalance: number; reservedUnits: number; availableUnits: number },
) {
  return {
    assistRequestId: String(row.id),
    diagnosticSessionId: String(row.diagnostic_session_id),
    status: String(row.status),
    result: row.response_json as TorqueAssistResult | null,
    estimatedUnits: Number(row.estimated_units),
    actualUnits: row.actual_units === null ? null : Number(row.actual_units),
    provider: row.provider,
    model: row.provider_model,
    providerVersion: row.provider_version,
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
    reservationId: row.reservation_id ? String(row.reservation_id) : null,
    reservedUnits: Number(row.reserved_units ?? row.estimated_units ?? 0),
    releasedUnits: Number(row.released_units ?? 0),
    remainingBalance: availability?.availableUnits ?? 0,
    correlationId: String(row.correlation_id ?? ''),
    replayed,
  };
}

async function requestByKey(
  tenantId: string,
  userId: string,
  key: string,
  executor: Executor = db,
) {
  return first(
    await executor.execute(sql`
      SELECT r.*,reservation.id AS reservation_id,reservation.reserved_units,
        reservation.consumed_units,reservation.released_units,reservation.status AS reservation_status
      FROM torqueshed_assist_requests r
      LEFT JOIN torqueshed_token_reservations reservation
        ON reservation.tenant_id=r.tenant_id AND reservation.assist_request_id=r.id
      WHERE r.tenant_id=${tenantId} AND r.user_id=${userId} AND r.idempotency_key=${key}
      LIMIT 1
    `),
  );
}

function torqueAssistCorrelationId(request: unknown): string {
  const requestId = request && typeof request === 'object' && 'id' in request
    ? String((request as { id?: unknown }).id ?? '')
    : '';
  return /^[A-Za-z0-9._:-]{4,120}$/.test(requestId) ? requestId : randomUUID();
}

function classifiedTorqueAssistFailure(error: unknown, correlationId: string): TorqueAssistServiceError {
  if (error instanceof TorqueAssistServiceError) {
    return new TorqueAssistServiceError(error.message, error.code, error.statusCode, {
      charged: false,
      correlationId,
      ...error.details,
    });
  }
  if (error instanceof TorqueAssistDomainError) {
    const contextFailure = error.code.startsWith('TORQUE_ASSIST_CONTEXT_');
    return new TorqueAssistServiceError(
      contextFailure
        ? 'The diagnostic context is outside the supported Torque Assist bounds'
        : 'The AI provider response did not pass Torque Assist validation',
      contextFailure ? 'TORQUE_ASSIST_CONTEXT_INVALID' : 'TORQUE_ASSIST_RESPONSE_INVALID',
      contextFailure ? error.statusCode : 502,
      {
        charged: false,
        correlationId,
        retryable: false,
        administratorAction: contextFailure
          ? 'Reduce or correct the diagnostic evidence payload, then submit a new request.'
          : 'Inspect provider health and the safe response-validation code using the support reference.',
      },
    );
  }
  const rawCode = safeFailureCode(error, 'TORQUE_ASSIST_PROVIDER_UNAVAILABLE');
  const upper = rawCode.toUpperCase();
  if (/TIMEOUT|TIMED_OUT|ABORT/.test(upper)) {
    return new TorqueAssistServiceError(
      'Torque Assist timed out before an accepted response was delivered',
      'TORQUE_ASSIST_PROVIDER_TIMEOUT',
      504,
      {
        charged: false,
        correlationId,
        retryable: true,
        administratorAction: 'Retry with the same idempotency key; if the timeout repeats, inspect provider latency using the support reference.',
      },
    );
  }
  if (/429|RATE_LIMIT/.test(upper)) {
    return new TorqueAssistServiceError(
      'The Torque Assist provider is rate limited',
      'TORQUE_ASSIST_RATE_LIMITED',
      429,
      {
        charged: false,
        correlationId,
        retryable: true,
        retryAfterSeconds: 60,
        administratorAction: 'Wait one minute, then retry with the same idempotency key.',
      },
    );
  }
  return new TorqueAssistServiceError(
    'Torque Assist could not reach an available provider',
    'TORQUE_ASSIST_PROVIDER_UNAVAILABLE',
    503,
    {
      charged: false,
      correlationId,
      retryable: true,
      administratorAction: 'Retry once with the same idempotency key, then inspect provider and circuit health using the support reference.',
      providerFailureCode: upper.slice(0, 120),
    },
  );
}

export async function expireTorqueAssistReservations(
  input: { tenantId?: string; userId?: string; limit?: number } = {},
  executor: Executor = db,
) {
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  const expired = await executor.execute(sql`
    WITH candidates AS (
      SELECT id FROM torqueshed_token_reservations
      WHERE status='active' AND expires_at <= NOW()
        AND (${input.tenantId ?? null}::text IS NULL OR tenant_id=${input.tenantId ?? null})
        AND (${input.userId ?? null}::text IS NULL OR user_id=${input.userId ?? null})
      ORDER BY expires_at,id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE torqueshed_token_reservations reservation
    SET status='expired',consumed_units=0,released_units=reservation.reserved_units,
      release_reason='reservation_expired',expired_at=NOW(),updated_at=NOW()
    FROM candidates
    WHERE reservation.id=candidates.id AND reservation.status='active'
    RETURNING reservation.id,reservation.tenant_id,reservation.assist_request_id,
      reservation.module_id,reservation.idempotency_key,reservation.reserved_units,
      reservation.correlation_id
  `);
  for (const raw of expired.rows) {
    const row = raw as Record<string, any>;
    await executor.execute(sql`
      UPDATE torqueshed_assist_requests
      SET status='expired',error_code='TORQUE_ASSIST_RESERVATION_EXPIRED',
        failure_details_json=${{
          charged: false,
          reservationId: String(row.id),
          reservedUnits: Number(row.reserved_units),
          correlationId: String(row.correlation_id),
        }},updated_at=NOW(),completed_at=NOW()
      WHERE tenant_id=${String(row.tenant_id)} AND id=${String(row.assist_request_id)}
        AND status IN ('reserved','processing')
    `);
    await executor.execute(sql`
      UPDATE shared_idempotency_keys
      SET status='failed',response_status=NULL,response_json=NULL,completed_at=NOW()
      WHERE tenant_id=${String(row.tenant_id)} AND module_id=${String(row.module_id)}
        AND scope='torqueshed.torque-assist.run'
        AND idempotency_key=${String(row.idempotency_key)} AND status='processing'
    `);
  }
  return {
    expiredCount: expired.rows.length,
    reservations: expired.rows.map((row) => camel(row as Record<string, any>)),
  };
}

async function releaseTorqueAssistReservation(input: {
  tenantId: string;
  userId: string;
  moduleId: string;
  assistRequestId: string;
  idempotencyId: string;
  leaseExpiresAt: Date;
  failure: TorqueAssistServiceError;
}) {
  await db.transaction(async (tx) => {
    await lockTorqueBalance(tx, input.tenantId, input.userId);
    const reservation = first(await tx.execute(sql`
      SELECT * FROM torqueshed_token_reservations
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId}
        AND module_id=${input.moduleId} AND assist_request_id=${input.assistRequestId}
      FOR UPDATE
    `));
    const released = reservation?.status === 'active';
    if (released) {
      await tx.execute(sql`
        UPDATE torqueshed_token_reservations
        SET status='released',consumed_units=0,released_units=reserved_units,
          release_reason=${input.failure.code},released_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${String(reservation!.id)} AND status='active'
      `);
    }
    const requestStatus = input.failure.code === 'TORQUE_ASSIST_RESPONSE_INVALID'
      ? 'response_invalid'
      : input.failure.code === 'TORQUE_ASSIST_CANCELLED'
        ? 'cancelled'
        : 'provider_failed';
    await tx.execute(sql`
      UPDATE torqueshed_assist_requests
      SET status=${requestStatus},error_code=${input.failure.code},response_json=NULL,
        actual_units=NULL,failure_details_json=${{
          charged: false,
          retryable: input.failure.details.retryable ?? input.failure.statusCode >= 500,
          correlationId: input.failure.details.correlationId,
          reservationReleased: released,
        }},updated_at=NOW(),completed_at=NOW()
      WHERE tenant_id=${input.tenantId} AND id=${input.assistRequestId}
        AND status IN ('reserved','processing')
    `);
    await failIdempotentOperation({
      tenantId: input.tenantId,
      id: input.idempotencyId,
      leaseExpiresAt: input.leaseExpiresAt,
    }, tx);
  });
}

export async function runTorqueAssist(input: {
  tenantId: string;
  userId: string;
  diagnosticSessionId: string;
  canManage: boolean;
  idempotencyKey: string;
  followUpAnswers: Array<{ question: string; answer: string }>;
  request?: unknown;
}) {
  const module = await torqueShedModule();
  const adapter = getSharedAiProviderAdapter();
  if (adapter.status.state === 'disabled') throw new ProviderDisabledError('ai');
  await assertCircuitClosed(input.tenantId, adapter.status.name);
  const correlationId = torqueAssistCorrelationId(input.request);

  const initial = await db.transaction(async (tx) => {
    await lockTorqueBalance(tx, input.tenantId, input.userId);
    await expireTorqueAssistReservations(
      { tenantId: input.tenantId, userId: input.userId },
      tx,
    );
    let diagnosticContext: Awaited<ReturnType<typeof loadDiagnosticContext>>;
    let context: ReturnType<typeof summarizeContext>;
    try {
      diagnosticContext = await loadDiagnosticContext(input, tx);
      context = summarizeContext(diagnosticContext);
    } catch (error) {
      throw classifiedTorqueAssistFailure(error, correlationId);
    }
    const idempotency = await beginIdempotentOperation({
      tenantId: input.tenantId,
      moduleId: module.id,
      scope: 'torqueshed.torque-assist.run',
      idempotencyKey: input.idempotencyKey,
      request: {
        diagnosticSessionId: input.diagnosticSessionId,
        followUpAnswers: input.followUpAnswers,
      },
      leaseMs: TORQUE_ASSIST_RESERVATION_TTL_MS,
    }, tx);
    if (idempotency.state === 'conflict') {
      throw new TorqueAssistServiceError(
        'Idempotency key was reused for a different Torque Assist request',
        'TORQUE_ASSIST_REQUEST_CONFLICT',
        409,
        { charged: false, correlationId, retryable: false },
      );
    }
    if (idempotency.state === 'in_progress') {
      throw new TorqueAssistServiceError(
        'This Torque Assist reservation is still processing',
        'TORQUE_ASSIST_RESERVATION_CONFLICT',
        409,
        { charged: false, correlationId, retryable: true, retryAfterSeconds: 5 },
      );
    }
    const availability = await torqueTokenAvailability(
      { tenantId: input.tenantId, userId: input.userId, moduleId: module.id },
      tx,
    );
    if (idempotency.state === 'replay') {
      const previous = await requestByKey(input.tenantId, input.userId, input.idempotencyKey, tx);
      if (!previous) {
        throw new TorqueAssistServiceError(
          'Completed Torque Assist request could not be loaded',
          'TORQUE_ASSIST_REQUEST_CONFLICT',
          409,
          { charged: false, correlationId, retryable: false },
        );
      }
      if (idempotency.responseStatus !== 200) {
        const replay = idempotency.responseJson && typeof idempotency.responseJson === 'object'
          ? idempotency.responseJson as Record<string, any>
          : {};
        throw new TorqueAssistServiceError(
          String(replay.error || 'The prior Torque Assist request was not accepted'),
          String(replay.code || 'TORQUE_ASSIST_REQUEST_CONFLICT'),
          idempotency.responseStatus,
          { ...(replay.details ?? {}), replayed: true, charged: false, correlationId },
        );
      }
      return { state: 'replay' as const, row: previous, availability };
    }

    await consumeRateWindow(tx, {
      tenantId: input.tenantId,
      scope: 'tenant',
      subjectId: input.tenantId,
      limit: TORQUE_ASSIST_TENANT_LIMIT_PER_MINUTE,
    });
    await consumeRateWindow(tx, {
      tenantId: input.tenantId,
      scope: 'user',
      subjectId: input.userId,
      limit: TORQUE_ASSIST_USER_LIMIT_PER_MINUTE,
    });

    if (availability.availableUnits < context.estimatedUnits) {
      const insufficient = first(await tx.execute(sql`
        INSERT INTO torqueshed_assist_requests (
          tenant_id,user_id,diagnostic_session_id,status,context_sha256,context_chars,
          context_items,estimated_units,request_metadata,idempotency_key,error_code,
          correlation_id,failure_details_json,completed_at
        ) VALUES (
          ${input.tenantId},${input.userId},${input.diagnosticSessionId},'insufficient_balance',
          ${context.sha256},${context.chars},${context.items},${context.estimatedUnits},
          ${{ codeCount: diagnosticContext.codes.length, evidenceCount: diagnosticContext.entries.length, priorServiceCount: diagnosticContext.priorService.length, followUpAnswerCount: input.followUpAnswers.length }},
          ${input.idempotencyKey},'TORQUE_ASSIST_CREDITS_REQUIRED',${correlationId},
          ${{ charged: false, availableUnits: availability.availableUnits, estimatedUnits: context.estimatedUnits, correlationId }},NOW()
        )
        ON CONFLICT (tenant_id,user_id,idempotency_key) DO UPDATE SET
          status='insufficient_balance',context_sha256=EXCLUDED.context_sha256,
          context_chars=EXCLUDED.context_chars,context_items=EXCLUDED.context_items,
          estimated_units=EXCLUDED.estimated_units,request_metadata=EXCLUDED.request_metadata,
          error_code=EXCLUDED.error_code,correlation_id=EXCLUDED.correlation_id,
          failure_details_json=EXCLUDED.failure_details_json,response_json=NULL,
          actual_units=NULL,updated_at=NOW(),completed_at=NOW()
        WHERE torqueshed_assist_requests.status IN (
          'provider_failed','response_invalid','insufficient_balance','expired','cancelled'
        )
        RETURNING *
      `));
      if (!insufficient) {
        throw new TorqueAssistServiceError(
          'Torque Assist request state conflicts with this reservation attempt',
          'TORQUE_ASSIST_REQUEST_CONFLICT',
          409,
          { charged: false, correlationId, retryable: false },
        );
      }
      await completeIdempotentOperation({
        tenantId: input.tenantId,
        id: idempotency.id,
        leaseExpiresAt: idempotency.leaseExpiresAt,
        responseStatus: 402,
        responseJson: {
          error: 'Torque Assist credits are required before this request can run',
          code: 'TORQUE_ASSIST_CREDITS_REQUIRED',
          details: {
            availableUnits: availability.availableUnits,
            estimatedUnits: context.estimatedUnits,
            charged: false,
            correlationId,
          },
        },
      }, tx);
      return { state: 'insufficient' as const, availability, context, correlationId };
    }

    const request = first(await tx.execute(sql`
      INSERT INTO torqueshed_assist_requests (
        tenant_id,user_id,diagnostic_session_id,status,context_sha256,context_chars,
        context_items,estimated_units,request_metadata,idempotency_key,correlation_id
      ) VALUES (
        ${input.tenantId},${input.userId},${input.diagnosticSessionId},'processing',
        ${context.sha256},${context.chars},${context.items},${context.estimatedUnits},
        ${{ codeCount: diagnosticContext.codes.length, evidenceCount: diagnosticContext.entries.length, priorServiceCount: diagnosticContext.priorService.length, followUpAnswerCount: input.followUpAnswers.length }},
        ${input.idempotencyKey},${correlationId}
      )
      ON CONFLICT (tenant_id,user_id,idempotency_key) DO UPDATE SET
        status='processing',context_sha256=EXCLUDED.context_sha256,
        context_chars=EXCLUDED.context_chars,context_items=EXCLUDED.context_items,
        estimated_units=EXCLUDED.estimated_units,request_metadata=EXCLUDED.request_metadata,
        response_json=NULL,actual_units=NULL,error_code=NULL,latency_ms=NULL,
        provider=NULL,provider_model=NULL,provider_version=NULL,provider_receipt_json=NULL,
        failure_details_json=NULL,attempt_count=0,correlation_id=EXCLUDED.correlation_id,
        updated_at=NOW(),completed_at=NULL
      WHERE torqueshed_assist_requests.status IN (
        'provider_failed','response_invalid','insufficient_balance','expired','cancelled'
      )
      RETURNING *
    `));
    if (!request) {
      throw new TorqueAssistServiceError(
        'Torque Assist request state could not be reserved',
        'TORQUE_ASSIST_REQUEST_CONFLICT',
        409,
        { charged: false, correlationId, retryable: false },
      );
    }
    const reservation = first(await tx.execute(sql`
      INSERT INTO torqueshed_token_reservations (
        tenant_id,user_id,module_id,diagnostic_session_id,assist_request_id,
        idempotency_key,status,reserved_units,correlation_id,expires_at
      ) VALUES (
        ${input.tenantId},${input.userId},${module.id},${input.diagnosticSessionId},
        ${String(request.id)},${input.idempotencyKey},'active',${context.estimatedUnits},
        ${correlationId},NOW() + (${TORQUE_ASSIST_RESERVATION_TTL_MS} * INTERVAL '1 millisecond')
      )
      ON CONFLICT (tenant_id,user_id,idempotency_key) DO UPDATE SET
        assist_request_id=EXCLUDED.assist_request_id,diagnostic_session_id=EXCLUDED.diagnostic_session_id,
        status='active',reserved_units=EXCLUDED.reserved_units,consumed_units=0,released_units=0,
        release_reason=NULL,correlation_id=EXCLUDED.correlation_id,expires_at=EXCLUDED.expires_at,
        updated_at=NOW(),settled_at=NULL,released_at=NULL,expired_at=NULL
      WHERE torqueshed_token_reservations.status IN ('released','expired')
      RETURNING *
    `));
    if (!reservation) {
      throw new TorqueAssistServiceError(
        'An active Torque Assist reservation already owns this request key',
        'TORQUE_ASSIST_RESERVATION_CONFLICT',
        409,
        { charged: false, correlationId, retryable: true, retryAfterSeconds: 5 },
      );
    }
    return {
      state: 'acquired' as const,
      request,
      reservation,
      idempotency,
      diagnosticContext,
      context,
      availability,
      correlationId,
    };
  });

  if (initial.state === 'replay') return responseFromRequest(initial.row, true, initial.availability);
  if (initial.state === 'insufficient') {
    throw new TorqueAssistServiceError(
      'Torque Assist credits are required before this request can run',
      'TORQUE_ASSIST_CREDITS_REQUIRED',
      402,
      {
        charged: false,
        correlationId: initial.correlationId,
        availableUnits: initial.availability.availableUnits,
        estimatedUnits: initial.context.estimatedUnits,
        retryable: false,
        administratorAction: 'Purchase or settle a credit pack, then submit a new Torque Assist request.',
      },
    );
  }

  const assistRequestId = String(initial.request.id);
  const reservationId = String(initial.reservation.id);
  try {
    if ((input.request as any)?.raw?.aborted === true) {
      throw new TorqueAssistServiceError(
        'Torque Assist request was cancelled before provider delivery',
        'TORQUE_ASSIST_CANCELLED',
        499,
        { charged: false, correlationId, retryable: true },
      );
    }
    await db.execute(sql`
      UPDATE torqueshed_assist_requests request
      SET status='processing',updated_at=NOW()
      FROM torqueshed_token_reservations reservation
      WHERE request.tenant_id=${input.tenantId} AND request.id=${assistRequestId}
        AND request.status='reserved' AND reservation.tenant_id=request.tenant_id
        AND reservation.assist_request_id=request.id AND reservation.status='active'
        AND reservation.expires_at > NOW()
    `);

    let completion: Awaited<ReturnType<typeof adapter.complete>> | null = null;
    let result: TorqueAssistResult | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= TORQUE_ASSIST_MAX_PROVIDER_ATTEMPTS; attempt += 1) {
      await db.execute(sql`
        UPDATE torqueshed_assist_requests SET attempt_count=${attempt},updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${assistRequestId} AND status='processing'
      `);
      try {
        completion = await adapter.complete({
          systemPrompt: TORQUE_ASSIST_SYSTEM_PROMPT,
          userPrompt: JSON.stringify({ diagnosticContext: initial.diagnosticContext }),
          maxTokens: 1_200,
          temperature: 0.1,
          responseFormat: 'json',
          timeoutMs: 30_000,
        });
        result = parseTorqueAssistResult(completion.text, initial.context.json);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!completion || !result) throw lastError ?? new Error('Torque Assist provider unavailable');
    if ((input.request as any)?.raw?.aborted === true) {
      throw new TorqueAssistServiceError(
        'Torque Assist request was cancelled before accepted delivery',
        'TORQUE_ASSIST_CANCELLED',
        499,
        { charged: false, correlationId, retryable: true },
      );
    }
    const actualUnits = Math.max(1, Math.floor(completion.tokenCount));
    if (!Number.isSafeInteger(actualUnits) || actualUnits > Number(initial.reservation.reserved_units)) {
      throw new TorqueAssistServiceError(
        'Provider usage exceeded the authorized Torque Assist reservation',
        'TORQUE_ASSIST_RESPONSE_INVALID',
        502,
        { charged: false, correlationId, retryable: false },
      );
    }
    const acceptedStatus = result.status === 'follow_up_required' ? 'follow_up' : 'complete';
    const final = await db.transaction(async (tx) => {
      await lockTorqueBalance(tx, input.tenantId, input.userId);
      const locked = first(await tx.execute(sql`
        SELECT request.*,reservation.id AS reservation_id,reservation.status AS reservation_status,
          reservation.reserved_units,reservation.expires_at,
          (reservation.expires_at > NOW()) AS reservation_unexpired
        FROM torqueshed_assist_requests request
        JOIN torqueshed_token_reservations reservation
          ON reservation.tenant_id=request.tenant_id AND reservation.assist_request_id=request.id
        WHERE request.tenant_id=${input.tenantId} AND request.user_id=${input.userId}
          AND request.id=${assistRequestId} AND reservation.id=${reservationId}
        FOR UPDATE OF request,reservation
      `));
      if (!locked) {
        return { accepted: false as const, code: 'TORQUE_ASSIST_RESERVATION_CONFLICT' };
      }
      if (
        locked.status !== 'processing' || locked.reservation_status !== 'active'
        || locked.reservation_unexpired !== true
      ) {
        if (locked.reservation_status === 'active') {
          await tx.execute(sql`
            UPDATE torqueshed_token_reservations
            SET status='expired',consumed_units=0,released_units=reserved_units,
              release_reason='reservation_expired_before_settlement',expired_at=NOW(),updated_at=NOW()
            WHERE tenant_id=${input.tenantId} AND id=${reservationId} AND status='active'
          `);
          await tx.execute(sql`
            UPDATE torqueshed_assist_requests
            SET status='expired',error_code='TORQUE_ASSIST_RESERVATION_CONFLICT',
              failure_details_json=${{ charged: false, correlationId, reservationExpired: true }},
              updated_at=NOW(),completed_at=NOW()
            WHERE tenant_id=${input.tenantId} AND id=${assistRequestId}
              AND status IN ('reserved','processing')
          `);
        }
        return { accepted: false as const, code: 'TORQUE_ASSIST_RESERVATION_CONFLICT' };
      }
      const debit = first(await tx.execute(sql`
        INSERT INTO torqueshed_token_ledger_entries (
          tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
          diagnostic_session_id,assist_request_id,metadata_json,created_by_user_id
        ) VALUES (
          ${input.tenantId},${input.userId},${module.id},'debit','torque_assist_completion',
          ${actualUnits},${`assist:${assistRequestId}`},${input.diagnosticSessionId},
          ${assistRequestId},${{
            provider: completion!.provider,
            model: completion!.model,
            providerVersion: completion!.version,
            outcome: result!.status,
            reservationId,
            correlationId,
          }},${input.userId}
        )
        ON CONFLICT (tenant_id,assist_request_id) WHERE entry_kind='debit' DO NOTHING
        RETURNING id,units
      `));
      if (!debit) {
        const existingDebit = first(await tx.execute(sql`
          SELECT id,units FROM torqueshed_token_ledger_entries
          WHERE tenant_id=${input.tenantId} AND assist_request_id=${assistRequestId}
            AND entry_kind='debit' LIMIT 1
        `));
        if (!existingDebit || Number(existingDebit.units) !== actualUnits) {
          throw new TorqueAssistServiceError(
            'Torque Assist debit conflicts with the accepted provider result',
            'TORQUE_ASSIST_REQUEST_CONFLICT',
            409,
            { charged: false, correlationId, retryable: false },
          );
        }
      }
      const releasedUnits = Number(locked.reserved_units) - actualUnits;
      await tx.execute(sql`
        UPDATE torqueshed_token_reservations
        SET status='settled',consumed_units=${actualUnits},released_units=${releasedUnits},
          release_reason='accepted_provider_delivery',settled_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${reservationId} AND status='active'
      `);
      const updated = first(await tx.execute(sql`
        UPDATE torqueshed_assist_requests
        SET status=${acceptedStatus},provider=${completion.provider},provider_model=${completion.model},
          provider_version=${completion.version},provider_receipt_json=${{
            provider: completion.provider,
            model: completion.model,
            version: completion.version,
            reportedUnits: actualUnits,
            durationMs: completion.durationMs,
            reservationId,
            correlationId,
          }},response_json=${result},actual_units=${actualUnits},latency_ms=${completion.durationMs},
          error_code=NULL,failure_details_json=NULL,updated_at=NOW(),completed_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${assistRequestId} AND status='processing'
        RETURNING *
      `));
      if (!updated) {
        throw new TorqueAssistServiceError(
          'Torque Assist request changed before finalization',
          'TORQUE_ASSIST_REQUEST_CONFLICT',
          409,
          { charged: false, correlationId, retryable: false },
        );
      }
      await recordUsageEvent({
        tenantId: input.tenantId,
        moduleId: module.id,
        userId: input.userId,
        operation: 'torque_assist.completion',
        units: actualUnits,
        unitKind: 'provider_tokens',
        idempotencyKey: `assist:${assistRequestId}`,
        externalReference: assistRequestId,
        metadata: { provider: completion.provider, model: completion.model, outcome: result.status, reservationId },
      }, tx);
      await appendActivityEvent({
        tenantId: input.tenantId,
        moduleId: module.id,
        actorUserId: input.userId,
        objectType: 'torqueshed_diagnostic',
        objectId: input.diagnosticSessionId,
        eventType: 'torque_assist.completed',
        summary: 'Torque Assist returned an evidence-ranked diagnostic plan.',
        correlationId,
        metadata: { assistRequestId, reservationId, provider: completion.provider, outcome: result.status, actualUnits, releasedUnits },
      }, tx);
      const availability = await torqueTokenAvailability(
        { tenantId: input.tenantId, userId: input.userId, moduleId: module.id },
        tx,
      );
      await completeIdempotentOperation({
        tenantId: input.tenantId,
        id: initial.idempotency.id,
        leaseExpiresAt: initial.idempotency.leaseExpiresAt,
        responseStatus: 200,
        responseJson: { assistRequestId, reservationId },
      }, tx);
      await writeAudit({
        actorUserId: input.userId,
        tenantId: input.tenantId,
        targetType: 'torqueshed_assist_request',
        targetId: assistRequestId,
        action: 'torque_assist_completed',
        after: {
          diagnosticSessionId: input.diagnosticSessionId,
          provider: completion.provider,
          model: completion.model,
          outcome: result.status,
          actualUnits,
          reservedUnits: Number(locked.reserved_units),
          releasedUnits,
          reservationId,
          contextSha256: initial.context.sha256,
          correlationId,
        },
      }, input.request, tx);
      return {
        accepted: true as const,
        row: { ...updated, reservation_id: reservationId, reserved_units: locked.reserved_units, released_units: releasedUnits },
        availability,
      };
    });
    if (!final.accepted) {
      throw new TorqueAssistServiceError(
        'Torque Assist reservation expired or changed before settlement',
        final.code,
        409,
        { charged: false, correlationId, retryable: true, retryAfterSeconds: 1 },
      );
    }
    await recordCircuitSuccess(input.tenantId, adapter.status.name);
    return responseFromRequest(final.row, false, final.availability);
  } catch (error) {
    const failure = classifiedTorqueAssistFailure(error, correlationId);
    await releaseTorqueAssistReservation({
      tenantId: input.tenantId,
      userId: input.userId,
      moduleId: module.id,
      assistRequestId,
      idempotencyId: initial.idempotency.id,
      leaseExpiresAt: initial.idempotency.leaseExpiresAt,
      failure,
    });
    if (
      failure.code === 'TORQUE_ASSIST_PROVIDER_UNAVAILABLE'
      || failure.code === 'TORQUE_ASSIST_PROVIDER_TIMEOUT'
      || failure.code === 'TORQUE_ASSIST_RESPONSE_INVALID'
    ) {
      await recordCircuitFailure(input.tenantId, adapter.status.name, failure.code);
    }
    throw failure;
  }
}

export async function listTorqueAssistHistory(input: {
  tenantId: string;
  diagnosticSessionId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 20)));
  const result = await db.execute(sql`
    SELECT id,diagnostic_session_id,status,estimated_units,actual_units,provider,
      provider_model,provider_version,response_json,error_code,latency_ms,attempt_count,
      created_at,completed_at
    FROM torqueshed_assist_requests
    WHERE tenant_id=${input.tenantId} AND diagnostic_session_id=${input.diagnosticSessionId}
    ORDER BY created_at DESC,id DESC LIMIT ${limit}
  `);
  return result.rows.map((row) => camel(row as Record<string, any>));
}

export function normalizeFollowUpAnswers(
  value: unknown,
): Array<{ question: string; answer: string }> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new TorqueAssistServiceError(
      'followUpAnswers must contain at most 20 items',
      'TORQUE_ASSIST_FOLLOW_UP_INVALID',
      422,
    );
  }
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TorqueAssistServiceError(
        `followUpAnswers[${index}] is invalid`,
        'TORQUE_ASSIST_FOLLOW_UP_INVALID',
        422,
      );
    }
    const row = raw as Record<string, unknown>;
    const question = typeof row.question === 'string' ? row.question.trim() : '';
    const answer = typeof row.answer === 'string' ? row.answer.trim() : '';
    if (!question || !answer || question.length > 1_000 || answer.length > 4_000) {
      throw new TorqueAssistServiceError(
        `followUpAnswers[${index}] is invalid`,
        'TORQUE_ASSIST_FOLLOW_UP_INVALID',
        422,
      );
    }
    return { question, answer };
  });
}

export function safeAssistRequestMetadata(value: unknown): Record<string, unknown> {
  return sanitizeSharedMetadata(value);
}
