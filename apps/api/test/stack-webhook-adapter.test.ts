import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import Stripe from 'stripe';
import ts from 'typescript';

// No application/database imports. An alternate source root lets these exact
// desired-behavior assertions exercise an immutable baseline without editing it.
const root = process.env.STACK_ADAPTER_SOURCE_ROOT
  ?? fileURLToPath(new URL('../../../', import.meta.url));
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const contract = JSON.parse(read('config/production-environment.contract.json'));
function compile(file: string, names?: string[]) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const statements = names
    ? source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''))
    : source.statements.filter(node => !ts.isImportDeclaration(node));
  if (names) assert.equal(statements.length, names.length);
  return ts.transpileModule(statements.map(node => node.getText(source)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const safety = compile('apps/api/src/lib/shared-service-safety.ts');
const binding = compile('apps/api/src/lib/billing-webhook-binding.ts');
const verification = compile('apps/api/src/lib/billing-service.ts', ['verifyWebhookSignature']);
const factory = compile('apps/api/src/lib/shared-provider-adapters.ts', ['getPaymentProviderAdapter']);
function load(code: string, bindings: Record<string, unknown>): Record<string, any> {
  const exports = {};
  runInNewContext(code, { exports, Buffer, URL, ...bindings }, { timeout: 2000 });
  return exports;
}

let httpCalls = 0;
const sdk = new Stripe('sk_test_synthetic_adapter_selection_only', { maxNetworkRetries: 0, httpClient: {
  getClientName: () => 'blocked-offline',
  makeRequest() { httpCalls++; throw new Error('Synthetic fixture prohibits networking'); },
  async makeRequestAsync() { httpCalls++; throw new Error('Synthetic fixture prohibits networking'); },
} as unknown as Stripe.HttpClient });
const signingKey = 'whsec_synthetic_adapter_selection_only';
const payload = JSON.stringify({ id: 'evt_synthetic_adapter_selection_only', type: 'invoice.created', data: { object: {} } });
const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: signingKey });
type Adapter = { status: { name: string; state: string }; verifyWebhook: (raw: string, signature: string) => Promise<any> };
function adapter(environment: Record<string, string | undefined>): Adapter {
  const process = { env: { STRIPE_SECRET_KEY: 'sk_test_synthetic_adapter_selection_only', STRIPE_MODE: 'test',
    [contract.billingWebhookSigning.envKey]: signingKey, ...environment } };
  const safetyFunctions = load(safety, { process });
  const bindingFunctions = load(binding, { process, contract });
  const verify = load(verification, { getStripe: () => sdk,
    billingWebhookSigningSecret: bindingFunctions.billingWebhookSigningSecret }).verifyWebhookSignature;
  class ProviderDisabledError extends Error {}
  const adapterFunctions = load(factory, { process, ...safetyFunctions, ...bindingFunctions, ProviderDisabledError,
    require: (name: string) => { assert.equal(name, './billing-service.js'); return { verifyWebhookSignature: verify }; } });
  return adapterFunctions.getPaymentProviderAdapter();
}
const deterministic = () => adapter({ APP_ENV: 'test', NODE_ENV: 'test', OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '0' });
const configured = () => adapter({ APP_ENV: 'development', NODE_ENV: 'development', OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '0' });

test('ordinary test/test/flag0 still selects deterministic and rejects a valid SDK HMAC', async () => {
  const selected = deterministic(); assert.equal(selected.status.name, 'deterministic-test');
  await assert.rejects(selected.verifyWebhook(payload, signature), /Invalid test signature/);
});
test('ordinary test literal belongs only to the deterministic branch', async () => {
  const result = await deterministic().verifyWebhook(payload, 'operatoros-test-signature');
  assert.equal(result.id, 'evt_synthetic_adapter_selection_only');
});
test('development fixture selects configured Stripe and actual SDK HMAC verification', async () => {
  const selected = configured(); assert.equal(selected.status.name, 'stripe'); assert.equal(selected.status.state, 'configured');
  const result = await selected.verifyWebhook(payload, signature);
  assert.equal(result.id, 'evt_synthetic_adapter_selection_only');
});
test('configured Stripe rejects the deterministic signature literal', async () => {
  await assert.rejects(configured().verifyWebhook(payload, 'operatoros-test-signature'));
});
test('configured Stripe rejects a wrong signing key', async () => {
  const wrong = sdk.webhooks.generateTestHeaderString({ payload, secret: 'whsec_synthetic_wrong_key_only' });
  await assert.rejects(configured().verifyWebhook(payload, wrong));
});
test('configured Stripe rejects changed raw bytes', async () => {
  await assert.rejects(configured().verifyWebhook(payload + ' ', signature));
});
test('configured Stripe rejects an expired signature timestamp', async () => {
  const stale = sdk.webhooks.generateTestHeaderString({ payload, secret: signingKey, timestamp: Math.floor(Date.now() / 1000) - 301 });
  await assert.rejects(configured().verifyWebhook(payload, stale));
});
test('missing dedicated binding stays disabled despite a synthetic provider key', async () => {
  const selected = adapter({ APP_ENV: 'development', NODE_ENV: 'development',
    [contract.billingWebhookSigning.envKey]: undefined });
  assert.equal(selected.status.state, 'disabled'); await assert.rejects(selected.verifyWebhook(payload, signature));
});

test('actual Stack SQL fixture selects configured HMAC after its disposable schema gate', async () => {
  const source = ts.createSourceFile('fixture', read('apps/api/test/stack-mutation-fence-db.test.ts'), ts.ScriptTarget.Latest, true);
  const setup = source.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(source) === 'before');
  assert.ok(setup && ts.isExpressionStatement(setup) && ts.isCallExpression(setup.expression));
  const callback = setup.expression.arguments.find(ts.isArrowFunction);
  assert.ok(callback && ts.isBlock(callback.body));
  const environment: Record<string, string> = {};
  let schemaValidated = false;
  let billingImportReached = false;
  for (const statement of callback.body.statements) {
    const text = statement.getText(source);
    if (text.startsWith('billing = await import(')) { billingImportReached = true; break; }
    if (text.startsWith('await ensureSchemaReady(')) schemaValidated = true;
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)
      || statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
      || !ts.isStringLiteral(statement.expression.right)) continue;
    const name = statement.expression.left.getText(source).match(/^process\.env\.(APP_ENV|NODE_ENV|OPERATOROS_DETERMINISTIC_PROVIDER_MODE)$/)?.[1];
    if (!name) continue;
    if (statement.expression.right.text === 'development') {
      assert.equal(schemaValidated, true, 'real HMAC selection must follow captured disposable-pool validation');
    }
    environment[name] = statement.expression.right.text;
  }
  assert.equal(schemaValidated, true); assert.equal(billingImportReached, true);
  const selected = adapter(environment);
  assert.equal(selected.status.name, 'stripe', 'SQL fixture must select the real SDK signature adapter');
  assert.equal(selected.status.state, 'configured');
  assert.equal((await selected.verifyWebhook(payload, signature)).id, 'evt_synthetic_adapter_selection_only');
  await assert.rejects(selected.verifyWebhook(payload, 'operatoros-test-signature'));
});

after(() => { assert.equal(httpCalls, 0); });
