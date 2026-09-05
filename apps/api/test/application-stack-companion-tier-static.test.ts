import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const productEntitlements = read('../src/lib/product-entitlements.ts');
const studyAccess = read('../src/lib/studyforge-access.ts');
const deployAccess = read('../src/lib/ninja-launch-kit-access.ts');
const scriptAccess = read('../src/lib/ninjamation-access.ts');
const studyUi = read('../../web/src/components/module-shells/StudyForgeCompleteWorkspace.tsx');
const deployUi = read('../../web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx');
const scriptUi = read('../../web/src/components/module-shells/NinjamationShell.tsx');
const scriptPublicApi = read('../src/routes/ninjamation-phase36-routes.ts');
const deployPublic = read('../../web/src/app/public/ninja-launch-kit/[page]/page.tsx');
const scriptPublic = read('../../web/src/app/public/ninjamation/[page]/page.tsx');

test('forward companion tier is derived from the tenant-owned active Application Stack linkage', () => {
  assert.match(productEntitlements, /export async function tenantHasActiveApplicationStackCompanion/);
  assert.match(productEntitlements, /innerJoin\(\s*tenantApplicationSubscriptions/);
  assert.match(productEntitlements, /eq\(tenantApplicationSubscriptions\.tenantId, tenantEntitlements\.tenantId\)/);
  assert.match(productEntitlements, /eq\(tenantApplicationSubscriptions\.stripeSubscriptionId, tenantEntitlements\.stripeSubscriptionId\)/);
  assert.match(productEntitlements, /'trialing', 'active', 'past_due', 'canceling'/);
  assert.match(productEntitlements, /\['stripe', 'selected_free_companion'\]/);
});

test('all three complete-product resolvers promote active stack access before retained legacy tiers', () => {
  for (const [source, slug, completeTier] of [
    [studyAccess, 'studyforge-ai', "plan: 'tutor'"],
    [deployAccess, 'ninja-launch-kit', "plan: 'agency'"],
    [scriptAccess, 'ninjamation', "plan: 'enterprise'"],
  ] as const) {
    assert.match(source, new RegExp(`tenantHasActiveApplicationStackCompanion\\(tenantId, '${slug}'\\)`));
    assert.match(source, new RegExp(completeTier));
    assert.match(source, /source: 'application_stack'/);
    assert.ok(
      source.indexOf('tenantHasActiveApplicationStackCompanion') < source.indexOf('const configured ='),
      `${slug} must let the forward stack override stale legacy feature metadata`,
    );
  }
});

test('customer UI names Application Stack access and public pages no longer sell retired child tiers', () => {
  for (const source of [studyUi, deployUi, scriptUi]) {
    assert.match(source, /source === 'application_stack'/);
    assert.match(source, /Application Stack/);
  }
  for (const source of [deployPublic, scriptPublic]) {
    assert.match(source, /Complete application access/);
    assert.match(source, /additional companion for \$29 per month/i);
    assert.match(source, /Configure Application Stack/);
    assert.doesNotMatch(source, /const plans\s*=\s*\[/);
    assert.doesNotMatch(source, /Compare plans/);
  }
  assert.doesNotMatch(deployPublic, /name:\s*'(?:Free|Pro|Agency)'/);
  assert.doesNotMatch(scriptPublic, /name:\s*'(?:Starter|Pro|Enterprise)'/);
  assert.match(scriptPublicApi, /applicationStack:\s*\{/);
  assert.match(scriptPublicApi, /legacyTierSales:\s*\{ status: 'closed', existingContractsHonored: true \}/);
  assert.doesNotMatch(scriptPublicApi, /plans:\s*\[/);
});
