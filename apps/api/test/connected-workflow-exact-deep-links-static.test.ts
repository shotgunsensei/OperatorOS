import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCoreModuleDeepLink } from '../../web/src/app/modules/[slug]/[...path]/route-map.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('TradeFlowKit preserves a safe attachment query and opens the exact job and file', () => {
  const shell = read('apps/web/src/components/module-shells/TradeFlowKitShell.tsx');
  const operations = read('apps/web/src/components/module-shells/TradeFlowKitOperations.tsx');

  assert.match(shell, /useSearchParams/);
  assert.match(shell, /routePath\.includes\('\?'\) \|\| !currentQuery/);
  assert.match(shell, /UUID_PATTERN\.test\(requestedAttachmentId\)/);
  assert.match(shell, /raw\.startsWith\('\/\/'\)/);
  assert.match(shell, /\\u0000-\\u001f\\u007f/);
  assert.match(shell, /highlightedAttachmentId=\{attachmentId\}/);
  assert.match(operations, /moduleShellApi\.tradeflowkit\.job\(recordId\)/);
  assert.match(operations, /jobs\/\$\{encodeURIComponent\(jobId\)\}\/attachments/);
  assert.match(operations, /attachments\/\$\{encodeURIComponent\(item\.id\)\}\/content/);
  assert.match(operations, /const downloadable = item\.scanStatus === 'clean'/);
  assert.match(operations, /id=\{`tradeflowkit-attachment-\$\{item\.id\}`\}/);
  assert.match(operations, /data-highlighted=\{highlighted \? 'true' : undefined\}/);
});

test('SnapProof report links resolve the report owner and highlight the exact report', () => {
  const workspace = read('apps/web/src/components/module-shells/SnapProofWorkspace.tsx');
  const field = read('apps/web/src/components/module-shells/SnapProofFieldWorkspace.tsx');
  const shell = read('apps/web/src/components/module-shells/SnapProofShell.tsx');

  assert.match(workspace, /getReportById\(selectedReportId, tenantKey\)/);
  assert.match(workspace, /chooseCase\(requestedReport\.caseId\)/);
  assert.match(workspace, /requestedReport && !rows\.items\.some\(item => item\.id === requestedReport\.id\)/);
  assert.match(workspace, /selectedReportId=\{selectedReportId\}/);
  assert.match(field, /snapproof-field-report-\$\{item\.id\}/);
  assert.match(field, /const highlighted = item\.id === selectedReportId/);
  assert.match(shell, /tenantKey=\{tenantId\}/);
});

test('Deploy Ops and BrandForge reject malformed record links and fetch the exact saved record', () => {
  const deploy = read('apps/web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx');
  const brandShell = read('apps/web/src/components/module-shells/BrandForgeRouteShell.tsx');
  const brand = read('apps/web/src/components/module-shells/BrandForgeWorkspace.tsx');

  for (const source of [deploy, brandShell, brand]) {
    assert.match(source, /raw\.startsWith\('\/\/'\)/);
    assert.match(source, /\\u0000-\\u001f\\u007f/);
  }
  assert.match(deploy, /UUID_PATTERN\.test\(candidate\)/);
  assert.match(deploy, /moduleShellApi\.launchkit\.productKit\(id\)/);
  assert.match(deploy, /requestedKit\.requested && requestedKit\.id \? 'deliverables' : view/);
  assert.match(deploy, /data-selected-kit-id=\{selected\.id\}/);
  assert.match(brandShell, /routePath=\{currentRoute\}/);
  assert.match(brand, /getCampaignById\(requestedCampaign\.id, tenantKey\)/);
  assert.match(brand, /setSelectedId\(requestedCampaignId\)/);
  assert.match(brand, /data-selected-campaign-id=\{selectedId\}/);
});

test('review and Faultline authoring deep links reveal the intended workspace', () => {
  const deploy = read('apps/web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx');
  const faultlineRoute = read('apps/web/src/components/module-shells/FaultlineLabRoute.contract.ts');
  const faultline = read('apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx');

  assert.match(deploy, /\[data-launchkit-view="review"\] #launchkit-execution/);
  assert.equal(
    resolveCoreModuleDeepLink('faultlinelab', ['authoring', '00000000-0000-4000-8000-000000000001'])?.sectionId,
    'faultlinelab-authoring',
  );
  assert.match(faultlineRoute, /root === 'authoring'[\s\S]*challengeId: recordId/);
  assert.match(faultline, /getAuthoringChallenge\(id\)/);
  assert.match(faultline, /next\.challenge\.status !== 'published'/);
  assert.match(faultline, /router\.replace\(hrefFor\(`\/authoring\/\$\{id\}`\)\)/);
  assert.match(faultline, /challengeId && view === 'authoring'/);
  assert.match(faultline, /data-selected-draft=/);
});

test('BrandForge distinguishes edit and administrative authority', () => {
  const shell = read('apps/web/src/components/module-shells/BrandForgeRouteShell.tsx');
  const workspace = read('apps/web/src/components/module-shells/BrandForgeWorkspace.tsx');

  assert.match(shell, /canAdminModule = canWriteModule && \(platformAdmin \|\| activeRole === 'owner' \|\| activeRole === 'admin'\)/);
  assert.match(shell, /canWrite=\{canWriteModule\} canAdmin=\{canAdminModule\}/);
  assert.match(workspace, /data-testid="brandforgeos-read-only"/);
  assert.match(workspace, /if \(!canWrite\)/);
  assert.match(workspace, /BrandForgeCompletePanel[\s\S]{0,500}canWrite=\{canWrite\} canAdmin=\{canAdmin\}/);
  assert.match(workspace, /fieldset disabled=\{!canWrite\}/);
});

test('connected lead and TechDeck links fetch exact tenant-scoped records beyond capped workspaces', () => {
  const tradeShell = read('apps/web/src/components/module-shells/TradeFlowKitShell.tsx');
  const leads = read('apps/web/src/components/module-shells/TradeFlowKitLeadCenter.tsx');
  const techShell = read('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const tickets = read('apps/web/src/components/module-shells/TechDeckTicketQueue.tsx');
  const operations = read('apps/web/src/components/module-shells/TechDeckOperations.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  const routes = read('apps/api/src/routes/techdeck-routes.ts');

  assert.match(tradeShell, /TradeFlowKitLeadCenter[^>]*recordId=\{recordId\}/);
  assert.match(leads, /moduleShellApi\.tradeflowkit\.get\(deepLeadId\)/);
  assert.match(leads, /\[requested\.lead, \.\.\.listed\]/);
  assert.match(techShell, /TechDeckTicketQueue[^>]*recordId=\{route\.recordId\}/);
  assert.match(techShell, /TechDeckOperations[\s\S]{0,400}recordId=\{route\.recordId\}/);
  assert.match(tickets, /moduleShellApi\.techdeck\.get\(requestedTicketId\)/);
  assert.match(tickets, /\[requested\.ticket, \.\.\.listed\]/);
  for (const exactMethod of ['getConfigurationItem', 'getDocument', 'getEvidence', 'getReport']) {
    assert.match(operations, new RegExp(`techdeck\\.${exactMethod}\\(record\\.id\\)`));
    assert.match(client, new RegExp(`${exactMethod}: \\(id: string\\)`));
  }
  assert.match(routes, /app\.get\('\/v1\/modules\/techdeck\/evidence\/:id'[\s\S]{0,500}eq\(techdeckEvidence\.tenantId, tenantId\)/);
  assert.match(routes, /app\.get\('\/v1\/modules\/techdeck\/reports\/:id'[\s\S]{0,500}eq\(techdeckReports\.tenantId, tenantId\)/);
});
