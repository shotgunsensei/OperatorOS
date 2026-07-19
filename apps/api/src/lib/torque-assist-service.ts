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
  TORQUE_ASSIST_SYSTEM_PROMPT,
  TORQUE_ASSIST_TENANT_LIMIT_PER_MINUTE,
  TORQUE_ASSIST_USER_LIMIT_PER_MINUTE,
  type TorqueAssistResult,
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
  return {
    balance: await torqueTokenBalance({
      tenantId: input.tenantId,
      userId: input.userId,
      moduleId: module.id,
    }),
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
      SELECT p.id,p.user_id,p.status,p.units,
        COALESCE(SUM(CASE WHEN l.entry_kind='credit' THEN l.units ELSE 0 END),0)::bigint AS credited_units,
        COALESCE(SUM(CASE WHEN l.entry_kind='credit_reversal' THEN l.units ELSE 0 END),0)::bigint AS reversed_units
      FROM operatoros_token_purchase_intents p
      LEFT JOIN torqueshed_token_ledger_entries l
        ON l.tenant_id=p.tenant_id AND l.purchase_intent_id=p.id
      WHERE p.tenant_id=${tenantId} AND p.module_id=${module.id}
      GROUP BY p.id,p.user_id,p.status,p.units
      HAVING
        (p.status='credited' AND COALESCE(SUM(CASE WHEN l.entry_kind='credit' THEN l.units ELSE 0 END),0)<>p.units)
        OR (p.status='refunded' AND COALESCE(SUM(CASE WHEN l.entry_kind='credit_reversal' THEN l.units ELSE 0 END),0)<>p.units)
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
}) {
  const diagnostic = first(
    await db.execute(sql`
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
  const [codes, entries, service] = await Promise.all([
    db.execute(sql`
      SELECT code,description,code_status,freeze_frame,observed_at
      FROM torqueshed_diagnostic_trouble_codes
      WHERE tenant_id=${input.tenantId} AND diagnostic_session_id=${input.diagnosticSessionId}
        AND archived_at IS NULL ORDER BY observed_at,id LIMIT 100
    `),
    db.execute(sql`
      SELECT kind,title,value_text,value_numeric,unit,reference_min,reference_max,outcome,metadata,observed_at
      FROM torqueshed_diagnostic_entries
      WHERE tenant_id=${input.tenantId} AND diagnostic_session_id=${input.diagnosticSessionId}
        AND archived_at IS NULL ORDER BY observed_at,id LIMIT 250
    `),
    db.execute(sql`
      SELECT kind,title,description,mileage,occurred_at,status
      FROM torqueshed_service_records
      WHERE tenant_id=${input.tenantId} AND vehicle_id=${String(diagnostic.vehicle_id)}
        AND archived_at IS NULL ORDER BY occurred_at DESC,id DESC LIMIT 50
    `),
  ]);
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

function responseFromRequest(row: Record<string, any>, replayed: boolean) {
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
    replayed,
  };
}

async function requestByKey(tenantId: string, userId: string, key: string) {
  return first(
    await db.execute(sql`
      SELECT * FROM torqueshed_assist_requests
      WHERE tenant_id=${tenantId} AND user_id=${userId} AND idempotency_key=${key}
      LIMIT 1
    `),
  );
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
  const diagnosticContext = await loadDiagnosticContext(input);
  const context = summarizeContext(diagnosticContext);
  const adapter = getSharedAiProviderAdapter();
  if (adapter.status.state === 'disabled') throw new ProviderDisabledError('ai');
  await assertCircuitClosed(input.tenantId, adapter.status.name);

  const idempotency = await beginIdempotentOperation({
    tenantId: input.tenantId,
    moduleId: module.id,
    scope: 'torqueshed.torque-assist.run',
    idempotencyKey: input.idempotencyKey,
    request: {
      diagnosticSessionId: input.diagnosticSessionId,
      followUpAnswers: input.followUpAnswers,
    },
    leaseMs: 2 * 60_000,
  });
  if (idempotency.state === 'conflict') {
    throw new TorqueAssistServiceError(
      'Idempotency key was reused for a different Torque Assist request',
      'TORQUE_ASSIST_IDEMPOTENCY_CONFLICT',
      409,
    );
  }
  if (idempotency.state === 'in_progress') {
    throw new TorqueAssistServiceError(
      'This Torque Assist request is still processing',
      'TORQUE_ASSIST_IN_PROGRESS',
      409,
      { retryAfterSeconds: 5 },
    );
  }
  if (idempotency.state === 'replay') {
    const previous = await requestByKey(input.tenantId, input.userId, input.idempotencyKey);
    if (!previous) {
      throw new TorqueAssistServiceError(
        'Completed Torque Assist request could not be loaded',
        'TORQUE_ASSIST_REPLAY_MISSING',
        503,
      );
    }
    if (idempotency.responseStatus !== 200) {
      throw new TorqueAssistServiceError(
        'Torque Assist balance is exhausted',
        'TORQUE_ASSIST_BALANCE_EXHAUSTED',
        idempotency.responseStatus,
        {
          balance: await torqueTokenBalance(input),
          estimatedUnits: context.estimatedUnits,
          replayed: true,
        },
      );
    }
    return responseFromRequest(previous, true);
  }

  let assistRequest: Record<string, any> | null = null;
  try {
    const initial = await db.transaction(async (tx) => {
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
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.userId}:${module.id}`}))`,
      );
      const balance = await torqueTokenBalance(
        { tenantId: input.tenantId, userId: input.userId, moduleId: module.id },
        tx,
      );
      const status = balance >= context.estimatedUnits ? 'processing' : 'insufficient_balance';
      const row = first(
        await tx.execute(sql`
          INSERT INTO torqueshed_assist_requests (
            tenant_id,user_id,diagnostic_session_id,status,context_sha256,context_chars,
            context_items,estimated_units,request_metadata,idempotency_key
          ) VALUES (
            ${input.tenantId},${input.userId},${input.diagnosticSessionId},${status},${context.sha256},
            ${context.chars},${context.items},${context.estimatedUnits},
            ${{ codeCount: diagnosticContext.codes.length, evidenceCount: diagnosticContext.entries.length, priorServiceCount: diagnosticContext.priorService.length, followUpAnswerCount: input.followUpAnswers.length }},
            ${input.idempotencyKey}
          )
          ON CONFLICT (tenant_id,user_id,idempotency_key) DO UPDATE SET
            status=EXCLUDED.status,context_sha256=EXCLUDED.context_sha256,
            context_chars=EXCLUDED.context_chars,context_items=EXCLUDED.context_items,
            estimated_units=EXCLUDED.estimated_units,request_metadata=EXCLUDED.request_metadata,
            response_json=NULL,actual_units=NULL,error_code=NULL,latency_ms=NULL,
            provider=NULL,provider_model=NULL,provider_version=NULL,attempt_count=0,
            updated_at=NOW(),completed_at=NULL
          WHERE torqueshed_assist_requests.status IN ('provider_failed','insufficient_balance')
          RETURNING *
        `),
      );
      if (!row) {
        throw new TorqueAssistServiceError(
          'Torque Assist request state could not be reclaimed',
          'TORQUE_ASSIST_REQUEST_CONFLICT',
          409,
        );
      }
      if (status === 'insufficient_balance') {
        await completeIdempotentOperation(
          {
            tenantId: input.tenantId,
            id: idempotency.id,
            leaseExpiresAt: idempotency.leaseExpiresAt,
            responseStatus: 402,
            responseJson: { assistRequestId: row.id, code: 'TORQUE_ASSIST_BALANCE_EXHAUSTED' },
          },
          tx,
        );
      }
      return { row, balance, status };
    });
    assistRequest = initial.row;
    if (initial.status === 'insufficient_balance') {
      throw new TorqueAssistServiceError(
        'Torque Assist balance is exhausted',
        'TORQUE_ASSIST_BALANCE_EXHAUSTED',
        402,
        { balance: initial.balance, estimatedUnits: context.estimatedUnits },
      );
    }

    let completion: Awaited<ReturnType<typeof adapter.complete>> | null = null;
    let result: TorqueAssistResult | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= TORQUE_ASSIST_MAX_PROVIDER_ATTEMPTS; attempt += 1) {
      await db.execute(sql`
        UPDATE torqueshed_assist_requests SET attempt_count=${attempt},updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${String(assistRequest.id)}
      `);
      try {
        completion = await adapter.complete({
          systemPrompt: TORQUE_ASSIST_SYSTEM_PROMPT,
          userPrompt: JSON.stringify({ diagnosticContext }),
          maxTokens: 1_200,
          temperature: 0.1,
          responseFormat: 'json',
          timeoutMs: 30_000,
        });
        result = parseTorqueAssistResult(completion.text, context.json);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!completion || !result) throw lastError ?? new Error('Torque Assist provider failed');
    const actualUnits = Math.max(1, Math.floor(completion.tokenCount));
    const acceptedStatus = result.status === 'follow_up_required' ? 'follow_up' : 'complete';
    const final = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.userId}:${module.id}`}))`,
      );
      const balance = await torqueTokenBalance(
        { tenantId: input.tenantId, userId: input.userId, moduleId: module.id },
        tx,
      );
      if (balance < actualUnits) {
        await tx.execute(sql`
          UPDATE torqueshed_assist_requests
          SET status='insufficient_balance',provider=${completion.provider},
            provider_model=${completion.model},provider_version=${completion.version},
            actual_units=${actualUnits},latency_ms=${completion.durationMs},
            error_code='TORQUE_ASSIST_BALANCE_EXHAUSTED',updated_at=NOW(),completed_at=NOW()
          WHERE tenant_id=${input.tenantId} AND id=${String(assistRequest!.id)}
        `);
        await completeIdempotentOperation(
          {
            tenantId: input.tenantId,
            id: idempotency.id,
            leaseExpiresAt: idempotency.leaseExpiresAt,
            responseStatus: 402,
            responseJson: {
              assistRequestId: assistRequest!.id,
              code: 'TORQUE_ASSIST_BALANCE_EXHAUSTED',
            },
          },
          tx,
        );
        return { accepted: false as const, balance };
      }
      const updated = first(
        await tx.execute(sql`
          UPDATE torqueshed_assist_requests
          SET status=${acceptedStatus},provider=${completion.provider},provider_model=${completion.model},
            provider_version=${completion.version},response_json=${result},actual_units=${actualUnits},
            latency_ms=${completion.durationMs},error_code=NULL,updated_at=NOW(),completed_at=NOW()
          WHERE tenant_id=${input.tenantId} AND id=${String(assistRequest!.id)} AND status='processing'
          RETURNING *
        `),
      );
      if (!updated) {
        throw new TorqueAssistServiceError(
          'Torque Assist result was already finalized',
          'TORQUE_ASSIST_FINALIZATION_CONFLICT',
          409,
        );
      }
      await tx.execute(sql`
        INSERT INTO torqueshed_token_ledger_entries (
          tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
          diagnostic_session_id,assist_request_id,metadata_json,created_by_user_id
        ) VALUES (
          ${input.tenantId},${input.userId},${module.id},'debit','torque_assist_completion',
          ${actualUnits},${`assist:${assistRequest!.id}`},${input.diagnosticSessionId},
          ${String(assistRequest!.id)},
          ${{ provider: completion.provider, model: completion.model, providerVersion: completion.version, outcome: result.status }},
          ${input.userId}
        ) ON CONFLICT DO NOTHING
      `);
      await recordUsageEvent(
        {
          tenantId: input.tenantId,
          moduleId: module.id,
          userId: input.userId,
          operation: 'torque_assist.completion',
          units: actualUnits,
          unitKind: 'provider_tokens',
          idempotencyKey: `assist:${assistRequest!.id}`,
          externalReference: String(assistRequest!.id),
          metadata: {
            provider: completion.provider,
            model: completion.model,
            outcome: result.status,
            contextChars: context.chars,
          },
        },
        tx,
      );
      await appendActivityEvent(
        {
          tenantId: input.tenantId,
          moduleId: module.id,
          actorUserId: input.userId,
          objectType: 'torqueshed_diagnostic',
          objectId: input.diagnosticSessionId,
          eventType: 'torque_assist.completed',
          summary: 'Torque Assist returned an evidence-ranked diagnostic plan.',
          metadata: {
            assistRequestId: assistRequest!.id,
            provider: completion.provider,
            outcome: result.status,
            actualUnits,
          },
        },
        tx,
      );
      await completeIdempotentOperation(
        {
          tenantId: input.tenantId,
          id: idempotency.id,
          leaseExpiresAt: idempotency.leaseExpiresAt,
          responseStatus: 200,
          responseJson: { assistRequestId: assistRequest!.id },
        },
        tx,
      );
      await writeAudit(
        {
          actorUserId: input.userId,
          tenantId: input.tenantId,
          targetType: 'torqueshed_assist_request',
          targetId: String(assistRequest!.id),
          action: 'torque_assist_completed',
          after: {
            diagnosticSessionId: input.diagnosticSessionId,
            provider: completion.provider,
            model: completion.model,
            outcome: result.status,
            actualUnits,
            contextSha256: context.sha256,
          },
        },
        input.request,
        tx,
      );
      return { accepted: true as const, row: updated };
    });
    if (!final.accepted) {
      throw new TorqueAssistServiceError(
        'Torque Assist balance changed before final charge',
        'TORQUE_ASSIST_BALANCE_EXHAUSTED',
        402,
        { balance: final.balance, actualUnits },
      );
    }
    await recordCircuitSuccess(input.tenantId, adapter.status.name);
    return responseFromRequest(final.row, false);
  } catch (error) {
    if (
      error instanceof TorqueAssistServiceError &&
      (error.code === 'TORQUE_ASSIST_BALANCE_EXHAUSTED' ||
        error.code === 'TORQUE_ASSIST_RATE_LIMITED')
    ) {
      if (error.code === 'TORQUE_ASSIST_RATE_LIMITED') {
        await failIdempotentOperation({
          tenantId: input.tenantId,
          id: idempotency.id,
          leaseExpiresAt: idempotency.leaseExpiresAt,
        });
      }
      throw error;
    }
    const code = safeFailureCode(error, 'TORQUE_ASSIST_PROVIDER_FAILED');
    if (assistRequest) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          UPDATE torqueshed_assist_requests
          SET status='provider_failed',provider=${adapter.status.name},error_code=${code},
            response_json=NULL,actual_units=NULL,updated_at=NOW(),completed_at=NOW()
          WHERE tenant_id=${input.tenantId} AND id=${String(assistRequest!.id)}
            AND status='processing'
        `);
        await failIdempotentOperation(
          {
            tenantId: input.tenantId,
            id: idempotency.id,
            leaseExpiresAt: idempotency.leaseExpiresAt,
          },
          tx,
        );
      });
    } else {
      await failIdempotentOperation({
        tenantId: input.tenantId,
        id: idempotency.id,
        leaseExpiresAt: idempotency.leaseExpiresAt,
      });
    }
    await recordCircuitFailure(input.tenantId, adapter.status.name, code);
    throw new TorqueAssistServiceError(
      'Torque Assist provider could not return an accepted result',
      code,
      503,
      { charged: false },
    );
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
