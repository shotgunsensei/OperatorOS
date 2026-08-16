import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

test('all OperatorOS module launch surfaces use the shared same-tab anchor contract', () => {
  const component = read('apps/web/src/components/ModuleLaunchLink.tsx');
  const moduleLaunch = read('apps/web/src/lib/module-launch.ts');
  const launchRuntime = read('apps/web/src/lib/launch.ts');
  const surfaces = [
    'apps/web/src/components/pages/MyAppsPage.tsx',
    'apps/web/src/components/pages/AppsPage.tsx',
    'apps/web/src/app/ecosystem/page.tsx',
    'apps/web/src/app/apps/[slug]/page.tsx',
    'apps/web/src/components/module-shells/ShellChrome.tsx',
  ].map(read);

  assert.match(component, /<a[\s\S]*href=\{destination\}/);
  assert.match(component, /target=\{openInNewTab \? '_blank' : undefined\}/);
  assert.match(component, /rel=\{openInNewTab \? 'noopener noreferrer' : undefined\}/);
  assert.match(component, /event\.button === 0/);
  assert.match(component, /!event\.metaKey && !event\.ctrlKey && !event\.shiftKey && !event\.altKey/);
  assert.match(component, /ordinaryPrimaryActivation && isNativeLaunchRuntime/);
  assert.match(moduleLaunch, /navigateToModuleProgrammatically\(module\.launchUrl\)/);
  assert.match(launchRuntime, /window\.location\.assign\(url\)/);
  assert.match(launchRuntime, /Browser\.open/);
  assert.match(launchRuntime, /openExternalDocument/);
  assert.doesNotMatch(moduleLaunch, /window\.open|openExternalDocument/);

  for (const surface of surfaces) {
    assert.match(surface, /ModuleLaunchLink/);
    assert.doesNotMatch(surface, /window\.open|openExternal/);
    assert.doesNotMatch(surface, /target="_blank"/);
  }

  const myApps = surfaces[0]!;
  const marketplace = surfaces[1]!;
  assert.match(myApps, /button-launch-new-tab-/);
  assert.match(marketplace, /button-launch-new-tab-/);
  assert.match(myApps, /pushRecent\(card\.registry\.slug\)/);
});

test('external documents remain separate from module navigation', () => {
  const billing = read('apps/web/src/components/pages/TenantBillingPage.tsx');
  const preview = read('apps/web/src/components/PreviewPanel.tsx');
  assert.match(billing, /openExternalDocument/);
  assert.match(preview, /Open in new tab/);
  assert.match(preview, /target="_blank"/);
});

test('the long exact-host gate writes child logs without a back-pressured parent pipe', () => {
  const processRuntime = read('scripts/parity/lib/process.mjs');
  const exactHostGate = read('scripts/hotfix/verify-torqueshed-payment-exact-host.mjs');
  assert.match(processRuntime, /directToLog/);
  assert.match(processRuntime, /openSync\(logPath, 'w'\)/);
  assert.match(exactHostGate, /directToLog: true/);
});
