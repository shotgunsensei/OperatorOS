import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPANION_MODULE_PRICE_CENTS,
  DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
  ELIGIBLE_COMPANION_MODULE_KEYS,
  getAdditionalSeatPriceCents,
  INCLUDED_SEATS,
  swapIncludedCompanion,
} from '@operatoros/sdk';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('forward application-stack prices and eligibility are one shared monthly contract', () => {
  assert.equal(INCLUDED_SEATS, 5);
  assert.equal(COMPANION_MODULE_PRICE_CENTS, 2900);
  assert.equal(DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS, 1500);
  assert.equal(getAdditionalSeatPriceCents('0'), 1500, 'legacy env values cannot override the published seat price');
  assert.equal(getAdditionalSeatPriceCents('9999'), 1500, 'legacy env values cannot override the published seat price');
  assert.deepEqual([...ELIGIBLE_COMPANION_MODULE_KEYS].sort(), [
    'brandforgeos', 'callcommand-ai', 'ninja-launch-kit',
    'ninjamation', 'snapproofos', 'studyforge-ai',
  ]);
  for (const excluded of ['tradeflowkit', 'pulsedesk', 'techdeck', 'torqueshed', 'faultlinelab', 'ninja-pool-hall', 'outcall']) {
    assert.equal(ELIGIBLE_COMPANION_MODULE_KEYS.includes(excluded as never), false);
  }
});

test('included companion swap preserves a paid slot without duplicate billing', () => {
  assert.deepEqual(
    swapIncludedCompanion('snapproofos', ['brandforgeos', 'ninjamation'], 'brandforgeos'),
    ['snapproofos', 'ninjamation'],
  );
  assert.deepEqual(
    swapIncludedCompanion('snapproofos', ['ninjamation'], 'studyforge-ai'),
    ['ninjamation'],
  );
});

test('v60 grandfathering is column-absence guarded and reapply-safe', () => {
  const source = read('apps/api/src/lib/application-stack-billing-db-init.ts');
  assert.match(source, /IF NOT EXISTS[\s\S]*column_name='legacy_access_grandfathered_at'[\s\S]*ALTER TABLE subscriptions/);
  assert.match(source, /UPDATE subscriptions[\s\S]*WHERE status IN \('active','trialing'\)/);
  assert.doesNotMatch(source, /ADD COLUMN IF NOT EXISTS legacy_access_grandfathered_at/);
  assert.match(source, /db\.transaction\(async tx/);
  assert.match(source, /UNIQUE \(tenant_id\)/);
  assert.match(source, /uq_tenant_application_subscriptions_customer/);
});

test('legacy sales close explicitly while terminal legacy contracts cannot reactivate', () => {
  const billing = read('apps/api/src/lib/billing-service.ts');
  assert.match(billing, /LEGACY_PLAN_SALES_CLOSED/);
  assert.match(billing, /LEGACY_ADDON_SALES_CLOSED/);
  assert.match(billing, /APPLICATION_STACK_MONTHLY_ONLY/);
  assert.match(billing, /STACK_FLAGSHIP_LIMIT/);
  assert.match(billing, /!\['active', 'trialing'\]\.includes\(sub\.status\) \|\| !sub\.cancelAtPeriodEnd/);
  assert.match(billing, /LEGACY_PROVIDER_MANAGEMENT_REQUIRED/);
  assert.match(billing, /LEGACY_REACTIVATION_NOT_CONFIRMED/);
  assert.match(billing, /providerSubscription\.cancel_at_period_end === false/);
});

test('stack billing is crash-recoverable, provider-backed, and strictly webhook-bound', () => {
  const billing = read('apps/api/src/lib/billing-service.ts');
  const routes = read('apps/api/src/routes/billing-routes.ts');
  assert.match(billing, /checkout_attempt_id:\s*crypto\.randomUUID\(\)/);
  assert.match(billing, /operatoros-stack-checkout-\$\{checkoutAttemptId\}/);
  assert.match(billing, /retryPendingWithoutSession/);
  assert.match(billing, /eq\(tenantApplicationSubscriptions\.status, existingStatusForClaim!\)/);
  assert.match(billing, /STRIPE_CHECKOUT_INVALID_RESPONSE/);
  assert.match(billing, /STRIPE_CHECKOUT_UNAVAILABLE/);
  assert.match(billing, /STACK_PROVIDER_MANAGEMENT_REQUIRED/);
  assert.match(billing, /validateStackSubscriptionBinding/);
  assert.match(billing, /isStaleStackCheckoutGeneration/);
  assert.match(billing, /core_product_stack_stale_checkout_generation_ignored/);
  assert.match(billing, /core_product_stack_stale_update_binding_ignored/);
  assert.match(billing, /core_product_stack_terminal_update_ignored/);
  assert.match(billing, /\['checkout_failed', 'canceled', 'expired'\]\.includes\(stackSub\.status\)/);
  assert.match(billing, /core_product_stack_payment_pending/);
  assert.match(billing, /STACK_PROVIDER_SUBSCRIPTION_EXISTS/);
  assert.match(billing, /schedulePropagation\(exactTenantId/);
  assert.match(billing, /checkout_attempt_id: stackCheckoutAttemptId\(stack\)/);
  assert.match(billing, /md\.billing_model !== 'core_product_stack'/);
  assert.match(billing, /subscription\.id !== stackSub\.stripeSubscriptionId/);
  assert.match(billing, /md\.selected_core_product !== stackSub\.coreProduct/);
  assert.match(billing, /additionalSeats !== stackSub\.additionalSeats/);
  assert.match(billing, /subscriptions\.retrieve\(subscriptionId/);
  assert.match(billing, /prices\.retrieve\(expectation\.priceId\)/);
  assert.match(billing, /price\.type !== 'recurring'/);
  assert.match(billing, /price\.recurring\?\.interval !== 'month'/);
  assert.match(billing, /price\.unit_amount !== expectedUnitAmountCents/);
  assert.match(billing, /SUBSCRIPTION_ITEM_COUNT_MISMATCH/);
  assert.match(billing, /SUBSCRIPTION_ITEM_PRICE_OR_QUANTITY_MISMATCH/);
  assert.match(routes, /WEBHOOK_PROCESSING_RETRY_REQUIRED/);
  assert.match(routes, /duplicateState === 'in_flight'[\s\S]*WEBHOOK_PROCESSING_IN_PROGRESS/);
  assert.match(routes, /reply\.code\(503\)/);
  assert.match(billing, /processingLeaseExpiresAt/);
  assert.match(billing, /payload_hash=\$\{payloadHash\}/);
  assert.match(billing, /const replayClassification = classifyWebhookEvent\(rawEvent\)/);
  assert.match(billing, /processCallCommandNumberWebhookEvent\(rawEvent\)/);
});

test('portal and release readiness fail closed on provider drift and partial v60 state', () => {
  const billing = read('apps/api/src/lib/billing-service.ts');
  const releaseInit = read('apps/api/src/lib/application-stack-billing-db-init.ts');
  const releaseVerifier = read('apps/api/src/lib/database-release.ts');
  const envExample = read('.env.example');
  const stripeSetup = read('docs/stripe-setup.md');

  for (const source of [billing, envExample, stripeSetup]) {
    assert.match(source, /STRIPE_BILLING_PORTAL_CONFIGURATION_ID/);
  }
  assert.match(billing, /billingPortal\.configurations\.retrieve/);
  assert.match(billing, /subscription_update\?\.enabled !== false/);
  assert.match(billing, /STRIPE_PORTAL_CONFIGURATION_UNSAFE/);
  assert.match(billing, /STRIPE_CUSTOMER_TENANT_AMBIGUOUS/);
  assert.match(billing, /providerValidated/);

  assert.match(releaseInit, /ALTER TABLE tenant_application_subscriptions[\s\S]*ADD COLUMN IF NOT EXISTS/);
  assert.match(releaseInit, /tenant_application_subscriptions_checkout_session/);
  assert.match(releaseVerifier, /uq_tenant_application_subscriptions_checkout_session/);
  assert.match(releaseVerifier, /tenant_application_subscriptions_status_check/);
});

test('all legacy plan-to-application authority requires the grandfather marker', () => {
  for (const path of [
    'apps/api/src/lib/tenant-entitlements.ts',
    'apps/api/src/lib/entitlement-service.ts',
    'apps/api/src/lib/entitlement-resolver.ts',
    'apps/api/src/lib/entitlement-propagation.ts',
    'apps/api/src/routes/module-routes.ts',
    'apps/api/src/routes/platform-routes.ts',
  ]) {
    assert.match(read(path), /legacy_access_grandfathered_at|subscriptionHasLegacyApplicationAccess/, path);
  }
  assert.match(
    read('apps/api/src/routes/platform-routes.ts'),
    /UPDATE subscriptions[\s\S]*SET legacy_access_grandfathered_at=NULL/,
    'post-cutover admin plan changes must clear application-access grandfathering',
  );
  assert.match(
    read('apps/api/src/lib/product-entitlements.ts'),
    /candidate\.code === '42P01'[\s\S]*return false;[\s\S]*throw error;/,
    'only a genuinely absent pre-v60 stack table may fail closed as no active companion',
  );
  for (const path of [
    'apps/api/src/lib/application-stack-billing-db-init.ts',
    'apps/api/src/lib/tenant-entitlements.ts',
  ]) {
    assert.match(
      read(path),
      /candidate\?\.code === '42703'[\s\S]*return false;[\s\S]*throw error;/,
      `${path} must fail closed only for the absent pre-v60 grandfather column`,
    );
  }
});

test('browser parity fixtures model an explicitly grandfathered tenant contract', () => {
  for (const path of [
    'apps/web/e2e/parity-auth.ts',
    'apps/web/e2e/sso-v1.spec.ts',
    'apps/web/e2e/brandforgeos-phase31.spec.ts',
    'apps/web/e2e/torqueshed-phase28.spec.ts',
  ]) {
    const source = read(path);
    assert.match(source, /tenant_id[\s\S]*scope_type[\s\S]*legacy_access_grandfathered_at/, path);
    assert.match(source, /'tenant'[\s\S]*clock_timestamp\(\)/, path);
  }

  assert.doesNotMatch(
    read('apps/web/e2e/ninja-pool-hall-phase30.spec.ts'),
    /insert into subscriptions/iu,
    'the free Pool Hall exact-host fixture must not manufacture paid legacy access',
  );

  assert.match(
    read('apps/web/e2e/parity-auth.ts'),
    /from modules where status = 'live'/,
    'the visual fixture must grant the canonical live module catalog rather than the retired active status',
  );
  assert.match(
    read('apps/web/e2e/sso-v1.spec.ts'),
    /where slug = \$1 and status = 'live'/,
    'the exact-host fixture must reject a deployment registration that is not live',
  );
  for (const path of [
    'apps/web/e2e/brandforgeos-phase31.spec.ts',
    'apps/web/e2e/torqueshed-phase28.spec.ts',
    'apps/web/e2e/ninja-pool-hall-phase30.spec.ts',
  ]) {
    assert.match(
      read(path),
      /where slug\s*=\s*['"][^'"]+['"]\s+and status\s*=\s*['"]live['"]/iu,
      `${path} must select only a live module registration`,
    );
  }
  for (const path of [
    'scripts/parity/run-browser-tests.mjs',
    'apps/web/e2e/parity-auth.ts',
    'apps/web/e2e/sso-v1.spec.ts',
  ]) {
    assert.match(read(path), /assertLocalBrowserTestEnvironment/, `${path} must reject unsafe browser and database targets`);
  }
  const visualFixture = read('apps/web/e2e/parity-auth.ts');
  assert.ok(
    visualFixture.indexOf('assertLocalBrowserTestEnvironment(process.env)')
      < visualFixture.indexOf('request.post'),
    'the visual fixture safety guard must run before its first request',
  );
  const ssoFixture = read('apps/web/e2e/sso-v1.spec.ts');
  const ssoGuard = ssoFixture.indexOf(
    'const { database: { url: databaseUrl } } = assertLocalBrowserTestEnvironment(',
  );
  assert.ok(ssoGuard >= 0, 'the exact-host fixture must invoke its local safety guard');
  assert.ok(
    ssoGuard < ssoFixture.indexOf('new Client({ connectionString: databaseUrl })'),
    'the exact-host fixture safety guard must run before its database connection',
  );
  assert.ok(
    ssoGuard < ssoFixture.indexOf('await registerAndSeed(request, pg)'),
    'the exact-host fixture safety guard must run before its first identity mutation',
  );
  for (const path of [
    'apps/web/playwright.config.ts',
    'apps/web/playwright.visual.config.ts',
  ]) {
    assert.match(read(path), /assertLocalBrowserTestEnvironment/, `${path} must fail before starting an unsafe browser suite`);
  }

  assert.match(
    read('apps/web/playwright.deployed.config.ts'),
    /assertDeployedBrowserTestEnvironment/,
    'deployed acceptance must use its dedicated canonical-production guard',
  );
  assert.match(
    read('apps/web/playwright.deployed.config.ts'),
    /fail-on-skipped-reporter\.ts/,
    'the deployed acceptance gate must fail closed when any required scenario is skipped',
  );
  assert.match(
    read('apps/web/playwright.config.ts'),
    /testIgnore:\s*\/phase17-deployed-acceptance\\\.spec\\\.ts\//,
    'the local default config must never collect the deployed acceptance spec',
  );
  const localConfig = read('apps/web/playwright.config.ts');
  assert.match(localConfig, /process\.env\.E2E_ROOT_URL \?\?= browserSafety\.rootUrl/);
  assert.match(localConfig, /process\.env\.E2E_APP_URL \?\?=/);
  assert.match(localConfig, /process\.env\.INTERNAL_API_URL \?\?= browserSafety\.apiUrl/);
  assert.match(
    localConfig,
    /launchOptions:[\s\S]*host-resolver-rules=MAP operatoros\.net 127\.0\.0\.1/,
    'the local config must map even hard-coded canonical product hosts to loopback',
  );
  assert.match(
    read('apps/web/package.json'),
    /test:e2e:phase17-deployed[^\n]+playwright\.deployed\.config\.ts/,
    'the deployed package command must not inherit the local mutating-suite config',
  );
  const runner = read('scripts/parity/run-browser-tests.mjs');
  for (const binding of [
    "E2E_PROXY_HOST: '127.0.0.1'",
    "E2E_PROXY_TARGET: 'http://127.0.0.1:5000'",
    "E2E_BRANDFORGEOS_URL: 'https://brandforgeos.operatoros.net'",
    "E2E_TORQUESHED_URL: 'https://torqueshed.operatoros.net'",
  ]) {
    assert.match(runner, new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
  }
  assert.match(runner, /assertLocalBrowserTestEnvironment\(browserEnv/);
  assert.match(runner, /const runtimeEnv = \{\s*\.\.\.browserEnv,/u);
  assert.match(
    read('apps/web/e2e/production-host-proxy.mjs'),
    /assertLocalProxyEnvironment\(process\.env\)/,
    'the proxy process itself must reject a remote upstream or public listener',
  );
});
