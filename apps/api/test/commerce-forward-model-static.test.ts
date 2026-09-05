import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPANION_MODULE_PRICE_CENTS,
  COMPANION_MODULES,
  CORE_PRODUCTS,
  DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
  ELIGIBLE_COMPANION_MODULE_KEYS,
  FREE_WITH_ANY_ACCOUNT,
} from '@operatoros/sdk';
import {
  DATABASE_RELEASE_CONTRACT,
  DATABASE_RELEASE_STEPS,
} from '../src/lib/database-release-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const billingRoutes = read('apps/api/src/routes/billing-routes.ts');
const billingService = read('apps/api/src/lib/billing-service.ts');
const productEntitlements = read('apps/api/src/lib/product-entitlements.ts');
const entitlementService = read('apps/api/src/lib/entitlement-service.ts');
const platformRoutes = read('apps/api/src/routes/platform-routes.ts');
const schema = read('apps/api/src/schema.ts');
const forwardCommerceDbInit = read('apps/api/src/lib/application-stack-billing-db-init.ts');
const pricingSection = read('apps/web/src/components/marketing/sections/PricingSection.tsx');
const billingPage = read('apps/web/src/components/pages/BillingPage.tsx');
const upgradeModal = read('apps/web/src/components/UpgradeModal.tsx');
const appsPage = read('apps/web/src/components/pages/AppsPage.tsx');
const platformPage = read('apps/web/src/components/pages/PlatformPage.tsx');

const approvedCompanions = [
  'snapproofos',
  'brandforgeos',
  'studyforge-ai',
  'ninja-launch-kit',
  'callcommand-ai',
  'ninjamation',
] as const;

test('the application stack is the exact approved public price contract', () => {
  assert.deepEqual(
    CORE_PRODUCTS.map(product => ({
      key: product.key,
      monthlyPriceCents: product.monthlyPriceCents,
      includedSeats: product.includedSeats,
    })),
    [
      { key: 'tradeflowkit', monthlyPriceCents: 14900, includedSeats: 5 },
      { key: 'pulsedesk', monthlyPriceCents: 14900, includedSeats: 5 },
      { key: 'techdeck', monthlyPriceCents: 9900, includedSeats: 5 },
    ],
  );
  assert.equal(COMPANION_MODULE_PRICE_CENTS, 2900);
  assert.equal(DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS, 1500);
});

test('only the six approved business add-ons can be sold through the stack', () => {
  assert.deepEqual(COMPANION_MODULES.map(module => module.key), approvedCompanions);
  assert.deepEqual(ELIGIBLE_COMPANION_MODULE_KEYS, approvedCompanions);
  assert.equal(new Set(COMPANION_MODULES.map(module => module.key)).size, 6);

  const excluded = new Set([
    ...CORE_PRODUCTS.map(product => product.key),
    ...FREE_WITH_ANY_ACCOUNT.map(module => module.key),
    'outcall',
  ]);
  for (const module of COMPANION_MODULES) {
    assert.equal(excluded.has(module.key), false, `${module.key} must not overlap a core, free, or coming-soon product`);
  }
  assert.deepEqual(FREE_WITH_ANY_ACCOUNT.map(module => module.key), [
    'torqueshed',
    'faultlinelab',
    'ninja-pool-hall',
  ]);
});

test('release v60 appends one immutable forward-commerce step to the ordered manifest', () => {
  assert.equal(DATABASE_RELEASE_CONTRACT.releaseVersion, 60);
  assert.equal(DATABASE_RELEASE_STEPS.length, 60);
  assert.equal(DATABASE_RELEASE_STEPS.at(-1)?.id, 'forward_commerce_contract');
  assert.equal(new Set(DATABASE_RELEASE_STEPS.map(step => step.id)).size, 60);
  assert.equal(Object.isFrozen(DATABASE_RELEASE_CONTRACT), true);
  assert.equal(Object.isFrozen(DATABASE_RELEASE_STEPS), true);
});

test('forward-sale product bindings and public checkout are monthly-only', () => {
  for (const product of CORE_PRODUCTS) {
    assert.match(product.stripePriceEnvKey, /_MONTHLY$/);
    assert.doesNotMatch(product.stripePriceEnvKey, /ANNUAL|YEAR/i);
  }
  assert.match(pricingSection, /billingApi\.createStackCheckout/);
  assert.match(pricingSection, /Final price confirmed in .*Stripe Checkout/);
  assert.doesNotMatch(pricingSection, /billingApi\.subscribe\s*\(/);
  assert.doesNotMatch(pricingSection, /annual|yearly|per year|\/yr/i);
  assert.match(billingService, /APPLICATION_STACK_MONTHLY_ONLY/);
});

test('signed-in customer surfaces cannot initiate legacy plan or per-module sales', () => {
  assert.doesNotMatch(billingPage, /billingApi\.subscribe\s*\(/);
  assert.doesNotMatch(upgradeModal, /billingApi\.subscribe\s*\(/);
  assert.doesNotMatch(appsPage, /modulesApi\.subscribeAddon\s*\(/);

  for (const source of [billingPage, upgradeModal, appsPage]) {
    assert.match(source, /pricing#build-stack/);
  }
});

test('legacy purchase endpoints fail closed while legacy access and cancellation remain', () => {
  assert.match(billingRoutes, /\/v1\/billing\/subscribe/);
  assert.match(billingRoutes, /\/v1\/billing\/create-checkout-session/);
  assert.match(billingRoutes, /legacyPlanSalesClosed\(\)/g);
  assert.match(billingService, /LEGACY_PLAN_SALES_CLOSED/);
  assert.match(billingRoutes, /\/v1\/billing\/addons\/subscribe/);
  assert.match(billingRoutes, /legacyAddonSalesClosed\(\)/);
  assert.match(billingService, /LEGACY_ADDON_SALES_CLOSED/);

  assert.match(billingRoutes, /\/v1\/billing\/cancel/);
  assert.match(billingRoutes, /\/v1\/billing\/addons\/cancel/);
  assert.match(entitlementService, /planModules/);
  assert.match(entitlementService, /addonSubscriptions/);
  assert.match(entitlementService, /source:\s*'plan'|return\s+'plan'/);
  assert.match(entitlementService, /source:\s*'addon'|return\s+'addon'/);
});

test('one flagship, owner-only mutation, and tenant-owned Stripe customer are enforced', () => {
  assert.match(billingService, /STACK_FLAGSHIP_LIMIT/);
  assert.match(billingRoutes, /TENANT_OWNER_REQUIRED/);
  assert.doesNotMatch(
    billingRoutes,
    /ctx\.role\s*!==\s*'owner'\s*&&\s*ctx\.role\s*!==\s*'admin'/,
  );

  assert.match(schema, /tenantApplicationSubscriptions/);
  assert.match(forwardCommerceDbInit, /tenant_application_subscriptions/);
  assert.match(forwardCommerceDbInit, /legacy_access_grandfathered_at/);
  assert.match(billingService, /tenantApplicationSubscriptions/);
  assert.match(billingService, /stripeCustomerId/);
  assert.match(billingService, /createPortalSession\([^)]*tenant/i);
  assert.match(productEntitlements, /STACK_FLAGSHIP_LIMIT/);
});

test('pricing administration and readiness use the six-item sellable allowlist', () => {
  assert.match(platformRoutes, /COMPANION_MODULE/);
  assert.match(platformRoutes, /COMPANION_MODULE_KEYS|approvedCompanion|sellableCompanion/i);
  assert.match(platformRoutes, /APPLICATION_STACK_SHARED_PRICE_REQUIRED/);
  assert.doesNotMatch(platformPage, /sync-from-stripe|create-stripe-price/);
  assert.doesNotMatch(platformPage, /button-save-addon-price|button-save-stripe-price-id/);
  for (const slug of approvedCompanions) {
    assert.ok(COMPANION_MODULES.some(module => module.key === slug), `${slug} must be sellable`);
  }
  for (const excluded of ['tradeflowkit', 'pulsedesk', 'techdeck', 'torqueshed', 'faultlinelab', 'ninja-pool-hall', 'outcall']) {
    assert.equal(COMPANION_MODULES.some(module => module.key === excluded), false, `${excluded} must be excluded from add-on pricing`);
  }
});
