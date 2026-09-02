import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('all three core modules mount a ranked workday brief over real module APIs', () => {
  const trade = read('apps/web/src/components/module-shells/TradeFlowKitOperations.tsx');
  const tech = read('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const pulse = read('apps/web/src/components/module-shells/PulseDeskServiceDeskWorkspace.tsx');
  const brief = read('apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.tsx');

  assert.match(trade, /buildTradeFlowKitWorkday/);
  assert.match(trade, /moduleShellApi\.tradeflowkit\.revenue\(\)/);
  assert.match(trade, /eyebrow="Today · lead to cash"/);
  assert.match(tech, /TechDeckWorkdayBrief/);
  assert.match(pulse, /buildPulseDeskWorkday/);
  assert.match(pulse, /eyebrow="Today · operational pressure"/);
  assert.match(brief, /aria-label="Ranked next actions"/);
  assert.match(brief, /Safe ways to remove repeat work/);
  assert.match(brief, /data-testid=\{`\$\{moduleId\}-workday-brief`\}/);
});

test('workday presentation has one clear action, accessible states, and no risky auto-execution claim', () => {
  const brief = read('apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.tsx');
  const css = read('apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.module.css');
  const logic = read('apps/web/src/lib/core-suite-workday.ts');
  const combined = `${brief}\n${logic}`;

  assert.match(brief, /className=\{styles\.primaryAction\}/);
  assert.match(brief, /role="status"/);
  assert.match(css, /text-wrap: balance/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|animation:/);
  for (const unsafeClaim of ['automatically execute', 'auto-resolve', 'auto-charge', 'auto-assign']) {
    assert.ok(!combined.toLowerCase().includes(unsafeClaim), unsafeClaim);
  }
});
