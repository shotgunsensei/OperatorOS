import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import * as sdk from '@operatoros/sdk';
import { stripeInvoiceSubscriptionId } from '../src/lib/stripe-invoice-subscription.js';

// Actual source bodies, with only the DB/provider/catalog boundary substituted.
// No production module, environment, HTTP client or database pool is imported.
function compile(file: string, names: string[]) {
  const text = readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declarations = names.map(name => {
    const declaration = tree.statements.find(node =>
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === name);
    assert.ok(declaration, `actual source declaration ${name}`);
    // Export stripping avoids introducing module-local aliases for injected names.
    return declaration.getText(tree).replace(/^export /, '');
  });
  return ts.transpileModule(declarations.join('\n') + `\nmodule.exports={${names.join(',')}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const fenceNames = ['StackMutationConflictError', 'stableValue', 'captureStackMutationSnapshot',
  'lockTenantStack', 'lockExpectedStack', 'withStackTransaction', 'withStackMutation'];
const productNames = ['ProductEntitlementConflictError', 'grantStackEntitlements',
  'changeFreeCompanionModule', 'deactivateSubscriptionEntitlements'];
const billingNames = ['CommercePolicyError', 'withStackMutation', 'stripeResourceId', 'stripePeriodDate',
  'retrieveAuthoritativeSubscription', 'validateExactSubscriptionItems', 'validateAuthoritativeStackSubscription',
  'findStackSubscriptionCandidate', 'stackCheckoutAttemptId', 'isStaleStackCheckoutGeneration',
  'validateStackSubscriptionBinding', 'guardStackFailureReconciliation', 'handleStackCheckoutPaymentFailed',
  'quarantineStackSubscription', 'reconcileStackSubscriptionBeforeCheckout', 'mapStripeStatus',
  'handleSubscriptionUpdated', 'handleSubscriptionDeleted', 'handleSubscriptionCreated',
  'handleCheckoutCompleted', 'handleStackCheckoutCompleted', 'handlePaymentFailed', 'handleInvoicePaid',
  'processWebhookEvent', 'createStackCheckoutSession', 'cancelSubscription', 'reactivateSubscription',
  'changeStackFreeCompanion'];
const compiled = { fence: compile('stack-mutation-fence', fenceNames),
  product: compile('product-entitlements', productNames), billing: compile('billing-service', billingNames) };
function load(code: string, context: Record<string, unknown>): any {
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, Date, JSON, Map, Set, Object, console: { log() {}, warn() {} }, ...context });
  return module.exports;
}

export const tenantId = '11111111-1111-4111-8111-111111111111';
export const userId = '22222222-2222-4222-8222-222222222222';
export const intentId = '33333333-3333-4333-8333-333333333333';
export function intent(changes: Record<string, any> = {}): any {
  return { id: intentId, tenantId, initiatedByUserId: userId, coreProduct: 'techdeck',
    includedCompanionKey: 'snapproofos', additionalModuleKeys: [], additionalSeats: 0,
    status: 'incomplete', stripeCustomerId: 'cus_stack_fixture', stripeCheckoutSessionId: 'cs_old_fixture',
    stripeSubscriptionId: null, corePriceId: 'price_core_fixture', companionPriceId: null,
    additionalSeatPriceId: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
    metadata: { billing_model: 'core_product_stack', billing_interval: 'month', checkout_attempt_id: 'attempt_old' },
    createdAt: new Date('2026-10-19T00:00:00Z'), updatedAt: new Date('2026-10-19T00:00:00Z'), ...changes };
}
export function subscription(row: any, status = 'active'): any {
  return { id: row.stripeSubscriptionId ?? 'sub_old_fixture', customer: row.stripeCustomerId, status,
    cancel_at_period_end: false, current_period_start: 1700000000, current_period_end: 1702678400,
    metadata: { billing_model: 'core_product_stack', billing_interval: 'month', tenant_id: row.tenantId,
      user_id: row.initiatedByUserId, internal_application_subscription_id: row.id,
      checkout_attempt_id: row.metadata.checkout_attempt_id, selected_core_product: row.coreProduct,
      selected_free_companion_module: row.includedCompanionKey, additional_module_keys: row.additionalModuleKeys.join(','),
      additional_seats: String(row.additionalSeats) },
    items: { data: [{ price: { id: row.corePriceId }, quantity: 1 },
      ...(row.additionalModuleKeys.length ? [{ price: { id: row.companionPriceId }, quantity: row.additionalModuleKeys.length }] : []),
      ...(row.additionalSeats ? [{ price: { id: row.additionalSeatPriceId }, quantity: row.additionalSeats }] : [])] } };
}
export function checkout(row: any, payment = 'unpaid'): any {
  const sub = subscription(row);
  return { id: row.stripeCheckoutSessionId, mode: 'subscription', status: 'complete', payment_status: payment,
    customer: sub.customer, subscription: sub.id, metadata: sub.metadata };
}
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

type Table = { name: string; [key: string]: any };
type Predicate = { kind: 'eq'; column: { key: string }; value: unknown } | { kind: 'and'; parts: Predicate[] };
const table = (name: string): Table => new Proxy({ name }, { get(target, key: string) {
  return key === 'name' ? target.name : { table: target.name, key };
} });
const tables = { tenantApplicationSubscriptions: table('stacks'), tenantEntitlements: table('entitlements'),
  tenants: table('tenants'), users: table('users'), subscriptions: table('legacy'),
  billingEvents: table('events'), activityFeed: table('activity') };

export function stackFixture(initial = intent()) {
  let state: Record<string, any[]> = { stacks: initial ? [structuredClone(initial)] : [], entitlements: [],
    tenants: [{ id: tenantId, seatLimit: 0, metadata: {} }], users: [{ id: userId, email: 'owner@example.invalid', name: 'Synthetic owner' }],
    legacy: [], events: [], activity: [] };
  const operations: Array<{ tx: number; kind: string; table?: string; selectedTenants?: string[] }> = [];
  const propagations: string[] = [];
  const providerCalls: string[] = [];
  const context = new AsyncLocalStorage<number>();
  let txSequence = 0;
  let queue = Promise.resolve();
  let failureTable: string | undefined;
  let beforeLock: (() => Promise<void>) | undefined;
  let beforeWrite: ((name: string) => Promise<void>) | undefined;
  const matches = (row: any, predicate?: Predicate): boolean => !predicate || (predicate.kind === 'and'
    ? predicate.parts.every(part => matches(row, part)) : row[predicate.column.key] === predicate.value);
  const project = (row: any, fields: any) => fields
    ? Object.fromEntries(Object.entries(fields).map(([key, column]: [string, any]) => [key, structuredClone(row[column.key])]))
    : structuredClone(row);
  function executor(tx = 0): any {
    const guard = () => { if (!tx && context.getStore()) throw new Error('Global database escaped supplied transaction'); };
    return {
      select(fields?: any) {
        guard();
        return { from(target: Table) {
          let predicate: Predicate | undefined; let count: number | undefined;
          const query: any = {
            where(value: Predicate) { predicate = value; return query; },
            limit(value: number) { count = value; return query; },
            async for(mode: string) {
              assert.equal(mode, 'update'); assert.ok(tx, 'lock must use transaction');
              await beforeLock?.();
              operations.push({ tx, kind: 'lock', table: target.name });
              return rows();
            },
            then(resolve: any, reject: any) { return rows().then(resolve, reject); },
          };
          async function rows() {
            const selected = state[target.name].filter(row => matches(row, predicate)).slice(0, count);
            operations.push({ tx, kind: 'read', table: target.name,
              selectedTenants: selected.map(row => row.tenantId).filter(value => typeof value === 'string') });
            return selected.map(row => project(row, fields));
          }
          return query;
        } };
      },
      update(target: Table) {
        guard();
        return { set(values: any) { return { where(predicate: Predicate) {
          let result: Promise<any[]> | undefined;
          const execute = () => result ??= (async () => {
            await beforeWrite?.(target.name);
            if (failureTable === target.name) throw new Error('Synthetic write failure');
            operations.push({ tx, kind: 'write', table: target.name });
            const changed = state[target.name].filter(row => matches(row, predicate));
            for (const row of changed) {
              const update = structuredClone(values);
              if (update.metadata?.kind === 'sql') {
                const json = update.metadata.values.filter((value: unknown) => typeof value === 'string' && value.startsWith('{')).at(-1);
                update.metadata = { ...row.metadata, ...(json ? JSON.parse(json) : {}) };
              }
              Object.assign(row, update);
            }
            return changed.map(row => structuredClone(row));
          })();
          return { then(resolve: any, reject: any) { return execute().then(resolve, reject); },
            returning(fields?: any) { return execute().then(rows => rows.map(row => project(row, fields))); } };
        } }; } };
      },
      insert(target: Table) {
        guard();
        return { values(values: any) {
          const rows = (Array.isArray(values) ? values : [values]).map(value => ({ id: randomUUID(), active: true, ...value }));
          let result: Promise<any[]> | undefined;
          const execute = () => result ??= (async () => {
            await beforeWrite?.(target.name);
            if (failureTable === target.name) throw new Error('Synthetic write failure');
            operations.push({ tx, kind: 'write', table: target.name });
            state[target.name].push(...structuredClone(rows)); return rows;
          })();
          const query: any = { onConflictDoNothing() { return query; }, returning() { return execute(); },
            then(resolve: any, reject: any) { return execute().then(resolve, reject); } };
          return query;
        } };
      },
      async execute() { guard(); return { rows: [] }; },
    };
  }
  const db = { ...executor(), async transaction(action: (tx: any) => Promise<any>) {
    assert.equal(context.getStore(), undefined, 'independent nested transaction prohibited');
    const previous = queue; const release = deferred(); queue = release.promise;
    await previous;
    const saved = structuredClone(state); const tx = ++txSequence;
    operations.push({ tx, kind: 'begin' });
    try { const value = await context.run(tx, () => action(executor(tx))); operations.push({ tx, kind: 'commit' }); return value; }
    catch (error) { state = saved; operations.push({ tx, kind: 'rollback' }); throw error; }
    finally { release.resolve(); }
  } };
  let provider = subscription(initial ?? intent());
  let providerHook: (() => Promise<void>) | undefined;
  let catalogHook: (() => Promise<void>) | undefined;
  let createHook: (() => Promise<void>) | undefined;
  let sessionHook: (() => Promise<void>) | undefined;
  let sessionStatus = 'complete';
  const globals = { ...sdk, ...tables, db, stripeInvoiceSubscriptionId,
    eq: (column: any, value: any) => ({ kind: 'eq', column, value }), and: (...parts: any[]) => ({ kind: 'and', parts }),
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({ kind: 'sql', strings: [...strings], values }),
    crypto: { randomUUID }, process: { env: { STRIPE_PRICE_TECHDECK_MONTHLY: 'price_core_fixture', STRIPE_PRICE_COMPANION_MODULE_MONTHLY: 'price_companion_fixture' } },
    isCoreProductKey: (key: string) => Object.hasOwn(sdk.CORE_PRODUCTS_BY_KEY, key),
    isStripeEnabled: () => true, assertBillingWebhookBindingReady() {}, resolveAppBaseUrl: () => 'https://app.example.invalid',
    stripeCustomerHasForeignTenant: async () => false, findGrandfatheredLegacyByStripeSubscriptionId: async () => null,
    findGrandfatheredLegacySubscription: async () => null,
    selectionPriceExpectations: (_core: any, modules: number, seats: number, row: any) => [
      { priceId: row.corePriceId, quantity: 1 }, ...(modules ? [{ priceId: row.companionPriceId, quantity: modules }] : []),
      ...(seats ? [{ priceId: row.additionalSeatPriceId, quantity: seats }] : [])],
    async validatePriceExpectations() { assert.equal(context.getStore(), undefined, 'catalog must be outside DB lock'); await catalogHook?.(); },
    getStripe: () => ({ subscriptions: {
      async retrieve(id: string) { assert.equal(context.getStore(), undefined); providerCalls.push(`retrieve:${id}`);
        const snapshot = structuredClone(provider); await providerHook?.(); return snapshot; },
      async update(id: string, input: any) { assert.equal(context.getStore(), undefined); providerCalls.push(`update:${id}`);
        await providerHook?.(); provider = { ...provider, ...input }; return structuredClone(provider); },
    }, checkout: { sessions: { async retrieve(id: string) { providerCalls.push(`session:${id}`); await sessionHook?.(); return { id, status: sessionStatus, url: 'https://checkout.example.invalid/old' }; },
      async create() { assert.equal(context.getStore(), undefined); providerCalls.push('create'); await createHook?.();
        return { id: 'cs_new_fixture', url: 'https://checkout.example.invalid/new' }; } } } }),
    writeAudit: async (_entry: any, _request: any, tx: any) => { assert.ok(tx); await tx.insert(tables.activityFeed).values({ audit: true }); },
    require: () => ({ schedulePropagation: (id: string) => propagations.push(id), schedulePropagationForUser: (id: string) => propagations.push(id) }),
  };
  const fence = load(compiled.fence, globals);
  const product = load(compiled.product, { ...globals, ...fence });
  const billing = load(compiled.billing, { ...globals, ...product, ...fence, runStackMutation: fence.withStackMutation });
  return { billing, product, fence, db, tables, operations, propagations, providerCalls,
    get state() { return state; }, setProvider(value: any) { provider = structuredClone(value); },
    setProviderHook(value?: () => Promise<void>) { providerHook = value; },
    setCatalogHook(value?: () => Promise<void>) { catalogHook = value; },
    setCreateHook(value?: () => Promise<void>) { createHook = value; },
    setSessionHook(value?: () => Promise<void>) { sessionHook = value; },
    setBeforeLock(value?: () => Promise<void>) { beforeLock = value; },
    setBeforeWrite(value?: (name: string) => Promise<void>) { beforeWrite = value; },
    failOnTable(value?: string) { failureTable = value; }, setSessionStatus(value: string) { sessionStatus = value; } };
}
