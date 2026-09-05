import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

test('FaultlineLab presents challenge creation as a guided learning-design workflow', () => {
  const workspace = read('apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx');
  const guided = read('apps/web/src/components/module-shells/FaultlineGuidedAuthoring.tsx');

  assert.match(workspace, /FaultlineGuidedAuthoring/);
  assert.match(workspace, /Run quality check/);
  assert.match(workspace, /Test as a learner/);
  assert.match(workspace, /Who can use this draft/);

  for (const step of [
    'scenario',
    'symptoms',
    'answer-key',
    'evidence',
    'tests',
    'hints',
    'remediation',
  ]) {
    assert.ok(guided.includes(`data-author-step="${step}"`), `missing guided authoring step ${step}`);
  }

  assert.match(guided, /Create the evidence trail/);
  assert.match(guided, /Evidence revealed by this result/);
  assert.match(guided, /Add log and ticket sources/);
  assert.match(guided, /Build a fair hint ladder/);
  assert.match(guided, /Learning goals and preventive controls/);
  assert.match(guided, /data-testid="faultlinelab-author-preview"/);
});

test('FaultlineLab authoring keeps advanced JSON optional and preserves safe product boundaries', () => {
  const guided = read('apps/web/src/components/module-shells/FaultlineGuidedAuthoring.tsx');

  assert.match(guided, /<details className="fl-author-block fl-advanced"/);
  assert.doesNotMatch(guided, /<details[^>]+open[^>]*className="fl-author-block fl-advanced"/);
  assert.match(guided, /FaultlineLab does not run commands on live systems/);
  assert.match(guided, /Importing a file does not publish it/);
  assert.match(guided, /The server performs the final validation/);
  assert.match(guided, /Every required clue can be discovered/);
  assert.match(guided, /Four progressively costlier hints/);
});

test('guided authoring updates the existing versioned content contract instead of bypassing it', () => {
  const workspace = read('apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx');
  const guided = read('apps/web/src/components/module-shells/FaultlineGuidedAuthoring.tsx');

  assert.match(workspace, /JSON\.parse\(authorContent\)/);
  assert.match(workspace, /faultlinelab\.validateChallenge\(content\)/);
  assert.match(workspace, /expectedVersion:\s*draft\.challenge\.version/);
  assert.match(workspace, /faultlinelab\.publishChallenge/);
  assert.match(guided, /onChange\(JSON\.stringify\(next, null, 2\)\)/);
  assert.match(guided, /next\[collection\]\[index\]\.revealsEvidence/);
  assert.match(guided, /next\.rootCauseOptions\.find/);
});
