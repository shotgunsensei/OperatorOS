import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('all six paid companion dashboards mount deterministic next-best-action briefs', () => {
  const mounts = [
    ['BrandForgeWorkspace.tsx', 'buildBrandForgeWorkflowFocus', 'brandforgeos'],
    ['SnapProofWorkspace.tsx', 'buildSnapProofWorkflowFocus', 'snapproofos'],
    ['StudyForgeCompleteWorkspace.tsx', 'buildStudyForgeWorkflowFocus', 'studyforge-ai'],
    ['NinjaLaunchKitCompleteWorkspace.tsx', 'buildDeployOpsWorkflowFocus', 'ninja-launch-kit'],
    ['CallCommandCommercialWorkspace.tsx', 'buildCallCommandWorkflowFocus', 'callcommand-ai'],
    ['NinjamationShell.tsx', 'buildScriptOpsWorkflowFocus', 'ninjamation'],
  ] as const;

  for (const [file, builder, moduleId] of mounts) {
    const source = read(`apps/web/src/components/module-shells/${file}`);
    assert.match(source, new RegExp(builder), file);
    assert.match(source, new RegExp(`moduleId="${moduleId}"`), file);
    assert.match(source, /CoreSuiteWorkdayBrief/, file);
  }
});

test('companion workflow logic is read-only and the shared presentation supports each product identity', () => {
  const logic = read('apps/web/src/lib/companion-workflow.ts');
  const component = read('apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.tsx');
  const css = read('apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.module.css');
  const help = read('apps/web/src/lib/help/companion-module-guides.ts');

  assert.doesNotMatch(logic, /moduleShellApi|\bfetch\s*\(|\bonClick\b|\bawait\b/);
  for (const moduleId of ['brandforgeos', 'snapproofos', 'studyforge-ai', 'ninja-launch-kit', 'callcommand-ai', 'ninjamation']) {
    assert.match(component, new RegExp(`'${moduleId}'`));
    assert.match(css, new RegExp(`data-module='${moduleId}'`));
  }
  assert.match(logic, /Purchases and going live still require an administrator's confirmation/);
  assert.match(logic, /Publishing stays manual/);
  assert.match(logic, /this app does not run them/);
  for (const outcome of [
    'Build reusable brand kits',
    'Create a branded customer report',
    'complete study sets',
    'campaign preparation, review, and export',
    'caller outcomes',
    'Reviewed defensive scripts',
  ]) {
    assert.match(help, new RegExp(outcome, 'i'));
  }
});
