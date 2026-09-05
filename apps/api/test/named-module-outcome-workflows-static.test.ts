import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrandSvgConcept } from '../../web/src/components/module-shells/BrandSvgConceptExporter.tsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('outcome handoffs preview, confirm, recover the accepted run, and return safe deep links', () => {
  const component = read('apps/web/src/components/module-shells/OutcomeWorkflowAction.tsx');
  const auth = read('apps/web/src/lib/auth.ts');

  assert.match(auth, /startDataFabricWorkflow:[\s\S]*data-fabric\/workflows/);
  assert.match(auth, /dataFabricWorkflowReadiness:[\s\S]*\/readiness/);
  assert.match(component, /sharedPlatformApi\.dataFabricWorkflowReadiness/);
  assert.match(component, /disabled=\{disabled \|\| accessCheck\.status !== 'ready'\}/);
  assert.match(component, /Open My Apps/);
  assert.match(component, /contributor or manager access/i);
  assert.match(component, /This will create:/);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /Confirm and create/);
  assert.match(component, /sessionStorage\.getItem/);
  assert.match(component, /sessionStorage\.setItem/);
  assert.match(component, /sourceVersion/);
  assert.match(auth, /expectedSourceVersion: string \| number/);
  assert.match(component, /expectedSourceVersion: sourceVersion/);
  assert.match(component, /FABRIC_SOURCE_VERSION_CHANGED/);
  assert.match(component, /Refresh it, review the latest details, and confirm again/);
  assert.match(component, /delivery_error_code/);
  assert.match(component, /deliveryErrorCode/);
  assert.match(component, /idempotencyScope/);
  assert.match(component, /sourceModuleSlug/);
  assert.match(component, /sharedPlatformApi\.dataFabricRun/);
  assert.match(component, /destination_deep_link/);
  assert.match(component, /safeDeepLink/);
  assert.doesNotMatch(component, /replayDataFabricInbox/);
  assert.doesNotMatch(component, /completed_call_to_|diagnosis_to_faultlinelab/);
});

test('CallCommand simulations cannot create production connected-workflow records', () => {
  const callCommand = read('apps/web/src/components/module-shells/CallCommandCommercialWorkspace.tsx');

  assert.match(callCommand, /handoffReady = Boolean\(callId && completed && analyzed && canWrite && !simulated\)/);
  assert.match(callCommand, /Simulation results stay in CallCommand and cannot create production follow-up records/);
  assert.match(callCommand, /operationsOnlyApproved: true/);
  assert.match(callCommand, /contains no patient or clinical data/);
});

test('BrandForge creates local visual files and saves a validated PNG logo', () => {
  const brand = read('apps/web/src/components/module-shells/BrandForgeWorkspace.tsx');
  const exporter = read('apps/web/src/components/module-shells/BrandSvgConceptExporter.tsx');

  assert.match(brand, /brandforgeos\.campaign_to_launchkit/);
  assert.match(brand, /sourceVersion=\{campaign\.version\}/);
  assert.match(brand, /One Deploy Ops campaign kit/);
  assert.match(brand, /does not publish ads, send messages, buy media, or deploy a website/);
  assert.match(exporter, /image\/svg\+xml/);
  assert.match(exporter, /canvas\.toBlob/);
  assert.match(exporter, /Save wordmark as brand logo/);
  assert.match(exporter, /Save monogram as brand logo/);
  assert.match(brand, /moduleShellApi\.brandforgeos\.saveLogo/);
  assert.match(exporter, /file handoff; BrandForgeOS does not log in to or create a design inside either service/);
  assert.match(exporter, /passed the required format and safety checks/);
  assert.doesNotMatch(exporter, /serve it after the file passes its security scan/);
});

test('SVG concepts escape saved names and use saved brand colors', () => {
  const svg = buildBrandSvgConcept({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'North <script>alert(1)</script> Star',
    description: null,
    primaryColor: '#123456',
    secondaryColor: '#654321',
    accentColor: '#abcdef',
    headingFont: 'Inter',
    bodyFont: null,
    voiceTone: null,
    guidelines: null,
    logoAttachmentId: null,
    assetSummary: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, 'wordmark');
  assert.match(svg, /#123456/);
  assert.match(svg, /#654321/);
  assert.match(svg, /#abcdef/);
  assert.match(svg, /North &lt;script&gt;alert\(1\)&lt;\/script&gt; Star/);
  assert.doesNotMatch(svg, /<script>/);
});

test('Script Ops and SnapProof expose only qualified, non-executing handoffs', () => {
  const scripts = read('apps/web/src/components/module-shells/NinjamationShell.tsx');
  const snap = read('apps/web/src/components/module-shells/SnapProofFieldWorkspace.tsx');

  assert.match(scripts, /detail\.script\.status === 'approved'[\s\S]{0,1800}ninjamation\.script_to_techdeck/);
  assert.match(scripts, /One draft TechDeck runbook/);
  assert.match(scripts, /does not execute the script, change an endpoint, or approve the runbook/);

  assert.match(snap, /sourceContext\.sourceModule === 'tradeflowkit'/);
  assert.match(snap, /exported\.reportId === item\.id && exported\.format === 'pdf'/);
  assert.match(snap, /snapproof\.approved_report_to_tradeflowkit/);
  assert.match(snap, /payload=\{\{ tradeFlowJobId \}\}/);
  assert.match(snap, /available only when the field job originated from a TradeFlowKit job/);
  assert.match(snap, /does not send it to the customer, issue an invoice, collect payment, or change job status/);
});

test('StudyForge and Deploy Ops dashboards lead with their next completed deliverable', () => {
  const study = read('apps/web/src/components/module-shells/StudyForgeCompleteWorkspace.tsx');
  const deploy = read('apps/web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx');

  assert.match(study, /data-testid="studyforge-next-completed-outcome"/);
  assert.match(study, /Continue a saved set/);
  assert.match(study, /Summary \+ key terms/);
  assert.match(study, /Multiple choice \+ written quiz/);
  assert.match(study, /hrefFor\(nextSet \? `\/sets\/\$\{nextSet\.id\}` : '\/sets'\)/);

  assert.match(deploy, /data-testid="deployops-release-handoff"/);
  assert.match(deploy, /Finish the campaign package/);
  assert.match(deploy, /Review campaign deliverables/);
  assert.match(deploy, /Export campaign package/);
  assert.match(deploy, /does not publish ads, send campaigns, purchase media, or deploy a website/);
});
