import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { intent, stackFixture, subscription, tenantId } from './_stack-billing-source.js';
import type { FailedPaymentReadClient } from '../src/lib/stripe-failed-payment-correlation.js';

export function paymentGraph(row = intent({ status: 'active', stripeSubscriptionId: 'sub_bound_fixture' })) {
  const state: Record<string, any> = {
    paymentIntent: { id: 'pi_bound_fixture', object: 'payment_intent', customer: row.stripeCustomerId,
      customer_account: null, livemode: false, metadata: {}, status: 'succeeded' },
    invoice: { id: 'in_bound_fixture', object: 'invoice', customer: row.stripeCustomerId,
      customer_account: null, livemode: false, parent: { type: 'subscription_details', subscription_details: {
        subscription: row.stripeSubscriptionId ?? 'sub_bound_fixture', metadata: null } } },
    subscription: { ...subscription({ ...row, stripeSubscriptionId: row.stripeSubscriptionId ?? 'sub_bound_fixture' }),
      object: 'subscription', livemode: false, customer_account: null, latest_invoice: 'in_bound_fixture' },
  };
  state.pages = [{ object: 'list', has_more: false, data: [{ id: 'inpay_bound_fixture', object: 'invoice_payment',
    livemode: false, invoice: state.invoice.id, payment: { type: 'payment_intent', payment_intent: state.paymentIntent.id } }] }];
  const event: any = { id: 'evt_bound_failed_fixture', type: 'payment_intent.payment_failed', livemode: false,
    data: { object: { ...structuredClone(state.paymentIntent), status: 'requires_payment_method' } } };
  const reads: Array<{ kind: string; id?: string; params?: unknown; options?: unknown }> = [];
  let hook: ((kind: string) => Promise<void>) | undefined;
  async function record(kind: string, id: string | undefined, params: unknown, options: unknown, value: unknown) {
    reads.push({ kind, id, params, options });
    await hook?.(kind);
    return structuredClone(value);
  }
  const client: FailedPaymentReadClient = {
    paymentIntents: { retrieve: (id, params, options) => record('pi', id, params, options, state.paymentIntent) },
    invoicePayments: { list: (params, options) => {
      const index = reads.filter(read => read.kind === 'allocations').length;
      return record('allocations', undefined, params, options, state.pages[index] ?? state.pages.at(-1));
    } },
    invoices: { retrieve: (id, params, options) => record('invoice', id, params, options, state.invoice) },
    subscriptions: { retrieve: (id, params, options) => record('subscription', id, params, options, state.subscription) },
  };
  return { row, state, event, reads, client, setReadHook(value?: (kind: string) => Promise<void>) { hook = value; } };
}

export function failedPaymentFixture(changes: Record<string, any> = {}) {
  const row = intent({ status: 'active', stripeSubscriptionId: 'sub_bound_fixture', ...changes });
  const graph = paymentGraph(row);
  const f = stackFixture(row, { readClient: graph.client });
  f.setProvider(graph.state.subscription);
  f.state.entitlements.push({ id: 'existing_core', tenantId, entitlementType: 'core_product', active: true,
    stripeSubscriptionId: row.stripeSubscriptionId });
  return { ...graph, f, setProvider(value: any) { graph.state.subscription = structuredClone(value); f.setProvider(value); } };
}

function declarations(file: string, names: string[]) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return names.map(name => {
    const node = tree.statements.find(statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name
      || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => d.name.getText(tree) === name));
    assert.ok(node, `actual source declaration ${name}`);
    return node.getText(tree).replace(/^export /, '');
  }).join('\n');
}

export function actualWebhookHandler(context: Record<string, unknown>) {
  const text = readFileSync(new URL('../src/routes/billing-routes.ts', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('billing-routes.ts', text, ts.ScriptTarget.Latest, true);
  let handler: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'post' && ts.isStringLiteral(node.arguments[0])
        && node.arguments[0].text === '/v1/billing/webhook') handler = node.arguments.at(-1)!.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(handler);
  const source = declarations('../src/lib/billing-service.ts', ['classifyWebhookEvent', 'billingObservationResult']);
  const code = ts.transpileModule(`${source}\nmodule.exports=${handler};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: undefined as any };
  runInNewContext(code, { module, Buffer, console: { log() {}, warn() {}, error() {} },
    CALLCOMMAND_NUMBER_FEATURE_KEY: 'managed_phone_numbers', OperatorOsTokenBillingError: class extends Error {},
    stripeWebhookFailureDiagnostic: () => ({}), ...context });
  return module.exports;
}

export function actualSavedRetry(context: Record<string, unknown>): (id: string) => Promise<any> {
  const source = declarations('../src/lib/billing-service.ts', [
    'STRIPE_EVENT_PROCESSING_LEASE_MS', 'stripeEventLeaseMetadata', 'classifyWebhookEvent', 'billingObservationResult', 'retryBillingEvent',
  ]);
  const code = ts.transpileModule(`${source}\nmodule.exports=retryBillingEvent;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: undefined as any };
  runInNewContext(code, { module, Date, console: { log() {}, warn() {}, error() {} },
    require() { throw new Error('Unexpected feature module import'); }, ...context });
  return module.exports;
}
