import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const brandRoutes = read('../src/routes/brandforgeos-phase31-routes.ts');
const snapRoutes = read('../src/routes/snapproofos-phase32-routes.ts');
const workflowAdapters = read('../src/lib/cross-module-workflow-adapters.ts');
const brandWorkspace = read('../../web/src/components/module-shells/BrandForgeWorkspace.tsx');
const brandComplete = read('../../web/src/components/module-shells/BrandForgeCompletePanels.tsx');
const snapField = read('../../web/src/components/module-shells/SnapProofFieldWorkspace.tsx');

test('BrandForge Application Stack access unlocks software features without claiming provider execution', () => {
  assert.match(brandRoutes, /tenantHasActiveApplicationStackCompanion\(tenant\(request\), 'brandforgeos'\)/);
  assert.match(brandRoutes, /tenantHasActiveApplicationStackCompanion\(tenantId, 'brandforgeos'\)/);
  assert.match(brandRoutes, /\[item\.requiredFeature\]: true/);
  assert.match(brandRoutes, /usable: applicationStack \|\| template\.usable === true/);
  assert.match(brandRoutes, /accessModel: applicationStack \? 'application_stack' : 'grandfathered_or_manual'/);
  assert.match(brandRoutes, /completeAccess: applicationStack/);
  assert.match(brandRoutes, /unmetered: monthlyCredits === null/);
  assert.match(brandRoutes, /if \(!isOperatorOSTestEnvironment\(\)\)[\s\S]*?PROVIDER_ADAPTER_UNAVAILABLE/);
  assert.match(brandRoutes, /No external delivery was attempted/);
  assert.ok(
    brandRoutes.indexOf("if (!isOperatorOSTestEnvironment())")
      < brandRoutes.indexOf('requireIntegrationEntitlement(request, reply, catalog.requiredFeature)'),
    'provider availability must be checked before any integration setup is represented as usable',
  );
});

test('BrandForge campaign UI captures and edits the full actionable brief with a retryable production state', () => {
  for (const label of [
    'Business objective',
    'Target audience',
    'Offer',
    'Core message / desired action',
    'Channels (comma-separated)',
    'Start date',
    'End date',
    'Budget (USD)',
    'Campaign notes',
  ]) assert.match(brandWorkspace, new RegExp(label.replace(/[()]/g, '\\$&')));
  assert.match(brandWorkspace, /moduleShellApi\.brandforgeos\.updateCampaign\(editingId/);
  assert.match(brandWorkspace, /expectedVersion: current\.version/);
  assert.match(brandWorkspace, /missingBriefParts/);
  assert.match(brandWorkspace, /Complete the \$\{missingBriefParts\.join\(', '\)\}/);
  assert.match(brandWorkspace, /\.catch\(\(error\) => \{\s*if \(!cancelled\) setProductionError\(errorText\(error\)\)/);
  assert.match(brandWorkspace, /role="alert"[\s\S]*?Retry production history/);
});

test('BrandForge handoff rejects placeholder briefs before consuming destination capacity', () => {
  assert.match(workflowAdapters, /function requiredCampaignBriefValue/);
  assert.match(workflowAdapters, /FABRIC_SOURCE_NOT_READY/);
  assert.match(workflowAdapters, /campaign\.target_audience, 'target audience'/);
  assert.match(workflowAdapters, /campaign\.offer, 'offer'/);
  assert.match(workflowAdapters, /campaign\.core_message, 'desired action \/ core message'/);
  assert.doesNotMatch(workflowAdapters, /targetCustomer: bounded\(campaign\.target_audience, 'the approved campaign audience'/);
  assert.doesNotMatch(workflowAdapters, /desiredAction: 'Review the approved campaign offer'/);
  assert.ok(
    workflowAdapters.indexOf("campaign.target_audience, 'target audience'")
      < workflowAdapters.indexOf('await consumeNinjaLaunchGeneration'),
    'incomplete briefs must fail before a Deploy Ops generation is consumed',
  );
});

test('BrandForge UI describes Application Stack and retained legacy access without retired-tier upsells', () => {
  assert.match(brandComplete, /Application Stack access includes every BrandForgeOS software template/);
  assert.match(brandComplete, /Application Stack · complete software access/);
  assert.match(brandComplete, /Application Stack currently has no numeric BrandForgeOS generation limit/);
  assert.match(brandComplete, /Eligible · setup required/);
  assert.doesNotMatch(brandComplete, /Upgrade in OperatorOS/);
  assert.doesNotMatch(brandComplete, /Your current plan has no numeric generation limit/);
});

test('SnapProof recognizes Application Stack billing while preserving guards and honest file verification', () => {
  assert.match(snapRoutes, /app\.get\(`\$\{base\}\/billing`, \{ preHandler: readGuards \}/);
  assert.match(snapRoutes, /tenantHasActiveApplicationStackCompanion\(tenant\(request\), 'snapproofos'\)/);
  assert.match(snapRoutes, /planName: 'Application Stack'/);
  assert.match(snapRoutes, /accessModel: 'grandfathered_or_manual'/);
  assert.match(snapRoutes, /manageUrl: '\/app\?page=billing'/);
  assert.match(snapField, /const verifiedExports = exports\.filter/);
  assert.match(snapField, /verifiedExports\.length \?/);
  assert.match(snapField, /Report approved · create an export to verify the downloadable file/);
  assert.match(snapField, /Report draft saved · no verified export yet/);
  assert.match(snapField, /Export history[\s\S]*?File verified/);
  assert.doesNotMatch(snapField, /<h3>\{item\.title\}<\/h3>\s*<div style=\{\{ color: colors\.green, fontSize: 12 \}\}>File verified<\/div>/);
});
