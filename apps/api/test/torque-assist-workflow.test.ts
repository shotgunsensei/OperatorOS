process.env.SESSION_SECRET ||= 'operatoros-torque-assist-test-v1';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess } from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';
import {
  getSharedAiProviderAdapter,
  setSharedAiProviderAdapterForTests,
  type SharedAiProviderAdapter,
} from '../src/lib/shared-provider-adapters.js';

let app: any;
let ownerA: any;
let ownerB: any;
let moduleRow: any;
let moduleCreated = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let defaultAi: SharedAiProviderAdapter;

function headers(actor: any, extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${signToken({
      userId: actor.id,
      email: actor.email,
      role: actor.role,
      tokenVersion: actor.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': actor.currentTenantId,
    ...extra,
  };
}

async function inject(
  method: string,
  url: string,
  actor: any,
  payload?: unknown,
  extra: Record<string, string> = {},
) {
  return app.inject({
    method,
    url,
    headers: headers(actor, extra),
    ...(payload === undefined ? {} : { payload }),
  });
}

async function buildApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerTorqueShedRoutes } = await import('../src/routes/torqueshed-routes.js');
  const { registerTorqueAssistRoutes } = await import('../src/routes/torque-assist-routes.js');
  const instance = Fastify();
  await instance.register(cookie);
  instance.removeContentTypeParser('application/json');
  instance.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, raw, done) => {
    (request as any).rawBody = raw;
    try {
      done(null, JSON.parse((raw as Buffer).toString('utf8')));
    } catch (error) {
      done(error as Error);
    }
  });
  await registerTorqueShedRoutes(instance);
  await registerTorqueAssistRoutes(instance);
  await instance.ready();
  return instance;
}

async function createDiagnostic(actor: any, label: string) {
  const vehicleResponse = await inject('POST', '/v1/modules/torqueshed/vehicles', actor, {
    nickname: `${label} vehicle`,
    year: 2018,
    make: 'Example',
    model: 'Roadster',
    engine: '2.0L',
    visibility: 'private',
  });
  assert.equal(vehicleResponse.statusCode, 201, vehicleResponse.body);
  const vehicle = vehicleResponse.json();
  const diagnosticResponse = await inject('POST', '/v1/modules/torqueshed/diagnostics', actor, {
    vehicleId: vehicle.id,
    title: 'Fuel pressure under load',
    customerConcern: 'Hesitation during warm acceleration',
    symptoms: 'Intermittent stumble above 2500 RPM',
    conditions: { coolantTemperatureF: 195, ambientTemperatureF: 82 },
    visibility: 'private',
  });
  assert.equal(diagnosticResponse.statusCode, 201, diagnosticResponse.body);
  const diagnostic = diagnosticResponse.json();
  const code = await inject(
    'POST',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}/trouble-codes`,
    actor,
    { code: 'P0171', description: 'System too lean bank 1', freezeFrame: { rpm: 2680 } },
  );
  assert.equal(code.statusCode, 201, code.body);
  const measurement = await inject(
    'POST',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}/entries`,
    actor,
    {
      kind: 'measurement',
      title: 'Fuel pressure',
      valueNumeric: 35,
      unit: 'psi',
      referenceMin: 40,
      referenceMax: 55,
      outcome: 'Below specification under load',
    },
    { 'idempotency-key': `${label.toLowerCase()}:measurement:0001` },
  );
  assert.equal(measurement.statusCode, 201, measurement.body);
  return diagnostic;
}

function signedPaymentEvent(input: {
  id: string;
  type: string;
  purchase: any;
  amountMinor: number;
  livemode?: boolean;
}) {
  const refund = input.type === 'charge.refunded';
  return {
    id: input.id,
    type: input.type,
    livemode: input.livemode ?? false,
    data: {
      object: {
        id: refund ? `ch_${input.purchase.id}` : input.purchase.providerCheckoutId,
        payment_intent: `pi_${input.purchase.id}`,
        payment_status: refund ? 'succeeded' : 'paid',
        status: refund ? 'succeeded' : 'complete',
        ...(refund ? { amount_refunded: input.amountMinor } : { amount_total: input.amountMinor }),
        currency: 'usd',
        metadata: {
          operatoros_kind: 'torque_assist_credit',
          purchase_id: input.purchase.id,
          tenant_id: input.purchase.tenantId,
          user_id: input.purchase.userId,
          module_id: input.purchase.moduleId,
          package_key: input.purchase.packageKey,
          units: String(input.purchase.units),
        },
      },
    },
  };
}

async function sendPaymentEvent(event: unknown) {
  return app.inject({
    method: 'POST',
    url: '/v1/billing/torque-assist/webhook',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 'operatoros-test-signature',
    },
    payload: JSON.stringify(event),
  });
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'torqueshed')).limit(1);
  if (!moduleRow) {
    moduleRow = await createTestModule('torqueshed');
    moduleCreated = true;
  }
  await db.insert(tenantModules).values([
    {
      tenantId: ownerA.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
    {
      tenantId: ownerB.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
  ]);
  defaultAi = getSharedAiProviderAdapter();
  app = await buildApp();
});

after(async () => {
  setSharedAiProviderAdapterForTests(null);
  if (app) await app.close();
  await db.execute(sql`TRUNCATE TABLE torqueshed_token_ledger_entries`);
  for (const actor of [ownerA, ownerB]) {
    if (!actor) continue;
    const tenantId = actor.currentTenantId;
    for (const table of [
      'shared_webhook_receipts',
      'shared_usage_events',
      'shared_activity_events',
      'shared_idempotency_keys',
      'torqueshed_assist_rate_windows',
      'torqueshed_ai_provider_circuits',
      'torqueshed_assist_requests',
      'operatoros_token_purchase_intents',
      'torqueshed_diagnostic_entries',
      'torqueshed_diagnostic_trouble_codes',
      'torqueshed_diagnostic_sessions',
      'torqueshed_vehicles',
      'activity_feed',
    ]) {
      try {
        await db.execute(
          sql.raw(
            `DELETE FROM ${table} WHERE tenant_id = '${String(tenantId).replaceAll("'", "''")}'`,
          ),
        );
      } catch {}
    }
  }
  if (moduleRow && ownerA && ownerB) {
    const tenantIds = [ownerA.currentTenantId, ownerB.currentTenantId];
    await db
      .delete(tenantUserModuleAccess)
      .where(
        and(
          eq(tenantUserModuleAccess.moduleId, moduleRow.id),
          inArray(tenantUserModuleAccess.tenantId, tenantIds),
        ),
      );
    await db
      .delete(tenantModules)
      .where(
        and(eq(tenantModules.moduleId, moduleRow.id), inArray(tenantModules.tenantId, tenantIds)),
      );
  }
  for (const actor of [ownerA, ownerB]) if (actor) await cleanupUser(actor.id);
  if (moduleRow && moduleCreated) await cleanupModule(moduleRow.id);
});

test('Torque Assist credits, charges, retries, refunds, isolates tenants, and reconciles append-only math', async () => {
  const diagnosticA = await createDiagnostic(ownerA, 'OwnerA');
  const diagnosticB = await createDiagnostic(ownerB, 'OwnerB');

  const noBalance = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerA,
    { diagnosticSessionId: diagnosticA.id },
    { 'idempotency-key': 'phase8:no-balance:0001' },
  );
  assert.equal(noBalance.statusCode, 402, noBalance.body);
  assert.equal(noBalance.json().code, 'TORQUE_ASSIST_BALANCE_EXHAUSTED');

  const checkout = await inject(
    'POST',
    '/v1/modules/torqueshed/token-purchases/checkout',
    ownerA,
    { diagnosticSessionId: diagnosticA.id, packageKey: 'roadside-25000' },
    { 'idempotency-key': 'phase8:purchase:0001' },
  );
  assert.equal(checkout.statusCode, 201, checkout.body);
  const purchase = checkout.json().purchase;
  assert.equal(purchase.status, 'pending');
  assert.equal(purchase.providerMode, 'test');
  assert.equal(purchase.providerCheckoutUrl, null);

  const wrongMode = await sendPaymentEvent(
    signedPaymentEvent({
      id: 'evt_phase8_wrong_mode',
      type: 'checkout.session.completed',
      purchase,
      amountMinor: 500,
      livemode: true,
    }),
  );
  assert.equal(wrongMode.statusCode, 409, wrongMode.body);
  assert.equal(wrongMode.json().code, 'TORQUE_PAYMENT_MODE_CONFLICT');

  const creditEvent = signedPaymentEvent({
    id: 'evt_phase8_credit_0001',
    type: 'checkout.session.completed',
    purchase,
    amountMinor: 500,
  });
  const credit = await sendPaymentEvent(creditEvent);
  assert.equal(credit.statusCode, 200, credit.body);
  assert.equal(credit.json().status, 'processed');
  const duplicateCredit = await sendPaymentEvent(creditEvent);
  assert.equal(duplicateCredit.statusCode, 200, duplicateCredit.body);
  assert.equal(duplicateCredit.json().duplicate, true);
  const creditCount = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${ownerA.currentTenantId} AND entry_kind='credit'
  `);
  assert.equal(creditCount.rows[0]!.count, 1);

  const assistKey = 'phase8:assist:success:0001';
  const assisted = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerA,
    { diagnosticSessionId: diagnosticA.id },
    { 'idempotency-key': assistKey },
  );
  assert.equal(assisted.statusCode, 200, assisted.body);
  const result = assisted.json();
  assert.equal(result.status, 'complete');
  assert.equal(result.result.status, 'plan_ready');
  assert.equal(result.result.hypotheses[0].confidence, 'low');
  assert.ok(result.result.safetyWarnings.length >= 1);
  assert.ok(result.actualUnits > 0);
  assert.ok(result.estimatedUnits > 0);

  const replay = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerA,
    { diagnosticSessionId: diagnosticA.id },
    { 'idempotency-key': assistKey },
  );
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().assistRequestId, result.assistRequestId);
  const successDebit = await db.execute(sql`
    SELECT COUNT(*)::int AS count,SUM(units)::bigint AS units
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${ownerA.currentTenantId} AND assist_request_id=${result.assistRequestId}
      AND entry_kind='debit'
  `);
  assert.equal(successDebit.rows[0]!.count, 1);
  assert.equal(Number(successDebit.rows[0]!.units), result.actualUnits);

  const storedRequest = await db.execute(sql`
    SELECT context_sha256,context_chars,request_metadata::text AS metadata,
      to_jsonb(r.*)::text AS serialized
    FROM torqueshed_assist_requests r
    WHERE tenant_id=${ownerA.currentTenantId} AND id=${result.assistRequestId}
  `);
  assert.equal(String(storedRequest.rows[0]!.context_sha256).length, 64);
  assert.ok(
    !String(storedRequest.rows[0]!.metadata).includes('Hesitation during warm acceleration'),
  );
  assert.ok(!String(storedRequest.rows[0]!.serialized).includes(TORQUE_ASSIST_PROMPT_SENTINEL));

  const failingAdapter: SharedAiProviderAdapter = {
    status: { kind: 'ai', name: 'failing-deterministic-test', state: 'test' },
    async complete() {
      throw Object.assign(new Error('sensitive provider detail must not persist'), {
        code: 'TEST_PROVIDER_TIMEOUT',
      });
    },
  };
  setSharedAiProviderAdapterForTests(failingAdapter);
  const retryKey = 'phase8:assist:retry:0001';
  const failed = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerA,
    { diagnosticSessionId: diagnosticA.id },
    { 'idempotency-key': retryKey },
  );
  assert.equal(failed.statusCode, 503, failed.body);
  assert.equal(failed.json().charged, false);
  const debitAfterFailure = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM torqueshed_token_ledger_entries l
    JOIN torqueshed_assist_requests r ON r.tenant_id=l.tenant_id AND r.id=l.assist_request_id
    WHERE r.tenant_id=${ownerA.currentTenantId} AND r.idempotency_key=${retryKey}
      AND l.entry_kind='debit'
  `);
  assert.equal(debitAfterFailure.rows[0]!.count, 0);
  const failedStorage = await db.execute(sql`
    SELECT status,error_code,response_json,to_jsonb(r.*)::text AS serialized
    FROM torqueshed_assist_requests r
    WHERE tenant_id=${ownerA.currentTenantId} AND idempotency_key=${retryKey}
  `);
  assert.equal(failedStorage.rows[0]!.status, 'provider_failed');
  assert.equal(failedStorage.rows[0]!.error_code, 'TEST_PROVIDER_TIMEOUT');
  assert.equal(failedStorage.rows[0]!.response_json, null);
  assert.ok(!String(failedStorage.rows[0]!.serialized).includes('sensitive provider detail'));

  setSharedAiProviderAdapterForTests(defaultAi);
  const recovered = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerA,
    { diagnosticSessionId: diagnosticA.id },
    { 'idempotency-key': retryKey },
  );
  assert.equal(recovered.statusCode, 200, recovered.body);
  const recoveredDebits = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM torqueshed_token_ledger_entries l
    JOIN torqueshed_assist_requests r ON r.tenant_id=l.tenant_id AND r.id=l.assist_request_id
    WHERE r.tenant_id=${ownerA.currentTenantId} AND r.idempotency_key=${retryKey}
      AND l.entry_kind='debit'
  `);
  assert.equal(recoveredDebits.rows[0]!.count, 1);

  const foreign = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerB,
    { diagnosticSessionId: diagnosticA.id },
    { 'idempotency-key': 'phase8:foreign:0001' },
  );
  assert.equal(foreign.statusCode, 404, foreign.body);

  assert.ok(result.actualUnits * 2 > result.estimatedUnits);
  const raceCredit = result.actualUnits * 2 - 1;
  await db.execute(sql`
    INSERT INTO torqueshed_token_ledger_entries (
      tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
      metadata_json,created_by_user_id
    ) VALUES (
      ${ownerB.currentTenantId},${ownerB.id},${moduleRow.id},'adjustment_credit','test_concurrency_seed',
      ${raceCredit},'phase8:race-credit:0001','{}'::jsonb,${ownerB.id}
    )
  `);
  const race = await Promise.all([
    inject(
      'POST',
      '/v1/modules/torqueshed/torque-assist',
      ownerB,
      { diagnosticSessionId: diagnosticB.id },
      { 'idempotency-key': 'phase8:race:0001' },
    ),
    inject(
      'POST',
      '/v1/modules/torqueshed/torque-assist',
      ownerB,
      { diagnosticSessionId: diagnosticB.id },
      { 'idempotency-key': 'phase8:race:0002' },
    ),
  ]);
  assert.deepEqual(
    race.map((response) => response.statusCode).sort(),
    [200, 402],
    race.map((response) => response.body).join('\n'),
  );
  const raceMath = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN entry_kind IN ('credit','debit_reversal','adjustment_credit') THEN units ELSE -units END),0)::bigint AS balance,
      COUNT(*) FILTER (WHERE entry_kind='debit')::int AS debits
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${ownerB.currentTenantId} AND user_id=${ownerB.id}
  `);
  assert.ok(Number(raceMath.rows[0]!.balance) >= 0);
  assert.equal(raceMath.rows[0]!.debits, 1);

  let rateLimited = false;
  // Six attempts guarantee that the sixth request crosses the five-per-minute
  // user limit even when this assertion begins on a fresh minute boundary.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await inject(
      'POST',
      '/v1/modules/torqueshed/torque-assist',
      ownerB,
      { diagnosticSessionId: diagnosticB.id },
      { 'idempotency-key': `phase8:rate:${attempt.toString().padStart(4, '0')}` },
    );
    if (response.statusCode === 429) {
      rateLimited = true;
      assert.equal(response.json().code, 'TORQUE_ASSIST_RATE_LIMITED');
      break;
    }
    assert.equal(response.statusCode, 402, response.body);
  }
  assert.equal(rateLimited, true);

  const failedCheckout = await inject(
    'POST',
    '/v1/modules/torqueshed/token-purchases/checkout',
    ownerA,
    { diagnosticSessionId: diagnosticA.id, packageKey: 'roadside-25000' },
    { 'idempotency-key': 'phase8:purchase:failed:0001' },
  );
  assert.equal(failedCheckout.statusCode, 201, failedCheckout.body);
  const failedPurchase = failedCheckout.json().purchase;
  const paymentFailed = await sendPaymentEvent(
    signedPaymentEvent({
      id: 'evt_phase8_payment_failed_0001',
      type: 'checkout.session.async_payment_failed',
      purchase: failedPurchase,
      amountMinor: 500,
    }),
  );
  assert.equal(paymentFailed.statusCode, 200, paymentFailed.body);
  const failedPurchaseRow = await db.execute(sql`
    SELECT status FROM operatoros_token_purchase_intents WHERE id=${failedPurchase.id}
  `);
  assert.equal(failedPurchaseRow.rows[0]!.status, 'failed');

  const refund = await sendPaymentEvent(
    signedPaymentEvent({
      id: 'evt_phase8_refund_0001',
      type: 'charge.refunded',
      purchase,
      amountMinor: 500,
    }),
  );
  assert.equal(refund.statusCode, 200, refund.body);
  const reversal = await db.execute(sql`
    SELECT COUNT(*)::int AS count,SUM(units)::bigint AS units
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${ownerA.currentTenantId} AND purchase_intent_id=${purchase.id}
      AND entry_kind='credit_reversal'
  `);
  assert.equal(reversal.rows[0]!.count, 1);
  assert.equal(Number(reversal.rows[0]!.units), 25_000);

  const exhausted = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerA,
    { diagnosticSessionId: diagnosticA.id },
    { 'idempotency-key': 'phase8:assist:after-refund:0001' },
  );
  assert.equal(exhausted.statusCode, 402, exhausted.body);

  const ledger = await inject('GET', '/v1/modules/torqueshed/token-ledger', ownerA);
  assert.equal(ledger.statusCode, 200, ledger.body);
  assert.ok(ledger.json().entries.length >= 4);
  assert.ok(ledger.json().balance < 0);
  const reconciliation = await inject(
    'GET',
    '/v1/modules/torqueshed/token-ledger/reconciliation',
    ownerA,
  );
  assert.equal(reconciliation.statusCode, 200, reconciliation.body);
  assert.equal(reconciliation.json().mathematicallyReconciled, false);
  assert.equal(reconciliation.json().findings.negativeBalances.length, 1);

  const ledgerId = ledger.json().entries[0].id;
  await assert.rejects(
    () =>
      db.execute(sql`
        UPDATE torqueshed_token_ledger_entries SET units=units+1 WHERE id=${ledgerId}
      `),
    (error: any) => {
      const databaseError = error?.cause ?? error;
      return /append-only/i.test(String(databaseError?.message));
    },
  );

  setSharedAiProviderAdapterForTests({
    status: { kind: 'ai', name: 'disabled', state: 'disabled' },
    async complete() {
      throw new Error('disabled');
    },
  });
  const disabled = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerA,
    { diagnosticSessionId: diagnosticA.id },
    { 'idempotency-key': 'phase8:disabled:0001' },
  );
  assert.equal(disabled.statusCode, 503, disabled.body);
  assert.equal(disabled.json().code, 'TORQUE_ASSIST_PROVIDER_DISABLED');
  setSharedAiProviderAdapterForTests(defaultAi);
});

const TORQUE_ASSIST_PROMPT_SENTINEL = 'OPERATOROS_TORQUE_ASSIST_V1';
